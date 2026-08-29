# ai-experiment-

A gauntlet loop: an adversarial build method that takes a one-paragraph app idea and refuses to
let the model be the last one to speak about its own work.

Currently loaded with one seed — a household "personal CFO" web app for tracking income vs.
expenses.

## Files

| Path | What it is |
|---|---|
| [`gauntlet/GAUNTLET.md`](gauntlet/GAUNTLET.md) | The method: the round, the panel, the rubric, the exit conditions |
| [`gauntlet/SEED.md`](gauntlet/SEED.md) | The raw idea + the domain-specific critic panel and known landmines |
| [`.claude/commands/gauntlet.md`](.claude/commands/gauntlet.md) | Runnable `/gauntlet` command that drives all six stages |

## Run it

In Claude Code, from this repo:

```
/gauntlet
```

It reads the seed, asks you the eight questions that decide the architecture, freezes a scoring
rubric, then loops: build → hostile panel → score → mandate, committing each round to
`gauntlet/rounds/`. It stops when two consecutive rounds clear the bar, or at round 6 with an
honest `OPEN-RISKS.md`.

To point it at a different idea:

```
/gauntlet new <your one-paragraph idea>
```

## The short version

Three primitives do all the work:

1. **A hostile panel** — critics whose job is to kill the work, not polish it.
2. **A numeric bar** — floor ≥ 8.0, weighted mean ≥ 9.0, rubric frozen before round 1.
3. **A loop that can't self-terminate on vibes** — a round that changes nothing is a failed round.
