# Perf census on three's WebGPU backend (lavapipe), first measurements

Kind: measurement · Re-measure-by: 2027-01-15

> Re-landed 2026-11-09 with PRs #4796, #4880 and #4913's tooling: the Nov 6 tree rollbacks (#5147, #5149, #5151)
> had removed all three. The numbers below are from 2026-11-04 and were not re-measured on the re-land.

Issue #4783, PR #4796. `node tools/gfx/pass-census.mjs monaco --webgpu --camera chase|helmet --frames 60 --warm 60`
and `node tools/gfx/res-scale-census.mjs --track monaco --webgpu`, run by `.github/workflows/perf-census-webgpu.yml`
on Mesa lavapipe (ubuntu-latest). Software skips batches (`skipBatches: true`), so these are not hardware numbers.
Bryce's iPhone path is this backend (D-013); until now every census pinned `apex26.tlxForceGL=1`.

## pass-census, calls and triangles per frame

| camera | run | output 640x360 | output 230x66 (mirror) | rt 256x256 | rt 512x512 (shadow) | total calls | total tris |
|---|---|---|---|---|---|---|---|
| chase | 1 | 32.7 / 157619 | - | 1 / 16824 | 0.1 / 7312 | 49.9 | 181771 |
| chase | 2 | 32.8 / 157748 | - | 1 / 16824 | 0.2 / 9770 | 50.1 | 184358 |
| helmet | 1 | 35.7 / 152936 | 10 / 115097 | 1 / 15496 | 0.1 / 7318 | 62.9 | 290863 |
| helmet | 2 | 35.9 / 153097 | 10 / 112055 | 1 / 15496 | 0.1 / 9770 | 63.2 | 290434 |

Cells are calls / triangles per frame. The small post targets (320x180 to 20x11, TLXPostLDR) are 1 to 7 calls each and 1 triangle.

**The counts are not exact between runs.** Main-pass calls move by 0.1 to 0.2 per frame, and the shadow target
(`rt 512x512`) fires on a different number of the 60 frames. So an EXACT gate on these would flake. The issue asked for
exact baselines on the "deterministic jump scenario"; on lavapipe the scenario is not frame-deterministic. A gate needs
either a fixed frame schedule (`--park` freezes the camera and pins tier and resolution) or a stated tolerance, which is
a decision for Bryce, not something to widen to get green.

## res-scale-census (scales 1, .9, .8, .7, .6, .5, .7, 1)

`rtResizes` stayed at 2 for the whole sweep, and the post target stayed 960x540 at every scale including 0.5. So either
`renderScale()` does not resize the post targets on the WebGPU path, or the sweep did not take effect on lavapipe. Not
yet told apart. Live textures: 27 at start, 28 at 0.9, 29 from 0.8 on, and still 29 after returning to 1. The issue's
check "textures after 1 to 0.6 to 1 equal the start" would fail (29 vs 27) on this data: two textures appear during the
sweep and stay.

### Render-scale follow-up (#4783, static analysis)

The flat `rtResizes` is most likely the probe, not the renderer. `tlx.js` `resize()` returns early while `_warmPending`
holds present() (`if (_warmPending) { cssSizeCache.markDirty(); return; }`), so a `renderScale()` step issued during the
long lavapipe pipeline warm is dropped, and `waitFrames` counted rAF ticks, which run far ahead of presented frames
there. `tlxFixedTargets` is default OFF, so the by-design explanation does not apply. `res-scale-census` now waits for
`!warming()` and for three's `info.render.frame` to advance, records the canvas size, the warm flag and the presented
frames each step needs to reach the scaled post-target size, and `--webgpu` exits 1 on a settle over 2 frames or a texture
count that does not return to the start. Confirm on the next `perf-census-webgpu` run; if the targets still do not follow
once presenting, the renderer is at fault and that run's rows say where.

## The rest of #4783 (2026-11-11, PR for #5400)

- **Row 3, `gpu-mem-census --webgpu`.** Done: `tools/gfx/gpu-mem-webgpu.mjs` wraps `GPUDevice.createTexture` /
  `createBuffer` and `destroy()` on the prototypes (bytes from the descriptor: block size, mip chain, layers, samples).
  The same wrapper runs inside `gpu-game-check`, so the real-GPU census reports requested WebGPU bytes too.
- **Row 4, writeBuffer per uniform group.** Gated in `census-verdict.mjs` (`uploadGate`) on the TLX WebGPU leg. Two of
  the issue's three premises did not survive the real-GPU data of gpu-census run 42943667972 (macos-latest):
  three writes only changed object blocks (33.66 object writes a frame), so the gate is `object writes <= draws`, not
  `== draws x stride`; and `rUboKB` is not flat on a DRIVEN window (81.3 to 98.3 KB over 20 beats, meshes coming
  into view), so it is gated on the parked frame (`pass-census --park`) and reported on driven legs.
- **Row 6, shadow-target discard on WebGPU.** Gated (`shadowGate`) from the `beginRenderPass` inventory: a pass whose
  depth attachment is a square of side 256 or more must store no colour. The pass inventory keys a view by size and format,
  so the shape is the identifier. On r187 the maps are depth-only (`count: 0`), which is what that run's `d:clear>store` rows show.
- **Row 1, exact baselines.** `pass-census --park` now freezes the sim in the task that starts the race, waits for the
  camera to come to rest (the chase rig eased for 300 frames after `snapCam()`), and counts its warm and its window in
  presented frames. Before that, two boots of one tree disagreed (monza: main pass 143067 vs 143139 triangles, mirror
  23 vs 21 calls); after it, they agree on every pass. `geometries` and `uniformBuffers` still differ between boots
  (193 vs 194, 352 vs 362: lifetime totals that follow the menu frames before the race), and so does `textures` on the
  phone tier (40 vs 39 in two runs, #5451), so the exact compare covers the pass counts and `renderTargets`, and prints
  the other three.

### First run of the new legs (perf-census-webgpu 42979924558, head d2bb399c, 2026-11-11)

**Adapter: the WebGPU adapter that run reported is `vendor google, architecture swiftshader`** (`adapterInfo`, in
`gpu-mem-*.json` `provenance.renderer`), not a Mesa one. This workflow and its tools call the arm "lavapipe" after the
driver the job installs and the launch flags it passes; what three's WebGPU backend actually ran on in this run is
Dawn's SwiftShader adapter. Every number from this workflow is a software WebGPU number either way.

- Parked cells, 8 of 8 (monaco, monza x chase, helmet x desktop, mobile): camera at rest in every cell (3 frames on
  helmet, 296 to 307 on chase), uniform buffers flat, 0 page errors, 60 presented frames each. Committed as
  `tests/data/pass-census-park.json`. Example, monaco chase desktop: main pass 29 calls and 158237 triangles on
  every render. The phone tier drops the `rt 256x256` shadow pass and three of the post targets.
- `gpu-mem-census --webgpu` monaco, requested bytes: desktop textures 80.94 MB (47), buffers 32.1 MB (921); phone
  tier textures 30.48 MB (40), buffers 29.67 MB (936). No unknown formats. The largest desktop texture is one
  `rgba8unorm 2048x2560` with 12 mips (26.67 MB); the phone tier's is two `256x256x17` arrays (5.67 MB each).
- Time: the parked step took 2 min 27 s and the memory step 30 s, so about 3 runner minutes added to a job that now
  takes 4 min 9 s in all.

**Second run (42983871455, head eb78b0db), the stability evidence.** Every pass count in all 8 cells equals the first
run exactly, the camera came to rest and the uniform buffers were flat in all 8. One number differed: `textures` in
`monza|helmet|mobile` read 39 where the first run read 40, and the phone-tier memory leg read 39 textures (30.07 MB)
where it had read 40 (30.48 MB). A texture count that differs between two boots of one tree does not belong in an
exact compare, so `textures` is printed and not compared; which texture is sometimes absent is #5451.

The same wrapper on a real GPU (gpu-census 42979981148, macos-latest, Apple Metal, montreal, end of a 476-frame driven
window): textures 125.76 MB (51), buffers 37.99 MB (1603). The sun shadow map there is `depth24plus 2048x2048` (16 MB)
where the software adapter builds 1024 or smaller.

Run 8 (bisect, one variable): res-scale-census now sets `sessionStorage apex26.wgxCapture=0` as pass-census does. Without
it, TLX on a headless software adapter soft-blits every present (`_softBlit` in tlx.js). Ruled out before this: boot-step
cap, `go()`, grid position. If run 8 reaches the sweep, the `present failed — null BYTES_PER_ELEMENT` reload belongs to
the soft-blit present on lavapipe WebGPU and is filed as its own bug; if not, the next variables are the 960x540
viewport and the setInput-driven wait.

Run 8 (a45f687f, wgxCapture=0): IDENTICAL `present failed — null BYTES_PER_ELEMENT` + `"color" not found` + reload,
~40 s into the race (the two pass-census legs in the same job passed, ~20 s each). Soft-blit refuted. New candidate,
static: a time-triggered rebuild. `sweepCarShadowMirrors` (tlx.js, every 2 s, NOT opt-in, no mobile gate) nulls the
uploaded CPU arrays of drawn car-shadow geometry; any later NEW pipeline for that geometry reads `attribute.array` in
three's `getVertexBufferLayout` and throws, and the paint ladder's unlit rung then asks for `color`. A governor tier
shed on slow lavapipe would build such pipelines; pass-census ends before one. Run 9 holds the tier (`govHold(true)`,
which a scale sweep needs anyway) and logs tier moves. If run 9 reaches the sweep, the shed-after-free is a player-facing
desktop WebGPU bug to file (refuseTab reload mid-race).

Run 9 (31e8443e, tier held): `governor held {"tier":0,...}`, NO tier move logged, same failure ~35 s later, and this time
the reload budget ran out (`The graphics renderer cannot draw on this device`). Governor refuted. Run 10 names the
culprit instead of guessing: it wraps the WebGPU backend's `createRenderPipeline` and logs every pipeline built for a
geometry with a null attribute array (object path, `__tlxKind`, freed flag, null attributes, material, seconds).

Run 10 (5bcf6b8f): same failure ~37 s after the hold, and NO `nullattr` line. Reading the vendored r187 bundle
explains it: the throw is not in `createRenderPipeline`. `Pipelines.getForRender` recomputes
`backend.getRenderCacheKey(renderObject)` whenever `needsRenderUpdate()` is true (any material or render-context state
change), and that calls `getVertexBufferLayoutCacheKey` -> `getVertexBufferLayout`, which reads
`attribute.array.BYTES_PER_ELEMENT` for EVERY attribute of `renderObject.getAttributes()`. So any geometry whose
arrays were set to `null` (tlx.js `releaseGeoMirrors`, tlx-chunked.js `releaseMirrors`) throws on its first state
change after the free, even with all its GPU buffers uploaded. Run 11 wraps `getRenderCacheKey`, catches the throw and
dumps the render object (object path, material, `vertexColors`, every attribute with its array type or NULL, index,
`__tlxKind`), and logs the page's full stack instead of 300 characters.

Run 11 (3cd202d3) named it: `nullattr cachekey t=36.7s kind=carSh freed=true obj=/Mesh<Object3D<Scene
mat=MeshBasicNodeMaterial geo=[position,normal,color,mat,trk all NULL]`, then the `MeshBasicMaterial vertexColors` ladder
rung threw the same way. Runs 1-10 never reached a scale step because a car-shadow mesh whose CPU mirrors the 2 s sweep
had freed threw on its next render-state change, and the reload loop followed. That is a player-facing desktop WebGPU
bug, filed as #4900 and fixed by #4904 (f6aebe48). This branch is synced past it; the next `perf-census-webgpu` run is
the first that can reach the render-scale sweep and judge the settle gate.

> **Correction 2026-11-10:** that fix did NOT survive. The 2026-11-06 whole-tree rollback (f740619, restoring e2d1574b)
> put `a.array = null` back in `releaseGeoMirrors`, and the 2026-11-09 re-land above did not bring #4904 with it. The
> live-play audit reproduced the reload again (LP-01, 9 of 9, default backend, a few seconds after the race finish:
> results screen → title with "Graphics reset"). Re-landed in PR #5270: on the WebGPU backend no mirror release nulls
> an array (`releaseGeoMirrors`, the chunked `releaseMirrors`), and a freed-mirror throw on any backend is repaired
> (zero-length view of the array's own class) and skips one frame instead of descending the paint ladder to a reload
> (`tests/unit/tlx-r187-contracts.test.mjs`, "LP-01").

Run 12 (7724ba33, synced past #4904): the throw and the reload are gone (no `present failed`, no `nullattr`, governor
held at tier 0), but `no top-level render in 240s (warming=false)` right after, and the sweep then waited 60 s for each
of up to 9 frames per step until the 25-min job cap cancelled it, losing the JSON. Either the page stopped presenting or
the `renderer.render` wrapper stopped seeing presents. Run 13 counts tlx.js's own present counter
(`backendState().presents`) as well, dumps rAF ticks, both counters over 3 s, game state and device errors when frames
stop, and aborts with the JSON instead of running into the cap.

Run 13 (a4e654ca, perf-census-webgpu 41916040537): **verdict ok.** Every step of the sweep (1, .9, .8, .7, .6, .5, .7, 1)
reached its scaled post-target size after 1 presented frame (gate: <= 2), 9 render-target resizes per step (63 over the
sweep), textures 47 at the start and 47 at the end, no page errors, warm done. So `renderScale()` DOES resize the post
targets on the WebGPU path; the flat 960x540 / `rtResizes` 2 of the first census was the probe (a step issued during the
pipeline warm and counted in rAF ticks). Run 12's "stall" was the probe too: the `renderer.render` wrapper counts 0 in
every row of run 13 (`frame: 0`) while tlx.js's own counter advanced, i.e. present() reaches three without passing the
instance method that wrapper replaced. `backendState().presents` is the frame clock for any future WebGPU census. The
trailing `page closed during scale 1` lines are the teardown's `browser.close()` (stale step label), not a crash.
