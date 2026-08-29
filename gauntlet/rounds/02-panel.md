# Round 2 — Panel

Same seven seats against `02-artifact.md`. Round 1 findings that were genuinely fixed are not
re-litigated. Each seat goes deeper or finds something new.

---

## 1. The Spouse Who Didn't Ask For This — dimension 6, **7/10**

**Worst thing:** The digest dies the same death the dashboard died. It just takes nine weeks
instead of three.

**Kill shot:** Week one the message is novel and I read it. Week two I read it. Week five it
arrives on a Sunday morning and says *"This week: ₪3,240 out. Groceries ₪1,180 · Eating out ₪620
· Fuel ₪410."* That is exactly what it said last week and the week before, because our life is the
same every week — that's what a life is. I swipe it away without opening it. By week nine the
Telegram chat is muted, and a muted channel is worse than no channel, because now you believe you
have a path to me and you don't.

§5.1 sends unconditionally. An unconditional weekly message trains me to ignore it, and once
trained, I will also ignore the one message a year that actually mattered.

**Highest-leverage change:** The weekly send must **earn** each transmission. If nothing crossed a
threshold, say nothing at all — silence is information and it costs you no credibility. Send when
there is something I'd want to be interrupted for. The monthly close can always send, because a
month closing is itself the event.

**Score justification:** Enormous improvement — a path to me now exists, which is the whole
difference between 3 and 7. But it's a path that degrades to zero on a predictable schedule, and
nothing in the spec notices.

---

## 2. The Week-Three Abandoner — dimension 2, **7/10**

**Worst thing:** `Other` is unbounded, and everything the queue declines to ask me about falls
into it.

**Kill shot:** §4.1 caps me at 12 items a week and auto-assigns the rest. §4 step 4 sends anything
unresolved to `Other`. Nothing anywhere puts a ceiling on how big `Other` gets. Month four, I
finally open the dashboard, and `Other` is ₪2,900 — the second-largest category in the house. It
is second-largest because it is a bin, not a category. Every number on that screen is now
suspect, the drift analysis in §6 is measuring a category that means nothing, and the honest
answer to "where did our money go" is "₪2,900 of it went somewhere, we don't know."

The re-ranking rule makes it structural, not accidental: an item that never reaches the weekly top
12 is never asked about, *ever*. That's correct for one ₪18 charge and catastrophic in aggregate,
and the spec has no aggregate view of it.

**Highest-leverage change:** Put a hard ceiling on unresolved value, not on unresolved count. If
`Other` exceeds some share of monthly spend — 5% is defensible — that is an app-level failure
state that gets escalated, not absorbed. Track and show "% of this month's spend we can actually
explain." That number is the app's own honesty score and it belongs on the dashboard.

**Score justification:** The 20-merchant onboarding is genuinely excellent and solves the cold
start properly. The steady state now has a slow leak instead of a cliff.

---

## 3. The Bank-Integration Realist — dimension 5, **6/10**

**Worst thing:** §3.2 reconciles against an opening balance the scrapers do not give you.

**Kill shot:** Two separate landmines.

First, reconciliation. `israeli-bank-scrapers` returns a **current** balance and a list of
transactions. It does not return "the closing balance of March." So §3.2's equation —
`opening + Σ transactions == closing` — is checking an identity against a number you have to
*derive* by walking today's balance backwards through every transaction you hold. Which means the
reconciliation is computed from the same data it is meant to validate, and will therefore always
balance. It will report success on a month where you dropped forty transactions. A check that
cannot fail is not a check.

Second, pending transactions. Israeli card scrapers return pending rows, and pending rows **mutate
on settlement**: a restaurant pre-auth of ₪400 settles at ₪460 once the tip lands, a fuel
pre-auth of ₪250 settles at the real ₪317, and in both cases the institution may issue a
*different identifier* for the settled row. §3.3 has `status` and `external id` and no supersede
rule anywhere. So both rows persist. The month is ₪400 over, and now your reconciliation — if it
worked, which it doesn't — would flag a delta that nobody can trace.

**Highest-leverage change:** Anchor the reconciliation to something the institution asserts
independently of your transaction list, or stop calling it reconciliation. Capturing the current
balance daily and checking day-over-day balance movement against the day's transactions is a real
check and is available from what the scraper actually returns. And write an explicit
pending→settled supersede rule keyed on account + date proximity + merchant, not on identifier.

**Score justification:** The sync-mode ladder and the demotion path are the right shape and I'll
credit them. The two mechanisms that guarantee data integrity are both currently decorative.

---

## 4. The Security Engineer — dimension 3, **6/10**

**Worst thing:** §5.1 solved the Spouse's problem by quietly spending the local-first guarantee,
and didn't say so.

**Kill shot:** Decision #2 is *"local-first — data never leaves."* §5.1 sends a weekly financial
summary to a Telegram bot. That is the household's spending, in shekels, week by week, accumulating
in a chat history on a third party's servers, retained indefinitely, retrievable by anyone who
compromises either phone or the bot token. "Aggregates only" is doing a lot of work in that
sentence: a year of weekly totals plus three category breakdowns is a detailed, longitudinal
financial profile of this household. You would not have accepted this if I'd proposed it directly;
you accepted it because it arrived as the solution to a different problem.

I am not saying don't do it. I am saying the spec must state the trade, because right now round 2
silently overturned a frozen stage-1 decision.

Second, smaller: §7's household passcode travels over plain HTTP on the house WiFi, so the
credential protecting the whole financial history is recoverable by anything sniffing the network
— which was your own stated reason for adding the passcode in the first place. And it is one
static shared secret that will never be rotated.

**Highest-leverage change:** Name the trade explicitly and bound it — the digest carries the
smallest payload that still makes her open it, with a stated retention policy and a documented
"what an attacker learns from the chat history" paragraph. Take the bot token out of the same
store as the bank credentials. And put TLS on the LAN listener; a self-signed cert on a
`.local` name is twenty minutes of work.

**Score justification:** Keychain, the enum-constrained categorizer output, and no-write-path are
all genuinely right and materially close the round 1 holes. Then §5.1 opened a new exfiltration
channel and the spec didn't notice it had.

---

## 5. The Accountant — dimension 1, **7/10**

**Worst thing:** The transfer matchers will produce false positives, and a false positive here
deletes real spending from your books.

**Kill shot:** §3.1 matches own-account transfers on opposing sign, equal absolute amount, and a
3-day window. On the 10th you move ₪500 between your two accounts, and on the same day you send
₪500 to your sister, who banks at the same institution. Two candidate pairs, identical on every
field the matcher looks at. It picks one. If it picks wrong, a real ₪500 expense is reclassified
`internal` and vanishes from the month — and unlike a double-count, which shows up as an
implausibly large number, an under-count is *invisible*. The app reports a better month than you
had, which is the specific failure this whole product exists to prevent.

Two more the spec doesn't handle. **FX:** a card purchase in dollars is booked at a provisional
rate and settles at another, so the sum of card purchases will not equal the statement total the
settlement matcher keys on. **Refunds:** a return credited in April against a March purchase
belongs to March's story and lands in April's ledger; nothing in §3 or §6 says which month owns
it, so your drift baselines get quietly polluted by returns.

**Highest-leverage change:** Ambiguous matches must never be resolved by picking. When more than
one candidate pair fits, that's a link question for the queue — §3.1 already invented that
mechanism for near-misses, and it applies far more urgently to over-matches. And make matching
directional: a genuine internal transfer has a counterparty account *we own*, which is knowable,
rather than merely an amount that happens to agree.

**Score justification:** Flow classification, the settlement matcher and the `internal` exclusion
fix round 1's fatal defect, and that's most of a four-point jump. What remains is precision.

---

## 6. The Agent Skeptic — dimension 4, **6/10**

**Worst thing:** The Drift Analyst's first real output will be wrong, and it will be wrong in the
message that was supposed to earn her trust.

**Kill shot:** §6 compares a trailing 3-month mean to the prior 3-month mean. §2 gives you
different backfill windows per institution — three months from one bank, twelve from a card. So in
month two, the "prior 3 months" window contains the card's history but not the bank's, and the
"trailing 3 months" window contains both. The Analyst is comparing two different *populations of
accounts* and reporting the difference as a change in your behaviour. The digest announces
*"Groceries is running ₪800/month above your baseline"* — it isn't. That's just an account
starting. The very first non-obvious thing this app ever tells the household is false, and it
lands in the channel §5 just spent all its credibility building.

Nobody has costed this either, and I know it was deferred, so I'm noting it rather than pricing
it in: I still cannot tell you what a month of Categorizer traffic costs, or whether it is small
relative to the ₪280/month of drift §5.1 is advertising it finds.

**Highest-leverage change:** Drift must refuse to speak until it has a comparable window across a
stable account set — same accounts, both sides, full months only — and must say *"not enough
history yet"* rather than produce a number. An honest silence in month two is worth more than
every insight it produces in month twelve, because it buys the credibility the twelfth month spends.

**Score justification:** Two agents that both do unattended work with real triggers is the right
roster and a real fix. One of the two currently has a statistical foot-gun aimed directly at the
household's trust.

---

## 7. The Craft Critic — dimension 7, **5/10**

**Out of scope this round** by `01-mandate.md`, which deferred first-run and visual design to
round 3. Score correctly held flat — the artifact did not address it and should not have.

One new thing to carry forward, since the seat is here anyway: §5.4 declares that the dashboard is
no longer the product, and then §11's rollout still builds a four-tab dashboard. If the digest is
the product, the dashboard's job has changed from "show everything" to "answer the one question
the message provoked." Those are different screens, and round 3 should design the second one, not
shrink the first.

**Score justification:** Unchanged by design, not by neglect.
