/**
 * Recognition eval harness — Road B brick #4.
 *
 * Measures how well the recognizer identifies cards against ground truth, so
 * every change to detection, cropping, or matching is judged by numbers instead
 * of vibes. Reuses the exact shipping pieces (cardDetector, embed.ts, matcher)
 * so results reflect production behavior.
 *
 *   npx tsx scripts/eval-recognition.ts
 *
 * Inputs:
 *   datasets/cardref/{embeddings.f32,embeddings.ids.json,catalog.json}
 *       — the index to match against (build-embedding-index.ts).
 *   datasets/eval/labels.json — array of cases:
 *       { "image": "chansey-front.jpg", "name": "Chansey",
 *         "set": "Evolutions", "number": "2", "rectified": false }
 *     `image` is relative to datasets/eval/. Set `rectified: true` for an image
 *     that is already a clean card crop (skips detection).
 *
 * This cut matches on ART ONLY (CLIP). The OCR name/number re-rank — the signal
 * that separates reprints — is pending ocr.ts being decoupled from the browser
 * so tesseract can run headless here; see matcher.ts (it already accepts OCR).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ImageData polyfill for Node (same shape the vision pipeline expects).
class NodeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, w: number, h: number) {
    this.data = data;
    this.width = w;
    this.height = h;
  }
}
(globalThis as Record<string, unknown>).ImageData = NodeImageData;

import { RawImage } from "@huggingface/transformers";
import { detectCardOriented, rectifyCard } from "../lib/vision/cardDetector";
import { embedArt } from "../lib/recognition/embed";
import { matchCard, type CatalogEntry, type EmbeddingIndex } from "../lib/recognition/matcher";
import { parseIndex, catalogLookup, type IndexMeta } from "../lib/recognition/cardIndex";

const CARDREF = join(process.cwd(), "datasets", "cardref");
const EVAL = join(process.cwd(), "datasets", "eval");

interface EvalCase {
  image: string;
  name: string;
  set?: string;
  number?: string;
  rectified?: boolean;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Decode an image file to an RGBA ImageData the vision pipeline can use. */
async function loadImageData(path: string): Promise<ImageData> {
  const raw = (await RawImage.read(path)) as unknown as {
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    channels: number;
  };
  const { width, height, channels } = raw;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++) {
    const s = i * channels;
    rgba[p++] = raw.data[s];
    rgba[p++] = raw.data[channels >= 2 ? s + 1 : s];
    rgba[p++] = raw.data[channels >= 3 ? s + 2 : s];
    rgba[p++] = channels === 4 ? raw.data[s + 3] : 255;
  }
  return new (globalThis.ImageData as typeof NodeImageData)(rgba, width, height) as unknown as ImageData;
}

async function main() {
  const meta = JSON.parse(await readFile(join(CARDREF, "embeddings.ids.json"), "utf8")) as IndexMeta;
  const vecBuf = await readFile(join(CARDREF, "embeddings.f32"));
  const index: EmbeddingIndex = parseIndex(
    vecBuf.buffer.slice(vecBuf.byteOffset, vecBuf.byteOffset + vecBuf.byteLength),
    meta
  );
  const entries = JSON.parse(await readFile(join(CARDREF, "catalog.json"), "utf8")) as CatalogEntry[];
  const catalog = catalogLookup(entries);
  const cases = JSON.parse(await readFile(join(EVAL, "labels.json"), "utf8")) as EvalCase[];

  console.log(`Index: ${index.ids.length} cards. Eval cases: ${cases.length}.\n`);

  let nameHits = 0;
  let setHits = 0;
  let setScored = 0;
  for (const c of cases) {
    let img = await loadImageData(join(EVAL, c.image));
    if (!c.rectified) {
      const { image, detection } = detectCardOriented(img);
      img = rectifyCard(image, detection.quad);
    }
    const embedding = await embedArt(img, meta.art);
    const m = matchCard({ queryEmbedding: embedding, index, catalog });

    const gotName = m?.entry.name ?? null;
    const gotSet = m?.entry.setName ?? null;
    const nameOk = norm(gotName) === norm(c.name);
    if (nameOk) nameHits++;
    let setMark = "";
    if (c.set) {
      setScored++;
      const setOk = norm(gotSet) === norm(c.set);
      if (setOk) setHits++;
      setMark = setOk ? " set✓" : ` set✗(${gotSet})`;
    }
    console.log(`${nameOk ? "✓" : "✗"} ${c.image}: got "${gotName}"${nameMark(nameOk, c.name)}${setMark} art=${m?.artScore ?? "-"}`);
  }

  console.log(`\nName top-1: ${nameHits}/${cases.length} (${pct(nameHits, cases.length)})`);
  if (setScored) console.log(`Set  top-1: ${setHits}/${setScored} (${pct(setHits, setScored)})`);
  console.log("(art-only — OCR re-rank pending headless ocr.ts)");
}

function nameMark(ok: boolean, truth: string): string {
  return ok ? "" : ` (want "${truth}")`;
}
function pct(a: number, b: number): string {
  return b ? `${Math.round((a / b) * 100)}%` : "n/a";
}

main().catch((err) => {
  console.error("eval-recognition failed:", err);
  process.exit(1);
});
