# Round 1 — Panel

Seven seats. Each speaking in first person, each trying to kill the spec in `01-artifact.md`.
No seat may repeat another's finding.

---

## 1. The Spouse Who Didn't Ask For This — dimension 6, **3/10**

**Worst thing:** It's a website that waits. Nothing about it ever reaches me.

**Kill shot:** To get value from this I have to (a) be physically at home, (b) remember that
`kupa.local:3000` exists, (c) type it into a phone browser, and (d) *choose* to go look at our
spending. Nobody in the history of the world has spontaneously decided to browse to a finance
dashboard. Every screen in section 7 is pull. There is not one push in the entire spec. I will
open it once, in week one, because he asks me to. Then never.

**Highest-leverage change:** Stop building a place I have to go. Build something that arrives.
The home-network-only constraint is on *inbound* access — it says nothing about the app sending
outbound. A weekly message to the two of us with three numbers in it would beat the entire
dashboard for me, and it doesn't open a single port.

**Score justification:** The app has no path to its second user at all. This is not a weak
feature, it is a missing one, and I'm half the household.

---

## 2. The Week-Three Abandoner — dimension 2, **5/10**

**Worst thing:** The friction budget is described for the steady state and undefined for the only
week that decides anything.

**Kill shot:** Day one, the scrapers backfill. Isracard alone returns about twelve months of card
history — call it 800 transactions across all accounts, and *not one of them* has a rule yet,
because rules are built from corrections and I have made zero corrections. Section 4 sends
everything without a match to the review queue. So the "under five minutes" screen opens with
something like 300 items. I clear forty. I come back the next evening and clear thirty. On the
third night I don't come back. Section 4 says the queue "shrinks over time by construction" —
true, and completely irrelevant, because I quit during construction.

**Highest-leverage change:** Make the queue a hard budget, not a screen. It shows at most N items,
ranked by how much money the answer moves. Everything below that line gets a provisional category
and never asks me. Being 92% right silently beats being 100% right with my help, because I'm not
going to help.

**Score justification:** Steady state is plausibly fine. Cold start is unsurvivable, and cold
start is the whole risk.

---

## 3. The Bank-Integration Realist — dimension 5, **5/10**

**Worst thing:** The spec knows scrapers break and still has no concept of data freshness.

**Kill shot:** In March, Leumi adds an SMS OTP step to their login flow. The 03:00 Puppeteer job
now sits on a screen it has never seen, times out after ninety seconds, and writes a stack trace
to a log file that nobody has ever opened. Section 2 says "one failure doesn't stop the others" —
so the other banks sync fine and the app looks completely healthy. The dashboard in section 7
renders totals happily. In May you make a real decision about your spending on numbers that are
two months stale, and nothing on the screen tells you. The spec has `last successful sync` on the
Account model and then never shows it to anyone.

Two more you haven't budgeted for: several Israeli banks require an OTP on *every* login, not just
new devices — for those, unattended nightly scraping is not possible at all, and the spec has no
plan B. And the backfill window is not twelve months everywhere; some bank endpoints give you
three, which matters enormously for section 6.

**Highest-leverage change:** Freshness becomes a first-class, always-visible property of every
number on screen. A total assembled from stale accounts must say so, next to the total, in the UI
— not in a log. And decide the OTP story now, because it determines whether "nightly and
unattended" is even a thing you can promise.

**Score justification:** Correct instinct on the fallback path, no instinct at all on failing
loudly.

---

## 4. The Security Engineer — dimension 3, **4/10**

**Worst thing:** Section 9 puts live bank credentials in a `.env` file, and section 7 puts the
whole financial history behind no authentication at all.

**Kill shot:** Two, and they compound. First: `.env` sits in a docker compose project next to a
git checkout. It survives exactly until someone runs `git add -A` with a typo'd gitignore, or the
Mac mini's home directory gets picked up by a backup, or someone pastes `docker compose logs`
into a support thread. These are not exotic; they are Tuesday. Bank credentials are not an API
key you rotate — they are the login to the household's actual money.

Second: "no login, the network is the perimeter" is a sentence that assumes the network has a
perimeter. It has a smart TV, a robot vacuum, a printer that has not been patched since 2019, and
every guest who has ever been given the WiFi password, including the kid's friends. Any of them
can fetch your complete transaction history over plain HTTP with a browser.

Third, and nobody else here will catch it: sections 8.5 and 8.6 feed raw transaction descriptors
into an LLM that answers questions. A merchant descriptor is **attacker-controlled text**. A
₪3 charge with a descriptor crafted as an instruction is a prompt injection with a delivery
mechanism that costs three shekels.

**Highest-leverage change:** Credentials into the OS keychain, never the filesystem. Then a single
shared household passcode on the app — not because you fear each other, but because the perimeter
you're relying on is a lie. And treat every descriptor as hostile data, never as instructions.

**Score justification:** The local-first decision buys a genuinely small attack surface, and the
spec then spends that advantage on a `.env` file and an open port.

---

## 5. The Accountant — dimension 1, **4/10**

**Worst thing:** Your monthly spending number is going to be close to double the real figure, and
nothing in this spec will notice.

**Kill shot:** The Israeli credit card model. Isracard, Max and Cal don't debit per purchase —
they aggregate and take **one consolidated monthly debit** from the bank account. So the nightly
run ingests the same money twice: 140 individual card purchases from the card scraper, *and* a
single ₪8,400 line from the bank account scraper. Section 3 lists "Transfers" as one of fourteen
categories, and then not one word anywhere in the spec detects a transfer, matches it to the
statement it settles, or nets it out. Your dashboard will confidently report ₪8,400 of grocery-
and-petrol spending plus ₪8,400 of unexplained outflow and call it a month.

The same bug, smaller, every time you move money between your own two bank accounts: one shows as
income, one as expense, and your "income vs expenses" — the literal thing the app is named for —
is wrong in both directions.

And there is no reconciliation anywhere. The bank tells you its closing balance. You have every
transaction. Those two numbers should agree, and if they don't, that is the single most important
thing the app could possibly tell you. Section 3's `MonthSnapshot` freezes totals without ever
checking them against reality.

**Highest-leverage change:** Internal-transfer detection is not a feature, it is a precondition.
Match card statements to their settling debit; match own-account pairs by amount, date proximity
and opposing sign; exclude the whole class from income and expense. Then reconcile every account
every month against the bank's own closing balance and show the delta.

**Score justification:** Integer agorot is right and I'll give credit for it. It's the correct
answer to the second-most-important question. The most important one isn't asked.

---

## 6. The Agent Skeptic — dimension 4, **4/10**

**Worst thing:** Six agents, two of which are real.

**Kill shot:** Let me go down the list. **5 (Budget Advisor)** and **6 (Insight Chat)** are the
same agent described twice, and that agent is a chat box over a SQL query. Neither has a trigger;
both wait to be asked; the household that never opens the dashboard is certainly never going to
interview it. **3 (Month Narrator)** writes prose at month close. Prose is what people skim. It
will be three paragraphs restating numbers that are on the screen above it. **4 (Anomaly
Watcher)** fires on the annual car insurance payment, the twice-yearly arnona, and the flight
booking, and gets muted in month two, which is the standard life cycle of every anomaly detector
ever shipped without a seasonality model.

That leaves **1 (Categorizer)** and **2 (Drift Analyst)**, both of which are genuinely good: real
trigger, unattended, and the app is visibly worse without them.

Nobody has costed this either. Section 4 says novel merchants go to an LLM. The abandoner just
told you day one has ~800 transactions; if a third are novel merchants that is a single burst
you've never sized, and thereafter a trickle you've never sized. If you can't tell me the monthly
number, you don't know whether the AI costs more than the drift it finds.

**Highest-leverage change:** Delete four agents. Keep the two that work unattended, and spend the
recovered effort making the Categorizer's rule-learning genuinely good, because that is the
product. Then put a shekel figure on monthly token spend in the spec.

**Score justification:** Two real agents is two more than most specs have. Four passengers is four
too many.

---

## 7. The Craft Critic — dimension 7, **5/10**

**Worst thing:** The moment of maximum enthusiasm is aimed at the worst screen the app will ever
render.

**Kill shot:** Setup night. He's spent an hour getting Docker running and the scrapers connected,
and he calls her over to look. The dashboard loads: "this month vs last month" comparing four days
against a partial month, category bars that are mostly one grey "Uncategorized" block because
nothing has been through the pipeline yet, and the drift panel — the actual headline feature,
section 6 — showing nothing, because it needs six months of history to say anything and has four
days. The single best chance this app will ever get to justify itself renders as three empty
states in a trench coat. Section 10's rollout plan builds the dashboard in week 3 and drift in
week 4, so nobody will even see this problem until it's the finished product.

There is no design thinking in this spec at all. Section 7 is four nouns. What is the one number
that should be largest on the page? What does a good month look like versus a bad one at a
glance, from across the room? Which of these screens does anyone open twice?

**Highest-leverage change:** Design the zero-data and low-data states *first*, as the primary
case, not as a degraded one. On night one the app has twelve months of backfilled history — that
is genuinely interesting material and the spec treats it as nothing. Lead with what it can say on
day one, not with what it can say in month six.

**Score justification:** Structurally sensible, visually unimagined, and actively worst at the
moment it matters most.
