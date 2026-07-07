"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteScan, listScans, type ScanSummary } from "@/lib/storage";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";

export default function DashboardPage() {
  const [scans, setScans] = useState<ScanSummary[] | null>(null);

  useEffect(() => {
    listScans().then(setScans);
  }, []);

  if (scans === null) {
    return <p className="pt-20 text-center text-muted">Loading…</p>;
  }

  const avg =
    scans.length > 0
      ? (scans.reduce((s, x) => s + x.overall, 0) / scans.length).toFixed(1)
      : "—";
  const best = scans.length > 0 ? Math.max(...scans.map((s) => s.overall)) : null;
  const gems = scans.filter((s) => s.overall >= 9.5).length;
  const favorites = scans.filter((s) => s.favorite);

  const stats = [
    { label: "Total scans", value: String(scans.length) },
    { label: "Average grade", value: String(avg) },
    { label: "Highest grade", value: best !== null ? best.toFixed(1) : "—" },
    { label: "Gem candidates", value: String(gems) },
  ];

  return (
    <div className="animate-float-up space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            Your <span className="text-gradient">collection</span>
          </h1>
          <p className="mt-2 text-muted">Scan history, favorites and grading stats.</p>
        </div>
        <Link
          href="/scan"
          className="rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-6 py-3 font-semibold text-white shadow-lg transition-transform hover:scale-[1.03]"
        >
          + New scan
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <GlassCard key={s.label} className="p-5 text-center">
            <div className="font-mono text-3xl font-bold text-gradient">{s.value}</div>
            <div className="mt-1 text-xs text-muted">{s.label}</div>
          </GlassCard>
        ))}
      </div>

      {favorites.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold tracking-tight">★ Favorites</h2>
          <ScanGrid scans={favorites} onDelete={remove} />
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-bold tracking-tight">Recent scans</h2>
        {scans.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <div className="text-4xl">🃏</div>
            <p className="mt-4 font-semibold">No scans yet</p>
            <p className="mt-1 text-sm text-muted">
              Grade your first card — it takes about fifteen seconds.
            </p>
            <Link
              href="/scan"
              className="mt-6 inline-block rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-6 py-3 font-semibold text-white"
            >
              Scan a card
            </Link>
          </GlassCard>
        ) : (
          <ScanGrid scans={scans} onDelete={remove} />
        )}
      </section>
    </div>
  );

  function remove(id: string) {
    if (!window.confirm("Delete this scan? This can't be undone.")) return;
    deleteScan(id).then(() => listScans().then(setScans));
  }
}

function ScanGrid({
  scans,
  onDelete,
}: {
  scans: ScanSummary[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {scans.map((s) => (
        <GlassCard key={s.id} className="group relative overflow-hidden transition-transform hover:-translate-y-1">
          <Link href={`/results/${s.id}`} className="block p-4">
            <div className="relative mx-auto aspect-[63.5/88.9] w-full max-w-[130px] overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.thumbDataUrl}
                alt={s.label}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              {s.favorite && (
                <span className="absolute right-1 top-1 text-sm drop-shadow">★</span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Badge tone={s.overall >= 9 ? "good" : s.overall >= 7 ? "warn" : "bad"}>
                {s.overall.toFixed(1)}
              </Badge>
              <span className="truncate pl-2 text-xs text-muted">{s.label}</span>
            </div>
            <div className="mt-1 text-[10px] text-muted">
              {new Date(s.createdAt).toLocaleDateString()} ·{" "}
              {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </Link>
          <button
            onClick={() => onDelete(s.id)}
            aria-label="Delete scan"
            className="absolute right-2 top-2 hidden h-8 w-8 place-items-center rounded-full bg-black/50 text-xs text-white group-hover:grid pointer-coarse:grid"
          >
            ✕
          </button>
        </GlassCard>
      ))}
    </div>
  );
}
