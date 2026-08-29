import { Engine, simulateRun, BotProfile } from './game/engine'
import { Renderer } from './game/render'
import { Input } from './game/input'
import { Sound } from './game/audio'
import { Shell, bestScore } from './game/shell'
import { decodeDuel } from './game/duel'
import { Action, ModeId } from './game/types'
import { intensity, MODES } from './game/commands'

// Zero-asset favicon (inline SVG bolt): also stops the browser's automatic
// /favicon.ico request from 404ing in the console.
const fav = document.createElement('link')
fav.rel = 'icon'
fav.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
  "<rect width='64' height='64' rx='14' fill='%230b0d12'/>" +
  "<path d='M36 6 14 38h12l-4 20 24-34H32z' fill='%23ffd76b'/></svg>"
document.head.append(fav)

const stage = document.getElementById('stage') as HTMLElement
const renderer = new Renderer(stage)
const sound = new Sound()
let engine = new Engine(1)

const bootParams = new URLSearchParams(location.search)
const headless = bootParams.has('headless')
// An inbound beat-my-run challenge link (?duel=<seed>&s=<score>&n=<commands>).
// Params are hostile until proven: anything malformed decodes to null and the
// page boots to the normal home screen. Harness runs ignore duels entirely.
const inboundDuel = headless ? null : decodeDuel(bootParams)
if (inboundDuel) {
  // Consume the link: the address bar goes clean so a reload is a normal
  // visit — the one-try gate itself lives in the shell's duel record.
  try { history.replaceState(null, '', location.pathname) } catch { /* sandboxed */ }
}
let running = !headless
/** issued-index of the last announced command — labels can legitimately repeat
 *  ("TAP IT. TAP IT."), so the index, not the text, decides re-announcement. */
let lastSpokenIssued = -1
/** The tap that starts a run must not leak into the run as a submitted action. */
let inputGuardUntil = 0
/** Game over already dispatched to sound + shell for this run. */
let overHandled = false

const input = new Input({ onAction: (a: Action) => handleAction(a) })

const shell = new Shell({
  root: stage,
  enabled: !headless,
  onPlay: (mode: ModeId, seed: number) => begin(mode, seed),
  onHome: () => goHome(),
  onPrime: () => sound.start(),          // inside the user gesture, before any await
  onTeachDone: (a: Action) => {
    // The taught gesture was performed against the frozen command — credit it.
    inputGuardUntil = performance.now() + 250   // a swipe's trailing tap must not leak
    engine.submit(a)
    if (engine.state.lastResult === 'correct') sound.correct(engine.state.streak)
  },
  onResume: () => {
    // Fresh window for the interrupted command: an interruption never eats a life.
    if (engine.state.phase === 'awaiting') engine.state.elapsed = 0
    inputGuardUntil = performance.now() + 250
  },
  onMuted: (m: boolean) => {
    sound.muted = m
    if (m && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  },
  requestMotion: () => input.requestMotion(),
  speak: (label: string) => sound.say(label, 0),
})
sound.muted = shell.muted

function begin(mode: ModeId = 'classic', seed: number = (Math.random() * 1e9) | 0): void {
  sound.start()
  void input.requestMotion()
  engine = new Engine(seed, MODES[mode])
  engine.start()
  lastSpokenIssued = -1
  overHandled = false
  inputGuardUntil = performance.now() + 300
}

function goHome(): void {
  sound.stop()
  engine = new Engine(1)                 // idle attract state behind the home screen
  lastSpokenIssued = -1
  overHandled = false
  renderer.sync(engine.state)
}

/** Dispatch the end of the run exactly once, no matter which code path killed
 *  the player — a timeout resolves inside tick(), but a wrong action resolves
 *  inside the input event handler, where the tick loop's before/after phase
 *  comparison can never see the transition. */
function maybeGameOver(): void {
  if (overHandled) return
  const s = engine.state
  if (s.phase !== 'over') return
  overHandled = true
  const completed = engine.report().deathCause === 'alive'   // Zen: clock ran out
  sound.gameOver()
  shell.endRun({
    score: s.score, bestStreak: s.bestStreak, issued: s.issued, runtimeMs: s.runtime,
    deathLabel: s.command ? s.command.label : null,
    deathCause: s.lastResult === 'timeout' ? 'timeout' : 'wrong',
    deathInhibit: !!(s.command && s.command.inhibit),
    mode: s.mode, correct: s.correct, completed,
  })
}

function handleAction(a: Action): void {
  if (!running) return                   // headless posing drives the engine directly
  if (shell.route(a)) return             // a shell screen owns the world right now
  const s = engine.state
  if (s.phase === 'idle' || s.phase === 'over') {
    if (!shell.enabled) begin()          // headless/dev convenience: any input starts
    return                               // shell screens own these transitions
  }
  if (performance.now() < inputGuardUntil) return
  engine.submit(shell.translate(a, s.command))
  const r = engine.state.lastResult
  if (r === 'correct') sound.correct(engine.state.streak)
  else if (r === 'wrong') sound.wrong()
  maybeGameOver()                        // a wrong action can be the third life
}

let last = performance.now()
function tick(now: number) {
  requestAnimationFrame(tick)
  if (!running) return
  const dt = Math.min(100, now - last)
  last = now
  if (shell.paused()) { renderer.sync(engine.state); return }

  const before = engine.state.phase
  engine.tick(dt)
  const s = engine.state

  // A new command landed: teach it first if it has never been seen, else speak
  // it. Keyed on the issued index, not the label — "TAP IT. TAP IT." repeats
  // are legal and each one must be barked again.
  if (s.phase === 'awaiting' && s.command && s.issued !== lastSpokenIssued) {
    lastSpokenIssued = s.issued
    shell.commandLanded(s.command)
    if (!shell.maybeTeach(s.command)) {
      sound.say(s.command.label, intensity(engine.effectiveIssued()), s.command.windowMs)
    }
  }

  // Resolutions that happen inside tick() (not via submit): timeouts, and the
  // inhibition command succeeding by the window lapsing. Fire each sound ONCE,
  // on the transition — lastResult alone persists across frames.
  if (before === 'awaiting' && (s.phase === 'resolved' || s.phase === 'over')) {
    if (s.lastResult === 'timeout') sound.wrong()
    else if (s.lastResult === 'correct') sound.correct(s.streak)
  }

  maybeGameOver()

  sound.setIntensity(intensity(engine.effectiveIssued()))
  renderer.sync(s)
  shell.frame(s)
}
requestAnimationFrame(tick)
renderer.sync(engine.state)
if (!headless) {
  if (inboundDuel) shell.offerDuel(inboundDuel)
  else shell.showHome()
}

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

  /** Pose a shell screen (home / over / teach-* / ask / help / paused) for a
   *  screenshot. Shell-only visual check; gameplay stays posed via captureAt. */
  poseShell(name: string) {
    running = false
    shell.pose(name)
    return name
  },

  /** Run the bot playtester inside the page, against the real engine. */
  playtest(bot: BotProfile, runs = 200, seed0 = 1) {
    const reports = []
    for (let i = 0; i < runs; i++) reports.push(simulateRun(seed0 + i, bot))
    return reports
  },
  ready: true,
}
