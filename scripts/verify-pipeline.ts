/**
 * Pipeline verification against a synthetic card with known ground truth.
 * Run: npx tsx scripts/verify-pipeline.ts
 */

// Minimal ImageData polyfill for Node.
class NodeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}
(globalThis as Record<string, unknown>).ImageData = NodeImageData;

import { detectCard, rectifyCard } from "../lib/vision/cardDetector";
import { measureCentering } from "../lib/vision/centering";
import { analyzeCorners } from "../lib/vision/corners";
import { analyzeEdges } from "../lib/vision/edges";
import { analyzeSurface } from "../lib/vision/surface";

// ---- Build synthetic scene ----
const W = 1000, H = 1200;
const img = new NodeImageData(W, H) as unknown as ImageData;

// Card geometry (ground truth)
const CARD_X = 200, CARD_Y = 150, CARD_W = 560, CARD_H = 784;
// Inner frame border widths on the card, in card pixels:
const BL = 30, BR = 50, BT = 40, BB = 40; // truth: L/R = 37.5%/62.5%, T/B = 50/50

function put(x: number, y: number, r: number, g: number, b: number) {
  const i = (y * W + x) * 4;
  img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const inCard =
      x >= CARD_X && x < CARD_X + CARD_W && y >= CARD_Y && y < CARD_Y + CARD_H;
    if (!inCard) {
      put(x, y, 38, 40, 44); // dark matte background
      continue;
    }
    const cx = x - CARD_X, cy = y - CARD_Y;
    const inInner =
      cx >= BL && cx < CARD_W - BR && cy >= BT && cy < CARD_H - BB;
    if (inInner) {
      // art region: dark blue with mild texture
      const n = ((x * 31 + y * 17) % 13) - 6;
      put(x, y, 30 + n, 60 + n, 140 + n);
    } else {
      put(x, y, 228, 198, 64); // yellow border
    }
  }
}

// Whitening on bottom-right corner (triangle ~26px)
for (let dy = 0; dy < 26; dy++) {
  for (let dx = 0; dx < 26; dx++) {
    if (dx + dy > 20) {
      put(CARD_X + CARD_W - 1 - dx, CARD_Y + CARD_H - 1 - dy, 245, 244, 240);
    }
  }
}

// ---- Run pipeline ----
let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`);
  if (!ok) failures++;
}

const det = detectCard(img);
const q = det.quad;
check(
  "detection: corners within 6px of truth",
  Math.abs(q.tl.x - CARD_X) < 6 &&
    Math.abs(q.tl.y - CARD_Y) < 6 &&
    Math.abs(q.br.x - (CARD_X + CARD_W)) < 6 &&
    Math.abs(q.br.y - (CARD_Y + CARD_H)) < 6,
  `tl=(${q.tl.x.toFixed(1)},${q.tl.y.toFixed(1)}) br=(${q.br.x.toFixed(1)},${q.br.y.toFixed(1)}) conf=${det.confidence.toFixed(2)}`
);
check("detection: confidence > 0.6", det.confidence > 0.6, `conf=${det.confidence.toFixed(2)}`);

const rect = rectifyCard(img, det.quad);
const c = measureCentering(rect);
// Truth: left 37.5%, right 62.5% (BL=30, BR=50), top/bottom 50/50.
check(
  "centering: horizontal ≈ 37.5/62.5",
  Math.abs(c.leftPct - 37.5) < 4,
  `L=${c.leftPct}% R=${c.rightPct}%`
);
check(
  "centering: vertical ≈ 50/50",
  Math.abs(c.topPct - 50) < 4,
  `T=${c.topPct}% B=${c.bottomPct}%`
);
// mm truth: card 560px wide = 63.5mm → left border 30px = 3.40mm
check(
  "measurement: left border ≈ 3.40 mm",
  Math.abs(c.leftMm - 3.4) < 0.35,
  `left=${c.leftMm}mm right=${c.rightMm}mm`
);

const corners = analyzeCorners(rect);
const br2 = corners.find((k) => k.corner === "bottomRight")!;
const tl2 = corners.find((k) => k.corner === "topLeft")!;
check(
  "corners: whitened bottom-right detected",
  br2.whitening > tl2.whitening + 0.02 && br2.issues.length > 0,
  `br whitening=${br2.whitening} tl=${tl2.whitening} issues=[${br2.issues}]`
);
check("corners: clean top-left scores ≥ 9", tl2.score >= 9, `score=${tl2.score}`);

const edges = analyzeEdges(rect);
check(
  "edges: all clean, scores ≥ 8.5",
  edges.every((e) => e.score >= 8.5),
  edges.map((e) => `${e.edge}=${e.score}`).join(" ")
);

const surface = analyzeSurface(rect);
check(
  "surface: near-clean synthetic card scores ≥ 8",
  surface.score >= 8,
  `score=${surface.score} density=${surface.defectDensity}`
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
