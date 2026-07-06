# Datasets

Labeled images for training the CardSight vision models. Nothing in this
directory ships to the client.

## Layout

```
datasets/
  raw/                      # untouched source photos
    psa/<cert-number>/front.jpg back.jpg meta.json
    bgs/<cert-number>/...
    cgc/<cert-number>/...
    ungraded/<uuid>/...
  rectified/                # canonical 635×889 crops from lib/vision
    <same structure>
  masks/                    # defect segmentation labels (PNG, palette-coded)
    <uuid>/front_mask.png back_mask.png
  splits/
    train.txt val.txt test.txt   # card IDs, split by physical card
```

## meta.json schema

```json
{
  "game": "pokemon",
  "name": "Charizard",
  "set": "Base Set",
  "number": "4/102",
  "language": "EN",
  "holo": "holo",
  "grader": "PSA",
  "cert": "12345678",
  "overall": 9,
  "subgrades": { "centering": 9, "corners": 9.5, "edges": 8.5, "surface": 9 },
  "source": "auction|self|submission",
  "capture": { "device": "iPhone 15 Pro", "lighting": "diffuse-daylight" }
}
```

`subgrades` is null for PSA/CGC unless derived; BGS slabs include all four.

## Defect mask palette

| Index | Class |
|---|---|
| 0 | clean |
| 1 | corner whitening |
| 2 | edge whitening |
| 3 | scratch |
| 4 | holo scratch |
| 5 | crease / bend |
| 6 | print line |
| 7 | stain / dirt |
| 8 | dent / pressure mark |

## Contribution rules

- Photograph front AND back, flat, diffuse light, ≥ 2000 px long edge.
- One physical card = one ID everywhere; never split its photos across
  train/test.
- Verify cert numbers against the grader's public lookup before labeling.
