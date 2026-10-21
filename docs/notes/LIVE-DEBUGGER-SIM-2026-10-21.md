# Live debugger — sim lane (B·H27), 2026-10-21

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| SIM-1 | js/audio/car-sfx.js:48 | low (audio) | VM-ONLY, fixed | The rewind branch re-seeded `lastCar`/`lastPit` but not `lastRaceT`, so the old high-water mark stayed and every frame until raceT passed it counted as another rewind: replayed pit-stop wheel-gun edges were swallowed. `tests/unit/audio-tune.test.mjs` "after a rewind the clock baseline follows…" fails before, passes after. |

Not yet covered: PitLane think/update/laneX profile, per-step allocations, AI rescue edge cases, seeded-digest determinism.
