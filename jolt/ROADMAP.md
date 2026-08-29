# JOLT — Product Roadmap

*PM pass, 2026-08-29. Grounded in play: `node tools/frontdoor.mjs --seconds 75` (PASS — 108
commands survived headlessly), frames `shots/pm-balance-t1.png` / `t12` / `t40`, and a full
read of `src/game/*.ts` + `src/main.ts`.*

**The thesis.** JOLT's core loop is finished and fair — the ramp, the teach-by-doing
onboarding, the daily gate, the announcer are all shipped-quality. What the product lacks
is not polish, it is *circulation*: a run currently dies on the device it was played on.
The daily share is one line of plain text (`shell.ts`, the `share` case: `JOLT DAILY
2026-08-29 · 640 PTS`) with no way for a friend to answer it, and the seed pipeline
(`beginRun` → `dailySeed()` / `Math.random()`) never reads the URL — so the one viral
mechanism a no-backend game *can* have doesn't exist yet. Second gap: the first ten
commands ask nothing of a good player except "don't fall asleep" — `pm-balance-t1.png` is
a nearly empty navy screen and a 1760ms window, and there is no skill expression until the
ramp bites around command 30. Everything in NOW attacks those two gaps.

Every idea below respects the hard constraints: zero external assets, no backend, no new
packages, phone-first portrait, and quality measurable by tsc / unit tests /
`tools/playtest.mjs` bots / `tools/shoot.mjs` frames.

---

## NOW — next round

### 1. Beat-My-Run Challenge Links  *(virality — "tell a friend")*
A "CHALLENGE A FRIEND" action on every game-over screen that copies a URL:
`?duel=<seed>&s=<score>&n=<commands>`. Opening it lands on a dedicated challenge card —
"Someone scored 487 on this exact sequence. One try." — and runs the engine on that seed;
the result screen shows the head-to-head and offers the return-volley link with *your*
score baked in. No accounts, no server: the entire duel is two URL exchanges, and the
engine is already deterministic per seed (`Engine(seed)`), so this is plumbing, not
architecture. This is the only viral loop a backendless game can have, and JOLT is
unusually well-positioned for it because identical-sequence fairness is already proven
infrastructure (the daily).
**Why it wins:** tell a friend — and the return volley makes the friend tell *you*, which
is the K-factor loop. **Effort:** M. **Risk:** low-medium — URL param parsing and a new
screen; score-in-URL is forgeable, but so is every honor-system share (Wordle included);
we display "claims 487", we never persist it as the player's own record.
**Verification:** unit tests on encode/decode round-trip and malformed-param rejection;
headless playtest opens `?duel=` URL and asserts the same command sequence as a direct
`Engine(seed)` run; `shoot.mjs` poses the challenge card and duel-over screens.

### 2. Perfect-Timing Layer  *(depth/mastery — "feel mastery", and it fixes the boring open)*
Score already rewards speed continuously (`succeed()` in `engine.ts`: `10 + left*20`), but
the player can't *see* the skill dimension. Make it legible: answering inside the first
30% of the window is a **PERFECT** — flashed on the ring, quantised earcon, and a running
perfect-chain that multiplies the bonus. Suddenly command 1 with its lazy 1760ms window is
a real test — can you hit the 30% band? — which is the correct fix for "the first ~5
commands are visually quiet": don't just add pixels, add a *reason to try*. The 100th run
differs from the 10th because the goal shifts from surviving to perfect-chaining.
**Why it wins:** feel mastery + one more run ("full-perfect the first 20"). **Effort:** M
(engine scoring + render flash + audio earcon). **Risk:** medium — it touches the scoring
economy, so historical bests inflate; mitigate by keeping base points identical and making
perfects a visible bonus stream, and let the playtest bots quantify the inflation before
ship. **Verification:** this is the most instrumentable idea on the list — run
`playtest.mjs` with 250ms vs 600ms bots and assert the perfect layer *separates* their
scores measurably more than today (a mastery mechanic that bots can't distinguish is
decoration); unit tests on chain/multiplier math; screenshot of the perfect flash.

### 3. Ghost Pacer  *(retention — "one more run")*
Record the score-at-each-command-index trace of your best run per mode (a small int array
in localStorage). During play, a thin second marker on the ring's orbit — your ghost —
shows whether you're ahead or behind your best *right now*, and the moment you pass the
ghost's death point the renderer says so. Today the only mid-run chase feedback is one
toast at the exact instant you pass the best (`frame()` in `shell.ts`); a ghost makes the
entire run a race instead of a single beat. Cheap, pure-data, and it converts "RUN OVER —
84 SHY" from an epitaph into a target you could see slipping away in real time.
**Why it wins:** one more run — the strongest known single-player retention mechanic
(every racing game ships it). **Effort:** S-M. **Risk:** low — additive render element,
no engine change; must stay subtle so it doesn't crowd the command label (readability is
the renderer's prime directive). **Verification:** unit test trace record/replay; headless
run asserts ghost delta math at fixed indices; `shoot.mjs` frames at t=12/t=40 confirm
label legibility is untouched.

### NOW also carries these known-gap fixes *(critic residuals, not new ideas — scheduled here because idea #1 depends on two of them)*
- **Spoiler-free daily share grid** — the daily result needs a comparable emoji artifact
  (e.g. `JOLT #217 🟩🟩🟨🟩🟥` — one glyph per life-loss/segment, no score spoiler).
  Ship it in the same round as Challenge Links: they share the copy/clipboard path and
  together turn game-over into the product's broadcast moment.
- **Midnight-crossing daily run keeps its score** — `endRun` re-derives `dailyKey()` at
  death; a run started 23:59 that ends 00:01 fails the `this.daily.day === today` check
  and drops the score. Bind the run to its start-day key. Unit-testable with a fake clock.
- **Content-layer unit tests** (modes/daily/stats/streak rollover) — prerequisite
  infrastructure for everything above; the daily fix and the share grid must land with
  tests or they'll regress silently.
- **All-time rank flatters ties** — `top.indexOf(data.score) + 1` gives a tied score the
  best possible rank. One-line fix, belongs in the same stats test sweep.

**Why these three, given each costs a gauntlet round:** #1 is the only route to organic
growth this architecture permits — every other idea makes existing players happier, only
this one makes *new* players, and its marginal cost is low because determinism is already
built. #2 is the single change that fixes a residual (quiet early game), deepens the
endgame, and sharpens the harness's own discrimination power at once — triple leverage.
#3 is the cheapest idea on the list per point of retention, and it compounds with #2
(chasing your ghost's perfect-chain). Everything in NEXT is genuinely good and genuinely
less leveraged: personas and haptics delight existing players but recruit no one; the
modifier calendar needs the content-test infrastructure NOW builds first.

---

## NEXT

### 4. Daily Modifier Calendar  *(retention — "return tomorrow")*
The daily is the same game every day; Wordle survives that, but JOLT has levers Wordle
doesn't. Derive a weekday modifier deterministically from `dailyKey()`: e.g. Tuesday =
`rampOffset: 8` ("starts hot"), Thursday = tripled `DO NOTHING` weight ("trap day"),
Saturday = inverted unlock order ("flip comes first"). Same one-try gate, same shared
seed — but Tuesday *feels* different from Thursday, and the share grid can carry the
modifier glyph. **Effort:** M. **Risk:** medium — every modifier is a new fairness
surface; that's exactly what `playtest.mjs` is for. **Verification:** run the bot suite
per modifier and hold every one to the same thresholds as Classic (median run length,
unavoidable-loss rate); unit test the calendar's determinism across timezones.

### 5. Reflex Profile  *(depth/mastery — "feel mastery")*
Lifetime per-verb telemetry: median reaction ms and accuracy per action, all local. The
stats screen grows a "YOUR REFLEXES" panel — "TAP 231ms · TWIST 388ms · your slowest:
FLIP" — with a trend arrow per verb. The 100th run differs from the 10th because you're
watching your own nervous system improve; and it seeds a later "drill your weakest verb"
practice mode. **Effort:** S-M. **Risk:** low — pure accumulation, no loop changes.
**Verification:** unit tests on the accumulators; headless run with a fixed-latency bot
asserts the recorded medians match the bot profile within tolerance (the harness literally
validates the analytics).

### 6. Announcer Personas  *(wildcard — exploits speechSynthesis)*
The voice is JOLT's soul, and `audio.ts` already ranks system voices and owns a script
with multiple phrasings, praise and taunts. Ship selectable personas — DRILL SERGEANT
(low pitch, fast, hostile praise), BUTLER (measured, devastatingly polite disappointment),
GLITCH (pitch-wobbled robot) — as script tables plus voice/rate/pitch parameter sets.
Zero assets, pure character. Unlock personas via milestones (10 dailies, a 25-streak),
which quietly starts the long-arc unlock meta the critics flagged, on the cheapest
possible substrate: words. **Effort:** M. **Risk:** medium — voice availability varies
wildly by device; personas must be parameter *offsets* on whatever voice exists, never
dependencies on a named voice. **Verification:** unit test script-table completeness
(every command × every persona has ≥2 phrasings); headless harness stubs
`speechSynthesis` and asserts the utterance stream per persona; the existing
voice-ranking fallback is already the safety net.

### 7. Haptic Conductor  *(wildcard — device motion's sibling, currently unused)*
`navigator.vibrate` appears nowhere in `src/`. On supporting devices (Android web; the
iOS wrapper can map the same call later), give the game a touch channel: a soft pulse as
the ring enters its last 25%, a crisp tick on correct, a double-buzz on wrong — and
*deliberate stillness* during DO NOTHING, so the inhibition command is the absence of
sensation too, matching the renderer's frozen-world treatment. Deaf players get a
countdown channel that currently exists only in audio. **Effort:** S. **Risk:** low —
feature-detected, additive; iOS Safari lacks the API so the web build must be complete
without it. **Verification:** pattern generator is a pure function (unit test the
pattern per game event); headless run with a stubbed `navigator.vibrate` asserts call
sequence over a scripted run.

### NEXT also carries this known-gap fix
- **Unavoidable-loss headroom** — the 8%-ceiling residual. Schedule a ramp-tuning round
  driven by `playtest.mjs` + `playtest-latency.mjs` *after* the Perfect layer lands
  (perfects change how fast players actually answer, so tuning before it would be tuning
  the wrong game).

---

## LATER

### 8. Install-as-PWA  *(retention — a home-screen icon is a daily-streak delivery vehicle)*
Manifest + minimal service worker, icons as data-URI SVG (the favicon bolt in `main.ts`
already proves the technique). Prompt for install only after the second played day — the
moment the daily streak exists to protect. **Effort:** M. **Risk:** medium — SW caching
bugs are the classic way to brick your own update path; keep the cache strategy trivial
(network-first, one version key). **Verification:** headless browser asserts SW
registration and offline reload; tsc-covered manifest generation.

### 9. Canvas Share Card  *(virality — the visual complement to the emoji grid)*
On game over, render a result card to an offscreen canvas — score, streak, killer command
glyph, in the game's own visual language — and hand it to `navigator.share` as a
generated-at-runtime image. Zero shipped assets; pure canvas. Do it after Challenge Links
prove the share moment gets used at all. **Effort:** M. **Risk:** medium — `share()`
support variance; must silently fall back to the text path. **Verification:** the
screenshot harness is the natural instrument — render the card headlessly and diff it.

### 10. Opposite Day  *(depth — a cognitive layer beyond raw speed)*
Deep in a run (post command ~60, where only fast players live), the announcer occasionally
declares "OPPOSITE!" — for the next few commands, swipe directions invert. Turns the
endgame from pure reflex into reflex + inhibition + remapping, the full go/no-go/reverse
triad. **Effort:** M. **Risk:** high — this is exactly the kind of idea that feels great
and playtests unfair; it ships only if bots with realistic error models keep the
unavoidable-loss rate inside threshold, and it must never coincide with DO NOTHING.
**Verification:** engine-level, fully bot-measurable; unit tests on the remap table.

### 11. Weakness Drills  *(depth — closes the loop the Reflex Profile opens)*
From the profile, a one-tap practice lane: "DRILL: FLIP IT — 20 reps against your median."
Uses Zen's no-death scaffolding with a filtered command pool. **Effort:** S once #5
exists. **Verification:** unit test the pool filter; bot run asserts only the drilled
verb is issued.

---

## Do not build

- **Any leaderboard, including "paste your friend-code JSON" pseudo-leaderboards.**
  No backend means no trust: every score is client-forged, and a rankings UI built on
  forgeable numbers curdles into noise. Challenge Links work *because* they stay
  person-to-person bragging, not a persistent ranking.
- **Mic/voice-input commands ("SAY IT — shout back at the phone").** Symmetric with the
  speech output and superficially on-brand, but it adds a second scary permission prompt,
  is unverifiable in the headless harness (no deterministic mic), fails in every public
  place a phone game is actually played, and breaks silent/deaf play that the shell
  treats as structural.
- **Currency / energy / cosmetic-shop meta.** The long-arc gap is real, but an economy
  fights both the zero-asset constraint (nothing to sell) and the calm/panic purity of
  the loop — earn *words and personas* (idea #6), not coins. The game's premise is that
  the next run is always free.
