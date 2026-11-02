# Hunt 2026-11-02 — physics, race, game loop (js/physics/, js/race/, js/game.js)

Issue #4453. Method: prior-art-scout → code-hunters (sonnet, 9 sub-slices) → finding-verifier. No browser run, nothing measured:
every perf row is an estimate. Coverage was partial (hunters hit their turn budgets): `js/race/pit-lane.js` (1.8k lines, only
`update()`), `quali-*`, `real-race*`, `race-insights`, `reliability`, `race-radio`, `engineer`, `driving-coach`, `tyre-model` internals and
`game.js` outside 1600–3100 / 4490–4860 / 4860–6410 / 8520–8690 are still unhunted. No hunter found a physics-contract breach.

## Fixed in this PR (CONFIRMED)
(A fourth fix, an early return in `debris-draw.js` slotPose, was tried and REVERTED: `debris-step-skip.test.mjs` #11 pins that a wake inside one generation must repack the pose, so the verifier's "generation bumps cover every change" was wrong. The per-slot `isSleeping()` call stays.)
1. `race/sporting-regs.js` tick — retired player kept the give-back timer and got a penalty event. Guard + unit test.
2. `game.js` redFlagRestart — did not reset `scWatch`/`blueWatch` (gridUp does) nor shake/hitStop/camRoll/thunder (startRaceBody does).
3. `physics/collide.js` releaseArcBuckets — left `_traf`/`_tow` car refs after teardown (memory retention only).

## Follow-ups, ranked
1. `game.js:6066` — human car computes `lateralScale`/`aeroDfMult`/`dirtyAirMul` per step, result unused (verifier: unused, AI branch only at ~6251). Needs `physics-characterization.spec`.
2. `game.js:5050` — raw `c.speed < 7` in AI stuck logic (should be `vStd`); changes the characterization baseline, deliberate re-bless needed.
3. `game.js:2631` — `raceIndex++` before `stale()` awaits: an abandoned start shifts the retirement/tyre hash of the next race.
4. `physics/debris-world.js:607` promoteBarrier — no overlap check against live panels; effect unverified (NEEDS-BROWSER).
5. `physics/wall-clamp.js:164,216` — `findIndex` closure per tick for a grinding AI car with no `_wireId` (solo play).
6. `game.js:4866,5261` — Time Trial per-step object allocation.
7. `physics/debris-world.js` — non-finite `c.head` / impact `s,x` unguarded (not reachable by default; hardening only).
8. `physics/wheel-state.js:167` — rim speed can go negative at standstill (flag off, telemetry only).
9. `game.js:2775` — `_menuGate.join` overwritten by a deduped startRace (benign).
10. `race/pit-geom.js:289` — `zoneOf` ignores `pitZone.entryM/exitM` overrides despite its comment (latent; no circuit sets them).
11. Dead guard `if (raceCtl)` game.js:4978. Known-open from scout: `ranked.concat(parked)` per step (CPU-HUNT C2).

## Refuted
`ai-drive.js:572` pace guard (no caller passes non-finite); `ai-strategy.js` laps=1 two-compound (callers gate laps>=8); `debris-world.js:1263` cap shrink (batch only grows); `raceCtl` null deref (assigned at load).
