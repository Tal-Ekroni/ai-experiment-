---
description: Run the Product Council — a PM + 3-person team propose, critique, score, and rank product improvements into a Now/Next/Later roadmap.
argument-hint: "[new idea to feed the council | 'resume']"
---

# Product Council

Run the loop in `gauntlet/product/COUNCIL.md` for **Kupa** (the household CFO app in `app/`).

Argument: `$ARGUMENTS` (empty = a fresh round; a sentence = seed that idea into the round).

## Before proposing
1. Read `gauntlet/product/COUNCIL.md` (method, personas, rubric).
2. Ground yourself in reality: skim `gauntlet/06-artifact.md` (the spec), `gauntlet/OPEN-RISKS.md`,
   and what's actually built in `app/` (categorization, retrospect, dashboard exist; drift, digest,
   live sync do NOT). Ideas must fit the real product, not a hypothetical one.

## Run the round
- **PROPOSE** a batch of ideas as problem → idea → why now.
- **CRITIQUE** in three voices (Design Lead, Tech Lead, User Researcher). Kill the weak with a
  reason; sharpen the strong; the Researcher adds what the PM missed.
- **SCORE** each survivor with RICE-lite and apply the two hard gates.
- **RANK** into Now / Next / Later; send cuts to the Graveyard.

## Write it down
Produce `product/ROADMAP.md`: the ranked bets (problem, the bet, effort S/M/L, risk, first slice)
and the Graveyard (idea + cause of death). Commit it. The roadmap must say no more than it says yes.

## Guardrails
- Every kept idea passes both gates. Local-first is non-negotiable.
- Prefer ideas that reach the second adult or answer the two jobs; be suspicious of anything that
  only a finance enthusiast would love.
- Effort is sized against the real stack (one Node process, node:sqlite, Israeli files/scrapers).
- Don't build anything here — this loop produces a roadmap, not code. (Building is `/gauntlet`.)
