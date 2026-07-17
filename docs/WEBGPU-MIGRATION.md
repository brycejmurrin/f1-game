# WebGPU migration plan — Apex 26

> **Status update (superseded in part):** this document is the original
> *planning* doc. Since it was written, the additive WebGPU backend has been
> **built and wired in, opt-in, through Phase 4b** — `index.html` loads
> `js/webgpu/wgsl-chunks.js`, `js/webgpu/wgsl-post.js`, `js/webgpu/wgsl-fx.js`,
> `js/webgpu/wgx.js` and `js/gfx.js`, and the backend activates only when
> `localStorage apex26.gfxBackend = "webgpu"` is set (it falls back to WebGL2/GLX
> on any failure). WebGL2 remains the default, always-present path. See the
> `WEBGPU-PHASE0/2/3/4-NOTES.md` for the as-built state. The Phase table and
> recommendation below are retained as the original design rationale.

This is a concrete, executable plan for adding an *additive* WebGPU rendering
path alongside the existing WebGL2 renderer (`js/glx.js`), with WebGL2 remaining
the default, always-present fallback.

## TL;DR / recommendation

WebGPU is **not worth a full port today**, and this document says so up front so
nobody starts at Phase 2 by accident. The renderer is one ~3,700-line file of
hand-tuned GLSL that is still under active art-direction churn (see the density
of tuning comments in `js/glx.js`); maintaining a second, WGSL copy of that
shader with **no build step to keep the two in sync** is the dominant cost and
the dominant risk. The devices that crash today — older iPhones on the tight
WKWebView jetsam budget (`MOBILE_TIER`, `js/glx.js:2035-2044`) — get **zero
benefit**, because WebGPU only shipped in Safari with iOS 26 (fall 2025) and
those phones can't run it.

The **cheapest high-value subset**, and the only part worth doing near-term, is
**Phase 0 in isolation**: introduce a thin `GfxDevice` abstraction seam between
`js/game.js` and the renderer, still backed 100% by today's `glx.js`, with **no
behavioural change**. That seam is independently useful (it makes the renderer
testable/mockable and documents the real draw contract), and it is the
prerequisite for *ever* adding WebGPU without a rewrite. Everything past Phase 0
should be gated on a concrete payoff (a specific effect that WebGL2 genuinely
can't do, or a measured win on a device class we care about) rather than done
speculatively.

See the [Risk register](#risk-register) and [Recommendation](#recommendation)
for the full argument.

---

## Step 1 — Inventory of the current renderer

Everything below lives in `js/glx.js`, a single `"use strict"` IIFE that assigns
one global `GLX`. Shaders are GLSL ES 3.00 (`#version 300 es`) inline template
strings. `js/game.js` is the only consumer; it touches the renderer **only**
through the ~35 methods on the returned `GLX` object (`js/glx.js:3665-3741`).
That object is the real abstraction boundary and the thing Step 3 formalises.

Two corrections to the top-level `CLAUDE.md` description, verified against the
code:

- **There are no UBOs.** `CLAUDE.md` says point lights ride in a UBO; they do
  not. The lit shader declares plain uniform arrays `uLightPos[32]` etc.
  (`js/glx.js:96-102`) uploaded with `uniform3fv`/`uniform1fv` every frame
  (`js/glx.js:2946-2972`). A grep for `uniformBlockBinding`/`bindBufferBase`/
  `UNIFORM_BUFFER` returns nothing. This actually *raises* the WebGPU effort,
  because WebGPU has no loose uniforms — everything must become a buffer/bind
  group (see Step 2).
- **No MRT, no instancing.** Every pass renders to a single `COLOR_ATTACHMENT0`.
  There are no `drawElementsInstanced`/`vertexAttribDivisor` calls anywhere.

### 1a. Shader programs

> **Note (current tree):** the GLSL sources are no longer inline in `js/glx.js` —
> they now live in `js/shaders/glx-shaders.js` as `GLXShaders.LIT_VS` / `LIT_FS` /
> `SKY_*` / etc. (pure data, loaded before glx.js). The `file:line` column below is
> the original inline layout this plan was written against; names are unchanged.

| # | Program | VS / FS (file:line) | Role |
|---|---------|--------------------|------|
| 1 | **Lit** | `LIT_VS` 9 / `LIT_FS` 39 | The main surface shader (~850 lines of FS). PBR GGX + clearcoat + car-paint flake + analytic & cube env mirror, 14 procedural materials (`applyMaterialNormal`/`applyMaterial`, 159-319), 32 aimed spot/point lights (562-639), shadow sampling w/ PCSS-lite (337-393), cloud shadows, height fog + sun in-scatter, ground mist, wet-road model. **This is 80% of the port.** |
| 2 | **Sky** | `SKY_VS` 890 / `SKY_FS` 901 | Fullscreen triangle (`gl_VertexID`, no VBO). Procedural gradient, cumulus clouds, golden-hour, stars, moon, sun disc/corona, city skyglow. |
| 3 | **Shadow (blob)** | `SHADOW_VS` 1174 / `SHADOW_FS` 1186 | Soft round blob shadow under cars. |
| 4 | **Mark** | `SHADOW_VS` (shared) / `MARK_FS` 1197 | Single skid-mark stamp quad. |
| 5 | **Mark batch** | `MARK_BATCH_VS` 1209 / `MARK_FS` (shared) | All live skid marks in one world-space buffer, one draw. |
| 6 | **Decal** | `DECAL_VS` 1224 / `DECAL_FS` 1237 | Textured team/sponsor decals; samples a canvas-baked RGBA atlas (`sampler2D`). |
| 7 | **Glow** | `GLOW_VS` 1265 / `GLOW_FS` 1285 | Additive camera-facing lamp-lens glare billboards. |
| 8 | **Bright** | `POST_VS` 1301 / `BRIGHT_FS` 1311 | Bloom bright-pass threshold. |
| 9 | **Blur** | `POST_VS` / `BLUR_FS` 1325 | Separable 5-tap gaussian (SSAO + shadow-blur reuse). |
| 10 | **Downsample** | `POST_VS` / `DOWN_FS` 1346 | 13-tap Jimenez bloom mip downsample. |
| 11 | **Upsample** | `POST_VS` / `UP_FS` 1375 | 9-tap tent bloom upsample, additive. |
| 12 | **SSAO** | `POST_VS` / `SSAO_FS` 1401 | Horizon AO from depth + contact-shadow march. |
| 13 | **God-ray** | `POST_VS` / `GODRAY_FS` 1476 | Volumetric sun shafts; marches the **shadow map** + 12 lights. |
| 14 | **Composite** | `POST_VS` / `COMPOSITE_FS` 1594 | ACES tonemap + colour grade + bloom add + wet-road/car **SSR march** + god-ray/sun-shaft add + lens flare + vignette + grain + chromatic aberration + speed blur + sharpen. ~390 lines. |
| 15 | **FXAA** | `POST_VS` / `FXAA_FS` 1988 | Final edge AA on the LDR image. |
| 16 | **Depth** | `DEPTH_VS` 2020 / `DEPTH_FS` 2026 | Shadow-map depth-only pass (empty FS). |
| 17 | **Blocker** | `POST_VS` / `BLOCKER_FS` 2391 | 512² min-depth downsample of shadow map (PCSS-lite source). |

~17 programs, ~15 distinct fragment shaders. The **Lit** and **Composite**
shaders alone are ~1,240 lines and carry essentially all of the visual identity.

### 1b. GLSL features in use (the port-relevant ones)

- **GLSL ES 3.00**: `flat` varyings (`flat out float vMat`, 22), `gl_VertexID`
  fullscreen triangles (Sky, Post, 894/1304 — no vertex buffer), `textureLod`,
  `dFdx`/`dFdy` derivatives (specular AA `js/glx.js:505`, SSAO/SSR normal
  reconstruction), integer bit ops.
- **`sampler2DShadow`** hardware depth-compare PCF (Lit `js/glx.js:67`, God-ray
  1481) with `TEXTURE_COMPARE_MODE = COMPARE_REF_TO_TEXTURE` (`js/glx.js:2422`).
- **`samplerCube`** live env probe (`uEnvCube` 65) with `textureLod` mip
  selection by roughness (715).
- **Uniform arrays, not UBOs**: 32 point lights × 6 arrays in Lit; 12 × 7 in
  God-ray. Re-uploaded per frame.
- **Sampler objects** (`gl.createSampler`, `js/glx.js:2456`) to read the depth
  texture with compare **off** for the blocker pass — the legal WebGL2 way to
  view a depth texture two ways.
- **Extensions**: exactly one — `EXT_color_buffer_float` (`js/glx.js:2203`),
  gating RGBA16F HDR / R16F blocker / RGBA16F env cube. Everything degrades to
  `RGBA8`/`UNSIGNED_BYTE` when absent (`colorType`, `js/glx.js:2204`).
- **No** MRT, **no** instancing, **no** transform feedback, **no** compute.

### 1c. Render targets, formats, and `createTargets()`

`initPost()` (`js/glx.js:2200`) picks `colorType = HALF_FLOAT` if
`EXT_color_buffer_float` is renderable, else `UNSIGNED_BYTE`. `createTargets()`
(`js/glx.js:2255`) (re)allocates on resize / render-scale change and is
careful to bind-before-delete to avoid transient double-resident surfaces (a
jetsam kill on mobile — see the long comment at 2270).

| Target | Format | Size | Where |
|--------|--------|------|-------|
| `sceneTex` (HDR scene) | RGBA16F / RGBA8 | full | 2279 |
| `sceneDepth` (sampleable) | DEPTH_COMPONENT24 texture | full | 2280 |
| `msFBO` (opt. MSAA 2×) | multisampled RGBA16F + D24 renderbuffers | full | 2294-2317 |
| `bloomLv[0..4]` mip chain | RGBA16F | ½,¼,⅛,… | 2318-2330 |
| `ssaoFBO` + `ssaoBlurFBO` | RGBA16F | half | 2334-2349 |
| `godrayFBO` + `godrayBlurFBO` | RGBA16F | half | 2351-2366 |
| `ldrFBO` (FXAA input) | RGBA8 | full | 2369-2382 |
| `shadowMapTex` | DEPTH_COMPONENT24, compare | 2048² (1024² mobile, `SHADOW_SIZE` 2106) | 2412-2427 |
| `blockerTex` | R16F | 512² | 2443-2453 |
| `envTex` (cube) + `envDepthRB` | RGBA16F/8 cube + D16 | 64² ×6 | 2754-2778 |

MSAA sample count is queried, not assumed (`getInternalformatParameter`,
`js/glx.js:2222`), capped at 2×, and **off entirely on `MOBILE_TIER`**. Resolve
is a `blitFramebuffer` in `present()` (`js/glx.js:3351`), followed by
`invalidateFramebuffer` so tiled GPUs skip the tile-store.

**Texture-unit convention** (must be reproduced by any backend): 0 = shadow map,
5 = decal atlas, 6 = env cube, 7 = blocker map (`js/glx.js:2898-2936`).

### 1d. Point-light layout + update path

Lights arrive from `js/game.js` as `frame.lights`, a **flat stride-15**
`Float32Array` (already culled to the nearest ≤32 by the game — the `setFrameLights`
equivalent lives game-side, not in glx). Per light:

```
[ x, y, z,  r, g, b,  rad,  dirX, dirY, dirZ,  cosInner, cosOuter,  bleed,  volW,  glareW ]
   0  1  2   3  4  5    6     7     8     9        10        11        12     13      14
```

`begin()` (`js/glx.js:2946-2972`) unpacks fields 0-12 into six scratch
`Float32Array`s and uploads them with `uniform3fv`/`uniform1fv`/`uniform2fv`;
`uNumLights` bounds the loop. Field 13 (`volW`) is consumed only by the god-ray
pass, field 14 (`glareW`) only by `drawGlow()` (`js/glx.js:3281`). This flat,
already-packed layout is a **gift** for WebGPU: it maps almost verbatim onto a
storage buffer (Step 2).

### 1e. The draw API surface (the abstraction boundary)

`js/game.js` calls exactly these (return block `js/glx.js:3665-3741`):

- **Lifecycle / targets**: `init(canvas)`, `resize()`, `setRenderScale`,
  `getRenderScale`, `width`/`height`/`aspect`, `hdrMode`, `msaa`, `pcss`,
  `isMobile`, `mobileTier`.
- **Resources**: `createMesh`, `createTexMesh`, `createChunkedMesh`,
  `createTexture`, `freeMesh`, `freeChunkedMesh`, `freeTexture`.
- **Frame**: `begin(frame)`, `draw(mesh, model, opts)`,
  `drawChunked(mesh, model, opts)`, `drawSky(sky)`, `drawShadow`, `drawMark`,
  `drawSkidBatch`, `drawGlow`, `drawDecal`, `present(opts)`.
- **Shadow pass**: `shadowBegin(lightVP)`, `castShadow(mesh, model)`,
  `castShadowChunked(mesh, model)`, `shadowEnd()`.
- **Env probe**: `envFaceBegin(face, eye, frame)`, `envFaceEnd(face)`,
  `envProbeReady()`, `envProbeReset()`.

The per-frame protocol `game.js` uses (see `js/game.js:3960-4568`):
`shadowBegin` → `castShadow*` → `shadowEnd` → optional env-probe faces
(`envFaceBegin`/redraw world/`envFaceEnd`) → `begin(frame)` → `drawSky` →
`draw*`/`drawChunked`/`drawGlow`/`drawShadow`/`drawSkidBatch`/`drawDecal` →
`present(opts)`. `begin()` consumes a large `frame` object (view-proj, sun,
ambient, fog, sky colours, wetness, cloud, time, `frame.tune` live knobs,
`frame.lights`). `present()` consumes `{exposure, bloom, ssao, contact,
threshold, tune, …}`.

**Note the per-draw uniform mutation**: `draw()` (`js/glx.js:2977-3019`)
re-uploads `uModel` and up to nine material scalars **every call** (cached
against last value, 2992-3000). This is idiomatic WebGL and the single biggest
conceptual mismatch with WebGPU (Step 2e).

---

## Step 2 — WebGL2 → WebGPU concept map (for *this* code)

### 2a. GLSL ES 3.00 → WGSL

There is **no build step**, so WGSL must also live as inline template-string
constants in a JS IIFE, exactly like the GLSL does now. Options:

- **Hand-port** each shader to WGSL. Highest fidelity, full control, but doubles
  every future shader edit and there is no compiler to catch drift. Given how
  hot `LIT_FS`/`COMPOSITE_FS` are, this is the honest cost centre.
- **Tool-assisted** (Naga/Tint via `wgsl` CLI, or `glslang`→SPIR-V→`naga`) run
  **offline** as a one-shot to seed the WGSL, then hand-maintained. Cannot run
  in-browser without adding a WASM transpiler (~1-2 MB) and a build/runtime
  step, which violates the project's static-no-build constraint. Recommended
  only as a *seeding* aid, not a runtime dependency.
- **Recommended**: hand-port, but **first** factor the shared GLSL helpers
  (`hash21`/`vnoise`/`cloudFBM`, the GGX `D`/`V`/`F` trio, `acesTonemap`,
  `colourGrade`) into named string fragments concatenated into both the GLSL and
  WGSL sources, so the noise/BRDF/tonemap math has a single textual source even
  across two languages. This is the only realistic way to keep two shader
  languages from diverging with no compiler.

Concrete syntactic mappings:

| GLSL ES 3.00 | WGSL |
|---|---|
| `in`/`out` varyings | `struct` with `@location(n)`; `flat` → `@interpolate(flat)` |
| `gl_Position` | `@builtin(position)` return field |
| `gl_VertexID` | `@builtin(vertex_index)` (Sky/Post triangles port directly) |
| `gl_FragCoord` | `@builtin(position)` fragment input |
| `texture(s, uv)` | `textureSample(t, s, uv)` — **texture and sampler split** |
| `textureLod` | `textureSampleLevel` |
| `sampler2DShadow` + compare | `texture_depth_2d` + `sampler_comparison` + `textureSampleCompare` |
| `samplerCube` | `texture_cube<f32>` + `sampler` |
| `dFdx/dFdy` | `dpdx/dpdy` (fragment only, same as GLSL) |
| `mat3(uModel)` | `mat3x3<f32>(m[0].xyz, m[1].xyz, m[2].xyz)` |
| implicit float promotion | WGSL is strict: `1.0` not `1`, explicit `f32()` casts |
| `discard` | `discard` (same) |
| loop `for(int i…)` | `for (var i…)`; dynamic loop bounds are fine in WGSL |

The **derivative-heavy** normal reconstruction (SSAO 1429, SSR 1745-1747) and
specular-AA (`js/glx.js:505`) port 1:1 to `dpdx/dpdy`. The `sampler2DShadow`
PCF taps (`sampleShadow` 337) become `textureSampleCompare` with an explicit
comparison sampler — semantically identical, and WebGPU’s comparison sampler
gives the same hardware 2×2 PCF the current `LINEAR` depth texture relies on
(`js/glx.js:2418`).

### 2b. Uniform arrays / loose uniforms → bind groups + buffers

WebGPU has **no loose uniforms and no `uniform3fv`**. Everything the shaders read
must become a buffer in a bind group:

- **Frame uniforms** (view-proj, eye, sun, ambient, fog, sky, wetness, cloud,
  time, all `frame.tune` scalars): pack into one **`FRAME` uniform buffer**
  (`@group(0)`), written once per `begin()` with `queue.writeBuffer`. Lay the
  struct out per WGSL rules (2c).
- **Point lights**: the flat stride-15 array (1d) becomes a **storage buffer**
  (`array<Light>` in `@group(0)`), or a uniform buffer of fixed `[32]` if
  storage buffers in the vertex/fragment stage are a concern on a target
  adapter. `uNumLights` is a scalar in `FRAME`. This is the *cleanest* win in
  the whole port — the data is already flat and pre-culled.
- **Per-material / per-draw** (`uModel`, roughness, metalness, …): see 2e.
- **Textures/samplers**: shadow map, env cube, decal atlas, and every post input
  each become an explicit `texture_*` + `sampler` binding, replacing the
  `activeTexture`/unit-number convention (1c). The compare-vs-non-compare
  double view of the depth texture (blocker pass, 2456) becomes simply two
  bind-group entries with a normal sampler and a comparison sampler.

### 2c. std140 → WGSL struct layout

WGSL uses its own layout rules (close to std140 but not identical): `vec3` is
16-byte-aligned, `f32` 4, `mat4x4` 64, arrays of scalars stride-16 unless the
element is already 16. The current code sidesteps std140 entirely (no UBOs), so
there is **no existing packing to preserve** — but you must author the new
structs carefully:

- Never trust a bare `vec3<f32>` to pack tightly; pad to `vec4` or place a
  companion `f32` in the trailing 4 bytes (e.g. store light `pos.xyz` + `rad` in
  one `vec4`, `col.xyz` + `bleed` in another, `dir.xyz` + `volW` in a third,
  `cosInner`/`cosOuter`/`glareW` in a fourth — a tidy 4×`vec4` = 64 B/light that
  maps directly onto the stride-15 source unpack in `begin()`).
- Build a tiny JS-side struct-writer helper (offsets as named constants) rather
  than hand-computing byte offsets at every `writeBuffer` — the no-build-step
  environment gives you no struct-layout validation, so a wrong offset is a
  silent visual bug.

### 2d. FBOs / passes → `GPURenderPassDescriptor`; the post chain

Each WebGL FBO+program+draw becomes a `GPURenderPassDescriptor` with explicit
`loadOp`/`storeOp` + a `GPURenderPipeline`. The post chain is a fixed sequence
of single-quad passes and maps almost mechanically:

```
shadow depth pass            → depth-only render pass into shadowMap texture
(blocker downsample)         → render pass, blockerTex target
env-probe faces (×≤1/frame)  → render pass per cube face view
main scene pass              → render pass into sceneTex(+depth); MSAA via
                               pipeline.multisample + resolveTarget (no manual blit!)
SSAO → SSAO blur             → half-res passes
God-ray → god-ray blur       → half-res passes
bloom: bright → down×N → up×N (additive) → mip-chain passes
composite (SSR/tonemap/grade/flare) → pass into ldrTex
FXAA                         → pass into the swapchain view
```

WebGPU’s built-in MSAA **resolve target** replaces the manual
`blitFramebuffer`+`invalidateFramebuffer` dance (`js/glx.js:3351-3360`)
outright — set `multisample.count` on the pipeline and `resolveTarget` on the
color attachment. Additive bloom upsample (`UP_FS`, blend `ONE,ONE`) and the
additive glow billboards (`GLOW_FS`, `js/glx.js:3332`) become pipeline
`blend` states, which in WebGPU are **baked into the pipeline** — so each
distinct blend/target combo is a distinct pipeline object (2e).

### 2e. Per-draw uniform mutation → the pipeline + bind-group model

This is the one place the architecture actually changes, not just the syntax.
Today `draw()` mutates `uModel` and material scalars per call
(`js/glx.js:2979-3000`). WebGPU **discourages per-draw uniform writes** into a
single buffer within a pass (the writes would serialise against in-flight draws).
The idiomatic answers, in increasing effort:

1. **Dynamic uniform buffer offsets** — one big per-draw uniform buffer holding
   `{model, material}` for every object, bound once, with a dynamic offset per
   `setBindGroup`. Closest to the current structure; a straightforward port of
   the `draw()` loop. **Recommended default.**
2. **Instancing** — the car wheels, skid marks, glow billboards, and the
   repeated HUD/prop meshes are natural instance batches. The chunked prop mesh
   (`createChunkedMesh`/`drawChunked`, `js/glx.js:3065`/`3128`) already
   frustum-culls per chunk and would benefit most. This is where WebGPU can
   actually *beat* WebGL2 on draw-call-bound scenes.
3. **Bindless-ish material atlas** — overkill here; the material is 9 scalars.

Pipelines are immutable in WebGPU, so enumerate the state combos the current
code toggles imperatively (`setBlend`, `setDepthMask`, `disable(CULL_FACE)` for
`doubleSided`, `colorMask` for `noAlphaWrite`, `POLYGON_OFFSET_FILL` for
shadows/marks) and **pre-create one pipeline per combo** at init. There are only
a handful: opaque / alpha-blend / additive × cull-on / cull-off ×
alpha-write-on / off. `polygonOffset` becomes `depthBias` in
`primitive`/`depthStencil` state.

### 2f. VAOs/VBOs/IBOs → `GPUBuffer` + vertex layout

`createMesh` (`js/glx.js:2611`) already interleaves `[pos3,nrm3,col3(,mat1)]`
into one buffer with a fixed stride — a direct match for a WebGPU
`vertexBufferLayout` with `arrayStride` 36/40 and 3-4 attributes. `createTexMesh`
(stride 32, `[pos3,nrm3,uv2]`) likewise. Index buffers map to
`GPUBuffer(INDEX)`; the Uint16/Uint32 selection (`js/glx.js:2618-2621`) becomes
the `indexFormat` on `drawIndexed`. The empty-VAO fullscreen-triangle trick
(`skyVAO`, drawn with `gl_VertexID`) becomes a pipeline with **no vertex buffers**
and `draw(3)` — WGSL generates the positions from `@builtin(vertex_index)`,
identical to now.

### 2g. Context, canvas, DPR, context loss

- **Context**: `navigator.gpu.requestAdapter()` → `adapter.requestDevice()`
  (async — a real change from the synchronous `getContext("webgl2")` at
  `js/glx.js:2468`; `init()` must become async or gate the game-start on a
  promise). `canvas.getContext("webgpu")` + `context.configure({device, format,
  alphaMode})`.
- **Swapchain format**: `navigator.gpu.getPreferredCanvasFormat()`
  (`bgra8unorm` on most platforms). The final FXAA pass writes here.
- **HDR**: RGBA16F is **guaranteed renderable** in WebGPU (`rgba16float` is a
  core renderable/blendable format) — no extension probe, so the
  `EXT_color_buffer_float` fallback logic (`js/glx.js:2203`) simply disappears
  on the WebGPU path. R16F/`r16float` likewise core.
- **DPR / resize**: same `devicePixelRatio` math (`js/glx.js:2579-2597`);
  reconfigure the context and reallocate targets on size change.
- **Context loss**: `device.lost` is a promise (vs the
  `webglcontextlost`/`restored` events at `js/glx.js:2484-2493`). Same recovery
  policy — reload to rebuild all GPU resources.

---

## Step 3 — Architecture: the `GfxDevice` seam

Introduce one new interface that both backends implement, so `game.js` never
names `GLX` or `WGX` directly.

```
js/gfx.js            Gfx       façade: feature-detects, picks a backend, re-exports the chosen device
js/glx.js            GLX       existing WebGL2 backend (unchanged behaviour)
js/webgpu/wgx.js     WGX       WebGPU backend (implements the same surface)
```

- **The interface = today’s `GLX` return object** (1e). That is deliberate:
  `GLX` already *is* the contract. `js/webgpu/wgx.js` must expose the same ~35 methods
  with the same signatures and the same `frame`/`opts` object shapes. No new
  abstraction is invented; the existing one is merely named and documented.
- **`Gfx` façade** (`js/gfx.js`, loaded before `game.js`):

  ```js
  const Gfx = (function () {
    async function create(canvas, opts) {
      const wantGPU = navigator.gpu && (localStorage.getItem("apex26.gfxBackend") !== "webgl2");
      if (wantGPU) {
        try {
          // WGX.create() requests its own adapter/device and returns null on any
          // failure (see js/webgpu/wgx.js) → fall through to WebGL2.
          const dev = await WGX.create(canvas, {});
          if (dev) return dev;
        } catch (_) { /* fall through to WebGL2 */ }
      }
      return GLX.init(canvas) ? GLX : null;               // always-present fallback
    }
    return { create };
  })();
  ```

- **Boot change in `game.js`**: line 39 today is
  `if (!GLX.init(canvas)) { … return; }` — synchronous. It becomes
  `const gfx = await Gfx.create(canvas); if (!gfx) { …nogl… return; }` and every
  later `GLX.` call routes through the returned `gfx` handle. Because the two
  backends share the exact method surface, the rest of `game.js`
  (`js/game.js:3665`-4568 etc.) is **untouched**.
- **Feature detection & graceful fallback**: `navigator.gpu` absent → WebGL2
  (covers every iOS < 26 device, i.e. all the crash-prone ones). Adapter request
  fails, device lost at init, or a user override (`apex26.gfxBackend=webgl2`) →
  WebGL2. WebGPU is strictly *opt-in-able-out* and never the only path.
- **Testing hook**: expose the active backend name on `__apex` (e.g.
  `__apex.gfxBackend()`) so the Playwright suite can assert which path ran and
  run the visual-regression specs against both.

---

## Step 4 — Phased, shippable increments

| Phase | Scope | Effort | Risk | Validate |
|---|---|---|---|---|
| **0. Abstraction seam** | Add `js/gfx.js` façade; make `game.js` boot async through `Gfx.create`; route all `GLX.` calls via the returned handle. **WebGL2 only, zero behaviour change.** | **M** | **Low** | Full existing Playwright suite passes unchanged (`npm run test:fast`, `test:visual`); pixel-diff regression shows **zero** delta. |
| **1. WebGPU device + clear + swapchain** | `js/webgpu/wgx.js`: adapter/device, `context.configure`, resize/DPR, a stub that clears to `frame.fogColor` and no-ops every draw. Wire feature detection. | **M** | **Low** | On an iOS 26 / Chrome device: boots, shows a cleared canvas, `__apex.gfxBackend()==='webgpu'`; on old iOS: still WebGL2. |
| **2. Lit + Sky pass** | Port `createMesh`/`createTexMesh` → GPUBuffers + vertex layouts; `FRAME` uniform buffer + light storage buffer; WGSL `LIT`/`SKY`; per-draw model/material via dynamic offsets; opaque + a couple of blend pipelines; render to an RGBA16F scene texture blitted to screen (no post yet). | **XL** | **High** | Side-by-side screenshot vs WebGL2 at fixed `__apex.park()` poses on ~5 tracks, day + night; car + track read correct. This is the make-or-break phase for shader fidelity. |
| **3. Shadow + env probe** | Depth-only shadow pass + comparison sampler PCF; PCSS-lite blocker downsample; the 64² env cube (one face/frame). Wire `sampler2DShadow`→`textureSampleCompare`. | **L** | **Med** | Shadow acne/penumbra and car reflections match WebGL2 within tolerance; `wallStats`/lighting probes unaffected. |
| **4. Post chain** | Bright/down/up bloom mips, SSAO+contact, god-ray march, composite (SSR + tonemap + grade + flare + vignette + grain), FXAA. MSAA via pipeline `resolveTarget`. | **XL** | **High** | Visual-regression specs (`test:visual`) pass on the WebGPU path; bloom/SSR/tonemap match within pixel tolerance; frame-time not worse than WebGL2 on a mid GPU. |
| **5. Instancing / perf** | Move wheels, skid batch, glow billboards, and chunked props to instanced draws; profile draw-call reduction; tune bind-group churn. | **L–M** | **Med** | `perf-profile` flame chart shows lower CPU frame time vs WebGL2 on a draw-call-bound track (e.g. a dense street circuit at night). |

Phases 2 and 4 are each **XL** and each individually larger than all the other
phases combined. Nothing after Phase 0 should start without a decision that the
payoff is real (see below).

Validation infrastructure already exists and should be reused verbatim: the
`playwright-probe` deterministic screenshot harness, the
`tests/tracks-visual.spec.js` pixel-diff suite, `__apex.park/jump/orbit`
for fixed poses, and `__apex.lightState/probe/wallStats` for numeric assertions.
Add a backend switch so each spec can run twice.

---

## Risk register

| # | Risk | Severity | Notes / mitigation |
|---|---|---|---|
| R1 | **Two shader languages, no build step, no compiler to catch drift.** `LIT_FS`+`COMPOSITE_FS` are ~1,240 lines of hot, frequently-edited GLSL. Every future art tweak must be made twice and can silently diverge. | **Critical** | The whole reason the recommendation is "Phase 0 only." Mitigate by factoring shared math (noise/BRDF/tonemap) into concatenated string fragments used by both; consider generating WGSL offline from GLSL as a seed. There is no full mitigation without adding a build step, which the project forbids. |
| R2 | **The crash-prone devices get nothing.** `MOBILE_TIER` iPhones on the WKWebView jetsam budget (`js/glx.js:2031-2044`) are pre-iOS-26 → no WebGPU. The memory work that actually helps them is all in the WebGL2 path already. | **High** | Accept and state plainly: WebGPU is an upside for *new* hardware, not a fix for the current failure mode. Any effort spent here is not spent on the devices that crash. |
| R3 | **Testing matrix doubles.** 50+ specs × 2 backends, plus the tracks-visual tolerances must be re-baselined for WebGPU (subtly different filtering/rounding will never be bit-identical to WebGL2). | **High** | Backend switch on every spec (Step 3); accept per-backend golden images; gate CI on both. |
| R4 | **Fidelity gap on the lit/composite port.** ~2,000 lines of hand-tuned, mobile-GPU-quirk-laden GLSL (note the many `pow(0,x)` NaN guards, e.g. 688/704/718/849 — added for real mobile-driver bugs). Reproducing the exact look in WGSL is fiddly and un-fun. | **High** | Phase 2/4 side-by-side screenshot gates; port the NaN guards verbatim (WGSL `pow` has the same footguns). |
| R5 | **Async init reshapes boot.** `getContext("webgl2")` is sync; `requestAdapter/requestDevice` are promises. `game.js:39` and everything assuming a ready renderer at module-eval time must tolerate an await. | **Med** | Contained by Phase 0/1: the façade returns a ready device or the WebGL2 fallback; game start gates on the promise. |
| R6 | **Effort vs payoff.** Realistic full port is **XL+XL+L+L+M** of specialist graphics work on a solo, no-framework codebase, for a visual result intended to *match* (not exceed) the current one, on a minority of devices. | **High** | This is the core recommendation input. Do Phase 0; treat 2-5 as opt-in R&D with a named payoff. |
| R7 | Bundle/complexity: a second ~3-4k-line renderer file to keep alive forever, even if WebGPU later regresses. | **Med** | The `Gfx` seam at least keeps `game.js` clean; `wgx.js` can be deleted without touching game logic if it doesn't pan out. |

## Recommendation

**Do Phase 0 now. Stop there unless a concrete payoff appears.**

- **Phase 0 (the `GfxDevice` seam, WebGL2-only)** is genuinely worth it on its
  own merits: it documents and enforces the real renderer contract, makes the
  renderer swappable/mockable, costs one **M** of low-risk refactoring, and is
  the non-negotiable prerequisite for *ever* adding WebGPU. It changes no pixels
  and no behaviour, so it's safe to ship immediately.

- **Phases 1-5 (actual WebGPU)** are **not** recommended speculatively. The
  dominant cost (R1) is maintaining a second copy of a large, hot, hand-tuned
  shader with no compiler and no build step; the dominant disappointment (R2) is
  that the devices which crash today can't run WebGPU at all. The payoff — mostly
  *matching* the current look on newer hardware, with a real perf win only on
  draw-call-bound scenes via instancing (Phase 5) — does not justify an XL+XL
  shader re-port for a fan project.

- **If** WebGPU work is pursued anyway, the cheapest high-value slice is
  **Phase 0 + a minimal Phase 1-2 WebGPU path that renders only the lit + sky +
  a trivial tonemap** (skip SSR/god-ray/SSAO/PCSS on the WebGPU path and let it
  read as a clean "high-end lite" tier), shipped **opt-in** behind
  `apex26.gfxBackend`. That proves the seam end-to-end, gives newest-device users
  a real WebGPU path, and avoids re-porting the two monster fragment shaders
  (`COMPOSITE_FS`, the heavy half of `LIT_FS`) until the effort is clearly
  justified.

- **Alternative that beats a WebGPU port on ROI**: invest the same effort in the
  WebGL2 path where it helps the devices that actually struggle — instanced
  draws for props/wheels/skids **in `glx.js`** (WebGL2 supports
  `drawElementsInstanced`), tighter `MOBILE_TIER` memory budgets, and LOD on the
  chunked scenery. Those wins land on *every* device, including the crash-prone
  ones, with none of the two-language maintenance tax.
```
