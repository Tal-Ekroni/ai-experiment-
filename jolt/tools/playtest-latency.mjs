#!/usr/bin/env node
/** Gesture-latency-aware bot playtest. tools/playtest.mjs (via engine.ts's
 *  simulateRun) submits the abstract action at reactionMs with ZERO gesture
 *  completion time — the instant-keyboard path. On the shipped touch/motion
 *  product a hold IS a wait of HOLD_MS, a shake IS two direction reversals,
 *  a flip IS physically rotating the phone. This harness runs the SAME real
 *  Engine but adds GESTURE_LATENCY_MS[action] (exported by src/game/input.ts,
 *  ceilings verified against the real cores by tests/input.test.mjs) after
 *  reaction time, so the deadline math the touch player actually faces is
 *  measured instead of hidden.
 *
 *  It also reports UNAVOIDABLE deaths — deaths on a command whose window was
 *  smaller than reactionMs + gesture latency, i.e. lost before the player
 *  moved — and, statically, the command index at which each action's window
 *  first sinks below a typical player's reaction + latency.
 *
 *  usage: node tools/playtest-latency.mjs [--runs 200]
 */
import { compileCore } from './compile-core.mjs'

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 ? process.argv[i + 1] : d
}
const RUNS = Number(arg('runs', '200'))

const { engine, commands, rng, input } = compileCore()
const { Engine } = engine
const { makeRng } = rng
const { gestureLatencyMs } = input

function simulateRunWithGesture(seed, bot, maxCommands = 400) {
  const e = new Engine(seed)
  const r = makeRng(seed ^ 0x9e3779b9)
  e.start()
  const STEP = 10
  let submitAt = -1
  let planFor = -1              // issued index the current plan belongs to
  let planned = null            // action the bot will submit
  const deaths = []             // {label, action, windowMs, unavoidable, cause}
  let prevLives = e.state.lives

  const noteLifeLoss = (cause) => {
    const s = e.state
    if (s.lives < prevLives && s.command) {
      deaths.push({
        label: s.command.label,
        action: s.command.action,
        windowMs: s.command.windowMs,
        cause,
        unavoidable: !s.command.inhibit &&
          s.command.windowMs < bot.reactionMs + gestureLatencyMs(s.command.action),
      })
    }
    prevLives = s.lives
  }

  while (e.state.phase !== 'over' && e.state.issued <= maxCommands) {
    const s = e.state
    if (s.phase === 'awaiting' && s.command) {
      if (planFor !== s.issued) {
        planFor = s.issued
        const decideAt = bot.reactionMs + (r() * 2 - 1) * bot.jitterMs
        const twitches = s.command.inhibit && r() < 0.35
        if (s.command.inhibit && !twitches) {
          planned = null                       // disciplined: do nothing
        } else {
          const wrong = r() < bot.errorRate
          planned = wrong ? 'tap'
            : s.command.action === 'none' ? 'tap' : s.command.action
        }
        // The gesture the player STARTS at decideAt completes only after its
        // physical/recogniser latency — this is the line simulateRun lacks.
        submitAt = planned === null ? Infinity : decideAt + gestureLatencyMs(planned)
      }
      if (planned !== null && s.elapsed >= submitAt) {
        e.submit(planned)
        noteLifeLoss('wrong-or-late-gesture')
        planned = null
        submitAt = Infinity
      }
    }
    const before = e.state.lives
    e.tick(STEP)
    if (e.state.lives < before) noteLifeLoss('timeout')
  }
  const rep = e.report()
  return { ...rep, deaths }
}

const PROFILES = [
  { name: 'exceptional (250ms)', bot: { reactionMs: 250, jitterMs: 60, errorRate: 0.03 } },
  { name: 'typical     (400ms)', bot: { reactionMs: 400, jitterMs: 90, errorRate: 0.07 } },
  { name: 'casual      (600ms)', bot: { reactionMs: 600, jitterMs: 130, errorRate: 0.12 } },
]

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0 }
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1)

console.log(`\nGESTURE-LATENCY-AWARE BOT PLAYTEST — ${RUNS} runs per profile`)
console.log(`(reaction time + real recogniser/physical gesture completion time)`)
console.log('='.repeat(66))

const summary = []
for (const p of PROFILES) {
  const reports = []
  for (let i = 0; i < RUNS; i++) reports.push(simulateRunWithGesture(1 + i, p.bot))
  const survived = reports.map((x) => x.issued)
  const secs = reports.map((x) => x.runtimeMs / 1000)
  const timeouts = reports.filter((x) => x.deathCause === 'timeout').length
  const wrongs = reports.filter((x) => x.deathCause === 'wrong').length
  const deathWin = reports.filter((x) => x.deathWindowMs > 0).map((x) => x.deathWindowMs)
  const allDeaths = reports.flatMap((x) => x.deaths)
  const unavoidable = allDeaths.filter((d) => d.unavoidable)
  const byLabel = {}
  for (const d of allDeaths) byLabel[d.label] = (byLabel[d.label] || 0) + 1
  const top = Object.entries(byLabel).sort((a, b) => b[1] - a[1]).slice(0, 4)

  const row = {
    profile: p.name,
    medianCommands: median(survived),
    medianSeconds: +median(secs).toFixed(1),
    diedToTimeout: `${((timeouts / reports.length) * 100).toFixed(0)}%`,
    diedToWrong: `${((wrongs / reports.length) * 100).toFixed(0)}%`,
    medianDeathWindowMs: deathWin.length ? Math.round(median(deathWin)) : null,
    unavoidableLifeLossPct: allDeaths.length
      ? +((unavoidable.length / allDeaths.length) * 100).toFixed(1) : 0,
    topDeathCommands: Object.fromEntries(top),
  }
  summary.push(row)
  console.log(`\n${p.name}`)
  console.log(`  median run:          ${row.medianCommands} commands, ${row.medianSeconds}s`)
  console.log(`  died to:             ${row.diedToTimeout} timeout / ${row.diedToWrong} wrong`)
  console.log(`  window at death:     ${row.medianDeathWindowMs}ms`)
  console.log(`  mean commands:       ${mean(survived).toFixed(1)}`)
  console.log(`  UNAVOIDABLE losses:  ${row.unavoidableLifeLossPct}% of life losses ` +
    `(window < reaction ${p.bot.reactionMs}ms + gesture latency)`)
  console.log(`  deadliest commands:  ${top.map(([l, n]) => `${l} x${n}`).join(', ') || '-'}`)
}

// Static deadline audit of the current ramp: for each action, the first
// command index whose window is below a typical player's reaction + latency.
console.log(`\n${'='.repeat(66)}`)
console.log('STATIC DEADLINE AUDIT (typical 400ms reaction + gesture latency):')
const specs = commands.available(10000)
const audit = []
for (const spec of specs) {
  if (spec.inhibit) continue
  const lat = gestureLatencyMs(spec.action)
  const need = 400 + lat
  let onset = null
  for (let i = spec.minIssued ?? 0; i <= 400; i++) {
    // Window as commands.ts computes it for this spec at command index i.
    // Mirror nextCommand() exactly: multiplicative scale PLUS additive gesture latency.
    const w = Math.round(commands.windowFor(i) * (spec.windowScale ?? 1)) + lat
    if (w < need) { onset = i; break }
  }
  audit.push({ label: spec.label, latencyMs: lat, needsMs: need, unwinnableFromCommand: onset })
  console.log(`  ${spec.label.padEnd(12)} latency ${String(lat).padStart(3)}ms  ` +
    `needs >=${need}ms  ` +
    (onset === null ? 'never unwinnable' : `UNWINNABLE from command ${onset}`))
}
console.log('\nFAIRNESS READ: any non-null onset above means a typical player who')
console.log('reacts instantly-for-a-human still cannot physically complete that')
console.log('gesture in the window — commands.ts must ADD the latency to the')
console.log('window (additive term, not a multiplier). Bot numbers above show how')
console.log('much of the run this actually costs.')
console.log(JSON.stringify({ summary, audit }, null, 2))
