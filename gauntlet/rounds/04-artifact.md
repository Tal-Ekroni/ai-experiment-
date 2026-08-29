# Round 4 — Product spec: **Kupa**

*Stage 2, round 4. Full rewrite against `03-mandate.md`. Sections unchanged from round 3 are
restated in compressed form; new and rewritten material is marked.*

---

## 1. The job

Two adults, one joint pot, Israeli banks, one machine at home.

1. **Where did we land this month.**
2. **Is our normal getting more expensive.**

Out and staying out: subscription hunting, fee alerts, splitting, per-person budgets, net worth,
investments, goals, streaks.

**Governing principle:** the app must be more willing to be silent than to be wrong — *and* it must
be capable of saying something good, or silence is all it will ever be permitted to say.

## 2. Ingestion

Scrapers primary (`israeli-bank-scrapers`), file import as a permanent equal-class path. Sync modes
per account, discovered at setup: `unattended` (nightly 03:00), `assisted` (OTP required, prompts
monthly), `import` (file drop). Accounts auto-demote after repeated failure and say so.

**Scrape-window trap:** each account stores `window_days`. When
`today − synced_through > window_days × 0.6`, raise a data-gap warning naming the at-risk date
range and the import path that recovers it — before loss, not after.

### 2.1 Who owns the scraper layer *(new — mandate 5)*

`israeli-bank-scrapers` is a volunteer project. The household's entire financial visibility depends
on a stranger's free evenings, running headless Chromium on a machine that keeps taking OS updates.
This is named, not wished away:

- **Pinned and vendored.** The version is pinned and the source vendored into the repo, so an
  upstream disappearance or a breaking release is not an outage.
- **A written failure procedure**, in the repo and linked from the app: when a scraper breaks and
  no fix is coming, the affected account is demoted to `import`, the app says so **once**, and the
  monthly close carries the standing state. The household loses automation, never data.
- **A quarterly liveness check** — one scheduled reminder to confirm the pinned version still works
  against each institution, which is the difference between finding out in a week and finding out
  in fourteen months.

## 3. Ledger

Integers in agorot. No floats near money.

### 3.1 Flow classification

Every transaction resolves to `expense`, `income`, or `internal`; only the first two reach totals.

**Card settlement matching** keys on the statement total the issuer itself reports — `Statement` is
a first-class entity — never on the sum of purchases, which won't agree once foreign currency is
involved. **Own-account transfer matching is directional**: a real internal transfer has a
counterparty we own, registered at setup; identity matches, amount only corroborates.

### 3.2 Ambiguity is never resolved by picking

Where identity is unavailable, fall back to opposing sign + equal amount + 3-day window — **only
when exactly one candidate fits.** Two or more produce a **link question** in the queue.

The asymmetry: a double-count is implausibly large and someone notices. An over-match deletes real
spending, and an under-count is invisible — the app reports a better month than you had, the exact
failure it exists to prevent. When in doubt, count it as spend and ask.

### 3.3 Pending → settled supersede

Pending rows mutate (₪400 restaurant pre-auth settles at ₪460) and institutions reissue
identifiers. Supersede keys on `account + normalized merchant + date within 5 days`, never external
id. Settled is truth; pending is marked superseded, retained for audit. Ambiguity → link question.

### 3.4 Foreign currency

Store `original_amount`, `original_currency`, `billed_amount`. Only `billed_amount` enters totals.
Provisional-to-final rate drift is absorbed by keying settlement on the issuer's statement total.

### 3.5 Refunds and restatement

A credit matching a prior purchase appears in **cash flow** in the month it moved, and is attributed
to the **purchase's month** for drift baselines. Consequence stated rather than hidden: a closed
month can be **restated**, is flagged as such, and the next monthly digest says so in one line. The
app never silently changes a number it has already told you.

### 3.6 Reconciliation that can both pass and fail *(rewritten — mandate 1)*

Round 2's check derived its opening balance from the transaction list it was validating, so it
could never fail. Round 3 replaced it with a daily identity that **can never pass**, because
Israeli banks post on a **value date** (תאריך ערך) that routinely differs from the booking date —
worst for cheques, standing orders and card settlement, which is the largest line in the month.
Silent wrongness became loud wrongness, which is worse: it burns the one indicator the app's
honesty rests on.

Corrected on three axes:

**Both dates are stored.** Every transaction carries `booking_date` and `value_date`.
Reconciliation runs against `value_date`, because that is what the balance actually moves on.
Everything the household *sees* uses `booking_date`, because that is the day they remember.

**The window is seven days, not one.** A rolling 7-day sum absorbs value-date shift while still
catching a genuinely missing transaction:

```
balance(d) − balance(d−7)  ==  Σ transactions with value_date in (d−7, d]
```

**The delta gets a tolerance and a diagnosis.** A non-zero delta is not "unreconciled" — it is
localized and described: *"We appear to be missing one transaction of about ₪840, somewhere between
the 11th and the 14th, on Isracard."* Deltas under ₪5 or 0.1% of window volume are absorbed as
rounding and not reported. A delta that resolves itself on the next run (a late-posting
transaction) is never surfaced at all.

Monthly reconciliation rolls up the windowed checks. A month with an unresolved delta is
unreconciled, and every figure derived from it carries that label.

## 4. Categorization

Merchant-level. Order: confirmed merchant → rule → LLM (novel merchants only) → `Other`.

### 4.1 The merchant category is a default, not a verdict *(new — mandate 5)*

Round 3 made the confirmed merchant *be* the category, which is wrong for exactly the merchants
that matter most. Shufersal and Rami Levy are a fifth of the household's spending, confirmed as
"Groceries" in twenty taps — and then the ₪800 barbecue, the school supplies and the toys are
Groceries forever, invisibly, in both drift baselines. Stable misclassification is the worst kind:
drift can't catch it either, because it's baked into both sides.

- **Per-transaction override**, one tap from the transaction list. The merchant default stands
  until a transaction says otherwise.
- **Amount-band rules** for merchants where the band is meaningful: *Shufersal under ₪250 →
  Groceries; over ₪250 → ask once, then remember the band.* Bands are created by the app when it
  notices a merchant's amounts are bimodal, and confirmed by the household in the weekly queue.
- **Explainability counts the two claims differently** (§4.3): "this merchant is usually X" and
  "this transaction is X" are not the same assertion and are no longer scored as one.

### 4.2 The queue is a budget

**12 items per week**, ranked by `|amount| × uncertainty`. Below the line is auto-assigned and
never shown. A skipped week does not compound. Link questions outrank category questions.

### 4.3 Explainability, split *(rewritten)*

Two numbers, both on the dashboard and in the monthly close:

- **Explained %** — share of the month's expense in a category the household confirmed **for that
  transaction or for its amount band.** The strong claim.
- **Attributed %** — share in a category inherited from a merchant default. The weaker claim.

Target: explained + attributed ≥ 95%, with `Other` the remainder. Below that, the monthly digest
**leads** with it and says plainly what share of the month it cannot explain. The escalation does
**not** enlarge the weekly queue — punishing a busy week with more work is how the app loses the
one person doing it.

## 5. Reaching the second user

Home-network-only constrains **inbound** access; it says nothing about outbound. The app is not a
place you go, it is something that arrives.

### 5.1 The digest earns each send — and can carry good news *(rewritten — mandate 4)*

Round 3's trigger list contained five conditions and all five were problems. On the most
emotionally loaded subject in most households, an app structurally incapable of good news gets
muted from **aversion**, which is faster than boredom and much harder to undo.

The weekly message sends when any condition fires, and the set is now two-sided:

| | Condition | Threshold |
|---|---|---|
| ⚠ | Unusually expensive week | > 1.5σ above trailing 13-week mean |
| ⚠ | New drift flag | see §6 |
| ⚠ | Reconciliation delta unresolved | beyond §3.6 tolerance |
| ⚠ | Account gone dark | stale > 10 days |
| ⚠ | Explained + attributed fell | < 95% |
| ✓ | **Unusually inexpensive week** | > 1.0σ **below** trailing 13-week mean |
| ✓ | **A drift flag closed** | a category returned to its baseline |
| ✓ | **Explainability recovered** | back above 95% after being under |

The good-news bar is deliberately **lower** (1.0σ vs 1.5σ). A household that has never tracked
anything needs to hear that something went right more than it needs another warning.

Otherwise: **silence**, which is information and costs no credibility.

The **monthly close always sends**, reports how many quiet weeks there were so silence reads as
*nothing happened* rather than *it broke* — and **leads with the good news when there is any.**

### 5.2 Repeat alerts decay *(new — mandate 4)*

A dark account is not new news in week three. Every recurring condition fires **once**, then goes
quiet and is carried as standing state in the monthly close until it resolves. The app's response
to a person being busy must never be to message them weekly about being busy.

This applies to assisted-mode OTP prompts, dark accounts, unresolved reconciliation deltas, and
sub-95% explainability alike.

### 5.3 The message stands alone

A message that deep-links to a home-network-only app is useless everywhere except the house —
which is most of the time, and certainly the Sunday morning she is finally curious. **Every message
carries its own answer:** the numbers, the comparison, the named category, the plain sentence. The
link is an optional "there's more at home", never the payload.

### 5.4 What this costs in privacy, stated plainly

§5.1 sends household financial aggregates to a Telegram bot. **This partially overturns frozen
decision #2**, and is named rather than slipped in.

- **Payload:** weekly/monthly totals, up to three category names with shekel figures, one sentence.
  Never transactions, merchants, account names, balances or identifiers.
- **What an attacker learns** from a year of that history: a longitudinal profile of total spending
  and rough category mix. Not who you bank with, not what you bought, not your balances. Enough to
  know roughly what goes out, not enough to transact.
- **Retention is not ours to promise.** The bot can delete its own messages; server-side copies are
  outside our control. We do not claim a policy we cannot enforce.
- **Token isolation:** the bot token lives in a separate keychain entry under a separate service
  name from the bank credentials. Compromise of the messaging path must not reach the money path.
- **Email over the household's own SMTP** is offered to anyone who reads the above and declines.

## 6. Drift, and an honest answer before it *(rewritten — mandate 4)*

**True drift:** trailing 3-month mean vs. prior 3-month mean; flag at > 15% **and** > ₪200/month.
Gated: no number unless both windows cover whole months over a **stable account set**, because
backfill windows differ by institution and an ungated comparison reports a card's history starting
as a change in behaviour.

That gate is correct and it means true drift is silent until roughly **month nine**. Job 2 of two
cannot go unanswered for most of the first year in a household that has already failed to sustain
a spreadsheet.

**So there are two signals, named differently, and the difference is never blurred:**

| | Available | Says |
|---|---|---|
| **This month vs. last** | Month 2 | *"Eating out was ₪610 more than last month. That's one month, not a trend."* |
| **Drift** | ~Month 9 | *"Eating out has been running ₪480/month above your baseline since the spring."* |

The interim signal is never labelled drift, never asserts a trend, and always carries its own
caveat. When the gate finally opens, **that is itself an event worth a message** — the app has
graduated from describing months to describing the household.

## 7. Security

- **Bank credentials in the OS keychain.** Never `.env`, never the filesystem, never the repo.
  Requested at run time, held in memory only.
- **A real certificate, via DNS-01 — no private CA** *(rewritten — mandate 2)*. Round 3 proposed
  installing an `mkcert`-style root CA on both phones. That does not scope to this app: a trusted
  root can vouch for **any** domain, and its key would sit on the same box as the bank credentials —
  turning a compromise of the Mac mini into a persistent MITM position against both people's entire
  phone traffic, their banking apps included. Strictly larger blast radius than the plaintext
  passcode it was meant to fix.

  Instead: a real certificate for a real subdomain, issued via a **DNS-01 challenge**, with the
  public DNS A record pointing at the LAN address. Nothing inbound is ever exposed, the challenge
  is answered over DNS, and both phones trust it because it is genuinely trusted. Renewal is
  automated and monitored as a first-class job — a cert that silently expires takes the app down
  quarterly.
- **A shared household passcode.** The house network has a smart TV, a printer, and every guest who
  ever had the WiFi password. The network is not a perimeter.
- **Descriptors are hostile data.** Anyone can put an instruction in a merchant descriptor for ₪3.
  Two defences, both required: descriptors travel as data in a structured field, never interpolated
  into instruction position; and the categorizer's output is constrained to **one value from the
  category enum**, so a successful injection has no channel to express anything through.
- **No write path to any institution.** Scrapers are read-only by construction.

## 8. Agents — two, and what they cost *(cost section new — mandate 4)*

**Categorizer.** Trigger: an unseen merchant after a scrape. Unattended. Writes back a confirmed
merchant default. **Drift Analyst.** Trigger: monthly close, subject to §6's gate. Pure arithmetic —
**no LLM at all**, which is worth stating because it means the app's headline feature has zero
inference cost and zero inference risk.

### 8.1 The number, finally

Deferred twice; here it is. The Categorizer is the only LLM workload in the app.

- **Cold start:** ~120 novel merchants, batched 20 per call → 6 calls. Each call is roughly 800
  input tokens (the category enum, the instruction, 20 Hebrew merchant strings with amounts) and
  ~150 output tokens (structured labels). **≈ 4,800 input / 900 output, once.**
- **Steady state:** 10–15 genuinely new merchants a month → **one call a month**, ~800 in / 150 out.
- **Year one total:** ≈ **14,400 input / 2,700 output tokens.**

| Model | Input $/MTok | Output $/MTok | Year-one cost |
|---|---:|---:|---:|
| `claude-haiku-4-5` | $1 | $5 | **≈ $0.03** (₪0.11) |
| `claude-sonnet-5` | $2 | $10 | ≈ $0.06 (₪0.21) |
| `claude-opus-5` | $5 | $25 | **≈ $0.14** (₪0.52) |

**The finding that changes the design: cost is not a variable here.** Fourteen thousand tokens a
year is a rounding error against a household that is trying to find ₪280/month. The rules-first
architecture the household chose in stage 1 didn't just reduce exposure — it reduced spend to
nothing.

So **choose the model on quality, not price**, and the quality bottleneck is unambiguous:
understanding abbreviated, inconsistently-transliterated **Hebrew merchant descriptors**. Spec:
`claude-opus-5`, at fifty agorot a year. Batch API's 50% discount and prompt caching are both
declined — they halve a number that is already noise, in exchange for latency and complexity.

## 9. Freshness

Every account carries `synced_through`. Every aggregate inherits the **oldest** freshness among its
inputs and shows it next to itself: *"₪14,200 — Leumi last synced 8 days ago."* Stale past 3 days;
presented as broken past 10, at which point the digest leads with that instead of numbers — once,
per §5.2.

## 10. Hebrew and RTL are requirements, not a localization pass *(new — mandate 3)*

Every merchant descriptor out of Leumi, Isracard and Max is Hebrew. Every amount is Latin numerals.
Every one of those strings is **bidirectional**, and bidi is where naive interfaces break:
parentheses land on the wrong side, trailing punctuation jumps to the front, and truncation cuts
from the wrong end.

- **Interface language is Hebrew, layout direction RTL**, with an English toggle. Reasoning: the
  data is Hebrew, the digest goes to both adults, and an English shell around Hebrew content is the
  worst of both. The toggle exists because the household is bilingual; the default is not.
- **Bidi-safe rendering is a requirement on every merchant string** — explicit direction isolation
  on every interpolated descriptor, truncation from the logical end, and numerals that stay legible
  in an RTL row.
- **§4.2's twenty-merchant confirmation is the first real screen anyone touches** and is entirely
  Hebrew content. It is specified in RTL from the start, not adapted to it.

### 10.1 The categories, named

**Transfers is no longer a category** — internal movement is a `flow_class` (§3.1), and having it
in the taxonomy too was a leftover that let real spend hide in it. Thirteen leaves:

דיור · מזון · מסעדות · תחבורה · רכב · חשבונות · בריאות · ילדים · קניות · פנאי · נסיעות · שירותים · אחר

*(Housing · Groceries · Eating out · Transport · Car · Utilities · Health · Kids · Shopping ·
Leisure · Travel · Services · Other)*

## 11. The first run

Round 2 aimed the app's moment of maximum enthusiasm at the emptiest screen it would ever render.
Inverted: **night one has twelve months of backfilled history**, which is genuinely interesting
material the spec was treating as nothing.

After the twenty-merchant confirmation, setup ends on **"השנה האחרונה שלכם"** — your last twelve
months:

- Total in, total out, and what was left — the first time either of them has seen that number.
- The twelve-month category mix.
- The single largest expense of the year, named.
- The merchant visited most, and what it cost in total.
- Twelve monthly bars, so the shape of the year is visible at a glance.

None of it needs the current month, perfect categorization, or drift eligibility. It exists at
minute forty of setup and it is the strongest thing the app will say all year.

## 12. The dashboard answers one question

Not "show everything" — **"why did the message say that?"** One screen:

- **The hero is the delta, not the total.** Nobody knows whether ₪19,400 is good. The largest
  element is **"₪1,400 מעל הרגיל שלכם"** — above your normal — in one colour, readable across the
  room. Where no baseline exists yet, the hero is the twelve-month retrospect, never a naked total.
- Beneath it: the three categories that moved most, with shekel deltas.
- Beneath that: the transactions behind whichever you tap, with one-tap category override (§4.1).
- Persistent in the corner: freshness, reconciliation status, explained % and attributed %. The
  app's four admissions, always visible, never buried.

Everything else — full search, month history, merchant management — lives behind a single
"everything else" route and is not part of the primary experience.

## 13. Stack

Node/TypeScript, SQLite, Next.js, Tailwind, `docker compose up` on a Mac mini or NAS. Scrapers run
as a separate process from the web app. Credentials via OS keychain, separate service entries for
bank credentials, the bot token, and the DNS provider token used for cert renewal.

## 14. Rollout

1. Ingestion, ledger, flow classification, supersede, windowed reconciliation.
2. Merchant categorization, amount bands, the twenty-merchant onboarding.
3. The twelve-month retrospect.
4. The digest, with both trigger classes and decay.
5. The dashboard.
6. Month-over-month interim signal; then drift behind its gate.
