/**
 * Card outline detection + perspective rectification.
 *
 * Strategy: compute a Sobel gradient map, scan inward from each side of the
 * frame collecting the first strong edge per scanline, robust-fit a line to
 * each side, intersect the four lines to get the card's corner quad, then
 * warp the quad into an axis-aligned rectangle at the true trading-card
 * aspect ratio (63.5 × 88.9 mm).
 */

import {
  boxBlur,
  gradientMagnitude,
  intersectVH,
  ransacLine,
  rotate90,
  toGray,
  warpQuad,
} from "./imageOps";
import type { DetectionResult, Point, Quad } from "./types";
import { CARD_WIDTH_MM, CARD_HEIGHT_MM } from "../measurement/calibration";

const EDGE_PERCENTILE = 0.92; // adaptive threshold percentile

export function detectCard(img: ImageData): DetectionResult {
  const gray = boxBlur(toGray(img));
  const grad = gradientMagnitude(gray);
  const { width: w, height: h } = grad;

  // Adaptive threshold from the gradient distribution.
  const sample: number[] = [];
  for (let i = 0; i < grad.data.length; i += 17) sample.push(grad.data[i]);
  sample.sort((a, b) => a - b);
  const thr = Math.max(40, sample[Math.floor(sample.length * EDGE_PERCENTILE)]);

  const yStart = Math.floor(h * 0.15);
  const yEnd = Math.floor(h * 0.85);
  const xStart = Math.floor(w * 0.15);
  const xEnd = Math.floor(w * 0.85);
  const maxScanX = Math.floor(w * 0.45);
  const maxScanY = Math.floor(h * 0.45);

  const leftPts: Point[] = [];
  const rightPts: Point[] = [];
  for (let y = yStart; y < yEnd; y += 3) {
    for (let x = 2; x < maxScanX; x++) {
      if (grad.data[y * w + x] > thr) {
        leftPts.push({ x, y });
        break;
      }
    }
    for (let x = w - 3; x > w - maxScanX; x--) {
      if (grad.data[y * w + x] > thr) {
        rightPts.push({ x, y });
        break;
      }
    }
  }

  const topPts: Point[] = [];
  const bottomPts: Point[] = [];
  for (let x = xStart; x < xEnd; x += 3) {
    for (let y = 2; y < maxScanY; y++) {
      if (grad.data[y * w + x] > thr) {
        topPts.push({ x, y });
        break;
      }
    }
    for (let y = h - 3; y > h - maxScanY; y--) {
      if (grad.data[y * w + x] > thr) {
        bottomPts.push({ x, y });
        break;
      }
    }
  }

  const left = ransacLine(leftPts, true);
  const right = ransacLine(rightPts, true);
  const top = ransacLine(topPts, false);
  const bottom = ransacLine(bottomPts, false);

  if (!left || !right || !top || !bottom) {
    // Fall back to the full frame with low confidence.
    return {
      quad: {
        tl: { x: 0, y: 0 },
        tr: { x: w - 1, y: 0 },
        br: { x: w - 1, y: h - 1 },
        bl: { x: 0, y: h - 1 },
      },
      confidence: 0.1,
    };
  }

  const quad: Quad = {
    tl: intersectVH(left, top),
    tr: intersectVH(right, top),
    br: intersectVH(right, bottom),
    bl: intersectVH(left, bottom),
  };

  // The four intersected lines always produce *a* quad — even from a hand or a
  // cluttered background. Gate confidence on whether that quad is actually
  // card-shaped: inside the frame, convex, roughly right-angled, with opposite
  // sides of similar length and a trading-card aspect ratio. This is what
  // rejects skewed false locks (edges caught on a hand) and degenerate
  // near-triangles (no card present).
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];
  const inFrame = pts.every(
    (p) => p.x > -w * 0.05 && p.x < w * 1.05 && p.y > -h * 0.05 && p.y < h * 1.05
  );

  const g = quadGeometry(quad);
  const coverage = g.area / (w * h);
  const expectedAspect = CARD_WIDTH_MM / CARD_HEIGHT_MM; // ≈ 0.714

  // Card-shape alone isn't enough: a quad fitted to background clutter can be
  // perfectly card-shaped yet enclose a window, wall, or hand. A real card
  // interior is not largely blown out; a specular window bleeding into the quad
  // is. This is what rejected the false lock that graded a kitchen window as a
  // card at high confidence. (Edge density is too low on legitimately smooth art
  // — e.g. a pale character body — to gate on, so blown-out fraction is the
  // discriminator.)
  const interior = interiorStats(img, quad);
  const interiorOk = interior.blownFrac < 0.3;

  const valid =
    inFrame &&
    g.convex &&
    coverage > 0.16 &&
    coverage < 0.97 &&
    g.aspect > expectedAspect * 0.82 && // ~0.59
    g.aspect < expectedAspect * 1.22 && // ~0.87
    g.oppRatioH > 0.7 &&
    g.oppRatioV > 0.7 &&
    g.maxAngleDev < 22 &&
    g.minSide > w * 0.1 &&
    interiorOk;

  if (!valid) {
    // Not card-shaped (or not card-like inside) — report low confidence so the
    // live overlay won't lock and the pipeline treats detection as unreliable.
    return { quad, confidence: 0.2 };
  }

  // Consistency of the fitted side points sharpens a valid detection.
  const density =
    (leftPts.length + rightPts.length + topPts.length + bottomPts.length) /
    ((yEnd - yStart) / 3 + (xEnd - xStart) / 3) / 2;
  const squareness = 1 - g.maxAngleDev / 22; // 0..1
  // Specular interior (glare/window bleeding into the quad) erodes trust even
  // when the shape passes: 0% blown → no penalty, ≥40% blown → floored.
  const glareTrust = 1 - Math.min(1, interior.blownFrac / 0.4);
  const confidence = Math.min(
    1,
    (0.62 + 0.25 * Math.min(1, density) + 0.1 * squareness) *
      (0.35 + 0.65 * glareTrust)
  );

  return { quad, confidence };
}

interface QuadGeometry {
  area: number;
  aspect: number; // width / height
  oppRatioH: number; // min/max of top vs bottom side length
  oppRatioV: number; // min/max of left vs right side length
  minSide: number;
  maxAngleDev: number; // largest corner deviation from 90°, degrees
  convex: boolean;
}

/** Shape metrics used to decide whether a quad is really a card. */
function quadGeometry(q: Quad): QuadGeometry {
  const top = dist(q.tl, q.tr);
  const right = dist(q.tr, q.br);
  const bottom = dist(q.br, q.bl);
  const left = dist(q.bl, q.tl);
  const wAvg = (top + bottom) / 2;
  const hAvg = (left + right) / 2;

  const corners = [q.tl, q.tr, q.br, q.bl];
  let maxAngleDev = 0;
  let sign = 0;
  let convex = true;
  for (let i = 0; i < 4; i++) {
    const prev = corners[(i + 3) % 4];
    const cur = corners[i];
    const next = corners[(i + 1) % 4];
    const ax = prev.x - cur.x, ay = prev.y - cur.y;
    const bx = next.x - cur.x, by = next.y - cur.y;
    const dot = ax * bx + ay * by;
    const mag = Math.hypot(ax, ay) * Math.hypot(bx, by) || 1;
    const angle = (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
    maxAngleDev = Math.max(maxAngleDev, Math.abs(angle - 90));
    const cross = ax * by - ay * bx;
    if (cross !== 0) {
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) convex = false;
    }
  }

  return {
    area: wAvg * hAvg,
    aspect: wAvg / (hAvg || 1),
    oppRatioH: Math.min(top, bottom) / (Math.max(top, bottom) || 1),
    oppRatioV: Math.min(left, right) / (Math.max(left, right) || 1),
    minSide: Math.min(top, right, bottom, left),
    maxAngleDev,
    convex,
  };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Fraction of the quad's interior that is specular/blown-out. The bounding box
 * is inset 15% to skip the located outline itself. A real card interior reads
 * low here; a window or direct-light hotspot bleeding into a clutter-fitted
 * quad reads high — the signal that separates a card from a bright background.
 */
function interiorStats(img: ImageData, q: Quad): { blownFrac: number } {
  const xs = [q.tl.x, q.tr.x, q.br.x, q.bl.x];
  const ys = [q.tl.y, q.tr.y, q.br.y, q.bl.y];
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const x0 = Math.max(0, Math.round(Math.min(...xs) + bw * 0.15));
  const x1 = Math.min(img.width - 1, Math.round(Math.max(...xs) - bw * 0.15));
  const y0 = Math.max(0, Math.round(Math.min(...ys) + bh * 0.15));
  const y1 = Math.min(img.height - 1, Math.round(Math.max(...ys) - bh * 0.15));

  let n = 0;
  let blown = 0;
  const d = img.data;
  for (let y = y0; y <= y1; y += 4) {
    for (let x = x0; x <= x1; x += 4) {
      n++;
      const i = (y * img.width + x) * 4;
      if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) blown++;
    }
  }
  if (!n) return { blownFrac: 1 };
  return { blownFrac: blown / n };
}

/** Standard rectified output size: 0.1 mm per pixel. */
export const RECTIFIED_WIDTH = Math.round(CARD_WIDTH_MM * 10); // 635
export const RECTIFIED_HEIGHT = Math.round(CARD_HEIGHT_MM * 10); // 889

/** Rectify the detected quad to a canonical card-shaped image. */
export function rectifyCard(img: ImageData, quad: Quad): ImageData {
  return warpQuad(img, quad, RECTIFIED_WIDTH, RECTIFIED_HEIGHT);
}

/**
 * Detect the card, auto-correcting a landscape-oriented photo: if the found
 * quad is wider than tall (cards are portrait), rotate 90° and re-detect,
 * keeping whichever orientation detects with more confidence.
 */
export function detectCardOriented(img: ImageData): {
  image: ImageData;
  detection: DetectionResult;
} {
  const det = detectCard(img);
  const w = (dist(det.quad.tl, det.quad.tr) + dist(det.quad.bl, det.quad.br)) / 2;
  const h = (dist(det.quad.tl, det.quad.bl) + dist(det.quad.tr, det.quad.br)) / 2;
  if (w > h * 1.1) {
    const rotated = rotate90(img);
    const det2 = detectCard(rotated);
    if (det2.confidence >= det.confidence - 0.1) {
      return { image: rotated, detection: det2 };
    }
  }
  return { image: img, detection: det };
}

/** Fraction of the source frame occupied by the quad (for "move closer"). */
export function quadCoverage(img: ImageData, quad: Quad): number {
  const w = (dist(quad.tl, quad.tr) + dist(quad.bl, quad.br)) / 2;
  const h = (dist(quad.tl, quad.bl) + dist(quad.tr, quad.br)) / 2;
  return (w * h) / (img.width * img.height);
}
