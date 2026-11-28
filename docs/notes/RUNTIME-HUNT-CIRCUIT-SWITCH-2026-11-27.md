# Runtime hunt, mode A: Time Trial across circuit switches (2026-11-27)

Kind: measurement · Re-measure-by: 2026-12-27

Issue #7464. Bryce: "if I open game and run a time trial then switch maps the more Maps I try the slower it gets".
Build `ec36a926` (the deploy tip). Verdict: **no leak across circuit switches reproduces on this box**, on any of
the three renderer paths, by the hook route or through the real menus. Heap, GPU objects, listeners, timers, DOM
and CPU time per frame all plateau by the second or third map. Nothing was fixed because nothing measured needs a
fix; the slowdown on the phone is still unexplained and needs a device reading (§Hand-off).

## What was run

One Chromium (Playwright, software GPU), one page per run, 8 Time Trial visits in a row:
monza, monaco, spa, bahrain, silverstone, suzuka, then monza and monaco again so two circuits have a like-for-like
pair six switches apart. Each visit: start the Time Trial, hold the throttle 10-15 s, read for 10-15 s, PAUSE,
QUIT TO MENU (both presses), wait 8 s, read again. Every reading is taken after two forced GCs.

| run | renderer | route | viewport | frames per race reading |
|---|---|---|---|---|
| A | TLX on WebGPU (SwiftShader adapter), Bryce's iPhone path | real menus: TIME TRIAL, circuit row, RACE SETUP, START TIME TRIAL; sound on | 852x393 | ~895 (60 fps) |
| B | TLX on WebGPU | `__apex.tt(id)` | 320x180 | ~890 |
| C | TLX on WebGPU | `__apex.tt(id)` plus `rollout({policy:"autopilot", laps:1})` | 852x393 | ~600 |
| D | TLX on WebGL2 | `__apex.tt(id)` | 320x180 | 3-14 (software GL) |
| E | GLX (WebGL2) | `__apex.tt(id)` | 320x180 | 4-10 (software GL) |

Instruments, all installed before any game script: a WebGPU ledger (`GPUDevice.createBuffer` / `createTexture`
against `destroy()` and a FinalizationRegistry, so "live" is created minus destroyed minus collected), wrapped
`addEventListener` / `removeEventListener` (deduped the DOM's way), `setInterval` / `setTimeout`, a rAF wrapper
(callbacks and JS ms per frame), CDP `Performance.getMetrics` (TaskDuration and ScriptDuration per frame), CDP
DOM counters, three's `renderer.info.memory`, the render-object set, `nodeBuilderCache`, the WeakRef census of
built tracks (`tools/lib/mem-census.mjs`) and `__apex.texCensus()`. The no-browser layer above the renderer:
`node tools/perf/vm-leak-census.mjs --circuits monza,monaco,spa,bahrain,silverstone,suzuka --cycles 2 --steps 3000`.

## Numbers

Run A, the player's route on the iPhone's renderer path. Race readings:

| visit | circuit | heap MB | live GPU buffers | GPU buffer MB | live GPU textures | render objects | pipelines made | listeners | DOM nodes | task ms/frame |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | monza | 102.3 | 772 | 22.9 | 35 | 228 | 50 | 2569 | 5747 | 2.60 |
| 2 | monaco | 129.2 | 829 | 24.4 | 34 | 273 | 59 | 2569 | 5794 | 2.85 |
| 3 | spa | 125.1 | 852 | 18.1 | 34 | 283 | 59 | 2569 | 5798 | 2.88 |
| 4 | bahrain | 114.4 | 875 | 18.2 | 37 | 296 | 59 | 2569 | 5794 | 2.79 |
| 5 | silverstone | 131.5 | 862 | 29.4 | 35 | 302 | 59 | 2569 | 5809 | 2.29 |
| 6 | suzuka | 126.8 | 862 | 24.5 | 35 | 302 | 59 | 2569 | 5799 | 2.54 |
| 7 | monza | 120.4 | 892 | 23.1 | 35 | 308 | 59 | 2569 | 5800 | 2.80 |
| 8 | monaco | 134.1 | 869 | 24.3 | 35 | 303 | 59 | 2569 | 5800 | 2.70 |

Menu readings after monaco, visit 2 against visit 8 (six switches apart): heap 142.7 → 147.5 MB, live GPU buffers
1012 → 1052, GPU textures 36 → 37 (62.2 → 62.3 MB), render objects 311 → 341, uniform buffers 373 → 403,
pipelines 59 → 59, shader modules 51 → 51, `nodeBuilderCache` 37 → 37, listeners 2568 → 2568, intervals 0 → 0,
DOM nodes 5795 → 5801. Exactly one built track is reachable at every one of the 16 readings. Every GPU buffer
and texture that left was `destroy()`ed (3114 buffers made, 1052 live, 0 collected without a destroy), so the
WebGPU path does not wait on GC to return GPU memory.

Heap-snapshot diff, menu after monaco visit 2 against visit 8: +5.9 MB in total, of which +3.8 MB is
`(compiled code)` (the JIT'd scripts of the four circuits loaded in between), +0.74 MB `JSArrayBufferData`
(+101 buffers), +40 `GPUBuffer`, +31 `GPUBindGroup`. No class grows by a constant per switch; there is no
retainer path to name.

The other runs agree:

| run | heap, monaco menu visit 2 → 8 | heap, monza menu visit 1 → 7 | listeners | notes |
|---|---|---|---|---|
| B | 156.8 → 161.9 | 143.4 → 152.2 | 2351 → 2351 | live GPU buffers 968 → 1007, textures 35 → 35, script 0.96 → 0.81 ms/frame |
| C | 157.2 → 163.7 | 148.1 → 153.9 | 2351 → 2351 | live GPU buffers 781 → 799; the autopilot "lap" ended at the first line crossing, so no ghost was saved |
| D | 151.5 → 157.0 | 137.4 → 145.8 | 2351 → 2351 | three geometries 167 → 171, textures 53 → 53, programs 56 → 56 |
| E | 80.7 → 85.1 | 67.2 → 73.6 | 2351 → 2351 | `texCensus` 50 MB / 6 textures at every menu reading |

VM census (game ↔ backend contract, 6 circuits x 2 cycles, 3000 steps each): meshes 44, textures 23, listeners
606, intervals 1 at every reading; batches differ by circuit and repeat exactly on the second cycle. Verdict line:
`= vm-leak-census clean`.

## What does grow, and why it is not the report

| # | Repro (exact calls) | file:line | Mechanism (trigger → effect) | Player impact | Fix sketch | Test that would catch it |
|---|---|---|---|---|---|---|
| 1 | run A, monaco menu visit 2 vs 8 | js/core/lazy-bundles.js:186, js/track/tracks.js:633 | each NEW circuit hydrates its def and scenery closure and nothing evicts them → about 1 MB of heap per distinct circuit (mostly compiled code), zero on a revisit, bounded by the roster | none measured: no per-frame cost, ~40 MB worst case after every circuit | evict the hydrated path of non-current circuits | a node test that hydrates N circuits and counts retained defs |
| 2 | run A, race readings | (three's caches, below the game contract) | render objects 273 → 303 and live GPU buffers 829 → 869 over six switches, converging by map 5 (302, 302, 308, 303) | none measured: a saturating cache, about 30 small uniform buffers | none proposed | `tests/specs/race-cycle-memory.spec.js` already gates the wrapper counts |
| 3 | static, not measured | js/track/build-worker.js:161 | the build worker keeps every scenery script it imported | none measured, bounded by the roster | recycle the worker after N circuits | none needed |

None of the three makes a later map slower than an earlier one: CPU time per frame is flat (2.6 → 2.7 ms task,
1.19 → 0.91 ms script in run A) and no per-frame list, listener or timer count rises.

## Not covered here

- A real GPU and a real phone. This box has no GPU: frame times here are relative only, and iOS memory pressure,
  jetsam and thermal state do not exist on it.
- A completed flying lap (ghost and record writes). Run C's autopilot stopped at the first line crossing.
  `localStorage` stayed at 3378 characters.
- Decoded audio: the census saw 0 decoded buffers in every run, sound on included, so music and voice-pack
  retention across circuits was not exercised.
- Sessions longer than about 6 minutes.

## Hand-off

The report is from the iPhone, where a session of five maps is also five to ten minutes of full GPU load. Two
causes fit "slower with each map" and neither can be read here: the phone heating up (the governor then sheds
resolution or features, `js/perf/governor.js`, `js/perf/thermal-drift.js`) and iOS memory pressure from something
this box does not hold (decoded audio, real texture residency). The phone bridge can tell them apart. One batch
per circuit, five circuits in a row without a reload, then the first circuit again:

```apex-cmd
{"cmd":"batch","args":{"steps":[
 {"cmd":"nav","args":{"flow":"tt","track":"monza"}},
 {"cmd":"drive","args":{"seconds":40}},
 {"cmd":"frames","args":{"seconds":20}},
 {"cmd":"call","args":{"method":"perf","args":[]}},
 {"cmd":"call","args":{"method":"tlxMem","args":[]}},
 {"cmd":"call","args":{"method":"texCensus","args":[]}},
 {"cmd":"key","args":{"key":"Escape"}},
 {"cmd":"tap","args":{"id":"pm-quit"}},
 {"cmd":"wait","args":{"ms":600}},
 {"cmd":"tap","args":{"id":"pm-quit","until":"title"}}
]}}
```

Read per circuit: `frames.p50` / `p95` / `over33`, `perf` `scale` and `tier`, `tlxMem.bytes`, `texCensus.mb`.
Rising frame times with flat `tlxMem` and `texCensus` and a falling `scale` or rising `tier` is heat. Rising
bytes is a leak this box cannot see, and the scope that grew names where to look. If monza is as fast on the
sixth visit after a five-minute pause as on the first, it is heat.

`gpu-census.yml` (real GPU, macOS): `track` monza, `entry` tt, `mem_cycles` 6 would add the real-GPU memory
series; it runs one circuit, so it does not replace the phone reading.
