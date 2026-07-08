/**
 * On-device OCR for card identity.
 *
 * Reads the name band (top of the card) and the collector-number band (bottom)
 * from the rectified front image using tesseract.js, which runs entirely in the
 * browser. Crops are grayscaled and contrast-stretched before recognition to
 * cope with holo/textured backgrounds. tesseract.js is loaded lazily so its
 * worker + wasm never touch the initial bundle. Output feeds the price lookup —
 * best-effort, with a manual-search fallback in the UI when recognition misses.
 */

import { snapScored, snapJapanese } from "./nameMatch";

// Below this English match confidence, retry the name in Japanese — the card
// is likely a Japanese-language print. Gated so the heavier jpn model only
// downloads when an English read genuinely fails.
const JP_FALLBACK_BELOW = 0.6;

export interface CardText {
  name: string | null;
  number: string | null;
}

// Fractional crop windows on the rectified (portrait) card.
const NAME_BAND = { x: 0.04, y: 0.02, w: 0.7, h: 0.13 };
const NUMBER_BAND = { x: 0.0, y: 0.9, w: 0.55, h: 0.095 };

const NAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '.-";
const NUMBER_CHARS = "0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export async function extractCardText(rectifiedDataUrl: string): Promise<CardText> {
  try {
    const { createWorker, PSM } = await import("tesseract.js");
    const img = await loadImage(rectifiedDataUrl);

    const nameCrop = crop(img, NAME_BAND);
    const worker = await createWorker("eng");
    let numberRaw = "";
    let match: ReturnType<typeof snapScored> = null;
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });

      await worker.setParameters({ tessedit_char_whitelist: NAME_CHARS });
      const nameRaw = (await worker.recognize(nameCrop)).data.text;

      await worker.setParameters({ tessedit_char_whitelist: NUMBER_CHARS });
      numberRaw = (await worker.recognize(crop(img, NUMBER_BAND))).data.text;

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
  nameCrop: HTMLCanvasElement
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Crop a fractional band, upscale ~3×, grayscale and contrast-stretch. */
function crop(
  img: HTMLImageElement,
  band: { x: number; y: number; w: number; h: number }
): HTMLCanvasElement {
  const sx = img.width * band.x;
  const sy = img.height * band.y;
  const sw = img.width * band.w;
  const sh = img.height * band.h;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * 3);
  canvas.height = Math.round(sh * 3);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = px.data;
  // Grayscale + track range for a contrast stretch.
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = d[i + 1] = d[i + 2] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const span = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) * 255) / span;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(px, 0, 0);
  return canvas;
}
