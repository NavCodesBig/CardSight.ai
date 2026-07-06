/**
 * Surface condition analysis.
 *
 * Looks for scratches, print lines and pressure marks on the card face.
 * A scratch reads as a thin, bright, desaturated anomaly against its local
 * surroundings; a print line is the same signal sustained across a long,
 * nearly straight horizontal or vertical run.
 *
 * Holo patterns produce legitimate sparkle, so the anomaly threshold is
 * raised in regions with high color variance (holo foil) to reduce false
 * positives. This is exactly the kind of judgment a fine-tuned vision model
 * improves on — see training/README.md for the dataset plan.
 */

import { boxBlur, clamp, toGray } from "./imageOps";
import type { SurfaceAnalysis, SurfaceDefect } from "./types";

const INSET_FRAC = 0.055; // analyze inside the border
const GRID_ROWS = 14;
const GRID_COLS = 10;
const BASE_THRESHOLD = 34;

export function analyzeSurface(rect: ImageData): SurfaceAnalysis {
  const { width: w, height: h } = rect;
  const inset = Math.round(w * INSET_FRAC);
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  const iw = x1 - x0, ih = y1 - y0;

  const gray = toGray(rect);
  const smooth = boxBlur(boxBlur(gray));

  // Local color variance per grid cell → holo detection for adaptive threshold.
  const cellW = iw / GRID_COLS;
  const cellH = ih / GRID_ROWS;
  const holoVar: number[][] = emptyGrid();
  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      holoVar[gy][gx] = cellColorVariance(rect, x0 + gx * cellW, y0 + gy * cellH, cellW, cellH);
    }
  }

  // Anomaly mask: bright, desaturated, high-frequency pixels.
  const mask = new Uint8Array(iw * ih);
  const d = rect.data;
  for (let y = y0 + 1; y < y1 - 1; y++) {
    for (let x = x0 + 1; x < x1 - 1; x++) {
      const i = y * w + x;
      const highpass = gray.data[i] - smooth.data[i];
      const gx = Math.min(GRID_COLS - 1, Math.floor((x - x0) / cellW));
      const gy = Math.min(GRID_ROWS - 1, Math.floor((y - y0) / cellH));
      const thr = BASE_THRESHOLD + Math.min(40, holoVar[gy][gx] / 40);
      if (highpass > thr) {
        const pi = i * 4;
        const sat = Math.max(d[pi], d[pi + 1], d[pi + 2]) - Math.min(d[pi], d[pi + 1], d[pi + 2]);
        if (sat < 60) mask[(y - y0) * iw + (x - x0)] = 1;
      }
    }
  }

  // Heatmap: defect density per grid cell.
  const heatmap: number[][] = emptyGrid();
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      if (mask[y * iw + x]) {
        const gy = Math.min(GRID_ROWS - 1, Math.floor(y / cellH));
        const gx = Math.min(GRID_COLS - 1, Math.floor(x / cellW));
        heatmap[gy][gx]++;
      }
    }
  }
  let total = 0;
  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      heatmap[gy][gx] = clamp(heatmap[gy][gx] / (cellW * cellH * 0.08), 0, 1);
      total += heatmap[gy][gx];
    }
  }
  const defectDensity = total / (GRID_ROWS * GRID_COLS);

  // Print lines: rows where anomalies form a long, nearly continuous run.
  const defects: SurfaceDefect[] = [];
  for (let y = 0; y < ih; y += 2) {
    let rowCount = 0;
    for (let x = 0; x < iw; x++) rowCount += mask[y * iw + x];
    if (rowCount > iw * 0.28) {
      defects.push({
        type: "print-line",
        x: x0 / w,
        y: (y0 + y) / h,
        w: iw / w,
        h: 2 / h,
        severity: clamp(rowCount / iw, 0, 1),
      });
      y += Math.round(cellH); // don't re-report the same line
    }
  }

  // Scratch clusters: hottest heatmap cells become reported defects.
  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      if (heatmap[gy][gx] > 0.35) {
        defects.push({
          type: holoVar[gy][gx] > 1600 ? "holo-scratch" : "scratch",
          x: (x0 + gx * cellW) / w,
          y: (y0 + gy * cellH) / h,
          w: cellW / w,
          h: cellH / h,
          severity: heatmap[gy][gx],
        });
      }
    }
  }

  // Gloss consistency: evenness of low-frequency brightness across cells.
  const cellMeans: number[] = [];
  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      cellMeans.push(cellMean(smooth.data, w, x0 + gx * cellW, y0 + gy * cellH, cellW, cellH));
    }
  }
  const mAll = cellMeans.reduce((s, v) => s + v, 0) / cellMeans.length;
  const sd = Math.sqrt(cellMeans.reduce((s, v) => s + (v - mAll) ** 2, 0) / cellMeans.length);
  const glossConsistency = clamp(1 - sd / 80, 0, 1);

  const printLines = defects.filter((df) => df.type === "print-line").length;
  const issues: string[] = [];
  if (defectDensity > 0.12) issues.push("widespread surface wear");
  else if (defectDensity > 0.05) issues.push("scattered surface marks");
  if (printLines) issues.push(`${printLines} print line${printLines > 1 ? "s" : ""}`);
  if (defects.some((df) => df.type === "holo-scratch")) issues.push("holo scratches");
  if (glossConsistency < 0.6) issues.push("uneven gloss");

  const score = clamp(
    Math.round((10 - defectDensity * 40 - printLines * 0.75 - (1 - glossConsistency) * 2) * 2) / 2,
    1,
    10
  );

  return {
    heatmap,
    heatmapRows: GRID_ROWS,
    heatmapCols: GRID_COLS,
    defects: defects.slice(0, 40),
    defectDensity: Math.round(defectDensity * 1000) / 1000,
    glossConsistency: Math.round(glossConsistency * 100) / 100,
    issues,
    score,
  };

  function emptyGrid(): number[][] {
    return Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(0));
  }
}

function cellColorVariance(
  img: ImageData,
  x: number,
  y: number,
  cw: number,
  ch: number
): number {
  let sr = 0, sg = 0, sb = 0, n = 0;
  const x1 = Math.min(img.width, x + cw), y1 = Math.min(img.height, y + ch);
  for (let yy = Math.floor(y); yy < y1; yy += 3) {
    for (let xx = Math.floor(x); xx < x1; xx += 3) {
      const i = (yy * img.width + xx) * 4;
      sr += img.data[i]; sg += img.data[i + 1]; sb += img.data[i + 2]; n++;
    }
  }
  if (!n) return 0;
  const mr = sr / n, mg = sg / n, mb = sb / n;
  let v = 0;
  for (let yy = Math.floor(y); yy < y1; yy += 3) {
    for (let xx = Math.floor(x); xx < x1; xx += 3) {
      const i = (yy * img.width + xx) * 4;
      v += (img.data[i] - mr) ** 2 + (img.data[i + 1] - mg) ** 2 + (img.data[i + 2] - mb) ** 2;
    }
  }
  return v / n;
}

function cellMean(
  data: Float32Array,
  stride: number,
  x: number,
  y: number,
  cw: number,
  ch: number
): number {
  let s = 0, n = 0;
  for (let yy = Math.floor(y); yy < y + ch; yy += 3) {
    for (let xx = Math.floor(x); xx < x + cw; xx += 3) {
      s += data[yy * stride + xx]; n++;
    }
  }
  return n ? s / n : 0;
}
