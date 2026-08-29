# Round 4 — Panel

Seven seats against `04-artifact.md`.

---

## 1. The Spouse Who Didn't Ask For This — dimension 6, **9/10**

**Worst thing:** I am still an audience, not a user.

**Kill shot:** Go through the spec and find one thing I can *do*. The OTP prompt goes to the primary
user. The twelve-item weekly queue is his. The per-transaction override in §4.1 is on the dashboard,
which is at home, which is his machine. Setup is entirely his. My whole relationship with this app is
receiving messages about it.

So: six months in, I have read forty messages and never once acted on one. In March I want to know
what that ₪1,200 was, and the only path is to ask him — which is the exact dynamic where one person
owns the money and the other asks about it, and that is the dynamic we are supposedly fixing. The
app has made the asymmetry more legible without changing it.

**Highest-leverage change:** Give me one thing I can do **from inside the message**. The bot channel
is already there and it is already outbound-initiated — the app polls Telegram, so accepting a reply
opens no inbound port and costs nothing against the home-network-only decision. Let me reply
*"what was the ₪1,200 on the 14th"* and get an answer in the channel. One action, in the place I
already am, and I stop being a spectator.

**Score justification:** The two-sided triggers are exactly right, and the good-news bar being
*lower* than the bad-news bar is the single most thoughtful line in this document — someone
understood that a household which has never tracked anything needs encouragement more than warnings.
Decay fixes the nagging. What's left is that I can receive but not touch.

---

## 2. The Week-Three Abandoner — dimension 2, **8/10**

**Worst thing:** Setup grew into an evening project, and it now has a step that can stop me dead for
two days.

**Kill shot:** Count what §13 and §7 now require before this app does anything: Docker running on a
Mac mini; credentials for three to six institutions; discovering each one's sync mode by trial;
**a real domain I have to own**; a DNS provider API token; DNS-01 cert issuance and automated
renewal; a Telegram bot token; three separate keychain entries. The rubric says setup under an hour.
This is not an hour.

And it fails in the worst possible shape. I start on a Tuesday night, get the scrapers running, feel
good — then hit DNS-01 and discover I need a domain I don't own. I buy one. I wait for propagation.
Thursday I come back and can't remember where I was. There is no partial state that is *useful*: the
spec's value all arrives at the end, so a setup I abandon at 80% gives me nothing at all, and I have
now spent two evenings to be exactly where I started. That's not a friction problem, that's the
project becoming the thing instead of fixing the thing.

**Highest-leverage change:** Stage the setup so each stage ships value on its own. **Stage one is one
bank and the twelve-month retrospect, tonight, in twenty minutes, over plain HTTP on the LAN.** That
alone is more than we have ever had. Certificates, the bot, the other accounts, assisted mode — all
later, all optional, all additive. An app that is useful after step one is an app I finish setting up.

**Score justification:** Amount bands and the split explainability score are both genuinely good
fixes, and the queue discipline is right. The app is now excellent once running and considerably
harder to start.

---

## 3. The Bank-Integration Realist — dimension 5, **9/10**

**Worst thing:** Three things now break on independent schedules, and the health check for them is a
reminder aimed at a human — which §5.2 just finished establishing that humans ignore.

**Kill shot:** The pinned scrapers break when a bank redesigns. The DNS-01 certificate expires every
ninety days. The Mac mini takes an OS update that moves the Node runtime or breaks headless
Chromium. Independent clocks, no common alarm.

Now the specific failure: the certificate expires while he's abroad. The web app becomes unreachable
on both phones. **And the digest keeps sending perfectly**, because §5 is outbound and doesn't touch
the cert. So the app is half-dead and its only voice is the healthy half, cheerfully reporting
numbers. Nobody notices for a month. §2.1's quarterly liveness check is the mitigation, and it is a
calendar reminder — the single least reliable mechanism in this entire document, in an app whose
premise is that this household does not reliably do recurring financial chores.

**Highest-leverage change:** One nightly self-check covering every dependency — scraper liveness per
institution, cert expiry runway, disk, the last successful run of each job — and report it **through
the channel that survives every one of those failures**, which is the outbound digest. The insight
generalizes: the digest is the only surface guaranteed to work when other things are broken, so it
is where health belongs. Replace the human reminder entirely.

**Score justification:** Vendoring and pinning the scrapers, and writing the "nobody is fixing it"
procedure down, is exactly the right answer to a hobby-project dependency. The escape hatch to
`import` means data is never lost. The monitoring is the soft spot.

---

## 4. The Security Engineer — dimension 3, **9/10**

**Worst thing:** The DNS provider token in §13 is scoped to the whole domain, and it is sitting on
the same box as the bank credentials.

**Kill shot:** DNS-01 requires a token that can write TXT records. If that token is scoped to the
zone — which is the default at most registrars, and what anyone following §7 will end up with —
then whoever gets that box can write **any** record for **any** name in the domain. If the household
uses that domain for email, that includes MX. So the attacker issues themselves a valid certificate
for the domain, redirects mail, and does password resets against every service the household owns.

Round 3's local CA was a device-wide compromise; this is a domain-wide one. Smaller, and the same
species of mistake: reaching for a convenient credential without asking what else it unlocks. The
fix is cheap, which is why it's worth doing: scope the token to the single `_acme-challenge`
subdomain if the provider supports it (most now do), or use `CNAME` delegation to a throwaway zone
that controls nothing else. Either way the token's blast radius becomes one certificate.

Minor, while I'm here: the public A record pointing at a private LAN address publishes the
household's internal addressing and confirms the hostname exists. Not dangerous alone, and worth
knowing you're doing it.

**Highest-leverage change:** Scope or delegate the ACME credential. And apply the general rule this
is the third instance of: **every credential this app holds should be the narrowest one that does
the job** — the scrapers are read-only, the bot token is isolated, and now the DNS token needs the
same treatment.

**Score justification:** Removing the private CA was the right call and the reasoning in §7 is
correct. §5.4 remains the best-written section in the document — naming a trade you'd rather not
name, and refusing to promise a retention policy you can't enforce, is the standard I'd want and
rarely get.

---

## 5. The Accountant — dimension 1, **9/10**

**Worst thing:** §3.6's diagnosis claims a precision the method does not have.

**Kill shot:** The example output is *"missing one transaction of about ₪840, somewhere between the
11th and the 14th."* But the check is a **rolling seven-day sum**. When a seven-day window fails,
what you know is that the discrepancy lies somewhere in those seven days — not in a three-day
sub-range. To narrow it you'd need daily balances that reconcile individually, which is precisely
what value-date shift prevents. So the app will state a date range it cannot support, and the first
time he goes looking in that range and finds nothing, the diagnosis loses its credibility along with
the delta it was explaining. Say seven days, or narrow it by successive overlapping windows and
actually do the work — but don't quietly claim three.

Two smaller ones. **The gap case is undefined:** §3.6 says a missing-snapshot window reconciles "at
lower resolution" and never says what that means. **Month boundaries:** a rolling window straddles
month ends, so a delta surfaced on the 3rd may belong to a month already closed and already reported
in the monthly digest. §3.5's restatement machinery covers it correctly, but §3.6 and §3.5 never
mention each other, and the person implementing this will not connect them.

**Highest-leverage change:** State the resolution you actually have. Narrow by overlapping windows
where the data supports it and say seven days where it doesn't. Then wire §3.6's late deltas
explicitly into §3.5's restatement path so a reconciliation finding against a closed month is a
restatement, not an orphan.

**Score justification:** Storing both dates and reconciling on value date is exactly right, and the
tolerance plus the self-resolving-delta suppression will prevent most of the false alarms. The ledger
is sound; the reporting of its one weak spot overstates itself.

---

## 6. The Agent Skeptic — dimension 4, **9/10**

**Worst thing:** You proved cost is irrelevant and then didn't spend any of it.

**Kill shot:** §8.1 is the right answer and I'll say so — fourteen thousand tokens a year, fifty
agorot at Opus pricing, and the correct conclusion that model choice is a quality decision. I asked
for a number and I got a number that changes the design. Good.

But now follow it. If a year of inference costs ₪0.52, then §4's rule that **only novel merchants**
reach the model is a constraint inherited from a cost model that no longer exists. The Hebrew
descriptor problem means the first pass over 120 abbreviated, inconsistently-transliterated merchant
names is exactly where errors concentrate — and those errors become confirmed merchant defaults that
persist forever, in both drift baselines, per §4.1's own warning about stable misclassification.
Re-running the entire merchant table costs about four agorot. There is no reason not to do it
annually, or after any run where the household's corrections disagree with the model more than
usual.

I'll also concede a point against myself: Opus 5 for a thirteen-way classification looks like
overkill, and on latency it would be. It's a nightly batch job with nobody waiting, so it isn't.

**Highest-leverage change:** Add periodic re-verification of the merchant table now that it is free.
And use the corrections the household already makes as a quality signal — a rising disagreement rate
is the app telling you its categorizer has drifted, which is worth knowing.

**Score justification:** Two agents, both unattended, both earning their seat, one of them needing no
inference at all — and the cost question answered decisively enough to change a decision. That's the
dimension working.

---

## 7. The Craft Critic — dimension 7, **8/10**

**Worst thing:** The single largest element on the primary screen is the exact bidi case §10 warns
about, and the spec walks straight into it.

**Kill shot:** §12's hero is **"₪1,400 מעל הרגיל שלכם"** — a currency symbol and Latin numerals
embedded inside a Hebrew RTL sentence. That is textbook bidirectional text: the ₪ can render on the
wrong side of the digits, and a naive layout will place the number at the wrong end of the phrase
entirely. §10 correctly declares direction isolation a requirement for merchant strings, and then
§12 constructs the app's most important string the same way and doesn't apply it. The biggest text
on the biggest screen is the one most likely to look wrong.

And the deeper one: **the app has only one designed emotional state, and it is bad.** §12's hero is
"₪1,400 above your normal." §5.1 finally learned to *say* good news; §12 has no visual language for
it. Below-normal will render as the same treatment with a smaller number or a minus sign, which
reads as a lesser failure rather than a success. A household that has never tracked anything and
finally comes in under their baseline should open that screen and *feel it* — different colour,
different weight, a different sentence. Right now the good month and the bad month are the same
design with different data.

**Highest-leverage change:** Specify the hero as a composed element with explicit direction
isolation, not an interpolated sentence — and mock it in both languages before building it. Then
design the below-normal state as its own thing, with equal care to the above-normal one. Two states,
both intentional.

**Score justification:** §10 is a real fix — declaring RTL a requirement rather than a pass, and
dropping Transfers from the taxonomy once it became a `flow_class`, are both right. §11's retrospect
and §12's delta-as-hero remain the two best ideas here. The execution of the hero contradicts the
requirement stated two sections earlier.
