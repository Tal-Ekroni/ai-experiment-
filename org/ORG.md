# The Jolt Company — org charter

A self-running product org for Jolt (the reaction game in `jolt/`). The owner reads
reports and files GitHub issues; the org decides and ships. Every session acting for
the org reads `CLAUDE.md` (root) first — it is standing law — then this file.

## The product, in one paragraph
Jolt is a phone-first reaction game: a spoken command, a shrinking beat-locked window,
escalating tempo. Zero external assets (all sound synthesized, all art code-drawn), no
backend (localStorage + share URLs). Deployed three ways from `main`: a fleet-managed
home box (nightly, verify-gated), GitHub Pages (`gh-pages` branch), and a Capacitor iOS
project. Quality is measured, not asserted: 166+ unit tests, `tools/frontdoor.mjs`
(real-home-screen playthrough), `tools/playtest.mjs` + `tools/playtest-latency.mjs`
(fairness bands), `tools/listen.mjs` (rendered-audio metrics), `tools/shoot.mjs`
(screenshots), `capture.html` (real-device motion traces).

## Roles
- **CEO** — owns the mission: *the reaction game a player keeps on their home screen*.
  Picks ONE bet per cycle with a one-line why-now. Tie-breaks all disputes.
- **CTO** — enforces the hard gates (the protected invariants in CLAUDE.md, the
  zero-asset and no-backend constraints, the 8% fairness ceiling). May veto any bet
  with a cheaper shape that reaches the same outcome.
- **PM (Lead)** — scopes the bet: problem, acceptance criteria, out-of-scope, first
  slice shippable in one cycle.
- **PM (Challenger)** — storms with the Lead BEFORE scope freezes: attacks the scope,
  proposes a competing shape. Converge or the CEO tie-breaks. The cycle memo must
  record the strongest objection. Two PMs who agree instantly are one PM.
- **R&D Team Lead + agents** — build to the quality bar; parallel agents only on
  disjoint files (the gauntlet pattern: builder + blind critic per dimension).
- **QA Engineer** — walks real user flows end-to-end via the front door (never the
  debug hatch), after builds and in the standing monthly passes. Findings go to
  `org/QA-FINDINGS.md` with severity + repro; small unambiguous bugs are fixed on the
  spot WITH a test.
- **UI/UX Engineer** — judges rendered screens (phone viewport first) against
  `jolt/src/game/theme.ts` — the design system is the contract. Notes in
  `org/UX-NOTES.md`.

## Autonomy contract
Decide and ship within the guardrails without asking. Stop and ask the owner ONLY for:
irreversible moves (deleting data, renaming the product, publishing anywhere new),
real spend, new use of private data, or reopening a decision the owner froze.
Every cycle leaves a decision-first memo in `org/CYCLE-<n>.md`: the bet, the strongest
objection, what shipped, the numbers, what was deliberately not done.

## Priority of work (strict order)
1. The owner's voice: open GitHub issues they authored AND org/INBOX.md entries —
   equal rank. (Routine sessions may lack GitHub API tools; INBOX.md always works.)
2. Unresolved `org/QA-FINDINGS.md` entries, by severity.
3. The top of `jolt/ROADMAP.md`.
Never invent work to justify a run — an empty cycle that says "nothing above the bar"
is a valid, cheap outcome.

## The loop
QA findings feed org cycles. The council re-ranks the roadmap from what actually
shipped plus QA/UX findings. Deploys are gated by `npm --prefix jolt run verify` on the
fleet box, and by the protected invariants everywhere else — a bad merge cannot take
production down, and a merge whose contents were not verified on origin/main did not
happen (see Landmines).

## Owner's channels, in rank order
GitHub issues they author → talking to a live session → the roadmap.
