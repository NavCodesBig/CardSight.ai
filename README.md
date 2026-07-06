# CardSight AI

AI-powered trading card evaluation and pre-grading platform. Photograph the
front and back of a Pokémon card and get a transparent, measurement-backed
grade estimate — centering to 0.1 mm, corner/edge/surface inspection, a
damage heatmap, and likely PSA / BGS / CGC grades with confidence scores.

> CardSight produces **AI pre-grade estimates from photos**, not official
> grades. It is a submission-decision tool, not a replacement for PSA/BGS/CGC.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

Production: `npm run build && npm start`.
Pipeline self-test: `npx tsx scripts/verify-pipeline.ts` (synthetic card with
known ground truth through the real vision pipeline).

## Deploy to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. [vercel.com/new](https://vercel.com/new) → import the repo. Next.js is
   auto-detected; no build settings needed.
3. Add one environment variable (Production + Preview):
   `NEXT_PUBLIC_SITE_URL` = your deployment URL (e.g.
   `https://cardsight.vercel.app`). Drives Open Graph URLs, robots.txt and
   sitemap.xml.
4. Deploy. Or from the CLI: `npx vercel --prod`.

Ships with: security headers (`next.config.ts`), PWA manifest + icons,
Open Graph / Twitter cards (`app/opengraph-image.tsx`), robots + sitemap,
safe-area insets and mobile camera capture. No database or secrets required —
analysis is fully client-side.

## How it works

1. **Capture** — front + back photos (file, drag-drop, or phone camera).
2. **Quality gate** — blur (variance of Laplacian), glare, exposure and
   framing checks; bad photos are rejected with specific guidance.
3. **Detection & rectification** — Sobel gradients → robust line fits per
   side → corner intersection → perspective warp to a canonical 635 × 889 px
   image (exactly 0.1 mm/px against the 63.5 × 88.9 mm card standard).
4. **Measurement** — border thicknesses in millimeters, centering ratios,
   CAD-style dimension overlays with lossless zoom.
5. **Condition analysis** — four graded categories:
   - *Centering*: inner-frame detection per side, PSA-standard scoring
   - *Corners*: per-corner whitening against reference border color
   - *Edges*: whitening + nick detection along each edge strip
   - *Surface*: high-pass anomaly mask → heatmap, print-line and scratch
     detection, holo-aware thresholds, gloss consistency
6. **Grading** — weighted blend (centering 25%, corners 25%, edges 20%,
   surface 30%) capped at the weakest subgrade + 1.5; company-ladder
   probability distributions; plain-English explanation of every point lost.

Everything runs **client-side** — photos never leave the browser. The
`/api/analyze` route is the seam for server-side model inference later.

## Project structure

```
app/                # Next.js App Router pages + API routes
  scan/             # capture flow
  results/[id]/     # grading report
  dashboard/        # scan history, stats, favorites
  api/analyze/      # future server inference endpoint
components/
  scanner/          # capture zone, processing overlay
  results/          # centering viz, measurement overlay, damage map, estimates
  dashboard/        # (reserved)
  layout/ ui/       # navbar, particles, glass primitives
lib/
  vision/           # detection, rectification, quality, centering, corners,
                    # edges, surface — pure functions over ImageData
  measurement/      # px↔mm calibration engine
  grading/          # scale, calculator, company estimates, explanations
  recognition/      # card identifier (heuristic now, ML seam)
  analyze.ts        # pipeline orchestrator
  storage.ts        # scan persistence (localStorage now, DB-ready interface)
hooks/              # useTheme
training/           # model training plan
datasets/           # dataset layout + labeling rules
models/             # trained artifacts (ONNX), empty pre-training
```

## Design principles

- **Explain every grade.** No bare numbers — each subgrade ships with the
  measurements and findings that produced it.
- **Honest confidence.** Estimates carry calibrated confidence; poor photos
  lower it or block analysis entirely.
- **Separation of concerns.** Vision, measurement, grading, recognition and
  storage are independent modules behind typed interfaces; the UI only
  consumes `ScanResult`.
- **Future-ready.** Marketplace, collections, price history, population
  reports and mobile all hang off the same `ScanResult`/storage seams; the
  recognition and grading heuristics swap for trained models without UI
  changes (see `training/README.md`).

## Roadmap

- [ ] Fine-tuned grade + defect models (ONNX, WebGPU)
- [ ] Card recognition against a full card database
- [ ] Accounts, cloud collections, portfolio analytics
- [ ] Price history & population report integration
- [ ] Additional games: sports, Yu-Gi-Oh!, MTG, Lorcana, One Piece
- [ ] Native mobile capture with live outline guidance
