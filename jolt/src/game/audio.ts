/** OWNER: audio agent. This genre is carried by SOUND — get this right and the
 *  game works even with plain visuals.
 *  Zero sample files: commands are spoken via the built-in Web Speech API, and
 *  every musical element is synthesised with WebAudio. */
export class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  muted = false

  /** Must be called from a user gesture — iOS blocks audio otherwise. */
  start(): void {
    if (this.ctx) return
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)
  }

  /** Speak a command. Built into the browser and WKWebView, so no audio ships. */
  say(text: string, rate = 1): void {
    if (this.muted || typeof speechSynthesis === 'undefined') return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = Math.min(2, 0.95 + rate * 0.6)
    u.pitch = 1.1
    speechSynthesis.speak(u)
  }

  private blip(freq: number, durMs: number, type: OscillatorType = 'sine', gain = 0.25): void {
    if (!this.ctx || !this.master || this.muted) return
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(0, this.ctx.currentTime)
    g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + durMs / 1000)
    o.connect(g).connect(this.master)
    o.start()
    o.stop(this.ctx.currentTime + durMs / 1000 + 0.02)
  }

  correct(streak: number): void {
    // Rising pentatonic step per streak — the sound of a run going well.
    const scale = [0, 2, 4, 7, 9]
    const n = scale[streak % scale.length] + 12 * Math.floor((streak % 15) / 5)
    this.blip(440 * Math.pow(2, n / 12), 140, 'triangle', 0.3)
  }
  wrong(): void { this.blip(110, 320, 'sawtooth', 0.3) }
  gameOver(): void { this.blip(160, 700, 'sawtooth', 0.25) }
  tick(): void { this.blip(1400, 30, 'square', 0.06) }

  setIntensity(_i: number): void { /* OWNER: build the tempo-tracking music bed here */ }
  stop(): void { this.ctx?.close(); this.ctx = null; this.master = null }
}
