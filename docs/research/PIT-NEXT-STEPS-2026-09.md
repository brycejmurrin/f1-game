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
