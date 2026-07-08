/**
 * EmbeddingIdentifier — Road B brick #3, the client recognizer that plugs into
 * the CardIdentifier seam.
 *
 * On each identify it embeds the card's art (CLIP), matches it against the
 * static index, and — when OCR text is available — re-ranks by name/number to
 * pin the exact print. Any failure (index not deployed, model load error, no
 * usable match) falls back to the heuristic identifier, so installing this can
 * never break a scan; worst case it is a silent no-op until the index ships.
 *
 * Install from a client entry point once, e.g.:
 *   import { setCardIdentifier } from "./identifier";
 *   import { EmbeddingIdentifier } from "./embeddingIdentifier";
 *   setCardIdentifier(new EmbeddingIdentifier());
 *
 * NOTE: verified only via the offline Node path (matcher + real CLIP index);
 * browser end-to-end is pending a deployed public/cardref index.
 */

import type { CardIdentifier, CardInfo } from "./identifier";
import { heuristicIdentifier } from "./identifier";
import { embedArt } from "./embed";
import { loadCardIndex } from "./indexLoader";
import { recognize } from "./cardIndex";
import { extractCardText } from "./ocr";
import { imageDataToDataUrl } from "../vision/imageOps";

export class EmbeddingIdentifier implements CardIdentifier {
  constructor(private fallback: CardIdentifier = heuristicIdentifier) {}

  async identify(front: ImageData): Promise<CardInfo> {
    try {
      const loaded = await loadCardIndex();
      if (!loaded) return this.fallback.identify(front);

      // Embed art and read text in parallel; text sharpens the match but is not
      // required (art-only still returns a candidate).
      const [embedding, ocr] = await Promise.all([
        embedArt(front, loaded.art),
        this.readText(front),
      ]);

      const info = recognize({
        embedding,
        ocr,
        index: loaded.index,
        catalog: loaded.catalog,
      });
      return info ?? (await this.fallback.identify(front));
    } catch {
      return this.fallback.identify(front);
    }
  }

  private async readText(front: ImageData): Promise<{ name: string | null; number: string | null }> {
    try {
      const url = await imageDataToDataUrl(front, 0.9);
      return await extractCardText(url);
    } catch {
      return { name: null, number: null };
    }
  }
}
