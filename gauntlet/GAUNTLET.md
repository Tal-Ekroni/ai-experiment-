# The Gauntlet Loop

A method for turning a one-paragraph app idea into something that survives contact with reality.

> Attribution note: this is the *pattern* Matt Shumer popularized — feed a deliberately simple
> prompt into a loop of adversarial critique instead of one-shotting it. The mechanics below are
> a reconstruction, not his verbatim prompt. Steal the structure, not the wording.

---

## Why it works

A single prompt gets you a B+. Not because the model can't do better — because nobody ever told
it that its first answer was bad. Left alone, a model grades its own homework generously and
stops the moment the output *looks* finished.

The gauntlet removes that option. Three primitives:

1. **A hostile panel.** Critics whose job is to kill the work, not polish it. Improvement is a
   side effect of failed assassination.
2. **A numeric bar.** A rubric with a threshold, scored per-dimension, where "seems good" is not
   a passing value.
3. **A loop that cannot self-terminate on vibes.** Exit requires two consecutive rounds that
   clear the bar *and* produce no new blocking findings.

Everything else is bookkeeping.

---

## The shape

```
SEED
  │
  ├─► STAGE 1  Interrogation      ← the model asks YOU the 8 questions that decide everything
  │
  ├─► STAGE 2  Spec gauntlet      ← loop until the PRD survives the panel
  │
  ├─► STAGE 3  Architecture gauntlet
  │
  ├─► STAGE 4  Build              ← vertical slices, each one gated
  │
  ├─► STAGE 5  Red-team gauntlet  ← attack the running code, not the plan
  │
  └─► STAGE 6  Ship gate
```

Each gauntlet stage is the same loop with a different artifact under the knife.

---

## The round

One round = four moves. Never skip a move, never reorder them.

### 1. BUILD
Produce the artifact **in full**. Not a diff, not "here's what I'd change" — the complete current
version, rewritten. Diffs let quality rot at the edges; full rewrites force re-justification of
every line that survives.

### 2. PANEL
Convene the critics (below). Each one, independently, in their own voice:

- States the **single worst thing** about the artifact from their seat.
- Names a **kill shot**: the specific failure mode that makes this thing get abandoned, deleted,
  breached, or quietly never opened again. Concrete scenario, not a category.
- Gives the **one change** with the highest ratio of impact to effort.
- Scores their dimension `0–10` with a one-line justification.

Rules for the panel:
- A critic who writes "overall this is strong" has failed their job. Strike the round and re-run.
- No two critics may raise the same finding. If they converge, the later one goes deeper.
- Critics may not propose more scope. The best critique usually *removes* something.

### 3. SCORE
Fill the rubric. Compute:
- **Floor** = lowest dimension score (this is the one that matters)
- **Mean** = average across dimensions

Passing bar: **floor ≥ 8.0 AND mean ≥ 9.0.** The floor gate is deliberate — an app that is
brilliant in five ways and unusable in one is unusable.

### 4. MANDATE
Write the next round's brief: the 3–5 findings that must be resolved, ranked. Anything not in the
mandate does not get touched next round. This is what stops the loop from wandering.

Then loop.

---

## Exit conditions

Stop when **either**:

- **Converged** — two consecutive rounds clear the bar, and the second round's panel produces no
  finding that changes the artifact. (Cosmetic findings don't count as blocking.)
- **Exhausted** — round 6. Ship what you have, and write `OPEN-RISKS.md` listing every unresolved
  finding with its severity. An honest list of known holes beats a fake green check.

**Anti-stall rule:** a round that changes nothing is a *failed* round, not a passed one. If the
artifact is unchanged and the score didn't move, the panel was too soft — re-run it with the
instruction that they missed something and must find it.

**Anti-inflation rule:** scores may not rise more than +1.0 mean per round without a
correspondingly large change in the artifact. Rubber-stamping is the main way this loop dies.

---

## State on disk

The loop must survive context compaction, session restarts, and you walking away for a day. So it
writes everything down:

```
gauntlet/
  SEED.md                  the input prompt
  RUBRIC.md                dimensions + bar (generated in stage 1, then frozen)
  rounds/
    01-artifact.md         full artifact for round 1
    01-panel.md            every critic's findings
    01-score.md            rubric table + floor/mean
    01-mandate.md          ranked brief for round 2
    02-...
  CURRENT.md               symlink-ish pointer: stage, round, bar status, next action
  OPEN-RISKS.md            written at exit
```

Never hold round state only in context. If `CURRENT.md` doesn't say it, it didn't happen.

---

## The panel

Generic seats. Swap in domain specialists per project — the household-CFO panel is in
[`SEED.md`](./SEED.md).

| Seat | Kills it by asking |
|---|---|
| **The Abandoner** | "It's week three. Why did I stop opening this?" |
| **The Security Engineer** | "Where does the credential live, and who else can read it?" |
| **The Skeptic** | "Which part of this is a feature and which part is a wrapper around a chat box?" |
| **The Operator** | "It's 2am and this is broken. What do I see, and can I fix it?" |
| **The Accountant** | "Show me where the numbers are wrong and nobody noticed." |
| **The Second User** | "I didn't ask for this app. Why would I ever log in?" |

The Second User seat is the one people skip and the one that decides whether household software
lives or dies.

---

## Scoring rubric (template)

Freeze this in stage 1. Changing the rubric mid-loop to make the score go up is cheating, and the
model will absolutely try it.

| Dimension | Weight | 10 means |
|---|---|---|
| Correctness | ×2 | Money math is exact, reconciles, and is provably so |
| Friction | ×2 | Steady-state effort is near zero; onboarding under 10 minutes |
| Security & privacy | ×2 | A breach of any one component leaks nothing usable |
| Genuine AI utility | ×1 | Agents do work; removing them would be felt |
| Durability | ×1 | Survives a year of use, data growth, and one broken integration |
| Second-user pull | ×1 | The reluctant partner opens it unprompted |
| Craft | ×1 | Interaction and visual quality you'd pay for |

Floor ≥ 8, weighted mean ≥ 9. Anything less is a round, not a release.

---

## Running it

Paste [`SEED.md`](./SEED.md) into a fresh Claude Code session, or run the packaged command:

```
/gauntlet
```

The command (`.claude/commands/gauntlet.md`) drives all six stages and writes the state files.
Resume a partial run with:

```
/gauntlet resume
```

---

## The three rules that make or break it

1. **The model never gets the last word about its own work.** Every artifact is followed by a
   panel. Every panel is followed by a score. Every score is followed by a mandate.
2. **Specificity or it doesn't count.** "Improve error handling" is not a finding. "A Plaid
   webhook replay double-counts the rent transaction and the monthly total is silently wrong" is
   a finding.
3. **Removing beats adding.** Most rounds should make the artifact smaller and sharper. If every
   round grows it, the panel is flattering you.
