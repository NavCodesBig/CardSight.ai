"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listScans, type ScanSummary } from "@/lib/storage";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";

/**
 * Compact horizontal strip of previously scanned cards with their scores.
 * Renders nothing while loading or when there is no history yet.
 */
export function PreviousScans({
  title = "Previous scans",
  limit = 12,
}: {
  title?: string;
  limit?: number;
}) {
  const [scans, setScans] = useState<ScanSummary[]>([]);

  useEffect(() => {
    listScans().then((s) => setScans(s.slice(0, limit)));
  }, [limit]);

  if (scans.length === 0) return null;

  return (
    <section className="animate-float-up">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          View all →
        </Link>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex w-max gap-3">
          {scans.map((s) => (
            <Link key={s.id} href={`/results/${s.id}`} className="group">
              <GlassCard className="w-32 p-3 transition-transform group-hover:-translate-y-1">
                <div className="relative aspect-[63.5/88.9] overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.thumbDataUrl}
                    alt={s.label}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                  {s.favorite && (
                    <span className="absolute right-1 top-1 text-xs drop-shadow">★</span>
                  )}
                  <span className="absolute bottom-1 left-1">
                    <Badge tone={s.overall >= 9 ? "good" : s.overall >= 7 ? "warn" : "bad"}>
                      {s.overall.toFixed(1)}
                    </Badge>
                  </span>
                </div>
                <div className="mt-2 truncate text-[11px] font-medium">{s.label}</div>
                <div className="text-[10px] text-muted">
                  {new Date(s.createdAt).toLocaleDateString()}
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
