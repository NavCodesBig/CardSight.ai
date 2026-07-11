# Grade calibration set

Photos of cards whose professional grade is already known, used by
`scripts/calibrate-grades.ts` to measure how pipeline predictions track
reality (MAE, bias, range coverage) and to tune subgrade thresholds.

## Collecting cases

- Slabbed cards: photograph the card front and back through the case in
  even light (avoid label glare). The slab's grade is the ground truth.
- Pre-grading shots: photos taken before submission, labeled once the
  grade comes back — the highest-quality signal.
- Aim for 20+ cases across the ladder (2-10), heaviest on 7-9 where
  submit/don't-submit decisions actually happen.

## labels.json

```json
[
  { "front": "card1-front.jpg", "back": "card1-back.jpg", "grade": 8, "company": "PSA" }
]
```

Photos and labels.json are gitignored; only this README is tracked.

## Run

```
npx tsx scripts/calibrate-grades.ts
```
