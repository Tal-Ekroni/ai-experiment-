/** Compiles the DOM-free game core (types/rng/commands/engine/input) to
 *  CommonJS in a temp dir and requires it, so node-side tests and harnesses
 *  can drive the REAL recogniser cores and engine without a browser.
 *  No new dependencies: uses the project's own tsc. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

let cached = null

export function compileCore() {
  if (cached) return cached
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const out = mkdtempSync(join(tmpdir(), 'jolt-core-'))
  execFileSync('npx', ['tsc',
    'src/game/types.ts', 'src/game/rng.ts', 'src/game/commands.ts',
    'src/game/engine.ts', 'src/game/input.ts',
    '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020',
    '--lib', 'es2020,dom', '--moduleResolution', 'node', '--skipLibCheck',
  ], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  writeFileSync(join(out, 'package.json'), '{"type":"commonjs"}\n')
  const req = createRequire(join(out, 'x.js'))
  cached = {
    input: req(join(out, 'input.js')),
    engine: req(join(out, 'engine.js')),
    commands: req(join(out, 'commands.js')),
    rng: req(join(out, 'rng.js')),
  }
  return cached
}
