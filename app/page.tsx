import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";

const FEATURES = [
  {
    icon: "🎯",
    title: "Centering to 0.1 mm",
    body: "Automatic border measurement with sub-millimeter precision and PSA-standard centering ratios for front and back.",
  },
  {
    icon: "📐",
    title: "CAD-style measuring",
    body: "The card outline is detected and calibrated against the true 63.5 × 88.9 mm standard, giving real-world dimension overlays.",
  },
  {
    icon: "🔍",
    title: "Corner & edge inspection",
    body: "Whitening, nicks, soft corners and edge wear are detected per region and highlighted directly on your card image.",
  },
  {
    icon: "🗺️",
    title: "Surface damage heatmap",
    body: "Scratches, print lines and gloss breaks are mapped cell by cell so you see exactly where a grader would look twice.",
  },
  {
    icon: "🏆",
    title: "PSA · BGS · CGC estimates",
    body: "Probability distributions across each company's grade ladder, with confidence scores — not just a single number.",
  },
  {
    icon: "🧠",
    title: "Built to learn",
    body: "A training pipeline designed around graded-card datasets, so accuracy improves as labeled examples grow.",
  },
];

const STEPS = [
  { n: "01", title: "Photograph the front", body: "Flat surface, even light, card filling the frame." },
  { n: "02", title: "Photograph the back", body: "Same setup — the back drives centering and wear checks too." },
  { n: "03", title: "AI analysis", body: "Outline detection, perspective correction, then four-category inspection." },
  { n: "04", title: "Full report", body: "Subgrades, measurements, damage map and grading recommendations." },
];

export default function Home() {
  return (
    <div className="space-y-24">
      {/* Hero */}
      <section className="animate-float-up pt-14 text-center">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          AI pre-grading · Pokémon TCG · more games coming
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold leading-[1.06] tracking-tight sm:text-6xl">
          Know your card&apos;s grade
          <br />
          <span className="text-gradient">before you submit.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
          Two photos. Millimeter-accurate centering, corner, edge and surface
          analysis — with transparent PSA, BGS and CGC estimates in seconds.
        </p>
        <div className="mx-auto mt-9 flex max-w-xs flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/scan"
            className="animate-pulse-ring rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-8 py-4 text-center font-semibold text-white shadow-xl transition-transform hover:scale-[1.03]"
          >
            Scan a card
          </Link>
          <Link
            href="/dashboard"
            className="glass rounded-2xl px-8 py-4 text-center font-semibold transition-transform hover:scale-[1.03]"
          >
            View dashboard
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="mb-8 text-center text-3xl font-bold tracking-tight">
          Like a scanner app, <span className="text-gradient">built for graders</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <GlassCard
              key={s.n}
              className="animate-float-up p-6"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="font-mono text-sm font-bold text-[var(--accent)]">{s.n}</div>
              <div className="mt-2 font-semibold">{s.title}</div>
              <p className="mt-1.5 text-sm text-muted">{s.body}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="mb-8 text-center text-3xl font-bold tracking-tight">
          Everything a pre-grade <span className="text-gradient">should tell you</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <GlassCard
              key={f.title}
              className="animate-float-up p-6 transition-transform hover:-translate-y-1"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="text-2xl">{f.icon}</div>
              <div className="mt-3 font-semibold">{f.title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Honesty note */}
      <section>
        <GlassCard strong className="mx-auto max-w-3xl p-8 text-center">
          <h3 className="text-xl font-semibold">Transparent by design</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Photos can&apos;t capture everything a grader sees in hand — so CardSight
            never pretends otherwise. Every estimate ships with a confidence
            score, every subgrade with the measurements behind it, and every
            report with a clear explanation of what cost your card points.
          </p>
        </GlassCard>
      </section>
    </div>
  );
}
