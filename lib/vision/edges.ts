/**
 * Edge condition analysis.
 *
 * Examines a thin strip along each physical edge of the rectified card for
 * whitening (light desaturated pixels against the border color) and for
 * localized nicks — short bursts of whitening surrounded by clean edge.
 */

import { clamp, isWhitened } from "./imageOps";
import type { EdgeAnalysis, EdgeName } from "./types";

const STRIP_PX = 8; // ≈ 0.8 mm strip at 0.1 mm/px
const FRINGE_PX = 3; // outermost px are warp fringe/scan rim — never score them
const CORNER_SKIP_FRAC = 0.08; // skip corner zones (scored separately)
const NICK_RUN = 2; // a nick must span ≥2 profile positions (≥4 px)

const EDGES: EdgeName[] = ["top", "right", "bottom", "left"];

export function analyzeEdges(rect: ImageData): EdgeAnalysis[] {
  const { width: w, height: h } = rect;

  return EDGES.map((edge) => {
    const horizontal = edge === "top" || edge === "bottom";
    const len = horizontal ? w : h;
    const skip = Math.round(len * CORNER_SKIP_FRAC);

    // Reference color from just inside the strip (border proper).
    const ref = stripAvg(rect, edge, STRIP_PX + 4, STRIP_PX + 12, skip);

    // Per-position whitening along the edge. The outermost FRINGE_PX are
    // skipped: rectification bleeds a sliver of background (and digital
    // scans a white rim) into row 0–2, which read as whitening on cards
    // that have none — pristine reference scans were scoring "moderate
    // whitening, 7 nicks" from that artifact alone.
    const profile: number[] = [];
    for (let t = skip; t < len - skip; t += 2) {
      let white = 0, n = 0;
      for (let dpth = FRINGE_PX; dpth < FRINGE_PX + STRIP_PX; dpth++) {
        const [r, g, b] = samplePx(rect, edge, t, dpth);
        if (isWhitened(r, g, b, ref)) white++;
        n++;
      }
      profile.push(white / n);
    }

    const whitening = profile.reduce((s, v) => s + v, 0) / (profile.length || 1);

    // Nicks: sustained local spikes well above the edge's own average. A
    // single spiky position (one holo sparkle) is not a nick — the spike
    // must hold for NICK_RUN consecutive positions.
    let nickCount = 0;
    let runLen = 0;
    for (const v of profile) {
      if (v > Math.max(0.5, whitening * 3)) {
        runLen++;
        if (runLen === NICK_RUN) nickCount++;
      } else runLen = 0;
    }

    const issues: string[] = [];
    if (whitening > 0.25) issues.push("heavy edge whitening");
    else if (whitening > 0.1) issues.push("moderate whitening");
    else if (whitening > 0.05) issues.push("light whitening");
    if (nickCount > 0) issues.push(`${nickCount} nick${nickCount > 1 ? "s" : ""} detected`);

    const score = clamp(
      Math.round((10 - whitening * 45 - nickCount * 0.5) * 2) / 2,
      1,
      10
    );

    return {
      edge,
      whitening: Math.round(whitening * 1000) / 1000,
      nickCount,
      issues,
      score,
    };
  });
}

function samplePx(
  img: ImageData,
  edge: EdgeName,
  t: number,
  depth: number
): [number, number, number] {
  let x: number, y: number;
  if (edge === "top") { x = t; y = depth; }
  else if (edge === "bottom") { x = t; y = img.height - 1 - depth; }
  else if (edge === "left") { x = depth; y = t; }
  else { x = img.width - 1 - depth; y = t; }
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

function stripAvg(
  img: ImageData,
  edge: EdgeName,
  d0: number,
  d1: number,
  skip: number
): [number, number, number] {
  const horizontal = edge === "top" || edge === "bottom";
  const len = horizontal ? img.width : img.height;
  let r = 0, g = 0, b = 0, n = 0;
  for (let t = skip; t < len - skip; t += 4) {
    for (let d = d0; d < d1; d += 2) {
      const [pr, pg, pb] = samplePx(img, edge, t, d);
      r += pr; g += pg; b += pb; n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [128, 128, 128];
}
