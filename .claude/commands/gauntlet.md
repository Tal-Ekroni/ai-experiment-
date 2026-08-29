---
description: Run an adversarial build loop — spec, architecture, and code survive a hostile panel until they clear a frozen quality bar.
argument-hint: "[resume | new <idea> | panel | score]"
---

# Gauntlet

Drive the loop defined in `gauntlet/GAUNTLET.md` against the seed in `gauntlet/SEED.md`.

Argument: `$ARGUMENTS` (empty = start or continue automatically)

- *(empty)* — read `gauntlet/CURRENT.md`; if it exists, resume there, otherwise begin at Stage 1.
- `resume` — same as empty, but never restart a stage that already has round files.
- `new <idea>` — overwrite `gauntlet/SEED.md` with the given idea and begin at Stage 1.
- `panel` — re-run the panel on the current round's artifact without rebuilding it.
- `score` — re-score the current round and print the rubric table only.

## Before anything else

1. Read `gauntlet/GAUNTLET.md` and `gauntlet/SEED.md` in full.
2. Read `gauntlet/CURRENT.md` if it exists to find stage + round.
3. `ls gauntlet/rounds/` to see what's already on disk. Never overwrite an existing round file —
   the history of how the artifact changed is part of the deliverable.

## Executing a round

For every round, in order, writing each file before moving on:

1. **BUILD** → `gauntlet/rounds/NN-artifact.md`
   The complete current artifact, rewritten in full. Not a diff. Address every item in the
   previous round's mandate and nothing outside it.

2. **PANEL** → `gauntlet/rounds/NN-panel.md`
   Every critic from `SEED.md`, in first person, each giving: worst thing, kill shot (a concrete
   scenario, not a category), highest-leverage change, dimension score with justification.
   No two critics raise the same finding. A critic who concludes "overall strong" has failed —
   re-run that seat with the instruction that they missed something.

3. **SCORE** → `gauntlet/rounds/NN-score.md`
   The frozen rubric table, per-dimension scores, floor, weighted mean, and PASS/FAIL against
   floor ≥ 8.0 and mean ≥ 9.0. Do not modify the rubric to make a score pass.

4. **MANDATE** → `gauntlet/rounds/NN-mandate.md`
   The 3–5 ranked findings that must be resolved next round. Explicitly list what is out of scope
   for the next round.

5. **CHECKPOINT** → rewrite `gauntlet/CURRENT.md` with stage, round, floor, mean, bar status, and
   the single next action. Then `git add -A && git commit` the round with message
   `gauntlet: stage N round M — floor X.X mean Y.Y`.

Then start the next round, unless an exit condition is met.

## Guardrails

- A round that changes nothing is a **failed** round. Re-run the panel harder; do not advance.
- Mean may not rise more than +1.0 per round without a proportional change in the artifact.
- The rubric is frozen after Stage 1 approval. Editing it mid-loop is cheating.
- Stop and ask the user only at the Stage 1 interrogation and at the Stage 6 ship gate. Between
  those, run rounds without asking for permission to continue.
- At Stage 4 (build), each vertical slice gets its own mini-gauntlet: build → panel → fix. Slices
  ship working, not stubbed.
- At Stage 5, the panel attacks *running code*: actually run it, actually try the injection,
  actually check the arithmetic against a hand-computed total.

## Exit

Converged (two consecutive clean passes, second produces no blocking finding) or round 6 reached.
Either way write `gauntlet/OPEN-RISKS.md` — every unresolved finding with severity, owner, and
what would have to be true to close it. Then summarize for the user: what shipped, what the final
scores were, and the top three risks that remain.
