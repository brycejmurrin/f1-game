# The AI drivers — what they are, and a plan to make them race

Three parallel investigations fed this: a map of the current implementation, external
research into what shipped racing games do, and an audit of how AI quality is
currently observed. Every claim about our code carries a `file:line`; every claim
about the outside world carries a source.

**The plan's shape is decided by one finding, not by ambition.** Asked "how would we
know if the AI got better?", the honest answer today is *we would not*. Everything
that touches the AI guards **stability** (no NaN, no barrier clip, no wedged pack) or
**inputs** (`tierV`, `skill` are the right numbers). Nothing measures **outcome
quality** — pace, consistency, line, racecraft. So instrumentation is not phase one
of this plan because it is tidy; it is phase one because every behaviour change below
is otherwise unfalsifiable.

---

## 1. What the AI is today

**There is no AI driver object and no state machine.** Every decision is inlined as
the `else` branch of an `if (c.human)`, across ~6 sites in `js/game.js:3293-4312`.

**An AI car is a kinematic point.** It never runs the bicycle model, never has a
heading, and steers by writing `c.x` directly (`js/game.js:3946`). `carRoles()`
reports `yawRateCur` as zero forever for AI — the kinematic signature.

**Its entire personality is three scalars**, baked at `makeCars()`: `tierV`, `skill`,
`lane`. `c.skill` is read at exactly two sites (`:3322` pace, `:3432` corner speed),
`c.tierV` at one, `c.lane` at two.

### It holds a lane; it does not drive a racing line

```js
// js/game.js:3626
const racingLine = clamp(-kA * 130, -0.62, 0.62) * hw;
const targetX = clamp(racingLine * 0.55 + c.lane * (hw - 1.2), …);
```

The curvature term is scaled by `0.55`; the lane term is not scaled at all. At a
typical `hw ≈ 6 m` the line reaches **2.05 m** and the lane reaches **4.08 m** — the
lane dominates by ~2×. Only forward curvature is sampled, so there is **no
out-in-out**: no entry-wide, no exit-wide.

For contrast, the *player's* opt-in race-line assist (`js/game.js:3808`) reads the
previous **and** next corner: `-k * 170 + (kAhead + kBehind) * 85`. **The line we
offer the human is better than the one the AI drives.**

### Four of the five driver-rating axes never reach the driving model

`js/car/driver-ratings.js:33` exposes `pace, craft, awareness, consistency,
experience`.

| axis | reaches the driving model? |
|---|---|
| pace | **yes** — the only one, folded into `c.skill` |
| consistency | scales a jitter drawn **once at car creation**; not live variance |
| craft, awareness, experience | **no** — career and qualifying only |

`overall()` is commented "Display only; nothing in the sim reads it."
Top-to-bottom `skill` spans **0.955 → 0.984** — under 3 %. Two drivers on the same
team differ by a ~3 % scalar and a lane offset.

### Braking is binary — and that is the headline

```js
// js/game.js:3434
braking = c.speed > vCorner + 2;   // then c.speed -= BRAKE * dt
```

No `brakeLvl`, no `mods.braking`, no modulation. `c.aiBrakeT` is initialised
(`js/game.js:1572`) and **never read** — a dead field.

This matters far more than it looks. Turn 10's stated root cause for tearing out and
rebuilding Forza's Drivatar was that throttle and brake were **binary** — AI cars
"blipped the brakes, rear lights going on and off like a rave" to fake progressive
braking — and, crucially, *"rubber-banding had to do a lot more work to compensate
for their lack of intelligence."*
([AI and Games](https://www.aiandgames.com/p/how-forza-rebuilt-their-drivatar))

We have the binary pedals **and** the compensating rubber band.

### The rubber band is the specific anti-pattern the literature warns about

```js
// js/game.js:3329
const gap = _leadHuman.prog - c.prog;
const bandFactor = gap > 0 ? Math.min(gap / 700, 1) * dd.band : 0;
vmax *= 1 + bandFactor;
```

Boost-only, no dead zone, no decay, no suppression at the start or when lapping.
Game AI Pro ch.42's canonical design requires all four
([ch.42](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter42_A_Rubber-Banding_System_for_Gameplay_and_Race_Management.pdf)).
Its explicit warning about race starts — *forward banding bunches the field into turn
one; you want reverse banding to string them out* — may bear directly on the
grid-start stall recorded at `tests/world-physics.spec.js:132`.

### Genuinely absent

Tyre wear, fuel load, driver error, **defending** (the traffic scan window is
`[-6, +18] m` — the AI never reads a car behind it), slipstream, pit strategy.
Weather is *partially* present: `gripMult()` enters `vCorner` and lateral authority,
but not `vmax` or `BRAKE`, so wet changes cornering and not straight-line pace.

### Two comment/code contradictions worth fixing in passing

- `c.aiBrakeT` — initialised, never read.
- The traffic loop comment claims it "walks OUTWARD from our rank … without the O(n)
  per-car pass". It is a plain full scan with no break: **O(n²) per tick**.
  Behaviourally fine; the comment describes an optimisation that does not exist.

---

## 2. Phase 0 — make it measurable (no behaviour change)

None of this alters a single AI decision. All of it is exposing values the code
already computes. **Nothing in phase 1+ should start before this lands.**

### 0.1 Per-car lap timing

`c.lastLap` and `c.best` are set for **every** car (`js/game.js:4223-4225`) and
exposed for none — `lapHistory()` and `timing()` return only `G.player`'s. Add
`lastLap`, `best`, `lapCount` to `cars()` / `carAt()`.

Without this there is no primary metric: no pace, no consistency, no degradation, no
A/B. It is the cheapest change in the whole plan and it unblocks everything.

### 0.2 The AI decision block

Every one of these is a frame-local in `js/game.js:3286-3450` / `:3631-3673`,
destroyed each tick: `vmax`, `bandFactor`, `braking`, `vCorner`, `kMax`, `blocker`,
`blockerGap`, `roomL`/`roomR`, `boxed`, `unstuckActive`, `overtake`, `desiredX`.

Consequence: **a slower AI could be braking too early, queuing behind a phantom
blocker, rubber-banding down, or stuck in recovery — and all four are
indistinguishable from outside.** Expose them on `carAt(i)`. `c.stuckT` is already
persisted on the car and costs nothing.

### 0.3 Per-car `rollout()`

`js/game/agentview.js:2047-2210` is already a deterministic, seeded, headless driving
loop that returns a digest — including `cornerMinSpeedKph`, exactly the per-corner
metric AI quality wants. It advances the whole field (`update(dt)` at `:2135`), so
the AI genuinely races during a rollout. But every metric derives from `const p =
G.player` at `:2093`.

The machinery is written and pointed at one car. Add an `ids: […]` option. This is
the highest-leverage item in phase 0.

### 0.4 `tools/ai-bench.mjs`

Seeded, N laps, no player interference, emitting per-car mean/min/stddev lap time and
off-track counts per circuit, on the existing `tools/harness.mjs`.

This is also the **missing `quali-calibrate.mjs`**. `js/game/quali.js:70` instructs
re-measurement of `QUALI_TRIM = 0.75` via `artifacts/tmp/quali-calibrate.mjs`
whenever the driving model changes — **that file does not exist**. It is the one
place the codebase already knew it needed a measurement loop and lost it, and
`QUALI_TRIM` decides whether pole is achievable.

### 0.5 A realism table

No track def, doc, test or fixture records a plausible lap time for any circuit. The
only lap-time assertion in the repo is `tests/quali.spec.js:210` — `spa > monaco *
1.2`, a ratio between two circuits, never a comparison to reality. A per-circuit
expected range (±15 % is enough) in a new `tests/ai-pace.spec.js` is what turns "the
AI got faster" into "the AI got **more correct**".

### 0.6 `__apex.difficulty(level?)` and a test for it

`DIFF` (`js/game/tables.js:23`) is six numbers with no behavioural test and no
programmatic setter — the only path is the `#rs-diff` DOM chips. Add the hook and a
test that hard > normal > easy in bench pace.

### 0.7 Resolve or quarantine the failing AI test

`tests/world-physics.spec.js:121` is red with its cause documented as not understood,
and it implicates the rubber band that phase 2 rewrites. A red test of unknown cause
means the suite cannot distinguish "my change broke the AI" from "already broken".
*(Being investigated separately; do not start 2.4 until it is settled.)*

---

## 3. Phase 1 — the cheap fixes that unblock everything

### 1.1 Continuous pedals

Give the AI a throttle/brake **level** and a rate limit, replacing
`braking = speed > vCorner + 2`. Turn 10's account says plainly that binary pedals
were what made their AI dumb and forced the rubber band to compensate. This is
near-zero cost and it is the prerequisite for the band ever being reducible.

Wire `c.aiBrakeT` (currently dead) as the modulation state rather than adding a field.

### 1.2 Driver persona, with the biorhythm

Game AI Pro ch.38's counter-intuitive guidance: map skill into a **narrow 98-99 %
band**, because "a 1 % variation accumulated over several laps has a surprisingly
large effect". Then — because a narrow band makes drivers hard to tell apart — vary
each driver's skill **slowly over time**, a sine of ~100 s period or a square wave
sitting high 90 % of the time. *"This will make the AI driver temporarily vulnerable
to being overtaken without having an overly large long-term effect."*

One `sin()` per car per second. It is the single cheapest believability win available
and the direct answer to "every driver is the same car at a different speed".

Add **aggression** (following distance, space required to pass) and a **mistake
rate** (random error injected into the corner-speed calculation) — we currently model
no driver error at all. Route `craft` and `awareness` into these, so the rating axes
stop being decorative.

---

## 4. Phase 2 — the behaviour work, in ranked order

### 2.1 Heat Vision — fixes queuing, defending and overtaking at once

A 1-D lateral heat field per AI car: a fixed-size float array spanning track width at
the car's own `s`. Nearby cars write **positive** heat where they are; a *following*
car writes **negative** heat at its lateral position (so moving there defends); a
draft writes negative heat behind a fast car; the racing line writes heat too. Blur
it, then roll a ball downhill from the car's current `x` with momentum and friction.
Where it settles is the target offset.

The payoff, in the author's words: *"the vehicle doesn't need different driving
behaviours such as alongside, block, or overtake — instead these actions occur
naturally."* Overtaking two cars in one move falls out for free. Per-driver
aggression drops in as the width of the heat each car writes.
([ch.41](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter41_The_Heat_Vision_System_for_Racing_AI.pdf))

**Why it fits us unusually well:** it works in lateral metres at a longitudinal
station — which is exactly the `(s, x)` Frenet frame the whole game already uses. No
architectural change.

Cost: ~32 floats per car rebuilt at 10-20 Hz, ~4-6 contributors after a 50 m cull. On
the order of 4k float writes plus a blur, five to ten times a second.

Replaces the current `roomL`/`roomR` + nearest-blocker logic — and incidentally
retires the O(n²) scan whose comment already claims it is something better.

Caveat from the author: it does not handle off-track recovery or wrong-way cars. Keep
an explicit recovery state.

### 2.2 A baked racing line and speed profile

Store one lateral offset per track node and one max speed per node. Compute offline
in `tools/` (or by cheap iterative curvature relaxation at build time — a few hundred
nodes × ~100 iterations is microseconds in JS) and bake into the circuit data.

This is what gets the AI off a scalar speed cap and onto "carrying the speed its line
and grip allow". It also fixes a real defect: the current curvature lookahead
(`js/game.js:3427`, 12 m to ~119 m in 14 m steps) samples coarsely enough to miss a
short hairpin apex between probes, and **cannot handle a slow corner following a fast
one**. The shipped alternative is baked per-node speed hints compared against braking
distance ([ch.39](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter39_Representing_and_Driving_a_Race_Track_for_AI_Controlled_Vehicles.pdf)).

Steer at a **look-ahead "rabbit"** advanced along the line by speed, never at the
nearest point — nearest-point steering causes weaving that can build up and spin the
car.

Then the field's fan-out should come from small **per-driver offset and braking-point
biases off the real line**, replacing today's deliberate lane spread.

### 2.3 Behaviours as a utility-scored FSM with hysteresis

Normal / Overtake / Defend / Recover, scored at **10 Hz** (not per frame), with a
transition only firing if the challenger beats the incumbent **plus a threshold** —
the hysteresis is what stops state flicker. Recover integrates over seconds rather
than triggering on one frame, so a car that momentarily runs wide keeps racing.

Much of this becomes optional if 2.1 lands, since heat vision produces
alongside/block/overtake as emergent output. Adopt the *hysteresis and cooldown*
discipline regardless.

### 2.4 Replace the rubber band with a target-point model

*Pure*'s design, which rejected rubber-banding outright: *"no matter how well a
player does during the first 75 % of the race, everything is decided by how they
perform at the end… players can get frustrated and feel the competition is not
fair."*

Each AI car gets a **target point a signed number of metres relative to the player**
and modulates **skill only** (never power) to reach *that point*. Groups animate over
race distance — back group +0 → −500 m, middle +250 → −250 m, advanced +500 → +0 m,
and a "close group" of three cars permanently at +0 m as an anti-loneliness
guarantee. Four rules preserve fairness: skill modifiers hard-clamped by difficulty;
target motion stops at 80 % distance; the max bonus decays to zero over the last 20 %
so the AI cannot recover from its own late mistakes; and all AI run maximum skill for
the first 10-20 s so they get past and become obstacles rather than a queue.
([Pure postmortem](https://www.gamedeveloper.com/design/the-pure-advantage-advanced-racing-game-ai))

Plus ch.42's non-negotiables: a **dead zone** around the player, **skill before
power**, and **banding disabled at the start, at low speed, and when lapping**.

This is roughly the same amount of code as the current band. It is the difference
between detectable cheating and a race that has a shape.

---

## 5. Not doing, and why

- **Any RL-trained policy, distilled or otherwise.** GT Sophy is genuinely shipped
  product, not a demo — but the numbers close the question: a 4×2048 MLP (~12-17 M
  params, 50-70 MB of weights), **23-30 ms inference for ONE car at 10 Hz**, trained
  **10-25 days per track/car combination** on 10-20 PS4s consuming >45,000 driving
  hours. We need ~19 opponents inside a 16 ms frame shared with physics and WebGL,
  across 40 circuits. **The wall is the training infrastructure, not the inference**,
  so it stays no even for a small distilled net.
  ([Nature paper](https://www.cs.utexas.edu/~pstone/Papers/bib2html-links/nature22.pdf))

  The one transferable idea is not RL at all: Sophy's reward decomposed into *track
  progress, collision avoidance, steering smoothness, racing etiquette*. That is a
  good checklist for hand-authoring utility scores, and it is free.

- **Runtime minimum-curvature or minimum-lap-time optimisation.** Seconds for the QP,
  minutes for the NLP, in compiled languages with real solvers (measured: 121 ± 50 s
  for a min-curvature seed, 112-150 s per track for min-time). Not at track load, not
  in JS — and unnecessary, because the line is static per circuit.

- **Drivatar-style player-behaviour learning.** Needs cloud training and telemetry,
  and Turn 10 *abandoned* it: post-FM8 Drivatars are trained independently and merely
  dressed in a friend's name and livery.

- **A real tyre/thermal/fuel model.** Large architectural change against a bicycle
  model with a friction ellipse. But the cheap version **is** worth it: a single
  per-stint grip-decay scalar per car buys late-race pace spread and a reason for
  race-pace phases, for one float.

- **Multiple hand-authored alternate lines.** ch.39 prefers emergent lateral offsets
  from one line, which is precisely what 2.1 gives. Revisit only if traffic behaviour
  is still wrong after heat vision.

---

## 6. Order, and the one rule

```
Phase 0  instrumentation ....... 0.1 lap times → 0.3 per-car rollout → 0.2 decisions
                                 → 0.4 bench → 0.5 realism table → 0.6 difficulty
Phase 1  1.1 continuous pedals → 1.2 persona + biorhythm
Phase 2  2.1 heat vision → 2.2 baked line + speed profile → 2.3 FSM → 2.4 target-point
```

**The rule: no phase 1 or 2 item lands without a phase 0 metric that would have
caught its regression.** Every one of these changes makes the AI *different*; only a
measurement makes it *better*. The codebase has already been here once — `QUALI_TRIM`
carries the only quantitative measurement of real AI pace in the repo, and the tool
it names for re-measuring itself is gone.

0.7 (the failing test) gates 2.4 specifically, because it implicates the band that
item rewrites.

---

## Sources

Game AI Pro racing chapters — [ch.38 architecture](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter38_An_Architecture_Overview_for_AI_in_Racing_Games.pdf) ·
[ch.39 track representation](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter39_Representing_and_Driving_a_Race_Track_for_AI_Controlled_Vehicles.pdf) ·
[ch.41 heat vision](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter41_The_Heat_Vision_System_for_Racing_AI.pdf) ·
[ch.42 rubber-banding](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter42_A_Rubber-Banding_System_for_Gameplay_and_Race_Management.pdf)

[*Pure* postmortem](https://www.gamedeveloper.com/design/the-pure-advantage-advanced-racing-game-ai) ·
[Forza Drivatar rebuild](https://www.aiandgames.com/p/how-forza-rebuilt-their-drivatar) ·
[GT Sophy (Nature)](https://www.cs.utexas.edu/~pstone/Papers/bib2html-links/nature22.pdf) ·
[Sony AI on Sophy](https://ai.sony/blog/gran-turismo-sophy-five-years-on-from-nature-cover-to-open-frontier) ·
[iRacing Adaptive AI](https://www.iracing.com/2025-season-2-new-feature-adaptive-ai/) ·
[TUM trajectory optimisation](https://github.com/TUMFTM/global_racetrajectory_optimization)
