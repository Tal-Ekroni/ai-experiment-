/** Deterministic fixed-timestep simulation. Rendering never mutates this. */
import { World, FIXED_DT, InputState } from './types'
import { makeRng, Rng } from './rng'
import { createBike, stepBike } from './bike'
import { TrackChunk, updateChunks } from './track'
import { updateObstacles, resolveCollisions, updateScore } from './obstacles'

export interface Sim { world: World; chunks: TrackChunk[]; rng: Rng }

export function createSim(seed = 1337): Sim {
  const world: World = {
    bike: createBike(),
    score: { distance: 0, multiplier: 1, points: 0, bestWheelie: 0 },
    obstacles: [],
    time: 0,
    seed,
  }
  return { world, chunks: [], rng: makeRng(seed) }
}

export function stepSim(sim: Sim, input: InputState, dt = FIXED_DT): void {
  const { world, rng } = sim
  stepBike(world.bike, input, dt)
  updateChunks(sim.chunks, rng, world.bike.z)
  updateObstacles(world, rng)
  resolveCollisions(world)
  updateScore(world, dt)
  world.time += dt
}

/** Advance N seconds of simulation with a scripted input. Used by the headless
 *  capture harness so every screenshot is reproducible from (seed, time, script). */
export function advance(sim: Sim, seconds: number, script: (t: number) => InputState): void {
  const steps = Math.round(seconds / FIXED_DT)
  for (let i = 0; i < steps; i++) stepSim(sim, script(sim.world.time), FIXED_DT)
}
