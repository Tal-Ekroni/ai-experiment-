/** OWNER: difficulty agent.
 *  The command set and the difficulty ramp. This module decides whether the game
 *  is thrilling or unfair — the bot playtester exists to measure exactly that.
 *
 *  DESIGN (measured against tools/playtest.mjs, not opinion):
 *  - The pressure must be SPEED. The window descends through the human
 *    reaction-time range (600ms casual → 400ms typical → 250ms exceptional), so
 *    each player dies by TIMEOUT at the point where the ramp passes *their*
 *    reflexes — a Tetris-style wall that arrives later the better you are.
 *  - The descent is gentle early (learning), steep in the mid-game (tension),
 *    and flattens onto a floor of 264ms — just above an exceptional human's
 *    simple-reaction time, so even the final death window is one a great player
 *    could in principle have beaten. Nothing below human capability is issued.
 *  - TAP is the game's primary verb, as in the classic command toys: the basic
 *    action dominates the mix, and the exotic actions (shake, twist, flip)
 *    unlock one at a time as spice.
 *  - Actions that physically take longer get proportionally longer windows
 *    (a flip of the whole phone cannot be as fast as a tap).
 */
import { Action, Command } from './types'
import { Rng } from './rng'
import { gestureLatencyMs } from './input'

interface Spec {
  action: Action
  label: string
  inhibit?: boolean
  /** Command index at which this action joins the pool. */
  minIssued?: number
  /** Relative pick frequency once unlocked. */
  weight: number
  /** Physical-difficulty multiplier on the response window: a flip of the
   *  whole device genuinely takes longer than a thumb tap, so its window is
   *  proportionally wider. Keeps late-game motion commands beatable while the
   *  fast taps/swipes carry the speed pressure. */
  windowScale?: number
}

/** Commands unlock as the run progresses, so the player learns one at a time.
 *  Weights make TAP the bread-and-butter verb (~40% late game), like the
 *  primary action of the classic toys. */
const SPECS: Spec[] = [
  { action: 'tap', label: 'TAP IT', weight: 46 },
  { action: 'swipe-left', label: 'SWIPE LEFT', weight: 6, windowScale: 1.08 },
  { action: 'swipe-right', label: 'SWIPE RIGHT', weight: 6, windowScale: 1.08 },
  { action: 'shake', label: 'SHAKE IT', minIssued: 6, weight: 6, windowScale: 1.3 },
  { action: 'twist', label: 'TWIST IT', minIssued: 10, weight: 6, windowScale: 1.35 },
  { action: 'swipe-up', label: 'FLICK UP', minIssued: 14, weight: 6, windowScale: 1.08 },
  { action: 'swipe-down', label: 'PULL DOWN', minIssued: 18, weight: 5, windowScale: 1.08 },
  { action: 'hold', label: 'HOLD IT', minIssued: 22, weight: 5, windowScale: 1.15 },
  { action: 'pinch', label: 'PINCH IT', minIssued: 27, weight: 4, windowScale: 1.28 },
  { action: 'flip', label: 'FLIP IT', minIssued: 33, weight: 4, windowScale: 1.5 },
  // Inhibition: the correct response is to do nothing. A rare, snap-length
  // fake-out — go/no-go research puts impulse errors in the first ~250ms after
  // the stimulus, so the trap IS the immediate twitch; a long no-go window
  // would only punish fast reactors for having fast reflexes.
  { action: 'none', label: 'DO NOTHING', inhibit: true, minIssued: 16, weight: 2 },
]

const START_WINDOW = 1700
const FLOOR_WINDOW = 264      // just above an exceptional human's ~250ms reaction
/** The no-go window: long enough to catch a genuine twitch (impulse responses
 *  land inside ~250ms), short enough that patience always wins. */
const INHIBIT_WINDOW = 200

/** The ramp, as control points (commands issued → base window ms), linearly
 *  interpolated. Shaped so the window crosses each skill tier's reaction range
 *  in sequence: ~600ms around command 30 (casual wall), ~450ms around command
 *  55-65 (typical wall), and the 264ms floor around command 105 (exceptional
 *  wall). Gentle at the start, steepest through the mid-game, flattening onto
 *  the floor so the endgame is a sustained sprint rather than a cliff. */
const CURVE: Array<[number, number]> = [
  [0, START_WINDOW],
  [5, 1450],
  [12, 1050],
  [22, 700],
  [36, 580],
  [54, 522],
  [66, 402],
  [96, 330],
  [112, FLOOR_WINDOW],
]

/** Base response window for the Nth command (before per-action scaling). */
export function windowFor(issued: number): number {
  if (issued <= CURVE[0][0]) return CURVE[0][1]
  for (let i = 1; i < CURVE.length; i++) {
    const [x1, y1] = CURVE[i - 1]
    const [x2, y2] = CURVE[i]
    if (issued <= x2) {
      const t = (issued - x1) / (x2 - x1)
      return y1 + (y2 - y1) * t
    }
  }
  return FLOOR_WINDOW
}

export function available(issued: number): Spec[] {
  return SPECS.filter((s) => (s.minIssued ?? 0) <= issued)
}

/** Weighted pick from the unlocked pool. */
function pick(rng: Rng, pool: Spec[]): Spec {
  let total = 0
  for (const s of pool) total += s.weight
  let r = rng() * total
  for (const s of pool) {
    r -= s.weight
    if (r <= 0) return s
  }
  return pool[pool.length - 1]
}

export function nextCommand(rng: Rng, issued: number, previous: Command | null): Command {
  const pool = available(issued)
  let spec = pick(rng, pool)
  // Avoid immediate repeats of the exotic commands; they read as a bug rather
  // than a challenge. The primary verb is exempt — "TAP IT. TAP IT." back to
  // back is authentic to the genre and keeps the bread-and-butter share high.
  for (let tries = 0; tries < 3 && previous && pool.length > 1 && spec.action === previous.action && spec.action !== 'tap'; tries++) {
    spec = pick(rng, pool)
  }
  const base = windowFor(issued)
  // The ramp shrinks the DECISION window; the physical cost of performing the
  // gesture (measured per-core by the input tests) is a constant the ramp must
  // never eat, so it is budgeted as an additive term. Without it, HOLD IT and
  // FLIP IT become provably unwinnable late-game (see tools/playtest-latency.mjs).
  const windowMs = spec.inhibit
    ? INHIBIT_WINDOW
    : Math.round(base * (spec.windowScale ?? 1)) + gestureLatencyMs(spec.action)
  return {
    action: spec.action,
    label: spec.label,
    windowMs,
    inhibit: !!spec.inhibit,
  }
}

/** 0..1 escalation, for driving music tempo, visual energy and the pause
 *  between commands. Follows run progress rather than the raw window, so the
 *  early game keeps a relaxed cadence (time to learn) and the pace between
 *  commands only really tightens once the speed pressure is on. */
export function intensity(issued: number): number {
  const t = Math.min(1, Math.max(0, issued) / 116)
  return Math.pow(t, 1.35)
}

export { FLOOR_WINDOW, START_WINDOW, INHIBIT_WINDOW }
