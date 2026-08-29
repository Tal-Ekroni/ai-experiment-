# The Product Council — a PM ideation & prioritization loop

Same spirit as the build gauntlet: ideas don't get to be the last word about themselves. A PM
proposes, a small team tries to kill each idea, and only what survives — scored, not vibed —
reaches the roadmap.

## Who's in the room

**The PM (lead).** Owns the roadmap and the final call. Frames every idea as a job-to-be-done, not
a feature. Holds two things sacred and refuses ideas that serve neither:
- **Job 1** — *tell us where we landed this month*, with no assembly.
- **Job 2** — *tell us when our normal is getting more expensive*, in time to act.
…and one risk above all others: **does the second adult ever open / hear from this?** (From the
build gauntlet, that was the #1 reason this class of app dies.)

**The 3-person team** (convened when an idea needs them):
1. **Design Lead** — "What's the smallest version? Does this add a screen or remove one? Would the
   reluctant partner understand it in five seconds?"
2. **Tech Lead** — feasibility on the *actual* stack: one Node process, `node:sqlite`, local-first,
   home-network-only, Israeli bank files/scrapers. **Kills anything that breaks local-first or needs
   a cloud service.** Sizes effort honestly (S / M / L).
3. **User Researcher** — the voice of the two real humans: the week-three abandoner and the spouse
   who didn't ask for this. "Would they actually use it? Does it survive a skipped week? Is this for
   *them* or for a spreadsheet nerd?"

## The loop (one round)

1. **PROPOSE.** The PM puts up a batch of ideas — each as *problem → idea → why now*. Quantity here;
   quality is the team's job.
2. **CRITIQUE.** Each team member speaks on the ideas in their lane. They **kill** weak ones (with a
   reason) and **sharpen** strong ones (smaller, sooner, more focused). No idea passes unchallenged.
   The Researcher may add ideas the PM missed from the user's side.
3. **SCORE.** Every surviving idea gets a **RICE-lite** score against the frozen rubric below, plus
   two hard gates. Gate failures are cut regardless of score.
4. **RANK.** The PM sorts into **Now / Next / Later**, writes the one-line bet for each, and sends
   the killed ideas to the **Graveyard** with their cause of death.

Then loop if new ideas emerged, or ship the roadmap.

## Frozen rubric (RICE-lite + gates)

**Score = (Reach × Impact × Confidence) ÷ Effort.** Higher is better.

| Factor | Scale |
|---|---|
| **Reach** | how many of the 2 adults, how often. 3 = both, weekly+ · 2 = both, monthly · 1 = one adult |
| **Impact** | on the two jobs + adoption. 3 = massive · 2 = high · 1 = nice · .5 = minor |
| **Confidence** | 1.0 = sure · .8 = likely · .5 = a guess |
| **Effort** | on THIS stack. 1 = S (hours) · 2 = M (a day+) · 3 = L (multi-day) |

**Two hard gates (fail = cut, no matter the score):**
- **Local-first safe?** No mandatory cloud service; data stays on the box. (Outbound messaging to a
  chat app the household already uses is allowed — it was an accepted, named trade in the build.)
- **Serves a stated job or the second-user risk?** "And more" is not a job. Padding is cut.

## Output

`../../product/ROADMAP.md` — Now / Next / Later, each idea with problem, the bet, effort, risk, and
the first slice to build. Plus the Graveyard. The PM's roadmap is opinionated: it says no far more
than it says yes.
