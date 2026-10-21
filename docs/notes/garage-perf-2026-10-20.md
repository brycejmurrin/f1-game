# Garage perf census — body meshes + finishes (B·L24, 2026-10-20)

Bryce (06:36Z, via OrchB 21): "my garage is pretty laggy" after wave 1 (#3145),
resized bodies (#3160) and wave 2 (#3169, finishes 60–85). The baseline is
`c2902ca6` (the first parent of #3145's merge `8b3a2ea2`); the tip is `06c131b7`.

Probe: `node tools/perf/garage-census.mjs [--root <worktree>]`. TLX (the shipped
default) with GL forced, 844×390, SwiftShader. Frame times here measure this
container's CPU, not a phone GPU: the COUNTS (programs, shader source bytes,
tris, build ms) are the evidence. The census's gl.finish column reads ~0 on TLX:
the soft-blit readback already syncs every frame, so the rendered-frame ms is the
software proxy (and a weak one — it is this box's CPU).

## Measured (tip vs baseline)

| metric | baseline | tip | delta |
|---|---|---|---|
| lit uber-shader fragment source (TLX, the two lit programs) | 91.7 KB / 86.9 KB | 105.3 KB / 100.5 KB | +13.6 KB each (+15 %) |
| programs linked on garage open | 6 | 6 | 0 |
| preview car (team body) | 53.4 k verts / 19.4 k tris | 55.2 k / 20.0 k | +3 % |
| body styles (tris, min–max) | 18.9–20.0 k (7 styles) | 19.5–20.7 k (11 styles) | +3 % |
| Car3D.build, team body (median of 3) | ~100 ms | ~100 ms | ~0 |
| per rendered frame: draws / tris | 37.4 / 61.7 k | 37.4 / 63.7 k | +3 % tris |
| rendered-frame ms (median) | 5.5 * | 4.7 | ~0 |
| first part change after ≥ 20 s in the bay | recompiles the car program (86.9 KB) | recompiles the car program (100.5 KB): 2.7 s compile in SwiftShader | pre-existing; +15 % per recompile — FIXED since by 7c04ff7b (cause 1) |
| setup-sheet buttons (garage tab) | 49 | 64 | +15 |
| JS heap | 16–29 MB | 28–29 MB | noise (run-to-run) |

\* baseline leg ran under a parallel node suite (load ~8); counts unaffected.

The car is drawn twice every garage frame (the car, and the floor reflection,
`GarageScene.draw` → `MIRROR_RESOLVE`): 63.7 k tris per frame, of which ~40 k are
the car. Every car fragment cost is paid twice in the bay.

## Ranked causes

1. **FIXED by 7c04ff7b (B·H7 re-measure, 2026-10-20 PM).** `garage-census.mjs` change phase,
   six part changes past 20 s in the bay, TLX GL-forced 844x390: on `06c131b7`, programs
   `[1,0,0,0,0,0]`, 2629 ms compile, worst frame 8868 ms; on the tip `672f2a0c`, programs
   `[0,0,0,0,0,0]`, worst frame 223 ms. `scratch/h7-garage.mjs` (cursor/tlx-gpu-cost-h7m1),
   which logs every link with its shader hash: the car program (fs 100,480 B) relinked on a
   floor change in 3 of 3 runs on `06c131b7` and 0 of 3 on the tip. The 20 s idle is not
   what triggers it: the relink came on the second change, ~6 s into the bay. The cause was
   the pipeline release that 7c04ff7b closed: `releaseGeometry` freed the outgoing car's
   render objects before the new car's first draw, so whenever nothing else held the
   program (the pool prune drops idle co-holders after 20 s), three released and relinked
   it. 7c04ff7b holds a freed geometry's render objects for one scene render (guarded in
   `tests/unit/render-final-contracts.test.mjs`). Original finding:
   **Car shader recompile on a part change after ~20 s in the bay** (TLX,
   pre-existing on the baseline too, ~15 % longer since wave 2). The new preview
   car links a program byte-identical in size to the live car program (100.5 KB
   fragment) — a pipeline-cache miss, one 2.7 s frame here. INTERMITTENT: 7 of 8
   changes made ≥ 20 s after the bay opened recompiled on the tip (5 of 6 after
   an idle wait, 2 of 2 after a 2.5 s main-thread block), 1 of 1 on the baseline;
   0 of 4 changes made within ~20 s of opening (2 tip, 2 baseline). Not the wing-flap eviction (flaps alone:
   0 links; change with the eviction stubbed: still links). Freeing the outgoing
   car one frame late (tried, dropped) did NOT stop it: the link landed before
   the deferred free. Lives in TLX's pool / pipeline lifecycle
   (`prunePool` PRUNE_IDLE_MS 20 s, `dropWrapper`, js/render/three/tlx.js) —
   the render lane's to root-cause.
2. **Finish shader cost on every lit pixel.** The finish anti-alias inputs
   (`dFdx/dFdy(Ngeo)`, `fwidth(vObjPos)`, `smoothstep`) run unconditionally in
   glsl-lit.js / tsl-lit.js / WGSL for every lit fragment (room, and the track in
   a race), and the program grew 15 %: more registers, longer compiles.
3. **Full Car3D.build on atlas-only livery taps — FIXED in #3176.** crestStyle /
   crestTone / crestFrame / coverBind / finArt / finHandoff / gripTint were not in
   `MESH_FREE_DRAFT` (js/garage/setup-sheet.js). Measured on the real tap path
   (livery editor, 844×390 touch, TLX): Car3D.build per tap 1 → 0, worst frame
   194–277 ms → 19–30 ms; final frame pixel-identical (0 of 329 160 px).
   Guarded by `tests/unit/garage-perf-mesh-free.test.mjs` (builds the car with
   every listed field changed, two contexts; a mutation listing `c2` goes red).
4. **Full Car3D.build on every FINISH tap** (11 finish rows × 28 pills): a finish
   only remaps painted surface ids (`CarMaterials.applyFinish`), but the
   preview rebuilds the whole car.
5. Not causes (measured flat): body-style geometry (+3 % tris), garage mood
   lighting (same light count; gains only), fixture hangers, main-thread frame
   CPU, programs on open.
