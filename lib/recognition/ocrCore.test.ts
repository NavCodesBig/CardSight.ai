import { describe, it, expect } from "vitest";
import { preprocessCrop, type PixelData } from "./ocrCore";

/** Build an RGBA image with a per-pixel gray value from `fn`. */
function makeImage(w: number, h: number, fn: (x: number, y: number) => number): PixelData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

describe("preprocessCrop", () => {
  it("upscales ~3× and outputs opaque grayscale", () => {
    const img = makeImage(10, 10, (x) => (x < 5 ? 0 : 255));
    const out = preprocessCrop(img, { x: 0, y: 0, w: 1, h: 1 });
    expect(out.width).toBe(30);
    expect(out.height).toBe(30);
    // grayscale (R=G=B) and fully opaque
    for (let p = 0; p < out.width * out.height; p++) {
      const i = p * 4;
      expect(out.data[i]).toBe(out.data[i + 1]);
      expect(out.data[i + 1]).toBe(out.data[i + 2]);
      expect(out.data[i + 3]).toBe(255);
    }
  });

  it("stretches contrast so dark and light regions reach the extremes", () => {
    const img = makeImage(10, 10, (x) => (x < 5 ? 40 : 210));
    const out = preprocessCrop(img, { x: 0, y: 0, w: 1, h: 1 });
    const left = out.data[(15 * out.width + 3) * 4]; // dark side
    const right = out.data[(15 * out.width + 26) * 4]; // light side
    expect(left).toBeLessThan(20);
    expect(right).toBeGreaterThan(235);
  });

  it("crops to the requested fractional band", () => {
    // Top half black, bottom half white; crop only the bottom band.
    const img = makeImage(20, 20, (_x, y) => (y < 10 ? 0 : 255));
    const out = preprocessCrop(img, { x: 0, y: 0.5, w: 1, h: 0.5 });
    // Whole crop came from the white half → after stretch stays high.
    const mid = out.data[(Math.floor(out.height / 2) * out.width + Math.floor(out.width / 2)) * 4];
    expect(mid).toBeGreaterThan(235);
  });
});
