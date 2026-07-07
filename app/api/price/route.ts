import { NextResponse } from "next/server";

/**
 * Card price proxy.
 *
 * Fronts the Pokémon TCG API (api.pokemontcg.io) so the API key stays
 * server-side and responses can be edge-cached. Given a card name (and
 * optional collector number) it returns a normalized identity + raw market
 * price. Graded values are estimated client-side, not here.
 */

const API = "https://api.pokemontcg.io/v2/cards";

const VARIANT_PRIORITY = [
  "holofoil",
  "reverseHolofoil",
  "1stEditionHolofoil",
  "unlimitedHolofoil",
  "normal",
  "1stEdition",
];

interface TcgCard {
  name: string;
  number: string;
  rarity?: string;
  set?: { name?: string };
  images?: { small?: string; large?: string };
  tcgplayer?: { url?: string; prices?: Record<string, { market?: number | null }> };
  cardmarket?: { prices?: { trendPrice?: number; averageSellPrice?: number } };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();
  const number = searchParams.get("number")?.trim();

  if (!name || name.length < 2) {
    return NextResponse.json({ identified: false, error: "name required" }, { status: 400 });
  }

  const parts = [`name:"${name.replace(/"/g, "")}*"`];
  if (number) parts.push(`number:${number.replace(/[^A-Za-z0-9]/g, "")}`);
  const q = parts.join(" ");

  const headers: Record<string, string> = {};
  if (process.env.POKEMON_TCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;

  let cards: TcgCard[];
  try {
    const res = await fetch(
      `${API}?q=${encodeURIComponent(q)}&pageSize=12&orderBy=-set.releaseDate`,
      { headers, signal: AbortSignal.timeout(9000) }
    );
    if (!res.ok) {
      return NextResponse.json({ identified: false, error: "upstream" }, { status: 502 });
    }
    cards = ((await res.json()) as { data?: TcgCard[] }).data ?? [];
  } catch {
    return NextResponse.json({ identified: false, error: "upstream" }, { status: 502 });
  }

  // Prefer a card that actually has price data, exact number match first.
  const priced = cards.filter(pickPrice);
  const chosen =
    (number && priced.find((c) => c.number === number)) ??
    priced[0] ??
    cards[0] ??
    null;

  if (!chosen) {
    return NextResponse.json({ identified: false }, { status: 200 });
  }

  const price = pickPrice(chosen);
  return NextResponse.json(
    {
      identified: true,
      card: {
        name: chosen.name,
        setName: chosen.set?.name ?? "",
        number: chosen.number,
        rarity: chosen.rarity ?? null,
        imageUrl: chosen.images?.large ?? chosen.images?.small ?? null,
        tcgUrl: chosen.tcgplayer?.url ?? null,
      },
      raw: price,
      source: price?.source ?? null,
    },
    {
      status: 200,
      // Prices move slowly; let the CDN cache identical lookups for a day.
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    }
  );
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
