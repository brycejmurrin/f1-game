# Race-loop CPU / GC hunt, 2026-10-17 (round 1, no fix landed)

Lane: perf hunter, branch `cursor/perf-raceloop-3e7a`. Monaco, 22 cars, SwiftShader box (JS rows only).

## Measured

- `profile.mjs monaco --mode spans --frames 30 --repeat 3` (p50 ms/frame): physics 7.9, ai 1.1 (x424 calls), hud 0.8,
  collide 0.1. render/raf are SwiftShader and meaningless. A 60-frame x3 run exceeds a 580 s timeout on this box;
  30 frames x3 takes about 10 min.
- V8 CPU profile (`tools/shot/profile-gameloop.mjs`, 600 steps; its 20 s page-ready wait fails here, a copy with 120 s
  works): 96% of samples are the GPU sync (`getError`). Of the JS remainder: `updateCar` 11.6%, GC 9.6%, `update`
  4.0%, `updateCarLateral` 3.8%, `updateCarBrakePlan` 2.9%. `getBoundingClientRect` (announceLane, fitHud) and
  `shownLayer` (via `Input.remoteDrivingBlocked` -> `UiLayers.navOpen`) show, but both are already memoised
  (`laneRect` cache, `navOpen` memo) and are ~0.1% of all samples.
- Physics-only allocation sampling (`HeapProfiler` sampling around `__apex.step(1/60, 600)`, minor+major GC included):
  187 KB/step total. `updateCarLateral` 26.6, `updateCarBrakePlan` 17.6, `updateCar` 13.6, builtins `max`/`next`/`min`/`abs`
  (boxed doubles attributed to the builtin) 17/8/4/4, `brakeTarget` 6.7, `updateCarLongitudinal` 5.3, `_onTrafO` 5.2,
  `updateCarAdvance` 4.0, `tyre-model update` 3.6.

## Refuted

- `collide.js _traf`: making `L/REJ/MIN_GAP/roomL/roomR` born-Double does nothing (`_onTrafO` 5.23 -> 4.85 KB/step,
  inside noise). The residual there is not a field-representation split.

## Open

The remaining allocation is dominated by `game.js` per-car per-step functions; the sampler gives per-function not
per-line attribution, so the next round needs line-level evidence (js-debugger logpoints) before editing game.js.
