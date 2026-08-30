# Working rules for this repo

## Git workflow (owner's standing instruction, 2026-08-30)
- When a feature is done, verified, and passing, **merge it to main immediately**.
  No long-lived branches. Small, short-lived feature branches (or direct commits
  for trivial changes) only.
- **main must always be releasable** and must **never be force-pushed or have its
  history rewritten**: a fleet-managed home box deploys it nightly via
  `git fetch` + `git merge --ff-only`; a non-fast-forward halts deploys until
  fixed by hand.

## Deployment (do not break these)
- `fleet.app.json` at the repo root is the deploy contract for the owner's
  fleet-managed box (github.com/Tal-Ekroni/fleet). Claimed ports: **8801**
  (local, 127.0.0.1 only) and **10000** (tailnet https). The app must never
  bind 0.0.0.0 on that box, and this repo must never install systemd units,
  cron jobs, or timers on it — fleet owns all of that.
- The `verify` script (`npm --prefix jolt run verify`) gates every nightly
  deploy: typecheck + the full offline unit-test suite. It must stay offline
  (no browser, no network) and must exit non-zero on any failure.
- `gh-pages` branch serves the public build at
  https://tal-ekroni.github.io/ai-experiment-/ — rebuild with
  `npx vite build --base=./` and force-push that branch after shipping changes.
- `jolt/deploy/` is the standalone (non-fleet) LAN path only.

## Quality gates for jolt/ (protected invariants)
Run all of these before declaring any change to jolt/ done; none may regress:
- `npx tsc --noEmit` — clean
- `npm test` — full suite green (107+ tests; new test files MUST be wired into
  the package.json test script — unwired suites have shipped twice)
- `node tools/frontdoor.mjs --seconds 70` — FRONTDOOR: PASS (plays the real
  page through the real home screen; the debug-hatch harnesses miss shell bugs)
- `node tools/playtest.mjs --runs 150` — typical (400ms) median run 45–90s,
  timeout-majority deaths
- `node tools/playtest-latency.mjs --runs 150` — typical unavoidableLifeLossPct
  ≤ 8% (currently AT the ceiling: any window-shrinking change will trip it)
- The `data-*` state mirror in render.sync must keep working (harnesses read it)

## Project conventions
- **Zero external assets** in the game: no image/audio/font/model files, no
  CDNs, no new runtime npm packages. Everything is generated in code.
- No backend, no accounts: localStorage + URL params only.
- Phone-first, portrait, one-handed; command legibility in <300ms is sacred.
- Product direction lives in `jolt/ROADMAP.md`; concept history in `IDEAS.md`.

## Quality bar (every change, every session)
- Unit-test the logic; wire every new test file into `jolt/package.json`'s test
  script in the same commit that adds it.
- Render UI before claiming it works: screenshot via `tools/shoot.mjs` or a
  Playwright pose, and LOOK at it. For audio, render via `tools/listen.mjs`
  and read the metrics. A change never exercised is not done.
- Adversarial self-review before merge: re-read your own diff asking "what
  would the blind critic fail this for?"
- After shipping to main: rebuild gh-pages (`node tools/make-icon.mjs` then
  `npx vite build --base=./` in jolt/, force-push the gh-pages branch) and
  `npx cap sync ios`.

## Landmines (hard-won; must never regress)
- **Unwired test suites shipped twice.** A green `npm test` means nothing if
  the new suite isn't in the test script. Check the script, not the suite.
- **A stale PR merge orphaned four commits** (round 5-7 era): GitHub merged an
  old PR head while pushes were in flight, and a branch reset discarded the
  rest. After ANY merge to main, verify main's CONTENTS from origin
  (`git show origin/main:<file>`), never just the ref movement.
- **The front door shipped broken** while every harness passed: harnesses
  entered via a debug hatch and nobody pressed the advertised Space key on the
  real home screen. `tools/frontdoor.mjs` exists so this cannot recur — it is
  part of the gate, run it.
- **`fetch()` readiness probes lie in this container**: HTTP goes through a
  proxy, so a dead port answers instead of refusing. Probe ports with raw TCP
  (see `portOpen` in the tools) and never poll a hardcoded port.
- **Long-running headless scripts must log to a file incrementally** — piped
  stdout dies with the timeout kill and you learn nothing.
- **Mute was advisory once**: persistent audio layers (drone, buses) need
  live gain response to the mute toggle, not just guards on one-shots.
- **Equal-specificity CSS killed the over-screen choreography silently**:
  `.jsh-late` lost to later nth-child rules; `animation:` shorthand erases
  entrances. Staged reveals must be verified with computed-style probes.
- **`playtest-latency` typical profile sits AT the 8% ceiling.** Any change
  that effectively shrinks response windows trips the fairness gate. Budget
  physical gesture time additively (GESTURE_LATENCY_MS), never multiplicatively.
- **Synthetic motion traces are guesses.** The shake recogniser under-performs
  on real devices tuned on synthesis alone; real traces from Motion Lab
  (`capture.html`) are ground truth and become fixtures. Never tune motion
  thresholds against synthetic data only.
