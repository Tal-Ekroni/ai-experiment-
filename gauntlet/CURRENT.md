# Gauntlet — current state

**Stage:** 2 — Spec gauntlet
**Round:** 4 complete
**Floor:** 8.0 **Mean:** 8.7 **Bar:** FAIL on mean only (need floor ≥ 8.0 ✓, mean ≥ 9.0 ✗)

## Status

Progression: 4.2 → 6.5 → 7.6 → 8.7. **First round to clear the floor** — every dimension is now 8
or above, so remaining work is refinement rather than repair.

Round 4 fixed the mirrored reconciliation bug (value date, rolling 7-day window, tolerance and
diagnosis), reversed the certificate own-goal (DNS-01, no private CA), made Hebrew and RTL
requirements, gave the digest two-sided triggers with a deliberately lower bar for good news, and
answered the deferred cost question decisively: ~₪0.52/year, which makes model choice a quality
decision rather than a cost one.

Signature failure of the round: **self-contradiction in three places** — the spec states a principle
in one section and forgets it in another. And two seats found the same shape from opposite ends:
the app withholds value until setup completes, and withholds it from the second user entirely.

## Next action

Execute round 5 against `rounds/04-mandate.md`. Theme: stop withholding value.
