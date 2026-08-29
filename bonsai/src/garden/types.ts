/** Shared contracts. Builder agents own one module each and must NOT change these
 *  signatures without updating every consumer. */

export interface Vec3 { x: number; y: number; z: number }

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z)
export const scale = (a: Vec3, s: number): Vec3 => v(a.x * s, a.y * s, a.z * s)
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
export const norm = (a: Vec3): Vec3 => { const l = len(a) || 1; return scale(a, 1 / l) }

/** One woody segment of the tree. The skeleton is fully determined by
 *  (seed, prunedIds, light) — growth only controls how much of it is visible. */
export interface Segment {
  id: number
  parent: number          // -1 for the trunk base
  origin: Vec3
  dir: Vec3               // unit vector
  length: number
  radius: number
  depth: number           // 0 = trunk
  /** Tree age, in growth-seconds, at which this segment starts extending. */
  birthAge: number
  /** How long this segment takes to reach full length once born. */
  maturity: number
  /** True if this segment carries foliage at its tip. */
  leafy: boolean
}

export interface TreeState {
  segments: Segment[]
  age: number
  seed: number
  /** The light the tree grows toward. Placed by the player. */
  light: Vec3
  /** Segment ids the player has cut. Their whole subtree stops existing. */
  pruned: number[]
  /** Player-applied bend, keyed by segment id, in radians. */
  bends: Record<number, number>
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** One in-game year per this many growth-seconds. */
export const YEAR = 240

export function seasonAt(age: number): Season {
  const f = (age % YEAR) / YEAR
  return f < 0.25 ? 'spring' : f < 0.5 ? 'summer' : f < 0.75 ? 'autumn' : 'winter'
}
/** 0..1 position within the current season, for smooth blending. */
export function seasonPhase(age: number): number {
  return ((age % YEAR) / YEAR * 4) % 1
}
