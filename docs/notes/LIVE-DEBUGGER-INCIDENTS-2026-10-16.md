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
| 1 Car-car collisions | Stationary car hit at 83 m/s (start straight) and the AI-striker-into-parked-player case done. Three-wide wall pinch, start-line contact in the first second, pit-entry contact: NOT done. |
| 2 Debris world | Burst 40 at sev 90, circuit switch Monza->Spa, `reset()`, a synthetic `visibilitychange` (`document.hidden` stayed false, so a real hidden tab was not exercised). |
| 3 Incident takeovers | NOT done. |
| 4 c1Pileup on 3 circuits | NOT done. |
| 5 Caught exceptions | NOT done (no pause-on-caught session ran). |

## Findings

| id | file:line | severity | verdict | debugger evidence | fix commit | test | issue |
|---|---|---|---|---|---|---|---|
| F1 | `js/physics/collide.js` rear-end block (`fx` gate, ~L600-620) | high (no hit count, shake, sound, debris, or R3 takeover on any heavy rear-end) | CONFIRMED-LIVE | recorder at the notify line: reached once in 60 steps, `relV` = 73.3 m/s, `last` = false (human striker, AI target). VM: `hits` 0, `rejected.inactive` 0 before; 1 and 1 after. Speeds identical (44.4 / 49.9). | d4504248 | `collision-contact-vm.test.mjs` "a heavy rear-end fires the contact FX ..." (red without the fix) | - |
| F2 | `js/physics/debris-world.js` `_ageAndCullPool` / `buildWorld` | medium (slot held and asleep-skip off for good) | CONFIRMED-LIVE (cause); fix NOT re-checked live | recorder in `destroyWorld`, tick 95: 4 of 48 slots at y -4.9..-6.7, vy about -12 m/s, spawned tick 1, `restT` 0, `src` null. World holds the road trimesh only. | 41553e7c | `debris-step-skip.test.mjs` "_ageAndCullPool retires a body that fell below the floor" (red without the fix) | - |
| #2565 | `js/physics/collide.js` rear-end block | n/a | BY-DESIGN | Node VM probe, AI striker 54-57 m/s into a parked human: striker 57.48 -> 0.27 m/s in ONE tick, human +5 m/s (probe `scratch/strike-probe.mjs`; human gain is capped by `humanPuntCap` 8). invMass AI 1 / human 0.5, e 0.1. Not live-verified in the browser. | 55d2f1fd (comment + pin test only) | `collision-contact-vm.test.mjs` "an AI striker into a parked player ..." | #2565 (AI-not-braking half is `ai-drive.js`, race lane) |
| F3 | `js/physics/collide.js` `_onTrafO` / `scanTraffic` (`dprog > 34`) | medium (AI learns of a parked car only inside its stop distance) | VM-ONLY (static + unit; no live capture) | orchestrator request from the #2565 worker: BLOCKER never reported beyond 34 m. Now reach = 10 + closing^2 / (2 * 0.5 * BRAKE), cap 160 m, blocker only; tow/chaser/along/room stay 34. Pack closing < 23 m/s: reach < 34, unchanged. | pending push | `traffic-arc-buckets.test.mjs` "a parked car 80 m ahead is a BLOCKER at 50 m/s closing" (red without the change) | #2565 |
| N1 | `tools/lib/game-vm.cjs` harness | low | VM-ONLY, unconfirmed live | player `collideT` is `NaN` from the first tick in the Node VM until `collideFx` sets it; live `carAt` does not expose it. `game.js` (forbidden) owns the init. | - | - | - |

Relation: with debris on, F1 now routes the #2565 hit to `IncidentSim` (Rapier, momentum
conserving); with debris off (the default) the cheap resolver applies and the collapse stands.

## Clean areas (do not re-hunt)

- Impulse sites in `collide.js`: no NaN/Inf and no |yaw rate| > 10 rad/s at 83 m/s into a stopped car.
- Rapier teardown: `destroyWorld` freed 98 and 107 bodies/colliders on a circuit switch and on `reset()`; `live`, `queued`, `spawned` read 0 afterwards. No NaN-positioned piece found.
- Restitution on a heavy rear-end: 77->50 / 3->57 m/s, separation about 0.095 of the closing speed, consistent with e 0.1.

## Not run, and why

- Areas 3, 4, 5 and the rest of area 1: the debug Chrome was stopped after the reloaded page pegged the SwiftShader GPU process (load 17) and starved the commit hook. Needs a relaunch parked on `headless(true)`.
- Live re-check of F2 on the patched code (same reason).
- Groups `collisions`, `physics-core` and `physics-characterization.spec.js`: not run (collide.js changed, so the characterization spec should be run before ready).
- `test:tooling-fast`: PASSED on 41553e7c (639 passed, 0 failed); not re-run on 55d2f1fd.

## js-debugger tool problems hit

- `debugger_state` returns every operation since attach, so it grows to several thousand tokens per call; detach/attach resets it but drops breakpoints.
- `debugger_evaluate` needs a `pauseToken`; unpaused evaluation goes through `debugger_run` plus a state read.
- A page reload mid-session left an `awaitPromise` operation pending, and detach then timed out on `setPauseOnExceptions` / `Debugger.disable` (page busy); closing the target by CDP was needed.

## Next step

Relaunch the debug Chrome, park it with `headless(true)`, re-check F2 live, then areas 1 (rest), 3, 4 and 5; run `collisions` and `physics-core` in the background after detaching.
