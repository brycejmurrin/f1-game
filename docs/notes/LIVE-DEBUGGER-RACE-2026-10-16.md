# Live debugger hunt — race weekend and AI racecraft (2026-10-16)

Lane: race weekend + AI racecraft. PR #2549. Owned: `js/race/**`, `tyre-model.js`, `ai-*.js`.

## Scope covered
- R1 and R2 (seeded static findings): verified, fixed, tested.
- Debugger live: headless Chromium on :9222 (orchestrator recipe), exceptions paused on **all**, breakpoints in `tyre-model.js`.
- One live scenario slice: monaco, 22 cars, dry -> rain arc 120 s, `step(1/30)` x 600.
- #2565 (AI does not brake for a stopped car): reproduced in the Node VM, root cause found, patch posted on the issue; handed to a fresh session (not in this PR).

## Findings
| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue |
|---|---|---|---|---|---|---|---|
| R1 | `js/physics/tyre-model.js` `ambientAt`/`trackTempAt` (+ `js/race/weather-arc.js:446-452`) | med | CONFIRMED-LIVE | paused in the page's real `ambientAt` (reached via `startRaceBody` -> `info()` and per-tick `update`); pre-fix module: cell arc at its end gives ambient 13 -> 30 °C, track 14 -> 48 °C in one step; fixed module: 29.915 -> 30, 47.83 -> 48 (< 0.1 °C). Arc object was supplied by hand (the `weatherArc` hook builds a non-cell arc) | 86419660 | `tests/unit/tyre-model.test.mjs` "R1: ... continuous across a local shower's end" (fails before, passes after) | - |
| R2 | `js/race/race-control.js` `stormTick` + `js/race/driving-coach.js` `restoreWorld` | low | VM-ONLY | not reproduced live (needs a practice drill with ~150 s of storm SC at ~0.4 s/tick). VM: a 100 s rewind inside a storm keeps the SC out ~250 s instead of the SC_ROLL_S 150 s cap | 86419660 | `tests/unit/storm-weather.test.mjs` "R2: a practice rewind ..." (fails before, passes after) | - |
| F-2565 | `js/game.js:5533` `qWin` (outside this lane) | med | VM-ONLY | `queueBrake` first called for the parked player at ~10 m gap at 42 m/s (logged `[v, bv, gap, follow, lvl] = [42.2, 0, 9.8, 16.9, 1]`); AI swerves x 0.2 -> 3.3 m and still touches | not in this PR (fresh session) | spec on the issue comment | #2565 |

Design notes: R1 fix = `arcFrac()` decays the blend as `exp(-(t - cell.life) / 36)` after the shower's life (36 = weather-arc `TAU_DRY`; duplicated constant, could be exported from `WeatherArc`). R2 fix = `stormLastT` carries `stormSince` back by any clock jump.
`wxHeld` itself is not captured by a rewind (practice-only; left).

## Leads from the incidents-2 lane (PR #2580)
- **Lead 1, pit-ARMED AI stops=0 after 1500 ticks, two cars < 3 m/s for 13-14 s near the Spa pit entry: NOT REPRODUCED, BY-DESIGN for the 1500 ticks.** VM (`game-vm`, spa, wear real, 4 AI armed with `pit({car, arm:true})` at t=0): at 1500 ticks (25 s) the cars are 434-560 m into a 6 948 m lap, i.e. still on the grid straight, ~6.4 km from the pit entry, so stops=0 and state none is expected. At 12 000 ticks (200 s) all four had stopped once (`stops 1`, states out/none). Time under 3 m/s per car: 3.3-4.4 s in total, longest 2.8-4.0 s (the ~2.2 s box service plus a 0.4 s launch). Earlier second-pass runs (5 cars, spa, green and under a real SC) also never exceeded 8 s slow outside a box. The 13-14 s in their run is not explained by an armed car stalling at the entry; it would need their exact scenario (a pile-up/red flag hold or a double-stacked box). Asked for it, not chased further.
- **Lead 2, promoted=0 while owned=2 / `js/game.js:4682`:** read only. Line 4682 is `IncidentSim.reset(); DebrisWorld.reset(); DebrisWorld.prime();` on the branch where `redFlagRestart()` declines (once any car has finished). That reset is intentional per the comment above it (ledger 2026-09-22: end the red procedure once and clear the surface). `promoted`/`owned` are that lane's counters (IncidentSim); I cannot say whether the reset zeroes `promoted` without their metric definition; not verified, game.js not edited.

## Clean areas
Short scenarios, second pass (Node VM `tools/lib/game-vm.cjs`, real modules, 22-car field, tyre wear `real`; the page was too slow, ~0.4 s/tick):
- **Pit stress, 5 AI armed on the same lap** (`A.pit({car, arm:true})`), monza green flag; and under a REAL safety car (`G.holdCaution(3)`, `cautionInfo().level === 3` checked before arming) on monaco, spa (420 s window to reach the pit entry at SC pace) and monza: all five `none > lane > box > out > none`, no skipped state, no box overlap (< 3 m), no car under 0.5 m/s for 8 s outside a box, no prog going backwards, no non-finite values; shared boxes (RUS/ANT, LEC/HAM) are served in sequence. (A first "under SC" pass used a hold call that did nothing, SC level 0; it was discarded and redone.)
- **AI stuck/rescue, 3 cars wedged 2.5 m beyond the edge on monaco** (x = ±(hw+2.5), speed 0): all three back on track within 1-4 s, landing inside the half-width, speed restored, `prog` strictly forward, no NaN. Observation, not a defect: the car placed at x +7.5 (hw 5.0) kept driving at x 8.2 for ~6 s at up to 28 m/s before steering in; the synthetic start is outside the wall clamp, `rescueT` decayed once speed rose, so the `js/game.js:6589` x-clamp never fired. Not reachable without a hand-placed car.
- **Classification** (`RaceControl.classify`/`finishOrder`, hand-built cars, 10-lap race): red flag with runners only (A > B > C > D*, 90 % cut works), same-lap tie with a penalty (`finishT + penalty` order, stable ties) correct. A final-lap retiree (9 done) ranks ahead of a finisher a lap down (9 done): `lapsAt` adds 1 for any unfinished car, so it equals the equal-laps FIA rule only if the retiree crossed the line first; left as BY-DESIGN/ambiguous. A retired car with `lap = N+1` and no `finished` flag would out-rank the winner (`lapsAt` 12 vs 11): only reachable when a car retires on the very tick it crosses the final line; not fixed.
- 22-car monaco field, 600 ticks (20 s of race time) through a dry -> rain arc with every exception paused: no exception, no lap counter going backwards, no NaN tyre temperature, max |Δ tempS| 2.4 °C per 30 ticks.
- `tooling-fast` 639/639 on 86419660; `physics-core` (incl. `physics-characterization`) 4/4 llvmpipe shards pass on 2a19cad8 (CI run 38966118025).

## Not run, and why
- Full multi-lap races on monaco/spa/vegas/singapore under dry, MIXED, rain, storm: SwiftShader here is ~5 min wall per 20 s of sim with 22 cars.
- Forced red flag / jump start / practice rewind live, and a pit on the FINAL lap: not driven. (Pit stress under SC, AI rescue and classification were done in the Node VM, see Clean areas; none of them in the live debugger.)
- R2 live; `modes` and `state-unit` groups.

## js-debugger tool problems hit
- `debugger_evaluate` needs a pause token, so reading page state while running means `debugger_run` + `debugger_state` (async; results arrive as operations). Not a bug, but it makes quick probes two calls.
- `debugger_state` prints every frame's scopes (~3 k tokens per call) even when only the token is needed.
- A conditional-free breakpoint in a per-car hot function (`ambientAt`) re-pauses immediately after resume; remove the breakpoint before resuming.
- `debugger_remove_breakpoint` then `debugger_control resume` raced once: the page re-paused on the just-removed breakpoint (needed a second state read for the new token).
- No tool problem blocked the lane.

## Next step
- ready-gate on #2549 once the `run-ci` fast tier is green, then SWEEP to Merge Desk.
- Re-run the not-run list on a faster box.
