/** OWNER: meta agent. Everything around the core loop: high score, onboarding,
 *  accessibility, settings. Persisted with localStorage — guard every access, it
 *  throws in private mode. */
const KEY = 'jolt.best.v1'

export function bestScore(): number {
  try { return Number(localStorage.getItem(KEY) || 0) } catch { return 0 }
}
export function recordScore(score: number): boolean {
  try {
    if (score > bestScore()) { localStorage.setItem(KEY, String(score)); return true }
  } catch { /* private mode — the game still works, it just won't remember */ }
  return false
}
