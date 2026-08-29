# Round 2 — Product spec: **Kupa**

*Stage 2, round 2. Full rewrite against `01-mandate.md`. Craft and cost findings deliberately
untouched this round.*

---

## 1. The job

Two adults, one joint pot, Israeli banks, one machine at home. Two jobs only:

1. **Where did we land this month** — assembled without anyone assembling it.
2. **Is our normal getting more expensive** — caught while it's still fixable.

Out of scope and staying out: subscription hunting, fee alerts, bill splitting, per-person
budgets, net worth, investments, goals, streaks, badges.

## 2. Ingestion

**Scrapers primary, file import as a permanent equal-class path.** Reasoning unchanged from round
1: Israel has no usable individual aggregator; `israeli-bank-scrapers` drives the real login pages
for Leumi, Hapoalim, Discount, Otsar Hahayal, Beinleumi, Massad, Yahav, Isracard, Amex, Max and
Cal; it needs live credentials, which is only acceptable because the box is ours. Local-first and
scraping are one decision, not two.

### 2.1 The OTP problem *(mandate 5)*

Some Israeli institutions demand an SMS OTP on **every** login, not just from a new device. For
those, unattended nightly scraping is not possible — no amount of engineering makes it possible,
and pretending otherwise is how this app quietly stops having data.

Each account is therefore configured in one of three **sync modes**, discovered per institution
during setup rather than assumed:

| Mode | Behaviour |
|---|---|
| `unattended` | Nightly 03:00 scrape, no human. The good case. |
| `assisted` | Cannot run unattended. Fires a push asking for one OTP, on a schedule the household picks. Defaults to **monthly**, not weekly — see §5.3. |
| `import` | No scraping at all. Monthly file drop. Always available for any account, as the escape hatch when a scraper breaks. |

An account may be demoted `unattended → assisted → import` automatically after repeated failures,
and says so.

## 3. Ledger

Amounts are **integers in agorot**. No floats touch money, anywhere, ever.

### 3.1 Flow classification *(mandate 1 — the precondition)*

Every transaction carries a `flow_class`, resolved before it can appear in any total:

- `expense` — money that actually left the household
- `income` — money that actually entered
- `internal` — money that moved between things we own; **excluded from both totals**

Two matchers produce `internal`:

**Card settlement matching.** Israeli cards debit as one consolidated monthly charge. The card
account's individual purchases are the truth for spend. The bank-side debit that settles them is
`internal`. Matched on: amount equal to the card statement total, within ±4 days of the statement
charge date, from the account the card is registered against. A matched pair is linked, and both
sides show the link in the UI.

**Own-account transfer matching.** A pair across two of our accounts, opposing sign, equal
absolute amount, within 3 days. Both sides become `internal`.

Any transaction the matchers *nearly* match — right amount, wrong window; right window, ambiguous
counterparty — is not silently guessed. It goes to the review queue as a **link question**, which
is a different and much rarer question than a category question.

### 3.2 Reconciliation *(mandate 1)*

Each account, each month: `opening balance + Σ transactions == closing balance`, both balances as
reported by the institution itself. The delta is computed and stored on the month.

A month with a non-zero delta on any account is **unreconciled**, and every figure derived from it
is labelled unreconciled wherever it appears. The app does not quietly present a number it cannot
prove. This is the single most valuable thing it can tell you, so it is never buried.

### 3.3 Schema

`Account` (institution, kind, sync mode, currency, `synced_through`), `Transaction` (account, date,
amount agorot, raw descriptor, merchant, category, `flow_class`, `link_id`, status, external id),
`Merchant` (normalized name, confirmed category, transaction count, lifetime volume), `Rule`,
`Month` (totals, reconciliation delta per account, freshness).

Category tree stays deliberately small: 14 leaves.

## 4. Categorization

**Merchant-level, not transaction-level.** This is the change that makes everything else work.

Resolution order, first match wins:

1. **Merchant already confirmed** → its category. Covers the overwhelming majority forever.
2. **Rule** matches descriptor pattern (+ optional amount range).
3. **LLM**, only for a merchant string never seen before. Batched. The result is written back as a
   confirmed merchant, so any given merchant costs at most one call in the lifetime of the app.
4. **Unresolved** → provisional category `Other`, and a candidate for the queue.

### 4.1 The review queue is a budget, not a screen *(mandate 3)*

Hard cap: **12 items per week.** Ranked by how much money the answer moves —
`|amount| × uncertainty`. Everything below the line is auto-assigned and never shown. A skipped
week does not compound: the next week is still 12 items, re-ranked against everything outstanding,
so the queue can never grow into a debt.

Being 92% right without help beats being 100% right with help that isn't coming.

### 4.2 Cold start *(mandate 3)*

Night one has ~800 backfilled transactions and zero rules. **None of them go to the queue.**

Those 800 transactions are roughly 120 distinct merchants, and the top 20 merchants account for
most of the money. So setup ends with one screen: **confirm 20 merchants**, largest lifetime
volume first. Twenty taps categorizes several hundred transactions. Everything else is
auto-assigned and can be corrected later, or never.

Onboarding is twenty taps, not three hundred.

## 5. Reaching the second user *(mandate 2)*

The home-network-only decision constrains **inbound** access. It says nothing about the app
sending outbound. So the app is not a place you go. It is something that arrives.

### 5.1 The digest

A **weekly message** to both adults, in the messaging app they already use — Telegram bot as
primary, email via the household's own SMTP as fallback. Neither adult installs Kupa, learns
Kupa, or logs into Kupa.

Payload is aggregates only. Three numbers and one sentence:

> **This week: ₪3,240 out.** Groceries ₪1,180 · Eating out ₪620 · Fuel ₪410
> Running ₪280/month above your spring baseline, mostly eating out.

### 5.2 The monthly close

At month end, a second message: the month's total, the comparison to the trailing baseline, the
one category that moved most, and the reconciliation status.

### 5.3 Assisted-mode prompts

Accounts that need an OTP send a request to the primary user. **Monthly by default, not weekly** —
a weekly chore assigned to the one person who already does everything is how this collapses back
into the thing it replaced.

### 5.4 The dashboard's role changes

It is no longer the product. It is where you go *after* a message made you curious. That inverts
what round 1 assumed and is the correct order.

## 6. Drift detection

Per category: trailing 3-month mean against the prior 3-month mean. Flag when the baseline rises
more than 15% **and** more than ₪200/month. Reported in shekels per month, in the digest, in
plain language.

## 7. Security *(mandate 4)*

- **Credentials in the OS keychain.** Never a `.env`, never the filesystem, never the repo. The
  scraper process requests them at run time and holds them in memory only.
- **A shared household passcode on the app.** Not because the two adults distrust each other, but
  because the house network contains a smart TV, a printer, and every guest who ever got the WiFi
  password. The network is not a perimeter.
- **Descriptors are hostile data.** A merchant descriptor is attacker-controlled text: anyone can
  put an instruction in one for the price of a ₪3 charge. Two defences, both required: descriptors
  are passed as data in a structured field and never interpolated into instruction position; and
  the categorizer's output is constrained to **one value from the 14-category enum**, so a
  successful injection has no channel to express anything through.
- **No agent can move money.** There is no write path to any institution. The scrapers are
  read-only by construction.

## 8. Agents — cut from six to two *(mandate 5)*

**1. Categorizer.** Trigger: new unseen merchant after a scrape. Acts unattended, writes back a
confirmed merchant. Delete it and the household categorizes 120 merchants by hand.

**2. Drift Analyst.** Trigger: monthly close. Computes baselines, writes the flags the digest is
built from. Delete it and the app answers job 1 but not job 2.

Deleted: Month Narrator (prose nobody reads), Anomaly Watcher (fires on annual insurance, muted by
month two), Budget Advisor and Insight Chat (the same chat box described twice, no trigger, and
the household that won't open a dashboard certainly won't interview a bot).

## 9. Freshness is a property of every number *(mandate 5)*

Each account carries `synced_through`. **Every aggregate inherits the oldest freshness among its
inputs**, and displays it next to itself — not in a log file.

A total assembled from a stale account reads *"₪14,200 — Leumi last synced 8 days ago"*, in the
UI and in the digest. Beyond 3 days an account is stale; beyond 10 it is presented as broken and
the digest leads with that instead of with numbers. The app never renders a confident figure it
has no right to be confident about.

## 10. Stack

Node/TypeScript, SQLite, Next.js, Tailwind, `docker compose up` on a Mac mini or NAS. Credentials
via keychain. Scrapers as a separate process from the web app.

## 11. Rollout

1. Ingestion, ledger, flow classification, reconciliation — the arithmetic, first.
2. Merchant categorization and the 20-merchant onboarding.
3. The digest. *(Moved up: it is the product, not the last feature.)*
4. Dashboard.
5. Drift.
