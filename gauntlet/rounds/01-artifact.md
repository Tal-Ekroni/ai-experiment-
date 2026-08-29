# Round 1 — Product spec: household CFO (working name: **Kupa**)

*Stage 2, round 1. First full draft. Written against the frozen decisions in `DECISIONS.md`.*

---

## 1. The job

Two adults, one joint pot, Israeli banks, everything running on a machine at home. They have no
method today, so at month end they don't know what happened, and their baseline cost of living is
drifting upward without anyone noticing.

The app has exactly two jobs:

1. **Tell us where we landed this month**, without anyone having to assemble it.
2. **Tell us when our normal is getting more expensive**, in time to do something.

Everything else is out of scope. Notably out: subscription hunting, fee alerts, bill splitting,
per-person budgets, net worth tracking, investments, goals, gamification.

## 2. Ingestion — the decision

**Chosen: scrapers as primary, file import as a permanent fallback.**

Reasoning, since the user delegated this:

- Israel has no usable aggregator for individuals. Open banking exists on paper; practical
  programmatic access for a private person does not.
- `israeli-bank-scrapers` (open source, Node + Puppeteer) covers Leumi, Hapoalim, Discount,
  Otsar Hahayal, Beinleumi, Massad, Yahav, Isracard, Amex, Max, and Visa Cal. It drives the real
  login pages in a headless browser.
- It needs live bank credentials on the machine. That is only acceptable because decision #2 put
  the whole app on a box the household owns. Local-first and scraping are the same decision.
- Scrapers break. Banks redesign login flows without warning. So file import is not a nice-to-have
  — it is the thing that keeps the app alive during the two weeks a scraper is broken.

Nightly run at 03:00. Each bank is an independent job; one failure doesn't stop the others.

## 3. Data model

- Every amount is an **integer in agorot**. No floats anywhere near money.
- `Account` — institution, type (bank | card), display name, currency, last successful sync.
- `Transaction` — account, date, amount (signed, minor units), raw descriptor, normalized
  merchant, category, status (pending | settled), scraper-provided identifier.
- `Category` — a deliberately small tree, ~14 leaves. Housing, Groceries, Eating out, Transport,
  Car, Utilities, Health, Kids, Shopping, Leisure, Travel, Services, Transfers, Other.
- `Rule` — matches on descriptor pattern and optionally amount range, assigns a category.
- `MonthSnapshot` — closed month totals, frozen once the month ends.

## 4. Categorization

The pipeline, in order, first match wins:

1. **Exact descriptor match** against previously confirmed transactions.
2. **Rules** — user or system defined patterns.
3. **LLM** — only for descriptors never seen before. Batched, sent as merchant string plus amount,
   nothing else. Result becomes a rule, so each novel merchant costs one call ever.
4. **Unknown** — goes to the review queue.

Every correction the user makes writes a rule. The queue shrinks over time by construction.

## 5. The weekly review

One screen. The uncertain transactions since last time, biggest first, each with a suggested
category and a one-tap confirm. Target: under five minutes.

## 6. Drift detection

The headline feature. For each category, compute a trailing 3-month mean and compare against the
prior 3-month mean. Flag categories whose baseline has risen more than 15% and more than ₪200.
Present as: *"Groceries is running ₪640/month above where it was in the spring."*

## 7. Interface

Runs at `http://kupa.local:3000` on the house WiFi. Both adults can open it from any device in the
home. No login — the network is the perimeter.

- **Dashboard** — this month vs. last month, spend by category, the drift flags.
- **Review** — the weekly queue.
- **Transactions** — searchable list.
- **Months** — closed month history.

## 8. The agents

1. **Categorizer** — resolves novel merchants nightly after each scrape.
2. **Drift Analyst** — monthly, computes baselines and writes the drift flags.
3. **Month Narrator** — at month close, writes a short plain-language summary of what happened.
4. **Anomaly Watcher** — flags transactions far outside the pattern for their category.
5. **Budget Advisor** — answers questions about the household's spending on request.
6. **Insight Chat** — free-form Q&A over the transaction history.

## 9. Stack

Node/TypeScript, SQLite, Next.js, Tailwind. Runs under `docker compose up` on a Mac mini or NAS.
Bank credentials in a `.env` file with restrictive permissions.

## 10. Rollout

Week 1 ingestion and storage. Week 2 categorization and review. Week 3 dashboard. Week 4 drift and
agents.
