/**
 * Corner condition analysis.
 *
 * Each corner region of the rectified card is compared against a reference
 * border color sampled from the adjacent (undamaged) border area. Whitening
 * shows up as light, desaturated pixels where border color should be —
 * the classic fuzzy white corner on a played card.
 */

import { clamp, crop, isWhitened } from "./imageOps";
import type { CornerAnalysis, CornerName } from "./types";

const REGION_FRAC = 0.09; // corner window ≈ 5.7 mm square

const CORNERS: CornerName[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

export function analyzeCorners(rect: ImageData): CornerAnalysis[] {
  const { width: w, height: h } = rect;
  const size = Math.round(w * REGION_FRAC);

  return CORNERS.map((corner) => {
    const x = corner.includes("Left") ? 0 : w - size;
    const y = corner.includes("top") ? 0 : h - size;
    const region = crop(rect, x, y, size, size);

    // Reference border color: strip alongside the corner, further from it,
    // where wear is less likely.
    const refX = corner.includes("Left") ? size : w - size * 2;
    const refY = corner.includes("top") ? Math.round(size * 0.25) : h - Math.round(size * 0.75);
    const ref = avgColor(rect, refX, refY, size, Math.round(size / 2));

    // Count whitened pixels inside the corner triangle (the region nearest
    // the physical corner point).
    let white = 0;
    let counted = 0;
    const d = region.data;
    for (let ry = 0; ry < size; ry++) {
      for (let rx = 0; rx < size; rx++) {
        // Only weigh the outer triangle facing the corner point.
        const u = corner.includes("Left") ? size - rx : rx;
        const v = corner.includes("top") ? size - ry : ry;
        if (u + v < size * 0.55) continue;
        counted++;
        const i = (ry * size + rx) * 4;
        if (isWhitened(d[i], d[i + 1], d[i + 2], ref)) white++;
      }
    }
    const whitening = counted ? white / counted : 0;

    const issues: string[] = [];
    if (whitening > 0.3) issues.push("heavy whitening");
    else if (whitening > 0.12) issues.push("moderate whitening");
    else if (whitening > 0.04) issues.push("light whitening");

    const score = clamp(Math.round((10 - whitening * 55) * 2) / 2, 1, 10);
    return {
      corner,
      whitening: Math.round(whitening * 1000) / 1000,
      sharpnessScore: clamp(1 - whitening * 2, 0, 1),
      damaged: whitening > 0.12,
      issues,
      score,
    };
  });
}

function avgColor(
  img: ImageData,
  x: number,
  y: number,
  w: number,
  h: number
): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  const x1 = Math.min(img.width, x + w);
  const y1 = Math.min(img.height, y + h);
  for (let yy = Math.max(0, y); yy < y1; yy += 2) {
    for (let xx = Math.max(0, x); xx < x1; xx += 2) {
      const i = (yy * img.width + xx) * 4;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [128, 128, 128];
}
