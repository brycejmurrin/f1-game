---
name: renderer-debug
description: "Use when the 3D view renders wrong: a black or blank canvas, shader or WGSL errors, shadows, bloom, device lost, a silent WebGL2 fallback, iPhone or Safari problems, or VR black frames. Not for: washed-out night → lighting-tuner; garbled textures → asset-pack; driving shimmer → playwright-probe."
---

# Debug the renderer — TLX, GLX or WGX

Three backends draw the same scene: **TLX** (`js/render/three/`, three.js/TSL,
the DEFAULT), **GLX** (`js/render/glx/`, explicit WebGL2 and the universal
fallback) and **WGX** (`js/render/webgpu/`, opt-in WebGPU, DEFERRED). Most
black-canvas reports start with "which one am I on?" — and a unit test of a
backend is not evidence that it runs (`docs/ARCHITECTURE.md` §Boot evidence).

**Bryce's path first.** He plays TLX on **WebGPU** on an iPhone (Metal) — `THREE PATH: WEBGPU`.
Probes here pin `apex26.tlxForceGL=1` (TLX's WebGL2 leg) because three's WebGPU path dies under
SwiftShader, so a container probe is NOT his path and no evidence about his GPU.

**A report from the phone — ladder, cheapest first:**
1. Ask for the on-device overlay: open the game with `?gfxdebug=1` (or set `apex26.gfxDebug="1"`)
   and paste its Copy line (`js/perf/gfx-debug-overlay.js`). Free, and it is HIS device: read
   the backend, the `three api=… pin=… soft=…` row (which TLX leg bound) and `gpuErrors`.
2. `gpu-census.yml` on `macos-latest`: a real GPU, but **Chromium/Dawn on Metal, not WebKit/Safari**
   (read its `path:` row and the Verdict step). A green census does not clear a WebKit-only failure
   (derivative uniformity, `uncapturederror`, the `var<private>` cap: the WGSL rules below).
3. A real iPhone Safari: the `browserstack` MCP (`docs/AGENT-SURFACE.md`; real iOS devices,
   outward and metered).
4. A software probe here: WGSL/pipeline validation only, never a verdict on his GPU.

Dispatch the census on your pushed branch: `gh workflow run gpu-census.yml --ref <branch> -f track=… -f tod=…`
(or the GitHub MCP `actions_run_trigger`); agent tokens dispatch fine. Only a request-only leg (`leg`,
`lf_*`, `lrm_*` in `.github/gpu-census-request.json`; the form is at the 25-input cap) still goes by
editing that file on your branch and pushing.

## Where things live (rendering stack)

| Layer | Path | Notes |
|---|---|---|
| Backend factory | `js/render/gfx.js` | `Gfx.create(canvas, opts)` returns the resolved pick (TLX or WGX) or `null` on absence or any failure; game.js then falls back to GLX and stores `gfx` on `G` |
| TLX (default) | `js/render/three/tlx.js`, `tsl-*.js`, `tlx-post.js` | `TLX.create`; pin with `apex26.gfxBackend` / `apex26.tlxForceGL` |
| GLX fallback | `js/render/glx/glx.js`, `glsl-*.js` | WebGL2 path; `GLX.create` |
| WGX opt-in | `js/render/webgpu/wgx.js`, `wgsl-chunks.js` | `WGX.create`; failures land in `apex26.gfxWgxFail` |
| Shared assets | `js/render/shared/assets.js` | PBR pack layers — **asset-pack** |
| Soft present (CI) | `js/render/gfx.js` + `#game-soft` | Headless blit; probes use `awaitSoftPresent()` |
| Scene bridge | `js/game.js` | Per-frame `gfx` draw/update; garage uses the same `gfx` in `js/garage/scene.js` |
| Screen-space FX overlays | `js/fx/visor-optics.js`, `js/fx/droplets.js` | DOM canvases `#fx-visor` / `#fx-droplets` over `#game`: `VisorOptics.clear()`, `VisorOptics.stats()` |
| Car body meshes | `js/car/car-body-geom.js`, `js/car/car3d.js` | geometry the backends draw; not a shader layer |
| Diagnose | `js/agent/apex.js` | `__apex.diag().env.backend`, `texCensus()`, `assets()` |

Pick the backend section below from `env.backend`; cross-backend parity → `tests/unit/backend-surface-parity.test.mjs`.

## Step 0 — which backend answered (BROWSER-ONLY: needs a live page; a phone → the gfxdebug line above)

```js
__apex.diag({download:false}).env.backend   // "three" | "webgl2" | "webgpu"
```

A value like `webgl2 (pick: webgpu)` means the pick failed and the fallback
bound: `env.backendFallback` says why (written by `js/render/renderer-boot.js`: null or slow adapter,
canary strike, hung fetch/init, refused create), then read `localStorage["apex26.gfxWgxFail"]` / `["apex26.gfxTlxFail"]`
and `env.backendState` (`pin`, `forceWebGL`, `gpuErrors`). Pin a backend for a
probe with `tools/shot/apex-eval.mjs <track> <expr> --backend three|webgl2|webgpu` (a
`GLX.*()` / `WGX.*()` expression silently answers for TLX without it).
Headless/software adapters blit onto `#game-soft` (`awaitSoftPresent()`): a
black `#game` is that overlay's gap, not yet a shader miss. A software probe
is no evidence about a player's GPU — the census route above.
**Canvas fine, but a ghost glint or haze over a menu or results screen?** That is a DOM
overlay, not a shader: check `#fx-visor` / `#fx-droplets` in a DOM snapshot and
`VisorOptics.stats()` (`shown`) before touching a shader; an overlay nobody cleared on race
exit (no `VisorOptics.clear()` call on that path) is the usual cause.
Before editing a car/body function, `lsp_definition` it: a hoisted duplicate declaration in
the same IIFE silently wins (skill code-nav). "Black screen after an HDR format change" is decided here:
read the backend first, then go to its section; `hdrMode()` is GLX's.

| `env.backend` | Section | Reference |
|---|---|---|
| `three` | TLX, below; both TLX legs read `three`, so read `backendState().forceWebGL` / `pin` (or the gfxdebug `three api=` row) first | `.claude/rules/render-tlx.md` |
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
- TLX on WebGPU in Safari compiles TSL to WGSL in WebKit, so the five WGSL rules in
  `.claude/rules/render-wgx.md` (the "Five WGSL rules" bullet) apply to this leg too: a black TLX WebGPU
  canvas on an iPhone checks them before any shader edit.
- Probe: `node tools/gfx/gfx-probe.mjs --backend three [--tlx-webgpu --lavapipe]
  <track>` — `gpuErrors` must be 0 (parent session only: it launches Chromium). The rule's gate
  runs the WebGPU leg on lavapipe on purpose; `--hardware` refuses a fallback adapter.
  `--tod night` for a lighting-dependent defect.
- Transparent / see-through cars: opaque canvas alpha is required —
  [references/tlx-transparent-cars.md](references/tlx-transparent-cars.md). Never compare the census's two TLX legs on frames or luma
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
`node tools/gfx/wgx-validate.mjs --static` (no browser, so a subagent may run it); the full
Dawn pass (`wgx-validate.mjs [track]`, `--lite`, `--no-rg11b10`) and `gfx-probe.mjs --backend
webgpu` launch Chromium (parent only: AGENTS.md rule 10). Gate every WGSL/pipeline edit with it plus
`tests/unit/webgpu-lifecycle.test.mjs`. `WGX.gpuErrors()` must be 0;
`WGX.lastFailure()` explains a refusal. Steps, the fallback trace, SwiftShader
limits and live pokes: [references/wgx.md](references/wgx.md); late-sky /
derivative_uniformity (NaN-white road) / MSAA+HDR defects and the device-loss
ladder: [references/wgx-defects.md](references/wgx-defects.md). WebKit/Safari/iOS:
`IS_WEBKIT` forces `WGX_LITE`; its WGSL rules: `.claude/rules/render-wgx.md`. A
textured-vs-procedural material look on WGX is **asset-pack**.

## WebXR / VR

`js/xr/` (ENTER VR, `XrBoot` / `XrSession`, the WebGL2-default VR path, Quest
controllers, `test:xr` under IWER): [references/xr.md](references/xr.md).

Chrome DevTools heap/LCP playbook: [references/chrome-devtools-perf.md](references/chrome-devtools-perf.md). Memory census tools (heap, meshes; not `gpu-census`): skill **mcp-probe** §Census tools.
