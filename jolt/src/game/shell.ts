/** OWNER: meta agent. Everything around the core loop: first-run onboarding,
 *  just-in-time gesture tutorials, the motion-permission moment, game over,
 *  personal best, settings and accessibility.
 *
 *  Design rules:
 *  - The shell never reaches into the Engine. It pauses the world by telling
 *    main.ts to stop ticking (paused()), teaches, then releases — the engine's
 *    tick/submit contract and the bot playtester are untouched.
 *  - Zero assets: DOM + one injected <style>, matching render.ts's look (same
 *    font stack, same dark radial ground, same accent glyphs and hues).
 *  - TEACH BY DOING: the first time a command the player has never seen lands,
 *    the game freezes, explains the move in one line, and waits for the player
 *    to actually perform it. No lives are ever lost while learning. Nothing is
 *    front-loaded — a player who never sees FLIP IT never reads about it.
 *  - Accessibility is structural, not a footnote:
 *      deaf     — every command is printed on screen; the help card says so.
 *      no motion — "touch moves" substitute swipes for shake / twist / flip,
 *                 switched on automatically when sensors are denied or absent,
 *                 or by choice (one-handed play) from the home screen.
 *      iOS      — the motion permission prompt is asked once, from a user
 *                 gesture, WITH a reason, and denial degrades gracefully.
 *  - localStorage is guarded everywhere; private mode degrades to per-session.
 */
import { Action, Command, GameState, ModeId } from './types'
import { installTheme, boltSvg, COLOR, HUE } from './theme'
import { MODES, dailyKey, dailySeed } from './commands'
import {
  DuelChallenge, duelModeFor, duelUrl, dailyShareText, challengeShareText,
  duelShareText,
} from './duel'

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const BEST_KEY = 'jolt.best.v1'          // legacy key — kept in sync with the Classic best
const META_KEY = 'jolt.meta.v1'
const STATS_KEY = 'jolt.stats.v1'
const DAILY_KEY = 'jolt.daily.v1'

export function bestScore(): number {
  try { return Number(localStorage.getItem(BEST_KEY) || 0) } catch { return 0 }
}
export function recordScore(score: number): boolean {
  try {
    if (score > bestScore()) { localStorage.setItem(BEST_KEY, String(score)); return true }
  } catch { /* private mode — the game still works, it just won't remember */ }
  return false
}

/** The modes a player can set as their default from the home picker. The
 *  daily challenge is launched from its own button, never a default. */
const PICKABLE: ReadonlyArray<'classic' | 'sudden' | 'zen'> = ['classic', 'sudden', 'zen']

type PerMode = Record<ModeId, number>
const zeroPerMode = (): PerMode => ({ classic: 0, sudden: 0, zen: 0, daily: 0 })

/** Lifetime record — the reason a run never ends in a void. Everything here
 *  is local; nothing ever leaves the device. */
interface Stats {
  /** Commands answered correctly, across every run ever. */
  obeyed: number
  runs: number
  /** Distinct calendar days with at least one finished run. */
  days: number
  lastDay: string
  bestStreak: number
  /** Best score per mode. */
  best: PerMode
  /** Finished runs per mode. */
  modeRuns: PerMode
  /** Top 10 scores per mode, descending — powers the all-time-rank line. */
  top: Record<ModeId, number[]>
  /** Best score per mode for todayDay only — powers "best run today". */
  todayDay: string
  todayBest: PerMode
  /** Lifetime PERFECT count — every gold-band hit ever, across all modes. */
  perfects: number
  /** Longest perfect chain ever. */
  bestChain: number
}

const DEFAULT_STATS: Stats = {
  obeyed: 0, runs: 0, days: 0, lastDay: '', bestStreak: 0,
  best: zeroPerMode(), modeRuns: zeroPerMode(),
  top: { classic: [], sudden: [], zen: [], daily: [] },
  todayDay: '', todayBest: zeroPerMode(),
  perfects: 0, bestChain: 0,
}

function readPerMode(v: unknown): PerMode {
  const out = zeroPerMode()
  if (v && typeof v === 'object') {
    for (const k of Object.keys(out) as ModeId[]) {
      const n = Number((v as Record<string, unknown>)[k])
      if (Number.isFinite(n) && n > 0) out[k] = n
    }
  }
  return out
}

function loadStats(): Stats {
  let s: Stats
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) {
      s = { ...DEFAULT_STATS, best: zeroPerMode(), todayBest: zeroPerMode(),
        top: { classic: [], sudden: [], zen: [], daily: [] } }
    } else {
      const m = JSON.parse(raw) as Partial<Stats>
      const top = { classic: [], sudden: [], zen: [], daily: [] } as Record<ModeId, number[]>
      if (m.top && typeof m.top === 'object') {
        for (const k of Object.keys(top) as ModeId[]) {
          const arr = (m.top as Record<string, unknown>)[k]
          if (Array.isArray(arr)) {
            top[k] = arr.map(Number).filter((n) => Number.isFinite(n) && n > 0)
              .sort((a, b) => b - a).slice(0, 10)
          }
        }
      }
      s = {
        obeyed: Number(m.obeyed) || 0,
        runs: Number(m.runs) || 0,
        days: Number(m.days) || 0,
        lastDay: typeof m.lastDay === 'string' ? m.lastDay : '',
        bestStreak: Number(m.bestStreak) || 0,
        best: readPerMode(m.best),
        modeRuns: readPerMode(m.modeRuns),
        top,
        todayDay: typeof m.todayDay === 'string' ? m.todayDay : '',
        todayBest: readPerMode(m.todayBest),
        perfects: Math.max(0, Number(m.perfects) || 0),
        bestChain: Math.max(0, Number(m.bestChain) || 0),
      }
    }
  } catch {
    s = { ...DEFAULT_STATS, best: zeroPerMode(), modeRuns: zeroPerMode(),
      todayBest: zeroPerMode(), top: { classic: [], sudden: [], zen: [], daily: [] } }
  }
  // Migrate the pre-modes best score into the Classic slot, honestly: the old
  // record WAS a classic three-lives run.
  const legacy = bestScore()
  if (legacy > s.best.classic) s.best.classic = legacy
  return s
}
function saveStats(s: Stats): void {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

/** The daily-challenge record: one scored attempt per calendar day. */
export interface DailyRec {
  /** Last day a daily was played ('' = never). */
  day: string
  /** That day's score. */
  score: number
  /** Consecutive-day chain ending at `day`. */
  streak: number
  bestStreak: number
  /** Total dailies ever played. */
  played: number
}

const DEFAULT_DAILY: DailyRec = { day: '', score: 0, streak: 0, bestStreak: 0, played: 0 }

function loadDaily(): DailyRec {
  try {
    const raw = localStorage.getItem(DAILY_KEY)
    if (!raw) return { ...DEFAULT_DAILY }
    const m = JSON.parse(raw) as Partial<DailyRec>
    return {
      day: typeof m.day === 'string' ? m.day : '',
      score: Number(m.score) || 0,
      streak: Number(m.streak) || 0,
      bestStreak: Number(m.bestStreak) || 0,
      played: Number(m.played) || 0,
    }
  } catch { return { ...DEFAULT_DAILY } }
}
function saveDaily(d: DailyRec): void {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)) } catch { /* private mode */ }
}

/** Commit today's one attempt at run START — a mid-run quit must spend the
 *  try, or retry-scumming beats the design. Pure so the streak chain and the
 *  midnight edge are unit-testable without a clock. */
export function commitDailyStart(rec: DailyRec, today: string, yesterday: string): DailyRec {
  const chain = rec.day === yesterday ? rec.streak + 1 : 1
  return {
    day: today, score: 0, streak: chain,
    bestStreak: Math.max(rec.bestStreak, chain),
    played: rec.played + 1,
  }
}

/** Land a daily score against the day the run STARTED, not the day it ended —
 *  a run begun 23:59 that dies 00:01 still belongs to its own day. (The old
 *  guard re-derived "today" at death and silently dropped exactly that run.) */
export function settleDailyScore(rec: DailyRec, runDay: string, score: number): DailyRec {
  if (rec.day !== runDay || score <= rec.score) return rec
  return { ...rec, score }
}

/** Honest 1-based all-time rank of a new score against the stored top list.
 *  A tie ranks BELOW the standing score — matching a record is not beating it
 *  (the old `indexOf` gave a tying run the flattering rank). */
export function rankOf(prevTop: number[], score: number): number {
  let ahead = 0
  for (const v of prevTop) if (v >= score) ahead++
  return ahead + 1
}

/** Letter-style judgement of a run's PRECISION — how much of it was played
 *  inside the gold band. Returns null when the run hasn't earned a letter:
 *  a grade that shows up for two lucky perfects would cheapen every real one.
 *  The rate is perfects / correct; inhibition commands can never be perfect
 *  (they sit in `correct` but have no timing), so the thresholds leave the
 *  headroom an all-perfect-plus-traps run actually produces. Pure, so the
 *  ladder is unit-testable. */
export function gradeRun(perfects: number, correct: number, bestChain: number):
  'S' | 'A' | 'B' | 'C' | null {
  if (correct <= 0 || perfects <= 0) return null
  const rate = perfects / correct
  if (perfects >= 15 && rate >= 0.7 && bestChain >= 10) return 'S'
  if (perfects >= 8 && rate >= 0.5 && bestChain >= 5) return 'A'
  if (perfects >= 5 && rate >= 0.35) return 'B'
  if (perfects >= 3 && rate >= 0.2) return 'C'
  return null
}

// ---------------------------------------------------------------------------
// Duels — one honest try per opened link, like the daily.
// ---------------------------------------------------------------------------

const DUELS_KEY = 'jolt.duels.v1'

/** One settled (or spent) duel: OUR real score vs THEIR claimed score, keyed
 *  by seed. `theirs` is a display-only claim — it never enters stats.
 *  `obeyed`/`n` remember our run's shape so a later rebuttal share is honest. */
interface DuelRec {
  seed: number; mine: number; theirs: number; day: string; obeyed: number; n: number
}

function loadDuels(): DuelRec[] {
  try {
    const raw = localStorage.getItem(DUELS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((d): d is DuelRec => !!d && typeof d === 'object' &&
        Number.isFinite(Number((d as DuelRec).seed)))
      .map((d) => ({
        seed: Number(d.seed) >>> 0,
        mine: Math.max(0, Number(d.mine) || 0),
        theirs: Math.max(0, Number(d.theirs) || 0),
        day: typeof d.day === 'string' ? d.day : '',
        obeyed: Math.max(0, Number(d.obeyed) || 0),
        n: Math.max(1, Number(d.n) || 1),
      }))
      .slice(-80)
  } catch { return [] }
}
function saveDuels(list: DuelRec[]): void {
  try { localStorage.setItem(DUELS_KEY, JSON.stringify(list.slice(-80))) } catch { /* private */ }
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dailyKey(d)
}

/** Human countdown to local midnight, e.g. "7H" or "12M". */
function untilMidnight(): string {
  const now = new Date()
  const mid = new Date(now)
  mid.setHours(24, 0, 0, 0)
  const mins = Math.max(1, Math.round((mid.getTime() - now.getTime()) / 60000))
  return mins >= 60 ? `${Math.ceil(mins / 60)}H` : `${mins}M`
}

interface Meta {
  bestStreak: number
  games: number
  /** Lesson keys the player has completed (tutorial shown once, ever). */
  taught: string[]
  muted: boolean
  /** 'auto': motion preferred, swipes stand in when sensors are missing.
   *  'touch': player chose touch moves (one-handed / accessibility).
   *  'motion': player explicitly wants motion even after a denial. */
  moves: 'auto' | 'touch' | 'motion'
  /** The motion pre-prompt has been shown once. */
  askedMotion: boolean
  /** The mode the home screen's picker has selected. */
  mode: 'classic' | 'sudden' | 'zen'
}

const DEFAULT_META: Meta = {
  bestStreak: 0, games: 0, taught: [], muted: false, moves: 'auto', askedMotion: false,
  mode: 'classic',
}

function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return { ...DEFAULT_META }
    const m = JSON.parse(raw) as Partial<Meta>
    return {
      bestStreak: Number(m.bestStreak) || 0,
      games: Number(m.games) || 0,
      taught: Array.isArray(m.taught) ? m.taught.filter((t) => typeof t === 'string') : [],
      muted: !!m.muted,
      moves: m.moves === 'touch' || m.moves === 'motion' ? m.moves : 'auto',
      askedMotion: !!m.askedMotion,
      mode: m.mode === 'sudden' || m.mode === 'zen' ? m.mode : 'classic',
    }
  } catch { return { ...DEFAULT_META } }
}
function saveMeta(m: Meta): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)) } catch { /* private mode */ }
}

// ---------------------------------------------------------------------------
// Lessons and touch substitutes
// ---------------------------------------------------------------------------

/** Touch stand-ins for the motion commands. Gated on the CURRENT command, so a
 *  swipe only ever means "shake" while SHAKE IT is the live command — there is
 *  no ambiguity with the real swipe commands. */
const SUBS: Record<string, { accept: readonly Action[]; hint: string }> = {
  shake: {
    accept: ['swipe-left', 'swipe-right', 'swipe-up', 'swipe-down'],
    hint: 'FLICK FAST — ANY DIRECTION',
  },
  twist: { accept: ['swipe-right'], hint: 'SWIPE RIGHT →' },
  flip:  { accept: ['swipe-down'], hint: 'SWIPE DOWN ↓' },
}

interface Lesson {
  pill: string
  glyph: string
  hue: number
  /** One-line physical instruction. */
  how: string
  /** Instruction when touch moves are active (motion lessons only). */
  touchHow?: string
  /** Desktop keyboard alternative. */
  key?: string
  /** Inline SVG shown in place of the glyph (zero-asset diagram). */
  svg?: string
  /** Override for the TRY IT NOW foot line. */
  note?: string
}

/** The gold band, drawn exactly as the ring draws it: the band ends at the
 *  drain head (12 o'clock) and covers the first 30% of the window, notch at
 *  its far edge. Inline SVG — zero assets, matches render.ts geometry. */
const BAND_SVG = `
  <svg viewBox="0 0 100 100" width="100%" height="100%">
    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="9"/>
    <path d="M 12 62.4 A 40 40 0 0 1 50 10" fill="none" stroke="${COLOR.gold}"
      stroke-width="9" stroke-linecap="round"/>
    <line x1="18.6" y1="60.2" x2="5.3" y2="64.6" stroke="${COLOR.gold}" stroke-width="3"/>
    <circle cx="50" cy="10" r="6.5" fill="#fff"/>
  </svg>`

/** The theme's gold hue — the tutorial gold IS the game gold (render.ts's
 *  perfect band draws from the same token). */
const PERFECT_TEACH_HUE = HUE.gold

/** Hues match render.ts's per-action accents so the tutorial and the game read
 *  as one product. TAP is deliberately absent: the player tapped to start the
 *  game, so it is pre-taught. */
const LESSONS: Record<string, Lesson> = {
  'swipe': {
    pill: 'NEW MOVE', glyph: '◀▶', hue: 188,
    how: 'Flick your finger across the screen — the direction is the command.',
    key: 'arrow keys',
  },
  'hold': {
    pill: 'NEW MOVE', glyph: '◉', hue: 275,
    how: 'Press and KEEP your finger down until it counts.',
    key: 'H',
  },
  'pinch': {
    pill: 'NEW MOVE', glyph: '›‹', hue: 320,
    how: 'Two fingers on the glass — squeeze them together.',
    key: 'P',
  },
  'shake': {
    pill: 'NEW MOVE', glyph: '≈', hue: 25,
    how: 'Really shake the phone — one hard out-and-back.',
    touchHow: 'Touch moves are on: flick the screen hard, any direction.',
    key: 'S',
  },
  'twist': {
    pill: 'NEW MOVE', glyph: '↻', hue: 45,
    how: 'Rotate the phone a quarter-turn, like turning a key.',
    touchHow: 'Touch moves are on: swipe right.',
    key: 'T',
  },
  'flip': {
    pill: 'NEW MOVE', glyph: '⇅', hue: 10,
    how: 'Turn the phone face-down, then bring it back.',
    touchHow: 'Touch moves are on: swipe down.',
    key: 'F',
  },
  'none': {
    pill: 'TRAP', glyph: '✖', hue: 205,
    how: 'When it says DO NOTHING — freeze. Moving is the mistake. Wait it out.',
  },
  /** Not a move — the mastery layer. Shown once, on the first command of a
   *  player's second run (run one teaches the loop; run two names the target
   *  the veteran will chase forever). */
  'perfect': {
    pill: 'THE GOLD BAND', glyph: '◔', hue: PERFECT_TEACH_HUE,
    svg: BAND_SVG,
    how: 'Every ring opens with a gold band. Answer while the gold is still there — that’s a PERFECT. Chain them and the bonus climbs.',
    note: 'TRY IT NOW — CATCH THE GOLD',
  },
}

// ---------------------------------------------------------------------------
// Launch moment & haptics
// ---------------------------------------------------------------------------

/** Fade out index.html's boot splash (idempotent). The splash painted before
 *  a single byte of JS ran; the shell owns the moment it hands over to the
 *  home screen. It is pointer-events:none, so it never blocks the first tap —
 *  the hold is a designed beat, not a stall. */
function dismissSplash(fade: boolean): void {
  if (typeof document === 'undefined') return
  const el = document.getElementById('boot')
  if (!el) return
  if (!fade) { el.remove(); return }
  const hold = Math.max(0, 800 - performance.now())
  window.setTimeout(() => {
    el.classList.add('gone')
    window.setTimeout(() => el.remove(), 700)
  }, hold)
}

/** One haptic tick where the hardware offers it (feature-detected: Android
 *  browsers have navigator.vibrate, iOS Safari does not — there it degrades
 *  to silence, never to an error). */
function buzz(pattern: number | number[]): void {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }
    if (typeof nav.vibrate === 'function') nav.vibrate(pattern)
  } catch { /* some webviews throw on vibrate — silence is the contract */ }
}

/** Which lesson (if any) a command needs. Swipes share one lesson. */
function lessonKeyFor(cmd: Command): string | null {
  if (cmd.inhibit) return 'none'
  if (cmd.action.startsWith('swipe-')) return 'swipe'
  return LESSONS[cmd.action] ? cmd.action : null
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export interface ShellOptions {
  root: HTMLElement
  /** False in the headless harness: screens never show, gameplay never pauses. */
  enabled: boolean
  /** Start (or restart) a run. Always called from a user gesture. The shell
   *  decides the mode and the seed (daily runs get the date-derived seed). */
  onPlay: (mode: ModeId, seed: number) => void
  /** Back to the idle/home state (from pause or game over). */
  onHome: () => void
  /** Synchronous, inside the user gesture, before any await — unlock audio. */
  onPrime: () => void
  /** The taught gesture was performed — credit it to the engine. */
  onTeachDone: (a: Action) => void
  /** Player resumed from the interruption pause. */
  onResume: () => void
  onMuted: (muted: boolean) => void
  requestMotion: () => Promise<boolean>
  /** Speak a command label during a tutorial (so the ear learns it too). */
  speak: (label: string) => void
}

type Screen =
  | 'none' | 'home' | 'ask' | 'teach' | 'over' | 'paused' | 'help' | 'stats'
  | 'duel'

interface OverData {
  score: number; bestStreak: number; issued: number; runtimeMs: number
  /** The command that ended the run — a death the player can read is a death
   *  that feels earned. */
  deathLabel?: string | null
  deathCause?: 'wrong' | 'timeout' | null
  deathInhibit?: boolean
  /** Which mode the run was (defaults to classic for old callers/poses). */
  mode?: ModeId
  /** Commands answered correctly this run. */
  correct?: number
  /** True when the run ran its full clock (Zen) — a completion, not a death. */
  completed?: boolean
  /** Gold-band hits this run. Optional: when the caller doesn't pass them the
   *  shell falls back to the values it watched go by in frame(). */
  perfects?: number
  /** Longest perfect chain this run (same fallback). */
  bestChain?: number
}

/** How this run sits against the player's own history — computed BEFORE the
 *  run is recorded, so every line on the game-over screen is honest. */
interface OverContext {
  newBest: boolean
  /** 1-based all-time rank of this score within its mode (vs the stored top). */
  rank: number
  prevBest: number
  prevToday: number
  /** Total runs of this mode ever (including this one). */
  modeRuns: number
  /** Daily only: the streak this run just set. */
  dailyStreak: number
}

export class Shell {
  enabled: boolean

  private opts: ShellOptions
  private meta: Meta
  private stats: Stats
  private daily: DailyRec
  /** Mode of the run currently playing (or just ended). */
  private runMode: ModeId = 'classic'
  /** Mode the motion-ask flow will start once answered. */
  private pendingMode: ModeId = 'classic'
  private screen: Screen = 'none'
  private layer = document.createElement('div')
  private hint = document.createElement('div')
  private clock = document.createElement('div')
  private toastEl = document.createElement('div')
  private teach: { key: string; cmd: Command; timer: number | null } | null = null
  private overTimer: number | null = null
  private overRevealAt = 0
  private toastTimer: number | null = null
  private countAnim: number | null = null
  private motion: 'unknown' | 'granted' | 'denied' | 'unavailable' = 'unknown'
  private touchDevice: boolean
  private lastPhase = 'idle'
  private hintShown = false
  private motionToastDone = false
  /** The best score at the moment the current run began — the chase target. */
  private chaseBest = 0
  private bestToastDone = true
  /** Seed of the run currently playing (or just ended) — a challenge link
   *  needs it to reproduce the exact sequence. */
  private runSeed = 0
  /** dailyKey() at the moment the run BEGAN. The daily record binds to this,
   *  never to a re-derived "today" — see settleDailyScore. */
  private runDay = ''
  /** The inbound challenge being offered / played / just settled. */
  private duelCh: DuelChallenge | null = null
  /** The accept tap routed into the motion-ask flow — consume on beginRun. */
  private pendingDuel = false
  /** The current run is a duel run (its result never touches mode records). */
  private duelActive = false
  /** Played/spent duels, keyed by seed — the one-try-per-link gate. */
  private duels: DuelRec[] = []
  /** What the visible over screen shows — feeds the share/challenge buttons. */
  private lastRun: { score: number; correct: number; issued: number; mode: ModeId } | null = null
  /** Mastery numbers watched go by in frame() — endRun's fallback when its
   *  caller predates the perfect layer and doesn't pass them itself. The shell
   *  never reaches into the Engine; it reads the same GameState every frame. */
  private liveMastery = { perfects: 0, bestChain: 0 }

  constructor(opts: ShellOptions) {
    this.opts = opts
    this.enabled = opts.enabled
    this.meta = loadMeta()
    this.stats = loadStats()
    this.daily = loadDaily()
    this.duels = loadDuels()
    this.touchDevice = typeof navigator !== 'undefined' &&
      (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0)

    installTheme()
    this.injectStyle()
    this.layer.className = 'jsh'
    this.layer.hidden = true
    this.hint.className = 'jsh-hint'
    this.hint.hidden = true
    this.clock.className = 'jsh-clock'
    this.clock.hidden = true
    this.toastEl.className = 'jsh-toast'
    this.toastEl.hidden = true
    opts.root.append(this.layer, this.hint, this.clock, this.toastEl)

    // Tap-anywhere handling for the current screen. Buttons stopPropagation.
    this.layer.addEventListener('pointerup', () => this.layerTap())

    // Keyboard parity: the home screen itself advertises SPACE as tap, so a
    // desktop player's first instinct must work. Space/Enter trigger the same
    // primary action as a tap on whichever shell screen is visible.
    addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.layer.hidden) return
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.layerTap(); return }
      // Desktop mode keys on the home screen: 1/2/3 pick, D is the daily.
      if (this.screen === 'home') {
        const pick: Record<string, 'classic' | 'sudden' | 'zen'> =
          { Digit1: 'classic', Digit2: 'sudden', Digit3: 'zen' }
        if (pick[e.code]) { this.selectMode(pick[e.code]); return }
        if (e.code === 'KeyD') { this.opts.onPrime(); this.startDaily() }
      }
    })

    // Motion capability changes, published by the input module.
    addEventListener('jolt:motion-status', ((e: Event) => {
      const d = (e as CustomEvent<{ status?: string }>).detail
      const s = d && d.status
      if (s === 'granted' || s === 'denied' || s === 'unavailable') {
        this.motion = s
        if ((s === 'denied' || s === 'unavailable') && this.touchDevice) {
          // An explicit motion preference cannot survive hardware that says no:
          // motion commands would be physically unanswerable. Fall back.
          if (this.meta.moves === 'motion') {
            this.meta.moves = 'auto'
            saveMeta(this.meta)
            if (this.screen === 'home') this.showHome()
          }
          if (this.meta.moves === 'auto' && !this.motionToastDone) {
            this.motionToastDone = true
            this.toast(s === 'denied'
              ? 'MOTION BLOCKED — TOUCH MOVES ON'
              : 'NO MOTION SENSOR — TOUCH MOVES ON')
          }
        }
      }
    }) as EventListener)

    // A phone call or app switch mid-run must not eat a life.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.enabled || !document.hidden) return
        if (this.screen === 'none' && (this.lastPhase === 'awaiting' || this.lastPhase === 'resolved')) {
          this.showPaused()
        }
      })
    }

    this.muted = this.meta.muted

    // Harness/headless boots never show the home screen, so the splash would
    // sit forever — drop it at once. Real boots hand over on the first show().
    if (!this.enabled) dismissSplash(false)
  }

  muted = false

  /** True while a shell screen owns the world — main.ts must not tick. */
  paused(): boolean { return this.enabled && this.screen !== 'none' }

  /** Are touch stand-ins for the motion commands active right now? */
  touchMovesActive(): boolean {
    if (this.meta.moves === 'touch') return true
    if (this.meta.moves === 'motion') return false
    return this.touchDevice && (this.motion === 'denied' || this.motion === 'unavailable')
  }

  /** Map a raw input action onto the live command's touch substitute. */
  translate(a: Action, cmd: Command | null): Action {
    if (!cmd || cmd.inhibit || !this.touchMovesActive()) return a
    const sub = SUBS[cmd.action]
    return sub && sub.accept.includes(a) ? cmd.action : a
  }

  /** Route a raw input action. True = consumed by the shell (a screen is up). */
  route(a: Action): boolean {
    if (!this.enabled || this.screen === 'none') return false
    if (this.screen === 'teach') this.teachAction(a)
    // Every other screen is driven by real DOM taps, not synthesised actions —
    // a panic shake must never skip the game-over screen.
    return true
  }

  // ------------------------------------------------------------------ teach

  /** Called when a fresh command lands. Starts a tutorial if this command has
   *  never been seen; returns true if the world should freeze. */
  maybeTeach(cmd: Command): boolean {
    if (!this.enabled) return false
    const moveKey = lessonKeyFor(cmd)
    // Move lessons take precedence; once every move on screen is known, the
    // gold band gets its one moment — the first command of the player's
    // SECOND run (run one teaches the loop, run two names the target), so a
    // player who hesitated through run one still meets the band head-on.
    const key = moveKey && !this.meta.taught.includes(moveKey)
      ? moveKey
      : !cmd.inhibit && this.meta.games >= 1 && !this.meta.taught.includes('perfect')
        ? 'perfect' : null
    if (!key) return false
    const lesson = LESSONS[key]
    this.teach = { key, cmd, timer: null }
    this.showTeach(cmd, lesson)
    this.opts.speak(cmd.label)
    if (cmd.inhibit) this.armInhibitTimer()
    return true
  }

  private armInhibitTimer(): void {
    if (!this.teach) return
    if (this.teach.timer !== null) clearTimeout(this.teach.timer)
    const bar = this.layer.querySelector('.jsh-barfill') as HTMLElement | null
    if (bar) {
      bar.style.animation = 'none'
      void bar.offsetWidth               // restart the fill animation
      bar.style.animation = 'jshFill 1.6s linear forwards'
    }
    this.teach.timer = window.setTimeout(() => this.finishTeach(null), 1650)
  }

  private teachAction(a: Action): void {
    const t = this.teach
    if (!t) return
    if (t.cmd.inhibit) {
      // Any action is the mistake — say so and make them wait again.
      const note = this.layer.querySelector('.jsh-note') as HTMLElement | null
      if (note) { note.textContent = 'YOU MOVED — hold still…'; note.classList.add('jsh-bad') }
      const card = this.layer.querySelector('.jsh-card') as HTMLElement | null
      if (card) {
        card.style.animation = 'none'
        void card.offsetWidth
        card.style.animation = 'jshShake .3s ease-out'
      }
      this.armInhibitTimer()
      return
    }
    const wanted = t.cmd.action
    const sub = SUBS[wanted]
    const viaTouch = this.touchMovesActive() && !!sub && sub.accept.includes(a)
    if (a === wanted || viaTouch) { this.finishTeach(wanted); return }
    // Wrong-direction swipe during the swipe lesson: nudge, never punish.
    if (t.key === 'swipe' && a.startsWith('swipe-')) {
      const note = this.layer.querySelector('.jsh-note') as HTMLElement | null
      if (note) { note.textContent = 'OTHER WAY — ' + t.cmd.label; note.classList.add('jsh-bad') }
    }
  }

  private finishTeach(perform: Action | null): void {
    const t = this.teach
    if (!t) return
    if (t.timer !== null) { clearTimeout(t.timer); t.timer = null }
    this.teach = null
    if (!this.meta.taught.includes(t.key)) {
      this.meta.taught.push(t.key)
      saveMeta(this.meta)
    }
    buzz(15)                               // the move landed — confirm it in the hand
    this.hide()
    if (perform) this.opts.onTeachDone(perform)
    // For the inhibition lesson the release itself is the resolution: the
    // engine's short no-go window lapses and scores the success.
  }

  // ------------------------------------------------------------- run events

  /** Called once per landed command: substitute hint pill for motion moves. */
  commandLanded(cmd: Command): void {
    if (!this.enabled) return
    const sub = !cmd.inhibit && this.touchMovesActive() ? SUBS[cmd.action] : undefined
    if (sub) {
      this.hint.textContent = sub.hint
      this.hint.hidden = false
      this.hintShown = true
    } else if (this.hintShown) {
      this.hint.hidden = true
      this.hintShown = false
    }
  }

  /** Cheap per-frame bookkeeping. Also fires the one mid-run chase moment
   *  (the instant the live score passes the mode's personal best) and keeps
   *  the Zen countdown honest. */
  frame(s: GameState): void {
    if (!this.enabled) return
    const phase = s.phase
    this.lastPhase = phase
    // Track the run's mastery numbers as they happen, so the over screen can
    // honor them even when endRun's caller doesn't pass them.
    if (phase === 'awaiting' || phase === 'resolved' || phase === 'over') {
      this.liveMastery.perfects = s.perfects
      this.liveMastery.bestChain = s.bestChain
    }
    if (!this.bestToastDone && s.score > this.chaseBest &&
        (phase === 'awaiting' || phase === 'resolved')) {
      this.bestToastDone = true
      this.toast('THAT’S A NEW BEST — KEEP GOING')
    }
    if (this.hintShown && phase !== 'awaiting') {
      this.hint.hidden = true
      this.hintShown = false
    }
    // Zen runs end on the clock, so the clock must be visible.
    const zenLive = s.mode === 'zen' && this.screen === 'none' &&
      (phase === 'awaiting' || phase === 'resolved')
    if (zenLive) {
      const left = Math.max(0, Math.ceil((MODES.zen.timeLimitMs - s.runtime) / 1000))
      const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
      if (this.clock.textContent !== txt) this.clock.textContent = txt
      if (this.clock.hidden) this.clock.hidden = false
    } else if (!this.clock.hidden) {
      this.clock.hidden = true
    }
    // The daily score persists as it grows, so a crash or reload mid-run
    // keeps what was actually earned rather than zeroing the day. Bound to
    // the day the run STARTED, so crossing midnight mid-run keeps counting.
    if (s.mode === 'daily' && s.score > this.daily.score && this.daily.day === this.runDay) {
      this.daily.score = s.score
      saveDaily(this.daily)
    }
  }

  /** The run ended. Record it into the lifetime stats (and the daily record,
   *  when it was the daily), then reveal the game-over panel after the
   *  renderer's death beat has landed. The OverContext is computed against the
   *  history as it stood BEFORE this run, so every line it produces is honest. */
  endRun(data: OverData): void {
    const mode: ModeId = data.mode ?? 'classic'
    const today = dailyKey()
    const st = this.stats
    // Mastery numbers: what the caller passed, else what frame() watched
    // happen. Filled onto `data` so every over screen downstream honors them.
    data.perfects = Math.max(0, data.perfects ?? this.liveMastery.perfects)
    data.bestChain = Math.max(0, data.bestChain ?? this.liveMastery.bestChain)

    // --- a duel run: real play, but its score never enters the mode
    // records — a duel replays a KNOWN sequence, and known-sequence scores
    // must not be able to overwrite blind-run bests (and the challenger's
    // claim, being forgeable, never enters anything at all).
    if (this.duelActive) {
      st.obeyed += Math.max(0, data.correct ?? 0)
      st.runs++
      if (st.lastDay !== today) { st.lastDay = today; st.days++ }
      if (data.bestStreak > st.bestStreak) st.bestStreak = data.bestStreak
      st.perfects += data.perfects
      if (data.bestChain > st.bestChain) st.bestChain = data.bestChain
      saveStats(st)
      this.meta.games++
      if (data.bestStreak > this.meta.bestStreak) this.meta.bestStreak = data.bestStreak
      saveMeta(this.meta)
      const ch = this.duelCh
      if (ch) {
        const rec = this.duels.find((d) => d.seed === ch.seed)
        if (rec && data.score >= rec.mine) {
          rec.mine = data.score
          rec.obeyed = Math.max(0, data.correct ?? 0)
          rec.n = Math.max(1, data.issued)
          saveDuels(this.duels)
        }
      }
      if (!this.enabled) return
      buzz(45)                             // the run's full stop, felt in the hand
      if (this.overTimer !== null) clearTimeout(this.overTimer)
      this.overTimer = window.setTimeout(() => {
        this.overTimer = null
        this.showDuelOver(data)
      }, 950)
      return
    }

    // --- context, before recording -------------------------------------
    const prevBest = st.best[mode] || 0
    const prevToday = st.todayDay === today ? (st.todayBest[mode] || 0) : 0
    const newBest = data.score > prevBest
    // Honest rank: computed against the list as it stood, so a tie reads as
    // "matched", never as the standing score's own rank.
    const rank = rankOf(st.top[mode], data.score)

    // --- lifetime stats -------------------------------------------------
    st.obeyed += Math.max(0, data.correct ?? 0)
    st.runs++
    st.modeRuns[mode]++
    if (st.lastDay !== today) { st.lastDay = today; st.days++ }
    if (data.bestStreak > st.bestStreak) st.bestStreak = data.bestStreak
    if (st.todayDay !== today) { st.todayDay = today; st.todayBest = zeroPerMode() }
    if (data.score > st.todayBest[mode]) st.todayBest[mode] = data.score
    st.perfects += data.perfects ?? 0
    if ((data.bestChain ?? 0) > st.bestChain) st.bestChain = data.bestChain ?? 0
    if (newBest) st.best[mode] = data.score
    st.top[mode] = [...st.top[mode], data.score].sort((a, b) => b - a).slice(0, 10)
    saveStats(st)
    if (mode === 'classic') recordScore(data.score)   // keep the legacy key true

    // --- the daily record: the attempt was committed at run START (so
    // quitting mid-run cannot un-spend it); here the final score lands,
    // against the day the run STARTED — crossing midnight loses nothing.
    let dailyStreak = 0
    if (mode === 'daily' && this.daily.day === this.runDay) {
      dailyStreak = this.daily.streak
      const settled = settleDailyScore(this.daily, this.runDay, data.score)
      if (settled !== this.daily) { this.daily = settled; saveDaily(this.daily) }
    }

    this.meta.games++
    if (data.bestStreak > this.meta.bestStreak) this.meta.bestStreak = data.bestStreak
    saveMeta(this.meta)
    if (!this.enabled) return
    // Felt in the hand: a Zen completion lands soft, a death lands hard, and a
    // new best gets its own celebratory triple at the reveal (in showOver).
    buzz(data.completed ? [15, 60, 15] : 45)
    const ctx: OverContext = {
      newBest, rank, prevBest, prevToday,
      modeRuns: st.modeRuns[mode], dailyStreak,
    }
    if (this.overTimer !== null) clearTimeout(this.overTimer)
    this.overTimer = window.setTimeout(() => {
      this.overTimer = null
      this.showOver(data, ctx)
    }, 950)
  }

  // ---------------------------------------------------------------- screens

  showHome(): void {
    const m = this.meta.mode
    const best = this.stats.best[m] || 0
    const chip = best > 0
      ? `BEST <b>${best}</b> · TOP STREAK <b>×${this.stats.bestStreak}</b>`
      : 'FIRST RUN — IT TEACHES AS YOU GO'
    const DESC: Record<'classic' | 'sudden' | 'zen', string> = {
      classic: 'THREE LIVES · THE FULL RIDE',
      sudden: 'ONE LIFE · STARTS HOT',
      zen: '90 SECONDS · NO GAME OVER',
    }
    const seg = PICKABLE.map((id) =>
      `<button class="jsh-seg${id === m ? ' jsh-seg-on' : ''}" data-act="mode-${id}">${
        id === 'sudden' ? 'SUDDEN' : MODES[id].label}</button>`).join('')
    // The daily: today's seed once, then an honest "come back tomorrow".
    const today = dailyKey()
    const played = this.daily.day === today
    const streakLive = played || this.daily.day === yesterdayKey() ? this.daily.streak : 0
    const dailyBtn = played
      ? `<button class="jsh-daily jsh-daily-done" data-act="daily">DAILY ✓ ${this.daily.score}${
          streakLive > 1 ? ` · STREAK ${streakLive}` : ''} · NEXT IN ${untilMidnight()}</button>`
      : `<button class="jsh-daily" data-act="daily">◆ TODAY’S CHALLENGE${
          streakLive > 0 ? ` · STREAK ${streakLive}` : ''} — ONE TRY</button>`
    const keys = !this.touchDevice
      ? '<div class="jsh-keys">SPACE TAP · ARROWS SWIPE · T TWIST · S SHAKE · F FLIP · H HOLD · P PINCH<br>1 CLASSIC · 2 SUDDEN · 3 ZEN · D DAILY</div>'
      : ''
    // The cover of the product: crest (the bolt, with the beat alive behind
    // it), wordmark, one gold CTA. Utilities recede to the footer.
    this.show('home', `
      <div class="jsh-wrap jsh-ground jsh-home jsh-in">
        <div class="jsh-crest"><span class="jsh-crestring"></span><span
          class="jsh-crestring jsh-crestring2"></span>${boltSvg('clamp(40px,12vw,58px)')}</div>
        <div class="jsh-logo">JOLT</div>
        <div class="jsh-tag">OBEY THE VOICE · BEAT THE RING</div>
        <div class="jsh-modes">
          <div class="jsh-segrow">${seg}</div>
          <div class="jsh-desc">${DESC[m]}</div>
          <div class="jsh-bestline">${chip}</div>
        </div>
        <div class="jsh-cta jsh-pulse">PLAY</div>
        ${dailyBtn}
        <div class="jsh-row jsh-util">
          <button class="jsh-btn" data-act="sound">SOUND ${this.meta.muted ? 'OFF' : 'ON'}</button>
          <button class="jsh-btn" data-act="moves">${this.touchMovesActive() ? 'TOUCH' : 'MOTION'} MOVES</button>
          <button class="jsh-btn" data-act="stats">STATS</button>
          <button class="jsh-btn" data-act="help">HELP</button>
        </div>
        ${keys}
      </div>`)
    this.wireButtons()
  }

  private selectMode(id: 'classic' | 'sudden' | 'zen'): void {
    if (this.meta.mode === id) return
    this.meta.mode = id
    saveMeta(this.meta)
    if (this.screen === 'home') this.showHome()
  }

  private showAsk(): void {
    this.show('ask', `
      <div class="jsh-wrap jsh-dim jsh-in">
        <div class="jsh-card">
          <div class="jsh-pill jsh-pill-gold">MOTION CHECK</div>
          <div class="jsh-h">PLAY IT PHYSICAL?</div>
          <div class="jsh-p">The best commands are real: SHAKE the phone, TWIST it like a key,
            FLIP it face-down. That needs the motion sensor — used for play only,
            nothing is recorded.</div>
          <button class="jsh-btn jsh-pri" data-act="motion-yes">ENABLE MOTION</button>
          <button class="jsh-btn" data-act="motion-no">NO THANKS — USE TOUCH MOVES</button>
        </div>
      </div>`)
    this.wireButtons()
  }

  private showTeach(cmd: Command, lesson: Lesson): void {
    const touch = this.touchMovesActive()
    const how = touch && lesson.touchHow ? lesson.touchHow : lesson.how
    // The swipe lesson shows the arrow for THIS command's direction, matching
    // the backdrop glyph the renderer will use for it in play.
    const DIR: Record<string, string> = {
      'swipe-left': '◀', 'swipe-right': '▶', 'swipe-up': '▲', 'swipe-down': '▼',
    }
    const glyph = DIR[cmd.action] ?? lesson.glyph
    const keyHint = !this.touchDevice && lesson.key
      ? `<div class="jsh-keys">keyboard: ${lesson.key}</div>` : ''
    const foot = cmd.inhibit
      ? `<div class="jsh-bar"><div class="jsh-barfill"></div></div>
         <div class="jsh-note jsh-note-cold">HOLD STILL…</div>`
      : `<div class="jsh-note jsh-pulse">${lesson.note ?? 'TRY IT NOW'}</div>`
    const accent = `hsl(${lesson.hue} 90% 62%)`
    const visual = lesson.svg
      ? `<div class="jsh-ringviz">${lesson.svg}</div>`
      : `<div class="jsh-glyph" style="color:${accent}">${glyph}</div>`
    this.show('teach', `
      <div class="jsh-wrap jsh-dim jsh-in">
        <div class="jsh-card" style="border-color:${accent}44">
          <div class="jsh-pill" style="color:${accent};border-color:${accent}55">${lesson.pill}</div>
          ${visual}
          <div class="jsh-h">${cmd.label}</div>
          <div class="jsh-p">${how}</div>
          ${keyHint}
          ${foot}
          <div class="jsh-keys">no lives lost while learning</div>
        </div>
      </div>`)
  }

  /** The gold judgment strip: perfects and best chain. Absent entirely for a
   *  perfect-less run, so the gold stays something you did, never furniture.
   *  `inlineGrade` keeps the letter inside the strip (duel head-to-heads,
   *  where the score row has no room for a stamp). */
  private judgeHtml(data: OverData, inlineGrade = false): string {
    const perfects = data.perfects ?? 0
    const bestChain = data.bestChain ?? 0
    if (perfects <= 0) return ''
    const grade = inlineGrade
      ? gradeRun(perfects, data.correct ?? data.issued, bestChain) : null
    const chain = bestChain >= 2 ? ` · CHAIN ×${bestChain}` : ''
    return `<div class="jsh-judge">${grade ? `<b>${grade}</b>` : ''}<span>${perfects} PERFECT${
      perfects === 1 ? '' : 'S'}${chain}</span></div>`
  }

  /** The grade STAMP — the emotional payoff, slammed onto the score's corner a
   *  beat after the count-up lands. Empty when the run earned no letter. */
  private stampHtml(data: OverData): string {
    const perfects = data.perfects ?? 0
    if (perfects <= 0) return ''
    const grade = gradeRun(perfects, data.correct ?? data.issued, data.bestChain ?? 0)
    return grade ? `<div class="jsh-stamp">${grade}</div>` : ''
  }

  private showOver(data: OverData, ctx: OverContext): void {
    const mode: ModeId = data.mode ?? 'classic'
    if (ctx.newBest) buzz([15, 60, 15, 60, 35])   // the record moment, felt
    // Whatever this screen shows is what the share/challenge buttons copy.
    this.lastRun = {
      score: data.score, correct: data.correct ?? data.issued,
      issued: Math.max(1, data.issued), mode,
    }
    const modeName = MODES[mode].label
    const completed = !!data.completed
    const secs = Math.max(1, Math.round(data.runtimeMs / 1000))

    // One line of personal context, so the run ends against YOUR history:
    // new best > matched best > all-time rank > best today > distance to best.
    const gap = ctx.prevBest - data.score
    const bestLine = ctx.newBest
      ? `<div class="jsh-best jsh-pop">NEW ${modeName} BEST</div>`
      : ctx.prevBest <= 0 ? ''
      : gap <= 0 ? `<div class="jsh-chip">MATCHED YOUR ${modeName} BEST — ${ctx.prevBest}</div>`
      : ctx.rank >= 2 && ctx.rank <= 10 && ctx.modeRuns > 3
        ? `<div class="jsh-chip">YOUR #${ctx.rank} ${modeName} RUN EVER · BEST ${ctx.prevBest}</div>`
      : data.score > ctx.prevToday && ctx.prevToday > 0
        ? `<div class="jsh-chip">YOUR BEST RUN TODAY · ALL-TIME ${ctx.prevBest}</div>`
      : `<div class="jsh-chip">BEST ${ctx.prevBest} · ${gap} SHY</div>`

    // Name the killer, so the death is legible and the retry has a target.
    // A completed Zen run has no killer — the clock simply ran out.
    const killer = !completed && data.deathLabel
      ? `<div class="jsh-cause">${
          data.deathInhibit ? 'YOU MOVED — ' + data.deathLabel
          : data.deathCause === 'timeout' ? 'TOO SLOW — ' + data.deathLabel
          : 'WRONG MOVE — ' + data.deathLabel}</div>`
      : ''

    const title = completed ? 'TIME — ZEN DONE'
      : mode === 'daily' ? 'DAILY RUN OVER'
      : mode === 'sudden' ? 'SUDDEN DEATH'
      : 'RUN OVER'
    const titleColor = completed ? 'var(--j-good)' : 'var(--j-bad-soft)'

    const statRow = `
        <div class="jsh-stats">
          <span>×${data.bestStreak}<i>TOP STREAK</i></span>
          <span>${data.correct ?? data.issued}<i>OBEYED</i></span>
          <span>${secs}s<i>${completed ? 'IN FLOW' : 'SURVIVED'}</i></span>
        </div>`
    const judge = this.judgeHtml(data)
    const score = `<div class="jsh-scorewrap"><div class="jsh-score${
      ctx.newBest ? ' jsh-gold' : ''}">0</div>${this.stampHtml(data)}</div>`

    // The daily ends differently: the attempt is spent, the pull is tomorrow.
    if (mode === 'daily') {
      const streakLine = ctx.dailyStreak > 0
        ? `<div class="jsh-chip jsh-daychip">DAILY STREAK ${ctx.dailyStreak}${
            ctx.dailyStreak > 1 && ctx.dailyStreak === this.daily.bestStreak ? ' — YOUR LONGEST' : ''}</div>`
        : ''
      this.show('over', `
        <div class="jsh-wrap jsh-deep jsh-in jsh-stage">
          <div class="jsh-kick" style="color:${titleColor}">${title}</div>
          ${killer}
          ${score}
          ${streakLine}
          ${bestLine}
          ${statRow}
          ${judge}
          <div class="jsh-late jsh-desc">THAT WAS TODAY’S ONE TRY · NEW SEED IN ${untilMidnight()}</div>
          <div class="jsh-late jsh-play jsh-pulse">SEE YOU TOMORROW — TAP FOR MENU</div>
          <div class="jsh-late jsh-row">
            <button class="jsh-btn" data-act="share">${this.canNativeShare() ? 'SHARE RESULT' : 'COPY RESULT'}</button>
            <button class="jsh-btn" data-act="challenge">CHALLENGE A FRIEND</button>
          </div>
        </div>`)
      this.wireButtons()
      this.overRevealAt = performance.now()
      this.countUp(data.score)
      return
    }

    // A daily still unplayed today is the strongest reason to keep going —
    // offer it right on the game-over screen.
    const dailyNudge = this.daily.day !== dailyKey()
      ? '<button class="jsh-late jsh-daily" data-act="daily">◆ TODAY’S CHALLENGE WAITS</button>'
      : ''
    this.show('over', `
      <div class="jsh-wrap jsh-deep jsh-in jsh-stage">
        <div class="jsh-kick" style="color:${titleColor}">${title}</div>
        ${killer}
        ${score}
        ${bestLine}
        ${statRow}
        ${judge}
        <div class="jsh-late jsh-cta jsh-pulse">GO AGAIN</div>
        ${dailyNudge}
        <div class="jsh-late jsh-row">
          <button class="jsh-btn" data-act="challenge">CHALLENGE A FRIEND</button>
          <button class="jsh-btn" data-act="menu">MENU</button>
        </div>
      </div>`)
    this.wireButtons()
    this.overRevealAt = performance.now()
    this.countUp(data.score)
  }

  // ------------------------------------------------------------------ duels

  /** An inbound challenge link landed. Called by main.ts at boot, INSTEAD of
   *  showHome, only after decodeDuel validated every parameter. */
  offerDuel(ch: DuelChallenge): void {
    this.duelCh = ch
    const rec = this.duels.find((d) => d.seed === ch.seed)
    if (rec && ch.score !== rec.theirs) {
      // A fresh claim on a seed we already played (the return volley coming
      // home) — remember their latest claim so the rebuttal stays current.
      rec.theirs = ch.score
      saveDuels(this.duels)
    }
    this.showDuelCard()
  }

  /** The challenge card: the claim, the terms, one try — or, if this link's
   *  seed was already spent, the settled head-to-head. */
  private showDuelCard(): void {
    const ch = this.duelCh
    if (!ch) { this.showHome(); return }
    const rec = this.duels.find((d) => d.seed === ch.seed)
    const modeName = MODES[ch.mode].label
    if (rec) {
      // Already settled: this seed has been played (or the try was spent).
      const verdict = rec.mine > ch.score ? 'YOU HOLD THIS ONE'
        : rec.mine < ch.score ? 'THEY HOLD THIS ONE' : 'DEAD HEAT'
      this.show('duel', `
        <div class="jsh-wrap jsh-ground jsh-in">
          <div class="jsh-card">
            <div class="jsh-pill jsh-pill-gold">DUEL SETTLED</div>
            <div class="jsh-h">${verdict}</div>
            <div class="jsh-vs"><span>${rec.mine}<i>YOU</i></span><b>·</b><span>${ch.score}<i>THEY CLAIM</i></span></div>
            <div class="jsh-p">This sequence has been run — one try per challenge,
              and it’s spent. Send your side back, or start a fresh run and fire
              a new challenge from its game-over screen.</div>
            <div class="jsh-row">
              <button class="jsh-btn jsh-pri" data-act="rebuttal">${this.canNativeShare() ? 'SEND YOUR REPLY' : 'COPY YOUR REPLY'}</button>
              <button class="jsh-btn" data-act="menu">MENU</button>
            </div>
          </div>
        </div>`)
      this.wireButtons()
      return
    }
    this.show('duel', `
      <div class="jsh-wrap jsh-ground jsh-in">
        <div class="jsh-card">
          <div class="jsh-pill jsh-pill-gold">◆ DUEL ◆</div>
          <div class="jsh-h">SOMEONE CLAIMS ${ch.score}</div>
          <div class="jsh-p">On this exact sequence — ${ch.commands} command${
            ch.commands === 1 ? '' : 's'}, ${modeName} rules. You’ll face the
            identical run, same speed, same order. Their number is their claim;
            yours will be earned.</div>
          <div class="jsh-chip jsh-daychip">ONE TRY · NO WARM-UP</div>
          <button class="jsh-btn jsh-pri" data-act="duel-accept">TAKE THE DUEL</button>
          <button class="jsh-btn" data-act="menu">NOT NOW — MENU</button>
        </div>
      </div>`)
    this.wireButtons()
  }

  /** The head-to-head after a duel run — and the return volley. */
  private showDuelOver(data: OverData): void {
    const ch = this.duelCh
    if (!ch) { this.showOverFallback(data); return }
    this.lastRun = {
      score: data.score, correct: data.correct ?? data.issued,
      issued: Math.max(1, data.issued), mode: ch.mode,
    }
    const mine = data.score
    const win = mine > ch.score
    const tie = mine === ch.score
    const title = win ? 'DUEL — YOU TAKE IT' : tie ? 'DUEL — DEAD HEAT' : 'DUEL — THEY HOLD'
    const titleColor = win ? 'var(--j-good)' : tie ? 'var(--j-gold)' : 'var(--j-bad-soft)'
    // A completed zen duel has no killer — the clock simply ran out.
    const killer = !data.completed && data.deathLabel
      ? `<div class="jsh-cause">${
          data.deathInhibit ? 'YOU MOVED — ' + data.deathLabel
          : data.deathCause === 'timeout' ? 'TOO SLOW — ' + data.deathLabel
          : 'WRONG MOVE — ' + data.deathLabel}</div>`
      : ''
    const margin = win ? `AHEAD BY ${mine - ch.score}` : tie ? 'NOT A POINT IN IT'
      : `${ch.score - mine} SHORT OF THE CLAIM`
    this.show('over', `
      <div class="jsh-wrap jsh-deep jsh-in jsh-stage">
        <div class="jsh-kick" style="color:${titleColor}">${title}</div>
        ${killer}
        <div class="jsh-vs jsh-duelvs">
          <span><em class="jsh-score${win ? ' jsh-gold' : ''}">0</em><i>YOU</i></span>
          <b>·</b>
          <span><em class="jsh-their">${ch.score}</em><i>THEY CLAIM</i></span>
        </div>
        <div class="jsh-chip">${margin}</div>
        <div class="jsh-stats">
          <span>×${data.bestStreak}<i>TOP STREAK</i></span>
          <span>${data.correct ?? data.issued}<i>OBEYED</i></span>
          <span>${Math.max(1, Math.round(data.runtimeMs / 1000))}s<i>SURVIVED</i></span>
        </div>
        ${this.judgeHtml(data, true)}
        <div class="jsh-late jsh-play jsh-pulse">${win ? 'SEND IT BACK — TAP FOR MENU' : 'TAP FOR MENU'}</div>
        <div class="jsh-late jsh-row">
          <button class="jsh-btn jsh-pri" data-act="rebuttal">SEND THE REBUTTAL</button>
          <button class="jsh-btn" data-act="menu">MENU</button>
        </div>
      </div>`)
    this.wireButtons()
    this.overRevealAt = performance.now()
    this.countUp(mine)
  }

  /** A duel over-screen with no challenge in hand (should not happen) —
   *  degrade to the plain over screen rather than a blank layer. */
  private showOverFallback(data: OverData): void {
    this.showOver(data, {
      newBest: false, rank: 99, prevBest: 0, prevToday: 0, modeRuns: 1, dailyStreak: 0,
    })
  }

  /** Where challenge links point: this page, stripped of query and hash. */
  private pageBase(): string {
    try { return location.origin + location.pathname } catch { return '' }
  }

  /** True when a native share sheet will actually open — drives button verbs. */
  private canNativeShare(): boolean {
    return this.touchDevice &&
      typeof (navigator as { share?: unknown }).share === 'function'
  }

  /** Share a result artifact the way the device natively does it: the system
   *  share sheet where one exists (a user gesture is live — every caller is a
   *  button), the clipboard elsewhere. A dismissed sheet is a decision, not a
   *  failure — it stays silent; a sheet that ERRORS falls back to the
   *  clipboard so the artifact is never lost. */
  private shareOut(text: string, okMsg: string): void {
    const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> }
    if (this.touchDevice && typeof nav.share === 'function') {
      try {
        nav.share({ text })
          .then(() => this.toast('SHARED'))
          .catch((err: unknown) => {
            if ((err as { name?: string } | null)?.name === 'AbortError') return
            this.copyText(text, okMsg)
          })
        return
      } catch { /* a throwing share() implementation — use the clipboard */ }
    }
    this.copyText(text, okMsg)
  }

  /** Copy to the clipboard with an honest last resort: if the clipboard is
   *  unavailable too, the toast carries the LINK itself (or the artifact's
   *  first line when there is none) and stays up long enough to read —
   *  a challenge must never silently lose its URL. */
  private copyText(text: string, okMsg: string): void {
    const lastResort = () => {
      const url = text.split('\n').find((l) => /^https?:\/\//.test(l))
      this.toast(url ? `COPY BLOCKED — YOUR LINK: ${url}` : text.split('\n')[0], 7000)
    }
    try {
      void navigator.clipboard.writeText(text)
        .then(() => this.toast(okMsg))
        .catch(lastResort)
    } catch { lastResort() }
  }

  /** Lifetime stats — the visible shape of every run ever played. */
  private showStats(): void {
    const st = this.stats
    const streakLive = this.daily.day === dailyKey() || this.daily.day === yesterdayKey()
      ? this.daily.streak : 0
    const val = (n: number) => (n > 0 ? String(n) : '—')
    this.show('stats', `
      <div class="jsh-wrap jsh-dim jsh-in">
        <div class="jsh-card jsh-left">
          <div class="jsh-h">YOUR NUMBERS</div>
          <div class="jsh-grid">
            <span>${val(st.obeyed)}<i>COMMANDS OBEYED</i></span>
            <span>${val(st.runs)}<i>RUNS</i></span>
            <span>${val(st.days)}<i>DAYS PLAYED</i></span>
            <span>${st.bestStreak > 0 ? '×' + st.bestStreak : '—'}<i>BEST STREAK EVER</i></span>
            <span class="jsh-goldcell">${val(st.perfects)}<i>PERFECTS</i></span>
            <span class="jsh-goldcell">${st.bestChain > 0 ? '×' + st.bestChain : '—'}<i>BEST PERFECT CHAIN</i></span>
            <span>${val(streakLive)}<i>DAILY STREAK</i></span>
            <span>${val(this.daily.bestStreak)}<i>LONGEST DAILY STREAK</i></span>
          </div>
          <div class="jsh-legend">
            <b>CLASSIC</b><span>best ${val(st.best.classic)} · ${val(st.modeRuns.classic)} runs</span>
            <b>SUDDEN</b><span>best ${val(st.best.sudden)} · ${val(st.modeRuns.sudden)} runs</span>
            <b>ZEN</b><span>best ${val(st.best.zen)} · ${val(st.modeRuns.zen)} runs</span>
            <b>DAILY</b><span>best ${val(st.best.daily)} · ${val(this.daily.played)} played</span>
          </div>
          <div class="jsh-p jsh-small">All of this lives on this device only — nothing is
            uploaded, no account, no network.</div>
          <div class="jsh-row">
            <button class="jsh-btn jsh-pri" data-act="back">BACK</button>
          </div>
        </div>
      </div>`)
    this.wireButtons()
  }

  private showPaused(): void {
    this.show('paused', `
      <div class="jsh-wrap jsh-deep jsh-in">
        <div class="jsh-kick">PAUSED</div>
        <div class="jsh-cta jsh-pulse">RESUME</div>
        <div class="jsh-row">
          <button class="jsh-btn" data-act="menu">MENU</button>
        </div>
      </div>`)
    this.wireButtons()
  }

  private showHelp(): void {
    const touch = this.touchMovesActive()
    this.show('help', `
      <div class="jsh-wrap jsh-dim jsh-in">
        <div class="jsh-card jsh-left">
          <div class="jsh-h">HOW TO PLAY</div>
          <div class="jsh-p">A voice barks a command. Do it before the ring closes.
            It only gets faster. CLASSIC gives three lives; SUDDEN DEATH one, starting
            hot; ZEN is 90 seconds with no game over. The DAILY is one try on a seed
            everyone shares today — come back tomorrow for the next.</div>
          <div class="jsh-legend">
            <b>TAP</b><span>touch the screen</span>
            <b>SWIPE</b><span>flick that way — FLICK UP and PULL DOWN are swipes too</span>
            <b>HOLD</b><span>press until it counts</span>
            <b>PINCH</b><span>two fingers, squeeze together</span>
            <b>SHAKE</b><span>${touch ? 'flick fast, any direction' : 'shake the phone itself'}</span>
            <b>TWIST</b><span>${touch ? 'swipe right' : 'quarter-turn, like a key'}</span>
            <b>FLIP</b><span>${touch ? 'swipe down' : 'phone face-down, then back'}</span>
            <b>DO NOTHING</b><span>freeze — moving is the mistake</span>
          </div>
          <div class="jsh-p jsh-small">Sound is atmosphere, never information: every command
            is printed on screen, so the game is fully playable deaf or muted.
            Touch moves replace the physical commands any time — one hand is enough.</div>
          <div class="jsh-row">
            <button class="jsh-btn" data-act="reset-tutorial">REPLAY TUTORIAL</button>
            <button class="jsh-btn jsh-pri" data-act="back">BACK</button>
          </div>
        </div>
      </div>`)
    this.wireButtons()
  }

  /** True once the screenshot harness has posed a screen: entrance/stagger
   *  animations snap to their settled values so a single captured frame shows
   *  the finished composition (the shell twin of render.ts's `posed` path). */
  private snap = false

  /** Pose any screen with sample data — used only by the screenshot harness. */
  pose(name: string): void {
    this.enabled = true
    this.snap = true
    if (name === 'home') this.showHome()
    else if (name === 'ask') this.showAsk()
    else if (name === 'help') this.showHelp()
    else if (name === 'stats') {
      // Seed plausible lifetime numbers so the screen poses truthfully.
      this.stats.obeyed = Math.max(this.stats.obeyed, 1187)
      this.stats.runs = Math.max(this.stats.runs, 42)
      this.stats.days = Math.max(this.stats.days, 6)
      this.stats.bestStreak = Math.max(this.stats.bestStreak, 21)
      this.stats.perfects = Math.max(this.stats.perfects, 214)
      this.stats.bestChain = Math.max(this.stats.bestChain, 12)
      this.showStats()
    }
    else if (name === 'paused') this.showPaused()
    else if (name === 'over') {
      this.runMode = 'classic'
      this.runSeed = 424242
      this.showOver({
        score: 487, bestStreak: 12, issued: 34, runtimeMs: 58200,
        deathLabel: 'TWIST IT', deathCause: 'timeout', deathInhibit: false,
        mode: 'classic', correct: 31, perfects: 12, bestChain: 7,
      }, { newBest: false, rank: 4, prevBest: 1240, prevToday: 0, modeRuns: 12, dailyStreak: 0 })
    } else if (name === 'over-best') {
      this.runMode = 'classic'
      this.runSeed = 424242
      this.showOver({
        score: 1240, bestStreak: 21, issued: 61, runtimeMs: 84100,
        deathLabel: 'DO NOTHING', deathCause: 'wrong', deathInhibit: true,
        mode: 'classic', correct: 55, perfects: 40, bestChain: 15,
      }, { newBest: true, rank: 1, prevBest: 980, prevToday: 0, modeRuns: 12, dailyStreak: 0 })
    } else if (name === 'over-daily') {
      this.runMode = 'daily'
      this.runSeed = 424242
      this.showOver({
        score: 640, bestStreak: 14, issued: 41, runtimeMs: 63400,
        deathLabel: 'FLIP IT', deathCause: 'timeout', deathInhibit: false,
        mode: 'daily', correct: 37, perfects: 9, bestChain: 5,
      }, { newBest: false, rank: 3, prevBest: 810, prevToday: 0, modeRuns: 5, dailyStreak: 4 })
    } else if (name === 'over-zen') {
      this.runMode = 'zen'
      this.showOver({
        score: 720, bestStreak: 18, issued: 52, runtimeMs: 90000,
        mode: 'zen', correct: 47, completed: true, perfects: 21, bestChain: 9,
      }, { newBest: true, rank: 1, prevBest: 610, prevToday: 0, modeRuns: 3, dailyStreak: 0 })
    }
    else if (name === 'duel') {
      // A fresh inbound challenge card.
      this.duelCh = { seed: 424242, score: 487, commands: 34, mode: 'classic' }
      this.duels = this.duels.filter((d) => d.seed !== 424242)
      this.showDuelCard()
    } else if (name === 'duel-settled') {
      // The same link reopened after the try was spent.
      this.duelCh = { seed: 424243, score: 487, commands: 34, mode: 'classic' }
      if (!this.duels.some((d) => d.seed === 424243)) {
        this.duels.push({
          seed: 424243, mine: 512, theirs: 487, day: dailyKey(), obeyed: 43, n: 46,
        })
      }
      this.showDuelCard()
    } else if (name === 'over-duel') {
      // The head-to-head after a duel run.
      this.duelCh = { seed: 424244, score: 487, commands: 34, mode: 'classic' }
      this.duelActive = true
      this.runSeed = 424244
      this.showDuelOver({
        score: 512, bestStreak: 15, issued: 46, runtimeMs: 66000,
        deathLabel: 'PINCH IT', deathCause: 'timeout', deathInhibit: false,
        mode: 'classic', correct: 43, perfects: 16, bestChain: 6,
      })
    }
    else if (name === 'teach-perfect') {
      const cmd: Command = { action: 'tap', label: 'TAP IT', windowMs: 1760, inhibit: false }
      this.teach = { key: 'perfect', cmd, timer: null }
      this.showTeach(cmd, LESSONS['perfect'])
    }
    else if (name === 'teach-none') {
      this.teach = { key: 'none', cmd: { action: 'none', label: 'DO NOTHING', windowMs: 200, inhibit: true }, timer: null }
      this.showTeach(this.teach.cmd, LESSONS['none'])
    } else if (name.startsWith('teach-')) {
      const a = name.slice(6) as Action
      const key = a.startsWith('swipe-') ? 'swipe' : a
      const lesson = LESSONS[key]
      if (lesson) {
        const cmd: Command = { action: a, label: a.replace('-', ' ').toUpperCase() + (a.includes('-') ? '' : ' IT'), windowMs: 1000, inhibit: false }
        this.teach = { key, cmd, timer: null }
        this.showTeach(cmd, lesson)
      }
    }
  }

  // ------------------------------------------------------------ interaction

  private layerTap(): void {
    const now = performance.now()
    switch (this.screen) {
      case 'home':
        buzz(12)
        this.opts.onPrime()
        this.startFlow(this.meta.mode)
        break
      case 'over':
        if (now - this.overRevealAt < 350) return   // last-gasp flail guard
        buzz(12)
        // The daily attempt — and a duel's one try — are spent: their over
        // screens tap back to the menu, never into a replay.
        if (this.runMode === 'daily' || this.duelActive) {
          this.duelActive = false
          this.duelCh = null
          this.hide()
          this.opts.onHome()
          this.showHome()
          return
        }
        this.opts.onPrime()
        this.beginRun(this.runMode)
        break
      case 'paused':
        buzz(10)
        this.hide()
        this.opts.onResume()
        break
      default: break   // ask / teach / help / stats are driven by their own controls
    }
  }

  /** Every run start funnels through here so the chase target is armed. A tiny
   *  best is not worth a mid-run interruption. */
  private beginRun(mode: ModeId): void {
    this.liveMastery = { perfects: 0, bestChain: 0 }
    // A pending duel takes the run over: known seed, one committed try.
    const duel = this.pendingDuel ? this.duelCh : null
    this.pendingDuel = false
    this.duelActive = !!duel
    if (duel) {
      if (this.duels.some((d) => d.seed === duel.seed)) {
        // The gate re-checked at the last moment (e.g. motion-ask detour).
        this.duelActive = false
        this.showDuelCard()
        return
      }
      // Commit the try NOW, like the daily: quitting mid-run spends it.
      this.duels.push({
        seed: duel.seed, mine: 0, theirs: duel.score, day: dailyKey(), obeyed: 0, n: 1,
      })
      saveDuels(this.duels)
      this.runMode = duel.mode
      this.runDay = dailyKey()
      this.runSeed = duel.seed
      this.bestToastDone = true   // a duel run never claims "new best"
      this.hide()
      this.opts.onPlay(duel.mode, duel.seed)
      return
    }
    if (mode === 'daily') {
      const today = dailyKey()
      if (this.daily.day === today) {
        // The honest gate: one scored attempt per day, no exceptions.
        this.toast(`DAILY DONE — NEW SEED IN ${untilMidnight()}`)
        if (this.screen !== 'home') this.showHome()
        return
      }
      // Commit the attempt NOW: the sequence is public and seeded, so a
      // mid-run quit must spend the try, or retry-scumming beats the design.
      this.daily = commitDailyStart(this.daily, today, yesterdayKey())
      saveDaily(this.daily)
    }
    this.runMode = mode
    // Bind the run's daily identity at START: the record it settles into is
    // this day's, even if the run itself outlives the local midnight.
    this.runDay = dailyKey()
    this.chaseBest = this.stats.best[mode] || 0
    this.bestToastDone = this.chaseBest < 100
    const seed = mode === 'daily' ? dailySeed(this.runDay) : ((Math.random() * 1e9) | 0) || 1
    this.runSeed = seed
    this.hide()
    this.opts.onPlay(mode, seed)
  }

  /** The daily tap: gate first, then the same motion-ask flow as any run. */
  private startDaily(): void {
    if (this.daily.day === dailyKey()) {
      this.toast(`DAILY DONE — NEW SEED IN ${untilMidnight()}`)
      return
    }
    this.startFlow('daily')
  }

  /** The play tap: on touch devices that have not answered the motion question,
   *  explain first — a cold iOS permission dialog gets denied. */
  private startFlow(mode: ModeId): void {
    this.pendingMode = mode
    const needsAsk = this.touchDevice && !this.meta.askedMotion &&
      this.motion !== 'granted' && this.meta.moves === 'auto'
    if (needsAsk) { this.showAsk(); return }
    void this.opts.requestMotion()
    this.beginRun(mode)
  }

  private wireButtons(): void {
    this.layer.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
      const act = b.dataset.act!
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); buzz(8) })
      b.addEventListener('pointerup', (e) => { e.stopPropagation(); this.button(act) })
    })
  }

  private button(act: string): void {
    switch (act) {
      case 'sound':
        this.meta.muted = !this.meta.muted
        this.muted = this.meta.muted
        saveMeta(this.meta)
        this.opts.onMuted(this.meta.muted)
        this.showHome()
        this.toast(this.meta.muted ? 'SOUND OFF — COMMANDS STAY ON SCREEN' : 'SOUND ON')
        break
      case 'moves': {
        const nowTouch = !this.touchMovesActive()
        this.meta.moves = nowTouch ? 'touch' : 'motion'
        saveMeta(this.meta)
        this.showHome()
        if (nowTouch) {
          this.toast('TOUCH MOVES — SWIPES REPLACE SHAKE / TWIST / FLIP')
        } else {
          // Motion must actually be possible, or the motion commands would be
          // physically unanswerable. Verify, and fall back honestly.
          void this.opts.requestMotion().then((ok) => {
            if (ok) { this.toast('MOTION MOVES — THE PHONE IS THE CONTROLLER'); return }
            this.meta.moves = 'touch'
            saveMeta(this.meta)
            if (this.screen === 'home') this.showHome()
            this.toast(this.motion === 'unavailable'
              ? 'NO MOTION SENSOR HERE — TOUCH MOVES KEPT'
              : 'MOTION BLOCKED BY THE SYSTEM — TOUCH MOVES KEPT')
          })
        }
        break
      }
      case 'mode-classic': this.selectMode('classic'); break
      case 'mode-sudden': this.selectMode('sudden'); break
      case 'mode-zen': this.selectMode('zen'); break
      case 'daily':
        this.opts.onPrime()
        this.startDaily()
        break
      case 'stats': this.showStats(); break
      case 'share': {
        // The daily's spoiler-free grid — local clipboard only, nothing sent
        // anywhere. The bar shows how deep the run got, never which commands.
        const d = this.daily
        const text = dailyShareText({
          day: d.day || dailyKey(),
          score: d.score,
          correct: this.lastRun ? this.lastRun.correct : 0,
          streak: d.streak,
        })
        this.shareOut(text, 'RESULT COPIED — PASTE IT ANYWHERE')
        break
      }
      case 'challenge': {
        // Copy a beat-my-run link for the run on this screen. The seed
        // reproduces the exact sequence; the score travels as a claim.
        const run = this.lastRun
        if (!run || this.runSeed < 1) { this.toast('NOTHING TO CHALLENGE YET'); break }
        const ch: DuelChallenge = {
          seed: this.runSeed >>> 0, score: run.score,
          commands: run.issued, mode: duelModeFor(run.mode),
        }
        // Remember our side, so this seed's return volley lands as a settled
        // head-to-head instead of asking us to replay a spent sequence.
        const rec = this.duels.find((x) => x.seed === ch.seed)
        if (rec) {
          if (run.score >= rec.mine) {
            rec.mine = run.score; rec.obeyed = run.correct; rec.n = run.issued
          }
        } else {
          this.duels.push({
            seed: ch.seed, mine: run.score, theirs: 0, day: dailyKey(),
            obeyed: run.correct, n: run.issued,
          })
        }
        saveDuels(this.duels)
        const text = challengeShareText({
          score: run.score, correct: run.correct, url: duelUrl(this.pageBase(), ch),
        })
        this.shareOut(text, 'CHALLENGE COPIED — SEND IT TO SOMEONE')
        break
      }
      case 'rebuttal': {
        // The return volley: same seed, OUR score baked in.
        const ch = this.duelCh
        if (!ch) break
        const rec = this.duels.find((d) => d.seed === ch.seed)
        const mine = rec ? rec.mine : 0
        const url = duelUrl(this.pageBase(), {
          seed: ch.seed, score: mine, commands: rec ? rec.n : 1, mode: ch.mode,
        })
        const text = duelShareText({
          mine, theirs: ch.score, correct: rec ? rec.obeyed : 0, url,
        })
        this.shareOut(text, 'REBUTTAL COPIED — SEND IT BACK')
        break
      }
      case 'duel-accept': {
        if (!this.duelCh) { this.showHome(); break }
        this.opts.onPrime()
        this.pendingDuel = true
        this.startFlow(this.duelCh.mode)
        break
      }
      case 'help': this.showHelp(); break
      case 'back': this.showHome(); break
      case 'reset-tutorial':
        this.meta.taught = []
        saveMeta(this.meta)
        this.toast('TUTORIAL RESET — IT WILL TEACH AGAIN')
        break
      case 'menu':
        this.duelActive = false
        this.duelCh = null
        this.hide()
        this.opts.onHome()
        this.showHome()
        break
      case 'motion-yes': {
        this.opts.onPrime()
        this.meta.askedMotion = true
        saveMeta(this.meta)
        this.hide()
        // The permission call MUST start inside this gesture, but the run must
        // NOT start underneath the native dialog — begin when it settles.
        const req = this.opts.requestMotion()
        void req
          .then((ok) => { if (!ok) this.toast('MOTION BLOCKED — TOUCH MOVES ON') })
          .catch(() => undefined)
          .then(() => this.beginRun(this.pendingMode))
        break
      }
      case 'motion-no':
        this.opts.onPrime()
        this.meta.askedMotion = true
        this.meta.moves = 'touch'
        saveMeta(this.meta)
        this.beginRun(this.pendingMode)
        break
      default: break
    }
  }

  // -------------------------------------------------------------- utilities

  /** The first real screen is the launch handoff: splash fades into it. */
  private splashDone = false

  private show(screen: Screen, html: string): void {
    if (this.teach && screen !== 'teach') {
      if (this.teach.timer !== null) clearTimeout(this.teach.timer)
      this.teach = null
    }
    this.screen = screen
    this.layer.innerHTML = html
    this.layer.classList.toggle('jsh-snap', this.snap)
    this.layer.hidden = false
    if (!this.splashDone) { this.splashDone = true; dismissSplash(true) }
  }

  private hide(): void {
    this.screen = 'none'
    this.layer.hidden = true
    this.layer.innerHTML = ''
    if (this.countAnim !== null) { cancelAnimationFrame(this.countAnim); this.countAnim = null }
  }

  private toast(msg: string, ms = 2600): void {
    if (!this.enabled) return
    this.toastEl.textContent = msg
    this.toastEl.hidden = false
    // Long content (a rescued URL) wraps instead of running off the phone.
    this.toastEl.classList.toggle('jsh-toast-wrap', msg.length > 44)
    this.toastEl.style.animation = 'none'
    void this.toastEl.offsetWidth
    this.toastEl.style.animation = `jshToast ${(ms / 1000).toFixed(1)}s ease-out forwards`
    if (this.toastTimer !== null) clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => { this.toastEl.hidden = true }, ms + 50)
  }

  /** Game-over score counts up — the run is worth savouring for a beat. */
  private countUp(target: number): void {
    const el = this.layer.querySelector('.jsh-score') as HTMLElement | null
    if (!el) return
    const reduced = typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || target <= 0) { el.textContent = String(target); return }
    const t0 = performance.now()
    const dur = Math.min(900, 300 + target * 2)
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1 && this.screen === 'over') this.countAnim = requestAnimationFrame(step)
      else this.countAnim = null
    }
    this.countAnim = requestAnimationFrame(step)
  }

  /** Every rule below consumes theme.ts tokens (var(--j-*)) — the shell owns
   *  layout and staging, the theme owns every color/size/easing value. */
  private injectStyle(): void {
    const st = document.createElement('style')
    st.textContent = `
.jsh{position:absolute;inset:0;z-index:40;display:grid;place-items:center;
  font-family:var(--j-font);color:var(--j-ink);
  -webkit-user-select:none;user-select:none}
.jsh[hidden]{display:none}
.jsh-wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:var(--j-s4);text-align:center;
  padding:max(var(--j-s5),env(safe-area-inset-top)) 20px max(var(--j-s5),env(safe-area-inset-bottom))}
.jsh-ground{background:var(--j-ground)}
/* Overlay ground: a confident dim + real blur — cards sit on a quieted world,
   nothing ghosts through them (the round-6 translucency critique). */
.jsh-dim{background:var(--j-scrim);
  -webkit-backdrop-filter:blur(18px) saturate(1.05);backdrop-filter:blur(18px) saturate(1.05)}
.jsh-deep{background:var(--j-ground-deep)}

/* ---- the cover: crest + wordmark + one gold CTA -------------------------- */
.jsh-home{gap:var(--j-s4)}
.jsh-home::before{content:'';position:absolute;left:-10%;right:-10%;top:-6%;height:56%;
  background:radial-gradient(52% 58% at 50% 42%,rgba(255,205,90,.09),transparent 70%);
  pointer-events:none;animation:jshBreath 4.2s ease-in-out infinite}
.jsh-crest{position:relative;display:grid;place-items:center;
  min-height:clamp(64px,19vw,92px)}
.jsh-crestring{position:absolute;width:clamp(58px,17vw,84px);height:clamp(58px,17vw,84px);
  border-radius:50%;border:1.5px solid rgba(255,215,107,.32);pointer-events:none;
  animation:jshBeatRing 2.2s var(--j-swift) infinite}
.jsh-crestring2{animation-delay:1.1s}
.jsh-logo{font-size:var(--j-t-display);font-weight:800;letter-spacing:var(--j-tr-wide);
  text-indent:var(--j-tr-wide);line-height:1;
  background:linear-gradient(180deg,#fff 30%,var(--j-mark));
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 6px 30px rgba(120,150,255,.45))}
.jsh-tag{font-size:var(--j-t-caption);font-weight:700;letter-spacing:var(--j-tr-caps);
  text-indent:var(--j-tr-caps);color:var(--j-ink3);margin-top:calc(-1*var(--j-s2))}
.jsh-modes{display:flex;flex-direction:column;align-items:center;gap:var(--j-s3);
  margin-top:var(--j-s3)}
.jsh-bestline{font-weight:700;font-size:var(--j-t-caption);letter-spacing:var(--j-tr-wide);
  color:var(--j-ink3)}
.jsh-bestline b{color:var(--j-ink2);font-weight:800}
.jsh-util{margin-top:var(--j-s2)}
.jsh-util .jsh-btn{border-color:transparent;background:rgba(163,178,236,.07);color:var(--j-ink3)}

/* THE action. Gold means go: the same pill on home, over and paused. */
.jsh-cta{display:inline-flex;align-items:center;justify-content:center;
  min-width:min(50vw,220px);min-height:52px;padding:13px 34px;border-radius:var(--j-r-pill);
  background:linear-gradient(180deg,#ffe191,var(--j-gold) 52%,var(--j-gold-hot));
  color:var(--j-on-gold);font-weight:800;font-size:var(--j-t-cta);
  letter-spacing:var(--j-tr-caps);text-indent:var(--j-tr-caps);cursor:pointer;
  box-shadow:0 10px 38px rgba(255,195,60,.28),0 2px 8px rgba(0,0,0,.4),
    inset 0 1.5px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(122,70,0,.28);
  margin-top:var(--j-s2);transition:transform var(--j-fast) var(--j-swift)}
.jsh-cta:active{transform:scale(.96)}

.jsh-kick{font-weight:800;font-size:clamp(14px,3.4vw,20px);letter-spacing:.5em;
  text-indent:.5em;opacity:.9}
.jsh-cause{font-weight:700;font-size:var(--j-t-label);letter-spacing:.2em;text-indent:.2em;
  color:var(--j-ink3);margin-top:calc(-1*var(--j-s2))}
.jsh-chip{font-weight:700;font-size:var(--j-t-label);letter-spacing:var(--j-tr-norm);
  color:var(--j-ink);border:1.5px solid var(--j-edge);border-radius:var(--j-r-pill);
  padding:8px 16px;background:rgba(163,178,236,.06)}
.jsh-play{font-weight:800;font-size:clamp(20px,5.6vw,34px);letter-spacing:var(--j-tr-norm);
  text-shadow:0 4px 24px rgba(0,0,0,.55);margin-top:var(--j-s2)}
.jsh-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:var(--j-s2)}
.jsh-btn{appearance:none;border:1.5px solid var(--j-edge);border-radius:var(--j-r-pill);
  background:rgba(163,178,236,.07);color:var(--j-ink2);font-weight:700;
  letter-spacing:var(--j-tr-wide);font-size:var(--j-t-label);padding:13px 18px;
  font-family:inherit;cursor:pointer;touch-action:manipulation;
  transition:transform var(--j-fast) var(--j-swift),background var(--j-med) var(--j-swift)}
.jsh-btn:active{background:rgba(163,178,236,.18);transform:scale(.95)}
.jsh-btn:focus-visible,.jsh-seg:focus-visible,.jsh-daily:focus-visible{
  outline:2px solid var(--j-info-soft);outline-offset:2px}
.jsh-pri{background:linear-gradient(180deg,#ffe191,var(--j-gold) 52%,var(--j-gold-hot));
  color:var(--j-on-gold);border-color:transparent;font-weight:800;
  box-shadow:0 6px 26px rgba(255,195,60,.26),inset 0 1px 0 rgba(255,255,255,.5)}
.jsh-pri:active{transform:scale(.95)}

/* Cards: near-opaque surface, hairline edge, top light — one material. */
.jsh-card{display:flex;flex-direction:column;align-items:center;gap:var(--j-s4);
  max-width:min(88vw,420px);border:1px solid var(--j-edge);border-radius:var(--j-r-card);
  padding:var(--j-s6) var(--j-s5);background:var(--j-card);
  box-shadow:0 24px 80px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.07)}
.jsh-card.jsh-left{align-items:stretch;text-align:left}
.jsh-pill{font-weight:800;font-size:var(--j-t-micro);letter-spacing:var(--j-tr-caps);
  text-indent:var(--j-tr-caps);border:1.5px solid;border-radius:var(--j-r-pill);
  padding:6px 14px}
.jsh-pill-gold{color:var(--j-gold);border-color:rgba(255,215,107,.4);
  background:rgba(255,215,107,.06)}
.jsh-glyph{font-size:clamp(54px,16vw,96px);font-weight:800;line-height:1;
  filter:drop-shadow(0 0 22px currentColor)}
.jsh-h{font-weight:800;font-size:var(--j-t-title);letter-spacing:var(--j-tr-tight);
  text-shadow:0 4px 24px rgba(0,0,0,.55)}
.jsh-p{font-size:var(--j-t-body);line-height:1.55;color:var(--j-ink2)}
.jsh-p.jsh-small{font-size:var(--j-t-caption);letter-spacing:.02em;color:var(--j-ink3)}
.jsh-note{font-weight:800;font-size:clamp(14px,3.8vw,19px);letter-spacing:.18em;
  color:var(--j-gold)}
.jsh-note.jsh-note-cold{color:var(--j-info)}
.jsh-note.jsh-bad{color:var(--j-bad-soft)}
.jsh-keys{font-size:var(--j-t-micro);letter-spacing:.16em;line-height:1.9;color:var(--j-ink4)}
.jsh-bar{width:80%;height:8px;border-radius:var(--j-r-pill);background:rgba(163,178,236,.14);
  overflow:hidden}
.jsh-barfill{height:100%;width:0;border-radius:var(--j-r-pill);background:var(--j-info);
  animation:jshFill 1.6s linear forwards}

/* ---- the reveal: score counts, the stamp slams, then the actions --------- */
.jsh-scorewrap{position:relative}
.jsh-score{font-weight:800;font-size:var(--j-t-score);line-height:1;
  text-shadow:0 6px 40px rgba(255,255,255,.25);font-variant-numeric:tabular-nums}
.jsh-score.jsh-gold{color:var(--j-gold);text-shadow:0 0 44px rgba(255,205,90,.55)}
.jsh-stamp{position:absolute;top:-2px;right:-38px;transform:rotate(-9deg);
  font-weight:800;font-size:clamp(26px,8vw,44px);line-height:1;color:var(--j-gold);
  border:3px solid var(--j-gold);border-radius:14px;padding:4px 13px;
  background:rgba(255,215,107,.07);text-shadow:0 0 20px rgba(255,205,90,.7);
  box-shadow:0 0 30px rgba(255,205,90,.3),inset 0 0 16px rgba(255,205,90,.12);
  animation:jshStamp var(--j-slow) var(--j-spring) .9s backwards}
.jsh-stage .jsh-late{animation-delay:1.05s}
.jsh-best{font-weight:800;font-size:clamp(15px,4vw,22px);letter-spacing:var(--j-tr-caps);
  text-indent:var(--j-tr-caps);color:var(--j-gold);text-shadow:0 0 22px rgba(255,205,90,.6)}
.jsh-vs{display:flex;gap:18px;align-items:baseline;justify-content:center;font-weight:800;
  font-size:clamp(30px,9vw,52px);line-height:1}
.jsh-vs span{display:flex;flex-direction:column;align-items:center;gap:5px}
.jsh-vs b{color:var(--j-ink3);font-size:clamp(18px,5vw,28px)}
.jsh-vs i{font-style:normal;font-weight:700;font-size:var(--j-t-micro);
  letter-spacing:var(--j-tr-caps);color:var(--j-ink3)}
/* Duel over: the head-to-head IS the hero — your side counts up big and
   bright, their claim sits at the same scale but dimmer. */
.jsh-duelvs .jsh-score{font-style:normal;font-size:clamp(48px,15vw,92px);line-height:1}
.jsh-duelvs .jsh-their{font-style:normal;font-size:clamp(48px,15vw,92px);line-height:1;
  color:var(--j-ink3);text-shadow:none}
.jsh-judge{display:flex;align-items:center;gap:12px;color:var(--j-gold);font-weight:800;
  font-size:var(--j-t-label);letter-spacing:var(--j-tr-wide);
  border:1.5px solid rgba(255,215,107,.4);border-radius:var(--j-r-pill);padding:7px 20px;
  background:rgba(255,215,107,.07);box-shadow:0 0 22px rgba(255,205,90,.12)}
.jsh-judge b{font-size:clamp(21px,5.8vw,32px);line-height:1;
  text-shadow:0 0 18px rgba(255,205,90,.75)}
.jsh-goldcell{color:var(--j-gold);text-shadow:0 0 14px rgba(255,205,90,.3)}
.jsh-ringviz{width:clamp(96px,28vw,140px);height:clamp(96px,28vw,140px);
  filter:drop-shadow(0 0 16px rgba(255,205,90,.35))}
.jsh-stats{display:flex;gap:var(--j-s5);justify-content:center;font-weight:800;
  font-size:clamp(18px,5vw,28px);font-variant-numeric:tabular-nums}
.jsh-stats span{display:flex;flex-direction:column;gap:4px}
.jsh-stats i{font-style:normal;font-weight:700;font-size:var(--j-t-micro);
  letter-spacing:.22em;color:var(--j-ink3)}
.jsh-legend{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;align-items:baseline;
  font-size:clamp(12px,3.2vw,15px)}
.jsh-legend b{font-weight:800;letter-spacing:var(--j-tr-norm);color:var(--j-ink);
  text-align:right}
.jsh-legend span{color:var(--j-ink2)}
.jsh-segrow{display:flex;gap:var(--j-s2);justify-content:center;flex-wrap:wrap}
.jsh-seg{appearance:none;border:1.5px solid var(--j-edge);border-radius:var(--j-r-pill);
  background:rgba(163,178,236,.05);color:var(--j-ink2);font-weight:800;
  letter-spacing:var(--j-tr-wide);font-size:var(--j-t-label);padding:12px 18px;
  font-family:inherit;cursor:pointer;touch-action:manipulation;
  transition:transform var(--j-fast) var(--j-swift),background var(--j-med) var(--j-swift),
  color var(--j-med) var(--j-swift),box-shadow var(--j-med) var(--j-swift)}
.jsh-seg:active{background:rgba(163,178,236,.15);transform:scale(.95)}
.jsh-seg-on{background:#e6ebff;color:#0a0f1c;border-color:transparent;
  box-shadow:0 0 22px rgba(160,180,255,.4)}
.jsh-desc{font-weight:700;font-size:var(--j-t-caption);letter-spacing:.22em;
  text-indent:.22em;color:var(--j-ink3)}
.jsh-daily{appearance:none;border:1.5px solid rgba(255,215,107,.5);
  border-radius:var(--j-r-pill);background:rgba(255,215,107,.07);color:var(--j-gold);
  font-weight:800;letter-spacing:var(--j-tr-wide);font-size:var(--j-t-label);
  padding:13px 22px;font-family:inherit;cursor:pointer;touch-action:manipulation;
  box-shadow:0 0 22px rgba(255,205,90,.15);
  transition:transform var(--j-fast) var(--j-swift),background var(--j-med) var(--j-swift)}
.jsh-daily:active{background:rgba(255,215,107,.2);transform:scale(.96)}
.jsh-daily-done{border-color:var(--j-edge-soft);background:rgba(163,178,236,.05);
  color:var(--j-ink3);box-shadow:none}
.jsh-daychip{color:var(--j-gold);border-color:rgba(255,215,107,.45)}
.jsh-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--j-s4) 10px;text-align:center;
  font-weight:800;font-size:clamp(20px,5.4vw,30px);font-variant-numeric:tabular-nums}
.jsh-grid span{display:flex;flex-direction:column;gap:4px}
.jsh-grid i{font-style:normal;font-weight:700;font-size:var(--j-t-micro);
  letter-spacing:.18em;color:var(--j-ink3)}
.jsh-clock{position:absolute;left:50%;top:max(18px,env(safe-area-inset-top));
  transform:translateX(-50%);z-index:35;font-family:var(--j-font);
  font-weight:800;font-size:clamp(14px,3.4vw,20px);letter-spacing:var(--j-tr-wide);
  color:var(--j-info-soft);pointer-events:none;text-shadow:0 0 18px rgba(120,210,255,.5);
  font-variant-numeric:tabular-nums}
.jsh-clock[hidden]{display:none}
.jsh-hint{position:absolute;left:50%;bottom:22%;transform:translateX(-50%);z-index:35;
  font-family:var(--j-font);font-weight:800;font-size:clamp(13px,3.4vw,18px);
  letter-spacing:var(--j-tr-wide);color:#0a0f1c;background:var(--j-info-soft);
  border-radius:var(--j-r-pill);padding:9px 20px;pointer-events:none;white-space:nowrap;
  box-shadow:0 0 26px rgba(120,210,255,.5)}
.jsh-hint[hidden]{display:none}
.jsh-toast{position:absolute;left:50%;bottom:max(20px,env(safe-area-inset-bottom));
  transform:translateX(-50%);z-index:60;font-family:var(--j-font);
  font-weight:700;font-size:var(--j-t-label);letter-spacing:var(--j-tr-wide);
  color:var(--j-ink);background:rgba(14,18,32,.96);border:1px solid var(--j-edge);
  border-radius:var(--j-r-pill);padding:10px 20px;pointer-events:none;white-space:nowrap;
  box-shadow:0 10px 34px rgba(0,0,0,.5)}
.jsh-toast[hidden]{display:none}
.jsh-toast.jsh-toast-wrap{white-space:normal;word-break:break-all;
  max-width:min(86vw,420px);border-radius:18px;text-align:center;line-height:1.5}
.jsh-in{animation:jshIn .32s var(--j-swift)}
/* One entrance grammar for every screen: children rise in a quick cascade, so
   home, over, duel and stats all move like the same designed object. */
.jsh-in>*{animation:jshRise var(--j-slow) var(--j-swift) backwards}
.jsh-in>*:nth-child(2){animation-delay:.05s}
.jsh-in>*:nth-child(3){animation-delay:.1s}
.jsh-in>*:nth-child(4){animation-delay:.15s}
.jsh-in>*:nth-child(5){animation-delay:.2s}
.jsh-in>*:nth-child(6){animation-delay:.24s}
.jsh-in>*:nth-child(7){animation-delay:.28s}
.jsh-in>*:nth-child(8){animation-delay:.32s}
.jsh-in>*:nth-child(n+9){animation-delay:.36s}
/* Staged reveal (over screens): the cascade above lands the facts, then the
   actions arrive on the .jsh-late beat — after the count-up and the stamp.
   Purely visual staging: every control is live from the first frame. */
.jsh-pulse{animation:jshPulse 1.5s ease-in-out infinite}
.jsh-pop{animation:jshPop var(--j-slow) var(--j-spring)}
/* Cascade repair (round-7 critic, confirmed dead choreography): the .jsh-late
   beat must OUTRANK the nth-child cascade above (equal specificity loses on
   source order), and .jsh-pulse's shorthand must not erase the entrance — the
   pulse rides as a second animation that starts only after its element lands. */
.jsh-stage .jsh-in>.jsh-late,.jsh-stage .jsh-in .jsh-late{animation-delay:1.05s}
.jsh-in>.jsh-pulse{animation:jshRise var(--j-slow) var(--j-swift) backwards,jshPulse 1.5s ease-in-out .9s infinite}
.jsh-stage .jsh-in>.jsh-pulse.jsh-late,.jsh-stage .jsh-in .jsh-pulse.jsh-late{animation:jshRise var(--j-slow) var(--j-swift) 1.05s backwards,jshPulse 1.5s ease-in-out 2s infinite}
@keyframes jshIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes jshPulse{0%,100%{transform:scale(1);opacity:.92}50%{transform:scale(1.05);opacity:1}}
@keyframes jshPop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes jshShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-9px)}
  60%{transform:translateX(7px)}80%{transform:translateX(-4px)}}
@keyframes jshFill{from{width:0}to{width:100%}}
@keyframes jshToast{0%{opacity:0;transform:translateX(-50%) translateY(12px)}
  10%,80%{opacity:1;transform:translateX(-50%)}100%{opacity:0;transform:translateX(-50%)}}
@keyframes jshRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes jshStamp{from{opacity:0;transform:scale(2.5) rotate(5deg)}
  65%{opacity:1;transform:scale(.93) rotate(-11deg)}
  to{opacity:1;transform:scale(1) rotate(-9deg)}}
@keyframes jshBeatRing{from{opacity:0;transform:scale(.62)}
  18%{opacity:.55}to{opacity:0;transform:scale(1.28)}}
@keyframes jshBreath{0%,100%{opacity:.55}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .jsh-in,.jsh-pulse,.jsh-pop,.jsh-in>*,.jsh-stamp,.jsh-crestring,.jsh-home::before{
    animation:none}
  .jsh-crestring{opacity:0}
}
/* Posed screenshots (harness only): freeze every entrance at its settled
   value so a single frame shows the finished composition. */
.jsh-snap .jsh-in,.jsh-snap .jsh-in>*,.jsh-snap .jsh-pulse,.jsh-snap .jsh-pop,
.jsh-snap .jsh-stamp,.jsh-snap .jsh-home::before{animation:none!important}
.jsh-snap .jsh-crestring{animation:none!important;opacity:.35;transform:scale(1.04)}
.jsh-snap .jsh-crestring2{opacity:.14;transform:scale(1.16)}`
    document.head.append(st)
  }
}
