/** The trace decoder/replayer must round-trip real Motion Lab blobs and drive
 *  the shipping ShakeCore — this is the rail the on-device shake fix rides on. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { decodeTrace, segments, replayShake } from '../tools/trace.mjs'
import { compileCore } from '../tools/compile-core.mjs'

const { input } = compileCore()

function blob(obj) {
  return 'JOLTTRACE1:' + deflateRawSync(Buffer.from(JSON.stringify(obj))).toString('base64')
}

test('decodes a compressed JOLTTRACE1 blob round-trip', () => {
  const payload = { meta: { ua: 'test', samples: 2, recognised: 0, peak: 3 }, rec: [['still', 0, 0, 0, 9.8, 0, 0, 0, 0, 0], ['still', 16, 0, 0, 9.8, 0, 0, 0, 0, 0]] }
  const out = decodeTrace(blob(payload))
  assert.deepEqual(out, payload)
})

test('decodes uncompressed JOLTTRACE0 fallback and tolerates surrounding whitespace', () => {
  const payload = { meta: {}, rec: [] }
  const out = decodeTrace('  JOLTTRACE0:' + JSON.stringify(payload) + '\n')
  assert.deepEqual(out, payload)
})

test('rejects text without a blob', () => {
  assert.throws(() => decodeTrace('hello'), /no JOLTTRACE/)
})

test('segments groups rows by label preserving order', () => {
  const rec = [['a', 0], ['b', 1], ['a', 2]]
  const by = segments(rec)
  assert.deepEqual([...by.keys()], ['a', 'b'])
  assert.equal(by.get('a').length, 2)
})

test('replayShake drives the real core: synthetic vigorous shake fires, stillness does not', () => {
  const rows = []
  // 3 reversal pairs at 80ms spacing, 16 m/s² peaks along x, linear samples.
  for (let i = 0; i < 40; i++) {
    const t = i * 20
    const phase = Math.floor(t / 80) % 2 === 0 ? 1 : -1
    const mag = t % 80 < 20 ? 16 : 2
    rows.push(['shake-hard', t, 0, 0, 9.8, phase * mag, 0, 0, 0, 0])
  }
  const shake = replayShake(input.ShakeCore, rows)
  assert.ok(shake.fired >= 1, `expected >=1 fire, got ${shake.fired}`)
  const still = replayShake(input.ShakeCore, Array.from({ length: 40 }, (_, i) => ['still', i * 20, 0, 0, 9.8, 0.1, 0, 0, 0, 0]))
  assert.equal(still.fired, 0)
})
