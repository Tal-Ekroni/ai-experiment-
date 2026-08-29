/** OWNER: audio agent. Procedural ambience only — no sample files ship. */
export class Ambience {
  private ctx: AudioContext | null = null
  private windGain: GainNode | null = null

  start(): void {
    if (this.ctx) return
    this.ctx = new AudioContext()
    // Wind = filtered noise. Cheap, and convincing when the filter breathes.
    const len = this.ctx.sampleRate * 2
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    this.windGain = this.ctx.createGain()
    this.windGain.gain.value = 0.05
    src.connect(filter).connect(this.windGain).connect(this.ctx.destination)
    src.start()
  }

  setWind(strength01: number): void {
    if (this.windGain && this.ctx) {
      this.windGain.gain.setTargetAtTime(0.02 + strength01 * 0.07, this.ctx.currentTime, 0.5)
    }
  }

  stop(): void { this.ctx?.close(); this.ctx = null; this.windGain = null }
}
