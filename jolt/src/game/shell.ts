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
import { Action, Command } from './types'

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const BEST_KEY = 'jolt.best.v1'
const META_KEY = 'jolt.meta.v1'

export function bestScore(): number {
  try { return Number(localStorage.getItem(BEST_KEY) || 0) } catch { return 0 }
}
export function recordScore(score: number): boolean {
  try {
    if (score > bestScore()) { localStorage.setItem(BEST_KEY, String(score)); return true }
  } catch { /* private mode — the game still works, it just won't remember */ }
  return false
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
}

const DEFAULT_META: Meta = {
  bestStreak: 0, games: 0, taught: [], muted: false, moves: 'auto', askedMotion: false,
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
}

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
  /** Start (or restart) a run. Always called from a user gesture. */
  onPlay: () => void
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

type Screen = 'none' | 'home' | 'ask' | 'teach' | 'over' | 'paused' | 'help'

interface OverData {
  score: number; bestStreak: number; issued: number; runtimeMs: number
  /** The command that ended the run — a death the player can read is a death
   *  that feels earned. */
  deathLabel?: string | null
  deathCause?: 'wrong' | 'timeout' | null
  deathInhibit?: boolean
}

export class Shell {
  enabled: boolean

  private opts: ShellOptions
  private meta: Meta
  private screen: Screen = 'none'
  private layer = document.createElement('div')
  private hint = document.createElement('div')
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

  constructor(opts: ShellOptions) {
    this.opts = opts
    this.enabled = opts.enabled
    this.meta = loadMeta()
    this.touchDevice = typeof navigator !== 'undefined' &&
      (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0)

    this.injectStyle()
    this.layer.className = 'jsh'
    this.layer.hidden = true
    this.hint.className = 'jsh-hint'
    this.hint.hidden = true
    this.toastEl.className = 'jsh-toast'
    this.toastEl.hidden = true
    opts.root.append(this.layer, this.hint, this.toastEl)

    // Tap-anywhere handling for the current screen. Buttons stopPropagation.
    this.layer.addEventListener('pointerup', () => this.layerTap())

    // Keyboard parity: the home screen itself advertises SPACE as tap, so a
    // desktop player's first instinct must work. Space/Enter trigger the same
    // primary action as a tap on whichever shell screen is visible.
    addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.layer.hidden) return
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.layerTap() }
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
    const key = lessonKeyFor(cmd)
    if (!key || this.meta.taught.includes(key)) return false
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

  /** Cheap per-frame bookkeeping. Also fires the one mid-run chase moment:
   *  the instant the live score passes the personal best. */
  frame(phase: string, score = 0): void {
    if (!this.enabled) return
    this.lastPhase = phase
    if (!this.bestToastDone && score > this.chaseBest &&
        (phase === 'awaiting' || phase === 'resolved')) {
      this.bestToastDone = true
      this.toast('THAT’S A NEW BEST — KEEP GOING')
    }
    if (this.hintShown && phase !== 'awaiting') {
      this.hint.hidden = true
      this.hintShown = false
    }
  }

  /** The run ended. Record it, then reveal the game-over panel after the
   *  renderer's death beat has landed. */
  endRun(data: OverData): void {
    const newBest = recordScore(data.score)
    this.meta.games++
    if (data.bestStreak > this.meta.bestStreak) this.meta.bestStreak = data.bestStreak
    saveMeta(this.meta)
    if (!this.enabled) return
    if (this.overTimer !== null) clearTimeout(this.overTimer)
    this.overTimer = window.setTimeout(() => {
      this.overTimer = null
      this.showOver(data, newBest)
    }, 950)
  }

  // ---------------------------------------------------------------- screens

  showHome(): void {
    const best = bestScore()
    const chip = best > 0
      ? `BEST ${best} · TOP STREAK ×${this.meta.bestStreak}`
      : 'FIRST RUN — IT TEACHES AS YOU GO'
    const keys = !this.touchDevice
      ? '<div class="jsh-keys">SPACE TAP · ARROWS SWIPE · T TWIST · S SHAKE · F FLIP · H HOLD · P PINCH</div>'
      : ''
    this.show('home', `
      <div class="jsh-wrap jsh-ground jsh-in">
        <div class="jsh-logo">JOLT</div>
        <div class="jsh-tag">OBEY THE VOICE · BEAT THE RING · THREE LIVES</div>
        <div class="jsh-chip">${chip}</div>
        <div class="jsh-play jsh-pulse">TAP TO PLAY</div>
        ${keys}
        <div class="jsh-row">
          <button class="jsh-btn" data-act="sound">SOUND ${this.meta.muted ? 'OFF' : 'ON'}</button>
          <button class="jsh-btn" data-act="moves">MOVES: ${this.touchMovesActive() ? 'TOUCH' : 'MOTION'}</button>
          <button class="jsh-btn" data-act="help">HOW TO PLAY</button>
        </div>
      </div>`)
    this.wireButtons()
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
      : '<div class="jsh-note jsh-pulse">TRY IT NOW</div>'
    const accent = `hsl(${lesson.hue} 90% 62%)`
    this.show('teach', `
      <div class="jsh-wrap jsh-dim jsh-in">
        <div class="jsh-card" style="border-color:${accent}44">
          <div class="jsh-pill" style="color:${accent};border-color:${accent}55">${lesson.pill}</div>
          <div class="jsh-glyph" style="color:${accent}">${glyph}</div>
          <div class="jsh-h">${cmd.label}</div>
          <div class="jsh-p">${how}</div>
          ${keyHint}
          ${foot}
          <div class="jsh-keys">no lives lost while learning</div>
        </div>
      </div>`)
  }

  private showOver(data: OverData, newBest: boolean): void {
    const best = bestScore()
    const secs = Math.max(1, Math.round(data.runtimeMs / 1000))
    // The chase: a new best celebrates; anything else names the target.
    const gap = best - data.score
    const bestLine = newBest
      ? '<div class="jsh-best jsh-pop">NEW PERSONAL BEST</div>'
      : best <= 0 ? ''
      : gap <= 0 ? `<div class="jsh-chip">MATCHED YOUR BEST — ${best}</div>`
      : `<div class="jsh-chip">BEST ${best} · ${gap} SHY</div>`
    // Name the killer, so the death is legible and the retry has a target.
    const killer = data.deathLabel
      ? `<div class="jsh-cause">${
          data.deathInhibit ? 'YOU MOVED — ' + data.deathLabel
          : data.deathCause === 'timeout' ? 'TOO SLOW — ' + data.deathLabel
          : 'WRONG MOVE — ' + data.deathLabel}</div>`
      : ''
    this.show('over', `
      <div class="jsh-wrap jsh-deep jsh-in">
        <div class="jsh-kick" style="color:#ff8b93">RUN OVER</div>
        ${killer}
        <div class="jsh-score${newBest ? ' jsh-gold' : ''}">0</div>
        ${bestLine}
        <div class="jsh-stats">
          <span>×${data.bestStreak}<i>TOP STREAK</i></span>
          <span>${data.issued}<i>COMMANDS</i></span>
          <span>${secs}s<i>SURVIVED</i></span>
        </div>
        <div class="jsh-play jsh-pulse">TAP TO GO AGAIN</div>
        <div class="jsh-row">
          <button class="jsh-btn" data-act="menu">MENU</button>
        </div>
      </div>`)
    this.wireButtons()
    this.overRevealAt = performance.now()
    this.countUp(data.score)
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
            Three lives. It only gets faster.</div>
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
    else if (name === 'paused') this.showPaused()
    else if (name === 'over') {
      // Seed a plausible best so the chase chip poses truthfully.
      try { localStorage.setItem(BEST_KEY, '1240') } catch { /* pose only */ }
      this.showOver({
        score: 487, bestStreak: 12, issued: 34, runtimeMs: 58200,
        deathLabel: 'TWIST IT', deathCause: 'timeout', deathInhibit: false,
      }, false)
    } else if (name === 'over-best') {
      this.showOver({
        score: 1240, bestStreak: 21, issued: 61, runtimeMs: 84100,
        deathLabel: 'DO NOTHING', deathCause: 'wrong', deathInhibit: true,
      }, true)
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
        this.startFlow()
        break
      case 'over':
        if (now - this.overRevealAt < 350) return   // last-gasp flail guard
        this.opts.onPrime()
        this.beginRun()
        break
      case 'paused':
        this.hide()
        this.opts.onResume()
        break
      default: break   // ask / teach / help are driven by their own controls
    }
  }

  /** Every run start funnels through here so the chase target is armed. A tiny
   *  best is not worth a mid-run interruption. */
  private beginRun(): void {
    this.chaseBest = bestScore()
    this.bestToastDone = this.chaseBest < 100
    this.hide()
    this.opts.onPlay()
  }

  /** The play tap: on touch devices that have not answered the motion question,
   *  explain first — a cold iOS permission dialog gets denied. */
  private startFlow(): void {
    const needsAsk = this.touchDevice && !this.meta.askedMotion &&
      this.motion !== 'granted' && this.meta.moves === 'auto'
    if (needsAsk) { this.showAsk(); return }
    void this.opts.requestMotion()
    this.beginRun()
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
      case 'help': this.showHelp(); break
      case 'back': this.showHome(); break
      case 'reset-tutorial':
        this.meta.taught = []
        saveMeta(this.meta)
        this.toast('TUTORIAL RESET — IT WILL TEACH AGAIN')
        break
      case 'menu':
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
          .then(() => this.beginRun())
        break
      }
      case 'motion-no':
        this.opts.onPrime()
        this.meta.askedMotion = true
        this.meta.moves = 'touch'
        saveMeta(this.meta)
        this.beginRun()
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

  private toast(msg: string): void {
    if (!this.enabled) return
    this.toastEl.textContent = msg
    this.toastEl.hidden = false
    this.toastEl.style.animation = 'none'
    void this.toastEl.offsetWidth
    this.toastEl.style.animation = 'jshToast 2.6s ease-out forwards'
    if (this.toastTimer !== null) clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => { this.toastEl.hidden = true }, 2650)
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
.jsh-stats{display:flex;gap:26px;justify-content:center;font-weight:800;
  font-size:clamp(18px,5vw,28px)}
.jsh-stats span{display:flex;flex-direction:column;gap:4px}
.jsh-stats i{font-style:normal;font-weight:700;font-size:10px;letter-spacing:.22em;color:#8b98c4}
.jsh-legend{display:grid;grid-template-columns:auto 1fr;gap:7px 14px;align-items:baseline;
  font-size:clamp(12px,3.2vw,15px)}
.jsh-legend b{font-weight:800;letter-spacing:.08em;color:#fff;text-align:right}
.jsh-legend span{color:#aab8e8}
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
.jsh-in{animation:jshIn .32s cubic-bezier(.2,1.1,.4,1)}
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
@media (prefers-reduced-motion:reduce){
  .jsh-in,.jsh-pulse,.jsh-pop{animation:none}
}`
    document.head.append(st)
  }
}
