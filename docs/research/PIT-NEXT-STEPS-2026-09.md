# Pit work — next steps (2026-09-16, evening)

> A ranked list, not a new design. What is built is at `f86dd678a` (the deploy
> tip); every item below either finishes a plan already in this directory or
> names the verification the round owes. Facts carry `file:line` against that
> tree.

## 0. Where things stand

Built and deployed this round: the map marker at the peel-off with state and
the MINIMAL cue (`5f542a882`), the exit-road cues, the compound-named armed cue,
the distance bar, one voice, the stop summary and the three-line teach
(`9996cad25`), the radio card for every banner and the continuous pit
instruction from HOLD THE LANE to STOP HERE with a driven VM test that obeys it
(`8d3604596`), the coach-test fix the deploy gate caught (`ce69f5843`), and two
plans: the coloured entrance lamps (`PIT-ENTRY-LAMPS-PLAN-2026-09.md`) and
strategy (§4 of `PIT-GUIDANCE-STRATEGY-PLAN-2026-09.md`, still a plan).

Verification this round was the unit suites, the driven VM test, and the
deploy gate (tooling-fast on the union, game-vm-a/b, node-slow, the sweeps).
**No browser group ran locally.** Two specs measure what changed and have not
run on the new tree: `tests/specs/hud-layout.spec.js` (the HUD boxes' collisions
across 12 landscape shapes; `#announce` is not in its measured set,
`HUD_LANDSCAPE_ONLY` `:76`, so the card is unmeasured) and
`tests/specs/pit-lane.spec.js` (the stop, driven in a browser). CI run 4007 on
`f86dd678a` is in progress as this is written; the pages gate that follows it
runs the sweeps and the selected specs.

## 1. Owed now (before anything new)

> **§1.2 is CLOSED** (2026-09-16, evening, on the gate/mouth/BOX BOX BOX tree):
> both specs ran locally as single specs, on an idle box, and both passed —
> `pit-lane.spec.js` 6/6 in 2.4 min (the driven stop, on the shortened window)
> and `hud-layout.spec.js` 32/32 in 10.9 min, with `#announce` now IN its
> measured set, so the radio card is measured for collisions across all 12
> landscape shapes rather than reasoned about. §1.1 is closed too: CI 4053 on
> the merged deploy tip is green. §1.3, the real-GPU night frame, is still
> open, and the entrance lamps make it worth more than before — a SwiftShader
> frame is what caught the white pool they used to throw.

1. **Read CI 4007 and the pages run it pokes.** If the fast tier is red, the
   Structural-guards job is the first suspect (ratchets: `shellNodes` +2 for
   the card, `cssClasses` +1 — both auto-raised in-diff). If the pages gate is
   red on a golden, it is a menu screen (`menu-baseline.spec.js`), not the
   HUD: bless from the runner's `-actual` artifact as before (docs/TESTING.md
   §Release train), never from SwiftShader.
2. **Run the two specs once, as single specs, in the background**
   (`node tools/ci/test-bg.mjs` with the spec path; anchor on
   `= run (passed|failed)`): `hud-layout.spec.js` (~40 s of boots × 12 shapes)
   and `pit-lane.spec.js`. Add `#announce` to `hud-layout.spec.js`'s measured
   HUD set while there: the card sits under `.hud-top` at
   `--hud-top-h + 10px` (`css/hud.css` `#announce`), and the one collision it
   can have is with `#hud-flag` (`top: 72px` in compact, `:664-668`) and the
   dropped `.hud-gaps` (`:185-187`) — measure, do not reason.
3. **One night frame of the card and the cue on a real GPU**: dispatch
   `gpu-census.yml` on `macos-latest` with a HUD-on pose (the Verdict step),
   the frame the lighting plan asked for and never got
   (`PIT-OPEN-ITEMS-PLAN-2026-09.md` §4). The neon, the LED strips and the
   radio card are all judged on SwiftShader today.

## 2. Next build: strategy (§4 of the guidance plan)

**Built** (`1382535cf`, deployed at `2cc56a8f0`): all seven items below landed
as one commit with the tests named; the radio card's compact anchor fix
(`4b2787b86`) followed. Kept for the record of what was decided:

1. **The player's reference plan** — `js/game.js:1909` drops `!c.human` from
   the `pitPlan` draw (`c.pitPlan = tyres.on() ? pits.planFor(c.human ? 0.5 : roll) : null`,
   keeping `tyreClass = plan.start` AI-only on `:1910`); `PitLane.think` gains
   `if (c.human) return "";` so the plan is advice (`js/race/pit-lane.js:1100`
   has no human guard today — game.js is what keeps it off the player,
   `:3777`). Test: a human car through `think` never arms.
2. **`stintPlan` pins** — `ctx.stops` (pin the stop count) and `ctx.start`
   (pin the first compound) as filters in `walk` (`js/physics/ai-drive.js:715-730`),
   plus `ctx.firstLife` (the laps left in the CURRENT set, for a re-plan).
   Tests in `ai-strategy.test.mjs`: a pinned count returns that count with
   `lapsAt` inside `[1, laps−1]`; a pinned start is `seq[0]`; a short
   `firstLife` shortens the first stint only.
3. **The HUD plan line** — one `<span id="hud-plan">` inside `#hud-tyre`
   (`index.html:427`; `#hud-tyre` becomes `flex-wrap: wrap` with the span on
   its own row), painted from a new `pits.planInfo(c)` → `{ text, state }`:
   "PLAN 1-STOP · BOX L12", `state` "soon" (amber, `lap ≥ next−1`), "now"
   (`--you`), "free" under caution when `estimate().marginS > 0`. `data-plan`
   on `#hud-tyre`. hud.js is not ratcheted; game.js gets the one `els` entry.
4. **Engineer lap calls** — `senseOf` gains `lapsToStop`, `nextCode`,
   `rivalBoxed` (a rival whose `pitStops` rose this lap within `lossS + 2 s`
   behind), `marginS`, `lap`; `callFor` gains, in this order: caution with
   margin ("STOP NOW LOSES NOTHING", keyed `caution`), undercut, rain before
   the stop, then after `gone`: BOX BOX BOX / BOX NEXT LAP — <compound>
   (`js/race/engineer.js:76-103`). `engineer.test.mjs`'s `sense()` defaults
   grow the five fields; tread still beats BOX NEXT LAP, BOX BOX BOX beats
   the wear ladder.
5. **Rivals' windows** — on the gap chips, not a tower (there is none:
   `.hud-gaps` `:398-401` is the only per-rival HUD element): `data-pit="P12"`
   / `"IN"` from `pits.windowOf(o)` (`plan.lapsAt[o.pitStops]` within 3 laps),
   painted as `::after` so `gapForm`'s learned widths (`hud.js:223-260`) see a
   suffix, not a new spelling — measure the drop rule after.
6. **Re-planning** — once per lap for the local human in `pits.update`: re-run
   `stintPlan` over the laps left with `start` = the current class and
   `firstLife` = the set's remaining life; adopt only when the next stop lap
   moves by ≥ 2 (the stagger is ±1 by design, `ai-drive.js:743`), and say
   "NEW PLAN — BOX LAP n" once.
7. **The STRATEGY row** in `js/race/race-settings.js` (not ratcheted): a
   `#rs-plan` set-row (AUTO / NO STOP / 1 STOP / 2 STOPS, the pin persisted as
   `apex26.pitPlan.<trackId>`) plus a stint bar under it (compound colours
   from `TyreModel.AI_CLASS`, lengths from the plan, the pit loss in seconds
   from a new `pits.lossS()`), hidden with `rs-tyres` in a time trial and when
   wear is off. The hooks object (`game.js:3096-3114`) gains `getPits`.
   Test in `race-settings-vm.test.mjs`: the row's visibility and options; the
   bar only where the VM has a built track (it may not — degrade to "—").

Cost as the plan says: pit-lane.js +20, engineer.js +40, race-settings.js +60,
hud.js +15, game.js +3, tests +120. No browser group; `pit-lane.spec.js` once
at the end.

## 3. Then: the entrance lamps

**Built**, then re-cut TWICE the same evening, both times from a night shot and
a measurement (see the plan's header for the numbers). Where it landed: the
pair stands on the WALL CORNERS at the ENTRY LINE — the platform wall's nose on
the track side, the outer wall opposite — one gate with the lane's middle
between them, which is the only arc where a wall stands on both sides at all
(down the entry road the peel is a wedge off the road edge with tarmac on its
track side). They are RED by default, with GREEN as the called-in overlay, on a
new `signal` lamp kind that is a signal rather than a road light; each aims at
the fast lane's middle a car's length in, and the radius is the throw, not a
flat 24/32 that washed 16 m of racing line white.

Still open from it: the exit signal's live aspect on the same decal mechanism,
and the real-GPU night frame (§1.3) — the SwiftShader frame is what caught the
white pool, so the red one wants the same check on a real GPU.

## 4. Then: the entry road's mouth on the straight

**Built** in the same commit as the lamps (`MOUTH_RUN` 20 in `TrackPit.window`;
the pit-complex test walks every circuit whose straight can hold the floor
plus the road). Abu Dhabi's window is 174 m (was 260) with the full 70 m road
and 16 m of straight before the mouth; Sochi 174, Spa 214, Mosport 182.

**Reported** (phone screenshots, 2026-09-16 evening): "the pit entrance is still
right off a turn and should be shortened." Surveyed on every circuit
(`scratch/pit-entry-survey.cjs`: the straight run ending at the mouth `sA`,
the peak |k| along the entry road, at `PIT_K` 0.0035):

| shape | circuits | what the numbers say |
|---|---|---|
| mouth INSIDE the last corner (0 m of straight before `sA`, road at its 30 m floor) | 21: abudhabi (peak k 0.044 = 23 m radius), sochi (0.050), singapore (0.022), jerez, mont_tremblant, mosport, anderstorp, hockenheim, mexico, monaco, okayama, miami, magny_cours, spa, silverstone, suzuka, brands_hatch, interlagos, jacarepagua, korea, redbull | the window opened as far back as the straight ran (`entryM` 260) and the 70 m road before it had no straight left |
| 8–100 m of straight before the mouth | 17 (madrid and zolder 8 m, catalunya and watkins_glen 16 m, zandvoort 28 m, …) | right, but tight |
| a long straight (160–600 m) | 14 (monza 368, nurburgring 396, sepang, shanghai, qatar, buddh, portimao, mugello, baku, vegas, jeddah, bahrain, imola, estoril) | fine |

Bahrain is its own case: the window is already on the 150 m floor because T15's
exit bends inside the last 150 m (peak k 0.049 in the first 60 m of the window),
so the mouth has 456 m of straight before it and the lane runs through the bend.
The floor is the row's (twelve bays); this item does not move it.

**The rule** (`js/track/core/pit.js` `window()`, `:150-160`): measure the straight
back from the line to `ENTRY_MAX + ENTRY_ROAD + MOUTH_RUN` (a new 20 m run-out
after the corner) and open the window at `back − ENTRY_ROAD − MOUTH_RUN`, still
clamped to `[ENTRY_MIN, min(ENTRY_MAX, cap·0.7)]`. Where the straight allows, the
peel then stands on the straight with 20 m after the corner; a long straight
keeps 260; a straight shorter than 150 + 90 stays as it is (the floor). On the
21 corner-mouth circuits this SHORTENS the entrance by up to 90 m — the ask.

**Tests.** `pit-complex.test.mjs` (next to "neither end of the complex lies in a
corner"): for every circuit whose straight back from the line is at least
`ENTRY_MIN + ENTRY_ROAD + MOUTH_RUN`, no node from `sA − MOUTH_RUN` to `sIn` is
cornering (`|k| ≤ PIT_K`), and `entryRoadM` is the full `ENTRY_ROAD`; Monza and
the Nürburgring keep `entryM` 260; Abu Dhabi and Sochi drop below it. The driven
Bahrain test (`pit-lane-vm`) is unaffected (its window is on the floor).

**Verification** (engine change): `node tools/track/verify-track.cjs` on
abudhabi, sochi, singapore, spa, bahrain; the coplanar, clip and float sweeps
(`npm run test:sweeps` — the window length changes on ~18 circuits, so the
coplanar baseline (`tools/track/coplanar-baseline.json`) may need a re-cut with
this cause, as the 2026-09 window shortening did); one orbit shot of the
Abu Dhabi and Sochi mouths before/after (`tools/shot/shot.mjs <id> <frac of sA>
orbit --dist 60 --el 35`). Cost: pit.js +6, a test +25, a baseline re-cut.

## 4b. The EXIT MERGE is in a corner on 11 circuits — measured, not fixed

Asked: "make sure entry and exit aren't on turns." The entrance was fixed in §4
(`MOUTH_RUN`). The exit was surveyed the same way and is worse, and the fix was
TRIED AND REVERTED — this section is the evidence and the reason.

**The measurement** (`scratch/pit-exit-survey.cjs`: the straight run starting at
the merge `sB`, the peak |k| along the exit road, and the peak |k| in the 80 m
after the merge, at `PIT_K` 0.0035):

| straight after the merge | circuits | worst |k| on the exit road |
|---|---|---|
| 0 m — the car rejoins mid-corner | 11: anderstorp, baku, brands_hatch, donington, jerez, monaco, mont_tremblant, mosport, nurburgring, shanghai, zolder | nurburgring 0.0715 (a 14 m radius), zolder 0.0544, baku 0.0463, jerez 0.0429 |
| 4-32 m | 7: madrid, miami, spa, interlagos, sochi, abudhabi, bahrain, montreal | — |
| 52 m or more | the rest | — |

**Why it happens.** `window()` sizes the exit against `ROAD_MIN` (30 m) while
`exitRoadM` actually runs 80-90, so the road reaches past the straight the
window was fitted to. The merge is `sOut + exitRoadM`, so pulling it back means
shrinking one of the two.

**Why neither can shrink, today.** Both were tried on 2026-09-16:

- **The window** is also what the twelve bays stand in. Closing it earlier took
  Bahrain's exit from 106 m to 40, the window below the 201 m the row needs, and
  the pitch below a bay's width — so the circuit placed NO BAYS AT ALL, and with
  them went the canopy luminaires, race control and the stop itself (six suites
  red). A floor at the row's own length puts the pitch on a knife edge
  (`pitch 11.00 < 11`) and each circuit that clears it pushes another under.
- **The exit road** has an 80 m floor (`EXIT_ROAD_MIN`) because a shorter blend
  is what sent the AI off the end of it — 17 m of run left every stop 0.6 m on
  the grass, measured, 21 of 21.

**What it needs first.** Decouple the ROW from the WINDOW: let the row start
before the entry line (it is anchored past pole's slot today) or lay it against
the entry road, so the window's tail is free to close early. Then the exit rule
is the mirror of `MOUTH_RUN` and costs nothing. Keep `scratch/pit-exit-survey.cjs`
as the before/after.

One guard-rail worth keeping from the attempt, and kept: the row's pitch
comparison now carries an epsilon (`js/track/core/pit.js`), so a window sized to
exactly the row's length no longer loses every bay to a float's width.

## 4c. THE AI PILE UP IN THE LANE — the stalls were MINE, and are fixed

Reported: "AI are getting caught up in the pit lane and bays — we need to space
them out or they have to wait their turn somehow." True, and the cause was a
regression introduced earlier the same session, not a missing queue.

**The measurement tool first, because the first diagnosis was wrong.**
`scratch/pit-traffic.cjs` (new) runs a race in the VM with the field stopping
and samples every car in the complex each tick. Its first `overlapTicks` metric
compared ARC ONLY, so two cars side by side in a 24 m-wide bay row — the normal,
correct picture — counted as overlapping, and every reading built on it read as
a pile-up. The metric now also requires `|A.x − B.x| < 2.0 m`. Any number below
is post-fix metric; the older table's 619 "overlap ticks" was that bug.

**Root cause.** `PitLane.boxSquare` — added this session so the player must be
square in the bay before the jacks drop — also gated the AI's latch. On Bahrain
the box centre is x = −18.25 and `BOX_SQUARE_LAT` is 1.2, but the AI rail puts a
car at x ≈ −15.5: the test could never be satisfied. Every AI halted ~4 m short
of its box, and a stopped car cannot steer, so it sat there and the cars behind
stacked up against it. All 12 stalls, one per stopping car.

**The fix.** The strict centre-and-nose test is the DRIVER'S: `boxSquare` now
returns true for any car without `c.local` once it is laterally inside the bay
(`inBoxLat`). The player still has to line the car up; the AI, which is already
on a rail aimed at the bay, does not get asked to hit a lateral its rail cannot
reach.

Bahrain, 6 laps, 9 sim minutes, 12 of 22 cars stopping, like for like:

| measure | before | after |
|---|---|---|
| cars that STALLED (< 0.5 m/s for 3 s in the lane, not on the jacks) | 12 of 12 | **0** |
| stops completed | 12 | 12 |
| most cars in the lane at once | 8 | 7 |
| overlap ticks (arc AND lateral, corrected metric) | 94 | 194 |

**Tried and reverted.** Crawling instead of stopping until square (`approachV`
asking `boxSquare` rather than `inBoxLat`) cleared the stalls at 9 minutes but
left 14 cars piled in the lane by 16 — a car that never satisfies the test never
leaves. Reverted; `approachV` asks `inBoxLat`, which a rail can satisfy.
Dropping the queue's crawl floor to zero inside the lane moved nothing and
carries a deadlock risk (a queued car is exempt from the unstuck rescue).

**Then closed — the lane now queues.** See §4g.

## 4d. THREE CIRCUITS HAD NO PIT WALL AT ALL — fixed

Reported: "some pit lane walls are broken, like on Magny-Cours." Three of 52
circuits — magny_cours, mexico, monaco — built NO pit wall: not a gap, the
whole thing.

The platform, the wall, its rail and the lane-side barrier are four `sweep()`
calls over ONE node run, and `sweep()` returns early for a run shorter than two
nodes. The run started at `sIn` and its walker broke on the FIRST node that
failed `v >= 0.98` — but the wall's fade FINISHES at `sIn`, so whether the node
landing there has reached 0.98 is node-grid luck. Magny-Cours sat at 0.954,
Mexico and Monaco at 0.97; every other circuit happened to land at or past it
(Bahrain's node falls 2 m early, where v is already 1.000). One failed node,
empty list, four sweeps build nothing.

`nodesFrom` now takes a `seekM` and the platform run passes 24 m, so it finds
the wall's own first node — exactly what the lamp gate's `kGate` already did a
few dozen lines below, for exactly this reason (Monaco had lost both lamps to
the same rounding). Runs now match the lane: Magny-Cours 65 nodes / 260 m,
Mexico 65, Monaco 60. `test:sweeps` moved no coplanar, clip or float baseline.

The defect was invisible from the vertex buffers, so `SceneryPits.build`'s
report is now kept on the track as `track.pitBuilt` rather than only logged,
and `tests/unit/pit-signs.test.mjs` asserts every circuit with `hasWall` builds
one. Negative control: with the seek disabled the test names exactly those
three circuits. `scratch/pit-wall-survey.cjs` prints all four wall runs per
circuit.

**Worth checking next.** The same walker still starts the EXIT wall at `sOut`
and the OUTER wall at `sA + 6` with no seek. Both had non-empty runs on all 52
today, but they are one node-grid roll from the same defect.

## 4e. THE LIMIT NUMBER, AND BOOST IN THE LANE — both fixed

Reported: "the speed limit number is inaccurate, and me and the AI shouldn't be
able to use overtake or boost in the pit lane until exit."

**The number.** Three things claimed to be the limit and one disagreed:

| | source | Bahrain | Monaco |
|---|---|---|---|
| board on the wall | `track.pit.limitKph` (authored) | 80 | 60 |
| speedo while limited | `dashKph` = vStd · 3.6 | 80.0 | 60.0 |
| **HUD cue "… LIMIT"** | **`limit() * 3.6`, RAW m/s** | **67.2** | **50.4** |

`limit()` returns m/s at the CURRENT pace (`vTop() · limitFrac`), and the speedo
reads `dashKph`, where PACE cancels — so the one number a driver compares
against the speedo was the only one not on the speedo's scale, and at the
shipped pace 0.84 it read 13 km/h low. New `limitKphShown()` (`pit-lane.js`);
the cue prints it. `__apex.pit().limitKph` deliberately stays RAW, matching
`physState().speed`'s raw m/s — it is the enforced cap a spec compares a speed
against, and `tests/specs/pit-lane.spec.js` uses it that way.

**The boost.** New `PitLane.held(c)` — `inLane` plus the exit road — is now the
ONE predicate for everything the lane forbids: the speed cap (game.js's `onLane`
was the same expression written out longhand, and now calls it) and both
boosts. It lifts at the exit, not at the box.

- **Overtake WAS leaking, measurably.** A pit queue puts a car well inside
  `OT_GAP` and the limit is well over `OT_MIN_SPEED`, so it armed and fired in
  the lane. Bahrain, 9 sim minutes, 13 stops: **1416 armed ticks and 1760 live
  deployment ticks in the lane ungated, 0 gated**, with on-track arming
  unchanged (54.8k). An active deployment ends at the entry line; the cooldown
  was charged in full when it fired, so nothing is banked.
- **X-mode was a much smaller hole, and the honest number is small.**
  `X_MIN_SPEED` is 25 m/s vStd and the limit is 22.2 m/s vStd at every pace, so
  the speed gate was already blocking it by accident. What the gate closes is
  the bleed from racing speed just past the entry line, where a driver who
  merely lifts is not `braking`: **3 of 17630 in-lane ticks** were over the
  threshold (peak 32.9). Not zero, and 48 of 52 circuits put an aero zone over
  their pit window (`scratch/pit-aero-overlap.cjs`), because the lane runs
  along the main straight.

Probes: `scratch/pit-limit-check.cjs` (the three numbers per circuit),
`scratch/pit-boost-check.cjs` (armed/live ticks in the lane vs on track, with a
negative control), `scratch/pit-aero-overlap.cjs`.

## 4f. STRATEGY AND TYRE CHOICE — three defects, all measured

Reported: "there's bugs with our strategies and how to pick which tyre to use."
There were. `scratch/strategy-survey.cjs` (plan sweep), `strategy-cost.cjs`
(cost per candidate), `strategy-race.cjs` (a real race) and `pit-loss-check.cjs`
(model vs sim) are the probes.

### 1. Cars pitted on the LAST LAP

The headline. `AiDrive.pitNow` rule 3 fired on wear alone — no regard for how
much race was left — so a set that went past its life near the flag sent the
car down the lane to lose 15 s it had no laps to win back.

**Measured, 8-lap Bahrain: TWELVE of 22 cars pitted on LAP 8.** Every one for
"worn". After: **zero**.

New `AiDrive.wornPays(ctx)`: fresh rubber pays back the cliff it replaces, so
the laps left must cover the stop — gain per lap is the cliff rate over how far
past life the set is, against `pitLossLaps`. Below break-even the flag comes
first and the car drives it home, which is what a real team does. A caller that
passes no `lapsLeft` behaves exactly as before.

### 2. A pit stop was priced at half what it costs — by three different formulas

There were THREE formulas for one number, all different, all under:

| | formula | Bahrain |
|---|---|---|
| the planner (`planFor`) | lane / (0.55·vTop) | 7.3 s |
| the player's STRATEGY row (`lossS`) | lane / (0.75·vTop) | 9.0 s |
| the caution estimate | a third one | — |
| **what the race actually charged** | measured lap-time delta | **15.0 s** |

Two causes. The loss counted only `lenM` (Bahrain 256 m) when the limiter holds
the car over the entry road and the exit road too (406 m — `PitLane.held` is the
span). And it compared against a flat fraction of TOP speed rather than the pit
straight, which is one of the fastest parts of a circuit.

Now ONE function, `lossAt(roadFrac)`: the whole complex at the limit, less what
the straight would have taken, plus the brake-down and drive-back-up either side
(a speed change costs (v1-v2)²/2v1 per unit of accel). `lossS()` is the green
case, `estimate()` the same formula at a slower road. **Model 16.2 s against a
measured 16.5 s — was 9.0 against 15.0.**

The reference lap moved too: `total / (0.55·vTop)` is a flat fraction of top
speed and cannot tell Monaco from Monza — 2 % long at Monaco, 16 % at Spa,
always in the direction that made a stop look cheap. `G.referencePole()` is the
curvature-integrated lap (`Quali.lapTime`); at race pace (×1.03) it puts Bahrain
at 123.9 s against a measured 124.8.

**What it changed.** A 20-lap Bahrain went from 2-stop plans with 7-lap stints
to 1-stop plans across the field, with all three compounds in play (soft 11,
hard 10, medium 1) instead of the old monotone. Nobody finishes over the cliff
(was 6 of 22 at 8 laps). The cost table shows why: at the old 0.066 the top six
plans were all 2-stop; at the measured 0.121 they are all 1-stop and several are
MIXED compounds.

### 3. Still open — the wear rate runs ~20 % hotter than the life model

An 8-lap Bahrain on a hard (life 8.4 laps) finished at wear **1.17**, i.e. the
car consumed ~1.23 laps of life per lap. `TyreModel.lifeLaps` only means what it
says if a clean racing lap scores ~1.0 of load, and on the AI path it does not.
That makes every plan optimistic by about a stint's tail, and it is why 10 of 21
stops in the 20-lap race still fire as "worn" a few tenths of a lap before their
planned lap rather than as "plan". The outcome is right — the car stops at
about the right time — but the two systems should agree. Calibrating the AI
load path is the next piece of work; it is not a blind constant to nudge, since
the same load feeds the player's tyres.

Also noted and NOT changed: `splitStints` divides a race in proportion to the
compounds' raw lives while `degCost` prices each stint against a FUEL-ADJUSTED
life, so the stint lengths cannot respond to the fuel effect the comment says
makes plans mix ("harder rubber early and softer late"). Mixed plans now appear
on cost alone; making the split fuel-aware would be the principled version.

## 4g. THE LANE QUEUES INSTEAD OF SHOVING — closed

The spacing half of the original "AI are getting caught up in the pit lane"
report, left open by §4c.

**First, a correction to §4c's own numbers.** Its measurement (overlap 94 → 194)
was taken on a 6-lap Bahrain that produced TWO-STOP plans — a scenario the pit
loss fix in §4f removed. At the corrected pit loss a 6-lap race is a no-stop
race and nobody enters the lane at all, so that figure describes a race the game
no longer runs. Re-measured on a 20-lap Bahrain, which stops 19 of 22 cars once.

**The mechanism.** A car held behind another took the RACING follow distance —
`followBase` 6 m, which between 4.8 m cars is a metre of clear air — and then
the crawl floor (`AiDrive.queueFloor`, 3.5 m/s) overrode the gap-holding cap
entirely. So a car behind one stopped on the jacks was *commanded* to keep
closing at 3.5 m/s. The floor exists so a car declared stuck can shuffle out of
trouble; on the lane rail there is nowhere to shuffle to and nothing to gain.

**The rule.** New `AiDrive.laneFollow()` (9 m — a car length plus air) replaces
the racing gap, and the crawl floor is dropped to zero, when BOTH cars are
pit-held (`PitLane.held`). A lane queue is the one place the AI may come to a
complete rest. Racing traffic is untouched: the branch needs both ends held.

Bahrain, 20 laps, 19 stops, like for like:

| measure | before | after |
|---|---|---|
| ticks with a pair inside a car length | 427 | **56** |
| ticks driving INTO the car ahead | 664 | **92** |
| distinct overlapping pairs | 4 | **1** |
| closest pair | 1.52 m | 1.96 m |
| STALLS (the deadlock risk of dropping the floor) | 0 | **0** |
| stops completed | 19 | 19 |
| most cars in the lane at once | 5 | 5 |

The deadlock was the real risk — a queued car is exempt from the unstuck rescue,
so a queue that cannot restart is stuck forever. It did not happen: stalls stayed
at zero and every stop completed.

**Residual, and not chased.** 56 ticks (~0.9 s of 146 s of lane time) on ONE
pair, closest 1.96 m. That is the entry, where a car arrives at the limit behind
one already slowed and the cap has not yet bitten. Worth a braking-envelope
approach on the entry road if it ever shows on screen; at this size it is below
what the earlier defects were costing.

## 5. Smaller loose ends

- The `served` chip and the release banner both say the stop is over; the
  banner also names the cost. If the two read as a shout, drop the chip's
  "GO GO GO" to 0.8 s (`SERVED_S`, `pit-lane.js`).
- The MINIMAL promotion assumed the map is hidden there; it is not
  (`hud-hide-map` is a separate toggle, `css/hud.css:263`). Harmless, but the
  plan's premise in §2 was wrong — corrected in its header, worth one line in
  the CSS comment.
- `docs/DEBUG-HOOKS.md`: `__apex.pit()` now returns `plan` for the player once
  §2.1 lands; regenerate (`npm run gen`), do not hand-edit.
- The scratch capture script (`scratch/pit-hud-shot.mjs`) is a useful pose
  tool (near / enter / armed / lane, standard and MINIMAL); if it is used a
  third time, move it under `tools/shot/` with a `@doc` header.
