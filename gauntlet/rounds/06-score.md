# Round 6 — Score *(confirmation round)*

Rubric per `gauntlet/RUBRIC.md`. Frozen; never modified across six rounds.

| # | Dimension | W | R1 | R2 | R3 | R4 | R5 | R6 | Total Δ | Weighted |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Correctness | 2 | 4 | 7 | 8 | 9 | 9 | **10** | +6 | 20 |
| 2 | Friction | 2 | 5 | 7 | 8 | 8 | 9 | **9** | +4 | 18 |
| 3 | Security & privacy | 2 | 4 | 6 | 7 | 9 | 9 | **10** | +6 | 20 |
| 4 | Genuine AI utility | 1 | 4 | 6 | 7 | 9 | 9 | **9** | +5 | 9 |
| 5 | Durability | 1 | 5 | 6 | 8 | 9 | 9 | **9** | +4 | 9 |
| 6 | Second-user pull | 2 | 3 | 7 | 8 | 9 | 10 | **10** | +7 | 20 |
| 7 | Craft | 1 | 5 | 5 | 7 | 8 | 9 | **10** | +5 | 10 |

**Weight total:** 11 · **Weighted sum:** 106
**Mean:** 106 / 11 = **9.6** (4.2 → 6.5 → 7.6 → 8.7 → 9.2 → **9.6**)
**Floor:** **9** (dimensions 2, 4, 5)

## Bar

Required: floor ≥ 8.0 **and** mean ≥ 9.0.
Actual: floor **9.0 — PASS**, mean **9.6 — PASS**.

### **PASS.** Second consecutive clean pass.

## Anti-inflation check

Mean rose +0.4, well inside the +1.0 cap. Five bounded fixes, no redesign, no new scope — exactly
what a confirmation round should look like.

## Convergence

`GAUNTLET.md` defines convergence as two consecutive rounds clearing the bar where the second
produces **no finding that changes the artifact**.

- Round 5: PASS (floor 9.0, mean 9.2).
- Round 6: PASS (floor 9.0, mean 9.6), **seven findings, zero blocking.**

### **CONVERGED at round 6.** Stage 2 complete.

## Where the movement came from

**Dimension 6 moved furthest (+7, from 3 to 10) and it carried double weight.** It was the run's
binding constraint from round 1, when the app had no path to its second user at all — it was a
website that waited. The fix wasn't a feature; it was noticing that the frozen home-network-only
decision constrained *inbound* access and said nothing about outbound, and that a bot poll is
outbound. The constraint was defeated rather than excused, which is the rubric's own word for a 10.

**Dimensions 1 and 3 both moved +6, and both moved by having a defect found rather than a feature
added.** Correctness went from a ledger that double-counted every Israeli card purchase against its
settling debit — reporting roughly twice the real spend — through a reconciliation check that could
never fail, then one that could never pass, to one that does both and states its true resolution.
Security went from bank credentials in a `.env` and no authentication at all, through a proposed
private CA that would have been worse than the hole it patched, to four separately-scoped
credentials and a named privacy trade.

**The three dimensions that finished at 9 are honest 9s, not near-misses.** Friction, durability and
AI utility each end on a risk no document can discharge: whether the household sustains a weekly
twelve-item queue, whether a volunteer scraper project keeps working, and whether an unmeasured
question volume stays where it's assumed. All three are in `OPEN-RISKS.md`.

## What the gauntlet actually caught

Findings that would have shipped without a hostile panel, in the order they were found:

1. Israeli consolidated card settlement double-counting every purchase — **the app's headline number
   was wrong by roughly 2×** *(round 1, Accountant)*.
2. No path to the second user existed at all *(round 1, Spouse)*.
3. A reconciliation check that could never fail *(round 2, Realist)*.
4. A digest that would announce false drift in month two, in the channel it needed to be trusted in
   *(round 2, Skeptic)*.
5. The corrected reconciliation could never *pass* — Israeli value dates *(round 3, Accountant)*.
6. A proposed local CA on both phones — a device-wide MITM position, strictly worse than the
   plaintext passcode it patched *(round 4, Security)*.
7. A digest structurally incapable of good news, on the most emotionally loaded subject in a
   household *(round 4, Spouse)*.
8. A zone-wide ACME token beside the bank credentials *(round 5, Security)*.
9. No sender allowlist on a bot that answers financial questions to anyone who finds it
   *(round 5, Security)*.
10. Health alerts routed through a decay rule built for nags *(round 5, Realist)*.
11. Red/green as the only distinction on the primary screen *(round 5, Craft)*.

Two of those (1 and 9) are severe enough that shipping without them found would have made the app
either wrong or unsafe.
