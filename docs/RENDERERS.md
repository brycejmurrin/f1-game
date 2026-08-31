# Apex 26 — three-renderer architecture

How GLX, WGX, and TLX share one draw-API seam. Module contracts and API
signatures live in [ARCHITECTURE.md](ARCHITECTURE.md); WGX gap recipes in
[research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md). This page is the
boot / pipeline / parity map.

## Mental model

```
apex26.gfxBackend (localStorage)
        │
        ▼
   game.js async boot
        │
   ┌────┼──────────────────────────────┐
   │    │                              │
webgl2  three                    webgpu (+ navigator.gpu)
 /fail  │                              │
 /skip  ▼                              ▼
   loadBackendScripts            loadBackendScripts
   DEFERRED.three                DEFERRED.webgpu
        │                              │
        ▼                              ▼
   Gfx.create → TLX.create      Gfx.create → WGX.create
        │                              │
        ├── ok ──► descriptor-copy onto GLX identity ──┐
        └── null ──────────────────────────────────────┤
                                                       ▼
                                              GLX.init(canvas)
                                                       │
                                                       ▼
                                              Assets.init(gfx)
                                                       │
                                                       ▼
                                   shadowBegin → … → present via gfx
```

**One contract, three implementers.** Game code talks to `gfx` (bound to
`GLX` after a successful opt-in descriptor-copy). Backends must match the
seam documented in `js/render/gfx.js`: lifecycle, mesh/texture resources,
shadow/env/begin/draw/present. Feature-detected APIs may be `undefined`
when a backend honestly lacks them — never omit the name (descriptor-copy
would keep GLX’s dead closure).

## Who does what

| Backend | Role | Entry | Shaders |
|---|---|---|---|
| **GLX** | Default always-tagged WebGL2 | `js/render/glx.js` + `glx/{shadow,post,chunked}.js` | GLSL strings in `js/render/shaders/` |
| **WGX** | Opt-in WebGPU, hand-ported WGSL | `js/render/webgpu/wgx.js` | `js/render/webgpu/wgsl-{chunks,post,fx}.js` |
| **TLX** | Opt-in Three `WebGPURenderer` (+ `forceWebGL` on mobile/WebKit) | `js/render/three/tlx.js` | TSL factories on `TLXShaders`; vendor `vendor/three-0.185.1/` |

**Shared always-on:** `js/render/gfx.js` (`create` only), `js/render/gltf.js`,
`js/render/assets.js` (MAT `TEXTURE_2D_ARRAY`). Deferred lists live in
`tools/manifest.cjs` / `BACKEND_FILES` in `js/game.js`; no `<script>` tags for
WGX/TLX.

## Frame pipeline (all three)

1. `shadowBegin` → cast* → `shadowEnd` (optional car/lamp on desktop)
2. Optional env-probe faces
3. `begin(frame)` → `drawSky` → lit/chunked/instanced/FX draws
4. `present(opts)` — SSAO → godrays → bloom → composite (ACES) → FXAA

GLX owns the reference pass order in `GLXPost` / `GLXShadow`. WGX mirrors
formats and mobile cost caps. TLX uses a draw-list of pooled Three meshes +
TSL post chain; stamps `renderOrder` for FX/glass.

## Boot / safety

| Key | Role |
|---|---|
| `apex26.gfxBackend` | Pick: `webgl2` / `three` / `webgpu` (cycled in `js/game/gfx-quality.js`) |
| `apex26.gfxBackendProbe` | Canary armed around claim / first world `present()` |
| `apex26.gfxClaimFail` (session) | Skip opt-in after canvas claim-and-die |
| `apex26.gfxBound` (session) | Live fallback label while the pick stays |
| `apex26.gfxWgxLevel` / `gfxWgxLite` / `gfxWgxOk` / `gfxWgxFail` | WGX quality ladder / refuse reason |
| `apex26.gfxTlxFail`, `apex26.tlxForceGL` | TLX fail / THREE PATH (`1`=WebGL2, `0`=WebGPU, unset=AUTO) |
| `apex26.wgxCapture` | SCREENSHOTS: `1`=2D blit, `0`=native swapchain, unset=AUTO (session overrides local) |
| `apex26.tlxForceBatches`, `apex26.tlxForceHw` | DEBUG: run the code a real GPU runs, on a software adapter. `tlxForceHw` is a comma list — `sky\|env\|chunked\|batches\|shadow`, or `1`/`all`. Every software skip in TLX is a BUDGET guard, so an unforced CI run never executes the player's path; `env` is how the black-frame Dawn defect was found. Presentation stays soft. Set them with `gfx-probe --ls key=value` |

Canary + session claim-fail recover from claim-and-die / jetsam by falling
back to WebGL2 without always wiping the user’s pick. WGX climbs
`gfxWgxLevel` (full → lite → minimal → session skip). Phones are not
hard-refused; tiers read `GLX.isMobile` / `mobileTier` for caps.

## Screenshots — why WebGPU can look black

Play with this in **SETTINGS ▸ DISPLAY**. The controls are injected next to
RENDERER so the body-node ratchet stays put.

| Control | What it does |
|---|---|
| **RENDERER** | `WEBGL2` (default) / `THREE.JS` / `WEBGPU`. Reloads. |
| **THREE PATH** | three.js GPU: `AUTO` / `WEBGL2` / `WEBGPU` (`apex26.tlxForceGL`). Reloads only if RENDERER is THREE.JS. |
| **SCREENSHOTS** | WebGPU present: `AUTO` / `2D BLIT` / `NATIVE` (`apex26.wgxCapture`). Reloads only if RENDERER is WEBGPU. |
| **SAVE SCREENSHOT** | Waits for `awaitSoftPresent`, then downloads `#game` as a PNG. |
| Status line | Plain-language: which path is live, and whether screenshots will work. |

**The rule in one sentence.** On a software GPU (SwiftShader / Lavapipe) the
native WebGPU swapchain never composites — a screenshot of that canvas is
black — and calling `getCurrentTexture()` once breaks `mapAsync` for the
whole device.

| Backend | Visible `#game` on software | Screenshot API |
|---|---|---|
| **WEBGL2** | Native canvas. Screenshots just work. | `canvas.toDataURL` |
| **WEBGPU** | Soft-present: final pass → `COPY_SRC` texture → ephemeral readback → `putImageData` on `#game`. Forced by SCREENSHOTS: 2D BLIT or a software adapter. SCREENSHOTS: NATIVE leaves the swapchain black. | `GLX.awaitSoftPresent()` then `#game`; optional `GLX.capturePixels()` |
| **THREE.JS** | AUTO can be **WebGPU or three WebGL2**. SETTINGS shows `AUTO (WEBGPU)` / `AUTO (WEBGL2)` from the live backend. It tries WebGPU wherever `navigator.gpu` exists (phones/Safari: lite stack, same as WGX_LITE). It lands on three WebGL2 when GPU is missing, `apex26.tlxAutoGL=1` after this tab lost WebGPU, or `init()` threw before `#game` was claimed — still TLX, not game WEBGL2 (`gfxClaimFail` is what binds GLX). Software WebGPU 2D-blits the LDR target. `mappedAtCreation` uploads go through `queue.writeBuffer`. THREE PATH: WEBGL2 / WEBGPU pins one path. | Same façade: `GLX.capturePixels()` / `awaitSoftPresent()` — WebGL2 `readPixels`; WebGPU LDR readback |

Probes: `node tools/gfx-probe.mjs --backend webgpu|three <track>`.

## Parity snapshot

- **GLX:** full reference — MSAA 4× desktop (2 then 0 if the HDR format
  cannot), PCSS, car/lamp shadows, TrackGraph instancing, MAT arrays.
  SAA snapshots N after peel and before wall/MAT bump so brick/concrete
  match WGX (a post-bump `dFdx(N)` dulled every seam).
- **WGX:** near-GLX on desktop; lite/WebKit matches GLX phone cost; honest
  remaining gap = TAA scaffold off (`_TAA_ENABLED = false` — jitter without a
  history resolve is sub-pixel shimmer) plus the software-GPU road `+0.08`
  lift (GLX uses polygonOffset only). Env cube uses a dedicated 4×-aniso
  sampler (binding 14). Car-paint flake / orange-peel interpolate `objPos`.
  SSAO uses the GLX/TLX `K[0..7]` fan and skips taps at strength 0.
  `applyHdrGrade` is gated on `tone1.w`. SSR is consumed in COMPOSITE the
  same present() (not next-frame LIT). SAA hoists object-space peel in
  uniform CF and mixes that variance with geometric N by `carPaint`
  (`dpdx` after a non-uniform matId branch is illegal WGSL). GLX/TLX
  now snapshot the same pre-material N — wall bump stays out of SAA
  on all three backends. Every baked MAT layer is hoisted with
  `textureSample` (aniso 4) so brick/concrete match GLX `texture()`.
  Per-chunk lamps ship natively: the shared `LampChunks` bake
  (`js/render/lamp-chunks.js`) uploads the full baked track set +
  concatenated index table to storage bindings 15/16, one DrawU slot per
  visible chunk, absolute shadow index in `params10.x` (no slot remap);
  `gfx.hasPerChunkLights` is the capability read (GLX + WGX; absent TLX).
  `gfx.updateInstances(batch, matrices, n)` is the second capability of
  that shape (GLX only so far): it hands an existing instanced batch a
  caller-packed transform set, for a batch whose poses are new every
  frame rather than static geometry narrowed by a frustum. Its one
  consumer is `DebrisWorld.draw`, whose four per-body loops reached 98
  draws at desktop caps and cost 17 every frame of every lap from cones
  alone (PERF-FINDINGS 2h). WGX and TLX do not implement it and keep the
  per-body loop, which looks identical — so porting it is a perf task,
  never a correctness one. It MUST clear `_cullPlanes`/`_cellKeyN`:
  those snapshots describe the frustum that wrote the resident bytes and
  `cullInstances` skips its re-upload on a hit.
  Names that used
  to be absent (`gpuTimer`, texture arrays, lamp shadows, instancing,
  particles, …) are real functions on the backend object; they stay listed
  so descriptor-copy overwrites GLX’s dead closures (`backend-surface-parity`
  guard).
- **TLX:** TrackGraph instancing via `THREE.InstancedMesh`; PCSS blocker map
  on WebGPU (`textureLoad` depth) and desktop WebGL2 (R16F `TSL.depth` color);
  phones / software GL keep fixed `R = 3.0`. Software sky fallback is a
  zenith→horizon mix, not a flat lid. FS `mat` stays a smooth attribute
  (`varying()+FLAT` blanked the garage car on three r185). FLAG wave
  stays per-vertex. Probe-less frames (garage) paint the canvas, not
  the HDR scene target. MSAA still off + FXAA (three does not
  expose a resolved depth for the post chain); 8-bit post
  stays on when half-float is missing (GLX RGBA8 path), env cube 4× aniso.
  THREE PATH: WEBGPU must not call `getContext("webgl2")` on `#game` after
  `renderer.init()` — three lazy-configures the swapchain on first present,
  and a canvas is bound to one context type for life (that sniff was the
  `configure` null throw on SwiftShader). Instanced props use a geometry
  `InstancedBufferAttribute` named `color`, not `imesh.instanceColor`.
  Software adapters stay on WebGPU (soft-present + writeBuffer shim); they
  must not silently bind GLX. AUTO may then take three WebGL2 (`tlxAutoGL`)
  without writing `gfxClaimFail`. Phones and Safari AUTO try the same
  WebGPU path with a lite swapchain (`UnsignedByteType`, no MSAA 4,
  low-power).

## Related

- Module contract + GLX API sketch: [ARCHITECTURE.md](ARCHITECTURE.md)
  (section *js/render/glx.js … — renderers*)
- WGX recipes and inventory: [research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md)
- Clipping / depth: [RENDER-CLIPPING.md](RENDER-CLIPPING.md)
- Lighting uniforms: [LIGHTING-REF.md](LIGHTING-REF.md)
