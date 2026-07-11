/**
 * Analysis orchestrator — runs the full pipeline on a front + back photo
 * pair and produces a serializable ScanResult for storage and display.
 * Everything executes client-side; the /api/analyze route exists as the
 * integration point for future server-side model inference.
 */

import {
  detectCard,
  detectCardOriented,
  quadAgreement,
  quadCoverage,
  rectifyCard,
  refineQuad,
} from "./vision/cardDetector";
import type {
  Quad,
  Point,
  CenteringMeasurement,
  CornerAnalysis,
  EdgeAnalysis,
  SurfaceAnalysis,
} from "./vision/types";
import { fileToImageDataScaled, imageDataToDataUrl } from "./vision/imageOps";
import { assessQuality } from "./vision/quality";
import { measureCentering } from "./vision/centering";
import { analyzeCorners } from "./vision/corners";
import { analyzeEdges } from "./vision/edges";
import { analyzeSurface } from "./vision/surface";
import { calibrate } from "./measurement/calibration";
import { computeGrade, type GradeResult } from "./grading/calculator";
import {
  estimateCompanyGrades,
  submissionRecommendation,
  type CompanyEstimate,
} from "./grading/companyEstimates";
import { explainGrade, type Explanation } from "./grading/explain";
import { identifyCard, type CardInfo } from "./recognition/identifier";
import type { FaceAnalysis } from "./vision/types";
import type { MarketData } from "./pricing/types";

export interface ScanResult {
  id: string;
  createdAt: string; // ISO
  front: FaceAnalysis;
  back: FaceAnalysis;
  grade: GradeResult;
  companyEstimates: CompanyEstimate[];
  submission: ReturnType<typeof submissionRecommendation>;
  explanations: Explanation[];
  cardInfo: CardInfo;
  detectionConfidence: number;
  favorite: boolean;
  /** Market value, filled in lazily on the results page (needs network). */
  market?: MarketData | null;
}

export type ProgressStage =
  | "loading"
  | "detecting"
  | "rectifying"
  | "quality"
  | "centering"
  | "corners"
  | "edges"
  | "surface"
  | "recognizing"
  | "grading"
  | "done";

export const STAGE_LABELS: Record<ProgressStage, string> = {
  loading: "Loading images",
  detecting: "Detecting card outline",
  rectifying: "Correcting perspective",
  quality: "Verifying image quality",
  centering: "Measuring centering",
  corners: "Inspecting corners",
  edges: "Scanning edges",
  surface: "Mapping surface defects",
  recognizing: "Identifying card",
  grading: "Calculating grade",
  done: "Complete",
};

export type ProgressFn = (stage: ProgressStage, pct: number) => void;

/** Optional per-face quad hints from the live camera (in image pixel coords). */
export interface QuadHints {
  front?: Quad | null;
  back?: Quad | null;
}

export async function analyzeCard(
  frontFile: Blob,
  backFile: Blob,
  onProgress: ProgressFn = () => {},
  hints?: QuadHints
): Promise<ScanResult> {
  onProgress("loading", 4);
  const [frontLoaded, backLoaded] = await Promise.all([
    fileToImageDataScaled(frontFile),
    fileToImageDataScaled(backFile),
  ]);

  onProgress("detecting", 14);
  await tick();
  // Prefer the quad the user confirmed in live view; otherwise detect (and
  // auto-correct landscape-oriented photos) from the image itself. Hints are
  // in the file's natural pixel coordinates, but the decoded image may be
  // downscaled — map them into image space or they address the wrong region
  // (this mismatch is what produced 1 mm-vs-9.7 mm borders on a perfectly
  // centered card).
  const front = faceDetect(
    frontLoaded.image,
    scaleQuad(hints?.front, frontLoaded.scale)
  );
  const back = faceDetect(backLoaded.image, scaleQuad(hints?.back, backLoaded.scale));
  const frontDet = front.detection;
  const backDet = back.detection;

  onProgress("rectifying", 26);
  await tick();
  const frontRect = rectifyCard(front.image, frontDet.quad);
  const backRect = rectifyCard(back.image, backDet.quad);

  onProgress("quality", 36);
  await tick();
  const frontFace = await analyzeFace(front.image, frontDet.quad, frontRect, onProgress, true);
  const backFace = await analyzeFace(back.image, backDet.quad, backRect, onProgress, false);

  onProgress("recognizing", 84);
  await tick();
  const cardInfo = await identifyCard(frontRect);

  onProgress("grading", 92);
  await tick();
  const grade = computeGrade(frontFace, backFace);
  // Honesty gate: a weak card detection means the rectified faces — and every
  // measurement taken from them — are unreliable, so damp the reported grade
  // confidence to match how well the card was actually located.
  const avgDet = (frontDet.confidence + backDet.confidence) / 2;
  // Photo quality gates confidence too: glare, blur, darkness, or a card that
  // doesn't fill the frame all make every downstream measurement unreliable,
  // so the reported number must reflect that instead of trusting a clean-shape
  // detection. The weaker of the two faces sets the ceiling.
  const qual = Math.min(
    qualityFactor(frontFace.quality),
    qualityFactor(backFace.quality)
  );
  // Cross-pass instability: if the three consensus passes disagreed by a full
  // grade point or more, the measurement is crop-sensitive and the flat
  // quality-only confidence was overstating certainty (every clean-photo scan
  // used to report the same 92%).
  const worstSpread = Math.max(
    frontFace.passSpread ?? 0,
    backFace.passSpread ?? 0
  );
  const stability = 1 - Math.min(0.35, worstSpread * 0.15);
  grade.confidence =
    Math.round(grade.confidence * Math.min(1, avgDet / 0.75) * qual * stability * 100) /
    100;
  const companyEstimates = estimateCompanyGrades(grade.overall, grade.confidence);
  const submission = submissionRecommendation(grade.overall, grade.confidence);
  const explanations = explainGrade(frontFace, backFace, grade);

  onProgress("done", 100);
  return {
    id: `scan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    front: frontFace,
    back: backFace,
    grade,
    companyEstimates,
    submission,
    explanations,
    cardInfo,
    detectionConfidence:
      Math.round(((frontDet.confidence + backDet.confidence) / 2) * 100) / 100,
    favorite: false,
  };
}

/**
 * Analyze one face with DCM-style three-pass consensus: the analyzers run on
 * three slightly-jittered rectifications of the same card, subgrade scores are
 * averaged, and a surface defect is only kept if it shows up in ≥2 passes. This
 * damps single-pass noise and keeps false-positive defects out of the grade.
 * The un-jittered pass (rect0) supplies the display image and measurements.
 */
async function analyzeFace(
  original: ImageData,
  quad: Quad,
  rect0: ImageData,
  onProgress: ProgressFn,
  isFront: boolean
): Promise<FaceAnalysis> {
  const base = isFront ? 36 : 62;
  const quality = assessQuality(original, quadCoverage(original, quad));

  // Jitter the detected quad by ~0.6% of the card width so each pass sees a
  // marginally different crop — three genuinely independent evaluations.
  const span = Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y);
  const d = 0.006 * span;
  const rects = [
    rect0,
    rectifyCard(original, jitterQuad(quad, d, -d)),
    rectifyCard(original, jitterQuad(quad, -d, d)),
  ];

  onProgress("centering", base + 6);
  await tick();
  const centerings = rects.map(measureCentering);
  const centering: CenteringMeasurement = {
    ...centerings[0],
    score: meanRound(centerings.map((c) => c.score)),
  };

  onProgress("corners", base + 12);
  await tick();
  const cornerPasses = rects.map(analyzeCorners);
  const corners = consensusCorners(cornerPasses);

  onProgress("edges", base + 18);
  await tick();
  const edgePasses = rects.map(analyzeEdges);
  const edges = consensusEdges(edgePasses);

  onProgress("surface", base + 24);
  await tick();
  const surfacePasses = rects.map(analyzeSurface);
  const surface = consensusSurface(surfacePasses);

  const cal = calibrate(rect0.width, rect0.height);

  // Cross-pass stability: how far the three jittered passes disagreed, taken
  // over every category. Stable measurements spread < 0.5 grade points; a
  // crop-sensitive card (borderline centering, edge artifacts) spreads much
  // wider and its confidence should say so.
  const passSpread = Math.max(
    spread(centerings.map((c) => c.score)),
    spread(cornerPasses.map((p) => avg(p.map((c) => c.score)))),
    spread(edgePasses.map((p) => avg(p.map((e) => e.score)))),
    spread(surfacePasses.map((p) => p.score))
  );

  return {
    rectifiedDataUrl: await imageDataToDataUrl(rect0, 0.82),
    rectifiedWidth: rect0.width,
    rectifiedHeight: rect0.height,
    quality,
    centering,
    corners,
    edges,
    surface,
    mmPerPx: cal.mmPerPx,
    passSpread,
  };
}

/**
 * Resolve a face's card quad. A live-view or corner-adjust hint is used but
 * not blindly trusted: the sides are first snapped to the strongest nearby
 * edges (a hand-confirmed quad — especially an untouched default — is
 * routinely off the physical card edge), then cross-checked against full
 * auto-detection. Agreement earns high confidence; a hint that neither
 * snapped nor matches the detector is scored low so the honesty gate damps
 * every downstream precision claim. No hint → detect from the image.
 */
function faceDetect(
  img: ImageData,
  hint: Quad | null | undefined
): { image: ImageData; detection: { quad: Quad; confidence: number } } {
  if (!hint) return detectCardOriented(img);

  const refined = refineQuad(img, hint);
  const auto = detectCard(img);
  let confidence: number;
  if (auto.confidence >= 0.5 && quadAgreement(refined.quad, auto.quad) >= 0.97) {
    // Independent detection lands on the same card outline.
    confidence = 0.95;
  } else if (refined.snappedSides >= 2) {
    // No detector confirmation, but the sides locked onto real edges.
    confidence = 0.8;
  } else {
    // Pure hand crop with no supporting edge evidence — usable for display,
    // but sub-millimeter measurements from it can't be trusted.
    confidence = 0.55;
  }
  return { image: img, detection: { quad: refined.quad, confidence } };
}

/** Map a natural-coordinate quad into decoded-image space (see above). */
function scaleQuad(q: Quad | null | undefined, scale: number): Quad | null {
  if (!q) return null;
  if (scale === 1) return q;
  const s = (p: Point): Point => ({ x: p.x * scale, y: p.y * scale });
  return { tl: s(q.tl), tr: s(q.tr), br: s(q.br), bl: s(q.bl) };
}

function jitterQuad(q: Quad, dx: number, dy: number): Quad {
  const s = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  return { tl: s(q.tl), tr: s(q.tr), br: s(q.br), bl: s(q.bl) };
}

/** Per-corner consensus: average scores, flag damage confirmed in ≥2 passes. */
function consensusCorners(passes: CornerAnalysis[][]): CornerAnalysis[] {
  return passes[0].map((c0, i) => {
    const variants = passes.map((p) => p[i]);
    const damagedCount = variants.filter((v) => v.damaged).length;
    const damaged = damagedCount >= 2;
    return {
      corner: c0.corner,
      whitening: meanRound(variants.map((v) => v.whitening), 3),
      sharpnessScore: meanRound(variants.map((v) => v.sharpnessScore), 3),
      damaged,
      issues: damaged ? (variants.find((v) => v.damaged)?.issues ?? []) : [],
      score: meanRound(variants.map((v) => v.score)),
    };
  });
}

/** Per-edge consensus: average scores, keep issues confirmed in ≥2 passes. */
function consensusEdges(passes: EdgeAnalysis[][]): EdgeAnalysis[] {
  return passes[0].map((e0, i) => {
    const variants = passes.map((p) => p[i]);
    const issueCount = variants.filter((v) => v.issues.length > 0).length;
    const hasIssues = issueCount >= 2;
    return {
      edge: e0.edge,
      whitening: meanRound(variants.map((v) => v.whitening), 3),
      nickCount: Math.round(meanRound(variants.map((v) => v.nickCount), 2)),
      issues: hasIssues ? (variants.find((v) => v.issues.length > 0)?.issues ?? []) : [],
      score: meanRound(variants.map((v) => v.score)),
    };
  });
}

/** Surface consensus: average scores, keep defects seen in ≥2 passes. */
function consensusSurface(passes: SurfaceAnalysis[]): SurfaceAnalysis {
  const base = passes[0];
  const others = passes.slice(1);
  const confirmed = base.defects.filter((d) =>
    others.some((p) =>
      p.defects.some(
        (o) => o.type === d.type && Math.hypot(o.x - d.x, o.y - d.y) < 0.06
      )
    )
  );
  return {
    ...base,
    defects: confirmed,
    defectDensity: meanRound(passes.map((p) => p.defectDensity), 3),
    glossConsistency: meanRound(passes.map((p) => p.glossConsistency), 3),
    score: meanRound(passes.map((p) => p.score)),
  };
}

/**
 * Confidence multiplier (0..1) for a face's photo quality. Each flagged problem
 * compounds — a blurry, glary photo is trusted far less than a clean one.
 */
function qualityFactor(q: FaceAnalysis["quality"]): number {
  let f = 1;
  if (q.blurry) f *= 0.55;
  if (q.tooMuchGlare) f *= 0.6;
  if (q.tooDark || q.tooBright) f *= 0.8;
  if (q.tooFar) f *= 0.7;
  return f;
}

function spread(v: number[]): number {
  return Math.max(...v) - Math.min(...v);
}

function avg(v: number[]): number {
  return v.reduce((s, x) => s + x, 0) / (v.length || 1);
}

function meanRound(v: number[], decimals = 1): number {
  const m = v.reduce((s, x) => s + x, 0) / (v.length || 1);
  const f = 10 ** decimals;
  return Math.round(m * f) / f;
}

/** Yield to the event loop so the processing UI can animate. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 30));
}
