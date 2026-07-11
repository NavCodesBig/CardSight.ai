/**
 * Client-side market lookup: OCR the card, fetch candidates, project graded
 * values for whichever candidate is chosen.
 *
 * The API returns a ranked candidate list; the UI auto-selects the best match
 * but lets the user pick another or search by name when OCR misses.
 */

import { extractCardText } from "../recognition/ocr";
import { estimateGradedValues } from "./gradedEstimate";
import type { Candidate, MarketData } from "./types";

/** OCR the rectified front for a name + collector number. */
export async function readCardText(
  rectifiedDataUrl: string
): Promise<{ name: string | null; number: string | null }> {
  return extractCardText(rectifiedDataUrl);
}

/** Fetch ranked candidate cards for a name (+ optional collector number). */
export async function fetchCandidates(
  name: string,
  number: string | null
): Promise<Candidate[]> {
  const params = new URLSearchParams({ name: name.trim() });
  if (number) params.set("number", number);
  const res = await fetch(`/api/price?${params.toString()}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok && res.status !== 200) throw new Error(`Price lookup failed (${res.status})`);
  const data = (await res.json()) as { results?: Candidate[] };
  return data.results ?? [];
}

/** Build the persisted MarketData for a chosen candidate. */
export function buildMarket(
  query: { name: string | null; number: string | null },
  cand: Candidate,
  likelyPsaGrade: number
): MarketData {
  const raw = cand.raw;
  return {
    identified: true,
    query,
    card: {
      name: cand.name,
      setName: cand.setName,
      number: cand.number,
      rarity: cand.rarity,
      supertype: cand.supertype,
      subtypes: cand.subtypes,
      imageUrl: cand.imageUrl,
      tcgUrl: cand.tcgUrl,
    },
    raw: raw
      ? { label: "Market (raw)", amount: raw.amount, currency: raw.currency, estimated: false }
      : null,
    graded: raw ? estimateGradedValues(raw.amount, raw.currency, likelyPsaGrade) : [],
    source: raw?.source ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export function emptyMarket(query: {
  name: string | null;
  number: string | null;
}): MarketData {
  return {
    identified: false,
    query,
    card: null,
    raw: null,
    graded: [],
    source: null,
    fetchedAt: new Date().toISOString(),
  };
}
