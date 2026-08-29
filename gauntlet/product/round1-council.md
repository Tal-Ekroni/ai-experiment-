# Product Council — Round 1

## PROPOSE (the PM's batch)

Framed as problem → idea → why now. The PM dumps 16; the team will cut hard.

1. **Nobody knows the month isn't over.** Month-end forecast: "at this pace, ₪18,400 out this month
   vs ₪16,900 last." *A forecast that warns, not a budget that scolds.*
2. **Drift is Job 2 and it isn't built.** Trailing-3-vs-prior-3 baseline per category, gated. "Eating
   out has run ₪480/mo above your spring baseline."
3. **The second adult never opens the app.** A weekly/monthly message with the numbers in it.
4. **The channel is wrong.** Spec picked Telegram; Israelis use WhatsApp. Deliver the digest on
   WhatsApp.
5. **File export is a chore.** Live nightly bank sync via israeli-bank-scrapers.
6. **Silent recurring charges.** Detect recurring/subscriptions from the ledger: "7 recurring, ₪430/mo."
7. **Committed vs. free money is invisible.** Split spend into fixed (rent, insurance, subs) vs.
   discretionary. "₪11k is committed before you choose anything."
8. **Cash is untracked.** One-tap "add a cash expense" so the ledger isn't blind to cash.
9. **A year is a story nobody gets to tell.** "Your year in money" — a shareable annual summary.
10. **Known bills surprise you.** A small calendar of upcoming known charges (arnona, insurance).
11. **Correcting a category feels like data entry.** Make the override→rule loop delightful and visible.
12. **Two banks, several cards — no combined view management.** An accounts screen to add/rename/manage.
13. **AI chat over the data.** Ask "how much on eating out last month" in the app.
14. **Gamified savings streaks.** Badges for under-budget weeks.
15. **Net-worth / investment tracking.** Pull in savings and stocks.
16. **Split-with-friends.** Track who owes whom on shared expenses.

## CRITIQUE

### User Researcher (voice of the two humans)
- **#4 is the most important thing on this list and the PM buried it at position 4.** Telegram
  penetration in Israeli households is low; WhatsApp is near-universal. A digest on Telegram asks the
  reluctant spouse to install and check an app she doesn't use — which is the exact failure we're
  fixing. **On WhatsApp she already has it open 20×/day.** This isn't a channel tweak, it's the
  difference between the digest working and not. Merge #3+#4: *the digest is a WhatsApp message.*
- **#1 (forecast) beats #2 (drift) for these users, and it's available now.** Drift needs ~9 months
  of history to speak (the gate). A forecast speaks in week one and answers "are we going to be OK
  this month" — the question a stressed household actually asks. Ship the forecast first; let drift
  arrive when it's eligible.
- **Kill #14 (streaks/badges).** This household abandoned a spreadsheet; they don't want a game, they
  want to not have to think. Gamification is for apps whose users enjoy the app. Ours want to ignore it.
- **#8 (cash) — real problem, but low frequency and it's manual entry, the one thing they won't do.**
  Downgrade to Later.
- I'll **add one**: **"the good-news moment."** Every insight so far is a warning. Give the digest one
  genuinely positive line when earned ("best grocery month since March"). Cheap, and it's why she
  keeps the channel unmuted.

### Design Lead
- **#6 (recurring) and #7 (fixed vs. free) are the same insight wearing two hats** — both are "money
  that leaves before you decide." Build recurring detection first; "fixed vs discretionary" is just
  the summary view on top of it. One engine, two surfaces.
- **#9 (year in money) is the highest delight-per-effort on the board.** The retrospect already
  computes most of it; making it a designed, shareable moment is an afternoon, and it's the thing
  someone screenshots and shows a friend — free growth.
- **Kill #13 (in-app AI chat).** We already specced the Answerer as a *reply in the message channel*,
  which is where the second user is. A chat box *inside* the app is a screen she'll never open — it
  duplicates the good idea in the wrong place.
- **#11 (delightful corrections):** yes, but it's polish on an existing flow, not a new bet. Fold into
  whatever category work we do next; not its own roadmap line.
- **#12 (accounts management):** unglamorous but it's a real gap — right now adding a second file is
  awkward. Small. Keep as plumbing under "live sync / multi-account."

### Tech Lead (local-first, this stack)
- **Gate-fail, cut: #15 (net worth/investments)** needs brokerage/pension data no Israeli file gives
  us and would pull in cloud aggregators — breaks local-first. **#16 (split-with-friends)** the spec
  already cut (fully-joint household) and it needs a second party's data. Both out.
- **#5 (live sync) is the biggest effort on the board (L)** — Puppeteer, per-bank breakage, OTP,
  credential vault. High value (kills the chore) but it's a project, not a sprint. It also unlocks the
  reconciliation engine that's built-but-unwired. Next, not Now — and it's the one to schedule
  deliberately, not squeeze.
- **#4 WhatsApp reality check:** true WhatsApp Business API is cloud + approval + cost. But a
  home-run bridge (whatsapp-web.js, a logged-in session on the box) keeps it local-first and free.
  Feasible (M), with the honest caveat that it's an unofficial bridge that can break — so build the
  digest **channel-agnostic** (Telegram OR WhatsApp bridge OR email), don't hardcode one.
- **#1 forecast, #2 drift, #6 recurring** are all pure arithmetic over the existing ledger — **S/M,
  no new dependencies, no LLM.** These are the cheap wins.
- **#9 annual summary** — S, reuses `retrospect()`.

## The PM's synthesis
The team reshaped the board hard. Three consolidations (3+4 → WhatsApp digest; 6+7 → one recurring
engine; the good-news line folds into the digest), four kills (streaks, in-app chat, net-worth,
split), and one reprioritization the Researcher was right about: **forecast before drift**, because
drift is silent for months and forecast speaks now.

The through-line: **the cheapest wins (forecast, recurring, annual summary) are all arithmetic on data
we already have, and the highest-leverage win (reaching the spouse) is a channel decision, not a
feature.** Live sync is the big rock — real, worth it, but scheduled, not rushed.
