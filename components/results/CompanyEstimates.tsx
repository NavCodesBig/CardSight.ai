import type { CompanyEstimate } from "@/lib/grading/companyEstimates";

/** Likely PSA / BGS / CGC grades with probability bars. */
export function CompanyEstimates({ estimates }: { estimates: CompanyEstimate[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {estimates.map((e) => (
        <div key={e.company} className="glass rounded-2xl p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-muted">Likely {e.company}</span>
            <span className="font-mono text-2xl font-bold text-gradient">
              {e.mostLikely}
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {e.probabilities.map((p) => (
              <div key={p.grade}>
                <div className="mb-1 flex justify-between font-mono text-xs">
                  <span>{e.company} {p.grade}</span>
                  <span className="text-muted">{Math.round(p.probability * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--card-border)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                    style={{ width: `${Math.max(2, p.probability * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
