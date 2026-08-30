# QA findings

Format: `- [ ] SEV[1-3] (date, source) — finding — repro`
SEV1 = player-visible breakage or unfair death; SEV2 = degraded experience; SEV3 = nit.

- [ ] SEV1 (2026-08-30, owner on-device) — Shake recognition responds poorly on a real
  iPhone; recogniser tuned only on synthetic traces. Repro: play SHAKE IT commands on
  device; misses reported. Awaiting owner's Motion Lab trace (capture.html) — decode,
  fixture, tune. Suspects: 12 m/s² post-gravity threshold; near-antiparallel reversal
  requirement vs real arced shakes; gravity low-pass eating sustained-shake amplitude.
- [ ] SEV2 (2026-08-30, round-7 music critic) — Master is ~10dB quieter than produced
  EDM; drops plateau instead of hit-then-ride; single 8-bar progression loops.
- [ ] SEV3 (2026-08-30, round-7 uxui critic) — home→run is a hard cut, not a signature
  transition; timer-ring lime sits outside the night-vault/gold palette.
