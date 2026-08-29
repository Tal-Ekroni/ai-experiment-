# Round 6 — Panel *(confirmation round)*

Seven seats against `06-artifact.md`. Convergence requires the bar cleared **and no finding that
changes the artifact**. Each seat states explicitly whether its finding is **blocking** (must change
the spec) or **residual** (a real risk that belongs in `OPEN-RISKS.md`, not in another rewrite).

---

## 1. The Spouse Who Didn't Ask For This — dimension 6, **10/10**

**Finding — residual.** Acknowledge-then-answer fixes the silence ambiguity, and the allowlist means
the channel is actually ours. I can ask, from anywhere, and get a real number back.

What I'd still watch, and it is not a spec problem: I have never used this. Every judgement in this
document about what I will and won't do is a model of me, built by him, refined by a panel that
also contains no actual me. The staged setup means you'll find out cheaply — stage 3 is ten minutes
— but the finding is that the thing most likely to be wrong here is the assumption set about the
person who didn't ask for it. Ship stage 1, watch whether I ever reply to the bot, and treat that as
the real score.

**Not blocking.** Nothing in the spec should change; this is a thing to measure after it ships.

---

## 2. The Week-Three Abandoner — dimension 2, **9/10**

**Finding — residual.** §2.1 is the right answer: named parsers with fixtures, a column-mapping
fallback, content sniffing for `.xls`-that-is-HTML, sign detection from the data. Thirty seconds
instead of an evening.

What survives: **the twelve-a-week queue is still a weekly obligation**, and this household's entire
history is of not sustaining weekly financial obligations. Everything in the spec is designed to make
that twelve minimal, non-compounding and skippable — and I believe it will work — but it is an
assumption the spec cannot discharge on paper. The honest position is that friction is a 9 and
becomes a 10 or a 6 based on data nobody has yet.

**Not blocking.** The design is right; the risk is empirical.

---

## 3. The Bank-Integration Realist — dimension 5, **9/10**

**Finding — residual.** The severity tier fixes the interaction I raised: broken re-states and leads
every send, chores decay. That is exactly right and it closes the hole.

What cannot be closed by any rewrite: `israeli-bank-scrapers` is a volunteer project, and pinning
plus vendoring plus a written failure procedure is **managing** that dependency, not removing it.
The realistic long-run failure is still that in month fourteen three institutions have redesigned,
nobody upstream has fixed them, and the household is on monthly file imports. The app is designed to
survive exactly that and to say so — which is the most any spec can do — but nobody should call this
solved.

**Not blocking.** Inherent, disclosed, and mitigated as far as it can be.

---

## 4. The Security Engineer — dimension 3, **10/10**

**Finding — residual.** The allowlist closes the hole I found, and §5.4 now states the intent-schema
boundary precisely rather than claiming a separation it hadn't specified. Schema-validate then
refuse-don't-repair is the correct posture.

What remains is inherent and correctly disclosed: bank credentials live on a machine in a house, and
a household member's compromised laptop on the same LAN reaches an app whose passcode is plaintext
until stage 4 is done — which is optional and may never be done. §2 states this in the app itself,
which is the right call and does not make it untrue. The residual risk is a household that stops at
stage 3 forever.

**Not blocking.** §5.6 remains the strongest section in this document — naming a trade you'd rather
not name, refusing to promise a retention policy you cannot enforce, and isolating the credential.
That is the standard.

---

## 5. The Accountant — dimension 1, **10/10**

**Finding — residual.** §3.6.1 is what I wanted and slightly more: reporting coverage as **share of
spend** rather than share of accounts is the correct denominator, because one unreconciled card can
be most of the money, and I did not say that — the spec worked it out.

The ledger is now sound end to end: integer agorot, directional matching that refuses to guess,
statement-total keying that survives FX, a supersede rule that doesn't trust identifiers, an explicit
restatement path, and a reconciliation that can both pass and fail and states its real resolution.
I have nothing left that would change the document.

What I'd watch: an `import`-only household never gets reconciliation at all, and stage 1 is
`import`. The app is honest about it. Whether the household *reads* an honesty indicator is not an
arithmetic question.

**Not blocking.**

---

## 6. The Agent Skeptic — dimension 4, **9/10**

**Finding — residual.** Verbatim figures over a templated numeric spine is the right fix — the model
frames, the database asserts. Instrumentation turns my complaint about an unmeasured estimate into a
measurement, which is the honest answer.

What I'd still flag: the Answerer's ₪5.60/year is built on ten questions a month, and that number is
now *observed* rather than assumed, which is fine — but nothing **caps** it. A household that
discovers it likes asking questions, or a retry loop that misbehaves, has no ceiling in the spec.
At these prices it is a rounding error rather than a risk, which is why it doesn't change the
document — but "we measure it" and "it is bounded" are different claims and only the first is true.

**Not blocking.** Three agents, one requiring no inference at all, each with a real trigger, a cost
that was measured and then acted on. The dimension is done.

---

## 7. The Craft Critic — dimension 7, **10/10**

**Finding — residual.** §12.2 is what a specification looks like. Blue↔red rather than red/green,
because red/green is the one pair that fails the reader it most needs to serve — and the numbers are
*computed*: protan ΔE 21.6 light, 19.2 dark, against a target of 8. That is not a taste claim, it is
a measurement, and it came with four distinguishing channels so hue never carries meaning alone.
§12.3's icon-and-label pairing on the status indicators, and §12.4's single-series-no-legend with
selective direct labels, are both correct.

What is left is not specifiable: this has never been rendered. A palette that validates is not the
same as a screen that reads well, and §12.1's composed hero explicitly says "mocked in both
languages before it is built" — which is a promise the spec correctly makes and cannot keep on
paper. The first real craft judgement happens at stage 4.

**Not blocking.** Everything a document can settle here is settled.

---

## Panel conclusion

**Seven findings, zero blocking.** Every seat's remaining concern is one of three kinds: an empirical
assumption that only shipping can test (Spouse, Abandoner), an inherent risk correctly disclosed and
mitigated as far as it can be (Realist, Security, Accountant), or work that belongs to a later stage
(Craft). None requires the artifact to change.

Per `GAUNTLET.md`: round 5 cleared the bar, round 6 clears it again and produces no finding that
changes the artifact. **Converged.** All seven residuals go to `OPEN-RISKS.md`.
