# WebXR / Quest 3 — on-device checklist (Phase 0)

Automated CI (`npm run test:xr`, Playwright project `xr-emulated`) covers
**spec-level** behaviour with Meta’s IWER (`tests/vendor/iwer-2.5.0.min.js`).
IWER **cannot** prove the rows below — treat a green `test:xr` as
“emulation pass”, not “Quest ready”.

Sources: Meta WebXR remote debugging / perf tools, Immersive Web Emulation
Runtime getting-started, three.js WebXRManager docs, three.js PR #33497
(WebGPU feature detection via `session.enabledFeatures`).

## Not verified by IWER (need a real Quest 3)

| Capability | Why emulation is not enough |
|---|---|
| Multiview (`OVR_multiview2` / texture-array projection layer) | IWER has no `createProjectionLayer({ textureType: "texture-array" })` ([iwer#196](https://github.com/meta-quest/immersive-web-emulation-runtime/issues/196)); Phase 0 also keeps `multiview: false` (three [#32538](https://github.com/mrdoob/three.js/issues/32538) / [#32151](https://github.com/mrdoob/three.js/issues/32151)) |
| MSAA > 1 in XR | Software GL / IWER gap |
| Fixed foveation compositor effect | `setFoveation` / `XRWebGLLayer.fixedFoveation` can be called; the visual/perf effect is unobservable under IWER |
| WebGPU `XRGPUBinding` | No IWER WebGPU-XR path; clip-space depth is [0,1] if enabled on device |
| Real frame rate / GPU cost / thermal | SwiftShader timings are meaningless for Quest |
| Compositor quirks (layer sizing, Phase Sync, Spacewarp) | Device-only |

**Chrome desktop tip:** do **not** use the Chrome Web Store Immersive Web Emulator on Chrome 147+ (three [#33414](https://github.com/mrdoob/three.js/issues/33414) — native projection layers break the store build). CI and desktop emulation use pinned IWER (`tests/vendor/iwer-2.5.0.min.js`).

Architecture (why XRWebGLLayer not three.xr ArrayCamera): `docs/notes/XR-PHASE0-ARCHITECTURE.md`.

## Manual Quest 3 checklist

Use `adb reverse` + `chrome://inspect` (or the GitHub Pages build over HTTPS).

Setup: https://developers.meta.com/horizon/documentation/web/browser-remote-debugging/

1. Enable Developer Mode; `adb devices` shows `device`.
2. Laptop: `npx serve -l 8080 .` (or any static server) on this branch.
3. `adb reverse tcp:8080 tcp:8080` → Quest Browser → `http://localhost:8080/`.
4. Force WebGL2 VR path if needed (Application → Local Storage):
   `apex26.tlxForceGL=1`, `apex26.gfxBackend=three`.
5. Optional experimental WebGPU XR: `apex26.xrBackend=webgpu` (falls back when
   `webgpu` is absent from `session.enabledFeatures`).

### Functional

- [ ] Page loads over HTTPS (Pages) and via `localhost` (adb reverse); **ENTER VR** appears; session starts from a user gesture.
- [ ] Both eyes render correct stereo; no per-eye offset; no right-eye projection glitches.
- [ ] Controller mapping: right trigger throttle, left brake, thumbstick X steer, A/X recenter, B/Y pause; squeeze look-back hold.
- [ ] Controller lost/regained; system menu (`visible-blurred`) then resume; Meta-button recenter.
- [ ] Comfort: car/track scale, cockpit height (local-floor), no unwanted mono camera shake/roll while presenting.
- [ ] After **EXIT VR**, flat (non-XR) play still works.

### Performance / inspect hooks

In `chrome://inspect` → Console while presenting:

```js
XrBoot.diag()
// → { presenting, backend, features, frameCount, foveation, draw: { calls, triangles, … }, layer }
XrBoot.setFoveation(0)   // full res
XrBoot.setFoveation(1)   // max fixed foveation
```

- [ ] OVR Metrics HUD: steady target refresh (72/90/120 Hz as configured); note avg FPS, stale frames, app GPU time, foveation level, eye buffer size over a full race lap.
- [ ] Log `XrBoot.diag().draw.calls` / `.triangles` and compare foveation 0 vs 1 and `setFramebufferScaleFactor` if enabled later.
- [ ] Optional: `ovrgpuprofiler` vertex-vs-fragment check if under budget.
- [ ] Thermals: 10+ minute session.
- [ ] WebGPU experimental: enable Quest Browser flags if any, request with `webgpu` optional, confirm `XrSession.enabledFeatures()` contains `webgpu`, compare frame time to WebGL2, confirm fallback when flags are off.
- [ ] Re-test after Quest Browser updates (Chromium milestone changes).

Perf tools: https://developers.meta.com/horizon/documentation/web/webxr-perf-tools/
