/**
 * Snap noisy OCR output to a real Pokémon card name.
 *
 * Card names are a fixed vocabulary: a base species (Charizard) plus optional
 * modifiers (ex, GX, V, VMAX, VSTAR, Dark, Radiant, Alolan …). We fuzzy-match
 * the OCR'd base against the bundled species dictionary and recognize modifier
 * tokens separately, so "Charizard ex" or "Dark Charizard" reconstruct cleanly
 * even when the raw OCR is slightly wrong ("Chansei" → "Chansey").
 */

import NAMES from "./pokemonNames.json";

const SPECIES: string[] = NAMES as string[];
const SPECIES_NORM = SPECIES.map((n) => ({ display: n, norm: normalize(n) }));

// Modifier vocabulary. Suffix tags trail the name; prefixes lead it.
const SUFFIX_DISPLAY: Record<string, string> = {
  ex: "ex",
  gx: "GX",
  v: "V",
  vmax: "VMAX",
  vstar: "VSTAR",
  break: "BREAK",
  prime: "Prime",
  star: "Star",
  legend: "LEGEND",
  lvx: "LV.X",
  delta: "δ",
};
const PREFIX_DISPLAY: Record<string, string> = {
  dark: "Dark",
  light: "Light",
  shining: "Shining",
  radiant: "Radiant",
  mega: "Mega",
  primal: "Primal",
  crystal: "Crystal",
  alolan: "Alolan",
  galarian: "Galarian",
  hisuian: "Hisuian",
  paldean: "Paldean",
  surfing: "Surfing",
  flying: "Flying",
  rocket: "Rocket's",
  aqua: "Aqua's",
  magma: "Magma's",
  galactic: "Galactic's",
  plasma: "Plasma's",
};

const SUFFIX_KEYS = Object.keys(SUFFIX_DISPLAY);
const PREFIX_KEYS = Object.keys(PREFIX_DISPLAY);

/** Correct an OCR'd name to the nearest real card name, or null if hopeless. */
export function snapToName(raw: string | null): string | null {
  if (!raw) return null;
  const tokens = raw.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;

  const prefixes: string[] = [];
  const suffixes: string[] = [];
  const nameTokens: string[] = [];

  for (const t of tokens) {
    const suf = nearestModifier(t, SUFFIX_KEYS);
    if (suf) {
      suffixes.push(SUFFIX_DISPLAY[suf]);
      continue;
    }
    const pre = nearestModifier(t, PREFIX_KEYS);
    if (pre) {
      prefixes.push(PREFIX_DISPLAY[pre]);
      continue;
    }
    nameTokens.push(t);
  }

  const base = nameTokens.join("");
  const species = base.length >= 2 ? fuzzySpecies(base) : null;
  const name = species ?? titleCase(nameTokens.join(" "));
  if (!name) return null;

  return [...prefixes, name, ...suffixes].join(" ").trim();
}

/** Nearest species by normalized edit distance; null if no confident match. */
function fuzzySpecies(base: string): string | null {
  const b = normalize(base);
  let best: string | null = null;
  let bestSim = 0;
  for (const { display, norm } of SPECIES_NORM) {
    if (norm === b) return display; // exact
    const sim = 1 - levenshtein(b, norm) / Math.max(b.length, norm.length);
    if (sim > bestSim) {
      bestSim = sim;
      best = display;
    }
  }
  return bestSim >= 0.62 ? best : null;
}

function nearestModifier(token: string, keys: string[]): string | null {
  if (keys.includes(token)) return token;
  // Short tags (v, ex, gx) only match exactly to avoid false hits.
  if (token.length <= 2) return null;
  for (const k of keys) {
    if (k.length > 2 && levenshtein(token, k) <= 1) return k;
  }
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Iterative Levenshtein distance (small strings). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}
