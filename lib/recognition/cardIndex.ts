/**
 * Recognizer glue — Road B brick #3 wiring (environment-neutral).
 *
 * Parses the static art-embedding index (built by
 * scripts/build-embedding-index.ts), runs the hybrid matcher, and maps the
 * result into the `CardInfo` the rest of the app already consumes. Everything
 * here is pure given its inputs, so it is unit-tested in Node and reused
 * unchanged in the browser; the browser only supplies the CLIP embedding and
 * fetches the index bytes (see embed.ts / the identifier wiring).
 */

import { matchCard, type CatalogEntry, type EmbeddingIndex } from "./matcher";
import type { CardInfo } from "./identifier";

/** Sidecar written next to embeddings.f32 (embeddings.ids.json). */
export interface IndexMeta {
  dim: number;
  model: string;
  art: { x0: number; y0: number; x1: number; y1: number };
  ids: string[];
}

/** Build an EmbeddingIndex from the raw index bytes and its meta. */
export function parseIndex(buf: ArrayBuffer, meta: IndexMeta): EmbeddingIndex {
  const vectors = new Float32Array(buf);
  const expected = meta.ids.length * meta.dim;
  if (vectors.length !== expected) {
    throw new Error(`index size mismatch: ${vectors.length} floats, expected ${expected}`);
  }
  return { dim: meta.dim, ids: meta.ids, vectors };
}

/** Index by id for O(1) catalog lookups during re-rank. */
export function catalogLookup(entries: CatalogEntry[]): (id: string) => CatalogEntry | undefined {
  const map = new Map(entries.map((e) => [e.id, e]));
  return (id) => map.get(id);
}

/**
 * Recognize a card from its CLIP art embedding plus whatever OCR read, mapping
 * the best catalog match into CardInfo. Returns null when the index yields no
 * usable match so the caller can fall back to the heuristic identifier.
 */
export function recognize(opts: {
  embedding: Float32Array;
  ocr?: { name?: string | null; number?: string | null };
  index: EmbeddingIndex;
  catalog: (id: string) => CatalogEntry | undefined;
}): CardInfo | null {
  const m = matchCard({
    queryEmbedding: opts.embedding,
    ocr: opts.ocr,
    index: opts.index,
    catalog: opts.catalog,
  });
  if (!m) return null;
  const e = m.entry;
  return {
    game: "pokemon",
    name: e.name,
    set: e.setName,
    number: e.number,
    hp: null,
    rarity: e.rarity,
    language: "EN",
    holoType: "unknown",
    variantTags: e.subtypes ?? [],
    eraGuess: eraFromRelease(e.releaseDate, e.setName),
    confidence: Math.max(0, Math.min(1, m.score)),
  };
}

/** "2016 · Evolutions" from a release date — the reprint/year signal. */
function eraFromRelease(releaseDate: string | null, setName: string | null): string | null {
  const year = releaseDate?.slice(0, 4);
  if (year && setName) return `${year} · ${setName}`;
  if (setName) return setName;
  return year ?? null;
}
