"use client";

import { STAGE_LABELS, type ProgressStage } from "@/lib/analyze";

const STAGE_ORDER: ProgressStage[] = [
  "loading",
  "detecting",
  "rectifying",
  "quality",
  "centering",
  "corners",
  "edges",
  "surface",
  "recognizing",
  "grading",
];

/** Full-screen processing animation shown while the pipeline runs. */
export function ProcessingOverlay({
  stage,
  pct,
  previewUrl,
}: {
  stage: ProgressStage;
  pct: number;
  previewUrl: string | null;
}) {
  const activeIdx = STAGE_ORDER.indexOf(stage);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-xl">
      <div className="glass-strong w-full max-w-md rounded-3xl p-8">
        <div className="relative mx-auto aspect-[63.5/88.9] w-40 overflow-hidden rounded-2xl border border-[var(--card-border)]">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Card being analyzed" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[var(--card-border)]" />
          )}
          <div className="animate-shimmer absolute inset-0" />
          <div className="animate-scanline absolute inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-[var(--accent-2)] to-transparent shadow-[0_0_12px_var(--accent-2)]" />
        </div>

        <div className="mt-6 text-center">
          <div className="font-mono text-3xl font-bold">{Math.round(pct)}%</div>
          <div className="mt-1 text-sm text-muted">{STAGE_LABELS[stage]}…</div>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--card-border)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <ol className="mt-6 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {STAGE_ORDER.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-1.5 ${
                i < activeIdx
                  ? "text-emerald-400"
                  : i === activeIdx
                    ? "font-medium text-foreground"
                    : "text-muted/60"
              }`}
            >
              <span className="w-3 text-center">
                {i < activeIdx ? "✓" : i === activeIdx ? "•" : "·"}
              </span>
              {STAGE_LABELS[s]}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
