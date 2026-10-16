# Live debugger hunt: incidents and collisions (2026-10-16)

Lane `cursor/live-debug-incidents-5c2e`. Driven through the js-debugger MCP on a
headless SwiftShader Chrome (844x390), Monza, `apex26.debris` on. Owned:
`collide.js`, `debris-world.js`, `incident-sim.js`, `tests/unit/**`.

Recorders were side-effect breakpoint conditions (push to `window.__rec`, return
false), so the page never paused for them. NaN/Inf and yaw-rate>10 breakpoints sit
on the two impulse sites (`collide.js` orientedResponse and the rear-end `jImp`).

## 1. Car-car collisions

| # | Scenario | Result |
|---|---|---|
| 1.1 | Player at 83 m/s into a stopped AI, start straight | Resolves cleanly: 77->50 / 3->57 m/s (e about 0.1, human mass 2x). No NaN, no Inf, yaw-rate max 0.0005. |
| 1.2 | Same hit, FX and incident side | **FINDING F1** below. |

### F1 (fixed) - heavy rear-end fires no FX, debris or incident candidate

`collide.js` rear-end block gated `collideFx`, `DebrisWorld.carImpact` and
`IncidentSim.notifyCar` on `last` (relaxation pass 3). The restitution impulse
leaves the pair separating after pass 0, so `relV > 0` is false on the last pass.
Recorded live: across 60 steps the rear-end block reached the notify line once, at
relV = 73.3 m/s, with `last = false`. VM: player `hits` 0 after an 83 m/s shunt,
`rejected.inactive` 0 (notifyCar never reached). So a 300 km/h rear-end gave no hit
count (career settlement), no shake/sound, no debris, and never an R3 takeover.
Not the BUG-HUNT-2026-09-02 note (that one is the impulse itself, which stays per-pass).

Fix: the first closing pass per pair per step fires FX/debris/notify (WeakMap stamp on
`sweepGeneration`). Physics unchanged (speeds identical before/after).
Test: `collision-contact-vm.test.mjs` "a heavy rear-end fires the contact FX ...":
red without the fix (hits 0), green with it.

Observed, not reproduced as a defect: in the Node VM harness the player's `collideT`
starts as NaN (undefined minus dt) until `collideFx` sets it. The live `carAt` does not
expose it, so unverified live; `game.js` (forbidden) initialises it for AI.

## 2. Debris world
(in progress)

## 3. Incident takeovers
(in progress)

## 4. Pile-up takeover (c1Pileup)
(in progress)

## 5. Caught exceptions
(in progress)

## Not run
physics-characterization.spec.js, the pick-tests browser groups: see the PR body.
