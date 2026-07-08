/**
 * On-device OCR for card identity (browser adapter).
 *
 * Decodes the rectified front image to pixels and runs the environment-neutral
 * OCR core (ocrCore.ts) with a browser bridge: each preprocessed crop is drawn
 * to a canvas, which tesseract.js accepts directly. The recognition logic —
 * name/number bands, contrast preprocessing, Japanese fallback, name snapping —
 * lives in the core so it can also run headless in the eval harness. Output
 * feeds the price lookup; the UI keeps a manual-search fallback when it misses.
 */

import { extractCardTextFromPixels, type CardText, type PixelData } from "./ocrCore";

export type { CardText } from "./ocrCore";

export async function extractCardText(rectifiedDataUrl: string): Promise<CardText> {
  try {
    const img = await loadImage(rectifiedDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height);
    return await extractCardTextFromPixels(pixels, toCanvas);
  } catch {
    return { name: null, number: null };
  }
}

/** Browser bridge: a preprocessed crop → a canvas tesseract can read. */
function toCanvas(p: PixelData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext("2d")!;
  const id = ctx.createImageData(p.width, p.height);
  id.data.set(p.data);
  ctx.putImageData(id, 0, 0);
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
