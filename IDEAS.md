# Game concept shortlist

Concepts vetted against one hard constraint: **the build pipeline has no artist and
no external assets.** Everything visual and audible must be generated in code.
That rules out anything carried by hand-authored art (runners, shooters, character
games) and favours anything whose beauty is inherently procedural.

A second, less obvious filter: **the automated critics judge still frames.** So the
genre should be one whose quality is visible in a screenshot. Motion-feel genres
score badly not because they are bad, but because the harness cannot see what makes
them good.

---

## Selected — Bonsai

Shape a single procedural tree over real time. Tap to prune, drag to bend, and place
a light source that the tree slowly grows toward, so you shape it *indirectly over
hours* rather than sculpting it directly. It keeps growing while the app is closed.
Seasons cycle the palette; wind moves the canopy.

Procedural because: L-systems are pure code. Branch geometry, instanced leaves, soft
light, depth of field, falling petals and wind are all generators and shaders.
No fail state. The only concept on this list with a real reason to reopen it tomorrow.

---

## Not selected (kept for later)

### Ink in water
Drop pigment into a real-time GPU fluid simulation, swirl it with a finger, guide
blooms to merge toward a target pattern.
*Strength:* the most instantly gorgeous option; stable-fluids is 100% shader code and
photographs beautifully. *Weakness:* closer to a toy than a game — little reason to
return after the novelty.

### Zen sand garden
Rake patterns into a sand height field, place stones, watch water ripple out from them.
*Strength:* the most tactile; sand as a height field with generated normals looks
excellent, and finger-drag feedback is the whole appeal. Simplest to make genuinely
good. *Weakness:* thinnest once you have played a while.

### Tide pool
A boids ecosystem of fish and drifting jellies; you shape currents rather than
commanding creatures. Bioluminescence at night.
*Strength:* flocking is pure code and endlessly watchable; strong ambient appeal.
*Weakness:* influence-not-control can read as unresponsive if tuning is off.

### Crystal growth
Diffusion-limited aggregation and snowflake formation. Seed crystals, adjust
temperature and mineral mix, watch structures accrete.
*Strength:* mathematically beautiful, genuinely novel, trivially procedural.
*Weakness:* slow payoff; needs a strong reason to interact rather than watch.

### Erosion
Hydraulic erosion on procedural terrain — carve a mountain, add rain, watch valleys
and river deltas form over time.
*Strength:* mesmerising, and the simulation itself is the content.
*Weakness:* closer to a sandbox than a game; hard to make legible on a phone screen.

### Aurora
Paint the night sky with touch; ribbons of aurora respond to the drawn field.
*Strength:* shader-driven and stunning. *Weakness:* very thin as a loop — likely a
beautiful screensaver rather than a game.

### Slime mould (Physarum)
Agent-based network growth; place food sources and watch transport networks emerge
and optimise.
*Strength:* hypnotic, famous-looking, cheap to compute. *Weakness:* aesthetically
cold; harder to make feel relaxing rather than clinical.
