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

## Clean areas
- 22-car monaco field, 600 ticks (20 s of race time) through a dry -> rain arc with every exception paused: no exception, no lap counter going backwards, no NaN tyre temperature, max |Δ tempS| 2.4 °C per 30 ticks.
- `tooling-fast` 639/639 on 86419660; `physics-core` (incl. `physics-characterization`) 4/4 llvmpipe shards pass on 2a19cad8 (CI run 38966118025).

## Not run, and why
- Full multi-lap races on monaco/spa/vegas/singapore under dry, MIXED, rain, storm: SwiftShader here is ~5 min wall per 20 s of sim with 22 cars.
- Forced SC / red flag / jump start / practice rewind live, pit-lane stress (5+ AI same lap, pit under SC, final lap), AI rescue teleport, classification edge cases (final-lap retirements, red flag at 75 %, lap ties): same limit; need `/dev/dri` or an llvmpipe runner.
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
