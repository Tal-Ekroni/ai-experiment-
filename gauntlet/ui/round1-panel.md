# UI/UX gauntlet — Round 1 panel (on rendered pixels + real data)

Frozen craft bar: floor ≥ 8 on {fits-the-viewport, truthful-at-a-glance, hierarchy, first-run,
polish}. Screenshots are the evidence.

## Craft critic — 4/10

1. **The hero number is clipped.** ₪14,996.16 at 3.4rem overflows a 390px phone; the ₪ and ▼ jam
   into the edge. The single most important element on the screen is broken. **Fatal.**
2. **The dashboard lies by comparing a partial month.** It's the 1st-ish of month 08 with almost
   no data, compared against a full 07 — so *everything* shows as "down ₪14,996", framed as "what
   you did differently ✓". That's not an achievement, it's an artifact of the month being new.
3. **The `₪0` second column** in the movers is noise — it's `fmt(current)` for a month with no
   spend yet. Every row says `-₪8,285.90  ₪0`. Delete it.
4. **The 12-month bar's last bar is a sliver** (partial month) with no marking, reading as "spending
   fell off a cliff". Misleading.
5. **"מוסבר 0%"** reads as alarming red-adjacent when the real story is "100% attributed by the
   bank" — good news shown as a deficiency.

## Accountant — 6/10
The numbers themselves are right; the *framing window* is wrong. Compare the last two COMPLETE
months, and mark the current month partial everywhere it appears.

## Mandate → Round 2
1. **Hero fits, always** — `clamp()` font-size, never clips, at any digit count. Non-negotiable.
2. **Never compare a partial month as if whole.** Lead with the last complete month; exclude the
   in-progress month from the month-over-month, and dim/label it in the bar.
3. **Kill the `₪0` mover column**; show the delta and the category, nothing else.
4. **Reframe the status chips** so "bank categorized everything" reads as good, not as "0% explained".
5. **Polish pass**: spacing, card headers, a warmer surface, a real empty/first state.
