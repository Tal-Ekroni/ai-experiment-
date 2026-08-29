/** OWNER: input agent. Gesture recognition. This is the other half of game feel:
 *  a missed swipe that the player "definitely did" is the fastest way to make a
 *  reaction game feel broken and unfair. */
import { Action } from './types'

export interface InputOptions {
  onAction: (a: Action) => void
}

export class Input {
  private startX = 0
  private startY = 0
  private startT = 0
  private holdTimer: number | null = null
  private lastShake = 0
  private opts: InputOptions
  private detach: Array<() => void> = []
  /** True once the device has granted motion access (iOS requires a prompt). */
  motionEnabled = false

  constructor(opts: InputOptions) {
    this.opts = opts
    this.attach()
  }

  private attach(): void {
    const down = (e: PointerEvent) => {
      this.startX = e.clientX; this.startY = e.clientY; this.startT = performance.now()
      this.holdTimer = window.setTimeout(() => this.opts.onAction('hold'), 420)
    }
    const up = (e: PointerEvent) => {
      if (this.holdTimer !== null) { clearTimeout(this.holdTimer); this.holdTimer = null }
      const dx = e.clientX - this.startX
      const dy = e.clientY - this.startY
      const dt = performance.now() - this.startT
      const dist = Math.hypot(dx, dy)
      if (dist < 24 && dt < 400) { this.opts.onAction('tap'); return }
      if (dist >= 24) {
        if (Math.abs(dx) > Math.abs(dy)) this.opts.onAction(dx > 0 ? 'swipe-right' : 'swipe-left')
        else this.opts.onAction(dy > 0 ? 'swipe-down' : 'swipe-up')
      }
    }
    addEventListener('pointerdown', down)
    addEventListener('pointerup', up)
    this.detach.push(() => { removeEventListener('pointerdown', down); removeEventListener('pointerup', up) })

    const motion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity
      if (!a) return
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0)
      const now = performance.now()
      if (mag > 26 && now - this.lastShake > 500) { this.lastShake = now; this.opts.onAction('shake') }
    }
    addEventListener('devicemotion', motion)
    this.detach.push(() => removeEventListener('devicemotion', motion))

    const orient = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && Math.abs(e.gamma) > 55) this.opts.onAction('twist')
      if (e.beta !== null && e.beta < -140) this.opts.onAction('flip')
    }
    addEventListener('deviceorientation', orient)
    this.detach.push(() => removeEventListener('deviceorientation', orient))

    // Keyboard fallback for desktop and for the headless harness.
    const key = (e: KeyboardEvent) => {
      const map: Record<string, Action> = {
        Space: 'tap', ArrowLeft: 'swipe-left', ArrowRight: 'swipe-right',
        ArrowUp: 'swipe-up', ArrowDown: 'swipe-down',
        KeyT: 'twist', KeyS: 'shake', KeyH: 'hold', KeyP: 'pinch', KeyF: 'flip',
      }
      const a = map[e.code]
      if (a) { e.preventDefault(); this.opts.onAction(a) }
    }
    addEventListener('keydown', key)
    this.detach.push(() => removeEventListener('keydown', key))
  }

  /** iOS 13+ requires an explicit permission prompt from a user gesture before
   *  any motion events fire. Without this, twist/shake/flip silently never work. */
  async requestMotion(): Promise<boolean> {
    const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
    try {
      if (typeof DME?.requestPermission === 'function') {
        this.motionEnabled = (await DME.requestPermission()) === 'granted'
      } else {
        this.motionEnabled = true
      }
    } catch { this.motionEnabled = false }
    return this.motionEnabled
  }

  dispose(): void { this.detach.forEach((f) => f()); this.detach = [] }
}
