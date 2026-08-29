# Round 3 — Panel

Seven seats against `03-artifact.md`. Findings genuinely resolved in round 3 are not re-raised.

---

## 1. The Spouse Who Didn't Ask For This — dimension 6, **8/10**

**Worst thing:** Every single thing this app will ever say to me is bad news.

**Kill shot:** Read §5.1's table as a list of the only reasons I will ever hear from it. A drift
flag appeared. The week was expensive. Reconciliation broke. An account went dark. Explainability
fell. That is five conditions and all five are problems. The monthly close will arrive with a
number and, given §11's framing, most often the words "above your normal."

So over six months I receive maybe eleven messages, every one of which tells me something is wrong
with our money. In most households money is the single most loaded subject there is, and you have
built a channel that only ever opens to raise it. I will not mute this out of boredom the way
round 2's version would have. I will mute it out of aversion, which is faster and much harder to
undo. And he will notice I muted it, and that will be its own conversation.

Round 2's version was ignorable. This one is unpleasant. I am not sure that's an improvement.

**Highest-leverage change:** At least one trigger must be capable of carrying good news — a week
that came in below baseline, a drift flag that **closed**, a month that landed under normal, the
explainability climbing back. And when the monthly close has something good in it, that goes
first. The app is allowed to notice when we did well. Right now it is structurally incapable of it.

**Score justification:** §5.2 is exactly right — the message stands alone, so my one curious Sunday
away from the house isn't wasted on a dead link. And silence-by-default is the correct instinct.
The tone is now the problem, and tone is not a detail in this particular subject.

---

## 2. The Week-Three Abandoner — dimension 2, **8/10**

**Worst thing:** One category per merchant is a modelling decision the spec never admits it made.

**Kill shot:** §4 is merchant-level throughout — the confirmed merchant *is* the category. Now:
Shufersal and Rami Levy are together maybe a fifth of our spending, and I confirm them as
"Groceries" in §4.2's twenty taps, because that's what they mostly are. But the ₪800 barbecue, the
kids' school supplies, the ₪300 of household goods, the toys — all Shufersal, all now Groceries,
forever, with no mechanism anywhere to say otherwise.

So §4.3's explainability score reads 97% and feels great, while the category breakdown driving
§6's drift analysis is quietly wrong for the largest merchants in the house. Worse: this
misclassification is *stable*, so drift won't catch it either — it's baked into both baselines.
The app is confidently precise about a number that isn't right, which is the one failure mode
§4.3 was invented to prevent.

**Highest-leverage change:** Let the merchant category be a **default, not a verdict.** Same twenty
taps at onboarding, but a per-transaction override that is one tap from the transaction list, and
an amount-band rule for the merchants where it matters (Shufersal under ₪250 is groceries; above
that, ask once). And explainability should count "confirmed merchant" and "confirmed transaction"
differently, because they are not the same claim.

**Score justification:** The queue budget, the non-compounding skip, and refusing to enlarge the
queue when explainability drops are all correct and humane. The taxonomy underneath them is
coarser than the questions being asked of it.

---

## 3. The Bank-Integration Realist — dimension 5, **8/10**

**Worst thing:** Two dependencies with no owner, and a failure mode that trains the household to
ignore the alarm.

**Kill shot:** First, `israeli-bank-scrapers` is a volunteer open-source project. When Hapoalim
redesigns their login in the middle of a Tuesday, the household's entire financial visibility now
depends on when a stranger has a free evening. §2's `import` fallback covers the data, and I gave
credit for that — but nothing in the spec says who maintains the scraper layer, what happens if
the project goes quiet for six months, or that the household has just taken a hard dependency on
someone else's hobby. Add a headless Chromium on a Mac mini that keeps taking OS updates and a
Node runtime that keeps moving, and the *quiet* failure mode here is a slow one: it works for
fourteen months and then it doesn't, and by then nobody remembers how any of it was set up.

Second, and sharper: §2's `assisted` mode prompts monthly for an OTP. Say he's travelling, or just
busy, and misses it. The account crosses §9's 10-day threshold and is "presented as broken." §5.1
then fires the weekly digest on "account went dark" — **every week, until he does it.** The app's
response to a person being busy is to message them weekly about it. Three weeks of that and the
channel is trained, which costs you far more than the stale account did.

**Highest-leverage change:** Own the scraper dependency explicitly — pin the version, vendor it,
and write down the "it broke and nobody's fixing it" procedure, which is: everything degrades to
`import`, and the app says so once. And make repeat alerts decay: an account that has been dark
for three weeks is not new news. Say it once, then fold it into the monthly close.

**Score justification:** §2.1's scrape-window trap is a genuinely good catch — silent loss past the
far end of the window is the kind of thing you only find after losing a year. Sync modes and
auto-demotion are right. What's missing is who holds the pager.

---

## 4. The Security Engineer — dimension 3, **7/10**

**Worst thing:** §7 fixes a Kupa-sized problem by creating a device-sized one, and scores it as
progress.

**Kill shot:** Installing an `mkcert`-style **local CA on both phones** does not scope to this app.
A trusted root CA on a phone can vouch for *any* domain. So that CA's private key — which lives on
the Mac mini, in the same house, on the same box as the bank credentials — is now capable of
silently intercepting both adults' entire HTTPS traffic. Their actual banking apps. Their email.
Everything.

Before §7, compromising the Mac mini got you the household's bank logins, which is bad. After §7,
compromising the same box additionally gets you a persistent MITM position against both people's
phones for as long as that root stays installed, which most people never remove. You have taken a
plaintext-passcode-on-the-LAN problem and paid for it with a blast radius several times larger.
This is a real and common own-goal and I'd rather you shipped plain HTTP than this.

**Highest-leverage change:** Never install a private CA on a personal device. Get a **real
certificate for a real subdomain via a DNS-01 challenge** — the DNS record points at the LAN
address, the challenge is answered over DNS, nothing inbound is ever exposed, and both phones
trust it because it's genuinely trusted. This is a well-worn pattern, it costs a domain you may
already own, and it has none of the CA problem.

**Highest-leverage change, second:** §5.3 is the best thing in this document and I want to say so
plainly — naming the trade, refusing to promise a retention policy you cannot enforce, and
isolating the bot token from the bank credentials is exactly the standard. Hold that line.

**Score justification:** Genuine gains on the privacy trade, token isolation and injection
containment. One new self-inflicted wound that is larger than the thing it patched.

---

## 5. The Accountant — dimension 1, **8/10**

**Worst thing:** Round 2's reconciliation could never fail. Round 3's will fail every single day.

**Kill shot:** §3.6 checks `balance(d) − balance(d−1) == Σ transactions dated d`. Israeli banks
post transactions with a **value date** (תאריך ערך) that routinely differs from the booking date —
by a day, by three days over a weekend, longer around holidays. The balance moves on one date; the
transaction is stamped with the other. Cheques, standing orders and card settlements are the worst
offenders, and card settlement is the single largest line in the month.

So the identity in §3.6 will not hold on ordinary, completely correct data. It will report a delta
most days of the week. §3.6 then marks the month unreconciled, §5.1 fires the weekly digest on
"reconciliation broke," and §11 puts reconciliation status permanently on the dashboard. Within
two weeks the household has learned that the honesty indicator is noise, and the one time it means
something they will not look.

You have corrected a check that could never fail into a check that can never pass. The bug is
mirrored, and the second version is more damaging than the first, because the first was silent and
this one is loud.

**Highest-leverage change:** Reconcile over a **window, not a day** — a rolling 7-day sum absorbs
value-date shift while still catching a genuinely missing transaction. Store both dates on every
transaction (`booking_date`, `value_date`) and reconcile balances against value date, since that
is what the balance actually moves on. And put a tolerance and a *diagnosis* on the delta: "we are
short one transaction of about ₪X around the 14th" is actionable; "unreconciled" is not.

**Score justification:** §3.2's refusal to pick, the directional matcher, §3.4 on FX and §3.5's
explicit restatement policy are all exactly right, and restatement in particular is a piece of
rigour most commercial products don't bother with. The ledger is now trustworthy. The thing that
validates the ledger is miscalibrated.

---

## 6. The Agent Skeptic — dimension 4, **7/10**

**Worst thing:** The gate is correct, and it means the headline feature is silent for nine months.

**Kill shot:** §6 needs whole months on both sides over a stable account set. §2 says some
institutions backfill three months. So the earliest a stable six-month span exists is roughly month
three-to-nine depending on the account, and realistically the first true drift report lands
somewhere around **month nine**. Job 2 of two — "is our normal getting more expensive," the
reason drift is the headline — produces literally nothing for most of the first year.

I agree with the gate. I'd rather have honest silence than a false first insight. But "correct and
silent for nine months" is not a product, it's a promise, and the household in question has
already failed to sustain a spreadsheet. Something has to answer job 2 earlier, or job 2 isn't
being delivered in the timeframe where this app is still being used.

Note also that I have now been deferred twice on cost. I still cannot tell you what a month of
Categorizer traffic runs, or whether it is small next to the ₪280/month §5.1 advertises finding. I
will not score this dimension above 8 until someone puts a shekel figure on it.

**Highest-leverage change:** Ship a weaker, honest job-2 answer that works from month one:
month-over-month category movement with explicit "this is one month, not a trend" framing. It is
not drift and must not be labelled drift, but it gives the household something real while the real
thing gestates. Then let true drift supersede it when the gate opens — and mark that as an event
worth a message, because it is.

**Score justification:** Two agents, both unattended, both with real triggers, one of which now
refuses to lie. That's the right roster and right discipline. It just doesn't do the job yet.

---

## 7. The Craft Critic — dimension 7, **7/10**

**Worst thing:** This is an app for an Israeli household and there is not one word about Hebrew in
it.

**Kill shot:** Every merchant descriptor coming out of Leumi, Isracard and Max is Hebrew. Every
amount is Latin numerals. Every one of those strings is **bidirectional text** — Hebrew merchant,
Latin digits, sometimes a Latin brand name inside a Hebrew string — and bidi is where naive UIs go
to die: parentheses land on the wrong side, a trailing colon jumps to the start of the line, and a
truncated merchant name truncates from the wrong end.

Now put that on §4.2's twenty-merchant confirmation screen, which is the most important screen in
the entire onboarding and the first real thing either adult ever touches. Twenty rows of Hebrew
merchant names, right-aligned amounts, in a layout that §11 describes entirely in the vocabulary
of a left-to-right app. It will look broken, and "looks broken" at minute forty of setup is fatal
in a way no later polish recovers.

Nothing anywhere says whether the interface is in Hebrew or English, and it is a real question for
a bilingual household — the categories in §3 are named in English and nobody has asked whether
they should be.

**Highest-leverage change:** Declare RTL a first-class requirement, not a localization pass: layout
direction, bidi-safe rendering of every merchant string, correct truncation, and numerals that
stay legible in an RTL row. Decide the interface language explicitly and name the 14 categories in
it.

**Score justification:** §10's retrospect-first inversion is the single best idea in this document —
leading with twelve months you already have instead of four days you don't is exactly right — and
§11's "the hero is the delta, not the total" is the second best. Both are real craft. The app is
then specified as though it were for an English-speaking household, which it is not.
