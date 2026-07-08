import { describe, it, expect } from "vitest";
import { computeGrade } from "./calculator";
import type {
  CornerAnalysis,
  EdgeAnalysis,
  FaceAnalysis,
  SurfaceDefect,
} from "../vision/types";

/** Minimal FaceAnalysis fixture; scores default clean, overridable per test. */
function makeFace(opts: {
  centering?: number;
  corners?: number;
  edges?: number;
  surface?: number;
  cornerWhitening?: number;
  cornerSharpness?: number;
  defectSeverity?: number;
}): FaceAnalysis {
  const {
    centering = 9,
    corners = 9,
    edges = 9,
    surface = 9,
    cornerWhitening = 0,
    cornerSharpness = 1,
    defectSeverity = 0,
  } = opts;

  const corner = (name: CornerAnalysis["corner"]): CornerAnalysis => ({
    corner: name,
    whitening: cornerWhitening,
    sharpnessScore: cornerSharpness,
    damaged: false,
    issues: [],
    score: corners,
  });
  const edge = (name: EdgeAnalysis["edge"]): EdgeAnalysis => ({
    edge: name,
    whitening: 0,
    nickCount: 0,
    issues: [],
    score: edges,
  });
  const defects: SurfaceDefect[] =
    defectSeverity > 0
      ? [{ type: "dent", x: 0.5, y: 0.5, w: 0.1, h: 0.1, severity: defectSeverity }]
      : [];

  return {
    rectifiedDataUrl: "",
    rectifiedWidth: 635,
    rectifiedHeight: 889,
    quality: {
      sharpness: 500,
      blurry: false,
      glareRatio: 0,
      tooMuchGlare: false,
      brightness: 128,
      tooDark: false,
      tooBright: false,
      cardCoverage: 0.8,
      tooFar: false,
      warnings: [],
      usable: true,
    },
    centering: {
      leftPx: 30, rightPx: 30, topPx: 30, bottomPx: 30,
      leftMm: 3, rightMm: 3, topMm: 3, bottomMm: 3,
      leftPct: 50, rightPct: 50, topPct: 50, bottomPct: 50,
      horizontalRatio: "50/50", verticalRatio: "50/50",
      score: centering,
    },
    corners: [corner("topLeft"), corner("topRight"), corner("bottomRight"), corner("bottomLeft")],
    edges: [edge("top"), edge("right"), edge("bottom"), edge("left")],
    surface: {
      heatmap: [[0]],
      heatmapRows: 1,
      heatmapCols: 1,
      defects,
      defectDensity: 0,
      glossConsistency: 1,
      issues: [],
      score: surface,
    },
    mmPerPx: 0.1,
  };
}

describe("computeGrade", () => {
  it("returns the shared subgrade when every category is equal", () => {
    const face = makeFace({ centering: 9, corners: 9, edges: 9, surface: 9 });
    const g = computeGrade(face, face);
    expect(g.overall).toBe(9);
    expect(g.composite).toBe(9);
    expect(g.structuralCap).toBeNull();
  });

  it("brackets the overall estimate in an uncertainty range", () => {
    const face = makeFace({ centering: 8, corners: 8, edges: 8, surface: 8 });
    const g = computeGrade(face, face);
    expect(g.range.low).toBeLessThanOrEqual(g.overall);
    expect(g.range.high).toBeGreaterThanOrEqual(g.overall);
    expect(g.range.low).toBeGreaterThanOrEqual(1);
    expect(g.range.high).toBeLessThanOrEqual(10);
  });

  it("caps the final grade at the weakest subgrade (weakest-link)", () => {
    const face = makeFace({ centering: 9, corners: 6, edges: 9, surface: 9 });
    const g = computeGrade(face, face);
    expect(g.subgrades.corners).toBe(6);
    expect(g.composite).toBeGreaterThan(6); // weighted blend is higher
    expect(g.overall).toBe(6); // but the final cannot exceed the lowest
    expect(g.limitingFactor).toBe("corners");
  });

  it("auto-caps on structural damage regardless of subgrades", () => {
    // Clean subgrades, but a crushed corner (heavy whitening + lost sharpness).
    const face = makeFace({
      centering: 10, corners: 10, edges: 10, surface: 10,
      cornerWhitening: 0.7, cornerSharpness: 0.3,
    });
    const g = computeGrade(face, face);
    expect(g.structuralCap).toBe(5);
    expect(g.overall).toBeLessThanOrEqual(5);
  });

  it("auto-caps on a deep surface defect", () => {
    const face = makeFace({ defectSeverity: 0.95 });
    const g = computeGrade(face, face);
    expect(g.structuralCap).toBe(4);
    expect(g.overall).toBeLessThanOrEqual(4);
  });

  it("weights the front (55%) more than the back (45%)", () => {
    const strongFront = makeFace({ centering: 10, corners: 10, edges: 10, surface: 10 });
    const weakBack = makeFace({ centering: 2, corners: 2, edges: 2, surface: 2 });
    const frontHeavy = computeGrade(strongFront, weakBack);
    const backHeavy = computeGrade(weakBack, strongFront);
    // Same faces swapped: the front-strong card must blend higher.
    expect(frontHeavy.composite).toBeGreaterThan(backHeavy.composite);
  });
});
