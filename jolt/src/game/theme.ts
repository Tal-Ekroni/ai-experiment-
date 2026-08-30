/** OWNER: uxui agent. THE DESIGN SYSTEM — single source of truth for every
 *  pixel the shell and renderer paint. No surface may invent its own type
 *  size, color, spacing or easing: it consumes these tokens (TS constants for
 *  canvas/inline-style code, CSS custom properties for stylesheets).
 *
 *  The language in one breath:
 *   - GROUND    a night-blue radial vault (#06070b floor) — one world from the
 *               boot splash through the home screen into the run.
 *   - ONE ACCENT gold (#ffd76b). Gold is "go play": the CTA, the daily seed,
 *               the perfect band, the grade stamp, the bolt itself. Nothing
 *               else gets to be gold.
 *   - SEMANTICS success green and danger red exist only as verdicts (a life
 *               lost, a run survived) — never as chrome.
 *   - INK       a four-step lavender ramp; hierarchy comes from the ramp and
 *               the type scale, not from ad-hoc opacities.
 *   - MOTION    two easings (a swift settle and a springy overshoot), four
 *               durations. Everything enters low-and-rising, staggered by the
 *               STAGGER grid; nothing pops. prefers-reduced-motion kills all
 *               of it (the stylesheets guard it — tokens just name values).
 *
 *  index.html's boot splash runs before any JS, so it mirrors GROUND/GOLD by
 *  hand — a comment there points back here. tools/make-icon.mjs rasterises the
 *  same ground and gold into the installed icons.
 */

/** Rounded system stack — zero font assets, the same voice on every surface. */
export const FONT =
  "ui-rounded,'SF Pro Rounded',system-ui,-apple-system,'Segoe UI',sans-serif"

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export const COLOR = {
  /** Background ramp — floor, vault top, and the two card surfaces. */
  bg0: '#06070b',
  bgTop: 'hsl(228 45% 14%)',
  card0: '#161c33',            // card gradient top (near-opaque, no ghosting)
  card1: '#0a0d1b',            // card gradient bottom

  /** Ink ramp — brightest to faintest. */
  ink: '#f4f7ff',
  ink2: '#aab8e8',
  ink3: '#7c89b4',
  ink4: '#525e8c',

  /** THE accent. Gold means "go play". */
  gold: '#ffd76b',
  goldHot: '#ffc23c',
  onGold: '#231600',           // ink on a gold fill

  /** Semantic verdicts. */
  good: '#5ce88f',
  bad: '#ff5c66',
  badSoft: '#ff8b93',
  badTint: '#ffd9dc',          // palest danger — body text on a death ground
  info: '#66ccff',             // the inhibit family (DO NOTHING)
  infoSoft: '#9fe6ff',

  /** The wordmark's cool endpoint (JOLT fades white → this). */
  mark: '#9fb4ff',
} as const

/** Accent + verdict hues for canvas work (render.ts) — the SAME family as the
 *  hex tokens above, expressed for hsl() composition. gold=48 IS the perfect
 *  band, the grade stamp and the teach-card gold: one gold everywhere. */
export const HUE = { gold: 48, good: 145, bad: 355, info: 205 } as const

/** Shared ground gradients (also mirrored by index.html's pre-JS splash). */
export const GROUND = `radial-gradient(120% 90% at 50% 15%, ${COLOR.bgTop}, ${COLOR.bg0})`
export const GROUND_DEEP = 'radial-gradient(120% 90% at 50% 15%, #101322, #04050a)'

// ---------------------------------------------------------------------------
// Type ramp — phone-first; every size is a clamp so it breathes with viewport.
// ---------------------------------------------------------------------------

export const TYPE = {
  display: 'clamp(56px,17vw,110px)',   // the wordmark
  score: 'clamp(64px,20vw,130px)',     // the run's number — the biggest thing
  title: 'clamp(24px,7vw,42px)',       // card headings, big verdicts
  cta: 'clamp(17px,4.6vw,22px)',       // the one gold action
  body: 'clamp(14px,3.6vw,17px)',
  label: 'clamp(12px,3vw,15px)',       // buttons, chips
  caption: 'clamp(11px,2.8vw,13px)',   // tags, stat captions
  micro: '10px',                       // key legends, footnotes
} as const

/** Tracking steps. Wide tracking is reserved for caps-caption voice. */
export const TRACK = { tight: '.02em', norm: '.08em', wide: '.14em', caps: '.24em' } as const

// ---------------------------------------------------------------------------
// Space & shape — 4px grid.
// ---------------------------------------------------------------------------

export const SPACE = { s1: '4px', s2: '8px', s3: '12px', s4: '16px', s5: '24px', s6: '32px', s7: '48px' } as const
export const RADIUS = { card: '26px', pill: '999px' } as const

// ---------------------------------------------------------------------------
// Motion — two easings, four durations, one stagger grid.
// ---------------------------------------------------------------------------

export const MOTION = {
  /** Swift settle: entrances/settles that must not bounce. */
  swift: 'cubic-bezier(.16,.84,.28,1)',
  /** Springy overshoot: celebratory arrivals (stamps, pops, the CTA). */
  spring: 'cubic-bezier(.22,1.4,.36,1)',
  fast: '140ms',
  med: '260ms',
  slow: '460ms',
  grand: '700ms',
  /** The stagger grid: child n of a staged screen enters at n * step. */
  step: 60,                     // ms
} as const

// ---------------------------------------------------------------------------
// CSS custom properties + install
// ---------------------------------------------------------------------------

/** The token sheet as :root custom properties — the names the stylesheets in
 *  shell.ts (and any future surface) consume. */
export function themeCss(): string {
  return `:root{
  --j-font:${FONT};
  --j-bg0:${COLOR.bg0};
  --j-ground:${GROUND};
  --j-ground-deep:${GROUND_DEEP};
  --j-scrim:rgba(3,5,10,.72);
  --j-card:linear-gradient(180deg,${COLOR.card0} 0%,${COLOR.card1} 100%);
  --j-edge:rgba(163,178,236,.16);
  --j-edge-soft:rgba(163,178,236,.09);
  --j-ink:${COLOR.ink};
  --j-ink2:${COLOR.ink2};
  --j-ink3:${COLOR.ink3};
  --j-ink4:${COLOR.ink4};
  --j-gold:${COLOR.gold};
  --j-gold-hot:${COLOR.goldHot};
  --j-on-gold:${COLOR.onGold};
  --j-good:${COLOR.good};
  --j-bad:${COLOR.bad};
  --j-bad-soft:${COLOR.badSoft};
  --j-info:${COLOR.info};
  --j-info-soft:${COLOR.infoSoft};
  --j-mark:${COLOR.mark};
  --j-t-display:${TYPE.display};
  --j-t-score:${TYPE.score};
  --j-t-title:${TYPE.title};
  --j-t-cta:${TYPE.cta};
  --j-t-body:${TYPE.body};
  --j-t-label:${TYPE.label};
  --j-t-caption:${TYPE.caption};
  --j-t-micro:${TYPE.micro};
  --j-tr-tight:${TRACK.tight};
  --j-tr-norm:${TRACK.norm};
  --j-tr-wide:${TRACK.wide};
  --j-tr-caps:${TRACK.caps};
  --j-s1:${SPACE.s1};--j-s2:${SPACE.s2};--j-s3:${SPACE.s3};--j-s4:${SPACE.s4};
  --j-s5:${SPACE.s5};--j-s6:${SPACE.s6};--j-s7:${SPACE.s7};
  --j-r-card:${RADIUS.card};
  --j-r-pill:${RADIUS.pill};
  --j-swift:${MOTION.swift};
  --j-spring:${MOTION.spring};
  --j-fast:${MOTION.fast};
  --j-med:${MOTION.med};
  --j-slow:${MOTION.slow};
  --j-grand:${MOTION.grand};
}`
}

/** Idempotently install the token sheet. Both the Renderer and the Shell call
 *  this from their constructors, so whichever is built first grounds the page. */
export function installTheme(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('jolt-theme')) return
  const st = document.createElement('style')
  st.id = 'jolt-theme'
  st.textContent = themeCss()
  document.head.append(st)
}

/** The bolt mark, as inline SVG markup — the SAME path as the favicon, the
 *  boot splash and the installed icon. `size` is any CSS length. */
export function boltSvg(size: string, glow = true): string {
  const f = glow ? `filter:drop-shadow(0 0 18px rgba(255,205,90,.55));` : ''
  return `<svg viewBox="0 0 64 64" style="width:${size};height:auto;${f}" aria-hidden="true">` +
    `<path d="M36 6 14 38h12l-4 20 24-34H32z" fill="${COLOR.gold}"/></svg>`
}
