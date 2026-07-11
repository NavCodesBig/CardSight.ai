/**
 * Synthetic training data for the card segmentation detector (Road B).
 *
 * Composites reference card scans onto varied photo-like backgrounds with
 * random scale, rotation, exposure and blur, and writes the exact card
 * silhouette (from the composited alpha) as the ground-truth mask. Labeled
 * segmentation data for free — no manual annotation.
 *
 *   npx tsx scripts/gen-seg-data.ts                # 2000 samples
 *   SEG_SAMPLES=8000 npx tsx scripts/gen-seg-data.ts
 *
 * Requires datasets/cardref/img (populated by build-embedding-index.ts).
 * Output: datasets/seg/{images,masks}/NNNNN.{jpg,png} at 256×342 — already
 * training resolution so the trainer never touches full-size images.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const IMG_DIR = join(process.cwd(), "datasets", "cardref", "img");
const OUT = join(process.cwd(), "datasets", "seg");
const W = 256;
const H = 342;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Noise-textured background in a photo-plausible tone. */
async function makeBackground(rnd: () => number): Promise<Buffer> {
  const tones: [number, number, number][] = [
    [38, 36, 34], [52, 44, 38], [70, 72, 78], [92, 78, 58], [30, 34, 44],
    [120, 118, 112], [160, 152, 140], [24, 26, 30], [78, 60, 48], [100, 104, 96],
  ];
  const [r, g, b] = tones[Math.floor(rnd() * tones.length)];
  const nw = 16 + Math.floor(rnd() * 24);
  const nh = Math.round((nw * H) / W);
  const amp = 4 + rnd() * 30;
  const noise = Buffer.alloc(nw * nh * 3);
  for (let i = 0; i < nw * nh; i++) {
    const d = (rnd() - 0.5) * amp;
    noise[i * 3] = Math.max(0, Math.min(255, r + d));
    noise[i * 3 + 1] = Math.max(0, Math.min(255, g + d));
    noise[i * 3 + 2] = Math.max(0, Math.min(255, b + d));
  }
  return sharp(noise, { raw: { width: nw, height: nh, channels: 3 } })
    .resize(W, H, { kernel: rnd() < 0.5 ? "cubic" : "nearest" })
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(join(OUT, "images"), { recursive: true });
  await mkdir(join(OUT, "masks"), { recursive: true });

  const cards = (await readdir(IMG_DIR)).filter((f) => f.endsWith(".png"));
  if (cards.length === 0) {
    console.error(`No card scans in ${IMG_DIR}. Run build-embedding-index.ts first.`);
    process.exit(1);
  }

  const total = Number(process.env.SEG_SAMPLES) || 2000;
  const rnd = mulberry32(42);

  for (let i = 0; i < total; i++) {
    const file = cards[Math.floor(rnd() * cards.length)];
    const cardBuf = await readFile(join(IMG_DIR, file));

    // Random pose: 25–90% of frame width, ±15° rotation, anywhere in frame.
    const cw = Math.round(W * (0.25 + rnd() * 0.65));
    const meta = await sharp(cardBuf).metadata();
    const ch = Math.round((cw * (meta.height ?? 342)) / (meta.width ?? 245));
    const angle = (rnd() - 0.5) * 30;

    const posed = await sharp(cardBuf)
      .resize(cw, ch)
      .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const pm = await sharp(posed).metadata();
    const pw = pm.width!;
    const ph = pm.height!;
    const left = Math.round(rnd() * Math.max(1, W - pw * 0.8) - pw * 0.1);
    const top = Math.round(rnd() * Math.max(1, H - ph * 0.8) - ph * 0.1);

    // 15% negatives: background only, empty mask — the detector must be able
    // to say "no card here".
    const hasCard = rnd() > 0.15;

    const bg = await makeBackground(rnd);
    const image = hasCard
      ? await sharp(bg).composite([{ input: posed, left, top }]).toBuffer()
      : bg;

    await sharp(image)
      .modulate({ brightness: 0.7 + rnd() * 0.6, saturation: 0.8 + rnd() * 0.4 })
      .blur(rnd() < 0.35 ? 0.6 + rnd() * 1.2 : 0.3)
      .jpeg({ quality: 70 + Math.floor(rnd() * 25) })
      .toFile(join(OUT, "images", `${String(i).padStart(5, "0")}.jpg`));

    // Mask = the card's alpha silhouette in the same pose.
    let mask: Buffer;
    if (hasCard) {
      const alpha = await sharp(posed).ensureAlpha().extractChannel(3).png().toBuffer();
      mask = await sharp({
        create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .composite([{ input: alpha, left, top }])
        .png()
        .toBuffer();
    } else {
      mask = await sharp({
        create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();
    }
    await sharp(mask)
      .grayscale()
      .toFile(join(OUT, "masks", `${String(i).padStart(5, "0")}.png`));

    if ((i + 1) % 100 === 0) process.stdout.write(`\r  ${i + 1}/${total}   `);
  }

  process.stdout.write("\n");
  console.log(`Done. ${total} image/mask pairs -> ${OUT}`);
  console.log("Train: python training/train_seg.py");
}

main().catch((err) => {
  console.error("gen-seg-data failed:", err);
  process.exit(1);
});
