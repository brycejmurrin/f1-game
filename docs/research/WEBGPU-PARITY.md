# WebGPU vs WebGL2 — WGX parity research (2026-08)

How to close the live gaps between the shipped WebGL2 renderer (`js/render/glx.js`
+ `js/render/shaders/` + `js/render/glx/`) and the opt-in native WebGPU backend
(`js/render/webgpu/wgx.js` + `wgsl-*.js`).

**Status (2026-08): most of the §3 inventory is implemented** in
`js/render/webgpu/wgx.js` + `wgsl-*.js`, including lacquer ENV absorb,
screen sun-shaft, flare depth occlusion, car SSR, bilateral AO upsample,
MAT anisotropy, lit `depthBias`, and sky overcast/bank/azimuth/lightning.
Remaining honest look deltas (audited 2026-08-18 against source):

- **TAA** still off (no history resolve — do not enable Halton jitter alone).
  GLX has no TAA either; this is not a live GLX↔WGX mismatch.
- **TLX MSAA** stays off (no resolved depth for post).
- **TLX car SSR tag** cannot write 0.35 into scene alpha (r185 `isOpaque()`
  is false for `NoBlending`, so `output.a` is coverage). The tag now lives
  on a second HDR attachment (`ssrTag` / `mrtNode`), armed only for the
  main scene pass — env cube and canvas fallback stay single-target.
- **TLX FS `mat` stays smooth** and baked wall UVs still key off the
  shading N. A TSL `varying().setInterpolation(FLAT)` compiled on three
  r185 / software GL but the garage turntable drew nothing. Garage frames
  (no `proj`) also must paint the canvas, not the HDR scene target.
  GLX remains `flat out float vMat`.
- **WGX FLAG VS wave** has no 4th vertex attribute (Dawn zeroed it on large
  ribbon VBOs). Not portable without reopening that defect.
- **WGX road lift — REMOVED.** The old `wp.y += 0.08` software-GPU fallback
  is gone: it won the floor/terrain depth fight and then buried cars, AI and
  fence feet in the tarmac (`wgsl-chunks.js`, "Do not lift the ribbon").
  WGX uses `depthBias`/`depthBiasSlopeScale` only, matching GLX's
  `polygonOffset`.
- **Tuner sliders (183 / 73 `u:`)** — every uniform knob is named on GLX,
  WGX, and TLX (`tests/unit/light-grid.test.mjs`). CPU knobs bake through
  `frame.*` / `present()` opts. `perChunkLights` + `roadChunkLamps` ship
  natively on WGX (the LampChunks bake in `trackLightSBO`/`chunkIdxSBO`,
  group-0 bindings 15/16, one DrawU slot per visible chunk with an absolute
  shadow index in `params10.x`); the honest no-op remains TLX only (shared
  node-material uniforms — the pinProgram lesson).
  `pcssPen` on three.js phones / software WebGL2, and on a desktop
  PCSS-off fallback, now scales the fixed Poisson R (identity at 80);
  true PCSS still needs the blocker.

Portable look deltas closed in this pass: WGX composite consumes SSR `.a`
(no wetness remul; `aoV²` + `min(gateSrc/0.20)` **once** — a deploy merge
had redeclared `gateSrc` and Dawn refused the SSR module); WGX SSR `sinT` Nv
fallback + GLX march `0.55`/`1.16`/refine 4; WGX SAA before wet; TLX
corrugation AA is `hc*7.5`; TLX SSAO no longer flips `N.z`; road-marking
mip uses unclamped `fwX` on GLX/TLX (WGX already did). SAA / MAT-aniso /
desktop GLX 4× MSAA / peel-then-bump stay matched. TLX flat-`mat` and
geometric baked UVs were reverted — they blanked the garage car.

SAA mixes geometric N with a uniform-CF peel hoist on all three backends
(material/wall bump stays out of SAA). Every baked MAT layer (walls
included) is hoisted to `textureSample` so pack aniso matches GLX
`texture()`.
Car-paint flake keys to `objPos`; SSAO uses the GLX/TLX `K[0..7]` fan and
skips taps at strength 0; `applyHdrGrade` is gated; SSR is consumed in
COMPOSITE same-frame and the SSR pass smears hits with the GLX/TLX
`carGloss` streak; TLX desktop WebGL2 has a color-depth PCSS blocker.
2026-08-18: the old pause-menu PerfTry GLSL flags (`flareGate`, `lampFogGate`)
and the 300 m `envCull` are now the baked product path on GLX/WGX/TLX — no
toggle, no `OPT_*` overlay. Late sky (opaque → sky → glow) is unconditional.
WGX stays opt-in (`apex26.gfxBackend=webgpu`); GLX stays the default.
Road surface: Block 1b sparse crack lines and baked-MAT footprint LOD
(`matTexLod`) are ported to match GLX `lit.js`. 2026-08-17: WGX `_generateMips`
had been sampling `pos.xy / parentSize` (dest pixels over src dim) so every
MAT/env mip was a zoomed top-left corner — tarmac read as a washed smear vs
GLX `generateMipmap`. Blit UVs now use dest size; `matTexLod` uses a geometric
mean so chase-grazing no longer jumps to mip 8. ASPHALT (MAT 16) is now
sampled in `fs_main` with `textureSample` (implicit LOD + anisotropy, same
as GLX `texture()`) before any non-uniform branch; other layers still use
`textureSampleLevel`. Pack upload is `writeTexture` of raw RGBA8 bytes —
`copyExternalImageToTexture` into `rgba8unorm` linearises the mean-128
asphalt scan and breaks `albedo * tex * 2.0`. 2026-08-17 later: a 4th
per-vertex attribute (and even `pos.w` of a packed float32x4) was delivered
as 0 on the **road** VBO — cars were fine. Every road fragment read
`matId=0` / `trk=0`, so asphalt never ran and `roadMarkings` gated off.
`vertex_index` on that ribbon also stayed 0 (`drawIndexed` and large
`draw`), so a per-vertex storage array always returned the grass skirt at
slot 0. Interpolators after location 3 are dropped. Interleaving
`(mat,s,x,hw)` onto the pos VBO (stride 52) **and** a second stride-16
vertex buffer at `@location(3)` both zeroed the attr **and** broke pos
fetch (dark gantry blit, sky ~`(31,18,38)` vs day ~`(93,104,122)`). Slot 0
stays stride 36. VS rebuilds `(mat, s, x, hw)` from the 32×32 centerline
LUT and packs `(s, x, hw)` into interpolator location 3 **xyz** (Dawn has
dropped `.w` of that location — a `hw > 0.5` gate fell back to per-fragment
nearest-bin and chopped the dashes). `fs_main` uses `in.matTrk.xyz` on
road draws. LUT `trkFromWorld` stays `buryRibbon` + material fallback.
Vertex colour stays the real albedo (packing into RGB greys the grass
shoulders).
See [CI-RENDERING-PERFORMANCE.md](CI-RENDERING-PERFORMANCE.md) §3 and
[ARCHITECTURE.md](../ARCHITECTURE.md) for the live caveat list.

Companion provenance (do not treat as current structure): the original
migration plan and maintainability review under `docs/archive/webgpu/`; the
four phase build logs were retired to the attic ledger
(`docs/archive/ATTIC.md`, 2026-09-01).

### First live boot (2026-08-17) — and the four bugs it found

Until this date nothing had ever run WGX against a real WebGPU device in this
container, because headless Chrome does not expose `navigator.gpu` without
`--enable-unsafe-webgpu`. Every WGX assertion in the suite runs against a mock
device, and all four of the following passed those tests while making the
backend unusable on any real one:

| Bug | Symptom on a real device | Fix |
|---|---|---|
| `MSAA_COUNT = 2` | "Multisample count (2) is not supported" per MS pipeline, then Invalid RenderPipeline / Invalid BindGroupLayout cascading off it. WebGPU allows 1 or 4 only. | `MSAA_COUNT = WGX_LITE ? 1 : 4` |
| `fwidth` in the material helpers | `'dpdx' must only be called from uniform control flow` — a COMPILE error that invalidates the lit pipeline, so WGX refused and the game fell back to WebGL2 with a console warning. | footprint taken at the `fs_main` entry, passed down as a parameter |
| `createBuffer({mappedAtCreation:true})` for geometry | Every mesh failed once the 35 MB chunked scenery buffer exhausted the mappable pool — including a 208-BYTE buffer. Empty world, no error state. | `queue.writeBuffer` (+ `COPY_DST`), which stages in bounded chunks |
| `POST_HDR_FORMAT = "rg11b10ufloat"` for the bloom/godray targets | "Color format (TextureFormat::RG11B10Ufloat) is not color renderable", then `WGX unavailable`. The format is core for sampling and copies, but RENDER_ATTACHMENT needs the OPTIONAL `rg11b10ufloat-renderable` feature. | request the feature when the adapter has it; re-derive from the DEVICE and downgrade to `rgba16float` when it does not |

Each was hidden by the one before it, so they surfaced one boot at a time —
budget for that shape rather than expecting a single fix. All four invariants
are now gated by `tests/unit/webgpu-lifecycle.test.mjs` ("every sampleCount…",
"no WGSL derivative sits where control flow can be non-uniform",
"rg11b10ufloat is only rendered into when the device grants the feature").
That last one needed the harness to start KEEPING pipeline descriptors:
`createRenderPipeline` discarded them, so the pipeline half of the sampleCount
guard had been reading an undefined `h.pipelines` and passing vacuously.
Reproduce the live boot with:

```sh
npx serve -l 3456 .        # the wrapper's Chrome needs a SECURE CONTEXT: 127.0.0.1
node tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --console 'WGX|error'
```

A clean boot prints no `WGX` console line, `WGX.gpuErrors()` is 0, and
`sessionStorage["apex26.gfxBound"]` is ABSENT (that key is written only when
WGX refuses and hands the frame to GLX). Those are all *absence* signals, so
pair them with one positive check — drive a race and assert
`canvas.getContext("webgl2") === null`, since a canvas claimed for WebGPU can
never hand back a WebGL2 context:

```sh
node tools/mcp-cli.mjs probe --backend webgpu --wait 8000 \
  --eval 'await __apex.race("monza"); await __apex.go();
          await new Promise(r=>setTimeout(r,7000));
          return String(document.querySelector("canvas").getContext("webgl2") === null);'
```

Measured 2026-08-17 after the fourth fix: `true`, on a Monza race, with an
empty `__apex.logs()` gfx filter — WGX's first live frames in this repo.

**CORRECTED 2026-08-17 (same day, later):** SwiftShader-Dawn **executes**
shader work in this container — a pipeline draw reads back its exact fragment
output through `copyTextureToBuffer` + `mapAsync`. The old "validates but does
not execute" belief conflated two real but narrower limits: (a) the **native
swapchain** present/compositor path is blank (screenshots of the hidden WebGPU
canvas show nothing), and (b) **the first `ctx.getCurrentTexture()` call
permanently breaks `GPUBuffer.mapAsync` on that device** — every later map
rejects with "A valid external Instance reference no longer exists",
unrecoverable even by `unconfigure()`. A device that ever touched its
swapchain can render but never read back — which is exactly what "doesn't
execute" looked like from outside.

The way past both (2026-08-17, cache 1342+): on software adapters WGX
soft-presents — the final pass renders into a per-frame `COPY_SRC` texture
instead of the swapchain, `getCurrentTexture()` is never called, and each frame
is 2D-blitted onto visible `#game` via ephemeral staging buffers
(`_softDisplayEncode` / `_softDisplayFinish`). Readbacks wait for
`onSubmittedWorkDone` before `mapAsync`; `awaitSoftPresent()` resolves only
after a successful visible blit (non-blank pixels). `GLX.capturePixels()`
reads the same texture as optional RGBA oracle — `tools/wgx-capture.mjs` →
`frame.png`; primary visible gate is `tools/gfx-probe.mjs` → `canvas.png`.
The first capture pass found four latent WGX bugs in one afternoon (§1a below).
SwiftShader remains non-representative for PERFORMANCE and for anything MSAA
(software adapters force MSAA 1), but it is now a genuine visible-canvas +
validation oracle.

Note also that three's WebGPU backend (TLX auto-picks it on Chromium desktop)
still dies here inside its own `mappedAtCreation` upload — probe TLX with the
WebGL2 pin, as the specs do.

### 1a. The four bugs the first real capture found (2026-08-17)

All four passed every mock test and every prior "validates clean" run, because
they live in exactly the layers the mock cannot model and the old absence
signals never exercised:

| Bug | Mechanism | Why no run ever saw it |
|---|---|---|
| Bloom pipelines `SCENE_FORMAT`, bloom mip textures `POST_HDR_FORMAT` | "Attachment state … not compatible", one invalid submit per frame — black screen | Mismatch needs `rg11b10ufloat-renderable` granted AND a perf tier that runs bloom; container runs never had both |
| `skyBindGroup` from `skyPipeline`'s auto layout, drawn with `skyPipelineMS` | Two `layout:"auto"` pipelines are NEVER bind-group compatible → every MSAA sky draw invalid | Software adapters force MSAA 1, so the MS pair never ran in-container |
| `drawParticles` bind group from `pParticle`'s auto layout, drawn with `pParticleAdd` | Same auto-layout rule → every additive spark draw invalid | Needs sparks on screen + someone reading errors during them |
| `drawParticles` destroyed the grown-over VBO mid-frame | "used in submit while destroyed" — pass already recorded it; frame dropped | Needs growth BETWEEN the frame's two particle calls (smoke → sparks) |

Fixes: shared explicit `createPipelineLayout` for both pairs, bloom pipelines
on `POST_HDR_FORMAT`, and a `_retiredBufs` list flushed after the frame's
submit. Guarded by `tests/unit/webgpu-lifecycle.test.mjs` ("pipelines that
share a shader module never use layout:'auto'" — functional, on the recorded
descriptors — plus source pins for the container-unreachable bloom/retire
paths). The capture rig is the primary oracle for this class: the mock
validates nothing, and faithfully reproducing Dawn's validation in a mock
would just be a second, worse Dawn.

---

## 1. Verdict

Every documented WGX gap is **implementable in core WebGPU today**. None of
them need a compute-shader rewrite, a new shading language, or a browser flag
on the devices that already run WGX (`navigator.gpu` + a successful
`WGX.create()`). The freeze was a cost call (two hand-tuned shader trees, no
build step to keep them in sync), not an API wall.

The gaps fall into three kinds:

| Kind | Examples | What it actually is |
|---|---|---|
| **API missing in WGX** | (was: `gpuTimer`, arrays, `lampShadowBegin`, instancing, `drawParticles`) | Those names are real on WGX now. FrameU `params9` carries `uAmbContactDark` / `uLampWallSpill` / `uWindowSunFlash` / `uSkyRimGlow`; SkyU `p5.x` is `uCloudDef`, `p5.y` lightning. Sky overcast grey-shift, twilight horizon bank, and azimuthal gradient are ported. Remaining honest gap: TAA (still off). |
| **Reduced shader** | (was: PCSS 3×3, screen-radial god-ray, lamp-fog `× 0.6`, env LOD 0, no `applyMaterial*`) | Poisson-8 PCSS, world-space god-ray + screen shaft, `params8.x` lamp-fog, roughness env LOD, `applyMaterial*`, lacquer ENV absorb, car SSR, bilateral AO, MAT aniso are in. |
| **Plumbing constraint** | MSAA is 4 or 1, never 2 | WebGPU permits `sampleCount` 1 or 4 and nothing else. Desktop GLX now picks 4× to match. Color resolve is first-class (`resolveTarget`). Depth resolve is **not** in core; WGX does a manual MS-depth `textureLoad` so SSAO can sample. |

`WGX.create()` requests `"timestamp-query"` when the adapter exposes it
(`requiredFeatures`). Everything else in the §3 inventory is core.

---

## 2. What WGX already does

Do not re-port these. They are the Phase 2–4b ceiling:

- Adapter / device / swapchain, `Z01` GL→WebGPU clip remap, device-lost → GLX fallback
- LIT into `rgba16float` + `depth24plus`; FRAME UBO + 32-light storage buffer
- Sun + car shadow maps, comparison-sampler PCF, 512² `r16float` blocker map
- Sky, chunked cull, env-probe cube (LOD 0), road-only SSR pass
- Post: SSAO + separable denoise, world-space god-ray + lamp vol + separable blur, bloom mip chain, ACES composite, FXAA
- Composite image FX: chromatic aberration, sharpen, speed blur, grain, flare
- FX into the open lit pass: blob shadow, skid, glow, decal
- Boot self-test + pixel readback; any proven failure returns `null` → GLX

The install rule is load-bearing and must stay: every GLX name the game may
call through `gfx` must appear on the WGX return object
(`js/render/webgpu/wgx.js`) — as a real function when implemented, or as
explicit `undefined` when still absent. Omitting a name keeps GLX's own
function, which closes over a null `gl` and throws mid-frame. The 2026-08
parity names (`gpuTimer`, texture arrays, lamp shadows, instancing,
`drawParticles`, …) are real functions and remain listed for that reason.
Gated by `tests/unit/backend-surface-parity.test.mjs`. Overview:
[RENDERERS.md](../RENDERERS.md).

---

## 3. Gap inventory (verified against current source)

`docs/ARCHITECTURE.md` lists four reduced items plus baked arrays. The live
surface is larger — several GLX features landed after the first WGX cut.

| Gap | GLX today | WGX today | Kind | WebGPU primitive |
|---|---|---|---|---|
| **MSAA** | 4× on RGBA16F + `blitFramebuffer` resolve (`js/render/glx/post.js`; 2 then 0 if the format cannot) | `msaa() → 4` (1 on lite); color `resolveTarget` + manual MS-depth resolve. WebGPU sampleCount is 1 or 4 only — never 2 | Plumbing | Color: `resolveTarget`. Depth: `textureLoad` of `texture_depth_multisampled_2d` |
| **PCSS quality** | 8-tap Poisson + dither; 4-tap far LOD; `uPcss` gate (`js/render/shaders/lit.js`) | Poisson-8 + far 4-tap; `pcss()` `true` | Shader | `textureSampleCompareLevel` + `blockerTex` |
| **Lamp-fog** | Tunable `uLampFog` | `F.params8.x` scales lampFog (no hard `× 0.6`) | Shader + uniform | FRAME lane |
| **Ground mist** | Lit FBM + `uGroundMist` | **Ported** in LIT | Done | — |
| **God-ray / lamp vol** | World-space march through depth + sun/lamp shadow maps; separable blur | World-space 16-step march + double separable blur | Shader + binds | Same textures WGX already owns |
| **gpuTimer** | `EXT_disjoint_timer_query_webgl2` | `gpuTimer` / `gpuMs`; `"timestamp-query"` when the adapter has it | API | `"timestamp-query"` + `timestampWrites` |
| **Baked MAT arrays** | `TEXTURE_2D_ARRAY` + mips + aniso; `matTexMix` ships 1.0 | `createTextureArray` / `setMaterialMaps` / `materialMapState` | API + shader | `texture_2d_array<f32>` + blit mip chain |
| **Env probe mips** | `generateMipmap` after the 6-face cycle; roughness LOD | Mip blit after the 6-face cycle; `textureSampleLevel(..., rough * maxLod)` | Helper | Same mip-gen blit as arrays |
| **Lamp shadows** | 512² spot map + 4-tap PCF in lit + god-ray | `lampShadowBegin/End` + 4-tap PCF | API | Clone of the existing sun depth pass |
| **Instancing** | Full family; `TrackGraph.batches()` consumer | Full family (`createInstancedBatch` … `castShadowInstanced`) | API | `drawIndexed(..., instanceCount)` + `stepMode: "instance"` |
| **Particles** | `drawParticles` | `drawParticles` + `WGSLFx.PARTICLE` | API + shader | Port `PARTICLE_*` from `js/render/shaders/fx.js` |
| **`applyMaterial*`** | 14 procedural MAT ids, triplanar | Ported (`applyMaterial` / `applyMaterialNormal`) | Shader | No new API |
| **Road markings** | `aTrk` / `vTrk` + `roadMarkings()` | Interpolated VS LUT `(s,x,hw)` in loc-3 xyz; no 4th vertex attr | Shader | Pack xyz; do not gate on interpolator `.w` |
| **Heat haze** | Composite `uHaze*` | Composite `dirtFx.yzw` + time | Shader | Composite uniform |
| **SSR car-paint** | Scene `.a` tag in composite | Scene alpha tags car-paint (`select(alpha, 0.35, …)`) | Shader | Restore the `.a` path |
| **SSAO denoise** | Separable blur | Shared 5-tap `BLUR` (H then V) | Shader | Same kernel as GLX `BLUR_FS` |
| **`createTexture` mips** | `gl.generateMipmap` | `_generateMips` blit chain | Helper | Same blit as arrays |

Honest `pcss()`: Poisson-8 is in; keep returning `true`.

---

## 4. Recipes (WebGPU API → WGX change)

### 4.1 `gpuTimer` — smallest, unblocks measuring the rest

GLX wraps the whole frame (`begin()` → `present()`) in
`EXT_disjoint_timer_query_webgl2`. WebGPU's equivalent is a **per-pass** pair
of timestamps, then a sum.

Feature-detect, then request. Do **not** fail `create()` if the bit is absent
— match GLX's `{supported:false}`:

```js
const canTimestamp = adapter.features.has("timestamp-query");
device = await adapter.requestDevice({
  requiredFeatures: canTimestamp ? ["timestamp-query"] : [],
});
```

Per pass (lit, shadow, each post pass you care about):

```js
const querySet = device.createQuerySet({ type: "timestamp", count: 2 });
const pass = encoder.beginRenderPass({
  ...desc,
  timestampWrites: {
    querySet,
    beginningOfPassWriteIndex: 0,
    endOfPassWriteIndex: 1,
  },
});
```

After `pass.end()`:

```js
encoder.resolveQuerySet(querySet, 0, 2, resolveBuf, 0);
encoder.copyBufferToBuffer(resolveBuf, 0, readBuf, 0, 16);
// after submit, when readBuf is unmapped:
await readBuf.mapAsync(GPUMapMode.READ);
const t = new BigUint64Array(readBuf.getMappedRange());
const ns = Number(t[1] - t[0]);   // implementation-defined epoch; delta is the duration
readBuf.unmap();
```

Surface: implement `gpuTimer(on?)` / `gpuMs()` instead of `undefined`. Same
shape as GLX — `{supported, on}` and last-good ms or `-1`.

**Pitfalls**

- Chrome **quantizes** timestamps to 100 µs against timing attacks
  ([What's New in WebGPU — Chrome 121](https://developer.chrome.com/blog/new-in-webgpu-121)).
  Still enough for `__apex.gpuTimer()`. The unquantized path is a developer
  flag, not something to depend on.
- `"timestamp-query-inside-passes"` / `writeTimestamp` mid-pass is a *different*,
  not-universally-shipped feature. Do not need it; begin/end of the lit + post
  passes matches GLX's whole-frame number closely enough.
- `mapAsync` is one frame late. GLX is too (`QUERY_RESULT_AVAILABLE`). Keep
  a 2–3 buffer ring so a mapped buffer is never also a copy dest.
- SwiftShader / CI: treat missing feature as `supported: false`. Do not skip
  the self-test.

Tutorial that matches this shape:
[WebGPU Fundamentals — Timing](https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html).

### 4.2 Mip-gen helper — unblocks env cube + baked arrays + `createTexture`

WebGPU has **no** `generateMipmap`. The standard replacement is a fullscreen
triangle that samples mip `n-1` into mip `n`, once per layer / cube face
([WebGPU Fundamentals — generating mipmaps](https://webgpufundamentals.org/webgpu/lessons/webgpu-compatibility-mode.html)).

Requirements on the texture:

```js
usage: GPUTextureUsage.TEXTURE_BINDING
     | GPUTextureUsage.COPY_DST
     | GPUTextureUsage.RENDER_ATTACHMENT,   // mip n is a color attachment
mipLevelCount: floor(log2(size)) + 1,
```

One cached pipeline per `(format, viewDimension)` (`2d` / `2d-array` / `cube`).
Linear sampler, clamp. Submit as its own encoder so `createTextureArray` can
run at pack-load time, not inside the frame.

Call sites once the helper exists:

1. `createTexture` — decal atlases currently have no mips
2. Env cube — after the 6-face cycle in `envFaceEnd` (GLX does `generateMipmap`
   there). Then LIT samples with `textureSampleLevel(envCube, samp, dir, rough * maxLod)`
   instead of LOD `0.0`
3. `createTextureArray` — §4.3

Anisotropy is core: `device.createSampler({ minFilter: "linear", magFilter: "linear",
mipmapFilter: "linear", maxAnisotropy: 16, addressModeU: "repeat", addressModeV: "repeat" })`.
GLX applies aniso on the MAT arrays because trilinear smears tarmac at range.

### 4.3 Baked material arrays (`createTextureArray` / `setMaterialMaps`)

GLX: `texStorage3D` + per-layer `texSubImage3D` + `generateMipmap`; layer index
**is** the MAT id; `matTexMix` ships at 1.0 (`js/render/assets.js` feature-detects
both methods; WGX leaves the pack off).

WebGPU equivalent (core, no feature bit):

```js
const tex = device.createTexture({
  size: [size, size, layers],          // depthOrArrayLayers = MAT count
  format: "rgba8unorm",
  mipLevelCount: mips,
  usage: GPUTextureUsage.TEXTURE_BINDING
       | GPUTextureUsage.COPY_DST
       | GPUTextureUsage.RENDER_ATTACHMENT,
});
for (let layer = 0; layer < layers; layer++) {
  if (!images[layer]) continue;
  device.queue.copyExternalImageToTexture(
    { source: images[layer], flipY: false },   // GLX UNPACK_FLIP_Y is false here
    { texture: tex, origin: [0, 0, layer] },
    [size, size],
  );
}
generateMips(device, tex);   // §4.2, viewDimension: "2d-array"
```

WGSL (LIT group 0 — pick free bindings; today 0–7 are taken):

```wgsl
@group(0) @binding(8) var matAlbedo : texture_2d_array<f32>;
@group(0) @binding(9) var matNormal : texture_2d_array<f32>;
@group(0) @binding(10) var matSamp  : sampler;
// then, matching applyMaterialTexNormal in js/render/shaders/lit.js:
let albedo = textureSample(matAlbedo, matSamp, uv, i32(matId));
```

Also export `setMaterialMaps` / `materialMapState` (or the pack stays
undetected). `assets.js` already probes `typeof gfx.createTextureArray === "function"`.

**Pitfall:** a missing layer must stay a well-defined zero, not a validation
error. GLX relies on `texStorage3D` allocating every layer. Create the full
array up front the same way; skip `copyExternalImageToTexture` on empty slots
and keep `matTexScales[i] === 0` so the shader short-circuits.

### 4.4 PCSS quality — shader only

No new resource. WGX already:

- binds `shadowTex` + `sampler_comparison` and uses `textureSampleCompareLevel`
- downsamples the sun map to `blockerTex` (`r16float`) and runs `findBlocker`

GLX's remaining quality is in `sampleShadow` (`js/render/shaders/lit.js`):
rotated Poisson 8-tap in the near field, 4-tap when
`aDist ≥ 0.80 * shadowRange`, `uPcss` early-out when the blocker FBO is dead.

Port that kernel. Keep the existing remapped `params4.x` penumbra lane (WGX
scales the GLX knob — do not silently change the number without a driven lap).

**Do not** bind the depth texture as both `texture_depth_2d` + a non-comparison
`sampler` in the same pipeline. Compat-mode / GLES validation rejects that
([gpuweb compatibility-mode notes](https://github.com/gpuweb/gpuweb/blob/main/proposals/compatibility-mode.md)).
The separate `r16float` blocker is the correct WebGPU spelling of GLX's
sampler-object trick (one depth texture, two sampler objects).

### 4.5 Lamp-fog + world-space god-ray

**Lamp-fog** is a one-lane fix: LIT already accumulates `lampFog` and then
multiplies by `0.6`. Feed `frame.lampFog` (GLX `uLampFog`) through FRAME and
delete the constant.

**God-ray** is the real visual hole on night tracks. GLX's `GODRAY_FS`
(`js/render/glx/post.js`) marches in **world space** through scene depth + the
sun shadow map, then adds the 12 nearest lamps (HG phase, optional lamp-shadow
map) and a separable blur. WGX's `WGSLPost.GODRAY` is the cheap COMPOSITE
sun-shaft: 8 taps toward `sunUV` in screen space, no depth, no shadow, no lamps.

Port path (no new API):

1. Bind to the god-ray pass: `depthSampleView` (already allocated for SSAO),
   `shadowTex` + comparison sampler (already on the lit group), FRAME / light
   storage (already uploaded), optional lamp-shadow view once §4.6 exists.
2. Rewrite `fs_main` against the GLX march, not the radial stub. Keep the
   CPU gate (`haveGR`) and also fire when `opts.lampVol > 0` on a night track
   — that gate is in; Singapore/Vegas floodlight fog no longer needs a sun
   shaft. God-ray now sorts nearest-N lamps and remaps `lampShadowIdx`.
3. Reuse the existing separable blur pipeline (SSAO already wants this) on
   `godrayTex` before composite.

This is the largest shader port in the list after `applyMaterial*`. Do it
after the timer so a night-track frame-time delta is visible.

### 4.6 Lamp shadows

Clone the sun depth pass at 512²:

- `lampShadowBegin(lightVP)` / `castShadow*` / `lampShadowEnd` — same
  depth-only pipeline, different target + VP
- Bind as `texture_depth_2d` + the existing `sampler_comparison`
- 4-tap PCF in LIT on the indexed floodlight (GLX `js/render/shaders/lit.js`)
- Feed the same view to the world-space god-ray once that lands

Replace the `undefined` exports. `lampShadowState()` already returns
`{enabled:false}` — flip it when the map exists, matching
`carShadowState()`.

Desktop-only in GLX (mobile standard tier skips the FBO). Keep that gate;
mobile `castShadow` no-ops must stay no-ops.

### 4.7 MSAA — the one real API mismatch

GLX: MSAA renderbuffers → `blitFramebuffer` to the sampleable scene + depth
textures → post.

WebGPU color path is the same idea and is **core**
([MDN `beginRenderPass` / `resolveTarget`](https://developer.mozilla.org/en-US/docs/Web/API/GPUCommandEncoder/beginRenderPass)):

```js
const sceneMS = device.createTexture({
  size: [w, h],
  format: "rgba16float",
  sampleCount: 4,                       // 1 or 4 are the ONLY legal values — see below
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
// lit pass:
colorAttachments: [{
  view: sceneMS.createView(),
  resolveTarget: sceneTex.createView(), // existing single-sample HDR
  loadOp: "clear",
  storeOp: "discard",                   // transient; tilers skip the MSAA store
}]
```

**Constraint:** every attachment in one pass must share `sampleCount`. You
cannot attach today's single-sample `depthTex` to an MSAA color pass. And
`depthStencilAttachment` has **no** `resolveTarget`
([gpuweb#1924](https://github.com/gpuweb/gpuweb/issues/1924); PlayCanvas
solved this with a manual resolver).

WGX needs the resolved depth for SSAO (and for a world-space god-ray). Recipe:

1. Allocate `depthMS` at `sampleCount: 4`, format `depth24plus`, usage
   `RENDER_ATTACHMENT | TEXTURE_BINDING`.
2. Lit pass uses `depthMS` as the depth attachment (`storeOp: "store"` this
   time — we will read it).
3. After the pass, a fullscreen resolve into a single-sample `r32float` (or
   `@builtin(frag_depth)` into `depthTex`):

```wgsl
@group(0) @binding(0) var depthMS : texture_depth_multisampled_2d;
@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) f32 {
  let c = vec2<i32>(pos.xy);
  var d = 1.0;
  for (var i = 0; i < 4; i++) {
    d = min(d, textureLoad(depthMS, c, i));   // closest surface, matches GL blit
  }
  return d;
}
```

4. Point SSAO at that resolved depth. If it stays `r32float`, change the SSAO
   binding from `texture_depth_2d` to `texture_2d<f32>` and read `.r`. That
   is cheaper than fighting depth-as-color view rules.

5. `msaa()` returns `4` when the MS targets exist, `1` on mobile / alloc fail
   — the same *policy* as GLX, not the same number.

**`sampleCount` is 1 or 4 and nothing else** — the spec says so and Dawn
enforces it. This section originally read "match GLX's 2× cap, stay at 2×
unless a driven A/B says 4× is free", WGX implemented exactly that, and every
real device answered `Multisample count (2) is not supported` once per MS
pipeline, then cascaded into Invalid RenderPipeline / Invalid BindGroupLayout
off the first failure. There is no A/B to run: 2× is not a tuning choice on
this API, and the GLX cap does not transfer. A mock device will happily accept
2 forever (see §0).

### 4.8 Instancing

WebGPU instancing is the default path, not an extension:

```js
// vertex buffer 0: mesh (stepMode: "vertex", existing VERTEX_LAYOUT)
// vertex buffer 1: per-instance { mat4, color }
{ arrayStride: 80, stepMode: "instance", attributes: [ /* mat cols + color */ ] }

pass.setVertexBuffer(1, instanceBuf);
pass.drawIndexed(indexCount, visibleCount, 0, 0, 0);
```

Implement the whole family (`createInstancedBatch`, `cullInstances`,
`drawInstanced`, `freeInstancedBatch`, `castShadowInstanced`) or leave them
all `undefined`. `TrackGraph.batches()` already produces the CPU-side data;
GLX is the only consumer. This is a memory/CPU win (see
[SCENE-GRAPH-PLAN.md](SCENE-GRAPH-PLAN.md)), not a fragment-shader win — do
not expect it to move SwiftShader frame time.

Shadow pass: same instance buffer, position-only mesh layout (already
`SHADOW_VERTEX_LAYOUT`).

### 4.9 Particles, `applyMaterial*`, `trk`, heat haze, car-paint SSR

No API research left:

- **Particles** — port `PARTICLE_VS/FS`, implement `drawParticles`. Additive
  blend already exists on glow.
- **`applyMaterial*`** — copy the 14-id tree from `js/render/shaders/lit.js`
  into `wgsl-chunks.js`. Same triplanar convention; no UVs on the lit mesh.
- **`trk` / road markings** — `rgba32float` texture `@group(2)` +
  `textureLoad` at `vertex_index`. A 4th vertex attribute (and packed
  `pos.w`) was dropped on the road VBO; vertex-stage storage failed
  validation. The ribbon had been shading FLAT with paint gated off.
- **Heat haze / car-paint SSR** — composite / SSR-consume ports from
  `js/render/shaders/post.js`.

---

## 5. Standing WebGPU hazards (already paid for once)

These are not gaps; they are the reasons a "just translate the GLSL" pass
regresses.

| Hazard | What WGX already does | Do not undo |
|---|---|---|
| Clip-space z | GL NDC z ∈ [-1,1]; WebGPU ∈ [0,1]. `Z01` left-multiplies viewProj and lightVP; `Z01INV` rebuilds SSAO invProj | Applying `Z01` to `invViewProj` (sky rays) half-clips the sky |
| No loose uniforms | FRAME UBO + light storage + 256-byte dynamic draw slots | Adding a `uniform` outside a struct / bind group |
| Comparison vs raw depth | Comparison sampler on `texture_depth_2d`; raw reads from `r16float` blocker | Sampling `texture_depth_2d` with a filter sampler |
| Async pipeline errors | `createRenderPipeline` returns a live-looking object; draws drop on the floor. Boot self-test + error scope | Shipping a new pass without extending `_selfTest` |
| Descriptor-copy install | Missing names inherit dead GLX fns | Adding a GLX method without an explicit WGX value |
| Y flip | `copyExternalImageToTexture({flipY})` is per-call, not a pack state | Assuming GL `UNPACK_FLIP_Y` semantics globally |
| Depth compare | WebGPU NDC z already [0,1] after `Z01`; shadow `refD` is not remapped again | A leftover `* 0.5 + 0.5` on shadow z |

### 5a. Two WGSL rules the language enforces and a mock device cannot

Moved from AGENTS.md 2026-09-01; the one-line rule stays there.

1. **`sampleCount` is 1 or 4 ONLY.** MSAA 2 is illegal in WebGPU;
   `createRenderPipeline` / `createTexture` reject it on a real device and the
   mock device accepted it for weeks (see §4.7 for the resolve recipe).
2. **`dpdx` / `dpdy` / `fwidth` may appear ONLY where control flow is
   uniform.** In practice: take the derivatives in the first statements of
   `fs_main` and pass them down as parameters, because a callee that returns
   early non-uniformly poisons its caller too — the SAA peel hoists its
   object-space derivatives for exactly this reason (a `dpdx` after a
   non-uniform `matId` branch is a compile error). The SEVERITY is the trap:
   WebKit's `UniformityAnalysis.cpp` errors by default and its enforced set
   includes the implicit-derivative samplers (`textureSample`,
   `textureSampleBias`, `textureSampleCompare`) — Dawn only WARNS, on the
   console, and builds the pipeline anyway. So a module that is clean on
   every Chromium run can refuse on an iPhone with nothing but a GLX
   fallback to show for it. Since 2026-09-03 the live `wgx-validate` run
   prepends `diagnostic(error, derivative_uniformity);` to every module it
   compiles (WebKit's default; `--lax-uniformity` restores Dawn's) and the
   tree passes — keep it that way.
3. **On three/TSL the texture ACCESS MODE is compiled in from the texture
   bound at build time** (found 2026-09-03, `artifacts/wgsl-dump-iphone`).
   r185 `WGSLNodeBuilder.isUnfilterable()` is true for a Nearest/Nearest
   texture — the DataTexture default — and an unfilterable texture is emitted
   as `textureLoad(tex, clamp(floor(uv * dims)), layer, 0)` with the wrap mode
   baked into a `tsl_coord_<wrapS>_<wrapT>` helper. Swapping `.value` later
   changes nothing in the program. TLX compiled its lit graph against 1×1
   placeholder `DataArrayTexture`s and the real pack (Linear/Repeat) arrived
   later, so every baked fragment more than a tile from the origin read the
   layer's edge texel on the WebGPU path: flat asphalt, grass and walls. The
   WebGL backend emits `texture()` regardless of filter, which hid it on
   three-WebGL2. Rule: a placeholder must carry the sampling state of the
   texture that will replace it (`tests/unit/gfx-backend-canary.test.mjs`
   pins TLX's).

4. **`device.onuncapturederror = fn` is DEAF on iOS/Safari 26.0–26.5.**
   WebKit only wired the property form in commit 689ebe5 (bug 291775,
   2026-04-26); before it only `addEventListener("uncapturederror", fn)`
   fired. three r185 (`WebGPUBackend.js` L277) and both of this repo's
   backends used the property, so every "gpuErrors 0" a phone ever reported
   on the WebGPU paths was "no reader", not "no errors". Since 2026-09-03
   TLX and WGX register the listener form first and keep the property as
   the fallback. This matters because WebKit's silent failures ARRIVE on
   that channel and nowhere else — the research ranking (2026-09-03,
   `docs/RENDERERS.md` §WebKit silent draw drops): (1) the Metal PSO is
   compiled lazily at FIRST DRAW with `error:nil`; on failure WebKit skips
   `setRenderPipelineState` and still issues the draw, reporting an
   out-of-memory error "Render pipeline failed compilation likely due to
   being too complex" only since Oct 2025 — the 360 KB lit fragment is the
   candidate, the sky's small program is not; (2) the property-form
   listener above; (3) an indexed draw is silently SKIPPED when any vertex
   buffer the pipeline declares holds fewer elements than the draw needs,
   and an index ≥ that count marks the index buffer never-drawn-again;
   (4) one draw-time validation failure ends the Metal encoder and every
   later draw in the pass is a no-op, the whole command buffer dropped at
   submit; (5) WGSL→MSL miscompiles fixed only in mid-2026 — 3-row matrix
   packing (three's `normalMatrix` is `mat3x3f` in the object struct; a
   material that never touches normals, like a sky, keeps a correct
   layout). Fast-math NaN folding, float-backed `depth24plus` bias scale
   and the mip/view validation of `DataArrayTexture` are the plausible tail.

Breaking either does not throw at the call site: WGX's boot self-test fails,
the backend refuses, and the game falls back to GLX with one console warning —
which is why `node tools/wgx-validate.mjs` (real Dawn WGSL + pipeline
validation, ~5 s) runs on every `js/render/webgpu/` change.

---

## 6. Recommended order

Cost is shader/port size, not calendar. Each slice should land behind the
existing opt-in and keep GLX untouched.

| # | Slice | Why this position | Gate |
|---|---|---|---|
| 1 | `gpuTimer` + `requestDevice({requiredFeatures})` | Lets every later slice be measured | `webgpu-lifecycle` + `__apex.gpuTimer()` on a WebGPU page |
| 2 | Shared `generateMips` + env-cube LOD + `createTexture` mips | One helper, three call sites | Env probe: roughness blur visible vs LOD 0 |
| 3 | `createTextureArray` / `setMaterialMaps` / LIT array sample | **Shipped** on WGX (API + WGSL + ownership lifecycle) | `assets.js` `supported()` true on WGX; `matTexMix` A/B; lifecycle destroy on unload |
| 4 | PCSS Poisson kernel | Shader-only; blocker already live | Night + dusk driven lap vs GLX, same `uPcssPen` |
| 5 | Lamp-fog uniform + world-space god-ray + blur | Night identity (Singapore / Vegas; Monza is `night:false`) | `lightState().numLights > 0` + visual |
| 6 | Lamp shadow pass | Feeds §5 and LIT PCF | `lampShadowState().enabled` |
| 7 | MSAA 2× + manual depth resolve | Most plumbing; do after the timer so the cost is known | `msaa() === 2`; SSAO still samples resolved depth |
| 8 | Instancing family | Memory, not look; GLX already has the consumer | `TrackGraph.batches()` draws on WGX |
| 9 | Particles / `applyMaterial*` / `trk` / haze / car SSR | Remaining look deltas | Per-feature `__apex` + a rendered lap |

Do **not** flip `apex26.gfxBackend` default. Do **not** delete GLX.

**SwiftShader WebGPU — measured 2026-08-17** (Chrome 148 / Playwright Chromium
with `--use-angle=swiftshader --enable-unsafe-webgpu`):

| Check | Result |
|---|---|
| `navigator.gpu` + adapter | yes (`google` / often-empty `adapter.info`) |
| Boot blockers fixed this pass | illegal `sampleCount:2` → 1\|4; `rg11b10ufloat` post → `rgba16float`; geometry via `queue.writeBuffer` (not `mappedAtCreation`); MCP `--enable-unsafe-webgpu` |
| LIT `dpdx` CF | hoisted; lifecycle unit test guards |
| `create()` on software | **boots** WGX (MSAA 1 + 2D soft-present). No longer falls back to GLX. `apex26.gfxWgxAllowSoftware` is a legacy no-op. |
| With allow-software | binds (`GLX.backend=webgpu`), `present()` runs, `gpuErrors=0` — shader work EXECUTES (§0 correction / §1a). **Software compositor (2026-08-17, cache 1342+):** final pass → `COPY_SRC` soft-present texture (never `getCurrentTexture()`) → ephemeral readback → 2D blit on `#game`. Visible gate: `gfx-probe.mjs` / `awaitSoftPresent()`; readback: `wgx-capture.mjs` → `frame.png`. Gallery: `node tools/wgx-gallery.mjs --lite`. |

Do **not** add extra Dawn/Vulkan pins to `playwright.config.js` (they break
headless boot). Do **not** probe WebGPU on a `data:` page. The chrome-devtools
MCP wrapper must pass `--enable-unsafe-webgpu` (same as Playwright); without
it `requestAdapter()` is null → `gfxWgxFail=no adapter`.

CI: `tests/unit/webgpu-lifecycle.test.mjs` and
`tests/unit/backend-surface-parity.test.mjs` stay the no-browser gates. A
slice that adds a method must declare it (real or `undefined`) before
`test:tooling-fast` will pass. Reconfigure the WebGPU canvas context on every
`canvas.width/height` change (swapchain invalidate).

---

## 7. What this does not recommend

- **A GLSL→WGSL compiler / build step.** The no-build bet is load-bearing
  (`js/` is the ship artefact). Chunk discipline (already true on both sides)
  is the sync mechanism; a transform would be a third source of truth.
- **Investing in WGX *and* TLX to parity.** Pick one opt-in to spend look
  hours on. TLX already inherits three's WebGPU/WebGL2 fallback and the baked
  arrays; WGX is the native path. This doc is only about WGX.
- **Compute-shader volumetrics / ReSTIR / etc.** GLX's march is the look we
  are matching. A better algorithm is a different project.
- **Using WebGPU to make CI faster.** The suite already gets a SwiftShader
  WebGPU adapter under the existing Playwright flags (see §6 table). That
  does not make frames cheaper: even a green LIT compile is still a CPU
  rasteriser. See [CI-RENDERING-PERFORMANCE.md](CI-RENDERING-PERFORMANCE.md).

---

## Sources

### This repo (read for this note)

- `js/render/webgpu/wgx.js` — backend, `requestDevice({requiredFeatures})`, MSAA 1\|4
- `js/render/webgpu/wgsl-chunks.js` — LIT Poisson-8 PCSS, `params8.x` lamp-fog, env LOD
- `js/render/webgpu/wgsl-post.js` — world-space god-ray, SSAO denoise, composite FX
- `js/render/gfx.js` — seam contract; WGX is deferred opt-in (not the default)
- `js/render/glx.js` / `js/render/glx/post.js` / `js/render/glx/shadow.js` —
  MSAA blit, timer, arrays, lamp shadows, instancing
- `js/render/shaders/lit.js` / `post.js` / `fx.js` — the GLSL to match
- `docs/ARCHITECTURE.md` — live caveat list
- `tests/unit/backend-surface-parity.test.mjs` — absence-vs-`undefined` rule

### WebGPU (2026-08)

- [GPUWeb implementation status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
  (wiki edited 2026-08-13) — Safari 26 / Chrome 113+ / Firefox 141+ Windows
- [MDN `GPUCommandEncoder.beginRenderPass`](https://developer.mozilla.org/en-US/docs/Web/API/GPUCommandEncoder/beginRenderPass)
  — `resolveTarget` is color-only; `timestampWrites` needs `"timestamp-query"`
- [WebGPU spec — `GPUFeatureName`](https://www.w3.org/TR/webgpu/#gpufeaturename)
  — `"timestamp-query"` is the timer bit; texture arrays and MSAA color
  resolve are core
- [WGSL `textureSampleCompare` / `textureLoad`](https://www.w3.org/TR/WGSL/#texturesamplecompare)
  — comparison sampling vs raw `textureLoad` on `texture_depth_multisampled_2d`
- [What's New in WebGPU (Chrome 121)](https://developer.chrome.com/blog/new-in-webgpu-121)
  — pass `timestampWrites`; 100 µs quantization
- [WebGPU Fundamentals — timing](https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html)
- [WebGPU Fundamentals — mipmap generation](https://webgpufundamentals.org/webgpu/lessons/webgpu-compatibility-mode.html)
- [gpuweb#1924 — reading MSAA depth](https://github.com/gpuweb/gpuweb/issues/1924)
- [PlayCanvas #5714 — MSAA + depth on WebGPU](https://github.com/playcanvas/engine/issues/5714)
  — allocate MS depth, resolve color via `resolveTarget`, resolve depth by hand

## Perf round (2026-08-27) — measured wins + deferred roadmap

Live per-frame WebGPU call counts (probe MCP, Monza race, ~414 draws, 23
passes, prototype-wrapped counters over 30 rAF frames):

| metric | before | after |
|---|---|---|
| setPipeline | 336 | 35 |
| setBindGroup | 970 | 351 (≈ the mandatory per-draw dynamic-offset group-1 sets) |
| setVertexBuffer | 745 | 368 |
| createBindGroup | 3.1 | 0.7 |

Landed (all Dawn-validated via wgx-validate, lifecycle suites 71/71):

- **Redundant-state elision** — `_setPipe`/`_setBG0`/`_setVB0`/`_setVB1`
  cache on the ENCODER as expandos (a new pass = a new wrapper, so the cache
  self-resets). Every state call on lit/shadow passes routes through them; a
  raw `pass.setPipeline` beside them would silently desync the cache.
- **`_litOpts` pooled** (the per-draw `Object.assign` fired on road + every
  detail mesh); `drawInstanced`'s bag clears by `undefined`-assign, not
  `delete` (dictionary-mode). `model.subarray(0,16)` view allocs skipped for
  the exact-16 mat4 case at all six sites.
- **LIT fs_main samples 30 → 2**: one dynamic-layer `textureSample` pair
  (albedo+normal) — WGSL only requires the CALL in uniform CF; layer/UV may
  be non-uniform expressions, which is GLX's `texture()` path exactly (same
  implicit LOD, aniso, quad divergence at seams). `matUvLit(16)` ≡ the old
  `roadUv`, so the road folds in.
- **paintPeelN gated** by a uniform early return on `amt` (caller passes a
  `D.mat1.w` gate); the peel's 6 svnoise now cost paint draws only, while
  `dpdx(Npeel)` stays at fs_main top level (the derivative lint's structural
  rule holds).
- **Lamp loop rejects on squared distance** before the sqrt (godray's shape);
  `applyMaterialTexNormal`'s select() no longer evaluates the unused
  dependent sample; composite `sunVis` depth fetch is an `if`, not both
  arms of a select().
- **Soft-present classification**: empty `adapter.info` no longer means
  software (Firefox/privacy UAs paid full staging readback + CPU blit on
  real GPUs); a true hidden-info software adapter degrades through the
  output-probe ladder to GLX. `soft(ware|pipe)` anchored — bare `soft`
  substring-matched "Microsoft".
- **Pipeline warmup**: the known-shipping lit variants (alpha, noAlphaWrite,
  doubleSided, three bias pairs, decal — ×MSAA counts) compile deferred
  after boot instead of as mid-race hitches. Boot-gate pipelines stay sync
  (refusal detection needs their errors).
- **Env-mip ladder cached on the texture** (was 72 createView + 36
  createBindGroup per 6-face env cycle); camera frustum planes extracted
  once per frame, not per chunked mesh (`_fcPlanesIsFrame`, invalidated by
  begin() and the shadow extracts that share the scratch).

Deferred (audited, sketched, NOT landed — each needs its own verified round):

1. ~~Per-chunk lamp masks~~ **LANDED (2026-08-27)** as the chunk-AABB lamp
   cull: DrawU grew mat3 (two f32-exact 24-bit masks, all-ones default from
   `_writeDraw`), drawChunked gives each merged run its own draw slot whose
   mask ORs the run's chunk bits, and the WGSL lamp loop mask-continues
   before the distance math. OUTPUT-PRESERVING by construction — a cleared
   bit is precisely a light whose radius cannot reach the chunk AABB, i.e.
   one the per-fragment `ld2 > rad*rad` reject would discard — so this is a
   cull, NOT the GLX perChunkLights REACH feature (per-chunk nearest sets
   from allLights, which deliberately relights the scene and ships off).
   `perChunkLights`/`roadChunkLamps` remain honest no-ops on WGX. Masks are
   recomputed per call (the global set re-ranks as the player moves);
   frames with ≤8 lights skip the machinery. A/B night captures (vegas,
   flicker+warmup pinned to 0, renderClock pinned per frame) diff BELOW the
   same-code capture noise floor with no lamp-shaped regions in the diff
   map — the capture pipeline itself is not bit-stable (edge jitter +
   dither), so the exactness claim rests on the radius-reject argument.
   Road pieces (no chunk AABBs) keep all-ones masks until the shared-vbuf
   work below gives them bounds.
2. ~~Shared road vertex buffer~~ **LANDED (2026-08-28)**. The ribbon is now
   ONE buffer whose chunks are contiguous `(first, count)` ranges;
   `_drawGeom` reads `mesh.first` off the record (not a new parameter — the
   signature is guard-pinned, and reading the record fixes all five
   chunk-drawing sites at once, including `castShadow`'s unculled loop, which
   would otherwise have stamped chunk 0 N times). The merge fires only when
   it is provably safe: contiguous (`run.first + run.count === ch.first`),
   `vertex_index` dead (`indexed || _roadLutBG` — the road binds the
   magic-12345 LUT so its WGSL reads `trkFromWorld(wpos)`, never
   `matTrkArr[vid]`; without a LUT the authored read is live and the merge
   refuses rather than trusting the argument), and — ROAD ONLY — no lamp
   mask set bound. That last gate is deliberate: a run ORs its chunks' masks,
   so merging the ribbon at night would hand a long run the UNION and turn
   cheap mask-skips back into full lamp evaluations. Indexed meshes (terrain,
   props, glass) keep merging at night exactly as before — narrowing THEIR
   union masks is a separate change with its own measurement.
   Measured live, monza noon, script-driven Playwright on the same box, same
   payload, 427/429 lit passes (`artifacts/r6-drawcount.mjs`):
   road `draw` 31.2 -> **2.67** per pass, road `setVertexBuffer` 31.2 ->
   **0.97**, ALL draws 65.44 -> **36.93** (the road fell from ~48% of the
   frame's draws to ~7%). Merged run length: median 1425 -> **22968** verts,
   max 24801 — that max is marginally above the largest N the repro tested
   (24576), a small extrapolation inside the same regime.
   Evidence, in descending strength: (a) `tools/wgx-vid-repro.mjs` 30/30 OK
   on SwiftShader-Dawn incl. `firstVertex` and whole `draw(N)` to 24576 —
   a third run agreeing with round 4's two; (b) real-Dawn `wgx-validate`
   before vs after: `ok`, 0 GPU errors, 0 WGSL parse errors, and the
   scene-coverage classifier IDENTICAL in all ten bins to 0.0 pp (road
   44.2 -> 44.2, kerb 2.8, player 3.7, tree 24.1, sky 13.5…); (c) the
   structural `vidDead` gate above. A screenshot A/B is NOT in that list and
   could not be: on this container the PINNED capture (flicker/warmup 0,
   renderClock pinned every warm frame, park+snapCam, soft-present awaited)
   diffs a tree against ITSELF at 59.5% of channels — at or above the 58.2%
   before/after delta, so the method cannot discriminate here. The vegas
   night pair (17.3%) sits near its 12.0% control floor, consistent with the
   road standing down at night. Real-GPU pixel sign-off remains unavailable
   in-container and is not claimed.
3. **Indexed road drawing**: `_expandPull` triples road vertex shading vs
   GLX's indexed ribbon; group-2 storage is already addressed by
   vertex_index. Still open, and now the biggest remaining road item.
4. **SSR at half-res**. CORRECTED 2026-08-27: the "GLX inline 12 steps" /
   "then blurs the result anyway" claims were stale comments — GLX's
   COMPOSITE_FS march is ALSO 24 steps (post.js `for (int i = 0; i < 24`)
   and WGX has no SSR blur pass. The real deltas are the dedicated
   full-res rgba16float target + separate pass; the fix is resolution
   only (march constants are canary-asserted and match GLX). The mat4
   inverse-projection per march step (only view-z needed) remains a
   separate open micro-item.
5. **Render bundles** for the static chunk sequence (needs FIXED draw-ring
   slots per chunk so the bundle survives culling changes; knob-gated, keep
   the culled path for WGX_LITE/software).
6. ~~Submit consolidation~~ **LANDED (2026-08-27)**: the frame's shadow
   passes (sun/car/lamp) record into ONE deferred encoder submitted ahead
   of the main encoder in the same queue.submit (`_frameSubmitList`), so
   queue order still executes shadow-before-lit and the soft-present
   fencing stays behind the last submit. The shared caster ring became
   per-pass REGIONS (slots count across Begins, `_flushShadowModelUBO`
   uploads from the `_shadowFlushed` watermark, reset at the frame submit;
   spill guard submits early if a capture path skips present). Measured
   live: 1.8 → 1.33 submits/frame (remainder = env probe + its mips).
7. **Static post-UBO writes** (bloom chain ~10 small writeBuffers/frame
   carrying resize/knob-only values) — still open; deliberately deferred:
   the win is noise next to the landed items and the stale-knob wiring
   risk is real.
8. **Shared road vertex buffer / indexed road — UNBLOCKED by measurement
   (2026-08-27), implementation scheduled for its own round.** The block
   rested on a 2026-08-17 "vertex_index stays 0 on large non-indexed
   draws (and drawIndexed)" finding whose origin commit is beyond the
   shallow-clone graft. `tools/wgx-vid-repro.mjs` (committed as the
   re-runnable primary evidence) now measures the actual matrix: draw
   shapes {draw(N) whole, 4095-piece control, draw(n,1,firstVertex) over
   one shared vbuf, drawIndexed(N) identity} × N ∈ {4092, 4095, 4098,
   8190, 12285, 24576} × {storage-read arr[vid], builtin vid→color},
   probe triangles read back via flat provoking-vertex color, ribbon-
   exact vertex layout (stride 36, 3×float32x3) held constant. Verdict on
   this container's SwiftShader-Dawn (Chromium 1194 build): **every cell
   OK, stable across two full runs** — vertex_index is correct for all
   four shapes, including the two "blocked" ones. Caveats recorded
   honestly: (a) the Lavapipe leg falls back to SwiftShader in this
   container even headed-under-Xvfb (the tool flags the fallback and the
   leg does not count) — a second Vulkan stack and real hardware remain
   unverified, which is what the committed tool is for; (b) the historical
   symptom may have been version-specific Dawn behavior since fixed, or
   entangled with the SEPARATE 4th-attribute bug (wgx.js:163-165) —
   the repro deliberately does not test that one.
   Two supporting findings from the same investigation: the per-piece
   authored `matTrkArr[vid]` storage read is EFFECTIVELY DEAD in the
   shipping config (`_bindLitVerts` binds the global world LUT for every
   lit draw once a track builds — wgx.js `void authored`; the VS vid read
   executes only pre-LUT/menu frames), and road markings come from
   `trkFromWorld(wpos)` in the fragment shader. Next-round scope —
   SETTLED 2026-08-28: the shared road vbuf + firstVertex runs landed
   (item 2 above), and both shadow-cast piece loops went with it
   (`castShadowChunked` took the same contiguity term; plain `castShadow`'s
   unculled chunk loop is covered by `_drawGeom` reading `mesh.first`). Road
   chunk AABBs for the lamp-mask cull turned out to be ALREADY DONE before
   the round: the road's cull exemption had been deleted, so `_chunkLampMask`
   already covered it, and the other lineage's `js/render/lamp-chunks.js`
   bake supersedes it per-chunk whenever `perChunkLights > 0`. Dash/marking
   verification by live capture is the one piece that did NOT land — see
   item 2 on the capture pipeline's noise floor; the Dawn coverage classifier
   stood in for it.
9. `trkFromWorld` gating — LANDED 2026-09-01 as `trkFromWorldIf(wpos,
   isRoadDraw || buryRibbon)`. The earlier note kept it unconditional because
   the LUT result also fed `classified`/`vMatId`, so a matId-0 prop or car
   fragment standing over the ribbon classified as asphalt (MAT 16). That was
   what the code did, not a design: GLX has no world LUT and shades such a
   fragment with its draw's own surfaceId, so the gate is the parity fix as
   well as the perf one (the 2026-09-01 frame audit ranked the unconditional
   search the largest WGX-only fragment cost: 16 storage loads + ~200 scalar
   ops per lit pixel of every prop, car, terrain and building). Real-GPU
   sign-off: `gpu-census.yml` run 19 (2026-09-02, macos-latest, Metal) —
   the FIRST census to run WGX itself (its "webgpu" leg was three.js): WGX
   bound, gpuErrors 0, meanLuma 76.4 (GLX 67.9, three/WebGPU 35.9 on the
   same Montreal frame), and soft-presenting, because WGX classifies a
   HeadlessChrome UA as software by design; the Verdict's swapchain clause
   is therefore headed-only, and a headless census proves bind + render.
