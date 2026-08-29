/** OWNER: circulation agent. Beat-my-run challenge links — the only viral loop
 *  a backendless game can have. A duel is two URL exchanges: the challenger's
 *  game-over copies `?duel=<seed>&s=<score>&n=<commands>[&m=<mode>]`, the
 *  receiver replays the engine on that exact seed (determinism is proven
 *  infrastructure — Engine(seed) replays identically), and the result screen
 *  offers the return volley with THEIR score baked in.
 *
 *  This module is pure and DOM-free so the encode/decode contract is unit-
 *  testable headlessly. Two hard rules live here:
 *  - Inbound params are HOSTILE. Anything malformed, absurd or merely
 *    unexpected decodes to null, and the caller falls back to the normal
 *    home screen. Never throw on user-supplied input.
 *  - The challenger's score is a CLAIM (score-in-URL is forgeable, like every
 *    honor-system share). It is displayed as a claim and never persisted as
 *    the local player's own record. Enforcement lives in shell.ts; the
 *    vocabulary ("claims") starts here.
 */
import type { ModeId } from './types'

/** A parsed, validated inbound challenge. */
export interface DuelChallenge {
  /** Engine seed — replaying it reproduces the identical command sequence. */
  seed: number
  /** The challenger's CLAIMED score. Display-only, never persisted as ours. */
  score: number
  /** How many commands the challenger survived (sets expectations on the card). */
  commands: number
  /** Rules the challenger played under. 'daily' encodes as classic — the
   *  configs are identical, so the replay is too. */
  mode: 'classic' | 'sudden' | 'zen'
}

/** Short mode codes for the URL. Compact, and an allowlist on the way in. */
const MODE_CODE: Record<'classic' | 'sudden' | 'zen', string> = {
  classic: 'c', sudden: 's', zen: 'z',
}
const CODE_MODE: Record<string, 'classic' | 'sudden' | 'zen'> = {
  c: 'classic', s: 'sudden', z: 'zen',
}

/** Bounds that make absurd claims fail fast. Generous on purpose: they exist
 *  to reject garbage, not to litigate honesty (that's unwinnable client-side). */
const MAX_SEED = 0xffffffff          // Engine seeds are uint32 (mulberry32)
const MAX_SCORE = 250_000            // far beyond any survivable run
const MAX_COMMANDS = 1_500           // bot cap is 400; leave huge headroom

/** Strictly-digits parse: no signs, no exponents, no whitespace, no floats.
 *  Number('1e9') and Number('0x10') are exactly the holes this closes. */
function uint(raw: string | null, max: number): number | null {
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n <= max ? n : null
}

/** The run mode a duel replays under. Daily runs are classic rules on a shared
 *  seed, so their challenge travels as classic — same config, same sequence. */
export function duelModeFor(mode: ModeId): 'classic' | 'sudden' | 'zen' {
  return mode === 'daily' ? 'classic' : mode
}

/** Serialise a challenge to a query string (no leading '?'). */
export function encodeDuel(c: DuelChallenge): string {
  const p = new URLSearchParams()
  p.set('duel', String(c.seed >>> 0))
  p.set('s', String(Math.max(0, Math.min(MAX_SCORE, Math.floor(c.score)))))
  p.set('n', String(Math.max(1, Math.min(MAX_COMMANDS, Math.floor(c.commands)))))
  if (c.mode !== 'classic') p.set('m', MODE_CODE[c.mode])
  return p.toString()
}

/** Parse an inbound challenge. Returns null for anything that is not a fully
 *  well-formed duel — the caller then shows the normal home screen. */
export function decodeDuel(qs: string | URLSearchParams): DuelChallenge | null {
  let p: URLSearchParams
  try { p = typeof qs === 'string' ? new URLSearchParams(qs) : qs } catch { return null }
  if (!p.has('duel')) return null
  const seed = uint(p.get('duel'), MAX_SEED)
  const score = uint(p.get('s'), MAX_SCORE)
  const commands = uint(p.get('n'), MAX_COMMANDS)
  if (seed === null || score === null || commands === null) return null
  if (seed < 1 || commands < 1) return null   // seed 0 is the idle attract state
  const mRaw = p.get('m')
  const mode = mRaw === null ? 'classic' : CODE_MODE[mRaw]
  if (!mode) return null
  return { seed, score, commands, mode }
}

/** Absolute URL for a challenge, built on the page's own address. */
export function duelUrl(base: string, c: DuelChallenge): string {
  return `${base}?${encodeDuel(c)}`
}

// ---------------------------------------------------------------------------
// Share artifacts — spoiler-free emoji grids in the spirit of Wordle's.
// The bar never reveals WHICH commands were issued, only how deep the run got,
// so a daily/duel share spoils nothing about the shared sequence.
// ---------------------------------------------------------------------------

/** Fixed ten-cell progress bar: each cell is ten commands obeyed. Fixed width
 *  is what makes two shares directly comparable at a glance (Wordle's trick).
 *  43 obeyed → 🟩🟩🟩🟩🟨⬛⬛⬛⬛⬛; a century run earns the full bar plus ⚡. */
export function runGlyphs(correct: number): string {
  const c = Math.max(0, Math.floor(correct))
  if (c >= 100) return '🟩'.repeat(10) + '⚡'
  const full = Math.floor(c / 10)
  const partial = c % 10 > 0 ? 1 : 0
  return '🟩'.repeat(full) + '🟨'.repeat(partial) + '⬛'.repeat(10 - full - partial)
}

/** The daily result as a compact, comparable, spoiler-free artifact. */
export function dailyShareText(
  o: { day: string; score: number; correct: number; streak: number },
): string {
  const lines = [
    `JOLT DAILY ${o.day}`,
    `${runGlyphs(o.correct)} ${Math.max(0, o.correct)} OBEYED`,
    `${o.score} PTS${o.streak > 1 ? ` · 🔥${o.streak}` : ''}`,
  ]
  return lines.join('\n')
}

/** A challenge share (from any game over): brag line, bar, the dare, the link. */
export function challengeShareText(
  o: { score: number; correct: number; url: string },
): string {
  return [
    `⚡ JOLT — ${o.score} PTS`,
    `${runGlyphs(o.correct)} ${Math.max(0, o.correct)} OBEYED`,
    'BEAT MY RUN — SAME COMMANDS, ONE TRY',
    o.url,
  ].join('\n')
}

/** The return volley after a duel: head-to-head plus the counter-challenge. */
export function duelShareText(
  o: { mine: number; theirs: number; correct: number; url: string },
): string {
  const verdict = o.mine > o.theirs ? `${o.mine}–${o.theirs} — MY POINT`
    : o.mine < o.theirs ? `${o.mine}–${o.theirs} — YOUR POINT`
    : `${o.mine}–${o.theirs} — DEAD HEAT`
  return [
    `⚔️ JOLT DUEL ${verdict}`,
    `${runGlyphs(o.correct)} ${Math.max(0, o.correct)} OBEYED`,
    'REMATCH — SAME COMMANDS, ONE TRY',
    o.url,
  ].join('\n')
}
