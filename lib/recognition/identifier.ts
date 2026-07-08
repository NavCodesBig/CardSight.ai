/**
 * Card recognition module.
 *
 * Architecture: `identifyCard` is the single entry point the app calls. The
 * current implementation uses fast visual heuristics (frame color → era,
 * color-variance → holo type). The `CardIdentifier` interface is the seam
 * where a real recognition model plugs in later — an embedding model matched
 * against a card database (see training/README.md) can replace
 * `HeuristicIdentifier` without touching any UI code.
 */

export interface CardInfo {
  game: "pokemon" | "unknown";
  name: string | null;
  set: string | null;
  number: string | null;
  hp: string | null;
  rarity: string | null;
  language: string;
  holoType:
    | "none"
    | "holo"
    | "reverse-holo"
    | "full-art"
    | "unknown";
  variantTags: string[]; // e.g. ["EX", "VMAX", "Secret Rare"]
  eraGuess: string | null;
  confidence: number; // 0..1
}

export interface CardIdentifier {
  identify(front: ImageData): Promise<CardInfo>;
}

class HeuristicIdentifier implements CardIdentifier {
  async identify(front: ImageData): Promise<CardInfo> {
    const { width: w, height: h, data } = front;

    // Sample the border frame color (outer 4% ring, minus corners).
    const ring = Math.round(w * 0.04);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.round(h * 0.2); y < h * 0.8; y += 4) {
      for (const x of [ring, w - 1 - ring]) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    r /= n; g /= n; b /= n;

    const yellowFrame = r > 150 && g > 120 && b < 110 && r + g > 2.2 * b;
    const silverFrame = Math.abs(r - g) < 20 && Math.abs(g - b) < 20 && r > 130;

    // Holo detection: high color variance in the art window suggests foil.
    // "Full-art" can't be told apart reliably from a photo (it was mislabeling
    // ordinary cards), so we only distinguish holo / reverse-holo / none here
    // and rely on the Pokémon TCG API for the card's real type/rarity.
    const artVar = regionColorVariance(front, 0.12, 0.12, 0.76, 0.42);
    const fullVar = regionColorVariance(front, 0.08, 0.55, 0.84, 0.38);
    const holoType: CardInfo["holoType"] =
      artVar > 2600 ? "holo" : fullVar > 2600 ? "reverse-holo" : "none";

    const eraGuess = yellowFrame
      ? "Classic era (yellow border, 1999–2023 style)"
      : silverFrame
        ? "Scarlet & Violet era (silver border)"
        : null;

    return {
      game: yellowFrame || silverFrame ? "pokemon" : "unknown",
      name: null,
      set: null,
      number: null,
      hp: null,
      rarity: null,
      language: "EN",
      holoType,
      variantTags: [],
      eraGuess,
      confidence: yellowFrame || silverFrame ? 0.45 : 0.2,
    };
  }
}

const identifier: CardIdentifier = new HeuristicIdentifier();

export function identifyCard(front: ImageData): Promise<CardInfo> {
  return identifier.identify(front);
}

function regionColorVariance(
  img: ImageData,
  fx: number,
  fy: number,
  fw: number,
  fh: number
): number {
  const x0 = Math.round(img.width * fx), y0 = Math.round(img.height * fy);
  const x1 = Math.round(img.width * (fx + fw)), y1 = Math.round(img.height * (fy + fh));
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = y0; y < y1; y += 5) {
    for (let x = x0; x < x1; x += 5) {
      const i = (y * img.width + x) * 4;
      sr += img.data[i]; sg += img.data[i + 1]; sb += img.data[i + 2]; n++;
    }
  }
  if (!n) return 0;
  const mr = sr / n, mg = sg / n, mb = sb / n;
  let v = 0;
  for (let y = y0; y < y1; y += 5) {
    for (let x = x0; x < x1; x += 5) {
      const i = (y * img.width + x) * 4;
      v += (img.data[i] - mr) ** 2 + (img.data[i + 1] - mg) ** 2 + (img.data[i + 2] - mb) ** 2;
    }
  }
  return v / n;
}
