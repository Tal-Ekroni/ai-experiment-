---
description: Convene the Kupa product org (CEO, CTO, PM, R&D Lead + R&D agents). By default it decides the next bet, builds it, and reflects the decision — no step-by-step approval.
argument-hint: "[decide | build | a directive to weigh]"
---

# /org

Run one cycle of the org defined in `gauntlet/org/ORG.md` for Kupa (`app/`).

Argument `$ARGUMENTS`:
- *(empty)* or `build` — decide the next bet AND build it, then reflect. (Default: full autonomy.)
- `decide` — decide and write the memo only; do not build yet.
- anything else — treat it as a directive from the user to weigh into the CEO's decision.

## Do this
1. **Ground:** read `product/ROADMAP.md`, `gauntlet/OPEN-RISKS.md`, and what's built in `app/`.
2. **CEO** picks the single next bet with a one-line why-now (honor any user directive in the arg).
3. **CTO** gate-checks it against the standing guardrails; bounce with a smaller shape if it fails.
4. **PM** scopes it: problem, acceptance criteria, out-of-scope, first slice.
5. **R&D Team Lead** builds it with the quality bar — unit-test the math, render anything visual and
   look at it, adversarial self-review — spawning R&D agents (the Agent tool) when work is
   independent enough to parallelize. Commit and push.
6. **Reflect:** write `org/CYCLE-<n>.md` (decision-first) and update the roadmap, then give the user
   a short memo: **what we decided, why, what shipped, what's next.**

## Rules
- Decide and ship within the guardrails without asking. Ask (one line) only for irreversible moves,
  spend, new use of private data, or reopening a frozen decision.
- Never break local-first. Tests + render before ship. Money is integer agorot.
- The memo leads with the decision, not the process.
