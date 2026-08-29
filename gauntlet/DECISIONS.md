# Stage 1 — Interrogation record

Answered by the user. These are **frozen**. Later stages may not relitigate them; the panel may
only attack the *consequences*.

| # | Question | Answer |
|---|---|---|
| 1 | Banking region | **Israel** — no Plaid/PSD2 path; ingestion must be scraping and/or file import |
| 2 | Where data lives | **Local-first** — runs on a machine in the house, data never leaves |
| 3 | LLM exposure | **Rules first, LLM on the gap** — deterministic engine handles the recurring ~90%; only novel merchants go out |
| 4 | Manual effort tolerated | **~5 min/week** — one person will clear a short review queue |
| 5 | Household | **Two adults, fully joint** — one pot, both see everything |
| 6 | What "losing money" means | **No month-end visibility** + **lifestyle drift**. Explicitly NOT forgotten subscriptions, NOT fees/interest |
| 7 | Second-user access | **Home network only** — no VPN, no tunnel, no public URL |
| 8 | Ingestion | **Model's call**, with reasoning recorded in the spec |

## Consequences the panel must hold the spec to

- **#5 deletes scope.** No sharing model, no permissions, no per-person budgets, no split-the-bill.
  Any spec that reintroduces them is padding and gets cut.
- **#6 sets the product's job.** Answer "where did we land this month" and "is our baseline
  creeping up". A subscription-hunter or a fee-alerter is solving someone else's problem.
- **#7 is the highest-risk answer in the table.** It is directly in tension with the Spouse seat.
  The spec must defeat that kill shot *without* overturning the answer.
- **#3 + #1 together** mean the categorizer's quality ceiling is set by the rule engine, not by the
  model. Hebrew merchant descriptors, inconsistently formatted, are the real problem.
- **#4 makes the review queue a hard budget, not a screen.** If it can exceed ~5 minutes, it fails.
