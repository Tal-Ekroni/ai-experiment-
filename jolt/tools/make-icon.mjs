#!/usr/bin/env node
/** BUILD-TIME icon + manifest generator — zero external assets, zero packages.
 *  Draws the Jolt bolt mark (the same path as the runtime SVG favicon) into
 *  real PNGs with a pure-node PNG encoder (zlib is node stdlib) and writes the
 *  web app manifest beside them. Everything the PWA install needs ships from
 *  code: nothing is downloaded, nothing is hand-drawn.
 *
 *  Outputs (into public/, which vite copies verbatim into dist/):
 *    public/icons/icon-192.png        purpose "any"      (rounded square)
 *    public/icons/icon-512.png        purpose "any"
 *    public/icons/maskable-192.png    purpose "maskable" (full bleed, safe zone)
 *    public/icons/maskable-512.png    purpose "maskable"
 *    public/icons/favicon-64.png      browser-tab fallback
 *    public/apple-touch-icon.png      180x180, full bleed (iOS masks it itself)
 *    public/manifest.webmanifest      icon paths RELATIVE to the manifest, so
 *                                     the gh-pages subpath deploy keeps working
 *
 *  usage: node tools/make-icon.mjs            (writes into <repo>/public)
 *         ICON_OUT=/tmp/x node tools/make-icon.mjs   (tests use this)
 */
import zlib from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Minimal PNG encoder: 8-bit RGBA, filter 0, one IDAT. Nothing else needed.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/** rgba: Uint8Array of w*h*4. Returns a complete PNG file buffer. */
export function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8    // bit depth
  ihdr[9] = 6    // color type: RGBA
  // compression 0, filter 0, interlace 0 — already zeroed
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1)
    raw[row] = 0   // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, row + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// The mark, rasterised. All geometry lives in the 64-unit space of the runtime
// SVG favicon so the installed icon and the browser tab are the SAME mark.
// ---------------------------------------------------------------------------

/** Bolt polygon from main.ts's favicon path: M36 6 14 38h12l-4 20 24-34H32z */
const BOLT = [[36, 6], [14, 38], [26, 38], [22, 58], [46, 24], [32, 24]]
const BOLT_CX = 30, BOLT_CY = 32   // bbox centre — used to breathe the margin

function inBolt(x, y) {
  let inside = false
  for (let i = 0, j = BOLT.length - 1; i < BOLT.length; j = i++) {
    const [xi, yi] = BOLT[i], [xj, yj] = BOLT[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Distance from (x,y) to the bolt outline — drives the soft gold glow. */
function boltDist(x, y) {
  let best = Infinity
  for (let i = 0, j = BOLT.length - 1; i < BOLT.length; j = i++) {
    const [x1, y1] = BOLT[j], [x2, y2] = BOLT[i]
    const dx = x2 - x1, dy = y2 - y1
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    const px = x1 + t * dx - x, py = y1 + t * dy - y
    const d = Math.sqrt(px * px + py * py)
    if (d < best) best = d
  }
  return best
}

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)
const smooth = (t) => { const c = clamp01(t); return c * c * (3 - 2 * c) }

/** One scene sample in 64-space. Returns [r,g,b,a(0..1)].
 *  fullBleed: paint every pixel (maskable / apple-touch); otherwise a rounded
 *  square with transparent corners. boltScale shrinks the mark about its own
 *  centre (maskable safe zone; breathing room on the rounded icons). */
function sample(x, y, { fullBleed, boltScale }) {
  // Ground: the game's night-blue radial — hsl(228 45% 14%) fading to #06070b,
  // matching index.html's first paint and the home screen exactly.
  const dx = x - 32, dyTop = y - 20
  const r = Math.sqrt(dx * dx + dyTop * dyTop) / 46
  const t = smooth(r)
  let R = lerp(27, 6, t), G = lerp(33, 7, t), B = lerp(64, 11, t)

  // Bolt-space coordinates (inverse of scaling the mark about its centre).
  const bx = BOLT_CX + (x - BOLT_CX) / boltScale
  const by = BOLT_CY + (y - BOLT_CY) / boltScale

  if (inBolt(bx, by)) {
    // Gold, lit from the top — the same #ffd76b family as every gold surface.
    const v = clamp01((by - 6) / 52)
    R = lerp(255, 255, v); G = lerp(233, 199, v); B = lerp(160, 77, v)
  } else {
    // A tight rim light plus a faint wide halo: crisp, restrained, premium.
    const d = boltDist(bx, by) * boltScale
    const glow = Math.exp(-(d * d) / 7) * 0.5 + Math.exp(-(d * d) / 420) * 0.1
    R = Math.min(255, R + 255 * glow)
    G = Math.min(255, G + 205 * glow)
    B = Math.min(255, B + 90 * glow)
  }

  let a = 1
  if (!fullBleed) {
    // Rounded square, radius 22% — the iOS-family silhouette.
    const rad = 14.08
    const qx = Math.abs(x - 32) - (32 - rad)
    const qy = Math.abs(y - 32) - (32 - rad)
    const outside = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) +
      Math.min(Math.max(qx, qy), 0) - rad
    a = outside > 0 ? 0 : 1
  }
  return [R, G, B, a]
}

/** Render one icon: supersampled, premultiplication-free straight alpha. */
export function renderIcon(size, { fullBleed = false, boltScale = 0.86, ss = 3 } = {}) {
  const rgba = new Uint8Array(size * size * 4)
  const inv = 64 / size
  const opts = { fullBleed, boltScale }
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let R = 0, G = 0, B = 0, A = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) * inv
          const y = (py + (sy + 0.5) / ss) * inv
          const [r, g, b, a] = sample(x, y, opts)
          R += r * a; G += g * a; B += b * a; A += a
        }
      }
      const n = ss * ss
      const k = (py * size + px) * 4
      const alpha = A / n
      rgba[k] = alpha > 0 ? Math.round(R / A) : 0
      rgba[k + 1] = alpha > 0 ? Math.round(G / A) : 0
      rgba[k + 2] = alpha > 0 ? Math.round(B / A) : 0
      rgba[k + 3] = Math.round(alpha * 255)
    }
  }
  return rgba
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ICON_OUT || join(HERE, '..', 'public')

const FILES = [
  // Rounded-square marks with transparent corners: launchers that respect them.
  { path: 'icons/icon-192.png', size: 192, fullBleed: false, boltScale: 0.86, ss: 4 },
  { path: 'icons/icon-512.png', size: 512, fullBleed: false, boltScale: 0.86, ss: 2 },
  // Maskable: full bleed, mark held inside the 40%-radius safe zone.
  { path: 'icons/maskable-192.png', size: 192, fullBleed: true, boltScale: 0.62, ss: 4 },
  { path: 'icons/maskable-512.png', size: 512, fullBleed: true, boltScale: 0.62, ss: 2 },
  // iOS home screen: full bleed — iOS rounds the corners itself.
  { path: 'apple-touch-icon.png', size: 180, fullBleed: true, boltScale: 0.78, ss: 4 },
  // Tab fallback for browsers that prefer a bitmap.
  { path: 'icons/favicon-64.png', size: 64, fullBleed: false, boltScale: 0.86, ss: 4 },
]

const MANIFEST = {
  name: 'Jolt',
  short_name: 'Jolt',
  description: 'Obey the voice before the ring closes. A reaction game with a pulse.',
  // Relative to the manifest URL, so the gh-pages subpath deploy resolves too.
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#06070b',
  theme_color: '#06070b',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

// Only run the generator when executed directly (tests import the pure parts).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  mkdirSync(join(OUT, 'icons'), { recursive: true })
  const t0 = Date.now()
  for (const f of FILES) {
    const png = encodePng(f.size, f.size, renderIcon(f.size, f))
    writeFileSync(join(OUT, f.path), png)
    console.log(`  ${f.path}  ${f.size}x${f.size}  ${(png.length / 1024).toFixed(1)}kB`)
  }
  writeFileSync(join(OUT, 'manifest.webmanifest'), JSON.stringify(MANIFEST, null, 2) + '\n')
  console.log(`  manifest.webmanifest`)
  console.log(`icons generated in ${Date.now() - t0}ms -> ${OUT}`)
}
