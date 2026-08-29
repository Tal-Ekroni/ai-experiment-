/** OWNER: art agent. DOM + CSS + canvas, zero external assets — no font files,
 *  no images, no fetches. Every state change animates with intent, visual
 *  energy escalates with intensity(), and the command stays readable in a
 *  fraction of a second by a panicking player. Renderer surface kept intact:
 *  constructor(root) + sync(state). All change-detection happens inside sync()
 *  by diffing the previous frame's state, so the engine contract is untouched. */
import { GameState } from './types'
import { intensity } from './commands'

/** Per-action accent hue + oversized backdrop glyph. The glyph sits BEHIND the
 *  text at low opacity — a pre-attentive directional cue (arrows for swipes)
 *  that never competes with the label. Glyphs are plain unicode present in
 *  every system font. Inhibition gets no glyph: its cue is the whole screen
 *  flipping cold blue, which reads faster than any icon. */
const ART: Record<string, { hue: number; glyph: string }> = {
  'tap':         { hue: 145, glyph: '' },   // the default verb needs no icon — keep the screen clean
  'swipe-up':    { hue: 200, glyph: '▲' },
  'swipe-down':  { hue: 215, glyph: '▼' },
  'swipe-left':  { hue: 188, glyph: '◀' },
  'swipe-right': { hue: 188, glyph: '▶' },
  'twist':       { hue: 45,  glyph: '↻' },
  'shake':       { hue: 25,  glyph: '≈' },
  'hold':        { hue: 275, glyph: '◉' },
  'release':     { hue: 275, glyph: '○' },
  'pinch':       { hue: 320, glyph: '›‹' },
  'flip':        { hue: 10,  glyph: '⇅' },
  'none':        { hue: 205, glyph: '' },
}

const INHIBIT_COLOR = '#66ccff'

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; max: number; size: number; hue: number
  kind: 'spark' | 'ember'
}

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export class Renderer {
  private root: HTMLElement
  private shaker = document.createElement('div')     // whole-screen punch target
  private fx = document.createElement('canvas')      // full-screen particles
  private ring = document.createElement('canvas')    // timer ring
  private glyph = document.createElement('div')      // faded action icon behind text
  private kicker = document.createElement('div')     // "JOLT" title on idle/over
  private label = document.createElement('div')      // THE command — always center
  private sub = document.createElement('div')        // verdict / score line
  private combo = document.createElement('div')      // streak counter, bottom center
  private hud = document.createElement('div')
  private scoreEl = document.createElement('div')
  private livesEl = document.createElement('div')
  private flash = document.createElement('div')
  private vignette = document.createElement('div')
  private ctx: CanvasRenderingContext2D
  private fxCtx: CanvasRenderingContext2D

  // previous-frame state, for detecting what just happened
  private pIssued = -1
  private pScore = 0
  private pPhase = ''
  private pInhibit = false
  private particles: Particle[] = []
  private emberCarry = 0
  private pRuntime = 0
  private idleAnim: Animation | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.root.style.cssText =
      'position:fixed;inset:0;overflow:hidden;font-family:' +
      'ui-rounded,system-ui,-apple-system,sans-serif;color:#fff;'

    this.shaker.style.cssText =
      'position:absolute;inset:0;display:grid;place-items:center;will-change:transform'

    this.fx.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
    this.fx.width = 640; this.fx.height = 360

    this.vignette.style.cssText =
      'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .25s;' +
      'background:radial-gradient(120% 100% at 50% 50%, transparent 55%, rgba(255,30,40,.42) 100%)'

    this.flash.style.cssText =
      'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .18s'

    this.ring.width = 520; this.ring.height = 520
    this.ring.style.cssText =
      'position:absolute;width:min(80vw,80vh);height:min(80vw,80vh);pointer-events:none'

    this.glyph.style.cssText =
      'position:absolute;font-weight:800;line-height:1;pointer-events:none;' +
      'font-size:min(46vw,46vh);opacity:.1;user-select:none'

    this.kicker.style.cssText =
      'position:absolute;top:26%;left:0;right:0;text-align:center;font-weight:800;' +
      'font-size:clamp(15px,3.4vw,24px);letter-spacing:.55em;text-indent:.55em;opacity:.55'

    this.label.style.cssText =
      'position:relative;z-index:2;font-weight:800;letter-spacing:.02em;text-align:center;' +
      'font-size:clamp(30px,9vw,76px);text-shadow:0 4px 24px rgba(0,0,0,.55);' +
      'padding:0 14px;will-change:transform'

    this.sub.style.cssText =
      'position:absolute;top:calc(50% + clamp(30px,7.5vw,64px));left:0;right:0;z-index:2;' +
      'text-align:center;font-weight:700;font-size:clamp(14px,3.4vw,24px);' +
      'letter-spacing:.14em;opacity:0;transition:opacity .15s;text-shadow:0 2px 12px rgba(0,0,0,.6)'

    this.combo.style.cssText =
      'position:absolute;bottom:max(26px,env(safe-area-inset-bottom));left:0;right:0;' +
      'text-align:center;font-weight:800;opacity:0;will-change:transform;' +
      'font-size:clamp(18px,4.6vw,34px);transition:opacity .2s'

    this.hud.style.cssText =
      'position:absolute;top:max(18px,env(safe-area-inset-top));left:0;right:0;' +
      'display:flex;justify-content:space-between;align-items:center;padding:0 22px;' +
      'font-weight:700;font-size:clamp(16px,3.2vw,22px)'
    this.scoreEl.style.cssText = 'min-width:3ch;will-change:transform'
    this.livesEl.style.cssText = 'display:flex;gap:7px;align-items:center'
    for (let k = 0; k < 3; k++) {
      const dot = document.createElement('span')
      dot.style.cssText =
        'width:13px;height:13px;border-radius:50%;background:#fff;display:inline-block;' +
        'box-shadow:0 0 8px rgba(255,255,255,.6);transition:background .2s,box-shadow .2s'
      this.livesEl.append(dot)
    }
    this.hud.append(this.scoreEl, this.livesEl)

    this.shaker.append(this.fx, this.vignette, this.flash, this.ring,
      this.glyph, this.kicker, this.label, this.sub, this.combo, this.hud)
    this.root.append(this.shaker)
    this.ctx = this.ring.getContext('2d')!
    this.fxCtx = this.fx.getContext('2d')!
  }

  sync(s: GameState): void {
    const i = intensity(s.issued)
    const art = (s.command && ART[s.command.action]) || ART['tap']
    const inhibit = s.phase === 'awaiting' && !!s.command && s.command.inhibit
    // A jump of more than 250ms of game time in one sync means the state was
    // POSED (screenshot harness) rather than played: render the at-rest frame —
    // no mid-flight tweens — and pre-seed the ambient field to its steady state.
    const posed = s.runtime - this.pRuntime > 250
    this.setSnap(posed)

    this.paintBackground(s, i, inhibit)
    this.syncLabel(s, art, inhibit, posed)
    this.syncHud(s, i)
    this.syncCombo(s, i)
    this.detectEvents(s, art, posed)
    this.drawRing(s, i, art.hue, inhibit)
    if (posed) this.seedEmbers(i)
    this.drawFx(s, i)

    this.pIssued = s.issued
    this.pScore = s.score
    this.pPhase = s.phase
    this.pRuntime = s.runtime
    if (s.command) this.pInhibit = s.command.inhibit
  }

  /** Kill CSS transitions for a posed frame so screenshots show final values. */
  private setSnap(posed: boolean): void {
    const els: HTMLElement[] = [this.sub, this.flash, this.vignette, this.combo]
    for (let k = 0; k < this.livesEl.children.length; k++) {
      els.push(this.livesEl.children[k] as HTMLElement)
    }
    for (const el of els) el.style.transitionDuration = posed ? '0s' : ''
  }

  // ---------------------------------------------------------------- background
  private paintBackground(s: GameState, i: number, inhibit: boolean): void {
    // Heats from cold night-blue toward hot violet-red as the run escalates.
    // The inhibition command inverts everything to an unmistakable cold blue.
    if (inhibit) {
      document.body.style.background =
        'radial-gradient(120% 90% at 50% 15%, hsl(208 72% 22%), #020813)'
    } else if (s.phase === 'over') {
      document.body.style.background =
        'radial-gradient(120% 90% at 50% 15%, hsl(348 45% 12%), #0a0508)'
    } else {
      document.body.style.background =
        `radial-gradient(120% 90% at 50% 15%, hsl(${228 + i * 112} ${42 + i * 30}% ${13 + i * 8}%), #06070b)`
    }
    // Danger vignette: creeps in with intensity, slams in when the window is
    // nearly gone — urgency readable without looking anywhere in particular.
    let danger = i * 0.22
    if (s.phase === 'awaiting' && s.command && !s.command.inhibit) {
      const left = Math.max(0, 1 - s.elapsed / s.command.windowMs)
      if (left < 0.42) danger = Math.max(danger, (1 - left / 0.42) * 0.85)
    }
    if (s.phase === 'over') danger = 0.9
    this.vignette.style.opacity = String(danger)
  }

  // -------------------------------------------------------------------- label
  private syncLabel(s: GameState, art: { hue: number; glyph: string }, inhibit: boolean, posed: boolean): void {
    const over = s.phase === 'over'
    const idle = s.phase === 'idle'

    this.label.textContent =
      over ? 'GAME OVER'
      : idle ? 'TAP TO START'
      : s.command ? s.command.label : ''

    this.label.style.color =
      s.phase === 'resolved' || over
        ? (s.lastResult === 'correct' ? '#5ce88f' : '#ff5c66')
        : inhibit ? INHIBIT_COLOR : '#fff'

    this.kicker.textContent = idle || over ? 'JOLT' : ''
    this.kicker.style.color = over ? '#ff8b93' : '#9fb4ff'

    // Backdrop glyph: directional cue behind the words.
    this.glyph.textContent = idle ? '' : over ? '' : art.glyph
    this.glyph.style.color = `hsl(${art.hue} 95% 74%)`
    this.glyph.style.opacity = s.phase === 'awaiting' ? '.13' : '.05'

    // Sub line: verdict after a resolution, score after death, hint on idle.
    if (over) {
      this.sub.textContent = `SCORE ${s.score}   ·   BEST STREAK ${s.bestStreak}`
      this.sub.style.color = '#ffd9dc'
      this.sub.style.opacity = '.95'
    } else if (idle) {
      this.sub.textContent = 'OBEY THE VOICE BEFORE THE RING CLOSES'
      this.sub.style.color = '#aab8e8'
      this.sub.style.opacity = '.8'
    } else if (s.phase === 'resolved' && s.lastResult && s.lastResult !== 'correct') {
      this.sub.textContent =
        s.lastResult === 'timeout' ? 'TOO SLOW' : this.pInhibit ? 'YOU MOVED' : 'WRONG'
      this.sub.style.color = '#ff8b93'
      this.sub.style.opacity = '1'
    } else {
      this.sub.style.opacity = '0'
    }

    // Idle breathing pulse — cancelled the moment play starts.
    if (idle && !this.idleAnim && !reducedMotion() && !posed) {
      this.idleAnim = this.label.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
        { duration: 1600, iterations: Infinity, easing: 'ease-in-out' })
    } else if (!idle && this.idleAnim) {
      this.idleAnim.cancel()
      this.idleAnim = null
    }
  }

  // ---------------------------------------------------------------------- hud
  private syncHud(s: GameState, i: number): void {
    this.scoreEl.textContent = String(s.score)
    this.scoreEl.style.color = `hsl(${228 + i * 112} 100% 88%)`
    const dots = this.livesEl.children
    for (let k = 0; k < dots.length; k++) {
      const el = dots[k] as HTMLElement
      const alive = k < s.lives
      el.style.background = alive ? '#fff' : 'transparent'
      el.style.boxShadow = alive
        ? `0 0 ${8 + i * 8}px rgba(255,255,255,.6)`
        : 'inset 0 0 0 2px rgba(255,255,255,.35)'
    }
  }

  private syncCombo(s: GameState, i: number): void {
    const show = s.streak >= 2 && (s.phase === 'awaiting' || s.phase === 'resolved')
    this.combo.textContent = show ? `×${s.streak}` : this.combo.textContent
    this.combo.style.opacity = show ? '1' : '0'
    if (show) {
      // The counter itself heats up: white → gold → hot as the streak builds.
      const heat = Math.min(1, s.streak / 25)
      this.combo.style.color = `hsl(${52 - heat * 42} ${60 + heat * 40}% ${72 - heat * 8}%)`
      this.combo.style.textShadow =
        `0 0 ${6 + heat * 22 + i * 8}px hsl(${52 - heat * 42} 100% 60% / .8)`
    }
  }

  // ------------------------------------------------------- one-shot reactions
  private detectEvents(s: GameState, art: { hue: number; glyph: string }, posed: boolean): void {
    const rm = reducedMotion() || posed

    // A NEW COMMAND LANDED: snap the words in with overshoot + a shockwave.
    if (s.phase === 'awaiting' && s.issued !== this.pIssued) {
      if (!rm) {
        this.label.animate(
          [
            { transform: 'scale(1.55)', opacity: 0.1 },
            { transform: 'scale(.94)', opacity: 1, offset: 0.62 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 170, easing: 'cubic-bezier(.22,1.2,.36,1)' })
        this.glyph.animate(
          [{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 0.11 }],
          { duration: 220, easing: 'ease-out' })
      }
      if (!rm) this.shockwave(s.command && s.command.inhibit ? 205 : art.hue)
    }

    const resolvedNow = s.phase !== this.pPhase && (s.phase === 'resolved' || s.phase === 'over')
    if (resolvedNow && s.lastResult === 'correct') {
      // SUCCESS: green flash + spark burst; a milestone every 5 gets a bigger one.
      this.flash.style.background = 'rgba(92,232,143,.15)'
      this.flash.style.opacity = '1'
      const milestone = s.streak > 0 && s.streak % 5 === 0
      this.burst(milestone ? 46 : 14, art.hue, milestone ? 3.4 : 2.2)
      if (milestone && !rm) {
        this.combo.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }, { transform: 'scale(1)' }],
          { duration: 380, easing: 'cubic-bezier(.2,1.6,.4,1)' })
      } else if (!rm) {
        this.combo.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }],
          { duration: 200, easing: 'ease-out' })
      }
      // Score pop + floater — only for a single command's worth of points.
      const gained = s.score - this.pScore
      if (gained > 0 && gained <= 40) {
        if (!rm) this.scoreEl.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
          { duration: 220, easing: 'ease-out' })
        if (!rm) this.floater(`+${gained}`, `hsl(${art.hue} 90% 70%)`)
      }
    }

    if (resolvedNow && (s.lastResult === 'wrong' || s.lastResult === 'timeout')) {
      // FAILURE: hard punch — red slam, screen shake, shatter burst, a life pops.
      this.flash.style.background = 'rgba(255,60,70,.30)'
      this.flash.style.opacity = '1'
      this.burst(30, 355, 3)
      if (!rm) {
        this.shaker.animate(
          [
            { transform: 'translate(0,0)' },
            { transform: 'translate(-13px,6px)' }, { transform: 'translate(11px,-5px)' },
            { transform: 'translate(-7px,-4px)' }, { transform: 'translate(5px,3px)' },
            { transform: 'translate(0,0)' },
          ],
          { duration: 300, easing: 'ease-out' })
        const lost = this.livesEl.children[Math.max(0, s.lives)] as HTMLElement | undefined
        if (lost) lost.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(2.1)', opacity: 0.2 }, { transform: 'scale(1)' }],
          { duration: 420, easing: 'ease-out' })
      }
    }

    if (s.phase === 'awaiting' || s.phase === 'idle') this.flash.style.opacity = '0'

    // GAME OVER: one heavy final beat.
    if (s.phase === 'over' && this.pPhase !== 'over' && !rm) {
      this.label.animate(
        [{ transform: 'scale(1.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.2,1.3,.4,1)' })
      this.burst(60, 355, 2.6)
    }
  }

  /** Expanding DOM ring pulse around the timer — a beat marking command onset. */
  private shockwave(hue: number): void {
    if (reducedMotion()) return
    const w = document.createElement('div')
    w.style.cssText =
      'position:absolute;width:min(80vw,80vh);height:min(80vw,80vh);border-radius:50%;' +
      `border:3px solid hsl(${hue} 90% 65%);pointer-events:none;opacity:.7`
    this.shaker.insertBefore(w, this.label)
    const a = w.animate(
      [{ transform: 'scale(.55)', opacity: 0.75 }, { transform: 'scale(1.18)', opacity: 0 }],
      { duration: 330, easing: 'cubic-bezier(.16,.8,.3,1)' })
    a.onfinish = () => w.remove()
    setTimeout(() => w.remove(), 600)   // belt & braces if animations are paused
  }

  /** Rising "+N" score floater above the command text. */
  private floater(text: string, color: string): void {
    if (reducedMotion()) return
    const f = document.createElement('div')
    f.textContent = text
    f.style.cssText =
      'position:absolute;top:34%;left:0;right:0;text-align:center;font-weight:800;' +
      `font-size:clamp(18px,4.5vw,32px);color:${color};pointer-events:none;` +
      'text-shadow:0 2px 10px rgba(0,0,0,.5)'
    this.shaker.append(f)
    const a = f.animate(
      [
        { transform: 'translateY(0) scale(.8)', opacity: 0 },
        { transform: 'translateY(-18px) scale(1)', opacity: 1, offset: 0.25 },
        { transform: 'translateY(-52px) scale(1)', opacity: 0 },
      ],
      { duration: 650, easing: 'ease-out' })
    a.onfinish = () => f.remove()
    setTimeout(() => f.remove(), 900)
  }

  // ---------------------------------------------------------------- particles
  /** Sparks fired outward FROM THE TIMER RING, never over the command text —
   *  celebration lives in the periphery, the words stay untouched. */
  private burst(n: number, hue: number, speed: number): void {
    const cx = this.fx.width / 2, cy = this.fx.height / 2
    // The ring spans min(80vw,80vh); its stroked radius is ~88% of that half.
    const ringR = Math.min(this.fx.width, this.fx.height) * 0.8 * 0.44
    for (let k = 0; k < n && this.particles.length < 130; k++) {
      const a = Math.random() * Math.PI * 2
      const v = (0.6 + Math.random()) * speed * 1.8
      this.particles.push({
        x: cx + Math.cos(a) * ringR, y: cy + Math.sin(a) * ringR,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0, max: 380 + Math.random() * 320,
        size: 1.4 + Math.random() * 2.4, hue: hue + (Math.random() * 24 - 12),
        kind: 'spark',
      })
    }
  }

  /** Put the ambient ember field straight into its steady state, so a single
   *  posed frame shows the same energy a live player would be seeing. */
  private seedEmbers(i: number): void {
    this.particles = this.particles.filter((p) => p.kind !== 'ember')
    if (i <= 0.12) return
    const n = Math.min(60, Math.round(i * 34))
    const W = this.fx.width, H = this.fx.height
    for (let k = 0; k < n; k++) {
      const max = 1400 + Math.random() * 1200
      this.particles.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3, vy: -(0.35 + Math.random() * 0.7) * (0.6 + i),
        life: Math.random() * max * 0.9, max,
        size: 0.8 + Math.random() * 1.6, hue: 228 + i * 112 + Math.random() * 30,
        kind: 'ember',
      })
    }
  }

  /** Ambient embers that rise faster and multiply as intensity climbs — the
   *  late game LOOKS frantic even between commands. */
  private drawFx(s: GameState, i: number): void {
    const c = this.fxCtx
    const W = this.fx.width, H = this.fx.height
    const dt = Math.min(100, Math.max(0, s.runtime - this.pRuntime)) || 16

    if ((s.phase === 'awaiting' || s.phase === 'resolved') && i > 0.12 && !reducedMotion()) {
      this.emberCarry += dt * i * 0.012
      while (this.emberCarry >= 1 && this.particles.length < 130) {
        this.emberCarry--
        this.particles.push({
          x: Math.random() * W, y: H + 4,
          vx: (Math.random() - 0.5) * 0.3, vy: -(0.35 + Math.random() * 0.7) * (0.6 + i),
          life: 0, max: 1400 + Math.random() * 1200,
          size: 0.8 + Math.random() * 1.6, hue: 228 + i * 112 + Math.random() * 30,
          kind: 'ember',
        })
      }
    }

    c.clearRect(0, 0, W, H)
    const step = dt / 16.7
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k]
      p.life += dt
      p.x += p.vx * step * 2
      p.y += p.vy * step * 2
      if (p.kind === 'spark') { p.vx *= 0.985; p.vy *= 0.985 }
      const t = p.life / p.max
      if (t >= 1 || p.y < -6) { this.particles.splice(k, 1); continue }
      const alpha = p.kind === 'spark' ? (1 - t) * 0.9 : Math.sin(t * Math.PI) * 0.5
      c.fillStyle = `hsl(${p.hue} 90% 65% / ${alpha})`
      c.beginPath()
      c.arc(p.x, p.y, p.size * (p.kind === 'spark' ? 1 - t * 0.5 : 1), 0, Math.PI * 2)
      c.fill()
    }
  }

  // --------------------------------------------------------------------- ring
  private drawRing(s: GameState, i: number, hue: number, inhibit: boolean): void {
    const c = this.ctx
    const w = this.ring.width
    const baseR = w / 2 - 30
    c.clearRect(0, 0, w, w)
    if (s.phase !== 'awaiting' || !s.command) return

    const left = Math.max(0, 1 - s.elapsed / s.command.windowMs)

    if (inhibit) {
      // Cold, steady, dashed — visibly "not a countdown you race".
      c.save()
      c.setLineDash([10, 14])
      c.lineWidth = 8
      c.strokeStyle = 'hsl(205 90% 65% / .8)'
      c.beginPath(); c.arc(w / 2, w / 2, baseR, 0, Math.PI * 2); c.stroke()
      c.restore()
      return
    }

    // Urgency: as the window closes the ring pulses harder and faster —
    // a heartbeat readable in peripheral vision. Driven by engine state
    // (elapsed), so posed screenshots render it deterministically.
    const danger = left < 0.45 ? 1 - left / 0.45 : 0
    const beat = Math.sin(s.elapsed * (0.012 + danger * 0.03))
    const pulse = 1 + danger * 0.045 * beat
    const r = baseR * pulse
    const lw = (13 + i * 5) * (1 + danger * 0.45 * Math.abs(beat))

    c.lineCap = 'round'
    c.lineWidth = lw
    c.strokeStyle = `hsl(${hue} 40% 50% / .14)`
    c.beginPath(); c.arc(w / 2, w / 2, r, 0, Math.PI * 2); c.stroke()

    // Green → red as the window closes, with a glow that ignites in danger.
    const ringHue = left * 130
    if (danger > 0) {
      c.shadowBlur = 14 + danger * 22
      c.shadowColor = `hsl(${ringHue} 95% 55%)`
    }
    c.strokeStyle = `hsl(${ringHue} 90% ${56 + danger * 8}%)`
    c.beginPath()
    c.arc(w / 2, w / 2, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2)
    c.stroke()
    c.shadowBlur = 0

    // Bright head on the draining edge — the eye tracks a point, not an arc.
    const a = -Math.PI / 2 + left * Math.PI * 2
    c.fillStyle = `hsl(${ringHue} 95% 78%)`
    c.beginPath()
    c.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, lw * 0.62, 0, Math.PI * 2)
    c.fill()
  }
}
