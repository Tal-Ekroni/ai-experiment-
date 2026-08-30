/** Beat-layer unit tests: the engine's musical clock and structural rhythm.
 *
 *  What is proven here:
 *  - ONSET QUANTIZATION: every command the engine issues lands within one
 *    tick of a half-beat boundary of the musical clock, across mixed play
 *    (perfects, slow answers, wrong actions, timeouts, inhibits) and across
 *    different tick sizes.
 *  - FAIRNESS: command windows are byte-identical to the pre-beat engine
 *    (hashes captured from the raw-ms build), and every resolve gap is at
 *    least as long as that build's 420→140ms (×1.6 after a mistake) gap —
 *    the grid only ever DELAYS the next command, never advances it, and no
 *    response window moved by a byte.
 *  - TEMPO CONTRACT: bpmForIntensity is strictly monotone in intensity, the
 *    live GameState.bpm follows it exactly and never falls during a run.
 *  - DETERMINISM: the clock is a pure function of the tick stream — two
 *    engines fed identical ticks agree on every beat field at every step.
 *
 *  Run: node --test tests/beat.test.mjs   (compiles src/game via the
 *  project's tsc — the REAL engine, no browser)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { compileCore } from '../tools/compile-core.mjs'

const { engine, commands } = compileCore()
const { Engine, simulateRun } = engine
const { MODES, intensity } = commands

// The compiled types module (home of the bpmForIntensity contract) rides
// along with the core compile: engine.js required it, so it sits in the
// shared CommonJS module cache under the compile's temp dir.
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
const typesKey = Object.keys(req.cache).find((k) => /[/\\]types\.js$/.test(k) && k.includes('jolt-core-'))
assert.ok(typesKey, 'compiled types.js not found in the require cache')
const { bpmForIntensity, BPM_MIN, BPM_MAX } = req.cache[typesKey].exports

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const fnv = (str) => {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16)
}

/** Position of the musical clock in half-beats, read from pure state. */
const halfBeatPos = (s) => 2 * (s.beatIndex + s.beatPhase)

/** Distance from a half-beat position to its NEAREST boundary, in half-beats. */
const distToBoundary = (pos) => {
  const frac = pos - Math.floor(pos)
  return Math.min(frac, 1 - frac)
}

/** The pre-beat engine's raw-ms resolve gap (420→140ms, ×1.6 after a
 *  mistake) — the floor today's musical gap must never dip below. */
const oldRawGap = (rampIssued, wasMistake) => {
  const g = 420 - (420 - 140) * intensity(rampIssued)
  return wasMistake ? g * 1.6 : g
}

/** Timing-independent command sequence (action:windowMs) for a seed+mode,
 *  driven by an always-correct player — same probe tests/mastery.test.mjs
 *  uses. Windows depend only on issued index and the rng stream, so ANY
 *  change here is a fairness regression. */
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
  return { seq: out, runtime: e.state.runtime }
}

/** Drive a seeded run with DELIBERATELY mixed play — perfects, slow answers,
 *  one wrong action, one timeout (three lives allow only two mistakes),
 *  inhibits held — recording every issue onset and every resolve→issue gap.
 *  dt is the tick size in ms. Returns {onsets, gaps} where each onset
 *  carries the beat fields at the issue tick and each gap carries
 *  resolve-time context. */
function mixedDrive(seed, nCommands, dt) {
  const e = new Engine(seed)
  e.start()
  const onsets = [{ pos: halfBeatPos(e.state), bpm: e.state.bpm, dt }]
  const gaps = []
  let pending = null       // resolve-time context awaiting its issue
  let lastIssued = e.state.issued
  let k = 0
  let guard = 0
  while (e.state.issued < nCommands && e.state.phase !== 'over' && guard++ < 400000) {
    const s = e.state
    if (s.phase === 'awaiting' && s.command) {
      const cmd = s.command
      if (cmd.inhibit) {
        e.tick(dt)         // hold still; the lapse resolves it inside tick()
      } else if (k === 40) {
        e.tick(dt)         // let it time out (resolves inside tick())
      } else if (k === 10) {
        e.submit(cmd.action === 'tap' ? 'flip' : 'tap')   // deliberate wrong
      } else {
        // Mix of perfect (frac .1) and slow (frac .6) correct answers.
        const frac = k % 3 === 0 ? 0.6 : 0.1
        while (e.state.phase === 'awaiting' && e.state.elapsed < cmd.windowMs * frac) e.tick(dt)
        if (e.state.phase === 'awaiting') e.submit(cmd.action)
      }
      if (e.state.phase !== 'awaiting') k++
    } else {
      e.tick(dt)
    }
    const t = e.state
    // Detect the resolve moment (context for the gap that follows).
    if (t.phase === 'resolved' && pending === null) {
      pending = {
        runtime: t.runtime,
        pos: halfBeatPos(t),
        bpm: t.bpm,
        rampIssued: t.rampIssued,
        mistake: t.lastResult !== 'correct',
      }
    }
    // Detect a fresh issue.
    if (t.issued !== lastIssued && t.phase === 'awaiting') {
      lastIssued = t.issued
      onsets.push({ pos: halfBeatPos(t), bpm: t.bpm, dt })
      if (pending) {
        gaps.push({ ...pending, gapMs: t.runtime - pending.runtime })
        pending = null
      }
    }
  }
  return { onsets, gaps, state: e.state }
}

// ---------------------------------------------------------------------------
// ONSET QUANTIZATION: every issue lands within one tick of a half-beat line
// ---------------------------------------------------------------------------

for (const dt of [10, 7]) {
  test(`every command onset lands within one ${dt}ms tick of a half-beat boundary`, () => {
    let checked = 0
    for (const seed of [1, 2, 7, 42]) {
      const { onsets } = mixedDrive(seed, 90, dt)
      assert.ok(onsets.length > 60, `run too short to prove anything (${onsets.length})`)
      for (const o of onsets) {
        // One tick advances the clock by dt*bpm/60000 beats = dt*bpm/30000
        // half-beats; the onset may overshoot the boundary by at most that.
        const tickHb = dt * o.bpm / 30000
        const d = distToBoundary(o.pos)
        assert.ok(d <= tickHb + 1e-6,
          `onset ${checked} off-grid: ${d.toFixed(4)} half-beats from boundary (tick=${tickHb.toFixed(4)})`)
        checked++
      }
    }
    assert.ok(checked > 250, `expected a real sample, checked ${checked}`)
  })
}

test('the very first command of a run starts ON the grid (beat zero)', () => {
  const e = new Engine(5)
  e.start()
  assert.equal(e.state.beatIndex, 0)
  assert.equal(e.state.beatPhase, 0)
  assert.equal(e.state.phase, 'awaiting')
})

// ---------------------------------------------------------------------------
// GAP FAIRNESS: delay only — never shorter than the pre-beat raw-ms gap
// ---------------------------------------------------------------------------

test('every resolve gap >= the old raw-ms gap (420→140, ×1.6 on mistakes)', () => {
  let checked = 0
  for (const seed of [1, 3, 11]) {
    const { gaps } = mixedDrive(seed, 90, 10)
    for (const g of gaps) {
      const floor = oldRawGap(g.rampIssued, g.mistake)
      assert.ok(g.gapMs >= floor - 1e-6,
        `gap shrank: ${g.gapMs.toFixed(1)}ms < old ${floor.toFixed(1)}ms at rampIssued ${g.rampIssued}`)
      checked++
    }
  }
  assert.ok(checked > 150, `expected a real sample, checked ${checked}`)
})

test('gaps are the musical nominal quantized UP: within [hold, hold + one tick]', () => {
  const dt = 10
  const { gaps } = mixedDrive(2, 90, dt)
  assert.ok(gaps.length > 50)
  for (const g of gaps) {
    const hb = 30000 / g.bpm
    const i = intensity(g.rampIssued)
    const nominal = (2 - i) * hb * (g.mistake ? 1.6 : 1)
    // Exact hold the engine must have computed: ceil to the next boundary.
    const target = Math.ceil(g.pos + nominal / hb - 1e-9)
    const hold = (target - g.pos) * hb
    assert.ok(g.gapMs >= hold - 1e-6 && g.gapMs <= hold + dt + 1e-6,
      `gap ${g.gapMs.toFixed(2)}ms outside [${hold.toFixed(2)}, ${(hold + dt).toFixed(2)}]`)
    // And the quantization never adds more than one half-beat to the nominal.
    assert.ok(hold <= nominal + hb + 1e-6, 'quantization added more than one half-beat')
  }
})

// ---------------------------------------------------------------------------
// REGRESSION: response windows byte-identical to the pre-beat engine
// ---------------------------------------------------------------------------
// Hashes captured from the engine at the raw-ms-gap build (pre-change HEAD),
// same probe as tests/mastery.test.mjs. Quantization delays ONSET only, so
// the action:windowMs stream must not move by a byte.

test('REGRESSION: command windows byte-identical for fixed seeds, all modes', () => {
  const SEQ_HASH = {
    11: 'bf2f71b2', 23: 'dc1b83f', 55: '37a27795', 101: 'e782169b', 777: '7870af85',
  }
  for (const seed of Object.keys(SEQ_HASH)) {
    const { seq } = commandSeq(Number(seed), 130)
    assert.equal(fnv(seq.join('|')), SEQ_HASH[seed], `seed ${seed} sequence drifted`)
  }
  assert.equal(fnv(commandSeq(11, 80, MODES.sudden).seq.join('|')), '3fa4bd9f')
  const zen = commandSeq(11, 80, MODES.zen)
  assert.equal(fnv(zen.seq.join('|')), 'c943499a')
  // The musical gaps stretch runs in wall-clock: Zen's 81-command probe must
  // still finish well inside the mode's 90s limit or the hash above would be
  // cut short (a silent truncation, not a pass).
  assert.ok(zen.seq.length === 80, `zen probe truncated at ${zen.seq.length}`)
  assert.ok(zen.runtime < 80000, `zen probe took ${zen.runtime}ms — too close to the 90s clock`)
})

test('REGRESSION: bot fairness fields byte-identical (typical 400ms profile)', () => {
  const rows = []
  for (let i = 0; i < 40; i++) {
    const r = simulateRun(1 + i, { reactionMs: 400, jitterMs: 90, errorRate: 0.07 })
    rows.push([r.issued, r.deathCause, r.deathWindowMs, r.bestStreak, r.correct])
  }
  assert.equal(fnv(JSON.stringify(rows)), '426ecf8c', 'typical-bot fairness fields drifted')
})

// ---------------------------------------------------------------------------
// TEMPO CONTRACT: bpm monotone in intensity, live state follows it
// ---------------------------------------------------------------------------

test('bpmForIntensity is strictly monotone on [0,1] and clamped outside', () => {
  assert.equal(BPM_MIN, 96)
  assert.equal(BPM_MAX, 180)
  assert.equal(bpmForIntensity(0), BPM_MIN)
  assert.equal(bpmForIntensity(1), BPM_MAX)
  let prev = bpmForIntensity(0)
  for (let k = 1; k <= 1000; k++) {
    const v = bpmForIntensity(k / 1000)
    assert.ok(v > prev, `not strictly monotone at i=${k / 1000}: ${v} <= ${prev}`)
    prev = v
  }
  // Clamped: garbage intensity can never push tempo outside the band.
  assert.equal(bpmForIntensity(-3), BPM_MIN)
  assert.equal(bpmForIntensity(7), BPM_MAX)
})

test('the live engine tempo IS the contract: state.bpm = bpmForIntensity(intensity)', () => {
  // Initial tempo per mode reflects the mode's ramp head start...
  assert.equal(new Engine(1, MODES.classic).state.bpm, bpmForIntensity(intensity(0)))
  assert.equal(new Engine(1, MODES.sudden).state.bpm, bpmForIntensity(intensity(12)))
  // ...and tracks the ramp exactly across a whole run.
  const e = new Engine(8)
  e.start()
  let guard = 0
  while (e.state.issued < 100 && e.state.phase !== 'over' && guard++ < 200000) {
    const s = e.state
    assert.equal(s.bpm, bpmForIntensity(intensity(s.rampIssued)),
      `bpm decoupled from the contract at issued ${s.issued}`)
    if (s.phase === 'awaiting' && s.command && !s.command.inhibit) e.submit(s.command.action)
    e.tick(10)
  }
})

test('live bpm never falls during a run, rises with the ramp, ends <= 180', () => {
  const e = new Engine(4)
  e.start()
  let prev = e.state.bpm
  let rose = false
  let guard = 0
  while (e.state.issued < 120 && e.state.phase !== 'over' && guard++ < 200000) {
    const s = e.state
    if (s.phase === 'awaiting' && s.command && !s.command.inhibit) e.submit(s.command.action)
    e.tick(10)
    assert.ok(e.state.bpm >= prev - 1e-9, `bpm fell: ${prev} -> ${e.state.bpm}`)
    if (e.state.bpm > prev) rose = true
    prev = e.state.bpm
  }
  assert.ok(rose, 'bpm never rose across a 120-command run')
  assert.ok(prev > 150 && prev <= 180, `late-run tempo out of range: ${prev}`)
})

// ---------------------------------------------------------------------------
// DETERMINISM: the clock is a pure function of the tick stream
// ---------------------------------------------------------------------------

test('two engines fed identical ticks agree on every beat field, every step', () => {
  const drive = (e, pattern) => {
    const log = []
    e.start()
    let guard = 0
    while (e.state.issued < 60 && e.state.phase !== 'over' && guard++ < 100000) {
      const s = e.state
      if (s.phase === 'awaiting' && s.command && !s.command.inhibit &&
          s.elapsed >= s.command.windowMs * 0.2) e.submit(s.command.action)
      e.tick(pattern[guard % pattern.length])
      log.push(`${e.state.beatIndex}|${e.state.beatPhase.toFixed(12)}|${e.state.bpm.toFixed(9)}`)
    }
    return log.join('\n')
  }
  const pattern = [10, 7, 16, 10, 33]      // uneven, like real frame times
  const a = drive(new Engine(9), pattern)
  const b = drive(new Engine(9), pattern)
  assert.equal(a, b)
  assert.ok(a.length > 1000)
})

test('beat fields are exposed pure state: phase in [0,1), index integral', () => {
  const e = new Engine(6)
  e.start()
  let guard = 0
  let maxIndex = 0
  while (e.state.issued < 40 && e.state.phase !== 'over' && guard++ < 50000) {
    const s = e.state
    if (s.phase === 'awaiting' && s.command && !s.command.inhibit) e.submit(s.command.action)
    e.tick(10)
    assert.ok(e.state.beatPhase >= 0 && e.state.beatPhase < 1, `beatPhase ${e.state.beatPhase}`)
    assert.equal(e.state.beatIndex, Math.floor(e.state.beatIndex))
    assert.ok(e.state.beatIndex >= maxIndex, 'beatIndex went backwards')
    maxIndex = e.state.beatIndex
  }
  assert.ok(maxIndex > 20, `clock barely moved: ${maxIndex} beats`)
})
