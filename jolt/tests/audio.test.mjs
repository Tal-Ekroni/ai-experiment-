/** Audio-layer structural tests. This container has no speakers, so the sound
 *  design is verified by inspection plus structure: the pure music arithmetic
 *  (grid quantisation, the perfect-chain pitch ladder, the player-riff FIFO)
 *  unit-tested directly, and the full Sound class driven through a simulated
 *  600-command session against a fake AudioContext that counts every node
 *  created/disconnected — proving the judgment tier is audibly bigger than a
 *  plain correct, the chain break is audible, the player riff layer actually
 *  plays into the sequencer, chain callouts stay sparse, and an hour-scale
 *  session leaks no nodes.
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
  return req(join(out, 'audio.js'))
}

const audio = compileAudio()
const { Sound, nextGridTime, perfectPitch, pushRiff, PLAYER_RIFF_LEN, PENT } = audio

// ---------------------------------------------------------------------------
// fake WebAudio: counts node creation/disconnection, fires onended on advance
// ---------------------------------------------------------------------------
class P {
  constructor(v = 0) { this.value = v }
  setValueAtTime() { return this }
  exponentialRampToValueAtTime() { return this }
  linearRampToValueAtTime() { return this }
  setTargetAtTime() { return this }
  cancelScheduledValues() { return this }
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
  createStereoPanner() { const n = new FakeNode(this); n.pan = new P(0); return n }
  createBuffer(_ch, len) { return { getChannelData: () => new Float32Array(len) } }
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
  // 4 kicks + 4 soft hats + 2 calm pad plucks = a quiet but real pulse.
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
// hygiene: a 600-command session leaks nothing
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
    if (c % 11 === 10) { chain = 0; s.wrong() }
    else if (c % 3 === 0) { chain++; s.correct(c, true, chain) }
    else if (c % 7 === 6) { chain = 0; s.correct(c, false, 0) }        // slow: break
    else s.correct(c, false, chain)                                    // inhibit-style pass
    ctx.advance(0.4); scheduler()
  }
  s.gameOver()
  ctx.advance(6)

  const liveSources = ctx.sources.filter((x) => !x.ended)
  assert.ok(liveSources.length <= 2,
    `only the two persistent drones may live; found ${liveSources.length}`)
  const liveNodes = ctx.created - ctx.disconnected
  assert.ok(liveNodes <= 12, `persistent graph only; ${liveNodes} nodes still connected`)
  assert.equal(s.pending.length, 0, 'no orphaned cancellable one-shots')
  assert.ok(s.playerRiff.length <= PLAYER_RIFF_LEN, 'riff buffer bounded')
  s.stop()
})
