/** OWNER: growth agent.
 *  The tree's whole identity lives here. The skeleton is REGENERATED
 *  deterministically from (seed, pruned, light) — never mutated incrementally —
 *  so the same inputs always give the same tree, on this device or any other. */
import { Segment, TreeState, Vec3, v, add, norm, scale } from './types'
import { makeRng, Rng } from './rng'

const MAX_DEPTH = 7
const BASE_LEN = 0.62
const BASE_RADIUS = 0.085
const CHILD_LEN = 0.79      // each generation is this fraction of its parent
const CHILD_RADIUS = 0.68
const PHOTOTROPISM = 0.30   // pull toward the player's light
const GRAVITROPISM = 0.26   // intrinsic upward drive
const INERTIA = 0.62        // tendency to continue the parent's direction
const SPREAD = 0.62         // sideways scatter per generation
const GROW_TIME = 14        // growth-seconds for one segment to mature

/** Rodrigues rotation of `d` about unit axis `k` by `ang`. */
function rotate(d: Vec3, k: Vec3, ang: number): Vec3 {
  const c = Math.cos(ang), s = Math.sin(ang)
  const dot = k.x * d.x + k.y * d.y + k.z * d.z
  const cross = v(k.y * d.z - k.z * d.y, k.z * d.x - k.x * d.z, k.x * d.y - k.y * d.x)
  return norm(add(add(scale(d, c), scale(cross, s)), scale(k, dot * (1 - c))))
}

/** Build the full potential skeleton. Segments carry a birthAge, so rendering a
 *  younger tree is just a filter — no separate "growing" code path. */
export function buildTree(seed: number, pruned: number[], light: Vec3): Segment[] {
  const rng = makeRng(seed)
  const cut = new Set(pruned)
  const segments: Segment[] = []
  let nextId = 0
  const lightDir = norm(light)

  function grow(
    parent: number, origin: Vec3, dir: Vec3, length: number,
    radius: number, depth: number, birthAge: number,
  ): void {
    if (depth > MAX_DEPTH) return
    const id = nextId++
    if (cut.has(id)) return   // a cut segment takes its whole subtree with it

    const leafy = depth >= MAX_DEPTH - 2
    segments.push({ id, parent, origin, dir, length, radius, depth, birthAge, maturity: GROW_TIME, leafy })

    const tip = add(origin, scale(dir, length))
    // Fewer, straighter children near the trunk; bushier toward the tips.
    const nChildren = depth === 0 ? 1 : depth < 3 ? 2 : rng() < 0.35 ? 3 : 2

    for (let i = 0; i < nChildren; i++) {
      // Blend the three drives that decide where a branch actually points.
      let d = add(
        add(scale(dir, INERTIA), scale(v(0, 1, 0), GRAVITROPISM)),
        scale(lightDir, PHOTOTROPISM),
      )
      // Scatter children around the parent axis so the tree has volume.
      const axis = norm(v(rng() * 2 - 1, rng() * 0.4 - 0.2, rng() * 2 - 1))
      d = rotate(norm(d), axis, (rng() * 2 - 1) * SPREAD * (0.5 + depth * 0.12))

      grow(
        id, tip, d,
        length * CHILD_LEN * (0.85 + rng() * 0.3),
        radius * CHILD_RADIUS,
        depth + 1,
        birthAge + GROW_TIME * (0.55 + rng() * 0.5),
      )
    }
  }

  grow(-1, v(0, 0, 0), v(0, 1, 0), BASE_LEN, BASE_RADIUS, 0, 0)
  return segments
}

export function createTree(seed = 7, light: Vec3 = v(0.6, 1.4, 0.5)): TreeState {
  return { segments: buildTree(seed, [], light), age: 0, seed, light, pruned: [], bends: {} }
}

/** Rebuild after the player changes something the skeleton depends on. */
export function rebuild(t: TreeState): void {
  t.segments = buildTree(t.seed, t.pruned, t.light)
}

export function prune(t: TreeState, id: number): void {
  if (!t.pruned.includes(id)) { t.pruned.push(id); rebuild(t) }
}

export function setLight(t: TreeState, light: Vec3): void {
  t.light = light
  rebuild(t)
}

/** How far a segment has extended: 0 = not yet born, 1 = fully grown. */
export function extension(s: Segment, age: number): number {
  if (age <= s.birthAge) return 0
  return Math.min(1, (age - s.birthAge) / s.maturity)
}

export function visibleSegments(t: TreeState): Segment[] {
  return t.segments.filter((s) => t.age > s.birthAge)
}

export function advance(t: TreeState, seconds: number): void { t.age += seconds }

export type { Rng }
