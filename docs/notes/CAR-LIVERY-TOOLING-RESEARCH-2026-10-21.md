# Livery / decal pipeline: profiling tools and platform facts (B·H13, 2026-10-21)

Research for the decal hunt (PR #3383; Bryce, via OrchB 24: "use subagents … do a bunch
of web research on how to help profile debug test this stuff"). Web sources were
gathered by a research subagent; the in-repo measurements are this session's.
Sources marked *anecdote* are bug-tracker or forum reports, not vendor docs.

## What Apex 26 actually does (measured, not researched)

- No livery decal is an image file. Every atlas is painted on a 2D canvas
  (`LiveryTex.buildAtlas`); the only `createImageBitmap` is on that painted canvas
  (car-draw.js). The one `new Image()` on the livery path is a custom team logo
  (`liverytex.js setTeamLogo`), size-capped before its first draw.
- Garage livery pick at 844×390 touch, CPU ×4 (CDP `Emulation.setCPUThrottlingRate`),
  SwiftShader: 1.2–1.5 s main-thread busy per pick before PR #3383, 0.95–1.05 s
  after the swatch cache (`scratch/h13/garage-probe.mjs`, CPU profile per pick).

## 1. Canvas 2D in workers on iOS Safari

- Safari 16.4 shipped `OffscreenCanvas` with **2D only**; `getContext("webgl2")` in a
  worker returned null in that build
  ([WebKit 253431](https://bugs.webkit.org/show_bug.cgi?id=253431), c. 2023).
  Later reports put worker WebGL at Safari 17+ (*anecdote*,
  [WebKit 183720](https://bugs.webkit.org/show_bug.cgi?id=183720)).
- `OffscreenCanvas` is Baseline since March 2023
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas),
  [web.dev](https://web.dev/articles/offscreen-canvas)).
- Consequence for us: a worker-side `buildAtlas` (2D) is available on every iPhone
  we target since 16.4. The blocker is our code, not the platform: buildAtlas reads
  fonts, crest paths, LiveryDesign and logo images from the main-thread globals.
- No published numbers for `fillText`/`measureText` cost at 2048×2560; measure it.

## 2. Texture upload and mipmaps

- WebGL2 mipmaps non-power-of-two textures and allows every wrap mode; WebGL1 does
  not ([MDN, Using textures in WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL)).
  Our 2048×2560 / 1024×1280 atlases are NPOT, which is fine on WebGL2 and WebGPU.
- Size arithmetic: 2048×2560 RGBA8 = 20,971,520 B (20 MiB); a full mip chain adds
  a third, ~28 MiB. 1024×1280 is a quarter of that.
- `createImageBitmap(..., { imageOrientation: "flipY" })`: WebKit fixed it in Safari
  15.2 ([WebKit 231063](https://bugs.webkit.org/show_bug.cgi?id=231063)); SVG
  sources ignore flipY ([WebKit 231001](https://bugs.webkit.org/show_bug.cgi?id=231001)).
  Device-test before relying on it.
- Not verified here: exactly when three.js uploads (first render vs `needsUpdate`).
  Read three.js's WebGLTextures source / the WebGPU backend rather than trusting forum quotes.

## 3. ImageBitmap memory on iOS

- `ImageBitmap.close()` releases the backing store and zeroes width/height; Baseline
  since 2021 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close)).
  In this repo TLX closes the bitmap on texture dispose/retire; it is held while the
  atlas stays cached.
- No official Apple jetsam limit. Reports: WebContent killed around 1.25 GB after
  repeated WebGL canvas resizes ([WebKit 219780](https://bugs.webkit.org/show_bug.cgi?id=219780)),
  GPU-process growth on iOS 16.4 ([WebKit 253172](https://bugs.webkit.org/show_bug.cgi?id=253172)),
  a 384 MB canvas budget warning ([WebKit 195325](https://bugs.webkit.org/show_bug.cgi?id=195325)),
  reloads past ~256 MB WebGL memory (*anecdote*, [Unity forum](https://discussions.unity.com/t/webgl-memory-increment-issue-and-crash-on-ios/894771)).
  This is why PR #3383 keeps a phone at the 1024 player atlas (−~48 MB).

## 4. Measuring texture / GPU memory

- `performance.measureUserAgentSpecificMemory()` needs `crossOriginIsolated`
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory));
  GitHub Pages cannot send COOP/COEP, so it is a local dev-server tool only.
- Chrome GPU memory: `chrome://tracing` with the memory-infra GPU dumps
  ([Chromium memory-infra GPU](https://chromium.googlesource.com/chromium/src/+/main/docs/memory-infra/probe-gpu.md)).
  In-repo counts are cheaper: `atlasBytes` in car-draw.js and gpu-census.
- Safari: the Timelines tab has a Memory timeline but no texture view; the Canvas
  tab lists WebGL/WebGPU objects ([WebKit Timelines](https://webkit.org/web-inspector/timelines-tab/)).

## 5. Long tasks in Playwright

- Long Animation Frames (`long-animation-frame`) shipped in Chrome 123; not in
  Firefox or Safari. Use `PerformanceObserver.supportedEntryTypes`, `buffered: true`,
  and read `blockingDuration` plus the per-script invoker fields
  ([Chrome for Developers](https://developer.chrome.com/docs/web-platform/long-animation-frames), 2024).
  `longtask` entries exist since Chrome 58.
- CPU throttle: CDP `Emulation.setCPUThrottlingRate { rate: 4 }` on a
  `context.newCDPSession(page)`; it works in this container's headless Chromium
  (used by `scratch/h13/garage-probe.mjs`).

## Ideas for Apex 26

| idea | evidence | cost | value |
|---|---|---|---|
| A `test:car` spec that counts `buildAtlas` / `createTexture` per livery pick and fails above a budget | this session's probe | low | high: pins the pick cost |
| LoAF observer in the garage probe: report the script that owns each ≥50 ms frame | Chrome LoAF docs | low | medium |
| Paint `buildAtlas` in a worker (OffscreenCanvas 2D, Safari 16.4+) | WebKit 253431, MDN | high: globals and fonts must move | high on phones |
| Bake the number as a separate decal so a team shares one atlas (22 → 11 uploads, −50 % atlas memory) | car-draw.js decalKeyFor | medium; seam stills needed | high at race entry |
| Keep canvas sizes fixed (no per-edit resize of scratch canvases) | WebKit 219780 | low | medium on iOS |
| `measureUserAgentSpecificMemory` in a local COOP/COEP dev server for heap-per-pick numbers | MDN | medium | low-medium |
| Device-test `createImageBitmap` flipY on iOS 17+ before moving the flip into the bitmap | WebKit 231063 | low | medium |
