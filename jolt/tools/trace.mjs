#!/usr/bin/env node
/** TRACE: replay a Motion Lab recording (capture.html) through the real
 *  recogniser cores, offline. Decodes the owner's pasted JOLTTRACE blob,
 *  replays each labeled segment, and prints a tuning table: which threshold
 *  configurations catch the real shakes WITHOUT firing on walk/still noise.
 *
 *  usage: node tools/trace.mjs <blob-file>        (file containing JOLTTRACE1:...)
 *         pbpaste | node tools/trace.mjs -        (stdin)
 */
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { compileCore } from './compile-core.mjs'

export function decodeTrace(text) {
  const m = text.trim().match(/JOLTTRACE(\d):([\s\S]+)/)
  if (!m) throw new Error('no JOLTTRACE blob found in input')
  const body = m[2].replace(/\s+/g, '')
  if (m[1] === '0') return JSON.parse(body)
  return JSON.parse(inflateRawSync(Buffer.from(body, 'base64')).toString('utf8'))
}

export function segments(rec) {
  const by = new Map()
  for (const row of rec) {
    const [seg] = row
    if (!by.has(seg)) by.set(seg, [])
    by.get(seg).push(row)
  }
  return by
}

/** Replay one segment through a fresh ShakeCore; returns fire count + peak. */
export function replayShake(ShakeCore, rows, opts = {}) {
  let fired = 0
  const core = new ShakeCore(() => fired++)
  if (opts.threshold !== undefined && 'threshold' in core) core.threshold = opts.threshold
  let peak = 0
  for (const [, t, ax, ay, az, lx, ly, lz] of rows) {
    if (lx !== null && lx !== undefined) {
      peak = Math.max(peak, Math.hypot(lx, ly, lz))
      core.sample(lx, ly, lz, t, true)
    } else {
      core.sample(ax, ay, az, t, false)
    }
  }
  return { fired, peak: +peak.toFixed(1) }
}

const arg = process.argv[2]
if (arg) {
  const text = arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8')
  const { meta, rec } = decodeTrace(text)
  const { input } = compileCore()
  const segs = segments(rec)
  console.log(`device: ${meta.ua}`)
  console.log(`samples: ${meta.samples}  live-recognised during capture: ${meta.recognised}  peak: ${meta.peak} m/s²\n`)
  console.log('SEGMENT REPLAY (shipping recogniser):')
  const report = {}
  for (const [name, rows] of segs) {
    const r = replayShake(input.ShakeCore, rows)
    const secs = ((rows[rows.length - 1][1] - rows[0][1]) / 1000).toFixed(1)
    report[name] = r
    const expect = name.startsWith('shake') ? '(should fire ~5)' : '(should fire 0)'
    console.log(`  ${name.padEnd(14)} ${secs}s  ${rows.length} samples  peak ${r.peak} m/s²  shakes fired: ${r.fired} ${expect}`)
  }
  const misses = ['shake-normal', 'shake-hard', 'shake-lazy'].filter((s) => report[s] && report[s].fired < 3)
  const falses = ['still', 'walk'].filter((s) => report[s] && report[s].fired > 0)
  console.log(`\nVERDICT: ${misses.length ? 'MISSES on ' + misses.join(', ') : 'all shake segments fire'};` +
    ` ${falses.length ? 'FALSE FIRES on ' + falses.join(', ') : 'no false fires on still/walk'}`)
  console.log(JSON.stringify({ meta: { recognised: meta.recognised, peak: meta.peak }, report }, null, 2))
}
