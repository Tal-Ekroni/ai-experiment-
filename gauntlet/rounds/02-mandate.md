# Round 2 — Mandate for round 3

Ranked, and consolidated to five. The panel found one underlying principle in three seats, so it
is treated as one item rather than three.

## 1. Make the integrity checks capable of failing *(Realist)*

- §3.2's reconciliation derives the opening balance from the transaction list it is meant to
  validate, so it will always balance and can never detect loss. Anchor it to something the
  institution asserts independently — a daily captured balance, checked day-over-day against that
  day's transactions — or stop calling it reconciliation.
- Write an explicit **pending → settled supersede rule**, keyed on account + merchant + date
  proximity, *not* on external identifier, because Israeli institutions reissue identifiers on
  settlement and amounts change (pre-auth ₪400 → settled ₪460).

## 2. Teach the app to say nothing *(Spouse + Skeptic — one principle, two symptoms)*

- **Drift refuses to speak** until it has a genuinely comparable window: the same account set on
  both sides, whole months only. Where it doesn't, it says "not enough history yet" and produces
  no number. Month two must not announce drift that is really an account's backfill starting.
- **The weekly digest earns each send.** No unconditional weekly message — send when something
  crossed a threshold worth an interruption, stay silent otherwise. The monthly close may always
  send, because the close is itself the event. Define the thresholds explicitly.

## 3. Never resolve an ambiguous match by picking *(Accountant)*

- When more than one candidate pair fits an internal-transfer match, it becomes a **link question**
  in the queue. An over-match silently deletes real spending, and an under-count is invisible in a
  way a double-count never is.
- Make matching **directional** — a real internal transfer has a counterparty account we own, which
  is knowable, not merely an amount that agrees.
- Handle **FX** (dollar card purchases book provisionally and settle at another rate, so purchase
  sums won't equal the statement total) and **refunds** (a credit in April against a March purchase
  — state which month owns it and keep it out of the drift baseline).

## 4. Be honest about what the app cannot explain, and about what leaves the house *(Abandoner + Security)*

- Put a ceiling on **unresolved value, not unresolved count**. Surface "% of this month's spend we
  can actually explain" as a first-class number. If `Other` exceeds ~5% of monthly spend, that is
  an app-level failure state that escalates rather than being absorbed.
- **Name the digest trade explicitly.** §5.1 sends financial aggregates to a third party, which
  partially overturns frozen decision #2. State the payload, the retention, and a plain paragraph
  on what an attacker learns from a year of that chat history. Keep the bot token out of the same
  store as the bank credentials.
- **TLS on the LAN listener.** The passcode currently crosses the network in the clear, on the very
  network whose untrustworthiness justified adding it.

## 5. Design the first run and the dashboard's new job *(Craft — now the floor)*

Deferred in round 2, unavoidable now: nothing passes with a dimension at 5.

- Design the **zero-data and low-data states as the primary case.** Night one has twelve months of
  backfill and that is genuinely interesting material the spec currently treats as nothing.
- §5.4 declared the dashboard is no longer the product but §11 still builds a four-tab dashboard.
  If the digest is the product, the dashboard answers *the one question the message provoked*.
  Design that screen — don't shrink the old one.
- State the visual hierarchy: what is the largest number on the page, and what does a good month
  look like from across the room.

---

## Explicitly out of scope for round 3

- Monthly token cost figure *(dim 4)* — deferred a second time, deliberately; it cannot be
  estimated honestly until the categorizer's volume assumptions are settled. Round 4.
- Stack, deployment, rollout sequencing.
- Anything reopening frozen stage-1 decisions.
