/** OWNER: audio agent. This genre is carried by SOUND — get this right and the
 *  game works even with plain visuals.
 *
 *  Zero sample files: commands are spoken via the built-in Web Speech API, and
 *  every musical element is synthesised with WebAudio.
 *
 *  Architecture (round 7: the owner PLAYED round 6 and said "still not there —
 *  sounds, beat, rhythm wise". This round was tuned by MEASUREMENT against
 *  tools/listen.mjs renders of the real graph, not by source inspection.)
 *  ---------------------------------------------------------------------------
 *  ROUND 7 CHANGES (each one moved a measured metric):
 *  - HARMONY: the single transposed cell is gone. An 8-bar minor progression
 *    (i–VI–III–VII | i–VI–iv–VII, CHORDS/chordFor) drives everything: the
 *    persistent pad is now 3 voices × 2 detuned saws (±5c, panned L/C/R)
 *    RETUNED to each bar's chord with ≤3-semitone voice leading; the bass
 *    riff offsets sit on root/fifth/octave ABOVE THE CHORD ROOT so the line
 *    walks the progression; an up-down chord-tone ARPEGGIO (arpDegree) rides
 *    the 8ths when hot and every 16th through builds and drops; the chime
 *    scale switched to MINOR pentatonic so player notes stay diatonic.
 *  - MACRO-DYNAMICS: sectionLevel() stages the whole bed per section (intro
 *    0.5 → drop 1.3) and bedLevel anchors every duck/pause/resume, buying
 *    the ≥6dB drop-vs-intro RMS contrast a listener feels as an arc.
 *  - KICK: faster/harder pitch envelope (190→44Hz in 90ms), triangle knock,
 *    louder click, deeper/tighter sidechain (dip to 0.22) — the low band
 *    spikes and clears instead of smearing (kick punch metric up ~8dB).
 *  - SPECTRUM: a 16th shaker bed + hotter hats fill the >6kHz air that was
 *    at 0.3% share; the pad register moved up out of the low band; low share
 *    now sits in the 20-45% window instead of 47-62%.
 *  - GRID: every player-facing one-shot lands ON the 16th grid — countdown
 *    ticks snap (dropping collisions), milestone arps are 16th-spaced, the
 *    chain break quantises, SHAKE/TWIST earcons carry their identity inside
 *    ONE grid-aligned onset, FLIP's second note is a 16th later. Only
 *    wrong() may interrupt time. (Grid alignment 71-87% → ≥95%.)
 *  - DROPS RE-GATED to what a typical run REACHES (measured, 150 seeded
 *    400ms-bot runs): x5 perfect chain (86%), streak 10/25/40 (100%), final-
 *    life clutch (100%) — the old x10 gate fired in ~0% of runs. DROP_BARS
 *    2→4 so a drop is a phrase, not a flinch, and dropHit adds a wide
 *    detuned chord stab. The 8-bar cooldown still keeps drops special.
 *
 *  Architecture (round 6 baseline, still true where not amended above)
 *  ---------------------------------------------------------------------------
 *  - MIX BUS: everything runs musicBus/fxBus → master → WaveShaper saturation
 *    (generated tanh curve) → compressor → destination. Pad, bass and the
 *    player-riff lead ride a dedicated duckBus whose gain is dipped ~10dB by
 *    every kick (sidechain-style pumping via gain automation, the EDM glue).
 *    A generated-impulse ConvolverNode is a shared reverb send; snare, crash
 *    and the perfect earcons send into it, so hits bloom instead of stopping.
 *  - DRUM KIT on its own drumBus: an 808-lineage kick (pitch-enveloped sine
 *    body + noise click transient), a snare with a tuned triangle body under a
 *    bandpassed noise splash (reverb send), and metallic hats built from two
 *    inharmonic square partials plus filtered noise — closed ticks and open
 *    sizzles.
 *  - BASSLINE WITH MOVEMENT: every bass note runs through its own lowpass
 *    whose cutoff DROPS across the note (filter envelope — the squelch), the
 *    pattern rotates per bar through three riffs on an AAAB/AABC 8-bar phrase
 *    (bassRiffFor), and the whole line falls an OCTAVE during a drop.
 *  - ARRANGEMENT, not a loop: a bar-aligned section machine (nextArrangement)
 *    walks intro (sparse heartbeat) → groove → build (full-bar riser + snare
 *    roll, bass tacet) → DROP (crash, filter sweep, octave-down bass, open
 *    hats, extra kicks) → groove. Drops are earned by GAMEPLAY: a x10 or x15
 *    perfect chain, or surviving onto the final life, queues one; it lands on
 *    the next bar line with a one-bar build so the music makes a promise and
 *    keeps it. An 8-bar cooldown keeps drops special.
 *  - KEY CHANGES are bar-aligned AND announced: the target key is noticed a
 *    beat early, a riser sweeps into the bar line, and the crash marks the
 *    arrival — no mid-bar jumps, no unannounced jumps (round-5 critic).
 *  - ENGINE CLOCK LOCK: syncClock(state) feature-detects beat fields
 *    (bpm/beatPhase) on GameState. When the engine carries the clock, its bpm
 *    is adopted and the scheduler's grid is nudged (clockNudge, ±8ms/frame)
 *    onto the engine's beat, so commands landing on half-beats land ON the
 *    music. Standalone (no beat fields), tempo falls back to the intensity
 *    ramp — everything still works.
 *  - Player-facing hits stay QUANTISED to the 16th grid (the Rez trick), the
 *    anticipation pickup now snaps to the grid too, and the JUDGMENT TIER
 *    (perfect ladder / chain break / shatter) and PLAYER RIFF layers of round
 *    5 are kept intact.
 *  - Round-5 defect fixes, all four: (1) a backgrounded tab no longer fires a
 *    catch-up blast — nextNoteTime clamps to now when it falls over a bar
 *    behind (clampCatchUp); (2) chain/riff bookkeeping now happens even while
 *    MUTED, so toggling mute can never fabricate a phantom chain-break;
 *    (3) pause()/resume() cancel and re-arm the countdown ticks (main.ts
 *    wires the shell's pause screens through), so the ticking deadline never
 *    desyncs from the frozen engine; (4) windowMsFor's fallback now includes
 *    the additive gestureLatencyMs term, matching commands.ts exactly.
 *  - The VOICE (scripted phrasings, barks past 0.5 intensity, praise/taunt
 *    tiers, cancel-before-speak) is unchanged from round 5.
 *  - Node hygiene: every one-shot source disconnects itself (and its whole
 *    envelope/filter/send chain) in onended. The only persistent nodes are
 *    the bus/reverb/drone graph. EXCEPTION: offline renders (LISTEN) skip the
 *    disconnect — onended is main-thread-timed, so mid-render disconnects
 *    would truncate ringing filter tails nondeterministically; a bounded
 *    render can afford to keep finished nodes around (see fire()).
 *  - Autoplay: the AudioContext is only created/resumed inside start(), which
 *    the shell calls from a user gesture; every method guards on ctx.
 */
import { windowFor, intensity, available, INHIBIT_WINDOW } from './commands'
import { gestureLatencyMs } from './input'
import type { Action } from './types'

/** Engine's resolve gap (pause before the next command). Mirrors the engine's
 *  RESOLVE_MS/RESOLVE_FLOOR (420→140ms, ×1.6 after a mistake), which the
 *  engine does not export; formula verified against engine.resolveGap(). */
function estGapMs(i: number, afterMistake: boolean): number {
  const g = 420 - 280 * Math.min(1, Math.max(0, i))
  return afterMistake ? g * 1.6 : g
}

// ------------------------------------------------------- pure music arithmetic
// Exported so tests/audio.test.mjs can verify grid + judgment + arrangement
// math headlessly. Everything the sequencer DECIDES lives in pure helpers;
// the class only performs the decisions.

/** The next 16th-note grid line at or after `now`. `nextNoteTime` is the
 *  scheduler's lookahead horizon (some whole number of steps ahead); walk back
 *  to the first grid line that has not yet sounded — or FORWARD when the
 *  requested time lies beyond the horizon (round-7 fix: anticipation pickups
 *  and countdown ticks ask for times up to a full response window ahead,
 *  far past the ~120ms lookahead; the old back-walk-only version silently
 *  returned those times UNSNAPPED, which is where most of the measured
 *  off-grid onsets came from). Pure. */
export function nextGridTime(now: number, nextNoteTime: number, stepDur: number): number {
  let t = nextNoteTime
  while (t - stepDur > now + 0.003) t -= stepDur
  while (t < now - 0.003) t += stepDur
  return Math.max(now, t)
}

/** Backgrounded-tab catch-up guard: a throttled tab can leave nextNoteTime a
 *  long way behind currentTime; scheduling that backlog on return fires every
 *  missed step at once (the catch-up blast). More than one bar behind = the
 *  groove is lost anyway, so re-anchor to now. Pure. */
export function clampCatchUp(nextNoteTime: number, now: number, barDur: number): number {
  return nextNoteTime < now - barDur ? now : nextNoteTime
}

/** Engine-clock phase lock: how far to nudge the scheduler's grid toward the
 *  engine's next beat boundary. The raw difference is wrapped into ±half a
 *  beat (the nearest boundary, not necessarily the same one) and clamped to
 *  maxNudge per call, so correction is gentle and can never stutter. Pure. */
export function clockNudge(engineNext: number, audioNext: number, beatDur: number, maxNudge: number): number {
  let d = engineNext - audioNext
  while (d > beatDur / 2) d -= beatDur
  while (d < -beatDur / 2) d += beatDur
  return Math.max(-maxNudge, Math.min(maxNudge, d))
}

/** MINOR-pentatonic degrees — the game's "can't sound bad" melodic alphabet.
 *  Minor, not major (round 7): the bed now plays a real minor-key chord
 *  progression (see CHORDS), and every degree of the minor pentatonic is
 *  diatonic to A natural minor — player chimes can never rub against the
 *  i/VI/III/VII/iv harmony underneath them. */
export const PENT = [0, 3, 5, 7, 10]

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

// ----------------------------------------------------- arrangement state machine

export type Section = 'intro' | 'groove' | 'build' | 'drop'
export interface ArrState { section: Section; barsLeft: number }

/** A drop rides this many bars before settling back into the groove. Four
 *  bars (round 7, up from two): a two-bar drop was over before the ear could
 *  believe it — a real drop needs a full phrase to land. */
export const DROP_BARS = 4
/** Bars of groove required between drops — a drop that fires constantly is
 *  just a loud groove. */
export const DROP_COOLDOWN_BARS = 8
/** Intensity at which the sparse intro hands over to the groove. */
export const INTRO_EXIT = 0.08

/** One bar-line tick of the arrangement machine. Called at every step 0.
 *  intro → groove on intensity; a queued drop turns the NEXT bar into a
 *  one-bar build, then DROP_BARS of drop, then groove. Pure. */
export function nextArrangement(prev: ArrState, intens: number, dropQueued: boolean): ArrState {
  if (prev.section === 'build') {
    if (prev.barsLeft > 1) return { section: 'build', barsLeft: prev.barsLeft - 1 }
    return { section: 'drop', barsLeft: DROP_BARS }
  }
  if (prev.section === 'drop') {
    if (prev.barsLeft > 1) return { section: 'drop', barsLeft: prev.barsLeft - 1 }
    return { section: 'groove', barsLeft: 0 }
  }
  if (dropQueued) return { section: 'build', barsLeft: 1 }
  if (prev.section === 'intro') {
    return intens >= INTRO_EXIT ? { section: 'groove', barsLeft: 0 } : prev
  }
  return prev
}

/** Which 16th steps of the bar the kick lands on, per section. The drop earns
 *  its punch with extra syncopated hits; the intro is a half-time heartbeat.
 *  Every kick also fires the sidechain duck, so this list IS the pump. Pure. */
export function kickStepsFor(section: Section, intens: number): number[] {
  if (section === 'intro') return [0, 8]
  if (section === 'build') return [0, 4, 8, 12]
  if (section === 'drop') return intens >= 0.5 ? [0, 4, 8, 10, 12, 14] : [0, 4, 8, 10, 12]
  return intens >= 0.72 ? [0, 4, 8, 12, 14] : [0, 4, 8, 12]
}

// -------------------------------------------------------- harmony (round 7)
// The round-6 bed was one transposed cell — no harmonic movement, the owner
// heard it. The bed now walks a REAL minor-key progression, one chord per
// bar over an 8-bar phrase, with the pad voiced in thirds/fifths and led
// note-to-note (no voice ever moves more than 3 semitones between bars), and
// the bass following the chord roots underneath.

export interface Chord {
  /** Chord root in semitones above the key root (the bass plays this). */
  root: number
  /** Three pad voices in semitones above the key root — hand-led so adjacent
   *  bars share tones and every move is stepwise. */
  voices: number[]
}

/** i – VI – III – VII | i – VI – iv – VII in the minor key: the first half is
 *  the classic epic loop, the second half turns through iv so the 8-bar
 *  phrase has a question AND an answer instead of a photocopy. */
export const CHORDS: Chord[] = [
  { root: 0, voices: [7, 12, 15] },    // i   : E  A  C
  { root: 8, voices: [8, 12, 15] },    // VI  : F  A  C   (one voice moves 1)
  { root: 3, voices: [7, 10, 15] },    // III : E  G  C
  { root: 10, voices: [5, 10, 14] },   // VII : D  G  B
  { root: 0, voices: [7, 12, 15] },    // i
  { root: 8, voices: [8, 12, 15] },    // VI
  { root: 5, voices: [8, 12, 17] },    // iv  : F  A  D   (the phrase turn)
  { root: 10, voices: [10, 14, 17] },  // VII : G  B  D
]

/** The chord under a given bar. Pure. */
export function chordFor(bar: number): Chord {
  return CHORDS[((bar % CHORDS.length) + CHORDS.length) % CHORDS.length]
}

/** Bass patterns: 8 slots of semitone offsets ABOVE THE CURRENT CHORD ROOT
 *  (8th notes). Offsets stay on root/fifth/octave so the line is consonant
 *  under every chord of the progression while the roots carry the harmonic
 *  walk. The phrase is AAAB AABC over 8 bars — variation the ear notices
 *  without losing the hook. Pure. */
const BASS_A = [0, 0, 12, 0, 7, 0, 12, 7]
const BASS_B = [0, 12, 0, 12, 7, 12, 0, 12]
const BASS_C = [0, 7, 12, 7, 12, 7, 19, 12]   // the lift at the phrase turn
export function bassRiffFor(bar: number): number[] {
  const pos = ((bar % 8) + 8) % 8
  if (pos === 3 || pos === 7) return pos === 7 ? BASS_C : BASS_B
  return pos < 4 ? BASS_A : pos === 6 ? BASS_B : BASS_A
}

/** Arpeggio degree for a 16th step: chord tones up-down (v0 v1 v2 v1), lifted
 *  an octave on the back half of the bar — the synthwave sparkle line. Pure. */
export function arpDegree(chord: Chord, step: number): number {
  const seq = [0, 1, 2, 1]
  const v = chord.voices[seq[step % 4]]
  return step % 8 >= 4 ? v + 12 : v
}

/** Bed level per section — the arrangement's macro-dynamics. The intro is a
 *  murmur, the drop is a wall: this staging (not just extra notes) is what
 *  buys the drop-vs-intro contrast a listener actually feels. Pure. */
export function sectionLevel(section: Section): number {
  if (section === 'intro') return 0.5
  if (section === 'build') return 1.0
  if (section === 'drop') return 1.3
  return 0.92
}

/** Generated tanh saturation curve for the master WaveShaper — the "glue"
 *  that makes raw oscillators read as produced. Pure. */
export function saturationCurve(n = 1024, drive = 1.7): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n)
  const norm = Math.tanh(drive)
  for (let k = 0; k < n; k++) {
    const x = (k / (n - 1)) * 2 - 1
    c[k] = Math.tanh(drive * x) / norm
  }
  return c
}

/** Fill a buffer channel with an exponentially decaying noise tail — the
 *  generated impulse response for the convolver reverb. Pure (given data). */
export function fillImpulse(data: Float32Array, decay = 4.2): void {
  const n = data.length
  for (let k = 0; k < n; k++) {
    data[k] = (Math.random() * 2 - 1) * Math.exp(-decay * (k / n))
  }
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
  private shaper: WaveShaperNode | null = null
  private comp: DynamicsCompressorNode | null = null
  private musicBus: GainNode | null = null
  private fxBus: GainNode | null = null
  private drumBus: GainNode | null = null
  /** Pad + bass + player lead: the sidechain target. Dipped by every kick. */
  private duckBus: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private reverbSend: GainNode | null = null
  private reverbReturn: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null

  // Persistent chord pad (round 7): three voices × two detuned saws (six
  // oscillators, ±5 cents — the width stack), each voice through its own
  // stereo panner (L/C/R spread), all through one lowpass that opens with
  // intensity and breathes under a slow LFO (filter movement where a static
  // drone used to sit). Voices are RETUNED at every bar line to the current
  // chord of the progression — the pad IS the harmonic movement. Built once
  // per context; parameters automated, never re-created.
  private padOscs: OscillatorNode[] = []
  private droneFilter: BiquadFilterNode | null = null
  private droneGain: GainNode | null = null
  private lfo: OscillatorNode | null = null

  /** Current bed target level: 0.85 × sectionLevel(section). Every music-bus
   *  automation (duck, pause, resume, staging) aims at THIS, so speech ducks
   *  and section dynamics compose instead of fighting. */
  private bedLevel = 0.85 * sectionLevel('intro')

  // Sequencer state.
  private schedulerId: number | null = null
  private nextNoteTime = 0
  private step = 0
  private bar = 0
  private shift = 0            // current semitone key shift; changes only at bar starts
  private pendingKey: number | null = null   // noticed a beat early; adopted at step 0
  private beatOn = false
  private intensityV = 0

  // Arrangement state.
  private arr: ArrState = { section: 'intro', barsLeft: 0 }
  private dropQueued = false
  private lastDropBar = -999

  // Engine clock (feature-detected via syncClock; null = standalone fallback).
  private extBpm: number | null = null

  // Offline-render mode (tools/listen.mjs): an injected OfflineAudioContext.
  // When set, start() skips resume() and the wall-clock scheduler interval —
  // the renderer drives time itself via suspend()/renderPump()/resume().
  private offline = false

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

  // Label → window scale/inhibit/action, built lazily from the real specs.
  private specMap: Map<string, { scale: number; inhibit: boolean; action: Action }> | null = null

  private _muted = false
  /** Mute is live, not advisory: the persistent layers (drone pad, music bus)
   *  are gain-ramped on toggle, because one-shot guards alone leave the pad
   *  sounding for a SOUND OFF player (round-6 critic defect). */
  get muted(): boolean { return this._muted }
  set muted(m: boolean) {
    if (m === this._muted) return
    this._muted = m
    if (!this.ctx) return
    const t = this.ctx.currentTime
    if (this.droneGain) {
      this.droneGain.gain.cancelScheduledValues(t)
      this.droneGain.gain.setTargetAtTime(m ? 0.0001 : this.padLevel(), t, 0.15)
    }
    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(t)
      this.musicBus.gain.setTargetAtTime(m ? 0.0001 : this.bedLevel, t, 0.15)
    }
    if (m && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }

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
    if (this.ctx.state === 'suspended' && !this.offline) void this.ctx.resume()
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
    this.pendingKey = null
    this.arr = { section: 'intro', barsLeft: 0 }
    this.dropQueued = false
    this.lastDropBar = -999
    this.nextNoteTime = this.ctx.currentTime + 0.06
    this.beatOn = true
    this.bedLevel = 0.85 * sectionLevel('intro')
    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime)
      this.musicBus.gain.setValueAtTime(0.0001, this.ctx.currentTime)
      this.musicBus.gain.exponentialRampToValueAtTime(this.bedLevel, this.ctx.currentTime + 0.5)
    }
    if (this.duckBus) {
      this.duckBus.gain.cancelScheduledValues(this.ctx.currentTime)
      this.duckBus.gain.setValueAtTime(1, this.ctx.currentTime)
    }
    if (this.droneGain && this.droneFilter && this.padOscs.length > 0) {
      const t = this.ctx.currentTime
      this.tunePad(chordFor(0), t, true)
      // Warmer than before: the opening pad is quiet but unmistakably THERE
      // (calm is not silence — the early-run presence fix).
      this.droneFilter.frequency.setValueAtTime(420, t)
      this.droneGain.gain.setValueAtTime(0.0001, t)
      if (!this.muted) this.droneGain.gain.exponentialRampToValueAtTime(this.padLevel(), t + 1.2)
    }
    if (this.schedulerId === null && !this.offline) {
      this.schedulerId = window.setInterval(() => this.schedule(), 25)
    }
  }

  // --------------------------------------------------------- offline render
  // RENDER ENTRYPOINT for tools/listen.mjs — the pipeline's ears. The live
  // path is untouched: start() still lazily creates a real AudioContext when
  // nothing was injected, and no public signature changed.

  /** Inject a BaseAudioContext (an OfflineAudioContext) BEFORE start(). The
   *  full production graph (buses, saturation, compressor, reverb, drone) is
   *  built onto it, so what renders is the REAL mix, not a copy. In offline
   *  mode start() will not resume() the context (illegal before rendering
   *  begins) and will not arm the wall-clock scheduler interval — the caller
   *  suspends the offline context on a cadence and calls renderPump() at each
   *  suspension so the lookahead sequencer keeps pace with rendered time. */
  attachRenderContext(ctx: BaseAudioContext): void {
    this.ctx = ctx as AudioContext
    this.offline = true
    this.buildGraph()
  }

  /** One scheduler pass for offline rendering. Call once after start() and
   *  again at every OfflineAudioContext suspension. No-op on the live path
   *  (the interval owns scheduling there). */
  renderPump(): void {
    if (this.offline) this.schedule()
  }

  private buildGraph(): void {
    const ctx = this.ctx!
    // Master chain: master → saturation → compressor → out. The shaper's
    // generated tanh curve rounds the raw oscillator edges (produced, not
    // programmed); the compressor glues the buses.
    this.master = ctx.createGain()
    this.master.gain.value = 0.52
    this.comp = ctx.createDynamicsCompressor()
    this.comp.threshold.value = -18
    this.comp.knee.value = 24
    this.comp.ratio.value = 5
    this.comp.attack.value = 0.003
    this.comp.release.value = 0.18
    let head: AudioNode = this.master
    if (typeof ctx.createWaveShaper === 'function') {
      this.shaper = ctx.createWaveShaper()
      this.shaper.curve = saturationCurve()
      this.shaper.oversample = '2x'
      head.connect(this.shaper)
      head = this.shaper
    }
    // Post-compressor trim: Chrome's DynamicsCompressor applies automatic
    // makeup gain, so cutting level BEFORE it is silently undone — the only
    // reliable peak ceiling is a trim AFTER it (measured: pre-comp cuts moved
    // the peak by a quarter of their value; this trim moves it 1:1).
    const post = ctx.createGain()
    post.gain.value = 0.78
    head.connect(this.comp).connect(post).connect(ctx.destination)

    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = 0.85
    this.musicBus.connect(this.master)
    this.fxBus = ctx.createGain()
    // Slightly under the bed's ceiling: earcons must CUT, not dominate the
    // spectrum (they are mid-band and were crowding the mix's balance).
    this.fxBus.gain.value = 0.85
    this.fxBus.connect(this.master)
    // Drums inside the music bus (they duck under speech with everything else).
    this.drumBus = ctx.createGain()
    this.drumBus.gain.value = 1
    this.drumBus.connect(this.musicBus)
    // Sidechain target: pad, bass, player lead. Kicks dip this.
    this.duckBus = ctx.createGain()
    this.duckBus.gain.value = 1
    this.duckBus.connect(this.musicBus)

    // Generated-impulse convolver reverb as a send/return pair.
    if (typeof ctx.createConvolver === 'function') {
      this.reverb = ctx.createConvolver()
      const ir = ctx.createBuffer(2, Math.max(1, Math.floor(ctx.sampleRate * 0.7)), ctx.sampleRate)
      fillImpulse(ir.getChannelData(0))
      fillImpulse(ir.getChannelData(1))
      this.reverb.buffer = ir
      this.reverbSend = ctx.createGain()
      this.reverbSend.gain.value = 1
      this.reverbReturn = ctx.createGain()
      this.reverbReturn.gain.value = 0.22
      this.reverbSend.connect(this.reverb)
      this.reverb.connect(this.reverbReturn)
      this.reverbReturn.connect(this.master)
    }

    // Shared half-second white-noise buffer for hats/snares/crashes.
    const len = Math.floor(ctx.sampleRate * 0.5)
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let k = 0; k < len; k++) d[k] = Math.random() * 2 - 1

    // Chord pad — three voices × two detuned saws through per-voice panners
    // into one moving lowpass, on the duck bus so every kick pumps it. The
    // voices are retuned to the chord progression at every bar line.
    this.droneFilter = ctx.createBiquadFilter()
    this.droneFilter.type = 'lowpass'
    this.droneFilter.frequency.value = 420
    this.droneFilter.Q.value = 0.9
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0.0001
    this.droneFilter.connect(this.droneGain).connect(this.duckBus)
    this.padOscs = []
    const pans = [-0.55, 0, 0.55]
    const canPan = typeof ctx.createStereoPanner === 'function'
    for (let v = 0; v < 3; v++) {
      let dest: AudioNode = this.droneFilter
      if (canPan) {
        const p = ctx.createStereoPanner()
        p.pan.value = pans[v]
        p.connect(this.droneFilter)
        dest = p
      }
      for (const det of [-1, 1]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = 220
        if ('detune' in o) o.detune.value = det * 5   // ±5 cents: the width stack
        o.connect(dest)
        o.start()
        this.padOscs.push(o)
      }
    }
    // Slow filter LFO: ±160Hz breath at 0.11Hz, so no section ever sits on a
    // frozen timbre.
    this.lfo = ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 0.11
    const lg = ctx.createGain()
    lg.gain.value = 160
    this.lfo.connect(lg)
    lg.connect(this.droneFilter.frequency)
    this.lfo.start()
  }

  /** Pad loudness law: quiet but present when calm, swelling with the run. */
  private padLevel(): number {
    return 0.06 + this.intensityV * 0.05
  }

  /** Retune the six pad oscillators to a chord's three voices (a pair per
   *  voice, ±5 cents). A short glide (20ms) avoids clicks while staying
   *  tight to the bar line; `hard` snaps instantly (run start). */
  private tunePad(chord: Chord, t: number, hard = false): void {
    const base = 110 * Math.pow(2, this.shift / 12)
    for (let v = 0; v < 3; v++) {
      const f = base * Math.pow(2, chord.voices[v] / 12)
      for (const o of [this.padOscs[v * 2], this.padOscs[v * 2 + 1]]) {
        if (!o) continue
        if (hard) {
          o.frequency.cancelScheduledValues(t)
          o.frequency.setValueAtTime(f, t)
        } else {
          o.frequency.setTargetAtTime(f, t, 0.02)
        }
      }
    }
  }

  // ---------------------------------------------------------------- helpers

  /** One-shot source with self-cleanup: everything in `chain` disconnects when
   *  the source ends, so long sessions never accumulate nodes. */
  private fire(src: AudioScheduledSourceNode, chain: AudioNode[], stopAt: number, cancellable = false): void {
    src.onended = () => {
      // Offline renders skip the disconnect: `ended` is delivered on the main
      // thread while the offline render thread races ahead of realtime, so the
      // disconnect would land at a nondeterministic rendered time and chop
      // ringing biquad tails differently on every run (LISTEN's repeatability
      // bound depends on this). A render is bounded (≤60s), so node
      // accumulation is harmless there; the live path cleans up as before.
      if (!this.offline) {
        src.disconnect()
        for (const n of chain) n.disconnect()
      }
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

  /** A single enveloped oscillator note. `send` (0..1) taps the post-envelope
   *  signal into the reverb send — the tap gain joins the cleanup chain. */
  private note(opts: {
    at?: number; freq: number; endFreq?: number; durMs: number
    type?: OscillatorType; gain?: number; pan?: number
    dest?: AudioNode | null; cancellable?: boolean; attackMs?: number
    send?: number
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
    if (opts.send && this.reverbSend) {
      const sg = ctx.createGain()
      sg.gain.value = opts.send
      tail.connect(sg)
      sg.connect(this.reverbSend)
      chain.push(sg)
    }
    tail.connect(opts.dest ?? this.fxBus ?? this.master!)
    o.start(t)
    this.fire(o, chain, t + dur + 0.05, opts.cancellable)
  }

  /** Filtered noise burst (hats, snares, impacts). Same `send` as note(). */
  private noise(opts: {
    at?: number; durMs: number; gain?: number
    filter?: BiquadFilterType; freq?: number; endFreq?: number; q?: number
    dest?: AudioNode | null; send?: number
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
    const chain: AudioNode[] = [f, g]
    src.connect(f).connect(g)
    if (opts.send && this.reverbSend) {
      const sg = ctx.createGain()
      sg.gain.value = opts.send
      g.connect(sg)
      sg.connect(this.reverbSend)
      chain.push(sg)
    }
    g.connect(opts.dest ?? this.fxBus ?? this.master!)
    src.start(t)
    this.fire(src, chain, t + dur + 0.05)
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
    return nextGridTime(now, this.nextNoteTime, this.stepDur())
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

  private specFor(label: string): { scale: number; inhibit: boolean; action: Action } {
    if (!this.specMap) {
      this.specMap = new Map()
      for (const s of available(Number.MAX_SAFE_INTEGER)) {
        this.specMap.set(s.label.toUpperCase(),
          { scale: s.windowScale ?? 1, inhibit: !!s.inhibit, action: s.action })
      }
    }
    return this.specMap.get(label.toUpperCase()) ?? { scale: 1, inhibit: false, action: 'tap' }
  }

  /** The ACTUAL response window for this command, from the real curve: the
   *  caller passes intensity(issued) (post-increment), the command was built
   *  at issued-1, and per-action windowScale AND the additive gesture-latency
   *  budget are applied — matching commands.nextCommand exactly, so a FLIP
   *  countdown neither finishes early nor ignores the physical cost of the
   *  flip itself (round-5 defect 4). */
  private windowMsFor(label: string, i: number): number {
    const spec = this.specFor(label)
    if (spec.inhibit) return INHIBIT_WINDOW
    const issued = Math.max(0, this.issuedFrom(i) - 1)
    return Math.round(windowFor(issued) * spec.scale) + gestureLatencyMs(spec.action)
  }

  // ------------------------------------------------------------- sequencer

  private bpm(): number {
    // The engine's beat clock wins when present (syncClock feature-detects
    // it); standalone, tempo rides the intensity ramp as before.
    if (this.extBpm !== null) return this.extBpm
    return 96 + 84 * this.intensityV   // 96 → 180
  }

  private stepDur(): number {
    return 60 / this.bpm() / 4
  }

  /** Semitone key shift rises through a minor scale with intensity. This is
   *  the TARGET; the sequencer notices it a beat early (riser) and adopts it
   *  only at bar starts, with a crash — musical, never abrupt. */
  private keyTarget(): number {
    const steps = [0, 2, 3, 5, 7]
    return steps[Math.min(steps.length - 1, Math.floor(this.intensityV * steps.length))]
  }

  private schedule(): void {
    if (!this.ctx || !this.beatOn) return
    const now = this.ctx.currentTime
    // Backgrounded-tab fix: more than a bar behind = re-anchor, don't blast.
    this.nextNoteTime = clampCatchUp(this.nextNoteTime, now, this.stepDur() * 16)
    const horizon = now + 0.12
    while (this.nextNoteTime < horizon) {
      if (!this.muted) this.scheduleStep(this.step, this.nextNoteTime)
      this.nextNoteTime += this.stepDur()   // one 16th note
      this.step = (this.step + 1) % 16
      if (this.step === 0) this.bar++
    }
  }

  /** Ask the arrangement for a drop at the next bar line (one-bar build
   *  first). Ignored mid-build/drop and inside the cooldown — drops must stay
   *  events, not wallpaper. Called by gameplay: a x10/x15 perfect chain, or
   *  the final-life clutch. */
  queueDrop(): void {
    if (this.arr.section === 'build' || this.arr.section === 'drop') return
    if (this.bar - this.lastDropBar < DROP_COOLDOWN_BARS) return
    this.dropQueued = true
  }

  private scheduleStep(step: number, t: number): void {
    const i = this.intensityV
    const stepDur = this.stepDur()

    // Bar line: tick the arrangement machine, adopt any pending key change.
    if (step === 0) {
      const prevSection = this.arr.section
      this.arr = nextArrangement(this.arr, i, this.dropQueued)
      if (this.arr.section === 'build' && prevSection !== 'build') this.dropQueued = false
      if (this.arr.section === 'drop' && prevSection !== 'drop') {
        this.lastDropBar = this.bar
        this.dropHit(t, i)
      }
      if (this.arr.section === 'build' && prevSection !== 'build') {
        // Full-bar riser into the drop: the promise.
        this.riser(t, stepDur * 16, 0.16)
      }
      if (this.pendingKey !== null) {
        this.shift = this.pendingKey
        this.pendingKey = null
        this.crash(t)
      } else {
        const target = this.keyTarget()
        if (target !== this.shift) {   // jumped a whole bar inside one beat: still bar-aligned
          this.shift = target
          this.crash(t)
        }
      }
    }
    // A beat before the bar line: notice an impending key change and sweep
    // into it, so the change arrives announced (round-5 critic fix).
    if (step === 12 && this.pendingKey === null) {
      const target = this.keyTarget()
      if (target !== this.shift) {
        this.pendingKey = target
        this.riser(t, stepDur * 4, 0.09)
      }
    }

    const sec = this.arr.section
    const root = 55 * Math.pow(2, this.shift / 12)
    const chord = chordFor(this.bar)
    const chordRoot = root * Math.pow(2, chord.root / 12)

    // Bar line, part 2: the pad walks to this bar's chord (the harmonic
    // movement is AUDIBLE — six oscillators glide to the new voicing), and
    // the whole bed steps to the section's macro level.
    if (step === 0) {
      this.tunePad(chord, t)
      this.bedLevel = 0.85 * sectionLevel(sec)
      if (this.musicBus && !this.muted) this.musicBus.gain.setTargetAtTime(this.bedLevel, t, 0.1)
    }

    // ---- drums ------------------------------------------------------------
    if (kickStepsFor(sec, i).includes(step)) {
      this.kick(t, sec === 'drop' ? 0.68 : sec === 'intro' ? 0.3 : 0.55)
    }

    // Hats: closed metallic ticks on the off-8ths from command one (presence,
    // not pressure) over a 16th shaker bed of air; 16ths harden once the heat
    // is on; open sizzles ride the off-beats of a drop.
    if (step % 4 === 2) {
      if (sec === 'drop') this.hat(t, true, 0.13)
      else this.hat(t, false, sec === 'intro' ? 0.075 : 0.08 + i * 0.05)
    }
    if (step % 2 === 1) {
      // Shaker air on every off-16th — the top of the mix breathes even in
      // the intro (the round-6 bed had almost no energy above 6kHz).
      this.noise({ at: t, durMs: 22, gain: sec === 'intro' ? 0.04 : 0.028 + i * 0.02, filter: 'highpass', freq: 9200, dest: this.drumBus })
    }
    if ((i >= 0.5 || sec === 'build' || sec === 'drop') && step % 2 === 1) {
      this.hat(t, false, sec === 'drop' ? 0.05 : 0.04)
    }

    // Snare: backbeat in groove/drop; roll that builds across a build bar —
    // then TWO STEPS OF SILENCE (14-15): the throw before the drop lands.
    if (sec === 'build') {
      if (step <= 13 && (step < 8 ? step % 2 === 0 : true)) {
        const frac = step / 13
        this.snare(t, 0.06 + frac * 0.15, 1500 + frac * 1300)
      }
    } else if ((sec === 'drop' || i >= 0.38) && sec !== 'intro' && (step === 4 || step === 12)) {
      this.snare(t, sec === 'drop' ? 0.22 : 0.18, 1900)
    }

    // Fill: every 4th groove bar ends with four rising 16th snares.
    if (sec === 'groove' && i >= 0.3 && this.bar % 4 === 3 && step >= 12) {
      const k = step - 12
      this.snare(t, 0.08 + k * 0.025, 1400 + k * 500)
    }

    // ---- pads -------------------------------------------------------------
    // Calm-act pluck bells: below the ramp's first act the bar breathes —
    // this bar's chord tones, voiced high and soft, so even the opening
    // heartbeat carries the progression.
    if (i < 0.3 && sec !== 'drop' && step === 0) {
      this.note({ at: t, freq: root * 4 * Math.pow(2, chord.voices[1] / 12), durMs: 460, type: 'sine', gain: 0.05, dest: this.duckBus, attackMs: 12, send: 0.25 })
    }
    if (i < 0.3 && sec !== 'drop' && step === 8) {
      this.note({ at: t, freq: root * 4 * Math.pow(2, chord.voices[2] / 12), durMs: 420, type: 'sine', gain: 0.038, dest: this.duckBus, attackMs: 12, send: 0.25 })
    }
    // Intro air: a slow-swelling wash of tape-hiss high noise each beat — the
    // opening had literally 0.5% of its energy above 6kHz; this is the sheen.
    if (sec === 'intro' && step % 4 === 0) {
      this.noise({ at: t, durMs: 620, gain: 0.08, filter: 'highpass', freq: 8800, dest: this.drumBus })
    }
    // Intro heartbeat sub: a warm chord-root pulse under the half-time kick,
    // so the calm act keeps a floor (the bass line hasn't entered yet).
    if (sec === 'intro' && (step === 0 || step === 8)) {
      this.note({ at: t, freq: chordRoot * 2, durMs: 220, type: 'sine', gain: 0.6, dest: this.drumBus, attackMs: 6 })
    }

    // ARPEGGIO: chord tones up-down on the 8ths once the groove is hot, every
    // 16th through a build and a drop — the sparkle line that makes the
    // harmony audible at speed. Register sits above the pad, below the chimes.
    const arpOn = sec === 'drop' || sec === 'build' || (sec === 'groove' && i >= 0.42)
    if (arpOn && (sec === 'drop' ? true : step % 2 === 0)) {
      const deg = arpDegree(chord, step)
      this.note({
        at: t, freq: root * 8 * Math.pow(2, deg / 12), durMs: 85,
        type: 'square', gain: sec === 'drop' ? 0.055 : 0.04, dest: this.duckBus, attackMs: 1, send: 0.12,
      })
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
        type: 'triangle', gain: 0.05 + i * 0.025, dest: this.duckBus, attackMs: 4, send: 0.2,
      })
    }

    // ---- bass -------------------------------------------------------------
    // 8th-note riff rotating per bar (AAAB/AABC phrase) UNDER THE CHORD ROOT
    // — the bass walks the progression with the pad — every note through its
    // own closing lowpass (the squelch). A drop slams it down an octave and
    // adds off-16th ghosts; a build goes tacet in its second half so the
    // drop has somewhere to land. Starts once the run warms up.
    if (i >= 0.26 && sec !== 'intro' && !(sec === 'build' && step >= 8)) {
      const riff = bassRiffFor(this.bar)
      const oct = sec === 'drop' ? 0.5 : 1
      const cutoff = (sec === 'drop' ? 1400 : 700) + i * 2600
      // The drop dives an octave, but never below ~40Hz — energy under that
      // is invisible on phone speakers AND on the meters; fold it back up.
      const bassFreq = (semis: number) => {
        let f = chordRoot * oct * Math.pow(2, semis / 12)
        while (f < 40) f *= 2
        return f
      }
      if (step % 2 === 0) {
        this.bassNote(t, bassFreq(riff[(step / 2) % riff.length]), 0.13 + i * 0.05, cutoff)
      } else if (sec === 'drop' || i >= 0.62) {
        this.bassNote(t, bassFreq(riff[((step - 1) / 2) % riff.length]), 0.06, cutoff * 0.7)
      }
    }
  }

  /** 808-lineage kick, rebuilt for chest (round 7): a faster, harder pitch
   *  envelope (190→44Hz in 90ms — the low band spikes and GETS OUT instead of
   *  smearing into the sustain window), a triangle knock (the beater), and a
   *  noise click transient, through the drum bus — and every hit pumps the
   *  duck bus (sidechain). */
  private kick(t: number, gain: number): void {
    this.note({ at: t, freq: 190, endFreq: 44, durMs: 90, type: 'sine', gain: gain * 1.3, dest: this.drumBus, attackMs: 1 })
    this.note({ at: t, freq: 1050, endFreq: 190, durMs: 22, type: 'triangle', gain: gain * 0.35, dest: this.drumBus, attackMs: 1 })
    this.noise({ at: t, durMs: 14, gain: gain * 0.55, filter: 'highpass', freq: 4200, dest: this.drumBus })
    this.sidechain(t)
  }

  /** Sidechain-style pump: dip the pad/bass/lead bus hard and fast on the
   *  kick, recover exponentially — the EDM breathing, via gain automation.
   *  Deeper and tighter than round 6 (0.22 floor): the pump is the glue AND
   *  it clears the low band around each kick so the transient reads. */
  private sidechain(t: number): void {
    if (!this.ctx || !this.duckBus) return
    const g = this.duckBus.gain
    g.setValueAtTime(1, t)
    g.linearRampToValueAtTime(0.22, t + 0.018)
    g.setTargetAtTime(1, t + 0.05, 0.075)
  }

  /** Snare: tuned triangle body under a bandpassed noise splash, with a
   *  reverb send so backbeats bloom instead of stopping dead. */
  private snare(t: number, gain: number, tone: number): void {
    this.noise({ at: t, durMs: 110, gain, filter: 'bandpass', freq: tone, q: 0.9, dest: this.drumBus, send: 0.35 })
    this.note({ at: t, freq: 195, endFreq: 158, durMs: 70, type: 'triangle', gain: gain * 0.7, dest: this.drumBus })
  }

  /** Metallic hat: two inharmonic square partials + filtered noise. Closed is
   *  a tick; open sizzles out for a beat. */
  private hat(t: number, open: boolean, gain: number): void {
    const dur = open ? 180 : 32
    this.note({ at: t, freq: 5170, durMs: dur, type: 'square', gain: gain * 0.35, attackMs: 1, dest: this.drumBus })
    this.note({ at: t, freq: 7331, durMs: dur, type: 'square', gain: gain * 0.22, attackMs: 1, dest: this.drumBus })
    this.noise({ at: t, durMs: dur + 8, gain, filter: 'highpass', freq: open ? 7200 : 8600, dest: this.drumBus })
  }

  /** One bass note through its own closing lowpass — the filter envelope that
   *  gives the line movement — plus a sine SUB layer an octave under the saw
   *  (round 7: the fast new kick cleared the low band so completely that the
   *  mix lost its floor; the sub puts the chest back under the squelch).
   *  All per-note nodes self-clean via fire(). */
  private bassNote(t: number, freq: number, gain: number, cutoff: number): void {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const at = Math.max(ctx.currentTime, t)
    const dur = 0.11
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(freq, at)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 7
    f.frequency.setValueAtTime(Math.max(120, cutoff), at)
    f.frequency.exponentialRampToValueAtTime(140, at + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(f).connect(g).connect(this.duckBus ?? this.musicBus ?? this.master!)
    o.start(at)
    this.fire(o, [f, g], at + dur + 0.05)
    // The sub rides the DRUM bus, not the duck bus: bass hits land on the
    // same steps as kicks, so a duck-bus sub would be sidechained into
    // silence at exactly the moments it exists to fill.
    this.note({ at, freq, durMs: 130, type: 'sine', gain: gain * 1.7, dest: this.drumBus, attackMs: 3 })
  }

  /** Sweeping riser: noise climbing through a highpass plus a rising saw —
   *  the announcement that a bar line is about to matter (key change small,
   *  drop build full-bar). */
  private riser(t: number, durS: number, gain: number): void {
    if (!this.ctx || this.muted) return
    const ms = durS * 1000
    this.noise({ at: t, durMs: ms, gain, filter: 'highpass', freq: 380, endFreq: 6400, q: 1.2, dest: this.drumBus, send: 0.2 })
    this.note({ at: t, freq: 220, endFreq: 880, durMs: ms, type: 'sawtooth', gain: gain * 0.45, dest: this.duckBus, attackMs: ms * 0.3 })
  }

  /** The drop lands: crash, sub boom, a wide detuned-saw chord stab on this
   *  bar's chord, and the pad filter thrown wide then settling — the filter
   *  sweep that makes it a DROP, not just louder. */
  private dropHit(t: number, i: number): void {
    this.crash(t)
    this.note({ at: t, freq: 100, endFreq: 33, durMs: 500, type: 'sine', gain: 0.42, dest: this.drumBus, attackMs: 2 })
    // The stab: the current chord slammed as three detuned-saw dyads, panned
    // wide, blooming in the reverb — the "arrival" a drop promises.
    const chord = chordFor(this.bar)
    const base = 110 * Math.pow(2, this.shift / 12)
    for (let v = 0; v < 3; v++) {
      const f = base * 2 * Math.pow(2, chord.voices[v] / 12)
      const pan = [-0.6, 0, 0.6][v]
      this.note({ at: t, freq: f * 0.997, durMs: 420, type: 'sawtooth', gain: 0.055, pan, dest: this.duckBus, attackMs: 2, send: 0.3 })
      this.note({ at: t, freq: f * 1.003, durMs: 420, type: 'sawtooth', gain: 0.055, pan: -pan, dest: this.duckBus, attackMs: 2 })
    }
    if (this.ctx && this.droneFilter && this.beatOn) {
      const f = this.droneFilter.frequency
      f.cancelScheduledValues(t)
      f.setValueAtTime(5600, t)
      f.setTargetAtTime(420 + i * i * 3700, t + 0.1, 0.6)
    }
  }

  /** Crash marker (key changes, drops): bright noise splash + low boom, with
   *  a long reverb tail. */
  private crash(t: number): void {
    this.noise({ at: t, durMs: 480, gain: 0.14, filter: 'highpass', freq: 4200, endFreq: 9000, dest: this.drumBus, send: 0.4 })
    this.note({ at: t, freq: 180, endFreq: 50, durMs: 240, type: 'sine', gain: 0.3, dest: this.drumBus, attackMs: 2 })
  }

  /** Briefly duck the music bed (under speech, or hard after a failure).
   *  Anchored to bedLevel, so a duck during a drop recovers to DROP loudness
   *  and a duck in the intro recovers to a murmur — the announcer stays
   *  intelligible over the round-7 fuller mix without flattening its arc. */
  private duck(to: number, holdS: number): void {
    if (!this.ctx || !this.musicBus) return
    const t = this.ctx.currentTime
    const g = this.musicBus.gain
    g.cancelScheduledValues(t)
    g.setTargetAtTime(this.bedLevel * to, t, 0.03)
    g.setTargetAtTime(this.bedLevel, t + holdS, 0.25)
  }

  // ------------------------------------------------------------ engine clock

  /** Feature-detecting lock onto the engine's beat clock. Call every frame
   *  with GameState (or anything): if it carries bpm (and optionally
   *  beatPhase 0..1), the sequencer adopts the tempo and gently nudges its
   *  grid onto the engine's beat; if not, nothing changes — the audio module
   *  stays fully standalone. */
  syncClock(state: unknown): void {
    if (!state || typeof state !== 'object') return
    const o = state as { bpm?: unknown; beatPhase?: unknown }
    this.extBpm = typeof o.bpm === 'number' && isFinite(o.bpm) && o.bpm >= 40 && o.bpm <= 300
      ? o.bpm : null
    if (this.extBpm === null || !this.ctx || !this.beatOn) return
    if (typeof o.beatPhase !== 'number' || !isFinite(o.beatPhase)) return
    const beatDur = 60 / this.extBpm
    const phase = ((o.beatPhase % 1) + 1) % 1
    const engineNext = this.ctx.currentTime + (1 - phase) * beatDur
    const stepsToBeat = (4 - (this.step % 4)) % 4
    const audioNext = this.nextNoteTime + stepsToBeat * this.stepDur()
    this.nextNoteTime += clockNudge(engineNext, audioNext, beatDur, 0.008)
  }

  // ------------------------------------------------------------ pause/resume

  /** The shell froze the world mid-command (phone call, app switch, pause
   *  screen). Cancel the in-flight countdown/anticipation ticks — they were
   *  counting toward a deadline that is no longer running — and pull the bed
   *  back to a murmur. */
  pause(): void {
    if (!this.ctx) return
    this.cancelPending()
    if (this.musicBus && this.beatOn) {
      const t = this.ctx.currentTime
      this.musicBus.gain.cancelScheduledValues(t)
      this.musicBus.gain.setTargetAtTime(this.bedLevel * 0.35, t, 0.1)
    }
  }

  /** The world resumed with a FRESH window for the interrupted command
   *  (main.ts resets engine elapsed). Restore the bed and re-arm the
   *  countdown for the remaining window, so the ticking deadline matches the
   *  engine again (round-5 defect 3). */
  resume(windowMs?: number): void {
    if (!this.ctx) return
    if (this.musicBus && this.beatOn) {
      const t = this.ctx.currentTime
      this.musicBus.gain.cancelScheduledValues(t)
      this.musicBus.gain.setTargetAtTime(this.bedLevel, t, 0.15)
    }
    if (windowMs !== undefined && windowMs > 0 && !this.muted) this.countdown(windowMs)
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
      this.duck(0.6, 0.25)
      this.speakLine(bark, { rate: 2, pitch: inhibit ? 0.8 : 1.35 })
      return
    }

    this.duck(0.5, 0.45)
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
      // A rattling trill: ONE grid-aligned onset (round 7 — four discrete
      // 45ms notes used to shed off-grid onsets), the shake identity carried
      // by frequency alternation inside a single envelope.
      const ctx = this.ctx
      const o = ctx.createOscillator()
      o.type = 'square'
      for (let k = 0; k < 4; k++) o.frequency.setValueAtTime(k % 2 ? 1180 : 880, t0 + k * 0.045)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.004)
      g.gain.setValueAtTime(0.11, t0 + 0.15)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.19)
      o.connect(g)
      g.connect(this.fxBus ?? this.master!)
      o.start(t0)
      this.fire(o, [g], t0 + 0.24)
      return
    }
    if (L.includes('TWIST')) {
      // One continuous up-and-back sweep — a single onset that still draws
      // the "there and back" shape of the gesture.
      const ctx = this.ctx
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(620, t0)
      o.frequency.exponentialRampToValueAtTime(980, t0 + 0.09)
      o.frequency.exponentialRampToValueAtTime(620, t0 + 0.18)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.006)
      g.gain.setValueAtTime(0.14, t0 + 0.14)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
      o.connect(g)
      g.connect(this.fxBus ?? this.master!)
      o.start(t0)
      this.fire(o, [g], t0 + 0.23)
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
      // Low then high, the flip's two faces — the second note ONE 16TH later
      // so both onsets live on the grid.
      this.note({ at: t0, freq: 440, durMs: 70, type: 'square', gain: 0.12 })
      this.note({ at: t0 + this.stepDur(), freq: 880, durMs: 90, type: 'square', gain: 0.13 })
      return
    }
    // TAP and anything unrecognised: one bright poke.
    this.note({ at: t0, freq: 1320, durMs: 70, type: 'square', gain: 0.13 })
  }

  /** A quiet pulse that tracks the response window and accelerates toward the
   *  deadline. `windowMs` is the command's REAL window (curve × windowScale +
   *  gesture latency), so the last tick lands at the true deadline.
   *  Cancelled on resolve — and on pause (re-armed by resume). */
  private countdown(windowMs: number): void {
    if (!this.ctx) return
    const win = windowMs / 1000
    if (win < 0.45) return                    // music tempo carries urgency here
    const t0 = this.ctx.currentTime
    const n = 6
    const stepDur = this.stepDur()
    let prev = -1
    for (let k = 1; k <= n; k++) {
      // Quadratic spacing: ticks bunch up toward the deadline — then each
      // tick SNAPS to the 16th grid (round 7): the deadline pressure rides
      // inside the groove instead of fighting it. Snapped ticks that would
      // collide on one grid line, or land past the deadline, are dropped —
      // urgency shape kept, fairness untouched (the true deadline still
      // rules; ticks are decoration).
      const frac = Math.pow(k / n, 0.62)
      let at = t0 + win * frac
      if (this.beatOn) at = nextGridTime(at, this.nextNoteTime, stepDur)
      if (at - prev < 0.01 || at > t0 + win + 0.005) continue
      prev = at
      this.note({
        at, freq: 1500 + k * 60, durMs: 26, type: 'square',
        gain: 0.028 + 0.012 * k, cancellable: true,
      })
    }
  }

  /** Two rising pickup ticks landing just before the next command — ON the
   *  16th grid, so the pickup is part of the groove and the command (which
   *  lands on a half-beat when the engine carries the clock) arrives as the
   *  next strong step. The player sets themselves like a sprinter. */
  private anticipate(afterMistake: boolean): void {
    if (!this.ctx) return
    const gap = estGapMs(this.intensityV, afterMistake) / 1000
    const t0 = this.ctx.currentTime
    const snap = (tt: number) => this.beatOn ? nextGridTime(tt, this.nextNoteTime, this.stepDur()) : tt
    if (gap > 0.24) {
      this.note({ at: snap(t0 + gap * 0.5), freq: 880, durMs: 40, type: 'sine', gain: 0.07, cancellable: true })
    }
    this.note({ at: snap(t0 + Math.max(0.05, gap * 0.9)), freq: 1320, durMs: 45, type: 'sine', gain: 0.1, cancellable: true })
  }

  // ------------------------------------------------------------------- fx

  /** A correct answer, with its timing judgment: `perfect` is the engine's
   *  PERFECT-band verdict, `chain` the live perfect-chain length AFTER this
   *  answer. The judgment is what the player hears: a perfect gets the glassy
   *  ladder earcon (higher with every link), a merely-correct answer gets the
   *  familiar chime — and if it just snapped a chain, the snap is audible.
   *  BOOKKEEPING RUNS EVEN WHEN MUTED (round-5 defect 2): chain state, run
   *  stats, riff authorship and drop triggers must track the engine whether
   *  or not any sound comes out, or a mute toggle fabricates phantom breaks. */
  correct(streak: number, perfect = false, chain = 0): void {
    this.runCorrect++
    this.runBestStreak = Math.max(this.runBestStreak, streak)
    this.runBestChain = Math.max(this.runBestChain, chain)
    const chainWas = this.lastChain
    this.lastChain = chain
    // Drops are EARNED — and re-gated (round 7) to milestones a typical run
    // actually reaches. Measured against the real engine with the 400ms
    // typical bot (150 seeded runs): the old x10-chain gate fired in ~0% of
    // runs (median best chain is 6) — drops existed only on paper. The new
    // gates: a x5 perfect chain (86% of runs), streak 10/25/40 (100%/…), and
    // the final-life clutch in wrong() (100%) — a median run now MEETS
    // multiple real drops, and the 8-bar cooldown keeps them special.
    if (perfect && (chain === 5 || chain === 10 || chain === 15)) this.queueDrop()
    if (streak === 10 || streak === 25 || streak === 40) this.queueDrop()
    // The hit authors the lead line (even muted — the composition is state).
    const plainDegree = PENT[streak % PENT.length] + 12 * Math.floor((streak % 15) / 5)
    if (perfect) pushRiff(this.playerRiff, perfectPitch(chain) % 24)
    else pushRiff(this.playerRiff, plainDegree % 24)

    if (!this.ctx || this.muted) return
    this.cancelPending()
    const g0 = this.nextGrid()
    // Key-aware roots: the chime lives where the bed's key lives, so a hit
    // never lands out of tune after a key change.
    const keyMul = Math.pow(2, this.shift / 12)

    if (perfect) {
      this.perfectHit(g0, chain, 660 * keyMul)
    } else {
      // A slow answer that snapped a live chain: the snap must be HEARD —
      // engine keeps chain untouched through a held DO NOTHING (chain ===
      // chainWas there), so only a true break (chain fell to 0) sounds.
      if (chain === 0 && chainWas >= 3) this.chainBreak(chainWas)
      // Rising pentatonic step per streak — the sound of a run going well —
      // thickened with a fifth, and an octave shimmer once the streak is hot.
      // Snapped to the next 16th so the player's hit is part of the music.
      const f = 440 * keyMul * Math.pow(2, plainDegree / 12)
      this.note({ at: g0, freq: f, durMs: 150, type: 'triangle', gain: 0.24 })
      this.note({ at: g0, freq: f * 1.5, durMs: 120, type: 'sine', gain: 0.1 })
      if (streak >= 10) this.note({ at: g0, freq: f * 2, durMs: 130, type: 'sine', gain: 0.09 })
      // Milestone flourish every 5: a fast ascending arpeggio — spaced by
      // whole 16ths (round 7) so its onsets live ON the grid. Minor triad:
      // the flourish belongs to the key now.
      if (streak > 0 && streak % 5 === 0) {
        const stepDur = this.stepDur()
        const arp = [0, 3, 7, 12]
        for (let k = 0; k < arp.length; k++) {
          this.note({ at: g0 + (k + 1) * stepDur, freq: f * Math.pow(2, arp[k] / 12), durMs: 90, type: 'triangle', gain: 0.14, cancellable: true })
        }
        this.noise({ at: g0, durMs: 300, gain: 0.05, filter: 'highpass', freq: 8000 })
      }
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
   *  sparkle as the chain grows, echoing down the next 16ths and blooming in
   *  the reverb. Every 5th link adds a rising shimmer. */
  private perfectHit(at: number, chain: number, base: number): void {
    const f = base * Math.pow(2, perfectPitch(chain) / 12)
    const hot = Math.min(chain, 12)
    this.note({ at, freq: f, durMs: 160, type: 'sine', gain: 0.18 + hot * 0.007, send: 0.3 })
    this.note({ at, freq: f * 2, durMs: 130, type: 'square', gain: 0.045 + hot * 0.004 })
    this.noise({ at, durMs: 40, gain: 0.05, filter: 'highpass', freq: 9500 })
    if (chain >= 3) this.note({ at, freq: f * 1.5, durMs: 120, type: 'sine', gain: 0.07 })
    // Echo trail on the grid — one 16th behind, two once the chain is hot.
    const stepDur = this.stepDur()
    const echoes = chain >= 6 ? 2 : 1
    for (let k = 1; k <= echoes; k++) {
      this.note({
        at: at + stepDur * k, freq: f, durMs: 90, type: 'sine',
        gain: (0.18 + hot * 0.007) * 0.32 / k, cancellable: true,
      })
    }
    if (chain > 0 && chain % 5 === 0) {
      // Chain-milestone shimmer: 16th-spaced (on the grid), minor-key triad.
      const arp = [0, 3, 7, 12]
      for (let k = 0; k < arp.length; k++) {
        this.note({ at: at + k * stepDur, freq: f * Math.pow(2, arp[k] / 12), durMs: 80, type: 'sine', gain: 0.11, cancellable: true })
      }
      this.noise({ at, durMs: 320, gain: 0.055, filter: 'highpass', freq: 7000, endFreq: 12000 })
    }
  }

  /** A chain snapping on a slow-but-correct answer. Far lighter than
   *  wrong(): the run is still alive, only the perfection is gone. Starts
   *  near the pitch the chain had reached and falls, so the height of the
   *  loss is audible. Grid-snapped (round 7): the run continues, so even a
   *  loss stays inside the groove — only wrong() gets to interrupt time. */
  private chainBreak(chainWas: number): void {
    if (!this.ctx) return
    const t = this.nextGrid()
    const f = 660 * Math.pow(2, perfectPitch(chainWas) / 12)
    this.note({ at: t, freq: f, endFreq: f * 0.5, durMs: 140, type: 'triangle', gain: 0.14 })
    this.note({ at: t, freq: 196, endFreq: 130, durMs: 160, type: 'sine', gain: 0.16 })
    this.noise({ at: t, durMs: 110, gain: 0.07, filter: 'lowpass', freq: 2400, endFreq: 300 })
  }

  /** A miss. `livesLeft` (when the caller knows it) lets the music react to
   *  the stakes: dropping to the FINAL life queues the clutch drop — the
   *  track squares up with the player for the last stand. Chain/riff
   *  bookkeeping runs even when muted (round-5 defect 2). */
  wrong(livesLeft?: number): void {
    const chainWas = this.lastChain
    this.lastChain = 0
    // A miss wipes the player-authored lead line — the melody the run built
    // collapses out of the mix, which is its own punishment.
    this.playerRiff.length = 0
    this.riffPos = 0
    if (livesLeft === 1) this.queueDrop()   // the final-life clutch

    if (!this.ctx || this.muted) return
    this.cancelPending()
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
    this.dropQueued = false
    const ctx = this.ctx
    const t = ctx.currentTime
    // The bed collapses: drone glides down an octave and fades, music bus falls.
    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(t)
      this.musicBus.gain.setTargetAtTime(0.0001, t, 0.4)
    }
    if (this.padOscs.length > 0 && this.droneGain && this.droneFilter) {
      for (const o of this.padOscs) {
        o.frequency.setTargetAtTime(Math.max(30, o.frequency.value / 2), t, 0.5)
      }
      this.droneFilter.frequency.setTargetAtTime(120, t, 0.5)
      this.droneGain.gain.setTargetAtTime(0.0001, t, 0.9)
    }
    // A slow, final descending motif over a long falling noise wash.
    const fall = [0, -3, -7, -12]
    for (let k = 0; k < fall.length; k++) {
      this.note({
        at: t + 0.12 + k * 0.21, freq: 330 * Math.pow(2, fall[k] / 12),
        durMs: k === fall.length - 1 ? 700 : 220, type: 'sawtooth', gain: 0.16, send: 0.25,
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
    if (this.ctx && this.droneFilter && this.droneGain && this.beatOn && !this.muted) {
      const t = this.ctx.currentTime
      // The pad brightens and swells as the run escalates. Skipped mid-drop:
      // the drop owns the filter until its sweep settles.
      if (this.arr.section !== 'drop') {
        this.droneFilter.frequency.setTargetAtTime(420 + v * v * 3700, t, 0.2)
      }
      this.droneGain.gain.setTargetAtTime(this.padLevel(), t, 0.3)
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
    this.shaper = null
    this.comp = null
    this.musicBus = null
    this.fxBus = null
    this.drumBus = null
    this.duckBus = null
    this.reverb = null
    this.reverbSend = null
    this.reverbReturn = null
    this.noiseBuf = null
    this.padOscs = []
    this.lfo = null
    this.droneFilter = null
    this.droneGain = null
  }
}
