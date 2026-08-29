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

/** Selectable ways to play. The configs live in commands.ts (MODES) so the
 *  ramp and the mode definitions evolve together. 'daily' is Classic rules on
 *  a date-derived seed — every player faces the identical sequence. */
export type ModeId = 'classic' | 'sudden' | 'zen' | 'daily'

/** Everything that distinguishes one way to play from another. The engine is
 *  parameterised by this object — no scattered per-mode ifs. */
export interface ModeConfig {
  id: ModeId
  /** Display name, e.g. "SUDDEN DEATH". */
  label: string
  /** Lives at run start. */
  lives: number
  /** Whether a miss costs a life. False = practice (Zen): the run never ends
   *  on a mistake, only the clock ends it. */
  lifeLoss: boolean
  /** Head start into the difficulty ramp, in commands — Sudden Death skips
   *  the learning shallows and starts hot. */
  rampOffset: number
  /** The ramp never advances past this effective command index (Zen's flow
   *  ceiling, so practice stays playable). 0 = uncapped. */
  rampCap: number
  /** Run ends when runtime reaches this many ms. 0 = only lives end it. */
  timeLimitMs: number
}

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
  /** Which mode this run is playing. */
  mode: ModeId
  /** Commands answered correctly this run (issued includes misses). */
  correct: number
}

export interface RunReport {
  score: number
  issued: number
  bestStreak: number
  runtimeMs: number
  mode: ModeId
  /** Commands answered correctly. */
  correct: number
  /** Why the run ended, and on which command index. 'alive' also covers a
   *  time-limited run (Zen) that ran its full clock — a completion, not a death. */
  deathCause: 'wrong' | 'timeout' | 'alive'
  deathAtIssued: number
  /** Window length at the moment of death — the fairness signal. */
  deathWindowMs: number
}

export const START_LIVES = 3
