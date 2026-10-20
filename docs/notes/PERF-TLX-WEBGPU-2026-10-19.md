# TLX on three.js WebGPU: render-path perf, round 1 (2026-10-19)

Lane B·H1 (Fleet B, wave 3). Assumes the shipped renderer is TLX with three's
WebGPURenderer (`apex26.tlxForceGL=0`). Vendored three is 0.186.1 (r186, the
latest release on 2026-10-19; github.com/mrdoob/three.js/releases), so no
released upstream fix is missing; the post-r186 per-object UBO/bind-group
work (three #30560) is unreleased.

## Baseline

| measurement | montreal | monaco | source |
|---|---|---|---|
| draws / frame (all passes) | 101.5 | 122.5 | `pass-census.mjs --park --by-object`, WebGL2 counters |
| triangles / frame | 218k | 281k | same |
| main pass draws / tris | 68 / 156k | 81 / 207k | same |
| mirror (230x66) draws / tris | 17 / 55k | 25 / 67k | same: ~4 tris per mirror pixel |
| rAF callbacks / drawn frame, TLX WebGPU leg | 2.05 | — | gpu-census 39262990733 (macos-latest, Apple/Metal) |
| rAF callbacks / drawn frame, TLX WebGL2 leg | 1.04 | — | same run |
| submits / frame, WebGPU leg | ~9 (19 in spike frames) | — | same run, `work: gpu.submit=8376` over 934 frames |
| writeBuffer / frame, WebGPU leg | ~38 | — | same run |
| top own-JS self time, WebGPU leg | `castShadow` 290 ms of 20.9 s sampled | — | same run, `cpu:` table |
| gpuErrors, three-WebGPU on lavapipe | 0 | — | `gfx-probe --backend three --tlx-webgpu --lavapipe montreal` |

Software numbers (pass-census, lavapipe) are counts or relative only; the
census on macos-latest is the only hardware evidence here.

## Ranked findings

| # | file:line | mechanism | expected win | measure | status |
|---|---|---|---|---|---|
| F1 | `js/render/three/tlx.js:513` | three r186 `Renderer.init()` starts its own window rAF loop (Animation `eb.start`: inspector, `info.reset`, `nodeFrame.update`). `a5ba3ad2` pumped it from `begin()` on WebGL2 only; the WebGPU leg still runs two rAF callbacks per drawn frame. The tick has no backend-specific step (only XR, init and dispose touch `_animation`). | one rAF callback per drawn frame (~0.05–0.12 ms; more on 120 Hz panels, where three ticks at vsync rate) | census `rAF/frame` on the WebGPU leg: 2.05 → ~1.04; frame p50 not worse | FIXED this PR |
| F2 | `js/render/three/tlx-shadow.js` endPass | `castScene` holds every slot of every target's pool plus every keyed batch caster; three's `projectObject` visits each child of every `renderer.render(castScene)`, hidden or not, so the per-frame car pass walked the sun and lamp pools. Same defect R6 fixed for the main scene (`tlx.js` poolRoot). | car/lamp passes walk only their own casters (unit: car render 8 → 1 children) | `tlx-hunt4c` pass-root tests; census `castShadow`/`_renderObjectDirect` self time | FIXED this PR (`apex26.tlxPoolRoot=0` restores) |
| F3 | `js/render/three/tlx.js` ~2652 | `_instRegistry` meshes (prop batches, mirror views, blob/decal runs) stay direct `scene` children, so main and mirror renders visit hidden ones | small | `scene.children.length` constant as batches grow | open (tracking issue) |
| F4 | `js/render/three/tsl-fx.js:318` | `decalMaterialFor` builds a `tex.id + "|" + glow` string key per decal per pass | below noise (allocation class rejected in PERF-HUNT-TLX-2026-10-17-R3) | micro-bench | open, low |
| F5 | `tsl-lit.js:344`, `tsl-fx.js:391`, `tsl-sky.js:448`, `tlx-post.js:591` | ~7–9 small closures/arrays per frame | GC hygiene only | heap allocation sample | open, low |
| F6 | three r186 renderer | every `renderer.render()` into a target is its own command encoder + `queue.submit` (~9/frame; post chain, mirror, shadows, main) | needs upstream (render bundles / one encoder per frame); not reachable without a vendor change | census `gpu.submit` per frame | recommendation (vendor is out of scope) |
| F7 | `js/render/shared/mirror-pass.js:79` | full mirror rung culls at 400 m for a 230x66 target: 55–67k tris, ~25% of the frame's triangles | GPU vertex work; a design call (look) | pass-census mirror row | open: structural, needs visual sign-off (TLX-WEBGPU-PERF-2026-10-18 §mirror density) |

## After (hardware census on 88081e2e, run 39319594552, macos-latest)

| measurement, TLX WebGPU leg | before (39262990733) | after (39319594552) |
|---|---|---|
| rAF callbacks / drawn frame | 2.05 | **1.05** (WebGL2 leg: 1.04 → 1.05) |
| gpuErrors / path | 0 / webgpu direct present | 0 / webgpu direct present |
| `castShadow` self time | 290 ms (top-14) | below the top-14 (< 94 ms) |
| hitch spikes over threshold | 192 / 934 f | 37 / 470 f |
| interval p50 / p95 | 40.6 / 82.3 ms | 36.3 / 82.2 ms |
| governor | tier 2, scale 1 | tier 0, scale 0.8 |

Only the rAF row is attributable: the governor settled on a different tier
and scale, so frame times, hitch counts and caster counts (and with them the
`castShadow` row) are not an A/B. F1's claim is the rAF count; F2 and R2-1
rest on their unit tests.

### Round 2 (js/render/shared/, js/lighting/)

| # | file:line | mechanism | expected win | measure | status |
|---|---|---|---|---|---|
| R2-1 | `js/lighting/frame-lights.js:238,399` | the lamp-rank cache compared the RAW `camTgt - camEye` forward vector (~8 m long, game.js) against `1e-4`, so ~0.07° of yaw failed it and every cornering frame re-ranked the whole lamp set; the mirror's ~20 m aim vector did the same | corner re-ranks 600 → 120 per 600 frames | `frame-lights-rank-cache` corner test (base: 0 reuses, 600 rebuilds; fails on base); vm bench 1000 lamps 174 → 103 µs/frame (relative) | FIXED this PR: unit direction, 1.5° budget, 100 ms age cap unchanged |
| R2-2 | `js/lighting/frame-lights.js:214,363` | per-chunk lamps + flicker: `_fillAllLights` re-tints every baked lamp each 50 ms (2 sin, hash, warm-up maths, 2 `LT` reads per lamp) | ~85 µs/frame at 5000 lamps (Node bench) | bench `setFrameLights` perChunkLights:1 flicker 0.1 | open (tracking issue) |
| R2-3 | `js/render/shared/mirror-pass.js:594` | `measure()`/`side()` read layout boxes at 2 Hz inside `render()`, after the previous frame's HUD writes: forced sync layout | est. 0.2–2 ms per hit on a phone | getBoundingClientRect count per span | open (tracking issue) |
| R2-4 | `js/lighting/atmosphere.js:79` | during a 25 s weather blend `_mixv` allocates per vector key per frame, and continuously moving `lampCullFade` breaks rank reuse | allocation + per-frame re-rank for 25 s | `Atmosphere.tick` 60-frame allocation count | open (tracking issue) |

Prior art re-checked and STALE: MEM-1 (post targets never disposed) is fixed
by `SHED_FRAMES` in `tlx-post.js:376`.

## Web sources

- three.js releases (r186 is latest, 24 Sep; r186 WebGPU changes #34276 bind groups by handle, #34283 shared uniform buffers, #33924 no shadow render in precompile): https://github.com/mrdoob/three.js/releases
- WebGPURenderer manual: https://threejs.org/manual/en/webgpurenderer
- Forum, r183: WebGPURenderer ~2x CPU per frame vs WebGLRenderer on many-mesh scenes (per-object UBO/bind-group work, #30560): https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904
- Forum, non-instanced mesh cost: https://discourse.threejs.org/t/why-webgpurenderer-performance-significantly-lower-than-webglrenderer/77629 and https://discourse.threejs.org/t/webgpu-performance-issue/87939
- webgpufundamentals optimization (one big uniform buffer with dynamic offsets, ~40% less JS; split uniforms by update rate; mapped transfer buffers ~2x; render bundles): https://webgpufundamentals.org/webgpu/lessons/webgpu-optimization.html
- wgpu best practices (bind groups by change frequency, no per-frame resource churn): https://wgpu.rs/doc/wgpu/documentation/best_practices/dos_and_donts/index.html
- PlayCanvas bump-allocated uniform buffers on WebGPU: https://github.com/playcanvas/engine/pull/5438

## Upstream three gaps (recommendation, no vendor change in this lane)

The vendored build is the current release; the per-draw CPU cost in
WebGPURenderer (per-object bind groups, one submit per `render()`) is the
known upstream bottleneck, and the repo already carries the reachable local
patches (`vendor/three-0.186.1/PATCHES.md` §6, §9, §10, §12, §13). Bump to
the first release that lands #30560 and re-run the census.
