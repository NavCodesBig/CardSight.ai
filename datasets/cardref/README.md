# Reference card database

The catalog the recognizer matches a scanned card against (Road B, `card-id`
in `../../training/README.md`). Generated, not committed, not shipped to the
client.

## Build

```
POKEMON_TCG_API_KEY=... npx tsx scripts/build-card-db.ts
```

The key is optional (it only raises the API rate limit). Output:

- `cards.ndjson` — one reference card per line (see `RefCard` in the script).
- `meta.json` — build timestamp, card count, source.

## Why it exists

The recognizer embeds a rectified card photo and finds the nearest reference
card **by art**, then reads that card's authoritative identity from here. Two
payoffs over the current OCR + name-dictionary path:

1. **Works when OCR can't** — glare, holo texture, and non-English prints defeat
   text reading but not art matching.
2. **Disambiguates reprints** — cards with identical art across sets (1999 Base
   Set Chansey vs 2016 Evolutions Chansey) are separated by `setId` /
   `releaseDate`, so the set and year come out right. This is the failure mode
   competitors show ("right name, wrong year").

## Next bricks

- `imageSmall` / `imageLarge` are the URLs to embed for the reference index.
- Build an embedding index (art → vector) over these rows.
- At scan time: embed the rectified front, nearest-neighbor against the index,
  return the matched `RefCard`.
