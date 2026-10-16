# WebXR / VR mode (`js/xr/`)

Immersive-vr (Quest-class headsets) on top of the normal renderer. Phase 0:
the default VR path is WebGL2 (TLX with `forceWebGL` / `tlxForceGL`, a manual
`XRWebGLLayer` + per-eye matrices); WebGPU XR is opt-in via
`apex26.xrBackend=webgpu` and decided by `session.enabledFeatures`.
Architecture and why not three's `XRManager`/`ArrayCamera`:
`docs/notes/XR-PHASE0-ARCHITECTURE.md`. Device checklist:
`docs/notes/XR-QUEST-ON-DEVICE.md`.

## Load order (`tools/manifest.cjs`)

- FULL: `xr-opts.js` (SETTINGS rows paint at eval) and `xr-boot.js` (game.js
  calls `XrBoot` every frame; a no-op until a session exists).
- `LAZY_XR` (behind `navigator.xr` / ENTER VR / an armed
  `apex26.xr`): `xr-plan.js` → `xr-rig.js` → `xr-input.js` → `xr-session.js`
  → `apex-xr.js` → `xr-ui.js`.

## Files

| File | Global | Does |
|---|---|---|
| `xr-boot.js` | `XrBoot` | mounts ENTER VR, `bind()`s `XrSession` to the live gfx backend, comfort lock (shake/buzz off while presenting), loop hand-off (`loopByXr`), `applyEyes` / `present`, `diag()`, `setFoveation`; pins/restores the 2D backend (`apex26.xrEnterPending`, `apex26.xrPrevBackend`) |
| `xr-session.js` | `XrSession` | owns the immersive session: `probe`, `start`/`end`, visibility, the XR frame loop (window rAF is unreliable inside a session), seated `recenter`, `eyeFrames`, `frameCount`, `enabledFeatures` |
| `xr-plan.js` | `XRPlan` | pure boot-time path pick (`webgl2` default, `webgpu` opt-in) from capability + preference bags; never writes `apex26.gfxBackend` |
| `apex-xr.js` | `ApexXR` | façade for boot/settings: cached plan, capability probe → `apex26.xrCaps`, `bootPick()` for game.js `backendPreference()`, `noteFallback()` (`apex26.xrFallback` in sessionStorage) |
| `xr-rig.js` | `XrRig` | pure seated-rig math: cockpit anchor × XR view pose → column-major view/proj/eye matrices (`composeEye`) |
| `xr-input.js` | `XrInput` | Quest Touch (xr-standard) → `Input.remoteSample` / events: R trigger throttle, L trigger brake, stick X steer, A/X recenter, B/Y pause |
| `xr-opts.js` | `XROpts` | SETTINGS › DISPLAY rows VR MODE (`apex26.xr`) + VR RENDERER (`apex26.xrBackend`); hidden unless immersive-vr is capable; "Reload to apply" |
| `xr-ui.js` | `XrUi` | the ENTER VR button: shown only after `isSessionSupported('immersive-vr')`; it starts VR, switches to the XR-capable path (one reload), or shows an error — never a silent no-op |

## Probe (live page)

```js
XrBoot.diag()   // presenting, loopByXr, canAttach, backend, features, frameCount, visible, foveation, layer
```

`XrBoot.bind()` must run before `XrSession.start()`: no layer means IWER
delivers zero frames.

## Tests

```sh
node --test tests/unit/xr-phase0.test.mjs tests/unit/xr-plan.test.mjs tests/unit/xr-opts.test.mjs \
  tests/unit/xr-backend-pin.test.mjs tests/unit/xr-cull-union.test.mjs tests/unit/xr-visibility-pause.test.mjs
node tools/ci/test-bg.mjs xr     # BROWSER: vr-emulated.spec.js + xr-plan.spec.js, Playwright project xr-emulated (pinned IWER)
```

A green `test:xr` is an EMULATION pass: IWER cannot prove multiview, MSAA > 1,
foveation, `XRGPUBinding` or headset frame time — those need a real Quest
(`XR-QUEST-ON-DEVICE.md`). Never add a second `session.requestAnimationFrame`
waiter in a spec (`waitXrFrames` in `tests/helpers/iwer-install.mjs`).
