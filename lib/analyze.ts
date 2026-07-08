/**
 * Analysis orchestrator — runs the full pipeline on a front + back photo
 * pair and produces a serializable ScanResult for storage and display.
 * Everything executes client-side; the /api/analyze route exists as the
 * integration point for future server-side model inference.
 */

import { detectCardOriented, quadCoverage, rectifyCard } from "./vision/cardDetector";
import type {
  Quad,
  Point,
  CenteringMeasurement,
  CornerAnalysis,
  EdgeAnalysis,
  SurfaceAnalysis,
} from "./vision/types";
import { fileToImageData, imageDataToDataUrl } from "./vision/imageOps";
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
  const [frontImg, backImg] = await Promise.all([
    fileToImageData(frontFile),
    fileToImageData(backFile),
  ]);

  onProgress("detecting", 14);
  await tick();
  // Prefer the quad the user confirmed in live view; otherwise detect (and
  // auto-correct landscape-oriented photos) from the image itself.
  const front = faceDetect(frontImg, hints?.front);
  const back = faceDetect(backImg, hints?.back);
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
  grade.confidence =
    Math.round(grade.confidence * Math.min(1, avgDet / 0.75) * qual * 100) / 100;
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
  const corners = consensusCorners(rects.map(analyzeCorners));

  onProgress("edges", base + 18);
  await tick();
  const edges = consensusEdges(rects.map(analyzeEdges));

  onProgress("surface", base + 24);
  await tick();
  const surface = consensusSurface(rects.map(analyzeSurface));

  const cal = calibrate(rect0.width, rect0.height);

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
  };
}

/**
 * Resolve a face's card quad: trust the live-view hint when present (the user
 * visually confirmed the lock), else fall back to detecting from the image.
 */
function faceDetect(
  img: ImageData,
  hint: Quad | null | undefined
): { image: ImageData; detection: { quad: Quad; confidence: number } } {
  if (hint) return { image: img, detection: { quad: hint, confidence: 0.9 } };
  return detectCardOriented(img);
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

function meanRound(v: number[], decimals = 1): number {
  const m = v.reduce((s, x) => s + x, 0) / (v.length || 1);
  const f = 10 ** decimals;
  return Math.round(m * f) / f;
}

/** Yield to the event loop so the processing UI can animate. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 30));
}
