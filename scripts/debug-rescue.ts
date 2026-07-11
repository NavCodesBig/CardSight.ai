/** One-off: print full-bleed rescue gate values for an image. */
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
import { detectCard } from "../lib/vision/cardDetector";
import { boxBlur, gradientMagnitude, toGray } from "../lib/vision/imageOps";
import type { Quad } from "../lib/vision/types";

async function loadImage(p: string): Promise<ImageData> {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = new NodeImageData(info.width, info.height) as unknown as ImageData;
  img.data.set(data);
  return img;
}

function ring(grad: { data: Float32Array; width: number; height: number }, q: Quad, in0: number, in1: number): number {
  const xs = [q.tl.x, q.tr.x, q.br.x, q.bl.x];
  const ys = [q.tl.y, q.tr.y, q.br.y, q.bl.y];
  const x0 = Math.max(0, Math.min(...xs));
  const x1 = Math.min(grad.width - 1, Math.max(...xs));
  const y0 = Math.max(0, Math.min(...ys));
  const y1 = Math.min(grad.height - 1, Math.max(...ys));
  const bw = x1 - x0, bh = y1 - y0;
  let sum = 0, n = 0;
  const s = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= grad.width || yi >= grad.height) return;
    sum += grad.data[yi * grad.width + xi]; n++;
  };
  for (const f of [in0, (in0 + in1) / 2, in1]) {
    const dx = bw * f, dy = bh * f;
    for (let t = 0.1; t <= 0.9; t += 0.05) {
      s(x0 + bw * t, y0 + dy); s(x0 + bw * t, y1 - dy);
      s(x0 + dx, y0 + bh * t); s(x1 - dx, y0 + bh * t);
    }
  }
  return n ? sum / n : 0;
}

async function main() {
  for (const p of process.argv.slice(2)) {
    const img = await loadImage(p);
    const { width: w, height: h } = img;
    const grad = gradientMagnitude(boxBlur(toGray(img)));
    const sample: number[] = [];
    for (let i = 0; i < grad.data.length; i += 17) sample.push(grad.data[i]);
    sample.sort((a, b) => a - b);
    const thr = Math.max(40, sample[Math.floor(sample.length * 0.92)]);
    const det = detectCard(img);
    const xs = [det.quad.tl.x, det.quad.tr.x, det.quad.br.x, det.quad.bl.x];
    const ys = [det.quad.tl.y, det.quad.tr.y, det.quad.br.y, det.quad.bl.y];
    const coverage = ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / (w * h);
    const frameQuad: Quad = { tl: { x: 1, y: 1 }, tr: { x: w - 2, y: 1 }, br: { x: w - 2, y: h - 2 }, bl: { x: 1, y: h - 2 } };
    // Outside activity: mean gradient of pixels outside the detected quad bbox
    // (inset image border 3px, exclude 6px around the quad boundary).
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    let osum = 0, on = 0;
    for (let y = 3; y < h - 3; y += 3) {
      for (let x = 3; x < w - 3; x += 3) {
        const inside = x > bx0 - 6 && x < bx1 + 6 && y > by0 - 6 && y < by1 + 6;
        if (inside) continue;
        osum += grad.data[y * w + x]; on++;
      }
    }
    const outside = on ? osum / on : 0;
    // Side support: mean gradient along each detected side.
    const sides: [string, { x: number; y: number }, { x: number; y: number }][] = [
      ["top", det.quad.tl, det.quad.tr],
      ["right", det.quad.tr, det.quad.br],
      ["bottom", det.quad.br, det.quad.bl],
      ["left", det.quad.bl, det.quad.tl],
    ];
    const support = sides.map(([name, a, b]) => {
      let s = 0, n = 0;
      for (let t = 0.08; t <= 0.92; t += 0.04) {
        const x = Math.round(a.x + (b.x - a.x) * t);
        const y = Math.round(a.y + (b.y - a.y) * t);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        s += grad.data[y * w + x]; n++;
      }
      return `${name}=${(n ? s / n : 0).toFixed(0)}`;
    });
    console.log(
      `${p.split(/[\\/]/).pop()}: aspect=${(w / h).toFixed(3)} conf=${det.confidence.toFixed(2)} coverage=${coverage.toFixed(2)} thr=${thr.toFixed(0)} detRing=${ring(grad, det.quad, 0.05, 0.09).toFixed(1)} frameRing=${ring(grad, frameQuad, 0.02, 0.045).toFixed(1)} outside=${outside.toFixed(1)} support[${support.join(" ")}]`
    );
  }
}
main();
