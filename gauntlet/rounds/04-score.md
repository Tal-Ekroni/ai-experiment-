# Round 4 — Score

Rubric per `gauntlet/RUBRIC.md`. Frozen; not modified.

| # | Dimension | Weight | R1 | R2 | R3 | R4 | Δ | Weighted | Verdict |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Correctness | 2 | 4 | 7 | 8 | **9** | +1 | 18 | Ledger sound; the delta diagnosis overstates its precision |
| 2 | Friction | 2 | 5 | 7 | 8 | **8** | 0 | 16 | Excellent once running; setup became an evening project |
| 3 | Security & privacy | 2 | 4 | 6 | 7 | **9** | +2 | 18 | CA own-goal reversed; ACME token too broadly scoped |
| 4 | Genuine AI utility | 1 | 4 | 6 | 7 | **9** | +2 | 9 | Cost answered decisively; conclusion not yet spent |
| 5 | Durability | 1 | 5 | 6 | 8 | **9** | +1 | 9 | Dependency owned; health check is a human reminder |
| 6 | Second-user pull | 2 | 3 | 7 | 8 | **9** | +1 | 18 | Two-sided triggers land; she can receive but not act |
| 7 | Craft | 1 | 5 | 5 | 7 | **8** | +1 | 8 | RTL declared, then contradicted by the hero element |

**Weight total:** 11
**Weighted sum:** 96
**Mean:** 96 / 11 = **8.7** (4.2 → 6.5 → 7.6 → 8.7)
**Floor:** **8** (dimensions 2 and 7)

## Bar

Required: floor ≥ 8.0 **and** mean ≥ 9.0.
Actual: floor **8.0 — PASS**, mean 8.7 — fail.

### **FAIL** — one gate, narrowly. First round to clear the floor.

## Anti-inflation check

Mean rose +1.1. Artifact fully rewritten, 305 → 377 lines, with substantive new machinery in five
areas mandated by round 3 (windowed reconciliation on value date, DNS-01 replacing the private CA,
RTL as a requirement, two-sided digest triggers with decay, the costed agent section). The two
dimensions that received the least new material — friction and craft — are precisely the two that
did not move. Proportional. Accepted.

## Reading

**The floor cleared for the first time.** Every dimension is now at 8 or above, which means the
remaining work is refinement rather than repair. That is a different kind of round.

**The signature failure of this round is self-contradiction, three times over.** §10 declares bidi
isolation a requirement and §12 builds the app's largest string without it. §2.1 establishes that
this household does not do recurring chores, and then makes a quarterly human reminder the health
check for three independent failure modes. §8.1 proves inference costs fifty agorot a year and §4
keeps a rule that only exists because inference used to be expensive. In all three the spec knows
the right thing in one section and forgets it in another — which is what happens to a document
after four rewrites, and is exactly what a panel is for.

**Two seats found the same shape from opposite ends.** The Abandoner says setup delivers nothing
until it is complete. The Spouse says the app gives her nothing to do. Both are about the app
withholding value until some condition is met — the first temporally, the second by role. Round 5
should treat them together: value early, and value for both people.

Protect through the next rewrite: §3.6's value-date reconciliation, §5.1's asymmetric good-news
threshold, §5.2 decay, §5.4's named privacy trade, §6's two-signal separation, §8.1's cost finding
and its conclusion, §10's RTL requirement, §11's retrospect, §12's delta-as-hero.
