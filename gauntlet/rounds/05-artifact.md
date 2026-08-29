# Round 5 — Product spec: **Kupa**

*Stage 2, round 5. Complete artifact, rewritten against `04-mandate.md`. Theme of this round:
stop withholding value.*

---

## 1. The job

Two adults, one joint pot, Israeli banks, one machine at home.

1. **Where did we land this month.**
2. **Is our normal getting more expensive.**

Out and staying out: subscription hunting, fee alerts, splitting, per-person budgets, net worth,
investments, goals, streaks.

**Two governing principles:**

- The app must be more willing to be silent than to be wrong — *and* capable of saying something
  good, or silence is all it will ever be permitted to say.
- **Nothing waits on everything.** No stage of setup, and no person in the household, is made to
  wait for the whole thing to be finished before getting something real.

## 2. Setup ships value at every stage *(rewritten — mandate 1)*

Round 4's setup required Docker, credentials for three to six institutions, a domain the household
had to own, a DNS token, ACME issuance, a bot token and three keychain entries — an evening's work
that could stall for two days waiting on DNS, where abandoning at 80% gave nothing at all. The app
became the project instead of fixing the problem.

Staged. Each stage is independently useful and none is a prerequisite for the value of the one
before it.

| Stage | Time | What you do | What you get |
|---|---|---|---|
| **1** | ~20 min | `docker compose up`; **one** account — a CSV export is enough, no credentials required; confirm 20 merchants | **The twelve-month retrospect (§11).** The number neither of you has ever seen. Plain HTTP on the LAN. |
| **2** | +15 min | Connect remaining accounts with credentials; discover each one's sync mode | It stays current without you. Nightly, unattended. |
| **3** | +10 min | Create the bot, paste the token | It reaches both of you, wherever you are (§5). |
| **4** | +30 min *(optional, needs a domain)* | DNS-01 certificate and automated renewal | The passcode stops crossing the house network in the clear (§7). |
| **5** | as needed | Assisted-mode accounts, amount bands, overrides | The long tail. |

Stage 1 requires **no credentials, no domain, no bot, and no scraper** — a single exported file is a
complete first experience. That is deliberate: the fastest path to the app's strongest moment must
not pass through its hardest step.

**Honest note carried in the app itself:** between stages 1 and 4 the household passcode crosses the
LAN in the clear. The app says so on the settings screen, in one line, with the stage-4 link — an
accepted, stated, temporary risk rather than a silent one.

## 3. Ledger

Integers in agorot. No floats near money.

**§3.1 Flow classification.** Every transaction resolves to `expense`, `income` or `internal`; only
the first two reach totals. Card settlement matching keys on the **statement total the issuer
reports** (`Statement` is a first-class entity), never the sum of purchases, which won't agree once
foreign currency is involved. Own-account matching is **directional** — a real internal transfer has
a counterparty we own, registered at setup; identity matches, amount corroborates.

**§3.2 Ambiguity is never resolved by picking.** Fallback matching (opposing sign, equal amount,
3-day window) applies **only when exactly one candidate fits**; two or more produce a **link
question**. The asymmetry that justifies this: a double-count is implausibly large and gets noticed;
an over-match deletes real spending and an under-count is invisible. When in doubt, count it as
spend and ask.

**§3.3 Pending → settled supersede,** keyed on `account + normalized merchant + date within 5 days`,
never on external id, because institutions reissue identifiers and amounts change on settlement.
Ambiguity → link question.

**§3.4 Foreign currency.** Store `original_amount`, `original_currency`, `billed_amount`; only
`billed_amount` enters totals.

**§3.5 Refunds and restatement.** A credit matching a prior purchase appears in cash flow in the
month it moved, and is attributed to the purchase's month for drift baselines. A closed month can
therefore be **restated** — flagged, delta recorded, and named in one line of the next monthly
digest. The app never silently changes a number it has already told you.

### 3.6 Reconciliation — and the resolution it actually has *(rewritten — mandate 4)*

Round 2's check could never fail. Round 3's could never pass, because Israeli banks post on a
**value date** (תאריך ערך) that differs from the booking date. Round 4 corrected the method and then
overstated it, claiming a three-day range from a seven-day window.

**The method.** Every transaction stores `booking_date` and `value_date`. Reconciliation runs on
`value_date`, because that is what the balance moves on; everything the household *sees* uses
`booking_date`, because that is the day they remember.

```
balance(d) − balance(d−7)  ==  Σ transactions with value_date in (d−7, d]
```

**The resolution.** A failing seven-day window localizes a discrepancy to **seven days, not three.**
Where consecutive overlapping windows disagree, their intersection narrows it and the app reports
the narrowed range — that is real work the app does, not a claim it assumes. Otherwise it says
seven days. It never states a range tighter than its evidence, because the first time someone
searches a claimed range and finds nothing, the diagnosis loses the credibility it exists to have.

**Tolerance.** Deltas under ₪5 or 0.1% of window volume are absorbed as rounding. A delta that
resolves on the next run — a late-posting transaction — is never surfaced at all.

**The gap case, defined.** If balance snapshots are missing (the machine was off), the check runs
across the whole snapshot-to-snapshot span instead of a 7-day window, and reports its resolution as
that span's actual length. A 23-day gap yields a 23-day localization, stated as such. Degraded, not
disguised.

**Late deltas are restatements.** A delta surfaced against an already-closed month routes into
**§3.5's restatement path** — flagged, recorded, and named in the next monthly digest. These two
mechanisms are one mechanism and the spec now says so.

## 4. Categorization

Merchant-level. Order: confirmed merchant → rule → LLM (novel merchants) → `Other`.

**§4.1 The merchant category is a default, not a verdict.** Per-transaction override, one tap from
the transaction list. **Amount-band rules** where the band is meaningful (*Shufersal under ₪250 →
Groceries; over → ask once, then remember*), proposed by the app when it notices a merchant's
amounts are bimodal, confirmed in the weekly queue. Without this, the ₪800 barbecue is Groceries
forever, in both drift baselines — and stable misclassification is the worst kind, because drift
can't catch it either.

**§4.2 The queue is a budget.** 12 items/week, ranked by `|amount| × uncertainty`. Below the line is
auto-assigned and never shown. A skipped week does not compound. Link questions outrank category
questions.

**§4.3 Explainability, split in two.** **Explained %** — confirmed for that transaction or its
amount band, the strong claim. **Attributed %** — inherited from a merchant default, the weaker one.
Target: explained + attributed ≥ 95%. Below it, the monthly digest **leads** with what share of the
month it cannot explain. The escalation deliberately does **not** enlarge the weekly queue.

### 4.4 Inference is free, so stop rationing it *(new — mandate 3)*

§8.1 establishes that a year of inference costs about ₪0.52. Round 4 nonetheless kept sending
**only novel merchants** to the model — a rule inherited from a cost model that no longer exists,
and applied precisely where errors concentrate: the first pass over 120 abbreviated,
inconsistently-transliterated Hebrew merchant names, whose mistakes then persist forever as
confirmed defaults.

- **Annual re-verification of the entire merchant table.** Cost: roughly four agorot. Disagreements
  with existing confirmations become queue items, ranked by volume, never applied silently.
- **The household's correction rate is a quality signal.** A rising rate of the household
  overriding the categorizer means it has drifted against how they actually think about their
  money. That triggers re-verification early, and is reported in the monthly close.

## 5. Reaching the second user

Home-network-only constrains **inbound** access; it says nothing about outbound. The app is not a
place you go, it is something that arrives.

**§5.1 The digest earns each send, and can carry good news.**

| | Condition | Threshold |
|---|---|---|
| ⚠ | Unusually expensive week | > 1.5σ above trailing 13-week mean |
| ⚠ | New drift flag | §6 |
| ⚠ | Reconciliation delta unresolved | beyond §3.6 tolerance |
| ⚠ | Account gone dark | stale > 10 days |
| ⚠ | Explained + attributed fell | < 95% |
| ⚠ | **Self-check failed** | §9.1 |
| ✓ | Unusually inexpensive week | > **1.0σ** below trailing 13-week mean |
| ✓ | A drift flag closed | a category returned to baseline |
| ✓ | Explainability recovered | back above 95% |

The good-news bar is deliberately **lower** than the bad-news bar. A household that has never
tracked anything needs to hear that something went right more than it needs another warning.
Otherwise: **silence.**

The **monthly close always sends**, reports how many quiet weeks there were so silence reads as
*nothing happened* rather than *it broke*, and **leads with the good news when there is any.**

**§5.2 Repeat alerts decay.** Every recurring condition fires **once**, then goes quiet and is
carried as standing state in the monthly close until it resolves. The app's response to a person
being busy must never be to message them weekly about being busy.

**§5.3 The message stands alone.** A deep link into a home-network-only app is useless everywhere
except the house. Every message carries its own answer; the link is an optional "there's more at
home", never the payload.

### 5.4 She can answer back *(new — mandate 2)*

Round 4 gave the second user a voice pointed at her and nothing pointed back. Every action belonged
to the primary user: the OTP, the queue, the overrides, setup. She received forty messages and
touched nothing — reproducing the exact asymmetry where one person owns the money and the other
asks him about it, which is the dynamic the app exists to fix.

**The bot channel accepts replies.** The app *polls* Telegram outbound, so this opens **no inbound
port** and costs nothing against frozen decision #7.

- *"what was the ₪1,200 on the 14th"* → answered in the channel, in seconds, from anywhere.
- *"how much did we spend on מסעדות last month"* → answered.
- *"why did you say we're above normal"* → the three categories and their deltas.

Constraints, all of them hard:

- **Reads only.** No categorization changes, no overrides, no settings, no money. There is no write
  path from this channel into the ledger, let alone into an institution.
- **Retrieval is deterministic.** The question selects rows by parameterized query; the model is
  given the already-selected rows and phrases the answer. It never writes the query and never
  reaches the database.
- **Descriptors remain hostile data** (§7). They arrive as data in a structured field, never as
  instructions, and the answer may contain only figures and merchant names drawn from the selected
  rows.
- **Both adults share one channel.** Fully joint household, frozen decision #5 — there is nothing
  to partition and no permission model to build.

## 6. Drift, and an honest answer before it

**True drift:** trailing 3-month mean vs. prior 3-month mean; flag at > 15% **and** > ₪200/month.
**Gated:** no number unless both windows cover whole months over a **stable account set**, because
backfill windows differ by institution and an ungated comparison reports a card's history starting
as a change in behaviour.

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
  scope to this app: a trusted root can vouch for any domain, and its key would sit beside the bank
  credentials, turning one compromised Mac mini into a persistent MITM position against both
  people's entire phone traffic. Instead, a real certificate for a real subdomain, DNS-01 challenge,
  public A record pointing at the LAN address. Nothing inbound is exposed. *(Stage 4, §2 — optional
  and deferred, not a setup blocker.)*
- **The ACME credential is scoped to one name** *(new — mandate 4)*. A zone-wide DNS token on the
  same box as the bank credentials can issue certificates for the entire domain and rewrite its MX
  records — so whoever takes the box can redirect the household's email and password-reset their way
  through everything they own. Scope the token to `_acme-challenge`, or `CNAME`-delegate the
  challenge to a throwaway zone that controls nothing else. The general rule, now applied three
  times: **every credential this app holds is the narrowest one that does the job** — scrapers
  read-only, bot token isolated, DNS token scoped to a single record.
- **A shared household passcode.** The house network has a smart TV, a printer, and every guest who
  ever had the WiFi password. The network is not a perimeter.
- **Descriptors are hostile data.** Anyone can put an instruction in a merchant descriptor for ₪3.
  Two defences, both required: descriptors travel as data in a structured field, never interpolated
  into instruction position; and the categorizer's output is constrained to **one value from the
  category enum**, so a successful injection has no channel to express anything through. §5.4's
  answering path inherits both, plus deterministic retrieval.
- **No write path to any institution.** Scrapers are read-only by construction.

## 8. Agents — three

**Categorizer.** Trigger: an unseen merchant after a scrape, or annual re-verification (§4.4).
Unattended. Writes back a merchant default.

**Drift Analyst.** Trigger: monthly close, subject to §6's gate. **Pure arithmetic — no LLM at
all**, which means the headline feature carries zero inference cost and zero inference risk.

**Answerer** *(new)*. Trigger: a household member replying in the bot channel. Phrases an answer
over rows selected deterministically by §5.4's query layer.

This is a chat box, and every previous round cut chat boxes. It earns its seat on one ground the
cut ones could not claim: **it is the only interface the second user will ever have.** Delete it and
she returns to being a spectator, which was round 4's binding constraint. It has a real trigger, it
does work no other surface does for her, and it is read-only.

### 8.1 What the agents cost

The Categorizer and the Answerer are the only LLM workloads; the Drift Analyst is arithmetic.

- **Cold start:** ~120 novel merchants, batched 20/call → 6 calls ≈ 4,800 input / 900 output, once.
- **Steady state:** 10–15 new merchants a month → ~800 in / 150 out monthly.
- **Annual re-verification (§4.4):** ~6 calls ≈ 4,800 in / 900 out per year.
- **Answerer:** assume 10 questions a month, ~1,200 in / 200 out each ≈ 144,000 in / 24,000 out a
  year — now the dominant workload, and still nothing.
- **Year-one total:** ≈ **168,000 input / 30,000 output tokens.**

| Model | Input $/MTok | Output $/MTok | Year-one cost |
|---|---:|---:|---:|
| `claude-haiku-4-5` | $1 | $5 | ≈ $0.32 (₪1.20) |
| `claude-sonnet-5` | $2 | $10 | ≈ $0.64 (₪2.40) |
| `claude-opus-5` | $5 | $25 | **≈ $1.59 (₪5.90)** |

**Cost is not a variable here.** Under six shekels a year at the top of the range, for a household
trying to find ₪280 a month. So **choose on quality**, and the quality bottleneck is unambiguous:
understanding abbreviated, inconsistently-transliterated **Hebrew merchant descriptors**. Spec:
`claude-opus-5`. Batch API's 50% discount and prompt caching are both declined — they halve a
number that is already noise, in exchange for latency and complexity.

## 9. Freshness and health

Every account carries `synced_through`. Every aggregate inherits the **oldest** freshness among its
inputs and shows it next to itself: *"₪14,200 — Leumi last synced 8 days ago."* Stale past 3 days;
presented as broken past 10, once, per §5.2.

### 9.1 One nightly self-check, reported through the digest *(new — mandate 3)*

Round 4 made the health check a **quarterly reminder to a human**, in an app whose entire premise is
that this household does not reliably do recurring financial chores, covering three dependencies
that fail on independent clocks: pinned scrapers when a bank redesigns, the certificate every ninety
days, and the OS update that moves Node or breaks headless Chromium.

The failure that exposes it: the certificate expires while he's abroad. The web app becomes
unreachable on both phones. **The digest keeps sending perfectly**, because it is outbound and
touches no certificate. The app is half-dead and its only voice is the healthy half, cheerfully
reporting numbers, for a month.

So: **a nightly self-check** covering scraper liveness per institution, certificate expiry runway,
last successful run of every job, database integrity and free disk — reported through the **outbound
digest**, which is the one surface that survives every failure the check covers. The human reminder
is deleted. The generalized rule: *health belongs on the channel that cannot break for the same
reasons the app can.*

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
  Hebrew content, and is specified in RTL from the start rather than adapted to it.

### 10.1 The categories

**Transfers is not a category** — internal movement is a `flow_class` (§3.1), and keeping it in the
taxonomy let real spend hide in it. Thirteen leaves:

דיור · מזון · מסעדות · תחבורה · רכב · חשבונות · בריאות · ילדים · קניות · פנאי · נסיעות · שירותים · אחר

## 11. The first run

Night one has twelve months of backfilled history — genuinely interesting material that round 2's
spec was treating as nothing while aiming the app's moment of maximum enthusiasm at a four-day
partial month.

After the twenty-merchant confirmation, setup ends on **"השנה האחרונה שלכם"**:

- Total in, total out, what was left — the first time either of them has seen that number.
- The twelve-month category mix.
- The largest single expense of the year, named.
- The merchant visited most, and its total.
- Twelve monthly bars, so the shape of the year is visible at a glance.

None of it needs the current month, perfect categorization, or drift eligibility. It exists at
minute twenty of stage 1 and it is the strongest thing the app will say all year.

## 12. The dashboard answers one question

Not "show everything" — **"why did the message say that?"**

### 12.1 The hero, composed rather than interpolated *(rewritten — mandate 3)*

Round 4 declared bidi isolation a requirement in §10 and then built the app's largest string —
`₪1,400 מעל הרגיל שלכם` — as an interpolated Hebrew sentence with Latin numerals and a currency
symbol inside it. That is the exact case §10 forbids, on the biggest text on the most important
screen.

The hero is a **composed element, not a sentence**: an amount component (sign, ₪, digits, with
explicit direction isolation and its own layout box) and a label component beneath it, laid out by
the container rather than by string order. It is mocked in both languages before it is built.

### 12.2 Two designed states, not one *(new — mandate 3)*

The app had exactly one designed emotional state and it was bad. A household that has never tracked
anything and finally comes in **under** its baseline should open that screen and feel it — not read
the same treatment with a minus sign, which registers as a smaller failure rather than a success.

| | Above normal | **Below normal** |
|---|---|---|
| Hero | `₪1,400` over | `₪1,400` **under** |
| Colour | warning tone | affirming tone, equal weight |
| Sentence | which categories drove it | **what you did differently** — the categories that fell |
| Follow-through | the transactions behind it | the same, framed as what to keep doing |

Both states get the same design care. Where no baseline exists yet, the hero is the twelve-month
retrospect — never a naked total, because nobody knows whether ₪19,400 is good.

### 12.3 The rest of the screen

Beneath the hero: the three categories that moved most, with shekel deltas. Beneath that: the
transactions behind whichever you tap, with one-tap category override (§4.1). Persistent in the
corner: freshness, reconciliation status, explained % and attributed % — the app's four admissions,
always visible, never buried.

Everything else — full search, month history, merchant management — lives behind a single
"everything else" route and is not part of the primary experience.

## 13. Stack

Node/TypeScript, SQLite, Next.js, Tailwind, `docker compose up` on a Mac mini or NAS. Scrapers run
as a separate process from the web app. Keychain entries, separately scoped: bank credentials, bot
token, DNS challenge token.

`israeli-bank-scrapers` is **pinned and vendored** — it is a volunteer project and the household's
financial visibility must not depend on a stranger's free evenings. The written failure procedure
lives in the repo and is linked from the app: when a scraper breaks and no fix is coming, the
account demotes to `import`, the app says so **once**, and the monthly close carries the standing
state. The household loses automation, never data.

## 14. Rollout

1. Ingestion, ledger, flow classification, supersede, windowed reconciliation.
2. Merchant categorization, amount bands, the twenty-merchant onboarding.
3. The twelve-month retrospect — **this completes stage 1 and is the first shippable product.**
4. The digest, both trigger classes, decay, and the §9.1 self-check.
5. The reply channel (§5.4).
6. The dashboard, both states.
7. Month-over-month interim signal; then drift behind its gate.
