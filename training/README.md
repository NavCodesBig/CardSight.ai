# CardSight AI — Model Training Plan

The shipping pipeline uses classical computer vision (edge detection, color
analysis, high-pass filtering) so it works with zero model weights. This
directory defines how the learned model replaces those heuristics as labeled
data accumulates.

## Why learn instead of hand-code

Hand-coded rules measure *signals* (whitening fraction, defect density).
Graders judge *condition* — a holo scratch and holo sparkle produce similar
pixel statistics but very different grades. A model trained on graded cards
learns that distinction directly from outcomes.

## Target architecture

Three heads over a shared backbone, plus a separate recognition model:

| Model | Task | Input | Output |
|---|---|---|---|
| `grade-head` | Grade regression | Rectified front + back (2×3×896×640) | Overall + 4 subgrades, uncertainty |
| `defect-head` | Defect segmentation | Rectified face | Per-pixel mask: scratch, whitening, crease, print-line, stain, dent |
| `quality-head` | Photo quality | Raw photo | usable / blurry / glare / dark |
| `card-id` | Recognition | Rectified front | Embedding → nearest neighbor against card DB (name, set, number, rarity, variant) |

Backbone: ConvNeXt-Tiny or EfficientNetV2-S, pretrained, fine-tuned. Export
to ONNX; serve via `onnxruntime-web` (client, WebGPU) or `onnxruntime-node`
behind `POST /api/analyze` (already stubbed).

The rectification step stays classical: it is reliable, interpretable, and
gives the model a canonical 63.5 × 88.9 mm aligned input — which also keeps
the millimeter measuring tool exact.

## Dataset

See `../datasets/README.md` for layout. Sources, in order of label quality:

1. **Slabbed cards** — photos of PSA/BGS/CGC-graded cards with cert numbers.
   Cert lookup gives authoritative overall + (BGS) subgrades. Crop the slab,
   rectify the card, store the label.
2. **Grading-company population archives** — auction listings (eBay, PWCC,
   Goldin) pair high-res photos with certified grades at scale.
3. **Self-labeled wear** — raw cards annotated in-house with polygon masks
   for the defect head (whitening, scratches, creases, holo wear).
4. **Synthetic augmentation** — programmatic damage (whitening brushes on
   corners/edges, scratch strokes, off-center crops) applied to clean scans.
   Cheap, perfectly labeled, ideal for pretraining the defect head.

Class balance targets per grade bucket (1–10): ≥500 cards each before the
grade head is trusted; holo/non-holo and vintage/modern stratified.

## Training loop

```
datasets/raw → rectify (lib/vision pipeline) → datasets/rectified
            → train/val/test split by card (not by photo!)
            → augment: lighting, white balance, mild blur, JPEG artifacts
            → fine-tune backbone + heads
            → calibrate uncertainty (temperature scaling on val)
            → export ONNX → models/
```

Key rules:

- **Split by physical card**, never by photo — the same card shot twice in
  train and test leaks condition.
- **Calibrate confidence.** The UI promises honest probabilities; apply
  temperature scaling so "87% PSA 10" means 87%.
- **Regression + ordinal loss** for grades (CORAL / CORN) — a 9 mistaken for
  8.5 must cost less than a 9 mistaken for 4.
- Track per-subgrade MAE and within-half-point accuracy as headline metrics.

## Segmentation detector (in progress — first trained model)

The card *detector* is the first heuristic being replaced: classical
first-strong-edge scanning locks onto clutter, art frames on full-bleed
scans, and textured backgrounds (see lib/vision/cardDetector.ts patches).
A tiny U-Net predicting the card silhouette fixes the whole failure class.

Pipeline (all pieces exist):

```
npx tsx scripts/gen-seg-data.ts          # synthetic composites + exact masks
python training/train_seg.py             # TinyUNet (~0.5M params), BCE+dice
    → training/out/card-seg.onnx         # browser-ready export
```

Training data is free: reference scans composited onto varied backgrounds
with pose/exposure/blur jitter; the composited alpha IS the mask. 15% of
samples are card-free negatives. Add real photos with hand-drawn masks
later to close the sim-to-real gap.

Runtime integration (once val-dice is convincing): mask → largest
quad-fit → replaces `detectCard`'s scanline stage, keeping the existing
rectification, refinement, and trust gates. Inference via onnxruntime-web
at 192×256 — sub-100 ms on a mid phone, and it also gives the live camera
overlay a true lock indicator.

## Integration seam

- `lib/analyze.ts` — swap heuristic scorers for model inference per face.
- `lib/recognition/identifier.ts` — `CardIdentifier` interface; implement
  `EmbeddingIdentifier` and replace the exported instance.
- `app/api/analyze/route.ts` — server inference endpoint, currently 501.

No UI changes required: every component consumes the `ScanResult` shape.
