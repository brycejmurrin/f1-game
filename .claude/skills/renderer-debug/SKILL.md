---
name: renderer-debug
description: "Use when any renderer looks wrong on TLX (three.js, the default), GLX (WebGL2) or WGX (WebGPU): blank/dark/black canvas or screen, missing road/world, NaN-white surfaces, lights wrong, shadow acne, bloom too strong/blown-out/missing, HDR/hdrMode or MSAA/HDR format issues, WebGL/GLX errors, GL_INVALID_OPERATION, shader compile or WGSL failures, GPU validation errors, uniform-array light bugs, instancing problems, GLX artifacts, device lost or frozen frame, silent fallback to WebGL2, transparent cars, or validating WGSL with real Dawn via wgx-validate. Washed-out night → lighting-tuner; garbled or wrong-colour PBR material on any backend → asset-pack; shimmer while driving → playwright-probe."
---

# Debug the renderer — TLX, GLX or WGX

Three backends draw the same scene: **TLX** (`js/render/three/`, three.js/TSL,
the DEFAULT), **GLX** (`js/render/glx/`, explicit WebGL2 and the universal
fallback) and **WGX** (`js/render/webgpu/`, opt-in WebGPU, DEFERRED). Most
black-canvas reports start with "which one am I on?" — and a unit test of a
backend is not evidence that it runs (`docs/ARCHITECTURE.md` §Boot evidence).

## Step 0 — which backend answered (BROWSER-ONLY: needs a live page)

```js
__apex.diag({download:false}).env.backend   // "three" | "webgl2" | "webgpu"
```

A value like `webgl2 (pick: webgpu)` means the pick failed and the fallback
bound: read `localStorage["apex26.gfxWgxFail"]` / `["apex26.gfxTlxFail"]`
and `env.backendState` (`pin`, `forceWebGL`, `gpuErrors`). Pin a backend for a
probe with `apex-eval.mjs <track> <expr> --backend three|webgl2|webgpu` (a
`GLX.*()` / `WGX.*()` expression silently answers for TLX without it).
Headless/software adapters blit onto `#game-soft` (`awaitSoftPresent()`): a
black `#game` is that overlay's gap, not yet a shader miss. A software probe
is no evidence about a player's GPU — `gpu-census.yml` on `macos-latest`, read
its Verdict step. "Black screen after an HDR format change" is decided here:
read the backend first, then go to its section; `hdrMode()` is GLX's.

| `env.backend` | Section | Reference |
|---|---|---|
| `three` | TLX, below | `.claude/rules/render-tlx.md` |
| `webgl2` | GLX, below | [references/glx.md](references/glx.md), [references/glx-failures.md](references/glx-failures.md) |
| `webgpu` | WGX, below | [references/wgx.md](references/wgx.md), [references/wgx-defects.md](references/wgx-defects.md) |

## TLX — three.js / TSL (default)

Files: `tlx.js` (backend, `backendState()`, soft-blit), `tsl-lit.js` /
`tsl-chunks.js` / `tsl-fx.js` / `tsl-sky.js` (node shaders), `tlx-post.js`,
`tlx-shadow.js`, `tlx-chunked.js`. Selected when `apex26.gfxBackend` is unset
or `three`. Three picks its own WebGL2 or WebGPU path:

- Probes and tests pin the WebGL2 path with `apex26.tlxForceGL=1` (three's
  WebGPU path dies under SwiftShader, `mappedAtCreation`); `--tlx-webgpu` only
  on purpose. `apex26.tlxForceHw=env|sky|batches|chunked|shadow` runs the
  content paths a real GPU takes on a software adapter. `backendState().pin` /
  `forceWebGL` say which path bound; a failed init records `apex26.gfxTlxFail`.
- Probe: `node tools/gfx/gfx-probe.mjs --backend three [--tlx-webgpu --lavapipe]
  <track>` — `gpuErrors` must be 0 (parent session only: it launches Chromium).
  `--tod night` for a lighting-dependent defect.
- Opaque canvas alpha is required for compositing (the transparent-cars class
  of defect). Never compare the census's two TLX legs on frames or luma
  without reading the `path:` row (soft-blit differs per leg).
- A look that differs from GLX/WGX: `docs/ARCHITECTURE.md` §Cross-backend
  parity and `node --test tests/unit/backend-surface-parity.test.mjs`
  (`gfx-backend-canary.test.mjs` pins the boot sniffs). A garbled PBR layer is
  **asset-pack**; a washed-out night is **lighting-tuner**.

## GLX — WebGL2

NOT the default: it runs only when `apex26.gfxBackend` is `"webgl2"` or
TLX/WGX failed to init. Start with the probes in
[references/glx.md](references/glx.md): `GLX.hdrMode()` (read-only capability
readout, not a toggle), `__apex.lightState()` vs the 15-float light records,
`gl.getError()` codes, mobile STANDARD-tier cast spam. Shadow acne, bloom
blow-out, the Playwright probe pattern and apex-eval one-liners:
[references/glx-failures.md](references/glx-failures.md). Unit gate:
`tests/unit/glx-output-target.test.mjs`, `tests/specs/webgl-probes.spec.js`
(browser). `GLX.*` anchors: `js/render/glx/glx.js`, `glx/post.js`,
`glx/shaders/glsl-lit.js`.

## WGX — WebGPU

Opt-in (`apex26.gfxBackend="webgpu"`). Every WGX failure must degrade to GLX,
never a dead canvas. **ALWAYS first, no browser:**
`node tools/gfx/wgx-validate.mjs --static` — the only command a subagent or
verify-agent may run; the full Dawn pass (`wgx-validate.mjs [track]`,
`--lite`, `--no-rg11b10`) and `gfx-probe.mjs --backend webgpu` launch Chromium:
parent session only. Gate every WGSL/pipeline edit with it plus
`tests/unit/webgpu-lifecycle.test.mjs`. `WGX.gpuErrors()` must be 0;
`WGX.lastFailure()` explains a refusal. Steps, the fallback trace, SwiftShader
limits and live pokes: [references/wgx.md](references/wgx.md); late-sky /
derivative_uniformity (NaN-white road) / MSAA+HDR defects and the device-loss
ladder: [references/wgx-defects.md](references/wgx-defects.md). A
textured-vs-procedural material look on WGX is **asset-pack**.

## Load on demand

- GLX probes (HDR, light state, GL errors, light upload) → [references/glx.md](references/glx.md)
- GLX shadow acne, bloom blow-out, probe pattern, one-liners → [references/glx-failures.md](references/glx-failures.md)
- WGX static/Dawn validation, error state, unit gates → [references/wgx.md](references/wgx.md)
- WGX defect classes, device-loss ladder → [references/wgx-defects.md](references/wgx-defects.md)
