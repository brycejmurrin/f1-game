# Live debugger hunt — race weekend, round 2 (2026-10-17)

Lane: race weekend + AI racecraft (hunter, js-debugger MCP, SwiftShader Chromium, `headless(true)` stepping).
Prior report: `LIVE-DEBUGGER-RACE-2026-10-16.md` (R1, R2, F-2565 not re-reported). Deploy tip at start: `origin/claude/f1-game-project-26h3ng`.

## Scenario matrix run

All `grid: "tier"`, `tyres({level:"real"})`, the player parked (the harness watches the 21 AI cars: pit state transitions, compound sequence, stuck >8 s outside the lane, NaN in wear/grip).

| # | track | weather | laps | result |
|---|---|---|---|---|
| S1 | monza | dry | 6 | no stops, one compound, no NaN/stuck. BY-DESIGN: `TWO_COMPOUND_MIN_LAPS = 8` (pit-lane.js:1516) exempts short races |
| S2 | albert_park | dry | 10 | PASS. 21/21 AI made one stop on their planned lap, two compounds each, teammates sequenced through the shared box (NOR→PIA box>out 355.5 s vs lane>box 355.5 s), no stuck, no NaN. Lapped cars finish on their next crossing after the flag (real rule) |
| S3 | suzuka | dry→rain arc (240 s) | 10 | see R3 below; 13 of 21 AI changed to I/W within ~2 laps of the rain, 8 did not stop at all |

Not covered (stopped at the capture cap): night/fog, sprint leg, qualifying→race hand-over, flying start.

## Rows

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| R3 | `js/race/pit-lane.js` `laneX` (1058-1095) / `update` latch (1267-1285) | med | CONFIRMED-LIVE (symptom), root cause OPEN | Suzuka 10 laps, dry→rain. At t=300 s eight AI cars (NOR VER OCO BEA SAI ALB HUL PER) were `armed:true, why:"weather"` on slicks; at t=700 s (lap 5) they still had `stops:0` and no `pitState` transition at all (`ev.length 0`) while 13 others stopped for I/W. Window pass sampled for 4 of them: `state:"none"`, `inLaneLat:false` for the whole 260 m window, lateral `x` −7.8→−1.4 (road half-width 7, i.e. against the wall face then back to the line) while `laneX` asked for −14.5→−18.25, speed 14→7 m/s at the window start. A frame pause in `laneX` at `toEntry=0` showed `road:null, guided:false, inLane:false, pitArmed:true, x:+1.6, want:+2.4` (num 87): the entry-road guidance (`road==="entry"`) ends at the window start and the window itself is not guided for a `pitState:"none"` car, so a car that is not already in the lane at the line stays on the racing line and `update` (1282-1285) refuses the latch every lap. Open: why those 8 reach the line off the lane when 13 others did not (they were the back of the grid, so slow/traffic arrival is the lead). The follow-up probes (logpoint/pause at the approach branch, 1075-1077) ran after the last-lap rule had cleared `pitArmed`, so they are NOT evidence; redo on a fresh race |
| R4 | `js/physics/tyre-model.js` `lapsOn` (960) / `fit` (773) | med | CODE-TRACED + unit-tested, FIXED in #2599 (20a0e04f) | `fit` stamps `tyreLap0 = c.lap`; a box BEFORE the line fits mid-lap N, so the next crossing (N+1) reads `lapsOn = 1` after a partial lap. Feeds `replan` loadK (floored at 0.6 right after a stop: sets planned ~1.67x too long, false PLAN B), `wetLapsToStop`, HUD laps-left. Measured by the hunter agent: 4-11 of 12 boxes are before the line on all 52 circuits. Fix: `fit` stamps `tyreLapAdj` (1 for a pre-line box, lap >= 1), `lapsOn` subtracts it. Test `tyre-model.test.mjs` "lapsOn: a stop in a box BEFORE the line…" fails before, passes after. Not live-confirmed (capture cap) |
| R5 | `js/race/pit-lane.js:1195` | med | CODE-TRACED, FIXED in #2600 (b81200e0) | an AI that owes the second dry compound and is re-cut to a stop at T-1 can cross into lap T unserved (pre-line box, missed pass or shared-box wait); `clearArm` at 1195 and `think` at 1827 then drop the stop and `applyCompoundRule` disqualifies it. Suggested: keep the arm while `twoCompoundApplies() && compoundShort(c.tyreLog)`, or clamp an owed re-cut stop to <= T-2. Needs a pit-lane VM test (T=10, armed at lap 9, box past the line); not written |
| (clean) | `js/race/pit-lane.js` 1195-1196 | — | BY-DESIGN | an armed AI is disarmed on the last lap / after the flag (`clearArm`), so a car that missed its entry for several laps is not served and keeps its tyres to the flag |

Fixes: R4 in #2599 (20a0e04f), R5 in #2600 (b81200e0). Open: R3 is issue #2601. R3's mechanism is not pinned down well enough for a failing-before / passing-after unit test, and `js/game.js` (steering) is outside OWNED.

## Method notes (for the next hunter)

- `race()` while a race is live goes through the menu first; an awaited promise around it hung the debugger op. Fire `race()` in one `debugger_run`, then poll `info().state === "race"` in separate calls.
- A conditional breakpoint on a per-AI-per-tick function (`laneX`) makes the sim crawl (CDP round trip per hit). Use a breakpoint on a rarely-reached line, or `debugger_control cancel` + reload.
- `debugger_logpoint` has no `condition`; fold the filter into the expression.
- `carState()` returns the whole field (index = car id) with `x`, `s`, `speed`; `pit({car})` has `atM` (m from the window entry, only meaningful in-window).
- `weather()`/`weatherArc()` return very large objects: never return them from `debugger_run`.
