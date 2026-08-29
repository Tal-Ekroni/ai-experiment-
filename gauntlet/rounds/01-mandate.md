# Round 1 — Mandate for round 2

Ranked. Resolve these five. Touch nothing else.

## 1. The arithmetic is wrong — fix it before anything else *(Accountant)*

Israeli cards settle as one consolidated monthly debit, so card purchases and their settling debit
are both being counted. Own-account moves are counted as income *and* expense. Required:

- Internal-transfer detection as a **precondition of the ledger**, not a category. Match card
  statements to the debit that settles them; match own-account pairs on amount, opposing sign and
  date proximity. Exclude the class from both income and expense.
- **Monthly reconciliation** against each account's bank-reported closing balance, with the delta
  surfaced. An unreconciled month must be visibly unreconciled.

## 2. Build a path to the second user *(Spouse)* — floor dimension, ×2

The home-network-only decision constrains **inbound** access. It says nothing about outbound.
Required: something that *arrives* without anyone navigating to it. Design the push as the primary
surface and the dashboard as the place you go when the push made you curious — not the reverse.
Whatever you choose must work without the second user installing, learning, or logging into
anything.

## 3. Put a hard budget on the review queue, sized for day one *(Abandoner)*

The queue must be bounded by a number, ranked by how much money the answer moves, with everything
below the line auto-assigned and never surfaced. State explicitly what happens on the first night
with ~800 backfilled transactions and zero rules, and what happens after a skipped week.

## 4. Close the credential and access holes *(Security)*

- Bank credentials to the OS keychain. Never the filesystem, never `.env`, never the repo.
- A shared household passcode on the app. The network is not a perimeter.
- Every merchant descriptor is hostile data and must never reach a model as instructions.

## 5. Make freshness first-class, settle OTP, cut the agent roster *(Realist + Skeptic)*

- Every number on screen carries its own staleness. A total built from a stale account says so
  next to the total, not in a log.
- Decide now whether unattended nightly scraping is possible for banks that OTP every login, and
  state the plan for those that don't allow it.
- Delete the four agents that don't work unattended. Keep Categorizer and Drift Analyst.

---

## Explicitly out of scope for round 2

Deferred to round 3 so this round stays sharp:

- First-run and low-data screen design *(Craft, dim 7)*
- The drift algorithm's statistical detail *(dim 4)*
- Monthly token cost figure *(dim 4)*
- Visual design, layout, hierarchy

These stay unresolved and their scores should not move in round 2. That is expected.
