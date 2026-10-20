# Render-path CPU and the flyby scene index (B·H9, 2026-10-20)

Fleet B, follow-up to the scene-cpu hunt (#3218, `PERF-SCENE-CPU-2026-10-20.md`). Two items
from OrchB 24: the flyby-sight `sceneOf` deopt storm, and a ranking of the render-path JS from a
real-GPU profile.

## (a) `FlybySight.sceneOf`: OSR exit storm — fixed

`sceneOf` bins ~2,100 prop/span boxes into a 32 m XZ grid (Monaco: 21,901 cells), once per
track, when the intro flyby first plans a shot. The ix/iz cell walk was nested inside the box
loop. A grandstand spans hundreds of cells, so the inner loop got hot within ONE box, V8
(Chromium 141, Maglev/TurboFan OSR) entered it on-stack and deopted on leaving it, once per box.
Node 22's V8 does not do this; measure in Chromium.

Fix: the cell walk (`binBox`) and the terrain max scan (`maxStride3`) are separate functions.
The arithmetic, the insertion order and the result are unchanged.

| measure (Chromium, Monaco, fresh page per sample) | base 5e419685 | head |
|---|---|---|
| `--log-deopt` "exit from OSR'd inner loop" at flyby-sight | 654 | 0 |
| `sceneOf` wall time, 6 pages (ms) | 32 / 38 / 39 / 56 / 111 / 125 | 28 / 30 / 32 / 33 / 34 / 62 |
| median | ~48 | ~33 |
| structure digest (cells in insertion order + maxT) | `a8e9682a` | `a8e9682a` |

Node VM digest of every box field, every cell list in Map order and `maxT`: Monaco
`f151417a7d57a14d`, Spa `e3bb333eba7e6348`, Suzuka `b9b526220bb7b102`, base = head.
Scripts: a Chromium page that captures the built track through `Tracks.sample`, deletes
`_fsScene` and times `FlybySight.sceneOf` (B·H9 scratch, not committed).

B·H8 measured this at ~55 ms once per track inside the sliced load plan (not a wait phase). The
win is the tail (111–125 ms samples gone), on the frame the flyby first plans.

## (b) Render-path JS on a real GPU — ranked, nothing to fix

Source: the CPU profile `tools/gfx/gpu-game-check.mjs` records on every census game leg,
`gpu-census.yml` run 39476115419 (macos-latest, deploy tip 6a7318d8, Monaco, ~20 s window at a
frame p50 of 33 ms ≈ 600 frames). Main thread idle 82–87 % on every leg.

| file | TLX WebGPU | TLX WebGL2 | GLX | WGX |
|---|---|---|---|---|
| `vendor/three…webgpu.min.js` | 547 ms (0.9 ms/frame) | 1,249 ms (2.1) | — | — |
| `js/game.js` | 269 | 255 | 267 | 401 |
| backend (`tlx.js` / `glx.js` / `wgx.js`+`wgx-chunked.js`) | 64 | 63 | 68 | 192 |
| `js/render/shared/frustum.js` | < 19 | < 15 | 39 (0.06) | 88 (0.15) |
| `js/ui/hud.js` + `js/ui/layers.js` | 62 | 80 | 54 | 92 |

The shared chunk cull costs 0.06–0.15 ms a frame on GLX/WGX and is below the table on TLX (the
phone default). HUD fit and layers are ~0.1 ms a frame. A hierarchical chunk cull would buy
≤ 0.1 ms on a Mac on the non-default backends, against a renderer change that needs the census
gates: not taken. The TLX CPU cost on a real GPU is three.js itself (B·H3's lane). The SwiftShader
render-path numbers in `PERF-SCENE-CPU-2026-10-20.md` are not evidence (frames take seconds and
code barely JIT-warms there).
