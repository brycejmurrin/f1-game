# Live debugger hunt 2: incidents and collisions (2026-10-16, round 2)

Lane `cursor/live-debug-incidents-2-8b4f`, from the deploy tip after #2561 (merge `fd36c75f`).
Round 1 report: `LIVE-DEBUGGER-INCIDENTS-2026-10-16.md`. Same method: js-debugger on a headless
SwiftShader Chrome (844x600), page parked with `about:blank` -> navigate -> `headless(true)`; NaN/Inf/yaw
breakpoints on both impulse sites of `collide.js`; recorders as side-effect breakpoint conditions.

## Scope covered

| Deferred item | Status |
|---|---|
| (1) pit-entry contact | not done yet |
| (2) SC and finish-line incidents | not done yet |
| (3) real takeover-budget exhaustion | DONE (Monza) |
| (4) c1Pileup on 2 more circuits | Spa DONE; Monaco not yet |
| (5) caught exceptions during race load and circuit switch | DONE for Monza -> Spa (pause-on-caught `all`) |

## Findings

| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue |
|---|---|---|---|---|---|---|---|
| (none yet) | | | | | | | |

## Clean areas (do not re-hunt)

- **Budget exhaustion (item 3), Monza:** 8 strike pairs (60 m/s strikers 14 m behind stopped cars, too close to brake) spread over the lap. `MAX_INCIDENTS` 3 reached at tick 9: 3 incidents, 6 cars owned; the other 4 clusters hit the cap path at `incident-sim.js:196` (`rejected.incidentCap` = 4, recorder: clusters `[9,10] [8,7] [5,6] [3,4]` with 3 incidents / 6 owned). `takeoverCap` never reached (6 < `MAX_TAKEOVER` 8: with 2-car clusters the incident cap binds first). All 6 promoted cars handed back (`handbacks` 6, `fallbacks` 0, `owned` 0); no NaN / wide / runaway speed; the 4 cap-refused pairs resolved on the cheap resolver; no stuck car 10 s later (all > 3 m/s).
- **c1Pileup, Spa (item 4):** player at 70 m/s into 3 stopped cars. 6 cars promoted over time, an `r2` at tick 31-32 then staggered `r3` incidents (the cascade splits across ticks, as on Monza); last handback tick 239; `owned` 0, `fallbacks` 0, every car finite and |x| < 14. Player ends at x 0, 4.2 m/s, rivals 16-18 m/s.
- **Caught exceptions (item 5), Monza -> Spa switch with `debugger_exceptions all`:** the circuit switch, `race()` load, `go()` and the pile-up threw nothing caught; the debugger never paused.

## Not run, and why

- Items (1), (2) and Monaco for (4): not reached yet in this report revision.
- No CI group runs yet; `collisions` on the deploy tip is in flight from the orchestrator.

## js-debugger tool problems hit

- `debugger_state` keeps growing (every operation since attach); detach/attach resets it but drops breakpoints.

## Next step

Pit-entry contact, SC and finish-line incidents, Monaco pile-up; push this report with each step.
