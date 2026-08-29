# Org Cycle 2 — decision memo

## CEO — the bet
**"Committed vs. free" money** — the second surface the recurring engine was always meant to feed.
Why now: cycle 1 found ₪965/mo of recurring charges; the missing context is *what share of our
spending is already spoken for before we choose anything.* Cheapest high-value win on the board
(reuses cycle 1), fully demoable, and sharper than the digest (which needs the household's own
machine to fully land). One line: **"show them how much is already locked."**

## CTO — gate: PASS
Pure arithmetic over the recurring output + ledger. No deps, no cloud, no LLM. Guardrail: label it
an estimate — "committed" is derived from detected recurring, not a decree.

## PM — scope
Split average monthly spend into **committed** (recurring/standing) vs **discretionary**, with the
% locked. Out of scope: changing the recurring detector; per-month (vs average) precision.

## Shipped (Team Lead sign-off)
`committedVsFree()` in `recurring.ts` + a split-bar card on `/recurring`. On the real Max file:
**of ₪9,661/mo, ₪965 committed (10%), ₪8,696 in your control** — math reconciles exactly. 1 new
test; 45 total green; rendered and eyeballed. (Note: card-only file, so committed excludes
rent/mortgage that live on the bank account — the % rises on a full setup.)

## Next (CEO)
The spending side is now well covered (forecast, recurring, committed-vs-free, drift pending).
The remaining highest-leverage bet is the **channel-agnostic digest (email + in-app preview first,
WhatsApp adapter later)** — the only thing that reaches the second adult. Org will scope it next
cycle; the WhatsApp bridge itself is the one piece that needs the household's machine.
