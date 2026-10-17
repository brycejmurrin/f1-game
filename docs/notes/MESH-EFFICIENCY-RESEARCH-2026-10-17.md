# Mesh efficiency research, 2026-10-17 — batching, render bundles, meshopt LOD

Follow-up to `PERF-HUNT-TLX-2026-10-17.md` (dust merge #2634, merge factor 3 #2643). Bryce asked for web research
on making meshes more efficient and for other building tools, then "do all": each idea below was tried or sized.
Evidence rule as in the hunt: this container is SwiftShader, so only CPU-side numbers (draw calls, render JS with
shader links stubbed) are claims; GPU effects are sized, not measured.

## Sources

- three.js docs via Context7 (`/mrdoob/three.js`): `BatchedMesh` (constructor, `perObjectFrustumCulled`,
  `sortObjects`, `optimize`), `BundleGroup` (`static`, `needsUpdate`, "only fully supported by WebGPURenderer with a
  WebGPU backend; with a WebGL backend ... without any performance improvements"), example
  `webgpu_performance_renderbundle.html`.
- meshoptimizer via Context7 (`/zeux/meshoptimizer`): `optimizeVertexCache`, `optimizeOverdraw` (input must be the
  vertex-cache output), `MeshoptSimplifier.simplify` / `simplifySloppy` / `simplifyWithAttributes`, `buildMeshlets`.
- https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221 — BatchedMesh uses
  multiDraw, InstancedMesh uses instanced draw; multiDraw is worse past ~100k instances, better for many geometries.
- https://github.com/mrdoob/three.js/issues/31935 — BatchedMesh and `multiDraw*Instanced`.
- https://github.com/mrdoob/three.js/issues/26876 — bundles pay only with a large number of draw calls.
- https://meshoptimizer.org/ , https://meshoptimizer.org/gltf/ (gltfpack), npm `meshoptimizer@1`.
- Vendored three r186 (`vendor/three-0.186.1/three.webgpu.min.js`), read for the bundle path below.

## Results

| idea | what was done | verdict |
|---|---|---|
| Coarser chunk dust grouping | `tlx-chunked.js` dust thresholds swept through a temporary override (not committed), merge 2 and 3, monaco + spa, 100 frames each | **Dry on top of #2643.** Merge 3: dust 48→160 tris saves 1 draw (monaco 124→123) and 4 (spa 151→147). At merge 2, dust 400 tris saves 17/25 draws but adds 4.5 %/2.2 % main-pass triangles, and merge 3 alone already reaches 124/151 with fewer triangles. Nothing shipped |
| `BatchedMesh` | docs + `PERF-FINDINGS.md` ("`BatchedMesh` is wrong for chunks") | **Not for chunks** (`addGeometry` copies vertices per geometry; the chunks share one ~5 M-vertex buffer). Only candidate left: many small unique props with one material. Not tried |
| Render bundles (`BundleGroup`) | read three r186 `_renderBundle` / `_projectObject` | **Not viable for the culled world.** A bundle's render list is built only when `bundleGroup.version` changes (`_bundleNeedsUpdate`), so its membership is frozen at record time; TLX shows a different chunk/instance set every frame (`acquireMesh` pool + cell cull). Replay still walks every render object through `needsRefresh` → `updateForRender` / `updateSharedForRender`, the per-object cost we measured. Re-recording per frame costs more than drawing. A bundle would need "draw everything, never cull" records, which the cull exists to avoid (phone OOM, `tlx-chunked.js` cull note). Also a no-op on three's WebGL2 backend, the path every software probe here runs |
| meshoptimizer vertex-cache / overdraw | `PERF-FINDINGS.md` "Vertex-cache reordering would gain nothing" | Already measured: ATVR 0.994–1.000 on props/road/terrain. Overdraw ordering is GPU-only and unmeasurable here |
| meshoptimizer `simplify` LOD | offline survey of the 77 baked models (`assets/pack/models`, 42 013 tris), npm `meshoptimizer@1` in `scratch/` | **Sized, not built.** Position-only weld + `simplify`: 1 % error → 13 821 tris (−67 %), 2 % → 10 718, 5 % → 3 379. Attribute-aware (`simplifyWithAttributes`, weld on position+colour+MAT so colour/material seams stay split): 1 % → 15 095 (−64 %), 2 % → 12 375. Error on the 15–35 m buildings is 0.18–0.35 m at 1 % (≈ 1–2 px at 200 m, 1080p, 60° fov) |
| meshlets (`buildMeshlets`) | docs | Needs mesh shaders / GPU-driven culling; three's CPU-driven path has no use for them |
| quantisation / gltfpack | docs | Attributes are already packed (`tlx-chunked.js` unorm/half). Remaining gain is download size, not render cost |

## What the LOD number means (and does not)

The baked models are a fraction of a frame: the monaco main pass draws ~143–176 k triangles, of which the visible
chunked city alone is ~60–80 k. The model share per frame was not split out, so the −64 % above is an upper bound
on the models' own triangles, not on the frame. A model LOD is also a **look change** (a far building loses window
detail), so it needs: (1) a per-batch triangle split to size the frame share, (2) a distance switch per instanced
batch (two batches per model, LOD0/LOD1, cell-culled by distance), (3) a frozen-frame A/B with a stated reason,
(4) `gpu-census.yml` on `macos-latest` — vertex cost is GPU-side, invisible here. The natural home is the asset
build (`tools/gen/assets.mjs`): bake `<id>.lod1.bin` at 1 % attribute-aware error beside each model.

## Repro

- Draw calls: `scratch/drawcalls.mjs` (untracked), method as in `TLX-PERF-HUNT-5-2026-10-16.md` §Method; env
  `MERGE=n` sets `apex26.tlxChunkMerge`.
- LOD survey: `scratch/mo/lod-survey.mjs` and `lod-attr.mjs` (untracked; `npm install meshoptimizer@1` in that dir).
