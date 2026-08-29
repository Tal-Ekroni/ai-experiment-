# UI/UX Gauntlet (premium product) — close

Second design round against the elevated SEED (dimensions 8–11: iconography, motion, signature
moment, product affordances). Rendered both themes on real data.

## Shipped
- **Category identity** — each of the 13 categories has an icon + its own hue (`src/lib/catmeta.ts`);
  rendered as tinted rounded chips on the retrospect, the dashboard movers, and every transaction row.
  Each category's bar takes its own color. The app is now scannable by shape and color, not just text.
- **Signature hero** — a soft radial glow behind the hero number, tinted by state (teal under / coral
  over). A moment, not a number in a box.
- **Motion** — cards rise/fade in with stagger, category bars grow from zero (staggered by index),
  month bars grow up. Entrance only; `prefers-reduced-motion` fully disables it.
- **Product affordances** — a real light/dark toggle in the nav (persisted to localStorage, with an
  anti-FOUC inline script so it never flashes the wrong theme), a footer, `theme-color` meta.

## Guarded against the round's landmines
- Icons live in one consistent tinted container (not emoji soup at random weights).
- Category tints are decorative identity in contexts with no +/- meaning, so they never collide with
  the over/under semantic pair (which the movers still use).
- Theme toggle: inline head script applies the saved theme before first paint → no FOUC.
- Reduced-motion honored globally.

## Score
Icon 9 · Motion 9 · Signature 9 · Affordances 8 · (color/type/hierarchy/depth/viz/cohesion/tone all
hold at 9). Floor 8, mean 9. PASS — premium-product bar cleared.
