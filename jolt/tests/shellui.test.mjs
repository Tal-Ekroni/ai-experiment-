/** UI-layer unit tests for the shell's pure judgement logic — the run-over
 *  grade ladder that honors a run's precision (gradeRun), added in the
 *  game-feel pass alongside the mastery strip on every over screen.
 *
 *  Run: node --test tests/shellui.test.mjs
 *  (compiled headlessly against the REAL shell module, no browser)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

function compileShell() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const out = mkdtempSync(join(tmpdir(), 'jolt-shellui-'))
  execFileSync('npx', ['tsc',
    'src/game/shell.ts',
    '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020',
    '--lib', 'es2020,dom', '--moduleResolution', 'node', '--skipLibCheck',
  ], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}\n')
  const req = createRequire(join(out, 'x.js'))
  return req(join(out, 'shell.js'))
}

const { gradeRun } = compileShell()

// ---------------------------------------------------------------------------
// gradeRun — the letter ladder
// ---------------------------------------------------------------------------

test('no perfects, no grade — the gold stays earned', () => {
  assert.equal(gradeRun(0, 40, 0), null)
  assert.equal(gradeRun(0, 0, 0), null)
})

test('a couple of lucky perfects earn no letter', () => {
  assert.equal(gradeRun(1, 10, 1), null)
  assert.equal(gradeRun(2, 10, 2), null)
})

test('C: a real but modest precision showing', () => {
  assert.equal(gradeRun(3, 15, 2), 'C')      // rate .2 exactly, 3 perfects
  assert.equal(gradeRun(4, 18, 3), 'C')
})

test('B: over a third of the run inside the band', () => {
  assert.equal(gradeRun(5, 14, 3), 'B')      // rate ~.36
  assert.equal(gradeRun(7, 20, 4), 'B')
})

test('A: half the run perfect with a real chain', () => {
  assert.equal(gradeRun(8, 16, 5), 'A')      // rate .5, chain 5
  assert.equal(gradeRun(20, 39, 8), 'A')
})

test('A requires the chain, not just the rate', () => {
  // Same rate/count as an A but the chain never got going: B.
  assert.equal(gradeRun(8, 16, 4), 'B')
})

test('S: a dominated run — high rate, long chain, real volume', () => {
  assert.equal(gradeRun(15, 21, 10), 'S')    // rate ~.71
  assert.equal(gradeRun(40, 55, 15), 'S')    // the posed over-best screen
})

test('S is gated on all three axes', () => {
  assert.equal(gradeRun(14, 20, 12), 'A')    // one perfect short of S volume
  assert.equal(gradeRun(15, 22, 9), 'A')     // chain 9 < 10
  assert.equal(gradeRun(15, 23, 10), 'A')    // rate ~.65 < .7
})

test('grades never regress as perfects grow at fixed correct/chain', () => {
  const rank = (g) => ({ null: 0, C: 1, B: 2, A: 3, S: 4 })[String(g)]
  for (const correct of [10, 20, 40, 80]) {
    let prev = -1
    for (let p = 0; p <= correct; p++) {
      const r = rank(gradeRun(p, correct, p))   // chain grows with perfects
      assert.ok(r >= prev,
        `grade regressed at perfects=${p}/${correct}: ${r} < ${prev}`)
      prev = r
    }
  }
})

test('inhibition headroom: an all-perfect run with traps mixed in still grades S', () => {
  // ~1 in 6 commands is an inhibit late-game; a flawless player answers every
  // gradable command perfectly. 50 correct, 42 perfect, chain carried through.
  assert.equal(gradeRun(42, 50, 42), 'S')
})
