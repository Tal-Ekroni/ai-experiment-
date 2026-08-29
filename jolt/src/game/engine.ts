/** Deterministic game core. No DOM, no audio, no timers of its own — the caller
 *  drives it with tick(dtMs) and submit(action). That is what lets the bot
 *  playtester run thousands of runs headlessly and measure fairness. */
import { Action, GameState, RunReport, START_LIVES } from './types'
import { makeRng, Rng } from './rng'
import { nextCommand, intensity } from './commands'

/** Pause between a resolved command and the next one, so the player can breathe.
 *  Shrinks as intensity rises. */
const RESOLVE_MS = 420
const RESOLVE_FLOOR = 140

export class Engine {
  state: GameState
  private rng: Rng
  private resolveLeft = 0
  private deathWindowMs = 0

  constructor(seed = 1) {
    this.rng = makeRng(seed)
    this.state = {
      phase: 'idle', command: null, elapsed: 0, score: 0, streak: 0, bestStreak: 0,
      lives: START_LIVES, issued: 0, runtime: 0, lastResult: null, seed,
    }
  }

  start(): void {
    this.state.phase = 'awaiting'
    this.issue()
  }

  private issue(): void {
    const s = this.state
    s.command = nextCommand(this.rng, s.issued, s.command)
    s.elapsed = 0
    s.issued++
    s.phase = 'awaiting'
  }

  private resolveGap(): number {
    return RESOLVE_MS - (RESOLVE_MS - RESOLVE_FLOOR) * intensity(this.state.issued)
  }

  private succeed(): void {
    const s = this.state
    s.lastResult = 'correct'
    s.streak++
    s.bestStreak = Math.max(s.bestStreak, s.streak)
    // Reward speed: points scale with how much of the window was left.
    const left = s.command ? Math.max(0, 1 - s.elapsed / s.command.windowMs) : 0
    s.score += Math.round(10 + left * 20)
    s.phase = 'resolved'
    this.resolveLeft = this.resolveGap()
  }

  private fail(cause: 'wrong' | 'timeout'): void {
    const s = this.state
    s.lastResult = cause
    s.streak = 0
    s.lives--
    this.deathWindowMs = s.command ? s.command.windowMs : 0
    if (s.lives <= 0) { s.phase = 'over'; return }
    s.phase = 'resolved'
    this.resolveLeft = this.resolveGap() * 1.6   // a beat longer after a mistake
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
    return {
      score: s.score,
      issued: s.issued,
      bestStreak: s.bestStreak,
      runtimeMs: Math.round(s.runtime),
      deathCause: s.phase === 'over' ? (s.lastResult === 'wrong' ? 'wrong' : 'timeout') : 'alive',
      deathAtIssued: s.phase === 'over' ? s.issued : -1,
      deathWindowMs: Math.round(this.deathWindowMs),
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

export function simulateRun(seed: number, bot: BotProfile, maxCommands = 400): RunReport {
  const e = new Engine(seed)
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
