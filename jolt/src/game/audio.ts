/** OWNER: audio agent. This genre is carried by SOUND — get this right and the
 *  game works even with plain visuals.
 *
 *  Zero sample files: commands are spoken via the built-in Web Speech API, and
 *  every musical element is synthesised with WebAudio.
 *
 *  Architecture
 *  ------------
 *  - A lookahead scheduler (25ms poll, 120ms horizon) sequences a 16-step
 *    music bed whose tempo, layer count, filter brightness and KEY all rise
 *    with intensity (0..1). Layers: kick → hats → bassline → backbeat snare →
 *    driven double-time. The whole bed shifts up through a minor scale as the
 *    run escalates, so the pitch of the room literally rises with your pulse.
 *  - Every command lands with a per-action EARCON (a distinctive synthesised
 *    signature: swipes sweep and pan in their direction, SHAKE trills, TWIST
 *    bends, DO NOTHING is a flat low buzz). Speech accompanies the earcon
 *    while windows are long; once windows drop near speech duration the voice
 *    steps aside and the earcons — which the player has been hearing since
 *    command one — carry meaning alone. Speech therefore never lags or piles
 *    up at 500ms windows.
 *  - Speech is actively managed: a deliberately ranked voice, rate/pitch that
 *    climb with intensity, cancel-before-speak with a deferred re-speak (the
 *    Chrome cancel→speak-drops-the-utterance bug), and an instant drop to
 *    earcon-only if the engine is still speaking when the next command lands.
 *  - A ticking countdown tracks each response window and accelerates toward
 *    the deadline; it is cancelled the moment the command resolves.
 *  - After every resolution an anticipation pickup (two rising ticks) is
 *    scheduled to land just before the next command, so the player can time
 *    themselves like a sprinter on the blocks.
 *  - Node hygiene: every one-shot source disconnects itself (and its
 *    envelope/filter chain) in onended, so hour-long sessions do not
 *    accumulate nodes. The only persistent nodes are the bus/drone graph.
 *  - Autoplay: the AudioContext is only created/resumed inside start(), which
 *    the shell calls from a user gesture; every method guards on ctx.
 */

/** Approximate response window (ms) for a given intensity — mirrors the shape
 *  of the difficulty ramp without importing the (in-flux) commands module.
 *  Only used to pace the countdown pulse, so approximation is fine: the pulse
 *  is cancelled on resolve anyway. */
const WIN_EST: Array<[number, number]> = [
  [0, 1700], [0.05, 1050], [0.11, 700], [0.21, 580],
  [0.35, 522], [0.47, 402], [0.78, 330], [1, 264],
]
function estWindowMs(i: number): number {
  const x = Math.min(1, Math.max(0, i))
  for (let k = 1; k < WIN_EST.length; k++) {
    const [x1, y1] = WIN_EST[k - 1]
    const [x2, y2] = WIN_EST[k]
    if (x <= x2) return y1 + (y2 - y1) * ((x - x1) / (x2 - x1))
  }
  return 264
}

/** Engine's resolve gap (pause before the next command), estimated from
 *  intensity: 420ms shrinking to 140ms, ×1.6 after a mistake. */
function estGapMs(i: number, afterMistake: boolean): number {
  const g = 420 - 280 * Math.min(1, Math.max(0, i))
  return afterMistake ? g * 1.6 : g
}

/** Ranked voice preference: local, characterful English voices first. */
const VOICE_RANK = [
  'daniel', 'google uk english male', 'alex', 'fred', 'aaron',
  'google us english', 'samantha', 'karen', 'moira', 'tessa', 'catherine',
]

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null
  let bestScore = -Infinity
  for (const v of voices) {
    const lang = (v.lang || '').toLowerCase()
    const name = (v.name || '').toLowerCase()
    let score = 0
    if (lang.startsWith('en')) score += 40
    else score -= 100                       // only fall to non-English if nothing else
    if (v.localService) score += 20         // no network latency mid-panic
    const rank = VOICE_RANK.findIndex((r) => name.includes(r))
    if (rank >= 0) score += 100 - rank * 5
    if (v.default) score += 2
    if (score > bestScore) { bestScore = score; best = v }
  }
  return best
}

/** Intensity above which speech is dropped entirely in favour of earcons
 *  (windows ~<420ms — shorter than a two-word utterance). */
const EARCON_ONLY_AT = 0.5

export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private comp: DynamicsCompressorNode | null = null
  private musicBus: GainNode | null = null
  private fxBus: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null

  // Persistent drone pad (two detuned saws through a lowpass that opens with
  // intensity). Built once per context; parameters automated, never re-created.
  private droneA: OscillatorNode | null = null
  private droneB: OscillatorNode | null = null
  private droneFilter: BiquadFilterNode | null = null
  private droneGain: GainNode | null = null

  // Sequencer state.
  private schedulerId: number | null = null
  private nextNoteTime = 0
  private step = 0
  private beatOn = false
  private intensityV = 0

  // One-shot sources that may need cancelling early (countdown + anticipation).
  private pending: AudioScheduledSourceNode[] = []

  // Speech state.
  private voice: SpeechSynthesisVoice | null = null
  private voicesHooked = false
  private speakTimer: number | null = null

  muted = false

  /** Must be called from a user gesture — iOS blocks audio otherwise.
   *  Safe to call again at the start of every run: it resumes the context and
   *  restarts the music bed from a calm state. */
  start(): void {
    if (!this.ctx) {
      const AC = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.ctx = new AC()
      this.buildGraph()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    this.chooseVoice()
    this.cancelPending()
    // (Re)arm the bed.
    this.step = 0
    this.nextNoteTime = this.ctx.currentTime + 0.06
    this.beatOn = true
    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime)
      this.musicBus.gain.setValueAtTime(0.0001, this.ctx.currentTime)
      this.musicBus.gain.exponentialRampToValueAtTime(0.85, this.ctx.currentTime + 0.5)
    }
    if (this.droneGain && this.droneFilter && this.droneA && this.droneB) {
      const t = this.ctx.currentTime
      this.droneA.frequency.cancelScheduledValues(t)
      this.droneB.frequency.cancelScheduledValues(t)
      this.droneA.frequency.setValueAtTime(110, t)
      this.droneB.frequency.setValueAtTime(110 * 1.006, t)
      this.droneFilter.frequency.setValueAtTime(220, t)
      this.droneGain.gain.setValueAtTime(0.0001, t)
      this.droneGain.gain.exponentialRampToValueAtTime(0.05, t + 1.2)
    }
    if (this.schedulerId === null) {
      this.schedulerId = window.setInterval(() => this.schedule(), 25)
    }
  }

  private buildGraph(): void {
    const ctx = this.ctx!
    this.master = ctx.createGain()
    this.master.gain.value = 0.6
    this.comp = ctx.createDynamicsCompressor()
    this.comp.threshold.value = -18
    this.comp.knee.value = 24
    this.comp.ratio.value = 5
    this.comp.attack.value = 0.003
    this.comp.release.value = 0.18
    this.master.connect(this.comp).connect(ctx.destination)

    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = 0.85
    this.musicBus.connect(this.master)
    this.fxBus = ctx.createGain()
    this.fxBus.gain.value = 1
    this.fxBus.connect(this.master)

    // Shared half-second white-noise buffer for hats/snares/crashes.
    const len = Math.floor(ctx.sampleRate * 0.5)
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let k = 0; k < len; k++) d[k] = Math.random() * 2 - 1

    // Drone pad.
    this.droneA = ctx.createOscillator()
    this.droneB = ctx.createOscillator()
    this.droneA.type = 'sawtooth'
    this.droneB.type = 'sawtooth'
    this.droneA.frequency.value = 110
    this.droneB.frequency.value = 110 * 1.006
    this.droneFilter = ctx.createBiquadFilter()
    this.droneFilter.type = 'lowpass'
    this.droneFilter.frequency.value = 220
    this.droneFilter.Q.value = 1.1
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0.0001
    this.droneA.connect(this.droneFilter)
    this.droneB.connect(this.droneFilter)
    this.droneFilter.connect(this.droneGain).connect(this.musicBus)
    this.droneA.start()
    this.droneB.start()
  }

  // ---------------------------------------------------------------- helpers

  /** One-shot source with self-cleanup: everything in `chain` disconnects when
   *  the source ends, so long sessions never accumulate nodes. */
  private fire(src: AudioScheduledSourceNode, chain: AudioNode[], stopAt: number, cancellable = false): void {
    src.onended = () => {
      src.disconnect()
      for (const n of chain) n.disconnect()
      if (cancellable) {
        const ix = this.pending.indexOf(src)
        if (ix >= 0) this.pending.splice(ix, 1)
      }
    }
    src.stop(stopAt)
    if (cancellable) this.pending.push(src)
  }

  private cancelPending(): void {
    for (const src of this.pending.splice(0)) {
      try { src.stop() } catch { /* already stopped */ }
    }
  }

  /** A single enveloped oscillator note. */
  private note(opts: {
    at?: number; freq: number; endFreq?: number; durMs: number
    type?: OscillatorType; gain?: number; pan?: number
    dest?: AudioNode | null; cancellable?: boolean; attackMs?: number
  }): void {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const t = Math.max(ctx.currentTime, opts.at ?? ctx.currentTime)
    const dur = opts.durMs / 1000
    const o = ctx.createOscillator()
    o.type = opts.type ?? 'sine'
    o.frequency.setValueAtTime(opts.freq, t)
    if (opts.endFreq !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t + dur)
    const g = ctx.createGain()
    const atk = (opts.attackMs ?? 6) / 1000
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, t + atk)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const chain: AudioNode[] = [g]
    let tail: AudioNode = g
    o.connect(g)
    if (opts.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner()
      p.pan.value = opts.pan
      tail.connect(p)
      tail = p
      chain.push(p)
    }
    tail.connect(opts.dest ?? this.fxBus ?? this.master!)
    o.start(t)
    this.fire(o, chain, t + dur + 0.05, opts.cancellable)
  }

  /** Filtered noise burst (hats, snares, impacts). */
  private noise(opts: {
    at?: number; durMs: number; gain?: number
    filter?: BiquadFilterType; freq?: number; endFreq?: number; q?: number
    dest?: AudioNode | null
  }): void {
    if (!this.ctx || !this.noiseBuf || this.muted) return
    const ctx = this.ctx
    const t = Math.max(ctx.currentTime, opts.at ?? ctx.currentTime)
    const dur = opts.durMs / 1000
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = opts.filter ?? 'highpass'
    f.frequency.setValueAtTime(opts.freq ?? 6000, t)
    if (opts.endFreq !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(30, opts.endFreq), t + dur)
    f.Q.value = opts.q ?? 0.8
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(opts.dest ?? this.fxBus ?? this.master!)
    src.start(t)
    this.fire(src, [f, g], t + dur + 0.05)
  }

  // ------------------------------------------------------------- sequencer

  private bpm(): number {
    return 96 + 84 * this.intensityV   // 96 → 180
  }

  /** Semitone key shift rises through a minor scale with intensity. */
  private keyShift(): number {
    const steps = [0, 2, 3, 5, 7]
    return steps[Math.min(steps.length - 1, Math.floor(this.intensityV * steps.length))]
  }

  private schedule(): void {
    if (!this.ctx || !this.beatOn) return
    const horizon = this.ctx.currentTime + 0.12
    while (this.nextNoteTime < horizon) {
      if (!this.muted) this.scheduleStep(this.step, this.nextNoteTime)
      this.nextNoteTime += 60 / this.bpm() / 4   // one 16th note
      this.step = (this.step + 1) % 16
    }
  }

  private scheduleStep(step: number, t: number): void {
    const i = this.intensityV
    const bus = this.musicBus
    const root = 55 * Math.pow(2, this.keyShift() / 12)

    // Kick: quarters always; a driving extra hit late.
    if (step % 4 === 0) this.kick(t, 0.42)
    if (i >= 0.72 && step === 14) this.kick(t, 0.3)

    // Hats: off-beat 8ths from low intensity, 16ths once the pressure is on.
    if (i >= 0.1 && step % 4 === 2) {
      this.noise({ at: t, durMs: 40, gain: 0.055 + i * 0.03, filter: 'highpass', freq: 7000, dest: bus })
    }
    if (i >= 0.5 && step % 2 === 1) {
      this.noise({ at: t, durMs: 26, gain: 0.035, filter: 'highpass', freq: 9000, dest: bus })
    }

    // Backbeat snare.
    if (i >= 0.38 && (step === 4 || step === 12)) {
      this.noise({ at: t, durMs: 110, gain: 0.14, filter: 'bandpass', freq: 1900, q: 0.9, dest: bus })
      this.note({ at: t, freq: 240, endFreq: 170, durMs: 70, type: 'triangle', gain: 0.1, dest: bus })
    }

    // Bassline: 8th-note minor riff; doubles to 16ths near the top.
    if (i >= 0.26) {
      const riff = [0, 12, 0, 10, 0, 12, 7, 10]
      const play = (tt: number, gg: number) => {
        const semis = riff[Math.floor(step / 2) % riff.length]
        this.note({
          at: tt, freq: root * Math.pow(2, semis / 12), durMs: 105,
          type: 'square', gain: gg, dest: bus, attackMs: 3,
        })
      }
      if (step % 2 === 0) play(t, 0.085 + i * 0.05)
      else if (i >= 0.62) play(t, 0.05)
    }
  }

  private kick(t: number, gain: number): void {
    this.note({ at: t, freq: 155, endFreq: 44, durMs: 100, type: 'sine', gain, dest: this.musicBus, attackMs: 2 })
  }

  /** Briefly duck the music bed (under speech, or hard after a failure). */
  private duck(to: number, holdS: number): void {
    if (!this.ctx || !this.musicBus) return
    const t = this.ctx.currentTime
    const g = this.musicBus.gain
    g.cancelScheduledValues(t)
    g.setTargetAtTime(0.85 * to, t, 0.03)
    g.setTargetAtTime(0.85, t + holdS, 0.25)
  }

  // ----------------------------------------------------------------- voice

  private chooseVoice(): void {
    if (typeof speechSynthesis === 'undefined') return
    const pickNow = () => { this.voice = pickVoice(speechSynthesis.getVoices()) }
    pickNow()
    if (!this.voice && !this.voicesHooked) {
      this.voicesHooked = true
      try { speechSynthesis.addEventListener('voiceschanged', pickNow) } catch { /* older engines */ }
    }
  }

  /** Speak a command. `rate` is the run intensity 0..1 (see main.ts).
   *  Every command gets its earcon at exact onset; speech rides along while
   *  windows are long, and drops out (never lags, never overlaps) when they
   *  are not. */
  say(text: string, rate = 1): void {
    if (this.muted) return
    this.cancelPending()          // previous command's countdown is over
    this.earcon(text)
    this.countdown(rate)

    if (typeof speechSynthesis === 'undefined') return
    if (this.speakTimer !== null) { clearTimeout(this.speakTimer); this.speakTimer = null }

    // Past this point windows are shorter than an utterance — earcons only.
    if (rate >= EARCON_ONLY_AT) {
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
      return
    }

    this.duck(0.55, 0.45)
    const speak = () => {
      const u = new SpeechSynthesisUtterance(text)
      if (this.voice) u.voice = this.voice
      const inhibit = text.toUpperCase().includes('NOTHING')
      // The voice leans in as the run escalates; the trap command drops low.
      u.rate = Math.min(2, 1.02 + rate * 1.1)
      u.pitch = inhibit ? 0.8 : Math.min(2, 1.05 + rate * 0.35)
      u.volume = 1
      speechSynthesis.speak(u)
    }
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      // cancel() immediately followed by speak() drops the utterance on some
      // engines — defer the re-speak one macrotask.
      speechSynthesis.cancel()
      this.speakTimer = window.setTimeout(() => { this.speakTimer = null; speak() }, 30)
    } else {
      speak()
    }
  }

  /** Distinctive synthesised signature per command, played at exact command
   *  onset. Directional commands sweep and PAN in their direction, so the ear
   *  learns them long before speech has to drop away. */
  private earcon(label: string): void {
    if (!this.ctx) return
    const L = label.toUpperCase()
    if (L.includes('NOTHING')) {
      // Flat, low, deliberately unappetising — the sound of "don't".
      this.note({ freq: 92, durMs: 220, type: 'sawtooth', gain: 0.14 })
      this.note({ freq: 97, durMs: 220, type: 'sawtooth', gain: 0.1 })
      return
    }
    if (L.includes('LEFT')) {
      this.note({ freq: 1200, endFreq: 500, durMs: 120, type: 'square', gain: 0.12, pan: -0.8 })
      return
    }
    if (L.includes('RIGHT')) {
      this.note({ freq: 1200, endFreq: 500, durMs: 120, type: 'square', gain: 0.12, pan: 0.8 })
      return
    }
    if (L.includes('UP') || L.includes('FLICK')) {
      this.note({ freq: 500, endFreq: 1500, durMs: 120, type: 'square', gain: 0.12 })
      return
    }
    if (L.includes('DOWN') || L.includes('PULL')) {
      this.note({ freq: 900, endFreq: 300, durMs: 140, type: 'square', gain: 0.12 })
      return
    }
    if (L.includes('SHAKE')) {
      for (let k = 0; k < 4; k++) {
        this.note({ at: this.ctx.currentTime + k * 0.045, freq: k % 2 ? 1180 : 880, durMs: 40, type: 'square', gain: 0.11 })
      }
      return
    }
    if (L.includes('TWIST')) {
      this.note({ freq: 620, endFreq: 980, durMs: 90, type: 'triangle', gain: 0.14 })
      this.note({ at: this.ctx.currentTime + 0.09, freq: 980, endFreq: 620, durMs: 90, type: 'triangle', gain: 0.14 })
      return
    }
    if (L.includes('HOLD')) {
      this.note({ freq: 660, durMs: 260, type: 'triangle', gain: 0.13, attackMs: 20 })
      return
    }
    if (L.includes('PINCH')) {
      this.note({ freq: 500, endFreq: 780, durMs: 110, type: 'sine', gain: 0.12, pan: -0.5 })
      this.note({ freq: 1150, endFreq: 780, durMs: 110, type: 'sine', gain: 0.12, pan: 0.5 })
      return
    }
    if (L.includes('FLIP')) {
      this.note({ freq: 440, durMs: 70, type: 'square', gain: 0.12 })
      this.note({ at: this.ctx.currentTime + 0.075, freq: 880, durMs: 90, type: 'square', gain: 0.13 })
      return
    }
    // TAP and anything unrecognised: one bright poke.
    this.note({ freq: 1320, durMs: 70, type: 'square', gain: 0.13 })
  }

  /** A quiet pulse that tracks the response window and accelerates toward the
   *  deadline. Cancelled on resolve (correct/wrong/next say). */
  private countdown(i: number): void {
    if (!this.ctx) return
    const win = estWindowMs(i) / 1000
    if (win < 0.45) return                    // music tempo carries urgency here
    const t0 = this.ctx.currentTime
    const n = 6
    for (let k = 1; k <= n; k++) {
      // Quadratic spacing: ticks bunch up toward the deadline.
      const frac = Math.pow(k / n, 0.62)
      this.note({
        at: t0 + win * frac, freq: 1500 + k * 60, durMs: 26, type: 'square',
        gain: 0.028 + 0.012 * k, cancellable: true,
      })
    }
  }

  /** Two rising pickup ticks that land just before the next command, so the
   *  player can set themselves. */
  private anticipate(afterMistake: boolean): void {
    if (!this.ctx) return
    const gap = estGapMs(this.intensityV, afterMistake) / 1000
    const t0 = this.ctx.currentTime
    if (gap > 0.24) {
      this.note({ at: t0 + gap * 0.5, freq: 880, durMs: 40, type: 'sine', gain: 0.07, cancellable: true })
    }
    this.note({ at: t0 + Math.max(0.05, gap * 0.9), freq: 1320, durMs: 45, type: 'sine', gain: 0.1, cancellable: true })
  }

  // ------------------------------------------------------------------- fx

  correct(streak: number): void {
    if (!this.ctx || this.muted) return
    this.cancelPending()
    // Rising pentatonic step per streak — the sound of a run going well —
    // thickened with a fifth, and an octave shimmer once the streak is hot.
    const scale = [0, 2, 4, 7, 9]
    const n = scale[streak % scale.length] + 12 * Math.floor((streak % 15) / 5)
    const f = 440 * Math.pow(2, n / 12)
    this.note({ freq: f, durMs: 150, type: 'triangle', gain: 0.24 })
    this.note({ freq: f * 1.5, durMs: 120, type: 'sine', gain: 0.1 })
    if (streak >= 10) this.note({ at: this.ctx.currentTime + 0.04, freq: f * 2, durMs: 130, type: 'sine', gain: 0.09 })
    // Milestone flourish every 5: a fast ascending arpeggio.
    if (streak > 0 && streak % 5 === 0) {
      const t0 = this.ctx.currentTime + 0.05
      const arp = [0, 4, 7, 12]
      for (let k = 0; k < arp.length; k++) {
        this.note({ at: t0 + k * 0.055, freq: f * Math.pow(2, arp[k] / 12), durMs: 90, type: 'triangle', gain: 0.14 })
      }
      this.noise({ at: t0, durMs: 300, gain: 0.05, filter: 'highpass', freq: 8000 })
    }
    this.anticipate(false)
  }

  wrong(): void {
    if (!this.ctx || this.muted) return
    this.cancelPending()
    // Punchy: a deep thud, a detuned saw falling out of tune, and a slammed
    // noise impact — while the music bed drops out from under you.
    this.duck(0.25, 0.55)
    this.note({ freq: 130, endFreq: 38, durMs: 260, type: 'sine', gain: 0.5, attackMs: 2 })
    this.note({ freq: 220, endFreq: 62, durMs: 340, type: 'sawtooth', gain: 0.2 })
    this.note({ freq: 233, endFreq: 58, durMs: 340, type: 'sawtooth', gain: 0.16 })
    this.noise({ durMs: 180, gain: 0.2, filter: 'lowpass', freq: 3200, endFreq: 240 })
    this.anticipate(true)
  }

  gameOver(): void {
    if (!this.ctx || this.muted) return
    this.cancelPending()
    this.beatOn = false
    const ctx = this.ctx
    const t = ctx.currentTime
    // The bed collapses: drone glides down an octave and fades, music bus falls.
    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(t)
      this.musicBus.gain.setTargetAtTime(0.0001, t, 0.4)
    }
    if (this.droneA && this.droneB && this.droneGain && this.droneFilter) {
      this.droneA.frequency.setTargetAtTime(55, t, 0.5)
      this.droneB.frequency.setTargetAtTime(55.3, t, 0.5)
      this.droneFilter.frequency.setTargetAtTime(120, t, 0.5)
      this.droneGain.gain.setTargetAtTime(0.0001, t, 0.9)
    }
    // A slow, final descending motif over a long falling noise wash.
    const fall = [0, -3, -7, -12]
    for (let k = 0; k < fall.length; k++) {
      this.note({
        at: t + 0.12 + k * 0.21, freq: 330 * Math.pow(2, fall[k] / 12),
        durMs: k === fall.length - 1 ? 700 : 220, type: 'sawtooth', gain: 0.16,
      })
    }
    this.note({ at: t + 0.12, freq: 120, endFreq: 30, durMs: 900, type: 'sine', gain: 0.35, attackMs: 4 })
    this.noise({ at: t + 0.1, durMs: 1100, gain: 0.12, filter: 'lowpass', freq: 4200, endFreq: 120 })
  }

  /** Legacy hook kept for compatibility: a tiny hat tick. */
  tick(): void {
    this.noise({ durMs: 30, gain: 0.05, filter: 'highpass', freq: 8000 })
  }

  /** Drive the music bed's escalation. Called every frame; cheap. */
  setIntensity(i: number): void {
    const v = Math.min(1, Math.max(0, i))
    if (Math.abs(v - this.intensityV) < 0.001) { this.intensityV = v; return }
    this.intensityV = v
    if (this.ctx && this.droneFilter && this.droneGain && this.beatOn) {
      const t = this.ctx.currentTime
      // The pad brightens and swells as the run escalates.
      this.droneFilter.frequency.setTargetAtTime(220 + v * v * 3800, t, 0.2)
      this.droneGain.gain.setTargetAtTime(0.05 + v * 0.045, t, 0.3)
    }
  }

  stop(): void {
    if (this.schedulerId !== null) { clearInterval(this.schedulerId); this.schedulerId = null }
    if (this.speakTimer !== null) { clearTimeout(this.speakTimer); this.speakTimer = null }
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    this.cancelPending()
    this.beatOn = false
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.comp = null
    this.musicBus = null
    this.fxBus = null
    this.noiseBuf = null
    this.droneA = this.droneB = null
    this.droneFilter = null
    this.droneGain = null
  }
}
