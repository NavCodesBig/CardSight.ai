/**
 * Estimated graded values.
 *
 * There is no free source of real PSA/BGS sale prices, so we project them from
 * the raw market price using grade-based multipliers. These are deliberately
 * rough industry-average ratios — a real card's graded premium varies wildly by
 * set, rarity and population — so every value here is flagged `estimated: true`
 * and must be shown as a projection, never a quote.
 */

import type { PriceBreakdown } from "./types";

/** Multiplier over raw market value by PSA grade. Coarse averages. */
const PSA_MULTIPLIER: Record<number, number> = {
  10: 5,
  9: 2,
  8: 1.3,
  7: 1.0,
  6: 0.9,
  5: 0.8,
};

function multiplierFor(grade: number): number {
  const g = Math.round(grade);
  if (g >= 10) return PSA_MULTIPLIER[10];
  return PSA_MULTIPLIER[g] ?? Math.max(0.6, g / 10);
}

/**
 * Given a raw market price and our most-likely PSA grade, return estimated
 * graded values: one at the predicted grade and the PSA-10 ceiling for context.
 */
export function estimateGradedValues(
  raw: number | null,
  currency: string,
  likelyPsaGrade: number
): PriceBreakdown[] {
  if (raw == null || raw <= 0) return [];
  const g = Math.round(likelyPsaGrade);
  const out: PriceBreakdown[] = [];

  out.push({
    label: `PSA ${g} (est.)`,
    amount: round2(raw * multiplierFor(g)),
    currency,
    estimated: true,
  });

  // Always show the PSA-10 ceiling unless the prediction already is a 10.
  if (g < 10) {
    out.push({
      label: "PSA 10 ceiling (est.)",
      amount: round2(raw * multiplierFor(10)),
      currency,
      estimated: true,
    });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
