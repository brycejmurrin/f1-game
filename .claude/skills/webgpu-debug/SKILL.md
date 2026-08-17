---
name: webgpu-debug
description: Use when WebGPU/WGX rendering is wrong — black screen, missing road/world, NaN-white surfaces, GPU validation errors, WGSL compile failures, device lost, silent fallback to WebGL2, MSAA/HDR format issues, or when validating WGSL changes with real Dawn in-container via wgx-validate.
---

# Debug WebGPU / WGX renderer issues

WGX lives in `js/render/webgpu/` — `wgx.js` (the core, ~3.6k lines),
`wgsl-chunks.js` (lit/material WGSL as data), `wgsl-post.js` (post chain).
It is a DEFERRED backend: no `<script>` tag; `game.js` injects it at boot when
`apex26.gfxBackend === "webgpu"` (sw.js precaches it — see
`pwa-cache-service-worker`). GLX stays the shipped default; every WGX failure
must degrade to GLX, never to a dead canvas.

## 1. Real Dawn validation in-container — ALWAYS the first probe

```sh
node tools/wgx-validate.mjs                      # full stack (MSAA 4, HDR)
node tools/wgx-validate.mjs --lite               # the PHONE stack (MSAA 1)
node tools/wgx-validate.mjs --no-rg11b10         # spoof a phone-class adapter:
                                                 # forces the rgba16float post-
                                                 # target fallback branch
node tools/wgx-validate.mjs vegas --frames 120   # more frames on a night track
```

PASS = binds `webgpu`, zero WGSL parse errors, zero GPU validation errors, and
the character raster sees the world (road ~40%+ coverage on montreal). Run the
matrix (full/lite × with/without rg11b10) after ANY wgsl or pipeline change —
the container adapter HAS `rg11b10ufloat-renderable`, so without `--no-rg11b10`
the fallback branch is never exercised.

**The ceiling, corrected 2026-08-17:** SwiftShader-Dawn EXECUTES shader work
here. Two narrower limits remain: headless canvas PRESENT is blank
(screenshots show DOM only), and the FIRST `getCurrentTexture()` call
permanently breaks `mapAsync` on that device ("A valid external Instance
reference no longer exists"). Real pixels: `node tools/wgx-capture.mjs <track>`
— it sets `apex26.gfxWgxOffscreen=1` (WGX renders its final pass offscreen,
never touches the swapchain, paces one frame in flight) and writes the
`GLX.capturePixels()` readback as `frame.png`. That capture found the bloom
format, sky-MSAA layout, particle layout, and particle-VBO retire bugs in one
afternoon — prefer it over reasoning from absence. Still true: SwiftShader is
not a PERFORMANCE oracle, software adapters force MSAA 1 (MSAA-only paths need
the source guards in `webgpu-lifecycle.test.mjs`), and `deviceLostHint: true`
after a clean init is a note, not a failure.

## 2. The three shipped defect classes (2026-08-17) — check these first

1. **Late sky erased the world.** Sky pipelines must use
   `depthCompare: "less-equal"` with `depthWriteEnabled: false` (GLX LEQUAL
   parity). With `"always"` + `skyLate` default-ON, the sky (depth 1.0, drawn
   AFTER the world) overwrote everything except cars/FX. Only the MSAA
   depth-resolve pipeline legitimately uses `"always"` (it fills depth).
2. **WGSL derivative uniformity — the NaN-white road.** Unlike GLSL, WGSL makes
   a `dpdx`/`dpdy`/`fwidth` call reached through a non-uniform branch or early
   return a `derivative_uniformity` error. Strict Dawn rejects the module (WGX
   silently falls back to GLX); warning-mode Dawn (phones) executes UNDEFINED
   derivatives exactly where returns diverge — the road rendered NaN-white
   while grass/walls/cars looked fine. The shape that ships: `fs_main` takes
   ALL derivatives of varyings FIRST, in uniform flow (`fwWpos`, `fwTrk`), and
   threads the widths into the material helpers as parameters. Enforced
   statically by `tests/unit/webgpu-lifecycle.test.mjs` (helpers must contain
   no derivative calls). Never add a derivative inside `applyMaterial*`,
   `roadMarkings`, `matBumpHeight`, or `matTexUV`.
3. **Spec-invalid resources.** WebGPU allows ONLY sample counts 1 and 4 —
   `MSAA_COUNT` is 4 (1 in lite); a 2 invalidates every MS pipeline on every
   compliant device. `rg11b10ufloat` is color-renderable only behind the
   optional `rg11b10ufloat-renderable` feature — `create()` requests it when
   the adapter has it, else `POST_HDR_FORMAT` downgrades to `rgba16float`.
   Any new render-target format needs the same feature audit.

## 3. Backend and error state from the page

```js
__apex.diag({download:false}).env   // { backend, msaa, hdr, ... } — the TRUTH
WGX.gpuErrors()                     // popErrorScope tally — MUST be 0
WGX.lastFailure                     // why WGX refused or surrendered
__apex.logs()                       // ring buffer; "gfx" ns carries WGX errors
```

`backend: "webgl2"` when you expected webgpu means WGX refused (parse error,
pipeline failure, previous crash rung) — read `WGX.lastFailure` and
`localStorage["apex26.gfxWgxFail"]`, don't guess. A misleading classic:
`createBuffer failed, size (N) is too large` on a tiny N is Chrome's LOST
DEVICE error, not an allocation bug.

## 4. The device-loss escalation ladder (black screen on real hardware)

Persisted per origin in `apex26.gfxWgxLevel`; one `device.lost` = one rung up +
one reload, so every retry is cheaper than the config that died:

- rung 0 full — desktop stack (MSAA 4, timestamp-query, 2048 shadows)
- rung 1 lite — phone parity (MSAA 1, 1024 shadows; ALL phones and WebKit
  START here — `IS_MOBILE || IS_WEBKIT` in wgx.js)
- rung 2 minimal — lite + no post chain, DPR capped at 1
- loss on rung 2 → session-skip to GLX; the user's RENDERER pick is preserved

The ladder HEALS (5 clean sessions step a rung down; `apex26.gfxWgxOk`), and an
explicit RENDERER re-pick clears it (`gfx-quality.js` RESET). JS exceptions do
NOT latch a dead canvas: 3 strikes (`JS_STRIKE_CAP`) surrender to GLX with the
reason in `apex26.gfxWgxFail`. So a persistent black screen on hardware means
the ladder itself is broken — check those keys before touching pipelines.

## 5. Unit gates and parity

- `tests/unit/webgpu-lifecycle.test.mjs` — mock-GPU harness: init, fallback,
  texture ownership, gpuErrors surface, and the STATIC WGSL uniformity tests.
- `tests/unit/gfx-backend-canary.test.mjs` — boot canary / probe-revert logic.
- `tests/unit/backend-surface-parity.test.mjs` + `docs/research/WEBGPU-PARITY.md`
  — every Gfx façade member × 3 backends. A GLX look/knob fix is NOT done
  until mirrored (or explicitly gapped) in `wgsl-chunks.js`/`wgsl-post.js` and
  TLX; `ff45ec90` and `447e904b` are the measured drift incidents.

## 6. Live poking

Boot the working tree with the backend forced, then use the standard hooks:

```sh
node tools/apex-eval.mjs montreal "a.diag({download:false}).env" --raw \
  APEX_GFX=webgpu   # if supported; otherwise set localStorage in an init script
```

For a real browser session use the `mcp-probe` skill (set
`localStorage.setItem("apex26.gfxBackend","webgpu")` before reload).
`render({what:"view"})` is the cheap scene truth; for REAL pixels run
`node tools/wgx-capture.mjs <track>` (offscreen capture — the WGX canvas
itself still screenshots blank in-container; see §1 ceiling, corrected).
