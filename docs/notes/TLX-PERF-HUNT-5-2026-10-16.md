# TLX perf hunt 5, 2026-10-16 — Inspector + CPU profiles, JS-side only

Branch `cursor/tlx-perf-inspector-9d2e`, cut from deploy tip `6f7ee195` (#2576, the three.js Inspector, merged).
Scope: TLX (`js/render/three/**`, `js/render/shared/**`) CPU-side cost: frame JS time, draw/render-object
counts, allocations, leaks across circuit switches. This container is SwiftShader, so GPU/fill numbers are not
measured (gpu-census NOT dispatched: no candidate fix reached it).

**Result: no TLX-owned regression above the run-to-run spread was found, so this PR ships no code change.** It
ships the baseline, the method that makes TLX measurable on this box, the negative results, and one finding that
belongs to the HUD owner.

## Method (why the first three attempts measured nothing)

| attempt | result |
|---|---|
| `tools/gfx/frame-hitch.mjs` headless | `frames: 0` — headless Chromium freezes rAF (`tools/shot/motion-capture.mjs` header) |
| headed under `xvfb-run` | three's WebGL2 shaders fail to link (`VALIDATE_STATUS false`), page unusable |
| headless + `recordVideo` (ticks rAF) | frames tick, but ~5 per 30 s: 94 s of a 99 s CPU profile is `getProgramParameter`, i.e. SwiftShader blocking on shader links; the scene never reaches steady state (render objects still growing after 150 s) |
| **headless + `recordVideo` + program-link stub** | 700–1800 frames per 30 s; the JS path is measured, GPU work is empty |

The stub (init script, before any page script): `linkProgram`, `compileShader`, `validateProgram` become no-ops,
`getProgramParameter`/`getShaderParameter` return true, info logs return `""`. Draw calls on an unlinked program
cost nothing, so a frame is three's + TLX's JS plus the game. It measures **CPU-side JS only**; shader compile
cost and any GPU time are invisible by construction.

Probe: `rAF` wrapper timing each callback (so a frame = the game's whole tick: physics, HUD, render),
`performance.memory.usedJSHeapSize` sawtooth deltas for allocation, `GLX.__tlx.memState()` for retained
geometries/textures/render objects, CDP `Profiler` (inclusive + self time, and samples aligned to frames >20 ms)
and `HeapProfiler.startSampling` with `includeObjectsCollectedByMajorGC/MinorGC` (counts garbage too; the older
note in `frame-hitch.mjs` says sampled objects vanish when collected — these flags are what changes that).
Chrome (the Inspector, on by default on localhost since #2576) was open for the leak run and its Performance
tab agreed with the harness: Scene CPU 3.51 ms, frame CPU 4.42 ms at 844×600.

## Baseline (chase camera, 22 cars, TLX WebGL2 path, stubbed links, 60 s settle then 30 s window, 3 runs each)

Frame = whole `requestAnimationFrame` callback ms (game tick + render JS). `alloc` = JS heap bytes allocated per
frame (sawtooth sum). `rObj/rGeo/rTex` = three `renderer.info` retained counts (what the Inspector Memory tab
shows) at the end of the window.

| circuit | p50 ms (runs) | p95 ms (runs) | mean ms | alloc KB/frame | render objects | geometries | textures |
|---|---|---|---|---|---|---|---|
| monaco, day | 3.1 (2.2, 3.6, 3.1) | 17.5 (17.0–18.8) | 5.1 | 170 (151–198) | 438–511 | 449–457 | 51–55 |
| spa, day | 4.3 (2.5–4.7) | 20.1 (14.2–25.7) | 6.8 | 257 (196–302) | 568–635 | 654–727 | 52–55 |
| vegas, night | 3.4 (3.2–3.7) | 11.2 (11.2–11.3) | 4.1 | 132 (123–135) | 373–397 | 583–632 | 57–59 |
| singapore, night | 4.1 (3.9–4.8) | 20.0 (17.0–21.3) | 6.0 | 170 (151–193) | 372–377 | 375–379 | 50–57 |

Not captured and why: **programs** (`renderer.info.programs` is empty on three's WebGL backend with stubbed
links), **triangles**, and **draw calls per frame** (`memState().calls` is the last `render()`'s count, sampled
4–18 across runs; render objects is the stable proxy). Run-to-run spread is large (frame count 704–1792 per
window) because the box is shared and the rAF is compositor-driven; a claimed win must clear the ranges above.

## Findings

| id | file:line | metric (before → after) | spread | fix commit | test |
|---|---|---|---|---|---|
| F1 | `js/ui/hud.js:2423` `drawMinimap` → `mmPitMark` `:2649` (**FORBIDDEN here; HUD owner**) | in frames >20 ms (104 of 1346 = 7.7 %, 2.8 s of the window) `updateHud` is 51 % (1417 ms), `drawMinimap` 993 ms, of which `mmPitMark` 980 ms (a `fillText` + `ctx.font` set per call) | one run; heavy-frame share 5–8 % across 4 runs | none (not mine) | none |
| F2 | circuit-switch leak (monaco→spa→monaco→spa→monaco, Inspector on) | rGeo 412→418→472→422→450, rObj 458→417→502→413→483, rTex 54→55→55→53→53, rUbo 527→474→559→470→540, JS heap 146.5→165.7→154.6→171.2→154.9 MB | none monotone; monaco visits 146.5/154.6/154.9 MB | n/a — clean | n/a |
| F3 | `js/render/three/tlx.js:4122` `setRenderScale` → `resizeNow` → `setSize` | 321 ms of a 30 s window (2 governor steps) | governor-driven (the box is slow) | n/a — already coalesced and guarded by the `<0.02` contract | n/a |
| F4 | `tsl-lit.js:341` `updateFrame` | 3.4 MB / 1348 frames ≈ 2.5 KB/frame of ~190 | below spread (monaco 151–198) | not worth a patch: hoisting the two closures and the default arrays cannot be told from noise | n/a |
| F5 | `three.webgpu.min.js` `_bindUniforms` (vendor) | 16 KB/frame of iterator objects (`for…of` over bindings) | one profile | none (`vendor/**` forbidden) | n/a |

**F1 is the only thing that stood out.** The mid-race tail the notes call "periodic hitches"
(`PERF-GAMEPLAY-HITCHES-2026-10-14.md`: `announceLane` layout thrash) is, on this run, mostly the minimap's
pit-mark text draw. Caveat: canvas text under SwiftShader may force a GPU-raster flush that a real GPU does not,
so this is **suspected, not confirmed on hardware**. Check it on a device with the Inspector Performance tab (or a
`gpu-census` window) before fixing; the cheap fix is to draw the "P" glyph once into an offscreen canvas and
`drawImage` it, setting `ctx.font` only on a size change.

### Checked and clean (with the number)

- Retained counts after circuit switches: flat (F2); no per-switch leak of geometries, textures or render objects.
- Material/program thrash: `memState().matMiss` 19 and `mats` 19 in every run (no growth), pool 162–334 varies
  with warm-up only.
- `matKeyFor` (`tlx.js:1768`) is memoised; `drawList` uses a count cursor (`drawList.n`) — the A5 regrow-from-empty
  finding in `TLX-PERF-HUNT-2026-10-11.md` no longer applies.
- The mirror pass renders the scene a second time (`mirrorEnd`, `tlx.js:4741`, 436 ms of a 30 s HELMET window):
  this is the known A1 design, unchanged; it does not run under the chase camera used for the baseline.
- Where the time goes in a 30 s window (inclusive, monaco): `tickBody` 5.6 s of 30 s wall (the rest idle),
  `render` 3.8 s of it, three's `_renderObjects` 2.2 s, `updateForRender` 1.1 s (three internal, per render
  object), `updateHud` 0.64 s, `updateCar` 0.54 s.

## Not run

- `gpu-census.yml` (no code change to measure); the TLX gate (`gfx-probe --backend three …`) and browser groups:
  no `js/` change.
- Any hardware GPU number. Programs/triangles per frame (see baseline).
- WGX/GLX; the `?inspector=1` Memory tab was read through its DOM only (counts equal `renderer.info`).

## Next step

1. HUD owner: verify F1 on a real device, then cache the pit-mark glyph (`js/ui/hud.js`, FORBIDDEN for this lane).
2. If a TLX change is wanted, the biggest TLX-owned JS lever left in the profile is `updateForRender`
   (1.1 s/30 s) — per render object uniform refresh in three; the lever is fewer render objects (A2 in the
   2026-10-11 hunt: collapse the ~28 instanced prop variants), a design change, not a patch.
3. Make the stub probe a tool (`tools/gfx/`, outside this lane's OWNED globs); it is reproduced below.

## Appendix: the probe

`scratch/tlxperf.mjs` (not committed; `scratch/` is untracked). Run as
`FAKELINK=1 SETTLE=60 NOPROF=1 node scratch/tlxperf.mjs <track> <day|night> 30 out.json`
(`ALLOC=1` adds the heap sampler, `HEAVY=20` the heavy-frame attribution, no `NOPROF`: the CPU profile).
Everything it does is described under Method; the stub is the six `P.* = …` lines there.

## F1 after: minimap pit-mark glyph cache (2026-10-17, branch `cursor/minimap-pitmark-cache-5d2a`)

`mmPitMark` (`js/ui/hud.js`) now renders the "P" disc once per (radius, fill, ratio) into an offscreen canvas and
`drawImage`s it; `ctx.font` is set once per glyph. Pinned by `tests/unit/hud-minimap-pitmark.test.mjs`.

Method: the stubbed-link probe above (JS-side only), 844×390, monaco, 20 s settle then a 30 s window, CDP profiler
at 200 µs, 3 runs per arm, alternating before/after (the before arm serves `git show HEAD~:js/ui/hud.js` through a
route). The pit marker is drawn per frame only while `pits.worthStopping(player)` holds, so both arms force it
(`__apex.tyres({level:"real"})` + `__apex.weather("rain")`: wrong tread). Without the forcing the marker is never
drawn and `mmPitMark` self-time is 0 ms in both arms (smoke runs), i.e. F1's 980 ms needs a pit-worthy car.

| arm | run | `mmPitMark` self ms | heavy frames (>20 ms) | frame p50 / p95 ms | frames |
|---|---|---|---|---|---|
| before | 1, 2, 3 | 3677, 3941, 3803 | 15.0 %, 8.8 %, 7.4 % | 9.8/25.2, 5.1/22.5, 3.7/23.1 | 1647, 1713, 1693 |
| after | 1, 2, 3 | 2.9, 0.7, 1.1 | 5.1 %, 9.2 %, 7.3 % | 12.1/20.1, 10.4/22.6, 11.4/22.4 | 1488, 1499, 1456 |

Reading: the `mmPitMark` self-time drop (≈3.8 s → ≈1 ms per window, three runs each, ranges disjoint by three
orders of magnitude) is a real win in the profiler. The builder's p50 rise (10.4–12.1 vs 3.7–9.8 ms) did **not**
reproduce; see the re-measure below.

### F1 re-measure (PR owner, 2026-10-17): the p50 question

Same stubbed-link method (844×390, DPR 2, monaco, chase camera, tyre wear + rain forcing the marker, 20 s settle,
30 s window), but **no CPU profiler** (the builder's 200 µs profiler was on in both arms), frame = one rAF callback,
4 runs per arm strictly alternating before/after, one browser at a time, loadavg 0.3–3.2 (the probe's own Chromium).
The before arm serves `git show HEAD~2:js/ui/hud.js` through a route. The probe also counts, inside the window,
`fillText("P")` calls, `drawImage` calls of a <40 px canvas and `document.createElement("canvas")` calls.

| arm | run | p50 / p95 ms | frames >20 ms | mean ms | frames | `fillText("P")` / glyph `drawImage` / canvases created |
|---|---|---|---|---|---|---|
| before | 1–4 | 4.9/29.4, 4.4/28.9, 3.8/31.2, 4.4/31.1 | 33.1, 32.3, 31.1, 29.9 % | 11.9, 11.4, 12.0, 11.4 | 484, 486, 482, 482 | 194, 193, 196, 190 / 0 / 0 |
| after | 1–4 | 4.6/20.5, 4.9/21.5, 4.4/20.1, 4.7/19.3 | 5.6, 7.4, 5.2, 4.7 % | 8.1, 8.5, 8.2, 7.7 | 478, 476, 484, 488 | 0 / 188, 191, 187, 194 / 0 |

p50 is not worse (before 3.8–4.9, after 4.4–4.9 ms). The tail moves: p95 28.9–31.2 → 19.3–21.5 ms, heavy-frame share
29.9–33.1 → 4.7–7.4 %, mean 11.4–12.0 → 7.7–8.5 ms, ranges disjoint over 4 runs each. The cache never misses (0
canvases created in the window; one glyph `drawImage` per marker frame), so the builder's higher after-p50 was not the
cache key nor `drawImage` cost; its profiler-on, 3-run numbers (1456–1713 frames per window against 476–488 here)
were a different frame-rate regime. Still SwiftShader CPU-side numbers: canvas text may be cheaper on a real GPU, so
the size of the win on hardware is unmeasured (gpu-census was not dispatched).

Visual evidence (not an assertion): minimap canvas at 844×390, DPR 2, before vs after, monaco with the marker
active — the "P" disc, the sector colours and the pit run are indistinguishable by eye (`artifacts/minimap-before-after.png`,
untracked); 175 of 48400 pixels differ by more than 24/255 between the two captures, which also differ in car-dot
positions and sub-pixel glyph placement.
