/**
 * Client-side market lookup: OCR the card, price it, project graded values.
 *
 * `lookupMarket` is the automatic path (recognize → price). `searchMarket` is
 * the manual fallback used when OCR misses and the user types a name. Both hit
 * the /api/price proxy and layer on estimated graded values.
 */

import { extractCardText } from "../recognition/ocr";
import { estimateGradedValues } from "./gradedEstimate";
import type { MarketData } from "./types";

interface PriceResponse {
  identified: boolean;
  card?: MarketData["card"];
  raw?: { amount: number; currency: string; source: string } | null;
  source?: string | null;
}

/** Automatic: read the card's name/number from the image, then price it. */
export async function lookupMarket(
  rectifiedDataUrl: string,
  likelyPsaGrade: number
): Promise<MarketData> {
  const { name, number } = await extractCardText(rectifiedDataUrl);
  if (!name) {
    return notIdentified({ name, number });
  }
  return fetchAndBuild(name, number, likelyPsaGrade);
}

/** Manual: price a card by an explicit name (fallback when OCR misses). */
export async function searchMarket(
  name: string,
  likelyPsaGrade: number
): Promise<MarketData> {
  return fetchAndBuild(name.trim(), null, likelyPsaGrade);
}

async function fetchAndBuild(
  name: string,
  number: string | null,
  likelyPsaGrade: number
): Promise<MarketData> {
  const params = new URLSearchParams({ name });
  if (number) params.set("number", number);

  const res = await fetch(`/api/price?${params.toString()}`);
  if (!res.ok) throw new Error(`Price lookup failed (${res.status})`);
  const data = (await res.json()) as PriceResponse;

  if (!data.identified || !data.card || !data.raw) {
    return notIdentified({ name, number });
  }

  const currency = data.raw.currency;
  return {
    identified: true,
    query: { name, number },
    card: data.card,
    raw: { label: "Market (raw)", amount: data.raw.amount, currency, estimated: false },
    graded: estimateGradedValues(data.raw.amount, currency, likelyPsaGrade),
    source: data.source ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

function notIdentified(query: { name: string | null; number: string | null }): MarketData {
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
