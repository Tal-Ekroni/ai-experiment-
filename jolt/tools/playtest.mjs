#!/usr/bin/env node
/** Bot playtest harness. Runs the REAL engine headlessly against simulated players
 *  with human reaction times, and reports whether the difficulty ramp is fair.
 *
 *  Screenshots cannot judge a reaction game — timing can. This is the primary
 *  quality instrument for this project.
 *
 *  Human reaction-time reference (simple visual choice reaction, hand movement):
 *    ~250ms  exceptional / young gamer
 *    ~400ms  typical adult
 *    ~600ms  casual or distracted player
 *
 *  usage: node tools/playtest.mjs [--runs 200]
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import net from 'node:net'

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 ? process.argv[i + 1] : d
}
const RUNS = Number(arg('runs', '200'))
const PORT = Number(arg('port', String(5200 + Math.floor(Math.random() * 700))))

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1')
    const done = (ok) => { sock.destroy(); resolve(ok) }
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.setTimeout(1000, () => done(false))
  })
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stderr.on('data', (d) => process.stderr.write(d))

let up = false
for (let i = 0; i < 60 && !up; i++) { up = await portOpen(PORT); if (!up) await sleep(500) }
if (!up) { server.kill(); throw new Error(`vite failed to start on ${PORT}`) }

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(`http://localhost:${PORT}/?headless=1`, { waitUntil: 'networkidle' })
await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 20000 })

const PROFILES = [
  { name: 'exceptional (250ms)', bot: { reactionMs: 250, jitterMs: 60, errorRate: 0.03 } },
  { name: 'typical     (400ms)', bot: { reactionMs: 400, jitterMs: 90, errorRate: 0.07 } },
  { name: 'casual      (600ms)', bot: { reactionMs: 600, jitterMs: 130, errorRate: 0.12 } },
]

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] }
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1)

console.log(`\nBOT PLAYTEST — ${RUNS} runs per profile\n${'='.repeat(62)}`)
const summary = []
for (const p of PROFILES) {
  const reports = await page.evaluate(
    ([bot, runs]) => window.__game.playtest(bot, runs, 1), [p.bot, RUNS],
  )
  const survived = reports.map((r) => r.issued)
  const secs = reports.map((r) => r.runtimeMs / 1000)
  const timeouts = reports.filter((r) => r.deathCause === 'timeout').length
  const wrongs = reports.filter((r) => r.deathCause === 'wrong').length
  const deathWin = reports.filter((r) => r.deathWindowMs > 0).map((r) => r.deathWindowMs)

  const row = {
    profile: p.name,
    medianCommands: median(survived),
    medianSeconds: +median(secs).toFixed(1),
    medianScore: median(reports.map((r) => r.score)),
    diedToTimeout: `${((timeouts / reports.length) * 100).toFixed(0)}%`,
    diedToWrong: `${((wrongs / reports.length) * 100).toFixed(0)}%`,
    medianDeathWindowMs: deathWin.length ? Math.round(median(deathWin)) : null,
  }
  summary.push(row)
  console.log(`\n${p.name}`)
  console.log(`  median run:       ${row.medianCommands} commands, ${row.medianSeconds}s, ${row.medianScore} pts`)
  console.log(`  died to:          ${row.diedToTimeout} timeout / ${row.diedToWrong} wrong action`)
  console.log(`  window at death:  ${row.medianDeathWindowMs}ms  (bot reacts in ~${p.bot.reactionMs}ms)`)
  console.log(`  mean commands:    ${mean(survived).toFixed(1)}`)
}

console.log(`\n${'='.repeat(62)}`)
console.log('FAIRNESS READ:')
console.log('  A good run for a typical player is roughly 45-90s. Much shorter is')
console.log('  punishing; much longer is boring. If the window at death is BELOW the')
console.log('  profile reaction time, the ramp has outrun human capability and the')
console.log('  death was unavoidable rather than earned.')
if (errors.length) { console.error('\nPAGE ERRORS:'); errors.forEach((e) => console.error('  ' + e)) }
console.log(JSON.stringify({ summary }, null, 2))

await browser.close()
server.kill()
process.exit(errors.length ? 1 : 0)
