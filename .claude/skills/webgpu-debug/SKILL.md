---
name: webgpu-debug
description: Use when WebGPU/WGX rendering is wrong — black screen, missing road/world, NaN-white surfaces, GPU validation errors, WGSL compile failures, device lost, silent fallback to WebGL2, MSAA/HDR format issues, or when validating WGSL changes with real Dawn in-container via wgx-validate.
---

# Debug WebGPU / WGX renderer issues

WGX lives in `js/render/webgpu/` — `wgx.js`, `wgsl-chunks.js`, `wgsl-post.js`.
DEFERRED: no `<script>` tag; `js/game.js` injects it when
`apex26.gfxBackend === "webgpu"`. GLX stays the shipped default; every WGX
failure must degrade to GLX, never a dead canvas.

## 1. First probe — static, then Dawn

```sh
node tools/wgx-validate.mjs --static             # ALWAYS this first (no browser)
# parent session only — these launch Chromium:
# node tools/wgx-validate.mjs
# node tools/wgx-validate.mjs --lite
# node tools/wgx-validate.mjs --no-rg11b10
```

`--static` is the only command **verify-agent** / any subagent may run. The
full Dawn pass launches Chromium — parent session only. The container adapter HAS
`rg11b10ufloat-renderable`; without `--no-rg11b10` the fallback is never
exercised.

**Ceiling:** this environment VALIDATES but does not EXECUTE. WGX canvas
screenshots are BLANK; SwiftShader may lose the device after a clean init
(`deviceLostHint: true` is a note, not a failure). Scene truth is
`__apex.render({what:"view"})`; pixel sign-off needs a real GPU.

## 2. Backend and error state

```js
__apex.diag({download:false}).env   // { backend, msaa, hdr, ... }
WGX.gpuErrors()                     // MUST be 0
WGX.lastFailure
__apex.logs()                       // "gfx" ns
```

`backend: "webgl2"` when you expected webgpu means WGX refused — read
`WGX.lastFailure` and `localStorage["apex26.gfxWgxFail"]`.

## 3. Unit gates and live poke

- `tests/unit/webgpu-lifecycle.test.mjs` — mock-GPU + static WGSL uniformity.
- `tests/unit/gfx-backend-canary.test.mjs` — boot canary / probe-revert.
- `tests/unit/backend-surface-parity.test.mjs` +
  `docs/research/WEBGPU-PARITY.md` — Gfx façade × 3 backends.

```sh
node tools/apex-eval.mjs montreal "a.diag({download:false}).env" --raw APEX_GFX=webgpu
```

Live session: **mcp-probe** with
`localStorage.setItem("apex26.gfxBackend","webgpu")` before reload.

## Load on demand

- Late-sky / derivative_uniformity / MSAA+HDR defects, device-loss ladder →
  [references/defects.md](references/defects.md).
