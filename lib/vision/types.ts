/**
 * Core type definitions for the CardSight vision pipeline.
 */

export interface Point {
  x: number;
  y: number;
}

/** Four corners of a detected card, clockwise from top-left. */
export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export interface GrayImage {
  data: Float32Array;
  width: number;
  height: number;
}

export interface ImageQualityReport {
  /** Variance of Laplacian — higher is sharper. */
  sharpness: number;
  blurry: boolean;
  /** Fraction of pixels that are blown-out highlights (0..1). */
  glareRatio: number;
  tooMuchGlare: boolean;
  /** Mean luminance 0..255. */
  brightness: number;
  tooDark: boolean;
  tooBright: boolean;
  /** Card area as a fraction of the frame (0..1). */
  cardCoverage: number;
  tooFar: boolean;
  /** Human-readable warnings, empty when the image is usable. */
  warnings: string[];
  usable: boolean;
}

export interface CenteringMeasurement {
  /** Border thickness in pixels of the rectified image. */
  leftPx: number;
  rightPx: number;
  topPx: number;
  bottomPx: number;
  /** Border thickness in millimeters. */
  leftMm: number;
  rightMm: number;
  topMm: number;
  bottomMm: number;
  /** Percentages, leftPct + rightPct = 100. */
  leftPct: number;
  rightPct: number;
  topPct: number;
  bottomPct: number;
  /** Worst-side ratio, e.g. 55/45 → "55/45". */
  horizontalRatio: string;
  verticalRatio: string;
  /** 0..10 subgrade for this face. */
  score: number;
}

export type CornerName = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

export interface CornerAnalysis {
  corner: CornerName;
  /** 0..1 fraction of the corner region showing whitening. */
  whitening: number;
  /** 0..1 sharpness of the corner point (1 = crisp). */
  sharpnessScore: number;
  damaged: boolean;
  issues: string[];
  /** 0..10 subgrade for this single corner. */
  score: number;
}

export type EdgeName = "top" | "right" | "bottom" | "left";

export interface EdgeAnalysis {
  edge: EdgeName;
  whitening: number;
  /** Count of localized nicks / chips found along the edge. */
  nickCount: number;
  issues: string[];
  score: number;
}

export interface SurfaceDefect {
  type:
    | "scratch"
    | "print-line"
    | "dent"
    | "stain"
    | "holo-scratch"
    | "pressure-mark";
  /** Normalized position/size relative to the rectified card (0..1). */
  x: number;
  y: number;
  w: number;
  h: number;
  severity: number; // 0..1
}

export interface SurfaceAnalysis {
  /** rows × cols grid of defect density 0..1, for the heatmap. */
  heatmap: number[][];
  heatmapRows: number;
  heatmapCols: number;
  defects: SurfaceDefect[];
  /** Overall defect density 0..1. */
  defectDensity: number;
  glossConsistency: number; // 0..1, 1 = perfectly even
  issues: string[];
  score: number;
}

export interface FaceAnalysis {
  /** Rectified card image as a JPEG data URL for display. */
  rectifiedDataUrl: string;
  rectifiedWidth: number;
  rectifiedHeight: number;
  quality: ImageQualityReport;
  centering: CenteringMeasurement;
  corners: CornerAnalysis[];
  edges: EdgeAnalysis[];
  surface: SurfaceAnalysis;
  /** Millimeters per pixel of the rectified image. */
  mmPerPx: number;
  /** Largest subgrade spread (max − min) observed across the three consensus
   *  passes, in grade points. High spread ⇒ the measurement is sensitive to
   *  the exact crop ⇒ the reported grade deserves less confidence. Optional:
   *  absent on scans stored before this field existed. */
  passSpread?: number;
}

export interface DetectionResult {
  quad: Quad;
  /** Confidence that a card outline was actually found (0..1). */
  confidence: number;
}
