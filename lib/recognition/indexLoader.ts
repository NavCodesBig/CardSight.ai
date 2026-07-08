/**
 * Static index loader — Road B brick #3 (client side).
 *
 * Fetches the prebuilt art-embedding index and its catalog from /cardref
 * (place the outputs of scripts/build-embedding-index.ts under public/cardref),
 * parses them once, and caches the result for the session. Returns null on any
 * failure — index not deployed yet, network error, size mismatch — so the
 * recognizer can fall back to the heuristic identifier without throwing.
 */

import { parseIndex, catalogLookup, type IndexMeta } from "./cardIndex";
import type { CatalogEntry, EmbeddingIndex } from "./matcher";
import type { ArtWindow } from "./embed";

export interface LoadedIndex {
  index: EmbeddingIndex;
  catalog: (id: string) => CatalogEntry | undefined;
  art: ArtWindow;
}

const BASE = "/cardref";

let cache: Promise<LoadedIndex | null> | null = null;

/** Load (and cache) the recognizer index, or null if it isn't available. */
export function loadCardIndex(): Promise<LoadedIndex | null> {
  if (!cache) cache = fetchAll();
  return cache;
}

async function fetchAll(): Promise<LoadedIndex | null> {
  try {
    const [metaRes, vecRes, catRes] = await Promise.all([
      fetch(`${BASE}/embeddings.ids.json`),
      fetch(`${BASE}/embeddings.f32`),
      fetch(`${BASE}/catalog.json`),
    ]);
    if (!metaRes.ok || !vecRes.ok || !catRes.ok) return null;

    const meta = (await metaRes.json()) as IndexMeta;
    const buf = await vecRes.arrayBuffer();
    const entries = (await catRes.json()) as CatalogEntry[];

    const index = parseIndex(buf, meta);
    return { index, catalog: catalogLookup(entries), art: meta.art };
  } catch {
    // Reset so a later call can retry after the index is deployed.
    cache = null;
    return null;
  }
}
