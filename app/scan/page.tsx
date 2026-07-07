"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { type ProgressStage } from "@/lib/analyze";
import { runAnalysis } from "@/lib/runAnalysis";
import { saveScan } from "@/lib/storage";
import { gradeLabel } from "@/lib/grading/scale";
import { ImageCapture } from "@/components/scanner/ImageCapture";
import { ProcessingOverlay } from "@/components/scanner/ProcessingOverlay";
import { GlassCard } from "@/components/ui/GlassCard";
import { PreviousScans } from "@/components/dashboard/PreviousScans";

const TIPS = [
  "Lay the card flat on a dark, matte surface",
  "Use diffuse daylight — avoid direct lamps and flash",
  "Fill the frame with the card, all four corners visible",
  "Hold the phone parallel to the card to minimize skew",
];

export default function ScanPage() {
  const router = useRouter();
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState<ProgressStage>("loading");
  const [pct, setPct] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const run = useCallback(async () => {
    if (!front || !back) return;
    setError(null);
    setWarnings([]);
    setProcessing(true);
    const preview = URL.createObjectURL(front);
    setPreviewUrl(preview);
    try {
      const result = await runAnalysis(front, back, (s, p) => {
        setStage(s);
        setPct(p);
      });
      const quality = [...result.front.quality.warnings, ...result.back.quality.warnings];
      const detectionWeak = result.detectionConfidence < 0.5;
      if (detectionWeak || !result.front.quality.usable || !result.back.quality.usable) {
        setWarnings(
          detectionWeak
            ? [
                "Couldn't reliably detect the card outline, so the grade would be unreliable. Lay the card flat, fill the frame, and use a plain, contrasting background.",
                ...quality,
              ]
            : quality
        );
        setProcessing(false);
        return;
      }
      await saveScan(result, gradeLabel(result.grade.overall).label);
      router.push(`/results/${result.id}`);
    } catch (e) {
      console.error(e);
      setError("Analysis failed — try different photos with better lighting.");
      setProcessing(false);
    } finally {
      URL.revokeObjectURL(preview);
    }
  }, [front, back, router]);

  return (
    <div className="animate-float-up">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Scan your <span className="text-gradient">card</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          Capture the front and back. Analysis runs entirely on your device —
          your photos never leave the browser.
        </p>
      </header>

      <div className="mt-10 flex flex-col items-center justify-center gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-semibold text-muted">Step 1 · Front</span>
          <ImageCapture label="Capture front" file={front} onSelect={setFront} />
        </div>
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-semibold text-muted">Step 2 · Back</span>
          <ImageCapture label="Capture back" file={back} onSelect={setBack} />
        </div>
      </div>

      {warnings.length > 0 && (
        <GlassCard className="mx-auto mt-8 max-w-md border-amber-400/40 p-5">
          <div className="font-semibold text-amber-500 dark:text-amber-300">
            Image quality check failed
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {warnings.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Retake the affected photo — a reliable grade needs a sharp, well-lit image.
          </p>
        </GlassCard>
      )}

      {error && (
        <p className="mt-6 text-center text-sm font-medium text-rose-400">{error}</p>
      )}

      <div className="mt-10 text-center">
        <button
          onClick={run}
          disabled={!front || !back || processing}
          className="rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-10 py-4 font-semibold text-white shadow-xl transition-all enabled:hover:scale-[1.03] disabled:opacity-40"
        >
          {front && back ? "Analyze card" : "Add both photos to continue"}
        </button>
      </div>

      <GlassCard className="mx-auto mt-12 max-w-lg p-6">
        <div className="text-sm font-semibold">📸 Capture tips for accurate grading</div>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          {TIPS.map((t) => (
            <li key={t} className="flex gap-2">
              <span className="text-[var(--accent)]">›</span>
              {t}
            </li>
          ))}
        </ul>
      </GlassCard>

      <div className="mt-12">
        <PreviousScans />
      </div>

      {processing && <ProcessingOverlay stage={stage} pct={pct} previewUrl={previewUrl} />}
    </div>
  );
}
