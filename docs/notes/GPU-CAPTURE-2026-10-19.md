# GPU capture hooks — WGX labels + Spector / webgl-lint (#2964)

Date: 2026-10-19. Parent: Node debugging round (#2952 / R6).

## What shipped

1. **WGX labels everywhere** — `js/render/webgpu/wgx-debug-labels.js`
   wraps the `GPUDevice` after `requestDevice` so every `createBuffer` /
   `createTexture` / `createSampler` / `create*Pipeline` / `createBindGroup*` /
   `createShaderModule` / `createQuerySet` descriptor carries a `label`, and
   every `beginRenderPass` / `beginComputePass` is wrapped in
   `pushDebugGroup` / `popDebugGroup` named after the pass. `wgx.js` calls
   `WGXDebugLabels.install(device)` once the device is proven not born-lost.
   Labels are free on the GPU path and feed Dawn / WebKit validation strings
   of the form `[Invalid Buffer (wgx-buffer-3)] …`.

2. **Dev-only `__apex.gpuCapture`** — `js/agent/apex-gpu-capture.js` (LAZY_AGENT),
   registered with one line on the `__apex` object in `apex.js`. Off by default.
   Modes:
   - `gpuCapture("spector")` — loads vendored Spector.js, spies canvases.
   - `gpuCapture("capture")` — `captureCanvas` → compact JSON summary
     (`commandCount`, `commandNames`, canvas size; no thumbnails).
   - `gpuCapture("webgl-lint")` — loads vendored webgl-lint.
   - `gpuCapture("findings")` — `{ findings, redundant, … }` JSON.
   - `gpuCapture(false)` — off again.

   Vendor copies live under `vendor/gpu-capture/` (hash-pinned `MANIFEST.json`)
   so CSP `script-src 'self'` accepts them. CDN injection is refused by the
   shipped CSP meta tag.

## Gates

- Unit: `tests/unit/wgx-labels.test.mjs` (labels, debug groups, validation-shaped
  message names the label, vendor hashes, one-line apex registration).
- Browser: `tests/specs/gpu-capture.spec.js` in `test:gfx` (off by default;
  Spector summary + webgl-lint findings on GLX / SwiftShader).
- WGX path still follows `.claude/rules/render-wgx.md` (`wgx-validate --static`,
  lifecycle units, gfx-probe when pipelines change — this change adds no WGSL).

## Non-goals / boundaries

- Does **not** edit `js/render/gfx.js` or `js/render/three/tlx.js` (#2972).
- No runtime cost when the toggle is off (no script tags, no Spector construct).
- Does not vendor the three.js Inspector (already separate).
