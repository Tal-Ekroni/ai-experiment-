#!/usr/bin/env node
/** Front-door QA harness: plays the REAL page like a human — through the home
 *  screen, no ?headless= debug hook — using the keyboard fallback. Reads the
 *  data-* state mirror (set by render.sync) so it sees every command, including
 *  deliberate repeats. Reports run stats and any page errors.
 *
 *  The unit playtests bypass the shell entirely, which is how a broken front
 *  door shipped once already. This instrument exists so that never recurs.
 *
 *  usage: node tools/frontdoor.mjs [--seconds 75] [--reaction 350]
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import net from 'node:net'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
const SECONDS = Number(arg('seconds', '75'))
const REACTION = Number(arg('reaction', '350'))
const PORT = Number(arg('port', String(5200 + Math.floor(Math.random() * 700))))

const portOpen = (p) => new Promise((r) => {
  const s = net.connect(p, '127.0.0.1'); const d = (ok) => { s.destroy(); r(ok) }
  s.once('connect', () => d(true)); s.once('error', () => d(false)); s.setTimeout(800, () => d(false))
})
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'],
  { cwd: new URL('..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'] })
let up = false
for (let i = 0; i < 40 && !up; i++) { up = await portOpen(PORT); if (!up) await sleep(500) }
if (!up) { server.kill(); throw new Error('vite failed to start') }

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
await sleep(1500)

const state = () => page.evaluate(() => ({ ...document.documentElement.dataset }))
console.log('home screen:', JSON.stringify(await state()))

// Front door: keyboard primary action.
await page.keyboard.press('Space')
await sleep(800)
let st = await state()
if (st.phase !== 'awaiting' && st.phase !== 'resolved') {
  // A teach/ask overlay may need one more confirmation.
  await page.keyboard.press('Space'); await sleep(800); st = await state()
}
if (st.phase !== 'awaiting' && st.phase !== 'resolved') {
  console.error('FRONT DOOR FAILED: game did not start from keyboard. state=', JSON.stringify(st))
  await browser.close(); server.kill(); process.exit(1)
}
console.log('started ok')

const KEY = { 'tap': 'Space', 'swipe-left': 'ArrowLeft', 'swipe-right': 'ArrowRight',
  'swipe-up': 'ArrowUp', 'swipe-down': 'ArrowDown', 'twist': 'KeyT', 'shake': 'KeyS',
  'hold': 'KeyH', 'pinch': 'KeyP', 'flip': 'KeyF' }

let lastIssued = '', acted = 0, overs = 0
const t0 = Date.now()
while (Date.now() - t0 < SECONDS * 1000) {
  const s = await state()
  if (s.phase === 'over') {
    overs++
    console.log(`run over #${overs} at ${((Date.now() - t0) / 1000).toFixed(0)}s, commands=${s.issued}, actions=${acted}`)
    if (overs >= 2) break
    await sleep(1200); await page.keyboard.press('Space'); await sleep(900)   // retry via front door
    lastIssued = ''; acted = 0
    continue
  }
  if (s.phase === 'awaiting' && s.issued !== lastIssued && s.action && s.action !== 'none') {
    lastIssued = s.issued
    await sleep(REACTION)
    const k = KEY[s.action]
    if (k) { await page.keyboard.press(k); acted++ }
  } else if (s.action === 'none') { lastIssued = s.issued }
  await sleep(40)
}
const fin = await state()
console.log('final:', JSON.stringify(fin), 'actions:', acted)
if (errors.length) { console.error('PAGE ERRORS:'); errors.forEach((e) => console.error(' ', e.slice(0, 160))) }
await browser.close(); server.kill()
console.log(errors.length ? 'FRONTDOOR: FAIL (page errors)' : 'FRONTDOOR: PASS')
process.exit(errors.length ? 1 : 0)
