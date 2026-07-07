"use client";

import { useState } from "react";
import type { FaceAnalysis } from "@/lib/vision/types";

/**
 * Damage visualization: rectified card image with a toggleable surface
 * heatmap, defect boxes, and corner/edge wear markers.
 */
export function DamageMap({ face, title }: { face: FaceAnalysis; title: string }) {
  const [showHeat, setShowHeat] = useState(true);
  const [showDefects, setShowDefects] = useState(true);
  const s = face.surface;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <div className="flex gap-1.5 text-xs">
          <Toggle on={showHeat} onClick={() => setShowHeat(!showHeat)}>heatmap</Toggle>
          <Toggle on={showDefects} onClick={() => setShowDefects(!showDefects)}>defects</Toggle>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={face.rectifiedDataUrl} alt={title} className="block w-full" />

        {showHeat && (
          <div
            className="absolute inset-0 grid mix-blend-screen"
            style={{
              gridTemplateRows: `repeat(${s.heatmapRows}, 1fr)`,
              gridTemplateColumns: `repeat(${s.heatmapCols}, 1fr)`,
            }}
          >
            {s.heatmap.flatMap((row, ry) =>
              row.map((v, cx) => (
                <div
                  key={`${ry}-${cx}`}
                  style={{
                    background:
                      v > 0.02
                        ? `radial-gradient(circle, rgba(255,${Math.round(200 - v * 180)},60,${Math.min(0.85, v * 1.15)}) 0%, transparent 75%)`
                        : undefined,
                  }}
                />
              ))
            )}
          </div>
        )}

        {showDefects &&
          s.defects.map((d, i) => (
            <div
              key={i}
              title={`${d.type} (severity ${(d.severity * 100).toFixed(0)}%)`}
              className="absolute rounded border-2"
              style={{
                left: `${d.x * 100}%`,
                top: `${d.y * 100}%`,
                width: `${d.w * 100}%`,
                height: `${Math.max(d.h * 100, 0.8)}%`,
                borderColor: d.type === "print-line" ? "#38d6ff" : "#ff5cb4",
              }}
            />
          ))}

        {/* Corner wear markers */}
        {face.corners.filter((c) => c.damaged).map((c) => {
          const pos = {
            topLeft: "left-1 top-1",
            topRight: "right-1 top-1",
            bottomRight: "bottom-1 right-1",
            bottomLeft: "bottom-1 left-1",
          }[c.corner];
          return (
            <span
              key={c.corner}
              title={`${c.corner}: ${c.issues.join(", ")}`}
              className={`absolute ${pos} grid h-8 w-8 place-items-center rounded-full border-2 border-amber-400 bg-amber-400/25 text-xs font-bold text-amber-300`}
            >
              !
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#ff5cb4]" />scratch / mark</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#38d6ff]" />print line</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />corner wear</span>
        <span className="ml-auto font-mono">
          density {(s.defectDensity * 100).toFixed(1)}% · gloss {Math.round(s.glossConsistency * 100)}%
        </span>
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1 font-medium transition-colors ${
        on ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "glass text-muted"
      }`}
    >
      {children}
    </button>
  );
}
