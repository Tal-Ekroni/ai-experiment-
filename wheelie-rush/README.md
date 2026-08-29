# Wheelie Rush

Endless runner where the core skill is **wheelie balance**, not lane-swapping.
Hold to pull the front wheel up; the balance point is unstable in both
directions. Longer wheelie = higher multiplier. Loop out and you wipe.

Barriers are cleared by being **up**; low bars are cleared by being **down**.
That inversion is the whole risk/reward loop.

## Constraints

- **Zero external assets.** Every mesh, material, texture and sound is generated
  in code. Nothing is downloaded or bundled.
- Web-first (three.js + TypeScript), intended to wrap for iOS via Capacitor /
  WKWebView. There is no Swift toolchain in this dev container.

## Dev

    npm install
    npm run dev        # http://localhost:5173
    npm run typecheck
    npm run shoot -- --script balance --times 2,6,12 --tag mytag

`shoot` boots the app headless, drives the deterministic sim to fixed
timestamps, and writes PNGs to `shots/`. Because the sim is a fixed-timestep
loop over a seeded PRNG, `(seed, seconds, script)` always reproduces the same
frame — that is what makes automated visual critique possible.

## Module ownership

| File | Owns |
|---|---|
| `src/game/bike.ts` | wheelie physics, balance, lanes |
| `src/game/track.ts` | procedural endless track |
| `src/game/obstacles.ts` | obstacle placement, collision, scoring |
| `src/game/render.ts` | all procedural geometry, materials, lighting, camera |
| `src/game/audio.ts` | procedural WebAudio |
| `src/game/types.ts` | shared contracts — changing these breaks every consumer |
