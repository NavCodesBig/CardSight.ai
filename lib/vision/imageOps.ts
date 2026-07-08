/**
 * Low-level pixel operations shared across the vision pipeline.
 * Everything operates on ImageData / Float32Array grayscale buffers so the
 * whole pipeline runs in the browser with zero native dependencies.
 */

import type { GrayImage, Point, Quad } from "./types";

/**
 * Decode a File/Blob into ImageData, downscaled so max(w, h) <= maxDim.
 * Phone cameras store rotation as EXIF, so orientation must be applied
 * during decode or portrait shots arrive sideways and detection fails.
 * Works on the main thread and inside Web Workers (OffscreenCanvas).
 */
export async function fileToImageData(
  file: Blob,
  maxDim = 1400
): Promise<ImageData> {
  const source = await decodeWithOrientation(file);
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const ctx = make2dContext(w, h);
  ctx.drawImage(source, 0, 0, w, h);
  if (source instanceof ImageBitmap) source.close();
  return ctx.getImageData(0, 0, w, h);
}

async function decodeWithOrientation(
  file: Blob
): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (typeof document === "undefined") throw new Error("decode failed in worker");
    // Fallback: <img> decode applies EXIF orientation in all modern browsers.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      // Safe to revoke once decode() resolves — pixels are already in memory.
      URL.revokeObjectURL(url);
    }
  }
}

type Ctx2d = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function make2dContext(w: number, h: number): Ctx2d {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    return canvas.getContext("2d", { willReadFrequently: true })!;
  }
  return new OffscreenCanvas(w, h).getContext("2d", {
    willReadFrequently: true,
  }) as OffscreenCanvasRenderingContext2D;
}

export function toGray(img: ImageData): GrayImage {
  const { width, height, data } = img;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return { data: out, width, height };
}

/** 3x3 box blur, used to denoise before gradient computation. */
export function boxBlur(src: GrayImage): GrayImage {
  const { width: w, height: h, data } = src;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1) * w;
    const y1 = y * w;
    const y2 = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1);
      const x2 = Math.min(w - 1, x + 1);
      out[y1 + x] =
        (data[y0 + x0] + data[y0 + x] + data[y0 + x2] +
          data[y1 + x0] + data[y1 + x] + data[y1 + x2] +
          data[y2 + x0] + data[y2 + x] + data[y2 + x2]) / 9;
    }
  }
  return { data: out, width: w, height: h };
}

/** Sobel gradient magnitude. */
export function gradientMagnitude(src: GrayImage): GrayImage {
  const { width: w, height: h, data } = src;
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -data[i - w - 1] + data[i - w + 1] -
        2 * data[i - 1] + 2 * data[i + 1] -
        data[i + w - 1] + data[i + w + 1];
      const gy =
        -data[i - w - 1] - 2 * data[i - w] - data[i - w + 1] +
        data[i + w - 1] + 2 * data[i + w] + data[i + w + 1];
      out[i] = Math.hypot(gx, gy);
    }
  }
  return { data: out, width: w, height: h };
}

/** Laplacian response — variance of this is the standard sharpness metric. */
export function laplacian(src: GrayImage): GrayImage {
  const { width: w, height: h, data } = src;
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] = -4 * data[i] + data[i - 1] + data[i + 1] + data[i - w] + data[i + w];
    }
  }
  return { data: out, width: w, height: h };
}

export function variance(data: Float32Array): number {
  let mean = 0;
  for (let i = 0; i < data.length; i++) mean += data[i];
  mean /= data.length;
  let v = 0;
  for (let i = 0; i < data.length; i++) {
    const d = data[i] - mean;
    v += d * d;
  }
  return v / data.length;
}

export function mean(data: Float32Array): number {
  let m = 0;
  for (let i = 0; i < data.length; i++) m += data[i];
  return m / data.length;
}

/** Least-squares line fit with one round of outlier rejection.
 *  Fits x = a*y + b when `vertical`, else y = a*x + b. */
export function fitLine(
  points: Point[],
  vertical: boolean
): { a: number; b: number } | null {
  if (points.length < 4) return null;

  const fit = (pts: Point[]) => {
    let su = 0, sv = 0, suu = 0, suv = 0;
    for (const p of pts) {
      const u = vertical ? p.y : p.x;
      const v = vertical ? p.x : p.y;
      su += u; sv += v; suu += u * u; suv += u * v;
    }
    const n = pts.length;
    const denom = n * suu - su * su;
    if (Math.abs(denom) < 1e-9) return { a: 0, b: sv / n };
    const a = (n * suv - su * sv) / denom;
    return { a, b: (sv - a * su) / n };
  };

  let line = fit(points);
  // Reject outliers beyond 2σ of residual and refit once.
  const residual = (p: Point) =>
    vertical ? p.x - (line.a * p.y + line.b) : p.y - (line.a * p.x + line.b);
  const res = points.map(residual);
  const sigma = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / res.length) || 1;
  const kept = points.filter((_, i) => Math.abs(res[i]) < 2 * sigma);
  if (kept.length >= 4) line = fit(kept);
  return line;
}

/**
 * RANSAC line fit — robust to background clutter. Where a card edge is a long
 * straight run of collinear points, scattered background edges are outliers the
 * consensus line ignores. Deterministic (seeded from the data) so repeated runs
 * on the same input give the same line. Falls back to a plain least-squares fit.
 * Fits x = a*y + b when `vertical`, else y = a*x + b.
 */
export function ransacLine(
  points: Point[],
  vertical: boolean,
  tol = 3,
  iters = 80
): { a: number; b: number } | null {
  if (points.length < 4) return fitLine(points, vertical);
  const u = (p: Point) => (vertical ? p.y : p.x);
  const v = (p: Point) => (vertical ? p.x : p.y);

  // Deterministic LCG seeded from the point set.
  let seed = (points.length * 2654435761) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pick = () => points[(rnd() * points.length) | 0];

  let best: { a: number; b: number } | null = null;
  let bestCount = 0;
  for (let it = 0; it < iters; it++) {
    const p1 = pick();
    const p2 = pick();
    const du = u(p2) - u(p1);
    if (Math.abs(du) < 1e-6) continue;
    const a = (v(p2) - v(p1)) / du;
    const b = v(p1) - a * u(p1);
    let count = 0;
    for (const p of points) if (Math.abs(v(p) - (a * u(p) + b)) < tol) count++;
    if (count > bestCount) {
      bestCount = count;
      best = { a, b };
    }
  }
  if (!best) return fitLine(points, vertical);
  // Least-squares refit on the inliers of the best model.
  const inliers = points.filter((p) => Math.abs(v(p) - (best!.a * u(p) + best!.b)) < tol);
  return inliers.length >= 4 ? fitLine(inliers, vertical) : best;
}

/** Intersect x = a1*y + b1 (vertical-ish) with y = a2*x + b2 (horizontal-ish). */
export function intersectVH(
  v: { a: number; b: number },
  hLine: { a: number; b: number }
): Point {
  // x = v.a * y + v.b ;  y = h.a * x + h.b
  const y = (hLine.a * v.b + hLine.b) / (1 - hLine.a * v.a);
  const x = v.a * y + v.b;
  return { x, y };
}

/**
 * Perspective-warp the quad region of `src` into an axis-aligned rectangle
 * of outW × outH using inverse bilinear sampling of the quad.
 */
export function warpQuad(
  src: ImageData,
  quad: Quad,
  outW: number,
  outH: number
): ImageData {
  const out = new ImageData(outW, outH);
  const s = src.data;
  const d = out.data;
  const { tl, tr, br, bl } = quad;

  for (let y = 0; y < outH; y++) {
    const v = y / (outH - 1);
    // Left and right rail points at this v
    const lx = tl.x + (bl.x - tl.x) * v;
    const ly = tl.y + (bl.y - tl.y) * v;
    const rx = tr.x + (br.x - tr.x) * v;
    const ry = tr.y + (br.y - tr.y) * v;
    for (let x = 0; x < outW; x++) {
      const u = x / (outW - 1);
      const sx = lx + (rx - lx) * u;
      const sy = ly + (ry - ly) * u;
      // Bilinear sample
      const x0 = Math.max(0, Math.min(src.width - 2, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(src.height - 2, Math.floor(sy)));
      const fx = Math.min(1, Math.max(0, sx - x0));
      const fy = Math.min(1, Math.max(0, sy - y0));
      const i00 = (y0 * src.width + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + src.width * 4;
      const i11 = i01 + 4;
      const di = (y * outW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] * (1 - fx) + s[i10 + c] * fx;
        const bot = s[i01 + c] * (1 - fx) + s[i11 + c] * fx;
        d[di + c] = top * (1 - fy) + bot * fy;
      }
      d[di + 3] = 255;
    }
  }
  return out;
}

/** Encode ImageData to a JPEG data URL for storage/display.
 *  Async so it also works in Web Workers via OffscreenCanvas. */
export async function imageDataToDataUrl(
  img: ImageData,
  quality = 0.85
): Promise<string> {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d")!.putImageData(img, 0, 0);
    return canvas.toDataURL("image/jpeg", quality);
  }
  const off = new OffscreenCanvas(img.width, img.height);
  off.getContext("2d")!.putImageData(img, 0, 0);
  const blob = await off.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Rotate an image 90° clockwise (for cards photographed in landscape). */
export function rotate90(src: ImageData): ImageData {
  const { width: w, height: h } = src;
  const out = new ImageData(h, w);
  const s = src.data;
  const d = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = (x * h + (h - 1 - y)) * 4;
      d[di] = s[si];
      d[di + 1] = s[si + 1];
      d[di + 2] = s[si + 2];
      d[di + 3] = 255;
    }
  }
  return out;
}

/** Extract a sub-rectangle of an ImageData. */
export function crop(
  src: ImageData,
  x: number,
  y: number,
  w: number,
  h: number
): ImageData {
  const out = new ImageData(w, h);
  for (let row = 0; row < h; row++) {
    const srcOff = ((y + row) * src.width + x) * 4;
    const dstOff = row * w * 4;
    out.data.set(src.data.subarray(srcOff, srcOff + w * 4), dstOff);
  }
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Whitening test shared by corner and edge analysis: a pixel reads as
 * exposed white card stock when it is light, desaturated, and far in color
 * space from the reference border color. (Undetectable on borders that are
 * already white — an inherent photo-grading limitation.)
 */
export function isWhitened(
  r: number,
  g: number,
  b: number,
  ref: readonly [number, number, number]
): boolean {
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (sat >= 46) return false;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const refLuma = 0.299 * ref[0] + 0.587 * ref[1] + 0.114 * ref[2];
  if (luma < 160 || luma < refLuma + 25) return false;
  const dist = Math.hypot(r - ref[0], g - ref[1], b - ref[2]);
  return dist > 70;
}
