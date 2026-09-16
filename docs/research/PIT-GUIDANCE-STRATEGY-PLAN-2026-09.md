# Pit guidance and strategy — plan (2026-09-16)

> Every claim below was checked against the tree at `8acd3d4` and carries a
> `file:line`. **§2 is built** (the "P" at the peel-off with a tick at the line,
> the marker in `--you` and pulsing when armed, the distance arc from `cueM` in,
> the player's disc in `--you` through the lane, MINIMAL's cue at the head of
> the bottom stack — not the top centre: `.hud-bottom` carries a transform, so a
> fixed descendant is positioned against it; `PitLane.worthStopping` is the one
> gate). **§3 is built** (the `served` / `merge` / `out` phases on the exit road,
> the armed cue naming the compound, the `--pit-dist` bar from `cue.frac`, the
> engineer's `DIRECTIONAL` wait through `PitLane.lastCue`, the stop summary at
> the release — which also took over the "GO GO GO" banner that used to fire as
> the car STOPPED — and the three-line teach ended by `apex26.pitTaught`; the
> browser walk of `__apex.pit().cue` down the exit road is NOT added: the unit
> suite drives the ladder with stub cars, and a spec that no session runs is
> not evidence). **§4 is built**: the player's reference plan (`planFor(roll, player, laps)`,
> honouring the STRATEGY row's pin; `think` keeps a human guard), `stintPlan`'s
> `stops` / `start` / `firstLife` pins, the plan line under the tyre bar
> (`planInfo`, `data-plan` soon/now/free), the engineer's plan lines (caution
> with margin, the undercut, rain before the stop, BOX THIS / NEXT LAP), the
> rivals' windows as a `data-pit` suffix on the gap chips (`windowOf` — there is
> no timing tower; the chips are the per-rival HUD), once-per-lap re-planning
> adopted only when the next stop moves by two laps (`replan`), and the
> STRATEGY row with its stint bar and pit loss in RACE SETTINGS
> (`js/race/race-settings.js paintPlan`, pin persisted as `apex26.pitPlan.<id>`). Companions:
> `PIT-LANE-REDESIGN-2026-09.md` (the complex), `PIT-LIGHTING-PLAN-2026-09.md`,
> `PIT-BAY-LOGOS-PLAN-2026-09.md`, `STREET-PIT-LANES-PLAN-2026-09.md`.

Three asks, in the order a driver meets them:

1. **The pit entrance on the map, and in the MINIMAL profile** (§2).
2. **Better on-screen notifications and directions** for a stop (§3).
3. **Strategy** — a plan the player can see, act on and be advised against (§4).

Each section is facts → design → tests → cost, so any one can ship alone.

## 1. What exists today (facts)

**The world.** Since the walls batch (171f990) the entry is signed in the world:
two "PIT ENTRY" boards at 45 m and 95 m before the entry road and a "PIT LANE
80 km/h" board at the entry line (`js/track/core/pit.js:49`, `js/track/scenery/pits.js`
§2), chevrons every 12 m down the entry road (`js/track/core/mesh.js` buildPitLane),
cones on the road's inner edge, a glowing stop gate at each box and the team's
crest on the pier and the pit wall. A driver who looks at the road has the cues;
the HUD is where they are still thin.

**The cue.** `PitLane.cue(c)` (`js/race/pit-lane.js:526-579`) is a pure ladder the
HUD paints into `#hud-pit` (`index.html:432`, `js/ui/hud.js:648-656`, styles
`css/hud.css:448-470`): counting down from 550 m (`CUE_M`, `:523`), "HOLD THE LANE"
inside the entry road, "BOX" once armed, the limit in the lane, "BOX <n>m" from 90 m
out (`BOX_CUE_M`, `:524`), "KEEP LEFT/RIGHT" when the car is not laterally in the
lane, "STOP HERE", "STOP", "BOX MISSED". It is hidden unless a stop is worth making
(`wear >= 0.55` or the wrong tread or a free stop under caution, `:558-563`), and it
says nothing at all on the exit road (`st === "out"` returns null, `:555`). One
banner line spells the gesture out once per session (`:573-577`).

**The engineer.** `RaceEngineer` (`js/race/engineer.js`) is advice only, never a
decision (`:78-81`): wrong tread, a cheaper stop under caution with the pit loss in
seconds, rain in N laps, blisters, tyres gone, graining, cold, the axle call, and the
wear ladder at 50/25/10/0 % (`WEAR_STEPS`, `:29`). One line every 9 s at most, no
line twice in 45 s (`:43-46`), through `G.announce` at "info" priority so it never
talks over a flag (`:176-178`; priorities `js/game.js:1101`).

**The estimate.** `PitLane.estimate(c)` (`js/race/pit-lane.js:467-479`) already returns
`lossS` (lane travel at the limit plus the box time minus the road time), `gapS` to
the car behind and `marginS = gapS − lossS`, i.e. "do you come out ahead of them".
Only the engineer's caution line reads it today.

**Strategy.** Only the AI has a plan: `c.pitPlan = pits.planFor(roll)` for every
non-human car at grid-up (`js/game.js:1909`), from `AiDrive.stintPlan`
(`js/physics/ai-drive.js:694`) with pit loss derived from the lane in laps
(`js/race/pit-lane.js:1069-1083`), executed by `PitLane.think` (`:1087-1119`) through
`AiDrive.pitNow` (`ai-drive.js:782`), with the compound chosen by
`AiDrive.compoundFor` (`:762`). The player has `pitPlan = null`, chooses a starting
compound on the TYRES tab, and decides live. The plan is not exposed anywhere a
player can read it — not their own (there is none) and not a rival's.

**The map.** `drawMinimap` (`js/ui/hud.js:850-1013`) draws the lane as a light dashed
run from `pit.sA` to `pit.sB` and a white "P" disc at the entry line `pit.sIn`
(`:927-948`), rivals as 4 px squares, the player as a 4 px white disc. The map is
auto-hidden in onboard cameras and in the MINIMAL profile (`:82-83`), and MINIMAL
also hides sectors, energy, overtake and aero (`css/hud.css:258-262`); `#hud-pit`
and `#hud-tyre` survive it.

## 2. The pit entrance on the map, and in MINIMAL

### 2.1 What is wrong

- The "P" sits at the **entry line**, 70 m past where the entry road actually
  peels off (`pit.sA`). A player who steers at the "P" is already on the road
  that the boards told them to take 100 m earlier.
- The marker is the same in every state: 5 px, white, whether the pit window is
  open, the car is armed, or the box is the next thing that happens.
- In MINIMAL the map is gone and nothing else says where the entry is, so the
  only guidance is the cue text, which has no direction until 550 m out.

### 2.2 Design

**Marker at the peel-off, not the line.** Draw the "P" at `pit.sA` and keep the
dashed run from `sA` to `sB`; the entry line becomes a short tick across the lane
run. One-line change in `drawMinimap` (`hud.js:943`).

**A marker that carries state.** Read the same three facts the cue reads:

| state | marker |
|---|---|
| no stop worth making | as today: 5 px white "P" |
| a stop is worth making (`cue` would show) | the "P" grows to 7 px and takes `--you` |
| armed (`c.pitArmed`) | pulses (the `pulse` keyframe `#hud-pit` already uses) |
| in the lane / box | the player's disc turns `--you` while `pitState !== "none"` |

The wear/tread/caution gate is already a pure function of the car; extract it from
`cue` as `PitLane.worthStopping(c)` so the map and the cue cannot disagree.

**Distance ring.** From `CUE_M` (550 m) in, draw an arc along the map from the
player to `sA` in `--you` at 2 px, so the map shows *how far* the entry is, the way
the cue text does. The map already has `at(s)`; the arc is the same loop the lane
run uses (`:937-941`) from `player.s` to `sA`.

**MINIMAL profile.** Two options; recommend the first.

1. *Keep the map hidden, promote the cue.* In MINIMAL, `#hud-pit` moves from the
   tyre box to the top centre under the banner, with the arrow doubled in size and
   a distance under it, from `CUE_M` in. The cue is already the one element that
   knows both direction (`side`, `hud.js:655`) and distance (`dist`); MINIMAL loses
   nothing it did not already hide. CSS only: a `body.hud-prof-minimal #hud-pit`
   block in `css/hud.css`.
2. *Show a 60 px map slice around the entry* while `toEntry(c) < CUE_M` in MINIMAL.
   Breaks MINIMAL's own promise (no chrome), so no.

### 2.3 Tests

- `tests/unit/pit-lane.test.mjs`: `worthStopping` is the cue's gate — for every
  `(wear, tread, caution)` triple, `cue(c) != null` ⇔ `worthStopping(c)`.
- A DOM test for the map is not worth a browser; a **VM** test can call the pure
  arc-builder if the loop at `hud.js:937-941` is extracted as
  `laneRun(map, n, fa, fb)` — assert the run starts at `sA`'s node and the entry
  tick lands at `sIn`'s.
- `tests/unit/css-layers.test.mjs` already catches a hidden element that paints;
  the MINIMAL block gets the same treatment as `#hud-pit[hidden]` (`css/hud.css:448`).

### 2.4 Cost

hud.js ≈ +25 lines (it is ratcheted: `tests/data/ratchets.json`; the commit hook
absorbs ≤ 40), pit-lane.js +8, hud.css +10. No new hook, no new group; the
`hud` spec group covers it if one exists for the profile.

## 3. On-screen notifications and directions

### 3.1 What is wrong

- **Silence on the exit road.** `cue` returns null for `st === "out"` (`:555`), yet
  the exit is where a serviced car rejoins traffic at 80 km/h into cars at 300.
  Nothing says "MERGE" or names the car about to pass.
- **The countdown is text only.** "PIT 320m" with an arrow; a driver at 300 km/h
  reads a bar faster than a number.
- **No confirmation that the stop is *booked*.** Arming is a gesture (hold the
  lane); the cue says "BOX" but never what will be fitted, so a driver cannot tell
  a wet stop from a slick stop until the wheels are on.
- **Nothing after the stop.** No stationary time, no positions lost, no "you came
  out ahead of X". The estimate has `marginS` and nobody says it.
- **The engineer and the cue can overlap.** Both write to the same driver; the
  engineer's quiet timer (`QUIET_S`, `engineer.js:43`) does not know the cue is
  already saying "KEEP LEFT".

### 3.2 Design

**Extend the ladder, do not replace it.** New phases in `PitLane.cue`:

| phase | when | text |
|---|---|---|
| `fitted` | armed, `c.pitNext` set | "BOX — <COMPOUND>" (`G.tyres.classRecord` has the code) |
| `served` | the moment `pitState` leaves `box` | "GO GO GO" for 1.2 s |
| `merge` | `st === "out"` and a car within 3 s behind on the track side | "MERGE — <CODE> CLOSING" |
| `out` | `st === "out"` otherwise | "EXIT — <n>m" to `sB` |

`merge` reads `G.cars` the way `estimate` does (`:475-477`), restricted to cars
whose `s` is behind the exit road's end and closing.

**A distance bar.** `#hud-pit` gains a thin bar under the text that fills from
`CUE_M` to 0 (a `--pit-dist` custom property set from `cue.dist`, the way
`--pit-commit` is set today, `hud.js:642`). The bar turns `--you` in the last 90 m
(`BOX_CUE_M`). CSS only past the one property.

**One voice.** `RaceEngineer.update` skips its line while `PitLane.cue(c)` is in a
directional phase (`keep`, `stop`, `merge`): a one-line guard reading the cue,
which is already computed for the HUD each tick. Add a `PitLane.lastCue` getter so
the engineer does not recompute it.

**A stop summary.** When `pitState` returns to `none` after a stop, one banner at
"info": "STOP <box time>s — P<n>, <±k> PLACES" from `c.pitStops`, the position
before arming (store it on `arm`, `:1115`) and the position now. Both numbers exist;
the message is the missing piece.

**The first stop, taught.** The once-per-session banner (`:573-577`) becomes a
three-step teach on the player's FIRST ever stop (`store.get("apex26.pitTaught")`):
"PIT ENTRY — TAKE THE PIT ROAD" at the road, "HOLD THE LANE — STOP AT YOUR CREST"
at the entry line, "STOP ON THE GLOWING GATE" at 90 m. The gate and the crest are
in the world now; the words point at them.

### 3.3 Tests

- `pit-lane.test.mjs`: the ladder is pure — table-drive `(state, togo, cars)` →
  `phase`; a closing car within 3 s on the exit road yields `merge`, one 4 s back
  yields `out`; `served` lasts one cue call after the box.
- `tests/unit/engineer.test.mjs` (exists for `callFor`): `update` returns ""
  while the cue is directional, and the wear step is NOT consumed (`:171-174`).
- `tests/specs/pit-lane.spec.js` gains one test: drive an AI stop and read
  `__apex.pit().cue` through `out` — the browser is the only place `G.cars` is real.

### 3.4 Cost

pit-lane.js ≈ +60 (not ratcheted at game.js's level; it has its own row), hud.js
+10, hud.css +15, engineer.js +6. One browser test in the pit-lane spec (≈40 s).

## 4. Strategy

### 4.1 What is wrong

- The player has **no plan**, so "am I on schedule" has no answer; the engineer's
  wear ladder is the only clock.
- The estimate's `marginS` (`:478`) — the undercut/overcut question — is computed and
  never shown.
- Rivals' plans (`c.pitPlan`, `lapsAt`, `seq`) are secret. Real broadcasts show
  "expected stop lap"; the pit-wall knows the field's likely windows.
- Nothing suggests a **change** of plan: rain arriving (the engineer says "be
  ready", never "box lap N"), a caution (the engineer says "cheaper stop", never
  whether it fits the plan), a rival pitting (no reaction at all).

### 4.2 Design

**A player plan, from the same function.** At grid-up give the player
`c.pitPlan = pits.planFor(0.5)` too (`js/game.js:1909` drops the `!c.human`), with
`plan.start` NOT applied (the TYRES tab is the player's choice, `:1910` stays AI-only).
Nothing executes it — `PitLane.think` keeps its `c.human` guard — it is a
**reference**: the plan the pit wall would run.

**A strategy line on the HUD.** In the tyre box, one line: "PLAN: <stops>-STOP,
BOX L<next>" from `plan.lapsAt[c.pitStops]` and `plan.seq`, turning amber when
`lap >= next − 1` and `--you` on the stop lap. Under CAUTION, if `estimate().caution`
and `marginS > 0`: "FREE STOP — FITS PLAN" / "FREE STOP — ONE FEWER". A `data-plan`
attribute on `#hud-tyre` carries the state for CSS.

**A pre-race STRATEGY panel** on the RACE SETTINGS dialog (`index.html` `#race-settings`, its logic in `js/game.js`)
when TYRE WEAR is not off: the plan as a stint bar (compound colours from
`TyreModel`, lengths from `lifeLaps`), a `stops` stepper (0–3) that re-runs
`stintPlan` with the count pinned, and the pit loss for this circuit in seconds
(`estimate().lossS`) — the number that makes a 2-stop at Monaco read as the
mistake it is. Persist as `apex26.pitPlan.<trackId>`.

**Engineer calls that name a lap.** Extend `callFor` (`engineer.js:76-102`) with
plan-aware lines, above the wear ladder and below the tread/caution lines:

| sense | line |
|---|---|
| `lapsToStop === 1` | "BOX NEXT LAP — <COMPOUND>" |
| `lapsToStop === 0` | "BOX BOX BOX" |
| rival within `marginS` of you pitted this lap | "<CODE> HAS BOXED — UNDERCUT ON, BOX NOW OR PUSH 2 LAPS" |
| `rainInLaps <= lapsToStop` | "RAIN BEFORE THE STOP — BOX LAP <n> FOR WETS" |
| caution and `marginS > 0` | "CAUTION — STOP NOW LOSES NOTHING" |

`senseOf` gains `lapsToStop` (from the plan), `rivalBoxed` (a rival whose
`pitStops` rose this lap and whose gap is inside `marginS`) and reads `marginS`
from `estimate`. All pure; `callFor` stays table-testable.

**Rivals' windows on the timing tower.** Next to each rival, a small "P<lap>" from
their `pitPlan.lapsAt[pitStops]` when within 3 laps, fading to "IN" while
`pitState !== "none"`. Read-only; the tower already iterates `G.cars`.

**Re-planning.** Once per lap on the player's lap change, if wear/weather moved the
plan by more than a lap, re-run `stintPlan` with `laps` = laps left and the current
compound as `start`; announce only when `lapsAt[0]` changes ("PLAN: BOX L<n> NOW").
The AI does not re-plan (its stop reasons are `pitNow`'s three); the player's plan
is advice, so it may.

### 4.3 Tests

- `tests/unit/ai-drive.test.mjs` (exists): `stintPlan` with `stops` pinned returns
  that many stops and keeps `lapsAt` inside `[1, laps−1]`.
- `engineer.test.mjs`: the five plan lines in order against the existing
  ladder (a tread call still beats "BOX NEXT LAP"; "BOX BOX BOX" beats the wear
  ladder).
- `pit-lane.test.mjs`: the player's plan never arms a stop — drive a human car
  through `think` and assert `pitArmed` stays false.
- `tests/unit/race-settings-vm.test.mjs` (exists) for the panel (compound bar
  lengths sum to the lap count; the stepper re-plans).

### 4.4 Cost

engineer.js +40, pit-lane.js +20, the RACE SETTINGS panel +80 in game.js (ratcheted, so likely a `js/ui/pit-strategy.js` module of its own) plus its CSS, hud.js +15
(ratcheted), game.js +2. One new store key. No physics change: everything reads
`estimate`, `stintPlan` and the tyre model as they are.

## 5. Order

1. §2 marker at the peel-off + MINIMAL cue (an afternoon; pure win).
2. §3 exit-road cues, the distance bar, one voice (the safety items first: `merge`).
3. §4 player plan + engineer lap calls (the strategy core), then the panel and the
   tower windows.

Each step is a commit on its own with the tests above; none needs a new browser
group. The browser-side evidence for all three is the existing `pit-lane.spec.js`
plus one `__apex.pit().cue` walk on the exit road.
