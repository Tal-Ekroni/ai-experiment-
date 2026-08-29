import { Renderer } from './game/render'
import { createSim, stepSim, advance, Sim } from './game/sim'
import { InputState, FIXED_DT, WIPEOUT_ANGLE } from './game/types'
import { Audio } from './game/audio'

const canvas = document.getElementById('c') as HTMLCanvasElement
const renderer = new Renderer(canvas)
const audio = new Audio()
let sim: Sim = createSim(1337)

const input: InputState = { lean: 0, steer: 0, brake: false }

/** Named deterministic input scripts — the headless harness drives these so a
 *  screenshot is fully reproducible from (seed, seconds, script). */
export const SCRIPTS: Record<string, (t: number) => InputState> = {
  idle: () => ({ lean: 0, steer: 0, brake: false }),
  hold: () => ({ lean: 1, steer: 0, brake: false }),
  // Crude autopilot: holds the balance point, weaves lanes. Good "typical play" frame.
  balance: (t) => ({
    lean: Math.sin(t * 2.2) * 0.35 + 0.55,
    steer: Math.sin(t * 0.5) * 1.1,
    brake: false,
  }),
}

const hud = document.createElement('div')
hud.style.cssText =
  'position:fixed;top:12px;left:14px;font:600 15px ui-monospace,monospace;color:#fff;' +
  'text-shadow:0 2px 6px #000;pointer-events:none;line-height:1.5;white-space:pre'
document.body.appendChild(hud)

function resize() { renderer.resize(window.innerWidth, window.innerHeight) }
window.addEventListener('resize', resize)
resize()

// --- input -----------------------------------------------------------------
let holding = false
let touchX = 0
addEventListener('pointerdown', (e) => { holding = true; touchX = e.clientX; audio.start() })
addEventListener('pointerup', () => { holding = false; input.steer = 0 })
addEventListener('pointermove', (e) => {
  if (holding) input.steer = Math.max(-1, Math.min(1, (e.clientX - touchX) / 90))
})
addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') holding = true
  if (e.code === 'ArrowLeft') input.steer = -1
  if (e.code === 'ArrowRight') input.steer = 1
  if (e.code === 'KeyR') sim = createSim(sim.world.seed)
})
addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') holding = false
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') input.steer = 0
})

// --- loop ------------------------------------------------------------------
let acc = 0
let last = performance.now()
let running = !new URLSearchParams(location.search).has('headless')

function tick(now: number) {
  requestAnimationFrame(tick)
  if (!running) return
  acc += Math.min(0.25, (now - last) / 1000)
  last = now
  input.lean = holding ? 1 : -0.55
  while (acc >= FIXED_DT) { stepSim(sim, input, FIXED_DT); acc -= FIXED_DT }
  draw()
  audio.setRpm(sim.world.bike.speed / 34)
}

function draw() {
  const w = sim.world
  renderer.sync(w, sim.chunks)
  renderer.frame()
  hud.textContent =
    `${w.score.distance.toFixed(0)} m   x${w.score.multiplier.toFixed(1)}\n` +
    `${Math.floor(w.score.points)} pts\n` +
    `wheelie ${w.bike.wheelieTime.toFixed(1)}s  ` +
    `${((w.bike.pitch / WIPEOUT_ANGLE) * 100).toFixed(0)}%` +
    (w.bike.crashed ? '\nWIPEOUT — press R' : '')
}
requestAnimationFrame(tick)

// --- headless capture hook -------------------------------------------------
;(window as unknown as Record<string, unknown>).__game = {
  /** Reset, simulate `seconds` under a named script, render exactly one frame. */
  captureAt(seconds: number, scriptName = 'balance', seed = 1337) {
    running = false
    sim = createSim(seed)
    advance(sim, seconds, SCRIPTS[scriptName] ?? SCRIPTS.balance)
    draw()
    const w = sim.world
    return {
      distance: w.score.distance, points: w.score.points, pitch: w.bike.pitch,
      speed: w.bike.speed, wheelieTime: w.bike.wheelieTime, crashed: w.bike.crashed,
    }
  },
  ready: true,
}
