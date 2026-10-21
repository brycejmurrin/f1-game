# Live debugger — sim lane (B·H27), 2026-10-21

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| SIM-1 | js/audio/car-sfx.js:48 | low (audio) | VM-ONLY, fixed | The rewind branch re-seeded `lastCar`/`lastPit` but not `lastRaceT`, so the old high-water mark stayed and every frame until raceT passed it counted as another rewind: replayed pit-stop wheel-gun edges were swallowed. `tests/unit/audio-tune.test.mjs` "after a rewind the clock baseline follows…" fails before, passes after. |

Not yet covered: PitLane think/update/laneX profile, per-step allocations, AI rescue edge cases, seeded-digest determinism.
| SIM-2 | js/physics/wheel-state.js:182 | low (telemetry/FX, WheelState default OFF) | VM-ONLY, fixed | `locked`/`spinning` classified by raw κ sign; in reverse a rim slower than the body has κ>0 and read as spinning. Now signed by travel direction (outputs only; Fx/κ untouched). `wheel-state.test.mjs` reverse test fails before, passes after. Reported by codex:graphics-physics-hunt-7e31. |
| SIM-3 | js/race/pit-lane.js:797 | — | REFUTED (already fixed) | `roadOf` allocates no temporaries on this base (`inSpan` on bare arcs, perf-debug-e5b2). |
