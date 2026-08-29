# Kupa — Product Roadmap
*Produced by the Product Council (PM + Design Lead, Tech Lead, User Researcher). Opinionated on
purpose: it says no more than yes. Method in `gauntlet/product/COUNCIL.md`; workings in
`gauntlet/product/round1-*.md`.*

**The strategy in one line:** the cheapest wins are arithmetic on data we already have; the
highest-leverage win is a *channel* decision, not a feature. Spend accordingly.

---

## NOW — three cheap, high-impact bets (all pure arithmetic, no new deps, no AI)

### 1. Month-end forecast — ✅ SHIPPED *(the bet with the best score, 5.4)*
- **Problem:** the household only learns the month was expensive after it's over. Too late to steer.
- **The bet:** "at this pace, **₪18,400** out this month — ₪1,500 above last." A forecast that
  *warns*, never a budget that *scolds* (scolding gets the app closed).
- **Why first:** answers the question a stressed household actually asks ("are we OK this month?"),
  speaks in **week one** (unlike drift), and it's just run-rate math over the current month.
- **Effort:** S. **Risk:** early-month forecasts are noisy → show a confidence band, suppress before ~day 7.
- **First slice:** a forecast line on the dashboard hero + a `forecast()` in `retrospect.ts`.

### 2. The WhatsApp digest — *reaches the person who never opens the app*
- **Problem:** the whole app dies if the second adult never sees it. The build even specced a
  digest — but on **Telegram**, which Israeli households barely use.
- **The bet:** deliver the weekly/monthly digest on **WhatsApp** (a logged-in session on the home
  box via an unofficial bridge — stays local-first, free). She already has WhatsApp open all day;
  nothing to install, learn, or log into. Build it **channel-agnostic** (WhatsApp / Telegram / email)
  so no single bridge is a hard dependency. **Every digest earns one positive line when deserved**
  ("best grocery month since March") so the channel never becomes all-bad-news and gets muted.
- **Why now:** it's the only item that moves the #1 risk, and it's the delivery spine for #1 and drift.
- **Effort:** M. **Risk:** the WhatsApp bridge is unofficial and can break → the channel-agnostic
  design + email fallback is the insurance.
- **First slice:** a `Channel` interface with an email impl first (zero risk), then the WhatsApp bridge.

### 3. "Your year in money" — ✅ SHIPPED *(the delight-per-effort steal)*
- **Problem:** a year of data is a story the household never gets told.
- **The bet:** one designed, screenshot-worthy annual summary — total in/out, the shape of the year,
  biggest splurge, most-visited merchant, the category that grew most. Shareable → free word-of-mouth.
- **Why now:** `retrospect()` already computes ~80% of it; this is an afternoon of design on top.
- **Effort:** S. **Risk:** almost none. **First slice:** a `/year` route reusing retrospect + a share image.

---

## NEXT — the insight engine and the big rock

### 4. Recurring-charge engine → "committed vs. free" money
- **Problem:** money leaves before anyone decides (subscriptions, insurance, standing orders), and
  the household can't see how much of the month was already spoken for.
- **The bet:** detect recurring charges from the ledger (same merchant, ~monthly cadence, stable
  amount) → "**7 recurring, ₪430/mo**", and roll it up into **"₪11,200 committed before you choose
  anything; ₪4,800 discretionary."** One engine, two surfaces.
- **Effort:** M. **Risk:** cadence detection false-positives → require 3+ occurrences before flagging.

### 5. Drift detection — *Job 2, built now, speaks later*
- **Problem:** "is our normal getting more expensive" is half the reason the app exists, and it's unbuilt.
- **The bet:** trailing-3-vs-prior-3-month baseline per category, gated to a stable account set.
  "Eating out has run **₪480/mo above** your spring baseline."
- **The catch the council flagged:** by its own honesty gate it's **silent for ~9 months**. So build
  it now but let the **forecast (#1) carry the "are we drifting" question until drift is eligible** —
  and treat drift going live as its own good moment in the digest.
- **Effort:** M. **Risk:** none technically; the risk is impatience — don't let it speak before it can be honest.

### 6. Live bank sync — *the big rock*
- **Problem:** exporting a file every month is the chore that kills the habit.
- **The bet:** nightly `israeli-bank-scrapers` pull; kills the export chore **and** unlocks the
  reconciliation engine that's already built but unwired (needs a balance feed).
- **Why not Now:** it's the only **L** on the board — Puppeteer, per-bank breakage, OTP flows, a
  credential vault. Real and worth it, but scheduled deliberately, never squeezed in.
- **Effort:** L. **Risk:** high maintenance; the file-import path stays as the permanent fallback.

---

## LATER — real, but lower leverage

- **Accounts management screen** (add / rename / re-map files & accounts) — plumbing that makes multi-account real. *S–M.*
- **Bill calendar** — upcoming known charges (arnona, insurance) with a heads-up. *M; wait for recurring engine.*
- **Cash quick-add** — one-tap cash expense so the ledger isn't blind to cash. Real leak, but it's
  manual entry (the one thing they won't reliably do), so low reach. *S.*
- **Delightful corrections** — make override→rule visible and satisfying. Fold into the next category
  pass rather than a standalone bet. *S.*

---

## GRAVEYARD — killed, with cause of death

| Idea | Why it died |
|---|---|
| **In-app AI chat** | Duplicates the specced Answerer (reply *in the message channel*) but in a screen the second user will never open. Right idea, wrong place. |
| **Streaks / badges / gamification** | Wrong user. This household abandoned a spreadsheet — they want to *not think about it*, not play a game. Gamification is for users who enjoy the app; ours want to ignore it. |
| **Net-worth / investment tracking** | **Gate fail — not local-first.** Needs brokerage/pension data no Israeli export provides, pulling in cloud aggregators. |
| **Split-with-friends** | **Gate fail.** Needs a second party's data, and the build already cut it (fully-joint household). |

---

## The one-paragraph recommendation
Ship the **forecast** this week — highest score, speaks immediately, trivial to build. In parallel,
stand up the **channel-agnostic digest and default it to WhatsApp**, because reaching the second
adult is the difference between this app living and dying, and WhatsApp (not the specced Telegram)
is where she already is. Bank the **annual summary** as a cheap delight that markets itself. Then the
**recurring engine** and **drift**. Treat **live sync** as the scheduled big rock, not a squeeze.
Everything a finance nerd would love but the reluctant partner wouldn't — chat boxes, streaks,
net-worth dashboards — stays dead.

---

## Roadmap addendum — categories with codes + wealth streams *(Council round 2)*
Full workings in `gauntlet/product/round2-council.md`.

**"Real category codes":** the system is **MCC** (ISO 18245, the card networks' 4-digit merchant
codes). Your Max file doesn't carry it — only a text category — so MCC is unlocked by **live sync**,
not the file. For household budgeting, **COICOP** (Israel's CBS taxonomy) fits better than MCC. Two
upgrades: a **COICOP 2-level category hierarchy** now (S–M), and **MCC capture + map** later, riding
live sync.

**Wealth streams — YES, as a manual/file-based balance sheet, never auto-sync.** Auto-syncing
brokers/pension/keren stays a **gate fail** (no local-first aggregator exists for Israeli
instruments; it would break the local-first promise). But the *value* — one net-worth number that
goes up — is fully deliverable by manual monthly balances + statement import, which for keren/pension
is the only realistic path anyway.

| Order | Bet | Effort |
|---|---|---|
| **A** | **Free cash flow** surfaced ("you kept ₪X this month") — mostly built, the bridge to wealth | S |
| **B** | **Household balance sheet** — assets (cash, broker, keren hishtalmut, pension/gemel, real estate) − liabilities (mortgage, loans, debt) = **net worth over time** | M |
| **C** | **COICOP category hierarchy** — parent→sub categories ("real categories") | M |
| **D** | later, with live sync: **MCC** capture · mortgage amortization detail | M |

**Graveyard (unchanged):** auto-sync of broker/pension/keren — cannot be done without breaking
local-first.
