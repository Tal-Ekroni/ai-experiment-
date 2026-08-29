/** OWNER: interaction agent. Save/restore, and the offline growth that makes
 *  "it grew while you were away" true rather than decorative. */
import { TreeState } from './types'
import { rebuild } from './growth'

const KEY = 'bonsai.save.v1'

interface Save { seed: number; age: number; pruned: number[]; light: TreeState['light']; savedAt: number }

export function save(t: TreeState, now: number): void {
  try {
    const s: Save = { seed: t.seed, age: t.age, pruned: t.pruned, light: t.light, savedAt: now }
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch { /* private mode / quota — the garden still works, it just won't persist */ }
}

/** Returns the seconds of growth that accrued while the app was closed. */
export function load(t: TreeState, now: number): number {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return 0
    const s = JSON.parse(raw) as Save
    t.seed = s.seed
    t.pruned = s.pruned ?? []
    t.light = s.light ?? t.light
    const away = Math.max(0, (now - s.savedAt) / 1000)
    // Real time runs slower than growth time, and is capped so a long absence
    // doesn't return a fully-grown tree with nothing left to shape.
    const offline = Math.min(away * 0.25, 600)
    t.age = (s.age ?? 0) + offline
    rebuild(t)
    return offline
  } catch { return 0 }
}
