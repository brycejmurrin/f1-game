# TLX (three.js / TSL) probes

Load from SKILL.md when `env.backend` reads `three`. The pins, the probe gate,
opaque canvas alpha and the census `path:` row are rules in
`.claude/rules/render-tlx.md`; this file adds the files and the debugging
detail.

## Files

`js/render/three/`: `tlx.js` (backend, `backendState()`, soft-blit),
`tsl-lit.js` / `tsl-chunks.js` / `tsl-fx.js` / `tsl-sky.js` (node shaders),
`tlx-post.js`, `tlx-shadow.js`, `tlx-chunked.js`. Selected when
`apex26.gfxBackend` is unset or `three`; three picks its own WebGL2 or WebGPU
path.

## Which leg bound

- `backendState().pin` / `forceWebGL` say which path bound; a failed init
  records `apex26.gfxTlxFail`.
- `apex26.tlxForceHw=env|sky|batches|chunked|shadow` runs the content paths a
  real GPU takes on a software adapter.
- TLX on WebGPU in Safari compiles TSL to WGSL in WebKit, so the "Five WGSL
  rules" in `.claude/rules/render-wgx.md` apply to this leg too: a black TLX
  WebGPU canvas on an iPhone checks them before any shader edit.

## Probe

`node tools/gfx/gfx-probe.mjs --backend three [--tlx-webgpu --lavapipe] <track>`
— `gpuErrors` must be 0 (parent session only: it launches Chromium). The gate
runs the WebGPU leg on lavapipe on purpose; `--hardware` refuses a fallback
adapter. Add `--tod night` for a lighting-dependent defect.

## Look differs from GLX/WGX

`docs/ARCHITECTURE.md` §Cross-backend parity and
`node --test tests/unit/backend-surface-parity.test.mjs`
(`gfx-backend-canary.test.mjs` pins the boot sniffs). A garbled PBR layer is
**asset-pack**; a washed-out night is **lighting-tuner**.
