"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScanResult } from "@/lib/analyze";
import type { MarketData } from "@/lib/pricing/types";
import { lookupMarket, searchMarket } from "@/lib/pricing/lookup";
import { updateScanMarket } from "@/lib/storage";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";

type Status = "loading" | "ready" | "error";

/**
 * Market value panel. On first view it OCRs the card and fetches the raw market
 * price, then projects estimated graded values; the result is cached onto the
 * stored scan. A manual search covers cards OCR can't read.
 */
export function MarketValue({ scan }: { scan: ScanResult }) {
  const likelyPsa =
    scan.companyEstimates.find((e) => e.company === "PSA")?.mostLikely ??
    scan.grade.overall;

  const [market, setMarket] = useState<MarketData | null>(scan.market ?? null);
  const [status, setStatus] = useState<Status>(scan.market ? "ready" : "loading");
  const [query, setQuery] = useState("");

  const persist = useCallback(
    async (m: MarketData) => {
      setMarket(m);
      setStatus("ready");
      await updateScanMarket(scan.id, m);
    },
    [scan.id]
  );

  useEffect(() => {
    if (scan.market) return; // already looked up
    let alive = true;
    setStatus("loading");
    lookupMarket(scan.front.rectifiedDataUrl, likelyPsa)
      .then((m) => {
        if (alive) persist(m);
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.id]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setStatus("loading");
    try {
      await persist(await searchMarket(query, likelyPsa));
    } catch {
      setStatus("error");
    }
  };

  return (
    <section>
      <h2 className="mb-4 text-xl font-bold tracking-tight">Market value</h2>
      <GlassCard className="p-6">
        {status === "loading" && (
          <div className="flex items-center gap-3 py-6 text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            Identifying card &amp; fetching prices…
          </div>
        )}

        {status === "error" && (
          <p className="py-4 text-sm text-rose-400">
            Couldn&apos;t reach the price service. Try a manual search below.
          </p>
        )}

        {status === "ready" && market && (
          <>
            {market.identified && market.card ? (
              <div className="flex flex-col gap-6 sm:flex-row">
                {market.card.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={market.card.imageUrl}
                    alt={market.card.name}
                    className="w-28 shrink-0 self-center rounded-xl shadow-lg sm:self-start"
                  />
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{market.card.name}</span>
                    {market.card.rarity && <Badge tone="accent">{market.card.rarity}</Badge>}
                  </div>
                  <div className="mt-0.5 text-sm text-muted">
                    {market.card.setName}
                    {market.card.number && ` · #${market.card.number}`}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {market.raw && (
                      <PriceTile
                        label="Raw (market)"
                        amount={market.raw.amount}
                        currency={market.raw.currency}
                        highlight
                      />
                    )}
                    {market.graded.map((g) => (
                      <PriceTile
                        key={g.label}
                        label={g.label}
                        amount={g.amount}
                        currency={g.currency}
                      />
                    ))}
                  </div>

                  <p className="mt-4 text-xs text-muted">
                    Raw price via {market.source ?? "market data"}. Graded values are{" "}
                    <strong>rough estimates</strong> projected from the raw price and the
                    predicted grade — not real graded sales.
                  </p>
                  {market.card.tcgUrl && (
                    <a
                      href={market.card.tcgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-semibold text-[var(--accent)]"
                    >
                      View listings ↗
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Couldn&apos;t identify this card automatically
                {market.query.name ? ` (read: “${market.query.name}”)` : ""}. Search by name
                below.
              </p>
            )}

            <form onSubmit={runSearch} className="mt-5 flex gap-2 border-t border-[var(--card-border)] pt-4">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={market.identified ? "Wrong card? Search by name" : "e.g. Charizard"}
                className="flex-1 rounded-xl border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                disabled={query.trim().length < 2}
              >
                Search
              </button>
            </form>
          </>
        )}
      </GlassCard>
    </section>
  );
}

function PriceTile({
  label,
  amount,
  currency,
  highlight,
}: {
  label: string;
  amount: number | null;
  currency: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 text-center ${
        highlight ? "bg-[var(--accent)]/10" : "glass"
      }`}
    >
      <div className="font-mono text-xl font-bold">
        {amount == null ? "—" : formatMoney(amount, currency)}
      </div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
