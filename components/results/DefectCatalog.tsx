import type { ScanResult } from "@/lib/analyze";
import type { FaceAnalysis } from "@/lib/vision/types";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";

interface DefectEntry {
  area: "Centering" | "Corner" | "Edge" | "Surface";
  location: string;
  severity: number; // 0..1
  description: string;
}

/**
 * DCM-style defect catalog: every confirmed defect with a severity rating,
 * location and plain-English description. Only defects that survived three-pass
 * consensus reach here, so the list reflects what actually affected the grade.
 */
export function DefectCatalog({ scan }: { scan: ScanResult }) {
  const entries = [...collect(scan.front, "Front"), ...collect(scan.back, "Back")].sort(
    (a, b) => b.severity - a.severity
  );

  return (
    <section>
      <h2 className="mb-4 text-xl font-bold tracking-tight">Defect report</h2>
      <GlassCard className="p-6">
        {entries.length === 0 ? (
          <p className="text-sm text-muted">
            No defects were confirmed across all three consensus passes — corners, edges and
            surface read clean.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--card-border)]">
            {entries.map((e, i) => {
              const sev = severityLabel(e.severity);
              return (
                <div key={i} className="flex items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="w-20 shrink-0 text-xs font-semibold text-muted">{e.area}</span>
                  <span className="flex-1">
                    <span className="font-medium">{e.location}</span>
                    <span className="text-muted"> — {e.description}</span>
                  </span>
                  <Badge tone={sev.tone}>{sev.label}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </section>
  );
}

function collect(face: FaceAnalysis, side: string): DefectEntry[] {
  const out: DefectEntry[] = [];

  for (const c of face.corners) {
    if (c.damaged || c.whitening > 0.15) {
      out.push({
        area: "Corner",
        location: `${side} ${pretty(c.corner)}`,
        severity: c.whitening,
        description:
          c.issues.length > 0
            ? c.issues.join(", ")
            : `${Math.round(c.whitening * 100)}% whitening`,
      });
    }
  }

  for (const e of face.edges) {
    if (e.issues.length > 0 || e.nickCount > 0) {
      const bits = [...e.issues];
      if (e.nickCount > 0) bits.push(`${e.nickCount} nick${e.nickCount > 1 ? "s" : ""}`);
      out.push({
        area: "Edge",
        location: `${side} ${e.edge}`,
        severity: Math.max(e.whitening, Math.min(1, e.nickCount / 4)),
        description: bits.join(", ") || "edge wear",
      });
    }
  }

  for (const d of face.surface.defects) {
    out.push({
      area: "Surface",
      location: `${side} @ ${Math.round(d.x * 100)}%, ${Math.round(d.y * 100)}%`,
      severity: d.severity,
      description: d.type.replace(/-/g, " "),
    });
  }

  return out;
}

function severityLabel(s: number): { label: string; tone: "good" | "warn" | "bad" } {
  if (s >= 0.66) return { label: "Major", tone: "bad" };
  if (s >= 0.33) return { label: "Moderate", tone: "warn" };
  return { label: "Minor", tone: "good" };
}

function pretty(corner: string): string {
  return corner.replace(/([A-Z])/g, " $1").toLowerCase().trim();
}
