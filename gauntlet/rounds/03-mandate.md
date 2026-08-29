# Round 3 — Mandate for round 4

Five items. The arithmetic is nearly done; most of the remaining risk is in whether anyone is
still listening.

## 1. Reconciliation must be capable of both passing and failing *(Accountant)*

§3.6's daily identity won't hold on correct data, because Israeli banks post on a **value date**
that differs from the booking date — worst for cheques, standing orders and card settlement, which
is the largest line in the month. Round 2's check could never fail; this one can never pass, and
loud wrongness is worse than silent wrongness because it destroys the indicator's credibility.

- Store **both** `booking_date` and `value_date` on every transaction; reconcile against value
  date, since that is what the balance actually moves on.
- Reconcile over a **rolling 7-day window**, not a single day, so value-date shift is absorbed
  while a genuinely missing transaction is still caught.
- Give the delta a **tolerance and a diagnosis**. "We are short one transaction of about ₪X around
  the 14th" is actionable. "Unreconciled" is not.

## 2. Reverse the certificate own-goal *(Security)*

Installing a private root CA on both phones is not scoped to this app: it authorizes silent
interception of **all** HTTPS on those devices, and its key sits on the same box as the bank
credentials. That is a strictly larger blast radius than the plaintext passcode it was meant to fix.

- Remove the local-CA approach entirely.
- Use a **real certificate for a real subdomain via DNS-01**, with the DNS record pointing at the
  LAN address. Nothing inbound is exposed, the challenge is answered over DNS, and both phones
  trust it because it is genuinely trusted.
- Keep §5.3 exactly as written. It is the strongest section in the document.

## 3. Hebrew and RTL are first-class, not a localization pass *(Craft — floor)*

The app is for an Israeli household and the spec does not mention Hebrew once. Every merchant
descriptor is Hebrew, every amount is Latin numerals, and every such string is bidirectional.

- Declare layout direction, bidi-safe rendering of merchant strings, correct truncation from the
  correct end, and legible numerals in RTL rows as **requirements**.
- §4.2's twenty-merchant confirmation is the first real screen anyone touches and is entirely
  Hebrew content. Specify it explicitly.
- **Decide the interface language** and name the 14 categories in it.

## 4. Fix the channel: tone, decay, an earlier job-2 answer — and price the agents *(Spouse + Realist + Skeptic)*

Every trigger in §5.1 is a problem, so the app is structurally incapable of good news, on the most
emotionally loaded subject in most households. Aversion mutes faster than boredom and is harder to
undo.

- At least one trigger must carry **good news**: a week under baseline, a drift flag that closed, a
  month under normal, explainability recovering. When the monthly close has something good, it
  leads with it.
- **Repeat alerts decay.** A dark account is not new news in week three. Say it once, then fold it
  into the monthly close. This applies to every recurring condition.
- **Answer job 2 before month nine.** Ship an honest weaker signal from month one —
  month-over-month category movement, explicitly framed as "one month, not a trend," never labelled
  drift. Let real drift supersede it when §6's gate opens, and treat that opening as an event worth
  a message.
- **Put a shekel figure on monthly agent cost.** Deferred twice; not deferrable again. Dimension 4
  is capped at 8 until this exists.

## 5. Category is a default, not a verdict — and name who owns the scrapers *(Abandoner + Realist)*

- Merchant category must be overridable per transaction in one tap, with **amount-band rules** for
  the merchants where it matters (Shufersal under ₪250 is groceries; above, ask once). Today the
  ₪800 barbecue is Groceries forever, invisibly, in both drift baselines.
- Count "confirmed merchant" and "confirmed transaction" **differently** in §4.3's explainability —
  they are not the same claim.
- `israeli-bank-scrapers` is a volunteer project and the household's entire financial visibility
  depends on it. Pin the version, vendor it, and write the explicit "it broke and nobody is fixing
  it" procedure: everything degrades to `import`, and the app says so once.

---

## Explicitly out of scope for round 4

- Stack, deployment, rollout sequencing — settled and not worth re-opening.
- Anything reopening frozen stage-1 decisions.
