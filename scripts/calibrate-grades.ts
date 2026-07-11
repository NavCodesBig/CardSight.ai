/**
 * Grade calibration harness — predicted grade vs professionally graded truth.
 *
 * Feed it photos of cards whose real grade is known (e.g. shots of PSA/BGS/CGC
 * slabs' cards, or raws graded later) and it reports how the pipeline's
 * predictions track reality: mean absolute error, bias (systematically high or
 * low), and the worst misses per subgrade-limiting factor. This is the data
 * that justifies (or corrects) the centering soft-cap and the subgrade
 * thresholds.
 *
 * Inputs: datasets/calibration/labels.json —
 *   [{ "front": "card1-front.jpg", "back": "card1-back.jpg",
 *      "grade": 8, "company": "PSA", "note": "optional" }]
 * Photos are relative to datasets/calibration/. All gitignored except README.
 *
 *   npx tsx scripts/calibrate-grades.ts
 *
 * Runs the shipping pipeline headless (detection → rectify → 3-pass analyze →
 * computeGrade), skipping only the display data-URL step, which needs a canvas.
 */

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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { detectCardOriented, rectifyCard } from "../lib/vision/cardDetector";
import { assessQuality } from "../lib/vision/quality";
import { quadCoverage } from "../lib/vision/cardDetector";
import { measureCentering } from "../lib/vision/centering";
import { analyzeCorners } from "../lib/vision/corners";
import { analyzeEdges } from "../lib/vision/edges";
import { analyzeSurface } from "../lib/vision/surface";
import { computeGrade } from "../lib/grading/calculator";
import type { FaceAnalysis } from "../lib/vision/types";

const CAL = join(process.cwd(), "datasets", "calibration");

interface CalCase {
  front: string;
  back: string;
  grade: number;
  company?: string;
  note?: string;
}

async function loadImageData(path: string): Promise<ImageData> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new NodeImageData(
    new Uint8ClampedArray(data),
    info.width,
    info.height
  ) as unknown as ImageData;
}

/** Single-pass face analysis (no jitter consensus — calibration wants the
 *  central estimate; consensus noise is measured separately by passSpread). */
function analyzeFace(img: ImageData): FaceAnalysis {
  const { image, detection } = detectCardOriented(img);
  const rect = rectifyCard(image, detection.quad);
  return {
    rectifiedDataUrl: "",
    rectifiedWidth: rect.width,
    rectifiedHeight: rect.height,
    quality: assessQuality(image, quadCoverage(image, detection.quad)),
    centering: measureCentering(rect),
    corners: analyzeCorners(rect),
    edges: analyzeEdges(rect),
    surface: analyzeSurface(rect),
    mmPerPx: 0.1,
  };
}

async function main() {
  let cases: CalCase[];
  try {
    cases = JSON.parse(await readFile(join(CAL, "labels.json"), "utf8")) as CalCase[];
  } catch {
    console.log(`No ${join(CAL, "labels.json")} yet.

To calibrate, collect photos of cards with KNOWN professional grades
(slabbed cards work: photograph front and back through the case, or use
pre-grading photos of cards that later came back graded) and write:

  datasets/calibration/labels.json
  [{ "front": "card1-front.jpg", "back": "card1-back.jpg", "grade": 8, "company": "PSA" }]

Then re-run: npx tsx scripts/calibrate-grades.ts

Aim for 20+ cases spread across the grade ladder (2-10); heavy on 7-9s
where submission decisions actually happen.`);
    return;
  }

  const rows: { truth: number; pred: number; low: number; high: number; limit: string; file: string }[] = [];
  for (const c of cases) {
    const front = analyzeFace(await loadImageData(join(CAL, c.front)));
    const back = analyzeFace(await loadImageData(join(CAL, c.back)));
    const g = computeGrade(front, back);
    rows.push({
      truth: c.grade,
      pred: g.overall,
      low: g.range.low,
      high: g.range.high,
      limit: g.limitingFactor,
      file: c.front,
    });
    const err = g.overall - c.grade;
    console.log(
      `${c.front}: truth ${c.grade} → pred ${g.overall} (${err >= 0 ? "+" : ""}${err.toFixed(1)}) range ${g.range.low}-${g.range.high} limited-by ${g.limitingFactor}`
    );
  }

  const n = rows.length;
  if (!n) return;
  const mae = rows.reduce((s, r) => s + Math.abs(r.pred - r.truth), 0) / n;
  const bias = rows.reduce((s, r) => s + (r.pred - r.truth), 0) / n;
  const inRange = rows.filter((r) => r.truth >= r.low && r.truth <= r.high).length;
  const within1 = rows.filter((r) => Math.abs(r.pred - r.truth) <= 1).length;

  console.log(`\nCases: ${n}`);
  console.log(`MAE: ${mae.toFixed(2)} grade points`);
  console.log(`Bias: ${bias >= 0 ? "+" : ""}${bias.toFixed(2)} (positive = pipeline grades high)`);
  console.log(`Within ±1: ${within1}/${n} (${Math.round((within1 / n) * 100)}%)`);
  console.log(`Truth inside reported range: ${inRange}/${n} (${Math.round((inRange / n) * 100)}%)`);

  // Bias per limiting factor — points at which threshold to move.
  const byLimit = new Map<string, number[]>();
  for (const r of rows) {
    byLimit.set(r.limit, [...(byLimit.get(r.limit) ?? []), r.pred - r.truth]);
  }
  console.log("\nBias by limiting factor:");
  for (const [k, v] of byLimit) {
    const b = v.reduce((s, x) => s + x, 0) / v.length;
    console.log(`  ${k}: ${b >= 0 ? "+" : ""}${b.toFixed(2)} over ${v.length} case(s)`);
  }
}

main().catch((err) => {
  console.error("calibrate-grades failed:", err);
  process.exit(1);
});
