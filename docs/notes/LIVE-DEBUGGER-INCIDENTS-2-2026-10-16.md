# Live debugger hunt 2: incidents and collisions (2026-10-16, round 2)

Lane `cursor/live-debug-incidents-2-8b4f`, from the deploy tip after #2561 (merge `fd36c75f`).
Round 1 report: `LIVE-DEBUGGER-INCIDENTS-2026-10-16.md`. Same method: js-debugger on a headless
SwiftShader Chrome (844x600), page parked with `about:blank` -> navigate -> `headless(true)`; NaN/Inf/yaw
breakpoints on both impulse sites of `collide.js`; recorders as side-effect breakpoint conditions.

## Scope covered

| Deferred item | Status |
|---|---|
| (1) pit-entry contact | DONE with caveats: 4 armed AI cars bunched 30-48 m before the Spa pit entry; no NaN / wide / overlap; leads for the race lane below |
| (2) SC and finish-line incidents | DONE (Spa): finish-line crossings under a takeover, the player's race finish under a takeover, a pile-up escalating to SAFETY CAR with a second hit during deployment |
| (3) real takeover-budget exhaustion | DONE (Monza) |
| (4) c1Pileup on 2 more circuits | DONE: Spa and Monaco (Monza in round 1) |
| (5) caught exceptions during race load and circuit switch | DONE for Monza -> Spa (pause-on-caught `all`) |

## Findings

| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue |
|---|---|---|---|---|---|---|---|
| (none) | | | | | | | |

## Clean areas (do not re-hunt)

- **Budget exhaustion (item 3), Monza:** 8 strike pairs (60 m/s strikers 14 m behind stopped cars, too close to brake) spread over the lap. `MAX_INCIDENTS` 3 reached at tick 9: 3 incidents, 6 cars owned; the other 4 clusters hit the cap path at `incident-sim.js:196` (`rejected.incidentCap` = 4, recorder: clusters `[9,10] [8,7] [5,6] [3,4]` with 3 incidents / 6 owned). `takeoverCap` never reached (6 < `MAX_TAKEOVER` 8: with 2-car clusters the incident cap binds first). All 6 promoted cars handed back (`handbacks` 6, `fallbacks` 0, `owned` 0); no NaN / wide / runaway speed; the 4 cap-refused pairs resolved on the cheap resolver; no stuck car 10 s later (all > 3 m/s).
- **c1Pileup, Spa (item 4):** player at 70 m/s into 3 stopped cars. 6 cars promoted over time, an `r2` at tick 31-32 then staggered `r3` incidents (the cascade splits across ticks, as on Monza); last handback tick 239; `owned` 0, `fallbacks` 0, every car finite and |x| < 14. Player ends at x 0, 4.2 m/s, rivals 16-18 m/s.
- **Caught exceptions (item 5), Monza -> Spa switch with `debugger_exceptions all`:** the circuit switch, `race()` load, `go()` and the pile-up threw nothing caught; the debugger never paused.

- **Finish line (item 2), Spa:** pile-up 60 m before the line, 4 cars crossing while owned: each crossing counted exactly once (3 AI `lap` 1->2 at ticks 60/104/132, the player 0->1 at 162), no `prog` jump over 8 m per tick. With the player on its final lap and the stopped cars at the line, the player crossed at tick 65 while the incident layer owned a car: `lap` 3->4, `finished` flipped to true once, `finPos` 0, speed 9 m/s afterwards. `_lapCross` / `onIncidentLineCross` behaves.
- **Safety car (item 2), Spa, caution layer on:** pile-up -> GREEN -> YELLOW (tick 225) -> VSC (240) -> SAFETY CAR (270); a second hit at tick 270 ran two more `r2` incidents (294-476); 4 promoted / 4 handed back, fallbacks 0, nothing non-finite; the SC dropped to VSC at 1095.
- **c1Pileup on Monaco (item 4):** player 60 m/s into 3 stopped cars on the street circuit: one `r2` incident, 2 cars owned, handed back at tick 211, fallbacks 0, nothing non-finite; the rest of the cluster stayed on the cheap resolver (`belowThreshold` 31).
- **Pit-entry bunch (item 1), Spa, tyre wear `real`:** 4 armed AI cars at 45 m/s, 30-48 m before the entry (s about 6734 of 6948), x -5/-2.5/0/2.5. No NaN / wide / runaway speed in any run; one `r2` incident between two of them at tick 127 (handed back by 263, fallbacks 0).

## Leads, not findings (race-lane files: `pit-lane.js` / `race-control.js`)

- In the fresh-race pit run, 3 of the 4 armed cars had `stops` 0 after 1500 ticks (only car 2 took its stop), and cars 1 and 3 spent 819 and 858 ticks (13-14 s) below 3 m/s, one still at 0 m/s at the end. Not confirmed as a defect: the incident `r2` at tick 127 and the 2.2 s `boxS` queue behind it may explain part of it, and I did not watch the pit state machine step by step. AI pit `state` stayed `none` throughout (the AI uses a simplified stop; the state machine is the player's), so `state` is not a usable probe for AI stops.
- `maxOwned` 2 with `promoted` 0 at the end of one run: very likely `game.js:4682` (red-flag restart: `IncidentSim.reset()` zeroes the counters) with the caution layer left on from the earlier SC run. Not observed directly (no level-4 sample), so a hypothesis.

## Methodology pitfall (cost me two misleading reads)

The game keeps simulating in real time BETWEEN `debugger_run` calls even with `headless(true)` (that suppresses drawing, not the loop). Anything read in a second call is not the state at the end of the first. Measure inside one synchronous `debugger_run`; compare nothing across calls.

## Not run, and why

- Nothing from the deferred list is left, but the real-race coverage is thin: the player was never driven into the pit lane (the AI stop model is simplified), and no safety-car incident was hit by a player under SC speed caps.
- No code changed this round, so no browser group is owed; `collisions` on the deploy tip is the orchestrator's.

## js-debugger tool problems hit

- `debugger_state` keeps growing (every operation since attach); detach/attach resets it but drops breakpoints.

## Next step

Nothing pending from the deferred list. If the race lane wants the pit-stop lead chased, it needs a single synchronous run that watches `pit-lane.js` stepping (breakpoint recorder in its stop state change) with the player armed.
