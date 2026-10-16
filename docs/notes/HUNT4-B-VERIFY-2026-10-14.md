# Hunt 4 lane B-VERIFY — B-F1 and B-F5 measured in Chrome (2026-10-14)

Read-only follow-up to `docs/notes/PERF-HUNT-4-2026-10-14.md` §B. Hunter B measured F1 (car-field representation
deopt storms) in Node 22 with TurboFan only, and left F5 (heap growth over a race) unattributed. This note repeats
both in Chromium, which tiers through Maglev. The tree under test is PR #1505's head `f8f510fb3`
(`cursor/hunt4-bugs-3e2e`: `CarFields.warmShape` at `gridUp`, `lastLap` / `uslipHapT` / `lockHapT` predeclared).
No `js/` file was edited.

## Verdicts

- **B-F1 is confirmed in Chrome, and warmShape works there.** Over a race (from the grid to the end), with warmShape
  disabled vs enabled: "wrong map" deopts 351 → 45 and 397 → 29; dependent-code invalidations 1,030 → 164 and
  1,012 → 102; Maglev compiles 1,652 → 595 and 1,792 → 619. The bursts at the first lap line and the first pit
  window are gone (tables below). Wall time from the grid to the end fell 15.6 → 7.8 s and 22.2 → 13.4 s. That
  figure is indicative: two runs each, an idle box (loadavg < 2.5), the same step count.
- **Residual (new): five car fields still change V8 constness mid-race** with warmShape on. `_recross`, `fuelLap`
  and `incidentInvalidLap` change at the first lap line (`race-control.js:114`, `:118`, `game.js:6255`), and
  `pitState` and `pitStops` at the first pit stop (`pit-lane.js:1287`, `:1312`). Each change is
  `const → mutable` ("dependent field type constness changed", 26–29 invalidations at the first line). They are not
  in `WARM` because their value KIND never changes (B's probe and the PR's test look at kinds), but the first
  rewrite of a field still makes it mutable on the shared map. Possible follow-up (lane BUGS, not done here):
  have warmShape also store a different value of the same kind into these fields and put the original back
  (`false`/`true`, `0`/`1`, `"none"`/`"lane"`). Storing the same value again may not count as a write that ends
  constness. That is unverified: measure it.
- **B-F5: no JS-object leak, and the growth is bounded.** After a forced GC, from lap 2 to lap 8 (a 9-lap monza
  race, warmShape on), the V8 heap went 34.79 → 35.43 MB (+0.64 MB). Snapshot self size grew +0.83 MB. Of that:
  - 0.61 MB is compiled code and its metadata. That is optimized code for functions that first get hot in later
    laps (`pollGamepad`, `tick`, `replan`, `getCrewMesh`, the radio voices), plus their deopt data
    (TrustedByteArray, ProtectedFixedArray) and weak lists.
  - 0.13 MB is browser performance-timeline entries (`PerformanceLongAnimationFrameTiming` 63 → 199,
    `LayoutShift` 18 → 103, plus their `DOMRectReadOnly` attribution rects). The browser caps these buffers at
    200 and 150 entries.
  - JS objects grew +5 KB, closures +1 KB, and arrays, heap numbers and strings by 0.
  B's Node figures (old space 56.1 → 60.1 MB, code space 3.2 → 4.8 MB) are space sizes without a forced GC, so
  they include garbage that had not been collected yet. B-F5 can close as "tier-up code plus capped perf buffers".

## Method

- Chromium 141.0.7390.37 (Playwright's `chromium-1194`), headless, `--no-sandbox --use-angle=swiftshader`. For
  F1, the flags were `--js-flags="--trace-deopt --trace-opt"`. One extra run used
  `--js-flags="--trace-deopt --trace-generalization"`. The renderer's stdout was read through
  `chromium.launchServer().process()`.
- The game is served from the working tree by `tools/lib/harness.mjs` `startStaticServer`. The script calls
  `__apex.race("monza","day","dry",{laps})`, then `headless(true)` and `carRole(player,{human:false})` (the player
  car is handed to the AI, as in `car-fields-vm.test.mjs`), then `go()`, then `pit({car:3, arm:true})`. After that
  it loops `step(1/60, 120)` per evaluate. A mark is recorded at each leader lap change and at the pit car's
  lane entry and exit, so trace lines can be attributed to race windows.
- **warmShape off** = `CarFields.warmShape = (c) => c` set from the page after load and before `race()`
  (`CarFields` is not frozen; the PR's VM test uses the same seam). The `lastLap` / haptic predeclare is still
  active in both arms, so this A/B isolates warmShape. It is not a comparison with the pre-PR base.
- Counted: `[bailout …]` lines (deopts, with `reason: wrong map` counted separately); `[marking dependent code …]`
  lines (lazy invalidations, which is how a map generalization reaches code that is already optimized); completed
  MAGLEV and TURBOFAN compiles. The "car fns" column covers `updateCar`, `updateCarLateral`,
  `updateCarBrakePlan`, `think`, `brakeDecision`, `sweepContacts`, and B's deopt sites `fuelFrac`
  (tyre-model.js:539), `inLane` (pit-lane.js:800), `_liveProg` (collide.js:154) and `flagOut`
  (race-control.js:52).
- F5: CDP `HeapProfiler.collectGarbage`, then `takeHeapSnapshot` and `Runtime.getHeapUsage`, at the leader's lap
  2 and lap 8 lines. The two snapshots (31.7 / 32.0 MB) were diffed by node type and name.
- The scripts (driver, analyzer, snapshot differ) lived in the session scratchpad. The raw traces were 7–21 k lines
  per run. Browser runs: 7 of the 10 allowed (one aborted on a script bug before the race).

## B-F1 numbers

Run 1: a 2-lap race that ran to the results screen (15,000–15,360 steps). Run 2: a 6-lap race stopped at the
28,800-step cap, just past the leader's lap 4 line. The windows run from the grid to the leader's first full-lap
line, then from that line to car 3's lane entry (~600 steps), then the pit window, then the rest.

Run 2 (6-lap, cap 28,800 steps), warmShape **off → on**:

| window | deopts | wrong map | dep. invalidations | Maglev | TurboFan | car fns deopt+inval | car fns compiles |
|---|---|---|---|---|---|---|---|
| grid → first lap line | 270 → 120 | 180 → 16 | 662 → 60 | 1,165 → 462 | 262 → 187 | 128 → 46 | 140 → 61 |
| first lap line → pit entry | 84 → 25 | 67 → 4 | 138 → 33 | 194 → 43 | 17 → 15 | 29 → 11 | 27 → 8 |
| pit window | 74 → 19 | 57 → 0 | 161 → 4 | 246 → 41 | 70 → 21 | 30 → 5 | 35 → 8 |
| pit exit → lap 3 line | 15 → 11 | 10 → 4 | 6 → 5 | 31 → 21 | 35 → 14 | 2 → 1 | 2 → 2 |
| lap 3 → lap 4 line | 6 → 4 | 4 → 1 | 0 → 0 | 25 → 21 | 24 → 21 | 0 → 0 | 2 → 1 |
| lap 4 line → cap | 86 → 9 | 79 → 4 | 45 → 0 | 131 → 31 | 41 → 10 | 8 → 0 | 14 → 0 |
| **race total** | **535 → 188** | **397 → 29** | **1,012 → 102** | **1,792 → 619** | **449 → 268** | **197 → 63** | **220 → 80** |
| wall, grid → end | 22.2 → 13.4 s | | | | | | |

Run 1 (2-lap, to results), race total, off → on: deopts 499 → 202, wrong map 351 → 45, invalidations 1,030 → 164,
Maglev 1,652 → 595, TurboFan 361 → 238, car fns 200 → 59 deopt+inval and 204 → 79 compiles. Wall time
15.6 → 7.8 s. Boot and build (before the grid) are the same in both arms, ~550 deopts and ~880 Maglev compiles,
which is the control.

With warmShape off, the first lap is the costly part. That window takes 12.1 s vs 4.8 s of wall time for the same
7,560 steps. Its 1,165 Maglev recompiles match the mechanism hunter B described. Chrome re-tiers quickly, but in
this 22-car field it re-tiers about 2.5× as often. The off arm's "lap 4 line → cap" burst (79 wrong-map deopts) is
another generalization late in the race that warmShape's list already covers (4 left with it on). Which field it
is was not attributed.

Per car function, race total, off → on (deopt+invalidations / compiles), run 2: `updateCar` 31/25 → 22/20,
`updateCarLateral` 26/29 → 15/19, `updateCarBrakePlan` 24/27 → 15/17, `think` 17/20 → 4/5, `sweepContacts`
29/35 → 0/2, `flagOut` 26/30 → 0/1, `inLane` 23/27 → 2/6, `fuelFrac` 18/22 → 2/5. The functions behind B's deopt
sites (`fuelFrac`, `inLane`, `flagOut`, `_liveProg`) are quiet with warmShape on.

The dominant invalidation reason with warmShape off is "dependent prototype chain changed" (1,002 of 1,012). With
it on, that reason drops to 113 and the next largest is "field type constness changed": the five fields above,
named by the `--trace-generalization` run.

## Not run / unverified

- The pre-PR base (`d8f9a88eb`, without the `lastLap` predeclare). These runs A/B warmShape only.
- A full race distance (53 laps) in Chrome. Run 2 stopped at lap 4+, and the heap run covered 9 laps.
- The render path. Every run used `headless(true)`, so renderer heap and code, and frame-time effects, are not in
  these numbers. Wall times are from `step()` loops with rendering skipped and are indicative.
- Android Chrome (Maglev tiers up at 1,000 calls there, not 400).
- The constness follow-up (five fields) is a proposal and has not been measured.
- The 28 `AudioBufferSourceNode` / `AudioParam` objects seen at lap 8 may be radio sounds still playing at that
  moment. Bounding them would need a third snapshot.

## Sources

- V8 flag definitions (`--trace-deopt`, `--trace-opt`, Maglev on, `invocation_count_for_maglev` 400 / 1,000 on
  Android, TurboFan 3,000): https://raw.githubusercontent.com/v8/v8/main/src/flags/flag-definitions.h
- V8 flags in Chromium (`--js-flags`, `--no-sandbox` so the renderer can write logs):
  https://v8.dev/docs/profile-chromium
- `--trace-deopt` / `--trace-opt` through Chrome's `--js-flags`:
  https://mrale.ph/blog/2012/06/21/v8s-flags-and-chrome-on-windows.html (old; behaviour re-checked by these runs)
- Deopt-log flags (`--log-deopt`, `--log-maps`) used by Deopt Explorer: https://github.com/microsoft/deoptexplorer-vscode
- Maglev tiering: https://v8.dev/blog/maglev
- Performance-timeline buffer caps (layout-shift 150, long-animation-frame 200):
  https://w3c.github.io/timing-entrytypes-registry/ and
  https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing
