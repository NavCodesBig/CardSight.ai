import { NextResponse } from "next/server";

/**
 * Card price proxy.
 *
 * Fronts the Pokémon TCG API (api.pokemontcg.io) so the API key stays
 * server-side and responses can be edge-cached. Returns a ranked list of
 * candidate cards (identity + raw market price) for a name and optional
 * collector number; the client picks or lets the user choose. Graded values
 * are estimated client-side, not here.
 */

const API = "https://api.pokemontcg.io/v2/cards";
const MAX_RESULTS = 12;

const VARIANT_PRIORITY = [
  "holofoil",
  "reverseHolofoil",
  "1stEditionHolofoil",
  "unlimitedHolofoil",
  "normal",
  "1stEdition",
];

interface TcgCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  supertype?: string;
  subtypes?: string[];
  set?: { name?: string; releaseDate?: string };
  images?: { small?: string; large?: string };
  tcgplayer?: { url?: string; prices?: Record<string, { market?: number | null }> };
  cardmarket?: { prices?: { trendPrice?: number; averageSellPrice?: number } };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();
  const number = searchParams.get("number")?.trim() || null;

  if (!name || name.length < 2) {
    return NextResponse.json({ results: [], error: "name required" }, { status: 400 });
  }

  // Word-AND the name so "charizard ex" matches, wildcarding each token.
  const nameQuery = name
    .replace(/[^A-Za-z0-9 '.\-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `name:"${w}*"`)
    .join(" ");
  // The API stores a card's own number ("4"), never the printed fraction
  // ("4/102"). Normalize to that token so both the query and the rank compare
  // hit — otherwise "4/102" → "4102" would match nothing.
  const cleanNumber = normalizeCollectorNumber(number);
  const q = cleanNumber ? `${nameQuery} number:${cleanNumber}` : nameQuery;

  const headers: Record<string, string> = {};
  if (process.env.POKEMON_TCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;

  const cards = await search(q, headers);
  if (cards === null) {
    return NextResponse.json({ results: [], error: "upstream" }, { status: 502 });
  }

  // If a numbered query returned nothing, retry on name alone so the user
  // still gets candidates to choose from.
  const pool =
    cards.length === 0 && cleanNumber ? (await search(nameQuery, headers)) ?? [] : cards;

  const results = rank(pool, cleanNumber ?? null).slice(0, MAX_RESULTS).map(toCandidate);

  return NextResponse.json(
    { results },
    {
      status: 200,
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    }
  );
}

async function search(q: string, headers: Record<string, string>): Promise<TcgCard[] | null> {
  try {
    const res = await fetch(
      `${API}?q=${encodeURIComponent(q)}&pageSize=50&orderBy=-set.releaseDate`,
      { headers, signal: AbortSignal.timeout(9000) }
    );
    if (!res.ok) return null;
    return ((await res.json()) as { data?: TcgCard[] }).data ?? [];
  } catch {
    return null;
  }
}

/**
 * Extract a card's own collector-number token for matching. Printed numbers
 * come as fractions ("4/102"), set-prefixed codes ("SV49", "TG12/TG30",
 * "H31/H32"), or bare numbers; the API stores just the left token ("4", "SV49",
 * "TG12", "H31"). Returns lowercase for case-insensitive compare, or null.
 */
function normalizeCollectorNumber(raw: string | null): string | null {
  if (!raw) return null;
  const left = raw.trim().split("/")[0]; // drop the "/total" denominator
  const token = left.replace(/[^A-Za-z0-9]/g, "");
  if (!token) return null;
  // A leading letter code ("SV", "TG", "H") keeps its digits; a bare fraction
  // numerator drops any leading zeros ("004" → "4") to match the API form.
  return /^[A-Za-z]/.test(token)
    ? token.toLowerCase()
    : token.replace(/^0+(?=\d)/, "").toLowerCase();
}

/** Rank: exact number match first, then priced cards, then most recent. */
function rank(cards: TcgCard[], number: string | null): TcgCard[] {
  return [...cards].sort((a, b) => {
    if (number) {
      const am = normalizeCollectorNumber(a.number) === number ? 1 : 0;
      const bm = normalizeCollectorNumber(b.number) === number ? 1 : 0;
      if (am !== bm) return bm - am;
    }
    const ap = pickPrice(a) ? 1 : 0;
    const bp = pickPrice(b) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.set?.releaseDate ?? "").localeCompare(a.set?.releaseDate ?? "");
  });
}

function toCandidate(card: TcgCard) {
  return {
    id: card.id,
    name: card.name,
    setName: card.set?.name ?? "",
    number: card.number,
    rarity: card.rarity ?? null,
    supertype: card.supertype ?? null,
    subtypes: card.subtypes ?? [],
    imageUrl: card.images?.large ?? card.images?.small ?? null,
    tcgUrl: card.tcgplayer?.url ?? null,
    raw: pickPrice(card),
  };
}

/** Extract the best available market price from a card, USD (TCGplayer) first. */
function pickPrice(
  card: TcgCard
): { amount: number; currency: string; source: string } | null {
  const tp = card.tcgplayer?.prices;
  if (tp) {
    const key =
      VARIANT_PRIORITY.find((k) => tp[k]?.market != null) ??
      Object.keys(tp).find((k) => tp[k]?.market != null);
    const market = key ? tp[key].market : null;
    if (market != null) return { amount: market, currency: "USD", source: "TCGplayer" };
  }
  const cm = card.cardmarket?.prices;
  const eur = cm?.trendPrice ?? cm?.averageSellPrice;
  if (eur != null) return { amount: eur, currency: "EUR", source: "Cardmarket" };
  return null;
}
