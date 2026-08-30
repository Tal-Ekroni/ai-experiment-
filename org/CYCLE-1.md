# Cycle 1 — 2026-08-30

**Bet:** the real-trace replay rail (`jolt/tools/trace.mjs` + tests). Why now: the
owner's SEV1 (shake misses on a real iPhone) is blocked on ground truth; Motion Lab
(capture.html) ships the recording side, and this cycle ships the decode-and-replay
side, so the moment the owner pastes their trace the diagnosis is one command and the
fix is same-day, locked by fixtures.

**Storm.** Lead scoped decode → segment → replay-through-shipping-ShakeCore with a
per-segment verdict (shake segments should fire, still/walk must not). Challenger's
strongest objection, recorded: *"tooling without data is process theater — lower the
12 m/s² threshold now and relieve the owner today."* CTO veto on the challenger:
threshold guesses risk false fires that cost lives mid-run (the fairness gate sits AT
its 8% ceiling); no motion tuning without ground truth — this is now a Landmine in
CLAUDE.md. CEO picked the rail.

**Shipped:** tools/trace.mjs (decode JOLTTRACE1/0, segment grouping, replay through
the real compiled ShakeCore, verdict + JSON report), tests/trace.test.mjs (5 tests:
blob round-trip, fallback format, rejection, grouping, real-core fire/no-fire) wired
into npm test. Also this cycle: the org itself (CLAUDE.md quality bar + landmines,
org/ORG.md, INBOX/QA-FINDINGS/UX-NOTES, five scheduled routines), and the Motion Lab
deploy earlier today.

**Numbers:** 171/171 tests, tsc clean, FRONTDOOR PASS, typical median in band,
unavoidable 8% (at ceiling, unchanged).

**Deliberately not done:** any motion-threshold change (blocked on the owner's trace —
SEV1 stays open in QA-FINDINGS); gh-pages rebuild (no game-code change this cycle;
Pages is anyway mis-pointed at main — owner action pending, see below).

**Owner action needed:** (1) Settings → Pages → deploy from branch `gh-pages` — Pages
currently points at main and 404s. (2) Run capture.html on the iPhone, paste the trace.
