/**
 * Grade calculation — DCM-aligned methodology.
 *
 * Combines front + back face analyses into four subgrades then an overall
 * grade, following the rules DCM Grading publishes:
 *   • Front is weighted 55%, back 45% (front is the primary display side).
 *   • Damage categories (corners, edges, surface) are strict weakest-link:
 *     the final grade can never exceed the lowest of them.
 *   • Centering caps the grade *softly* (lowest + 2). Real grading treats
 *     off-centering more leniently than damage — PSA gives an otherwise-mint
 *     but badly off-center card a mid grade (or an OC qualifier), never the
 *     near-minimum a strict weakest-link rule would produce. Strict capping
 *     here turned a 10/9/9 card with miscut centering into an overall 2.
 *   • Structural damage (crushed corners, deep dents/creases) triggers an
 *     automatic cap regardless of how clean the rest of the card is.
 * Subgrades themselves are produced by three-pass consensus upstream
 * (see analyze.ts), so a defect must appear in ≥2 passes to count.
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
  /** Weighted composite before the weakest-link / structural caps. */
  composite: number;
  overall: number;
  /** 0..1 — how much the model trusts this estimate. */
  confidence: number;
  /** Which category limited the grade. */
  limitingFactor: SubgradeKey;
  /** Set when structural damage forced an automatic cap. */
  structuralCap: number | null;
  /** Honest uncertainty band around the overall estimate. */
  range: { low: number; high: number };
}

/** DCM front/back weighting: front 55%, back 45%. */
const FRONT_WEIGHT = 0.55;

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

  const composite = roundHalf(
    subgrades.centering * SUBGRADE_WEIGHTS.centering +
      subgrades.corners * SUBGRADE_WEIGHTS.corners +
      subgrades.edges * SUBGRADE_WEIGHTS.edges +
      subgrades.surface * SUBGRADE_WEIGHTS.surface
  );

  // Damage categories are strict weakest-link; centering caps softly (+2),
  // mirroring how PSA/BGS actually treat off-center-but-clean cards.
  const damageEntries = entries(subgrades).filter(([k]) => k !== "centering");
  const [damageKey, damageMin] = damageEntries.reduce((a, b) => (b[1] < a[1] ? b : a));
  const centeringCap = subgrades.centering >= 8 ? 10 : subgrades.centering + 2;
  let overall = Math.min(composite, damageMin, centeringCap);

  // Whichever constraint actually bound the grade is the limiting factor.
  const limitingFactor: SubgradeKey =
    centeringCap < Math.min(composite, damageMin)
      ? "centering"
      : damageMin < composite
        ? damageKey
        : entries(subgrades).reduce((a, b) => (b[1] < a[1] ? b : a))[0];

  // Structural-damage auto-cap. Thresholds are deliberately high so ordinary
  // wear never trips them — only clearly severe damage caps the grade.
  const structuralCap = structuralDamageCap(front, back);
  if (structuralCap !== null) overall = Math.min(overall, structuralCap);

  overall = roundHalf(Math.max(1, overall));

  // Confidence: driven by image quality (detection reliability is folded in
  // separately by the pipeline).
  const q = (f: FaceAnalysis) => {
    let c = 1;
    if (f.quality.blurry) c -= 0.3;
    if (f.quality.tooMuchGlare) c -= 0.2;
    if (f.quality.tooDark || f.quality.tooBright) c -= 0.15;
    if (f.quality.tooFar) c -= 0.15;
    return Math.max(0.3, c);
  };
  const confidence = Math.round(((q(front) + q(back)) / 2) * 0.92 * 100) / 100;

  // Honest uncertainty band: a photo-based heuristic can't claim half-point
  // precision, so widen the band as confidence drops.
  const halfWidth = roundHalf(0.5 + (1 - confidence));
  const range = {
    low: roundHalf(Math.max(1, overall - halfWidth)),
    high: roundHalf(Math.min(10, overall + halfWidth)),
  };

  return {
    subgrades,
    composite,
    overall,
    confidence,
    limitingFactor,
    structuralCap,
    range,
  };
}

/**
 * Detect structural damage that should hard-cap the grade. Conservative on
 * purpose — a crushed/rounded corner or a deep dent/crease, not light wear.
 */
function structuralDamageCap(front: FaceAnalysis, back: FaceAnalysis): number | null {
  const corners = [...front.corners, ...back.corners];
  const worstWhitening = Math.max(...corners.map((c) => c.whitening), 0);
  const worstSharpLoss = Math.max(...corners.map((c) => 1 - c.sharpnessScore), 0);
  const defects = [...front.surface.defects, ...back.surface.defects];
  const worstDefect = Math.max(...defects.map((d) => d.severity), 0);

  // Crushed / lifted corner: heavy whitening plus lost sharpness.
  if (worstWhitening > 0.65 && worstSharpLoss > 0.6) return 5;
  // Deep dent / crease / gouge on the surface.
  if (worstDefect >= 0.9) return 4;
  return null;
}

function avg(v: number[]): number {
  return v.reduce((s, x) => s + x, 0) / (v.length || 1);
}

function entries(o: Subgrades): [SubgradeKey, number][] {
  return Object.entries(o) as [SubgradeKey, number][];
}

function roundHalf(v: number): number {
  return Math.round(v * 2) / 2;
}
