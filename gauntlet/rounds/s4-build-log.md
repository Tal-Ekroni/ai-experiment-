# Stage 4 — Build log

Built per the converged spec (`06-artifact.md`) on the stage-3 architecture. Each slice shipped
working with tests; two real defects were caught by the slice gauntlets *before* stage 5:

1. **One-directional transfer matching** *(ledger slice)*. The matcher checked that the debit had
   exactly one credit candidate, but not that the credit had exactly one debit claimant — the
   Accountant's round-5 scenario (₪500 to savings + ₪500 to a sister, same day) auto-linked
   instead of becoming a link question. Test failed; fixed with a mutual-uniqueness check.
2. **Unescaped `בע"מ` quotes swallowed CSV rows** *(E2E)*. The RFC-4180 parser opened quote-mode on
   a mid-field `"`, merging rows: 90 of 97 bank rows imported and the settlement debits' amounts
   were corrupted, so nothing matched and spend double-counted — the round-1 bug, resurrected by
   an encoding detail. Fixed (quote is literal unless field-initial) with a regression test;
   re-run: 97/97 rows, spend fell ₪40,679 as fifteen settlement debits went internal.

Also added during build, forced by the file-import reality: `inferStatements` — for import-mode
cards there is no scraped statement feed, but the card file *is* the issuer's own data, so the
calendar-month sum is the issuer-reported total (§3.1) and the settling bank debit matches it.

## What exists (app/)

- `src/lib/` money (agorot only), db (schema + CHECK constraints), parse (cp1255, HTML-as-xls,
  hand-rolled CSV, mapping detection), ledger (classification, both matchers, supersede,
  coverage), categorize (merchant-level, enum-gated LLM optional, queue budget, split
  explainability), ingest (SHA-256 idempotent), retrospect (12-month + month-over-month).
- `src/server/` one-process HTTP server, HMAC-cookie passcode auth, escape-by-default HTML layer,
  six screens (setup → confirm-20 → passcode → dashboard/retrospect/review/transactions/health/settings),
  RTL-first, composed hero, validated palette.
- `src/jobs/` self-check, digest (two-sided triggers, decay for chores, broken leads), Answerer
  (allowlist, fixed intent schema, refuse-don't-repair, verbatim figures, acknowledge-first).
- `test/` 14 tests incl. the double-count case, refuse-to-pick, supersede, cp1255 fixtures,
  quote regression, injection-shaped intent forgeries.
- Dockerfile + compose; `npm start` works without Docker.

Deferred to post-ship (recorded, not hidden): scraper worker (setup stage 2), TLS/DNS-01 (stage 4),
balance-snapshot reconciliation (needs a balance feed imports don't carry), drift gate (needs the
month-nine history), amount-band rule UI.
