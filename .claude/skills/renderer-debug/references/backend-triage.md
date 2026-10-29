# Backend triage: where the stack lives, Step 0 and the non-shader suspects

Load from SKILL.md before any shader edit, to learn which backend answered and
whether the defect is a shader at all.

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

Cross-backend parity → `tests/unit/backend-surface-parity.test.mjs`.

## Step 0 — which backend answered (BROWSER-ONLY: needs a live page)

```js
__apex.diag({download:false}).env.backend   // "three" | "webgl2" | "webgpu"
```

- A value like `webgl2 (pick: webgpu)` means the pick failed and the fallback
  bound: `env.backendFallback` says why (written by `js/render/renderer-boot.js`:
  null or slow adapter, canary strike, hung fetch/init, refused create). Then read
  `localStorage["apex26.gfxWgxFail"]` / `["apex26.gfxTlxFail"]` and
  `env.backendState` (`pin`, `forceWebGL`, `gpuErrors`).
- Both TLX legs read `three`: read `backendState().forceWebGL` / `pin` (or the
  gfxdebug `three api=` row) before choosing a leg.
- Pin a backend for a probe with
  `tools/shot/apex-eval.mjs <track> <expr> --backend three|webgl2|webgpu`; a
  `GLX.*()` / `WGX.*()` expression silently answers for TLX without it.
- Headless/software adapters blit onto `#game-soft` (`awaitSoftPresent()`): a
  black `#game` is that overlay's gap, not yet a shader miss.
- "Black screen after an HDR format change" is decided here: read the backend
  first, then go to its reference; `hdrMode()` is GLX's.

## Not a shader

- **Ghost glint or haze over a menu or results screen, canvas fine:** a DOM
  overlay. Check `#fx-visor` / `#fx-droplets` in a DOM snapshot and
  `VisorOptics.stats()` (`shown`) before touching a shader; an overlay nobody
  cleared on race exit (no `VisorOptics.clear()` call on that path) is the usual
  cause.
- **Car/body function edits:** `lsp_definition` it first: a hoisted duplicate
  declaration in the same IIFE silently wins (skill code-nav).
