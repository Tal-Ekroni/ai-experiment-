import { Engine, simulateRun, BotProfile } from './game/engine'
import { Renderer } from './game/render'
import { Input } from './game/input'
import { Sound } from './game/audio'
import { bestScore, recordScore } from './game/shell'
import { Action } from './game/types'
import { intensity } from './game/commands'

const stage = document.getElementById('stage') as HTMLElement
const renderer = new Renderer(stage)
const sound = new Sound()
let engine = new Engine(1)

const headless = new URLSearchParams(location.search).has('headless')
let running = !headless
let lastSpoken = ''

const input = new Input({
  onAction: (a: Action) => {
    if (engine.state.phase === 'idle' || engine.state.phase === 'over') { begin(); return }
    engine.submit(a)
    const r = engine.state.lastResult
    if (r === 'correct') sound.correct(engine.state.streak)
    else if (r === 'wrong') sound.wrong()
  },
})

function begin(): void {
  sound.start()
  void input.requestMotion()
  engine = new Engine((Math.random() * 1e9) | 0)
  engine.start()
  lastSpoken = ''
}

let last = performance.now()
function tick(now: number) {
  requestAnimationFrame(tick)
  if (!running) return
  const dt = Math.min(100, now - last)
  last = now
  const before = engine.state.phase
  engine.tick(dt)
  const s = engine.state

  // Speak each command once, as it lands.
  if (s.phase === 'awaiting' && s.command && s.command.label !== lastSpoken) {
    lastSpoken = s.command.label
    sound.say(s.command.label, intensity(s.issued))
  }
  if (s.phase === 'awaiting' && s.lastResult === 'timeout') sound.wrong()
  if (before !== 'over' && s.phase === 'over') {
    sound.gameOver()
    recordScore(s.score)
  }
  sound.setIntensity(intensity(s.issued))
  renderer.sync(s)
}
requestAnimationFrame(tick)
renderer.sync(engine.state)

// --- headless hooks --------------------------------------------------------
// Screenshots need a posed frame; fairness needs simulated runs. Both are exposed
// so the capture harness and the bot playtester can drive the real game code.
;(window as unknown as Record<string, unknown>).__game = {
  /** Pose the game at a given command index for a screenshot. */
  captureAt(seconds: number, _script = 'play', seed = 1) {
    running = false
    engine = new Engine(seed)
    engine.start()
    const target = Math.max(0, Math.floor(seconds))
    // Drive it forward by answering correctly until we reach the target index.
    let guard = 0
    while (engine.state.issued < target && engine.state.phase !== 'over' && guard++ < 20000) {
      const s = engine.state
      if (s.phase === 'awaiting' && s.command && !s.command.inhibit) engine.submit(s.command.action)
      engine.tick(10)
    }
    if (engine.state.phase === 'resolved') engine.tick(500)
    engine.tick(engine.state.command ? engine.state.command.windowMs * 0.35 : 0)
    renderer.sync(engine.state)
    const s = engine.state
    return {
      issued: s.issued, score: s.score, lives: s.lives,
      command: s.command ? s.command.label : null,
      windowMs: s.command ? Math.round(s.command.windowMs) : null,
      best: bestScore(),
    }
  },

  /** Run the bot playtester inside the page, against the real engine. */
  playtest(bot: BotProfile, runs = 200, seed0 = 1) {
    const reports = []
    for (let i = 0; i < runs; i++) reports.push(simulateRun(seed0 + i, bot))
    return reports
  },
  ready: true,
}
