---
name: ai-racecraft
description: "Use when AI racecraft is wrong: overtakes/dive-bombs too aggressive/passive, brake targets, preferred lane, ERS deploy, stuck/unstuck AI cars (wedged in traffic, wall, kerb or pit lane; rescue teleport), driver ratings craft/awareness/experience, ai-drive.js. Not player physics (tune-physics) or flags, safety car stuck out, pile-ups, debris launches (race-incidents-control)."
---

# AI racecraft — `AiDrive`, not the bicycle model

`js/physics/ai-drive.js` is pure rules: rating → behaviour maps, OT fire
rate, ERS want, multi-sample brake target, slow lane nudge. Callers pass
curvature samples and the already-drawn roll so the seeded stream in
`makeCars()` / `updateCar` stays in `game.js`.

## AI pace (scripted vs catch-up)

`js/physics/ai-band.js` owns the gap-to-player catch-up band. **Default is
`scripted`**: vmax = `tierV × skill × DIFF.ai` (± `pacePhase`), no boost from
the player's gap. Opt-in `catchup` restores the legacy reverse-only rubber
band (`DIFF.band`, start + lapping gates). Setting: Race Settings › FIELD ›
AI PACE (`apex26.aiPace`). Do not edit `DIFF.*.band` literals here.

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

## Traffic tactics (bunching, passing, defending, the player)

All in `ai-drive.js` / `ai-corridor.js`, state in `updateCar` (2026-10-01, PHYSICS.md
§Racecraft tactics): follow gap is a TIME (`followGap` s0 + v·T, T 0.15-0.30 s, tight 0.05 s when a pass is
latched/armed or towing; queue window `max(16, follow+6)`); pass side = inside of the NEXT corner (`c.kTurn`,
`passSideBonus`); get a run (`runExtra`/`latchLate`); lane look-ahead (AiCorridor);
per-zone attack roll (`attemptRoll`, never `simRnd`); level pair: outside of the next
corner yields, commit-or-yield after 2 s (`sbsCommitT`); any flip -> `repassLock` and
the passer is a wide blocker; defending mid-train / adjacent lane / predicted side
(`defendPull`); first 20 s calm (`startCalm`). A human blocker is judged by `paceVmax`
(`paceSample` profile), and a held line arms `humanYieldT` at a quarter rate.
`kTurn` never reaches a human pair in collide.js. STREETS (`track.street`) keep the metre
gap and the old pass gates (no look-ahead / latchLate / runExtra / 0.8 side bonus / wide
lockout blocker): they cost monaco passes. Measure: `ai-race.mjs tactics`.

## Stuck / unstuck (AI wedged, never recovers)

Discriminator: `__apex.caution().level` 0 with `speed < 7` and `stuckT` growing is
this skill; level ≠ 0 or `caution().sinceT` growing (flag or safety car stuck
out) is **race-incidents-control**.

Two timers live in `updateCar` (`game.js`; search `stuckT` / `rescueT`).
`stuckT` grows while speed is below 7 and `AiDrive.isBoxed` finds no room both
sides or a close blocker. `AiDrive.stuckThreshold(aiT)` reads a traits object
(for example `{awareness:0.75}`), not a scalar. Past it, `unstuckActive`
cancels braking and adds sideways pull, steering floor and crawl. If dig-out
outlasts `AiDrive.digOutBudget`, `digOutEscalated` lets slow-speed rescue arm
while dig-out remains active and uses the shorter rescue delay. This prevents
permanent wall-piles where dig-out used to veto rescue.
`beachedAt(c)` tests offroad plus a pace-scaled slow-speed threshold; it has no
half-second `offT` gate. Pit-box and red-held states remain exempt. A queued
pit-lane car can escalate after failed dig-out and is rescued onto `pits.laneX`.
Road rescue preserves existing speed with a pace-scaled floor; pit-lane rescue
uses its own lane/floor rule.
A kerb is NOT off-road (`c.offroad` excludes `onKerb`, game.js ~5077): a car wedged on a kerb
never counts as `beachedAt`, so only the `speed < 5` rescue branch (after `stuckT` / dig-out)
fires; kerb drag is only `kerbGripSm` (0.7 grip, ~6 m/s² cut). "Stuck on the kerb" is therefore
usually a dive/contact problem (see Brake target and Traffic tactics), not a rescue bug.
Use `cars()` / `field()` to identify the car, then `__apex.carAt(idx)` for
`stuckT` / `rescueT`; `field()` contains no `stuckS`. Record track, seed, car,
timers, `pitState`, `pits.inLane(c)` and room left/right. VM behavioral checks:
`node --test tests/unit/ai-stuck-vm.test.mjs tests/unit/ai-pack-stuck-vm.test.mjs`.
`ai-field.mjs` reports dwell/contact only (`--seconds` floor 60); it does not
count rescues. Browser collision/appearance evidence remains separate.


```sh
node --test tests/unit/ai-drive.test.mjs      # ~100 tests, ~1 s
node --test tests/unit/ai-band.test.mjs       # scripted vs catch-up factor pins
node --test tests/unit/ai-racecraft-vm.test.mjs   # VM shape gate (jitter/approach/line); read its header first
node tools/ci/test-bg.mjs collisions   # BROWSER group, optional behaviour evidence (background, AGENTS rule 4/5)
# For a `ai-drive.js` edit `pick-tests` wins (it names physics-core); `collisions` is extra, not the gate.

# Field instruments (VM, no browser) — one dispatcher:
node tools/check/ai-race.mjs pace    [--track monza] [--diff normal]
node tools/check/ai-race.mjs field   [--track monza] [--seconds 240] [--runs 5]
node tools/check/ai-race.mjs tactics [--track monza] [--laps 8] [--runs 5] [--mode human --pace 0.97]  # intervals (s), stuck, swap-backs, lap 1
node tools/check/ai-race.mjs line    [--track monza]
node tools/check/ai-race.mjs human   [--track monza] [--runs 3]   # vs a PLAYER, not itself
node tools/check/ai-race.mjs ratings [--json]                     # Pearson / style zero-mean (no race)
node tools/check/ai-race.mjs band    [--track monza] [--diff normal] [--seconds 90]  # catch-up rubber-band profile (forces aiPace=catchup)
# Race subcommands take --wear off|light|real (default off: no pits/deg).
# Direct: ai-pace/ai-field/ai-line/ai-human/ai-ratings/ai-band.mjs;
# tyre strategy over a race: node tools/check/ai-strategy-census.mjs (wear real).
```
