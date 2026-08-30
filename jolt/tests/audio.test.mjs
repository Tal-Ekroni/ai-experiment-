/** Audio-layer structural tests. This container has no speakers, so the sound
 *  design is verified by inspection plus structure: the pure music arithmetic
 *  (grid quantisation, catch-up clamp, engine-clock nudge, the arrangement
 *  state machine, kick patterns, bass riff rotation, the perfect-chain pitch
 *  ladder, the player-riff FIFO, the generated saturation curve and reverb
 *  impulse) unit-tested directly, and the full Sound class driven through a
 *  simulated 600-command session against a fake AudioContext that counts every
 *  node created/disconnected — proving the judgment tier is audibly bigger
 *  than a plain correct, drops are earned by gameplay and land bar-aligned,
 *  the kick pumps the sidechain bus, mute toggles can't fabricate chain
 *  breaks, pause/resume re-arms the countdown, and an hour-scale session
 *  leaks no nodes.
 *
 *  Run: node --test tests/audio.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// ---------------------------------------------------------------------------
// compile the REAL audio module (plus its deps) with the project's tsc
// ---------------------------------------------------------------------------
function compileAudio() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const out = mkdtempSync(join(tmpdir(), 'jolt-audio-'))
  execFileSync('npx', ['tsc',
    'src/game/types.ts', 'src/game/rng.ts', 'src/game/commands.ts',
    'src/game/engine.ts', 'src/game/input.ts', 'src/game/audio.ts',
    '--outDir', out, '--module', 'commonjs', '--target', 'es2020',
    '--lib', 'es2020,dom', '--moduleResolution', 'node', '--skipLibCheck',
  ], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}\n')
  const req = createRequire(join(out, 'x.js'))
  return { audio: req(join(out, 'audio.js')), commands: req(join(out, 'commands.js')), input: req(join(out, 'input.js')) }
}

const { audio, commands, input } = compileAudio()
const {
  Sound, nextGridTime, perfectPitch, pushRiff, PLAYER_RIFF_LEN, PENT,
  clampCatchUp, clockNudge, nextArrangement, kickStepsFor, bassRiffFor,
  saturationCurve, fillImpulse, DROP_BARS, DROP_COOLDOWN_BARS, INTRO_EXIT,
} = audio

// ---------------------------------------------------------------------------
// fake WebAudio: counts node creation/disconnection, fires onended on advance,
// records every AudioParam automation call so gain choreography is assertable
// ---------------------------------------------------------------------------
class P {
  constructor(v = 0) { this.value = v; this.calls = [] }
  setValueAtTime(v, t) { this.calls.push(['set', v, t]); return this }
  exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]); return this }
  linearRampToValueAtTime(v, t) { this.calls.push(['lin', v, t]); return this }
  setTargetAtTime(v, t) { this.calls.push(['target', v, t]); return this }
  cancelScheduledValues() { this.calls.push(['cancel']); return this }
}
class FakeNode {
  constructor(ctx) { this.ctx = ctx; ctx.created++; this.live = true }
  connect(n) { return n }
  disconnect() { if (this.live) { this.live = false; this.ctx.disconnected++ } }
}
class FakeSource extends FakeNode {
  constructor(ctx) {
    super(ctx)
    ctx.sources.push(this)
    this.onended = null
    this.stopAt = Infinity
    this.ended = false
    this.startAt = null
  }
  start(t) { this.startAt = t === undefined ? this.ctx.currentTime : t }
  stop(t) { this.stopAt = Math.min(this.stopAt, t === undefined ? this.ctx.currentTime : t) }
}
class FakeCtx {
  constructor() {
    this.currentTime = 0
    this.state = 'running'
    this.sampleRate = 8000
    this.created = 0
    this.disconnected = 0
    this.sources = []
    this.destination = { connect() {}, disconnect() {} }
  }
  createGain() { const n = new FakeNode(this); n.gain = new P(1); return n }
  createOscillator() { const s = new FakeSource(this); s.frequency = new P(440); s.type = 'sine'; return s }
  createBufferSource() { const s = new FakeSource(this); s.buffer = null; s.loop = false; return s }
  createBiquadFilter() { const n = new FakeNode(this); n.frequency = new P(350); n.Q = new P(1); n.type = 'lowpass'; return n }
  createDynamicsCompressor() {
    const n = new FakeNode(this)
    n.threshold = new P(); n.knee = new P(); n.ratio = new P(); n.attack = new P(); n.release = new P()
    return n
  }
  createWaveShaper() { const n = new FakeNode(this); n.curve = null; n.oversample = 'none'; return n }
  createConvolver() { const n = new FakeNode(this); n.buffer = null; return n }
  createStereoPanner() { const n = new FakeNode(this); n.pan = new P(0); return n }
  createBuffer(_ch, len) {
    const chans = new Map()
    return { getChannelData: (c) => { if (!chans.has(c)) chans.set(c, new Float32Array(len)); return chans.get(c) } }
  }
  resume() { this.state = 'running'; return Promise.resolve() }
  close() { this.state = 'closed'; return Promise.resolve() }
  /** Move time forward and fire onended for every one-shot that has stopped. */
  advance(dt) {
    this.currentTime += dt
    for (const s of this.sources) {
      if (!s.ended && s.stopAt <= this.currentTime) {
        s.ended = true
        if (s.onended) s.onended()
      }
    }
    if (this.sources.length > 4000) this.sources = this.sources.filter((s) => !s.ended)
  }
}

/** Install fake window (captured timers — nothing runs for real) + speech. */
function makeEnv() {
  const env = { intervals: [], timers: new Map(), tid: 0 }
  global.window = {
    AudioContext: FakeCtx,
    setInterval: (fn) => { env.intervals.push(fn); return env.intervals.length },
    clearInterval: () => {},
    setTimeout: (fn) => { env.tid++; env.timers.set(env.tid, fn); return env.tid },
    clearTimeout: (id) => { env.timers.delete(id) },
  }
  const sp = {
    speaking: false, pending: false, spoken: [], cancels: 0,
    speak(u) { sp.spoken.push(u.text) },
    cancel() { sp.cancels++; sp.speaking = false; sp.pending = false },
    getVoices: () => [],
    addEventListener() {},
  }
  global.speechSynthesis = sp
  global.SpeechSynthesisUtterance = class {
    constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null }
  }
  env.speech = sp
  return env
}

function startedSound() {
  const env = makeEnv()
  const s = new Sound()
  s.start()
  return { env, s, ctx: s.ctx }
}

// ---------------------------------------------------------------------------
// pure music arithmetic
// ---------------------------------------------------------------------------
test('nextGridTime: first unsounded 16th at/after now, aligned to the horizon', () => {
  const step = 60 / 120 / 4                       // 0.125s at 120 BPM
  assert.ok(Math.abs(nextGridTime(10.01, 10.5, step) - 10.125) < 1e-9)
  for (let now = 0; now < 2; now += 0.017) {
    const g = nextGridTime(now, 2.0, step)
    assert.ok(g >= now, 'grid line never in the past')
    assert.ok(g - now <= step + 0.004, 'never waits more than one 16th (+slack)')
    if (g > now) {
      const k = (2.0 - g) / step
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6, 'aligned with the scheduler grid')
    }
  }
})

test('clampCatchUp: over a bar behind re-anchors to now; otherwise untouched', () => {
  const bar = 2.0
  assert.equal(clampCatchUp(5.0, 10.0, bar), 10.0, 'way behind: re-anchored')
  assert.equal(clampCatchUp(8.5, 10.0, bar), 8.5, 'within a bar: catch up normally')
  assert.equal(clampCatchUp(10.3, 10.0, bar), 10.3, 'ahead: untouched')
})

test('clockNudge: wraps to the NEAREST beat boundary and clamps to maxNudge', () => {
  const beat = 0.5
  // 40ms apart: clamped to the 8ms ceiling, direction preserved.
  assert.equal(clockNudge(10.04, 10.0, beat, 0.008), 0.008)
  assert.equal(clockNudge(10.0, 10.04, beat, 0.008), -0.008)
  // Nearly a full beat "ahead" is really 10ms BEHIND the nearer boundary.
  assert.ok(clockNudge(10.49, 10.0, beat, 0.008) < 0)
  // Tiny drift passes through un-clamped.
  assert.ok(Math.abs(clockNudge(10.002, 10.0, beat, 0.008) - 0.002) < 1e-9)
})

test('perfectPitch: one pentatonic rung per link, monotonic, capped at 15', () => {
  assert.equal(perfectPitch(1), 0)
  assert.equal(perfectPitch(2), PENT[1])
  assert.equal(perfectPitch(6), 12)                // wrapped one octave up
  for (let c = 1; c < 30; c++) {
    assert.ok(perfectPitch(c + 1) >= perfectPitch(c), `monotonic at ${c}`)
  }
  assert.equal(perfectPitch(15), perfectPitch(40)) // capped where the bonus caps
  assert.equal(perfectPitch(15), PENT[4] + 24)     // 33 semitones: the top rung
})

test('pushRiff: FIFO, capped at PLAYER_RIFF_LEN', () => {
  const r = []
  for (let k = 0; k < 20; k++) pushRiff(r, k)
  assert.equal(r.length, PLAYER_RIFF_LEN)
  assert.deepEqual(r, [12, 13, 14, 15, 16, 17, 18, 19])
})

test('saturationCurve: odd-symmetric, monotonic, normalised to ±1', () => {
  const c = saturationCurve(257, 1.7)
  assert.equal(c[0], -1)
  assert.equal(c[256], 1)
  assert.ok(Math.abs(c[128]) < 1e-6, 'zero in, zero out')
  for (let k = 1; k < 257; k++) assert.ok(c[k] >= c[k - 1], `monotonic at ${k}`)
  for (let k = 0; k < 128; k++) {
    assert.ok(Math.abs(c[k] + c[256 - k]) < 1e-6, `odd symmetry at ${k}`)
  }
})

test('fillImpulse: a decaying reverb tail, not a noise blast', () => {
  const d = new Float32Array(4000)
  fillImpulse(d)
  const mean = (a, b) => {
    let s = 0
    for (let k = a; k < b; k++) s += Math.abs(d[k])
    return s / (b - a)
  }
  const head = mean(0, 400)
  const tail = mean(3600, 4000)
  assert.ok(head > tail * 5, `tail must decay hard (head ${head.toFixed(3)} vs tail ${tail.toFixed(3)})`)
})

// ---------------------------------------------------------------------------
// arrangement: intro → groove → build → DROP → groove, bar-aligned
// ---------------------------------------------------------------------------
test('nextArrangement: intro exits on intensity; drop rides build then DROP_BARS', () => {
  let a = { section: 'intro', barsLeft: 0 }
  a = nextArrangement(a, 0, false)
  assert.equal(a.section, 'intro', 'calm: stays sparse')
  a = nextArrangement(a, INTRO_EXIT + 0.01, false)
  assert.equal(a.section, 'groove')
  a = nextArrangement(a, 0.5, true)                 // gameplay queued a drop
  assert.equal(a.section, 'build', 'a queued drop becomes a one-bar build first')
  a = nextArrangement(a, 0.5, false)
  assert.equal(a.section, 'drop', 'the build keeps its promise')
  for (let k = 1; k < DROP_BARS; k++) {
    a = nextArrangement(a, 0.5, false)
    assert.equal(a.section, 'drop', `drop bar ${k + 1}`)
  }
  a = nextArrangement(a, 0.5, false)
  assert.equal(a.section, 'groove', 'and settles back into the groove')
})

test('kickStepsFor: every section keeps the downbeat; drop hits hardest', () => {
  for (const sec of ['intro', 'groove', 'build', 'drop']) {
    assert.ok(kickStepsFor(sec, 0.5).includes(0), `${sec} keeps the one`)
  }
  assert.ok(kickStepsFor('drop', 0.6).length > kickStepsFor('groove', 0.6).length,
    'the drop earns extra kicks')
  assert.ok(kickStepsFor('intro', 0).length < kickStepsFor('groove', 0).length,
    'the intro is a heartbeat, not a groove')
  for (const st of kickStepsFor('drop', 1)) assert.ok(st >= 0 && st < 16)
})

test('bassRiffFor: AAAB/AABC rotation — variation lands at the phrase turns', () => {
  for (const bar of [0, 1, 2, 4, 5]) {
    assert.deepEqual(bassRiffFor(bar), bassRiffFor(0), `bar ${bar} carries the hook`)
  }
  assert.notDeepEqual(bassRiffFor(3), bassRiffFor(0), 'bar 3 varies')
  assert.notDeepEqual(bassRiffFor(7), bassRiffFor(3), 'bar 7 is the bigger turn')
  for (const bar of [0, 3, 7]) assert.equal(bassRiffFor(bar).length, 8, '8 8th-note slots')
})

test('drops are EARNED: chain x10 queues one; a plain correct does not', () => {
  const a = startedSound()
  a.s.correct(1, true, 9)
  assert.equal(a.s.dropQueued, false, 'chain 9: not yet')
  a.s.correct(1, true, 10)
  assert.equal(a.s.dropQueued, true, 'chain 10: the track celebrates')
})

test('final-life clutch queues a drop; earlier lives do not', () => {
  const a = startedSound()
  a.s.wrong(3)
  assert.equal(a.s.dropQueued, false)
  a.s.wrong(2)
  assert.equal(a.s.dropQueued, false)
  a.s.wrong(1)
  assert.equal(a.s.dropQueued, true, 'down to the last life: clutch drop queued')
})

test('the queued drop lands bar-aligned via a build, then cools down 8 bars', () => {
  const a = startedSound()
  const { s, ctx } = a
  s.intensityV = 0.5
  s.arr = { section: 'groove', barsLeft: 0 }
  s.bar = 20
  s.queueDrop()
  assert.equal(s.dropQueued, true)
  s.scheduleStep(3, ctx.currentTime + 0.1)          // mid-bar: nothing changes
  assert.equal(s.arr.section, 'groove', 'a drop can never start mid-bar')
  s.scheduleStep(0, ctx.currentTime + 0.2)          // bar line
  assert.equal(s.arr.section, 'build')
  assert.equal(s.dropQueued, false, 'consumed')
  s.scheduleStep(0, ctx.currentTime + 0.3)
  assert.equal(s.arr.section, 'drop')
  assert.equal(s.lastDropBar, s.bar)
  // Cooldown: a new request right after the drop is refused...
  s.arr = { section: 'groove', barsLeft: 0 }
  s.bar = s.lastDropBar + DROP_COOLDOWN_BARS - 1
  s.queueDrop()
  assert.equal(s.dropQueued, false, 'inside the cooldown: drops stay special')
  // ...and honoured once the groove has breathed.
  s.bar = s.lastDropBar + DROP_COOLDOWN_BARS
  s.queueDrop()
  assert.equal(s.dropQueued, true)
})

test('key changes are bar-aligned and ANNOUNCED: riser at beat 4, adopt at the bar', () => {
  const a = startedSound()
  const { s, ctx } = a
  s.arr = { section: 'groove', barsLeft: 0 }
  s.intensityV = 0.9                                 // keyTarget far from shift 0
  const before = ctx.sources.length
  s.scheduleStep(12, ctx.currentTime + 0.1)          // a beat before the bar line
  assert.notEqual(s.pendingKey, null, 'change noticed a beat early')
  assert.equal(s.shift, 0, 'but NOT adopted mid-bar')
  assert.ok(ctx.sources.length > before, 'the riser announces it')
  s.scheduleStep(0, ctx.currentTime + 0.5)           // the bar line
  assert.notEqual(s.shift, 0, 'adopted exactly on the bar')
  assert.equal(s.pendingKey, null)
})

// ---------------------------------------------------------------------------
// mix: the kick pumps the sidechain bus (pad/bass/lead duck under every kick)
// ---------------------------------------------------------------------------
test('sidechain: every kick of a groove bar dips the duck bus', () => {
  const a = startedSound()
  const { s, ctx } = a
  s.intensityV = 0.5
  s.arr = { section: 'groove', barsLeft: 0 }
  const kicks = kickStepsFor('groove', 0.5).length
  const before = s.duckBus.gain.calls.length
  for (let st = 0; st < 16; st++) s.scheduleStep(st, ctx.currentTime + 1 + st * 0.01)
  const delta = s.duckBus.gain.calls.length - before
  assert.equal(delta, kicks * 3, `each of ${kicks} kicks = set+dip+recover on the duck bus`)
})

test('the produced chain exists: saturation curve loaded, reverb impulse set', () => {
  const a = startedSound()
  assert.ok(a.s.shaper, 'master WaveShaper present')
  assert.ok(a.s.shaper.curve && a.s.shaper.curve.length > 0, 'generated curve loaded')
  assert.ok(a.s.reverb, 'convolver present')
  assert.ok(a.s.reverb.buffer, 'generated impulse loaded')
})

// ---------------------------------------------------------------------------
// engine clock lock (feature-detected — standalone fallback intact)
// ---------------------------------------------------------------------------
test('syncClock: adopts an engine bpm when present, falls back when absent', () => {
  const a = startedSound()
  a.s.setIntensity(0)
  const fallback = a.s.bpm()
  a.s.syncClock({ bpm: 172 })
  assert.equal(a.s.bpm(), 172, 'engine clock wins')
  a.s.syncClock({ score: 5 })                        // no beat fields this build
  assert.equal(a.s.bpm(), fallback, 'standalone fallback restored')
  a.s.syncClock({ bpm: 9999 })                       // hostile/garbage value
  assert.equal(a.s.bpm(), fallback, 'absurd bpm rejected')
})

test('syncClock: beatPhase nudges the grid gently (bounded per call)', () => {
  const a = startedSound()
  const before = a.s.nextNoteTime
  a.s.syncClock({ bpm: 120, beatPhase: 0.37 })
  const moved = Math.abs(a.s.nextNoteTime - before)
  assert.ok(moved <= 0.008 + 1e-9, `nudge bounded to 8ms, moved ${moved}`)
})

// ---------------------------------------------------------------------------
// defect fixes: catch-up blast, mute-toggle phantom break, pause/resume,
// windowMsFor gesture latency
// ---------------------------------------------------------------------------
test('backgrounded tab: a huge scheduler gap re-anchors instead of blasting', () => {
  const a = startedSound()
  const { s, ctx, env } = a
  const scheduler = env.intervals[0]
  scheduler()
  ctx.advance(120)                                   // two minutes backgrounded
  const before = ctx.sources.length
  scheduler()
  const burst = ctx.sources.length - before
  assert.ok(s.nextNoteTime >= ctx.currentTime - 0.5, 're-anchored to now')
  assert.ok(burst < 40, `only one lookahead horizon of steps may sound, got ${burst}`)
})

test('mute toggle cannot fabricate a chain break: state tracks even muted', () => {
  const a = startedSound()
  a.s.correct(1, true, 5)                            // audible chain built
  a.s.muted = true
  a.s.wrong()                                        // chain died SILENTLY (muted)
  a.s.muted = false
  const before = a.ctx.sources.length
  a.s.correct(1, false, 0)                           // plain correct, chain long gone
  const withFix = a.ctx.sources.length - before

  const b = startedSound()
  const b2 = b.ctx.sources.length
  b.s.correct(1, false, 0)                           // reference: plain correct
  const plain = b.ctx.sources.length - b2
  assert.equal(withFix, plain, 'no phantom break sound after a muted death')
})

test('muted play still authors state: riff, stats and chain follow the engine', () => {
  const a = startedSound()
  a.s.muted = true
  a.s.correct(1, true, 1)
  a.s.correct(2, true, 2)
  assert.equal(a.s.playerRiff.length, 2, 'muted corrects still compose')
  assert.equal(a.s.lastChain, 2)
  a.s.wrong()
  assert.equal(a.s.playerRiff.length, 0, 'muted miss still wipes')
  assert.equal(a.s.lastChain, 0)
})

test('pause cancels the countdown; resume re-arms it for the fresh window', () => {
  const a = startedSound()
  a.s.say('TAP IT', 0, 1000)                         // long window: 6 countdown ticks
  assert.ok(a.s.pending.length >= 6, 'countdown armed')
  a.s.pause()
  assert.equal(a.s.pending.length, 0, 'pause silences the ticking deadline')
  a.s.resume(1000)
  assert.ok(a.s.pending.length >= 6, 'resume re-arms the countdown')
  a.s.resume()                                       // resume with no live command
  assert.ok(a.s.pending.length >= 6, 'no-window resume adds nothing new')
})

test('windowMsFor matches commands.nextCommand: scale AND additive gesture latency', () => {
  const a = startedSound()
  const i = commands.intensity(40)
  const flip = a.s.windowMsFor('FLIP IT', i)
  const expected = Math.round(commands.windowFor(39) * 1.5) + input.gestureLatencyMs('flip')
  assert.equal(flip, expected, 'FLIP window includes the 520ms physical budget')
  const tap = a.s.windowMsFor('TAP IT', i)
  assert.equal(tap, Math.round(commands.windowFor(39) * 1) + input.gestureLatencyMs('tap'))
  assert.equal(a.s.windowMsFor('DO NOTHING', i), commands.INHIBIT_WINDOW)
})

// ---------------------------------------------------------------------------
// judgment tier: the player HEARS how well they played
// ---------------------------------------------------------------------------
test('a perfect is audibly bigger than a plain correct (more scheduled sources)', () => {
  const a = startedSound()
  const before1 = a.ctx.sources.length
  a.s.correct(1, false, 0)
  const plain = a.ctx.sources.length - before1

  const b = startedSound()
  const before2 = b.ctx.sources.length
  b.s.correct(1, true, 4)
  const perfect = b.ctx.sources.length - before2
  assert.ok(perfect > plain, `perfect earcon (${perfect}) must outweigh plain correct (${plain})`)
})

test('chain escalation: a x8 perfect schedules at least as much as a x1, higher-pitched', () => {
  const a = startedSound()
  const b1 = a.ctx.sources.length
  a.s.correct(1, true, 1)
  const low = a.ctx.sources.length - b1

  const b = startedSound()
  const b2 = b.ctx.sources.length
  b.s.correct(1, true, 8)
  const high = b.ctx.sources.length - b2
  assert.ok(high >= low, 'higher chain never sounds smaller')
  assert.ok(perfectPitch(8) > perfectPitch(1), 'and sits higher on the ladder')
})

test('chain break is audible: slow-correct after a x5 chain outweighs one after no chain', () => {
  const a = startedSound()
  for (let c = 1; c <= 5; c++) a.s.correct(c, true, c)
  const b1 = a.ctx.sources.length
  a.s.correct(6, false, 0)                          // the chain snaps
  const withBreak = a.ctx.sources.length - b1

  const b = startedSound()
  const b2 = b.ctx.sources.length
  b.s.correct(6, false, 0)                          // nothing to snap
  const noBreak = b.ctx.sources.length - b2
  assert.ok(withBreak > noBreak, `break (${withBreak}) must add sound over plain (${noBreak})`)
})

test('a held DO NOTHING passes the chain through silently — no break sound', () => {
  const a = startedSound()
  for (let c = 1; c <= 5; c++) a.s.correct(c, true, c)
  const b1 = a.ctx.sources.length
  a.s.correct(6, false, 5)                          // chain preserved (inhibit pass)
  const inhibitPass = a.ctx.sources.length - b1

  const b = startedSound()
  const b2 = b.ctx.sources.length
  b.s.correct(6, false, 0)
  const plain = b.ctx.sources.length - b2
  assert.equal(inhibitPass, plain, 'holding your nerve must not sound like failing')
})

test('a dead hot chain shatters: wrong() after x6 outweighs wrong() cold, and wipes the riff', () => {
  const a = startedSound()
  for (let c = 1; c <= 6; c++) a.s.correct(c, true, c)
  assert.ok(a.s.playerRiff.length > 0, 'corrects author the riff')
  const b1 = a.ctx.sources.length
  a.s.wrong()
  const hot = a.ctx.sources.length - b1
  assert.equal(a.s.playerRiff.length, 0, 'a miss wipes the player-authored lead')

  const b = startedSound()
  const b2 = b.ctx.sources.length
  b.s.wrong()
  const cold = b.ctx.sources.length - b2
  assert.ok(hot > cold, `hot-chain death (${hot}) must shatter over a cold miss (${cold})`)
})

// ---------------------------------------------------------------------------
// actions-become-the-music: the riff the player wrote actually plays
// ---------------------------------------------------------------------------
test('sequencer plays the player-authored riff on the off-8ths', () => {
  const a = startedSound()
  a.s.intensityV = 0
  a.s.playerRiff.length = 0
  const b1 = a.ctx.sources.length
  for (let st = 0; st < 16; st++) a.s.scheduleStep(st, a.ctx.currentTime + 1 + st * 0.01)
  const withoutRiff = a.ctx.sources.length - b1

  a.s.playerRiff.push(0, 4, 7)
  const b2 = a.ctx.sources.length
  for (let st = 0; st < 16; st++) a.s.scheduleStep(st, a.ctx.currentTime + 2 + st * 0.01)
  const withRiff = a.ctx.sources.length - b2
  assert.equal(withRiff, withoutRiff + 4, 'riff adds exactly the four off-8th lead notes per bar')
})

test('the opening bar is present, not silent, at intensity zero', () => {
  const a = startedSound()
  a.s.intensityV = 0
  const b1 = a.ctx.sources.length
  for (let st = 0; st < 16; st++) a.s.scheduleStep(st, a.ctx.currentTime + 1 + st * 0.01)
  const events = a.ctx.sources.length - b1
  // Heartbeat kicks + metallic off-8th hats + calm pad plucks: a quiet but
  // real pulse from command one.
  assert.ok(events >= 10, `calm bar schedules ${events} events; must be >= 10`)
})

// ---------------------------------------------------------------------------
// announcer: sparse chain callouts, no overlap with command speech
// ---------------------------------------------------------------------------
test('chain callouts fire only at multiples of five — never every command', () => {
  const a = startedSound()
  a.env.speech.spoken.length = 0
  for (let c = 1; c <= 12; c++) a.s.correct(1, true, c)   // streak pinned to 1: no praise
  assert.equal(a.env.speech.spoken.length, 2, 'exactly chain 5 and chain 10 speak')
})

test('say() still cancels in-flight speech before a new command (no overlap, no lag)', () => {
  const a = startedSound()
  a.env.speech.speaking = true                     // a callout is mid-sentence
  const spokenBefore = a.env.speech.spoken.length
  a.s.say('TAP IT', 0.1, 1000)
  assert.ok(a.env.speech.cancels >= 1, 'in-flight speech cancelled')
  assert.equal(a.env.speech.spoken.length, spokenBefore, 're-speak deferred one macrotask')
  const fns = [...a.env.timers.values()]
  assert.ok(fns.length >= 1)
  fns[fns.length - 1]()                            // the deferred re-speak fires
  assert.equal(a.env.speech.spoken.length, spokenBefore + 1, 'command line spoken after cancel')
})

test('game over calls the best chain out loud when it earned it', () => {
  const a = startedSound()
  for (let c = 1; c <= 7; c++) a.s.correct(c, true, c)
  a.s.gameOver()
  const fns = [...a.env.timers.values()]
  fns[fns.length - 1]()                            // the delayed game-over speech
  const all = a.env.speech.spoken.join(' | ')
  assert.match(all, /7 perfect, chained/, `expected chain callout in: ${all}`)
})

// ---------------------------------------------------------------------------
// hygiene: a 600-command session (drops, pauses, mutes included) leaks nothing
// ---------------------------------------------------------------------------
test('600-command simulated session: zero node leaks, bounded state', () => {
  const a = startedSound()
  const { s, ctx, env } = a
  const scheduler = env.intervals[0]
  const labels = ['TAP IT', 'SWIPE LEFT', 'SHAKE IT', 'DO NOTHING', 'FLIP IT', 'TWIST IT', 'HOLD IT', 'PINCH IT']
  let chain = 0
  for (let c = 0; c < 600; c++) {
    const i = Math.min(1, c / 116)
    s.setIntensity(i)
    scheduler(); ctx.advance(0.08); scheduler()
    s.say(labels[c % labels.length], i)
    ctx.advance(0.15); scheduler()
    if (c % 97 === 50) { s.pause(); ctx.advance(1); s.resume(900) }   // pause screens
    if (c % 131 === 60) { s.muted = true }                            // mute toggles
    if (c % 131 === 70) { s.muted = false }
    if (c % 11 === 10) { chain = 0; s.wrong(1 + (c % 3)) }            // clutch drops included
    else if (c % 3 === 0) { chain++; s.correct(c, true, chain) }      // x10/x15 chain drops included
    else if (c % 7 === 6) { chain = 0; s.correct(c, false, 0) }       // slow: break
    else s.correct(c, false, chain)                                   // inhibit-style pass
    ctx.advance(0.4); scheduler()
  }
  s.gameOver()
  ctx.advance(8)

  const liveSources = ctx.sources.filter((x) => !x.ended)
  assert.ok(liveSources.length <= 2,
    `only the two persistent drones may live; found ${liveSources.length}`)
  const liveNodes = ctx.created - ctx.disconnected
  assert.ok(liveNodes <= 14,
    `persistent bus/reverb/drone graph only; ${liveNodes} nodes still connected`)
  assert.equal(s.pending.length, 0, 'no orphaned cancellable one-shots')
  assert.ok(s.playerRiff.length <= PLAYER_RIFF_LEN, 'riff buffer bounded')
  s.stop()
})
