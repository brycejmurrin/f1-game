# Session performance budgets

How the session layer is measured, which numbers fail a run, and which numbers
are only written down. The player-facing phone budget is the record line. The
number CI is allowed to fail is a hang ceiling, because this container and the
GitHub runners render with software GL.

The blessed software-GL frame sample (`tests/data/perf-frametime-baseline.json`,
2026-10-14, Monza night, high preset) is p50 **5783 ms**, max **16366 ms**, six
frames in 20 s. A gate tighter than that sample cannot pass here. The VM
allocation census baseline is **188 KB/frame** (`tools/perf/baselines/vm-alloc.json`).

`performance.memory.usedJSHeapSize` is quantized and can repeat the same value,
so heap readings go through CDP `Runtime.getHeapUsage` after
`HeapProfiler.collectGarbage` (twice). Playwright issue
[#36844](https://github.com/microsoft/playwright/issues/36844). Protocol:
[Runtime.getHeapUsage](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage).

## What already existed

| Question | Where | What it gates |
|---|---|---|
| Steady frame time after a warm-up | `tests/specs/perf-frametime.spec.js` | Soft, unless `APEX_PERF_FRAMETIME_STRICT=1`. Wall clock vs the blessed sample above. |
| Menu START RACE vs START PRACTICE stages | `tests/specs/perf-race-entry.spec.js` | Marks must exist. Wall time is soft (`APEX_PERF_RACE_ENTRY_STRICT`). |
| Garage paints on entry, no panel tap | `tests/specs/garage-first-frame.spec.js` | Non-black pixels. It does not budget the tap-to-draw time. |
| Heap slope across many race → menu cycles | `tests/specs/race-cycle-memory.spec.js` | Built-track identity, and a post-warm heap slope. One quit is not its question, and the spec is a long software-GL job. |
| Bytes per simulated frame | `tests/unit/perf-vm-alloc-budget.test.mjs` | 1.15× the 188 KB baseline. Counts, not milliseconds. |
| Listener / gfx-handle identity across quits | `tests/unit/perf-vm-leak-cycles.test.mjs` | Exact counts in the VM. |
| Stall watchdog | `tests/unit/loop-health.test.mjs` | `LoopHealth` sheds, then reloads once. Not a frame-time budget. |
| Real-GPU census | `.github/workflows/gpu-census.yml` | macOS Metal verdict. Not this container. Propose wiring the new spec beside it; this PR does not edit workflows. |

## What this layer adds

One browser session, phone landscape 844×390, reduced motion, `apex26.gfxBackend=three`
and `apex26.tlxForceGL=1` so software GL stays on three.js WebGL2. The annotation
`perf-session-backend` records `backend`, `api` and the WebGL renderer string
(SwiftShader or llvmpipe). The spec fails if three.js did not bind, or if the
API is not `webgl2`.

| Metric | Clock | Gate (fail) | Record (phone, annotation only) |
|---|---|---|---|
| Garage first draw | `__apex.garagePrebuild().firstFrame.tapMs` from the GARAGE tap | 90 s | 8 s |
| Time to race grid | `__apex.race("monza")` until state `count` or `race` | 240 s | 90 s |
| Worst frame, first 30 s | max rAF delta after `__apex.go()` (lights out) | 25 s | 100 ms |
| Steady frame | median rAF delta after dropping the first 40% | 20 s, and only with at least 4 steady frames | 34 ms |
| Worst / steady | ratio | not gated (`gate: null`) | 8× |
| Quit to Menu heap | CDP used heap after GC, menu before the race vs menu after QUIT | +200 MB, and only when both menus sat quiet | +40 MB |

A missing sample (no steady frames, heap CDP failed, menu still warming) is
recorded and does not fail. `APEX_PERF_SESSION_STRICT=1` (or `APEX_PERF_STRICT=1`)
makes the record line the gate. That flag is for a phone or a quiet desktop,
not for software GL.

The menu START RACE wall clock stays in `perf-race-entry`. This grid time starts
at `race()` so it is the build-to-grid, not the button path. The 30 s window
starts after `__apex.go()`, the same lights-out `perf-frametime` uses. Waiting
for the formation countdown to expire on its own is not the clock: on software
GL that countdown only advances when a frame runs, and one run sat in `count`
until a 90 s wait expired while the field was still building. Heap across many
cycles stays in `race-cycle-memory`; one quit cannot see a 12 MB/cycle leak
through software-GL noise, so the single-cycle gate is only the 200 MB ceiling.

## Hot-function microbench

`node tools/perf/hot-bench.mjs` boots Monza in the game VM (no renderer) and
times three windows of `step`, `physState` and `nodeAt` after 80 warm steps.
The checked-in per-call baseline is `tools/perf/baselines/hot-bench.json`.

The gate is **6×** that baseline (`GENEROUS_RATIO`). A box that is uniformly
slow passes. The slowest window must also stay within **4×** of the fastest
(`SPREAD_RATIO`); that is the stall check. `APEX_PERF_HOT_STRICT=1` tightens
the ceiling to **1.75×**.

Three idle runs on this container (2026-10-29), median ms/call:

| Bench | run 1 | run 2 | run 3 | median | within-run spread |
|---|---:|---:|---:|---:|---:|
| `step` (80) | 1.632 | 1.664 | 1.663 | 1.663 | 1.02–1.08 |
| `physState` (200) | 0.011 | 0.011 | 0.011 | 0.011 | 1.02–1.21 |
| `nodeAt` (2000) | 0.002 | 0.002 | 0.002 | 0.002 | 1.16–1.38 |

`nodeAt` is sub-microsecond per call after warmup, so its ceiling only catches
a stall. Rewrite the baseline only when the hot path changed on purpose, and
say why:

```sh
node tools/perf/hot-bench.mjs --update
```

## How to run

```sh
node --test tests/unit/perf-session-budgets.test.mjs tests/unit/perf-hot-bench.test.mjs
node tools/perf/hot-bench.mjs
node tools/ci/test-bg.mjs --spec tests/specs/perf-session-budgets.spec.js
npm run test:perf-session
```

The spec writes `artifacts/perf-session/perf-session.json` and one annotation
per metric. Run it on an idle box. Three repeats are the spread; a single
software-GL sample is not a phone regression.

## Measured here (2026-10-29, SwiftShader, three.js WebGL2)

Three passes after `__apex.go()`, phone landscape, Monza day. Durations 63 s,
62 s and 65 s. `lights` was `go` each time.

| Metric | run 1 | run 2 | run 3 |
|---|---:|---:|---:|
| Garage tapMs | 2695 | 2694 | 2708 |
| Grid ms (state `count`) | 10883 | 9668 | 8860 |
| Worst frame ms | 14249.5 | 14782.7 | 14482.7 |
| Steady p50 ms | 66.6 | 16.7 | 49.9 |
| rAF samples / covered ms | 9 / 27266 | 9 / 21529 | 12 / 24861 |
| Heap growth MB (both menus quiet) | +1.79 | +1.51 | +2.18 |

All six gates passed. Worst frame and, on two of the three runs, steady p50
sit over the phone record line and under the hang ceiling. The worst/steady
ratio (214×, 885×, and the third run's own ratio) is record-only.

An earlier pass that waited for the countdown to expire on its own recorded a
first race frame of 18607 ms (PerfGov max 18716 ms) and then frames of 16–230 ms.
That opening stall is a game finding: the first race frame on this software-GL
path is about 14–19 s. This PR does not change `js/`.

One of those three `go()` runs also kept a −33 ms rAF stamp. `frameWindow`
already drops non-positive samples. The sampler now ignores a callback whose
timestamp is at or before the seed, so the next stamp keeps the real gap.
`performance.memory` in the PerfGov snapshot read about 121–126 MB on the same
runs where CDP `usedSize` after GC was about 39–44 MB. The heap gate uses the
CDP number.

A run that did not call `go()` sat in `count` until a 90 s wait expired while
car liveries were still building. That is why the window starts at `go()`.

## CI

The unit files sit in `tooling-fast`, so the structural fast tier runs the
verdict math and the VM microbench. The browser spec is its own group,
`test:perf-session`. It is not on a workflow in this PR (workflows are out of
scope). A later change can add it as a non-blocking job next to `perf-frametime`,
`continue-on-error`, off the Pages gate, with `APEX_GL=llvmpipe`. Do not set
`APEX_PERF_SESSION_STRICT` on that job.
