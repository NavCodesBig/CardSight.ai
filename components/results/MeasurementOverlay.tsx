"use client";

import { useState } from "react";
import type { FaceAnalysis } from "@/lib/vision/types";
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "@/lib/measurement/calibration";

/**
 * CAD-style measurement view: the rectified card with dimension lines,
 * border-thickness callouts in millimeters, and lossless zoom (SVG overlay
 * scales with the image, so measurements stay pinned while zooming).
 */
export function MeasurementOverlay({ face, title }: { face: FaceAnalysis; title: string }) {
  const [zoom, setZoom] = useState(1);
  const c = face.centering;
  const W = face.rectifiedWidth;
  const H = face.rectifiedHeight;

  const diffH = Math.abs(c.leftMm - c.rightMm).toFixed(2);
  const diffV = Math.abs(c.topMm - c.bottomMm).toFixed(2);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold">{title}</span>
        <label className="flex items-center gap-2 text-xs text-muted">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-28 accent-[var(--accent)]"
          />
          <span className="w-9 font-mono">{zoom.toFixed(2)}×</span>
        </label>
      </div>

      <div className="glass overflow-auto rounded-2xl" style={{ maxHeight: 460 }}>
        <div
          className="relative origin-top-left transition-transform duration-150"
          style={{ transform: `scale(${zoom})`, width: "100%" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={face.rectifiedDataUrl} alt={title} className="block w-full" />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 h-full w-full"
            style={{ fontFamily: "var(--font-geist-mono), monospace" }}
          >
            {/* Border dimension callouts */}
            <DimLine x1={0} y1={H * 0.3} x2={c.leftPx} y2={H * 0.3} label={`${c.leftMm.toFixed(2)}mm`} />
            <DimLine x1={W - c.rightPx} y1={H * 0.3} x2={W} y2={H * 0.3} label={`${c.rightMm.toFixed(2)}mm`} anchor="end" />
            <DimLine x1={W * 0.32} y1={0} x2={W * 0.32} y2={c.topPx} label={`${c.topMm.toFixed(2)}mm`} vertical />
            <DimLine x1={W * 0.32} y1={H - c.bottomPx} x2={W * 0.32} y2={H} label={`${c.bottomMm.toFixed(2)}mm`} vertical anchor="end" />

            {/* Inner frame guides */}
            <rect
              x={c.leftPx}
              y={c.topPx}
              width={W - c.leftPx - c.rightPx}
              height={H - c.topPx - c.bottomPx}
              fill="none"
              stroke="#38d6ff"
              strokeWidth={2}
              strokeDasharray="10 8"
              opacity={0.75}
            />

            {/* Full-card dimensions */}
            <DimText x={W / 2} y={H - 14} text={`${CARD_WIDTH_MM.toFixed(1)} mm`} />
            <DimText x={26} y={H / 2} text={`${CARD_HEIGHT_MM.toFixed(1)} mm`} rotate />
          </svg>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
        <div className="glass rounded-xl px-3 py-2">
          <div className="text-muted">L/R borders</div>
          <div>{c.leftMm.toFixed(2)} / {c.rightMm.toFixed(2)} mm · Δ {diffH} mm</div>
        </div>
        <div className="glass rounded-xl px-3 py-2">
          <div className="text-muted">T/B borders</div>
          <div>{c.topMm.toFixed(2)} / {c.bottomMm.toFixed(2)} mm · Δ {diffV} mm</div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Calibrated against the {CARD_WIDTH_MM} × {CARD_HEIGHT_MM} mm card standard
        ({(face.mmPerPx).toFixed(3)} mm/px). Dashed line marks the detected inner frame.
      </p>
    </div>
  );
}

function DimLine({
  x1, y1, x2, y2, label, vertical = false, anchor = "start",
}: {
  x1: number; y1: number; x2: number; y2: number;
  label: string; vertical?: boolean; anchor?: "start" | "end";
}) {
  const tickLen = 12;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return (
    <g stroke="#ff5cb4" strokeWidth={2}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {vertical ? (
        <>
          <line x1={x1 - tickLen} y1={y1} x2={x1 + tickLen} y2={y1} />
          <line x1={x2 - tickLen} y1={y2} x2={x2 + tickLen} y2={y2} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tickLen} x2={x1} y2={y1 + tickLen} />
          <line x1={x2} y1={y2 - tickLen} x2={x2} y2={y2 + tickLen} />
        </>
      )}
      <text
        x={vertical ? midX + 16 : midX}
        y={vertical ? midY + (anchor === "end" ? -10 : 14) : midY - 10}
        fill="#ff5cb4"
        stroke="none"
        fontSize={22}
        fontWeight={700}
        textAnchor="middle"
        paintOrder="stroke"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" }}
      >
        {label}
      </text>
    </g>
  );
}

function DimText({ x, y, text, rotate = false }: { x: number; y: number; text: string; rotate?: boolean }) {
  return (
    <text
      x={x}
      y={y}
      fill="#38d6ff"
      fontSize={24}
      fontWeight={700}
      textAnchor="middle"
      transform={rotate ? `rotate(-90 ${x} ${y})` : undefined}
      style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))" }}
    >
      {text}
    </text>
  );
}
