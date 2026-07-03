# WebGPU migration — Phase 4 notes (post chain + foreground FX)

Scope of this pass: wire the Phase-4 post-processing chain and foreground FX into
the WebGPU backend. **Only `js/webgpu/wgx.js` was edited** (plus this doc). The
backend is still NOT loaded by `index.html` — `WGX.create()` returns `null` on any
failure and the game falls back to GLX. `node --check js/webgpu/wgx.js` passes.

Grounding references (cited inline in the code):
- Backend being extended: `js/webgpu/wgx.js` (device/context, LIT pass into
  `sceneTex` rgba16float + `depthTex`, sky pass, Phase-3 sun SHADOW pass, the
  tonemap-only `present()`, `ensureTargets()`, the `Z01` GL→WebGPU clip remap).
- Post shader contract: `js/webgpu/wgsl-post.js` (`WGSLPost`) — header +
  per-shader bind-group/uniform docs, `PASS_ORDER`, `*_UNIFORM_BYTES`.
- FX shader contract: `js/webgpu/wgsl-fx.js` (`WGSLFx`) — vertex layouts, bind
  layouts, `*_UNIFORM_BYTES`, `*_VERTEX_BYTES`, blend modes.
- Real backend semantics: `js/glx.js` `present()` (:3372), `drawShadow` (:3246),
  `drawMark` (:3264), `drawSkidBatch` (:3285), `drawGlow` (:3309),
  `drawDecal` (:2722), `createTexture` (:2703), `createTexMesh` (:2672),
  `envFaceBegin/End` (:2798/:2817). Present-`opts` field names read from
  `js/game.js` (:4694-4699).

---

## What is now wired

### 1. Post-processing chain in `present()`
`ensureTargets()` now adds `TEXTURE_BINDING` usage to `depthTex` (so SSAO can
sample it as a `texture_depth_2d`), creates a `depth-only` sample view, and calls
`_allocPostTargets()` which (destroy-before-recreate, resize-aware) allocates:

| Target        | Res       | Format         | Usage                                   |
|---------------|-----------|----------------|-----------------------------------------|
| `ssaoTex`     | half      | `rgba8unorm`   | AO, composite samples `.r`              |
| `godrayTex`   | half      | `rgba16float`  | additive shafts                         |
| `bloomLv[0..N]` | half, /2 each, ≤5, stop <4px | `rgba16float` | bloom mip chain |
| `ldrTex`      | full      | `rgba8unorm`   | COMPOSITE output (FXAA reads it)        |

Pipelines (built once in `_buildPost`, `layout:"auto"`): `pBloomDown`,
`pBloomUp` (additive `ONE,ONE`), `pSSAO`, `pGodray`, `pComposite`, `pFXAA`.
Single uniform buffers `ssaoUBO/godrayUBO/compositeUBO/fxaaUBO`; per-mip
`bloomDownUBO[]/bloomUpUBO[]` (distinct buffers so multiple draws in one submit
don't alias — `queue.writeBuffer` snapshots synchronously, but a *reused* buffer
written N times before N draws would show only the last write).

`present()` runs `WGSLPost.PASS_ORDER`:

```
SSAO (half)  → ssaoTex      reads depthSampleView                (else clear→white)
GODRAY (half)→ godrayTex    reads sceneTex (bright source)       (else clear→black)
BLOOM_DOWN   → bloomLv[i]   mip0 bright-pass(scene), i>0 plain(i-1)
BLOOM_UP     → bloomLv[i]   additive (loadOp:load) from bloomLv[i+1]
COMPOSITE    → ldrTex       scene*AO + godray, exposure, bloom, ACES, grade,
                            flare, vignette, dither, grain
FXAA         → swapchain    reads ldrTex
```

Every uniform is driven from the present `opts` (GLX field names): `exposure`,
`bloom`, `threshold`, `ssao`, `contact`, `godray`, `grade{shadow,hi,str}`,
`flareMul`, and `tune` (`= LT`: `contrast/vibrance/saturation/tint/vignette/
blackLift/whitePoint/grain/ssaoRadius/bloomSpread`). Sun screen-UV, `flareStr`,
and `sunShaft` are derived CPU-side in `_sunScreen()`, ported from GLX
`present()` (:3584-3612).

**Skipped-pass hygiene**: when SSAO/godray/bloom are disabled, their target is
cleared (`_clearTarget`: AO→white, godray/bloom→black) so COMPOSITE never samples
a stale frame — the equivalent of GLX binding `whiteTex`/`blackTex`. This lets the
composite/FXAA bind groups stay stable (rebuilt only on resize).

**Fallback**: if the post pipelines never built (`!_postReady`, `_Post` absent,
compile failure) or a target is missing, `present()` runs the Phase-2 tonemap
blit (`_tonemapBlit`) — the frame still shows lit + sky + shadow + tonemap.

### 2. Foreground FX
Built in `_buildFx` from `WGSLFx`, recorded **into the open lit pass** (so they
interleave with `draw()/drawSky()` exactly as `game.js` orders them before
`present()`), each into the rgba16float scene target with the shared depth
attachment:

- `drawShadow` / `drawMark` — unit-quad stamps, shared dynamic-offset uniform
  ring (`quadFxUBO`, 256-stride, 64 slots), alpha blend, depth-test/no-write,
  negative depthBias (GL `polygonOffset(-4,-8)`). `size=(w,l,p2,p3)`:
  BLOB `(w,l,0.25,0.45)`, MARK `(w,l,0.38,0)`.
- `drawSkidBatch` — one batched draw. game.js supplies stride-20 `pos3+uv2`; the
  SKID shader wants stride-36 `pos3+uv2+rgba`, so the incoming verts are expanded
  with `rgba=(0,0,0,1)` (black opaque = exact GL look) into a grown dynamic VBO.
- `drawGlow` — the GLX billboard build (`js/glx.js:3309`) ported verbatim
  (distance fade, colour normalisation, `_glowCorners`), emitting stride-36
  `(corner2,center3,color3,radius1)`, one **additive** (`ONE,ONE`) draw into the
  HDR scene so it blooms in the post chain.
- `drawDecal` — textured atlas quad, dynamic-offset ring (`decalUBO`, 128 slots) +
  a per-texture bind group cached on the texture handle (`tex._wgxDecalBG`).
- `createTexMesh` — interleaves `pos3+nrm3+uv2` → stride-32 vbuf + index buffer.
- `createTexture` — `copyExternalImageToTexture({flipY:true})` for ImageBitmap/
  canvas/ImageData (matches GLX `UNPACK_FLIP_Y`), `writeTexture` for raw RGBA
  bytes; returns `{texture, view}`. `freeTexture` destroys it.

All FX embed the **Z01-remapped** view-proj (`frameVPGpu`) so their clip-z matches
the scene depth buffer.

---

## Riskiest correctness assumptions (verify in a browser)

1. **SSAO inverse projection.** The depth buffer stores WebGPU-convention z (0..1)
   because the lit pass rasterises with `Z01·viewProj`. SSAO reconstructs view
   position from `(uv, depth)`, so it needs `inverse(Z01·proj)`. I compute
   `frameInvProjW = frame.invProj · Z01INV` (`_writeFrame`), where
   `Z01INV = [1,0,0,0, 0,1,0,0, 0,0,2,0, 0,0,-1,1]` inverts `z'=0.5z+0.5w`. **If AO
   looks inverted/haloed at grazing depth, this matrix compose is the first
   suspect.** `frame.proj` (raw GL) is passed for the contact march's `U.proj` —
   only its x/y are used (identical between GL/WebGPU), so it needs no remap.
2. **Uniform offsets/sizes vs `WGSLPost`/`WGSLFx` constants.** JS writers pack into
   `postScratch`/`fxScratch` (float32) and upload exactly `*_UNIFORM_BYTES/4`
   floats. Checked by hand:
   - SSAO 176 B = invProj(64)+proj(64)+sunVS(16)+p0(16)+p1(16); floats
     0-15,16-31,32-35,36-39,40-43.
   - COMPOSITE 112 B = 7×vec4; floats 0-3 p0, 4-7 sunUV, 8-11 grade, 12-15 fx,
     16-19 gradeShadow(w=str), 20-23 gradeHi, 24-27 texel.
   - GODRAY 32, BLOOM_DOWN/UP 16, FXAA 16.
   - FX: BLOB/MARK 144 (vp64+model64+size16), SKID 64, GLOW 80, DECAL 224
     (model64+vp64+6×vec4). **Any std140-vs-scratch mismatch shows as garbled
     grade/flare or a mis-scaled stamp.**
3. **Bind-group indices match the shader `@group/@binding` decls.** All post passes
   use `@group(0)`: `(0)=srcTex/depthTex/sceneTex`, sampler, uniform — and
   COMPOSITE is `(0)sceneTex (1)bloom (2)ssao (3)godray (4)samp (5)U`. FX use
   `@group(0) @binding(0)=uniform`; DECAL adds `(1)atlasTex (2)atlasSamp`.
   Verified against the wgx bind-group `entries`.
4. **Sampler filter classes.** Depth is sampled with `pointSampler`
   (non-filtering — required for `texture_depth_2d`); all colour passes use
   `linearSampler` (filtering). `rgba16float` is filterable, so `linearSampler`
   on the HDR scene/bloom is valid. If a driver rejects the auto-inferred sampler
   type for the depth binding, that pass is the place to look.
5. **Target formats / blend.** COMPOSITE target = `rgba8unorm` (`ldrTex`); FXAA
   target = `navigator.gpu.getPreferredCanvasFormat()` (swapchain). BLOOM_UP is the
   **only** additive pipeline (`ONE,ONE`) and its up passes use `loadOp:"load"` to
   accumulate; every other post pass clears. GLOW is additive, all other FX are
   `src-alpha/one-minus-src-alpha`.
6. **Bloom mip0 double-count.** Per the `WGSLPost` header contract, BLOOM_UP is
   additive into *every* larger mip including mip0, so mip0 = its own bright-pass +
   accumulated octaves (GLX instead *overwrites* the final level-0 pass). Slightly
   more energy in the sharp core; documented, matches the shader's stated contract.
7. **Sun UV y-flip.** `_sunScreen()` emits texture-space uv (`uy = 0.5 - ndcy*0.5`)
   to match `POST_VS` (y-down). GLX composites in y-up frag-coord space, so the
   flip is deliberate — if flare/shafts appear mirrored vertically, check here.
8. **FX depthBias sign.** Stamps use `depthBias:-2, slopeScale:-2` to pull the
   coplanar road decal toward the camera (WebGPU positive bias pushes away, so the
   GL `polygonOffset(-4,-8)` maps to negatives). Values are approximate; if skid
   marks z-fight the road, tune these.

---

## Stubbed / reduced (with phase tags)

- **MSAA (Phase 4/5)** — `msaa()` stays **1**. A multisampled scene colour+depth
  with resolve is straightforward for colour, but SSAO needs a *sampleable
  single-sample* depth, and core WebGPU has no depth-resolve (`resolveTarget` is
  colour-only; you'd need `texture_depth_multisampled_2d` + a manual resolve pass,
  or an MSAA colour path that disables SSAO). Left at 1 rather than balloon the
  change. **To enable:** allocate `sceneMSAA`/`depthMSAA` at `sampleCount:N`, set
  `multisample:{count:N}` on the lit + sky + FX pipelines, add `resolveTarget:
  sceneView` to the lit colour attachment, and add a depth-resolve (blit or manual
  min-depth) before SSAO — or gate SSAO off when N>1.
- **Env probe (Phase 3/4)** — `envFaceBegin/envFaceEnd` still no-op; the LIT
  env-mirror term remains deferred. **To implement:** create a cube
  `GPUTexture` (rgba16float, `RENDER_ATTACHMENT|TEXTURE_BINDING`, 6 layers) + a
  small depth, and per face record a `begin()`-equivalent lit+sky pass with the
  face camera (`lookAt` down each ±X/±Y/±Z, 90° fov) into that layer's view;
  after all 6 faces, expose the cube view + a `envProbeReady()` flag and add an
  `@group(0)` cube binding + reflection term to `WGSLChunks.LIT`. Mirror the GLX
  feedback-loop guard (don't sample the cube while rendering into it) and the
  1×1 black dummy-cube for the probe-less path.
- **COMPOSITE SSR / speed-blur / chromatic aberration (deferred in the shader)** —
  `wgsl-post.js` itself drops these blocks, so nothing here drives them. `opts.
  reflect/speedBlur/chromAb` are accepted but ignored.
- **Instancing (Phase 5)** — true instancing needs `game.js` to supply per-instance
  transforms (out of scope; `game.js` untouched). The batched skid trail (one draw)
  and per-frame glow batch already cut the draw count; props still draw per chunk.

---

## Capability getters
`hdrMode()`→true, `pcss()`→true (unchanged), `msaa()`→1 (see above). `backend`
stays `"webgpu"`.
