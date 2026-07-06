"use client";

/** Circular grade indicator with an animated sweep, 0–10 scale. */
export function GradeRing({
  value,
  size = 168,
  label,
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const stroke = size * 0.065;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / 10));
  const color =
    value >= 9 ? "#34d399" : value >= 7 ? "#a3e635" : value >= 5 ? "#fbbf24" : "#f87171";

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--card-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          className="animate-ring-sweep"
          style={{ "--ring-circ": circ } as React.CSSProperties}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-mono font-bold leading-none" style={{ fontSize: size * 0.3 }}>
          {value.toFixed(value % 1 === 0 ? 0 : 1)}
        </div>
        {label && <div className="mt-1 text-xs text-muted">{label}</div>}
      </div>
    </div>
  );
}
