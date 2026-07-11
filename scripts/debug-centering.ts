/**
 * Centering debug harness on real images. Mirrors the browser flow: seed a
 * quad like CornerAdjust does (auto-detect, else near-full-frame inset),
 * refine it like the pipeline does, rectify, then dump per-side border finds
 * and the rectified edge color profile to pinpoint measurement misfires.
 * Run: npx tsx scripts/debug-centering.ts <image> [image...]
 */

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

import sharp from "sharp";
import { detectCard, refineQuad, rectifyCard } from "../lib/vision/cardDetector";
import { measureCentering } from "../lib/vision/centering";
import { analyzeEdges } from "../lib/vision/edges";
import type { Quad } from "../lib/vision/types";

async function loadImage(p: string): Promise<ImageData> {
  const { data, info } = await sharp(p)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const img = new NodeImageData(info.width, info.height) as unknown as ImageData;
  img.data.set(data);
  return img;
}

function fmtQuad(q: Quad): string {
  const f = (n: number) => n.toFixed(0);
  return `tl(${f(q.tl.x)},${f(q.tl.y)}) tr(${f(q.tr.x)},${f(q.tr.y)}) br(${f(q.br.x)},${f(q.br.y)}) bl(${f(q.bl.x)},${f(q.bl.y)})`;
}

/** Mean RGB at a given depth from one side of the rectified card. */
function edgeColor(rect: ImageData, side: "left" | "right", depth: number): string {
  const { width: w, height: h } = rect;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.floor(h * 0.2); y < h * 0.8; y += 8) {
    const x = side === "left" ? depth : w - 1 - depth;
    const i = (y * w + x) * 4;
    r += rect.data[i]; g += rect.data[i + 1]; b += rect.data[i + 2]; n++;
  }
  return `(${(r / n).toFixed(0)},${(g / n).toFixed(0)},${(b / n).toFixed(0)})`;
}

async function main() {
  for (const p of process.argv.slice(2)) {
    console.log(`\n=== ${p}`);
    const img = await loadImage(p);
    console.log(`image ${img.width}x${img.height}`);

    // CornerAdjust seed: auto-detect, else 2% inset default.
    const det = detectCard(img);
    console.log(`detect conf=${det.confidence.toFixed(2)} quad=${fmtQuad(det.quad)}`);
    const seed: Quad =
      det.confidence >= 0.5
        ? det.quad
        : {
            tl: { x: img.width * 0.02, y: img.height * 0.02 },
            tr: { x: img.width * 0.98, y: img.height * 0.02 },
            br: { x: img.width * 0.98, y: img.height * 0.98 },
            bl: { x: img.width * 0.02, y: img.height * 0.98 },
          };

    const refined = refineQuad(img, seed);
    console.log(`refined snapped=${refined.snappedSides} quad=${fmtQuad(refined.quad)}`);

    const rect = rectifyCard(img, refined.quad);
    for (const d of [0, 2, 4, 6, 10, 20, 40, 60, 90]) {
      console.log(
        `  depth ${String(d).padStart(2)}: L${edgeColor(rect, "left", d)} R${edgeColor(rect, "right", d)}`
      );
    }

    const c = measureCentering(rect);
    console.log(
      `centering L=${c.leftPx}px(${c.leftMm}mm) R=${c.rightPx}px(${c.rightMm}mm) T=${c.topPx}px B=${c.bottomPx}px → ${c.horizontalRatio} H ${c.verticalRatio} V score=${c.score}`
    );
    const edges = analyzeEdges(rect);
    for (const e of edges) {
      console.log(
        `edge ${e.edge.padEnd(6)} whitening=${e.whitening} nicks=${e.nickCount} score=${e.score} issues=[${e.issues.join("; ")}]`
      );
    }
  }
}

main();
