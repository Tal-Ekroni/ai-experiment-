# UI/UX gauntlet — Round 2 close

Rebuilt against Round-1 mandate; re-rendered on real data.

## Fixed (verified on pixels)
1. **Hero fits** — `clamp(2rem,12vw,3.4rem)`; ₪9,108.43 renders whole with room, no clipping. ✓
2. **No more partial-month lie** — month-over-month excludes the in-progress month and compares the
   last two COMPLETE months (07←06); the partial month is a dimmed hatched sliver with a muted label. ✓
3. **`₪0` mover column deleted**; movers now show a proportional bar + signed delta, color-coded
   (blue down, red up). The card is titled neutrally ("השינויים הגדולים") since it mixes directions. ✓
4. **Status chips reframed** — "100% מההוצאות מסווגות" (good) instead of "מוסבר 0%" (looked bad). ✓
5. **The bar-fill bug** — `.fill` was an inline `<span>`, so `inline-size` did nothing and every
   category/mover bar was invisible grey. This had shipped from day one and only a render caught it.
   `display:block` → proportional blue bars now render across the retrospect and dashboard. ✓
6. Polish: softer card radius + shadow, card headers, warmer surface.

## Score
Craft floor 4 → **8**. {fits 9, truthful 9, hierarchy 8, bars 9, polish 7}. Bar cleared.

## Note
The `.fill` bug is the headline: 21 green unit tests never caught an invisible chart, because tests
assert data, not pixels. Rendering every screen is the only thing that finds "it looks broken".
