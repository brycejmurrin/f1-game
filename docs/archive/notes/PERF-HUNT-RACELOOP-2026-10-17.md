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

## Round 2 (no fix landed)

- **Warmup inflates the round-1 allocation numbers.** `updateCarLateral` is Maglev-compiled and then deoptimised 11 times in a
  2.7k-step run ("Insufficient type feedback" for cold branches: generic named access, call, compare), and each deopt
  runs the interpreter, which boxes every double temporary, until the function is hot again. Sampling 600 steps after a
  4000-step warmup (`WARM=4000 scratch/allocstep.mjs`, trace via `--js-flags="--trace-opt --trace-deopt
  --redirect-code-traces --redirect-code-traces-to=<file>"`) gives **98 KB/step** against 187 after 120 steps.
- **Steady-state sites are flat:** `updateCar` 12.1, `updateCarLateral` 11.8, `updateCarAdvance` 10.9, `updateCarBrakePlan`
  10.5, `max` builtin 5.5, `updateCarLongitudinal` 3.8, `spline.js curvature` 3.5 KB/step. No single site is worth a
  `game.js` edit; the rest is boxed doubles spread across the per-car functions.
- **Refuted:** the `_ucS` scratch object leaking boxes through mixed field types. A setter census over 300 steps shows the
  numeric fields only ever hold numbers; the mixed ones (`inp`, `aiT`, `blocker`, `chaser`, `towCar`, `alongO`) are
  object/null and boxes nothing. The scratch is sound.
- Method gotchas: `%DebugPrint` and `--trace-deopt` print to the renderer's stdout, which Playwright does not capture;
  `--redirect-code-traces-to` does. `game.js` is one closure, so a page probe needs a `page.route` text injection.
- **Release:** the #2650 `game.js` allocation sites are released; a fix would need a per-line measurement showing one site
  above ~5 KB/step in steady state, and none is.
