/** Deterministic game core. No DOM, no audio, no timers of its own — the caller
 *  drives it with tick(dtMs) and submit(action). That is what lets the bot
 *  playtester run thousands of runs headlessly and measure fairness. */
import { Action, GameState, ModeConfig, RunReport, bpmForIntensity } from './types'
import { makeRng, Rng } from './rng'
import { MODES, nextCommand, intensity, PERFECT_FRAC } from './commands'

/** Pause between a resolved command and the next one, in HALF-BEATS of the
 *  musical clock: the session breathes in musical units — two half-beats at
 *  calm easing to one at frenzy — and the onset of every command is then
 *  quantized onto a half-beat boundary, so playing well inherently means
 *  playing in time. At every intensity the musical gap is LONGER than the
 *  historical raw-ms gap (420→140ms) it replaced: 625ms→167ms nominal before
 *  quantization adds up to one more half-beat. Response windows are untouched
 *  — the grid only ever delays the next command, never the deadline. */
const GAP_HALF_BEATS_CALM = 2
const GAP_HALF_BEATS_FRENZY = 1
/** After a mistake the pause stretches by this factor (same 1.6 the raw-ms
 *  engine used), then quantizes — a longer, still on-grid breath. */
const MISTAKE_GAP_MULT = 1.6

/** Bonus points for the Nth consecutive Perfect. Base points are UNTOUCHED —
 *  perfects are a visible extra stream on top, so historical scores stay
 *  comparable in kind and the bots can quantify exactly what the layer adds.
 *  Builds linearly and caps: chain 1 → +8, chain 15+ → +50 per command
 *  (vs a 10-30pt base), so a sustained chain roughly doubles the value of a
 *  command — Guitar-Hero-multiplier territory, without letting one lucky hit
 *  outweigh survival. */
export function perfectBonus(chain: number): number {
  return 5 + 3 * Math.min(Math.max(1, chain), 15)
}

/** Ghost-pacer replay: the recorded run's score after `resolved` commands had
 *  resolved (trace[i] = score once the (i+1)th command resolved). Past the end
 *  of the trace the ghost is dead and its score frozen — exactly like driving
 *  past the spot where the ghost car crashed. Pure, so the renderer and the
 *  node tests share one definition. */
export function ghostScoreAt(trace: number[], resolved: number): number {
  if (resolved <= 0 || trace.length === 0) return 0
  return trace[Math.min(resolved, trace.length) - 1]
}

export class Engine {
  state: GameState
  /** The mode this run plays under. Defaults to Classic, so every existing
   *  caller (and every harness) keeps its exact previous behaviour. */
  readonly mode: ModeConfig
  private rng: Rng
  private resolveLeft = 0
  private deathWindowMs = 0
  /** The run ended because the mode's clock ran out — a completion, not a death. */
  private timeUp = false
  /** Musical position in beats since the run began (float; beatIndex is its
   *  floor, beatPhase its fraction). Advanced only by tick(dtMs) — no Date,
   *  no AudioContext — so it is a pure function of the tick stream. */
  private beatPos = 0

  constructor(seed = 1, mode: ModeConfig = MODES.classic) {
    this.mode = mode
    this.rng = makeRng(seed)
    this.state = {
      phase: 'idle', command: null, elapsed: 0, score: 0, streak: 0, bestStreak: 0,
      lives: mode.lives, issued: 0, runtime: 0, lastResult: null, seed,
      mode: mode.id, correct: 0, rampIssued: mode.rampOffset,
      lastPerfect: false, chain: 0, bestChain: 0, perfects: 0, trace: [],
      bpm: 0, beatPhase: 0, beatIndex: 0,
    }
    this.state.bpm = this.tempo()
  }

  /** Current tempo from the shared contract — the one truth all layers read. */
  private tempo(): number {
    return bpmForIntensity(intensity(this.effectiveIssued()))
  }

  /** Duration of one half-beat at the current tempo, ms. */
  private halfBeatMs(): number {
    return 30000 / this.state.bpm
  }

  /** Command index the ramp actually sees: the run's issued count plus the
   *  mode's head start, held under the mode's cap. Classic: identical to
   *  state.issued. Drives windows, unlocks, pacing and intensity. */
  effectiveIssued(): number {
    const eff = this.state.issued + this.mode.rampOffset
    const v = this.mode.rampCap > 0 ? Math.min(eff, this.mode.rampCap) : eff
    this.state.rampIssued = v
    return v
  }

  start(): void {
    this.state.phase = 'awaiting'
    this.issue()
  }

  private issue(): void {
    const s = this.state
    s.command = nextCommand(this.rng, this.effectiveIssued(), s.command)
    s.elapsed = 0
    s.issued++
    s.phase = 'awaiting'
    // Tempo steps up with the ramp exactly when a command lands — never
    // mid-gap, so the half-beat arithmetic below is exact across a whole gap.
    s.bpm = this.tempo()
  }

  /** Nominal pause before the next command, ms: a half-beat count that eases
   *  from calm to frenzy, converted at the current tempo. */
  private resolveGap(): number {
    const i = intensity(this.effectiveIssued())
    const halfBeats = GAP_HALF_BEATS_CALM - (GAP_HALF_BEATS_CALM - GAP_HALF_BEATS_FRENZY) * i
    return halfBeats * this.halfBeatMs()
  }

  /** Quantize a nominal delay so the moment it elapses lands ON a half-beat
   *  boundary of the musical clock: ceil to the next boundary — DELAY ONLY,
   *  never advance — adding at most one half-beat. bpm is constant for the
   *  whole gap (it only changes in issue()), so this arithmetic is exact.
   *  Response windows are untouched; only the breather stretches. */
  private quantizeToHalfBeat(delayMs: number): number {
    const hb = this.halfBeatMs()
    const pos = this.beatPos * 2                       // position in half-beats
    const target = Math.ceil(pos + delayMs / hb - 1e-9)
    return (target - pos) * hb
  }

  private succeed(): void {
    const s = this.state
    s.lastResult = 'correct'
    s.correct++
    s.streak++
    s.bestStreak = Math.max(s.bestStreak, s.streak)
    // Reward speed: points scale with how much of the window was left.
    const left = s.command ? Math.max(0, 1 - s.elapsed / s.command.windowMs) : 0
    s.score += Math.round(10 + left * 20)
    // PERFECT layer: inside the first PERFECT_FRAC of the window (boundary
    // inclusive — landing exactly ON the band edge counts). Inhibition
    // commands are never graded: their "success" is the window lapsing, so a
    // held DO NOTHING passes the chain through untouched instead of breaking
    // it — an unbeatable-by-timing command must never cost a timing chain.
    const perfect = !!s.command && !s.command.inhibit &&
      s.elapsed <= s.command.windowMs * PERFECT_FRAC
    s.lastPerfect = perfect
    if (perfect) {
      s.chain++
      s.bestChain = Math.max(s.bestChain, s.chain)
      s.perfects++
      s.score += perfectBonus(s.chain)
    } else if (s.command && !s.command.inhibit) {
      s.chain = 0                       // a slow (merely correct) answer breaks it
    }
    s.trace.push(s.score)
    s.phase = 'resolved'
    this.resolveLeft = this.quantizeToHalfBeat(this.resolveGap())
  }

  private fail(cause: 'wrong' | 'timeout'): void {
    const s = this.state
    s.lastResult = cause
    s.streak = 0
    s.lastPerfect = false
    s.chain = 0                          // any miss breaks the perfect chain
    s.trace.push(s.score)                // the fatal command still lands in the trace
    if (this.mode.lifeLoss) s.lives--
    this.deathWindowMs = s.command ? s.command.windowMs : 0
    if (this.mode.lifeLoss && s.lives <= 0) { s.phase = 'over'; return }
    s.phase = 'resolved'
    // A longer breath after a mistake, still landing on the grid.
    this.resolveLeft = this.quantizeToHalfBeat(this.resolveGap() * MISTAKE_GAP_MULT)
  }

  /** Player performed an action. 'none' is never submitted — absence is inferred. */
  submit(action: Action): void {
    const s = this.state
    if (s.phase !== 'awaiting' || !s.command) return
    if (s.command.inhibit) { this.fail('wrong'); return }
    if (action === s.command.action) this.succeed()
    else this.fail('wrong')
  }

  tick(dtMs: number): void {
    const s = this.state
    if (s.phase === 'over' || s.phase === 'idle') return
    s.runtime += dtMs

    // Musical clock: advance the beat phase at the current tempo. Pure state —
    // audio and render read beatPhase/beatIndex/bpm to lock onto this grid.
    this.beatPos += dtMs * s.bpm / 60000
    s.beatIndex = Math.floor(this.beatPos)
    s.beatPhase = this.beatPos - s.beatIndex

    // Time-limited modes (Zen) end on the clock, mid-command or not. This is
    // a completion — no life is lost and report() calls it 'alive'.
    if (this.mode.timeLimitMs > 0 && s.runtime >= this.mode.timeLimitMs) {
      this.timeUp = true
      s.phase = 'over'
      return
    }

    if (s.phase === 'resolved') {
      this.resolveLeft -= dtMs
      if (this.resolveLeft <= 0) this.issue()
      return
    }

    s.elapsed += dtMs
    if (s.command && s.elapsed >= s.command.windowMs) {
      // Letting the window lapse is CORRECT for an inhibition command.
      if (s.command.inhibit) this.succeed()
      else this.fail('timeout')
    }
  }

  report(): RunReport {
    const s = this.state
    const died = s.phase === 'over' && !this.timeUp
    return {
      score: s.score,
      issued: s.issued,
      bestStreak: s.bestStreak,
      runtimeMs: Math.round(s.runtime),
      mode: this.mode.id,
      correct: s.correct,
      deathCause: died ? (s.lastResult === 'wrong' ? 'wrong' : 'timeout') : 'alive',
      deathAtIssued: died ? s.issued : -1,
      deathWindowMs: Math.round(this.deathWindowMs),
      perfects: s.perfects,
      bestChain: s.bestChain,
    }
  }
}

/** A deterministic simulated player, used by tools/playtest.mjs to measure whether
 *  the difficulty ramp is fair to a human with a given reaction time. */
export interface BotProfile {
  /** Milliseconds from command onset to the player's action. */
  reactionMs: number
  /** Random jitter added to reaction time, +/- this many ms. */
  jitterMs: number
  /** Probability of performing the WRONG action. */
  errorRate: number
}

export function simulateRun(
  seed: number, bot: BotProfile, maxCommands = 400, mode: ModeConfig = MODES.classic,
): RunReport {
  const e = new Engine(seed, mode)
  const rng = makeRng(seed ^ 0x9e3779b9)
  e.start()
  const STEP = 10
  let plannedAt = -1

  while (e.state.phase !== 'over' && e.state.issued <= maxCommands) {
    const s = e.state
    if (s.phase === 'awaiting' && s.command) {
      if (plannedAt < 0) {
        plannedAt = bot.reactionMs + (rng() * 2 - 1) * bot.jitterMs
      }
      // An inhibition command: a disciplined bot correctly does nothing, but the
      // faster its reflexes the more likely it is to twitch first.
      const twitches = s.command.inhibit && rng() < 0.35
      if (s.elapsed >= plannedAt && (!s.command.inhibit || twitches)) {
        const wrong = rng() < bot.errorRate
        e.submit(wrong ? 'tap' : s.command.action === 'none' ? 'tap' : s.command.action)
        plannedAt = -1
      }
    } else {
      plannedAt = -1
    }
    e.tick(STEP)
  }
  return e.report()
}
