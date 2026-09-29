# WebXR Phase 0 — architecture notes (spike)

Cross-check against spike-support research (2026-09-29), three.js r186 source,
and Meta IWER 2.5.0 behaviour under SwiftShader.

## Path we took

| Topic | Choice | Why |
|---|---|---|
| Renderer | TLX `WebGPURenderer({ forceWebGL: true, multiview: false })` + own `webgl2` context with `xrCompatible: true` | Matches force-GL construction; `makeXRCompatible` still called on attach. Explicit `multiview: false` — three [#32538](https://github.com/mrdoob/three.js/issues/32538) / [#32151](https://github.com/mrdoob/three.js/issues/32151) open; `perCameraCulling` not in 0.186.0 |
| Session / eyes | Manual `XRWebGLLayer` + `XRFrame.getViewerPose` → per-eye matrices into `frame` / `presentXR` | Keeps Apex matrix contract; avoids XRManager replacing the camera with an `ArrayCamera` and clobbering `begin(frame)` copies |
| Animation loop | `session.requestAnimationFrame` via `XrBoot` → `tickBody`; window.rAF gated by `XrBoot.loopByXr()` | Custom window.rAF stops in standalone immersive sessions. We do **not** use `renderer.setAnimationLoop` (that API is for XRManager-owned frames) |
| Rig / seat | Offset reference space (`XrSession.recenter` → `getOffsetReferenceSpace`) + seated anchor from cockpit eye | Equivalent to parenting the camera under a car rig for XRManager; our path applies seat in `XrRig.composeEye` |
| Post | Forced off in `presentXR` | Mono post into a custom RT uses the mono camera while presenting (`isOutputTarget`); Phase 0 skips bloom/SSR/soft-blit |
| `resize` / `setSize` | No-op while `_xrActive` | Immersive layer owns the drawing buffer; fighting CSS resize is wrong |
| WebGPU XR | Opt-in `apex26.xrBackend=webgpu`; decide via `session.enabledFeatures` (three [#33497](https://github.com/mrdoob/three.js/pull/33497)); clip depth [0,1] if ever enabled | Quest may expose `XRGPUBinding` without granting the feature. Closest three example: `webgpu_xr_native_layers` (forced WebGL) |

## IWER / CI only

- `installRuntime({ forceInstall: true })` + `stereoEnabled = true` (Chrome ≥147 has stub/native `navigator.xr`).
- IWER `XRWebGLLayer.framebuffer` is **null** → three `WebGLState.drawBuffers` WeakMap throws every frame. TLX remaps `backend.state.currentDrawbuffers` to a `Map` when the FBO is null (emulation-only; Quest gives a real FBO).
- IWER cannot test projection layers, multiview, MSAA>1, foveation effect, or `XRGPUBinding`.
- **Do not** use the Chrome Web Store Immersive Web Emulator on Chrome 147+ (three [#33414](https://github.com/mrdoob/three.js/issues/33414)); use pinned `tests/vendor/iwer-*.min.js` in Playwright.

## On-device

See `docs/notes/XR-QUEST-ON-DEVICE.md` (`XrBoot.diag()`, OVR Metrics, adb reverse).
