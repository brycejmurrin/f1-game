# Simulation tick profile — 2026-10-29

Full-grid monza (22 cars). The number to quote is Chromium `performance.now` around
`__apex.step` with `headless(true)`, so the render is not in the sample. This container
has no GPU. The CPU profile forced the three.js backend onto WebGL2
(`apex26.gfxBackend=three`, `apex26.tlxForceGL=1`, `--use-angle=swiftshader`). The
default renderer is three.js on WebGPU; that path was not what the samples ran on.

## Step time

`node tools/perf/profile.mjs monza --mode step --repeat 3 --steps 2000 --warm 1000 --base HEAD`
against deploy tip `ad558a7a4f`. Both arms, headless, render not timed:

| | p50 ms/step | p95 | repeat spread (p50) | rounded digest |
|---|---|---|---|---|
| base `ad558a7a4f` | 0.22 | 0.60 | ±0.02 | `2da956fb` |
| dirty tree (reverted; see below) | 0.22 | 0.66 | ±0.02 | `2da956fb` |

Verdict: **noise**. Δp50 0. A behavior-preserving edit has to beat ±0.02 ms (20 µs) on this tool before it is a win.

A second Chromium CPU profile on the restored tree (800 warm, 4000 steps, same headless WebGL2 setup) sampled 4646 times. Raw self-time 1498.4 ms. `(program)` was 40.1% (600.6 ms) from **11** hits, one of them 597.5 ms: a profiler gap, not simulation work. Dropping 29 deltas above 2 ms (669.9 ms) leaves 828.5 ms. Share of that kept time:

| function | kept | self | hits |
|---|---|---|---|
| `updateCar` `js/game.js:4825` | 8.5% | 70.1 ms | 422 |
| `updateCarLateral` `js/game.js:5693` | 4.6% | 38.0 ms | 220 |
| `setTargetAtTime` (audio) | 4.5% | 37.2 ms | 188 |
| `update` `js/game.js:4465` | 3.2% | 26.7 ms | 161 |
| `_onTrafO` `js/physics/collide.js:190` | 2.7% | 22.6 ms | 132 |
| `updateCarBrakePlan` `js/game.js:5308` | 2.7% | 22.1 ms | 126 |
| `curvature` `js/track/core/spline.js:147` | 2.4% | 20.1 ms | 109 |
| `paceVmax` `js/game.js:400` | 2.1% | 17.7 ms | 105 |
| `sample` `js/track/core/spline.js:90` | 1.8% | 14.9 ms | 77 |
| `TyreModel.update` `js/physics/tyre-model.js:876` | 1.7% | 14.3 ms | 79 |
| `brakeTarget` `js/physics/ai-drive.js:559` | 1.6% | 13.5 ms | 81 |
| `wallLimits` `js/physics/contact-geometry.js:124` | 1.5% | 12.3 ms | 68 |
| `scanTraffic` `js/physics/collide.js:227` | 1.5% | 12.3 ms | 78 |

Per step of that 4000-step window (kept ms / 4000): `updateCar` ~17.5 µs, lateral ~9.5 µs, `setTargetAtTime` ~9.3 µs, `brakeTarget` ~3.4 µs. Nothing on this list, cut in half and still behavior-identical, clears the 20 µs spread by itself.

## The Node VM is the wrong clock

`tools/lib/game-vm.cjs` over-weights global lookups (the profile tool's own header, and a prior note `docs/notes/PERF-PROFILE-2026-10-27.md`). Measured here: VM wall about 1.67 ms/step against Chromium 0.22 ms/step. A 40-node brake scan that is TurboFan (`%GetOptimizationStatus` 81) took ~206 ns outside a VM and ~7622 ns inside `vm.runInContext`. The VM CPU profile put `brakeTarget` near 10% of self time. Chromium puts it at 1.6%. Do not ship a "win" that only moves the VM number.

Heap sampling on the VM (interval 512, ~37 MB JS) attributed the most bytes to `updateCar`, `updateCarLateral`, `updateCarBrakePlan`. That is boxed returns along an already pooled hot path, not fresh object literals. GC was ~0.24% of VM self time and ~0.5% of the Chromium profile before the gap filter. `--trace-deopt` during 600 VM steps showed only warmup "Insufficient type feedback" on `_onTrafO` and `updateCar*`. They stayed optimized after that.

`info().n` on monza is the spline node count (1444), not the car count. The field is 22.

## What was tried and reverted

`brakeTarget` already skips a node once `scrub * d` alone cannot beat the best entry budget (`js/physics/ai-drive.js`, the `dSq >= vLimSq` branch). Two further cuts were timed and reverted to `ad558a7a4f`:

- Calling a helper that duplicated that skip. VM wall p50 1.6579 vs the earlier 1.67 band. `cornerSpeedEnvelope` fell from ~2.3% to 0.81% and the helper took 2.01%. Combined planner time went up. Field digest matched.
- Inlining the skip and seeding the budget from the max-|k| node. A small TurboFan function outside the VM was faster on a pure straight (~118 ns vs ~285 ns) and slower when a corner sat in the window. Inside the fat `brakeTarget` the same shape lost on corner windows. The full Chromium A/B above is this tree against HEAD: noise, same digest `2da956fb`.

The floor of the distance term is already one multiply. It is the same order as the square root the skip avoids. A pre-pass over the window loses that back when the window contains a corner, which is the case the planner exists for.

## Unfixed, and why it stayed unfixed

- **Audio on every `__apex.step`.** `js/game.js` sets `_audioParamStep` true for the dev step. The player sets it only on the frame's last physics substep. `setTargetAtTime` plus `setEngine` (`js/audio/engine.js`) are ~6–10 µs of the profiled step. `aimGain` already ignores moves under 1e-4. Skipping more changes the sound. Not a sim-tick edit.
- **`paceVmax` at 13 sites (~4 µs).** `S.pvA` / `S.pvB` already split the value around the flap stamp, because `_vmaxNow` changes mid-step. The other calls read other cars. A per-car memo would be under the noise floor.
- **`beginLook` for every AI car, including the typed `directLook` path** that never reads `_look`. About 1 µs. Safe to move behind `if (!directLook)`. Too small to clear 20 µs, and the call-count test pins it at 21.
- **In-range modulo fast paths are not bit-identical.** `wrap(d, L)` differs from `d` for a large share of `d` already inside `(-L/2, L/2)`, by ~1e-12 near the edges. The same risk applies to `s % L` when `s` is already in `[0, L)`. Not applied to `curvature`, `sample`, `wallAt`, or `_onTrafO`.
- **`kTurn` is three `curvature` samples** at `s + toTurnIn + 10/30/55` (`js/game.js`). `toTurnIn` makes that station constant within a node, but caching it freezes an ulp and can change who yields in a side-by-side. Not done.
- **Far-car AI at 30 Hz, `Math.hypot` to `sqrt`, HeapNumber sentinels.** Each one changes behaviour or bits. `tests/unit/car-fields-vm.test.mjs` already refuses a `steerSm = 0` sentinel. Left as known items.
- **`updateCar` / `updateCarLateral` / `updateCarBrakePlan` self time is real property and math work** inside large functions, not a steady-state deopt. Splitting them so more of the body inlines is a physics refactor that has to stay characterization-bit-identical. A 30% cut of that cluster is still about 10 µs, inside the spread. Not started.
- **`createBiquadFilter` (25 hits, 7.3 ms)** in the profile is one burst after the warm steps, not a per-tick alloc. `createPassWatch.tick` runs twice per `update` on purpose (a dt=0 prime, then dt).

Call counts on the default VM (tyre wear off, wind off, headless, 40 steps after 60 warm): `curvature` 64–92, `sample` 47, `wallAt` 88, `bankAngle` 0–28, `beginLook` / `brakeDecision` / `scanTraffic` 21, `fillArcBuckets` 1. The unit test pins ceilings around those, not the wall clock.
