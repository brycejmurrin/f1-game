# Stuck / unstuck recipe (AI wedged, never recovers)

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
A kerb is NOT off-road (`c.offroad = … && !c.onKerb` in game.js): a car wedged on a kerb
never counts as `beachedAt`, so only the `speed < 5` rescue branch (after `stuckT` / dig-out)
fires; kerb drag is only `kerbGripSm` (0.7 grip, ~6 m/s² cut). "Stuck on the kerb" is therefore
usually a dive/contact problem (see Brake target and Traffic tactics), not a rescue bug.
Use `cars()` / `field()` to identify the car, then `__apex.carAt(idx)` for
`stuckT` / `rescueT`; `field()` contains no `stuckS`. Record track, seed, car,
timers, `pitState`, `pits.inLane(c)` and room left/right. VM behavioral checks:
`node --test tests/unit/ai-stuck-vm.test.mjs tests/unit/ai-pack-stuck-vm.test.mjs`.
`ai-field.mjs` reports dwell/contact only (`--seconds` floor 60); it does not
count rescues. `node tools/check/ai-race.mjs stuck --track monza --runs 3` counts
per-car stuck episodes and rescue teleports over N seeds. Browser collision/appearance evidence remains separate.

