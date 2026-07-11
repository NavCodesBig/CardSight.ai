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
import type { DetectionResult, GrayImage, Point, Quad } from "./types";
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

  // Full-bleed rescue. On a digital scan / screenshot the card IS the frame,
  // so the first strong edge inward is an interior line of the card (border
  // shading, the art-window frame), which is card-shaped enough to pass every
  // gate above — the pipeline then crops into the card and grades artwork as
  // edges. Signature of that failure: the image itself has trading-card
  // aspect, and the area *outside* the detected quad still contains card
  // content (measured: ~27 mean gradient on reference scans) — whereas a
  // photographed card floats on background that reads near zero (~0-5 on a
  // matte surface). Known cost: a photo on a heavily textured surface at
  // card-ish aspect could trip this; the segmentation detector is the
  // eventual fix.
  const imgAspect = w / h;
  if (imgAspect > 0.66 && imgAspect < 0.78 && coverage < 0.85) {
    const frameQuad: Quad = {
      tl: { x: 1, y: 1 },
      tr: { x: w - 2, y: 1 },
      br: { x: w - 2, y: h - 2 },
      bl: { x: 1, y: h - 2 },
    };
    const frameRing = ringGradient(grad, frameQuad, 0.02, 0.045);
    if (
      outsideActivity(grad, quad) > Math.max(15, thr * 0.1) &&
      frameRing < thr * 0.6
    ) {
      return { quad: frameQuad, confidence: 0.7 };
    }
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

/**
 * Mean gradient magnitude in a band inset from the quad's bounding box by
 * [in0, in1] fractions of its dimensions. Low ⇒ smooth (a card border);
 * high ⇒ textured (artwork). Used to tell a card-edge lock from an
 * art-frame lock on full-bleed images.
 */
function ringGradient(
  grad: GrayImage,
  q: Quad,
  in0: number,
  in1: number
): number {
  const xs = [q.tl.x, q.tr.x, q.br.x, q.bl.x];
  const ys = [q.tl.y, q.tr.y, q.br.y, q.bl.y];
  const x0 = Math.max(0, Math.min(...xs));
  const x1 = Math.min(grad.width - 1, Math.max(...xs));
  const y0 = Math.max(0, Math.min(...ys));
  const y1 = Math.min(grad.height - 1, Math.max(...ys));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw < 20 || bh < 20) return 0;

  let sum = 0;
  let n = 0;
  const sample = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= grad.width || yi >= grad.height) return;
    sum += grad.data[yi * grad.width + xi];
    n++;
  };
  // Two depths per side across the band, sampled along the middle 80%.
  for (const f of [in0, (in0 + in1) / 2, in1]) {
    const dx = bw * f;
    const dy = bh * f;
    for (let t = 0.1; t <= 0.9; t += 0.05) {
      sample(x0 + bw * t, y0 + dy); // top
      sample(x0 + bw * t, y1 - dy); // bottom
      sample(x0 + dx, y0 + bh * t); // left
      sample(x1 - dx, y0 + bh * t); // right
    }
  }
  return n ? sum / n : 0;
}

/**
 * Mean gradient magnitude of the image area outside the quad's bounding box
 * (excluding a 6 px margin around the quad and 3 px at the image border).
 * Background reads near zero; leftover card content reads well above it.
 */
function outsideActivity(grad: GrayImage, q: Quad): number {
  const xs = [q.tl.x, q.tr.x, q.br.x, q.bl.x];
  const ys = [q.tl.y, q.tr.y, q.br.y, q.bl.y];
  const bx0 = Math.min(...xs) - 6;
  const bx1 = Math.max(...xs) + 6;
  const by0 = Math.min(...ys) - 6;
  const by1 = Math.max(...ys) + 6;
  let sum = 0;
  let n = 0;
  for (let y = 3; y < grad.height - 3; y += 3) {
    for (let x = 3; x < grad.width - 3; x += 3) {
      if (x > bx0 && x < bx1 && y > by0 && y < by1) continue;
      sum += grad.data[y * grad.width + x];
      n++;
    }
  }
  return n ? sum / n : 0;
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

/**
 * Snap a user-confirmed (or camera-hinted) quad onto the strongest nearby
 * edges. A confirmed-by-eye quad is routinely a few pixels off the physical
 * card edge — and an unadjusted default can be off by much more — which is
 * enough to corrupt sub-millimeter centering measurement. Each side line is
 * slid along its normal within a small search band and lands on the offset
 * with the strongest mean gradient; sides without a convincing edge stay put.
 * Returns the refined quad plus how many sides actually snapped.
 */
export function refineQuad(
  img: ImageData,
  quad: Quad
): { quad: Quad; snappedSides: number } {
  const gray = boxBlur(toGray(img));
  const grad = gradientMagnitude(gray);
  const { width: w, height: h } = grad;

  const sides: [keyof Quad, keyof Quad][] = [
    ["tl", "tr"], // top
    ["tr", "br"], // right
    ["br", "bl"], // bottom
    ["bl", "tl"], // left
  ];

  // Search band: ±4% of the quad's perpendicular extent per side.
  const spanX = Math.max(
    Math.abs(quad.tr.x - quad.tl.x),
    Math.abs(quad.br.x - quad.bl.x)
  );
  const spanY = Math.max(
    Math.abs(quad.bl.y - quad.tl.y),
    Math.abs(quad.br.y - quad.tr.y)
  );

  const offsets: number[] = [];
  let snappedSides = 0;

  for (let s = 0; s < 4; s++) {
    const a = quad[sides[s][0]];
    const b = quad[sides[s][1]];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Unit normal to the side.
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const radius = Math.max(4, Math.round((s % 2 === 0 ? spanY : spanX) * 0.04));

    let bestOff = 0;
    let bestScore = -1;
    let zeroScore = 0;
    for (let off = -radius; off <= radius; off++) {
      let sum = 0;
      let n = 0;
      // Sample the middle 84% of the side to avoid corner cross-talk.
      for (let t = 0.08; t <= 0.92; t += 0.04) {
        const x = Math.round(a.x + (b.x - a.x) * t + nx * off);
        const y = Math.round(a.y + (b.y - a.y) * t + ny * off);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        sum += grad.data[y * w + x];
        n++;
      }
      const score = n ? sum / n : 0;
      if (off === 0) zeroScore = score;
      if (score > bestScore) {
        bestScore = score;
        bestOff = off;
      }
    }

    // Only move a side when the found edge is real (clears an absolute floor)
    // and clearly better than staying put.
    if (bestOff !== 0 && bestScore > 40 && bestScore > zeroScore * 1.15) {
      offsets.push(bestOff);
      snappedSides++;
    } else {
      offsets.push(0);
    }
  }

  // Rebuild corners from the shifted side lines.
  const shifted = sides.map(([ka, kb], s) => {
    const a = quad[ka];
    const b = quad[kb];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / len) * offsets[s];
    const ny = ((b.x - a.x) / len) * offsets[s];
    return {
      a: { x: a.x + nx, y: a.y + ny },
      b: { x: b.x + nx, y: b.y + ny },
    };
  });
  const [top, right, bottom, left] = shifted;
  const refined: Quad = {
    tl: intersectSegLines(left, top) ?? quad.tl,
    tr: intersectSegLines(top, right) ?? quad.tr,
    br: intersectSegLines(right, bottom) ?? quad.br,
    bl: intersectSegLines(bottom, left) ?? quad.bl,
  };

  // Reject a refinement that produced a degenerate shape.
  const g = quadGeometry(refined);
  if (!g.convex || g.minSide < 8) return { quad, snappedSides: 0 };
  return { quad: refined, snappedSides };
}

/** Intersection of two infinite lines given as point pairs; null if parallel. */
function intersectSegLines(
  l1: { a: Point; b: Point },
  l2: { a: Point; b: Point }
): Point | null {
  const d1x = l1.b.x - l1.a.x;
  const d1y = l1.b.y - l1.a.y;
  const d2x = l2.b.x - l2.a.x;
  const d2y = l2.b.y - l2.a.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((l2.a.x - l1.a.x) * d2y - (l2.a.y - l1.a.y) * d2x) / den;
  return { x: l1.a.x + t * d1x, y: l1.a.y + t * d1y };
}

/**
 * How closely two quads agree, 0..1: mean corner distance normalized by the
 * first quad's diagonal. 1 = identical; ≥0.97 means within ~3% of the card.
 */
export function quadAgreement(a: Quad, b: Quad): number {
  const diag = Math.hypot(a.br.x - a.tl.x, a.br.y - a.tl.y) || 1;
  const d =
    (dist(a.tl, b.tl) + dist(a.tr, b.tr) + dist(a.br, b.br) + dist(a.bl, b.bl)) / 4;
  return Math.max(0, 1 - d / diag);
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
