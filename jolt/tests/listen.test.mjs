/** Proves the LISTEN instrument (tools/listen.mjs) is honest before anyone
 *  trusts its verdict on the game's music. Two rounds of audio shipped weak
 *  because the pipeline judged sound by reading source; an instrument that
 *  said "fine" to silence would be the same mistake with extra steps. So:
 *  pure silence must FAIL the loudness targets, white noise must FAIL the
 *  spectral-balance and grid targets, a synthetic click track at a known BPM
 *  must measure ~100% grid-aligned regardless of phase, a photocopied loop
 *  must score near 1.0 on repetition, and the WAV encoder must round-trip a
 *  known buffer bit-exactly.
 *
 *  Round 7 additions: targets must distinguish NOT MEASURED (null) from
 *  FAILED (false); the clip threshold is one shared constant; and the
 *  repeat-render comparison (comparePcm16 / withinRepeatBound) must count
 *  every LSB and trip on drift beyond the documented bound — the tool's
 *  self-check leans on these being exact.
 *
 *  Run: node --test tests/listen.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeWav16, decodeWav16, peakStats, rmsDb, rmsTimeline, bandShares,
  detectOnsets, gridAlign, lowpassFilter, kickPunch, repetitionScore,
  evaluateTargets, CLIP_AT, comparePcm16, withinRepeatBound, REPEAT_BOUND,
} from '../tools/listen.mjs'

const SR = 44100

/** Deterministic PRNG so noise-based cases can never flake. */
function mulberry32(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- WAV codec

test('WAV encoder round-trips a known stereo buffer bit-exactly', () => {
  const n = 2048
  const i16 = new Int16Array(n * 2)
  for (let i = 0; i < n; i++) {
    i16[i * 2] = Math.round(Math.sin((2 * Math.PI * 440 * i) / SR) * 12000)
    i16[i * 2 + 1] = ((i * 37) % 65536) - 32768   // deliberately full-range values
  }
  const buf = encodeWav16(i16, 2, SR)
  // Header sanity
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF')
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE')
  assert.equal(buf.length, 44 + i16.length * 2)
  const dec = decodeWav16(buf)
  assert.equal(dec.format, 1)
  assert.equal(dec.channels, 2)
  assert.equal(dec.sampleRate, SR)
  assert.equal(dec.bits, 16)
  assert.equal(dec.data.length, i16.length)
  for (let i = 0; i < i16.length; i++) {
    if (dec.data[i] !== i16[i]) assert.fail(`sample ${i}: ${dec.data[i]} !== ${i16[i]}`)
  }
})

// ------------------------------------------------------------ basic honesty

test('pure silence FAILS the loudness targets', () => {
  const x = new Float32Array(SR * 3)
  const { peakDb, clipCount } = peakStats(x)
  const m = { peakDb, clipCount, rmsDb: rmsDb(x), bands: bandShares(x, SR), grid: { pct: 0, onsets: 0 } }
  const t = evaluateTargets(m)
  assert.equal(t.loudnessOk, false, 'an instrument that passes silence is blind')
  assert.ok(m.rmsDb <= -100)
  assert.ok(m.peakDb <= -100)
})

test('peak/clip measurement is literal', () => {
  const x = new Float32Array(SR)
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / SR)
  const s = peakStats(x)
  assert.ok(Math.abs(s.peakDb - 20 * Math.log10(0.5)) < 0.05, `0.5 sine peak ~ -6.02dB, got ${s.peakDb}`)
  assert.equal(s.clipCount, 0)
  x[100] = 1.0
  x[200] = -1.0
  assert.equal(peakStats(x).clipCount, 2)
})

test('white noise FAILS spectral balance and grid targets', () => {
  const rnd = mulberry32(7)
  const x = new Float32Array(SR * 8)
  for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * 0.9
  const bands = bandShares(x, SR)
  // White noise spreads energy uniformly per Hz: <150Hz of 22050 is under 1%.
  assert.ok(bands.low < 0.03, `white noise low share should be tiny, got ${bands.low}`)
  assert.ok(bands.high > 0.5, `white noise high share should dominate, got ${bands.high}`)
  const grid = gridAlign(detectOnsets(x, SR), 128, 4, 15)
  const t = evaluateTargets({ peakDb: -1, clipCount: 0, rmsDb: -12, bands, grid })
  assert.equal(t.balanceOk, false, 'white noise must not pass spectral balance')
  assert.equal(t.gridOk, false, 'steady noise has no beat; grid must fail')
})

// ------------------------------------------------------------ grid alignment

/** Broadband click every beat: 64 samples of alternating polarity. */
function clickTrack(seconds, bpm, phaseS = 0) {
  const x = new Float32Array(Math.round(seconds * SR))
  const beatN = Math.round((60 / bpm) * SR)
  for (let t0 = Math.round(phaseS * SR); t0 < x.length - 64; t0 += beatN) {
    for (let i = 0; i < 64; i++) x[t0 + i] = (i % 2 ? -0.9 : 0.9) * (1 - i / 64)
  }
  return x
}

test('a click track at a known BPM measures ~100% grid-aligned', () => {
  const x = clickTrack(10, 120)
  const onsets = detectOnsets(x, SR)
  assert.ok(onsets.length >= 15, `expected ~20 onsets in 10s at 120bpm, got ${onsets.length}`)
  const g = gridAlign(onsets, 120, 1, 15)
  assert.ok(g.pct >= 95, `click track alignment should be ~100%, got ${g.pct}%`)
  assert.equal(evaluateTargets({ peakDb: -1, clipCount: 0, rmsDb: -20, bands: null, grid: g }).gridOk, true)
})

test('grid alignment is phase-invariant (measures the grid, not the origin)', () => {
  const x = clickTrack(10, 132, 0.137)   // arbitrary offset from t=0
  const g = gridAlign(detectOnsets(x, SR), 132, 1, 15)
  assert.ok(g.pct >= 95, `phase-shifted click track should still align, got ${g.pct}%`)
})

test('a click track at the WRONG BPM does not align', () => {
  const x = clickTrack(10, 120)
  const g = gridAlign(detectOnsets(x, SR), 97, 1, 15)
  assert.ok(g.pct < 60, `120bpm clicks vs a 97bpm grid must not align, got ${g.pct}%`)
})

// ------------------------------------------------------------------- filters

test('lowpass filter keeps 60Hz and crushes 4kHz', () => {
  const lo = new Float32Array(SR)
  const hi = new Float32Array(SR)
  for (let i = 0; i < SR; i++) {
    lo[i] = Math.sin((2 * Math.PI * 60 * i) / SR)
    hi[i] = Math.sin((2 * Math.PI * 4000 * i) / SR)
  }
  const loOut = rmsDb(lowpassFilter(lo, SR, 150, 2))
  const hiOut = rmsDb(lowpassFilter(hi, SR, 150, 2))
  assert.ok(loOut > -6, `60Hz should survive a 150Hz lowpass, got ${loOut}dB`)
  assert.ok(hiOut < -50, `4kHz should be crushed by a 150Hz lowpass, got ${hiOut}dB`)
})

test('kick punch hears the difference between thumps and a drone', () => {
  const bpm = 120
  const beatN = Math.round((60 / bpm) * SR)
  const thump = new Float32Array(SR * 8)
  for (let t0 = 0; t0 < thump.length - beatN; t0 += beatN) {
    for (let i = 0; i < Math.round(0.09 * SR); i++) {
      thump[t0 + i] = 0.8 * Math.sin((2 * Math.PI * 55 * i) / SR) * Math.exp(-i / (0.02 * SR))
    }
  }
  const drone = new Float32Array(SR * 8)
  for (let i = 0; i < drone.length; i++) drone[i] = 0.3 * Math.sin((2 * Math.PI * 55 * i) / SR)
  const punchy = kickPunch(thump, SR, bpm)
  const flat = kickPunch(drone, SR, bpm)
  assert.ok(punchy !== null && flat !== null)
  assert.ok(punchy > flat + 10, `thumps (${punchy}dB) must out-punch a drone (${flat}dB) by >10dB`)
})

// ----------------------------------------------------------------- envelopes

test('RMS timeline tracks a loud/quiet alternation', () => {
  const x = new Float32Array(SR * 4)
  for (let i = 0; i < x.length; i++) {
    const sec = Math.floor(i / SR)
    x[i] = (sec % 2 === 0 ? 0.5 : 0.05) * Math.sin((2 * Math.PI * 330 * i) / SR)
  }
  const tl = rmsTimeline(x, SR, 1)
  assert.equal(tl.length, 4)
  assert.ok(tl[0] - tl[1] > 15 && tl[2] - tl[3] > 15, `loud/quiet seconds should differ by 20dB: ${tl}`)
})

// ------------------------------------------------- measured vs not-measured

test('targets report null (not false) for metrics that were never measured', () => {
  const base = { peakDb: -3, clipCount: 0, rmsDb: -18 }
  // arc60 shape: no single BPM → grid never runs. That is NOT a failure.
  const t = evaluateTargets({ ...base, bands: { low: 0.2, mid: 0.6, high: 0.2 }, grid: null })
  assert.equal(t.gridOk, null, 'an unmeasured grid must not read as failed')
  assert.equal(t.balanceOk, true)
  assert.equal(t.loudnessOk, true)
  // Unmeasured bands likewise.
  assert.equal(evaluateTargets({ ...base, bands: null, grid: null }).balanceOk, null)
  // A grid that WAS measured and came up empty is a real false, not a null.
  const failed = evaluateTargets({ ...base, bands: null, grid: { pct: 0, onsets: 0 } })
  assert.equal(failed.gridOk, false)
})

test('clip threshold is one shared constant across surfaces', () => {
  assert.ok(CLIP_AT > 0.99 && CLIP_AT <= 1, `CLIP_AT sane, got ${CLIP_AT}`)
  const x = new Float32Array(1000)
  x[10] = CLIP_AT             // exactly at threshold: clipped
  x[20] = CLIP_AT - 1e-4      // just under: not clipped
  x[30] = -1
  assert.equal(peakStats(x).clipCount, 2, 'default peakStats must clip at CLIP_AT exactly')
})

// ----------------------------------------------------- repeat-render bound

test('comparePcm16 counts every differing sample and every LSB', () => {
  const a = new Int16Array(10000)
  for (let i = 0; i < a.length; i++) a[i] = ((i * 2731) % 65536) - 32768
  const b = new Int16Array(a)
  const same = comparePcm16(a, b)
  assert.equal(same.diffCount, 0)
  assert.equal(same.maxDeltaLsb, 0)
  assert.equal(same.firstDiff, -1)
  assert.equal(same.samples, a.length)
  b[17] += 1
  b[400] -= 4
  const stats = comparePcm16(a, b)
  assert.equal(stats.diffCount, 2)
  assert.equal(stats.maxDeltaLsb, 4)
  assert.equal(stats.firstDiff, 17)
  assert.throws(() => comparePcm16(a, new Int16Array(9999)), /length mismatch/)
})

test('withinRepeatBound passes measured drift and trips regressions', () => {
  const n = 1_000_000
  // Measured post-fix reality: ~0.02% of samples off by 1 LSB → within bound.
  assert.equal(withinRepeatBound({ samples: n, diffCount: 200, diffPct: 0.02, maxDeltaLsb: 1 }), true)
  // Byte-identical → trivially within bound.
  assert.equal(withinRepeatBound({ samples: n, diffCount: 0, diffPct: 0, maxDeltaLsb: 0 }), true)
  // The OLD broken behavior (onended race: 4 LSB on 1.25%) must trip BOTH limbs.
  assert.equal(withinRepeatBound({ samples: n, diffCount: 12500, diffPct: 1.25, maxDeltaLsb: 4 }), false)
  assert.equal(withinRepeatBound({ samples: n, diffCount: 100, diffPct: 0.01, maxDeltaLsb: REPEAT_BOUND.maxDeltaLsb + 1 }), false)
  assert.equal(withinRepeatBound({ samples: n, diffCount: 30000, diffPct: 3, maxDeltaLsb: 1 }), false)
})

test('repetition score flags a photocopied loop and clears varied material', () => {
  // 2s envelope loop repeated 8 times: segments identical → correlation ~ 1.
  const loop = new Float32Array(SR * 16)
  for (let i = 0; i < loop.length; i++) {
    const ph = (i % (SR * 2)) / (SR * 2)
    const env = 0.15 + 0.7 * Math.abs(Math.sin(Math.PI * ph * 3))
    loop[i] = env * Math.sin((2 * Math.PI * 220 * i) / SR)
  }
  const rep = repetitionScore(loop, SR, 2)
  assert.ok(rep !== null && rep >= 0.95, `a perfect loop must score near 1.0, got ${rep}`)

  // Constant-amplitude noise: envelope is flat jitter → correlation near 0.
  const rnd = mulberry32(99)
  const varied = new Float32Array(SR * 16)
  for (let i = 0; i < varied.length; i++) varied[i] = (rnd() * 2 - 1) * 0.5
  const repV = repetitionScore(varied, SR, 2)
  assert.ok(repV !== null && repV < 0.6, `uncorrelated envelopes must score low, got ${repV}`)
})
