#!/usr/bin/env node
/** LISTEN: the pipeline's ears. Two rounds of music were judged by reading
 *  source and shipped weak to real ears — this instrument renders the game's
 *  REAL audio engine (src/game/audio.ts, the actual mix graph: buses, tanh
 *  saturation, compressor, convolver reverb, sidechain duck, drone) through an
 *  OfflineAudioContext inside pinned Chromium, faster than real time, exports
 *  each scene as a WAV humans can play, and prints objective mix metrics as
 *  JSON.
 *
 *  REPEATABILITY (measured, not assumed — this is NOT byte-deterministic):
 *  scenes are seeded (Math.random replaced in-page) and every graph mutation
 *  happens while the context is suspended, so the composition is exactly
 *  reproducible. Two residual sources of drift were root-caused in round 7:
 *    1. one-shot cleanup: audio.ts used to disconnect each note's
 *       envelope/filter chain in `onended`, which is main-thread-timed while
 *       the offline render races ahead of realtime — ringing biquad tails got
 *       truncated at a different rendered quantum every run (~1.25% of
 *       samples, up to 4 LSB). FIXED: offline renders skip the disconnect.
 *    2. Blink sums a node's fan-in in pointer-hash order, so float addition
 *       order varies per run; samples sitting exactly on a 16-bit rounding
 *       boundary flip by 1 LSB (measured ~0.02% of samples, -90 dBFS). Not
 *       addressable from JS.
 *  The instrument therefore ENFORCES a repeat bound instead of claiming
 *  byte-exactness: every run re-renders one scene and asserts the two PCM
 *  streams agree within REPEAT_BOUND (max |delta| <= 2 LSB, <= 0.2% of
 *  samples differing) — see comparePcm16/withinRepeatBound, unit-tested in
 *  tests/listen.test.mjs. All reported metrics are stable at their printed
 *  precision under that bound. `--no-repeat-check` skips the second render.
 *
 *  usage: node tools/listen.mjs [--scene intro|groove|build|drop|arc60|all]
 *                               [--out shots/audio] [--port N]
 *                               [--no-repeat-check]
 *  --out may be absolute (used as-is) or relative (resolved against jolt/);
 *  the resolved directory is echoed to stderr — never silently rewritten.
 *
 *  exit codes: 0 = rendered + within bounds; 1 = usage/infra failure;
 *              2 = page/console errors during render (report still printed);
 *              3 = repeatability bound violated.
 *
 *  output: <out>/<scene>.wav (44.1kHz 16-bit stereo PCM) + JSON on stdout:
 *    peak dBFS + clip count        target: peak <= -0.5 dBFS, clips = 0
 *                                  (clip = |sample| >= CLIP_AT everywhere)
 *    integrated RMS + 1s timeline  (mid = (L+R)/2; sideRmsDb = RMS of (L-R)/2
 *                                  is reported so anti-phase stereo content
 *                                  cannot hide from the loudness metrics)
 *    section contrast              drop RMS - intro RMS, target >= +6 dB
 *    spectral balance              low <150Hz / mid / high >6kHz energy shares
 *    kick punch                    low-band transient/sustain dB at beat positions
 *    grid alignment                % spectral-flux onsets within 15ms of the
 *                                  16th grid at the scene BPM
 *    repetition (arc60)            max RMS-envelope correlation between distinct
 *                                  ~4-bar windows (near 1.0 = loop fatigue)
 *  targets: each check is true (pass), false (measured and FAILED), or null
 *  (NOT MEASURED — e.g. gridOk for arc60, whose ramping tempo has no single
 *  BPM). null never counts as either verdict downstream.
 *
 *  RENDER ENTRYPOINT CONTRACT (src/game/audio.ts):
 *    const s = new Sound()
 *    s.attachRenderContext(offlineCtx)   // BEFORE start(); builds the real graph
 *    s.setIntensity(i); s.start(); s.renderPump()
 *    ...offlineCtx.suspend(t) → apply timeline events → s.renderPump() → resume()
 *  attachRenderContext puts the Sound in offline mode: start() skips resume()
 *  and the wall-clock scheduler interval; renderPump() runs one lookahead
 *  scheduler pass and is called at every suspension so the sequencer keeps
 *  pace with rendered time. The live path (no injection) is code-identical
 *  except for the offline onended-cleanup skip described above.
 *
 *  All metric functions are exported pure so tests/listen.test.mjs can prove
 *  the instrument honest (silence fails loudness, white noise fails
 *  balance/grid, a click track measures ~100% aligned, WAV round-trips,
 *  repeat-bound comparison counts every LSB).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DB_FLOOR = -120
const db = (v) => (v > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(v)) : DB_FLOOR)

// ---------------------------------------------------------------- WAV codec

/** 16-bit PCM WAV encoder (RIFF/WAVE, format 1). ~40 lines, zero deps. */
export function encodeWav16(int16Interleaved, channels, sampleRate) {
  const blockAlign = channels * 2
  const dataSize = int16Interleaved.length * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)              // fmt chunk size
  buf.writeUInt16LE(1, 20)               // PCM
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * blockAlign, 28)
  buf.writeUInt16LE(blockAlign, 32)
  buf.writeUInt16LE(16, 34)              // bits per sample
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < int16Interleaved.length; i++) buf.writeInt16LE(int16Interleaved[i], 44 + i * 2)
  return buf
}

/** Minimal 16-bit PCM WAV parser (for the round-trip test). */
export function decodeWav16(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file')
  }
  let pos = 12
  let fmt = null
  let data = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const size = buf.readUInt32LE(pos + 4)
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(pos + 8),
        channels: buf.readUInt16LE(pos + 10),
        sampleRate: buf.readUInt32LE(pos + 12),
        bits: buf.readUInt16LE(pos + 22),
      }
    } else if (id === 'data') {
      data = new Int16Array(size / 2)
      for (let i = 0; i < data.length; i++) data[i] = buf.readInt16LE(pos + 8 + i * 2)
    }
    pos += 8 + size + (size % 2)
  }
  if (!fmt || !data) throw new Error('missing fmt/data chunk')
  return { ...fmt, data }
}

// ------------------------------------------------------------- loudness/RMS

/** THE clip threshold, everywhere. A sample counts as clipped at |x| >=
 *  CLIP_AT — one definition shared by peakStats (node side) and the in-page
 *  float-domain measurement (passed into the page via the render spec), so
 *  the instrument cannot disagree with itself about what a clip is. 0.999
 *  rather than 1.0: the graph tops out via tanh saturation, so anything that
 *  close to full scale is already flat-topping even if it never hits 1.0. */
export const CLIP_AT = 0.999

/** Peak level + hard-clip count over float samples. */
export function peakStats(x, clipAt = CLIP_AT) {
  let peak = 0
  let clips = 0
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i])
    if (a > peak) peak = a
    if (a >= clipAt) clips++
  }
  return { peakDb: db(peak), clipCount: clips }
}

/** Integrated RMS in dBFS. */
export function rmsDb(x) {
  if (x.length === 0) return DB_FLOOR
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i] * x[i]
  return db(Math.sqrt(s / x.length))
}

/** RMS per window (default 1s), in dBFS. */
export function rmsTimeline(x, sr, winS = 1) {
  const w = Math.max(1, Math.round(winS * sr))
  const out = []
  for (let start = 0; start + w <= x.length; start += w) {
    let s = 0
    for (let i = start; i < start + w; i++) s += x[i] * x[i]
    out.push(Math.round(db(Math.sqrt(s / w)) * 10) / 10)
  }
  return out
}

// -------------------------------------------------------------------- FFT

/** In-place iterative radix-2 complex FFT. Length must be a power of two. */
export function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < half; k++) {
        const ur = re[i + k]
        const ui = im[i + k]
        const vr = re[i + k + half] * cr - im[i + k + half] * ci
        const vi = re[i + k + half] * ci + im[i + k + half] * cr
        re[i + k] = ur + vr
        im[i + k] = ui + vi
        re[i + k + half] = ur - vr
        im[i + k + half] = ui - vi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

function hannWindow(n) {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  return w
}

// ---------------------------------------------------------- spectral balance

/** Welch-averaged power shares in low (<150Hz) / mid / high (>6kHz) bands.
 *  DC bin excluded. Shares sum to ~1. */
export function bandShares(x, sr, { win = 4096, hop = 2048, lowHz = 150, highHz = 6000 } = {}) {
  const hann = hannWindow(win)
  const re = new Float64Array(win)
  const im = new Float64Array(win)
  const binHz = sr / win
  let low = 0
  let mid = 0
  let high = 0
  for (let start = 0; start + win <= x.length; start += hop) {
    for (let i = 0; i < win; i++) { re[i] = x[start + i] * hann[i]; im[i] = 0 }
    fft(re, im)
    for (let k = 1; k < win / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k]
      const f = k * binHz
      if (f < lowHz) low += p
      else if (f > highHz) high += p
      else mid += p
    }
  }
  const total = low + mid + high
  if (total <= 0) return { low: 0, mid: 0, high: 0 }
  return { low: low / total, mid: mid / total, high: high / total }
}

// ------------------------------------------------------------ onset detection

/** Spectral-flux onset detector: STFT (1024/256 hann), positive flux, local
 *  adaptive peak-pick, 30ms minimum gap. Returns onset times in seconds. */
export function detectOnsets(x, sr, { win = 1024, hop = 256 } = {}) {
  const nFrames = Math.floor((x.length - win) / hop) + 1
  if (nFrames < 5) return []
  const hann = hannWindow(win)
  const re = new Float64Array(win)
  const im = new Float64Array(win)
  const half = win / 2
  let prev = null
  const flux = new Float64Array(nFrames)
  for (let f = 0; f < nFrames; f++) {
    const start = f * hop
    for (let i = 0; i < win; i++) { re[i] = x[start + i] * hann[i]; im[i] = 0 }
    fft(re, im)
    const mag = new Float64Array(half)
    let fl = 0
    for (let k = 0; k < half; k++) {
      mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k])
      if (prev) { const d = mag[k] - prev[k]; if (d > 0) fl += d }
    }
    flux[f] = prev ? fl : 0
    prev = mag
  }
  let max = 0
  for (let f = 0; f < nFrames; f++) if (flux[f] > max) max = flux[f]
  if (max <= 0) return []
  for (let f = 0; f < nFrames; f++) flux[f] /= max
  const onsets = []
  const minGapFrames = Math.ceil((0.03 * sr) / hop)
  let lastFrame = -minGapFrames
  const L = 10 // local-mean half-window
  for (let f = 2; f < nFrames - 2; f++) {
    if (flux[f] <= flux[f - 1] || flux[f] < flux[f + 1]) continue
    let s = 0
    let n = 0
    for (let k = Math.max(0, f - L); k <= Math.min(nFrames - 1, f + L); k++) { s += flux[k]; n++ }
    const localMean = s / n
    if (flux[f] < localMean * 1.5 + 0.03) continue
    if (f - lastFrame < minGapFrames) continue
    lastFrame = f
    onsets.push((f * hop + win / 2) / sr)
  }
  return onsets
}

/** Alignment of onsets against a uniform grid at `bpm` (subdiv=4 → 16ths),
 *  phase estimated by circular mean (the render's absolute offset is not the
 *  question — whether onsets share ONE grid is). Returns the % within tolMs. */
export function gridAlign(onsetTimes, bpm, subdiv = 4, tolMs = 15) {
  const step = 60 / bpm / subdiv
  const n = onsetTimes.length
  if (n === 0) return { pct: 0, onsets: 0, stepMs: Math.round(step * 1000 * 10) / 10, tolMs }
  let sx = 0
  let sy = 0
  for (const t of onsetTimes) {
    const a = (2 * Math.PI * (t % step)) / step
    sx += Math.cos(a)
    sy += Math.sin(a)
  }
  const phase = ((Math.atan2(sy, sx) / (2 * Math.PI)) * step + step) % step
  let hits = 0
  const tol = tolMs / 1000
  for (const t of onsetTimes) {
    let d = ((t - phase) % step + step) % step
    if (d > step / 2) d -= step
    if (Math.abs(d) <= tol) hits++
  }
  return { pct: Math.round((100 * hits) / n * 10) / 10, onsets: n, stepMs: Math.round(step * 1000 * 10) / 10, tolMs }
}

// ---------------------------------------------------------------- kick punch

/** RBJ biquad lowpass, cascaded `passes` times. Returns a new array. */
export function lowpassFilter(x, sr, fc, passes = 2, q = Math.SQRT1_2) {
  const w0 = (2 * Math.PI * fc) / sr
  const alpha = Math.sin(w0) / (2 * q)
  const cw = Math.cos(w0)
  const b0 = (1 - cw) / 2
  const b1 = 1 - cw
  const b2 = (1 - cw) / 2
  const a0 = 1 + alpha
  const a1 = -2 * cw
  const a2 = 1 - alpha
  let src = x
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(src.length)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0
    for (let i = 0; i < src.length; i++) {
      const xi = src[i]
      const yi = (b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
      out[i] = yi
      x2 = x1; x1 = xi; y2 = y1; y1 = yi
    }
    src = out
  }
  return src
}

/** Kick punch: low-band (<150Hz) transient-to-sustain ratio at beat positions.
 *  Beat phase is found by scanning the offset that maximises low-band energy
 *  in the attack window; punch per beat = dB(peak of first 60ms / mean of
 *  150ms..min(beat,350ms)); returns the median across beats. */
export function kickPunch(x, sr, bpm) {
  const low = lowpassFilter(x, sr, 150, 2)
  // 5ms-smoothed rectified envelope
  const smooth = Math.max(1, Math.round(0.005 * sr))
  const env = new Float32Array(low.length)
  let acc = 0
  for (let i = 0; i < low.length; i++) {
    acc += Math.abs(low[i])
    if (i >= smooth) acc -= Math.abs(low[i - smooth])
    env[i] = acc / smooth
  }
  const beat = 60 / bpm
  const beatN = Math.round(beat * sr)
  const nBeats = Math.floor(low.length / beatN) - 1
  if (nBeats < 4) return null
  const atkN = Math.round(0.04 * sr)
  let bestOff = 0
  let bestScore = -1
  for (let off = 0; off < beatN; off += Math.round(0.005 * sr)) {
    let s = 0
    for (let b = 0; b < nBeats; b++) {
      const t0 = b * beatN + off
      for (let i = t0; i < Math.min(t0 + atkN, env.length); i += 8) s += env[i]
    }
    if (s > bestScore) { bestScore = s; bestOff = off }
  }
  const punches = []
  const peakN = Math.round(0.06 * sr)
  const susA = Math.round(0.15 * sr)
  const susB = Math.min(beatN - Math.round(0.01 * sr), Math.round(0.35 * sr))
  for (let b = 0; b < nBeats; b++) {
    const t0 = b * beatN + bestOff
    let pk = 0
    for (let i = t0; i < Math.min(t0 + peakN, env.length); i++) if (env[i] > pk) pk = env[i]
    let s = 0
    let n = 0
    for (let i = t0 + susA; i < Math.min(t0 + susB, env.length); i++) { s += env[i]; n++ }
    if (n === 0 || pk <= 0) continue
    punches.push(20 * Math.log10(pk / (s / n + 1e-9)))
  }
  if (punches.length === 0) return null
  punches.sort((a, b) => a - b)
  return Math.round(punches[Math.floor(punches.length / 2)] * 10) / 10
}

// ---------------------------------------------------------------- repetition

/** Loop-fatigue measure: RMS envelope (50ms hops), split into non-overlapping
 *  windows of `windowS` seconds, max normalized correlation between distinct
 *  windows. Near 1.0 = the arc is a photocopied loop. */
export function repetitionScore(x, sr, windowS) {
  const hopN = Math.round(0.05 * sr)
  const env = []
  for (let start = 0; start + hopN <= x.length; start += hopN) {
    let s = 0
    for (let i = start; i < start + hopN; i++) s += x[i] * x[i]
    env.push(Math.sqrt(s / hopN))
  }
  const W = Math.round(windowS / 0.05)
  const k = Math.floor(env.length / W)
  if (k < 2) return null
  const segs = []
  for (let s = 0; s < k; s++) {
    const seg = env.slice(s * W, (s + 1) * W)
    const mean = seg.reduce((a, b) => a + b, 0) / W
    const c = seg.map((v) => v - mean)
    const norm = Math.sqrt(c.reduce((a, b) => a + b * b, 0))
    segs.push({ c, norm })
  }
  let max = 0
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      if (segs[i].norm === 0 || segs[j].norm === 0) continue
      let dot = 0
      for (let m = 0; m < W; m++) dot += segs[i].c[m] * segs[j].c[m]
      const corr = dot / (segs[i].norm * segs[j].norm)
      if (corr > max) max = corr
    }
  }
  return Math.round(max * 1000) / 1000
}

// ------------------------------------------------------------------ targets

/** Pass/fail against the produced-track targets. The instrument's honesty
 *  tests depend on these staying strict: silence must fail loudness, white
 *  noise must fail balance and grid.
 *
 *  Three-valued: true = measured and passed, false = measured and FAILED,
 *  null = NOT MEASURED (metric absent — e.g. grid for arc60, which has no
 *  single BPM). A scene must never be reported as failing a check that was
 *  never run. */
export function evaluateTargets(m) {
  const loudnessOk = m.peakDb <= -0.5 && m.clipCount === 0 && m.rmsDb >= -35
  const balanceOk = (m.bands === null || m.bands === undefined) ? null
    : m.bands.low >= 0.08 && m.bands.low <= 0.60
      && m.bands.mid >= 0.25
      && m.bands.high >= 0.015 && m.bands.high <= 0.35
  const gridOk = (m.grid === null || m.grid === undefined) ? null
    : m.grid.onsets >= 8 && m.grid.pct >= 60
  return { loudnessOk, balanceOk, gridOk }
}

// -------------------------------------------------------------- repeatability

/** The enforced repeat-render agreement bound (see the header for the two
 *  root-caused drift sources). Measured after the onended fix: max delta
 *  1 LSB on ~0.02% of samples; the bound leaves headroom below the OLD broken
 *  behavior (4 LSB / 1.25%) so a regression trips it immediately. */
export const REPEAT_BOUND = { maxDeltaLsb: 2, maxDiffPct: 0.2 }

/** Sample-exact comparison of two Int16 PCM streams (any interleaving).
 *  Counts every differing sample, the max |delta| in LSB, and where the first
 *  divergence sits. Throws on length mismatch — that is never "close enough". */
export function comparePcm16(a, b) {
  if (a.length !== b.length) throw new Error(`PCM length mismatch: ${a.length} vs ${b.length}`)
  let diffCount = 0
  let maxDeltaLsb = 0
  let firstDiff = -1
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    if (d > 0) {
      diffCount++
      if (d > maxDeltaLsb) maxDeltaLsb = d
      if (firstDiff < 0) firstDiff = i
    }
  }
  return {
    samples: a.length,
    diffCount,
    diffPct: a.length ? Math.round((10000 * diffCount) / a.length) / 100 : 0,
    maxDeltaLsb,
    firstDiff,
  }
}

/** Does a comparePcm16 result sit within the repeat bound? */
export function withinRepeatBound(stats, bound = REPEAT_BOUND) {
  return stats.maxDeltaLsb <= bound.maxDeltaLsb && stats.diffPct <= bound.maxDiffPct
}

// ---------------------------------------------------------------- scene DSL
// Each scene: seconds, intensity (or ramp), the BPM the fixed-intensity bed
// runs at (96 + 84*i — audio.ts's standalone tempo law), a deterministic seed
// (Math.random is replaced in-page with a seeded PRNG), and a timeline of
// events {t, k: say|correct|wrong|drop, ...} the renderer feeds to the Sound.

const LABELS = ['TAP IT', 'SWIPE LEFT', 'SWIPE RIGHT', 'FLICK UP', 'HOLD IT', 'SHAKE IT', 'PULL DOWN', 'TWIST IT']

export function buildScenes() {
  const scenes = {}

  {
    // Sparse opening: half-time heartbeat, no bass, occasional slow answers.
    const events = []
    let streak = 0
    for (let t = 1.4; t < 10.8; t += 2.2) {
      events.push({ t, k: 'say', label: LABELS[streak % LABELS.length], rate: 0.02 })
      events.push({ t: t + 0.7, k: 'correct', streak: ++streak, perfect: false, chain: 0 })
    }
    scenes.intro = { name: 'intro', seconds: 12, intensity: 0.02, bpm: 96 + 84 * 0.02, seed: 11, events }
  }

  {
    // Mid-run groove: steady answers, perfect chains kept under 10 (no drop).
    const events = []
    let streak = 0
    let chain = 0
    for (let t = 0.8; t < 15.2; t += 0.9) {
      events.push({ t, k: 'say', label: LABELS[streak % LABELS.length], rate: 0.5 })
      const perfect = streak % 3 !== 2
      chain = perfect ? Math.min(9, chain + 1) : 0
      events.push({ t: t + 0.3, k: 'correct', streak: ++streak, perfect, chain })
    }
    scenes.groove = { name: 'groove', seconds: 16, intensity: 0.5, bpm: 96 + 84 * 0.5, seed: 22, events }
  }

  {
    // A queued drop: one-bar build (riser, snare roll, bass tacet) → DROP.
    const events = [{ t: 2.6, k: 'drop' }]
    let streak = 0
    for (let t = 0.7; t < 11.3; t += 1.1) {
      events.push({ t, k: 'say', label: LABELS[streak % LABELS.length], rate: 0.4 })
      const perfect = streak % 2 === 0
      events.push({ t: t + 0.35, k: 'correct', streak: ++streak, perfect, chain: perfect ? Math.min(9, streak >> 1) : 0 })
    }
    scenes.build = { name: 'build', seconds: 12, intensity: 0.4, bpm: 96 + 84 * 0.4, seed: 33, events }
  }

  {
    // Endgame heat: high intensity, a drop early, perfect chain to 15.
    const events = [{ t: 0.6, k: 'drop' }]
    let chain = 0
    for (let t = 0.5; t < 15.2; t += 0.62) {
      chain = Math.min(15, chain + 1)
      events.push({ t, k: 'say', label: LABELS[chain % LABELS.length], rate: 0.85 })
      events.push({ t: t + 0.22, k: 'correct', streak: chain, perfect: true, chain })
    }
    scenes.drop = { name: 'drop', seconds: 16, intensity: 0.85, bpm: 96 + 84 * 0.85, seed: 44, events }
  }

  {
    // A whole run in miniature: intensity ramps 0 → 0.98 over 48s, answer
    // cadence accelerates, perfect chains climb past 10 (earning drops), two
    // misses (the second onto the final life queues the clutch drop).
    const events = []
    const wrongs = [22.1, 42.1]
    let wi = 0
    let streak = 0
    let chain = 0
    let n = 0
    let t = 1.5
    while (t < 58.5) {
      if (wi < wrongs.length && t >= wrongs[wi]) {
        events.push({ t: wrongs[wi], k: 'wrong', lives: wi === 0 ? 2 : 1 })
        chain = 0
        streak = 0
        wi++
      }
      const i = Math.min(0.98, t / 48)
      events.push({ t, k: 'say', label: LABELS[n % LABELS.length], rate: i })
      const perfect = n % 13 !== 0
      chain = perfect ? chain + 1 : 0
      events.push({ t: t + 0.28, k: 'correct', streak: ++streak, perfect, chain })
      n++
      t += 1.6 - 1.05 * Math.min(1, t / 50)
    }
    scenes.arc60 = { name: 'arc60', seconds: 60, intensity: 0, ramp: { t1: 48, max: 0.98 }, bpm: null, seed: 55, events }
  }

  return scenes
}

// -------------------------------------------------------- in-page rendering

/** Runs inside Chromium. Injects an OfflineAudioContext into the REAL Sound,
 *  drives the scripted timeline at suspend points, returns 16-bit PCM as
 *  base64 plus float-domain peak/clip stats (measured pre-quantisation). */
async function renderInPage(spec) {
  // Deterministic renders: seed Math.random (noise buffers, reverb impulse,
  // phrase picks all flow through it).
  let seed = spec.seed >>> 0
  Math.random = function seeded() {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const mod = await import('/src/game/audio.ts')
  const sr = 44100
  const ctx = new OfflineAudioContext(2, Math.ceil(spec.seconds * sr), sr)
  const s = new mod.Sound()
  s.attachRenderContext(ctx)
  s.setIntensity(spec.ramp ? Math.min(spec.ramp.max, 0) : spec.intensity)
  s.start()
  s.renderPump()
  const events = spec.events.slice().sort((a, b) => a.t - b.t)
  let ei = 0
  const apply = (e) => {
    if (e.k === 'say') s.say(e.label, e.rate)
    else if (e.k === 'correct') s.correct(e.streak, e.perfect, e.chain)
    else if (e.k === 'wrong') s.wrong(e.lives)
    else if (e.k === 'drop') s.queueDrop()
  }
  const dt = 0.03
  const nSus = Math.floor((spec.seconds - 0.05) / dt)
  for (let k = 1; k <= nSus; k++) {
    const t = k * dt
    ctx.suspend(t).then(() => {
      while (ei < events.length && events[ei].t <= t) apply(events[ei++])
      if (spec.ramp) s.setIntensity(Math.min(spec.ramp.max, t / spec.ramp.t1))
      s.renderPump()
      ctx.resume()
    })
  }
  const buf = await ctx.startRendering()
  const L = buf.getChannelData(0)
  const R = buf.getChannelData(1)
  let peak = 0
  let clips = 0
  const clipAt = spec.clipAt // single definition: CLIP_AT, passed in the spec
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i])
    const b = Math.abs(R[i])
    const m = a > b ? a : b
    if (m > peak) peak = m
    if (m >= clipAt) clips++
  }
  const i16 = new Int16Array(L.length * 2)
  for (let i = 0; i < L.length; i++) {
    i16[i * 2] = Math.round(Math.max(-1, Math.min(1, L[i])) * 32767)
    i16[i * 2 + 1] = Math.round(Math.max(-1, Math.min(1, R[i])) * 32767)
  }
  const u8 = new Uint8Array(i16.buffer)
  let b64 = ''
  const CH = 32769 // multiple of 3, so per-chunk btoa concatenates cleanly
  for (let i = 0; i < u8.length; i += CH) {
    b64 += btoa(String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length))))
  }
  return { b64, sr, frames: L.length, peakDb: peak > 0 ? 20 * Math.log10(peak) : -120, clipCount: clips }
}

// ------------------------------------------------------------------- runner

async function main() {
  const { chromium } = await import('playwright')
  const { spawn } = await import('node:child_process')
  const { setTimeout: sleep } = await import('node:timers/promises')
  const net = (await import('node:net')).default

  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
  const flag = (n) => process.argv.includes(`--${n}`)
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  // Absolute --out is honored verbatim; relative resolves against jolt/. The
  // resolved path is echoed below so it is never silently rewritten.
  const outDir = resolve(root, arg('out', 'shots/audio'))
  const PORT = Number(arg('port', String(5200 + Math.floor(Math.random() * 700))))
  const scenes = buildScenes()
  const which = arg('scene', 'all')
  const names = which === 'all' ? Object.keys(scenes) : which.split(',')
  for (const n of names) if (!scenes[n]) { console.error(`unknown scene "${n}" (have: ${Object.keys(scenes).join(', ')})`); process.exit(1) }

  const portOpen = (p) => new Promise((r) => {
    const s = net.connect(p, '127.0.0.1')
    const d = (ok) => { s.destroy(); r(ok) }
    s.once('connect', () => d(true)); s.once('error', () => d(false)); s.setTimeout(800, () => d(false))
  })
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let up = false
  for (let i = 0; i < 40 && !up; i++) { up = await portOpen(PORT); if (!up) await sleep(500) }
  if (!up) { server.kill(); throw new Error('vite failed to start') }

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()))
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
  await sleep(800)

  mkdirSync(outDir, { recursive: true })
  console.error(`writing WAVs to ${outDir}`)
  const report = { scenes: {}, pageErrors }

  /** One in-page render → interleaved Int16 PCM + in-page float stats. */
  const renderOnce = async (spec) => {
    const r = await page.evaluate(renderInPage, { ...spec, clipAt: CLIP_AT })
    const raw = Buffer.from(r.b64, 'base64')
    const bytes = new Uint8Array(raw.length)
    bytes.set(raw)
    return { ...r, i16: new Int16Array(bytes.buffer) }
  }

  const firstRender = {}   // name → Int16Array, kept for the repeat check
  for (const name of names) {
    const spec = scenes[name]
    const t0 = Date.now()
    const r = await renderOnce(spec)
    const i16 = r.i16
    firstRender[name] = i16
    const mono = new Float32Array(r.frames)
    const side = new Float32Array(r.frames)
    for (let i = 0; i < r.frames; i++) {
      mono[i] = (i16[i * 2] + i16[i * 2 + 1]) / 2 / 32768
      side[i] = (i16[i * 2] - i16[i * 2 + 1]) / 2 / 32768
    }
    const wavPath = join(outDir, `${name}.wav`)
    writeFileSync(wavPath, encodeWav16(i16, 2, r.sr))

    const m = {
      wav: wavPath,
      seconds: spec.seconds,
      bpm: spec.bpm === null ? null : Math.round(spec.bpm * 10) / 10,
      peakDb: Math.round(r.peakDb * 100) / 100,
      clipCount: r.clipCount,
      rmsDb: Math.round(rmsDb(mono) * 100) / 100,
      // Anti-phase watchdog: loudness/balance run on the (L+R)/2 mid signal,
      // which is blind to out-of-phase stereo content. sideRmsDb reports the
      // (L-R)/2 energy so a mid/side-broken mix shows up in the JSON instead
      // of vanishing. For this mostly-mono graph it sits far below rmsDb.
      sideRmsDb: Math.round(rmsDb(side) * 100) / 100,
      rmsTimeline: rmsTimeline(mono, r.sr, 1),
      bands: (() => { const b = bandShares(mono, r.sr); return { low: Math.round(b.low * 1000) / 1000, mid: Math.round(b.mid * 1000) / 1000, high: Math.round(b.high * 1000) / 1000 } })(),
      // null = not measured (no single BPM), never reported as failed.
      grid: spec.bpm === null ? null : gridAlign(detectOnsets(mono, r.sr), spec.bpm, 4, 15),
      kickPunchDb: spec.bpm === null ? null : kickPunch(mono, r.sr, spec.bpm),
      renderMs: Date.now() - t0,
    }
    if (name === 'arc60') {
      // ~4 bars at the arc's mid tempo (138 BPM): 4 * 4 * 60/138 ≈ 6.96s
      m.repetition = repetitionScore(mono, r.sr, 6.96)
    }
    m.targets = evaluateTargets(m)
    report.scenes[name] = m
    console.error(`rendered ${name}: ${spec.seconds}s in ${m.renderMs}ms -> ${wavPath}`)
  }

  if (report.scenes.drop && report.scenes.intro) {
    report.contrastDb = Math.round((report.scenes.drop.rmsDb - report.scenes.intro.rmsDb) * 100) / 100
    report.contrastOk = report.contrastDb >= 6
  }

  // Repeatability self-check: re-render one scene and hold the two PCM
  // streams to REPEAT_BOUND, so drift can never grow silently past what the
  // header documents. Prefers drop (busiest graph = most drift-prone).
  if (!flag('no-repeat-check')) {
    const detName = names.includes('drop') ? 'drop' : names[0]
    const t0 = Date.now()
    const again = await renderOnce(scenes[detName])
    const stats = comparePcm16(firstRender[detName], again.i16)
    report.repeatability = {
      scene: detName,
      ...stats,
      bound: REPEAT_BOUND,
      ok: withinRepeatBound(stats),
      renderMs: Date.now() - t0,
    }
    console.error(`repeat check (${detName}): ${stats.diffCount}/${stats.samples} samples differ `
      + `(${stats.diffPct}%), max ${stats.maxDeltaLsb} LSB -> ${report.repeatability.ok ? 'within bound' : 'BOUND VIOLATED'}`)
  }

  await browser.close()
  server.kill()
  console.log(JSON.stringify(report, null, 2))
  // Loud exits (see header): page errors and bound violations must be visible
  // to exit-status-gated automation, not only to a human reading the JSON.
  let code = 0
  if (report.repeatability && !report.repeatability.ok) {
    console.error(`LISTEN: repeatability bound violated (max ${report.repeatability.maxDeltaLsb} LSB on `
      + `${report.repeatability.diffPct}% of samples; bound ${REPEAT_BOUND.maxDeltaLsb} LSB / ${REPEAT_BOUND.maxDiffPct}%)`)
    code = 3
  }
  if (pageErrors.length > 0) {
    console.error(`LISTEN: ${pageErrors.length} page/console error(s) during render:`)
    for (const e of pageErrors) console.error(`  ${e}`)
    code = 2
  }
  process.exit(code)   // vite's pipes would otherwise hold the event loop open
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) await main()
