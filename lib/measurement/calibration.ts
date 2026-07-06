/**
 * Millimeter calibration engine.
 *
 * Standard trading cards (Pokémon, MTG, sports) are 63.5 × 88.9 mm
 * (2.5" × 3.5"). Once the card outline is detected and rectified we know
 * exactly how many pixels span the physical card, which gives a global
 * px→mm scale accurate to sub-millimeter precision.
 */

export const CARD_WIDTH_MM = 63.5;
export const CARD_HEIGHT_MM = 88.9;

/** Tolerance used when verifying detected dimensions against the standard. */
export const DIMENSION_TOLERANCE_MM = 0.5;

export interface Calibration {
  mmPerPxX: number;
  mmPerPxY: number;
  /** Geometric mean — use when direction doesn't matter. */
  mmPerPx: number;
}

export function calibrate(rectifiedWidthPx: number, rectifiedHeightPx: number): Calibration {
  const mmPerPxX = CARD_WIDTH_MM / rectifiedWidthPx;
  const mmPerPxY = CARD_HEIGHT_MM / rectifiedHeightPx;
  return {
    mmPerPxX,
    mmPerPxY,
    mmPerPx: Math.sqrt(mmPerPxX * mmPerPxY),
  };
}

export function pxToMm(px: number, mmPerPx: number, decimals = 2): number {
  return round(px * mmPerPx, decimals);
}

export function round(v: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
