/** Mastery-layer unit tests: the PERFECT band (boundary inclusive at exactly
 *  30% of the window), chain build/break rules, the ghost pacer's score-trace
 *  record/replay round-trip — and a regression proving the fairness surface
 *  (windows, lives, ramp, death behaviour) is byte-identical to the engine
 *  BEFORE the perfect layer landed (snapshots captured from that build).
 *
 *  Run: node --test tests/mastery.test.mjs   (compiles src/game via the
 *  project's tsc — the REAL engine, no browser)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { compileCore } from '../tools/compile-core.mjs'

const { engine, commands } = compileCore()
const { Engine, simulateRun, perfectBonus, ghostScoreAt } = engine
const { PERFECT_FRAC, MODES, INHIBIT_WINDOW, START_WINDOW, FLOOR_WINDOW } = commands

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Tick through a resolve gap (or idle) until a command is awaiting. */
function toAwait(e) {
  let guard = 0
  while (e.state.phase === 'resolved' && guard++ < 500) e.tick(10)
  assert.equal(e.state.phase, 'awaiting')
  assert.ok(e.state.command)
}

/** Answer the live command correctly after exactly frac of its window. */
function answerAt(e, frac) {
  const cmd = e.state.command
  assert.ok(cmd && !cmd.inhibit, 'expected a non-inhibit command')
  if (frac > 0) e.tick(cmd.windowMs * frac)
  e.submit(cmd.action)
}

const fnv = (str) => {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16)
}

/** Timing-independent command sequence (action:windowMs) for a seed+mode,
 *  driven by an always-correct player. Windows depend only on issued index and
 *  the rng stream, so ANY change here is a fairness regression. */
function commandSeq(seed, n, mode = MODES.classic) {
  const e = new Engine(seed, mode)
  e.start()
  const out = []
  let guard = 0
  while (e.state.issued <= n && e.state.phase !== 'over' && guard++ < 200000) {
    const s = e.state
    if (s.phase === 'awaiting' && s.command) {
      if (out.length < s.issued) out.push(`${s.command.action}:${s.command.windowMs}`)
      if (!s.command.inhibit) e.submit(s.command.action)
    }
    e.tick(10)
  }
  return out
}

// ---------------------------------------------------------------------------
// PERFECT band boundary
// ---------------------------------------------------------------------------

test('perfect band is 30% of the window, boundary INCLUSIVE at exactly 30%', () => {
  assert.equal(PERFECT_FRAC, 0.3)
  const e = new Engine(1)
  e.start()
  const w = e.state.command.windowMs
  assert.equal(`${e.state.command.action}:${w}`, 'tap:1760')  // known seed-1 opener
  e.tick(w * PERFECT_FRAC)                    // elapsed lands EXACTLY on the edge
  e.submit(e.state.command.action)
  assert.equal(e.state.lastResult, 'correct')
  assert.equal(e.state.lastPerfect, true)
  assert.equal(e.state.chain, 1)
  assert.equal(e.state.perfects, 1)
  // base points identical to the old economy, bonus strictly additive
  const base = Math.round(10 + (1 - PERFECT_FRAC) * 20)
  assert.equal(e.state.score, base + perfectBonus(1))
})

test('a hair past the 30% edge is NOT perfect — base points only', () => {
  const e = new Engine(1)
  e.start()
  const w = e.state.command.windowMs
  e.tick(w * PERFECT_FRAC + 0.5)
  e.submit(e.state.command.action)
  assert.equal(e.state.lastResult, 'correct')
  assert.equal(e.state.lastPerfect, false)
  assert.equal(e.state.chain, 0)
  assert.equal(e.state.perfects, 0)
  const left = Math.max(0, 1 - (w * PERFECT_FRAC + 0.5) / w)
  assert.equal(e.state.score, Math.round(10 + left * 20))
})

// ---------------------------------------------------------------------------
// chain build / break rules
// ---------------------------------------------------------------------------

test('chain builds on consecutive perfects and pays the growing bonus', () => {
  const e = new Engine(1)
  e.start()
  let expected = 0
  for (let k = 1; k <= 6; k++) {
    toAwait(e)
    const w = e.state.command.windowMs
    const dt = w * 0.1
    expected += Math.round(10 + Math.max(0, 1 - dt / w) * 20) + perfectBonus(k)
    answerAt(e, 0.1)
    assert.equal(e.state.lastPerfect, true)
    assert.equal(e.state.chain, k)
  }
  assert.equal(e.state.perfects, 6)
  assert.equal(e.state.bestChain, 6)
  assert.equal(e.state.score, expected)
})

test('perfectBonus builds linearly and caps at chain 15', () => {
  assert.equal(perfectBonus(1), 8)
  assert.equal(perfectBonus(2), 11)
  assert.equal(perfectBonus(15), 50)
  assert.equal(perfectBonus(40), 50)
})

test('a merely-correct (slow) answer breaks the chain, bestChain survives', () => {
  const e = new Engine(1)
  e.start()
  for (let k = 0; k < 3; k++) { toAwait(e); answerAt(e, 0.05) }
  assert.equal(e.state.chain, 3)
  toAwait(e)
  answerAt(e, 0.8)                            // correct, but far outside the band
  assert.equal(e.state.lastResult, 'correct')
  assert.equal(e.state.lastPerfect, false)
  assert.equal(e.state.chain, 0)
  assert.equal(e.state.bestChain, 3)
  assert.equal(e.state.perfects, 3)
})

test('a wrong action breaks the chain', () => {
  const e = new Engine(1)
  e.start()
  for (let k = 0; k < 3; k++) { toAwait(e); answerAt(e, 0.05) }
  toAwait(e)
  const notIt = e.state.command.action === 'tap' ? 'flip' : 'tap'
  e.submit(notIt)
  assert.equal(e.state.lastResult, 'wrong')
  assert.equal(e.state.chain, 0)
  assert.equal(e.state.lastPerfect, false)
  assert.equal(e.state.bestChain, 3)
})

test('a timeout breaks the chain', () => {
  const e = new Engine(1)
  e.start()
  for (let k = 0; k < 3; k++) { toAwait(e); answerAt(e, 0.05) }
  toAwait(e)
  const lives = e.state.lives
  e.tick(e.state.command.windowMs + 1)
  assert.equal(e.state.lastResult, 'timeout')
  assert.equal(e.state.chain, 0)
  assert.equal(e.state.lives, lives - 1)      // death rules untouched
  assert.equal(e.state.bestChain, 3)
})

test('inhibition success is never perfect and passes the chain THROUGH', () => {
  const e = new Engine(1)
  e.start()
  for (let k = 0; k < 4; k++) { toAwait(e); answerAt(e, 0.05) }
  assert.equal(e.state.chain, 4)
  const scoreBefore = e.state.score
  // Manufacture the inhibition command directly on the pure state machine.
  e.state.command = { action: 'none', label: 'DO NOTHING', windowMs: INHIBIT_WINDOW, inhibit: true }
  e.state.phase = 'awaiting'
  e.state.elapsed = 0
  e.tick(INHIBIT_WINDOW)                      // holding still: the lapse IS the success
  assert.equal(e.state.lastResult, 'correct')
  assert.equal(e.state.lastPerfect, false)    // nothing has no timing to grade
  assert.equal(e.state.chain, 4)              // chain neither built nor broken
  assert.equal(e.state.perfects, 4)
  assert.equal(e.state.score, scoreBefore + 10)  // inhibit pays base only, as before
})

test('twitching on an inhibition command breaks the chain (it is a miss)', () => {
  const e = new Engine(1)
  e.start()
  for (let k = 0; k < 4; k++) { toAwait(e); answerAt(e, 0.05) }
  e.state.command = { action: 'none', label: 'DO NOTHING', windowMs: INHIBIT_WINDOW, inhibit: true }
  e.state.phase = 'awaiting'
  e.state.elapsed = 0
  e.submit('tap')
  assert.equal(e.state.lastResult, 'wrong')
  assert.equal(e.state.chain, 0)
  assert.equal(e.state.bestChain, 4)
})

// ---------------------------------------------------------------------------
// ghost pacer: score trace record / replay
// ---------------------------------------------------------------------------

/** A scripted mixed run: perfects, slow answers, one deliberate timeout. */
function mixedRun(seed) {
  const e = new Engine(seed)
  e.start()
  const scoreAfter = []                        // externally observed, per resolution
  for (let k = 0; k < 12 && e.state.phase !== 'over'; k++) {
    toAwait(e)
    const cmd = e.state.command
    if (cmd.inhibit) { e.tick(cmd.windowMs + 1) }
    else if (k === 7) { e.tick(cmd.windowMs + 1) }          // deliberate timeout
    else answerAt(e, k % 3 === 0 ? 0.6 : 0.1)               // mix slow + perfect
    scoreAfter.push(e.state.score)
  }
  return { e, scoreAfter }
}

test('trace records one entry per resolved command, in resolution order', () => {
  const { e, scoreAfter } = mixedRun(3)
  assert.deepEqual(e.state.trace, scoreAfter)
  assert.equal(e.state.trace.length, e.state.issued)     // every issued cmd resolved
  assert.equal(e.state.trace[e.state.trace.length - 1], e.state.score)
  for (let i = 1; i < e.state.trace.length; i++) {
    assert.ok(e.state.trace[i] >= e.state.trace[i - 1], 'trace is non-decreasing')
  }
})

test('trace survives a JSON round-trip and replays deterministically', () => {
  const { e } = mixedRun(9)
  const stored = JSON.parse(JSON.stringify(e.state.trace))   // the localStorage trip
  assert.deepEqual(stored, e.state.trace)
  const { e: e2 } = mixedRun(9)                              // same seed, same driver
  assert.deepEqual(e2.state.trace, stored)
})

test('ghostScoreAt walks the trace and freezes at the crash site', () => {
  const { e, scoreAfter } = mixedRun(5)
  const trace = JSON.parse(JSON.stringify(e.state.trace))
  assert.equal(ghostScoreAt(trace, 0), 0)                    // before any resolution
  for (let i = 1; i <= trace.length; i++) {
    assert.equal(ghostScoreAt(trace, i), scoreAfter[i - 1])  // same index, same score
  }
  // A live run that outlasts the ghost sees the ghost's final (dead) score.
  assert.equal(ghostScoreAt(trace, trace.length + 50), e.state.score)
  assert.equal(ghostScoreAt([], 3), 0)                       // no ghost, no score
})

// ---------------------------------------------------------------------------
// REGRESSION: fairness surface byte-identical to the pre-perfect-layer engine
// ---------------------------------------------------------------------------
// Snapshots captured from the engine at commit b9a9cb5, BEFORE this change.

test('window constants are untouched', () => {
  assert.equal(START_WINDOW, 1700)
  assert.equal(FLOOR_WINDOW, 264)
  assert.equal(INHIBIT_WINDOW, 200)
})

test('REGRESSION: command windows byte-identical for fixed seeds, all modes', () => {
  const SEQ_HASH = {
    1: '7f1d76ed', 2: 'e0580cb0', 3: 'e4a2bb5d', 7: '52baac1c', 42: 'a0c251d9',
  }
  for (const seed of Object.keys(SEQ_HASH)) {
    const seq = commandSeq(Number(seed), 130)
    assert.equal(fnv(seq.join('|')), SEQ_HASH[seed], `seed ${seed} sequence drifted`)
  }
  // Human-readable spot checks so a failure is debuggable, not just a hash.
  const s1 = commandSeq(1, 130)
  assert.deepEqual(s1.slice(0, 8), ['tap:1760', 'tap:1710', 'tap:1660',
    'swipe-right:1784', 'tap:1560', 'tap:1510', 'swipe-left:1614', 'tap:1396'])
  assert.deepEqual(s1.slice(-2), ['shake:623', 'twist:606'])
  // Mode ramps (offset and cap) must not have moved either.
  assert.equal(fnv(commandSeq(1, 80, MODES.sudden).join('|')), 'b7e6b355')
  assert.equal(fnv(commandSeq(1, 80, MODES.zen).join('|')), 'bb7b016b')
})

test('REGRESSION: bot deaths/lives/ramp byte-identical across 40 seeds x 3 profiles', () => {
  const PROFILES = {
    exceptional: { bot: { reactionMs: 250, jitterMs: 60, errorRate: 0.03 }, hash: '73dee108' },
    typical: { bot: { reactionMs: 400, jitterMs: 90, errorRate: 0.07 }, hash: '426ecf8c' },
    casual: { bot: { reactionMs: 600, jitterMs: 130, errorRate: 0.12 }, hash: '9c7b2cfd' },
  }
  for (const [name, p] of Object.entries(PROFILES)) {
    const rows = []
    for (let i = 0; i < 40; i++) {
      const r = simulateRun(1 + i, p.bot)
      rows.push([r.issued, r.deathCause, r.deathWindowMs, r.bestStreak, r.correct])
    }
    assert.equal(fnv(JSON.stringify(rows)), p.hash, `${name} fairness fields drifted`)
  }
  // Spot literals from the pre-change build.
  const t1 = simulateRun(1, PROFILES.typical.bot)
  assert.deepEqual([t1.issued, t1.deathCause, t1.deathWindowMs, t1.bestStreak, t1.correct],
    [70, 'timeout', 455, 35, 67])
  const c5 = simulateRun(5, PROFILES.casual.bot)
  assert.deepEqual([c5.issued, c5.deathCause, c5.deathWindowMs, c5.bestStreak, c5.correct],
    [34, 'timeout', 666, 19, 31])
  const e40 = simulateRun(40, PROFILES.exceptional.bot)
  assert.deepEqual([e40.issued, e40.deathCause, e40.deathWindowMs, e40.bestStreak, e40.correct],
    [161, 'wrong', 395, 65, 158])
})

test('the layer discriminates skill: fast bots chain perfects, slow bots cannot', () => {
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
  const per = (bot) => {
    const out = []
    for (let i = 0; i < 20; i++) out.push(simulateRun(1 + i, bot).perfects)
    return mean(out)
  }
  const fast = per({ reactionMs: 250, jitterMs: 60, errorRate: 0.03 })
  const slow = per({ reactionMs: 600, jitterMs: 130, errorRate: 0.12 })
  assert.ok(fast > 10, `250ms bot should earn real perfect counts, got ${fast}`)
  assert.ok(slow < fast / 5, `600ms bot must earn far fewer perfects (${slow} vs ${fast})`)
})

test('report() carries the mastery numbers', () => {
  const r = simulateRun(1, { reactionMs: 250, jitterMs: 60, errorRate: 0.03 })
  assert.equal(typeof r.perfects, 'number')
  assert.equal(typeof r.bestChain, 'number')
  assert.ok(r.bestChain <= r.perfects)
  assert.ok(r.perfects > 0)
})
