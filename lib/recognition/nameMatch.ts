/**
 * Snap noisy OCR output to a real Pokémon card name.
 *
 * Two dictionaries are matched:
 *   • Pokémon species (Charizard) + a modifier vocabulary (ex, GX, V, VMAX,
 *     VSTAR, Dark, Radiant, Alolan …) — so "Charizard ex" / "Dark Charizard"
 *     reconstruct even when the OCR is slightly wrong ("Chansei" → Chansey).
 *   • Trainer / Energy card names (Professor's Research, Ultra Ball, Boss's
 *     Orders …) matched as whole strings.
 * Whichever dictionary yields the closer match (by normalized edit distance)
 * wins, so both Pokémon and non-Pokémon card names are recognized.
 */

import SPECIES_JSON from "./pokemonNames.json";
import TRAINER_JSON from "./trainerNames.json";
import JA_JSON from "./pokemonNamesJa.json";
import JA_TRAINER_JSON from "./trainerNamesJa.json";

const SPECIES_NORM = (SPECIES_JSON as string[]).map((n) => ({ display: n, norm: normalize(n) }));
const TRAINER_NORM = (TRAINER_JSON as string[]).map((n) => ({ display: n, norm: normalize(n) }));
// Japanese (katakana) → English display, for OCR of Japanese-language cards.
const JA_NORM = (JA_JSON as { ja: string; en: string }[]).map((p) => ({
  display: p.en,
  norm: normalizeJa(p.ja),
}));
// Japanese Trainer / Item / Energy card names → English.
const JA_TRAINER_NORM = (JA_TRAINER_JSON as { ja: string; en: string }[]).map((p) => ({
  display: p.en,
  norm: normalizeJa(p.ja),
}));

const ACCEPT = 0.62; // minimum similarity to trust a match

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

interface Match {
  display: string;
  sim: number;
}

/** Correct an OCR'd name to the nearest real card name, or null if hopeless. */
export function snapToName(raw: string | null): string | null {
  return snapScored(raw)?.display ?? null;
}

/**
 * Like snapToName but returns the match with its similarity, so callers (e.g.
 * the Japanese OCR pass) can compare confidences across scripts. Always returns
 * the tidied Pokémon-path fallback when nothing clears the accept threshold.
 */
export function snapScored(raw: string | null): Match | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (cleaned.length < 2) return null;

  const pokemon = speciesPath(cleaned);
  const trainer = fuzzyList(cleaned, TRAINER_NORM);

  const accepted = [pokemon, trainer]
    .filter((m): m is Match => m !== null && m.sim >= ACCEPT)
    .sort((a, b) => b.sim - a.sim);
  if (accepted.length > 0) return accepted[0];
  return pokemon; // tidied fallback (low sim)
}

/** Match Japanese OCR text to an English card name (Pokémon or Trainer/Item). */
export function snapJapanese(raw: string | null): Match | null {
  if (!raw) return null;
  const b = normalizeJa(raw);
  if (b.length < 2) return null;
  const best = [fuzzyNorm(b, JA_NORM), fuzzyNorm(b, JA_TRAINER_NORM)]
    .filter((m): m is Match => m !== null)
    .sort((a, b) => b.sim - a.sim)[0];
  return best && best.sim >= 0.6 ? best : null;
}

/** Pokémon path: split off modifiers, fuzzy-match the base species. */
function speciesPath(raw: string): Match | null {
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
  const species = base.length >= 2 ? fuzzyList(base, SPECIES_NORM) : null;
  const name = species?.display ?? titleCase(nameTokens.join(" "));
  if (!name) return null;
  const display = [...prefixes, name, ...suffixes].join(" ").trim();
  // Confidence for the Pokémon path is driven by the species match.
  return { display, sim: species?.sim ?? 0 };
}

/** Best match of a whole string against a Latin-normalized dictionary. */
function fuzzyList(s: string, list: { display: string; norm: string }[]): Match | null {
  return fuzzyNorm(normalize(s), list);
}

/** Best match of an already-normalized key against a normalized dictionary. */
function fuzzyNorm(b: string, list: { display: string; norm: string }[]): Match | null {
  if (b.length < 2) return null;
  let best: string | null = null;
  let bestSim = 0;
  for (const { display, norm } of list) {
    if (norm === b) return { display, sim: 1 };
    const sim = 1 - levenshtein(b, norm) / Math.max(b.length, norm.length);
    if (sim > bestSim) {
      bestSim = sim;
      best = display;
    }
  }
  return best ? { display: best, sim: bestSim } : null;
}

function nearestModifier(token: string, keys: string[]): string | null {
  if (keys.includes(token)) return token;
  if (token.length <= 2) return null; // short tags only match exactly
  for (const k of keys) {
    if (k.length > 2 && levenshtein(token, k) <= 1) return k;
  }
  return null;
}

/**
 * Normalize Japanese OCR text for matching: convert hiragana to katakana and
 * keep only katakana + kanji (drops spaces, the ・ separator, latin and digits).
 */
function normalizeJa(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const k = c >= 0x3041 && c <= 0x3096 ? c + 0x60 : c; // hiragana → katakana
    if ((k >= 0x30a0 && k <= 0x30ff) || (k >= 0x4e00 && k <= 0x9fff)) {
      out += String.fromCodePoint(k);
    }
  }
  return out;
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
