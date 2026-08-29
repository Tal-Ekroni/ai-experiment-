# Stage 3, Round 1 — Architecture

*The spec (`06-artifact.md`) is frozen input. This stage decides how it is built.*

## Process model

One box, three processes under `docker compose`:

- **web** — Next.js 16 (App Router) + Tailwind, server components, SQLite via `better-sqlite3`.
- **jobs** — a Node worker: nightly scrape (vendored `israeli-bank-scrapers` + Puppeteer/Chromium),
  digest evaluation, self-check, monthly close. Cron inside the container.
- **bot** — Telegram long-poll loop for the Answerer.

Shared SQLite file on a mounted volume; WAL mode for cross-process access.

## Schema (SQLite)

`accounts`, `transactions` (booking_date, value_date, amount agorot INTEGER, raw_descriptor,
merchant_id, category, flow_class, link_id, status, external_id, original_amount/currency),
`merchants`, `rules`, `statements`, `balance_snapshots`, `months`, `link_questions`,
`import_mappings`, `settings`, `job_runs`.

## Dependency surface

next, react, react-dom, tailwindcss, better-sqlite3, israeli-bank-scrapers (vendored), puppeteer,
node-telegram-bot-api, @anthropic-ai/sdk, iconv-lite (windows-1255), xlsx (Excel exports), zod
(intent schema), date-fns, multer (uploads). ~14 direct dependencies.

## Build & test

Vitest for units; Playwright for the five screens. `npm run build` → standalone Next output.
