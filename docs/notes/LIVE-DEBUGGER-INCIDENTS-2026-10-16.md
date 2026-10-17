# Live debugger hunt: incidents and collisions (2026-10-16)

Lane `cursor/live-debug-incidents-5c2e`, PR #2561. Driven through the js-debugger MCP on a
headless SwiftShader Chrome (844x390), Monza/Spa, `apex26.debris` on. Owned: `collide.js`,
`debris-world.js`, `incident-sim.js`, `tests/unit/**`.

Recorders were side-effect breakpoint conditions (push to `window.__rec` / `window.__dw`,
return false), so the page never paused for them. NaN/Inf and |yaw rate| > 10 breakpoints sat
on the two impulse sites of `collide.js` (orientedResponse, rear-end `jImp`); neither fired.

## Scope covered

| Area | Status |
|---|---|
| 1 Car-car collisions | Stationary car hit at 83 m/s; AI striker into parked player; three overlapped cars with one at the edge (the nearest to a three-wide pinch); start-line contact, first 1.5 s from a random grid. Pit-entry contact: NOT done. |
| 2 Debris world | Burst 40 at sev 90, circuit switch Monza->Spa, `reset()`, a synthetic `visibilitychange` (`document.hidden` stayed false, so a real hidden tab was not exercised). |
| 3 Incident takeovers | Player involved (pile-up), window end and handback checked; budget with 5 simultaneous shunts. NOT done: during a safety car, at the finish line, a second incident while the budget is spent (the cap path was never reached). |
| 4 c1Pileup | Monza only (not 3 circuits): player at 70 m/s into 3 stopped cars. |
| 5 Caught exceptions | Pause-on-caught (`all`) through a pile-up, incident reset and debris reset: no pause. Not covered: race load, circuit switch. |

## Findings

| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue |
|---|---|---|---|---|---|---|---|
| F1 | `js/physics/collide.js` rear-end block (`fx` gate, ~L600-620) | high (no hit count, shake, sound, debris, or R3 takeover on any heavy rear-end) | CONFIRMED-LIVE | recorder at the notify line: reached once in 60 steps, `relV` = 73.3 m/s, `last` = false (human striker, AI target). VM: `hits` 0, `rejected.inactive` 0 before; 1 and 1 after. Speeds identical (44.4 / 49.9). | d4504248 | `collision-contact-vm.test.mjs` "a heavy rear-end fires the contact FX ..." (red without the fix) | - |
| F2 | `js/physics/debris-world.js` `_ageAndCullPool` / `buildWorld` | medium (slot held and asleep-skip off for good) | CONFIRMED-LIVE (cause and fix) | recorder in `destroyWorld`, tick 95: 4 of 48 slots at y -4.9..-6.7, vy about -12 m/s, spawned tick 1, `restT` 0, `src` null. World holds the road trimesh only. Patched re-check, same grid spot: lowest piece at tick 95 y -6.678 (identical), at tick 230 nothing below y 0 (unculled would be near -70); `_floorY` -28.7. | 41553e7c | `debris-step-skip.test.mjs` "_ageAndCullPool retires a body that fell below the floor" (red without the fix) | - |
| #2565 | `js/physics/collide.js` rear-end block | n/a | BY-DESIGN | Node VM probe, AI striker 54-57 m/s into a parked human: striker 57.48 -> 0.27 m/s in ONE tick, human +5 m/s (probe `scratch/strike-probe.mjs`; human gain is capped by `humanPuntCap` 8). invMass AI 1 / human 0.5, e 0.1. Not live-verified in the browser. | 55d2f1fd (comment + pin test only) | `collision-contact-vm.test.mjs` "an AI striker into a parked player ..." | #2565 (AI-not-braking half is `ai-drive.js`, race lane) |
| F3 | `js/physics/collide.js` `_onTrafO` / `scanTraffic` (`dprog > 34`) | medium (AI learns of a parked car only inside its stop distance) | VM-ONLY (static + unit; no live capture) | orchestrator request from the #2565 worker: BLOCKER never reported beyond 34 m. Now reach = 10 + closing^2 / (2 * 0.5 * BRAKE), cap 160 m, blocker only; tow/chaser/along/room stay 34. Pack closing < 23 m/s: reach < 34, unchanged. | 0ab33506 | `traffic-arc-buckets.test.mjs` "a parked car 80 m ahead is a BLOCKER at 50 m/s closing" (red without the change). Browser-level: the #2565 worker's combined repro on its branch (PR #2571), brake onset about 65 m, stops about 6 m short, no hard contact | #2565 |
| N1 | `tools/lib/game-vm.cjs` harness | low | VM-ONLY, unconfirmed live | player `collideT` is `NaN` from the first tick in the Node VM until `collideFx` sets it; live `carAt` does not expose it. `game.js` (forbidden) owns the init. | - | - | - |

Relation: with debris on, F1 now routes the #2565 hit to `IncidentSim` (Rapier, momentum
conserving); with debris off (the default) the cheap resolver applies and the collapse stands.

## Clean areas (do not re-hunt)

- Impulse sites in `collide.js`: no NaN/Inf and no |yaw rate| > 10 rad/s at 83 m/s into a stopped car.
- Rapier teardown: `destroyWorld` freed 98 and 107 bodies/colliders on a circuit switch and on `reset()`; `live`, `queued`, `spawned` read 0 afterwards. No NaN-positioned piece found.
- Restitution on a heavy rear-end: 77->50 / 3->57 m/s, separation about 0.095 of the closing speed, consistent with e 0.1.

- Pile-up on Monza (player 70 m/s into 3 stopped cars, debris on): 4 cars promoted in 2 incidents (the cascade reached the second pair a tick later, so two `r2`, not one `c1`; consistent with the cluster logic), takeover 30 -> 212 ticks (the 3 s cap), all handed back (`owned` 0, `fallbacks` 0), every car finite, on the road (|x| < 6) and moving at 15-19 m/s afterwards. Mid-takeover axis-aligned "overlaps" are Rapier-owned rotated bodies, not a finding.
- Five simultaneous shunts 400 m apart: 3 concurrent incidents, 6 cars promoted and 6 handed back, no NaN. The `incidentCap` / `takeoverCap` counters stayed 0 (some strikers braked for the stopped car after F3), so the cap path itself is not exercised.
- Start line: 90 ticks of full throttle from a random grid, no NaN, no overlap, no incident.
- Pause-on-caught-exceptions through a pile-up plus `incident` / `debris` resets: nothing paused.

## Not run, and why

- Pit-entry contact; incidents during a safety car and at the finish line; a second incident with the budget actually spent; c1Pileup on two more circuits; caught exceptions during race load and circuit switch.
- `collisions`, `physics-core` and `physics-characterization.spec.js` on CI: dispatches 441/442/443 (browser-group.yml, `collisions` x2, `physics-core`) were cancelled externally while queued (no runner assigned, 0 failures); Bryce is managing the CI queue and the orchestrator put a CI hold in place. CI: held by Bryce (queue management), last green = none for these groups on this branch. The PR's own ci.yml full tier at ready is the collide.js verdict.
- `test:tooling-fast`: PASSED on 41553e7c (639 passed, 0 failed); not re-run on 55d2f1fd and 0ab33506 (their unit suites passed individually; the commit hook's `test:guards` is green on each).

## js-debugger tool problems hit

- `debugger_state` returns every operation since attach, so it grows to several thousand tokens per call; detach/attach resets it but drops breakpoints.
- `debugger_evaluate` needs a `pauseToken`; unpaused evaluation goes through `debugger_run` plus a state read.
- Parking the page: reloading the game page while it rendered at full speed pegged the SwiftShader GPU process (load 17); launching on `about:blank`, navigating, and calling `headless(true)` right after load kept load low.
- A page reload mid-session left an `awaitPromise` operation pending, and detach then timed out on `setPauseOnExceptions` / `Debugger.disable` (page busy); closing the target by CDP was needed.

## Next step

When the CI hold lifts: physics-core, then collisions, one at a time. Then pit entry, SC / finish-line incidents and a real budget-exhaustion case in the debugger.
