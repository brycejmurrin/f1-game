# iPhone › TLX on three's WebGPU path: survey and ranked gaps, 2026-10-23

Fleet A lead A·I1. Bryce asked (2026-10-23, typed in OrchA 25) for "a set of deeper iPhone three js and webgpu
work after using browserstack sessions and looking at our findings and asking dad to give the reports they've
found". Bryce plays on an iPhone, 844×390 landscape, touch, on TLX with **THREE PATH: WEBGPU**
(`apex26.tlxForceGL = "0"`), and that path works for him.

Phase 1 only: no game code changed. Sources:

- Fleet D's BrowserStack reports on `cursor/d-iphone-reports` @595b6e84 (scratch, never merged).
  `scratch/browserstack-iphone/deep/RANKED-FIXES.md` is the headline file. The raw results are the JSON files next to it.
- Prior notes: `PERF-IPHONE-AUDIT-2026-10-21.md`, `TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md`,
  `PERF-TLX-WEBGPU-2026-10-19.md`, `PHONE-GPU-TEST-2026-10-21.md`, `PERF-FINDINGS.md` §2au.
- This session's own BrowserStack attempt (§1).

## 1. BrowserStack today: Automate minutes are spent

- `GET api.browserstack.com/automate/plan.json` answers `automate_plan: "Free"`, 5 parallel sessions. The env
  credentials are valid.
- `POST hub-cloud.browserstack.com/wd/hub/session` (iPhone 17 Pro / iOS 26, Safari, landscape) answers
  `"Automate testing time expired."`. Fleet D's 2026-10-21 runs (about 40 sessions) used up the Free allowance.
- `runBrowserLiveSession` still launches a Live session. It only returns a dashboard URL that a person drives, so
  an agent cannot read fps or console from it.
- A ready probe exists (not committed; scratch). It is a WebDriver session on the live site, landscape. It pins
  `apex26.gfxBackend=three` plus `apex26.tlxForceGL` `0`/`1`, reloads, runs the in-game `GpuTestRun.start()`
  (6 phases, about 3 min, dry Monza, helmet cam), and polls `__apex.perf()` (fps, tier, `frameTimes`),
  `backendState`, context loss, `error`/`unhandledrejection` events and the visibility state. It saves the result
  and a screenshot. It needs Automate minutes, or a paid plan, to run.

## 2. The headline correction: Bryce's path has not been measured on a device

Fleet D's ranked list describes its iPhone 15 / iOS 26 sessions as "three.js TLX on WebGPU". The recorded state
says otherwise. Every iPhone 15 result has `gfxMenu.pin = null` and `bound = null`, and no session wrote
`apex26.tlxForceGL`. With no pin, `js/render/three/tlx.js:415-416` (in place since #2973, 2026-10-19, before
those runs) sets:

```js
let forceWebGL = _glPin === "1" || (_glPin !== "0" && (!_gpuCanvasOk || _autoStayGL || isWebKit));
```

`isWebKit` (`tlx.js:236`) is true for iOS Safari, so AUTO binds **three's WebGL2 backend** on every iPhone.
`navGpu: true` in those files says only that `navigator.gpu` exists. It does not say WebGPU bound. (Their probe
read `backendState` through a handle that was undefined, so `api` was never captured. The bound backend is
`GLX.__tlx.backendState().api`, at `tlx.js:6351`.)

So:

- Fleet D's numbers are a good map of **TLX on three's WebGL2 backend on iOS 26**. That is what a new iPhone
  player gets by default.
- **Bryce's own path (pin `"0"`, three's WebGPU backend) has no real-device measurement anywhere in the repo.**
  The prior-art sweep found no `gpuTest` or BENCHMARK result file from his phone either
  (`PHONE-GPU-TEST-2026-10-21.md`: "measurement missing").
- The AUTO clause's own reason is "three-WebGPU rendered wrongly on an iPhone (missing bodywork, then sky only)"
  (`tlx.js:410-413`). Bryce reports that the pinned WebGPU path works. Either the defect has since been fixed, or
  it does not show on his device. Nobody has re-checked whether AUTO should still send WebKit to WebGL2.

## 3. Ranked gaps

Each gap lists the measured symptom, the likely cause, a proposed fix and how to verify it on a device. "Owner"
names an open PR when one already covers the gap.

### G1. No same-device WebGPU vs WebGL2 A/B on an iPhone (blocks every WebGPU-specific decision)
- **Symptom:** none measured. That is the gap.
- **Cause:** §2 above. The device runs were unpinned, and AUTO on WebKit picks WebGL2.
- **Fix:** measurement only, no code change. Either (a) Bryce runs SETTINGS › GRAPHICS › **BENCHMARK** (#3481,
  `js/perf/bench-run.js`; each leg reloads onto one THREE PATH and writes a results file) and shares the file, or
  (b) BrowserStack Automate minutes are restored and the §1 probe runs both pins on iPhone 17 Pro, iPhone 15 and
  iPhone 16e (iOS 18, no `navigator.gpu`, to cover the fallback).
- **Verify:** both legs on the same device, with `__tlx.backendState().api` recorded per leg: `webgpu` vs
  `webgl2`.

### G2. Cold race entry about 13 s on iOS 26 with a 5.3 s frozen frame; iOS 17/18 enter in 3–5 s
- **Symptom (Fleet D):** iPhone 15 / iOS 26 cold entry 13.0–13.4 s (4 of 4 sessions). `mirrorPrepare` took
  9.96–9.99 s of that, with a single rAF gap of 5.26–5.33 s. iPhone 17 Pro / iOS 26 took 13.5 s. iPhone 15 Pro /
  iOS 17 took 4.5 s, and iPhone 13 / iOS 18 took 3.1–4.7 s. A warm device took 4.3–5.7 s.
- **Cause (likely):** race entry waits on the TLX program warm. `mirror-pass.js:514`
  (`if (g.warming && g.warming()) return;`) runs inside the `mirrorPrepare` span. The warm calls
  `renderer.compileAsync(scene, camera)` (`tlx.js:3285`, `3317`, `3329`). The 2026-10-21 TLX warm history put
  compile-scene at 4959 ms of an 8647 ms warm. The warm is keyed per track (`js/game.js:2195`
  `warmPrograms → menuKey(trackIdx)`), so the title warm for the menu track does not cover the race track.
  These sessions bound three's WebGL2 backend, so the 5 s block is WebKit WebGL2 program linking. Fleet D
  attributed it to WebGPU, which §2 corrects. Why iOS 26 is about 3× slower than iOS 17/18 is not known:
  different devices, OS shader caches, or the `navigator.gpu` / `getContext("webgpu")` probe at `tlx.js:381-387`.
- **Owner:** none. D·DP1 stood down on file holds (bus `6e040a20`). B·H26 also left it as "lead not taken".
- **Fix (proposed):** start the race-track warm when the circuit is picked on race select, not after the tap;
  slice `compileAsync` per material group with yields; run it alongside `warmCarAssets` (1.6–2.0 s, serial
  today).
- **Verify:** `__apex.raceEntryProfile()` stages on a cold device, before and after: `entryMs` and the largest
  rAF gap. Run it on both pins, because the WebGPU leg's pipeline compile is a different cost.

### G3. First about 2 minutes of every race at 36–44 fps, then 57 fps
- **Symptom (Fleet D, 5 min Monza soak, iPhone 15):** 30 s windows of 36.4 / 38.5 / 42.0 / 43.6, then 55.6–58.7.
  Frames over 33 ms went 228 → 105 → 90 → 38, then 2–8. `memState().rGeo` grew from 399 to 458 over the first
  2 min and then stayed flat.
- **Cause (likely):** lazy GPU geometry. Rival LOD and body meshes and the flap meshes are built on first draw.
- **Owner:** #3487 (D·DP3, prebuild flap meshes during load/countdown) covers part of it. Nobody has checked
  whether the remaining growth is car LOD or scenery.
- **Verify:** the soak again after #3487 lands. Log `rGeo` per 10 s window, and the first two windows should
  reach at least 50 fps.

### G4. The frame is per-pixel bound (post/lighting), and ULTRA on a phone is 24.5 fps
- **Symptom (Fleet D):** CPU frame 3.8–6.4 ms against 17–28 ms frame intervals. Hiding props, terrain or cars
  moves fps by noise only. renderScale 0.5 gave 44–58 fps, 0.75 gave 23.5 and 1.0 gave 28.3 (one session each).
  ULTRA ran 24.5 fps with 1052 frames over 33 ms in 60 s.
- **Owner:** f5e43976 (ULTRA cap on phones, merged); #3479 (D·IP3 LOW look-post shed, open); #3529 governor §2u
  (merged).
- **Gap left:** no per-pass split. `gpuTimer` is unsupported on iOS Safari (no `timestamp-query`), and nobody has
  run a pass-by-pass ablation on a device. `TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md` §1–2: the macOS runner is
  paravirtual, so `gpu-census.yml` cannot answer this either.
- **Verify:** the GPU TEST phases (`s50`/`s75`/`s100`/`mirrorOff`) on the device, per pin, then the same with
  `apex26.tlxShadowOff=1`.

### G5. Title and race-select hitches
- **Symptom (Fleet D):** title idle after boot has 1217 ms and 694 ms rAF gaps. Race select has 1.5–1.9 s of gaps
  (115–234 ms each).
- **Owner:** #3491 (D·IP2, Settings freeze and title hitch) and #3489 (D·DP5, preview off the main thread plus
  batched sheet layout). Both are open. Re-measure after they merge. No new work here.

### G6. Losing the pinned WebGPU device sends the tab to GLX, not to three's WebGL2 backend
- **Symptom:** not seen on a device. On desktop Chromium with a forced mobile tier, the TLX-WebGPU device was lost
  20–40 s into a race (`TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md` §3).
- **Cause (code read):** `refuseTab` (`tlx.js:4429-4431`) sets `apex26.gfxClaimFail` when `_glPin === "0"`.
  For this tab that binds GLX, the classic backend, so Bryce would get a different look after a loss rather than
  TLX on WebGL2. Two reloads are allowed before the "cannot draw" card.
- **Fix (proposed, after G1):** if a pinned-WebGPU loss happens on a device, fall back to `tlxAutoGL` (three's
  WebGL2 backend) first and keep GLX as the second step. Do not change this before a device shows a loss.
- **Verify:** a phone `ctxLostReloads` reading from the GOV panel, or the probe's `lost` field across a 5 min
  soak with pin `"0"`.

### G7. Measurement and tooling gaps (not game defects)
- `__apex.diag()` with no argument starts a download on iOS Safari. The navigation aborts in-flight fetches
  (`circuit payload not resident`). Harnesses must pass `{download:false}` (Fleet D lost 3 sessions to this).
- Fleet D's probe recorded no bound backend. Any future device harness must log `__tlx.backendState()` fields
  `api`, `pin` and `forceWebGL` per session, or results get mislabeled the way §2 describes.
- Safari has no longtask or LoAF entries, so on-device attribution has to come from `RaceEntryProfile` stages, TLX
  warm stages and rAF gaps.

## 4. What Phase 2 should do first

1. G1: get one same-device A/B (BENCHMARK file from Bryce, or restored Automate minutes). Every WebGPU-specific
   fix below waits on it.
2. G2: race-entry warm on race select, sliced. It has no owner and is the biggest player-visible cost (about 13 s
   on iOS 26). This touches `js/game.js`, `js/render/three/tlx.js` and `js/render/shared/mirror-pass.js`.
   Check `who-is-on-it.mjs` for holds first.
3. G3, G4 and G5: re-measure after #3487, #3479, #3489 and #3491 land. Do not duplicate their work.
4. G6 only if G1's soak shows a device loss on the WebGPU pin.
