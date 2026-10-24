# GPU memory hunt — TLX on three's WebGPU backend (A·H12, 2026-10-24)

Lane: GPU memory growth and leaks on Bryce's path (SETTINGS › THREE PATH: WEBGPU). First lead: A·H11 row H2
(branch cursor/live-debug-race-1-ah11, its LIVE-DEBUGGER-RACE note): `GPUBuffer` 371 → 1102 → 1247
across race→quit cycles, retained through `renderer.backend.data`.

## Method

A Playwright probe (not committed yet; scratch/gpumem/probe.mjs on the hunter's box) at 844×390, `hasTouch`,
`isMobile`, TLX with `apex26.tlxForceGL=0` on SwiftShader WebGPU (`WEBGPU_CHROMIUM_ARGS`). An init script wraps
`GPUDevice.prototype.create{Buffer,Texture,BindGroup,RenderPipeline,Sampler,ShaderModule}` and
`GPU{Buffer,Texture}.prototype.destroy`, keeps per-object metadata (bytes, creating stack, the cycle "epoch"), and
drops an entry on `destroy` or on GC (`FinalizationRegistry`, so the census never pins an object). After boot it wraps
`renderer.backend.create*Attribute` to tie each vertex buffer to its `BufferAttribute`, and `?three-devtools=1`
exposes `THREE` so `BufferGeometry.setAttribute/setIndex` stamp each attribute with its builder's stack. Each cycle:
`__apex.race(track)`, 10 s, pause → one QUIT TO MENU tap, two CDP `HeapProfiler.collectGarbage`, then a census of live GPU
objects and of three's `Renderer._objects._renderObjects` (the strong Set that keeps a RenderObject, its bindings
and its geometry until the object's or material's `"dispose"`).

CORRECTION (same day): QUIT TO MENU needs two taps (`js/ui/pause-opts.js` confirm guard), so the one tap above only
armed it, and probe runs 1–6 measured RACE → RACE switches from a paused race (`G.state` still `count`/`race`).
The real RACE → QUIT → MENU series, `gpu-game-check.mjs --mem-cycles 8` with both taps (state `menu` every cycle,
monza/montreal, SwiftShader WebGPU), read live buffers 1059, 1117, 1130, 1246, 1532, 1367, 1576, 1251 (43–63 MB),
textures 52–62 (101–109 MB), render objects 299, 319, 293, 393, 509, 477, 536, 351. No monotonic climb in count
or render objects. Same-track buffer MB drifts +1.2–1.5 MB per two cycles (≈0.7 MB a cycle) in the second half,
too short a series to separate from cache warm-up. The hardware series (gpu-census `mem_cycles`, 16 cycles) decides it.

Software numbers rank work; they are not device evidence (no GPU in this container).

## Findings

| ID | sev | verdict | file:line | mechanism | fix | evidence |
|---|---|---|---|---|---|---|
| H2 | — | REFUTED (as an unbounded leak) | — | The growth is bounded caches warming up, not a per-cycle leak. Live buffers after quit, 10 cycles monza/spa/monaco: 852, 1007, 1199, 1182, 1289, 1357, 1362, 1339, 1521, 1661 (29–49 MB); textures flat at 56 / 85.7 MB from cycle 2. Render objects older than the previous race stop accumulating: per-epoch survivors at cycle 10 are e2 60, e3 61, e4 10, e5 81, e6 21, e7 11, e8 8. They are the car caches (`car-draw.js` `putBoundedMesh` LRU: team bodies, field wheels, decals, compound rings, flaps), their warm-compile bindings, and one-time warm targets. The swing at cycles 9–10 is the CURRENT and previous track's own objects. | none | probe runs 2–6 (artifacts/logs/gpumem-probe2..6 logs on the hunter's box) |
| H2-HW | — | REFUTED on hardware | — | gpu-census run 40061540893 (`macos-latest`, real GPU, `mem_cycles: 12`, monza/montreal, both QUIT taps, state `menu` every cycle). TLX/WebGPU live buffers per circuit stay inside a ±40 band: monza 2165, 2182, 2217, 2137, 2153, 2179; montreal 1954, 2048, 2055, 2019, 2047, 2056. Buffer MB holds at 52–56, textures fall 63 → 56 (146–158 MB), and render objects run 378–515 with no climb. TLX/WebGL2 render objects are flat at 509–758 (no WebGPU counter on that path). `memCyclesVerdict` reads plateau on both. | none | `game-memcycles-{webgpu,webgl2}-macos-latest.json` in that run's artifact; pinned in `tests/unit/mem-cycles-lib.test.mjs` |
| G1 | low | CONFIRMED (VM + live) | `js/render/three/tlx-shadow.js` `warm()` finally | Each race's caster warm builds probe meshes (`probeCasters`), and one warm later disposed only their geometries. A geometry dispose only nulls a RenderObject's attribute cache (`RenderObject.onGeometryDispose`, three r186); the RenderObject frees itself on the OBJECT's or MATERIAL's dispose. So every race left 4–6 probe render objects (uniform buffers, bind groups, the probe geometry) for the session: live census, `probeGeometry` render objects from epochs 2, 3, 4 still present at epoch 10. | dispatch `"dispose"` on the previous warm's probe meshes before disposing their geometries | `tests/unit/tlx-gpumem-leak.test.mjs`: render objects 9 17 25 33 41 49 over six warms before, 9 9 9 9 9 9 after |
| G2 | info | REJECTED (by design) | `js/car/car-draw.js` `schedulePlayerHiRes` | The player's hi-res decal atlas is 2048×2560 RGBA8 with a full mip chain: 26.6 MB of the 85.7 MB texture total in this DESKTOP-UA census. A phone never schedules it: `LiveryTex.IS_PHONE` keeps the 1024 preview (Bryce 2026-10-21, "Cap garage only"). The 22 field liveries are 512×640 each, about 36.5 MB with mips. | none (already capped on phones) | texture list, probe run 6; `car-draw.js` schedulePlayerHiRes |
| G3 | info | CODE-TRACED | `js/track/tracks.js:363` floor mesh; `tlx-post.js` warm | One floor geometry's render objects (4) and 27 post-warm quad render objects from epoch 2 stay to the end. Neither grows after epoch 2 (one-time), so not a leak. | none | probe runs 5–6 |

## Re-considered levers (keep / revisit / drop)

- `releaseGeometry` → `dropWrapper` dispatching `"dispose"` (TRACK-SWITCH-LEAKS 2026-10-02): KEEP. The census found no freed-track geometry held through the pool.
- `compileWarmProbe` per-(geo, material) probes released on geometry/material dispose: KEEP. Its stale render objects did not accumulate across races.
- `_ssrMrtNode()` built once (one render context): KEEP. One `ctx/mrt` id across all ten races.
- Car caches (`putBoundedMesh`): KEEP. Bounded, and they are the plateau.
- Probe casters in `tlx-shadow.js` warm: FIXED here (G1).

## Next

1. DONE (round 2): `node tools/gfx/gpu-game-check.mjs <track> --mem-cycles N` is the reusable census (live GPUBuffer/GPUTexture, render objects, heap after each RACE > QUIT; `out.memCycles.verdict`), and gpu-census.yml runs it on both three.js paths when a push request sets `mem_cycles`.
2. Re-run the census with an iPhone UA (`LiveryTex.IS_PHONE`) for the phone footprint; the desktop numbers here include the 26.6 MB hi-res atlas a phone never builds.
3. DONE: hardware series in row H2-HW (plateau). Re-dispatch `mem_cycles` after any change to car caches, warm probes or the mesh pool.

Sources: three r186 src/renderers/common RenderObjects / RenderObject (npm `three@0.186.1`, read locally); WebKit bug
[275958](https://bugs.webkit.org/show_bug.cgi?id=275958) (iOS jetsam near 1 GB), [253172](https://bugs.webkit.org/show_bug.cgi?id=253172) (GPU process growth shows as a WebContent jetsam).
