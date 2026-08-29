/** OWNER: track agent. Endless procedural city/temple corridor. */
import { Rng } from './rng'

export interface TrackChunk { z: number; length: number; variant: number }
export const CHUNK_LEN = 40

export function spawnChunk(rng: Rng, z: number): TrackChunk {
  return { z, length: CHUNK_LEN, variant: Math.floor(rng() * 4) }
}

export function updateChunks(chunks: TrackChunk[], rng: Rng, bikeZ: number): void {
  while (chunks.length === 0 || chunks[chunks.length - 1].z < bikeZ + 320) {
    const nextZ = chunks.length ? chunks[chunks.length - 1].z + CHUNK_LEN : 0
    chunks.push(spawnChunk(rng, nextZ))
  }
  while (chunks.length && chunks[0].z < bikeZ - 60) chunks.shift()
}
