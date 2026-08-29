# Org Cycle 1 — decision memo

## CEO — the bet
**Recurring-charge detection.** Why now: the household's stated leak is "we don't track and we lose
money," and the single most common invisible leak is subscriptions and standing charges that renew
without anyone deciding. It's on-mission (finds money), it's for *both* partners (a number, not a
chore), and it's the roadmap's next unshipped "Now" bet after wealth. One line: **"show them the
money that leaves before they decide."**

## CTO — gate check: PASS
Pure arithmetic over the existing ledger — no new dependency, no cloud, no LLM. Local-first safe,
one process, node:sqlite. Money stays integer agorot. Cheap (S–M). Ship it. Guardrail I'm adding:
recurring detection must be **honest about uncertainty** — flag "looks recurring," never assert a
subscription we're not sure of, and never auto-act on it.

## PM — scope
- **Problem:** recurring charges (subscriptions, standing orders, insurance, gym…) are invisible in
  aggregate; nobody knows the monthly total that's committed before discretionary spend.
- **Acceptance criteria:** detect merchants charged on a regular cadence (weekly/monthly/quarterly/
  yearly) with stable-enough amounts; show each with its cadence, amount, monthly-equivalent, next
  expected date, and a total "committed per month"; flag a charge whose amount recently rose.
- **Out of scope:** cancelling anything, reminders/notifications (that rides the digest later),
  auto-categorizing as "subscription".
- **First slice:** the detector + a "מנויים והוצאות קבועות" screen and a dashboard teaser.

## R&D Team Lead — build plan
1. `lib/recurring.ts` — cadence + amount-stability detector (unit-tested math).
2. `/recurring` screen — list with monthly total, cadence tags, next date, "went up" flag; a teaser
   card on the dashboard.
3. Tests for cadence classes + stability + monthly-equivalent; render both themes; adversarial pass
   (don't flag one-offs; don't call variable bills "subscriptions").

## Shipped (Team Lead sign-off)
`lib/recurring.ts` + `/recurring` screen + dashboard teaser. On the real Max file: **9 recurring
charges, ~₪965/mo** — car insurance ₪427, a standing order, Partner ₪106, insurances, a ₪19.89
card fee, one quarterly charge flagged as risen. Detector unit-tested for cadence classes, amount
stability (rejects variable spend), yearly→monthly normalization, price-increase flag, and totals.
44 tests green; rendered and eyeballed. Local-first intact; no LLM.

## Next (CEO)
Recurring feeds two later bets cleanly: the **fixed-vs-discretionary** rollup on the wealth page,
and a line in the **WhatsApp digest** ("₪965/mo committed; צ'יקה went up"). Org will pick one next
cycle.
