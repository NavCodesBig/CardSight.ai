const TONES = {
  neutral: "bg-[var(--card-border)] text-foreground",
  good: "bg-emerald-400/15 text-emerald-500 dark:text-emerald-300",
  warn: "bg-amber-400/15 text-amber-600 dark:text-amber-300",
  bad: "bg-rose-400/15 text-rose-500 dark:text-rose-300",
  accent: "bg-[var(--accent)]/15 text-[var(--accent)]",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
