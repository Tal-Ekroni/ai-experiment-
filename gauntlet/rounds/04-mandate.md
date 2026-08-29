# Round 4 — Mandate for round 5

Four items. The floor has cleared; this is refinement, and the theme is **stop withholding value.**

## 1. Stage the setup so every stage ships value *(Abandoner — floor)*

Setup now requires Docker, credentials for 3–6 institutions, a domain the household must own, a DNS
token, ACME issuance and renewal, a bot token and three keychain entries. That is an evening, it can
stall for two days waiting on DNS propagation, and an abandoned 80% gives nothing at all.

- **Stage one: one bank, plain HTTP on the LAN, the twelve-month retrospect — twenty minutes.** That
  alone exceeds everything this household has ever had.
- Certificates, the bot channel, additional accounts and assisted mode are **later, optional and
  additive.** Each stage states what it unlocks.
- No stage may be a prerequisite for the value of the stage before it.

## 2. Give the second user something to do, in the channel she is already in *(Spouse)*

Every action in the app belongs to the primary user: the OTP, the queue, the overrides, setup. She
receives and never touches, which reproduces the exact asymmetry the app exists to fix.

- Accept **replies on the bot channel**. The app polls Telegram outbound, so this opens no inbound
  port and costs nothing against frozen decision #7.
- Minimum viable action: ask a question about a transaction or a month and get an answer in-channel
  (*"what was the ₪1,200 on the 14th"*). Constrain it to reads.
- This is the one place a conversational surface earns its seat — not because chat is good, but
  because it is the only interface she will ever have.

## 3. Resolve the three self-contradictions *(Craft + Realist + Skeptic)*

The spec states the right principle in one section and forgets it in another. All three:

- **§12's hero violates §10's own bidi requirement.** `₪1,400 מעל הרגיל שלכם` is Latin numerals and
  a currency symbol inside a Hebrew RTL sentence — the exact case §10 declares must be
  direction-isolated. Specify the hero as a composed element, not an interpolated string, and mock
  it in both languages. **And design the below-normal state as its own thing** — the app has only one
  designed emotional state and it is bad. A household finally coming in under baseline should feel
  it.
- **§2.1's health check is a human reminder**, in an app premised on this household not doing
  recurring chores, covering three dependencies that fail on independent clocks. Replace it with a
  nightly self-check — scraper liveness per institution, cert expiry runway, last successful run of
  every job — reported **through the outbound digest**, which is the only surface that survives all
  three failures.
- **§8.1 proves inference costs ₪0.52/year and §4 still rations it.** Re-verify the merchant table
  periodically now that it is free, and treat a rising rate of household corrections as a signal the
  categorizer has drifted.

## 4. State the reconciliation resolution you actually have *(Accountant)*

- §3.6's diagnosis claims a three-day range from a seven-day window. Say seven days, or narrow by
  successive overlapping windows and do the work. Do not claim precision the method lacks.
- Define what "lower resolution" means for the missing-snapshot gap case.
- **Wire §3.6 to §3.5 explicitly.** A delta surfaced against an already-closed month is a
  restatement; the two sections currently never mention each other.
- Scope the ACME credential to `_acme-challenge` or delegate it by CNAME to a throwaway zone. A
  zone-wide DNS token on the same box as the bank credentials can issue certs for the whole domain
  and redirect its mail. *(Security — grouped here as the fourth precision fix.)*

---

## Explicitly out of scope for round 5

- Stack and deployment, beyond what item 1 requires for staging.
- Anything reopening frozen stage-1 decisions.
