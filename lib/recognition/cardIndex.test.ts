import { describe, it, expect } from "vitest";
import { parseIndex, catalogLookup, recognize } from "./cardIndex";
import type { CatalogEntry, EmbeddingIndex } from "./matcher";

const ENTRIES: CatalogEntry[] = [
  { id: "base-A", name: "Chansey", number: "3", setName: "Base Set", releaseDate: "1999/01/09", rarity: "Rare Holo", subtypes: ["Basic"] },
  { id: "evo-A", name: "Chansey", number: "2", setName: "Evolutions", releaseDate: "2016/11/02", rarity: "Rare Holo", subtypes: ["Basic"] },
];
const INDEX: EmbeddingIndex = {
  dim: 4,
  ids: ["base-A", "evo-A"],
  vectors: new Float32Array([1, 0, 0, 0, 0.99, 0.14, 0, 0]),
};

describe("parseIndex", () => {
  it("wraps the buffer when the float count matches ids×dim", () => {
    const buf = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0]).buffer;
    const idx = parseIndex(buf, { dim: 4, model: "x", art: { x0: 0, y0: 0, x1: 1, y1: 1 }, ids: ["a", "b"] });
    expect(idx.ids).toEqual(["a", "b"]);
    expect(idx.vectors.length).toBe(8);
  });

  it("throws on a size mismatch (guards a truncated/wrong index)", () => {
    const buf = new Float32Array([1, 0, 0]).buffer;
    expect(() => parseIndex(buf, { dim: 4, model: "x", art: { x0: 0, y0: 0, x1: 1, y1: 1 }, ids: ["a"] })).toThrow();
  });
});

describe("recognize", () => {
  const catalog = catalogLookup(ENTRIES);

  it("maps the matched reprint into CardInfo with the right set and year", () => {
    const info = recognize({
      embedding: new Float32Array([1, 0, 0, 0]), // art nearest base-A
      ocr: { name: "Chansey", number: "2" }, // ...but OCR number is Evolutions
      index: INDEX,
      catalog,
    })!;
    expect(info.name).toBe("Chansey");
    expect(info.set).toBe("Evolutions");
    expect(info.number).toBe("2");
    expect(info.eraGuess).toBe("2016 · Evolutions");
    expect(info.game).toBe("pokemon");
    expect(info.confidence).toBeGreaterThan(0);
    expect(info.confidence).toBeLessThanOrEqual(1);
  });

  it("returns null when the index is empty (caller falls back to heuristic)", () => {
    const info = recognize({
      embedding: new Float32Array([1, 0, 0, 0]),
      index: { dim: 4, ids: [], vectors: new Float32Array() },
      catalog,
    });
    expect(info).toBeNull();
  });
});
