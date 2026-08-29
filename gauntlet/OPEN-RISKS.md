# Open risks

Written at convergence, per `GAUNTLET.md`. Seven residual findings from round 6's panel — none
blocking, none resolvable by another rewrite. An honest list of holes is worth more than a green
check that lied.

Severity: **high** = could make the app fail at its job · **medium** = degrades it materially ·
**low** = worth watching.

---

## 1. Every judgement about the second user is a model of her — high

**Seat:** Spouse · **Owner:** the household, at stage 3

Six rounds of design decisions rest on assumptions about a person who has not been consulted: that
she'll read a digest, that she'll reply to a bot, that silence reads as reassurance, that aversion
mutes faster than boredom. The panel's Spouse seat is a construct, refined by other constructs.

**What would close it:** ship stage 1, then stage 3, and watch whether she ever replies to the bot
unprompted. That single observation is worth more than the entire dimension-6 argument. Staging
makes the test cheap — ten minutes to find out.

**Why it isn't fixed in the spec:** it cannot be. It is an empirical question wearing a design
question's clothes.

---

## 2. The weekly queue is still a weekly obligation — high

**Seat:** Abandoner · **Owner:** the household, months 1–3

Twelve items a week, non-compounding, skippable, ranked by money moved — every mitigation the design
can offer is in place. But this household's stated history is of not sustaining exactly this kind of
weekly financial obligation, and no amount of design discharges that.

**What would close it:** three consecutive months where the queue is cleared, or evidence that
skipping it doesn't degrade explainability below 95%. The second outcome would be the better one —
it would mean the auto-assignment is good enough that the queue is optional.

**Watch:** if explained % drifts down while attributed % holds, the household has stopped confirming
and the app is running on defaults.

---

## 3. The scraper dependency is managed, not removed — high

**Seat:** Realist · **Owner:** whoever maintains the box

`israeli-bank-scrapers` is a volunteer project. Pinning, vendoring, a written failure procedure and
the `import` escape hatch mean the household never loses *data* — but the realistic month-fourteen
state is three institutions redesigned, nothing fixed upstream, and everything on monthly file
imports. The app is built to survive that and to say so, which is the most a spec can do.

**What would close it:** nothing, permanently. Reduce it by keeping §2.1's parsers genuinely good,
so the degraded state is tolerable rather than fatal.

---

## 4. A household that stops at stage 3 forever — medium

**Seat:** Security · **Owner:** the household

Stage 4 (TLS via DNS-01) is optional, requires a domain, and is the stage most likely to be skipped.
Until it's done, the household passcode crosses the LAN in the clear — on the network whose
untrustworthiness justified having a passcode. The app states this in its own settings screen, which
is right and does not make it false.

**What would close it:** completing stage 4. Failing that, accept it knowingly — the threat is a
compromised device on the house network, not the internet, since nothing is exposed inbound.

---

## 5. Stage 1 is structurally unreconcilable — medium

**Seat:** Accountant · **Owner:** design, accepted

`import` accounts carry transactions, not a balance feed, so §3.6 cannot reconcile them at all — and
stage 1 is entirely `import`. §3.6.1 labels this honestly and reports coverage as share of spend.
The residual is behavioural: whether anyone reads an honesty indicator.

**What would close it:** reaching stage 2 on at least the accounts carrying most of the spend. Watch
the coverage percentage — if it stays near zero past month two, the app is reporting numbers it
cannot check.

---

## 6. The Answerer is measured but not bounded — low

**Seat:** Skeptic · **Owner:** implementation

Question volume is now instrumented, so §8.1's ten-a-month becomes an observation rather than an
assumption. But nothing caps it. A household that discovers it enjoys asking, or a retry loop that
misbehaves, has no ceiling. At roughly ₪5.60/year the exposure is a rounding error, which is why it
didn't change the spec — but "measured" and "bounded" are different claims and only the first is
true.

**What would close it:** a daily question cap with a friendly refusal. Ten minutes of work; do it if
the instrumentation shows anything surprising.

---

## 7. The palette validates; the screen has never been rendered — low

**Seat:** Craft · **Owner:** stage 4 of the build

§12.2's blue↔red pair passes all six checks in both modes (protan ΔE 21.6 light / 19.2 dark against
a target of 8), with four distinguishing channels so hue never carries meaning alone. That is a
measurement, not a taste claim. But a validated palette is not a screen that reads well, and §12.1's
composed hero explicitly promises "mocked in both languages before it is built" — a promise the spec
correctly makes and cannot keep on paper.

**What would close it:** render the hero in Hebrew RTL and English LTR, in light and dark, and look
at it. The first genuine craft judgement in this project happens the first time something is on a
screen.

---

## Not on this list

Everything the gauntlet actually fixed — the card-settlement double-count, the missing second-user
path, both broken reconciliation checks, the false-drift-in-month-two problem, the private CA, the
one-sided digest, the zone-wide ACME token, the missing bot allowlist, the decayed health alerts,
and red/green as a sole distinction. Those are in `rounds/06-score.md` under *What the gauntlet
actually caught*, with the round and seat that found each one.
