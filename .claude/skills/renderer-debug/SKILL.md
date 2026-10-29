---
name: renderer-debug
description: "Use when TLX/GLX/WGX/WebGPU looks wrong: black/NaN canvas, WGSL validation, shaders, shadows, bloom, HDR, GL errors, device lost, silent WebGL2 fallback, iPhone/Safari/Metal, WebXR/VR/Quest black frame. Not night washout → lighting-tuner; MAT garble → asset-pack."
---

# Debug the renderer — TLX, GLX or WGX

Three backends draw the same scene: **TLX** (`js/render/three/`, three.js/TSL, the
DEFAULT), **GLX** (`js/render/glx/`, explicit WebGL2 and the universal fallback) and
**WGX** (`js/render/webgpu/`, opt-in WebGPU, DEFERRED). Boot evidence:
`docs/ARCHITECTURE.md` §Boot evidence.

## Gotchas

- Container probes pin `apex26.tlxForceGL=1`, so they never run the phone's TLX
  WebGPU path; a software probe is no GPU verdict (AGENTS.md §Verification).
  A phone report → [references/phone-reports.md](references/phone-reports.md).
- A `GLX.*()` / `WGX.*()` apex-eval expression silently answers for TLX unless you
  pass `--backend webgl2|webgpu`.
- Both TLX legs report `env.backend` `three`: read `backendState().forceWebGL` /
  `pin` before picking a leg.
- A black `#game` on a software adapter is the `#game-soft` blit gap
  (`awaitSoftPresent()`), not yet a shader miss; a haze over a menu is a DOM
  overlay (`#fx-visor` / `#fx-droplets`), not a shader.
- Only `node tools/gfx/wgx-validate.mjs --static` is subagent-safe; the Dawn pass,
  `gfx-probe.mjs` and `apex-eval.mjs` launch Chromium (parent only: AGENTS.md rule 10).
- A garbled PBR layer is **asset-pack**; a washed-out night is **lighting-tuner**.

## Workflow

1. **Device report?** Get the `?gfxdebug=1` Copy line first, then the census ladder
   ([references/phone-reports.md](references/phone-reports.md)).
2. **Step 0 — which backend answered** (BROWSER-ONLY):
   `__apex.diag({download:false}).env.backend` → `"three" | "webgl2" | "webgpu"`. A
   `webgl2 (pick: …)` value is a fallback: read `env.backendFallback`,
   `apex26.gfxWgxFail` / `apex26.gfxTlxFail` and `env.backendState`
   ([references/backend-triage.md](references/backend-triage.md)).
3. **Rule out non-shader causes** (DOM overlay, soft-present gap, duplicate IIFE
   declaration: `lsp_definition` before editing a car/body function).
4. **Go to the backend's reference:**
   - `three` → TLX: [references/tlx.md](references/tlx.md); rules
     `.claude/rules/render-tlx.md`; see-through cars →
     [references/tlx-transparent-cars.md](references/tlx-transparent-cars.md).
   - `webgl2` → GLX (runs only when `apex26.gfxBackend="webgl2"` or TLX/WGX failed):
     [references/glx.md](references/glx.md), then
     [references/glx-failures.md](references/glx-failures.md). `hdrMode()` is a
     read-only GLX readout.
   - `webgpu` → WGX (opt-in `apex26.gfxBackend="webgpu"`; every failure must
     degrade to GLX, never a dead canvas): run `wgx-validate.mjs --static` FIRST,
     then [references/wgx.md](references/wgx.md) and
     [references/wgx-defects.md](references/wgx-defects.md). WebKit:
     `IS_WEBKIT` forces `WGX_LITE`; WGSL rules in `.claude/rules/render-wgx.md`.
5. **Gate the fix:**
   - TLX: `gfx-probe.mjs --backend three` with `gpuErrors` 0, per `render-tlx.md`.
   - GLX: `tests/unit/glx-output-target.test.mjs`; browser
     `tests/specs/webgl-probes.spec.js`. Anchors: `js/render/glx/glx.js`,
     `glx/post.js`, `glx/shaders/glsl-lit.js`.
   - WGX: `--static` plus `node --test tests/unit/webgpu-lifecycle.test.mjs`;
     `WGX.gpuErrors()` must be 0, `WGX.lastFailure()` explains a refusal.
   - Cross-backend look: `node --test tests/unit/backend-surface-parity.test.mjs`.
6. **Real GPU check:** dispatch `gpu-census.yml` on `macos-latest` and read its
   Verdict step ([references/phone-reports.md](references/phone-reports.md)).

## References

- [references/backend-triage.md](references/backend-triage.md) — read when you
  need the rendering-stack file map, the full Step 0 fallback trace, or to rule
  out a DOM overlay or soft-present gap.
- [references/phone-reports.md](references/phone-reports.md) — read when the bug
  was seen on an iPhone, Safari or a Mac, or before dispatching `gpu-census.yml`.
- [references/tlx.md](references/tlx.md) — read when `env.backend` is `three`:
  TLX files, `tlxForceHw`, the probe flags, Safari WGSL on the TLX leg.
- [references/tlx-transparent-cars.md](references/tlx-transparent-cars.md) — read
  when cars look see-through or the page shows through the canvas on TLX.
- [references/glx.md](references/glx.md) — read when `env.backend` is `webgl2`:
  `GLX.hdrMode()`, `__apex.lightState()` vs the 15-float light records,
  `gl.getError()` codes, mobile STANDARD-tier cast spam.
- [references/glx-failures.md](references/glx-failures.md) — read for GLX shadow
  acne, bloom blow-out, the Playwright probe pattern and apex-eval one-liners.
- [references/wgx.md](references/wgx.md) — read when `env.backend` is `webgpu` or
  you expected it and got `webgl2`: static then Dawn validation, the fallback
  trace, SwiftShader limits, unit gates and live pokes.
- [references/wgx-defects.md](references/wgx-defects.md) — read when the world is
  missing, the road is NaN-white (derivative_uniformity), bloom dropped
  (MSAA+HDR), or a real device shows a black screen (device-loss ladder).
- [references/xr.md](references/xr.md) — read for WebXR / VR: `js/xr/`, ENTER VR,
  `XrBoot` / `XrSession`, the WebGL2-default VR path, Quest controllers, `test:xr`
  under IWER.
- [references/chrome-devtools-perf.md](references/chrome-devtools-perf.md) — read
  only for heap-leak or LCP work on the PWA shell (not a renderer task; memory
  census tools, not `gpu-census`, are in `../mcp-probe/SKILL.md` §Census tools).
