import { Renderer } from './garden/render'
import { createTree, advance, prune, setLight, visibleSegments } from './garden/growth'
import { TreeState, v, norm, seasonAt } from './garden/types'
import { Ambience } from './garden/audio'
import { save, load } from './garden/persist'

const canvas = document.getElementById('c') as HTMLCanvasElement
const renderer = new Renderer(canvas)
const ambience = new Ambience()
let tree: TreeState = createTree(7)

const headless = new URLSearchParams(location.search).has('headless')
let running = !headless
let offlineGain = 0
if (!headless) offlineGain = load(tree, Date.now())

const hud = document.createElement('div')
hud.style.cssText =
  'position:fixed;top:14px;left:16px;font:500 14px ui-rounded,system-ui,sans-serif;' +
  'color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.6);pointer-events:none;white-space:pre;line-height:1.6'
document.body.appendChild(hud)

function resize() { renderer.resize(window.innerWidth, window.innerHeight) }
addEventListener('resize', resize)
resize()

// --- interaction -----------------------------------------------------------
// Tap a branch to prune it. Drag anywhere else to move the light the tree
// grows toward. OWNER: interaction agent — deepen this.
let downX = 0, downY = 0, dragging = false
addEventListener('pointerdown', (e) => {
  downX = e.clientX; downY = e.clientY; dragging = false
  ambience.start()
})
addEventListener('pointermove', (e) => {
  if (e.buttons === 0) return
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragging = true
  if (dragging) {
    const nx = (e.clientX / window.innerWidth) * 2 - 1
    const ny = -(e.clientY / window.innerHeight) * 2 + 1
    setLight(tree, norm(v(nx * 1.4, 0.5 + ny * 1.2, 0.6)))
  }
})
addEventListener('pointerup', (e) => {
  if (dragging) return
  const nx = (e.clientX / window.innerWidth) * 2 - 1
  const ny = -(e.clientY / window.innerHeight) * 2 + 1
  const id = renderer.pick(nx, ny, tree.segments)
  if (id >= 0) prune(tree, id)
})

// --- loop ------------------------------------------------------------------
let last = performance.now()
function tick(now: number) {
  requestAnimationFrame(tick)
  if (!running) return
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  advance(tree, dt)
  draw()
  ambience.setWind(0.4)
}

function draw() {
  renderer.sync(tree)
  renderer.frame()
  const vis = visibleSegments(tree).length
  hud.textContent =
    `${seasonAt(tree.age)}   day ${Math.floor(tree.age / 120) + 1}\n` +
    `${vis} branches   ${tree.pruned.length} pruned` +
    (offlineGain > 1 ? `\ngrew ${offlineGain.toFixed(0)}s while you were away` : '')
}
requestAnimationFrame(tick)

if (!headless) {
  setInterval(() => save(tree, Date.now()), 5000)
  addEventListener('pagehide', () => save(tree, Date.now()))
}

// --- headless capture hook -------------------------------------------------
;(window as unknown as Record<string, unknown>).__game = {
  /** Reset, grow to `seconds` of tree age, render exactly one frame. */
  captureAt(seconds: number, _script = 'grow', seed = 7) {
    running = false
    tree = createTree(seed)
    advance(tree, seconds)
    draw()
    return {
      age: tree.age,
      season: seasonAt(tree.age),
      totalSegments: tree.segments.length,
      visibleSegments: visibleSegments(tree).length,
      pruned: tree.pruned.length,
    }
  },
  ready: true,
}
