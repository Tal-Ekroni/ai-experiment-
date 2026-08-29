# Jolt

A reaction game in the spirit of the old electronic command toys: the game barks an
instruction, you perform it before the ring runs out, and it keeps getting faster.
Miss three and it's over.

Original take on the genre — not a clone of anyone's branding, voice lines or artwork.

## Why a phone can actually do this

The toy worked because the actions were *physical*. A phone has a gyroscope and an
accelerometer, so **twist**, **shake** and **flip** are real motions rather than tap
substitutes. Commands are spoken through the built-in Web Speech API, so the game has
a voice without shipping a single audio file.

There is also an inhibition command — **DO NOTHING** — where acting is the mistake.
That makes the game about impulse control, not only speed.

## Constraints

- **Zero external assets.** No images, no fonts, no audio files, no models. Speech
  comes from `speechSynthesis`; music and effects are synthesised with WebAudio;
  visuals are DOM, CSS and canvas.
- Web-first (TypeScript), intended to wrap for iOS via Capacitor / WKWebView. There is
  no Swift toolchain in this dev container.
- iOS 13+ requires an explicit permission prompt from a user gesture before any motion
  event fires. Without it, twist/shake/flip silently never work.

## Verification

Two harnesses, because a reaction game cannot be judged from a screenshot:

    node tools/playtest.mjs --runs 200      # PRIMARY: fairness and difficulty
    node tools/shoot.mjs --times 1,12,30    # visual composition only

`playtest` drives the **real engine** headlessly against simulated players at human
reaction times (250 / 400 / 600 ms) and reports how long runs last, what kills people,
and the response window at the moment of death. If that window is shorter than the
player's reaction time, the ramp has outrun human capability and the death was
unavoidable rather than earned.

The engine is a pure state machine — `tick(dtMs)` and `submit(action)`, no DOM, no
timers of its own — which is what makes that measurement possible.

## Module ownership

| File | Owns |
|---|---|
| `src/game/commands.ts` | command set, unlock order, difficulty ramp |
| `src/game/engine.ts` | deterministic state machine, scoring, bot simulator |
| `src/game/input.ts` | gesture recognition, device motion, permissions |
| `src/game/render.ts` | all visuals and game feel |
| `src/game/audio.ts` | spoken commands, music, effects |
| `src/game/shell.ts` | high score, onboarding, settings, accessibility |
| `src/game/types.ts` | shared contracts — changing these breaks every consumer |
