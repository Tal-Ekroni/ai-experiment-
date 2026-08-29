# Round 3 — Product spec: **Kupa**

*Stage 2, round 3. Full rewrite against `02-mandate.md`. Central job: teach the app when to say
nothing, and design the first run. Token cost remains deferred to round 4 by mandate.*

---

## 1. The job

Two adults, one joint pot, Israeli banks, one machine at home.

1. **Where did we land this month.**
2. **Is our normal getting more expensive.**

Out and staying out: subscription hunting, fee alerts, splitting, per-person budgets, net worth,
investments, goals, streaks.

**New governing principle, from round 2's panel:** the app must be more willing to be silent than
to be wrong. Every feature below has an explicit condition under which it says nothing.

## 2. Ingestion

Scrapers primary (`israeli-bank-scrapers`), file import as a permanent equal-class path. Local-first
and scraping are one decision: the scrapers need live credentials, which is only acceptable on a
box we own.

Sync modes per account, discovered at setup, never assumed: `unattended` (nightly 03:00),
`assisted` (needs an OTP; prompts **monthly**, not weekly), `import` (file drop only). Accounts
demote automatically after repeated failure and say so.

### 2.1 The scrape-window trap

Scrapers return a bounded history — as little as three months for some institutions. If the app
is off for longer than an account's window, transactions fall off the far end and are **lost
without any gap appearing anywhere.**

So each account stores `window_days` and `synced_through`. On every run, if
`today − synced_through > window_days × 0.6`, the app raises a **data-gap warning** naming the
exact date range at risk and the file-import path that recovers it. This fires before loss, not
after.

## 3. Ledger

Integers in agorot. No floats near money.

### 3.1 Flow classification

Every transaction resolves to `expense`, `income`, or `internal`. Only the first two reach totals.

**Card settlement matching.** Israeli cards debit as one consolidated monthly charge. Card
purchases are the truth for spend; the bank-side debit that settles them is `internal`. Keyed on
the **statement total the card issuer itself reports** — a `Statement` is a first-class entity with
its own total and charge date — *not* on the sum of purchases, which will not agree once foreign
currency is involved (§3.4).

**Own-account transfer matching, directional.** A real internal transfer has a counterparty we
own. Each account registers its identifying numbers at setup; where the descriptor carries a
counterparty, matching is on **identity**, and amount agreement is only corroboration.

### 3.2 Ambiguity is never resolved by picking *(mandate 3)*

Where identity is unavailable, the fallback is opposing sign + equal amount + 3-day window — but
**only when exactly one candidate fits.** Two or more candidates produce a **link question** in the
review queue, not a choice.

The asymmetry that justifies this: a double-count shows up as an implausibly large number and
someone notices. An over-match deletes real spending, and an under-count is invisible. The app
reports a better month than you had — the exact failure it exists to prevent. So when in doubt,
count it as spend and ask.

### 3.3 Pending → settled supersede *(mandate 1)*

Pending rows mutate: a ₪400 restaurant pre-auth settles at ₪460, a ₪250 fuel hold settles at ₪317,
and the institution may reissue a **different identifier**. So supersede is keyed on
`account + normalized merchant + date within 5 days`, never on external id. The settled row is
truth; the pending row is marked superseded and excluded, retained for audit. Two pending rows
plausibly matching one settled row is a link question.

### 3.4 Foreign currency

A card purchase abroad stores `original_amount`, `original_currency`, and `billed_amount` in
agorot. Only `billed_amount` enters totals. The provisional-to-final rate change is absorbed by
keying settlement on the issuer's statement total, per §3.1.

### 3.5 Refunds and restatement

A credit matching a prior purchase (same merchant, amount ≤ purchase) is a refund. It appears in
**cash flow** in the month it actually moved, and is attributed to the **purchase's month** for
drift baselines. These are two different questions and deserve two different answers.

Consequence, stated rather than hidden: **a closed month can be restated.** When it is, the month
is flagged `restated`, the delta is recorded, and the next monthly digest says so in one line. The
app never silently changes a number it has already told you.

### 3.6 Reconciliation that can actually fail *(mandate 1)*

Round 2's check derived the opening balance by walking today's balance backwards through the
transaction list it was meant to validate. That identity always holds. **A check that cannot fail
is not a check.**

Replaced with a daily, independently-asserted check. Every run captures a `BalanceSnapshot` per
account — the balance the institution states, which is not derived from anything we hold. Then:

```
balance(d) − balance(d−1)  ==  Σ transactions dated d
```

A mismatch means we are missing transactions, holding duplicates, or a pending row moved — all
real, all now detectable. Where snapshots have a gap (the machine was off), the check runs across
the gap window at lower resolution and says so.

Monthly reconciliation is the roll-up of daily checks. A month with any unresolved delta is
**unreconciled**, and every figure derived from it carries that label wherever it appears.

## 4. Categorization

Merchant-level. Resolution order: confirmed merchant → rule → LLM (novel merchants only, batched,
result written back as a confirmed merchant, so any merchant costs at most one call ever) →
`Other`.

### 4.1 The queue is a budget

**12 items per week**, ranked by `|amount| × uncertainty`. Below the line is auto-assigned and
never shown. A skipped week does not compound — next week is still 12, re-ranked. Link questions
(§3.2, §3.3) share the budget and outrank category questions, because they move more money.

### 4.2 Cold start: twenty taps

Night one is ~800 backfilled transactions, zero rules, and **none of them go to the queue.** Those
800 are roughly 120 distinct merchants; the top 20 by lifetime volume cover most of the money.
Setup ends with one screen: confirm 20 merchants, largest first. Twenty taps categorizes several
hundred transactions.

### 4.3 Explainability is a first-class number *(mandate 4)*

**% of this month's expense sitting in a confirmed-merchant category.** Target ≥ 95%.

This is the app's own honesty score and it appears on the dashboard and in the monthly digest.
`Other` is a bin, not a category, and an unbounded bin makes every other number on the screen a
lie. Below 95%, the app escalates: the monthly digest **leads** with it rather than with spending,
and says plainly that it cannot explain that share of the month.

The escalation deliberately does **not** enlarge the weekly queue. Punishing a busy week with more
work is how the app loses the person doing the work.

## 5. Reaching the second user

The home-network-only decision constrains **inbound** access. It says nothing about outbound. The
app is not a place you go; it is something that arrives.

### 5.1 The digest earns each send *(mandate 2)*

An unconditional weekly message is identical every week — because a life is the same every week —
and trains its own dismissal. By week nine the channel is muted, which is worse than no channel,
because you believe you have a path and you don't.

So the **weekly** message sends only if at least one condition holds:

| Condition | Threshold |
|---|---|
| A drift flag is **new** | see §6 |
| The week is unusually expensive | > 1.5σ above the trailing 13-week mean |
| Reconciliation broke | any unresolved delta |
| An account went dark | stale > 10 days |
| Explainability fell | < 95% |

Otherwise: **silence.** Silence is information and costs no credibility.

The **monthly close always sends**, because a month closing is itself the event. It reports how
many quiet weeks there were — so silence reads as *nothing happened*, not as *it broke.*

### 5.2 The message must stand alone

The household is on a home-network-only app. A message that deep-links to `https://kupa.local` is
useless the moment she reads it anywhere except the house — which is most of the time, and
certainly the Sunday morning she is finally curious.

**Every message carries its own answer.** The numbers, the comparison, the named category, the
plain sentence. The link is an optional "there's more at home", never the payload.

### 5.3 What this costs in privacy, stated plainly *(mandate 4)*

§5.1 sends household financial aggregates to a Telegram bot. **This partially overturns frozen
decision #2.** Round 2 made this trade silently; it is named here.

- **Payload:** weekly/monthly totals, up to three category names with shekel figures, one drift
  sentence. Never: transactions, merchants, account names, balances, identifiers.
- **What an attacker learns** from a year of that chat history: a longitudinal profile of the
  household's total spending and rough category mix. Not who you bank with, not what you bought,
  not your balances. Enough to know roughly how much money you have going out, not enough to
  transact.
- **Retention is not ours to promise.** The bot can delete its own messages; Telegram's
  server-side copies are outside our control. We do not claim a retention policy we cannot enforce.
- **Token isolation:** the bot token lives in a separate keychain entry from the bank credentials,
  under a separate service name. Compromise of the messaging path must not reach the money path.
- **Email over the household's own SMTP** is offered as the alternative for anyone who reads the
  above and declines. Same payload, one fewer third party.

## 6. Drift, and its refusal to speak *(mandate 2)*

Per category: trailing 3-month mean vs. the prior 3-month mean. Flag when the baseline rises
> 15% **and** > ₪200/month.

**The gate.** Drift produces no number unless *both* windows cover whole months over a **stable
account set** — the same accounts contributing on both sides. Backfill windows differ by
institution (three months from a bank, twelve from a card), so an ungated comparison in month two
reports the card's history starting as a change in behaviour, and announces
*"Groceries running ₪800/month above baseline"* when nothing happened.

That would be the first non-obvious thing the app ever says, delivered in the channel §5 spent all
its credibility building. So until the gate opens, drift reports **"not enough history yet — first
comparison available <date>"**, and shows the date. An honest silence in month two buys the
credibility that month twelve spends.

## 7. Security

- **Bank credentials in the OS keychain.** Never `.env`, never the filesystem, never the repo.
  Requested at run time, held in memory only.
- **TLS on the LAN listener** via a locally-trusted certificate (`mkcert`-style local CA installed
  on the household's two phones once, at setup). The household passcode currently crosses the
  network in the clear on the very network whose untrustworthiness justified adding it. A
  plain self-signed cert is rejected: it trains both adults to click through certificate warnings
  forever, which is a security control that teaches the opposite of security.
- **A shared household passcode** on the app. The house network has a smart TV, a printer, and
  every guest who ever got the WiFi password. The network is not a perimeter.
- **Descriptors are hostile data.** Anyone can put an instruction in a merchant descriptor for the
  price of a ₪3 charge. Two defences, both required: descriptors travel as data in a structured
  field, never interpolated into instruction position; and the categorizer's output is constrained
  to **one value from the 14-category enum**, so a successful injection has no channel to express
  anything through.
- **No write path to any institution.** The scrapers are read-only by construction. No agent can
  move money.

## 8. Agents — two

**Categorizer.** Trigger: an unseen merchant after a scrape. Unattended. Writes back a confirmed
merchant. Delete it and the household hand-categorizes 120 merchants.

**Drift Analyst.** Trigger: monthly close, subject to §6's gate. Unattended. Writes the flags the
digest is built from. Delete it and job 2 goes unanswered.

Nothing else. Prose narrators, anomaly watchers and chat boxes were cut in round 2 and stay cut.

## 9. Freshness

Every account carries `synced_through`. **Every aggregate inherits the oldest freshness among its
inputs** and shows it next to itself, not in a log: *"₪14,200 — Leumi last synced 8 days ago."*
Stale past 3 days; presented as broken past 10, at which point the digest leads with that instead
of with numbers.

## 10. The first run *(mandate 5)*

Round 2 aimed the app's one moment of maximum enthusiasm at the emptiest screen it will ever
render: a four-day partial month, grey uncategorized bars, and a drift panel that needs six months.

Inverted. **Night one has twelve months of backfilled history, which is genuinely interesting
material, and the spec was treating it as nothing.**

After the 20-merchant confirmation, setup ends on **"Your last twelve months"**:

- Total in, total out, and what was left — the first time either of them has seen that number.
- The twelve-month category mix.
- The single largest expense of the year, named.
- The merchant they visited most, and what it cost in total.
- A twelve-month bar of monthly spend, so the shape of the year is visible at a glance.

None of this needs the current month, categorization to be perfect, or drift to be eligible. It is
available at minute forty of setup and it is the strongest thing the app will say all year.

**Lead with retrospect, not with a partial present.**

## 11. The dashboard's job has changed *(mandate 5)*

Round 2 declared the dashboard was no longer the product, then kept building four tabs of it. If
the digest is the product, the dashboard answers exactly one question: **"why did the message say
that?"**

One screen, reached from a message or from curiosity:

- **The hero is not the total — it is the delta.** A month's total spend is meaningless without a
  baseline; nobody knows whether ₪19,400 is good. The largest element on the page is
  **"₪1,400 above your normal"**, in one colour, readable across the room. Where no baseline exists
  yet (§6's gate), the hero is the twelve-month retrospect instead, never a naked total.
- Beneath it: the three categories that moved most, with shekel deltas.
- Beneath that: the transactions behind whichever of those you tap.
- Persistent in the corner: freshness, reconciliation status, and the explainability %. The app's
  three admissions, always visible, never buried.

Everything else — full transaction search, month history, merchant management — lives behind a
single "everything else" route and is explicitly not part of the primary experience.

## 12. Stack

Node/TypeScript, SQLite, Next.js, Tailwind. `docker compose up` on a Mac mini or NAS. Scrapers run
as a separate process from the web app. Credentials via OS keychain, two separate service entries.

## 13. Rollout

1. Ingestion, ledger, flow classification, supersede, daily balance reconciliation — the
   arithmetic first, because everything downstream is a lie without it.
2. Merchant categorization and the 20-merchant onboarding.
3. The twelve-month retrospect. *(The first thing the household ever sees.)*
4. The digest.
5. The dashboard.
6. Drift, behind its gate.
