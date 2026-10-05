# WGX (WebGPU) probes: static validation, Dawn, backend and error state, unit gates

Load from SKILL.md when `env.backend` reads `webgpu` (or you expected it and
got `webgl2`). Shipped defect classes and the device-loss ladder are in
[wgx-defects.md](wgx-defects.md).

## Contents
- 1. First probe — static, then Dawn
- 2. Backend and error state (BROWSER-ONLY: needs a live page)
- 3. Unit gates and live poke (the live pokes are BROWSER-ONLY)

WGX lives in `js/render/webgpu/` — `wgx.js`, `wgsl-chunks.js`, `wgsl-fx.js`,
`wgsl-post.js`.
DEFERRED: no `<script>` tag; `js/game.js` injects it when
`apex26.gfxBackend === "webgpu"`. Unset ships TLX/Three; GLX is the explicit
WebGL2 choice and universal fallback. Every WGX failure must degrade to GLX,
never a dead canvas (deliberate exceptions: blocked storage, hidden-tab loss —
wgx-defects.md "Trace").

## 1. First probe — static, then Dawn

```sh
node tools/gfx/wgx-validate.mjs --static             # ALWAYS this first (no browser)
# parent session only — these launch Chromium:
# node tools/gfx/wgx-validate.mjs [trackId]            (default montreal)
# node tools/gfx/wgx-validate.mjs --lite
# node tools/gfx/wgx-validate.mjs --no-rg11b10
```

`--static` is the only command **verify-agent** / any subagent may run. The
full Dawn pass launches Chromium — parent session only. The container adapter HAS
`rg11b10ufloat-renderable`; without `--no-rg11b10` the fallback is never
exercised.

**The ceiling, corrected 2026-08-17 (cache 1342+):** SwiftShader-Dawn EXECUTES
shader work here. Two narrower limits remain: the **native swapchain** never
composites (hidden WebGPU canvas stays black), and the FIRST
`getCurrentTexture()` call permanently breaks `mapAsync` on that device — WGX
never touches the swapchain on software adapters. Visible pixels: soft-present
2D blit on `#game` — probe with `node tools/gfx/gfx-probe.mjs --backend webgpu`
(`awaitSoftPresent` + `#game` luma). `wgx-capture.mjs` is a thin alias of that
probe (prefer the parent). Prefer hooks/probe over reasoning from absence.
Still true: SwiftShader is not a PERFORMANCE oracle, software adapters force
MSAA 1, and `deviceLostHint: true` after a clean init is a note, not a failure.

## 2. Backend and error state (BROWSER-ONLY: needs a live page)

```js
__apex.diag({download:false}).env   // { backend, msaa, hdr, ... }
WGX.gpuErrors()                     // MUST be 0
WGX.lastFailure()
__apex.logs()                       // "gfx" ns
```

`backend: "webgl2"` when you expected webgpu means WGX refused — read
`WGX.lastFailure()` and `localStorage["apex26.gfxWgxFail"]`.

Fallback path (read-only trace, no browser): `Gfx.create` (`js/render/gfx.js`
~L224) awaits `WGX.create()` (~L257), which returns null on ANY failure after
`wgx.js` records `_lastFailure` + `apex26.gfxWgxFail` and logs
`WGX unavailable (...) — falling back to WebGL2`; `Gfx.create` logs
`Gfx.bind fallback webgl2` and `js/game.js` binds GLX. No `navigator.gpu` or
no `WGX` global returns null with NO log line. NaN-white road with
NO fallback = warning-mode Dawn ran undefined derivatives (wgx-defects.md #2);
with fallback = strict uniformity error. Static half of that check:
`--static` plus `node --test tests/unit/webgpu-lifecycle.test.mjs`. Live
half (BROWSER-ONLY, parent): bare `wgx-validate.mjs` prepends
`diagnostic(error, derivative_uniformity)` like WebKit.

## 3. Unit gates and live poke (the live pokes are BROWSER-ONLY)

- `tests/unit/webgpu-lifecycle.test.mjs` — mock-GPU + static WGSL uniformity.
- `tests/unit/gfx-backend-canary.test.mjs` — boot canary / probe-revert.
- `tests/unit/backend-surface-parity.test.mjs` +
  `docs/research/WEBGPU-PARITY.md` — Gfx façade × 3 backends.

`tools/shot/apex-eval.mjs <track> <expr> --backend webgpu` pins WGX (pass it whenever the
expr names `WGX`/`GLX`; the default is TLX). Or, through the chrome MCP:

```sh
node tools/mcp/mcp-cli.mjs probe --backend webgpu --wait 12000 --eval 'a.diag({download:false}).env'
```

Live session: **mcp-probe** with
`localStorage.setItem("apex26.gfxBackend","webgpu")` before reload.
`render({what:"view"})` is the cheap scene truth; for visible WGX pixels use
`node tools/gfx/gfx-probe.mjs --backend webgpu <track>` (`#game` after
`awaitSoftPresent`; add `--tod day|dusk|dawn|night` for a lighting-dependent
defect, e.g. `qatar --tod night`). Multi-track gallery: `node tools/gfx/wgx-shot.mjs --gallery --lite`
(`npm run wgx:gallery` is exactly that pair — bare `--gallery` is a different,
full-tier run).
(`wgx-capture.mjs` aliases `gfx-probe --backend webgpu`; `wgx-lavapipe-probe.mjs`
aliases `--backend three --tlx-webgpu --lavapipe`, a TLX probe, not WGX.)
