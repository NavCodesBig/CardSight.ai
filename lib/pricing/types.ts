/**
 * Market-value types.
 *
 * Raw prices are real market data fetched from the Pokémon TCG API (TCGplayer /
 * Cardmarket). Graded prices are *estimates* derived from the raw price and our
 * predicted grade — no free API exposes real PSA/BGS sale prices, so anything
 * with `estimated: true` must be presented as a rough projection, not a quote.
 */

export interface PriceBreakdown {
  label: string; // e.g. "Market (raw)", "PSA 10", "PSA 9"
  amount: number | null;
  currency: string; // ISO code, e.g. "USD" | "EUR"
  estimated: boolean;
}

export interface IdentifiedCard {
  name: string;
  setName: string;
  number: string;
  rarity: string | null;
  imageUrl: string | null;
  tcgUrl: string | null;
}

/** A single search hit: identity plus its raw market price, if any. */
export interface Candidate extends IdentifiedCard {
  id: string;
  raw: { amount: number; currency: string; source: string } | null;
}

export interface MarketData {
  identified: boolean;
  query: { name: string | null; number: string | null };
  card: IdentifiedCard | null;
  raw: PriceBreakdown | null; // real market price
  graded: PriceBreakdown[]; // estimated graded values
  source: string | null; // "TCGplayer" | "Cardmarket"
  fetchedAt: string; // ISO
}
