/** OWNER: audio agent. Fully procedural WebAudio — no sample files ship. */
export class Audio {
  private ctx: AudioContext | null = null
  private engine: OscillatorNode | null = null
  private gain: GainNode | null = null

  start(): void {
    if (this.ctx) return
    this.ctx = new AudioContext()
    this.engine = this.ctx.createOscillator()
    this.gain = this.ctx.createGain()
    this.engine.type = 'sawtooth'
    this.engine.frequency.value = 80
    this.gain.gain.value = 0.04
    this.engine.connect(this.gain).connect(this.ctx.destination)
    this.engine.start()
  }
  setRpm(speed01: number): void {
    if (this.engine && this.ctx) {
      this.engine.frequency.setTargetAtTime(70 + speed01 * 180, this.ctx.currentTime, 0.08)
    }
  }
  stop(): void { this.engine?.stop(); this.ctx?.close(); this.ctx = null; this.engine = null }
}
