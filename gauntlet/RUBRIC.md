# Frozen rubric

Generated at Stage 1 from the user's answers. **Frozen** — editing this mid-loop to make a score
pass is cheating and voids the run.

Bar: **floor ≥ 8.0 AND weighted mean ≥ 9.0.**

| # | Dimension | Weight | Seat | 10 means |
|---|---|---|---|---|
| 1 | Correctness | ×2 | Accountant | Integer minor units throughout; internal transfers and card payments never counted as spend; every month-end total reconciles to the bank's own closing balance, and a mismatch is visible rather than silent |
| 2 | Friction | ×2 | Abandoner | Steady state is ≤5 min/week with a *hard-bounded* queue; a skipped week self-heals instead of compounding; setup is under an hour |
| 3 | Security & privacy | ×2 | Security Engineer | Bank credentials live in the OS keychain, never in the repo or a `.env`; no agent can move money; a merchant cannot inject instructions via a descriptor field; compromise of the LLM path leaks nothing that identifies the household |
| 4 | Genuine AI utility | ×1 | Agent Skeptic | Every agent does unattended work with a real trigger; deleting any one of them is felt; monthly token cost is known and is a small fraction of what the household saves |
| 5 | Durability | ×1 | Bank Realist | A broken scraper degrades loudly instead of failing silently; there is always a manual data path; the app is still correct after a year and one bank redesign |
| 6 | Second-user pull | ×2 | Spouse | The partner who didn't ask for this gets value without installing, learning, or navigating anything — and the home-network-only constraint is defeated rather than excused |
| 7 | Craft | ×1 | Craft Critic | First-run with zero data is designed, not empty; numbers legible at a glance; charts say something; quality you would pay for |

**Weight total: 11.**

Weight note: dimension 6 is ×2 rather than the template's ×1. The user chose home-network-only
access for a two-adult household, which makes second-user pull the single highest-risk dimension
in this project. The weight reflects the risk, and was set before round 1.
