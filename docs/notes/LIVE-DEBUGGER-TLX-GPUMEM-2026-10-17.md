# Live debugger — TLX phone-tier GPU memory, 2026-10-17

Lane: perf-3. Session `bc-0b93633f-a52b-5434-a7ba-03c89680a125`. Tree: deploy tip
`bf2b3dd5` (`claude/f1-game-project-26h3ng`). One hunt round, then stop: no
CONFIRMED finding whose fix sits entirely in the owned files.

Byte baseline is `docs/notes/GPU-MEM-CENSUS-2026-10-17.md` on this same tip
(phone tier, Monaco, links stubbed, 60 warm frames): textures 25.2 MB / 51,
renderbuffers 0, buffers 31.7 MB / 1,208, total 56.9 MB. Largest single phone
allocation is the 1024² `DEPTH_COMPONENT24` sun shadow (4 MB). Track switches
`monaco,monza,monaco,monza`: textures return to the visit-1 baseline; GL
buffers grow ~10 MB per revisit. This round did not re-run the census: there
is no byte-changing edit to compare, and SwiftShader fill time is not evidence.

Excluded on purpose (claimed or forbidden): sky cache 512 and godray R11F
(#2649), index-only LOD and the mirror pass (#2657), CPU copies of road and
terrain attributes (#1647 / #2693), KTX2/UASTC (#1637).

## Findings

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| GPUMEM-1 | `js/render/three/tlx-shadow.js:92-122` | low | DECIDED — wait for npm | Phone sun target is 1024² depth plus an R8 colour attachment three r186 cannot omit (`textures[0]` sizes the target). R8 is 1,048,576 bytes; depth is 4,194,304. GLX's phone map is depth-only (`js/render/glx/shadow.js:106`). Depth-only targets are `new RenderTarget(w, h, { count: 0 })` (three.js #34782, merged to `dev` 2026-10-06). Checked 2026-10-17T21:05Z: `npm view three version` is `0.186.1` (versions end at `0.186.1`); GitHub release/tag latest is `r186` (published 2026-09-24). No `0.187.0` to vendor. Orchestrator 2026-10-17T21:36Z: no dev tarball; this note closes the lane until an official release. |
| GPUMEM-2 | `js/render/three/tlx-shadow.js:39-67` | — | BY-DESIGN | Phone sun is 1024 for every graphics preset, matching GLX. 512 would be a look change (texel density), not an unused allocation. Car and lamp maps are `null` on `isMobile \|\| mobileTier` (`:130`, `:164`). |
| GPUMEM-3 | `js/render/three/tlx-post.js:88-129,271-301` | — | BY-DESIGN | Phone scene MSAA is the caller's 0. SSAO, bloom and godrays allocate only when the governor opens them. SSAO is R8; bloom is R11F when `EXT_color_buffer_float` is renderable. Godray stays RGBA16F because alpha carries folded SSAO (#2649, not this lane). |
| GPUMEM-4 | `js/render/three/tlx-post.js:893-944` | — | BY-DESIGN | Scene depth is invalidated on WebGL2 when no pass reads it. A visible sun flare still samples depth, so a day frame keeps the surface. That is the reader, not a leak. |
| GPUMEM-5 | `js/render/three/tsl-viewport.js:1-27` and `js/render/three/tlx.js:1065-1072` | med (when the governor steps) | STAYS OFF | `apex26.tlxFixedTargets` stays default off (orchestrator 2026-10-17T21:36Z). Phone scale 1, same canvas 844×390, Monza day: noise 1.86% mean 0.814, effect 1.83% mean 0.773 (`rtResizes` 11 off / 12 on). The scale-0.7 arms are not that gate: desktop canvases 672×378 vs 960×540 (97.53% mean 64.119) and phone 591×273 vs 844×390 (85.5% mean 52.045). Remaining gate: a same-size fractional A/B, plus the phone soak. Desktop scale 1 timed out (`page.waitForFunction` 120 s). |
| GPUMEM-6 | `js/render/three/tlx-shadow.js:489-500` | — | REFUTED | Instanced shadow casters are removed, disposed and geometry-disposed in `freeInstanced`. Parked slot geometries are dropped in `releaseGeometry`. The census buffer growth across a revisit matches the forbidden CPU attribute-copy lane (#2693), not a caster left in this file. |
| GPUMEM-7 | `js/render/shared/vertex-pack.js:22-40` | — | REFUTED | World vertices are already 28 bytes (40 with track coords). The normal `.w` pad keeps the colour attribute 4-byte aligned. Index width for TLX lives in `js/render/three/tlx-chunked.js` `packIndex` (forbidden). `gltf.js:439` already emits `Uint16Array` when `vertBase <= 65535`. The largest baked model is 6816 vertices (`assets.js:597`). |
| GPUMEM-8 | `js/render/shared/assets.js:452-454,167-193` | — | BY-DESIGN | Phone loads the low material variant (`isMobile \|\| mobileTier`). Census: 128×128×17 arrays, 2.4 MB for two. The scratch WebGL2 context is session-scoped on purpose (a context per pack was a multi-second stall) and covered by `tests/unit/assets-pack.test.mjs`. v2 models expand to float on the CPU; the GPU quantiser is the forbidden chunked packer. KTX2 is #1637. |
| GPUMEM-9 | `js/render/three/tlx.js:4255` | low | OUT-OF-LANE | `createTexMesh` always uploads `Uint32Array` indices. The call site is forbidden. Decal and pit-sign meshes are small next to the 31.7 MB buffer total. |
| GPUMEM-10 | `js/render/shared/post-common.js:17-21` | — | REFUTED | Lens-dirt canvas is 256² and `generateMipmaps` is false (`tlx-post.js:154`). Default `lensDirt` is 0.15 (`js/lighting/knobs.js`), so the texture is sampled on the phone tier. |

## Not changed

No source edit. No player-facing change. No before/after byte delta.

## Deferred (superseded)

The 2026-10-17T20:32Z deferral (leave the 1 MB attachment; no r187 vendor lane)
was replaced by the 2026-10-17T21:00Z grant: vendor r187, then make the phone
sun target depth-only. That grant is what this section records.

## r187 lane — NEEDS-DECISION

Checked against npm and `mrdoob/three.js` releases on 2026-10-17T21:05Z, from
deploy tip `500ceb000`:

- `npm view three version` → `0.186.1`. The published version list ends at `0.186.1`. `npm view three@0.187.0` does not resolve.
- GitHub releases and tags end at `r186` (published 2026-09-24T14:35:44Z). There is no `r187` tag.
- #34782 ("WebGPURenderer: Support depth-only render targets") merged to `dev` on 2026-10-06T09:32:12Z. The API is `new RenderTarget(width, height, { count: 0 })`. It is not in the vendored 0.186.1 build. `vendor/three-patches/patches.mjs` needles are exact counts against 0.186.1 readable builds; `tools/gen/vendor-three.mjs` dies on a mismatch and only packs an npm version or a tarball of that version.

This branch does not vendor a GitHub `dev` snapshot, does not retarget the local patches, and does not edit `js/render/three/tlx-shadow.js`. Orchestrator decision 2026-10-17T21:36Z: wait for an official `three@0.187.0`. The 1,048,576-byte R8 colour attachment stays until that release. This note closes the r187 lane.

## Fixed targets stay off

Orchestrator 2026-10-17T21:36Z: do not flip `apex26.tlxFixedTargets`. The remaining gate is a fractional pixel A/B where both arms present the same canvas size (the scale-0.7 runs above resampled a smaller legacy canvas against a present-sized fixed canvas). The Monza realloc census did not finish.
