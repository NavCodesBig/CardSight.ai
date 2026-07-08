import { describe, it, expect } from "vitest";
import { ransacLine } from "./imageOps";

describe("ransacLine", () => {
  it("recovers a line despite background-clutter outliers", () => {
    // True line y = 2x + 5, plus a third of the points as scattered outliers.
    const pts = [];
    for (let x = 0; x <= 30; x++) pts.push({ x, y: 2 * x + 5 });
    for (let x = 0; x <= 15; x++) pts.push({ x, y: 2 * x + 5 + 80 + x }); // outliers

    const line = ransacLine(pts, false)!;
    expect(line.a).toBeCloseTo(2, 1);
    expect(line.b).toBeCloseTo(5, 0);
  });

  it("is deterministic for identical input", () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 3 * i + 1 }));
    const a = ransacLine(pts, false)!;
    const b = ransacLine(pts, false)!;
    expect(a).toEqual(b);
  });
});
