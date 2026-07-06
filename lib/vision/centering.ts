/**
 * Centering measurement.
 *
 * Works on the rectified card image (canonical 0.1 mm/px). The card border
 * (the colored frame between the physical card edge and the artwork frame)
 * is sampled just inside each edge to get a reference color; we then scan
 * inward per scanline until the color departs from that reference, which
 * marks the inner frame line. The median across scanlines gives a robust
 * border thickness for each side.
 */

import { clamp } from "./imageOps";
import { calibrate, pxToMm, round } from "../measurement/calibration";
import type { CenteringMeasurement } from "./types";

const SCAN_DEPTH_FRAC = 0.22; // search the outer 22% of each dimension
const COLOR_THRESHOLD = 42; // Euclidean RGB distance marking the frame line
const RUN_LENGTH = 4; // departure must persist this many px

export function measureCentering(rect: ImageData): CenteringMeasurement {
  const { width: w, height: h } = rect;
  const cal = calibrate(w, h);

  const leftPx = medianBorder(rect, "left");
  const rightPx = medianBorder(rect, "right");
  const topPx = medianBorder(rect, "top");
  const bottomPx = medianBorder(rect, "bottom");

  const hTotal = leftPx + rightPx || 1;
  const vTotal = topPx + bottomPx || 1;
  const leftPct = round((leftPx / hTotal) * 100, 1);
  const rightPct = round(100 - leftPct, 1);
  const topPct = round((topPx / vTotal) * 100, 1);
  const bottomPct = round(100 - topPct, 1);

  const hWorst = Math.max(leftPct, rightPct);
  const vWorst = Math.max(topPct, bottomPct);

  return {
    leftPx,
    rightPx,
    topPx,
    bottomPx,
    leftMm: pxToMm(leftPx, cal.mmPerPxX),
    rightMm: pxToMm(rightPx, cal.mmPerPxX),
    topMm: pxToMm(topPx, cal.mmPerPxY),
    bottomMm: pxToMm(bottomPx, cal.mmPerPxY),
    leftPct,
    rightPct,
    topPct,
    bottomPct,
    horizontalRatio: `${Math.round(hWorst)}/${Math.round(100 - hWorst)}`,
    verticalRatio: `${Math.round(vWorst)}/${Math.round(100 - vWorst)}`,
    score: centeringScore(Math.max(hWorst, vWorst)),
  };
}

/** Map worst-side percentage (50 = perfect) to a 0–10 subgrade,
 *  roughly following PSA centering standards (55/45 → 10, 60/40 → 9,
 *  65/35 → 8, 70/30 → 7, …). */
export function centeringScore(worstPct: number): number {
  const dev = clamp(worstPct - 50, 0, 50);
  let score: number;
  if (dev <= 5) score = 10;
  else if (dev <= 10) score = 10 - (dev - 5) / 5; // → 9
  else if (dev <= 15) score = 9 - (dev - 10) / 5; // → 8
  else if (dev <= 20) score = 8 - (dev - 15) / 5; // → 7
  else if (dev <= 30) score = 7 - ((dev - 20) / 10) * 2; // → 5
  else if (dev <= 40) score = 5 - ((dev - 30) / 10) * 2; // → 3
  else score = 2;
  return Math.round(score * 2) / 2;
}

function medianBorder(rect: ImageData, side: "left" | "right" | "top" | "bottom"): number {
  const { width: w, height: h } = rect;
  const vertical = side === "left" || side === "right";
  const scanLen = Math.floor((vertical ? w : h) * SCAN_DEPTH_FRAC);
  const lineStart = Math.floor((vertical ? h : w) * 0.2);
  const lineEnd = Math.floor((vertical ? h : w) * 0.8);
  const widths: number[] = [];

  for (let line = lineStart; line < lineEnd; line += 4) {
    // Reference color: average of px 3..9 from the edge on this scanline.
    let rr = 0, rg = 0, rb = 0, n = 0;
    for (let d = 3; d < 10; d++) {
      const [r, g, b] = px(rect, side, line, d);
      rr += r; rg += g; rb += b; n++;
    }
    rr /= n; rg /= n; rb /= n;

    let run = 0;
    let found = -1;
    for (let d = 10; d < scanLen; d++) {
      const [r, g, b] = px(rect, side, line, d);
      const dist = Math.hypot(r - rr, g - rg, b - rb);
      if (dist > COLOR_THRESHOLD) {
        run++;
        if (run >= RUN_LENGTH) {
          found = d - RUN_LENGTH + 1;
          break;
        }
      } else {
        run = 0;
      }
    }
    if (found > 0) widths.push(found);
  }

  if (widths.length === 0) return Math.floor(scanLen / 2);
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)];

  function px(img: ImageData, s: typeof side, lineIdx: number, depth: number): [number, number, number] {
    let x: number, y: number;
    if (s === "left") { x = depth; y = lineIdx; }
    else if (s === "right") { x = img.width - 1 - depth; y = lineIdx; }
    else if (s === "top") { x = lineIdx; y = depth; }
    else { x = lineIdx; y = img.height - 1 - depth; }
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  }
}
