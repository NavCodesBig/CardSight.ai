/**
 * Build the art-embedding index — Road B brick #2.
 *
 * Reads the reference catalog (datasets/cardref/cards.ndjson from
 * build-card-db.ts), embeds each card's ART WINDOW with CLIP ViT-B/32, and
 * writes a flat vector index the recognizer will nearest-neighbor against.
 *
 * Why the art window and not the whole card: raw full-card CLIP embeddings put
 * every Pokémon card in a tight cosine band (~0.89) because they share border,
 * layout, and text — barely separable. Cropping to the art lifts separation
 * (measured ~0.89 -> ~0.83 mean inter-card cosine). Even so, CLIP alone is a
 * shortlister, not a decider: the recognizer should re-rank the top-K by OCR
 * name/number against the catalog. See datasets/cardref/README.md.
 *
 *   npx tsx scripts/build-embedding-index.ts          # full catalog
 *   EMBED_LIMIT=50 npx tsx scripts/build-embedding-index.ts   # partial/test
 *
 * Downloaded art is cached under datasets/cardref/img so re-runs are cheap.
 * Output: embeddings.f32 (N×512 little-endian) + embeddings.ids.json (N ids,
 * same order). Both gitignored.
 */

import { createReadStream } from "node:fs";
import { mkdir, writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
} from "@huggingface/transformers";

const MODEL = "Xenova/clip-vit-base-patch32";
const DIM = 512;
const CARDREF = join(process.cwd(), "datasets", "cardref");
const NDJSON = join(CARDREF, "cards.ndjson");
const IMG_DIR = join(CARDREF, "img");
const OUT_VEC = join(CARDREF, "embeddings.f32");
const OUT_IDS = join(CARDREF, "embeddings.ids.json");

// Fractional art window. Tuned for classic layouts; the same crop is applied to
// the query at scan time, so consistency matters more than pixel-perfection.
const ART = { x0: 0.1, y0: 0.13, x1: 0.9, y1: 0.52 };

interface RefRow {
  id: string;
  imageLarge: string | null;
  imageSmall: string | null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Fetch the card art to a local cache file, returning its path (or null). */
async function cacheImage(id: string, url: string): Promise<string | null> {
  const path = join(IMG_DIR, `${id}.png`);
  if (await exists(path)) return path;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
    return path;
  } catch {
    return null;
  }
}

async function main() {
  if (!(await exists(NDJSON))) {
    console.error(`Missing ${NDJSON}. Run: npx tsx scripts/build-card-db.ts`);
    process.exit(1);
  }
  await mkdir(IMG_DIR, { recursive: true });

  const limit = Number(process.env.EMBED_LIMIT) || Infinity;

  console.log("loading CLIP ViT-B/32...");
  const processor = await AutoProcessor.from_pretrained(MODEL);
  const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL);

  const embed = async (path: string): Promise<Float32Array | null> => {
    try {
      let img = await RawImage.read(path);
      const { width: w, height: h } = img;
      img = await img.crop([
        Math.round(w * ART.x0),
        Math.round(h * ART.y0),
        Math.round(w * ART.x1),
        Math.round(h * ART.y1),
      ]);
      const inputs = await processor(img);
      const { image_embeds } = await model(inputs);
      const v = image_embeds.data as Float32Array;
      let n = 0;
      for (const x of v) n += x * x;
      n = Math.sqrt(n) || 1;
      return Float32Array.from(v, (x) => x / n); // L2-normalized
    } catch {
      return null;
    }
  };

  // Stream the catalog so we never hold 20k rows in memory.
  const rl = createInterface({ input: createReadStream(NDJSON), crlfDelay: Infinity });
  const ids: string[] = [];
  const vectors: Float32Array[] = [];
  let seen = 0;
  let skipped = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (ids.length >= limit) break;
    const row = JSON.parse(line) as RefRow;
    const url = row.imageLarge ?? row.imageSmall;
    if (!url) {
      skipped++;
      continue;
    }
    const path = await cacheImage(row.id, url);
    if (!path) {
      skipped++;
      continue;
    }
    const vec = await embed(path);
    if (!vec || vec.length !== DIM) {
      skipped++;
      continue;
    }
    ids.push(row.id);
    vectors.push(vec);
    seen++;
    if (seen % 25 === 0) process.stdout.write(`\r  embedded ${seen} (skipped ${skipped})   `);
  }

  // Write the flat index: all vectors concatenated as little-endian Float32.
  const buf = Buffer.allocUnsafe(vectors.length * DIM * 4);
  vectors.forEach((v, i) => {
    for (let j = 0; j < DIM; j++) buf.writeFloatLE(v[j], (i * DIM + j) * 4);
  });
  await writeFile(OUT_VEC, buf);
  await writeFile(OUT_IDS, JSON.stringify({ dim: DIM, model: MODEL, art: ART, ids }));

  process.stdout.write("\n");
  console.log(`Done. ${ids.length} vectors (${DIM}-d) -> ${OUT_VEC}`);
  console.log(`Ids -> ${OUT_IDS}`);
  if (skipped) console.log(`Skipped ${skipped} (no image / fetch or embed failure).`);
}

main().catch((err) => {
  console.error("\nbuild-embedding-index failed:", err);
  process.exit(1);
});
