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
  fitLine,
  gradientMagnitude,
  intersectVH,
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

  const left = fitLine(leftPts, true);
  const right = fitLine(rightPts, true);
  const top = fitLine(topPts, false);
  const bottom = fitLine(bottomPts, false);

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

  // Sanity checks: corners inside frame, sensible area, card-like aspect.
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];
  const inFrame = pts.every(
    (p) => p.x > -w * 0.05 && p.x < w * 1.05 && p.y > -h * 0.05 && p.y < h * 1.05
  );
  const quadW = (dist(quad.tl, quad.tr) + dist(quad.bl, quad.br)) / 2;
  const quadH = (dist(quad.tl, quad.bl) + dist(quad.tr, quad.br)) / 2;
  const area = quadW * quadH;
  const coverage = area / (w * h);
  const aspect = quadW / quadH;
  const expectedAspect = CARD_WIDTH_MM / CARD_HEIGHT_MM; // ≈ 0.714
  const aspectOk = aspect > expectedAspect * 0.72 && aspect < expectedAspect * 1.4;

  let confidence = 0.5;
  if (inFrame) confidence += 0.2;
  if (coverage > 0.25 && coverage < 0.98) confidence += 0.15;
  if (aspectOk) confidence += 0.15;
  // Consistency of the fitted side points raises confidence.
  const density =
    (leftPts.length + rightPts.length + topPts.length + bottomPts.length) /
    ((yEnd - yStart) / 3 + (xEnd - xStart) / 3) / 2;
  confidence = Math.min(1, confidence * Math.min(1, density + 0.5));

  if (!inFrame || coverage < 0.15) {
    return {
      quad: {
        tl: { x: 0, y: 0 },
        tr: { x: w - 1, y: 0 },
        br: { x: w - 1, y: h - 1 },
        bl: { x: 0, y: h - 1 },
      },
      confidence: 0.15,
    };
  }

  return { quad, confidence };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Standard rectified output size: 0.1 mm per pixel. */
export const RECTIFIED_WIDTH = Math.round(CARD_WIDTH_MM * 10); // 635
export const RECTIFIED_HEIGHT = Math.round(CARD_HEIGHT_MM * 10); // 889

/** Rectify the detected quad to a canonical card-shaped image. */
export function rectifyCard(img: ImageData, quad: Quad): ImageData {
  return warpQuad(img, quad, RECTIFIED_WIDTH, RECTIFIED_HEIGHT);
}

/** Fraction of the source frame occupied by the quad (for "move closer"). */
export function quadCoverage(img: ImageData, quad: Quad): number {
  const w = (dist(quad.tl, quad.tr) + dist(quad.bl, quad.br)) / 2;
  const h = (dist(quad.tl, quad.bl) + dist(quad.tr, quad.br)) / 2;
  return (w * h) / (img.width * img.height);
}
