# Round 6 — Product spec: **Kupa**

*Stage 2, round 6 — the confirmation round. Complete artifact, rewritten against `05-mandate.md`.
Five bounded fixes, no new scope.*

---

## 1. The job

Two adults, one joint pot, Israeli banks, one machine at home.

1. **Where did we land this month.**
2. **Is our normal getting more expensive.**

Out and staying out: subscription hunting, fee alerts, splitting, per-person budgets, net worth,
investments, goals, streaks.

**Three governing principles**, each earned by a round of this gauntlet:

- **Silence over wrongness** — and the app must be capable of saying something *good*, or silence is
  all it will ever be permitted to say.
- **Nothing waits on everything** — no stage of setup, and no person in the household, waits for the
  whole thing to be finished before getting something real.
- **Admit what you cannot prove** — freshness, reconciliation coverage, and explainability are shown,
  not buried, because the app's credibility is the product.

## 2. Setup ships value at every stage

| Stage | Time | What you do | What you get |
|---|---|---|---|
| **1** | ~20 min | `docker compose up`; **one** account from an exported file — no credentials; confirm 20 merchants | **The twelve-month retrospect (§11).** The number neither of you has ever seen. Plain HTTP on the LAN. |
| **2** | +15 min | Connect remaining accounts; discover each one's sync mode | It stays current without you. Nightly, unattended. |
| **3** | +10 min | Create the bot, paste the token, **pin the two chat IDs** | It reaches both of you, and answers back (§5). |
| **4** | +30 min *(optional, needs a domain)* | DNS-01 certificate and automated renewal | The passcode stops crossing the house network in the clear. |
| **5** | as needed | Assisted-mode accounts, amount bands, overrides | The long tail. |

Stage 1 requires no credentials, no domain, no bot and no scraper. The fastest path to the app's
strongest moment must not pass through its hardest step.

**Stated in the app, not hidden:** between stages 1 and 4 the household passcode crosses the LAN in
the clear. The settings screen says so in one line, with the stage-4 link. An accepted, temporary,
*declared* risk.

### 2.1 Stage 1 survives real Israeli bank exports *(new — mandate 3)*

"A CSV export is enough" is where the staging strategy would have died. Leumi hands you an `.xls`
that is really HTML. Isracard uses Hebrew column headers in a non-UTF-8 encoding. Max puts three
junk rows above the data. Cal's format depends on which report you picked. None agree on date
format or on whether an expense is negative. An unparseable file at step one of stage one is worse
than one at step four — it bounces the household off before they have seen anything good.

- **Named parsers** for the institutions this household actually uses, listed explicitly, each with
  a fixture file in the test suite.
- **A column-mapping fallback** behind them for everything else: show the first five rows, let the
  user say which column is date, amount and description, detect the sign convention from the data,
  and remember the mapping per institution.
- Encoding detection with an explicit override; `.xls`-that-is-HTML sniffed by content, not
  extension.

An unparseable file costs thirty seconds, not an evening.

## 3. Ledger

Integers in agorot. No floats near money.

**§3.1 Flow classification.** Every transaction resolves to `expense`, `income` or `internal`; only
the first two reach totals. Card settlement matching keys on the **statement total the issuer
reports** (`Statement` is a first-class entity), never the sum of purchases, which won't agree once
foreign currency is involved. Own-account matching is **directional** — a real internal transfer has
a counterparty we own, registered at setup; identity matches, amount corroborates.

**§3.2 Ambiguity is never resolved by picking.** Fallback matching (opposing sign, equal amount,
3-day window) applies **only when exactly one candidate fits**; two or more produce a **link
question**. The asymmetry: a double-count is implausibly large and gets noticed; an over-match
deletes real spending, and an under-count is invisible. When in doubt, count it as spend and ask.

**§3.3 Pending → settled supersede,** keyed on `account + normalized merchant + date within 5 days`,
never on external id — institutions reissue identifiers and amounts change on settlement (₪400
pre-auth settles at ₪460). Ambiguity → link question.

**§3.4 Foreign currency.** Store `original_amount`, `original_currency`, `billed_amount`; only
`billed_amount` enters totals.

**§3.5 Refunds and restatement.** A credit matching a prior purchase appears in cash flow in the
month it moved, and is attributed to the purchase's month for drift baselines. A closed month can
therefore be **restated** — flagged, delta recorded, named in one line of the next monthly digest.
The app never silently changes a number it has already told you.

### 3.6 Reconciliation — method, resolution, and coverage

**The method.** Every transaction stores `booking_date` and `value_date`. Reconciliation runs on
`value_date`, because that is what the balance moves on; everything the household *sees* uses
`booking_date`, because that is the day they remember. Israeli banks post on a value date
(תאריך ערך) that routinely differs from the booking date — the reason a naive daily check can never
pass.

```
balance(d) − balance(d−7)  ==  Σ transactions with value_date in (d−7, d]
```

**The resolution.** A failing window localizes a discrepancy to **seven days, not three.** Where
consecutive overlapping windows disagree, their intersection narrows it and the app reports the
narrowed range — real work, not an assumed claim. Otherwise it says seven days. It never states a
range tighter than its evidence: the first time someone searches a claimed range and finds nothing,
the diagnosis loses the credibility it exists to have.

**Tolerance.** Deltas under ₪5 or 0.1% of window volume are absorbed as rounding. A delta that
resolves on the next run — a late-posting transaction — is never surfaced.

**The gap case.** Missing snapshots (machine off) → the check runs across the actual
snapshot-to-snapshot span and reports its resolution as that span's real length. A 23-day gap yields
a 23-day localization, stated as such. Degraded, not disguised.

**Late deltas are restatements.** A delta against an already-closed month routes into §3.5's
restatement path. These two mechanisms are one mechanism.

#### 3.6.1 Coverage is explicit *(new — mandate 4)*

Reconciliation compares institution-reported balance snapshots on successive runs. That works for
`unattended` accounts. It does **not** work for `import` accounts — a file carries transactions, not
a balance feed. And `assisted` accounts sync monthly, so their localization is thirty days, which is
not reconciliation in any useful sense.

Stage 1 is entirely `import`. So the app's first and strongest experience rests on a structurally
unreconcilable account, and round 5 showed a reassuring status indicator over it.

- Coverage is reported in aggregate, wherever reconciliation status appears:
  **"מאומת: 2 מתוך 4 חשבונות · 78% מההוצאה החודש"** *(reconciled: 2 of 4 accounts, 78% of this
  month's spend)*.
- An `import` account is labelled **unreconcilable**, not silently uncovered. An `assisted` account
  is labelled with its real 30-day resolution.
- The number that matters is **share of spend covered**, not share of accounts — one unreconciled
  card can be most of the money.

## 4. Categorization

Merchant-level. Order: confirmed merchant → rule → LLM (novel merchants) → `Other`.

**§4.1 The merchant category is a default, not a verdict.** Per-transaction override, one tap from
the transaction list. **Amount-band rules** where the band is meaningful (*Shufersal under ₪250 →
מזון; over → ask once, then remember*), proposed by the app when a merchant's amounts are bimodal,
confirmed in the weekly queue. Without this the ₪800 barbecue is groceries forever, in both drift
baselines — and stable misclassification is the worst kind, because drift can't catch it either.

**§4.2 The queue is a budget.** 12 items/week, ranked by `|amount| × uncertainty`. Below the line is
auto-assigned and never shown. A skipped week does not compound. Link questions outrank category
questions.

**§4.3 Explainability, split.** **Explained %** — confirmed for that transaction or its amount band,
the strong claim. **Attributed %** — inherited from a merchant default, the weaker one. Target:
explained + attributed ≥ 95%. Below it, the monthly digest **leads** with what share of the month it
cannot explain. The escalation deliberately does **not** enlarge the weekly queue — punishing a busy
week with more work is how the app loses the one person doing it.

**§4.4 Inference is free, so stop rationing it.** §8.1 puts a year of inference at a few shekels, so
the "novel merchants only" rule is inherited from a cost model that no longer exists — and it
applies precisely where errors concentrate: the first pass over 120 abbreviated,
inconsistently-transliterated Hebrew merchant names, whose mistakes then persist forever as
confirmed defaults. **Annual re-verification of the entire merchant table** (about four agorot);
disagreements become queue items ranked by volume, never applied silently. **The household's
correction rate is a quality signal** — a rising rate means the categorizer has drifted from how they
actually think about their money; it triggers re-verification early and is reported in the monthly
close.

## 5. Reaching the second user

Home-network-only constrains **inbound** access; it says nothing about outbound. The app is not a
place you go, it is something that arrives.

### 5.1 The digest earns each send, and can carry good news

| Tier | | Condition | Threshold |
|---|---|---|---|
| chore | ⚠ | Unusually expensive week | > 1.5σ above trailing 13-week mean |
| chore | ⚠ | New drift flag | §6 |
| chore | ⚠ | Account gone dark | stale > 10 days |
| chore | ⚠ | Explained + attributed fell | < 95% |
| chore | ⚠ | Reconciliation delta unresolved | beyond §3.6 tolerance |
| **broken** | ⛔ | Self-check failed | §9.1 |
| | ✓ | Unusually inexpensive week | > **1.0σ** below trailing 13-week mean |
| | ✓ | A drift flag closed | a category returned to baseline |
| | ✓ | Explainability recovered | back above 95% |

The good-news bar is deliberately **lower** than the bad-news bar. A household that has never
tracked anything needs to hear that something went right more than it needs another warning.
Otherwise: **silence.**

The **monthly close always sends**, reports how many quiet weeks there were so silence reads as
*nothing happened* rather than *it broke*, and **leads with the good news when there is any.**

### 5.2 Decay has a severity tier *(rewritten — mandate 1)*

Round 5 built decay for nags and then routed the health self-check through it. So an expired
certificate would fire once and become a monthly line item while the app kept cheerfully sending
totals from data that had stopped updating — and a second failure the following week would decay
the same way, leaving two dead subsystems behind two already-scrolled-past notifications.

- **Chores decay.** Fire once, then carry as standing state in the monthly close until resolved.
  A dark account in week three is not news.
- **Broken does not decay.** Certificate expired, scrapers dead, jobs failing, database or disk
  failing: **re-stated on every send, leading the message**, until fixed. An outage is not a nag and
  the household must be unable to miss it.

### 5.3 The message stands alone

A deep link into a home-network-only app is useless everywhere except the house — and certainly on
the Sunday morning she is finally curious. Every message carries its own answer: the numbers, the
comparison, the named category, the plain sentence. The link is an optional "there's more at home",
never the payload.

### 5.4 She can answer back

The bot channel accepts replies. The app **polls** Telegram outbound, so this opens **no inbound
port** and costs nothing against frozen decision #7.

*"what was the ₪1,200 on the 14th"* · *"how much did we spend on מסעדות last month"* ·
*"why did you say we're above normal"* — each answered in the channel, in seconds, from anywhere.

Constraints, all hard:

- **Sender allowlist** *(new — mandate 2)*. The two household `chat_id`s are pinned at stage 3;
  every other sender is dropped silently, with no reply and no error. Telegram bots are reachable by
  anyone who finds the handle, and without this every privacy control in §5.6 is moot because the
  query interface would talk to strangers.
- **Reads only.** No categorization changes, no overrides, no settings, no money. There is no write
  path from this channel into the ledger, let alone into an institution.
- **How a question becomes a query, stated precisely** *(new — mandate 2)*: the model maps the
  question to a **fixed set of intents with an enumerated parameter schema** (date range, category,
  merchant, amount bound). That output is **validated against the schema before it reaches the query
  layer**, and anything failing validation is refused, not repaired. The query itself is
  parameterized and built by code. The model never writes SQL and never touches the database.
- **Figures are verbatim** *(new — mandate 5)*. Amounts, dates, merchant names and counts are
  **inserted from the selected rows**, never generated. The model supplies only the framing around a
  templated numeric spine. The second user has no dashboard to check against, so a confidently wrong
  number in that channel is the worst failure available to this app.
- **Every question is acknowledged** *(new — mandate 5)*. Five rounds trained the household to read
  silence as *nothing happened*; silence must never be a possible response to a direct question. The
  bot acknowledges on receipt, then answers — so an asleep machine or a wedged process reads as
  broken rather than as reassurance.
- **Volume is instrumented.** Question counts are logged so §8.1's estimate becomes a measurement.
- **Descriptors remain hostile data** (§7), inherited in full.
- **One shared channel.** Fully joint household, frozen decision #5 — nothing to partition.

### 5.6 What this costs in privacy, stated plainly

§5.1 sends household financial aggregates to a Telegram bot. **This partially overturns frozen
decision #2**, and is named rather than slipped in.

- **Payload:** weekly/monthly totals, up to three category names with shekel figures, one sentence.
  Never account names, balances or identifiers. §5.4's answers add merchant names and single
  transaction amounts, on request only.
- **What an attacker learns** from a year of that history: a longitudinal profile of total spending
  and rough category mix. Not who you bank with, not your balances. Enough to know roughly what goes
  out, not enough to transact.
- **Retention is not ours to promise.** The bot can delete its own messages; server-side copies are
  outside our control. We do not claim a policy we cannot enforce.
- **Token isolation:** the bot token lives in a separate keychain entry under a separate service name
  from the bank credentials. Compromise of the messaging path must not reach the money path.
- **Email over the household's own SMTP** is offered to anyone who reads the above and declines.

## 6. Drift, and an honest answer before it

**True drift:** trailing 3-month mean vs. prior 3-month mean; flag at > 15% **and** > ₪200/month.
**Gated:** no number unless both windows cover whole months over a **stable account set** — backfill
windows differ by institution, and an ungated comparison reports a card's history starting as a
change in behaviour.

That gate keeps drift silent until roughly **month nine**, and job 2 of two cannot go unanswered for
most of the first year. So there are two signals, named differently, never blurred:

| | Available | Says |
|---|---|---|
| **This month vs. last** | Month 2 | *"Eating out was ₪610 more than last month. That's one month, not a trend."* |
| **Drift** | ~Month 9 | *"Eating out has been running ₪480/month above your baseline since the spring."* |

The interim signal is never labelled drift and always carries its caveat. When the gate opens, that
is itself an event worth a message — the app has graduated from describing months to describing the
household.

## 7. Security

- **Bank credentials in the OS keychain.** Never `.env`, never the filesystem, never the repo.
  Requested at run time, held in memory only.
- **A real certificate via DNS-01 — no private CA.** An `mkcert`-style root on both phones does not
  scope to this app: a trusted root vouches for any domain, and its key would sit beside the bank
  credentials, turning one compromised Mac mini into a persistent MITM position against both
  people's entire phone traffic. Instead a real certificate for a real subdomain, DNS-01 challenge,
  public A record pointing at the LAN address, nothing inbound exposed. *(Stage 4 — optional,
  deferred, not a setup blocker.)*
- **The ACME credential is scoped to one name.** A zone-wide DNS token beside the bank credentials
  could issue certificates for the whole domain and rewrite its MX records — redirecting the
  household's email and password-resetting through everything they own. Scope to `_acme-challenge`,
  or `CNAME`-delegate to a throwaway zone.
- **Every credential is the narrowest one that does the job.** Applied four times: scrapers
  read-only, bot token isolated, DNS token scoped to one record, bot senders allowlisted.
- **A shared household passcode.** The house network has a smart TV, a printer, and every guest who
  ever had the WiFi password. The network is not a perimeter.
- **Descriptors are hostile data.** Anyone can put an instruction in a merchant descriptor for ₪3.
  Three defences: descriptors travel as data in a structured field, never interpolated into
  instruction position; the categorizer's output is constrained to **one value from the category
  enum**; and §5.4's intent output is schema-validated before it reaches the query layer. A
  successful injection has no channel to express anything through.
- **No write path to any institution.** Scrapers are read-only by construction.

## 8. Agents — three

**Categorizer.** Trigger: an unseen merchant after a scrape, or annual re-verification (§4.4).
Unattended. Writes back a merchant default.

**Drift Analyst.** Trigger: monthly close, subject to §6's gate. **Pure arithmetic — no LLM at
all**, so the headline feature carries zero inference cost and zero inference risk.

**Answerer.** Trigger: an allowlisted household member replying in the bot channel. Phrases framing
around a templated numeric spine, over rows selected deterministically. It is a chat box, and every
previous round cut chat boxes; it earns its seat on one ground the cut ones could not claim — **it
is the only interface the second user will ever have.** Delete it and she returns to being a
spectator.

### 8.1 What the agents cost

| Workload | Volume | Tokens/yr |
|---|---|---|
| Categorizer — cold start | ~120 merchants, batched 20/call | 4,800 in / 900 out |
| Categorizer — steady state | 10–15 new merchants/month | 9,600 in / 1,800 out |
| Categorizer — annual re-verification | ~6 calls | 4,800 in / 900 out |
| Answerer | ~10 questions/month *(now instrumented)* | 144,000 in / 24,000 out |
| Drift Analyst | arithmetic | **0** |
| **Total** | | **≈ 163,000 in / 27,600 out** |

| Model | Input $/MTok | Output $/MTok | Year-one cost |
|---|---:|---:|---:|
| `claude-haiku-4-5` | $1 | $5 | ≈ $0.30 (₪1.10) |
| `claude-sonnet-5` | $2 | $10 | ≈ $0.60 (₪2.20) |
| `claude-opus-5` | $5 | $25 | **≈ $1.51 (₪5.60)** |

**Cost is not a variable here** — under six shekels a year at the top of the range, for a household
trying to find ₪280 a month. So **choose on quality**, and the bottleneck is unambiguous:
understanding abbreviated, inconsistently-transliterated **Hebrew merchant descriptors**. Spec:
`claude-opus-5`. Batch API's 50% discount and prompt caching are declined — they halve a number that
is already noise, in exchange for latency and complexity.

## 9. Freshness and health

Every account carries `synced_through`. Every aggregate inherits the **oldest** freshness among its
inputs and shows it next to itself: *"₪14,200 — לאומי סונכרן לפני 8 ימים."* Stale past 3 days;
presented as broken past 10.

### 9.1 One nightly self-check, on the channel that survives

Three dependencies fail on independent clocks: pinned scrapers when a bank redesigns, the
certificate every ninety days, and the OS update that moves Node or breaks headless Chromium. The
failure that exposes them: the certificate expires while he's abroad, the web app becomes
unreachable on both phones, and **the digest keeps sending perfectly** because it is outbound and
touches no certificate. The app is half-dead and its only voice is the healthy half.

A **nightly self-check** covers scraper liveness per institution, certificate expiry runway, last
successful run of every job, database integrity and free disk — reported through the **outbound
digest**, the one surface that survives every failure it covers, at the **broken** severity tier
(§5.2), which does not decay. *Health belongs on the channel that cannot break for the same reasons
the app can.*

## 10. Hebrew and RTL are requirements

Every merchant descriptor from Leumi, Isracard and Max is Hebrew; every amount is Latin numerals;
every such string is **bidirectional**, and bidi is where naive interfaces break — parentheses on
the wrong side, trailing punctuation jumping to the front, truncation cutting the wrong end.

- **Interface language Hebrew, layout RTL**, with an English toggle. The data is Hebrew and the
  digest goes to both adults; an English shell around Hebrew content is the worst of both. The
  toggle exists because the household is bilingual; the default is not.
- **Direction isolation on every interpolated descriptor**, truncation from the logical end,
  numerals legible in RTL rows.
- **§4.2's twenty-merchant confirmation** is the first real screen anyone touches, is entirely
  Hebrew, and is specified in RTL from the start rather than adapted to it.

**§10.1 The categories.** Transfers is not a category — internal movement is a `flow_class` (§3.1),
and keeping it in the taxonomy let real spend hide in it. Thirteen leaves:

דיור · מזון · מסעדות · תחבורה · רכב · חשבונות · בריאות · ילדים · קניות · פנאי · נסיעות · שירותים · אחר

## 11. The first run

Night one has twelve months of backfilled history — genuinely interesting material that early drafts
treated as nothing while aiming the app's moment of maximum enthusiasm at a four-day partial month.

After the twenty-merchant confirmation, setup ends on **"השנה האחרונה שלכם"**: total in, total out
and what was left — the first time either of them has seen that number; the twelve-month category
mix; the largest single expense of the year, named; the merchant visited most and its total; and
twelve monthly bars so the shape of the year is visible at a glance.

None of it needs the current month, perfect categorization, or drift eligibility. It exists at minute
twenty of stage 1 and it is the strongest thing the app will say all year.

## 12. The dashboard answers one question

Not "show everything" — **"why did the message say that?"**

### 12.1 The hero is composed, not interpolated

`₪1,400 מעל הרגיל שלכם` as an interpolated string is the exact bidi case §10 forbids, on the biggest
text on the most important screen. The hero is a **composed element**: an amount component (sign, ₪,
digits, explicit direction isolation, its own layout box) and a label component beneath it, laid out
by the container rather than by string order. Mocked in both languages before it is built.

### 12.2 Two designed states, distinguished by four channels *(rewritten — mandate 5)*

The app had one designed emotional state and it was bad. A household that has never tracked anything
and finally comes in **under** its baseline should feel it — not read the same treatment with a minus
sign, which registers as a smaller failure.

Round 5 named the states "warning tone" and "affirming tone," which is not a specification. The
obvious pair is red/green, and it is the worst available answer: roughly one man in twelve is
red-green colour deficient, and in a two-adult household those odds are not small. If the states
differ **only by hue**, the app's most important screen conveys nothing to that reader.

**The pair is blue ↔ red**, a diverging warm/cool pair, validated rather than eyeballed:

| | Above normal | Below normal |
|---|---|---|
| Colour (light surface `#fcfcfb`) | `#e34948` | `#2a78d6` |
| Colour (dark surface `#1a1a19`) | `#e66767` | `#3987e5` |
| Glyph | ▲ | ▼ |
| Sentence | which categories drove it | **what you did differently** — the categories that fell |
| Follow-through | the transactions behind it | the same, framed as what to keep doing |

Validator results (OKLab ΔE ×100, target ≥ 8 for CVD, ≥ 15 normal-vision):

| Mode | Protan ΔE | Tritan ΔE | Normal ΔE | Contrast | Result |
|---|---:|---:|---:|---|---|
| Light | **21.6** | 34.5 | 32.3 | ≥ 3:1 | all six checks PASS |
| Dark | **19.2** | 31.4 | 29.0 | ≥ 3:1 | all six checks PASS |

Both states carry **four** distinguishing channels — hue, glyph, sentence and follow-through — so
hue never carries the meaning alone. Where no baseline exists yet, the hero is the twelve-month
retrospect, never a naked total, because nobody knows whether ₪19,400 is good.

### 12.3 Status indicators, never colour alone

The persistent corner carries the app's four admissions — freshness, reconciliation coverage
(§3.6.1), explained % and attributed %. Each uses the fixed status palette, **always with an icon
and a label**: good `#0ca30c` · warning `#fab219` · serious `#ec835a` · critical `#d03b3b`. Warning
and serious sit below 3:1 on the light surface by design; the icon-and-label pairing is the
mitigation, and it is not optional. These steps are deliberately distinct from the delta pair so a
status colour never impersonates the hero.

### 12.4 The twelve-month bar

Single series, so **no legend** — the title names it. Sequential blue (`#2a78d6` light / `#3987e5`
dark). Thin marks with 4px rounded data-ends anchored to the baseline, a 2px surface gap between
adjacent bars, recessive hairline gridlines (`#e1e0d9` / `#2c2c2a`) and axis (`#c3c2b7` / `#383835`).
Direct labels are **selective**, never a number on every bar. Per-bar hover tooltip. Values and
labels wear text tokens (`#0b0b0b` / `#ffffff` primary, `#52514e` / `#c3c2b7` secondary), never the
series colour. A table view exists.

### 12.5 The rest of the screen

Beneath the hero: the three categories that moved most, with shekel deltas. Beneath that: the
transactions behind whichever you tap, with one-tap category override (§4.1). Everything else — full
search, month history, merchant management — lives behind a single "everything else" route and is
not part of the primary experience.

## 13. Stack

Node/TypeScript, SQLite, Next.js, Tailwind, `docker compose up` on a Mac mini or NAS. Scrapers run as
a separate process from the web app. Keychain entries, separately scoped: bank credentials, bot
token, DNS challenge token.

`israeli-bank-scrapers` is **pinned and vendored** — it is a volunteer project and the household's
financial visibility must not depend on a stranger's free evenings. The written failure procedure
lives in the repo and is linked from the app: when a scraper breaks and no fix is coming, the account
demotes to `import`, the app says so once, and the monthly close carries the standing state. The
household loses automation, never data.

## 14. Rollout

1. Ingestion, ledger, flow classification, supersede, windowed reconciliation with §3.6.1 coverage.
2. File parsers and the column-mapping fallback (§2.1).
3. Merchant categorization, amount bands, the twenty-merchant onboarding.
4. The twelve-month retrospect — **this completes stage 1 and is the first shippable product.**
5. The digest: both trigger classes, both severity tiers, the §9.1 self-check.
6. The reply channel (§5.4), allowlisted and templated.
7. The dashboard, both states, validated palette.
8. Month-over-month interim signal; then drift behind its gate.
