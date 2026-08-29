# Bonsai

A tree you shape over real time. Tap a branch to prune it; the whole subtree above
the cut stops existing. Drag to move the light — the tree grows *toward* it, so you
shape the silhouette indirectly over hours rather than sculpting it directly. It keeps
growing while the app is closed. Seasons cycle the palette; there is no fail state.

## Constraints

- **Zero external assets.** Every mesh, material, texture and sound is generated in
  code. Nothing is downloaded or bundled. This is the defining constraint.
- Web-first (three.js + TypeScript), intended to wrap for iOS via Capacitor /
  WKWebView. There is no Swift toolchain in this dev container.

## Determinism

The skeleton is a pure function of `(seed, pruned, light)` — it is regenerated, never
mutated incrementally. Growth only controls how much of it is visible, via each
segment's `birthAge`. So `(seed, age)` reproduces the same tree anywhere, which is
what makes automated visual critique possible.

## Dev

    npm install
    npm run dev
    npm run typecheck
    node tools/shoot.mjs --times 60,200,400 --tag mytag

`shoot` boots the app headless, grows the tree to fixed ages, and writes PNGs to
`shots/`. Note the day/night cycle is 120 growth-seconds, so `t=120` is midnight —
sample several ages or you will judge the art in the dark.

## Module ownership

| File | Owns |
|---|---|
| `src/garden/growth.ts` | L-system skeleton, phototropism, pruning |
| `src/garden/render.ts` | all procedural geometry, materials, camera |
| `src/garden/sky.ts` | sky, seasons, day/night, lighting mood |
| `src/garden/audio.ts` | procedural ambience |
| `src/garden/persist.ts` | save/restore, offline growth |
| `src/garden/types.ts` | shared contracts — changing these breaks every consumer |
