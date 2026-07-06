/**
 * Likely-grade estimates for PSA, BGS and CGC.
 *
 * Each company's ladder is scored with a softmax over distance from our
 * internal 0–10 estimate, sharpened or flattened by the analysis confidence.
 * Company-specific strictness offsets reflect that BGS half-points make 9.5
 * common where PSA jumps 9 → 10, and that BGS is historically the toughest
 * at the very top.
 */

import { BGS_GRADES, CGC_GRADES, PSA_GRADES } from "./scale";

export interface GradeProbability {
  grade: number;
  probability: number; // 0..1
}

export interface CompanyEstimate {
  company: "PSA" | "BGS" | "CGC";
  /** Top 3 most likely grades, descending probability. */
  probabilities: GradeProbability[];
  mostLikely: number;
}

const COMPANY_CONFIG = {
  PSA: { ladder: PSA_GRADES, strictness: 0.15 },
  BGS: { ladder: BGS_GRADES, strictness: 0.3 },
  CGC: { ladder: CGC_GRADES, strictness: 0.2 },
} as const;

export function estimateCompanyGrades(
  overall: number,
  confidence: number
): CompanyEstimate[] {
  return (Object.keys(COMPANY_CONFIG) as (keyof typeof COMPANY_CONFIG)[]).map(
    (company) => {
      const { ladder, strictness } = COMPANY_CONFIG[company];
      const target = overall - strictness;
      // Sharper distribution when confidence is high.
      const temperature = 1.6 - confidence;
      const scores = ladder.map((g) => -Math.abs(g - target) / temperature);
      const maxS = Math.max(...scores);
      const exps = scores.map((s) => Math.exp((s - maxS) * 2.2));
      const sum = exps.reduce((a, b) => a + b, 0);
      const probabilities = ladder
        .map((grade, i) => ({ grade, probability: exps[i] / sum }))
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 3)
        .map((p) => ({ grade: p.grade, probability: Math.round(p.probability * 100) / 100 }));
      return { company, probabilities, mostLikely: probabilities[0].grade };
    }
  );
}

/** Whether professional submission is economically sensible. */
export function submissionRecommendation(overall: number, confidence: number): {
  recommended: boolean;
  headline: string;
  detail: string;
} {
  if (overall >= 9 && confidence >= 0.7) {
    return {
      recommended: true,
      headline: "Strong grading candidate",
      detail:
        "This card shows Gem Mint–range characteristics. Professional grading is likely to add value — consider PSA or BGS submission.",
    };
  }
  if (overall >= 8) {
    return {
      recommended: true,
      headline: "Worth considering",
      detail:
        "Solid Near Mint–Mint estimate. Grading may be worthwhile for higher-value cards; weigh submission fees against the card's raw value.",
    };
  }
  if (overall >= 6) {
    return {
      recommended: false,
      headline: "Likely not cost-effective",
      detail:
        "The estimated grade sits in the mid range. Unless the card is rare or valuable even at lower grades, submission fees may exceed the value added.",
    };
  }
  return {
    recommended: false,
    headline: "Not recommended",
    detail:
      "Visible wear puts this card in the lower grade range. Grading is generally only worthwhile here for very rare or vintage cards.",
  };
}
