/**
 * Grade scale definitions shared across the grading engine and UI.
 */

export interface GradeLabel {
  min: number;
  label: string;
  short: string;
}

export const GRADE_LABELS: GradeLabel[] = [
  { min: 10, label: "Gem Mint", short: "GM" },
  { min: 9.5, label: "Gem Mint Candidate", short: "GM-C" },
  { min: 9, label: "Mint", short: "MINT" },
  { min: 8, label: "Near Mint–Mint", short: "NM-MT" },
  { min: 7, label: "Near Mint", short: "NM" },
  { min: 6, label: "Excellent–Mint", short: "EX-MT" },
  { min: 5, label: "Excellent", short: "EX" },
  { min: 4, label: "Very Good–Excellent", short: "VG-EX" },
  { min: 3, label: "Very Good", short: "VG" },
  { min: 2, label: "Good", short: "GOOD" },
  { min: 0, label: "Poor", short: "PR" },
];

export function gradeLabel(grade: number): GradeLabel {
  return GRADE_LABELS.find((g) => grade >= g.min) ?? GRADE_LABELS[GRADE_LABELS.length - 1];
}

export type SubgradeKey = "centering" | "corners" | "edges" | "surface";

export const SUBGRADE_WEIGHTS: Record<SubgradeKey, number> = {
  centering: 0.25,
  corners: 0.25,
  edges: 0.2,
  surface: 0.3,
};

/** Grading companies' ladders, used for likely-grade estimates. */
export const PSA_GRADES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
export const BGS_GRADES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4, 3, 2, 1];
export const CGC_GRADES = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4, 3, 2, 1];
