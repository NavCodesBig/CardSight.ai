import { describe, it, expect } from "vitest";
import {
  matchCard,
  stringSimilarity,
  type CatalogEntry,
  type EmbeddingIndex,
} from "./matcher";

// Three catalog cards. base-A and evo-A are reprints: near-identical art
// (adjacent vectors), same name "Chansey", different set + number.
const CATALOG: Record<string, CatalogEntry> = {
  "base-A": { id: "base-A", name: "Chansey", number: "3", setName: "Base Set", releaseDate: "1999/01/09", rarity: "Rare Holo" },
  "evo-A": { id: "evo-A", name: "Chansey", number: "2", setName: "Evolutions", releaseDate: "2016/11/02", rarity: "Rare Holo" },
  other: { id: "other", name: "Blastoise", number: "2", setName: "Base Set", releaseDate: "1999/01/09", rarity: "Rare Holo" },
};
const lookup = (id: string) => CATALOG[id];

const INDEX: EmbeddingIndex = {
  dim: 4,
  ids: ["base-A", "evo-A", "other"],
  // rows, L2-normalized-ish; base-A and evo-A are close, other is orthogonal.
  vectors: new Float32Array([1, 0, 0, 0, 0.99, 0.14, 0, 0, 0, 1, 0, 0]),
};

describe("matchCard", () => {
  it("returns the nearest art card when there is no OCR text", () => {
    const q = new Float32Array([1, 0, 0, 0]); // closest to base-A
    const m = matchCard({ queryEmbedding: q, index: INDEX, catalog: lookup })!;
    expect(m.entry.id).toBe("base-A");
    expect(m.method).toBe("art");
  });

  it("uses OCR number to pick the correct reprint over the nearer art match", () => {
    // Art is (marginally) nearest to base-A, but the real card is the 2016
    // Evolutions print — OCR reads its number. Text must flip the decision.
    const q = new Float32Array([1, 0, 0, 0]);
    const m = matchCard({
      queryEmbedding: q,
      ocr: { name: "Chansey", number: "2" },
      index: INDEX,
      catalog: lookup,
    })!;
    expect(m.entry.id).toBe("evo-A");
    expect(m.entry.setName).toBe("Evolutions");
    expect(m.method).toBe("art+text");
  });

  it("tolerates the printed fraction form of the number (2/108)", () => {
    const q = new Float32Array([1, 0, 0, 0]);
    const m = matchCard({
      queryEmbedding: q,
      ocr: { name: "Chansey", number: "2/108" },
      index: INDEX,
      catalog: lookup,
    })!;
    expect(m.entry.id).toBe("evo-A");
  });

  it("does not confuse a different Pokémon that shares a number", () => {
    const q = new Float32Array([1, 0, 0, 0]); // art nowhere near 'other'
    const m = matchCard({
      queryEmbedding: q,
      ocr: { name: "Chansey", number: "2" },
      index: INDEX,
      catalog: lookup,
    })!;
    expect(m.entry.name).toBe("Chansey");
  });

  it("returns null on an empty index or dimension mismatch", () => {
    expect(matchCard({ queryEmbedding: new Float32Array([1, 0, 0, 0]), index: { dim: 4, ids: [], vectors: new Float32Array() }, catalog: lookup })).toBeNull();
    expect(matchCard({ queryEmbedding: new Float32Array([1, 0]), index: INDEX, catalog: lookup })).toBeNull();
  });
});

describe("stringSimilarity", () => {
  it("is 1 for identical, high for near-miss OCR, low for unrelated", () => {
    expect(stringSimilarity("Chansey", "Chansey")).toBe(1);
    expect(stringSimilarity("Chansei", "Chansey")).toBeGreaterThan(0.8);
    expect(stringSimilarity("Chansey", "Blastoise")).toBeLessThan(0.4);
  });
});
