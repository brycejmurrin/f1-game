# TLX draw-call hunt, 2026-10-17 (lane perf-1)

Hunter `cursor:bc-b5cd51dd-5056-5709-aaf7-6a320ff4ffd9`. Counts taken on `bf2b3dd5`; the branch was fast-forwarded to `877b33e69` before the commit, and that range does not touch `tlx-chunked.js`.
CPU-side and count-based only. SwiftShader fill time is not evidence.
Headless chunk counts come from the real `TLXShaders.chunked.build` on the
track-build VM's props/road/terrain/startline buffers (instanced batches
withheld via `createInstancedBatch`, the same split the page uses).

## Findings

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| DC-1 | `js/render/three/tlx-chunked.js` dust pack (orphan pass) | high on monaco | VM-ONLY | After mergeK=3 and the block dust pack, monaco still had 54 chunk draws of ≤48 triangles whose box exceeds one 8-cell block (576 m), 762 triangles in all. Each is its own RenderObject. See the fix. |
| DC-2 | `vendor/three-0.186.1/three.webgpu.min.js` `needsRefresh`; meshes born in `tlx.js` `acquireMesh` | n/a | REFUTED | #2661: `object.static` skips the material-equality check. On r186 that read happens only after `hasNode` is false. `hasNode` is `containsNode`: any material property with `isNode`. TLX world materials are node materials, so `needsRefresh` returns FULL before `object.static` is read. `matrixAutoUpdate = false` is already set on pooled meshes (`tlx.js` `acquireMesh`). Setting `static` in the owned files would not change the refresh. |
| DC-3 | `js/render/shared/inst-cells.js` | n/a | BY-DESIGN | A batch is one instanced draw. Cells change which instances are packed, not how many draws. Headless batch counts: monza 33, monaco 22, spa 34. Collapsing those needs different geometries in one mesh (build-props / `tlx.js`, not this file). |
| DC-4 | `js/render/shared/chunk-bins.js` | n/a | BY-DESIGN | The cell key is the lamp-grid identity (`gx * 4096 + gz`). The leftover draws were orphan dust in the chunk builder, not a second bin of the same material. |
| DC-5 | `js/render/shared/lamp-chunks.js` | n/a | BY-DESIGN | TLX has no per-chunk lamp draw. The grid is sampled per fragment. Adjacent equal lamp lists were already counted as rare (`tools/gfx/chunk-share-census.mjs` header). |
| DC-6 | `js/render/three/tsl-chunks.js` | n/a | REFUTED | The file exports four layouted noise Fns. It does not build materials. Program identity is `customProgramCacheKey` in `tlx.js`. The material-equality skip DC-2 is unreachable for these graphs. |

## Fix DC-1

Dust whose own box is already bigger than the 8-cell block cannot join a neighbour
without crossing `MAXEXT`, and it is not on the wide list (that list starts at
`MAXEXT`). A second pack, same 384-triangle cap, no spatial key, folds those
orphans. `apex26.tlxChunkMerge=1` still disables both packs. Lamp cells stay on
the 72 m grid. Triangle indices are unchanged (the count below is identical).

| circuit | chunk draws before | after | delta | triangles |
|---|---|---|---|---|
| monza | 185 | 185 | 0 | 293517 |
| monaco | 178 | 126 | −52 | 254952 |
| spa | 236 | 234 | −2 | 239392 |

These are build-time chunk counts (one draw per chunk when the chunk is visible),
not a frame. The orphans' boxes already span ≥576 m, so a chase camera keeps most
of them in the frustum; the frame delta is that count, not a timing. Instanced
batch counts are unchanged (33 / 22 / 34).

Test: `tests/unit/tlx-chunked-lifecycle.test.mjs` "orphan dust whose box already
spans a block" — 9 draws before the pack, 3 after (dense chunk, one packed
orphan draw, one tight triangle).

## Not run

- `renderer.info` programs per frame. Stubbed links leave `info.programs` empty;
  a real link on SwiftShader is a compile stall, not a program-count the CPU
  pack changes. Chunk geometries share one attribute set, so this pack does not
  add a program.
- `tools/perf/profile.mjs --repeat 3 --base` (frame JS). The draw-count change
  is exact; a span delta inside the run spread is noise and is recorded when
  the profile lands.
- Browser groups. `instanced-draw.spec.js` goes through `remote-group.mjs` on
  the pushed head, not locally.
