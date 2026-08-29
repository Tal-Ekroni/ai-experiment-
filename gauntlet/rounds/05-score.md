# Round 5 — Score

Rubric per `gauntlet/RUBRIC.md`. Frozen; not modified.

| # | Dimension | Weight | R1 | R2 | R3 | R4 | R5 | Δ | Weighted | Verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Correctness | 2 | 4 | 7 | 8 | 9 | **9** | 0 | 18 | Method rigorous and honest; coverage narrower than presented |
| 2 | Friction | 2 | 5 | 7 | 8 | 8 | **9** | +1 | 18 | Staging right; stage 1 rests on files that may not parse |
| 3 | Security & privacy | 2 | 4 | 6 | 7 | 9 | **9** | 0 | 18 | Narrowest-credential rule applied; new surface has no allowlist |
| 4 | Genuine AI utility | 1 | 4 | 6 | 7 | 9 | **9** | 0 | 9 | Third agent earns its seat; its numbers need templating |
| 5 | Durability | 1 | 5 | 6 | 8 | 9 | **9** | 0 | 9 | Health on the surviving channel; decay undercuts it |
| 6 | Second-user pull | 2 | 3 | 7 | 8 | 9 | **10** | +1 | 20 | Value where she is, and something she can do |
| 7 | Craft | 1 | 5 | 5 | 7 | 8 | **9** | +1 | 9 | Composed hero and two states; palette unspecified |

**Weight total:** 11
**Weighted sum:** 101
**Mean:** 101 / 11 = **9.2** (4.2 → 6.5 → 7.6 → 8.7 → 9.2)
**Floor:** **9** (six dimensions)

## Bar

Required: floor ≥ 8.0 **and** mean ≥ 9.0.
Actual: floor **9.0 — PASS**, mean **9.2 — PASS**.

### **PASS** — first clean pass. One more required to converge.

## Anti-inflation check

Mean rose +0.5, well inside the cap. No justification needed.

## Reading

**Dimension 6 reached 10**, and it is worth recording why, because it started at 3 and carried
double weight: the second user now gets value in a channel she already uses, without installing,
learning or navigating anything, and can act rather than only receive — with the home-network-only
constraint *defeated* rather than excused. The bot poll is outbound, so accepting replies opened no
port and cost nothing against the frozen decision. That dimension was the run's binding constraint
from round 1 and it is now its strongest.

**Every remaining finding is bounded and local.** No seat found a structural defect. Compare round 1,
where the ledger was arithmetically wrong and the app had no second user at all. What the panel
found this round: an unexamined file-format dependency, a rule interaction between decay and health,
a missing sender allowlist, reconciliation coverage narrower than its presentation, ungrounded
numbers in the newest agent's prose, and an unspecified palette. All real, all fixable without
redesigning anything.

**One theme connects four of them:** round 5 added new surfaces — staged setup, the reply channel,
the self-check — and each arrived without the rigour the older parts earned over four rounds. New
code is young code. The mandate for round 6 is to age it.

Round 6 is the confirmation round. Per `GAUNTLET.md`, convergence requires it to clear the bar again
**and** produce no finding that changes the artifact.
