# UI/UX Gauntlet — Seed (enhanced prompt)

## The raw ask (verbatim, do not "improve")
> The UX/UI is not satisfying. It should have a nice color scheme — the best ever UI/UX.
> Fire the gauntlet loop for it, but enhance the prompt first.

## The trap phrase
"Best ever UI/UX" and "nice color scheme" are meaningless until they are a rubric with a bar.
Convert them before round 1. "Looks nicer" is not a passing score; a rendered screen that clears
every dimension below is.

## Non-negotiable constraints (these bound the whole design)
1. **Hebrew-first, RTL.** The type must have real Hebrew glyphs, not a Latin font limping through
   Hebrew. Every number is Latin digits inside RTL text → bidi isolation is mandatory, not optional.
2. **Local-first / offline.** The home box may have no internet. **No runtime CDN** for fonts, CSS
   or JS — self-host every asset (woff2 in /public). A design that needs Google Fonts at load is
   disqualified.
3. **Theme-aware.** Light and dark are both first-class and both designed — dark is not an auto-flip.
4. **One process, server-rendered, hand-written CSS.** No framework, no build step, no Tailwind.
   The whole system is CSS custom properties + a single stylesheet.
5. **Money is sacred.** Prettiness may never cost legibility of a figure or truthfulness of a chart.
   The validated-palette rule from dataviz still binds: the two-state delta pair and every series
   color must pass the CVD validator, in both themes.

## The design direction (committed — the loop refines, it does not relitigate)
**"Calm private banking."** Not a loud consumer-fintech look; a quiet, premium, trustworthy one —
the feeling of a well-made statement from a bank you actually like. Concretely:
- **A signature brand color**, not generic bank-blue. Deep and confident, one hue that owns the app.
- **Warm paper**, not clinical white, in light; **true, soft dark**, not black, in dark.
- **One accent** for emphasis, used sparingly. Semantic colors (over/under, good/warn) stay separate
  from the brand hue so status never impersonates identity.
- **Generous space and rhythm** — an 8px spacing system, real vertical breathing room, a clear type
  scale. Density is the enemy of calm.
- **Soft depth** — considered shadows and radii, not flat and not skeuomorphic.
- **A proper Hebrew grotesque** (Assistant / Heebo / Rubik class), self-hosted.

## Frozen rubric — floor ≥ 8, weighted mean ≥ 9 (freeze before round 1)
| # | Dimension | ×W | 10 means |
|---|---|---|---|
| 1 | Color system | 2 | A named, cohesive palette; distinctive (not default blue); CVD-validated in both themes; brand vs. semantic cleanly separated |
| 2 | Typography | 2 | Real self-hosted Hebrew type; a deliberate scale; numbers tabular where aligned; nothing clipped or bidi-broken |
| 3 | Hierarchy & layout | 2 | The one thing that matters is the largest; 8px rhythm; the eye lands where it should in <2s |
| 4 | Depth & material | 1 | Shadows/radii/surfaces read as one considered system in both themes |
| 5 | Data-viz craft | 1 | Charts are beautiful and legible; bars/labels/axes obey the dataviz specs; nothing invisible |
| 6 | Cohesion | 1 | Every screen is unmistakably the same app; no orphan styles |
| 7 | Emotional tone | 2 | It feels calm, premium, trustworthy; a good month *feels* good and a bad one is honest, not alarming |

Weight total 11. Floor is the dimension that decides the run — a beautiful app with one clipped
number is not beautiful.

## The panel (design seats; each speaks first person, each tries to kill the screen)
1. **The Design Director** — "Would this ship at a company known for craft? What's the one thing
   that reads as amateur?" Judges the whole, not details.
2. **The Colorist** — owns the palette. "Is this a *system* or a pile of nice colors? Does it hold
   in dark? Does any status color collide with the brand?" Runs the CVD validator, quotes numbers.
3. **The Typographer** — "Is this real Hebrew type or a fallback? Where does the scale break? Show me
   a bidi number that lands wrong."
4. **The Data-viz Designer** — "Do the charts say something at a glance, or just decorate? Is any
   mark invisible, mislabeled, or lying?"
5. **The Spouse Who Didn't Ask For This** — still the adoption killer. "Do I *want* to open this? Does
   it feel like something made for me, or a spreadsheet with lipstick?"
6. **The Screenshot Test** — judges only rendered pixels, light AND dark, at 390px phone width. "The
   code is irrelevant. What does the picture look like?" No screen passes unrendered.

## Loop mechanics
Same as `../GAUNTLET.md`: BUILD → PANEL → SCORE → MANDATE, each round a full rebuild, rendered in
both themes on real data before the panel speaks. Exit on two consecutive clean passes with no
blocking finding, or round 6 with OPEN-RISKS. The Screenshot Test seat means a round is not scored
until the screens are actually rendered.

## Landmines (free findings so round 1 starts deep)
- A webfont that doesn't cover Hebrew → tofu/fallback; verify glyph coverage on real merchant names.
- Dark mode that just inverts → muddy brand color, dead shadows. Re-pick every token for dark.
- A brand color that's too close to the over/under semantic pair → status reads as brand. Keep them
  apart and prove it.
- Gradients and shadows that look great in light and turn to mud in dark.
- Over-designing the happy path and forgetting the empty/first-run and the long transaction list.

---

# Round 2 of the design loop — "premium product," not "styled screens"

The palette + type pass cleared the bar. The gap now is that it still reads as *a nicely styled
document*, not *a product*. Close that gap. Added dimensions (same floor ≥ 8):

| # | Dimension | 10 means |
|---|---|---|
| 8 | **Iconography & identity** | Every category has its own icon + tint; the app is scannable by shape and color, not just text. Consistent, restrained, premium — not a bag of clashing emoji. |
| 9 | **Motion** | Content arrives with intent — cards rise/fade in, bars grow from zero, staggered. Nothing janky, nothing gratuitous; respects `prefers-reduced-motion`. |
| 10 | **Signature moment** | The dashboard hero is a *moment*, not a number in a box — a considered focal composition someone would screenshot. |
| 11 | **Product affordances** | A real light/dark toggle (persisted), a footer, coherent empty/first-run, states that feel finished. |

## Landmines for this round
- Emoji soup: 13 random emoji at different visual weights looks cheap. Curate for one visual family,
  put each in a consistent tinted container so they read as a set.
- Motion that fights the user: no long delays before content is usable, no infinite loops, honor
  reduced-motion. Entrance only.
- A theme toggle that flashes the wrong theme on load (FOUC) or forgets the choice.
- Icon tints that fail contrast or collide with the over/under semantic colors.
