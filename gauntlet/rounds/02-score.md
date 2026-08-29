# Round 2 — Score

Rubric per `gauntlet/RUBRIC.md`. Frozen; not modified.

| # | Dimension | Weight | R1 | R2 | Δ | Weighted | Verdict |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | Correctness | 2 | 4 | **7** | +3 | 14 | Fatal double-count fixed; matchers imprecise |
| 2 | Friction | 2 | 5 | **7** | +2 | 14 | Cold start solved; `Other` leaks unbounded |
| 3 | Security & privacy | 2 | 4 | **6** | +2 | 12 | R1 holes closed; digest opened a new one |
| 4 | Genuine AI utility | 1 | 4 | **6** | +2 | 6 | Right roster; drift has a statistical foot-gun |
| 5 | Durability | 1 | 5 | **6** | +1 | 6 | Sync ladder good; both integrity checks decorative |
| 6 | Second-user pull | 2 | 3 | **7** | +4 | 14 | A path exists; it decays on a schedule |
| 7 | Craft | 1 | 5 | **5** | 0 | 5 | Held flat — deferred by mandate |

**Weight total:** 11
**Weighted sum:** 71
**Mean:** 71 / 11 = **6.5** (was 4.2)
**Floor:** **5** (dimension 7, craft)

## Bar

Required: floor ≥ 8.0 **and** mean ≥ 9.0.
Actual: floor 5.0, mean 6.5.

### **FAIL** — both gates.

## Anti-inflation check

Mean rose +2.3, exceeding the +1.0 default cap. `GAUNTLET.md` permits this only with a
correspondingly large change in the artifact. Justification, recorded for audit:

- The artifact was fully rewritten, not amended (100 → 207 lines).
- A defect that made every reported total roughly double was fixed with new machinery
  (flow classification, two matchers, an exclusion class).
- An entire missing surface was added — §5, the outbound digest — which is the difference between
  the app having a second user and not having one. That dimension alone moved +4 at ×2 weight.
- Four agents deleted, cold start restructured from 300 transaction taps to 20 merchant taps.

The rise is proportional to the change. Accepted.

## Reading

The floor moved to craft — the one dimension round 2 was instructed not to touch. That is the
mandate working correctly, not a failure, but it makes craft unavoidable in round 3: nothing can
pass while a ×1 dimension sits at 5.

The panel converged on a theme it did not coordinate on. The Spouse wants the digest to stay
silent when it has nothing to say. The Skeptic wants drift to stay silent until its windows are
comparable. The Abandoner wants the app to admit how much of the month it cannot explain. The
Realist points out that both integrity checks currently *cannot fail*, which is the same disease:
**the app is more willing to speak than it is able to be right.** Round 3's central job is teaching
it when to say nothing.

Protect through the next rewrite: integer agorot, rules-before-LLM, merchant-level categorization,
the 20-merchant onboarding, the two-agent roster, enum-constrained categorizer output.
