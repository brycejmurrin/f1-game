# WebGPU Phase 0 + Phase 1 skeleton — build notes

Status: **implemented, additive, and since wired in (opt-in).** This document
records the `Gfx` backend seam (Phase 0) and the WebGPU device/clear/sky skeleton
(Phase 1) built per [`docs/archive/webgpu/WEBGPU-MIGRATION.md`](./WEBGPU-MIGRATION.md) and the
"shader chunk" + "document the draw-API contract" recommendations in
[`docs/archive/webgpu/WEBGPU-MAINTAINABILITY.md`](./WEBGPU-MAINTAINABILITY.md).

> **Update:** the "wiring it in" step below has since been done, and then
> superseded. `js/render/webgpu/*` is **DEFERRED**: it has **no `<script>` tag in
> `index.html`** at all. The files are listed in `tools/manifest.cjs`'s `DEFERRED`
> map and injected by `js/game.js` at boot only when `apex26.gfxBackend` selects
> the backend — ~532 KB every visitor used to parse for something almost nobody
> runs. `js/render/gfx.js` (the selector) is the only one with a tag. The whole
> stack has advanced through **Phase 4b**. The backend is still strictly **opt-in**
> (`localStorage apex26.gfxBackend = "webgpu"`) and falls back to WebGL2/GLX on
> any failure, so the default shipping path is unchanged. The text below is the
> original Phase 0/1 scaffolding record.

The scaffolding is feature-detected and inert on unsupported browsers (and when
not opted in), so it cannot affect the shipping WebGL2 game.

---

## Files added

| File | Global | Role |
|------|--------|------|
| `js/render/gfx.js` | `Gfx` | The seam. `Gfx.create(canvas, opts)` (async) feature-detects WebGPU and returns a WGX backend, or `null` so the caller falls back to GLX. Header comment documents the full ~35-method backend interface + `frame`/`opts`/`sky` shapes. |
| `js/render/webgpu/wgx.js` | `WGX` | The WebGPU backend. `WGX.create(canvas, opts)` (async) acquires adapter/device, configures the canvas context, and returns an object implementing the GLX interface. **Real:** device, context configure, DPR/resize, device-lost reload, `begin()`/`present()` clear + one real SKY pass. **Stubbed:** every heavier method (tagged with its phase). |
| `js/render/webgpu/wgsl-chunks.js` | `WGSLChunks` | Minimal shader-chunk registry: shared WGSL math leaves (`hash`, `vnoise`+`fbm`, `tonemap`, `fullscreenTri`) + the first real shader `SKY` (a reduced faithful port of GLX `SKY_FS`, `js/render/glx.js:901`), composed from the leaves. |
| `docs/archive/webgpu/WEBGPU-PHASE0-NOTES.md` | — | This document. |

All three JS files pass `node --check`.

Load order (when integrated): `wgsl-chunks.js` → `wgx.js` → `gfx.js` → … →
`game.js`. `WGSLChunks` must exist before `WGX.create` runs; `WGX` before `Gfx`.

---

## What actually works (Phase 1)

- **Feature detection & graceful fallback.** `Gfx.create` returns `null` on: no
  `navigator.gpu`, user opt-out (`localStorage apex26.gfxBackend = "webgl2"`),
  `WGX` not loaded, or any init failure. It never throws.
- **Adapter/device acquisition** (`requestAdapter` → `requestDevice`), async.
- **Context configure** with `navigator.gpu.getPreferredCanvasFormat()`
  (`bgra8unorm` on most platforms), `alphaMode:"opaque"`.
- **Resize / DPR** mirrors `GLX.resize()` (`js/render/glx.js:2585-2603`): DPR capped at
  **1.5 on the mobile tier, 2 otherwise**, times `renderScale`; `setRenderScale`
  clamps 0.5–1 with the same 0.02 hysteresis.
- **Device-lost handling**: `device.lost` → `location.reload()` (mirrors GLX's
  `webglcontextrestored` policy), ignoring intentional `destroy()`.
- **A real end-to-end pass**: `begin(frame)` acquires the swapchain texture,
  clears it to `frame.fogColor`, and draws the **SKY** fullscreen triangle
  (`WGSLChunks.SKY`) using a real uniform buffer + bind group + render pipeline.
  `present()` submits the encoder. This proves device + context + pipeline +
  WGSL shader + uniform upload work together.

The SKY shader is a **reduced but faithful** port of `SKY_FS`: gradient,
golden-hour horizon, a basic cloud layer, Mie sun corona + disc, stars, moon,
and city skyglow. It intentionally omits the overcast grey-shift, twilight
cloud-bank enrichment, and azimuthal gradient variation — those land in Phase 2
when the sky becomes the real `drawSky()` call.

### Testing the skeleton in a WebGPU-capable browser

The scaffolding isn't in `index.html`, so test it with a tiny standalone harness
(Chrome 113+ desktop, or Safari on iOS 26+). Serve the repo
(`npx serve -l 3456 .`) and open an HTML file containing:

```html
<!doctype html>
<meta charset="utf-8">
<canvas id="c" style="width:640px;height:360px"></canvas>
<script src="js/render/webgpu/wgsl-chunks.js"></script>
<script src="js/render/webgpu/wgx.js"></script>
<script src="js/render/gfx.js"></script>
<script>
(async () => {
  const canvas = document.getElementById("c");
  const gfx = await Gfx.create(canvas, {});
  if (!gfx) { document.body.append("no WebGPU — would fall back to GLX"); return; }
  gfx.resize();
  console.log("backend:", gfx.backend, gfx.width, "x", gfx.height);

  // A minimal frame: identity-ish invViewProj + a low sun => gradient + sun disc.
  function frame(t) {
    return {
      fogColor:   [0.20, 0.28, 0.42],
      skyZenith:  [0.18, 0.40, 0.78],
      skyHorizon: [0.72, 0.60, 0.42],
      sunDir:     [Math.cos(t), 0.25, Math.sin(t)],
      sunColor:   [1.0, 0.9, 0.75],
      // Leave invViewProj undefined → WGX uses identity; the sky still renders.
      cloud: 0.5, time: t, stars: 0, moon: 0,
    };
  }
  let t = 0;
  (function loop() {
    t += 0.005;
    if (gfx.begin(frame(t))) gfx.present({});
    requestAnimationFrame(loop);
  })();
})();
</script>
```

Expected: an animated gradient sky with a moving sun disc/corona and drifting
clouds. On a browser **without** WebGPU, `Gfx.create` resolves to `null` and the
page prints the fallback message (in the real game that branch runs `GLX`).

> Do **not** commit this harness as a shipped HTML file — it's a throwaway probe.
> Later, the existing `playwright-probe` screenshot harness drives both backends
> via an `apex26.gfxBackend` switch.

---

## What is stubbed, by phase

Every heavy GLX method exists on the WGX backend as a safe no-op so the object
satisfies the interface and the game boots (the frame still clears + shows sky).
Each stub is tagged in `js/render/webgpu/wgx.js` with the phase that fills it in:

| Phase | Stubs to implement | Notes |
|-------|--------------------|-------|
| **2 — Lit + Sky pass** | `createMesh`, `createTexMesh`, `createChunkedMesh`, `createTexture` (return real GPUBuffers/textures + free* destroy); `draw`, `drawChunked`, `drawSky`, `drawMark`, `drawSkidBatch`, `drawGlow`, `drawDecal` | Lit pipeline from WGSL; `FRAME` uniform buffer + light **storage** buffer (the flat stride-15 array maps verbatim); per-draw model/material via **dynamic uniform-buffer offsets**; opaque + alpha + additive pipelines (blend baked in). Render to an RGBA16F scene texture. `hdrMode()` flips to `true` here. `drawSky` takes over the sky (begin() stops auto-drawing it). |
| **3 — Shadow + env probe** | `shadowBegin`, `castShadow`, `castShadowChunked`, `shadowEnd`, `envFaceBegin`, `envFaceEnd`, `envProbeReady`, `envProbeReset` | Depth-only shadow pass + `texture_depth_2d` + `sampler_comparison` + `textureSampleCompare` (hardware PCF); PCSS-lite blocker downsample; 64² env cube, one face/frame. `pcss()` flips to `true`. |
| **4 — Post chain** | `present` (currently just submits) → bright/down/up bloom mips, SSAO+contact, god-ray march, composite (SSR + ACES tonemap + grade + flare + vignette + grain), FXAA; MSAA via pipeline `multisample` + `resolveTarget` | `msaa()` returns the real sample count. Reuse the `tonemap` chunk. |
| **5 — Instancing / perf** | Re-implement `drawChunked`, wheels, `drawSkidBatch`, `drawGlow` as instanced draws | Where the scene is draw-call bound. |

Capability getters currently report the skeleton's reality and update as phases
land: `hdrMode()→false` (Phase 2→true), `msaa()→1` (Phase 4), `pcss()→false`
(Phase 3). `isMobile`/`mobileTier` are already correct (mirrored from GLX).

---

## The backend interface contract (the seam)

The authoritative, transcribed copy lives in the header of **`js/render/gfx.js`**. In
brief, both `GLX` (`js/render/glx.js:3693-3769`) and `WGX` expose the same ~35 methods:

- **Lifecycle/capability**: `init`, `resize`, `setRenderScale`, `getRenderScale`,
  `width`/`height`/`aspect`, `hdrMode`, `msaa`, `pcss`, `isMobile`, `mobileTier`.
- **Resources**: `createMesh`, `createTexMesh`, `createChunkedMesh`,
  `createTexture`, `freeMesh`, `freeChunkedMesh`, `freeTexture`.
- **Frame**: `begin(frame)`, `drawSky(sky)`, `draw(mesh,model,opts)`,
  `drawChunked`, `drawShadow`, `drawMark`, `drawSkidBatch`, `drawGlow`,
  `drawDecal`, `present(opts)`.
- **Shadow pass**: `shadowBegin`, `castShadow`, `castShadowChunked`, `shadowEnd`.
- **Env probe**: `envFaceBegin`, `envFaceEnd`, `envProbeReady`, `envProbeReset`.

Object shapes (`frame`, `sky`, `draw` opts, `present` opts) and the required
per-frame call ordering are documented in full in the `js/render/gfx.js` header, sourced
from the real GLX call sites. WGX adds one non-GLX property, `backend:"webgpu"`,
so a future `__apex.gfxBackend()` can report the active path (harmless additive).

### Light layout (unchanged from GLX)

`frame.lights` is a flat, pre-culled (≤32) stride-15 `Float32Array`:

```
[ x, y, z,  r, g, b,  rad,  dirX, dirY, dirZ,  cosInner, cosOuter,  bleed,  volW,  glareW ]
   0  1  2   3  4  5    6     7     8     9        10        11        12     13      14
```

In Phase 2 this maps directly onto a WGSL storage buffer (`array<Light>`), 4×
`vec4` per light — the migration plan calls this a "gift" (`WEBGPU-MIGRATION.md`
§2b/§2c). The skeleton doesn't consume lights yet.

---

## Wiring it in (the later step)

**Not done here.** When WebGPU is committed, integration is one bounded change:

1. **`index.html`**: add three `<script src>` tags **before** `js/game.js`, in
   order — `js/render/webgpu/wgsl-chunks.js?v=N`, `js/render/webgpu/wgx.js?v=N`,
   `js/render/gfx.js?v=N` — and bump the cache-bust `?v=N` on every asset URL **and**
   `version.json` `{ "build": N }` to the same N (per `CLAUDE.md`).
2. **`js/game.js`**: change the synchronous boot at `js/game.js:39`
   (`if (!GLX.init(canvas)) { $("nogl").hidden = false; return; }`) to await the
   seam and keep GLX as the fallback:

   ```js
   let gfx = await Gfx.create(canvas, {});          // null if WebGPU absent/opted-out
   if (!gfx) { if (!GLX.init(canvas)) { $("nogl").hidden = false; return; } gfx = GLX; }
   // then route the ~109 later GLX.<method>() calls through `gfx` instead.
   ```

   This forces the enclosing boot IIFE to become `async` (or to gate on the
   promise). The maintainability review's safer variant keeps the **default
   WebGL2 path fully synchronous** and only awaits the opt-in WebGPU path — worth
   adopting so the common path pays no async tax. Because both backends share the
   exact method surface, the rest of `game.js` is otherwise untouched.

Until that step runs, these files are dead weight that ship nothing and change
no pixels — exactly the intent for a scaffolding commit.
