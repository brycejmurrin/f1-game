# TLX per-frame JS / GC — 2026-10-17

Lane: perf-2. Branch `cursor/live-debug-tlx-framejs-1-b39f`. Claim `perf-2 TLX per-frame JS/GC`.
Do not re-report rows from `PERF-ALLOC-HUNT-2026-10-17.md` (hud-layout, collide buckets, game.js per-car temps, spline curvature, glx litMaterial, tyre-model, frame-lights rank, extractPlanes `Math.hypot` left in place because `sqrt` is not bit-identical).

## Method

Headless Chromium, TLX WebGL2 (`apex26.tlxForceGL=1`), Monaco, helmet cam so the mirror pass runs, 320×180. CDP `HeapProfiler.startSampling` with `includeObjectsCollectedByMajorGC` and `includeObjectsCollectedByMinorGC`. Interval 32768 then 2048. Frames are ~3 s on this SwiftShader box, so a 2 s clock fires every frame here and every ~2 s on a 60 Hz machine. Node `--expose-gc` microbenches size the objects the sampler only counts.

## Findings

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| F1 | `js/render/three/tlx.js` `setRange0` | per-frame, ~150 B per extra write | CONFIRMED-LIVE | Same-frame second call pushed again (`pushes` 2 before, 1 after). Node: 1000× `length=0; push` grew the heap 155288 B; the keep path 3288 B. Live: `setRange0` and `_blobAppend` in the owned sample (interval 2048, 4 frames). `_blobAppend` / `_decalAppend` / `_coAppend` call it once per instance before three's `clearUpdateRanges`. |
| F2 | `js/render/three/tlx.js` `pruneGeoRegistry` | tail hitch every 2 s | CONFIRMED-LIVE | Cold `for…of` over 4000 live `WeakRef`s grew the heap 169776 B; indexed walk stayed under 40 KB. Live sampler: 14 samples on `pruneGeoRegistry` plus 13 on `deref` in 4 frames (the 2 s gate opens every frame when a frame is slower than 2 s). Hot `for…of` does not allocate; this walk is cold. `memState`'s census walk of the same array was the same loop and is indexed too. |
| F3 | `js/render/shared/frustum.js` `setPlane` `Math.hypot` | reported by the 5d2c lane | REFUTED for a patch | Still the per-frame plane normalise. `sqrt(a*a+b*b+c*c)` mismatches `Math.hypot` on realistic view-proj planes (495/1200). Not changed. |
| F4 | `js/render/shared/light-budget.js` | none | REFUTED | No per-frame sort or allocation. Slot counts only. Ranking stays in `js/lighting/frame-lights.js` (not this lane). |
| F5 | `js/render/shared/puddles.js` | none | REFUTED | `mask` / `field` have no per-frame caller under `js/`. Shader copies are hand-ported. |
| F6 | `js/render/shared/driving-line.js` `draw` | none | REFUTED | `_drawOpts` is one scratch refilled per frame. `build` allocates once per circuit. |
| F7 | `js/render/shared/mirror-pass.js` `drawCars` / `mirrorLights` | low | CODE-TRACED, not patched | One `next` sample under `drawCarsLod` and samples on `mirrorLights` (interval 2048, 4 frames). Hot `for…of` on a dense array does not allocate in this V8; the hold path already reuses `_vlBuf` / `_vlOut`. Left as-is. |
| F8 | scheduler (#2653) | — | not this patch | Owned mirror cadence (`instEvery`) already freezes prop re-cull. Lamp/sky/HUD jobs sit outside OWNED. |
| GPUMEM-9 | `js/render/three/tlx.js` `createTexMesh` | build-time index buffer | CONFIRMED, patched | Was always `Uint32Array`. Now `Uint16Array` when `pos.length / 3 <= 65535`, `Uint32Array` otherwise. Same cut as GLX/WGX (`vCount > 65535`). Not a per-frame alloc. |

## Fixes

Behaviour-neutral: the range object, its `count`, and which WeakRefs survive are unchanged.

- `setRange0`: if `updateRanges` is already `[r]`, only `r.count` changes.
- `pruneGeoRegistry` and the `memState` geometry census: indexed loops.
- `createTexMesh`: Uint16 indices at or under 65535 vertices, Uint32 above.

no player-facing change
