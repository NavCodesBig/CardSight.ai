/**
 * Grade explanation generator.
 *
 * Every score the app shows comes with a plain-English reason built from the
 * actual measurements — never a bare number.
 */

import type { FaceAnalysis } from "../vision/types";
import type { GradeResult } from "./calculator";
import { gradeLabel } from "./scale";

export interface Explanation {
  category: "centering" | "corners" | "edges" | "surface" | "overall";
  title: string;
  points: string[];
}

export function explainGrade(
  front: FaceAnalysis,
  back: FaceAnalysis,
  result: GradeResult
): Explanation[] {
  const out: Explanation[] = [];

  // Centering
  {
    const c = front.centering;
    const points: string[] = [
      `Front horizontal centering measures ${c.leftPct}% / ${c.rightPct}% (${c.horizontalRatio}); vertical ${c.topPct}% / ${c.bottomPct}% (${c.verticalRatio}).`,
      `Border widths: left ${c.leftMm} mm, right ${c.rightMm} mm, top ${c.topMm} mm, bottom ${c.bottomMm} mm.`,
    ];
    const worst = Math.max(c.leftPct, c.rightPct, c.topPct, c.bottomPct);
    if (worst <= 55) points.push("Within PSA's 55/45 threshold for Gem Mint centering.");
    else if (worst <= 60) points.push("Within PSA 9 range (60/40) but outside Gem Mint tolerance — centering costs the top grade.");
    else if (worst <= 65) points.push("Roughly 65/35 — centering caps this card around PSA 8.");
    else points.push("Noticeably off-center; this is the dominant factor holding the grade down.");
    const bc = back.centering;
    points.push(`Back centering: ${bc.leftPct}% / ${bc.rightPct}% horizontal, ${bc.topPct}% / ${bc.bottomPct}% vertical.`);
    out.push({ category: "centering", title: `Centering — ${result.subgrades.centering}`, points });
  }

  // Corners
  {
    const points: string[] = [];
    const damagedFront = front.corners.filter((c) => c.damaged);
    const damagedBack = back.corners.filter((c) => c.damaged);
    if (damagedFront.length === 0 && damagedBack.length === 0) {
      points.push("All eight corners (front and back) appear sharp with no significant whitening detected.");
    } else {
      for (const c of damagedFront) {
        points.push(`Front ${pretty(c.corner)} corner: ${c.issues.join(", ")} (${Math.round(c.whitening * 100)}% of the corner region affected).`);
      }
      for (const c of damagedBack) {
        points.push(`Back ${pretty(c.corner)} corner: ${c.issues.join(", ")} (${Math.round(c.whitening * 100)}% affected).`);
      }
      points.push("Corner whitening is weighed heavily because it is the first thing professional graders check under magnification.");
    }
    out.push({ category: "corners", title: `Corners — ${result.subgrades.corners}`, points });
  }

  // Edges
  {
    const points: string[] = [];
    const worn = [...front.edges, ...back.edges].filter((e) => e.issues.length > 0);
    if (worn.length === 0) {
      points.push("Edges are clean on both faces — no whitening, silvering or nicks above detection threshold.");
    } else {
      for (const e of front.edges.filter((x) => x.issues.length)) {
        points.push(`Front ${e.edge} edge: ${e.issues.join(", ")}.`);
      }
      for (const e of back.edges.filter((x) => x.issues.length)) {
        points.push(`Back ${e.edge} edge: ${e.issues.join(", ")}.`);
      }
    }
    out.push({ category: "edges", title: `Edges — ${result.subgrades.edges}`, points });
  }

  // Surface
  {
    const points: string[] = [];
    const fs = front.surface;
    if (fs.issues.length === 0) {
      points.push("Front surface is clean: no scratches, print lines or gloss breaks above detection threshold.");
    } else {
      points.push(`Front surface findings: ${fs.issues.join("; ")}.`);
    }
    if (back.surface.issues.length > 0) {
      points.push(`Back surface findings: ${back.surface.issues.join("; ")}.`);
    }
    points.push(`Gloss consistency ${Math.round(fs.glossConsistency * 100)}%; overall defect density ${(fs.defectDensity * 100).toFixed(1)}%.`);
    if (fs.defects.some((d) => d.type === "holo-scratch")) {
      points.push("Holo areas show line anomalies — note that holo sparkle can read as scratching in photos; inspect under angled light to confirm.");
    }
    out.push({ category: "surface", title: `Surface — ${result.subgrades.surface}`, points });
  }

  // Overall
  {
    const label = gradeLabel(result.overall);
    const points: string[] = [
      `Front and back are weighted 55% / 45%. Each face's subgrades blend centering 25%, corners 25%, edges 20%, surface 30% into a composite of ${result.composite}.`,
      `Weakest-link rule: the final grade cannot exceed the lowest subgrade, so ${result.limitingFactor} (${result.subgrades[result.limitingFactor]}) sets the ceiling here — final ${result.overall} (${label.label}).`,
      `Reported as a likely range of ${result.range.low}–${result.range.high}: a photo-based estimate can't pin a half-point exactly, so treat the single number as the midpoint.`,
    ];
    if (result.structuralCap !== null) {
      points.push(
        `Structural damage detected — the grade is automatically capped at ${result.structuralCap} regardless of the other categories.`
      );
    }
    points.push(
      "Every subgrade is scored by three-pass consensus: the analysis runs three independent times and a defect must appear in at least two passes to count, which keeps false positives out.",
      `Analysis confidence ${Math.round(result.confidence * 100)}%. This is an AI pre-grade estimate from photos, not a substitute for in-hand professional grading.`
    );
    out.push({ category: "overall", title: `Overall — ${result.overall}`, points });
  }

  return out;
}

function pretty(corner: string): string {
  return corner.replace(/([A-Z])/g, " $1").toLowerCase().trim();
}
