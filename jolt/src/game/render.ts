/** OWNER: art agent. DOM + CSS, zero external assets — no font files, no images.
 *  The whole screen is one big readable command plus a timer that must be
 *  understood at a glance while panicking. Keep the Renderer surface intact. */
import { GameState } from './types'
import { intensity } from './commands'

export class Renderer {
  private root: HTMLElement
  private label = document.createElement('div')
  private ring = document.createElement('canvas')
  private hud = document.createElement('div')
  private flash = document.createElement('div')
  private ctx: CanvasRenderingContext2D

  constructor(root: HTMLElement) {
    this.root = root
    this.root.style.cssText =
      'position:fixed;inset:0;display:grid;place-items:center;font-family:' +
      'ui-rounded,system-ui,-apple-system,sans-serif;color:#fff;'

    this.flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .18s'
    this.ring.width = 520; this.ring.height = 520
    this.ring.style.cssText = 'position:fixed;width:min(78vw,78vh);height:min(78vw,78vh)'
    this.label.style.cssText =
      'position:relative;font-weight:800;letter-spacing:.02em;text-align:center;' +
      'font-size:clamp(30px,9vw,76px);text-shadow:0 4px 24px rgba(0,0,0,.5)'
    this.hud.style.cssText =
      'position:fixed;top:max(18px,env(safe-area-inset-top));left:0;right:0;' +
      'display:flex;justify-content:space-between;padding:0 22px;' +
      'font-weight:600;font-size:15px;opacity:.85;white-space:pre'

    this.root.append(this.flash, this.ring, this.label, this.hud)
    this.ctx = this.ring.getContext('2d')!
  }

  sync(s: GameState): void {
    const i = intensity(s.issued)
    // Background heats up as the game speeds up.
    document.body.style.background =
      `radial-gradient(120% 90% at 50% 15%, hsl(${228 - i * 40} 42% ${13 + i * 6}%), #06070b)`

    this.label.textContent =
      s.phase === 'over' ? 'GAME OVER'
      : s.phase === 'idle' ? 'TAP TO START'
      : s.command ? s.command.label : ''

    this.label.style.color =
      s.lastResult === 'wrong' || s.lastResult === 'timeout' ? '#ff6b6b'
      : s.phase === 'resolved' ? '#5ce88f' : '#fff'

    this.flash.style.background =
      s.lastResult === 'correct' ? 'rgba(92,232,143,.16)' : 'rgba(255,107,107,.20)'
    this.flash.style.opacity = s.phase === 'resolved' ? '1' : '0'

    this.hud.textContent = ''
    const left = document.createElement('span')
    left.textContent = `${s.score}`
    const right = document.createElement('span')
    right.textContent = `${'●'.repeat(Math.max(0, s.lives))}${'○'.repeat(Math.max(0, 3 - s.lives))}   x${s.streak}`
    this.hud.append(left, right)

    this.drawRing(s)
  }

  private drawRing(s: GameState): void {
    const c = this.ctx
    const w = this.ring.width
    const r = w / 2 - 26
    c.clearRect(0, 0, w, w)
    if (s.phase !== 'awaiting' || !s.command) return
    const left = Math.max(0, 1 - s.elapsed / s.command.windowMs)
    c.lineWidth = 14
    c.lineCap = 'round'
    c.strokeStyle = 'rgba(255,255,255,.10)'
    c.beginPath(); c.arc(w / 2, w / 2, r, 0, Math.PI * 2); c.stroke()
    // Runs green to red as the window closes — readable in peripheral vision.
    c.strokeStyle = `hsl(${left * 130} 85% 58%)`
    c.beginPath()
    c.arc(w / 2, w / 2, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2)
    c.stroke()
  }
}
