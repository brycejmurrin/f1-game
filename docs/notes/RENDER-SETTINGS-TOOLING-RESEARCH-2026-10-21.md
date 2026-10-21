# Render settings and real-device GPU timing: tooling research (B·H10, 2026-10-21)

Fleet B, Bryce via OrchB 24 (2026-10-21): "Hunters should use subagents to come up with new ideas to test or
holes also do a hunch of web research on how to help profile debug test this stuff". The biggest hole is GPU
time on a real phone. The only real-GPU runner, macos-latest, is an Apple Paravirtual device with no
`timestamp-query`, and its frame time does not respond to pixels or passes
(`TLX-GPU-COST-PARAVIRTUAL-2026-10-20.md` §2).

Confidence tags: **doc** means a primary page was read, **spec/forum** means a mailing list or forum, **survey**
means crowd data. A row that could not be read from a source says UNVERIFIED.

## 1. GPU timers in the browser

| question | finding | confidence |
|---|---|---|
| WebGL2 `EXT_disjoint_timer_query_webgl2` on iOS Safari / Android Chrome | Crowd data: about 72 % of Chrome reports, 0.2 % Android, 0.1 % iOS (https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2). Browsers pulled it as a high-precision timer after GLitch/Spectre; Chrome kept it at reduced resolution (https://bugzilla.mozilla.org/show_bug.cgi?id=1442504, https://www.khronos.org/webgl/public-mailing-list/public_webgl/1805/msg00009.php). **Expect it to be absent on an iPhone and on most Android phones.** | survey / spec |
| WebGPU `timestamp-query` in Chrome | Exposed when the adapter reports it, no flag, quantized to 100 µs; `chrome://flags/#enable-webgpu-developer-features` removes the quantization (https://developer.chrome.com/blog/new-in-webgpu-121). Android-specific status UNVERIFIED. | doc |
| Safari 26 WebGPU on iOS | WebGPU ships in Safari 26 for macOS, iOS, iPadOS and visionOS (https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/). `timestamp-query` on iOS is UNVERIFIED: WebKit once disabled it because Metal counter-sample-buffer creation failed (bugs 267285, 273702). | doc / UNVERIFIED |
| KHR_parallel_shader_compile on WebKit | The link still blocks the main thread (https://bugs.webkit.org/show_bug.cgi?id=251514), so an iPhone pays every mid-race link in full. | doc |

What the game already has: `__apex.gpuTimer(true)` (`js/agent/apex.js:1471`) wraps three's timestamp feature.
That is the WebGPU adapter feature, or `EXT_disjoint_timer_query_webgl2` on three's WebGL2 backend (the comment at
`js/render/three/tlx.js` M9). On an iPhone it will most likely report `{supported:false}`.

## 2. Real devices

| option | what it gives | confidence |
|---|---|---|
| **Bryce's own phone** + PHONE TEST recorder (`js/perf/phone-recorder.js`: SETTINGS > DISPLAY > METRICS > PHONE TEST) | Real frame p50/p95/p99, render scale, tier and the device facts, shared as JSON. It does not record `gpuTimer()` today (gap; idea 1 below). | in repo |
| BrowserStack Automate, Playwright on real iOS Safari | Announced June 2025 (press: https://m.thewire.in/article/ptiprnews/browserstack-becomes-the-first-platform-to-enable-playwright-testing-on-real-ios-devices-with-safari; docs https://www.browserstack.com/docs/automate/playwright/playwright-ios). Hardware WebGL on its devices and trace capture are UNVERIFIED. Page-side rAF timing (this repo's `live-frame-census.mjs` recorder) works on any device. | forum / doc |
| BrowserStack MCP (in this environment) | `runBrowserLiveSession` (an interactive Live session a person drives) and `setupBrowserStackAutomateTests` (SDK setup for Playwright/Selenium on up to 3 devices). No GPU counters; frame timing has to come from page JS. Needs Bryce's go-ahead: it is an outward, metered service. | tool schema |
| Sauce Labs / AWS Device Farm / Firebase Test Lab | Real-device web testing exists (Sauce: https://saucelabs.com/solutions/safari-testing). Firebase Test Lab targets native apps. Playwright support and performance metrics are UNVERIFIED. | forum |

## 3. Fill rate without a GPU timer

The usual method, a reasoned approach and not sourced: sweep render scale 0.5 → 1.0 on the device and fit frame
time against pixel count. The slope is the fill cost and the intercept is everything else (vertex, CPU,
present). A flat slope means the frame is not fill-bound. That is what macos-latest shows, and why its numbers
cannot rank fill. The game already exposes the lever (`__apex.renderScale(v)`, RESOLUTION LOW/MED/HIGH). The
PHONE TEST recorder samples the scale, so a sweep on Bryce's phone needs no new code. It does need a script or a
how-to.

## 4. Picking a phone resolution scale

- PlayCanvas caps `maxPixelRatio` per device tier, picked from a startup benchmark or the GPU name
  (`WEBGL_debug_renderer_info`), with a low-end Adreno/Mali regex
  (https://developer.playcanvas.com/user-manual/optimization/runtime-devicepixelratio/). doc.
- Rule of thumb: start at 0.5–0.75 of DPR, step down when frames miss budget and up with headroom
  (https://abratabia.com/webgl/webgl-mobile.php). blog.
- three.js forum: an empty scene on iOS at full DPR dropped to about 40 fps
  (https://discourse.threejs.org/t/low-fps-on-ios-mobile-with-pixel-ration-set-as-window-devicepixelratio/4963). forum.
- Thermal throttling and hysteresis: no source found. The game's governor already holds and backs off
  (`js/perf/governor.js`).

The game ships phones at DPR cap 1.5 × RESOLUTION LOW (0.5) = 633x293 on an 844x390 screen
(`js/ui/scale.js:14`). Bryce (2026-10-21) keeps LOW as the default and tries MED + UPSCALE on his iPhone.

## 5. Idea rows (sent to OrchB 24)

1. **gpuTimer in the PHONE TEST recorder.** Record `__apex.gpuTimer()` support and ms beside frame p50 in
   `phone-recorder.js`. The first real answer to "is three's WebGL2 timer present on an iPhone" costs one field.
2. **Render-scale sweep on the phone.** A PHONE TEST preset that steps RESOLUTION 0.5 / 0.75 / 1.0 for 20 s each
   and records frame time per step gives the fill slope (§3) on Bryce's own GPU, with no timer needed.
3. **BrowserStack Automate run of `live-frame-census` logic** against the live site on a real iPhone 15 and a Galaxy
   S24 (page-side rAF + LoAF + slow-call recorder; no GPU counters needed). It needs Bryce's go-ahead (metered).
4. **Mid-race link counter in the PHONE TEST recorder.** Count `linkProgram` calls after the race gate (the census
   recorder already does it). On a phone this directly measures B·H8's #3246 fix.
5. **Mirror cost A/B on the phone:** HUD > MIRROR OFF vs AUTO in PHONE TEST. On the counts it is 34 % of the
   triangles. With the lite cull tightened in this PR, the phone shows whether vertex work matters there.
6. **WebGPU timestamp on Android:** if `timestamp-query` is present on a real Android Chrome,
   `__apex.gpuTimer` gives per-render() GPU ms there. That is the only per-pass GPU number reachable.
7. **Census honesty flag:** `gpu-game-check` / `live-frame-census` should print `paravirtual: true` and refuse a
   GPU-ms verdict when the adapter is the Apple Paravirtual device, so nobody reads its fps as fill cost again.
8. **Settings help:** say plainly in AMBIENT OCCLUSION / GOD-RAYS that the two share one pass (this PR).
