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
| **THREE.JS** | AUTO pins WebGL2 on phones, Safari, and software GPUs (SwiftShader/Lavapipe — three's WebGPU still dies on large `mappedAtCreation` uploads). THREE PATH: WEBGL2 is the CI pin. THREE PATH: WEBGPU + SCREENSHOTS AUTO/2D BLIT copies the LDR target onto `#game` via `readRenderTargetPixelsAsync` (`copyTextureToBuffer` + `mapAsync`; never `getCurrentTexture()`). SCREENSHOTS: NATIVE leaves the swapchain black. | Same façade: `GLX.capturePixels()` / `awaitSoftPresent()` — WebGL2 `readPixels`; WebGPU LDR readback |

Probes: `node tools/gfx-probe.mjs --backend webgpu|three <track>`.

## Parity snapshot

- **GLX:** full reference — MSAA 2× desktop, PCSS, car/lamp shadows,
  TrackGraph instancing, MAT arrays.
- **WGX:** near-GLX on desktop; lite/WebKit matches GLX phone cost; honest
  remaining gap = TAA scaffold off (`_TAA_ENABLED = false`). Names that used
  to be absent (`gpuTimer`, texture arrays, lamp shadows, instancing,
  particles, …) are real functions on the backend object; they stay listed
  so descriptor-copy overwrites GLX’s dead closures (`backend-surface-parity`
  guard).
- **TLX:** TrackGraph instancing via `THREE.InstancedMesh`; PCSS blocker map
  on the WebGPU path (`tlx-shadow.js`); MSAA still off + FXAA; heavier post
  RTs on phone; GLSL→TSL look mostly ported with residual diffs possible.
  THREE PATH: WEBGPU must not call `getContext("webgl2")` on `#game` after
  `renderer.init()` — three lazy-configures the swapchain on first present,
  and a canvas is bound to one context type for life (that sniff was the
  `configure` null throw on SwiftShader). Instanced props use a geometry
  `InstancedBufferAttribute` named `color`, not `imesh.instanceColor`.

## Related

- Module contract + GLX API sketch: [ARCHITECTURE.md](ARCHITECTURE.md)
  (section *js/render/glx.js … — renderers*)
- WGX recipes and inventory: [research/WEBGPU-PARITY.md](research/WEBGPU-PARITY.md)
- Clipping / depth: [RENDER-CLIPPING.md](RENDER-CLIPPING.md)
- Lighting uniforms: [LIGHTING-REF.md](LIGHTING-REF.md)
