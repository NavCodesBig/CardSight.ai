/**
 * CLIP art embedder — Road B brick #3 (query side).
 *
 * Embeds a rectified card's ART WINDOW into the same 512-d CLIP space as the
 * reference index (scripts/build-embedding-index.ts). The model + processor
 * load lazily on first use and are cached for the session, and Transformers.js
 * is dynamically imported so its ~85MB weights and the runtime never touch the
 * initial bundle — they download once (then browser-cached) the first time a
 * scan needs recognition. Same API in Node (used by the index builder) and the
 * browser (onnxruntime-web), so behavior matches what was validated offline.
 */

const MODEL = "Xenova/clip-vit-base-patch32";

export interface ArtWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Cached across calls; the first call pays the load cost.
let ready: Promise<{
  processor: (img: unknown) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<{ image_embeds: { data: Float32Array } }>;
  RawImage: {
    new (data: Uint8ClampedArray | Uint8Array, w: number, h: number, c: number): {
      width: number;
      height: number;
      crop(box: [number, number, number, number]): Promise<unknown>;
    };
  };
}> | null = null;

async function load() {
  if (!ready) {
    ready = (async () => {
      const t = await import("@huggingface/transformers");
      const processor = await t.AutoProcessor.from_pretrained(MODEL);
      const model = await t.CLIPVisionModelWithProjection.from_pretrained(MODEL);
      return {
        processor: (img: unknown) => processor(img as never),
        model: (inputs: Record<string, unknown>) => model(inputs as never) as never,
        RawImage: t.RawImage as never,
      };
    })();
  }
  return ready;
}

/**
 * Embed the art window of a rectified card image, L2-normalized (matching the
 * index rows so cosine = dot product). `art` must be the same fractional window
 * the index was built with — read it from the index meta.
 */
export async function embedArt(image: ImageData, art: ArtWindow): Promise<Float32Array> {
  const { processor, model, RawImage } = await load();
  const raw = new RawImage(image.data, image.width, image.height, 4);
  const cropped = await raw.crop([
    Math.round(image.width * art.x0),
    Math.round(image.height * art.y0),
    Math.round(image.width * art.x1),
    Math.round(image.height * art.y1),
  ]);
  const inputs = await processor(cropped);
  const { image_embeds } = await model(inputs);
  const v = image_embeds.data;
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, (x) => x / n);
}
