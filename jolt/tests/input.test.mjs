/** Headless unit tests for the recogniser cores (PointerCore, ShakeCore,
 *  TwistCore, FlipCore) — the tests the file header always promised. Synthetic
 *  event streams; assertions are of the "never misses an intended gesture,
 *  never fires an unintended one" kind, plus regression tests for:
 *    - one-shot hold poll losing a drift-and-settle hold (now continuous)
 *    - hold released after holdMs emitting nothing (now credited on release)
 *    - exactly diagonal long swipes resolving to horizontal (now silent)
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
        pointerTuning, GESTURE_LATENCY_MS, HOLD_MS } = input

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
