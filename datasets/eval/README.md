# Recognition eval set

Ground-truth photos for measuring the recognizer (`scripts/eval-recognition.ts`).
Your photos and `labels.json` are gitignored; only this README and
`labels.example.json` are tracked.

## Setup

1. Drop card photos here (front face; JPEG/PNG). Aim for ~50, varied: holo and
   non-holo, vintage and modern, some with glare/angle — the hard cases.
2. Write `labels.json` — an array of cases (see `labels.example.json`):

   ```json
   [
     { "image": "chansey-front.jpg", "name": "Chansey", "set": "Evolutions", "number": "2" }
   ]
   ```

   - `image` — filename relative to this folder.
   - `name` — required ground truth.
   - `set`, `number` — optional; `set` is scored when present.
   - `rectified` — set `true` if the image is already a clean card crop
     (skips card detection).

3. Build the index if you haven't:

   ```
   npx tsx scripts/build-card-db.ts
   npx tsx scripts/build-embedding-index.ts
   ```

4. Run:

   ```
   npx tsx scripts/eval-recognition.ts
   ```

## Reading the output

Top-1 name/set accuracy plus per-case hits/misses. Split by physical card if you
add multiple shots of one card — never let the same card land in both a tuning
set and a test set.

This cut matches on **art only** (CLIP). The OCR name/number re-rank — which
separates identical-art reprints — is added once `ocr.ts` runs headless.
