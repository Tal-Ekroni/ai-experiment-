/** Tests for the build-time PWA icon + manifest generator (tools/make-icon.mjs)
 *  — the install surface is part of the product, so it is verified like one:
 *  real PNGs at their declared sizes, opaque where a launcher needs opacity,
 *  transparent where double-rounding would betray the mark, and a manifest
 *  whose every icon actually exists.
 *
 *  Run: node --test tests/icon.test.mjs      (offline, no browser, no network)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = mkdtempSync(join(tmpdir(), 'jolt-icons-'))
execFileSync('node', ['tools/make-icon.mjs'], {
  cwd: root, env: { ...process.env, ICON_OUT: out }, stdio: 'ignore',
})

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Parse just enough PNG to verify it: signature, IHDR dims, decoded pixels. */
function readPng(path) {
  const buf = readFileSync(path)
  assert.ok(buf.subarray(0, 8).equals(SIG), `${path}: bad PNG signature`)
  assert.equal(buf.toString('latin1', 12, 16), 'IHDR', `${path}: IHDR must be first`)
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  assert.equal(buf[24], 8, `${path}: bit depth`)
  assert.equal(buf[25], 6, `${path}: expected RGBA`)
  // Walk chunks, gather IDAT, demand a closing IEND.
  let off = 8, idat = [], iend = false
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    if (type === 'IEND') iend = true
    off += 12 + len
  }
  assert.ok(iend, `${path}: missing IEND`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  assert.equal(raw.length, (w * 4 + 1) * h, `${path}: decoded size mismatch`)
  const px = (x, y) => {
    const rowStart = y * (w * 4 + 1)
    assert.equal(raw[rowStart], 0, `${path}: generator writes filter-0 rows`)
    const k = rowStart + 1 + x * 4
    return [raw[k], raw[k + 1], raw[k + 2], raw[k + 3]]
  }
  return { w, h, px }
}

const EXPECT = [
  ['icons/icon-192.png', 192], ['icons/icon-512.png', 512],
  ['icons/maskable-192.png', 192], ['icons/maskable-512.png', 512],
  ['apple-touch-icon.png', 180], ['icons/favicon-64.png', 64],
]

test('every icon is a real PNG at its declared size', () => {
  for (const [rel, size] of EXPECT) {
    const { w, h } = readPng(join(out, rel))
    assert.equal(w, size, `${rel} width`)
    assert.equal(h, size, `${rel} height`)
  }
})

test('full-bleed icons are opaque to the corners (iOS + maskable launchers)', () => {
  for (const rel of ['apple-touch-icon.png', 'icons/maskable-192.png', 'icons/maskable-512.png']) {
    const { w, h, px } = readPng(join(out, rel))
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, h >> 1]]) {
      assert.equal(px(x, y)[3], 255, `${rel} must be fully opaque at ${x},${y}`)
    }
  }
})

test('rounded icons keep transparent corners so launchers do not double-round', () => {
  for (const rel of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-64.png']) {
    const { w, h, px } = readPng(join(out, rel))
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
      assert.equal(px(x, y)[3], 0, `${rel} corner ${x},${y} must be transparent`)
    }
    // ...while the centre is solid mark-on-ground.
    assert.equal(px(w >> 1, h >> 1)[3], 255, `${rel} centre must be opaque`)
  }
})

test('the mark is the gold bolt on the night ground, not a blank tile', () => {
  const { w, h, px } = readPng(join(out, 'icons/icon-512.png'))
  // Bolt interior (64-space point 30,32 → scaled): must read gold — red and
  // green high, blue well below, the #ffd76b family.
  const [r, g, b] = px(Math.round((w * 30) / 64), Math.round((h * 32) / 64))
  assert.ok(r > 200 && g > 150 && b < 150, `bolt pixel should be gold, got ${r},${g},${b}`)
  // Ground well away from the bolt: dark and cool (blue >= red).
  const [gr, gg, gb] = px(Math.round(w * 0.88), Math.round(h * 0.9))
  assert.ok(gr < 90 && gb >= gr, `ground should be dark night-blue, got ${gr},${gg},${gb}`)
})

test('manifest: installable, standalone, and every icon it names exists', () => {
  const man = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'))
  assert.equal(man.name, 'Jolt')
  assert.equal(man.display, 'standalone')
  assert.equal(man.background_color, '#06070b')
  assert.equal(man.theme_color, '#06070b')
  // Relative start_url/scope — the gh-pages subpath deploy depends on this.
  assert.ok(!man.start_url.startsWith('/'), 'start_url must stay relative')
  assert.ok(!man.scope.startsWith('/'), 'scope must stay relative')
  const purposes = new Set()
  for (const ic of man.icons) {
    assert.ok(!ic.src.startsWith('/'), `icon src must stay relative: ${ic.src}`)
    assert.ok(existsSync(join(out, ic.src)), `manifest icon missing: ${ic.src}`)
    const size = Number(ic.sizes.split('x')[0])
    const { w } = readPng(join(out, ic.src))
    assert.equal(w, size, `manifest size claim for ${ic.src}`)
    purposes.add(ic.purpose)
  }
  assert.ok(purposes.has('any') && purposes.has('maskable'),
    'both any and maskable icons must be declared')
  assert.ok(man.icons.some((ic) => ic.sizes === '512x512'),
    'installability needs a 512px icon')
})
