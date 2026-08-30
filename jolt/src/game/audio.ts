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
 *    driven double-time. Key changes are BAR-ALIGNED and announced with a
 *    crash; the bassline alternates between two riffs on a 4-bar phrase and
 *    every 4th bar ends in a snare fill, so the bed evolves rather than loops.
 *  - Player-facing hits are QUANTISED: earcons and the correct-answer chime
 *    snap to the next 16th of the grid, so the player's actions land inside
 *    the music instead of against it (the Rez trick).
 *  - JUDGMENT TIER: a perfect answer has its own glassy earcon in a higher
 *    register than the plain-correct chime — key-aware, grid-snapped, climbing
 *    a pentatonic ladder with chain height and leaving a decaying echo on the
 *    following 16ths, so a x12 chain SOUNDS twelve rungs higher than a x1.
 *    When a chain snaps on a merely-correct answer the slip is audible (a
 *    falling two-note break, deliberately off-grid); when a hot chain dies on
 *    a miss the wrong-hit gains a descending shatter on top.
 *  - PLAYER RIFF (actions literally become the music): every correct answer
 *    appends a scale degree to an 8-note loop the sequencer plays back as the
 *    bed's lead line, transposed with the current key. Sustained good play
 *    composes the track; a miss wipes the loop and the melody the player
 *    built audibly collapses out of the mix.
 *  - The opening is quiet but PRESENT: soft hats from intensity zero and calm
 *    bar-start pad plucks below the ramp's first act, so the first commands
 *    breathe over a pulse instead of near-silence.
 *  - The VOICE has a script, not just labels: 2-3 phrasings per command picked
 *    at random, praise lines at streak milestones, and a performance-tiered
 *    taunt plus a spoken run callout at game over. Past intensity 0.5 the
 *    announcer does not fall silent — it switches to clipped one-syllable
 *    barks at maximum rate, so the voice survives into the endgame.
 *  - Speech is actively managed: a deliberately ranked voice, rate/pitch that
 *    climb with intensity, cancel-before-speak with a deferred re-speak (the
 *    Chrome cancel→speak-drops-the-utterance bug).
 *  - A ticking countdown tracks each response window — computed from the REAL
 *    difficulty curve (commands.ts windowFor × the command's windowScale, the
 *    issued index recovered by inverting intensity()) — and accelerates toward
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
import { windowFor, intensity, available, INHIBIT_WINDOW } from './commands'

/** Engine's resolve gap (pause before the next command). Mirrors the engine's
 *  RESOLVE_MS/RESOLVE_FLOOR (420→140ms, ×1.6 after a mistake), which the
 *  engine does not export; formula verified against engine.resolveGap(). */
function estGapMs(i: number, afterMistake: boolean): number {
  const g = 420 - 280 * Math.min(1, Math.max(0, i))
  return afterMistake ? g * 1.6 : g
}

// ------------------------------------------------------- pure music arithmetic
// Exported so tests/audio.test.mjs can verify grid + judgment math headlessly.

/** The next 16th-note grid line at or after `now`. `nextNoteTime` is the
 *  scheduler's lookahead horizon (some whole number of steps ahead); walk back
 *  to the first grid line that has not yet sounded. Pure. */
export function nextGridTime(now: number, nextNoteTime: number, stepDur: number): number {
  let t = nextNoteTime
  while (t - stepDur > now + 0.003) t -= stepDur
  return Math.max(now, t)
}

/** Major-pentatonic degrees — the game's "can't sound bad" melodic alphabet. */
export const PENT = [0, 2, 4, 7, 9]

/** Semitone offset above the perfect-earcon root for the Nth link of a chain:
 *  each consecutive perfect climbs one pentatonic rung, wrapping up an octave
 *  every five, capped at chain 15 (where the score bonus caps too). Chain 1 is
 *  the root; chain 15 sits 33 semitones up — the whole chain is a ladder the
 *  player hears themselves climb. */
export function perfectPitch(chain: number): number {
  const idx = Math.max(0, Math.min(chain, 15) - 1)
  return PENT[idx % PENT.length] + 12 * Math.floor(idx / PENT.length)
}

/** The player-authored lead loop holds this many notes (FIFO). */
export const PLAYER_RIFF_LEN = 8

/** Append a degree to the player riff, keeping the newest PLAYER_RIFF_LEN.
 *  Mutates and returns the same array (the Sound instance owns it). */
export function pushRiff(riff: number[], degree: number): number[] {
  riff.push(degree)
  while (riff.length > PLAYER_RIFF_LEN) riff.shift()
  return riff
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

/** Intensity above which the announcer switches from full phrasings to
 *  clipped one-syllable barks at maximum rate. The voice never goes silent —
 *  a bark fits even the 264ms floor window, and the earcon (played at exact
 *  onset since command one) still carries instant meaning. */
const BARK_AT = 0.5

// ----------------------------------------------------------------- the script
// Personality lives in TEXT. Original lines — no toy's or game's voice copied.

/** 2-3 alternate phrasings per command, verb kept prominent so meaning is
 *  never in doubt (the label is on screen too). */
const PHRASES: Record<string, string[]> = {
  'TAP IT': ['Tap it!', 'Tap it, go!', 'Give it a tap!'],
  'SWIPE LEFT': ['Swipe left!', 'Left! Go left!', 'To the left!'],
  'SWIPE RIGHT': ['Swipe right!', 'Right! Go right!', 'To the right!'],
  'SHAKE IT': ['Shake it!', 'Shake it up!', 'Shake, shake, shake!'],
  'TWIST IT': ['Twist it!', 'Give it a twist!', 'Twist it round!'],
  'FLICK UP': ['Flick up!', 'Up! Flick up!', 'Flick it up!'],
  'PULL DOWN': ['Pull down!', 'Down! Pull down!', 'Drag it down!'],
  'HOLD IT': ['Hold it!', 'Hold it down!', 'Press and hold!'],
  'PINCH IT': ['Pinch it!', 'Give it a pinch!', 'Pinch it shut!'],
  'FLIP IT': ['Flip it!', 'Flip it over!', 'Turn it over!'],
  'DO NOTHING': ['Do nothing!', "Don't you dare!", 'Hands off!'],
}

/** One-syllable(ish) barks for the endgame, when windows drop under 400ms. */
const BARKS: Record<string, string> = {
  'TAP IT': 'Tap!', 'SWIPE LEFT': 'Left!', 'SWIPE RIGHT': 'Right!',
  'SHAKE IT': 'Shake!', 'TWIST IT': 'Twist!', 'FLICK UP': 'Up!',
  'PULL DOWN': 'Down!', 'HOLD IT': 'Hold!', 'PINCH IT': 'Pinch!',
  'FLIP IT': 'Flip!', 'DO NOTHING': 'Wait!',
}

/** Streak-milestone praise, tiered by how hot the streak is. */
const PRAISE_LOW = ['Nice.', 'Not bad.', 'Keep up!']
const PRAISE_MID = ['Impressive!', "You're quick!", 'Sharp!']
const PRAISE_HOT = ['On fire!', 'Unstoppable!', 'Show-off.', 'Machine!']

/** Perfect-chain callouts — sparse by design (multiples of five only, and they
 *  take precedence over streak praise so at most one line rides a command). */
const CHAIN_LOW = ['Perfect five!', 'Five, clean!']
const CHAIN_MID = ['Ten perfect. Ten!', 'Flawless ten!']
const CHAIN_HOT = ['Still perfect!', 'Untouchable!', 'Surgical!']

/** Game-over taunts, tiered by commands survived. Original attitude. */
const OVER_SHORT = ["That's it? Already?", "Blink and it's over.", 'The warm-up beat you.']
const OVER_MID = ['Down you go.', 'The beat wins this round.', 'Caught you slipping.']
const OVER_GOOD = ['A worthy run. Still mine.', 'You almost had it.', 'Respect. Now go again.']
const OVER_GREAT = ['Okay. THAT was a run.', 'You scare me a little.', 'The machine bows. Barely.']

function oneOf(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)]
}

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
  private bar = 0
  private shift = 0            // current semitone key shift; changes only at bar starts
  private beatOn = false
  private intensityV = 0

  // One-shot sources that may need cancelling early (countdown + anticipation).
  private pending: AudioScheduledSourceNode[] = []

  // Speech state.
  private voice: SpeechSynthesisVoice | null = null
  private voicesHooked = false
  private speakTimer: number | null = null
  private overTimer: number | null = null

  // Run stats tracked internally (gameOver() receives no report), so the
  // announcer can call out the run it just watched.
  private runCorrect = 0
  private runBestStreak = 0
  private runBestChain = 0

  // Judgment state: last chain height seen (so a break/shatter knows how high
  // the chain was), and the player-authored lead loop the sequencer plays.
  private lastChain = 0
  private playerRiff: number[] = []
  private riffPos = 0

  // Label → window scale/inhibit, built lazily from the real command specs.
  private specMap: Map<string, { scale: number; inhibit: boolean }> | null = null

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
    // A replay cuts the previous run's game-over speech short.
    if (this.overTimer !== null) { clearTimeout(this.overTimer); this.overTimer = null }
    if (typeof speechSynthesis !== 'undefined'
      && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel()
    this.runCorrect = 0
    this.runBestStreak = 0
    this.runBestChain = 0
    this.lastChain = 0
    this.playerRiff.length = 0
    this.riffPos = 0
    // (Re)arm the bed.
    this.step = 0
    this.bar = 0
    this.shift = 0
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
      // Warmer than before: the opening pad is quiet but unmistakably THERE
      // (calm is not silence — the early-run presence fix).
      this.droneFilter.frequency.setValueAtTime(320, t)
      this.droneGain.gain.setValueAtTime(0.0001, t)
      this.droneGain.gain.exponentialRampToValueAtTime(0.08, t + 1.2)
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

  /** The next 16th-note grid line at or after "now". Earcons and correct-hits
   *  snap here so player-facing sounds land INSIDE the music (Rez-style)
   *  instead of off-beat against a 180 BPM bed. Worst-case added latency is
   *  one 16th (83ms at top tempo); the countdown still tracks the real
   *  deadline from true onset, so fairness is untouched. */
  private nextGrid(): number {
    if (!this.ctx) return 0
    const now = this.ctx.currentTime
    if (!this.beatOn) return now
    return nextGridTime(now, this.nextNoteTime, 60 / this.bpm() / 4)
  }

  // -------------------------------------------------- real-difficulty lookup

  /** Recover the issued index from an intensity value by inverting
   *  commands.intensity() (strictly monotonic) — no duplicated constants. */
  private issuedFrom(i: number): number {
    let lo = 0
    let hi = 400
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (intensity(mid) < i - 1e-9) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  private specFor(label: string): { scale: number; inhibit: boolean } {
    if (!this.specMap) {
      this.specMap = new Map()
      for (const s of available(Number.MAX_SAFE_INTEGER)) {
        this.specMap.set(s.label.toUpperCase(), { scale: s.windowScale ?? 1, inhibit: !!s.inhibit })
      }
    }
    return this.specMap.get(label.toUpperCase()) ?? { scale: 1, inhibit: false }
  }

  /** The ACTUAL response window for this command, from the real curve: the
   *  caller passes intensity(issued) (post-increment), the command was built
   *  at issued-1, and per-action windowScale is applied — so a FLIP countdown
   *  no longer finishes ~270ms early. */
  private windowMsFor(label: string, i: number): number {
    const spec = this.specFor(label)
    if (spec.inhibit) return INHIBIT_WINDOW
    const issued = Math.max(0, this.issuedFrom(i) - 1)
    return Math.round(windowFor(issued) * spec.scale)
  }

  // ------------------------------------------------------------- sequencer

  private bpm(): number {
    return 96 + 84 * this.intensityV   // 96 → 180
  }

  /** Semitone key shift rises through a minor scale with intensity. This is
   *  the TARGET; scheduleStep only adopts it at bar starts (step 0), with a
   *  crash to mark the change, so the transposition is musical, not abrupt. */
  private keyTarget(): number {
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
      if (this.step === 0) this.bar++
    }
  }

  /** Two bass riffs, alternating on a 4-bar phrase, so the bed has an A and a
   *  B section instead of one loop for the whole run. */
  private static RIFF_A = [0, 12, 0, 10, 0, 12, 7, 10]
  private static RIFF_B = [0, 12, 3, 10, 0, 15, 12, 10]

  private scheduleStep(step: number, t: number): void {
    const i = this.intensityV
    const bus = this.musicBus

    // Key changes commit only on the downbeat, marked with a crash.
    if (step === 0) {
      const target = this.keyTarget()
      if (target !== this.shift) {
        this.shift = target
        this.crash(t)
      }
    }
    const root = 55 * Math.pow(2, this.shift / 12)

    // Kick: quarters always; a driving extra hit late.
    if (step % 4 === 0) this.kick(t, 0.42)
    if (i >= 0.72 && step === 14) this.kick(t, 0.3)

    // Hats: off-beat 8ths from the very first command (soft — presence, not
    // pressure), 16ths once the pressure is on.
    if (step % 4 === 2) {
      this.noise({ at: t, durMs: 40, gain: 0.035 + i * 0.05, filter: 'highpass', freq: 7000, dest: bus })
    }
    if (i >= 0.5 && step % 2 === 1) {
      this.noise({ at: t, durMs: 26, gain: 0.035, filter: 'highpass', freq: 9000, dest: bus })
    }

    // Calm-act pad plucks: below the ramp's first act the bar breathes — a
    // soft root on the downbeat, its fifth halfway. Gone once the bass owns
    // the low mids, so the opening is present without ever being busy.
    if (i < 0.3 && step === 0) {
      this.note({ at: t, freq: root * 4, durMs: 420, type: 'sine', gain: 0.055, dest: bus, attackMs: 30 })
    }
    if (i < 0.3 && step === 8) {
      this.note({ at: t, freq: root * 6, durMs: 380, type: 'sine', gain: 0.04, dest: bus, attackMs: 30 })
    }

    // PLAYER RIFF: the lead line is authored by the player's own correct
    // answers (one degree per hit, newest 8 kept). Played on the off-8ths in
    // the current key, so a run of corrects literally composes the track —
    // and after a miss wipes it, its absence is the sound of starting over.
    if (this.playerRiff.length > 0 && step % 4 === 2) {
      const semis = this.playerRiff[this.riffPos % this.playerRiff.length]
      this.riffPos++
      this.note({
        at: t, freq: root * 8 * Math.pow(2, semis / 12), durMs: 100,
        type: 'triangle', gain: 0.05 + i * 0.025, dest: bus, attackMs: 4,
      })
    }

    // Backbeat snare.
    if (i >= 0.38 && (step === 4 || step === 12)) {
      this.noise({ at: t, durMs: 110, gain: 0.14, filter: 'bandpass', freq: 1900, q: 0.9, dest: bus })
      this.note({ at: t, freq: 240, endFreq: 170, durMs: 70, type: 'triangle', gain: 0.1, dest: bus })
    }

    // Fill: every 4th bar ends with four rising 16th snare hits.
    if (i >= 0.3 && this.bar % 4 === 3 && step >= 12) {
      const k = step - 12
      this.noise({
        at: t, durMs: 70, gain: 0.08 + k * 0.025,
        filter: 'bandpass', freq: 1400 + k * 500, q: 1, dest: bus,
      })
    }

    // Bassline: 8th-note minor riff (A/B phrases); doubles to 16ths near the top.
    if (i >= 0.26) {
      const riff = (this.bar % 8) < 4 ? Sound.RIFF_A : Sound.RIFF_B
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

  /** Crash marker for a key change: a bright noise splash plus a low boom. */
  private crash(t: number): void {
    this.noise({ at: t, durMs: 480, gain: 0.14, filter: 'highpass', freq: 4200, endFreq: 9000, dest: this.musicBus })
    this.note({ at: t, freq: 180, endFreq: 50, durMs: 240, type: 'sine', gain: 0.3, dest: this.musicBus, attackMs: 2 })
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

  /** Speak one line with the cancel-before-speak dance. `queue: true` lets a
   *  line ride behind whatever is already speaking (praise, score callouts)
   *  instead of cutting it off. */
  private speakLine(text: string, opts: { rate: number; pitch: number; volume?: number; queue?: boolean }): void {
    if (this.muted || typeof speechSynthesis === 'undefined') return
    const go = () => {
      const u = new SpeechSynthesisUtterance(text)
      if (this.voice) u.voice = this.voice
      u.rate = Math.min(2, opts.rate)
      u.pitch = Math.min(2, opts.pitch)
      u.volume = opts.volume ?? 1
      speechSynthesis.speak(u)
    }
    if (opts.queue) { go(); return }
    if (this.speakTimer !== null) { clearTimeout(this.speakTimer); this.speakTimer = null }
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      // cancel() immediately followed by speak() drops the utterance on some
      // engines — defer the re-speak one macrotask.
      speechSynthesis.cancel()
      this.speakTimer = window.setTimeout(() => { this.speakTimer = null; go() }, 30)
    } else {
      go()
    }
  }

  /** Announce a command. `rate` is the run intensity 0..1 (see main.ts).
   *  Every command gets its earcon (snapped to the music grid); the announcer
   *  speaks a varied phrasing while windows are long and switches to clipped
   *  barks — never silence — once they are not. `windowMs`, when provided by
   *  the caller, overrides the curve-derived response window. */
  say(text: string, rate = 1, windowMs?: number): void {
    if (this.muted) return
    this.cancelPending()          // previous command's countdown is over
    this.earcon(text)
    this.countdown(windowMs ?? this.windowMsFor(text, rate))

    if (typeof speechSynthesis === 'undefined') return

    const inhibit = text.toUpperCase().includes('NOTHING')
    if (rate >= BARK_AT) {
      // Endgame: one-syllable bark at max rate. The voice stays in the fight.
      const bark = BARKS[text.toUpperCase()] ?? `${text.split(' ')[0]}!`
      this.duck(0.7, 0.25)
      this.speakLine(bark, { rate: 2, pitch: inhibit ? 0.8 : 1.35 })
      return
    }

    this.duck(0.55, 0.45)
    const variants = PHRASES[text.toUpperCase()] ?? [text]
    // The voice leans in as the run escalates; the trap command drops low.
    this.speakLine(oneOf(variants), {
      rate: 1.02 + rate * 1.1,
      pitch: inhibit ? 0.8 : 1.05 + rate * 0.35,
    })
  }

  /** Distinctive synthesised signature per command, snapped to the next 16th
   *  of the grid so commands land ON the music. Directional commands sweep and
   *  PAN in their direction, so the ear learns them long before speech has to
   *  shrink to barks. */
  private earcon(label: string): void {
    if (!this.ctx) return
    const L = label.toUpperCase()
    const t0 = this.nextGrid()
    if (L.includes('NOTHING')) {
      // Flat, low, deliberately unappetising — the sound of "don't".
      this.note({ at: t0, freq: 92, durMs: 220, type: 'sawtooth', gain: 0.14 })
      this.note({ at: t0, freq: 97, durMs: 220, type: 'sawtooth', gain: 0.1 })
      return
    }
    if (L.includes('LEFT')) {
      this.note({ at: t0, freq: 1200, endFreq: 500, durMs: 120, type: 'square', gain: 0.12, pan: -0.8 })
      return
    }
    if (L.includes('RIGHT')) {
      this.note({ at: t0, freq: 1200, endFreq: 500, durMs: 120, type: 'square', gain: 0.12, pan: 0.8 })
      return
    }
    if (L.includes('UP') || L.includes('FLICK')) {
      this.note({ at: t0, freq: 500, endFreq: 1500, durMs: 120, type: 'square', gain: 0.12 })
      return
    }
    if (L.includes('DOWN') || L.includes('PULL')) {
      this.note({ at: t0, freq: 900, endFreq: 300, durMs: 140, type: 'square', gain: 0.12 })
      return
    }
    if (L.includes('SHAKE')) {
      for (let k = 0; k < 4; k++) {
        this.note({ at: t0 + k * 0.045, freq: k % 2 ? 1180 : 880, durMs: 40, type: 'square', gain: 0.11 })
      }
      return
    }
    if (L.includes('TWIST')) {
      this.note({ at: t0, freq: 620, endFreq: 980, durMs: 90, type: 'triangle', gain: 0.14 })
      this.note({ at: t0 + 0.09, freq: 980, endFreq: 620, durMs: 90, type: 'triangle', gain: 0.14 })
      return
    }
    if (L.includes('HOLD')) {
      this.note({ at: t0, freq: 660, durMs: 260, type: 'triangle', gain: 0.13, attackMs: 20 })
      return
    }
    if (L.includes('PINCH')) {
      this.note({ at: t0, freq: 500, endFreq: 780, durMs: 110, type: 'sine', gain: 0.12, pan: -0.5 })
      this.note({ at: t0, freq: 1150, endFreq: 780, durMs: 110, type: 'sine', gain: 0.12, pan: 0.5 })
      return
    }
    if (L.includes('FLIP')) {
      this.note({ at: t0, freq: 440, durMs: 70, type: 'square', gain: 0.12 })
      this.note({ at: t0 + 0.075, freq: 880, durMs: 90, type: 'square', gain: 0.13 })
      return
    }
    // TAP and anything unrecognised: one bright poke.
    this.note({ at: t0, freq: 1320, durMs: 70, type: 'square', gain: 0.13 })
  }

  /** A quiet pulse that tracks the response window and accelerates toward the
   *  deadline. `windowMs` is the command's REAL window (curve × windowScale),
   *  so the last tick lands at the true deadline. Cancelled on resolve. */
  private countdown(windowMs: number): void {
    if (!this.ctx) return
    const win = windowMs / 1000
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

  /** A correct answer, with its timing judgment: `perfect` is the engine's
   *  PERFECT-band verdict, `chain` the live perfect-chain length AFTER this
   *  answer. The judgment is what the player hears: a perfect gets the glassy
   *  ladder earcon (higher with every link), a merely-correct answer gets the
   *  familiar chime — and if it just snapped a chain, the snap is audible. */
  correct(streak: number, perfect = false, chain = 0): void {
    if (!this.ctx || this.muted) return
    this.cancelPending()
    this.runCorrect++
    this.runBestStreak = Math.max(this.runBestStreak, streak)
    this.runBestChain = Math.max(this.runBestChain, chain)
    const chainWas = this.lastChain
    this.lastChain = chain
    const g0 = this.nextGrid()
    // Key-aware roots: the chime lives where the bed's key lives, so a hit
    // never lands out of tune after a key change.
    const keyMul = Math.pow(2, this.shift / 12)

    if (perfect) {
      this.perfectHit(g0, chain, 660 * keyMul)
      // The hit authors the lead line at the height the chain reached
      // (wrapped inside two octaves so the loop stays a lead, not a whistle).
      pushRiff(this.playerRiff, perfectPitch(chain) % 24)
    } else {
      // A slow answer that snapped a live chain: the snap must be HEARD —
      // engine keeps chain untouched through a held DO NOTHING (chain ===
      // chainWas there), so only a true break (chain fell to 0) sounds.
      if (chain === 0 && chainWas >= 3) this.chainBreak(chainWas)
      // Rising pentatonic step per streak — the sound of a run going well —
      // thickened with a fifth, and an octave shimmer once the streak is hot.
      // Snapped to the next 16th so the player's hit is part of the music.
      const n = PENT[streak % PENT.length] + 12 * Math.floor((streak % 15) / 5)
      const f = 440 * keyMul * Math.pow(2, n / 12)
      this.note({ at: g0, freq: f, durMs: 150, type: 'triangle', gain: 0.24 })
      this.note({ at: g0, freq: f * 1.5, durMs: 120, type: 'sine', gain: 0.1 })
      if (streak >= 10) this.note({ at: g0 + 0.04, freq: f * 2, durMs: 130, type: 'sine', gain: 0.09 })
      // Milestone flourish every 5: a fast ascending arpeggio.
      if (streak > 0 && streak % 5 === 0) {
        const t0 = g0 + 0.05
        const arp = [0, 4, 7, 12]
        for (let k = 0; k < arp.length; k++) {
          this.note({ at: t0 + k * 0.055, freq: f * Math.pow(2, arp[k] / 12), durMs: 90, type: 'triangle', gain: 0.14 })
        }
        this.noise({ at: t0, durMs: 300, gain: 0.05, filter: 'highpass', freq: 8000 })
      }
      pushRiff(this.playerRiff, n % 24)
    }

    // Spoken milestones — sparse, and at most ONE line per command: chain
    // callouts (every 5th link) outrank streak praise. queue:true rides
    // behind whatever is speaking; the next command's say() still does its
    // cancel-before-speak, so a callout can never delay a command.
    let spoke = false
    if (perfect && chain >= 5 && chain % 5 === 0) {
      const lines = chain >= 15 ? CHAIN_HOT : chain >= 10 ? CHAIN_MID : CHAIN_LOW
      this.speakLine(oneOf(lines), { rate: 1.35 + this.intensityV * 0.5, pitch: 1.2, queue: true })
      spoke = true
    }
    if (!spoke && (streak === 5 || (streak > 0 && streak % 10 === 0))) {
      const lines = streak >= 20 ? PRAISE_HOT : streak >= 10 ? PRAISE_MID : PRAISE_LOW
      this.speakLine(oneOf(lines), { rate: 1.3 + this.intensityV * 0.6, pitch: 1.15, queue: true })
    }
    this.anticipate(false)
  }

  /** The perfect earcon: a glass ping in a register of its own, one pentatonic
   *  rung higher per chain link (perfectPitch), grid-snapped, gaining body and
   *  sparkle as the chain grows, and echoing down the next 16ths so the chain
   *  writes itself into the pattern. Every 5th link adds a rising shimmer. */
  private perfectHit(at: number, chain: number, base: number): void {
    const f = base * Math.pow(2, perfectPitch(chain) / 12)
    const hot = Math.min(chain, 12)
    this.note({ at, freq: f, durMs: 160, type: 'sine', gain: 0.18 + hot * 0.007 })
    this.note({ at, freq: f * 2, durMs: 130, type: 'square', gain: 0.045 + hot * 0.004 })
    this.noise({ at, durMs: 40, gain: 0.05, filter: 'highpass', freq: 9500 })
    if (chain >= 3) this.note({ at, freq: f * 1.5, durMs: 120, type: 'sine', gain: 0.07 })
    // Echo trail on the grid — one 16th behind, two once the chain is hot.
    const stepDur = 60 / this.bpm() / 4
    const echoes = chain >= 6 ? 2 : 1
    for (let k = 1; k <= echoes; k++) {
      this.note({
        at: at + stepDur * k, freq: f, durMs: 90, type: 'sine',
        gain: (0.18 + hot * 0.007) * 0.32 / k, cancellable: true,
      })
    }
    if (chain > 0 && chain % 5 === 0) {
      const arp = [0, 4, 7, 12]
      for (let k = 0; k < arp.length; k++) {
        this.note({ at: at + k * 0.05, freq: f * Math.pow(2, arp[k] / 12), durMs: 80, type: 'sine', gain: 0.11 })
      }
      this.noise({ at, durMs: 320, gain: 0.055, filter: 'highpass', freq: 7000, endFreq: 12000 })
    }
  }

  /** A chain snapping on a slow-but-correct answer. Deliberately OFF-grid —
   *  breaks interrupt the music — but far lighter than wrong(): the run is
   *  still alive, only the perfection is gone. Starts near the pitch the
   *  chain had reached and falls, so the height of the loss is audible. */
  private chainBreak(chainWas: number): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const f = 660 * Math.pow(2, perfectPitch(chainWas) / 12)
    this.note({ at: t, freq: f, endFreq: f * 0.5, durMs: 140, type: 'triangle', gain: 0.14 })
    this.note({ at: t + 0.05, freq: 196, endFreq: 130, durMs: 160, type: 'sine', gain: 0.16 })
    this.noise({ at: t, durMs: 110, gain: 0.07, filter: 'lowpass', freq: 2400, endFreq: 300 })
  }

  wrong(): void {
    if (!this.ctx || this.muted) return
    this.cancelPending()
    // A miss wipes the player-authored lead line — the melody the run built
    // collapses out of the mix, which is its own punishment.
    const chainWas = this.lastChain
    this.lastChain = 0
    this.playerRiff.length = 0
    this.riffPos = 0
    // Punchy and deliberately OFF-grid: failure interrupts the music rather
    // than joining it — a deep thud, a detuned saw falling out of tune, and a
    // slammed noise impact, while the bed drops out from under you.
    this.duck(0.25, 0.55)
    // A hot perfect-chain dying is a bigger loss than a plain miss: add a
    // descending glass shatter on top so the ear knows WHAT it just lost.
    if (chainWas >= 5) {
      this.noise({ durMs: 260, gain: 0.12, filter: 'highpass', freq: 5200, endFreq: 700 })
    }
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

    // The announcer gets the last word: a performance-tiered taunt, then the
    // run called out loud. Delayed so the crash lands first; cancelled if the
    // player restarts before it fires.
    const survived = this.runCorrect
    const best = this.runBestStreak
    const bestChain = this.runBestChain
    const taunt = survived >= 60 ? oneOf(OVER_GREAT)
      : survived >= 30 ? oneOf(OVER_GOOD)
        : survived >= 10 ? oneOf(OVER_MID)
          : oneOf(OVER_SHORT)
    if (this.overTimer !== null) clearTimeout(this.overTimer)
    this.overTimer = window.setTimeout(() => {
      this.overTimer = null
      this.speakLine(taunt, { rate: 1.02, pitch: 0.9 })
      const chainNote = bestChain >= 5 ? ` ${bestChain} perfect, chained.` : ''
      this.speakLine(`${survived} commands. Best streak, ${best}.${chainNote}`, {
        rate: 1.0, pitch: 0.85, queue: true,
      })
    }, 700)
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
      // The pad brightens and swells as the run escalates (from the warmer
      // 320Hz/0.08 opening the presence fix set).
      this.droneFilter.frequency.setTargetAtTime(320 + v * v * 3700, t, 0.2)
      this.droneGain.gain.setTargetAtTime(0.08 + v * 0.03, t, 0.3)
    }
  }

  stop(): void {
    if (this.schedulerId !== null) { clearInterval(this.schedulerId); this.schedulerId = null }
    if (this.speakTimer !== null) { clearTimeout(this.speakTimer); this.speakTimer = null }
    if (this.overTimer !== null) { clearTimeout(this.overTimer); this.overTimer = null }
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
