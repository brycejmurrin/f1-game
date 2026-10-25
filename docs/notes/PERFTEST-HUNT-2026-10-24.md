# Perf test hunt — coverage map, gaps, new gates (A·H17, 2026-10-24)

Lane: make a perf regression or leak impossible to merge silently. Bryce plays TLX on three's WebGPU
backend on an iPhone, so that leg comes first. Rule for every new gate: **count, don't time**. A
number that repeats exactly under SwiftShader and llvmpipe is a gate. A millisecond is a report.
PR #3697.

## Coverage before this PR

| Area | Existing gate | Kind | Holes |
|---|---|---|---|
| Track reachability across switches | `track-switch-memory.spec.js`, `track-switch-release.spec.js`, `race-cycle-memory.spec.js`, `race-retain-vm.test.mjs` | WeakRef identity (exact) + heap median (sampled) | three `renderer.info` counts are logged, not asserted (they warm for ~5 cycles) |
| GL object balance in GLX | `glx-resource-balance.test.mjs` | mock GL, exact | GLX only; the game-side create/free contract was not checked |
| TLX geometry lifecycle | `tlx-chunked-lifecycle.test.mjs` | unit | — |
| Livery texture leak | `livery-tex-dispose.test.mjs`, `car-draw-decal-budget.test.mjs` | unit | — |
| Frame time | `perf-frametime.spec.js` | ms, soft unless `APEX_PERF_FRAMETIME_STRICT` | wall clock, so not a hard gate |
| Race entry | `perf-race-entry.spec.js` | stage ms, soft | wall clock |
| Per-frame allocation | `frame-hotpath-alloc.test.mjs`, `physics-hotpath.spec.js` | source shape | **no measured bytes/frame gate** (PERF-ALLOC-HUNT-2026-10-17 measured 130–260 KB/frame, but only by hand) |
| Mesh / triangle size | `car-mesh-budget.test.mjs`, `mesh-census.test.mjs` | exact | per body, not per scene |
| BOOST first press | `tools/perf/ers-deploy-census.mjs` (A·W45, #3677) | CLI census | **no gate**, and nothing pins presses 2..N |
| Service worker | `service-worker.test.mjs` | handlers in a VM | **no browser cache-hit / offline-boot test** |
| Listeners / timers across sessions | PERF-HUNT-SESSION-MEMORY R1/R2 notes (by hand, "no leak") | manual census | **no gate** |

## Gaps, ranked

1. Listeners, timers and gfx handles across race → menu cycles: measured by hand twice, never gated.
2. Bytes allocated per race frame: measured once, never gated.
3. BOOST presses 2..N: a pipeline key that churns per press would hitch on every press. Nothing counts it.
4. SW cache hit: no test proves a second visit is served from cache, or that the game boots offline.
5. Draw calls / pipelines per circuit and tier: exact on a software adapter (PERF-HUNT-TLX-2026-10-17),
   but only logged. Follow-up below.
6. three `renderer.info` geometries/textures across cycles: they plateau after ~5 cycles. A plateau test
   needs 7+ race builds (~15 min of SwiftShader). Follow-up below.

## What each new test pins

| Test | Pins | Determinism evidence |
|---|---|---|
| `tests/unit/perf-vm-leak-cycles.test.mjs` (+ `tools/perf/vm-leak-census.mjs`) | monza + spa × 3 in the game VM. From cycle 2, live gfx handles (meshes / textures / instanced batches; created minus freed through the `js/render/gfx.js` contract), live listeners (window / document / element), and live intervals repeat **exactly** for the same circuit and phase. Pending timers at the menu do not exceed cycles 1–2. A positive control (Tracks.free stubbed out + one listener per quit) must be named by the same verdict. | 4 cycles measured: monza 33/23/31, spa 33/23/32, 643 listeners, 0 intervals, identical every cycle. 38 s |
| `tests/unit/perf-vm-alloc-budget.test.mjs` (+ `tools/perf/vm-alloc-census.mjs`, baseline `tools/perf/baselines/vm-alloc.json`, `--update`) | JS bytes per race frame (monza, seeded, renderer stubbed), mean of six GC-free 60-frame windows after 600 warm frames, ≤ 1.15 × baseline (188 KB/frame) | 5 runs: mean 186.9–189.2 KB/frame. Two of them ran beside three busy loops (loadavg 3.2): the mean moved 1 %, single windows 8 %. 8 s |
| BOOST per-press pipeline gate (**handed to A·W45**, see below) | TLX WebGPU and WebGL2 legs: presses 2..4, spaced 30 frames apart, build **0** render pipelines; an equal no-BOOST control window precedes each press; every press must deploy ERS | found #3703 |
| `tests/specs/perf-sw-cache-hit.spec.js` | After the install settles, an offline reload serves every same-origin script / stylesheet / document from the SW with 200, every shell `<script src>` arrives, and `race("monza")` reaches the race offline. A control (a never-cached URL must fail offline) proves the offline emulation reaches the worker's own fetches | see Results |

The VM census is the layer above the renderer: a handle the game forgets leaks on GLX, TLX and WGX
alike. What leaks below the contract (three's caches) stays the job of the browser memory specs.

## Results

- VM leak cycles: clean. Every count repeats exactly from cycle 1 on, and the positive control is caught
  (skipped `Tracks.free` → meshes/batches grow; listener per quit → menu listeners grow).
- VM allocation: 188 KB/frame baseline, inside the bound on every run.
- **BOOST presses (TLX WebGPU, SwiftShader adapter, api=webgpu): FINDING #3703.** The no-BOOST control
  windows before presses 2–4 built 0 pipelines. Every press window built ≥ 1: a transparent
  `MeshBasicNodeMaterial` (attributes `color,mat,normal,position,trk`, main pass) on presses 1–4, plus
  two fx quads (`fxAlpha,fxColor,fxCorner,fxSize`) on press 2. That is a compile on **every** press. Reported to A·W45
  (#3677) on the bus. The test stays strict and red until the fix lands. The repo has no expected-fail
  convention (`flaky-quarantine.json` only admits pass-on-retry), so none is used.
- BOOST presses (TLX WebGL2 / ANGLE SwiftShader): the leg's frame waits time out locally (see the PR for
  the measured frame rate). CI's llvmpipe runs this path ~2.7× faster.
- SW precache: the first attempt (offline reload) was invalid. Playwright's `context.setOffline()` does not
  reach the worker's own fetches: a never-cached URL still answered 200. Rewritten as a precache snapshot
  check. Its only misses were the 9 `LAZY_AGENT` files (the dev-only `__apex` surface sw.js excludes by
  design), so it found no real precache gap.

## BOOST gate: handed to A·W45 (#3677 / #3703)

OrchA 32 (2026-10-24, option b): the BOOST gate is red on today's tree by design (#3703), and the repo has no
expected-fail convention. So it lands with the fix as its regression test, not in #3697. The files are on branch
cursor/boost-press-gate-h17b (head 089a9bfa), three files: the tests/specs perf-boost-press-pipelines spec
(TLX WebGPU leg), its -gl sibling spec (TLX WebGL2 leg, in its own file because a second TLX boot in one
Chromium process stalls), and the tools/perf boost-press-census module (page driver + control windows).
Expected green on the fix: presses 2..4 build 0 pipelines on both legs, with every press deployed.

## Follow-ups (not in this PR)

- Draw-call / pipeline-count budgets per circuit × tier, from a fixed camera pose
  (`info.render.drawCalls` is exact on a software adapter). Needs a parked-camera hook that is stable
  across the menu flyby. One browser group per tier.
- three `renderer.info` plateau gate over 7+ cycles, as a nightly job (too slow for a PR leg).
- Browser-side listener / interval / AudioNode / DOM-node balance across race → results → garage
  cycles. The VM covers the first three for the race flow. Garage DOM and WebAudio only exist in a browser.
