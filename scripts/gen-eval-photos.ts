/**
 * Generate a synthetic "phone photo" eval corpus from cached reference scans.
 *
 * Real labeled phone photos are the gold standard (drop them in datasets/eval
 * per its README) — but until they exist, this gives eval-recognition.ts a
 * repeatable baseline: reference art composited onto photo-like backgrounds
 * with margin, rotation, exposure jitter, blur and JPEG loss, labeled from the
 * catalog automatically.
 *
 *   npx tsx scripts/gen-eval-photos.ts             # ~40 cases
 *   EVAL_CASES=80 npx tsx scripts/gen-eval-photos.ts
 *
 * Requires datasets/cardref/img (populated by build-embedding-index.ts) and
 * cards.ndjson. Outputs datasets/eval/synth-*.jpg + labels.json (gitignored).
 */

import { createReadStream } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import sharp from "sharp";

const CARDREF = join(process.cwd(), "datasets", "cardref");
const IMG_DIR = join(CARDREF, "img");
const EVAL = join(process.cwd(), "datasets", "eval");

interface RefRow {
  id: string;
  name: string;
  number: string;
  setName: string | null;
}

/** Deterministic PRNG so the corpus is reproducible run-to-run. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Photo-like background: base tone + coarse noise, e.g. desk / cloth / wood. */
async function makeBackground(
  w: number,
  h: number,
  rnd: () => number
): Promise<Buffer> {
  const palettes: [number, number, number][] = [
    [38, 36, 34], // dark matte desk
    [52, 44, 38], // walnut
    [70, 72, 78], // grey cloth
    [92, 78, 58], // light wood
    [30, 34, 44], // navy mat
  ];
  const [r, g, b] = palettes[Math.floor(rnd() * palettes.length)];
  // Coarse luminance noise upscaled = fabric/wood-ish texture.
  const nw = 24;
  const nh = Math.round((nw * h) / w);
  const noise = Buffer.alloc(nw * nh * 3);
  const amp = 6 + rnd() * 14;
  for (let i = 0; i < nw * nh; i++) {
    const d = (rnd() - 0.5) * amp;
    noise[i * 3] = Math.max(0, Math.min(255, r + d));
    noise[i * 3 + 1] = Math.max(0, Math.min(255, g + d));
    noise[i * 3 + 2] = Math.max(0, Math.min(255, b + d));
  }
  return sharp(noise, { raw: { width: nw, height: nh, channels: 3 } })
    .resize(w, h, { kernel: "cubic" })
    .png()
    .toBuffer();
}

async function main() {
  const rows: RefRow[] = [];
  const rl = createInterface({
    input: createReadStream(join(CARDREF, "cards.ndjson")),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) rows.push(JSON.parse(line) as RefRow);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));

  const cached = (await readdir(IMG_DIR)).filter((f) => f.endsWith(".png"));
  const target = Number(process.env.EVAL_CASES) || 40;
  const rnd = mulberry32(20260711);

  // Spread cases across the cached set rather than clustering at the front.
  const step = Math.max(1, Math.floor(cached.length / target));
  const picks = cached.filter((_, i) => i % step === 0).slice(0, target);

  const labels: object[] = [];
  let n = 0;
  for (const file of picks) {
    const id = file.replace(/\.png$/, "");
    const row = byId.get(id);
    if (!row) continue;

    const cardBuf = await readFile(join(IMG_DIR, file));
    const cardMeta = await sharp(cardBuf).metadata();
    if (!cardMeta.width || !cardMeta.height) continue;

    // Card ~72-84% of frame width, small rotation, off-center placement.
    const W = 1080;
    const H = 1440;
    const cw = Math.round(W * (0.72 + rnd() * 0.12));
    const ch = Math.round((cw * cardMeta.height) / cardMeta.width);
    const angle = (rnd() - 0.5) * 8; // ±4°
    const card = await sharp(cardBuf)
      .resize(cw, ch)
      .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const rot = await sharp(card).metadata();
    const left = Math.round((W - rot.width!) / 2 + (rnd() - 0.5) * W * 0.06);
    const top = Math.round((H - rot.height!) / 2 + (rnd() - 0.5) * H * 0.06);

    const bg = await makeBackground(W, H, rnd);
    const out = join(EVAL, `synth-${id}.jpg`);
    await sharp(bg)
      .composite([{ input: card, left, top }])
      .modulate({
        brightness: 0.85 + rnd() * 0.3, // under/over-exposure
        saturation: 0.9 + rnd() * 0.2,
      })
      .blur(rnd() < 0.3 ? 0.8 : 0.3) // a third of shots slightly soft
      .jpeg({ quality: 78 })
      .toFile(out);

    labels.push({
      image: `synth-${id}.jpg`,
      name: row.name,
      set: row.setName ?? undefined,
      number: row.number,
    });
    n++;
    if (n % 10 === 0) process.stdout.write(`\r  generated ${n}/${picks.length}   `);
  }

  await writeFile(join(EVAL, "labels.json"), JSON.stringify(labels, null, 2));
  process.stdout.write("\n");
  console.log(`Done. ${n} synthetic photos + labels.json -> ${EVAL}`);
  console.log("Replace/extend with real phone photos as they become available.");
}

main().catch((err) => {
  console.error("gen-eval-photos failed:", err);
  process.exit(1);
});
