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
| GPUMEM-1 | `js/render/three/tlx-shadow.js:92-122` | low | BY-DESIGN / deferred | Phone sun target is 1024² depth plus an R8 colour attachment three r186 cannot omit (`textures[0]` sizes the target). R8 is 1,048,576 bytes; depth is 4,194,304. GLX's phone map is depth-only (`js/render/glx/shadow.js:106`). Depth-only targets are three r187 #34782, not vendored (0.186.1). Orchestrator decision 2026-10-17T20:32Z (Bryce left it to the orchestrator): leave the 1 MB attachment; no three r187 vendor lane now. It rides the next routine three.js upgrade. |
| GPUMEM-2 | `js/render/three/tlx-shadow.js:39-67` | — | BY-DESIGN | Phone sun is 1024 for every graphics preset, matching GLX. 512 would be a look change (texel density), not an unused allocation. Car and lamp maps are `null` on `isMobile \|\| mobileTier` (`:130`, `:164`). |
| GPUMEM-3 | `js/render/three/tlx-post.js:88-129,271-301` | — | BY-DESIGN | Phone scene MSAA is the caller's 0. SSAO, bloom and godrays allocate only when the governor opens them. SSAO is R8; bloom is R11F when `EXT_color_buffer_float` is renderable. Godray stays RGBA16F because alpha carries folded SSAO (#2649, not this lane). |
| GPUMEM-4 | `js/render/three/tlx-post.js:893-944` | — | BY-DESIGN | Scene depth is invalidated on WebGL2 when no pass reads it. A visible sun flare still samples depth, so a day frame keeps the surface. That is the reader, not a leak. |
| GPUMEM-5 | `js/render/three/tsl-viewport.js:1-27` and `js/render/three/tlx.js:1065-1072` | med (when the governor steps) | BY-DESIGN | Fixed targets stop the 11-target realloc per resolution step (`docs/notes/RES-SCALE-FIXED-TARGETS-2026-10-17.md`: 77 resizes on one Monza sweep). The flag `apex26.tlxFixedTargets` is default off. Turning it on changes the present path (canvas stays present-sized, final pass upscales) and was left for a pixel A/B plus the phone soak. `resize()` compares the raw arguments, then truncates; `rtSetSize` returns when the truncated size already matches, so a fractional repeat does not allocate a second target. |
| GPUMEM-6 | `js/render/three/tlx-shadow.js:489-500` | — | REFUTED | Instanced shadow casters are removed, disposed and geometry-disposed in `freeInstanced`. Parked slot geometries are dropped in `releaseGeometry`. The census buffer growth across a revisit matches the forbidden CPU attribute-copy lane (#2693), not a caster left in this file. |
| GPUMEM-7 | `js/render/shared/vertex-pack.js:22-40` | — | REFUTED | World vertices are already 28 bytes (40 with track coords). The normal `.w` pad keeps the colour attribute 4-byte aligned. Index width for TLX lives in `js/render/three/tlx-chunked.js` `packIndex` (forbidden). `gltf.js:439` already emits `Uint16Array` when `vertBase <= 65535`. The largest baked model is 6816 vertices (`assets.js:597`). |
| GPUMEM-8 | `js/render/shared/assets.js:452-454,167-193` | — | BY-DESIGN | Phone loads the low material variant (`isMobile \|\| mobileTier`). Census: 128×128×17 arrays, 2.4 MB for two. The scratch WebGL2 context is session-scoped on purpose (a context per pack was a multi-second stall) and covered by `tests/unit/assets-pack.test.mjs`. v2 models expand to float on the CPU; the GPU quantiser is the forbidden chunked packer. KTX2 is #1637. |
| GPUMEM-9 | `js/render/three/tlx.js:4255` | low | OUT-OF-LANE | `createTexMesh` always uploads `Uint32Array` indices. The call site is forbidden. Decal and pit-sign meshes are small next to the 31.7 MB buffer total. |
| GPUMEM-10 | `js/render/shared/post-common.js:17-21` | — | REFUTED | Lens-dirt canvas is 256² and `generateMipmaps` is false (`tlx-post.js:154`). Default `lensDirt` is 0.15 (`js/lighting/knobs.js`), so the texture is sampled on the phone tier. |

## Not changed

No source edit. No player-facing change. No before/after byte delta.

## Deferred

GPUMEM-1 stays. Orchestrator, 2026-10-17T20:32Z: leave the 1 MB R8 colour
attachment; do not open a three r187 vendor lane. The drop rides the next
routine three.js upgrade. The owned JS files are handed to perf-4 (memory
leak / WebGPU). This lane does not edit them again.

Fixed targets default-on is a separate decision. It needs the pixel A/B in
`tools/gfx/res-scale-ab.mjs` and a phone soak. Not this PR.
