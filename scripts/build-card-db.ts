/**
 * Build the reference card database — Road B brick #1.
 *
 * Pages the entire Pokémon TCG API card catalog and writes a local index the
 * recognizer will match against: given a rectified card photo, embed it and
 * find the nearest reference card by art, then read its authoritative identity
 * (name, set, release date, number, rarity) from here. Matching on the printed
 * art also disambiguates reprints that OCR/heuristics cannot — e.g. the 1999
 * Base Set Chansey vs the identical-art 2016 Evolutions reprint — which is the
 * "wrong year" failure competitors hit.
 *
 * Output (NDJSON, one card per line) is not shipped to the client and is too
 * large to commit; it is regenerated on demand:
 *
 *   POKEMON_TCG_API_KEY=... npx tsx scripts/build-card-db.ts
 *
 * The API key is optional (raises the rate limit); without one the build still
 * completes, just slower.
 */

import { mkdir, writeFile, open } from "node:fs/promises";
import { join } from "node:path";

const API = "https://api.pokemontcg.io/v2/cards";
const PAGE_SIZE = 250; // API maximum
// Only the fields the recognizer and the identity display need — keeps the
// index small and the transfer fast.
const SELECT =
  "id,name,number,rarity,supertype,subtypes,nationalPokedexNumbers,set,images";
const OUT_DIR = join(process.cwd(), "datasets", "cardref");
const OUT_FILE = join(OUT_DIR, "cards.ndjson");
const META_FILE = join(OUT_DIR, "meta.json");

interface ApiCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  supertype?: string;
  subtypes?: string[];
  nationalPokedexNumbers?: number[];
  set?: { id?: string; name?: string; series?: string; releaseDate?: string };
  images?: { small?: string; large?: string };
}

/** One reference row: identity plus the art image URL to embed. */
interface RefCard {
  id: string;
  name: string;
  number: string;
  rarity: string | null;
  supertype: string | null;
  subtypes: string[];
  dex: number[];
  setId: string | null;
  setName: string | null;
  series: string | null;
  releaseDate: string | null; // "YYYY/MM/DD"
  imageSmall: string | null;
  imageLarge: string | null;
}

function toRef(c: ApiCard): RefCard {
  return {
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity ?? null,
    supertype: c.supertype ?? null,
    subtypes: c.subtypes ?? [],
    dex: c.nationalPokedexNumbers ?? [],
    setId: c.set?.id ?? null,
    setName: c.set?.name ?? null,
    series: c.set?.series ?? null,
    releaseDate: c.set?.releaseDate ?? null,
    imageSmall: c.images?.small ?? null,
    imageLarge: c.images?.large ?? null,
  };
}

async function fetchPage(page: number, headers: Record<string, string>): Promise<{
  data: ApiCard[];
  totalCount: number;
}> {
  const url = `${API}?page=${page}&pageSize=${PAGE_SIZE}&orderBy=id&select=${SELECT}`;
  // Retry transient failures with linear backoff.
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (res.status === 429) {
        // Rate limited — wait longer and retry.
        await sleep(attempt * 5000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { data: ApiCard[]; totalCount: number };
    } catch (err) {
      lastErr = err;
      await sleep(attempt * 2000);
    }
  }
  throw new Error(`page ${page} failed after retries: ${String(lastErr)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const headers: Record<string, string> = {};
  const key = process.env.POKEMON_TCG_API_KEY;
  if (key) headers["X-Api-Key"] = key;
  else console.warn("No POKEMON_TCG_API_KEY set — building at the lower anonymous rate limit.");

  await mkdir(OUT_DIR, { recursive: true });
  const fh = await open(OUT_FILE, "w");

  // Optional cap for partial/test builds (e.g. CARDDB_MAX_PAGES=2).
  const maxPages = Number(process.env.CARDDB_MAX_PAGES) || Infinity;

  let page = 1;
  let written = 0;
  let totalCount = Infinity;
  const start = Date.now();

  try {
    while ((page - 1) * PAGE_SIZE < totalCount && page <= maxPages) {
      const { data, totalCount: tc } = await fetchPage(page, headers);
      totalCount = tc;
      if (data.length === 0) break;
      const lines = data.map((c) => JSON.stringify(toRef(c))).join("\n") + "\n";
      await fh.write(lines);
      written += data.length;
      const pct = Math.min(100, Math.round((written / totalCount) * 100));
      process.stdout.write(`\r  page ${page} — ${written}/${totalCount} cards (${pct}%)   `);
      page++;
      if (!key) await sleep(1500); // be gentle without a key
    }
  } finally {
    await fh.close();
  }

  const meta = {
    builtAt: new Date().toISOString(),
    count: written,
    source: API,
    fields: SELECT.split(","),
    tookMs: Date.now() - start,
  };
  await writeFile(META_FILE, JSON.stringify(meta, null, 2));
  process.stdout.write("\n");
  console.log(`Done. ${written} cards -> ${OUT_FILE}`);
  console.log(`Meta -> ${META_FILE}`);
}

main().catch((err) => {
  console.error("\nbuild-card-db failed:", err);
  process.exit(1);
});
