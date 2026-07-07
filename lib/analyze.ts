/**
 * Analysis orchestrator — runs the full pipeline on a front + back photo
 * pair and produces a serializable ScanResult for storage and display.
 * Everything executes client-side; the /api/analyze route exists as the
 * integration point for future server-side model inference.
 */

import { detectCardOriented, quadCoverage, rectifyCard } from "./vision/cardDetector";
import type { Quad } from "./vision/types";
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

export async function analyzeCard(
  frontFile: Blob,
  backFile: Blob,
  onProgress: ProgressFn = () => {}
): Promise<ScanResult> {
  onProgress("loading", 4);
  const [frontImg, backImg] = await Promise.all([
    fileToImageData(frontFile),
    fileToImageData(backFile),
  ]);

  onProgress("detecting", 14);
  await tick();
  // Auto-corrects landscape-oriented photos before analysis.
  const front = detectCardOriented(frontImg);
  const back = detectCardOriented(backImg);
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
  grade.confidence = Math.round(grade.confidence * Math.min(1, avgDet / 0.75) * 100) / 100;
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

async function analyzeFace(
  original: ImageData,
  quad: Quad,
  rect: ImageData,
  onProgress: ProgressFn,
  isFront: boolean
): Promise<FaceAnalysis> {
  const base = isFront ? 36 : 62;
  const quality = assessQuality(original, quadCoverage(original, quad));

  onProgress("centering", base + 6);
  await tick();
  const centering = measureCentering(rect);

  onProgress("corners", base + 12);
  await tick();
  const corners = analyzeCorners(rect);

  onProgress("edges", base + 18);
  await tick();
  const edges = analyzeEdges(rect);

  onProgress("surface", base + 24);
  await tick();
  const surface = analyzeSurface(rect);

  const cal = calibrate(rect.width, rect.height);

  return {
    rectifiedDataUrl: await imageDataToDataUrl(rect, 0.82),
    rectifiedWidth: rect.width,
    rectifiedHeight: rect.height,
    quality,
    centering,
    corners,
    edges,
    surface,
    mmPerPx: cal.mmPerPx,
  };
}

/** Yield to the event loop so the processing UI can animate. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 30));
}
