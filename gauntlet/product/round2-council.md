# Product Council — Round 2: category codes + wealth streams

## Part A — "real categories with real codes"

**What the user is thinking of: MCC (Merchant Category Codes)** — ISO 18245, the 4-digit codes the
card networks (Visa/Mastercard) assign to every merchant (5411 = grocery, 5541 = fuel, 5812 =
restaurants…). ~1000 codes. That's the "codes for categories" system.

**Tech Lead — reality check on the actual data:** the Max `.xlsx` export does **not** carry MCC.
Its columns are a text `קטגוריה` + merchant name + amounts; no 4-digit code anywhere. So we cannot
read MCC from the file the user actually has. MCC becomes available only via **live scraping**
(`israeli-bank-scrapers` surfaces a richer category/code per transaction than the file export does)
— i.e. it's unlocked by roadmap "live sync", not before.

**Design Lead:** there's a *second* standard that fits a household better than MCC —
**COICOP** (Classification of Individual Consumption by Purpose), the taxonomy Israel's CBS (הלמ"ס)
uses for the household expenditure survey and CPI. It's hierarchical (Food → Groceries → Dairy) and
maps cleanly to "housing/transport/health" the way a family thinks, where MCC is merchant-centric
(a supermarket that sells a kettle is still 5411). For *budgeting*, COICOP-style beats MCC.

**PM synthesis (Part A):** two real, compatible upgrades —
1. **Now, cheap:** make the 13 categories a proper **2-level hierarchy aligned to COICOP** (parent →
   sub), so "תחבורה" splits into fuel / public transport / parking, etc. Rigorous, standard, and it
   makes drift & the year-story sharper. *Effort S–M, local-first safe.*
2. **Later, with live sync:** capture **MCC** per transaction from the scraper and keep a
   deterministic MCC→category map as a high-confidence categorization source (above the dictionary).
   *Effort M, rides on live sync.*

## Part B — wealth streams (investments, real estate, mortgage, debt, loans, keren hishtalmut,
##          pension, broker accounts, free cash flow…)

This is a **scope pivot**, and the council flags it honestly before saying yes.

**The tension (PM):** the build gauntlet deliberately **cut net-worth/investments** as a gate-fail
(not local-first). The user is now asking for exactly that. That's their right — it's their product
— but it changes Kupa from *"a household spending tracker"* into *"a personal balance sheet / net-
worth tool."* On-mission (the original ask was literally "a personal CFO"), but a bigger, different
surface. The risk it reintroduces: the reluctant-spouse problem. Net-worth dashboards are catnip for
finance enthusiasts and invisible to everyone else. Guard the simplicity.

**Tech Lead — what's feasible under local-first:**
- **Auto-sync brokerage/pension/keren** → still a **GATE FAIL**. There is no local, free aggregator
  for Israeli pension / keren hishtalmut / gemel; the data lives on מסלקה פנסיונית and per-provider
  portals behind logins. Pulling it means a cloud aggregator → breaks local-first. **Out.**
- **Manual balances + file import** → **fully local-first and the ONLY realistic path** for these
  Israeli instruments. You update a balance monthly (30 seconds) or drop a provider statement.
  This is not a compromise — for keren/pension there IS no better option; even paid apps mostly ask
  you to type it. **In.**

**User Researcher — what people actually want here:** not live tick-by-tick portfolio value. They
want **one number that goes up** (net worth) and to know **"are we building or sinking?"** Monthly
granularity is plenty. And **free cash flow** — income minus spending — Kupa already computes from
the ledger; surfacing it as "you kept ₪X this month" is the bridge between the spending tracker and
the wealth picture, and it's nearly free.

**Design Lead — the shape that keeps it simple:** a **household balance sheet**, updated monthly.
- **Assets:** cash / checking, broker accounts, keren hishtalmut, pension & gemel, real estate (your
  estimate), other.
- **Liabilities:** mortgage, loans, credit-card debt.
- **Net worth = assets − liabilities**, one hero number, tracked as a line over time.
- **Free cash flow** from the existing ledger, shown as the monthly "engine" feeding net worth.
One new screen, a handful of editable rows, one chart. Not a Bloomberg terminal.

## Scores (RICE-lite, gates)
| Idea | R | I | C | E | Score | Gates |
|---|--:|--:|--:|--:|--:|---|
| Free cash flow surfaced (from existing ledger) | 3 | 2 | 1 | 1(S) | **6.0** | ✓✓ |
| Manual net-worth / balance sheet (assets+liabs, over time) | 2 | 3 | .8 | 2(M) | **2.4** | ✓✓ |
| COICOP 2-level category hierarchy | 3 | 2 | .8 | 2(M) | **2.4** | ✓✓ |
| Mortgage/loan amortization detail | 2 | 1.5 | .7 | 2 | 1.05 | ✓✓ (later) |
| MCC capture + map | 2 | 2 | .7 | 2 | 1.4 | ✓✓ (rides live sync) |
| **Auto-sync broker/pension/keren** | 3 | 3 | .5 | 3 | — | **GATE FAIL — not local-first** |

## The PM's call
**Yes to the wealth picture — as a manual/file-based household balance sheet, never auto-sync.** Build
it in the honest order the scores give:
1. **Free cash flow** first (S) — it's mostly built, and it's the concept bridge.
2. **Net-worth / balance sheet** (M) — assets & liabilities you maintain, one net-worth-over-time
   chart. This is the "and more" the user is really asking for, done in the only way local-first
   allows for Israeli instruments.
3. **COICOP category hierarchy** (M) — the "real categories" upgrade, independent of the above.
4. Later, riding live sync: **MCC** capture, mortgage amortization detail.

Keep auto-sync in the graveyard: not because it's unwanted, but because it cannot be done without
breaking the one promise (local-first) that makes this app safe to hold a household's whole finances.
