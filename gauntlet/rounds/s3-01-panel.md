# Stage 3, Round 1 — Panel

## Realist — durability seat, **5/10**

**Kill shot:** Count what this architecture asks a Mac mini to keep alive for a year: Next.js (a
framework with a *major release cadence* under twelve months), React, Tailwind's build pipeline,
`better-sqlite3` — a **native module that must be recompiled every time the OS update moves Node**,
which is one of the three failure clocks §9.1 exists to watch — Puppeteer, and eight more. Fourteen
direct dependencies, hundreds transitive. The spec's §13 vendors the *scrapers* because a volunteer
dependency is a liability, and then the architecture casually adds a dependency surface fifty times
larger for what is, counted honestly, **five server-rendered screens on a LAN with two users**.
This is the month-fourteen failure being designed in: `npm install` breaks on a Node bump, and
nobody remembers how any of it was set up. The app whose premise is surviving neglect is built on a
stack that punishes neglect.

**Change:** Node's built-in `node:sqlite` (no native build), server-rendered HTML from the standard
library, one CSS file implementing the spec's own §12 palette (Tailwind is a build pipeline for a
design system this app doesn't have), zero-dependency multipart avoidance (client sends base64).
Target: **runtime dependencies ≈ 0**, dev-only TypeScript tooling.

## Security — **6/10**

`xlsx` (SheetJS) has a history of prototype-pollution advisories and is being fed **hostile files**
first thing at setup; the Excel-that-is-HTML case is a regex-scale problem, not a library-scale
one. `multer` is another parser fed hostile input. Both cuttable. **Change:** parse uploads from
base64 in-memory; sniff HTML tables directly.

## Abandoner — **6/10**

Three processes and cron-in-container is ops surface the household will meet at the worst time.
**Change:** one process, `setInterval` schedulers in-process, jobs table for observability. One
thing to start, one thing to restart.

## Accountant — **8/10.** Schema is right; add `restated` flag and per-account coverage to
`months`; store import file hash for idempotent re-import. **Craft — 7/10:** RTL in Tailwind is
fighting the framework; a hand-written stylesheet with logical properties is *less* work here.

**Floor 5, mean 6.4 — FAIL.** Mandate: collapse to one process; runtime deps to ~0 (LLM SDK and
telegram allowed as the two justified exceptions, both lazy-loaded and optional); no native
modules; no hostile-input parsing libraries; idempotent imports.
