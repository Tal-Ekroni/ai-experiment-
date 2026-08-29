/** OWNER: difficulty agent.
 *  The command set and the difficulty ramp. This module decides whether the game
 *  is thrilling or unfair — the bot playtester exists to measure exactly that. */
import { Action, Command } from './types'
import { Rng } from './rng'

interface Spec { action: Action; label: string; inhibit?: boolean; minIssued?: number }

/** Commands unlock as the run progresses, so the player learns one at a time. */
const SPECS: Spec[] = [
  { action: 'tap', label: 'TAP IT' },
  { action: 'swipe-left', label: 'SWIPE LEFT' },
  { action: 'swipe-right', label: 'SWIPE RIGHT' },
  { action: 'shake', label: 'SHAKE IT', minIssued: 4 },
  { action: 'twist', label: 'TWIST IT', minIssued: 8 },
  { action: 'swipe-up', label: 'FLICK UP', minIssued: 12 },
  { action: 'hold', label: 'HOLD IT', minIssued: 16 },
  { action: 'pinch', label: 'PINCH IT', minIssued: 22 },
  { action: 'flip', label: 'FLIP IT', minIssued: 28 },
  // Inhibition: the correct response is to do nothing. Makes the game about
  // impulse control rather than pure speed.
  { action: 'none', label: 'DO NOTHING', inhibit: true, minIssued: 18 },
]

const START_WINDOW = 2200
const FLOOR_WINDOW = 520      // below roughly this, no human can react reliably
const RAMP = 0.965            // multiplicative shrink per command issued

export function windowFor(issued: number): number {
  return Math.max(FLOOR_WINDOW, START_WINDOW * Math.pow(RAMP, issued))
}

export function available(issued: number): Spec[] {
  return SPECS.filter((s) => (s.minIssued ?? 0) <= issued)
}

export function nextCommand(rng: Rng, issued: number, previous: Command | null): Command {
  const pool = available(issued)
  let spec = pool[Math.floor(rng() * pool.length)]
  // Avoid immediate repeats; they read as a bug rather than a challenge.
  if (previous && pool.length > 1 && spec.action === previous.action) {
    spec = pool[(pool.indexOf(spec) + 1) % pool.length]
  }
  return {
    action: spec.action,
    label: spec.label,
    windowMs: windowFor(issued),
    inhibit: !!spec.inhibit,
  }
}

/** 0..1 intensity, for driving music tempo and visual energy. */
export function intensity(issued: number): number {
  const w = windowFor(issued)
  return 1 - (w - FLOOR_WINDOW) / (START_WINDOW - FLOOR_WINDOW)
}

export { FLOOR_WINDOW, START_WINDOW }
