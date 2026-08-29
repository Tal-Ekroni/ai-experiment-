/** Content-layer unit tests — the circulation round's safety net.
 *
 *  Covers, headlessly against the REAL compiled modules (no browser):
 *    - dailyKey date derivation and dailySeed determinism
 *    - duel encode/decode round-trip and hostile-input rejection
 *    - seed determinism: the property every challenge link stands on
 *    - mode configs (lives / ramp / time limit)
 *    - the midnight-crossing daily fix (run bound to its START day)
 *    - the all-time-rank tie fix (a tying score is not the standing rank)
 *    - the spoiler-free emoji share artifacts
 *
 *  Run: npm test
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// Compile the content modules (and their imports) to CommonJS in a temp dir,
// exactly the way tools/compile-core.mjs does for the input cores.
function compileContent() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const out = mkdtempSync(join(tmpdir(), 'jolt-content-'))
  execFileSync('npx', ['tsc',
    'src/game/duel.ts', 'src/game/shell.ts', 'src/game/engine.ts',
    '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020',
    '--lib', 'es2020,dom', '--moduleResolution', 'node', '--skipLibCheck',
  ], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}\n')
  const req = createRequire(join(out, 'x.js'))
  return {
    duel: req(join(out, 'duel.js')),
    shell: req(join(out, 'shell.js')),
    engine: req(join(out, 'engine.js')),
    commands: req(join(out, 'commands.js')),
  }
}

const { duel, shell, engine, commands } = compileContent()
const { encodeDuel, decodeDuel, duelUrl, duelModeFor,
        runGlyphs, dailyShareText, challengeShareText, duelShareText } = duel
const { commitDailyStart, settleDailyScore, rankOf } = shell
const { Engine } = engine
const { MODES, dailyKey, dailySeed } = commands

/** Every printable command label — a share artifact must contain none of them. */
const COMMAND_LABELS = ['TAP IT', 'SWIPE LEFT', 'SWIPE RIGHT', 'SHAKE IT', 'TWIST IT',
  'FLICK UP', 'PULL DOWN', 'HOLD IT', 'PINCH IT', 'FLIP IT', 'DO NOTHING']

// ---------------------------------------------------------------------------
// dailyKey / dailySeed — date derivation and determinism
// ---------------------------------------------------------------------------

test('dailyKey derives the local calendar date, zero-padded', () => {
  assert.equal(dailyKey(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(dailyKey(new Date(2026, 11, 31)), '2026-12-31')
  assert.equal(dailyKey(new Date(2026, 7, 29)), '2026-08-29')
})

test('dailySeed is deterministic per key and differs across keys', () => {
  assert.equal(dailySeed('2026-08-29'), dailySeed('2026-08-29'))
  assert.notEqual(dailySeed('2026-08-29'), dailySeed('2026-08-30'))
  assert.notEqual(dailySeed('2026-08-29'), dailySeed('2026-08-28'))
})

test('dailySeed is a uint32 and defaults to today’s key', () => {
  const s = dailySeed('2026-08-29')
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff)
  assert.equal(dailySeed(), dailySeed(dailyKey()))
})

// ---------------------------------------------------------------------------
// Duel links — encode/decode round-trip
// ---------------------------------------------------------------------------

test('duel round-trips through its query string (classic default)', () => {
  const c = { seed: 123456789, score: 487, commands: 34, mode: 'classic' }
  const qs = encodeDuel(c)
  assert.deepEqual(decodeDuel(qs), c)
  assert.ok(!qs.includes('m='), 'classic travels without a mode param')
})

test('duel round-trips for sudden and zen, and through a full URL', () => {
  for (const mode of ['sudden', 'zen']) {
    const c = { seed: 42, score: 0, commands: 1, mode }
    assert.deepEqual(decodeDuel(encodeDuel(c)), c)
  }
  const c = { seed: 987654321, score: 1200, commands: 77, mode: 'sudden' }
  const url = new URL(duelUrl('https://example.test/jolt/', c))
  assert.deepEqual(decodeDuel(url.searchParams), c)
})

test('a daily run travels as a classic duel (identical rules, identical replay)', () => {
  assert.equal(duelModeFor('daily'), 'classic')
  assert.equal(duelModeFor('sudden'), 'sudden')
  assert.equal(duelModeFor('classic'), 'classic')
})

test('unrelated params are ignored, duel params still decode', () => {
  assert.deepEqual(
    decodeDuel('utm_source=chat&duel=7&s=30&n=2&x=1'),
    { seed: 7, score: 30, commands: 2, mode: 'classic' })
})

// ---------------------------------------------------------------------------
// Duel links — hostile input must decode to null, never throw
// ---------------------------------------------------------------------------

test('malformed duel params are rejected (graceful null, no throw)', () => {
  const bad = [
    '',                                  // no duel at all
    'duel=123',                          // missing s and n
    'duel=123&s=400',                    // missing n
    'duel=abc&s=1&n=1',                  // non-numeric seed
    'duel=12.5&s=1&n=1',                 // float seed
    'duel=1e9&s=1&n=1',                  // exponent smuggled past Number()
    'duel=0x10&s=1&n=1',                 // hex smuggled past Number()
    'duel=-5&s=1&n=1',                   // negative seed
    'duel=0&s=1&n=1',                    // seed 0 is the idle attract state
    'duel=99999999999&s=1&n=1',          // seed beyond uint32
    'duel=5&s=-1&n=1',                   // negative score
    'duel=5&s=999999999&n=1',            // absurd score claim
    'duel=5&s=1&n=0',                    // zero commands
    'duel=5&s=1&n=99999',                // absurd command count
    'duel=5&s=1&n=1&m=x',                // unknown mode code
    'duel=5&s=1&n=1&m=daily',            // mode codes are single letters
    'duel=%3Cscript%3E&s=1&n=1',         // markup where a number belongs
    'duel= 5&s=1&n=1',                   // whitespace-padded number
  ]
  for (const qs of bad) {
    assert.equal(decodeDuel(qs), null, `should reject: "${qs}"`)
  }
})

test('score 0 is a legal claim (a first-command death is still a duel)', () => {
  assert.deepEqual(decodeDuel('duel=5&s=0&n=1'),
    { seed: 5, score: 0, commands: 1, mode: 'classic' })
})

// ---------------------------------------------------------------------------
// Seed determinism — the property every challenge link stands on
// ---------------------------------------------------------------------------

/** Drive an engine perfectly for n commands and return the label sequence. */
function labelSequence(seed, mode, n = 40) {
  const e = new Engine(seed, mode)
  e.start()
  const labels = []
  let guard = 0
  while (e.state.issued <= n && e.state.phase !== 'over' && guard++ < 40000) {
    const s = e.state
    if (s.phase === 'awaiting' && s.command) {
      if (labels.length < s.issued) labels.push(s.command.label)
      if (!s.command.inhibit) e.submit(s.command.action)
    }
    e.tick(10)
  }
  return labels
}

test('the same seed replays the identical command sequence', () => {
  const a = labelSequence(123456789, MODES.classic)
  const b = labelSequence(123456789, MODES.classic)
  assert.ok(a.length >= 40, 'sequence long enough to be meaningful')
  assert.deepEqual(a, b)
})

test('different seeds diverge (links carry a real sequence identity)', () => {
  const a = labelSequence(123456789, MODES.classic)
  const b = labelSequence(987654321, MODES.classic)
  assert.notDeepEqual(a, b)
})

test('a daily seed replayed under classic rules is the identical sequence', () => {
  // This is what lets a daily result travel as an m=c duel link.
  const seed = dailySeed('2026-08-29')
  assert.deepEqual(labelSequence(seed, MODES.daily), labelSequence(seed, MODES.classic))
})

// ---------------------------------------------------------------------------
// Mode configs — the rules the duel card promises must be the rules
// ---------------------------------------------------------------------------

test('mode configs hold their contract (lives / ramp / time limit)', () => {
  assert.equal(MODES.classic.lives, 3)
  assert.equal(MODES.classic.lifeLoss, true)
  assert.equal(MODES.classic.rampOffset, 0)
  assert.equal(MODES.classic.timeLimitMs, 0)

  assert.equal(MODES.sudden.lives, 1)
  assert.equal(MODES.sudden.lifeLoss, true)
  assert.equal(MODES.sudden.rampOffset, 12)

  assert.equal(MODES.zen.lifeLoss, false)
  assert.equal(MODES.zen.timeLimitMs, 90_000)
  assert.ok(MODES.zen.rampCap > 0, 'zen ramp is capped')

  // The daily is classic rules on a shared seed — any drift here silently
  // breaks both the daily's fairness claim and daily->duel links.
  assert.equal(MODES.daily.lives, MODES.classic.lives)
  assert.equal(MODES.daily.lifeLoss, MODES.classic.lifeLoss)
  assert.equal(MODES.daily.rampOffset, MODES.classic.rampOffset)
  assert.equal(MODES.daily.rampCap, MODES.classic.rampCap)
  assert.equal(MODES.daily.timeLimitMs, MODES.classic.timeLimitMs)
})

// ---------------------------------------------------------------------------
// The midnight-crossing daily run — bound to its START day
// ---------------------------------------------------------------------------

test('a daily run that crosses midnight keeps its score', () => {
  // 23:59 on the 29th: the attempt is committed with the START day...
  const rec = commitDailyStart(
    { day: '2026-08-28', score: 300, streak: 3, bestStreak: 5, played: 9 },
    '2026-08-29', '2026-08-28')
  assert.equal(rec.day, '2026-08-29')
  assert.equal(rec.streak, 4, 'consecutive day extends the chain')
  assert.equal(rec.played, 10)
  // ...and at 00:01 on the 30th, the score settles against the RUN's day —
  // the wall clock no longer has a vote.
  const settled = settleDailyScore(rec, '2026-08-29', 640)
  assert.equal(settled.score, 640)
  assert.equal(settled.day, '2026-08-29')
})

test('a score never lands on a record that is not the run’s own day', () => {
  const rec = { day: '2026-08-30', score: 100, streak: 1, bestStreak: 5, played: 11 }
  // Regression guard for the OLD bug's shape: a stale runDay must not clobber
  // a newer day's record (and vice versa).
  assert.equal(settleDailyScore(rec, '2026-08-29', 640), rec)
})

test('settle keeps the higher score and never lowers one', () => {
  const rec = { day: '2026-08-29', score: 500, streak: 1, bestStreak: 1, played: 1 }
  assert.equal(settleDailyScore(rec, '2026-08-29', 400), rec)
  assert.equal(settleDailyScore(rec, '2026-08-29', 700).score, 700)
})

test('a missed day resets the streak chain to 1', () => {
  const rec = commitDailyStart(
    { day: '2026-08-27', score: 300, streak: 6, bestStreak: 6, played: 20 },
    '2026-08-29', '2026-08-28')
  assert.equal(rec.streak, 1)
  assert.equal(rec.bestStreak, 6, 'best streak survives the reset')
})

// ---------------------------------------------------------------------------
// All-time rank — a tie is not the standing score's rank
// ---------------------------------------------------------------------------

test('a tying score ranks below the standing score, never at it', () => {
  assert.equal(rankOf([500, 400], 500), 2, 'matching the best is your #2 run')
  assert.equal(rankOf([500, 500, 400], 500), 3)
  assert.equal(rankOf([500, 400], 400), 3)
})

test('rank edges: new best is #1, an empty history is #1', () => {
  assert.equal(rankOf([500, 400], 600), 1)
  assert.equal(rankOf([], 10), 1)
  assert.equal(rankOf([900, 800, 700], 100), 4)
})

// ---------------------------------------------------------------------------
// Emoji share artifacts — compact, comparable, spoiler-free
// ---------------------------------------------------------------------------

test('runGlyphs is a fixed ten-cell bar (each cell = ten obeyed)', () => {
  assert.equal(runGlyphs(0), '⬛'.repeat(10))
  assert.equal(runGlyphs(43), '🟩🟩🟩🟩🟨' + '⬛'.repeat(5))
  assert.equal(runGlyphs(40), '🟩🟩🟩🟩' + '⬛'.repeat(6))
  assert.equal(runGlyphs(99), '🟩'.repeat(9) + '🟨')
  assert.equal(runGlyphs(100), '🟩'.repeat(10) + '⚡')
  assert.equal(runGlyphs(250), '🟩'.repeat(10) + '⚡')
  assert.equal(runGlyphs(-5), '⬛'.repeat(10), 'garbage clamps, never throws')
})

test('daily share: ≤3 lines, no score spoilers of the sequence', () => {
  const text = dailyShareText({ day: '2026-08-29', score: 640, correct: 37, streak: 4 })
  const lines = text.split('\n')
  assert.ok(lines.length <= 3)
  assert.ok(text.includes('JOLT DAILY 2026-08-29'))
  assert.ok(text.includes('640 PTS'))
  assert.ok(text.includes('🔥4'))
  assert.ok(text.includes('37 OBEYED'))
  for (const label of COMMAND_LABELS) {
    assert.ok(!text.includes(label), `share leaks the sequence: ${label}`)
  }
})

test('daily share omits the streak flame below 2', () => {
  const text = dailyShareText({ day: '2026-08-29', score: 640, correct: 37, streak: 1 })
  assert.ok(!text.includes('🔥'))
})

test('challenge share: ≤6 lines, carries the link, spoils nothing', () => {
  const url = 'https://example.test/?duel=42&s=487&n=34'
  const text = challengeShareText({ score: 487, correct: 31, url })
  const lines = text.split('\n')
  assert.ok(lines.length <= 6)
  assert.equal(lines[lines.length - 1], url, 'the link is the last line')
  assert.ok(text.includes('487 PTS'))
  for (const label of COMMAND_LABELS) assert.ok(!text.includes(label))
})

test('duel rebuttal share: verdict matches the arithmetic', () => {
  const url = 'https://example.test/?duel=42&s=512&n=46'
  const win = duelShareText({ mine: 512, theirs: 487, correct: 43, url })
  assert.ok(win.includes('512–487 — MY POINT'))
  const loss = duelShareText({ mine: 300, theirs: 487, correct: 20, url })
  assert.ok(loss.includes('300–487 — YOUR POINT'))
  const tie = duelShareText({ mine: 487, theirs: 487, correct: 30, url })
  assert.ok(tie.includes('DEAD HEAT'))
  assert.ok(win.split('\n').length <= 6)
  assert.equal(win.split('\n').pop(), url)
})
