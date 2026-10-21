# Boot / load tooling research — 2026-10-21 (B·H8)

This note covers how to measure, profile and cut boot, title and race-entry waiting time on the phones Bryce plays on. It combines three sources:
- web research (a read-only deploy-research pass);
- a prior-art sweep of `docs/notes/` and git history;
- the phone-profile measurements behind #3382.

Each fact carries its source. "UNVERIFIED" means the primary page did not load or did not say.

## What we measured this session (phone profile: CPU ×4, Fast 4G, 844×390 touch, SwiftShader)

The probe is `scratch/h8/boot-probe.mjs` (not committed); it records boot phases, long tasks and the first-tap timing (RACE tap to `#select` shown).

- **The three vendor preload (#3382):**
  - On base, three's webgpu, core and tsl files are fetched only after game.js has evaluated: about 10–11.3 s into a cold boot, one after another. With the preload they are fetched by about 5.3 s.
  - TLX `__apex` ready: 15.2 s → 13.8 s, median of 3.
  - The cost is the `load` event, 10.0 s → 11.1 s, because the preload shares Fast 4G with game.js.
- **The first-tap delay is set by one 1.0–1.5 s task right after the title wires.** A CPU profile (`scratch/h8/title-lt-profile.mjs`) traces it to the garage title prebuild:
  `GaragePrebuild.run` → `setupCam.prebuild("car")` → `previewMesh` → `Car3D.build`, about 0.7 s, plus `framingHull`, about 0.15 s.
  A tap landing inside it waits 1.2–3.5 s. The fix is the quiet gate in `js/garage/prebuild.js`.
- **Wall-clock boot numbers vary by ±2 s between runs at n=3 on this box.** Prefer mechanism evidence: resource start and end times, which long task is which, and call counts. A single median is not enough.

## 1. Measuring boot and responsiveness

- **Long Animation Frames (LoAF):**
  - Supported in Chrome and Edge 123+ only, not Firefox or Safari ([Chrome blog](https://developer.chrome.com/blog/loaf-has-shipped), [caniuse](https://caniuse.com/wf-long-animation-frames)).
  - Entries use a 50 ms threshold. `scripts[]` carries `invoker`, `invokerType`, `sourceURL` and `executionStart` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing)).
  - Feature-detect it with `PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")`.
  - **iPhone field data cannot use LoAF.**
- **The web-vitals attribution build (`web-vitals/attribution`):** `onINP` reports `interactionTarget`, `inputDelay`, `processingDuration`, `presentationDelay`, `longAnimationFrameEntries` (empty without LoAF) and `loadState` ([README](https://cdn.jsdelivr.net/npm/web-vitals@5.3.0/README.md)). INP is good at ≤ 200 ms and poor above 500 ms, at p75 ([web.dev](https://web.dev/articles/inp)). Pin an exact version: jsDelivr lists 5.3.0 and 6.2.3.
- **Playwright:** `newCDPSession(page)` gives access to `Emulation.setCPUThrottlingRate` and `Network.emulateNetworkConditions`, which our probes use. The primary CDP and Playwright pages did not load: UNVERIFIED against them, but the probes ran with these calls.
- **For the repo:** a field probe would be the attribution build behind a dev flag, reporting INP plus input delay to the Log ring. On Chrome it adds LoAF `scripts[]` to name the culprit. On iOS we only get the Event Timing breakdown, if Safari ships it (UNVERIFIED).

## 2. WebGL2 compile and link, and first-draw pipeline stalls

- **`KHR_parallel_shader_compile` is shipped in Safari 14.1+ and iOS 14.5+** ([caniuse](https://caniuse.com/wf-khr-parallel-shader-compile)). WebKit bug 251514 (NEW) says parallel linking is not yet implemented on ANGLE's Metal backend ([bug](https://www2.webkit.org/show_bug.cgi?id=251514)). So on iOS, linking blocks even where the extension is present. GLX's KHR_parallel batching helps Chrome and may not help iPhone; measure on a device.
- **MDN:** "querying compile status is a synchronous call, which breaks pipelining". Compile all programs, link all, then check `LINK_STATUS` ([MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). three's WebGLProgram polls `COMPLETION_STATUS_KHR` only through `isReady()` ([source](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLProgram.js)).
- **Safari has rendered WebGL via ANGLE Metal by default since iOS 15.4.** WebKit bugs report Metal slower than the old OpenGL path on iPhone and iPad ([234008](https://bugs.webkit.org/show_bug.cgi?id=234008), [255987](https://bugs.webkit.org/show_bug.cgi?id=255987)); these are leads, not a WebKit statement.
- **Chrome's GPU shader disk cache** (`ShaderDiskCache`) holds ANGLE program binaries keyed by ANGLE revision ([source](https://chromium.googlesource.com/chromium/src/+/539fc83/content/browser/gpu/shader_disk_cache.h)).
  - Whether a binary survives a reload for our programs: UNVERIFIED.
  - Safari program-binary caching: UNVERIFIED.
  - **This matters most for the warm-start case:** the gpu-census relaunch leg, #3235, measures it directly. Use it before assuming a second launch is cheap.
- **Fences:** `fenceSync(SYNC_GPU_COMMANDS_COMPLETE, 0)`, then polling `clientWaitSync(sync, 0, 0)` from a timer, is the non-blocking wait ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/fenceSync)). Assets' `readLayerBytesAsync` already uses it. A GLX draw warm (hunt row 1) would use the same pattern. No primary source was found for "warm by a 1×1 scissored draw"; it is our own design and needs its own census numbers.

## 3. three.js warm (compileAsync, WebGPU pipelines)

- **`renderer.compileAsync(scene, camera, targetScene)` compiles materials only.** Texture and geometry upload still lands on the first real render.
  - A forum thread (Aug 2025) found that compileAsync alone did not remove first-render lag. Its fix was `renderer.initTexture` / `initRenderTarget` plus a dummy render with `frustumCulled = false` ([forum](https://discourse.threejs.org/t/reduce-first-render-lag-renderer-compileasync-is-not-doing-anything/86191), [docs](https://threejs.org/docs/pages/Renderer.html)).
  - TLX's draw-warm stage (`drawWarmStage`, tlx.js) is that dummy-render idea. The ~5 s draw stage in every census warm (39515338326) is consistent with upload rather than compile.
- **WebGPURenderer falls back to WebGL2 by default** (`forceWebGL` forces it; [docs](https://threejs.org/docs/pages/WebGPURenderer.html)).
  - That compileAsync uses `createRenderPipelineAsync` on WebGPU comes only from a search snippet: UNVERIFIED in source.
  - Dawn has an on-disk blob cache for D3D and Vulkan ([source](https://dawn.googlesource.com/dawn/+/e9cfa262db36400a579cac3f2720dd51233c8a8e)); whether it persists pipelines across reloads on Metal is UNVERIFIED.

## 4. Service-worker navigation preload (hunt row 4)

- **API:**
  - Call `registration.navigationPreload.enable()` in `activate` (inside `event.waitUntil`), then read `event.preloadResponse` in `fetch`.
  - It throws `InvalidStateError` without an active worker ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/NavigationPreloadManager/enable)).
  - If the worker calls `fetch(event.request)` instead of using the preload, every navigation is fetched twice ([web.dev](https://web.dev/navigation-preload/)).
- **What it saves:** service-worker boot, about 50 ms on desktop, about 250 ms on mobile, and over 500 ms in the worst cases (web.dev). Supported since Safari 15.4.
- **The catch for us:**
  - The preload request carries `Service-Worker-Navigation-Preload: true`, and web.dev recommends `Vary:` on it. GitHub Pages cannot set response headers.
  - The preload's cache mode is UNVERIFIED: MDN and web.dev do not say.
  - sw.js deliberately revalidates the shell (`cache: "no-cache"`) so the version guard never sees a stale build. A preload that may be answered from the HTTP cache (Pages: `max-age=600`) could weaken that guard.
- **Next step:** a small PR that measures the preload request's cache behaviour on the deployed site first. Otherwise keep the current fetch.

## 5. Profiling on a real iPhone

- **Web Inspector:** enable it on the phone (Settings › Safari › Advanced › Web Inspector); the device then appears in the Mac Safari Develop menu ([WebKit](https://webkit.org/web-inspector/enabling-web-inspector/), [Apple](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios.md)). Timelines (JavaScript & Events, CPU, Rendering Frames) is the iOS equivalent of a Chrome trace.
- **Automation:** safaridriver has an `automaticProfiling` capability on macOS desktop ([Apple](https://developer.apple.com/documentation/webkit/about-webdriver-for-safari.md)). Automating iOS WebDriver, and WebDriver BiDi in Safari: UNVERIFIED.
- **Without a Mac:** no verified option. The practical route is in-page instrumentation (Event Timing where present, `performance.now()` marks into the Log ring, `__apex` raceEntryStages), read back through the phone connector (skill `phone-browser`).

## 6. Off-main-thread decode (the pack Worker PR)

- **`DecompressionStream` works in Workers** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream)) and has shipped in Safari since 16.4 ([WebKit 256330](https://bugs.webkit.org/show_bug.cgi?id=256330)). So the pack's byte decoder (`_decodeStripBytes`: inflate plus `_unfilterRows`) can move to a Worker as-is and transfer the pixel buffer back.
- **Fallbacks:** keep the main-thread decoder for browsers without Workers, and the `createImageBitmap` path.
  - **The repo already has a worker pattern to copy:** `js/workers/bitmap-decode-*.js` and `js/track/build-client.js`, which load the worker by URL. The SW optional-precache entry is needed for offline.
  - OffscreenCanvas is Baseline since March 2023 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)). WebGL2 inside a Worker on Safari is UNVERIFIED, so the scratch-GL readback stays on the page (#3382 already skips it for byte layers).

## Prior art (from the sweep; do not re-report)

- **`docs/notes/PERF-HUNT-4-2026-10-14.md:697`:** `warmCarAssets` in startRaceBody shows as 1.09–2.1 s single tasks. The figure is inferred from timing and was never profiled directly. This is an open lead.
- **`docs/notes/LIVE-DEBUGGER-BOOT-PWA-2026-10-16.md:43` (O1, a hung request held a static loading card for 63.6 s) is CLOSED.**
  - #2582 (a834406a, 2026-10-17, the day after that note) gave `inject()` a 10 s onSlow hook and a 25 s deadline.
  - #3157 made that deadline count responsive time.
  - The only await outside it, `UpdateCheck.prepareLazyLoad`, is bounded to 1.5 s.
- **`docs/notes/DEFECT-LEDGER.md:1906`:** the boot canary arms before the deferred-backend fetch, and a transient `checkFramebufferStatus` failure disables post for the session with no retry. Both have no fix tag.
- **`docs/notes/ASSET-WEIGHT-AUDIT-2026-10-18.md:18`:** 276 defer scripts, 2.28 MB. This is the size basis for hunt row 12, a LAZY_RACE bundle.
- **Repeat race warm (B·H14 finding, verified 2026-10-21): REFUTED for the common paths, residue PARKED.**
  - Race entry skips its warm when the menu already warmed that world (`RaceEntryProfile.requestWarm(gfx, _warmKey === menuKey(trackIdx))`, game.js `startRaceBody`), so restart, quali→grid and retry do not re-warm.
  - The residue: Daily, lobby and agent starts bypass menuFinish and warm at entry without writing `_warmKey`, so a restart of that world warms again.
  - Recording the key at entry is blocked by three things: the dark-world second warm's "|lit" tag, the missing grid-caster (car set) part of the key, and `_warmed` never being cleared on device loss.
