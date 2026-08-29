/** OWNER: obstacles+scoring agent. Placement must stay fair: always at least one
 *  clear lane, and never a lowbar the player cannot duck by dropping the wheelie. */
import { World, LANE_W } from './types'
import { Rng } from './rng'
import { laneOf } from './bike'

const SPAWN_AHEAD = 300
const MIN_GAP = 18

export function updateObstacles(w: World, rng: Rng): void {
  const last = w.obstacles.length ? w.obstacles[w.obstacles.length - 1].z : w.bike.z
  let z = last
  while (z < w.bike.z + SPAWN_AHEAD) {
    z += MIN_GAP + rng() * 22
    const roll = rng()
    const kind = roll < 0.42 ? 'barrier' : roll < 0.62 ? 'lowbar' : roll < 0.78 ? 'ramp' : 'coin'
    const lane = (Math.floor(rng() * 3) - 1) as -1 | 0 | 1
    w.obstacles.push({ kind, z, lane, dead: false })
  }
  while (w.obstacles.length && w.obstacles[0].z < w.bike.z - 20) w.obstacles.shift()
}

export function resolveCollisions(w: World): void {
  const b = w.bike
  const lane = laneOf(b.x)
  for (const o of w.obstacles) {
    if (o.dead || Math.abs(o.z - b.z) > 1.2 || o.lane !== lane) continue
    if (o.kind === 'coin') { o.dead = true; w.score.points += 25 * w.score.multiplier; continue }
    // A lowbar is cleared by being DOWN; a barrier is cleared by being UP (front
    // wheel over it). That inversion is the core risk/reward of the wheelie.
    const up = b.pitch > 0.18
    const survived = o.kind === 'lowbar' ? !up : o.kind === 'ramp' ? true : up
    if (!survived) b.crashed = true
    o.dead = true
  }
}

export function updateScore(w: World, dt: number): void {
  const b = w.bike
  if (b.crashed) return
  w.score.multiplier = 1 + Math.min(5, b.wheelieTime * 0.6)
  w.score.distance = b.z
  w.score.points += b.speed * dt * w.score.multiplier * 0.5
  w.score.bestWheelie = Math.max(w.score.bestWheelie, b.wheelieTime)
}
export { LANE_W }
