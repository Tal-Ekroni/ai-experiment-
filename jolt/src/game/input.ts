/** OWNER: input agent. Gesture recognition. This is the other half of game feel:
 *  a missed swipe that the player "definitely did" is the fastest way to make a
 *  reaction game feel broken and unfair.
 *
 *  Design: every recogniser is a pure, DOM-free core (PointerCore, ShakeCore,
 *  TwistCore, FlipCore) fed with (sample, timestamp) pairs, so it can be unit
 *  tested headlessly with synthetic event streams. The Input class is a thin DOM
 *  wiring layer around the cores.
 *
 *  Fairness rules the cores enforce:
 *  - Every touch session emits AT MOST one action. A wrong guess costs a life,
 *    so an ambiguous input emits nothing rather than something.
 *  - tap vs hold is settled by RELEASE TIME, not a racing timer: release before
 *    HOLD_MS with little movement is a tap (however "slow"), still pressed at
 *    HOLD_MS is a hold. The two can never be confused.
 *  - A clear fast swipe fires MID-GESTURE (lower latency than waiting for the
 *    finger to lift), everything less clear is judged on release.
 *  - shake needs repeated direction REVERSALS above a high-pass-filtered
 *    threshold, so walking or setting the phone down cannot fire it.
 *  - twist is edge-triggered on a fast >=60 degree roll, and must settle before
 *    it can fire again — holding the phone tilted does not spam twists.
 *  - pinch (two fingers converging) is implemented; the PINCH IT command is
 *    finally satisfiable.
 */
import { Action } from './types'

export type MotionStatus = 'unknown' | 'granted' | 'denied' | 'unavailable'

export interface InputOptions {
  onAction: (a: Action) => void
  /** Optional: called whenever motion capability changes. Also mirrored as a
   *  `jolt:motion-status` CustomEvent on window (detail: {status}) so other
   *  modules (commands/shell) can gate motion commands without importing us. */
  onMotionStatus?: (s: MotionStatus) => void
}

// ---------------------------------------------------------------------------
// Tuning. Distances are CSS pixels, scaled from the viewport's smaller side so
// a phone and a desktop window both feel right. Velocities are px/ms.
// ---------------------------------------------------------------------------

export interface PointerTuning {
  /** Movement below this is "did not move" — tap / hold territory. */
  tapSlop: number
  /** Total finger path allowed for a tap (rejects wiggle-and-return noise). */
  tapMaxPath: number
  /** Displacement that counts as a swipe on release, regardless of speed. */
  swipeMinDist: number
  /** A short but FAST movement is still a swipe (flick). */
  flickMinDist: number
  flickMinV: number
  /** Fire a swipe mid-gesture once it is this unambiguous (distance AND speed). */
  commitDist: number
  commitMinV: number
  /** Pressed this long without moving = hold. Released earlier = tap. */
  holdMs: number
  /** Dominant axis must beat the other by this ratio for short swipes. */
  dominance: number
}

export function pointerTuning(vmin: number): PointerTuning {
  const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(v, hi))
  return {
    tapSlop: clamp(14, vmin * 0.045, 22),
    tapMaxPath: clamp(28, vmin * 0.09, 44),
    swipeMinDist: clamp(24, vmin * 0.07, 40),
    flickMinDist: 14,
    flickMinV: 0.5,
    commitDist: clamp(40, vmin * 0.11, 64),
    commitMinV: 0.45,
    holdMs: 400,
    dominance: 1.25,
  }
}

// ---------------------------------------------------------------------------
// PointerCore — tap / swipe / hold / pinch from raw pointer samples.
// ---------------------------------------------------------------------------

interface Track {
  x0: number; y0: number; t0: number
  x: number; y: number; t: number
  path: number
  peakV: number
}

export class PointerCore {
  private tracks = new Map<number, Track>()
  /** One action per touch session (all fingers down -> all fingers up). */
  private consumed = false
  private pinching = false
  private pinchBase = 0

  constructor(private emit: (a: Action) => void, private tune: PointerTuning) {}

  down(id: number, x: number, y: number, t: number): void {
    if (this.tracks.size === 0) { this.consumed = false; this.pinching = false }
    this.tracks.set(id, { x0: x, y0: y, t0: t, x, y, t, path: 0, peakV: 0 })
    if (this.tracks.size === 2) {
      // Second finger: this session is a pinch attempt. No tap/swipe/hold.
      this.pinching = true
      this.pinchBase = this.spread()
    }
  }

  move(id: number, x: number, y: number, t: number): void {
    const tr = this.tracks.get(id)
    if (!tr) return
    const d = Math.hypot(x - tr.x, y - tr.y)
    const dt = t - tr.t
    if (dt > 0) tr.peakV = Math.max(tr.peakV, d / Math.max(dt, 8))
    tr.path += d
    tr.x = x; tr.y = y; tr.t = t

    if (this.consumed) return

    if (this.pinching) {
      if (this.tracks.size >= 2) {
        const now = this.spread()
        const need = Math.min(this.pinchBase * 0.5, Math.max(30, this.pinchBase * 0.28))
        if (this.pinchBase - now >= need) { this.consumed = true; this.emit('pinch') }
      }
      return
    }

    // Mid-gesture swipe commit: far AND fast AND direction unambiguous.
    const dx = x - tr.x0, dy = y - tr.y0
    const disp = Math.hypot(dx, dy)
    const vNow = dt > 0 ? d / Math.max(dt, 8) : 0
    if (disp >= this.tune.commitDist && vNow >= this.tune.commitMinV &&
        this.dominant(dx, dy, 1.4) !== null) {
      this.consumed = true
      this.emit(this.dominant(dx, dy, 1.4) as Action)
    }
  }

  up(id: number, x: number, y: number, t: number): void {
    const tr = this.tracks.get(id)
    if (!tr) return
    this.move(id, x, y, t)          // fold in any final movement (may commit)
    this.tracks.delete(id)
    if (this.consumed || this.pinching) return

    const dx = x - tr.x0, dy = y - tr.y0
    const disp = Math.hypot(dx, dy)
    const dur = t - tr.t0
    const tn = this.tune

    // Swipe first (a fast flick beats the tap check), then tap, else nothing.
    const dir = this.dominant(dx, dy, disp >= 40 ? 1 : tn.dominance)
    if (dir !== null &&
        (disp >= tn.swipeMinDist || (disp >= tn.flickMinDist && tr.peakV >= tn.flickMinV))) {
      this.consumed = true
      this.emit(dir as Action)
      return
    }
    if (disp <= tn.tapSlop && tr.path <= tn.tapMaxPath && dur < tn.holdMs) {
      this.consumed = true
      this.emit('tap')
    }
    // Anything else is ambiguous: stay silent rather than guess wrong.
  }

  cancel(id: number): void {
    // Browser stole the gesture; discard it entirely.
    this.tracks.delete(id)
    this.consumed = true
    if (this.tracks.size === 0) this.pinching = false
  }

  /** Time-based check: still pressed past holdMs without moving => hold.
   *  Call at/after t0 + holdMs (a timer, or any later sample). */
  poll(t: number): void {
    if (this.consumed || this.pinching || this.tracks.size !== 1) return
    const tr = this.tracks.values().next().value as Track
    const disp = Math.hypot(tr.x - tr.x0, tr.y - tr.y0)
    if (t - tr.t0 >= this.tune.holdMs && disp <= this.tune.tapSlop) {
      this.consumed = true
      this.emit('hold')
    }
  }

  private spread(): number {
    const it = this.tracks.values()
    const a = it.next().value as Track | undefined
    const b = it.next().value as Track | undefined
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private dominant(dx: number, dy: number, ratio: number): Action | null {
    const ax = Math.abs(dx), ay = Math.abs(dy)
    if (ax >= ay * ratio) return dx > 0 ? 'swipe-right' : 'swipe-left'
    if (ay >= ax * ratio) return dy > 0 ? 'swipe-down' : 'swipe-up'
    return null
  }
}

// ---------------------------------------------------------------------------
// ShakeCore — deliberate shakes only. High-pass filters gravity out, then
// requires >=2 direction reversals of strong acceleration inside a short
// window. Walking (~2-6 m/s^2) never crosses the threshold; a single bump
// (phone dropped on a table) has no reversals; a real shake fires in ~250ms.
// ---------------------------------------------------------------------------

const SHAKE_THRESHOLD = 12      // m/s^2, after gravity removal
const SHAKE_REVERSALS = 2       // out-back-out
const SHAKE_PEAK_GAP_MIN = 40   // ms — debounce within one swing
const SHAKE_PEAK_GAP_MAX = 450  // ms — reversals must be rapid
const SHAKE_COOLDOWN = 600      // ms after firing

export class ShakeCore {
  private gx = 0; private gy = 0; private gz = 0
  private gReady = false
  private lastT: number | null = null
  private lastPeak: { t: number; ux: number; uy: number; uz: number } | null = null
  private reversals = 0
  private coolUntil = 0

  constructor(private emit: () => void) {}

  /** linear=true when the sample already excludes gravity (e.acceleration). */
  sample(x: number, y: number, z: number, t: number, linear: boolean): void {
    let hx = x, hy = y, hz = z
    if (!linear) {
      if (!this.gReady) { this.gx = x; this.gy = y; this.gz = z; this.gReady = true; this.lastT = t; return }
      const dt = Math.min(100, this.lastT === null ? 16 : Math.max(1, t - this.lastT))
      const k = dt / (dt + 350)                      // ~350ms low-pass tracks gravity
      this.gx += (x - this.gx) * k; this.gy += (y - this.gy) * k; this.gz += (z - this.gz) * k
      hx = x - this.gx; hy = y - this.gy; hz = z - this.gz
    }
    this.lastT = t
    if (t < this.coolUntil) return

    const m = Math.hypot(hx, hy, hz)
    if (m < SHAKE_THRESHOLD) return
    const ux = hx / m, uy = hy / m, uz = hz / m

    const lp = this.lastPeak
    if (lp && t - lp.t > SHAKE_PEAK_GAP_MAX + 150) { this.reversals = 0; this.lastPeak = null }
    if (!this.lastPeak) { this.lastPeak = { t, ux, uy, uz }; return }
    const p = this.lastPeak
    const dot = ux * p.ux + uy * p.uy + uz * p.uz
    if (dot > 0.3) { p.t = t; p.ux = ux; p.uy = uy; p.uz = uz; return }  // same swing
    if (dot < -0.35 && t - p.t >= SHAKE_PEAK_GAP_MIN && t - p.t <= SHAKE_PEAK_GAP_MAX) {
      this.reversals++
      this.lastPeak = { t, ux, uy, uz }
      if (this.reversals >= SHAKE_REVERSALS) {
        this.reversals = 0
        this.lastPeak = null
        this.coolUntil = t + SHAKE_COOLDOWN
        this.emit()
      }
      return
    }
    this.lastPeak = { t, ux, uy, uz }               // perpendicular / too slow: restart
  }
}

// ---------------------------------------------------------------------------
// TwistCore — a deliberate wrist rotation: >=60 degrees of roll within 700ms,
// edge-triggered. After firing it must SETTLE (rotation nearly still for a
// moment) before it can fire again, so holding the phone tilted — the old
// "fires continuously above 55 degrees" bug — emits exactly one twist.
// Roll input is unwrapped across the +/-90 gamma discontinuity.
// ---------------------------------------------------------------------------

const TWIST_DEG = 60
const TWIST_WINDOW = 700        // ms to cover the 60 degrees
const TWIST_SETTLE_DEG = 15     // "still" = under this much roll over 300ms
const TWIST_SETTLE_MS = 300
const TWIST_COOLDOWN = 350

export class TwistCore {
  private lastRoll: number | null = null
  private cont = 0                                   // unwrapped continuous roll
  private buf: Array<{ t: number; v: number }> = []
  private armed = true
  private coolUntil = 0

  constructor(private emit: () => void) {}

  sample(rollDeg: number, t: number): void {
    if (this.lastRoll !== null) {
      let d = rollDeg - this.lastRoll
      if (d > 120) d -= 180
      else if (d < -120) d += 180
      this.cont += d
    }
    this.lastRoll = rollDeg
    this.buf.push({ t, v: this.cont })
    while (this.buf.length && t - this.buf[0].t > TWIST_WINDOW) this.buf.shift()

    let lo = Infinity, hi = -Infinity
    for (const s of this.buf) { if (s.v < lo) lo = s.v; if (s.v > hi) hi = s.v }

    if (this.armed) {
      if (t >= this.coolUntil && hi - lo >= TWIST_DEG) {
        this.armed = false
        this.coolUntil = t + TWIST_COOLDOWN
        this.buf = [{ t, v: this.cont }]
        this.emit()
      }
      return
    }
    // Re-arm only once rotation settles.
    let rLo = Infinity, rHi = -Infinity
    let oldest = t
    for (const s of this.buf) {
      if (t - s.t <= TWIST_SETTLE_MS) {
        if (s.v < rLo) rLo = s.v
        if (s.v > rHi) rHi = s.v
        if (s.t < oldest) oldest = s.t
      }
    }
    if (t >= this.coolUntil && t - oldest >= TWIST_SETTLE_MS * 0.6 && rHi - rLo < TWIST_SETTLE_DEG) {
      this.armed = true
      this.buf = [{ t, v: this.cont }]
    }
  }
}

// ---------------------------------------------------------------------------
// FlipCore — face-down detection with hysteresis. Arms while clearly face-up,
// fires once when clearly face-down, and cannot fire again until face-up.
// Starting a session face-down does NOT fire.
// ---------------------------------------------------------------------------

export type FlipZone = 'up' | 'mid' | 'down'

export class FlipCore {
  private armed = false
  constructor(private emit: () => void) {}

  /** From deviceorientation beta (degrees). */
  sampleBeta(beta: number): void {
    const a = Math.abs(beta)
    this.zone(a >= 148 ? 'down' : a <= 110 ? 'up' : 'mid')
  }

  /** From gravity z (m/s^2, face-up at rest ~ +9.8). */
  sampleGravityZ(gz: number): void {
    this.zone(gz < -6.5 ? 'down' : gz > 3 ? 'up' : 'mid')
  }

  zone(z: FlipZone): void {
    if (z === 'up') { this.armed = true; return }
    if (z === 'down' && this.armed) { this.armed = false; this.emit() }
  }
}

// ---------------------------------------------------------------------------
// Input — DOM wiring around the cores, plus keyboard fallback and the iOS
// motion permission dance.
// ---------------------------------------------------------------------------

const MOTION_ACTIONS: ReadonlySet<Action> = new Set<Action>(['shake', 'twist', 'flip'])

export class Input {
  /** True once the device has granted motion access (iOS requires a prompt). */
  motionEnabled = false
  /** Honest capability state. 'granted' means events are actually arriving;
   *  'unavailable' means permission is fine but the hardware never spoke. */
  motionStatus: MotionStatus = 'unknown'

  private opts: InputOptions
  private tune: PointerTuning
  private pointer: PointerCore
  private shake: ShakeCore
  private twist: TwistCore
  private flip: FlipCore
  private holdTimer: number | null = null
  private detach: Array<() => void> = []
  private sawSensor = false
  private sawOrientT = 0
  private keyboardActive = false
  private probeTimer: number | null = null
  private prevTouchAction: string | null = null

  constructor(opts: InputOptions) {
    this.opts = opts
    const emit = (a: Action) => this.opts.onAction(a)
    const vmin = typeof window !== 'undefined'
      ? Math.min(window.innerWidth || 400, window.innerHeight || 700) : 400
    this.tune = pointerTuning(vmin)
    this.pointer = new PointerCore(emit, this.tune)
    this.shake = new ShakeCore(() => emit('shake'))
    this.twist = new TwistCore(() => emit('twist'))
    this.flip = new FlipCore(() => emit('flip'))
    if (typeof addEventListener === 'function') this.attach()
  }

  /** Can the player, on THIS device right now, perform the action? Motion
   *  actions need working sensors (or a keyboard — desktop fallback). Other
   *  modules should use this to avoid issuing commands that cannot be done. */
  canPerform(a: Action): boolean {
    if (!MOTION_ACTIONS.has(a)) return true
    return this.keyboardActive || (this.motionEnabled && this.sawSensor)
  }

  private attach(): void {
    const on = <K extends keyof WindowEventMap>(
      type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions,
    ) => {
      addEventListener(type, fn as EventListener, opts)
      this.detach.push(() => removeEventListener(type, fn as EventListener, opts))
    }

    // --- pointer -----------------------------------------------------------
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const now = performance.now()
      this.pointer.down(e.pointerId, e.clientX, e.clientY, now)
      if (this.holdTimer !== null) clearTimeout(this.holdTimer)
      this.holdTimer = window.setTimeout(
        () => this.pointer.poll(performance.now()),
        this.tune.holdMs + 12,
      )
    }
    const move = (e: PointerEvent) => this.pointer.move(e.pointerId, e.clientX, e.clientY, performance.now())
    const up = (e: PointerEvent) => {
      if (this.holdTimer !== null) { clearTimeout(this.holdTimer); this.holdTimer = null }
      this.pointer.up(e.pointerId, e.clientX, e.clientY, performance.now())
    }
    const cancel = (e: PointerEvent) => this.pointer.cancel(e.pointerId)
    on('pointerdown', down)
    on('pointermove', move, { passive: true })
    on('pointerup', up)
    on('pointercancel', cancel)

    // Keep the browser's own gestures (scroll, pinch-zoom, long-press menu)
    // from stealing ours. This is an input concern: a stolen swipe is a miss.
    if (typeof document !== 'undefined') {
      this.prevTouchAction = document.documentElement.style.touchAction
      document.documentElement.style.touchAction = 'none'
    }
    const swallowTouch = (e: TouchEvent) => { if (e.cancelable) e.preventDefault() }
    on('touchmove', swallowTouch, { passive: false })
    const swallowCtx = (e: Event) => e.preventDefault()
    on('contextmenu', swallowCtx)
    // iOS Safari's own pinch-zoom gesture (non-standard event).
    const swallowGesture: EventListener = (e) => e.preventDefault()
    addEventListener('gesturestart', swallowGesture)
    this.detach.push(() => removeEventListener('gesturestart', swallowGesture))

    // --- device motion / orientation --------------------------------------
    const motion = (e: DeviceMotionEvent) => {
      const now = performance.now()
      const lin = e.acceleration
      const grav = e.accelerationIncludingGravity
      const useLin = !!(lin && (lin.x !== null || lin.y !== null || lin.z !== null))
      const a = useLin ? lin : grav
      if (a && (a.x !== null || a.y !== null || a.z !== null)) {
        this.sensorSeen()
        this.shake.sample(a.x || 0, a.y || 0, a.z || 0, now, useLin)
      }
      // If orientation events are absent on this device, derive roll and
      // face-down from the gravity vector instead so twist/flip still work.
      if (grav && now - this.sawOrientT > 2000 &&
          (grav.x !== null || grav.y !== null || grav.z !== null)) {
        const gx = grav.x || 0, gz = grav.z || 0
        this.twist.sample(Math.atan2(gx, gz) * 180 / Math.PI, now)
        this.flip.sampleGravityZ(gz)
      }
    }
    on('devicemotion', motion)

    const orient = (e: DeviceOrientationEvent) => {
      const now = performance.now()
      if (e.gamma === null && e.beta === null) return
      this.sensorSeen()
      this.sawOrientT = now
      if (e.gamma !== null) this.twist.sample(e.gamma, now)
      if (e.beta !== null) this.flip.sampleBeta(e.beta)
    }
    on('deviceorientation', orient)

    // --- keyboard fallback (desktop and the headless harness) --------------
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return   // key autorepeat must not machine-gun actions
      const map: Record<string, Action> = {
        Space: 'tap', ArrowLeft: 'swipe-left', ArrowRight: 'swipe-right',
        ArrowUp: 'swipe-up', ArrowDown: 'swipe-down',
        KeyT: 'twist', KeyS: 'shake', KeyH: 'hold', KeyP: 'pinch', KeyF: 'flip',
        KeyR: 'release',
      }
      const a = map[e.code]
      if (a) { e.preventDefault(); this.keyboardActive = true; this.opts.onAction(a) }
    }
    on('keydown', key)
  }

  private sensorSeen(): void {
    if (this.sawSensor) return
    this.sawSensor = true
    // Sensors talking at all means the capability is real, whatever the
    // permission API said (non-iOS browsers just deliver events).
    if (this.motionStatus !== 'denied') this.setStatus('granted')
  }

  private setStatus(s: MotionStatus): void {
    if (this.motionStatus === s) return
    this.motionStatus = s
    this.motionEnabled = s === 'granted'
    this.opts.onMotionStatus?.(s)
    if (typeof dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      dispatchEvent(new CustomEvent('jolt:motion-status', { detail: { status: s } }))
    }
  }

  /** iOS 13+ requires an explicit permission prompt FROM A USER GESTURE before
   *  any motion event fires — call this from a tap handler. Idempotent: cached
   *  after the first meaningful answer. Resolves true only when motion can
   *  genuinely work; on denial or absent hardware the game should stop issuing
   *  motion commands (see canPerform / onMotionStatus) instead of pretending. */
  async requestMotion(): Promise<boolean> {
    if (this.motionStatus === 'granted') return true
    if (this.motionStatus === 'denied') return false

    type Requester = { requestPermission?: () => Promise<string> }
    const DME = (typeof DeviceMotionEvent !== 'undefined'
      ? DeviceMotionEvent : undefined) as unknown as Requester | undefined
    const DOE = (typeof DeviceOrientationEvent !== 'undefined'
      ? DeviceOrientationEvent : undefined) as unknown as Requester | undefined

    let granted = true
    // iOS gates motion and orientation separately; ask for both.
    if (typeof DME?.requestPermission === 'function') {
      try { granted = (await DME.requestPermission()) === 'granted' } catch { granted = false }
    }
    if (typeof DOE?.requestPermission === 'function') {
      try {
        const ok = (await DOE.requestPermission()) === 'granted'
        granted = granted || ok
      } catch { /* motion grant alone may still be enough */ }
    }
    if (!granted) { this.setStatus('denied'); return false }

    this.motionEnabled = true
    if (this.sawSensor) { this.setStatus('granted'); return true }
    // Permission ok (or not needed) — but do events actually arrive? Desktops
    // and some tablets have no sensors. Probe, then answer honestly.
    if (this.probeTimer === null && typeof window !== 'undefined') {
      this.probeTimer = window.setTimeout(() => {
        this.probeTimer = null
        if (!this.sawSensor && this.motionStatus !== 'denied') this.setStatus('unavailable')
      }, 1800)
    }
    // Report optimistically for now; sensorSeen()/the probe will settle status.
    return true
  }

  dispose(): void {
    this.detach.forEach((f) => f())
    this.detach = []
    if (this.holdTimer !== null) { clearTimeout(this.holdTimer); this.holdTimer = null }
    if (this.probeTimer !== null) { clearTimeout(this.probeTimer); this.probeTimer = null }
    if (typeof document !== 'undefined' && this.prevTouchAction !== null) {
      document.documentElement.style.touchAction = this.prevTouchAction
      this.prevTouchAction = null
    }
  }
}
