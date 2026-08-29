# Round 1 — Score

Rubric per `gauntlet/RUBRIC.md`. Frozen; not modified.

| # | Dimension | Weight | Score | Weighted | Seat's one-line verdict |
|---|---|---:|---:|---:|---|
| 1 | Correctness | 2 | 4 | 8 | Integer agorot is right; the card double-count makes every total wrong |
| 2 | Friction | 2 | 5 | 10 | Steady state fine, cold start unsurvivable |
| 3 | Security & privacy | 2 | 4 | 8 | Spends the local-first advantage on a `.env` and an open port |
| 4 | Genuine AI utility | 1 | 4 | 4 | Two real agents, four passengers, no cost figure |
| 5 | Durability | 1 | 5 | 5 | Has a fallback path, has no concept of staleness |
| 6 | Second-user pull | 2 | 3 | 6 | No path to the second user exists at all |
| 7 | Craft | 1 | 5 | 5 | Worst screen shown at the best moment |

**Weight total:** 11
**Weighted sum:** 46
**Mean:** 46 / 11 = **4.2**
**Floor:** **3** (dimension 6, second-user pull)

## Bar

Required: floor ≥ 8.0 **and** mean ≥ 9.0.
Actual: floor 3.0, mean 4.2.

### **FAIL** — both gates, by a wide margin.

## Reading

This is a competent skeleton with one arithmetic defect that invalidates its output and one
missing dimension that invalidates its adoption. Those are not the same class of problem as the
rest and should not be worked in the same pass as polish.

The floor is where the run lives or dies: dimension 6 at 3 is not a weak feature, it's an absent
one, and it carries double weight. Nothing else matters if half the household never sees it.

Two things earned their marks and must survive rewriting: integer minor units, and the
rules-before-LLM pipeline. Do not let round 2 trade them away for anything.
