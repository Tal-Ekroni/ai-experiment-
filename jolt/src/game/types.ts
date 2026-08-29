/** Shared contracts. Builder agents own one module each and must NOT change these
 *  signatures without updating every consumer. */

/** The physical actions the player can perform. Chosen so a phone can genuinely
 *  sense each one — twist and shake are real device motion, not tap substitutes. */
export type Action =
  | 'tap' | 'swipe-up' | 'swipe-down' | 'swipe-left' | 'swipe-right'
  | 'twist' | 'shake' | 'hold' | 'release' | 'pinch' | 'flip'
  | 'none'   // the correct response to an inhibition command

export interface Command {
  /** The action the player must perform. */
  action: Action
  /** Spoken and displayed text, e.g. "TWIST IT". */
  label: string
  /** Milliseconds the player has to respond, from the moment the command lands. */
  windowMs: number
  /** True for inhibition commands, where doing NOTHING is correct. */
  inhibit: boolean
}

export type Phase = 'idle' | 'awaiting' | 'resolved' | 'over'

export interface GameState {
  phase: Phase
  command: Command | null
  /** Milliseconds elapsed inside the current command window. */
  elapsed: number
  score: number
  streak: number
  bestStreak: number
  lives: number
  /** Total commands issued this run. Drives the difficulty ramp. */
  issued: number
  /** Wall-clock milliseconds of the whole run. */
  runtime: number
  lastResult: 'correct' | 'wrong' | 'timeout' | null
  seed: number
}

export interface RunReport {
  score: number
  issued: number
  bestStreak: number
  runtimeMs: number
  /** Why the run ended, and on which command index. */
  deathCause: 'wrong' | 'timeout' | 'alive'
  deathAtIssued: number
  /** Window length at the moment of death — the fairness signal. */
  deathWindowMs: number
}

export const START_LIVES = 3
