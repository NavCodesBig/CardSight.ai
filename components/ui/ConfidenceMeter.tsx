export function ConfidenceMeter({
  value,
  label = "Analysis confidence",
}: {
  value: number; // 0..1
  label?: string;
}) {
  const pct = Math.round(value * 100);
  const color = value >= 0.75 ? "bg-emerald-400" : value >= 0.5 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-semibold">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--card-border)]">
        <div
          className={`h-full rounded-full ${color} transition-[width] duration-1000 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
