# Live debugger hunt — render backends (TLX / GLX / WGX), 2026-10-16

Method: js-debugger MCP attached to a headless Chromium (SwiftShader, `--remote-debugging-port=9222`) serving the
working tree on :3456. Pause on caught + uncaught exceptions while booting; then scenario scripts through
`debugger_run`. SwiftShader: faults are real, perf numbers are not. Backends are pinned with
`localStorage apex26.gfxBackend` (`three` | `webgl2` | `webgpu`) and `apex26.tlxForceGL=1`; resource counts come
from `?three-devtools=1` (`renderer.info`) on TLX.

## Coverage matrix

| scenario | TLX | GLX | WGX |
|---|---|---|---|
| boot | F1 | pending | pending |
| circuit rebuild x5+ | pending | pending | pending |
| backend switch mid-session | pending | pending | pending |
| resize / orientation | pending | pending | pending |
| tab hidden/visible | pending | pending | pending |
| context lost/restored (device.lost on WGX) | pending | pending | pending |
| PerfGov quality tiers | pending | pending | pending |
| night + floodlights | pending | pending | pending |
| mirror on/off | pending | pending | pending |
| asset pack on/off | pending | pending | pending |

## Not a bug (environment)

- **Unset default boots GLX here.** `renderer-boot.js:153` keeps the unset default on GLX when no WebGPU adapter
  resolves (no `/dev/dri`); `diag().env.backend` reads `webgl2 (pick: three)` with no `backendFallback`. Pin
  `apex26.gfxBackend=three` to get TLX.

## Findings

### F1 — TLX never observes its canvas: `ResizeObserver.observe(Proxy)` throws and is swallowed (fixed)

- **Repro:** pin `apex26.gfxBackend=three`, `apex26.tlxForceGL=1`, reload with exceptions set to `all`.
- **Pause:** `js/render/shared/canvas-css-size.js:25` (`observer.observe(canvas)`), called from `tlx.js:3666`
  (`CanvasCssSize.create(_layoutCanvas, …)`); `_layoutCanvas = canvas` (tlx.js:387) is the `Gfx.createInitOwner`
  lease, a `Proxy` of `#game` (`gfx.js:236`).
- **Evidence:** in the page, `new ResizeObserver(cb).observe(new Proxy(canvas, {...}))` throws
  `parameter 1 is not of type 'Element'`. The `catch` sets `observer = null` but `watched` stays true (window
  listeners), so `read()` only re-reads `clientWidth/Height` after a window `resize`/`orientationchange`.
- **Impact:** on TLX a canvas CSS-box change that is not a window resize (a layout/panel/safe-area change, the
  settle window after rotation relying on the observer) is not seen until the next window event. GLX/WGX-without-
  owner paths observe a real element and are fine.
- **Fix (2 lines):** the lease answers `__element` with the real canvas (`gfx.js`); `CanvasCssSize` observes
  `canvas.__element || canvas`. Test: `tests/unit/init-owner-resize-observer.test.mjs` (failing before, passing after).
- **Confidence:** high (reproduced live and in the unit test).
