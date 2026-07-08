"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScanResult } from "@/lib/analyze";
import type { Candidate, MarketData } from "@/lib/pricing/types";
import {
  buildMarket,
  emptyMarket,
  fetchCandidates,
  readCardText,
} from "@/lib/pricing/lookup";
import { updateScanMarket } from "@/lib/storage";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";

type Status = "loading" | "ready" | "error";

/**
 * Market value panel. On first view it OCRs the card, fetches ranked candidate
 * matches and auto-selects the best; the user can pick another candidate or
 * search by name if recognition misses. The selected result is cached onto the
 * stored scan. The search box is always available.
 */
export function MarketValue({
  scan,
  onResolved,
}: {
  scan: ScanResult;
  onResolved?: (m: MarketData) => void;
}) {
  const likelyPsa =
    scan.companyEstimates.find((e) => e.company === "PSA")?.mostLikely ??
    scan.grade.overall;

  const [selected, setSelected] = useState<MarketData | null>(scan.market ?? null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState<Status>(scan.market ? "ready" : "loading");
  const [query, setQuery] = useState(scan.market?.query.name ?? "");
  const [numberQuery, setNumberQuery] = useState(scan.market?.query.number ?? "");

  // Surface the resolved market (identity/type/price) to the parent page.
  useEffect(() => {
    if (selected) onResolved?.(selected);
  }, [selected, onResolved]);

  const choose = useCallback(
    async (
      q: { name: string | null; number: string | null },
      cand: Candidate | null
    ) => {
      const market = cand ? buildMarket(q, cand, likelyPsa) : emptyMarket(q);
      setSelected(market);
      setStatus("ready");
      await updateScanMarket(scan.id, market);
    },
    [scan.id, likelyPsa]
  );

  // Auto-identify on first view.
  useEffect(() => {
    if (scan.market) return;
    let alive = true;
    (async () => {
      try {
        const { name, number } = await readCardText(scan.front.rectifiedDataUrl);
        if (!alive) return;
        if (name) setQuery(name);
        if (number) setNumberQuery(number);
        const list = name ? await fetchCandidates(name, number) : [];
        if (!alive) return;
        setCandidates(list);
        await choose({ name, number }, list[0] ?? null);
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.id]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = query.trim();
    if (name.length < 2) return;
    const number = numberQuery.trim() || null;
    setStatus("loading");
    try {
      const list = await fetchCandidates(name, number);
      setCandidates(list);
      await choose({ name, number }, list[0] ?? null);
    } catch {
      setStatus("error");
    }
  };

  const card = selected?.card;
  const others = candidates.filter((c) => c.id !== selectedIdOf(selected, candidates));

  return (
    <section>
      <h2 className="mb-4 text-xl font-bold tracking-tight">Market value</h2>
      <GlassCard className="p-6">
        {status === "loading" ? (
          <div className="flex items-center gap-3 py-6 text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            Identifying card &amp; fetching prices…
          </div>
        ) : (
          <>
            {status === "error" && (
              <p className="mb-4 text-sm text-rose-400">
                Couldn&apos;t reach the price service. Search by name below to retry.
              </p>
            )}

            {status === "ready" && selected && card && (
              <div className="flex flex-col gap-6 sm:flex-row">
                {card.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="w-28 shrink-0 self-center rounded-xl shadow-lg sm:self-start"
                  />
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{card.name}</span>
                    {card.rarity && <Badge tone="accent">{card.rarity}</Badge>}
                    {card.subtypes?.map((s) => (
                      <Badge key={s} tone="good">
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-0.5 text-sm text-muted">
                    {[card.supertype, card.setName].filter(Boolean).join(" · ")}
                    {card.number && ` · #${card.number}`}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {selected.raw ? (
                      <PriceTile
                        label="Raw (market)"
                        amount={selected.raw.amount}
                        currency={selected.raw.currency}
                        highlight
                      />
                    ) : (
                      <PriceTile label="Raw (market)" amount={null} currency="USD" highlight />
                    )}
                    {selected.graded.map((g) => (
                      <PriceTile
                        key={g.label}
                        label={g.label}
                        amount={g.amount}
                        currency={g.currency}
                      />
                    ))}
                  </div>

                  <p className="mt-4 text-xs text-muted">
                    {selected.raw
                      ? `Raw price via ${selected.source ?? "market data"}. `
                      : "No market price listed for this card. "}
                    Graded values are <strong>rough estimates</strong> projected from the raw
                    price and the predicted grade — not real graded sales.
                  </p>
                  {card.tcgUrl && (
                    <a
                      href={card.tcgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-semibold text-[var(--accent)]"
                    >
                      View listings ↗
                    </a>
                  )}
                </div>
              </div>
            )}

            {status === "ready" && selected && !card && (
              <p className="text-sm text-muted">
                Couldn&apos;t identify this card automatically
                {selected.query.name ? ` (read: “${selected.query.name}”)` : ""}. Search by
                name below.
              </p>
            )}

            {/* Alternatives */}
            {others.length > 0 && (
              <div className="mt-5 border-t border-[var(--card-border)] pt-4">
                <div className="mb-2 text-xs font-semibold text-muted">
                  Not the right card? Pick a match:
                </div>
                <div className="flex flex-col gap-1.5">
                  {others.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => choose(selected?.query ?? { name: query, number: null }, c)}
                      className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-[var(--card-border)]/40"
                    >
                      {c.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.imageUrl} alt="" className="h-10 w-auto rounded shadow" />
                      )}
                      <span className="flex-1">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted">
                          {" "}
                          · {c.setName} #{c.number}
                        </span>
                      </span>
                      {c.raw && (
                        <span className="font-mono text-xs text-muted">
                          {formatMoney(c.raw.amount, c.raw.currency)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search — always available */}
            <form
              onSubmit={runSearch}
              className="mt-5 border-t border-[var(--card-border)] pt-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Card name (e.g. Charizard)"
                  className="flex-1 rounded-xl border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
                <input
                  value={numberQuery}
                  onChange={(e) => setNumberQuery(e.target.value)}
                  placeholder="No. (e.g. 3)"
                  inputMode="numeric"
                  className="rounded-xl border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)] sm:w-28"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  disabled={query.trim().length < 2}
                >
                  Search
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Tip: the collector number (e.g. 3/102) is on the card&apos;s bottom-left —
                adding it finds the exact card.
              </p>
            </form>
          </>
        )}
      </GlassCard>
    </section>
  );
}

/** The candidate id currently shown, matched back from the selected card. */
function selectedIdOf(selected: MarketData | null, candidates: Candidate[]): string | null {
  if (!selected?.card) return null;
  const match = candidates.find(
    (c) => c.name === selected.card!.name && c.number === selected.card!.number
  );
  return match?.id ?? null;
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
    <div className={`rounded-2xl p-4 text-center ${highlight ? "bg-[var(--accent)]/10" : "glass"}`}>
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
