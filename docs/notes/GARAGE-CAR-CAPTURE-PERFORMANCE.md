# Garage and car capture performance

The garage and car tools now use the capture stack introduced for track shots:
strict source-generation readiness, lossless fast PNG/CDP encoding, owned
Chromium teardown, and a resident browser for multi-view runs. No game geometry
or renderer implementation changes are required.

## Recorded comparison

2026-10-16, Chromium 154.0.8037.57 on Debian, four CPU cgroup quota,
SwiftShader, 640×360 PNG. Three serial cold runs per variant, each with Ferrari
hero, side and rear views. Wall time includes process/browser/scene startup and
three output images. Reference source is `fd36c75f` plus the supplied garage
export; garage reference runs used a temporary compatibility adapter to select
Three.js and the shipped custom livery, and wait for native presents. The
reference garage still rendered continuously between operations.

| Capture | Before median | After median | Measured ratio |
| --- | ---: | ---: | ---: |
| Isolated car (`render-car`) | 31.094 s | 14.868 s | 2.09× |
| Garage (`garage-angles`, TLX/WebGL2) | 37.507 s | 22.010 s | 1.70× |

All nine before/after isolated-car images had identical decoded RGBA bytes.
The nine garage pairs had matching viewport, azimuth, elevation, distance and
pan, and every output passed the bay image gate. Garage animation/render clocks
were not pinned, so these are matching-view throughput measurements, not a
pixel-equivalence claim. These small local samples do not establish hardware
GPU throughput or a universal multiplier.

The raw repetition records, per-shot readiness, image comparisons and command
lines are regenerable artifacts under `artifacts/capture-upgrade/` in the
capturing checkout. Review JPEGs are opt-in and were not used for these timing
comparisons.

## Lifecycle and image correctness

- Garage sessions pause while idle. The final scene mutation owns one strict
  barrier; capture pauses in the presenting task before IPC/encoding can queue
  more software GPU work. Success and failure restore the owner’s prior state.
- The race camera counter is stationary in the garage. Native garage captures
  use actual renderer presents; isolated car views have their own draw counter.
- `render-car` no longer guesses eight/three settling frames or converts a
  timeout into a timed-success fallback. It records readiness in `manifest.json`.
- `carshot` builds the requested time of day once rather than rebuilding after
  fixed sleeps. Three.js scene capture uses the backend’s existing PBO/fence
  readback in the task that presents the unpreserved native buffer, then crops
  and encodes its real pixels. The tiny native-frame run passed the meaningful
  scene check; no speed ratio is claimed against the invalid old compositor
  frame. Native Three.js page scope is refused; GLX page scope remains available.
- Native readback deadlines restore render ownership; late presentation cannot
  start another readback or pause the caller after timeout. Black/HUD-only
  images are failures, rather than evidence of a faster capture.

## Commands

```sh
node tools/shot/garage-angles.mjs --backend=three --livery=shipped --team=all --full-views --views=hero,front,side,rear,top,wingFront,wingRear
node tools/car/render-car.mjs --team=ferrari --views=hero,side,rear --jpeg --quality=80
node tools/car/carshot.mjs 40 day 1 artifacts/tmp/ferrari.jpg --backend=three
```

`apex_garage` accepts `backend: "three"` and `livery: "shipped"` on `op: "open"`.
The CLI keeps its GLX/catalog defaults for existing callers. `shipped` deliberately
resolves the uploaded custom livery, while `default` means catalog paint.

References: [capture stack and original measurements](SCREENSHOT-TOOL-SPEED-2026-10-10.md),
[Playwright BrowserServer](https://playwright.dev/docs/api/class-browserserver),
[CDP screenshots](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot),
[canvas drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage),
[WebGL asynchronous readback guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_non-blocking_async_data_readback).
