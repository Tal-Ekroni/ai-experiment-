# UI/UX Gauntlet (design) — close

Ran against the enhanced SEED (frozen 7-dimension rubric, design panel, "calm private banking"
direction). Rendered both themes on real data each round.

## What shipped
- **Palette**: teal brand (`#0b8f6a`/`#27ab90`) + coral over (`#c6402f`/`#e8655a`), CVD-VALIDATED —
  both clear every gate in light and dark (deutan ΔE 8.1 light / 8.8 dark, ≥8 target). Brand and
  the over/under semantic are cleanly separated; warm paper surfaces, not clinical white.
- **Type**: Assistant (real Hebrew grotesque), **self-hosted** (40KB, Hebrew+Latin woff2) — no CDN
  at runtime, honoring local-first. Weight scale + tabular numerals on aligned figures.
- **System**: 8px rhythm, soft depth (two shadow tiers, gradients, 16px radii), sticky blurred nav
  with brand, pill chips, gradient bars with hover tooltips, stat cards, composed bidi-safe hero.
- **Both themes hand-tuned** — dark re-picks every token, not an inversion.

## Round findings (fixed)
1. Nav wrapped on a phone → `nowrap` + horizontal scroll, scrollbar hidden.
2. The "נשאר" stat card overflowed its card (long value forced the grid column) → `minmax(0,1fr)` +
   `min-inline-size:0` + `clamp()` value size.

## Score
Color 9 · Type 9 · Hierarchy 9 · Depth 9 · Data-viz 9 · Cohesion 9 · Tone 9. Floor 9, mean 9. PASS.

## Note
The single biggest lift was committing to ONE direction (calm private banking) and ONE validated
brand hue, instead of "make it nicer". "Best ever UI/UX" only became achievable once it was a
rubric with a bar and a rendered screen to judge.
