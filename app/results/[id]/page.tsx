"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getScan, toggleFavorite } from "@/lib/storage";
import type { ScanResult } from "@/lib/analyze";
import { gradeLabel, SUBGRADE_WEIGHTS, type SubgradeKey } from "@/lib/grading/scale";
import { GlassCard } from "@/components/ui/GlassCard";
import { GradeRing } from "@/components/ui/GradeRing";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { Badge } from "@/components/ui/Badge";
import { CenteringViz } from "@/components/results/CenteringViz";
import { MeasurementOverlay } from "@/components/results/MeasurementOverlay";
import { DamageMap } from "@/components/results/DamageMap";
import { CompanyEstimates } from "@/components/results/CompanyEstimates";

const SUBGRADE_META: Record<SubgradeKey, { label: string; icon: string }> = {
  centering: { label: "Centering", icon: "🎯" },
  corners: { label: "Corners", icon: "📐" },
  edges: { label: "Edges", icon: "📏" },
  surface: { label: "Surface", icon: "✨" },
};

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<ScanResult | null | undefined>(undefined);
  const [face, setFace] = useState<"front" | "back">("front");
  const [fav, setFav] = useState(false);

  useEffect(() => {
    getScan(id).then((s) => {
      setScan(s);
      setFav(s?.favorite ?? false);
    });
  }, [id]);

  if (scan === undefined) {
    return <p className="pt-20 text-center text-muted">Loading report…</p>;
  }
  if (scan === null) {
    return (
      <div className="pt-20 text-center">
        <p className="text-muted">Scan not found — it may have been cleared from this browser.</p>
        <Link href="/scan" className="mt-4 inline-block font-semibold text-[var(--accent)]">
          Scan a card →
        </Link>
      </div>
    );
  }

  const current = face === "front" ? scan.front : scan.back;
  const label = gradeLabel(scan.grade.overall);

  return (
    <div className="animate-float-up space-y-8">
      {/* Hero */}
      <GlassCard strong className="p-8">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
          <div className="relative w-44 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scan.front.rectifiedDataUrl}
              alt="Card front"
              className="w-full rounded-2xl shadow-2xl"
            />
            <button
              onClick={async () => setFav(await toggleFavorite(scan.id))}
              className="absolute -right-2 -top-2 grid h-9 w-9 place-items-center rounded-full glass-strong text-lg"
              aria-label="Toggle favorite"
            >
              {fav ? "★" : "☆"}
            </button>
          </div>

          <div className="flex-1 text-center lg:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <Badge tone="accent">AI pre-grade estimate</Badge>
              {scan.cardInfo.eraGuess && <Badge>{scan.cardInfo.eraGuess}</Badge>}
              {scan.cardInfo.holoType !== "none" && (
                <Badge tone="good">{scan.cardInfo.holoType}</Badge>
              )}
            </div>
            <h1 className="mt-4 text-sm font-semibold uppercase tracking-widest text-muted">
              Overall Grade
            </h1>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-6 gap-y-4 lg:justify-start">
              <GradeRing value={scan.grade.overall} size={150} />
              <div className="text-center sm:text-left">
                <div className="text-2xl font-bold tracking-tight sm:text-3xl">{label.label}</div>
                <div className="mt-1 text-sm text-muted">
                  Limited by {SUBGRADE_META[scan.grade.limitingFactor].label.toLowerCase()}
                </div>
                <div className="mx-auto mt-4 w-52 sm:mx-0">
                  <ConfidenceMeter value={scan.grade.confidence} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Subgrades */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(SUBGRADE_META) as SubgradeKey[]).map((k) => (
            <div key={k} className="glass rounded-2xl p-4 text-center">
              <div className="text-lg">{SUBGRADE_META[k].icon}</div>
              <div className="mt-1 font-mono text-2xl font-bold">
                {scan.grade.subgrades[k].toFixed(1)}
              </div>
              <div className="text-xs text-muted">
                {SUBGRADE_META[k].label} · {Math.round(SUBGRADE_WEIGHTS[k] * 100)}%
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Company estimates */}
      <section>
        <h2 className="mb-4 text-xl font-bold tracking-tight">Professional grade outlook</h2>
        <CompanyEstimates estimates={scan.companyEstimates} />
        <GlassCard className={`mt-4 p-5 ${scan.submission.recommended ? "border-emerald-400/40" : ""}`}>
          <div className="flex items-center gap-2">
            <span>{scan.submission.recommended ? "✅" : "💡"}</span>
            <span className="font-semibold">{scan.submission.headline}</span>
          </div>
          <p className="mt-1.5 text-sm text-muted">{scan.submission.detail}</p>
        </GlassCard>
      </section>

      {/* Face inspector */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Detailed inspection</h2>
          <div className="glass flex rounded-full p-1 text-sm font-medium">
            {(["front", "back"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFace(f)}
                className={`rounded-full px-4 py-1.5 capitalize transition-colors ${
                  face === f ? "bg-[var(--accent)] text-white" : "text-muted"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <GlassCard className="p-6">
            <CenteringViz centering={current.centering} title={`Centering — ${face}`} />
          </GlassCard>
          <GlassCard className="p-6">
            <DamageMap face={current} title={`Damage map — ${face}`} />
          </GlassCard>
        </div>

        <GlassCard className="mt-6 p-6">
          <MeasurementOverlay face={current} title={`Precision measurements — ${face}`} />
        </GlassCard>

        {/* Corner & edge detail */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <GlassCard className="p-6">
            <h3 className="mb-3 text-sm font-semibold">Corners — {face}</h3>
            <div className="space-y-2.5">
              {current.corners.map((c) => (
                <div key={c.corner} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted">
                    {c.corner.replace(/([A-Z])/g, " $1").toLowerCase()}
                  </span>
                  <span className="flex items-center gap-2">
                    {c.issues.length > 0 ? (
                      <Badge tone={c.whitening > 0.3 ? "bad" : "warn"}>{c.issues[0]}</Badge>
                    ) : (
                      <Badge tone="good">clean</Badge>
                    )}
                    <span className="w-8 text-right font-mono font-semibold">{c.score}</span>
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="mb-3 text-sm font-semibold">Edges — {face}</h3>
            <div className="space-y-2.5">
              {current.edges.map((e) => (
                <div key={e.edge} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted">{e.edge}</span>
                  <span className="flex items-center gap-2">
                    {e.issues.length > 0 ? (
                      <Badge tone={e.whitening > 0.25 ? "bad" : "warn"}>{e.issues[0]}</Badge>
                    ) : (
                      <Badge tone="good">clean</Badge>
                    )}
                    <span className="w-8 text-right font-mono font-semibold">{e.score}</span>
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </section>

      {/* Explanations */}
      <section>
        <h2 className="mb-4 text-xl font-bold tracking-tight">Why this grade</h2>
        <div className="space-y-4">
          {scan.explanations.map((ex) => (
            <GlassCard key={ex.category} className="p-6">
              <h3 className="font-semibold capitalize">{ex.title}</h3>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
                {ex.points.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-[var(--accent)]">›</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))}
        </div>
      </section>

      <div className="flex justify-center gap-4 pt-4">
        <Link
          href="/scan"
          className="rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-8 py-3.5 font-semibold text-white shadow-xl transition-transform hover:scale-[1.03]"
        >
          Scan another card
        </Link>
        <Link href="/dashboard" className="glass rounded-2xl px-8 py-3.5 font-semibold">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
