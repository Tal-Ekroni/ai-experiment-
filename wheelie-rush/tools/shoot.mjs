#!/usr/bin/env node
/** Headless capture harness. Boots the dev server, drives the deterministic sim
 *  to fixed timestamps, and writes PNGs to shots/. This is what lets a critic
 *  agent actually SEE the game instead of reading source.
 *
 *  usage: npm run shoot -- [--script balance] [--times 2,6,12] [--seed 1337] [--tag round1]
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 ? process.argv[i + 1] : d
}
const script = arg('script', 'balance')
const times = arg('times', '2,6,12').split(',').map(Number)
const seed = Number(arg('seed', '1337'))
const tag = arg('tag', 'shot')
// Parallel agents each need their own server: default to a random free port.
const PORT = Number(arg('port', String(5200 + Math.floor(Math.random() * 700))))
const OUT = new URL('../shots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stderr.on('data', (d) => process.stderr.write(d))

let up = false
for (let i = 0; i < 60 && !up; i++) {
  try { const r = await fetch('http://localhost:5173/'); up = r.ok } catch { await sleep(500) }
}
if (!up) { server.kill(); throw new Error(`vite failed to start on ${PORT}`) }

// This container ships its own Chromium build, which may not match the version
// the playwright npm package expects. Pin the binary instead of downloading.
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
  ],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`http://localhost:${PORT}/?headless=1`, { waitUntil: 'networkidle' })
await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 20000 })

const report = []
for (const t of times) {
  const stats = await page.evaluate(
    ([t, s, seed]) => window.__game.captureAt(t, s, seed), [t, script, seed],
  )
  const file = `${OUT}${tag}-${script}-t${t}.png`
  await page.screenshot({ path: file })
  report.push({ t, file, ...stats })
  console.log(`t=${t}s  ${file}`)
  console.log(`   ${JSON.stringify(stats)}`)
}

if (errors.length) { console.error('\nPAGE ERRORS:'); errors.forEach((e) => console.error('  ' + e)) }
await browser.close()
server.kill()
console.log(`\n${report.length} frames -> shots/`)
process.exit(errors.length ? 1 : 0)
