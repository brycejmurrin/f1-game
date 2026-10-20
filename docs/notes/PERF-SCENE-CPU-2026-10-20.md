# Scene/physics CPU per step — measured in real Chromium (B·H9, 2026-10-20)

Fleet B perf hunt, lane "scene-cpu": backend-agnostic per-frame CPU every renderer pays
(physics/AI step, collide, race bookkeeping, HUD, shared cull). Monaco, 22 cars, this
container (x86, no GPU). Prior art: PERF-CPU-LOAD-2026-10-19, PERF-HUNT-RACELOOP-2026-10-17,
PERF-ALLOC-HUNT-2026-10-17, PERF-HUNT-4-2026-10-14 (the boxed-double and deopt rows there
still stand; nothing below re-reports them).

## What one physics step costs

`node tools/perf/profile.mjs monaco --mode step --repeat 3` (new mode): `__apex.headless(true)`,
`reset(0.02, 55, 0, 42)`, throttle, 3000 warm-up steps, then 3000 steps timed in batches of 10.

| measure | value |
|---|---|
| real Chromium V8, ms/step | p50 0.33–0.43, p95 0.8–0.9, p99 1.2–1.4 (3 repeats × 2 arms) |
| Node VM (`game-vm.cjs`), ms/step | 2.6–3.1 — over-weights contextified global lookups ~6× |
| spans `physics` p50 (profile.mjs spans, SwiftShader) | 7.8–9.6 ms — **five catch-up steps** per multi-second frame (163 `ai` spans in 34 frames) |

So the spans "physics 7.8 ms" figure is not the cost a phone pays per frame: at 60 fps a
phone runs one step per frame. Rank per-step work with `--mode step` or a CDP profile of it,
never with the VM's absolute numbers or the SwiftShader spans.

## Where the step goes (CDP sampling profile, 6000 steps, inclusive % of the step)

| site | % | note |
|---|---|---|
| `updateCar` (all cars) | 68 | Lateral 14, BrakePlan 12 (brakeTarget 2), Advance 8, Longitudinal 3, Bicycle 2 |
| `audio/engine.js setEngine` | 6 | `setTargetAtTime` already guarded by `aimParam`/`aimGain` |
| `update()` self | 5 | |
| `Collide.resolveCollisions` | 5 | |
| race-radio + race-facts + spotter | 4 | |
| `spline.sample` | 4 | `frenetH` / `worldFromTrack` / `updateCar` |
| `Collide.scanTraffic` | 3 | |
| GC | 3 | B·H6: GC is not the hitch source on a Mac |
| `Tracks.curvature` | 3 | |

No single site above is worth a bit-identity risk on its own: the step is ~20 µs a car.

## Allocation (sampling heap profiler, objects collected by minor/major GC included)

~69 KB/step. Largest: `updateCar`/`updateCarBrakePlan`/`updateCarLateral` (boxed doubles —
PERF-CPU-LOAD §1, still open), `curvature` 3.9, `next` 3.2, `Math.max` 3.2 (boxed returns).

**Fixed here:** the `next` row is for-of iterator results — `update()` and the race
bookkeeping run in tiers that do not escape-analyse them. Indexed loops in `update()`
(ranked, lead human, parked, the per-car `updateCar` walk), `RaceFacts.rank`/`observe`,
`EventJournal.sampleEdges` and `SportingRegs` pass watch: `next` 3.24 → 0.54 KB/step,
total 68.7 → 64.8 KB/step. Step time: Δp50 −0.06 ms, inside the repeat spread (noise —
not claimed as a CPU win). Field digest bit-identical: browser `6c407b45` both arms; Node VM
raw digest of every numeric car field `abdb08ccb3efdcca` (1200 steps) and `dea9f230b0eb8561`
(6000 steps) on base and head.

## Tried and dropped

- AiDrive look-ahead pool kept at its high-water length instead of `_look.length = 0` per
  car-step: no difference outside run-order noise in a 2 M car-step microbench. Not shipped.

## Leads for other lanes (not fixed here)

- `js/camera/flyby-sight.js` `sceneOf` (line ~136): 1,333 "exit from OSR'd inner loop"
  deopts inside one second, once per track at the intro flyby (V8 `--log-deopt`). A one-off
  hitch candidate for the jank/load lanes.
- Render-path JS (chunk cull in `shared/frustum.js`, HUD fit, mirror pass) cannot be ranked
  here: frames take seconds on SwiftShader, the page fell back to GLX, and 35 frames leave
  the code barely JIT-warm. Needs a real-GPU CPU profile (gpu-census on macos-latest).
