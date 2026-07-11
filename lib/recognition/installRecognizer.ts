/**
 * Recognizer installation — shared by the analysis worker and the main-thread
 * fallback path.
 *
 * Installs a lazy wrapper rather than EmbeddingIdentifier directly so the
 * heavy recognition stack (transformers.js CLIP, tesseract) stays out of the
 * initial bundle: nothing loads until the first identify call of a scan, and
 * every failure falls back to the zero-dependency heuristic.
 */

import {
  heuristicIdentifier,
  setCardIdentifier,
  type CardIdentifier,
  type CardInfo,
} from "./identifier";

class LazyEmbeddingIdentifier implements CardIdentifier {
  private impl: Promise<CardIdentifier> | null = null;

  async identify(front: ImageData): Promise<CardInfo> {
    try {
      this.impl ??= import("./embeddingIdentifier").then(
        (m) => new m.EmbeddingIdentifier()
      );
      return await (await this.impl).identify(front);
    } catch {
      this.impl = null; // allow a retry on the next scan
      return heuristicIdentifier.identify(front);
    }
  }
}

/** Idempotent: safe to call from every context that might run analysis. */
export function installRecognizer(): void {
  setCardIdentifier(new LazyEmbeddingIdentifier());
}
