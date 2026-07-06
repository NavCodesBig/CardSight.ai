import type { CenteringMeasurement } from "@/lib/vision/types";

/** Schematic centering diagram: outer card edge vs inner frame, with
 *  per-side percentages and millimeter readouts. */
export function CenteringViz({
  centering,
  title,
}: {
  centering: CenteringMeasurement;
  title: string;
}) {
  const c = centering;
  // Exaggerate offsets ×3 so small drift is visible in the schematic.
  const exH = 3, pad = 14;
  const innerLeft = pad + (c.leftPct - 50) * 0.3 * exH;
  const innerRight = pad + (c.rightPct - 50) * 0.3 * exH;
  const innerTop = pad + (c.topPct - 50) * 0.3 * exH;
  const innerBottom = pad + (c.bottomPct - 50) * 0.3 * exH;

  const ok = Math.max(c.leftPct, c.rightPct, c.topPct, c.bottomPct) <= 55;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <span className={`font-mono text-xs ${ok ? "text-emerald-400" : "text-amber-400"}`}>
          {c.horizontalRatio} H · {c.verticalRatio} V
        </span>
      </div>

      {/* my-8 / horizontal room keep the absolutely-positioned mm readouts
          from clipping outside the card on narrow screens */}
      <div className="relative mx-auto my-8 aspect-[63.5/88.9] w-[min(200px,calc(100%-6.5rem))] sm:w-[min(240px,calc(100%-7rem))]">
        <svg viewBox="0 0 120 168" className="h-full w-full">
          <rect x="1" y="1" width="118" height="166" rx="7" fill="none"
            stroke="var(--muted)" strokeWidth="1.5" opacity="0.6" />
          <rect
            x={innerLeft}
            y={innerTop}
            width={120 - innerLeft - innerRight}
            height={168 - innerTop - innerBottom}
            rx="3"
            fill="var(--accent)"
            opacity="0.12"
            stroke="var(--accent)"
            strokeWidth="1.5"
          />
          {/* center crosshair */}
          <line x1="60" y1="78" x2="60" y2="90" stroke="var(--muted)" strokeWidth="0.75" opacity="0.5" />
          <line x1="54" y1="84" x2="66" y2="84" stroke="var(--muted)" strokeWidth="0.75" opacity="0.5" />
        </svg>

        <Readout side="left" pct={c.leftPct} mm={c.leftMm} />
        <Readout side="right" pct={c.rightPct} mm={c.rightMm} />
        <Readout side="top" pct={c.topPct} mm={c.topMm} />
        <Readout side="bottom" pct={c.bottomPct} mm={c.bottomMm} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-center font-mono text-xs">
        <div className="glass rounded-xl px-2 py-1.5">
          L {c.leftPct}% · R {c.rightPct}%
        </div>
        <div className="glass rounded-xl px-2 py-1.5">
          T {c.topPct}% · B {c.bottomPct}%
        </div>
      </div>
    </div>
  );
}

function Readout({ side, pct, mm }: { side: "left" | "right" | "top" | "bottom"; pct: number; mm: number }) {
  const pos = {
    left: "left-0 top-1/2 -translate-x-[110%] -translate-y-1/2 text-right",
    right: "right-0 top-1/2 translate-x-[110%] -translate-y-1/2",
    top: "top-0 left-1/2 -translate-x-1/2 -translate-y-[120%] text-center",
    bottom: "bottom-0 left-1/2 -translate-x-1/2 translate-y-[120%] text-center",
  }[side];
  return (
    <div className={`absolute ${pos} font-mono text-[10px] leading-tight text-muted`}>
      <div className="font-semibold text-foreground">{pct}%</div>
      <div>{mm.toFixed(2)} mm</div>
    </div>
  );
}
