# Seed

The whole point of the gauntlet is that the input stays simple. Don't pre-solve the problem in the
prompt — that's the loop's job. Below is the raw idea, unedited, plus the calibration the panel
needs to be sharp on round 1 instead of round 3.

---

## The raw idea (verbatim — do not "improve" this)

> I want to create a web app for my household, like a personal CFO, to manage our income vs
> expenses. Today we don't have a good method, so we don't track and we lose money. It needs to be
> AAA+ grade. It should probably integrate AI agents for various jobs in the app. And more.

---

## Instructions to the model

Run the gauntlet defined in [`GAUNTLET.md`](./GAUNTLET.md) against the idea above.

**Stage 1 first, and stop.** Do not write a spec yet. Ask me the eight questions whose answers
change the architecture — not preference questions, *decision* questions. Things like: which
country and bank aggregator is even available to me, how many adults, whether accounts are joint
or separate, whether anyone will tolerate manual entry, what "losing money" concretely means in
our case, what the real budget is for third-party services, and whether the data may leave my
machine. Ask them, wait, then proceed.

Two phrases in the idea above are traps. Interrogate both before building anything:

- **"AAA+ grade"** — meaningless until it's a rubric. Convert it into the frozen scoring table
  before round 1, and get it approved.
- **"AI agents for various jobs"** — the default failure mode is six agents that are one chat box
  wearing a trench coat. Every agent must earn its seat by naming: the job, the trigger, the
  input, the action it takes without being asked, and what breaks if you delete it. Agents that
  only answer questions are one agent, not six.

"And more" is not scope. Anything not traceable to a stated problem gets cut by the panel.

---

## The panel for this domain

Replace the generic seats from `GAUNTLET.md` with these. Each speaks in first person, each is
trying to kill the app.

**1. The Spouse Who Didn't Ask For This**
Never requested a finance app. Will not categorize transactions. Will not learn a taxonomy. Opens
it only if it tells them something they didn't know, in under five seconds, on a phone. Kills the
app by simply never logging in — which is how most household finance tools die, one user at a
time.

**2. The Week-Three Abandoner**
Loved it on day one. Now there are 140 uncategorized transactions, two duplicate accounts, and the
dashboard is red for reasons that aren't real. Asks: what is the *steady-state weekly minutes* of
this thing, and what happens on the week nobody opens it?

**3. The Bank-Integration Realist**
Has shipped against Plaid / TrueLayer / GoCardless / Salt Edge. Knows the aggregator may not cover
these banks at all, that OAuth consent expires every 90 days, that webhooks replay, that pending
transactions mutate into settled ones with different amounts and IDs, and that backfill windows
lie. Asks: what does this app do the day the connection breaks, because it will.

**4. The Security Engineer**
Assumes the box is compromised. Asks where the aggregator access token lives, what the blast
radius of the app database is, what an LLM provider sees of the transaction stream, whether an
agent can be prompt-injected by a merchant putting instructions in a transaction memo field, and
whether there is any path by which the agent moves money. (There must not be.)

**5. The Accountant**
Cares about one thing: are the numbers *right*. Hunts for float arithmetic on currency, transfers
between own accounts counted as income and expense, refunds, FX, shared-with-a-friend splits,
credit-card payments double-counted against their own statement, and any month-boundary that
silently changes a total. Asks: show me the reconciliation, not the chart.

**6. The Agent Skeptic**
Reads the agent roster and crosses out every one that is a prompt in a wrapper. Asks each survivor
what it does at 3am with nobody watching, and what a spreadsheet with three formulas would fail to
do that this does. Also asks the cost question: what does one month of agent traffic actually cost
in tokens, and is the household saving more than that?

**7. The Craft Critic**
Judges it against software people pay for. Loading states, empty states, the first-run experience
with zero data, the mobile view, keyboard flow, whether the numbers are legible at a glance,
whether the charts say anything or just decorate. "AAA+" is claimed here or nowhere.

---

## Known landmines (seed the panel, then let it find its own)

These are free findings so round 1 starts at depth. The panel must go beyond them by round 2.

- Categorization is the whole product and the whole failure. If it isn't ~95% correct and
  self-improving from corrections, the app is a chore and it dies.
- Transfers between the household's own accounts are the #1 source of fake "spending".
- Two adults, possibly separate banks, possibly separate attitudes to money. Sharing model,
  permissions, and what each person can see are product questions, not settings.
- "We lose money" is undiagnosed. Subscriptions? Fees? Overdrafts? Interest? Lifestyle drift?
  Untracked cash? The app should *find out which* before it prescribes.
- A budget that scolds gets closed. A forecast that warns gets opened.
- Prompt injection via merchant descriptor and memo fields is a real path into any agent that
  reads raw transaction text.
- Local-first vs hosted changes everything downstream. Decide it in stage 1, never revisit it.

---

## Exit

The gauntlet ends when the loop converges or hits round 6 — see `GAUNTLET.md`. Whatever the
outcome, write `OPEN-RISKS.md`. An honest list of holes is worth more than a green check that
lied.
