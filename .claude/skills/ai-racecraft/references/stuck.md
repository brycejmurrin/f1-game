# Stuck / unstuck recipe (AI wedged, never recovers)

Two timers in `game.js`: `stuckT` in `updateCar`, `rescueT` in `updateCarAdvance`
(search either name). `stuckT` grows in a race while `vStd(c.speed)` is under its
literal and `AiDrive.isBoxed` finds no room both sides or a close blocker, at every
caution level short of red (`raceCtl.level`); a red flag holds `rescueT` too, except
for a car beached in the run-off. `AiDrive.stuckThreshold(aiT)` reads a traits object
(for example `{awareness:0.75}`), not a scalar. Past it, `unstuckActive`
cancels braking and adds sideways pull, steering floor and crawl. If dig-out
outlasts `AiDrive.digOutBudget`, `digOutEscalated` lets slow-speed rescue arm
while dig-out remains active and uses the shorter rescue delay. This prevents
permanent wall-piles where dig-out used to veto rescue.
`beachedAt(c)` tests offroad plus a pace-scaled slow-speed threshold; it has no
half-second `offT` gate. Pit-box and red-held states remain exempt. A queued
pit-lane car can escalate after failed dig-out and is rescued onto `pits.laneX`
(pit paths run only with `ai-race.mjs ... --wear light|real`; the default `off` has no stops).
Road rescue preserves existing speed with a pace-scaled floor; pit-lane rescue
uses its own lane/floor rule.
A kerb is NOT off-road (`c.offroad = … && !c.onKerb` in game.js): a car wedged on a kerb
never counts as `beachedAt`, so only the slow-speed `aiStuck` branch (after `stuckT` / dig-out)
fires; kerb drag is only `kerbGripSm`. "Stuck on the kerb" is therefore
usually a dive/contact problem (brake target or traffic tactics), not a rescue bug.
Use `cars()` / `field()` to identify the car, then `__apex.carAt(idx)` for
`stuckT` / `rescueT` (its `speed` is raw, not `vStd`); `field()` carries no stuck timer. Record track, seed, car,
timers, `pitState`, `pits.inLane(c)` and room left/right. VM behavioral checks:
`node --test tests/unit/ai-stuck-vm.test.mjs tests/unit/ai-pack-stuck-vm.test.mjs`.
`ai-field.mjs` reports dwell/contact only; it does not count rescues. `node tools/check/ai-race.mjs stuck --track monza --runs 3` counts
per-car stuck episodes and rescue teleports over N seeds (flags: `--help`; it can pass 2 min: run it as
one background task logging to `artifacts/logs/`). Browser evidence is the CI group `pick-tests` names.

