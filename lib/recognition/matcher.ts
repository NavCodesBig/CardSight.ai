/**
 * Hybrid card matcher — Road B brick #3 (the decision core).
 *
 * Turns a CLIP art embedding + whatever OCR read off the card into a single
 * best catalog match. CLIP alone is only a shortlister: full-card and even
 * art-cropped embeddings sit in a narrow cosine band across the ~20k-card
 * catalog, so the nearest vector is often the right *art* but the wrong print.
 * The OCR name/number, matched against the shortlist's catalog rows, is what
 * decides between look-alikes and separates reprints (1999 Base Set vs 2016
 * Evolutions Chansey).
 *
 * This module is pure and deployment-agnostic: it takes an already-computed
 * query embedding, so it runs identically whether CLIP executes in the browser
 * (onnxruntime-web) or behind an API route (onnxruntime-node). See
 * scripts/build-embedding-index.ts for the index it consumes.
 */

/** Flat vector index: `vectors` is N×dim, L2-normalized, row i is `ids[i]`. */
export interface EmbeddingIndex {
  dim: number;
  ids: string[];
  vectors: Float32Array; // length ids.length * dim
}

/** The catalog identity the matcher re-ranks with and returns. */
export interface CatalogEntry {
  id: string;
  name: string;
  number: string;
  setName: string | null;
  releaseDate: string | null; // "YYYY/MM/DD"
  rarity: string | null;
}

export interface MatchResult {
  entry: CatalogEntry;
  /** Cosine of the art embeddings (0..1 for normalized non-negative-ish). */
  artScore: number;
  /** OCR name/number agreement with this entry (0..1); 0 when no OCR text. */
  textScore: number;
  /** Combined ranking score. */
  score: number;
  /** What drove the decision. */
  method: "art+text" | "art";
}

const DEFAULT_K = 25;

/**
 * Match a query embedding (and optional OCR text) to the best catalog card.
 * Returns null only when the index is empty or dimensions disagree.
 */
export function matchCard(opts: {
  queryEmbedding: Float32Array;
  ocr?: { name?: string | null; number?: string | null };
  index: EmbeddingIndex;
  /** Catalog lookup by card id (e.g. a Map built from cards.ndjson). */
  catalog: (id: string) => CatalogEntry | undefined;
  k?: number;
}): MatchResult | null {
  const { queryEmbedding, index, catalog } = opts;
  const { dim, ids, vectors } = index;
  if (ids.length === 0 || queryEmbedding.length !== dim) return null;

  const k = Math.min(opts.k ?? DEFAULT_K, ids.length);
  const q = normalized(queryEmbedding);

  // Cosine shortlist (vectors are pre-normalized, so cosine = dot product).
  const scored: { i: number; art: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    let dot = 0;
    const off = i * dim;
    for (let j = 0; j < dim; j++) dot += q[j] * vectors[off + j];
    scored.push({ i, art: dot });
  }
  scored.sort((a, b) => b.art - a.art);
  const shortlist = scored.slice(0, k);

  const name = clean(opts.ocr?.name);
  const number = normNumber(opts.ocr?.number ?? null);
  const hasText = !!name || !!number;

  let best: MatchResult | null = null;
  for (const { i, art } of shortlist) {
    const entry = catalog(ids[i]);
    if (!entry) continue;

    const textScore = hasText ? textAgreement(entry, name, number) : 0;
    // Art dominates the shortlist ranking; text is the tie-breaker that
    // promotes the correct print when OCR gives a usable signal. Weights sum
    // past 1 so a strong text agreement can overturn a marginally better art
    // score (exactly the reprint / look-alike case).
    const score = art * 0.6 + textScore * 0.6;
    if (!best || score > best.score) {
      best = {
        entry,
        artScore: round(art),
        textScore: round(textScore),
        score: round(score),
        method: hasText && textScore > 0 ? "art+text" : "art",
      };
    }
  }
  return best;
}

/** OCR-vs-entry agreement in 0..1: name similarity plus an exact-number bonus. */
function textAgreement(entry: CatalogEntry, name: string | null, number: string | null): number {
  let s = 0;
  if (name) s += 0.6 * stringSimilarity(name, entry.name);
  if (number && normNumber(entry.number) === number) s += 0.4;
  return Math.min(1, s);
}

/** Normalized Levenshtein similarity (0..1) on lowercased alphanumerics. */
export function stringSimilarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const d = levenshtein(x, y);
  return 1 - d / Math.max(x.length, y.length);
}

/**
 * Card's own collector-number token: fraction numerator ("4/102" → "4"),
 * set-prefixed code kept ("SV49", "TG12/TG30" → "tg12"), lowercased. Mirrors
 * the normalization in app/api/price/route.ts so OCR and catalog compare alike.
 */
function normNumber(raw: string | null): string | null {
  if (!raw) return null;
  const left = raw.trim().split("/")[0];
  const token = left.replace(/[^A-Za-z0-9]/g, "");
  if (!token) return null;
  return /^[A-Za-z]/.test(token)
    ? token.toLowerCase()
    : token.replace(/^0+(?=\d)/, "").toLowerCase();
}

function clean(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t.length >= 2 ? t : null;
}

function normalized(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Iterative Levenshtein distance (small strings). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}
