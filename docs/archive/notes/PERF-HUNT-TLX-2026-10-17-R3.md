# TLX perf hunt 2026-10-17, rounds 3–4 (dry) — do-not-re-report

Companion to `PERF-HUNT-TLX-2026-10-17.md` (rounds 1–2 landed: #2634 dust merge, #2643 merge factor 3). Same method:
link-stubbed TLX WebGL2, chase camera, CPU-side only (SwiftShader: GPU time is not evidence).

| lead | measure | verdict |
|---|---|---|
| allocations in the render path | `HeapProfiler` sampling, monaco 200 frames: 157 MB total, top rows are `updateCarLateral` 16.6 MB, `updateCarBrakePlan` 10.5 MB, `updateCar` 7.6 MB (game.js, physics lane). TLX-owned: `tsl-lit.js updateFrame` 2.3 MB (≈12 KB/frame, F4 of hunt 5), vendor `_bindUniforms` 5.9 MB, `getCacheKey` 2.0 MB | nothing TLX-owned above the earlier "below spread" call |
| GL state churn per frame (monaco, merge 3) | 74 main-pass draws; per frame 32 `useProgram`, 147 `bindVertexArray`, 193 `bindBuffer`, 247 `bindBufferBase`, 72 `bufferSubData` (283 KB) | all three's WebGL backend, per render object; the lever is fewer render objects (rounds 1–2) |
| vegas night uploads | 1.35 MB/frame `bufferSubData`: instance-matrix VBOs (913 KB × 0.76/frame, 189 KB × 1.2 …) already ranged to the live count by `_writeInstanceMatrices` (`setRange0`); ~31 small UBO writes/frame | the packs change because the visible cell set changes with the camera; no unranged upload to remove |
| night lamp shadow rebuild | `shadow-pass.js:616-656` already splits static map + cars (L1, `lampStaticBegin`) | landed earlier |
| CPU self-time, vegas 200 frames | only TLX-owned row above noise: `cullInstances` 76 ms / 200 frames (0.38 ms/frame), already an indexed per-instance copy | below what a patch can prove outside the spread |
| `render/gfx.js:247` Proxy `set` 195 ms | canvas `width`/`height` setters wrapped: 1 write in 100 frames (governor `setSize`) | one-off, not per-frame |

Two consecutive rounds produced no new CONFIRMED finding, so the hunt stops here (role-hunter stopping rule).
Remaining structural lever (not a patch): ~49 unique single-mesh render objects per main pass and ~28 instanced prop
variants (`TLX-PERF-HUNT-2026-10-11.md` A2), a design change that needs a hardware census.
