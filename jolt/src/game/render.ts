/** OWNER: art agent. DOM + CSS + canvas, zero external assets — no font files,
 *  no images, no fetches. Every state change animates with intent, and the
 *  command stays readable in a fraction of a second by a panicking player.
 *  Renderer surface kept intact: constructor(root) + sync(state). All
 *  change-detection happens inside sync() by diffing the previous frame's
 *  state, so the engine contract is untouched.
 *
 *  VISUAL ENERGY IS RE-ANCHORED: intensity() reaches full boil at command 116,
 *  but the median player dies near 65 and the casual near 32 — so the renderer
 *  drives its energy from energyOf(), which crosses a full arc inside the
 *  first ~45 commands (ambient density, ring weight, background heat, halo
 *  speed) while intensity() still carries the late-game hue climb. The screen
 *  is alive from command one: a drifting mote field, a breathing aurora, two
 *  slow halo sweeps and ring satellites all exist at t=0 and thicken visibly
 *  by t=30.
 *
 *  COMMAND FAMILIES read differently before the words are parsed:
 *   - touch  (tap/swipes/hold/pinch): cool accents; swipes slide IN the
 *     commanded direction, taps pop from center.
 *   - motion (twist/shake/flip): warm accents, the screen edges glow warm
 *     ("use the phone itself"), and the label enters the way the phone must
 *     move — twist rotates in, shake jitters in, flip somersaults in.
 *   - inhibit (DO NOTHING): the world HOLDS ITS BREATH — cold blue, halos
 *     pause, motes and embers hang frozen mid-air, the ring is a static
 *     dashed circle. Stillness itself is the signal.
 *
 *  PERFORMANCE: all particles come from fixed preallocated pools (swap-kill,
 *  zero allocation per frame); DOM text/style writes are cached and only
 *  touched on change; ambient chrome is CSS-composited (transform/opacity). */
import { GameState, ModeId } from './types'
import { intensity, PERFECT_FRAC } from './commands'
import { ghostScoreAt } from './engine'

type Family = 'touch' | 'motion' | 'inhibit'

/** Per-action accent hue + oversized backdrop glyph + family. The glyph sits
 *  BEHIND the text at low opacity — a pre-attentive directional cue (arrows
 *  for swipes) that never competes with the label. Glyphs are plain unicode
 *  present in every system font. */
const ART: Record<string, { hue: number; glyph: string; fam: Family }> = {
  'tap':         { hue: 145, glyph: '',  fam: 'touch' },   // the default verb needs no icon
  'swipe-up':    { hue: 200, glyph: '▲', fam: 'touch' },
  'swipe-down':  { hue: 215, glyph: '▼', fam: 'touch' },
  'swipe-left':  { hue: 188, glyph: '◀', fam: 'touch' },
  'swipe-right': { hue: 188, glyph: '▶', fam: 'touch' },
  'twist':       { hue: 45,  glyph: '↻', fam: 'motion' },
  'shake':       { hue: 25,  glyph: '≈', fam: 'motion' },
  'hold':        { hue: 275, glyph: '◉', fam: 'touch' },
  'release':     { hue: 275, glyph: '○', fam: 'touch' },
  'pinch':       { hue: 320, glyph: '›‹', fam: 'touch' },
  'flip':        { hue: 10,  glyph: '⇅', fam: 'motion' },
  'none':        { hue: 205, glyph: '✕', fam: 'inhibit' },
}

const INHIBIT_COLOR = '#66ccff'
const TAU = Math.PI * 2
const MAX_POOL = 150    // sparks + embers, preallocated
const MAX_MOTES = 34    // always-on ambient field, preallocated

/** PERFECT layer look: gold, distinct from every command family hue. */
const PERFECT_HUE = 48

/** Ghost pacer gauge: a score gap of this many points swings the YOU marker to
 *  full deflection (~4-8 commands' worth — the band where a race feels live),
 *  and the swing itself spans ±30% of the circle either side of 12 o'clock. */
const GHOST_SPAN = 220
const GHOST_SWING = TAU * 0.3

/** Ghost pacer persistence: the per-command score trace of your best run per
 *  mode, stored by the renderer (pure engine state in, localStorage out — the
 *  engine itself stays storage-free for the headless harnesses). */
const GHOST_KEY = 'jolt.ghost.v1'
interface GhostRec { score: number; trace: number[] }

function loadGhosts(): Partial<Record<ModeId, GhostRec>> {
  try {
    const raw = localStorage.getItem(GHOST_KEY)
    if (!raw) return {}
    const m = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Record<ModeId, GhostRec>> = {}
    for (const k of ['classic', 'sudden', 'zen', 'daily'] as ModeId[]) {
      const g = m && typeof m === 'object' ? (m as Record<string, unknown>)[k] : null
      if (g && typeof g === 'object') {
        const score = Number((g as Record<string, unknown>).score)
        const tr = (g as Record<string, unknown>).trace
        if (Number.isFinite(score) && score > 0 && Array.isArray(tr)) {
          const trace = tr.map(Number).filter((n) => Number.isFinite(n) && n >= 0)
          if (trace.length) out[k] = { score, trace }
        }
      }
    }
    return out
  } catch { return {} }
}
function saveGhosts(g: Partial<Record<ModeId, GhostRec>>): void {
  try { localStorage.setItem(GHOST_KEY, JSON.stringify(g)) } catch { /* private mode */ }
}

/** Visual energy 0..1. Re-anchored so a 30-command run sees a real arc:
 *  ~0.05 at command 1, ~0.2 at 6, ~0.35 at 12, ~0.7 at 30, saturating near 45.
 *  Never below intensity(), so the late game keeps everything it had. */
const energyOf = (issued: number, i: number): number =>
  Math.max(i, Math.min(1, Math.pow(Math.max(0, issued) / 45, 0.8)))

/** Background heat hue: night-blue → violet → red. Early motion comes from
 *  energy, the late-game climb into red from intensity. */
const heatHue = (e: number, i: number): number => 228 + e * 48 + i * 64

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; max: number; size: number; hue: number
  kind: 'spark' | 'ember'
}
interface Mote { x: number; y: number; vx: number; vy: number; ph: number; size: number }

/** Cached MediaQueryList — reading .matches is free, re-creating it per frame
 *  is not, and it stays live (updates if the OS setting changes mid-session). */
const rmQuery: MediaQueryList | null =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
const reducedMotion = (): boolean => !!rmQuery && rmQuery.matches

export class Renderer {
  private root: HTMLElement
  private shaker = document.createElement('div')     // whole-screen punch target
  private beatEl = document.createElement('div')     // beat-locked ground pulse (engine clock)
  private aurora = document.createElement('div')     // breathing radial glow (CSS-animated)
  private halo = document.createElement('div')       // slow conic sweep, clockwise
  private halo2 = document.createElement('div')      // slower counter-rotating sweep
  private fx = document.createElement('canvas')      // full-screen particles
  private ring = document.createElement('canvas')    // timer ring + orbiters
  private glyph = document.createElement('div')      // faded action icon behind text
  private kicker = document.createElement('div')     // "JOLT" title on idle/over
  private label = document.createElement('div')      // THE command — always center
  private sub = document.createElement('div')        // verdict / score line
  private combo = document.createElement('div')      // streak counter, bottom center
  private chainEl = document.createElement('div')    // perfect-chain counter, above combo
  private hud = document.createElement('div')
  private scoreEl = document.createElement('div')
  private livesEl = document.createElement('div')
  private flash = document.createElement('div')
  private vignette = document.createElement('div')
  private edgeL = document.createElement('div')      // warm side-glow: "motion command"
  private edgeR = document.createElement('div')
  private ctx: CanvasRenderingContext2D
  private fxCtx: CanvasRenderingContext2D

  // previous-frame state, for detecting what just happened
  private pIssued = -1
  private pScore = 0
  private pPhase = ''
  private pInhibit = false
  private pRuntime = 0
  private phaseChangedAt = 0
  private freezeT = 0            // runtime at which the inhibit freeze began
  private wasFrozen = false
  private idleAnim: Animation | null = null
  private pChain = 0             // previous frame's perfect chain, for break detection

  // Ghost pacer: the best run's score trace for the mode being played.
  private ghost: { score: number; trace: number[] } | null = null
  private ghostMode: ModeId | null = null
  private ghostBeaten = false

  // DOM write caches — touch the DOM only when a value actually changes
  private bgCache = ''
  private ambientCache = ''
  private ambientPlay = ''
  private edgeCache = ''
  private cLabel = ''
  private cLabelColor = ''
  private cSub = ''
  private cGlyph = ''
  private cScore = ''
  private cCombo = ''
  private cChain = ''
  private cBeatOp = ''

  // fixed particle pools — zero allocation per frame
  private pool: Particle[] = []
  private alive = 0              // pool[0..alive) are live, swap-kill keeps it packed
  private motes: Mote[] = []
  private emberCarry = 0

  constructor(root: HTMLElement) {
    this.root = root
    this.root.style.cssText =
      'position:fixed;inset:0;overflow:hidden;font-family:' +
      'ui-rounded,system-ui,-apple-system,sans-serif;color:#fff;'

    this.shaker.style.cssText =
      'position:absolute;inset:0;display:grid;place-items:center;will-change:transform'

    // Beat pulse: a soft glow rising from the floor that fires ON the musical
    // grid (GameState.beatPhase) — the beat is seen, not only heard. Opacity
    // only: composited, one cached style write per visible change.
    this.beatEl.style.cssText =
      'position:absolute;inset:0;pointer-events:none;will-change:opacity;opacity:0'

    // Ambient chrome: pure CSS animation (keyframes live in index.html) on
    // composited properties — alive from frame zero at no per-frame JS cost.
    this.aurora.className = 'jr-anim'
    this.aurora.style.cssText =
      'position:absolute;inset:-12%;pointer-events:none;will-change:transform,opacity;' +
      'animation:jrBreathe 6.5s ease-in-out infinite'
    this.halo.className = 'jr-anim'
    this.halo.style.cssText =
      'position:absolute;width:min(120vw,120vh);height:min(120vw,120vh);border-radius:50%;' +
      'pointer-events:none;will-change:transform;animation:jrSpin 30s linear infinite'
    this.halo2.className = 'jr-anim'
    this.halo2.style.cssText =
      'position:absolute;width:min(150vw,150vh);height:min(150vw,150vh);border-radius:50%;' +
      'pointer-events:none;will-change:transform;animation:jrSpinR 44s linear infinite'

    this.fx.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
    this.fx.width = 640; this.fx.height = 360

    this.vignette.style.cssText =
      'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .25s;' +
      'background:radial-gradient(120% 100% at 50% 50%, transparent 55%, rgba(255,30,40,.42) 100%)'

    this.flash.style.cssText =
      'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .18s'

    const edgeCss =
      'position:absolute;top:0;bottom:0;width:min(13vw,96px);pointer-events:none;' +
      'opacity:0;transition:opacity .22s;will-change:opacity'
    this.edgeL.style.cssText = edgeCss + ';left:0'
    this.edgeR.style.cssText = edgeCss + ';right:0'

    this.ring.width = 520; this.ring.height = 520
    this.ring.style.cssText =
      'position:absolute;width:min(80vw,80vh);height:min(80vw,80vh);pointer-events:none'

    this.glyph.style.cssText =
      'position:absolute;font-weight:800;line-height:1;pointer-events:none;' +
      'font-size:min(46vw,46vh);opacity:.1;user-select:none'

    this.kicker.style.cssText =
      'position:absolute;top:26%;left:0;right:0;text-align:center;font-weight:800;' +
      'font-size:clamp(15px,3.4vw,24px);letter-spacing:.55em;text-indent:.55em;opacity:.55'

    this.label.style.cssText =
      'position:relative;z-index:2;font-weight:800;letter-spacing:.02em;text-align:center;' +
      'font-size:clamp(30px,9vw,76px);text-shadow:0 4px 24px rgba(0,0,0,.55);' +
      'padding:0 14px;will-change:transform'

    this.sub.style.cssText =
      'position:absolute;top:calc(50% + clamp(30px,7.5vw,64px));left:0;right:0;z-index:2;' +
      'text-align:center;font-weight:700;font-size:clamp(14px,3.4vw,24px);' +
      'letter-spacing:.14em;opacity:0;transition:opacity .15s;text-shadow:0 2px 12px rgba(0,0,0,.6)'

    this.combo.style.cssText =
      'position:absolute;bottom:max(26px,env(safe-area-inset-bottom));left:0;right:0;' +
      'text-align:center;font-weight:800;opacity:0;will-change:transform;' +
      'font-size:clamp(18px,4.6vw,34px);transition:opacity .2s'

    // Perfect-chain counter: a quiet gold line above the streak counter — the
    // mastery ladder's rung count, never competing with the command label.
    this.chainEl.style.cssText =
      'position:absolute;bottom:calc(max(26px,env(safe-area-inset-bottom)) + clamp(34px,9vw,60px));' +
      'left:0;right:0;text-align:center;font-weight:800;opacity:0;will-change:transform;' +
      'font-size:clamp(13px,3.4vw,20px);letter-spacing:.22em;text-indent:.22em;' +
      'transition:opacity .2s'

    this.hud.style.cssText =
      'position:absolute;top:max(18px,env(safe-area-inset-top));left:0;right:0;' +
      'display:flex;justify-content:space-between;align-items:center;padding:0 22px;' +
      'font-weight:700;font-size:clamp(16px,3.2vw,22px)'
    this.scoreEl.style.cssText = 'min-width:3ch;will-change:transform'
    this.livesEl.style.cssText = 'display:flex;gap:7px;align-items:center'
    for (let k = 0; k < 3; k++) {
      const dot = document.createElement('span')
      dot.style.cssText =
        'width:13px;height:13px;border-radius:50%;background:#fff;display:inline-block;' +
        'box-shadow:0 0 8px rgba(255,255,255,.6);transition:background .2s,box-shadow .2s'
      this.livesEl.append(dot)
    }
    this.hud.append(this.scoreEl, this.livesEl)

    this.shaker.append(this.beatEl, this.aurora, this.halo, this.halo2, this.fx, this.vignette,
      this.flash, this.edgeL, this.edgeR, this.ring, this.glyph, this.kicker,
      this.label, this.sub, this.combo, this.chainEl, this.hud)
    this.root.append(this.shaker)
    this.ctx = this.ring.getContext('2d')!
    this.fxCtx = this.fx.getContext('2d')!

    // Preallocate every particle this renderer will ever use.
    for (let k = 0; k < MAX_POOL; k++) {
      this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, hue: 0, kind: 'spark' })
    }
    const W = this.fx.width, H = this.fx.height
    for (let k = 0; k < MAX_MOTES; k++) {
      this.motes.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4, vy: -(0.15 + Math.random() * 0.5),
        ph: Math.random() * TAU, size: 0.7 + Math.random() * 1.5,
      })
    }
  }

  sync(s: GameState): void {
    // Machine-readable state mirror for the front-door QA harness: lets a bot
    // play the real page (no ?headless= hook) and still see command identity
    // changes, including deliberate back-to-back repeats of the same label.
    const d = document.documentElement.dataset
    d.phase = s.phase
    d.issued = String(s.issued)
    d.action = s.command ? s.command.action : ''
    d.chain = String(s.chain)
    d.perfect = s.lastPerfect ? '1' : '0'

    // Ghost pacer bookkeeping: arm the ghost when a run starts, bank the trace
    // when one ends. Both keyed on phase transitions, so posed frames (which
    // jump straight into 'awaiting') behave deterministically too.
    // DAILIES ARE EXCLUDED from ghost racing, deliberately: every daily is a
    // DIFFERENT seeded sequence, so yesterday's trace would pace commands that
    // never happen today — a race that only pretends to be fair. The daily's
    // chase target is its streak and the shared seed, not a ghost.
    if (s.phase === 'awaiting' && this.pPhase !== 'awaiting' && this.pPhase !== 'resolved') {
      const g = s.mode !== 'daily' ? loadGhosts()[s.mode] : null
      this.ghost = g && g.score > 0 && g.trace.length ? g : null
      this.ghostMode = s.mode
      this.ghostBeaten = false
    }
    if (s.phase === 'over' && this.pPhase !== 'over' && s.trace.length && s.score > 0 &&
        s.mode !== 'daily') {
      const all = loadGhosts()
      const prev = all[s.mode]
      if (!prev || s.score > prev.score) {
        all[s.mode] = { score: s.score, trace: s.trace.slice(0, 400) }
        saveGhosts(all)
      }
    }

    const i = intensity(s.rampIssued)
    const e = energyOf(s.rampIssued, i)
    const art = (s.command && ART[s.command.action]) || ART['tap']
    const inhibit = s.phase === 'awaiting' && !!s.command && s.command.inhibit
    // A jump of more than 250ms of game time in one sync means the state was
    // POSED (screenshot harness) rather than played: render the at-rest frame —
    // no mid-flight tweens — and pre-seed the ambient field to its steady state.
    const posed = s.runtime - this.pRuntime > 250
    this.setSnap(posed)

    if (s.phase !== this.pPhase) this.phaseChangedAt = s.runtime
    if (inhibit && !this.wasFrozen) this.freezeT = s.runtime
    this.wasFrozen = inhibit

    this.paintBackground(s, i, e, inhibit)
    this.syncBeat(s, e, inhibit)
    this.syncLabel(s, art, inhibit, posed)
    this.syncEdges(s, art, inhibit)
    this.syncHud(s, i, e)
    this.syncCombo(s, e)
    this.syncChain(s, posed)
    this.detectEvents(s, art, posed)
    this.drawRing(s, e, art.hue, inhibit)
    if (posed) this.seedAmbient(e, i)
    this.drawFx(s, i, e, inhibit)

    this.pIssued = s.issued
    this.pScore = s.score
    this.pPhase = s.phase
    this.pRuntime = s.runtime
    this.pChain = s.chain
    if (s.command) this.pInhibit = s.command.inhibit
  }

  /** Kill CSS transitions for a posed frame so screenshots show final values. */
  private setSnap(posed: boolean): void {
    const els: HTMLElement[] = [this.sub, this.flash, this.vignette, this.combo,
      this.chainEl, this.edgeL, this.edgeR]
    for (let k = 0; k < this.livesEl.children.length; k++) {
      els.push(this.livesEl.children[k] as HTMLElement)
    }
    for (const el of els) el.style.transitionDuration = posed ? '0s' : ''
  }

  // ---------------------------------------------------------------- background
  private paintBackground(s: GameState, i: number, e: number, inhibit: boolean): void {
    // Heats from cold night-blue toward hot violet-red as the run escalates —
    // early lift comes from energy, the final climb into red from intensity.
    // The inhibition command inverts everything to an unmistakable cold blue.
    let bg: string
    if (inhibit) {
      bg = 'radial-gradient(120% 90% at 50% 15%, hsl(208 72% 22%), #020813)'
    } else if (s.phase === 'over') {
      bg = 'radial-gradient(120% 90% at 50% 15%, hsl(348 45% 12%), #0a0508)'
    } else {
      const h = Math.round(heatHue(e, i))
      const sat = Math.round(40 + e * 24 + i * 12)
      const l = Math.round(13 + e * 8 + i * 3)
      bg = `radial-gradient(120% 90% at 50% 15%, hsl(${h} ${sat}% ${l}%), #06070b)`
    }
    if (bg !== this.bgCache) { this.bgCache = bg; document.body.style.background = bg }

    // Breathing aurora + halo sweeps: gradient strings are bucketed so styles
    // only change when the difference would be visible.
    const bucket = (inhibit ? 'I' : s.phase === 'over' ? 'O' : 'p') +
      Math.round(e * 20) + '.' + Math.round(i * 10)
    if (bucket !== this.ambientCache) {
      this.ambientCache = bucket
      const h = inhibit ? 205 : s.phase === 'over' ? 350 : Math.round(heatHue(e, i))
      const a = inhibit ? 0.10 : s.phase === 'over' ? 0.12 : 0.12 + e * 0.20
      this.aurora.style.background =
        `radial-gradient(58% 44% at 50% 30%, hsl(${h} 85% 55% / ${a.toFixed(3)}), transparent 70%)`
      this.aurora.style.animationDuration = `${(6.5 - e * 4).toFixed(2)}s`
      const ha = 0.06 + e * 0.13
      this.halo.style.background =
        `conic-gradient(from 0deg, transparent 0deg, hsl(${h + 20} 85% 60% / ${ha.toFixed(3)}) 40deg, ` +
        `transparent 95deg, transparent 175deg, hsl(${h - 14} 85% 60% / ${(ha * 0.8).toFixed(3)}) 215deg, transparent 275deg)`
      this.halo2.style.background =
        `conic-gradient(from 120deg, transparent 0deg, hsl(${h + 40} 80% 62% / ${(ha * 0.7).toFixed(3)}) 55deg, transparent 130deg)`
      this.halo.style.animationDuration = `${(30 - e * 17).toFixed(1)}s`
      this.halo2.style.animationDuration = `${(44 - e * 22).toFixed(1)}s`
      // The beat pulse shares the ambient hue so the throb reads as the SAME
      // ground breathing, not a second light source. Restrained by design:
      // its peak alpha is .16 scaled further by the per-frame opacity.
      this.beatEl.style.background =
        `radial-gradient(90% 62% at 50% 100%, hsl(${h} 90% 58% / .16), transparent 72%)`
    }
    // DO NOTHING: the whole ambient system holds its breath.
    const play = inhibit ? 'paused' : 'running'
    if (play !== this.ambientPlay) {
      this.ambientPlay = play
      this.aurora.style.animationPlayState = play
      this.halo.style.animationPlayState = play
      this.halo2.style.animationPlayState = play
    }

    // Danger vignette: creeps in with intensity, slams in when the window is
    // nearly gone — urgency readable without looking anywhere in particular.
    let danger = i * 0.22
    if (s.phase === 'awaiting' && s.command && !s.command.inhibit) {
      const left = Math.max(0, 1 - s.elapsed / s.command.windowMs)
      if (left < 0.42) danger = Math.max(danger, (1 - left / 0.42) * 0.85)
    }
    if (s.phase === 'over') danger = 0.9
    this.vignette.style.opacity = String(danger)
  }

  // -------------------------------------------------------------------- label
  private syncLabel(s: GameState, art: { hue: number; glyph: string }, inhibit: boolean, posed: boolean): void {
    const over = s.phase === 'over'
    const idle = s.phase === 'idle'

    const text =
      over ? 'GAME OVER'
      : idle ? 'TAP TO START'
      : s.command ? s.command.label : ''
    if (text !== this.cLabel) { this.cLabel = text; this.label.textContent = text }

    const color =
      s.phase === 'resolved' || over
        ? (s.lastResult === 'correct' ? '#5ce88f' : '#ff5c66')
        : inhibit ? INHIBIT_COLOR : '#fff'
    if (color !== this.cLabelColor) { this.cLabelColor = color; this.label.style.color = color }

    this.kicker.textContent = idle || over ? 'JOLT' : ''
    this.kicker.style.color = over ? '#ff8b93' : '#9fb4ff'

    // Backdrop glyph: directional cue behind the words. The inhibit ✕ is the
    // one cold exception — a faint "hands off" behind DO NOTHING.
    const g = idle || over ? '' : art.glyph
    if (g !== this.cGlyph) { this.cGlyph = g; this.glyph.textContent = g }
    this.glyph.style.color = inhibit ? 'hsl(205 90% 70%)' : `hsl(${art.hue} 95% 74%)`
    this.glyph.style.opacity = s.phase === 'awaiting' ? (inhibit ? '.09' : '.13') : '.05'

    // Sub line: verdict after a resolution, score after death, hint on idle,
    // and a tense HANDS OFF beneath the inhibition command.
    let sub = '', subColor = '', subOp = '0'
    if (over) {
      sub = `SCORE ${s.score}   ·   BEST STREAK ${s.bestStreak}`
      subColor = '#ffd9dc'; subOp = '.95'
    } else if (idle) {
      sub = 'OBEY THE VOICE BEFORE THE RING CLOSES'
      subColor = '#aab8e8'; subOp = '.8'
    } else if (inhibit) {
      sub = 'HANDS OFF'
      subColor = INHIBIT_COLOR; subOp = '.85'
    } else if (s.phase === 'resolved' && s.lastResult && s.lastResult !== 'correct') {
      sub = s.lastResult === 'timeout' ? 'TOO SLOW' : this.pInhibit ? 'YOU MOVED' : 'WRONG'
      subColor = '#ff8b93'; subOp = '1'
    }
    if (sub !== this.cSub) { this.cSub = sub; if (sub) this.sub.textContent = sub }
    if (subColor) this.sub.style.color = subColor
    this.sub.style.opacity = subOp

    // Idle breathing pulse — cancelled the moment play starts.
    if (idle && !this.idleAnim && !reducedMotion() && !posed) {
      this.idleAnim = this.label.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
        { duration: 1600, iterations: Infinity, easing: 'ease-in-out' })
    } else if (!idle && this.idleAnim) {
      this.idleAnim.cancel()
      this.idleAnim = null
    }
  }

  /** THE BEAT, VISIBLE: the ground throbs on the engine's musical grid — a
   *  sharp swell at each beat onset decaying through the beat, scaled by run
   *  energy so it whispers early and drives late. Feature-detected on
   *  GameState.beatPhase (older cores and posed states without the clock get
   *  a still floor, never a crash). DO NOTHING holds its breath: no pulse. */
  private syncBeat(s: GameState, e: number, inhibit: boolean): void {
    const bp = (s as { beatPhase?: unknown }).beatPhase
    let op = 0
    if (typeof bp === 'number' && !inhibit && !reducedMotion() &&
        (s.phase === 'awaiting' || s.phase === 'resolved')) {
      const ph = Math.min(1, Math.max(0, bp))
      op = Math.pow(1 - ph, 2.4) * (0.3 + 0.7 * e)
    }
    const key = op.toFixed(3)
    if (key !== this.cBeatOp) { this.cBeatOp = key; this.beatEl.style.opacity = key }
  }

  /** Warm side-edge glow while a MOTION command is live: "the phone itself is
   *  the controller" reads from the periphery before the words do. */
  private syncEdges(s: GameState, art: { hue: number; fam: Family }, inhibit: boolean): void {
    const show = s.phase === 'awaiting' && !inhibit && art.fam === 'motion'
    const key = show ? `on${art.hue}` : 'off'
    if (key === this.edgeCache) return
    this.edgeCache = key
    if (show) {
      this.edgeL.style.background =
        `linear-gradient(90deg, hsl(${art.hue} 92% 58% / .34), transparent)`
      this.edgeR.style.background =
        `linear-gradient(-90deg, hsl(${art.hue} 92% 58% / .34), transparent)`
    }
    this.edgeL.style.opacity = show ? '1' : '0'
    this.edgeR.style.opacity = show ? '1' : '0'
  }

  // ---------------------------------------------------------------------- hud
  private syncHud(s: GameState, i: number, e: number): void {
    const sc = String(s.score)
    if (sc !== this.cScore) { this.cScore = sc; this.scoreEl.textContent = sc }
    this.scoreEl.style.color = `hsl(${Math.round(heatHue(e, i))} 100% 88%)`
    const dots = this.livesEl.children
    for (let k = 0; k < dots.length; k++) {
      const el = dots[k] as HTMLElement
      const alive = k < s.lives
      el.style.background = alive ? '#fff' : 'transparent'
      el.style.boxShadow = alive
        ? `0 0 ${8 + e * 10}px rgba(255,255,255,.6)`
        : 'inset 0 0 0 2px rgba(255,255,255,.35)'
    }
  }

  private syncCombo(s: GameState, e: number): void {
    const show = s.streak >= 2 && (s.phase === 'awaiting' || s.phase === 'resolved')
    const text = show ? `×${s.streak}` : this.cCombo
    if (text !== this.cCombo) { this.cCombo = text; this.combo.textContent = text }
    this.combo.style.opacity = show ? '1' : '0'
    if (show) {
      // The counter itself heats up: white → gold → hot as the streak builds.
      const heat = Math.min(1, s.streak / 25)
      this.combo.style.color = `hsl(${52 - heat * 42} ${60 + heat * 40}% ${72 - heat * 8}%)`
      this.combo.style.textShadow =
        `0 0 ${6 + heat * 22 + e * 10}px hsl(${52 - heat * 42} 100% 60% / .8)`
    }
  }

  /** Perfect-chain counter — a gold ladder rung count that burns hotter as the
   *  chain grows, and falls away quietly the moment a slow answer breaks it. */
  private syncChain(s: GameState, posed: boolean): void {
    const show = s.chain >= 2 && (s.phase === 'awaiting' || s.phase === 'resolved')
    const text = show ? `PERFECT ×${s.chain}` : this.cChain
    if (text !== this.cChain) { this.cChain = text; this.chainEl.textContent = text }
    this.chainEl.style.opacity = show ? '1' : '0'
    if (show) {
      const heat = Math.min(1, s.chain / 20)
      this.chainEl.style.color = `hsl(${PERFECT_HUE - heat * 18} 100% ${74 - heat * 6}%)`
      this.chainEl.style.textShadow =
        `0 0 ${8 + heat * 20}px hsl(${PERFECT_HUE} 100% 60% / ${0.5 + heat * 0.4})`
    } else if (this.pChain >= 3 && s.chain === 0 && s.lastResult === 'correct' &&
               !posed && !reducedMotion()) {
      // The chain broke on a merely-correct answer: a quiet fall, not a punch —
      // the failure punch already owns real mistakes.
      this.chainEl.animate(
        [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(10px)' }],
        { duration: 320, easing: 'ease-in' })
    }
  }

  // ------------------------------------------------------- one-shot reactions
  private detectEvents(s: GameState, art: { hue: number; glyph: string; fam: Family }, posed: boolean): void {
    const rm = reducedMotion() || posed

    // A NEW COMMAND LANDED: enter in the language of its family, + a shockwave.
    if (s.phase === 'awaiting' && s.issued !== this.pIssued) {
      if (!rm && s.command) this.enter(s.command.action, s.command.inhibit)
      if (!rm) this.shockwave(s.command && s.command.inhibit ? 205 : art.hue)
    }

    const resolvedNow = s.phase !== this.pPhase && (s.phase === 'resolved' || s.phase === 'over')
    if (resolvedNow && s.lastResult === 'correct') {
      // SUCCESS: flash + spark burst. A PERFECT (inside the gold band) flashes
      // gold and celebrates in proportion to the chain — a ×2 chain is a spark,
      // a ×15 chain is an event. A save with almost nothing left on the clock
      // flashes hot orange and NAMES the margin — the near-miss is felt.
      const cmd = s.command
      const margin = cmd ? Math.max(0, cmd.windowMs - s.elapsed) : 9999
      const close = !!cmd && !cmd.inhibit && (margin < 150 || margin < cmd.windowMs * 0.16)
      const perfect = s.lastPerfect
      this.flash.style.background =
        perfect ? 'rgba(255,213,84,.20)'
        : close ? 'rgba(255,176,64,.22)' : 'rgba(92,232,143,.15)'
      this.flash.style.opacity = '1'
      const milestone = s.streak > 0 && s.streak % 5 === 0
      // Every 5th link of a perfect chain outranks the streak milestone — the
      // chain is the rarer, harder thing, and it earns the bigger moment.
      const chainMile = perfect && s.chain >= 5 && s.chain % 5 === 0
      if (chainMile) this.burst(40 + Math.min(24, s.chain), PERFECT_HUE, 3.6)
      else if (milestone) this.burst(46, 48, 3.4)
      else if (perfect) this.burst(16 + Math.min(24, s.chain * 2), PERFECT_HUE, 2.8)
      else this.burst(14, art.hue, 2.2)
      if (chainMile && !rm) {
        this.bloom(`PERFECT CHAIN ×${s.chain}`)
        this.shockwave(PERFECT_HUE)
        this.chainEl.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.7)' }, { transform: 'scale(1)' }],
          { duration: 380, easing: 'cubic-bezier(.2,1.6,.4,1)' })
      } else if (milestone && !rm) {
        // STREAK MILESTONE: gold bloom — banner + wave + the counter slams.
        this.bloom(`STREAK ×${s.streak}`)
        this.shockwave(48)
        this.combo.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }, { transform: 'scale(1)' }],
          { duration: 380, easing: 'cubic-bezier(.2,1.6,.4,1)' })
      } else if (!rm) {
        const el = perfect && s.chain >= 2 ? this.chainEl : this.combo
        el.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }],
          { duration: 200, easing: 'ease-out' })
      }
      // Score pop + floater — only for a single command's worth of points
      // (base 10-30 plus a perfect bonus of at most 50).
      const gained = s.score - this.pScore
      if (gained > 0 && gained <= 80 && !rm) {
        this.scoreEl.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
          { duration: 220, easing: 'ease-out' })
        if (perfect) this.floater(`PERFECT +${gained}`, `hsl(${PERFECT_HUE} 100% 70%)`)
        else if (close) this.floater(`+${gained} · ${Math.round(margin)}ms SAVE`, 'hsl(35 100% 66%)')
        else this.floater(`+${gained}`, `hsl(${art.hue} 90% 70%)`)
      }
    }

    if (resolvedNow && (s.lastResult === 'wrong' || s.lastResult === 'timeout')) {
      // FAILURE: hard punch — red slam, twisting screen shake, shatter burst,
      // vignette slam, and the life dot itself blows apart top-right.
      this.flash.style.background = 'rgba(255,60,70,.38)'
      this.flash.style.opacity = '1'
      this.burst(34, 355, 3.2)
      this.burstAt(0.88, 0.07, 16, 355, 2.6)
      if (!rm) {
        this.shaker.animate(
          [
            { transform: 'translate(0,0) rotate(0)' },
            { transform: 'translate(-16px,8px) rotate(-1.1deg)' },
            { transform: 'translate(13px,-6px) rotate(.9deg)' },
            { transform: 'translate(-8px,-5px) rotate(-.5deg)' },
            { transform: 'translate(6px,4px) rotate(.3deg)' },
            { transform: 'translate(0,0) rotate(0)' },
          ],
          { duration: 360, easing: 'ease-out' })
        this.vignette.animate(
          [{ opacity: 1 }, { opacity: 0.25 }],
          { duration: 600, easing: 'ease-out' })
        const lost = this.livesEl.children[Math.max(0, s.lives)] as HTMLElement | undefined
        if (lost) lost.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(2.1)', opacity: 0.2 }, { transform: 'scale(1)' }],
          { duration: 420, easing: 'ease-out' })
      }
    }

    if (s.phase === 'awaiting' || s.phase === 'idle') this.flash.style.opacity = '0'

    // GAME OVER: one heavy final beat.
    if (s.phase === 'over' && this.pPhase !== 'over' && !rm) {
      this.label.animate(
        [{ transform: 'scale(1.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.2,1.3,.4,1)' })
      this.burst(60, 355, 2.6)
    }
  }

  /** Label + glyph entrance in the family's own vocabulary: swipes travel the
   *  commanded direction, TWIST rotates in, SHAKE jitters in, FLIP somersaults
   *  in, DO NOTHING simply appears — cold and still. All ≤280ms so the words
   *  are firmly parked long before a 300ms read. */
  private enter(action: string, inhibit: boolean): void {
    const spring = 'cubic-bezier(.22,1.2,.36,1)'
    let frames: Keyframe[]
    let dur = 190
    if (inhibit) {
      frames = [{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'scale(1)' }]
      dur = 240
    } else {
      switch (action) {
        case 'swipe-up':
          frames = [{ transform: 'translateY(48px) scale(1.15)', opacity: 0.1 },
            { transform: 'translateY(0) scale(1)', opacity: 1 }]; break
        case 'swipe-down':
          frames = [{ transform: 'translateY(-48px) scale(1.15)', opacity: 0.1 },
            { transform: 'translateY(0) scale(1)', opacity: 1 }]; break
        case 'swipe-left':
          frames = [{ transform: 'translateX(48px) scale(1.15)', opacity: 0.1 },
            { transform: 'translateX(0) scale(1)', opacity: 1 }]; break
        case 'swipe-right':
          frames = [{ transform: 'translateX(-48px) scale(1.15)', opacity: 0.1 },
            { transform: 'translateX(0) scale(1)', opacity: 1 }]; break
        case 'twist':
          frames = [{ transform: 'rotate(-16deg) scale(1.5)', opacity: 0.1 },
            { transform: 'rotate(4deg) scale(.96)', opacity: 1, offset: 0.65 },
            { transform: 'rotate(0) scale(1)', opacity: 1 }]
          dur = 230; break
        case 'shake':
          frames = [{ transform: 'scale(1.45)', opacity: 0.1 },
            { transform: 'translateX(-10px) scale(1)', opacity: 1, offset: 0.4 },
            { transform: 'translateX(8px) scale(1)', offset: 0.62 },
            { transform: 'translateX(-5px) scale(1)', offset: 0.82 },
            { transform: 'translateX(0) scale(1)' }]
          dur = 280; break
        case 'flip':
          frames = [{ transform: 'perspective(520px) rotateX(78deg) scale(1.25)', opacity: 0.1 },
            { transform: 'perspective(520px) rotateX(0) scale(1)', opacity: 1 }]
          dur = 240; break
        default:
          frames = [{ transform: 'scale(1.55)', opacity: 0.1 },
            { transform: 'scale(.94)', opacity: 1, offset: 0.62 },
            { transform: 'scale(1)', opacity: 1 }]
      }
    }
    this.label.animate(frames, { duration: dur, easing: spring })

    const DIRG: Record<string, string> = {
      'swipe-up': 'translateY(34px)', 'swipe-down': 'translateY(-34px)',
      'swipe-left': 'translateX(34px)', 'swipe-right': 'translateX(-34px)',
    }
    const gFrom = DIRG[action]
    const gEnd = inhibit ? 0.09 : 0.13
    this.glyph.animate(
      gFrom
        ? [{ transform: gFrom, opacity: 0 }, { transform: 'none', opacity: gEnd }]
        : [{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: gEnd }],
      { duration: 220, easing: 'ease-out' })
  }

  /** Expanding DOM ring pulse around the timer — a beat marking command onset. */
  private shockwave(hue: number): void {
    if (reducedMotion()) return
    const w = document.createElement('div')
    w.style.cssText =
      'position:absolute;width:min(80vw,80vh);height:min(80vw,80vh);border-radius:50%;' +
      `border:3px solid hsl(${hue} 90% 65%);pointer-events:none;opacity:.7`
    this.shaker.insertBefore(w, this.label)
    const a = w.animate(
      [{ transform: 'scale(.55)', opacity: 0.75 }, { transform: 'scale(1.18)', opacity: 0 }],
      { duration: 330, easing: 'cubic-bezier(.16,.8,.3,1)' })
    a.onfinish = () => w.remove()
    setTimeout(() => w.remove(), 600)   // belt & braces if animations are paused
  }

  /** Rising "+N" score floater above the command text. */
  private floater(text: string, color: string): void {
    if (reducedMotion()) return
    const f = document.createElement('div')
    f.textContent = text
    f.style.cssText =
      'position:absolute;top:34%;left:0;right:0;text-align:center;font-weight:800;' +
      `font-size:clamp(18px,4.5vw,32px);color:${color};pointer-events:none;` +
      'text-shadow:0 2px 10px rgba(0,0,0,.5)'
    this.shaker.append(f)
    const a = f.animate(
      [
        { transform: 'translateY(0) scale(.8)', opacity: 0 },
        { transform: 'translateY(-18px) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translateY(-52px) scale(1)', opacity: 0 },
      ],
      { duration: 650, easing: 'ease-out' })
    a.onfinish = () => f.remove()
    setTimeout(() => f.remove(), 900)
  }

  /** Gold milestone banner blooming below the command — every 5th streak. */
  private bloom(text: string): void {
    if (reducedMotion()) return
    const b = document.createElement('div')
    b.textContent = text
    b.style.cssText =
      'position:absolute;top:62%;left:0;right:0;text-align:center;font-weight:800;' +
      'font-size:clamp(20px,5.6vw,38px);letter-spacing:.18em;text-indent:.18em;' +
      'color:#ffd76b;pointer-events:none;text-shadow:0 0 26px rgba(255,205,90,.8)'
    this.shaker.append(b)
    const a = b.animate(
      [
        { transform: 'scale(.5)', opacity: 0 },
        { transform: 'scale(1.12)', opacity: 1, offset: 0.3 },
        { transform: 'scale(1.2)', opacity: 0 },
      ],
      { duration: 700, easing: 'cubic-bezier(.2,1.2,.4,1)' })
    a.onfinish = () => b.remove()
    setTimeout(() => b.remove(), 1000)
  }

  // ---------------------------------------------------------------- particles
  /** Take a particle from the fixed pool; null when the pool is saturated. */
  private take(): Particle | null {
    if (this.alive >= MAX_POOL) return null
    return this.pool[this.alive++]
  }

  /** Swap-kill: O(1), keeps the live particles packed at the front. */
  private kill(k: number): void {
    const last = --this.alive
    const t = this.pool[k]
    this.pool[k] = this.pool[last]
    this.pool[last] = t
  }

  /** Sparks fired outward FROM THE TIMER RING, never over the command text —
   *  celebration lives in the periphery, the words stay untouched. */
  private burst(n: number, hue: number, speed: number): void {
    const cx = this.fx.width / 2, cy = this.fx.height / 2
    // The ring spans min(80vw,80vh); its stroked radius is ~88% of that half.
    const ringR = Math.min(this.fx.width, this.fx.height) * 0.8 * 0.44
    for (let k = 0; k < n; k++) {
      const p = this.take()
      if (!p) break
      const a = Math.random() * TAU
      const v = (0.6 + Math.random()) * speed * 1.8
      p.x = cx + Math.cos(a) * ringR; p.y = cy + Math.sin(a) * ringR
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v
      p.life = 0; p.max = 380 + Math.random() * 320
      p.size = 1.4 + Math.random() * 2.4; p.hue = hue + (Math.random() * 24 - 12)
      p.kind = 'spark'
    }
  }

  /** Point burst in normalised screen coords — e.g. the life dot shattering. */
  private burstAt(nx: number, ny: number, n: number, hue: number, speed: number): void {
    const cx = nx * this.fx.width, cy = ny * this.fx.height
    for (let k = 0; k < n; k++) {
      const p = this.take()
      if (!p) break
      const a = Math.random() * TAU
      const v = (0.5 + Math.random()) * speed * 1.6
      p.x = cx; p.y = cy
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v
      p.life = 0; p.max = 320 + Math.random() * 280
      p.size = 1.2 + Math.random() * 2; p.hue = hue + (Math.random() * 24 - 12)
      p.kind = 'spark'
    }
  }

  /** Put the ambient field straight into its steady state, so a single posed
   *  frame shows the same energy a live player would be seeing. */
  private seedAmbient(e: number, i: number): void {
    for (let k = this.alive - 1; k >= 0; k--) {
      if (this.pool[k].kind === 'ember') this.kill(k)
    }
    const W = this.fx.width, H = this.fx.height
    const n = Math.round(e * 26)
    for (let k = 0; k < n; k++) {
      const p = this.take()
      if (!p) break
      const max = 1400 + Math.random() * 1200
      p.x = Math.random() * W; p.y = Math.random() * H
      p.vx = (Math.random() - 0.5) * 0.3
      p.vy = -(0.35 + Math.random() * 0.7) * (0.6 + e)
      p.life = Math.random() * max * 0.9; p.max = max
      p.size = 0.8 + Math.random() * 1.6
      p.hue = heatHue(e, i) + Math.random() * 30
      p.kind = 'ember'
    }
    // Scatter the motes afresh so a posed frame is representative.
    for (const m of this.motes) { m.x = Math.random() * W; m.y = Math.random() * H }
  }

  /** Ambient life: a drifting mote field FROM COMMAND ONE, plus rising embers
   *  whose rate re-anchors to energy — the screen thickens visibly across the
   *  first 30 commands and looks frantic late. During DO NOTHING everything
   *  hangs frozen mid-air: the world holds its breath with you. */
  private drawFx(s: GameState, i: number, e: number, inhibit: boolean): void {
    const c = this.fxCtx
    const W = this.fx.width, H = this.fx.height
    const dt = Math.min(100, Math.max(0, s.runtime - this.pRuntime)) || 16
    const rm = reducedMotion()
    const freeze = inhibit

    // Ember spawn: present from the very first command (~2/s), ~13/s at full boil.
    if ((s.phase === 'awaiting' || s.phase === 'resolved') && !freeze && !rm) {
      this.emberCarry += dt * (0.2 + e * 1.15) * 0.01
      while (this.emberCarry >= 1) {
        this.emberCarry--
        const p = this.take()
        if (!p) { this.emberCarry = 0; break }
        p.x = Math.random() * W; p.y = H + 4
        p.vx = (Math.random() - 0.5) * 0.3
        p.vy = -(0.35 + Math.random() * 0.7) * (0.6 + e)
        p.life = 0; p.max = 1400 + Math.random() * 1200
        p.size = 0.8 + Math.random() * 1.6
        p.hue = heatHue(e, i) + Math.random() * 30
        p.kind = 'ember'
      }
    }

    c.clearRect(0, 0, W, H)
    const step = dt / 16.7

    // Mote field — always on, density and drift speed scale with energy.
    const nm = Math.min(MAX_MOTES, 7 + Math.round(e * 27))
    const hh = heatHue(e, i)
    for (let k = 0; k < nm; k++) {
      const m = this.motes[k]
      if (!freeze && !rm) {
        m.x += m.vx * step * (0.5 + e)
        m.y += m.vy * step * (0.5 + e)
        if (m.y < -8) { m.y = H + 8; m.x = (m.x + 137) % W }
        else if (m.y > H + 8) m.y = -8
        if (m.x < -8) m.x = W + 8
        else if (m.x > W + 8) m.x = -8
      }
      const tw = 0.13 + 0.1 * Math.sin(m.ph + s.runtime * 0.0012)
      c.fillStyle = `hsl(${hh + 18} 70% 72% / ${tw.toFixed(3)})`
      c.beginPath()
      c.arc(m.x, m.y, m.size, 0, TAU)
      c.fill()
    }

    // Pooled sparks + embers.
    for (let k = this.alive - 1; k >= 0; k--) {
      const p = this.pool[k]
      const held = freeze && p.kind === 'ember'   // embers hang; sparks finish
      if (!held) {
        p.life += dt
        p.x += p.vx * step * 2
        p.y += p.vy * step * 2
        if (p.kind === 'spark') { p.vx *= 0.985; p.vy *= 0.985 }
      }
      const t = p.life / p.max
      if (t >= 1 || p.y < -6) { this.kill(k); continue }
      const alpha = p.kind === 'spark' ? (1 - t) * 0.9 : Math.sin(t * Math.PI) * 0.5
      c.fillStyle = `hsl(${p.hue} 90% 65% / ${alpha})`
      c.beginPath()
      c.arc(p.x, p.y, p.size * (p.kind === 'spark' ? 1 - t * 0.5 : 1), 0, TAU)
      c.fill()
    }
  }

  // --------------------------------------------------------------------- ring
  private drawRing(s: GameState, e: number, hue: number, inhibit: boolean): void {
    const c = this.ctx
    const w = this.ring.width
    const baseR = w / 2 - 30
    c.clearRect(0, 0, w, w)
    if (s.phase === 'idle' || s.phase === 'over') return

    // Orbiters: satellites circling the ring from command one; they multiply
    // and speed up with energy. During DO NOTHING they freeze in place.
    const clock = inhibit ? this.freezeT : s.runtime
    if (!reducedMotion()) {
      const n = 1 + Math.round(e * 4)
      const or = baseR + 24
      c.shadowBlur = 10
      for (let k = 0; k < n; k++) {
        const ang = clock * 0.00055 * (1 + e * 0.8) + k * (TAU / n) + k * 0.9
        const col = inhibit ? 'hsl(205 80% 70% / .85)' : `hsl(${hue} 90% 70% / .85)`
        c.fillStyle = col
        c.shadowColor = col
        c.beginPath()
        c.arc(w / 2 + Math.cos(ang) * or, w / 2 + Math.sin(ang) * or, 4 + e * 2.5, 0, TAU)
        c.fill()
      }
      c.shadowBlur = 0
    }

    // Ghost pacer: the race against your best run, riding just outside the
    // ring — periphery only, never near the command label.
    this.drawGhost(s, baseR)

    if (s.phase === 'resolved') {
      // Verdict afterglow: the whole ring flashes the result color and fades —
      // the space between commands is a felt beat, not a blank.
      const t = (s.runtime - this.phaseChangedAt) / 340
      if (t < 1 && s.lastResult) {
        const a = (0.5 * (1 - t)).toFixed(3)
        c.lineWidth = 10
        c.strokeStyle = s.lastResult === 'correct'
          ? `hsl(140 80% 60% / ${a})` : `hsl(355 85% 60% / ${a})`
        c.beginPath(); c.arc(w / 2, w / 2, baseR, 0, TAU); c.stroke()
      }
      return
    }
    if (!s.command) return

    if (inhibit) {
      // Cold, static, dashed — visibly "not a countdown you race".
      c.save()
      c.setLineDash([10, 14])
      c.lineWidth = 8
      c.strokeStyle = 'hsl(205 90% 65% / .8)'
      c.beginPath(); c.arc(w / 2, w / 2, baseR, 0, TAU); c.stroke()
      c.restore()
      return
    }

    const left = Math.max(0, 1 - s.elapsed / s.command.windowMs)

    // The ring BREATHES even when safe (amplitude grows with energy), and as
    // the window closes it pulses harder and faster — a heartbeat readable in
    // peripheral vision. Driven by engine state, so posed screenshots render
    // it deterministically.
    const danger = left < 0.45 ? 1 - left / 0.45 : 0
    const beat = Math.sin(s.elapsed * (0.012 + danger * 0.03))
    const breathe = Math.sin(s.runtime * 0.0028) * (0.008 + e * 0.014)
    const pulse = 1 + breathe + danger * 0.045 * beat
    const r = baseR * pulse
    const lw = (9 + e * 10) * (1 + danger * 0.45 * Math.abs(beat))

    c.lineCap = 'round'
    c.lineWidth = lw
    c.strokeStyle = `hsl(${hue} 40% 50% / .14)`
    c.beginPath(); c.arc(w / 2, w / 2, r, 0, TAU); c.stroke()

    // Green → red as the window closes, with a glow that ignites in danger.
    const ringHue = left * 130
    if (danger > 0) {
      c.shadowBlur = 14 + danger * 22
      c.shadowColor = `hsl(${ringHue} 95% 55%)`
    }
    c.strokeStyle = `hsl(${ringHue} 90% ${56 + danger * 8}%)`
    c.beginPath()
    c.arc(w / 2, w / 2, r, -Math.PI / 2, -Math.PI / 2 + left * TAU)
    c.stroke()
    c.shadowBlur = 0

    // PERFECT band: the first 30% of the window is a gold wedge on the ring,
    // eaten live by the drain head — hit while any gold remains and the answer
    // is a Perfect. Its glow decays as it is spent: the prize is visibly
    // slipping away, which is the whole reason to hurry on an easy command.
    const bandLo = 1 - PERFECT_FRAC
    if (left > bandLo) {
      const decay = (left - bandLo) / PERFECT_FRAC   // 1 fresh → 0 spent
      c.lineWidth = lw
      c.shadowBlur = 10 + decay * 8
      c.shadowColor = `hsl(${PERFECT_HUE} 95% 60%)`
      c.strokeStyle = `hsl(${PERFECT_HUE} 96% 64% / ${(0.5 + 0.42 * decay).toFixed(3)})`
      c.beginPath()
      c.arc(w / 2, w / 2, r, -Math.PI / 2 + bandLo * TAU, -Math.PI / 2 + left * TAU)
      c.stroke()
      c.shadowBlur = 0
    }
    // The band's boundary notch stays after the gold is spent — a fixed tick
    // at the 30% mark, so the target line is learnable across commands.
    const na = -Math.PI / 2 + bandLo * TAU
    c.lineWidth = 3
    c.strokeStyle = `hsl(${PERFECT_HUE} 90% 72% / ${left > bandLo ? '.9' : '.28'})`
    c.beginPath()
    c.moveTo(w / 2 + Math.cos(na) * (r - lw * 0.85), w / 2 + Math.sin(na) * (r - lw * 0.85))
    c.lineTo(w / 2 + Math.cos(na) * (r + lw * 0.85), w / 2 + Math.sin(na) * (r + lw * 0.85))
    c.stroke()

    // Bright head on the draining edge — the eye tracks a point, not an arc.
    const a = -Math.PI / 2 + left * TAU
    c.fillStyle = `hsl(${ringHue} 95% 78%)`
    c.beginPath()
    c.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, lw * 0.62, 0, TAU)
    c.fill()
  }

  /** GHOST PACER: the race against your best run, made legible from command
   *  five, not command fifty. The hollow gray diamond is your best run's PACE,
   *  pinned at 12 o'clock; the solid diamond is YOU, swinging clockwise when
   *  ahead of that pace and counter-clockwise when behind, gap arc between the
   *  two. The swing is normalised against the ghost's score AT THE SAME
   *  COMMAND INDEX, in points (±GHOST_SPAN = full swing) — a one-perfect lead
   *  on command 5 reads exactly like one on command 50, where the old
   *  final-score normalisation kept both markers crawling sub-pixel near 12
   *  o'clock until the endgame. Once your run outlives the trace the ghost is
   *  dead (its diamond hollows out further and dims); pass its final score
   *  and the race is won — GHOST DOWN, periphery cleared for the endgame.
   *  Everything lives OUTSIDE the timer ring — the command label and the live
   *  countdown stay untouched. */
  private drawGhost(s: GameState, baseR: number): void {
    const g = this.ghost
    if (!g || this.ghostBeaten || this.ghostMode !== s.mode || g.score <= 0) return
    if (s.phase !== 'awaiting' && s.phase !== 'resolved') return
    const resolved = s.issued - (s.phase === 'awaiting' ? 1 : 0)
    if (resolved > 0 && s.score >= g.score) {
      // Past the ghost's death point — the race is won.
      this.ghostBeaten = true
      this.floater('GHOST DOWN', 'hsl(210 90% 78%)')
      this.burst(20, 210, 2.6)
      return
    }
    const gs = ghostScoreAt(g.trace, resolved)
    const dead = resolved >= g.trace.length     // ghost crashed; pace frozen
    const c = this.ctx
    const w = this.ring.width
    const track = baseR + 17
    const delta = s.score - gs
    const rel = Math.max(-1, Math.min(1, delta / GHOST_SPAN))
    const ahead = delta >= 0
    const ga = -Math.PI / 2                      // the pace line, always at 12
    const ya = ga + rel * GHOST_SWING            // you, ahead → clockwise
    // The gap between the racers — the ahead/behind cue, colored by verdict.
    if (Math.abs(rel) > 0.02) {
      c.lineWidth = 2.5
      c.strokeStyle = ahead ? 'hsl(145 75% 60% / .3)' : 'hsl(355 75% 62% / .28)'
      c.beginPath()
      c.arc(w / 2, w / 2, track, Math.min(ya, ga), Math.max(ya, ga))
      c.stroke()
    }
    // Diamonds, not dots: the orbiters and motes are all circles, so the two
    // racers stay identifiable at a peripheral glance.
    const diamond = (ang: number, r2: number) => {
      const x = w / 2 + Math.cos(ang) * track, y = w / 2 + Math.sin(ang) * track
      c.beginPath()
      c.moveTo(x, y - r2); c.lineTo(x + r2, y); c.lineTo(x, y + r2); c.lineTo(x - r2, y)
      c.closePath()
    }
    // The ghost: dimmer, hollow and colorless — clearly not part of the live
    // world. Once it is dead its outline fades further: a crash site, not a racer.
    c.lineWidth = 1.6
    c.strokeStyle = dead ? 'hsl(220 25% 76% / .3)' : 'hsl(220 25% 76% / .55)'
    diamond(ga, 4.6)
    c.stroke()
    // You: small, solid and bright, colored by how the race is going.
    c.fillStyle = ahead ? 'hsl(145 85% 68% / .92)' : 'hsl(355 85% 68% / .88)'
    diamond(ya, 5.4)
    c.fill()
  }
}
