/** Headless unit tests for the recogniser cores (PointerCore, ShakeCore,
 *  TwistCore, FlipCore) — the tests the file header always promised. Two
 *  layers:
 *
 *  1. Deterministic examples and regressions:
 *    - one-shot hold poll losing a drift-and-settle hold (now continuous)
 *    - hold released after holdMs emitting nothing (now credited on release)
 *    - exactly diagonal long swipes resolving to horizontal (now silent)
 *    - split-contact fat thumb emitting 'pinch' from px-level jitter (now
 *      folded into the primary touch; the intended tap/hold still fires)
 *    - a sloppy tap inside tapSlop emitting a directional swipe via the
 *      flick path (tap now owns its slop region; flick velocity is windowed)
 *
 *  2. STATISTICAL TRACE POPULATIONS (seeded, deterministic): hundreds of
 *     randomised noisy intended gestures (jittered taps with roll-off,
 *     curved swipes, wobbly holds, close-contact presses, noisy pinches)
 *     and unintended noise per gesture (split contacts, static two-finger
 *     rests, walking accelerometer traces, slow tilt drift), asserting
 *     MEASURED miss rates (< 1%) and false-fire rates (exactly 0 in these
 *     populations) — so the "intended gesture essentially never misses,
 *     unintended essentially never fires" bar is evidenced, not claimed.
 *
 *  Also pins GESTURE_LATENCY_MS to measured core behaviour so the latency
 *  budget other modules consume cannot silently drift from reality.
 *
 *  Run: npm test   (compiles src/game via the project's tsc, no browser)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { compileCore } from '../tools/compile-core.mjs'

const { input } = compileCore()
const { PointerCore, ShakeCore, TwistCore, FlipCore,
        pointerTuning, GESTURE_LATENCY_MS, HOLD_MS,
        SPLIT_CONTACT_PX, PINCH_MIN_CONVERGE_PX } = input

const TUNE = pointerTuning(400) // tapSlop 18, swipeMinDist 28, holdMs HOLD_MS

function pointer() {
  const out = []
  const core = new PointerCore((a) => out.push(a), pointerTuning(400))
  return { out, core }
}
function counter(Cls) {
  const out = { n: 0, times: [] }
  let now = 0
  const core = new Cls(() => { out.n++; out.times.push(now) })
  return { out, core, setNow: (t) => { now = t } }
}

// --------------------------------------------------------------------------
// PointerCore — taps
// --------------------------------------------------------------------------

test('tap with finger jitter emits exactly one tap', () => {
  const { out, core } = pointer()
  core.down(1, 100, 100, 0)
  core.move(1, 103, 101, 40)
  core.move(1, 101, 99, 80)
  core.up(1, 102, 100, 120)
  assert.deepEqual(out, ['tap'])
})

test('slow tap (released just under holdMs) is still a tap, never a hold', () => {
  const { out, core } = pointer()
  core.down(1, 50, 50, 0)
  core.up(1, 52, 51, TUNE.holdMs - 40)
  assert.deepEqual(out, ['tap'])
})

// --------------------------------------------------------------------------
// PointerCore — swipes
// --------------------------------------------------------------------------

test('slow deliberate swipe fires on release with correct direction', () => {
  const { out, core } = pointer()
  core.down(1, 100, 300, 0)
  for (let i = 1; i <= 8; i++) core.move(1, 100 + i * 10, 300, i * 50)
  core.up(1, 180, 300, 400)
  assert.deepEqual(out, ['swipe-right'])
})

test('short fast flick fires as a swipe', () => {
  const { out, core } = pointer()
  core.down(1, 200, 200, 0)
  core.move(1, 180, 200, 25)
  core.up(1, 178, 200, 35)
  assert.deepEqual(out, ['swipe-left'])
})

test('fast clear swipe commits mid-gesture and emits exactly once', () => {
  const { out, core } = pointer()
  core.down(1, 0, 0, 0)
  core.move(1, 60, 0, 50)          // 60px at 1.2 px/ms: unambiguous
  assert.deepEqual(out, ['swipe-right'])
  core.move(1, 120, 0, 100)
  core.up(1, 150, 0, 150)
  assert.deepEqual(out, ['swipe-right'])   // one action per session
})

test('REGRESSION: exactly diagonal long swipe stays silent (no guess)', () => {
  const { out, core } = pointer()
  core.down(1, 0, 0, 0)
  core.move(1, 60, 60, 60)
  core.up(1, 100, 100, 100)
  assert.deepEqual(out, [])        // used to emit swipe-right at ratio 1
})

test('clearly dominant near-diagonal swipe still fires', () => {
  const { out, core } = pointer()
  core.down(1, 0, 0, 0)
  core.up(1, 120, 60, 200)
  assert.deepEqual(out, ['swipe-right'])
})

test('ambiguous wander (too far for tap, too short for swipe) is silent', () => {
  const { out, core } = pointer()
  core.down(1, 100, 100, 0)
  core.move(1, 120, 110, 100)
  core.move(1, 108, 92, 180)
  core.up(1, 122, 108, 250)
  assert.deepEqual(out, [])
})

// --------------------------------------------------------------------------
// PointerCore — holds
// --------------------------------------------------------------------------

test('still press fires hold via the timer poll at ~holdMs', () => {
  const { out, core } = pointer()
  core.down(1, 50, 50, 0)
  core.poll(TUNE.holdMs + 12)
  assert.deepEqual(out, ['hold'])
})

test('REGRESSION: drift past slop at poll time, then settle, still fires hold', () => {
  const { out, core } = pointer()
  core.down(1, 100, 100, 0)
  core.move(1, 130, 100, 150)            // 30px out: beyond tapSlop
  core.poll(TUNE.holdMs + 12)            // one-shot poll sees the drift: nothing
  assert.deepEqual(out, [])
  core.move(1, 104, 100, TUNE.holdMs + 100)  // settles back within slop
  assert.deepEqual(out, ['hold'])        // continuous re-evaluation catches it
})

test('REGRESSION: hold released after holdMs with no poll is credited on release', () => {
  const { out, core } = pointer()
  core.down(1, 10, 10, 0)
  core.move(1, 12, 10, 100)
  core.up(1, 11, 10, TUNE.holdMs + 150)  // no poll() ever ran
  assert.deepEqual(out, ['hold'])        // used to be a silent timeout death
})

test('long press that ends far from its origin emits nothing', () => {
  const { out, core } = pointer()
  core.down(1, 0, 0, 0)
  core.move(1, 25, 0, 350)               // beyond slop, short of swipeMinDist
  core.up(1, 25, 0, 500)
  assert.deepEqual(out, [])
})

// --------------------------------------------------------------------------
// PointerCore — pinch
// --------------------------------------------------------------------------

test('two fingers converging fire pinch exactly once, nothing else', () => {
  const { out, core } = pointer()
  core.down(1, 100, 300, 0)
  core.down(2, 300, 300, 10)
  core.move(1, 130, 300, 100)
  core.move(2, 240, 300, 150)            // spread 200 -> 110
  core.up(1, 130, 300, 200)
  core.up(2, 240, 300, 210)
  assert.deepEqual(out, ['pinch'])
})

test('two-finger session that never converges emits nothing (no stray hold/tap)', () => {
  const { out, core } = pointer()
  core.down(1, 100, 300, 0)
  core.down(2, 300, 300, 10)
  core.move(1, 105, 300, 400)            // held past holdMs — still a pinch attempt
  core.up(1, 105, 300, 500)
  core.up(2, 300, 300, 520)
  assert.deepEqual(out, [])
})

// --------------------------------------------------------------------------
// PointerCore — split contacts and the pinch convergence floor (regressions:
// both cases used to emit 'pinch', a wrong-action death on any non-pinch
// command)
// --------------------------------------------------------------------------

test('REGRESSION: two zero-spread contacts with zero movement emit tap, never pinch', () => {
  const { out, core } = pointer()
  core.down(1, 200, 400, 0)
  core.down(2, 200, 400, 12)             // digitiser split: same spot
  core.up(2, 200, 400, 80)
  core.up(1, 200, 400, 100)
  assert.deepEqual(out, ['tap'])         // used to emit 'pinch' (need collapsed to 0)
})

test('REGRESSION: fat-thumb split contact with 4px jitter emits tap, never pinch', () => {
  const { out, core } = pointer()
  core.down(1, 180, 500, 0)
  core.down(2, 188, 503, 8)              // 8px apart: one thumb, two contacts
  core.move(1, 182, 501, 30)
  core.move(2, 185, 500, 40)             // jitter "converges" a few px
  core.move(1, 181, 499, 60)
  core.up(2, 185, 501, 90)
  core.up(1, 180, 500, 110)
  assert.deepEqual(out, ['tap'])         // used to emit 'pinch' (base 8 -> need 4)
})

test('split contact landing during a hold does not steal the hold', () => {
  const { out, core } = pointer()
  core.down(1, 150, 450, 0)
  core.down(2, 160, 455, 40)             // knuckle brush 11px away
  core.up(2, 160, 455, 120)
  core.move(1, 152, 451, TUNE.holdMs + 20)
  assert.deepEqual(out, ['hold'])
})

test('two contacts just under SPLIT_CONTACT_PX apart converging fully stay silent (not pinch)', () => {
  const { out, core } = pointer()
  const gap = SPLIT_CONTACT_PX - 2
  core.down(1, 200, 300, 0)
  core.down(2, 200 + gap, 300, 10)       // split contact: never a pinch attempt
  core.move(2, 202, 300, 120)            // "converges" the whole gap
  core.move(1, 201, 300, 400)            // primary drifts 1px, held past holdMs
  core.up(2, 202, 300, 450)
  core.up(1, 201, 300, 480)
  assert.ok(!out.includes('pinch'), `emitted ${JSON.stringify(out)}`)
})

test('pinch floor: wide-grip pinch still fires; convergence below the floor never does', () => {
  {
    const { out, core } = pointer()      // converges 20px < PINCH_MIN_CONVERGE_PX (28)
    core.down(1, 100, 300, 0)
    core.down(2, 160, 300, 10)           // base 60 — need = max(28, 16.8) = 28
    core.move(1, 110, 300, 80)
    core.move(2, 150, 300, 90)           // converged 20 < 28: silent
    core.up(1, 110, 300, 150)
    core.up(2, 150, 300, 160)
    assert.deepEqual(out, [])
  }
  {
    const { out, core } = pointer()
    core.down(1, 100, 300, 0)
    core.down(2, 160, 300, 10)           // base 60 again
    core.move(1, 118, 300, 80)
    core.move(2, 146, 300, 90)           // converged 32 >= 28: pinch
    core.up(1, 118, 300, 150)
    core.up(2, 146, 300, 160)
    assert.deepEqual(out, ['pinch'])
  }
})

// --------------------------------------------------------------------------
// PointerCore — tap owns its slop region (regressions: both used to emit
// 'swipe-right' via the flick path, a wrong-action death on TAP IT)
// --------------------------------------------------------------------------

test('REGRESSION: 16px jittery tap with one noisy 5px/8ms sample pair is a tap, not a swipe', () => {
  const { out, core } = pointer()
  core.down(1, 100, 100, 0)
  core.move(1, 105, 101, 8)              // 5px in 8ms: raw pair velocity 0.63
  core.move(1, 110, 101, 60)
  core.move(1, 114, 100, 110)
  core.up(1, 116, 100, 140)              // total disp 16 <= tapSlop
  assert.deepEqual(out, ['tap'])
})

test('REGRESSION: 15px fingertip roll-off on the up event is a tap, not a swipe', () => {
  const { out, core } = pointer()
  core.down(1, 200, 300, 0)
  core.move(1, 201, 300, 50)
  core.up(1, 215, 302, 65)               // roll-off: 14px hop in 15ms, still in slop
  assert.deepEqual(out, ['tap'])
})

// --------------------------------------------------------------------------
// ShakeCore
// --------------------------------------------------------------------------

test('walking-level acceleration never fires shake (linear samples)', () => {
  const { out, core } = counter(ShakeCore)
  for (let t = 0; t <= 2000; t += 20) {
    core.sample(0, 4 * Math.sin((2 * Math.PI * 2 * t) / 1000), 0, t, true)
  }
  assert.equal(out.n, 0)
})

test('walking with gravity in the signal never fires shake (high-pass path)', () => {
  const { out, core } = counter(ShakeCore)
  for (let t = 0; t <= 3000; t += 20) {
    const s = Math.sin((2 * Math.PI * 2 * t) / 1000)
    core.sample(0.5 * s, 2 * s, 9.8 + 3 * s, t, false)
  }
  assert.equal(out.n, 0)
})

test('a single bump (phone set down) never fires shake', () => {
  const { out, core } = counter(ShakeCore)
  core.sample(0, 0, 20, 100, true)
  core.sample(0, 0, 0.2, 140, true)
  core.sample(0, 0, 20, 2000, true)      // second isolated bump much later
  assert.equal(out.n, 0)
})

test('a vigorous shake fires once, within the published latency budget', () => {
  const { out, core, setNow } = counter(ShakeCore)
  for (let i = 0; i <= 3; i++) {
    setNow(i * 90)
    core.sample(i % 2 === 0 ? 16 : -16, 0, 0, i * 90, true)
  }
  assert.equal(out.n, 1)
  assert.ok(out.times[0] <= GESTURE_LATENCY_MS.shake,
    `shake fired at ${out.times[0]}ms > budget ${GESTURE_LATENCY_MS.shake}ms`)
})

// --------------------------------------------------------------------------
// TwistCore
// --------------------------------------------------------------------------

test('fast 70-degree twist fires once within the latency budget; holding tilted does not repeat', () => {
  const { out, core, setNow } = counter(TwistCore)
  for (let t = 0; t <= 300; t += 25) {   // 0 -> 72 degrees in 300ms
    setNow(t)
    core.sample((t / 300) * 72, t)
  }
  assert.equal(out.n, 1)
  assert.ok(out.times[0] <= GESTURE_LATENCY_MS.twist,
    `twist fired at ${out.times[0]}ms > budget ${GESTURE_LATENCY_MS.twist}ms`)
  for (let t = 350; t <= 2300; t += 50) { setNow(t); core.sample(72, t) }
  assert.equal(out.n, 1)                 // tilted hold: no spam
  for (let t = 2325; t <= 2625; t += 25) { // settle done — twist back
    setNow(t)
    core.sample(72 - ((t - 2325) / 300) * 72, t)
  }
  assert.equal(out.n, 2)                 // a deliberate second twist still works
})

test('slow tilt drift never fires twist', () => {
  const { out, core } = counter(TwistCore)
  for (let t = 0; t <= 3000; t += 20) core.sample((t / 3000) * 65, t)
  assert.equal(out.n, 0)
})

test('twist through the +/-90 gamma discontinuity fires exactly once', () => {
  const { out, core } = counter(TwistCore)
  const gammas = [40, 60, 80, 88, -88, -80, -70, -60]
  gammas.forEach((g, i) => core.sample(g, i * 50))
  assert.equal(out.n, 1)
})

// --------------------------------------------------------------------------
// FlipCore
// --------------------------------------------------------------------------

test('starting a session face-down never fires flip', () => {
  const { out, core } = counter(FlipCore)
  for (let i = 0; i < 5; i++) core.sampleBeta(170)
  assert.equal(out.n, 0)
})

test('face-up then face-down fires once; re-fires only after returning face-up', () => {
  const { out, core } = counter(FlipCore)
  core.sampleBeta(5)                     // arm
  core.sampleBeta(120)                   // mid zone: nothing
  core.sampleBeta(160)
  assert.equal(out.n, 1)
  core.sampleBeta(165)
  core.sampleBeta(155)
  assert.equal(out.n, 1)                 // stays down: no spam
  core.sampleBeta(8)                     // back up: re-arm
  core.sampleBeta(150)
  assert.equal(out.n, 2)
})

test('gravity-z fallback: only up-then-down fires', () => {
  const { out, core } = counter(FlipCore)
  core.sampleGravityZ(-8)                // starts down: not armed
  assert.equal(out.n, 0)
  core.sampleGravityZ(9.8)
  core.sampleGravityZ(-7)
  assert.equal(out.n, 1)
})

// --------------------------------------------------------------------------
// STATISTICAL TRACE POPULATIONS — measured miss / false-fire rates.
// Seeded PRNG, so every run replays the identical population: a failure here
// is reproducible, and the asserted rates are real measurements, not luck.
// Bars: intended-gesture miss rate < 1% per population; false fires
// (any emission that is not the intended action) exactly 0.
// --------------------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const between = (r, lo, hi) => lo + r() * (hi - lo)

/** Small random walk clamped to a radius — real capacitive touch jitter is a
 *  slow ~1px wander, not white noise teleporting between samples. */
function walker(r, step, radius) {
  let jx = 0, jy = 0
  return () => {
    jx = Math.max(-radius, Math.min(radius, jx + between(r, -step, step)))
    jy = Math.max(-radius, Math.min(radius, jy + between(r, -step, step)))
    return [jx, jy]
  }
}

/** Run a population; assert zero false fires and a miss rate under maxMiss. */
function measure(name, n, gen, maxMiss = 0.01) {
  let miss = 0
  for (let i = 0; i < n; i++) {
    const { out, want } = gen(i)
    for (const a of out) {
      assert.equal(a, want,
        `${name} trace ${i}: FALSE FIRE — emitted '${a}', wanted '${want}'`)
    }
    if (want !== null && out.length !== 1) miss++
  }
  assert.ok(miss / n < maxMiss,
    `${name}: miss rate ${miss}/${n} = ${(100 * miss / n).toFixed(1)}% (bar < ${100 * maxMiss}%)`)
}

test('POPULATION: 400 jittered taps with fingertip roll-off — miss < 1%, zero false fires', () => {
  const r = rng(0x7a95eed)
  measure('jittered-tap', 400, () => {
    const { out, core } = pointer()
    const x0 = between(r, 30, 370), y0 = between(r, 60, 640)
    const jit = walker(r, 0.6, 4)        // ~1px slow wander: real touch jitter
    core.down(1, x0, y0, 0)
    const dur = between(r, 45, TUNE.holdMs - 60)
    let t = 0
    while (t + 14 < dur) {
      t += between(r, 8, 18)
      const [jx, jy] = jit()
      core.move(1, x0 + jx, y0 + jy, t)
      if (r() < 0.08) {                  // occasional digitiser noise spike:
        t += 8                           // a fast few-px excursion and return
        core.move(1, x0 + jx + between(r, -3, 3), y0 + jy + between(r, -3, 3), t)
      }
    }
    const ang = between(r, 0, Math.PI * 2)
    const roll = between(r, 0, 13)       // fingertip roll-off on release
    core.up(1, x0 + Math.cos(ang) * roll, y0 + Math.sin(ang) * roll, dur)
    return { out, want: 'tap' }
  })
})

test('POPULATION: 400 curved jittery swipes — miss < 1%, zero wrong directions', () => {
  const r = rng(0x5e11ed)
  const dirs = [['swipe-right', 1, 0], ['swipe-left', -1, 0],
                ['swipe-down', 0, 1], ['swipe-up', 0, -1]]
  measure('curved-swipe', 400, (i) => {
    const [want, ux, uy] = dirs[i % 4]
    const { out, core } = pointer()
    const x0 = between(r, 120, 280), y0 = between(r, 200, 500)
    const D = between(r, 60, 140)
    const dur = between(r, 120, 320)
    const bow = between(r, 0, 0.18) * D  // perpendicular arc: curved thumbs
    core.down(1, x0, y0, 0)
    let t = 0
    while (t < dur) {
      t = Math.min(dur, t + between(r, 8, 18))
      const s = t / dur
      const main = D * s
      const perp = bow * Math.sin(Math.PI * s)
      core.move(1,
        x0 + ux * main - uy * perp + between(r, -1.5, 1.5),
        y0 + uy * main + ux * perp + between(r, -1.5, 1.5), t)
    }
    core.up(1, x0 + ux * D, y0 + uy * D, dur + 8)
    return { out, want }
  })
})

test('POPULATION: 300 wobbly holds (drift-and-settle included) — miss < 1%, zero false fires', () => {
  const r = rng(0x401d5)
  measure('wobbly-hold', 300, () => {
    const { out, core } = pointer()
    const x0 = between(r, 60, 340), y0 = between(r, 100, 600)
    const jit = walker(r, 0.9, 5)
    core.down(1, x0, y0, 0)
    const dur = between(r, TUNE.holdMs + 60, TUNE.holdMs + 400)
    // A third of holds drift past tapSlop mid-press and settle back — the
    // continuous re-evaluation regression, as a population.
    const excurse = r() < 0.35
    const te = between(r, 80, 160), eAmp = between(r, 14, 20)
    const eAng = between(r, 0, Math.PI * 2)
    let t = 0, polled = false
    while (t + 14 < dur) {
      t += between(r, 8, 18)
      if (!polled && t >= TUNE.holdMs + 12) {  // the DOM wiring's one timer poll
        core.poll(TUNE.holdMs + 12); polled = true
      }
      const [jx, jy] = jit()
      let ex = 0, ey = 0
      if (excurse && t >= te && t <= te + 110) {
        const k = eAmp * Math.sin(Math.PI * (t - te) / 110)
        ex = Math.cos(eAng) * k; ey = Math.sin(eAng) * k
      }
      core.move(1, x0 + jx + ex, y0 + jy + ey, t)
    }
    if (!polled) core.poll(TUNE.holdMs + 12)   // perfectly-still press: no moves
    core.up(1, x0, y0, dur)
    return { out, want: 'hold' }
  })
})

test('POPULATION: 300 noisy pinches at real grip spreads — miss < 1%, zero false fires', () => {
  const r = rng(0x914c4)
  measure('noisy-pinch', 300, () => {
    const { out, core } = pointer()
    const cx = between(r, 140, 260), cy = between(r, 220, 480)
    const base = between(r, 140, 300)
    const ang = between(r, 0, Math.PI)
    const dxu = Math.cos(ang), dyu = Math.sin(ang)
    const keep = between(r, 0.15, 0.5)   // final spread fraction
    const dur = between(r, 180, 400)
    const posA = (f) => [cx - dxu * base * f / 2, cy - dyu * base * f / 2]
    const posB = (f) => [cx + dxu * base * f / 2, cy + dyu * base * f / 2]
    const t2 = between(r, 5, 30)
    core.down(1, ...posA(1), 0)
    core.down(2, ...posB(1), t2)
    let t = t2
    while (t < dur) {
      t = Math.min(dur, t + between(r, 8, 16))
      const f = 1 - (1 - keep) * ((t - t2) / (dur - t2))
      const [ax, ay] = posA(f), [bx, by] = posB(f)
      if (r() < 0.9) core.move(1, ax + between(r, -2, 2), ay + between(r, -2, 2), t)
      if (r() < 0.9) core.move(2, bx + between(r, -2, 2), by + between(r, -2, 2), t + 1)
      t += 1
    }
    core.up(1, ...posA(keep), dur + 10)
    core.up(2, ...posB(keep), dur + 20)
    return { out, want: 'pinch' }
  })
})

test('POPULATION: 300 close-contact presses (split digitiser contacts) — tap fires, pinch never does', () => {
  const r = rng(0xfa77b)
  measure('split-contact-press', 300, () => {
    const { out, core } = pointer()
    const x0 = between(r, 60, 340), y0 = between(r, 150, 600)
    const jit1 = walker(r, 0.9, 5), jit2 = walker(r, 1.2, 6)
    core.down(1, x0, y0, 0)
    const off = between(r, 0, SPLIT_CONTACT_PX - 2)   // 0..38px away: one thumb
    const a2 = between(r, 0, Math.PI * 2)
    const sx = x0 + Math.cos(a2) * off, sy = y0 + Math.sin(a2) * off
    const t2 = between(r, 3, 40)
    core.down(2, sx, sy, t2)
    const dur = between(r, 55, 230)
    let t = t2
    while (t + 14 < dur) {
      t += between(r, 8, 18)
      const [ax, ay] = jit1(), [bx, by] = jit2()
      core.move(1, x0 + ax, y0 + ay, t)
      core.move(2, sx + bx, sy + by, t + 1)
    }
    if (r() < 0.5) {                     // either contact may lift first
      core.up(2, sx, sy, dur - 4)
      core.up(1, x0, y0, dur)
    } else {
      core.up(1, x0, y0, dur - 4)
      core.up(2, sx, sy, dur)
    }
    return { out, want: 'tap' }
  })
})

test('POPULATION: 200 static two-finger rests — nothing ever fires', () => {
  const r = rng(0x2e575)
  measure('two-finger-rest', 200, () => {
    const { out, core } = pointer()
    const x0 = between(r, 60, 180), y0 = between(r, 200, 500)
    const spread = between(r, 120, 250)
    const jit1 = walker(r, 0.9, 4), jit2 = walker(r, 0.9, 4)
    core.down(1, x0, y0, 0)
    core.down(2, x0 + spread, y0 + between(r, -20, 20), 12)
    const dur = between(r, 300, 600)
    let t = 12
    while (t + 14 < dur) {
      t += between(r, 8, 18)
      const [ax, ay] = jit1(), [bx, by] = jit2()
      core.move(1, x0 + ax, y0 + ay, t)
      core.move(2, x0 + spread + bx, y0 + by, t + 1)
    }
    core.up(1, x0, y0, dur)
    core.up(2, x0 + spread, y0, dur + 10)
    return { out, want: null }           // want nothing: any emission is a false fire
  })
})

test('POPULATION: 120 walking accelerometer traces never fire shake', () => {
  const r = rng(0x3a1c)
  for (let i = 0; i < 120; i++) {
    const { out, core } = counter(ShakeCore)
    const f = between(r, 1.4, 2.8)       // Hz — human gait
    const amp = between(r, 2, 4.4)       // m/s^2
    const ph = between(r, 0, Math.PI * 2)
    const gravity = r() < 0.5            // half exercise the high-pass path
    for (let t = 0; t <= 3000; t += 20) {
      const s = Math.sin(2 * Math.PI * f * t / 1000 + ph) * amp
      const n = between(r, -0.8, 0.8)
      if (gravity) core.sample(0.3 * s + n, s + n, 9.8 + 0.6 * s, t, false)
      else core.sample(0.3 * s, s + n, n, t, true)
    }
    assert.equal(out.n, 0, `walking trace ${i} fired shake`)
  }
})

test('POPULATION: 150 vigorous shakes at varied amplitude/frequency — miss < 1%', () => {
  const r = rng(0x54ace)
  let miss = 0
  for (let i = 0; i < 150; i++) {
    const { out, core } = counter(ShakeCore)
    const A = between(r, 14, 18)         // m/s^2
    const f = between(r, 2.5, 4.2)       // Hz
    const a2 = between(r, 0, Math.PI * 2)
    const ux = Math.cos(a2), uy = Math.sin(a2)
    let t = 0
    while (t <= 1500) {
      const s = Math.sin(2 * Math.PI * f * t / 1000) * A
      const n = between(r, -1, 1)
      core.sample(ux * s + n, uy * s + n, n, t, true)
      t += between(r, 12, 22)
    }
    if (out.n === 0) miss++
  }
  assert.ok(miss / 150 < 0.01, `shake miss rate ${miss}/150`)
})

test('POPULATION: 120 slow tilt drifts with hand wobble never fire twist', () => {
  const r = rng(0xd21f7)
  for (let i = 0; i < 120; i++) {
    const { out, core } = counter(TwistCore)
    const total = between(r, 40, 62)     // degrees, spread over seconds
    const dur = between(r, 2500, 4000)
    const wAmp = between(r, 0, 4), wF = between(r, 1, 3)
    for (let t = 0; t <= dur; t += 18) {
      const roll = total * (t / dur) +
        wAmp * Math.sin(2 * Math.PI * wF * t / 1000) + between(r, -1, 1)
      core.sample(roll, t)
    }
    assert.equal(out.n, 0, `tilt-drift trace ${i} fired twist`)
  }
})

test('POPULATION: 150 fast deliberate twists — miss < 1%', () => {
  const r = rng(0x70157)
  let miss = 0
  for (let i = 0; i < 150; i++) {
    const { out, core } = counter(TwistCore)
    const g0 = between(r, -15, 15)
    const delta = (r() < 0.5 ? 1 : -1) * between(r, 65, 88)
    const dur = between(r, 200, 440)
    for (let t = 0; t <= dur; t += between(r, 14, 18)) {
      core.sample(g0 + delta * (t / dur) + between(r, -1.5, 1.5), t)
    }
    if (out.n === 0) miss++
  }
  assert.ok(miss / 150 < 0.01, `twist miss rate ${miss}/150`)
})

// --------------------------------------------------------------------------
// Latency table sanity — the budget other modules consume must match reality
// --------------------------------------------------------------------------

test('GESTURE_LATENCY_MS covers every action and pins hold to HOLD_MS', () => {
  const actions = ['tap', 'swipe-up', 'swipe-down', 'swipe-left', 'swipe-right',
    'twist', 'shake', 'hold', 'release', 'pinch', 'flip', 'none']
  for (const a of actions) {
    assert.equal(typeof GESTURE_LATENCY_MS[a], 'number', `missing latency for ${a}`)
  }
  assert.equal(GESTURE_LATENCY_MS.hold, HOLD_MS)
  assert.equal(pointerTuning(400).holdMs, HOLD_MS)
  assert.equal(pointerTuning(1200).holdMs, HOLD_MS) // not viewport-dependent
})
