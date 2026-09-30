---
name: ai-racecraft
description: Use when AI racecraft is wrong — overtakes too aggressive/passive, brake targets, preferred lane, ERS deploy, stuck/unstuck, driver ratings craft/awareness/experience, or js/physics/ai-drive.js. Do not change player physics (tune-physics) or race-control flags (race-incidents-control).
---

# AI racecraft — `AiDrive`, not the bicycle model

`js/physics/ai-drive.js` is pure rules: rating → behaviour maps, OT fire
rate, ERS want, multi-sample brake target, slow lane nudge. Callers pass
curvature samples and the already-drawn roll so the seeded stream in
`makeCars()` / `updateCar` stays in `game.js`.

## Owns vs stays in `game.js`

| `AiDrive` | `game.js` |
|---|---|
| stuck threshold, follow gap, contact give, steer damp | O(n) traffic scan (`roomL/R`, blocker, tow, chaser) |
| overtake FIRE rate (situation score) | the OT roll itself |
| ERS deploy want (catch / defend / clear-straight) | speed integration, X-mode arming, collisions |
| brake target + craft late-brake | the Frenet lateral step |

Ratings on the car (`craft` / `awareness` / `experience` / `skill`) come
from `js/data/driver-ratings.js`. Career adds deltas on top (**career-mode**
for the economy; this skill for how those axes drive the field).

## Do not

- Steer the **player** from curvature — arc column is AI-only here
- Touch `PACE` / grip / `ROAD_FOLLOW` → **tune-physics**
- Change caution / VSC / SC / debris → **race-incidents-control**

## Brake target (AI brakes too early / late)

`AiDrive.brakeTarget(ctx)` (ai-drive.js) = min over look-ahead samples of
`sqrt(vC² + 2·brake·0.85·d)`, `vC = cornerSpeed(k, latMax·bank·grip)·skill·diffCorner`;
`brakeDecision` turns `speed - vLim` into a pedal (soft/full band from `consistency`).
Samples and ctx are built in `game.js` (`_aiBr`, grep `AiDrive.brakeDecision`): node-aligned
`pushLook` from the car out to `look`, on-line uses `TrackLine.pathK`. Early braking = too
low `vC` (k, grip, `diffCorner`, `skill`), too small `0.85`, or `errMul`/`hold`. Unit pins:
`ai-drive.test.mjs` (brake* tests) and `ai-racecraft-vm.test.mjs`. No CLI prints the brake
point itself: `ai-race.mjs pace` (lap time) and `line` (approach/apex) are the closest VM
proxies; for the exact point probe `__apex` live (browser, `mcp-probe`).

## Stuck / unstuck (AI wedged, never recovers)

Two timers, both in `updateCar` (`game.js`, grep `stuckT` / `rescueT`): `stuckT` grows while
`speed < 7 && AiDrive.isBoxed` (no room both sides, or a blocker < 6 m); past
`AiDrive.stuckThreshold(awareness)` (0.45-1.15 s) `unstuckActive` cancels braking and adds
`unstuckPull` sideways (+ `unstuckLatFloor` steering floor, `queueFloor` crawl). If that fails,
`rescueT` (`aiStuck`: offroad > 0.5 s, or `speed < 5` past `raceT > 2`) passes
`AiDrive.aiRescueDelay` (4 s, 7 s in contact) and TELEPORTS the car to `x` inside `hw - 1.5`
at `14·PACE` speed. Exempt: `pitState === "box"`, queued in the lane, red-held. A pit-lane car is
rescued onto `pits.laneX`, so a wall/pit-boundary case is `pits.inLane(c)` (`game.js` ~6023
"THE PIT WALL"), not the road branch. Unit pins: `ai-drive.test.mjs` (isBoxed/stuckThreshold).
No CLI counts stuck/rescue: `ai-field.mjs` reports dwell/contact only (`--seconds` floor 60;
`--track baku --seconds 60` ~1 min VM, dwellMax is the nearest proxy); for a per-car
`stuckS` use `__apex.field()` live (agent-view, browser).
Record: track, seed, car, `stuckT`/`rescueT` at freeze, pitState, inLane, roomL/R.

```sh
node --test tests/unit/ai-drive.test.mjs      # 75 tests, ~1 s
node --test tests/unit/ai-racecraft-vm.test.mjs   # VM shape gate (jitter/approach/line); read its header first
node tools/ci/test-bg.mjs collisions   # BROWSER group (background, AGENTS rule 4/5); racecraft lives in the contact specs

# Field instruments (VM, no browser) — one dispatcher, three measurements:
node tools/check/ai-race.mjs pace  [--track monza] [--diff normal]
node tools/check/ai-race.mjs field [--track monza] [--seconds 240] [--runs 5]
node tools/check/ai-race.mjs line  [--track monza]
node tools/check/ai-race.mjs human [--track monza] [--runs 3]   # vs a PLAYER, not itself
# All take --wear off|light|real (default off: no pits/deg). Direct: ai-pace/ai-field/ai-line/ai-human.mjs;
# tyre strategy over a race: node tools/check/ai-strategy-census.mjs (wear real).
```
