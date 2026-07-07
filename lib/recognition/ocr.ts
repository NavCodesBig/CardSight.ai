/**
 * On-device OCR for card identity.
 *
 * Reads the name band (top of the card) and the collector-number band (bottom)
 * from the rectified front image using tesseract.js, which runs entirely in the
 * browser. tesseract.js is loaded lazily so its worker + wasm never touch the
 * initial bundle. Output feeds the Pokémon TCG price lookup — best-effort, with
 * a manual-search fallback in the UI when recognition misses.
 */

export interface CardText {
  name: string | null;
  number: string | null;
}

// Fractional crop windows on the rectified (portrait) card.
const NAME_BAND = { x: 0.05, y: 0.03, w: 0.68, h: 0.1 };
const NUMBER_BAND = { x: 0.02, y: 0.9, w: 0.5, h: 0.085 };

export async function extractCardText(rectifiedDataUrl: string): Promise<CardText> {
  try {
    const { createWorker, PSM } = await import("tesseract.js");
    const img = await loadImage(rectifiedDataUrl);

    const worker = await createWorker("eng");
    try {
      // Single-line mode suits the short name / number strips.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });

      const nameRaw = (await worker.recognize(crop(img, NAME_BAND))).data.text;
      const numberRaw = (await worker.recognize(crop(img, NUMBER_BAND))).data.text;

      return { name: cleanName(nameRaw), number: cleanNumber(numberRaw) };
    } finally {
      await worker.terminate();
    }
  } catch {
    return { name: null, number: null };
  }
}

function cleanName(raw: string): string | null {
  // Keep letters, spaces and a few name characters; drop OCR noise.
  const line = raw.split("\n").map((l) => l.trim()).find((l) => l.length > 1) ?? "";
  const cleaned = line.replace(/[^A-Za-z'.\- ]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length >= 2 ? cleaned : null;
}

function cleanNumber(raw: string): string | null {
  const flat = raw.replace(/\s+/g, "");
  // Prefer the "12/078" collector format; fall back to a standalone number.
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

/** Crop a fractional band and upscale ~2× for cleaner OCR. */
function crop(
  img: HTMLImageElement,
  band: { x: number; y: number; w: number; h: number }
): HTMLCanvasElement {
  const sx = img.width * band.x;
  const sy = img.height * band.y;
  const sw = img.width * band.w;
  const sh = img.height * band.h;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * 2);
  canvas.height = Math.round(sh * 2);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}
