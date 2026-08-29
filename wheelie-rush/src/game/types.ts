/** Shared contracts. Builder agents own one module each and must NOT change these
 *  signatures without updating every consumer. */

export interface InputState {
  /** -1 = shift weight forward (drop the nose), +1 = pull back (lift into wheelie) */
  lean: number
  /** -1 = left lane, +1 = right lane (analog; lane snap lives in bike.ts) */
  steer: number
  brake: boolean
}

export interface BikeState {
  /** Radians above horizontal. 0 = both wheels down. WIPEOUT_ANGLE = looped out. */
  pitch: number
  pitchVel: number
  /** World X. Lanes are at -LANE_W, 0, +LANE_W. */
  x: number
  /** Distance travelled along +Z, in metres. The score axis. */
  z: number
  speed: number
  /** Seconds the front wheel has been continuously airborne. Drives the multiplier. */
  wheelieTime: number
  crashed: boolean
}

export interface ScoreState {
  distance: number
  multiplier: number
  points: number
  bestWheelie: number
}

export type ObstacleKind = 'barrier' | 'ramp' | 'lowbar' | 'coin'

export interface Obstacle {
  kind: ObstacleKind
  z: number
  lane: -1 | 0 | 1
  /** Set once consumed/collided so render + scoring agree. */
  dead: boolean
}

export interface World {
  bike: BikeState
  score: ScoreState
  obstacles: Obstacle[]
  time: number
  seed: number
}

export const LANE_W = 2.2
export const WIPEOUT_ANGLE = 1.15
export const FIXED_DT = 1 / 120
