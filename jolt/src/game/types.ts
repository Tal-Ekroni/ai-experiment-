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

// ---------------------------------------------------------------------------
// Musical clock contract
// ---------------------------------------------------------------------------
/** Tempo range of the game's musical clock. The Engine advances a beat phase
 *  at bpmForIntensity(intensity) and QUANTIZES command onsets to half-beat
 *  boundaries, so game events land on the musical grid (structural rhythm,
 *  not decoration). The audio layer's music bed must derive its tempo from
 *  the SAME function (or read GameState.bpm directly) so the bed and the
 *  engine's grid can never disagree. */
export const BPM_MIN = 96
export const BPM_MAX = 180

/** Beats per minute at a given intensity (0..1, clamped). Linear and strictly
 *  monotone: calm plays at BPM_MIN, full frenzy at BPM_MAX. Matches the
 *  audio bed's historical 96→180 sweep, now owned here as the shared truth. */
export function bpmForIntensity(i: number): number {
  const t = Math.min(1, Math.max(0, i))
  return BPM_MIN + (BPM_MAX - BPM_MIN) * t
}

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
  /** issued as the ramp sees it: mode head-start and cap applied. Kept in
   *  state so pure-state consumers (renderer) match the engine's energy. */
  rampIssued: number
  /** Wall-clock milliseconds of the whole run. */
  runtime: number
  lastResult: 'correct' | 'wrong' | 'timeout' | null
  seed: number
  /** Which mode this run is playing. */
  mode: ModeId
  /** Commands answered correctly this run (issued includes misses). */
  correct: number
  /** True when the last resolved command was answered inside the PERFECT band
   *  (the first PERFECT_FRAC of its window). Inhibition commands are never
   *  perfect — doing nothing has no timing to grade. */
  lastPerfect: boolean
  /** Live perfect-chain length. Builds on every perfect, passes THROUGH a
   *  correctly-held inhibition command (neutral), breaks on a slow answer or
   *  any miss. Pure state, so any renderer can draw it. */
  chain: number
  /** Longest perfect chain this run. */
  bestChain: number
  /** Total perfects this run. */
  perfects: number
  /** Cumulative score after each resolved command, in resolution order —
   *  trace[i] is the score once the (i+1)th command resolved. The ghost pacer
   *  races the stored trace of your best run against this live one. */
  trace: number[]
  /** Current tempo of the musical clock, bpmForIntensity(intensity). Rises
   *  with the ramp; constant between command issues. Audio and render lock
   *  their pulse to this so all three layers share one grid. */
  bpm: number
  /** Position inside the current beat, 0 (on the beat) to <1. Advanced by
   *  tick(dtMs) at the current bpm — a pure function of ticks, no wall clock,
   *  so seeded runs stay deterministic. */
  beatPhase: number
  /** Whole beats elapsed since the run started. With beatPhase this gives
   *  pure-state consumers the full musical position (bar 0 starts at issue
   *  of the first command). */
  beatIndex: number
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
  /** Commands answered inside the Perfect band this run. */
  perfects: number
  /** Longest perfect chain this run. */
  bestChain: number
}

export const START_LIVES = 3
