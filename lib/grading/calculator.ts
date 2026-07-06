/**
 * Grade calculation.
 *
 * Combines front + back face analyses into four subgrades, then an overall
 * grade. Mirrors how professional graders think: the overall is a weighted
 * blend of the subgrades, but it can never float far above the weakest
 * category — one crushed corner caps the card no matter how clean the rest is.
 */

import type { FaceAnalysis } from "../vision/types";
import { SUBGRADE_WEIGHTS, type SubgradeKey } from "./scale";

export interface Subgrades {
  centering: number;
  corners: number;
  edges: number;
  surface: number;
}

export interface GradeResult {
  subgrades: Subgrades;
  overall: number;
  /** 0..1 — how much the model trusts this estimate. */
  confidence: number;
  /** Which category limited the grade. */
  limitingFactor: SubgradeKey;
}

/** Front face dominates, matching PSA/BGS practice (back counts ~1/3). */
const FRONT_WEIGHT = 0.72;

export function computeGrade(front: FaceAnalysis, back: FaceAnalysis): GradeResult {
  const blend = (f: number, b: number) => FRONT_WEIGHT * f + (1 - FRONT_WEIGHT) * b;

  const subgrades: Subgrades = {
    centering: roundHalf(blend(front.centering.score, back.centering.score)),
    corners: roundHalf(
      blend(avg(front.corners.map((c) => c.score)), avg(back.corners.map((c) => c.score)))
    ),
    edges: roundHalf(
      blend(avg(front.edges.map((e) => e.score)), avg(back.edges.map((e) => e.score)))
    ),
    surface: roundHalf(blend(front.surface.score, back.surface.score)),
  };

  const weighted =
    subgrades.centering * SUBGRADE_WEIGHTS.centering +
    subgrades.corners * SUBGRADE_WEIGHTS.corners +
    subgrades.edges * SUBGRADE_WEIGHTS.edges +
    subgrades.surface * SUBGRADE_WEIGHTS.surface;

  const entries = Object.entries(subgrades) as [SubgradeKey, number][];
  const [limitingFactor, minSub] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));

  // Overall cannot exceed the weakest subgrade by more than 1.5 points,
  // and a Gem Mint 10 requires every subgrade at 9.5+.
  let overall = Math.min(weighted, minSub + 1.5);
  if (overall >= 10 && minSub < 9.5) overall = 9.5;
  overall = roundHalf(Math.max(1, overall));

  // Confidence: driven by image quality and detection reliability.
  const q = (f: FaceAnalysis) => {
    let c = 1;
    if (f.quality.blurry) c -= 0.3;
    if (f.quality.tooMuchGlare) c -= 0.2;
    if (f.quality.tooDark || f.quality.tooBright) c -= 0.15;
    if (f.quality.tooFar) c -= 0.15;
    return Math.max(0.3, c);
  };
  const confidence = Math.round(((q(front) + q(back)) / 2) * 0.92 * 100) / 100;

  return { subgrades, overall, confidence, limitingFactor };
}

function avg(v: number[]): number {
  return v.reduce((s, x) => s + x, 0) / (v.length || 1);
}

function roundHalf(v: number): number {
  return Math.round(v * 2) / 2;
}
