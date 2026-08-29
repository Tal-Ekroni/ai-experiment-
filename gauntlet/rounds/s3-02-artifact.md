# Stage 3, Round 2 — Architecture *(rewritten)*

## Process model — one

A single Node 22 process. HTTP server from `node:http`, HTML rendered server-side by template
functions, one hand-written stylesheet implementing §12's validated palette with CSS logical
properties (RTL-first). In-process schedulers (`setInterval`) for nightly jobs, digest evaluation
and the self-check, each writing to a `job_runs` table. `docker compose up` starts one thing;
`node --run start` works without Docker at all.

## Storage

**`node:sqlite`** (built into Node 22 — no native compile, so an OS/Node bump cannot break the
build; the experimental flag is pinned by pinning Node itself in the compose image). WAL mode.
Integers in agorot everywhere; CHECK constraints on flow_class/status enums.

Schema as round 1, plus: `months.restated`, `months.coverage_json` (per-account reconcilability +
share-of-spend, §3.6.1), `imports` table with file SHA-256 for idempotent re-import, both dates on
every transaction.

## Dependency surface — two, both optional and lazy

- `@anthropic-ai/sdk` — the Categorizer/Answerer. **Optional:** without `ANTHROPIC_API_KEY` the
  app runs rules-only and queues novel merchants (the spec's own fallback order).
- Telegram — via plain `fetch` to the Bot API long-poll endpoints; **no library.** So: one runtime
  dependency. Dev-only: `typescript`, `tsx`. No native modules anywhere.

## Hostile input handling

Uploads: the browser reads the file and POSTs `{name, base64}`; the server decodes to a Buffer —
no multipart parser exists. Encoding: try UTF-8, fall back to `TextDecoder('windows-1255')`
(built-in). Excel-that-is-HTML: content-sniffed (`<` prefix), table rows extracted by a bounded
tag scanner, never a spreadsheet library. CSV: hand-rolled RFC-4180 parser (~60 lines, fixtures).
All parser output is validated (dates parse, amounts are integers) before touching the ledger.

## Scrapers

Deferred to setup stage 2 as the spec orders. The vendored-scraper worker is an *add-on* process
the compose file enables later; stage 1 (file import) has no Puppeteer anywhere near it.

## Auth

Shared passcode → HMAC-signed cookie (`node:crypto`), constant-time compare, per-install secret
generated at first run and stored in `settings`.

## Test plan

`node:test` + `tsx`; fixtures for every named parser; arithmetic property tests (sum of parts
equals whole); the injection test from §7 runs against a stubbed model that *returns* attacker text
and asserts the enum validator rejects it; Playwright (pre-installed Chromium) drives the five
screens and screenshots them for the stage-5 craft check.
