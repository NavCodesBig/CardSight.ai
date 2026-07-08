/**
 * OCR core — environment-neutral card-text recognition.
 *
 * Holds the crop windows, the pure pixel preprocessing (bilinear upscale →
 * grayscale → percentile-clipped contrast), and the tesseract.js orchestration
 * (English name + number, Japanese fallback, snap to a real card name). It
 * never touches the DOM: callers inject a `toInput` bridge that turns a
 * preprocessed crop into whatever tesseract accepts in their environment — a
 * canvas in the browser (ocr.ts), a PNG buffer in Node (the eval harness). This
 * is what lets the exact same OCR run headless for measurement.
 */

import type { ImageLike } from "tesseract.js";
import { snapScored, snapJapanese } from "./nameMatch";

// Below this English match confidence, retry the name in Japanese — the card
// is likely a Japanese-language print. Gated so the heavier jpn model only
// downloads when an English read genuinely fails.
const JP_FALLBACK_BELOW = 0.6;

export interface CardText {
  name: string | null;
  number: string | null;
}

/** Minimal pixel container (structurally compatible with DOM ImageData). */
export interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Turns a preprocessed crop into a tesseract-recognizable input for this env. */
export type ToInput = (p: PixelData) => ImageLike | Promise<ImageLike>;

// Fractional crop windows on the rectified (portrait) card.
const NAME_BAND = { x: 0.04, y: 0.02, w: 0.7, h: 0.13 };
const NUMBER_BAND = { x: 0.0, y: 0.9, w: 0.55, h: 0.095 };

const NAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '.-";
const NUMBER_CHARS = "0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Recognize name + collector number from a rectified card's pixels. `toInput`
 * adapts a crop to the environment's tesseract input type.
 */
export async function extractCardTextFromPixels(
  img: PixelData,
  toInput: ToInput
): Promise<CardText> {
  try {
    const { createWorker, PSM } = await import("tesseract.js");

    const nameCrop = await toInput(preprocessCrop(img, NAME_BAND));
    const numberCrop = await toInput(preprocessCrop(img, NUMBER_BAND));

    const worker = await createWorker("eng");
    let numberRaw = "";
    let match: ReturnType<typeof snapScored> = null;
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });

      await worker.setParameters({ tessedit_char_whitelist: NAME_CHARS });
      const nameRaw = (await worker.recognize(nameCrop)).data.text;

      await worker.setParameters({ tessedit_char_whitelist: NUMBER_CHARS });
      numberRaw = (await worker.recognize(numberCrop)).data.text;

      // Snap the English read to the nearest real card name.
      match = snapScored(cleanName(nameRaw));
    } finally {
      await worker.terminate();
    }

    // Weak English read → try Japanese (katakana) and keep the better match.
    if (!match || match.sim < JP_FALLBACK_BELOW) {
      const jp = await recognizeJapanese(createWorker, PSM, nameCrop);
      if (jp && (!match || jp.sim > match.sim)) match = jp;
    }

    return { name: match?.display ?? null, number: cleanNumber(numberRaw) };
  } catch {
    return { name: null, number: null };
  }
}

type Tesseract = typeof import("tesseract.js");

/** OCR the name band in Japanese and snap it to an English card name. */
async function recognizeJapanese(
  createWorker: Tesseract["createWorker"],
  PSM: Tesseract["PSM"],
  nameCrop: ImageLike
): Promise<ReturnType<typeof snapJapanese>> {
  try {
    const worker = await createWorker("jpn");
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      const raw = (await worker.recognize(nameCrop)).data.text;
      return snapJapanese(raw);
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}

function cleanName(raw: string): string | null {
  const line = raw.split("\n").map((l) => l.trim()).find((l) => l.length > 1) ?? "";
  const cleaned = line.replace(/[^A-Za-z'.\- ]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length >= 2 ? cleaned : null;
}

function cleanNumber(raw: string): string | null {
  const flat = raw.replace(/\s+/g, "");
  const frac = flat.match(/(\d{1,3})\/(\d{1,3})/);
  if (frac) return frac[1].replace(/^0+(?=\d)/, "");
  const solo = flat.match(/[A-Z]{0,3}\d{1,3}/);
  return solo ? solo[0] : null;
}

/**
 * Crop a fractional band, upscale ~3× (bilinear), grayscale, and stretch
 * contrast between the 2nd/98th luma percentiles so a lone specular highlight
 * or shadow can't flatten the range. Pure — no canvas — so it runs anywhere.
 */
export function preprocessCrop(
  img: PixelData,
  band: { x: number; y: number; w: number; h: number }
): PixelData {
  const sx = img.width * band.x;
  const sy = img.height * band.y;
  const sw = img.width * band.w;
  const sh = img.height * band.h;
  const dw = Math.max(1, Math.round(sw * 3));
  const dh = Math.max(1, Math.round(sh * 3));

  const out = new Uint8ClampedArray(dw * dh * 4);
  const gray = new Float32Array(dw * dh);
  const hist = new Int32Array(256);

  // Bilinear sample the source region into the upscaled grayscale buffer.
  for (let y = 0; y < dh; y++) {
    const fy = sy + ((y + 0.5) / dh) * sh - 0.5;
    const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(fy)));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - Math.floor(fy);
    for (let x = 0; x < dw; x++) {
      const fx = sx + ((x + 0.5) / dw) * sw - 0.5;
      const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(fx)));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - Math.floor(fx);
      const g =
        lerpGray(img, x0, y0, x1, y1, wx, wy) | 0;
      const p = y * dw + x;
      gray[p] = g;
      hist[Math.max(0, Math.min(255, g))]++;
    }
  }

  const total = dw * dh;
  const min = percentile(hist, total, 0.02);
  const max = percentile(hist, total, 0.98);
  const span = Math.max(1, max - min);
  for (let p = 0; p < total; p++) {
    const v = Math.max(0, Math.min(255, ((gray[p] - min) * 255) / span));
    const i = p * 4;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { data: out, width: dw, height: dh };
}

/** Bilinear-interpolated grayscale (Rec. 601) of a source pixel. */
function lerpGray(
  img: PixelData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  wx: number,
  wy: number
): number {
  const g = (x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114;
  };
  const top = g(x0, y0) * (1 - wx) + g(x1, y0) * wx;
  const bot = g(x0, y1) * (1 - wx) + g(x1, y1) * wx;
  return top * (1 - wy) + bot * wy;
}

/** Luma value at the given cumulative fraction (0..1) of a 256-bin histogram. */
function percentile(hist: Int32Array, total: number, frac: number): number {
  const target = total * frac;
  let cum = 0;
  for (let g = 0; g < 256; g++) {
    cum += hist[g];
    if (cum >= target) return g;
  }
  return 255;
}
