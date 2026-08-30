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
    <path d="M 12 62.4 A 40 40 0 0 1 50 10" fill="none" stroke="#ffd76b"
      stroke-width="9" stroke-linecap="round"/>
    <line x1="18.6" y1="60.2" x2="5.3" y2="64.6" stroke="#ffd76b" stroke-width="3"/>
    <circle cx="50" cy="10" r="6.5" fill="#fff"/>
  </svg>`

/** Matches render.ts's PERFECT_HUE (48) — the tutorial gold IS the game gold. */
const PERFECT_TEACH_HUE = 48

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
      ? `${MODES[m].label} BEST ${best} · TOP STREAK ×${this.stats.bestStreak}`
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
    this.show('home', `
      <div class="jsh-wrap jsh-ground jsh-in">
        <div class="jsh-logo">JOLT</div>
        <div class="jsh-tag">OBEY THE VOICE · BEAT THE RING</div>
        <div class="jsh-segrow">${seg}</div>
        <div class="jsh-desc">${DESC[m]}</div>
        <div class="jsh-chip">${chip}</div>
        <div class="jsh-play jsh-pulse">TAP TO PLAY</div>
        ${dailyBtn}
        ${keys}
        <div class="jsh-row">
          <button class="jsh-btn" data-act="sound">SOUND ${this.meta.muted ? 'OFF' : 'ON'}</button>
          <button class="jsh-btn" data-act="moves">MOVES: ${this.touchMovesActive() ? 'TOUCH' : 'MOTION'}</button>
          <button class="jsh-btn" data-act="stats">STATS</button>
          <button class="jsh-btn" data-act="help">HELP</button>
        </div>
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
          <div class="jsh-pill" style="color:#ffb86b;border-color:#ffb86b55">MOTION CHECK</div>
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
         <div class="jsh-note">HOLD STILL…</div>`
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

  /** The gold judgment strip: perfects, best chain, and — when the run earns
   *  one — a letter grade. Absent entirely for a perfect-less run, so the gold
   *  stays something you did, never furniture. */
  private judgeHtml(data: OverData): string {
    const perfects = data.perfects ?? 0
    const bestChain = data.bestChain ?? 0
    if (perfects <= 0) return ''
    const grade = gradeRun(perfects, data.correct ?? data.issued, bestChain)
    const chain = bestChain >= 2 ? ` · CHAIN ×${bestChain}` : ''
    return `<div class="jsh-judge">${grade ? `<b>${grade}</b>` : ''}<span>${perfects} PERFECT${
      perfects === 1 ? '' : 'S'}${chain}</span></div>`
  }

  private showOver(data: OverData, ctx: OverContext): void {
    const mode: ModeId = data.mode ?? 'classic'
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
    const titleColor = completed ? '#7defb0' : '#ff8b93'

    const statRow = `
        <div class="jsh-stats">
          <span>×${data.bestStreak}<i>TOP STREAK</i></span>
          <span>${data.correct ?? data.issued}<i>OBEYED</i></span>
          <span>${secs}s<i>${completed ? 'IN FLOW' : 'SURVIVED'}</i></span>
        </div>`
    const judge = this.judgeHtml(data)

    // The daily ends differently: the attempt is spent, the pull is tomorrow.
    if (mode === 'daily') {
      const streakLine = ctx.dailyStreak > 0
        ? `<div class="jsh-chip jsh-daychip">DAILY STREAK ${ctx.dailyStreak}${
            ctx.dailyStreak > 1 && ctx.dailyStreak === this.daily.bestStreak ? ' — YOUR LONGEST' : ''}</div>`
        : ''
      this.show('over', `
        <div class="jsh-wrap jsh-deep jsh-in">
          <div class="jsh-kick" style="color:${titleColor}">${title}</div>
          ${killer}
          <div class="jsh-score${ctx.newBest ? ' jsh-gold' : ''}">0</div>
          ${streakLine}
          ${bestLine}
          ${statRow}
          ${judge}
          <div class="jsh-desc">THAT WAS TODAY’S ONE TRY · NEW SEED IN ${untilMidnight()}</div>
          <div class="jsh-play jsh-pulse">SEE YOU TOMORROW — TAP FOR MENU</div>
          <div class="jsh-row">
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
      ? '<button class="jsh-daily" data-act="daily">◆ TODAY’S CHALLENGE WAITS</button>'
      : ''
    this.show('over', `
      <div class="jsh-wrap jsh-deep jsh-in">
        <div class="jsh-kick" style="color:${titleColor}">${title}</div>
        ${killer}
        <div class="jsh-score${ctx.newBest ? ' jsh-gold' : ''}">0</div>
        ${bestLine}
        ${statRow}
        ${judge}
        <div class="jsh-play jsh-pulse">TAP TO GO AGAIN</div>
        ${dailyNudge}
        <div class="jsh-row">
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
            <div class="jsh-pill" style="color:#c9a2ff;border-color:#c9a2ff55">DUEL SETTLED</div>
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
          <div class="jsh-pill" style="color:#c9a2ff;border-color:#c9a2ff55">◆ DUEL ◆</div>
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
    const titleColor = win ? '#7defb0' : tie ? '#ffd76b' : '#ff8b93'
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
      <div class="jsh-wrap jsh-deep jsh-in">
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
        ${this.judgeHtml(data)}
        <div class="jsh-play jsh-pulse">${win ? 'SEND IT BACK — TAP FOR MENU' : 'TAP FOR MENU'}</div>
        <div class="jsh-row">
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
        <div class="jsh-h">PAUSED</div>
        <div class="jsh-play jsh-pulse">TAP TO RESUME</div>
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

  /** Pose any screen with sample data — used only by the screenshot harness. */
  pose(name: string): void {
    this.enabled = true
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
        this.opts.onPrime()
        this.startFlow(this.meta.mode)
        break
      case 'over':
        if (now - this.overRevealAt < 350) return   // last-gasp flail guard
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
      const stop = (e: Event) => e.stopPropagation()
      b.addEventListener('pointerdown', stop)
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

  private show(screen: Screen, html: string): void {
    if (this.teach && screen !== 'teach') {
      if (this.teach.timer !== null) clearTimeout(this.teach.timer)
      this.teach = null
    }
    this.screen = screen
    this.layer.innerHTML = html
    this.layer.hidden = false
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

  private injectStyle(): void {
    const st = document.createElement('style')
    st.textContent = `
.jsh{position:absolute;inset:0;z-index:40;display:grid;place-items:center;
  font-family:ui-rounded,system-ui,-apple-system,sans-serif;color:#fff;
  -webkit-user-select:none;user-select:none}
.jsh[hidden]{display:none}
.jsh-wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:18px;text-align:center;
  padding:max(24px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom))}
.jsh-ground{background:radial-gradient(120% 90% at 50% 15%,hsl(228 45% 14%),#06070b)}
.jsh-dim{background:rgba(4,5,9,.86)}
.jsh-deep{background:radial-gradient(120% 90% at 50% 15%,#101322,#04050a)}
.jsh-logo{font-size:clamp(56px,17vw,120px);font-weight:800;letter-spacing:.14em;text-indent:.14em;
  line-height:1;background:linear-gradient(180deg,#fff 30%,#9fb4ff);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 6px 30px rgba(120,150,255,.45))}
.jsh-tag{font-size:clamp(11px,2.9vw,15px);font-weight:700;letter-spacing:.3em;text-indent:.3em;
  color:#aab8e8;opacity:.85}
.jsh-kick{font-weight:800;font-size:clamp(14px,3.4vw,20px);letter-spacing:.5em;text-indent:.5em;opacity:.85}
.jsh-cause{font-weight:700;font-size:clamp(12px,3.1vw,15px);letter-spacing:.2em;text-indent:.2em;
  color:#8b98c4;margin-top:-8px}
.jsh-chip{font-weight:700;font-size:clamp(12px,3vw,16px);letter-spacing:.14em;color:#dfe6ff;
  border:1.5px solid rgba(255,255,255,.18);border-radius:999px;padding:8px 18px;
  background:rgba(255,255,255,.05)}
.jsh-play{font-weight:800;font-size:clamp(22px,6.5vw,40px);letter-spacing:.08em;
  text-shadow:0 4px 24px rgba(0,0,0,.55);margin-top:8px}
.jsh-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:6px}
.jsh-btn{appearance:none;border:1.5px solid rgba(255,255,255,.28);border-radius:999px;
  background:rgba(255,255,255,.06);color:#dfe6ff;font-weight:700;letter-spacing:.12em;
  font-size:clamp(11px,2.8vw,14px);padding:13px 18px;font-family:inherit;cursor:pointer;
  touch-action:manipulation}
.jsh-btn:active{background:rgba(255,255,255,.16)}
.jsh-pri{background:#5ce88f;color:#062012;border-color:transparent;
  box-shadow:0 0 24px rgba(92,232,143,.35)}
.jsh-pri:active{background:#7df0a7}
.jsh-card{display:flex;flex-direction:column;align-items:center;gap:14px;max-width:min(88vw,420px);
  border:1.5px solid rgba(255,255,255,.16);border-radius:22px;padding:26px 24px;
  background:linear-gradient(180deg,rgba(20,24,40,.92),rgba(8,10,18,.94));
  box-shadow:0 18px 60px rgba(0,0,0,.5)}
.jsh-card.jsh-left{align-items:stretch;text-align:left}
.jsh-pill{font-weight:800;font-size:12px;letter-spacing:.34em;text-indent:.34em;
  border:1.5px solid;border-radius:999px;padding:6px 14px}
.jsh-glyph{font-size:clamp(54px,16vw,96px);font-weight:800;line-height:1}
.jsh-h{font-weight:800;font-size:clamp(24px,7vw,44px);letter-spacing:.02em;
  text-shadow:0 4px 24px rgba(0,0,0,.55)}
.jsh-p{font-size:clamp(14px,3.6vw,17px);line-height:1.5;color:#cfd8f5}
.jsh-p.jsh-small{font-size:clamp(12px,3vw,14px);color:#93a0c9}
.jsh-note{font-weight:800;font-size:clamp(14px,3.8vw,19px);letter-spacing:.18em;color:#5ce88f}
.jsh-note.jsh-bad{color:#ff8b93}
.jsh-keys{font-size:11px;letter-spacing:.16em;color:#7c89b4}
.jsh-bar{width:80%;height:8px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden}
.jsh-barfill{height:100%;width:0;border-radius:99px;background:#66ccff;
  animation:jshFill 1.6s linear forwards}
.jsh-score{font-weight:800;font-size:clamp(64px,20vw,130px);line-height:1;
  text-shadow:0 6px 40px rgba(255,255,255,.25)}
.jsh-score.jsh-gold{color:#ffd76b;text-shadow:0 0 44px rgba(255,205,90,.55)}
.jsh-best{font-weight:800;font-size:clamp(15px,4vw,22px);letter-spacing:.26em;text-indent:.26em;
  color:#ffd76b;text-shadow:0 0 22px rgba(255,205,90,.6)}
.jsh-vs{display:flex;gap:18px;align-items:baseline;justify-content:center;font-weight:800;
  font-size:clamp(30px,9vw,52px);line-height:1}
.jsh-vs span{display:flex;flex-direction:column;align-items:center;gap:5px}
.jsh-vs b{color:#7c89b4;font-size:clamp(18px,5vw,28px)}
.jsh-vs i{font-style:normal;font-weight:700;font-size:10px;letter-spacing:.24em;color:#8b98c4}
/* Duel over: the head-to-head IS the hero — your side counts up big and
   bright, their claim sits at the same scale but dimmer. */
.jsh-duelvs .jsh-score{font-style:normal;font-size:clamp(48px,15vw,92px);line-height:1}
.jsh-duelvs .jsh-their{font-style:normal;font-size:clamp(48px,15vw,92px);line-height:1;
  color:#9aa6cf;text-shadow:none}
.jsh-judge{display:flex;align-items:center;gap:12px;color:#ffd76b;font-weight:800;
  font-size:clamp(12px,3.1vw,15px);letter-spacing:.14em;
  border:1.5px solid rgba(255,215,107,.4);border-radius:999px;padding:7px 20px;
  background:rgba(255,215,107,.07);box-shadow:0 0 22px rgba(255,205,90,.12)}
.jsh-judge b{font-size:clamp(21px,5.8vw,32px);line-height:1;
  text-shadow:0 0 18px rgba(255,205,90,.75)}
.jsh-goldcell{color:#ffd76b;text-shadow:0 0 14px rgba(255,205,90,.3)}
.jsh-ringviz{width:clamp(96px,28vw,140px);height:clamp(96px,28vw,140px);
  filter:drop-shadow(0 0 16px rgba(255,205,90,.35))}
.jsh-stats{display:flex;gap:26px;justify-content:center;font-weight:800;
  font-size:clamp(18px,5vw,28px)}
.jsh-stats span{display:flex;flex-direction:column;gap:4px}
.jsh-stats i{font-style:normal;font-weight:700;font-size:10px;letter-spacing:.22em;color:#8b98c4}
.jsh-legend{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;align-items:baseline;
  font-size:clamp(12px,3.2vw,15px)}
.jsh-legend b{font-weight:800;letter-spacing:.08em;color:#fff;text-align:right}
.jsh-legend span{color:#aab8e8}
.jsh-segrow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.jsh-seg{appearance:none;border:1.5px solid rgba(255,255,255,.22);border-radius:999px;
  background:rgba(255,255,255,.05);color:#aab8e8;font-weight:800;letter-spacing:.14em;
  font-size:clamp(12px,3vw,15px);padding:12px 18px;font-family:inherit;cursor:pointer;
  touch-action:manipulation}
.jsh-seg:active{background:rgba(255,255,255,.14)}
.jsh-seg-on{background:#dfe6ff;color:#0a0f1c;border-color:transparent;
  box-shadow:0 0 22px rgba(160,180,255,.4)}
.jsh-desc{font-weight:700;font-size:clamp(11px,2.8vw,13px);letter-spacing:.22em;text-indent:.22em;
  color:#7c89b4}
.jsh-daily{appearance:none;border:1.5px solid rgba(255,215,107,.55);border-radius:999px;
  background:rgba(255,215,107,.08);color:#ffd76b;font-weight:800;letter-spacing:.12em;
  font-size:clamp(12px,3.1vw,15px);padding:13px 22px;font-family:inherit;cursor:pointer;
  touch-action:manipulation;box-shadow:0 0 22px rgba(255,205,90,.18)}
.jsh-daily:active{background:rgba(255,215,107,.2)}
.jsh-daily-done{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.04);
  color:#93a0c9;box-shadow:none}
.jsh-daychip{color:#ffd76b;border-color:rgba(255,215,107,.45)}
.jsh-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 10px;text-align:center;
  font-weight:800;font-size:clamp(20px,5.4vw,30px)}
.jsh-grid span{display:flex;flex-direction:column;gap:4px}
.jsh-grid i{font-style:normal;font-weight:700;font-size:10px;letter-spacing:.18em;color:#8b98c4}
.jsh-clock{position:absolute;left:50%;top:max(18px,env(safe-area-inset-top));
  transform:translateX(-50%);z-index:35;font-family:ui-rounded,system-ui,-apple-system,sans-serif;
  font-weight:800;font-size:clamp(14px,3.4vw,20px);letter-spacing:.12em;color:#9fe6ff;
  pointer-events:none;text-shadow:0 0 18px rgba(120,210,255,.5)}
.jsh-clock[hidden]{display:none}
.jsh-hint{position:absolute;left:50%;bottom:22%;transform:translateX(-50%);z-index:35;
  font-family:ui-rounded,system-ui,-apple-system,sans-serif;font-weight:800;
  font-size:clamp(13px,3.4vw,18px);letter-spacing:.14em;color:#0a0f1c;background:#9fe6ff;
  border-radius:999px;padding:9px 20px;pointer-events:none;white-space:nowrap;
  box-shadow:0 0 26px rgba(120,210,255,.5)}
.jsh-hint[hidden]{display:none}
.jsh-toast{position:absolute;left:50%;bottom:max(20px,env(safe-area-inset-bottom));
  transform:translateX(-50%);z-index:60;font-family:ui-rounded,system-ui,-apple-system,sans-serif;
  font-weight:700;font-size:clamp(11px,2.9vw,14px);letter-spacing:.12em;color:#dfe6ff;
  background:rgba(14,18,32,.94);border:1.5px solid rgba(255,255,255,.2);border-radius:999px;
  padding:10px 20px;pointer-events:none;white-space:nowrap}
.jsh-toast[hidden]{display:none}
.jsh-toast.jsh-toast-wrap{white-space:normal;word-break:break-all;
  max-width:min(86vw,420px);border-radius:18px;text-align:center;line-height:1.5}
.jsh-in{animation:jshIn .32s cubic-bezier(.2,1.1,.4,1)}
/* One entrance grammar for every screen: children rise in a quick cascade, so
   home, over, duel and stats all move like the same designed object. */
.jsh-in>*{animation:jshRise .5s cubic-bezier(.18,.9,.32,1) backwards}
.jsh-in>*:nth-child(2){animation-delay:.04s}
.jsh-in>*:nth-child(3){animation-delay:.08s}
.jsh-in>*:nth-child(4){animation-delay:.12s}
.jsh-in>*:nth-child(5){animation-delay:.16s}
.jsh-in>*:nth-child(6){animation-delay:.19s}
.jsh-in>*:nth-child(7){animation-delay:.22s}
.jsh-in>*:nth-child(8){animation-delay:.25s}
.jsh-in>*:nth-child(n+9){animation-delay:.28s}
.jsh-pulse{animation:jshPulse 1.5s ease-in-out infinite}
.jsh-pop{animation:jshPop .5s cubic-bezier(.2,1.6,.4,1)}
@keyframes jshIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes jshPulse{0%,100%{transform:scale(1);opacity:.92}50%{transform:scale(1.06);opacity:1}}
@keyframes jshPop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes jshShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-9px)}
  60%{transform:translateX(7px)}80%{transform:translateX(-4px)}}
@keyframes jshFill{from{width:0}to{width:100%}}
@keyframes jshToast{0%{opacity:0;transform:translateX(-50%) translateY(12px)}
  10%,80%{opacity:1;transform:translateX(-50%)}100%{opacity:0;transform:translateX(-50%)}}
@keyframes jshRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){
  .jsh-in,.jsh-pulse,.jsh-pop,.jsh-in>*{animation:none}
}`
    document.head.append(st)
  }
}
