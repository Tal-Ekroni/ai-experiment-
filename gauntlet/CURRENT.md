# Gauntlet — current state

**Stages 1–6: COMPLETE.** The loop is finished.

| Stage | Outcome |
|---|---|
| 1 Interrogation | 8 answers, rubric frozen |
| 2 Spec gauntlet | Converged round 6 — floor 9.0, mean 9.6 |
| 3 Architecture gauntlet | Converged round 2 — one process, node:sqlite, ~0 runtime deps |
| 4 Build | Kupa built, 14 tests green, 2 defects caught by slice gauntlets |
| 5 Red-team (running code) | 7 attack classes repelled, arithmetic exact, 1 render bug caught+fixed |
| 6 Ship gate | This. |

## What shipped

`app/` — a running one-process Node 22 household-CFO web app (Kupa): Hebrew/RTL, integer-agorot
ledger with settlement/transfer matching that refuses to guess, hostile-input parsers for real
Israeli bank exports, 20-merchant onboarding, twelve-month retrospect, delta-hero dashboard on a
CVD-validated palette, 12-item weekly review, self-check + two-sided digest, and an allowlisted
read-only Answerer. `npm start` or `docker compose up`.

## Open risks

`gauntlet/OPEN-RISKS.md` — 10 recorded, none fatal. The deciding one is unchanged from stage 2:
whether the second user ever opens it. Ship stage 1 and watch.

## Next action

None required — the loop is closed. Natural follow-ons if wanted: the scraper worker (setup
stage 2, unlocks live reconciliation), or a real first-run with the household's own file.
