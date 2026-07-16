# WebGPU Phase 2 — real geometry + the lit shading pipeline — build notes

Status: **implemented, additive, and since wired in (opt-in, now at Phase 4b).**
Extends the Phase 0/1 scaffold (`docs/WEBGPU-PHASE0-NOTES.md`) with real mesh
GPUBuffers, a `FRAME` uniform buffer + a 32-light storage buffer + a
dynamic-offset per-draw uniform buffer, a base-PBR lit render pipeline into an
RGBA16F HDR scene target, and a tonemap blit to the swapchain. Per the plan
(`docs/WEBGPU-MIGRATION.md` §Phase 2).

The backend is now loaded by `index.html` but stays **opt-in**
(`localStorage apex26.gfxBackend = "webgpu"`); it is feature-detected and inert
otherwise (`WGX.create()` returns `null` → caller falls back to GLX). Files:
`js/webgpu/wgx.js`, `js/webgpu/wgsl-chunks.js`. `js/gfx.js` is the seam and
forwards every method. All pass `node --check`.

---

## What now renders

| Area | Detail |
|------|--------|
| **Meshes** | `createMesh` / `createChunkedMesh` build real interleaved vertex GPUBuffers + index GPUBuffers. `freeMesh` / `freeChunkedMesh` call `buffer.destroy()`. Per-chunk AABBs kept for cull. |
| **Frame uniforms** | One `FRAME` uniform buffer (224 B) written each `begin()`: viewProj, eye, sun dir/colour, hemisphere ambient (with `tune.ambientMul`), sky zenith/horizon, fog colour, and packed scalars (fogDensity·`fogDensityMul`, fogHeight, time, numLights, keyMul, glowAmp, wetness, cloud). |
| **Lights** | A 32-entry `array<Light>` **storage buffer** (2048 B). The flat stride-15 `frame.lights` array maps verbatim onto 4×`vec4` per light (pos+rad / col+bleed / dir+volW / cosInner+cosOuter+glareW). |
| **Per-draw** | Model matrix + 9 material scalars ride in a **dynamic-offset uniform buffer** (stride 256 B, 4096 slots/frame). Each `draw()`/`drawChunked()` writes its own slot and binds it with a dynamic offset — no per-draw buffer aliasing. |
| **Lit shader** | `WGSLChunks.LIT` — base PBR: hemisphere ambient + Lambert sun diffuse + Cook-Torrance GGX sun specular (soft-clipped) + 32 aimed point lights (windowed 1/d² falloff, spot cone, diffuse pool, GGX spec) + emissive HDR glow + height fog with sun in-scatter. Two-sided lighting via `@builtin(front_facing)`. |
| **Pipelines** | Lit variants cached by (blend, double-sided, no-alpha-write) — 8 combos max, built lazily. Opaque/back-cull is the default; alpha uses src-alpha/one-minus-src-alpha; both write depth (matches GLX `draw()`). Depth `depth24plus`, compare `less-equal`. |
| **Sky** | `drawSky()` renders the Phase-1 `SKY` shader into the same lit pass (target now `rgba16float`, depth write off, compare `always`) as the background. |
| **Cull** | `drawChunked()` frustum-culls chunks against `frame.viewProj` (ported `_extractPlanes`/`_aabbInFrustum`) and honours `frame.cullDist` via the radial `_aabbDist2` test — verbatim from GLX. |
| **Present** | `present()` ends the lit pass and runs a fullscreen tonemap blit (ACES + `opts.exposure`) from the HDR scene texture to the swapchain. `hdrMode()` now returns `true`. |

### The shared shader leaves (single-source math)

`WGSLChunks` grew a `brdf` leaf (`D_GGX`/`V_SmithGGX`/`F_Schlick`, verbatim from
GLX `js/glx.js:107-125`) composed into `LIT`, plus a `BLIT` shader reusing the
existing `tonemap` + `fullscreenTri` leaves. This keeps the microfacet + tonemap
math in one textual place per the maintainability plan.

---

## What is still stubbed or reduced (by phase)

The lit fragment shader is **faithful-but-reduced**. Deferred sub-effects, each an
isolated block dropped from GLX `main()` and clearly TODO-tagged in `LIT`:

| Deferred | Phase | Note |
|----------|-------|------|
| Shadow map + cloud shadow (`litNoL` currently `NoL*keyMul` only) | 3 | needs the depth pass + `sampler_comparison` PCF |
| Env cube + analytic sky mirror + rim/AO crush | 3 | one probe face/frame |
| Wet-road / puddle model + env-blend reflection | 4 | folds into the SSR composite |
| Per-material bump/albedo (`applyMaterial*`), ground detail micro-normal, car-paint orange-peel, clearcoat 2nd lobe, sparkle, bounce-fill | 4 | the "14 procedural materials" half of `LIT_FS` |
| Lamp-fog / ground-mist volumetrics | 4 | |
| **Full post chain** (bloom, SSAO+contact, god-ray, SSR, colour-grade, flare, vignette, grain, FXAA) — `present()` is a plain tonemap blit | 4 | `msaa()` still `1` |
| **Shadow pass** (`shadowBegin`/`castShadow*`/`shadowEnd`) | 3 | no-ops; `pcss()` still `false` |
| **Env probe** (`envFace*`, `envProbeReady/Reset`) | 3 | no-ops |
| **Decals** (`createTexMesh`/`createTexture`/`drawDecal`) | 4 | token handles; no-op draw |
| **FX** (`drawShadow`, `drawMark`, `drawSkidBatch`, `drawGlow`) | 4/5 | no-ops |
| **Instancing** (wheels, skids, glow, chunked props) | 5 | draws are non-instanced |

The material scalars for the deferred effects (detail, clearcoat, carPaint,
sparkle, wetness) are already plumbed through the uniform blocks — they're written
but not yet consumed, so no re-plumbing when those blocks land.

**One deliberate divergence from GLX:** WGX always stores the 10th vertex float
(`mat`, default 0) so a single pipeline vertex layout (stride 40) serves every
mesh — GLX keeps mat-less meshes at stride 36 to save memory. WGSL requires the
shader's declared `@location(3)` input to be supplied by the pipeline, so mixing
stride-36/40 would need two pipeline variants; normalising to stride 40 is simpler
for the experimental backend at a small memory cost.

---

## Riskiest correctness assumptions — double-check in a WebGPU browser

1. **Buffer struct alignment (highest risk).** The JS writers `_writeFrame` /
   `_writeDraw` / `_writeSky` hand-pack byte offsets that MUST match the WGSL
   struct layouts. Verified on paper: `FrameU` = 224 B (mat4 64 + 10×vec4 160,
   every vec3 padded to vec4); `Light` = 64 B (4×vec4); `DrawU` = 112 B (mat4 +
   3×vec4). If a scene renders with wrong colours/positions, suspect an offset
   here first. There is no compiler to catch a mispacked offset.

2. **Dynamic-offset ring correctness.** Each draw writes a distinct 256 B slot and
   binds it with a dynamic offset. This relies on `queue.writeBuffer` and
   `queue.submit` being ordered on the same queue timeline (they are, per spec),
   so a slot written this frame is read by this frame's already-encoded pass, and
   next frame's overwrite of slot 0 lands after this frame's submit. Also assumes
   `minUniformBufferOffsetAlignment ≤ 256` (true on all adapters; 256 is a valid
   multiple of any smaller power-of-two alignment). Frames with >4096 lit draws
   silently drop the overflow (raise `MAX_DRAWS` if that ever bites).

3. **Bind-group ↔ pipeline-layout indexing.** Explicit layouts: `@group(0)` =
   `{0: FrameU uniform (VS+FS), 1: lights read-only-storage (FS)}`; `@group(1)` =
   `{0: DrawU uniform, hasDynamicOffset (VS+FS)}`. The lit pipeline layout is
   `[g0Layout, g1Layout]`. Sky and blit pipelines use `layout:"auto"` with their
   own group 0, re-set per pipeline switch inside the pass.

4. **Format assumptions.** Scene target `rgba16float` is assumed core-renderable,
   -blendable, AND -filterable (the blit samples it with a linear sampler) — all
   core in WebGPU, no feature flag. Read-only storage buffers in the fragment
   stage are assumed core (they are). If a strict adapter rejects either, the
   whole backend `return null`s and the game falls back to GLX — no crash.

5. **Sky-before-geometry depth interaction.** Sky draws with depth-write off /
   compare `always` at NDC z=1, geometry then depth-tests against cleared depth
   1.0 and overwrites. Confirm the sky doesn't punch through geometry (it
   shouldn't — opaque geometry writes colour after the sky in submission order).

6. **`begin()` no longer auto-draws the sky.** Phase 1's `begin()` drew the sky
   itself; now `drawSky()` must be called (as `game.js` does). A bare
   `begin()`+`present()` harness shows only the tonemapped fog-colour clear.

---

## Remaining work — Phases 3-5

- **Phase 3 — shadow + env probe.** Depth-only shadow render pass into a
  `depth24plus` shadow texture; `texture_depth_2d` + `sampler_comparison` +
  `textureSampleCompare` PCF in `LIT` (replace the `litNoL` TODO); PCSS-lite
  blocker downsample; the 64² env cube (one face/frame) with a per-face render
  pass; wire `envProbeReady/Reset`. Flip `pcss()`→true.
- **Phase 4 — post chain + heavy materials.** Bright/down/up bloom mip passes,
  SSAO+contact, god-ray march, composite (SSR + colour-grade + flare + vignette +
  grain), FXAA; MSAA via `pipeline.multisample` + `resolveTarget` (flip `msaa()`).
  Port the deferred `LIT` material blocks (wet road, procedural materials, detail
  micro-normal, clearcoat, car-paint, sparkle, lamp-fog/ground-mist). Real decal
  atlas texture + `drawDecal`; `drawMark`/`drawSkidBatch`/`drawGlow`.
- **Phase 5 — instancing / perf.** Move wheels, skid batch, glow billboards, and
  chunked props to instanced draws; profile draw-call reduction vs GLX.

Then the wiring step (`docs/WEBGPU-PHASE0-NOTES.md` §Wiring it in): three
`<script>` tags in `index.html` + the async boot change in `game.js` + cache-bust
bump. Not done here — this stays additive R&D behind `apex26.gfxBackend`.
