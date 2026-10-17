# Perf research pass, 2026-10-17 — what is left to win on an iPhone, ranked

Research lane, docs only (no `js/`, `css/`, `tools/`, `tests/` change). Question from Bryce (2026-10-17 ~09:12Z): do a large, sourced
pass on rendering, mesh building, the three.js / WebGPU / WebGL2 pipeline, JS CPU and GC, and phone performance, then turn it
into a ranked, codebase-specific plan. Bryce plays on an **iPhone in landscape**, so mobile Safari / WebKit GPU and thermal
behaviour come first.

Method: Context7 (three.js docs, `/mrdoob/three.js`), a delegated public-web read (WebKit, Apple, Chrome, Toji, three.js release
notes, MDN), a read of the render, perf, physics and track code, and every prior perf note listed under §0. **No browser run, no
GPU number.** This box is SwiftShader: counted oracles from earlier notes are quoted as counts, never as phone milliseconds.

The honest headline: **the renderer is already far down the diminishing-returns curve** (§0). Five hunts, a profiler, a governor
with a settle/hold/ceiling ladder, SGSR upscaling, chunk merging, instanced casters, packed vertices, R11F bloom, a build Worker
and a stepped car warm are all landed. What is left splits into (a) things nobody has measured **on the phone**, (b) a few
tile-GPU bandwidth trims that earlier notes already priced but left default-off, (c) CPU tail-latency and allocation, and
(d) two structural changes (resolution scaling without reallocation, index LOD). Nothing here is a 2x. The first item is a
measurement because every other row's phone win is a prediction until then.

## 0. Already done — do not recommend again

Read from the notes and the tree on 2026-10-17 (deploy tip `37794758`).

| area | landed | where |
|---|---|---|
| draw calls | chunk merge (factor 2), **dust merge** (monaco main pass 146 → 90 calls, all passes p50 190 → 144; PR #2634), mirror rungs with their own cull/res | `docs/notes/PERF-HUNT-TLX-2026-10-17.md`; `js/render/three/tlx-chunked.js:317-381`; `js/render/shared/mirror-pass.js:79-82` |
| (open now) | chunk merge factor 2 → 3 (#2643); road chunking + mesh-efficiency plan (#2631, claimed) | do not duplicate; §2 row 10 is the only overlap and is scoped away from both |
| uploads | `StreamDrawUsage` on dynamic families (hunt 4 H1), attribute-instanced caster (`tlxCasterAttr`), 4-byte strides on WebGL2, packed vertices (49.8 → 28.7 MB), update ranges | `docs/notes/PERF-HUNT-4-2026-10-14.md` shortlist; `js/render/three/tlx-shadow.js:252-285` |
| shadows | static-props lamp map + car-only rebuild (L1), lamp reach gate, sun map 1024² on phones, car map desktop only | `docs/notes/TLX-PERF-PLAN.md`; `js/render/three/tlx-shadow.js:65-66` |
| post | godray lite chain (G1), fixed per-pair materials (P2), R11F_G11F_B10F bloom where renderable, R8 SSAO, phone depth discard, FXAA folded with the mirror inset, **SGSR spatial upscale built** (decision open: #1652) | `js/render/three/tlx-post.js:96-130,264-284`; `js/render/three/tlx.js:1059` |
| compile / first draw | `compileAsync` warms, draw warm (W1), stepped race-car warm, lazy mirror warm, three 0.186.1 + 13 patches | `js/render/three/tlx.js:2608-3182`; `vendor/three-0.186.1/PATCHES.md` |
| adaptive quality | governor: resolution first, tier ladder second, crash sentinel, settle/hold/climb-survive/ceiling-expiry, two clocks (frame-counted vs ms), 5-substep physics cap | `js/perf/governor.js:14-130`; `js/game.js:8713-8734` |
| CPU / GC | alloc hunt 1: `hud-layout` 52 → 11 KB/frame, `collide` buckets 6.5 → 0; minimap pit-mark glyph cache (heavy frames 30 % → 5 %); scratch objects in AI | `docs/notes/PERF-ALLOC-HUNT-2026-10-17.md`; `docs/notes/TLX-PERF-HUNT-5-2026-10-16.md` |
| build | track build in a Worker (ON when >1 core), stepped fallback, typed accumulators, 24 m mass grid | `js/track/build-client.js`; `docs/notes/PERF-FINDINGS.md` §3 |
| tooling | `PerfSpans`, `tools/perf/profile.mjs` (`--base` A/B, noise rule), `__apex.gpuTimer`, three Inspector `?inspector=1`, `gpu-census.yml` | `docs/notes/PROFILER-DESIGN-2026-10-16.md`; `docs/notes/MEASURING-GPU-PERF-2026-09-16.md` |

Refuted or closed by measurement (also in `docs/notes/PERF-FINDINGS.md` §4 and `docs/notes/PERF-OPTIONS-2026-09-16.md` §5–9):
per-object occlusion queries (+2.1 %, superseded design), box bottom-face cull (0.27 %, not 13 %), meshopt vertex-cache
reordering (ATVR ≈ 1.0 on props, road, terrain), releasing three's CPU mirrors (blanks the chunked world), a depth pre-pass,
cross-car wheel batching, MRT-skip and ping-pong swap hoisting.

## 1. Executive summary — top 10 by expected phone impact ÷ effort

"Impact" is a prediction for an iPhone on three's WebGL2 path (the shipped phone path: WebKit takes WebGL2 on AUTO,
`js/render/three/tlx.js:341-348`; the picker says so at `js/perf/renderer-picker.js:551`). Effort: S ≤ 1 day, M ≤ 3 days, L > 3.

| # | opportunity | phone impact | effort | confidence | issue |
|---|---|---|---|---|---|
| 1 | **On-phone measurement kit and a 15-min thermal soak** (extends #1633; folds in the SGSR decision #1652) | unlocks all | S | high | #1633 (comment) |
| 2 | **Tile-GPU bandwidth trims, each default-off then A/B'd**: sky cloud cache 512², godray pair R11F, depth-only shadow target (r187), `invalidateFramebuffer` audit | low–med each, additive | S each | med | filed |
| 3 | **Allocation diet, round 2**: remaining `game.js` per-car temporaries (~60 KB/frame), `for…of` in three's `_bindUniforms` (vendor patch 15, ~16 KB/frame), HUD refit churn | med (GC pauses on JSC) | S–M | med | filed |
| 4 | **three r187 bump** when released (node build −28–34 % CPU, depth-only RTs, pipeline-key fix) | low–med | S | high | filed |
| 5 | **Thermal-aware governor + 45/30 fps render-rate tier** (physics stays 60 Hz) | high on long sessions | M | med | filed |
| 6 | **Tail-frame budget scheduler** (spread lamp rebuilds, sky bake bands, HUD fits, mirror re-cull so p95/p99 stop spiking) | med (feel) | M | med | filed |
| 7 | **WebGL2 vs WebGPU on the phone, A/B** under the existing pin; decides whether render bundles / mapped staging are ever worth porting | unknown, possibly high | S to measure | low | filed |
| 8 | **Resolution scaling without reallocation** (viewport-scaled render into fixed targets) | med–high (kills the governor's realloc hitch and peak-memory spike) | M–L | med | filed |
| 9 | **Render-object diet**: 28 instanced prop variants, wheels as a batch, brake rings (A2 / D4 / H2 of earlier hunts) | med (JS per RO ≈ 7.5–8 µs) | M | med | filed |
| 10 | **Index-LOD for distant chunks and the mirror pass** (alternate index ranges over the shared vertex buffer) | med on vertex-heavy views | M–L | low–med | filed |

Ranking logic: 1 first because #2–#10 are predictions until a phone number exists. #2–#4 are small, mostly flag-gated and
reversible. #5–#6 attack what a phone player actually feels (sustained throttle, hitches), which averages hide. #7 is cheap
to measure and could re-rank everything below it. #8–#10 are structural and carry look or memory risk.

## 2. Per opportunity

Convention: **Evidence** cites the source with its date; ⚑ = fetched and read by me or the research agent, ◇ = search snippet or
secondary. **Measure** names our instrument. A SwiftShader number never proves a GPU win (`docs/notes/MEASURING-GPU-PERF-2026-09-16.md`).

### 1. On-phone measurement kit and thermal soak

- **What.** One protocol and one capture path that records, on Bryce's iPhone, per 2,048-frame window: frame p50/p95/p99, render
  scale, governor tier, backend path, DPR, renderer memory and thermal drift over 15 minutes of a busy wet race. Run the SGSR A/B
  in the same session. #1633 is that issue (labelled `blocked`: "needs real hardware") and #1652 is the SGSR decision; neither has
  a phone protocol. Item 1 is to make them runnable by one person with one phone (§4).
- **Evidence.** Apple's thermal-state guidance (archived macOS doc, ⚑): at *Serious*, reduce GPU usage and frame rate and use
  lower-quality effects; *Critical* is immediate reduction ([RespondToThermalStateChanges](https://developer-mdn.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/RespondToThermalStateChanges.html), archived, macOS-focused). Safari exposes no
  thermal API to pages, so frame-time drift is the only signal. WebKit bug 173434 (⚑, last modified 2026-05-19): rAF is throttled to
  30 fps in Low Power Mode and in iframes; a 2024-09-23 comment reports 120 fps on iPhone 16 Pro (a comment, not a WebKit statement)
  ([bug 173434](https://bugs.webkit.org/show_bug.cgi?id=173434)).
  Our own record: the CI phone leg is unreachable (`docs/notes/MEASURING-GPU-PERF-2026-09-16.md` §6 item 6).
- **Where.** `js/perf/metrics-overlay.js` (METRICS panel; downloads only on request, line ~807), `js/perf/spans.js`,
  `js/perf/governor.js` (`frameStats`, `renderScale`), `__apex.perf()`.
- **Win.** None directly; it prices #2–#10 and settles SGSR default-ON.
- **Measure.** The window table in §4; compare windows 1 vs 8.
- **Risks.** None to the player. Keep the logger off by default (the GPU-disjoint query is a synchronous round trip; see the
  measuring note §5).
- **Effort.** S.

### 2. Tile-GPU bandwidth trims (default-off, A/B each)

Apple GPUs are tile-based deferred renderers: load/store actions and full-screen targets are the bandwidth cost.
- **Evidence.** Apple Metal Best Practices, load and store actions (◇ archived): use Clear instead of Load when prior content is
  not needed; resolve MSAA on store ([guide](https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/MTLBestPracticesGuide/LoadandStoreActions.html)). WWDC20 session 10632 (2020, ◇): load/store run per
  tile; the goal is minimum system-memory traffic ([video](https://developer.apple.com/videos/play/wwdc2020/10632)).
  MDN WebGL best practices (cited in `docs/notes/PERF-HUNT-4-2026-10-14.md`, 2026-10-14): `invalidateFramebuffer` on tile GPUs,
  avoid `getError`/`getParameter`. three r187 PR #34782 (depth-only render targets, merged 2026-10-06, per
  `docs/notes/PERF-HUNT-4-2026-10-14.md`; not re-fetched).
- **Candidates already priced in our notes, all still off or unapplied on the phone:**
  1. *Sky cloud cache 512²*: `apex26.tlxSkyCache512 = "1"` is **default off** because it is a look change (`js/render/three/tlx.js:1570-1584`);
     2 × 768² RGBA16F re-baked over 16 band frames, each load+store (hunt 3 R5). Predicted ±1.9 LSB day; never A/B'd on a frame.
  2. *Godray pair RGBA16F → R11F*: GLX does it, TLX keeps RGBA16F because alpha carries the folded SSAO term
     (`js/render/three/tlx-post.js:96-98,273-274`; hunt D7). Only matters when godrays run (not on phone MEDIUM/LOW).
  3. *Shadow targets carry an R8 colour attachment* three cannot omit before r187 (`js/render/three/tlx-shadow.js:92-110`).
     Depth-only RTs arrive with item 4.
  4. *Is bloom R11F on the phone at all?* `bloom11` needs `EXT_color_buffer_float`; the code comment says iOS Safari exposes only
     `EXT_color_buffer_half_float` (`js/render/three/tlx-post.js:111-129`). Evidence is contested: a 2020 WebKit bug says iOS had 16-bit
     but not 32-bit float render targets; a 2022 commenter on bug 247240 says iOS exposes it ([bug 247240](https://bugs.webkit.org/show_bug.cgi?id=247240),
     [bug 217107](https://bugs.webkit.org/show_bug.cgi?id=217107), ◇). The code probes at runtime, so nothing to change: **read the answer
     on the phone** (`__tlx.backendState()`, §4) and record it.
  5. *`invalidateFramebuffer` after resolve*: unverified whether three's WebGL backend issues it for the scene target; audit only.
- **Win.** Small each (a few hundred KB to low-MB per frame of tile traffic); additive. Unproven in ms.
- **Measure.** Frozen interleaved A/B (`tools/perf/profile.mjs --base`, then the phone window table); counted oracle: render-target
  bytes from `memState()`. `gpu-census.yml` on `macos-latest` is Apple GPU but not a phone.
- **Risks.** Look change for #1 and #2 (frozen pixel diff gate); iOS memory (these shrink it).
- **Effort.** S each.

### 3. Allocation diet, round 2

- **What.** The alloc hunt left ~229 KB/frame (≈ 13.7 MB/s at 60 fps) and listed rows it could not touch: per-car temporaries in
  `js/game.js` `updateCarLateral` (:5782, 17.5 KB), `updateCarBrakePlan` (:5390, 16.7 KB), `updateCar` (:4909, 16.6 KB),
  `updateCarAdvance` (:6329, 5.7 KB), `render` (6.4 KB), a `for…of` in the update loop (3.4 KB); `js/track/core/spline.js` curvature
  (6.4 KB); `js/render/glx/glx.js` `litMaterial` (5.9 KB, GLX only); `js/physics/tyre-model.js` update (5.7 KB);
  `js/lighting/frame-lights.js` (7.4 KB). Plus **F5 of the TLX hunt: three's `_bindUniforms` allocates ~16 KB/frame of iterator
  objects** (`for…of` over bindings) in the vendored bundle. Vendor edits go through `vendor/three-patches/patches.mjs` (the patch
  generator, 14 entries) as a new patch 15, never a hand edit of the min file (`vendor/three-0.186.1/PATCHES.md`).
  Also the `hud-layout.js` full refit whenever `_fitKey` changes; why it changes that often was left open (`js/ui/hud-layout.js:16`).
- **Evidence.** Our own heap-sampling method (`docs/notes/PERF-ALLOC-HUNT-2026-10-17.md`) found whole-frame bytes move with frame rate,
  so wins are claimed per site. External: object pooling, typed arrays and avoiding per-frame closures are standard JS game guidance
  but no primary source for JavaScriptCore's scavenger cost was found (**gap**; the research pass found only MDN notes that
  `performance.measureUserAgentSpecificMemory` is Chromium-only ◇ and `performance.memory` is Chromium-only ◇). So the phone
  GC cost is **unmeasured**; Safari's Web Inspector Allocations/JavaScript timelines are the instrument (§4).
- **Win.** ~60–75 KB/frame of the 229 (≈ 30 %), if the phone shows GC at all. Without a Safari timeline it is hygiene.
- **Measure.** `scratch/allocprobe.mjs` method (3 interleaved runs per arm, per-site rows, idle box); on the phone, the JavaScript
  Allocations timeline over 60 s of racing, before and after.
- **Risks.** **Physics identity**: the AI/lateral/brake sites sit in the deterministic step; keep arithmetic order, no `Math.hypot`
  → `sqrt` swaps (not bit-identical, prior note). `tests/specs/physics-characterization.spec.js` is the gate. `js/game.js` is
  ratcheted (every added line counts; extracting scratch into `js/physics/` is the way). A vendor patch needs `vendor-three.mjs --check`.
- **Effort.** S per site, M total.

### 4. three r187 bump (when released)

- **Evidence.** `docs/notes/PERF-HUNT-4-2026-10-14.md` (2026-10-14): r187 was unreleased; merged on dev: #34815 (TSL node build −28 to −34 % CPU,
  2026-10-13), #34782 (depth-only RTs, 2026-10-06), #34726 (pipeline key uses vertex-buffer layout, a correctness fix for our many
  packed layouts), disposal fixes #34610/#34690/#34601. Releases page (⚑ via the research agent): r184 16 Apr, r185 01 Jul, r186 24 Sep
  2026; `compileAsync()` stopped blocking in r184, BatchedMesh visibility/geometry-ID fixes and a render-pipeline path in r186, InstancedMesh works in render
  bundles in r185 ([releases](https://github.com/mrdoob/three.js/releases)). A web search on 2026-10-17 found **no r187 release notes**: unverified released.
- **Where.** `vendor/three-0.186.1/`, `vendor/three-patches/patches.mjs` (patches 6, 9, 10 retire at r187 per hunt 4), canary
  `tests/unit/gfx-backend-canary.test.mjs`, the bump recipe in `vendor/three-0.186.1/PATCHES.md`.
- **Win.** CPU at warm (warm.scene 3.9–9.5 s on Metal per hunt 4) and phone shadow-target memory; no per-frame win claimed.
- **Measure.** Race-entry profile (`js/perf/race-entry-profile.js`), `memState()`, then a `gpu-census.yml` leg (a software probe is not evidence, per `.claude/rules/render-tlx.md`).
- **Risks.** Re-deriving patches; Chromium-version swizzle class of break; **do not vendor a dev snapshot** (hunt 4 verdict, still right).
- **Effort.** S when r187 ships; the issue is `ready` but self-gates on the release.

### 5. Thermal-aware governor and a 45/30 fps render-rate tier

- **What.** The governor reacts to *frame time* and settles carefully, which is right for a steady load. A phone in a 20-minute
  session is not steady: it throttles, and Low Power Mode caps rAF at 30. Two additions: (a) a **slow-drift detector** (EMA of
  p50 over minutes against the first-minute baseline) that steps the tier or scale *before* frame misses show; (b) an opt-in
  **render-rate tier** that draws every 2nd (30) or 3rd-of-4 (45) physics tick while physics stays at 60 Hz. Physics already decouples:
  `tickBody` runs fixed 1/60 s steps with a 5-step cap (`js/game.js:8713-8734`), and its comment states handling is identical on a
  30 fps phone and a 120 fps display (`js/game.js:8710`).
- **Evidence.** Apple thermal guidance as in #1 (⚑ archived). Unity Adaptive Performance docs (◇, undated): GPU-level changes only
  help when the device is not already thermally throttled; lower LOD bias as warnings rise
  ([manual](https://docs.unity3d.com/Packages/com.unity.adaptiveperformance@5.1/manual/user-guide.html)). WebKit bug 215745 (◇, 2020): the 30 fps Low Power Mode cap is intentional
  ([bug](https://bugs.webkit.org/show_bug.cgi?id=215745)). Our governor already treats an externally capped device as capped
  (`js/perf/governor.js:183`); (b) generalises that to a chosen rate.
- **Win.** Even frame pacing at a lower rate beats a 60↔40 oscillation; on a throttled A-series part, halving GPU frames cuts
  heat roughly in proportion (physics and HUD cost stay). **Unmeasured on the phone.**
- **Measure.** #1's soak: windows 1 vs 8, with and without the tier forced.
- **Risks.** Feel (input-to-photon at 30), HUD/camera interpolation at the lower rate, touch steer latency, determinism (physics
  untouched, so identical), multiplayer rate (`js/net/`). The governor header's settle rules apply: every change is a realloc
  today (see #8) — do #8 first or accept it.
- **Effort.** M.

### 6. Tail-frame budget scheduler

- **What.** Averages are fine; tails are not. The TLX hunt-5 baseline has p50 3.1–4.3 ms but p95 11.2–20.1 ms (stubbed links,
  SwiftShader JS only; `docs/notes/TLX-PERF-HUNT-5-2026-10-16.md`), and `docs/notes/PERF-GAMEPLAY-HITCHES-2026-10-14.md` records periodic hitches.
  Candidates that land on the same frame: lamp/sun shadow rebuilds, a sky-cache band bake, a `hud-layout` refit, a mirror prop
  re-cull (`instEvery`, `js/render/shared/mirror-pass.js:40-44`), minimap redraws, an AI scan. A small per-frame **budget**
  (the sum of optional jobs allowed per frame, jobs queued and aged) turns coincident spikes into a flat cost.
- **Evidence.** Our measurements above; the Long Animation Frames observer already runs under `PerfSpans` (Chrome 123+, **not in
  Safari**: feature-detected, `docs/notes/PROFILER-DESIGN-2026-10-16.md`), so the phone needs Safari's timeline (§4) to see it.
  Khronos WebGL list (2015, ◇): GPU-bound rAF can wobble between 30 and 60 fps, so smooth timing over a window
  ([msg](https://www.khronos.org/webgl/public-mailing-list/public_webgl/1506/msg00003.php)).
- **Win.** p95/p99 and perceived smoothness, not mean fps.
- **Measure.** `tools/perf/profile.mjs --mode spans --repeat 3` p95/p99 rows (noise rule applies); `__apex.perf({on:true})` `loaf`
  on Chrome; Safari Rendering Frames on the phone.
- **Risks.** Deferring a rebuild changes *when* a shadow updates (look, one-frame lag); the existing lamp keys already tolerate
  one-frame defer on odd frames. Do not defer anything physics reads.
- **Effort.** M. Start by attributing the heavy frames per job with `PerfSpans`, then schedule only the top two.

### 7. WebGL2 vs WebGPU on the phone

- **What.** WebGPU shipped in Safari 26 on iOS (web.dev, 2025-11-25 ⚑: Safari WebGPU on macOS Tahoe 26, iOS 26, iPadOS 26,
  visionOS 26; whether on by default is not stated there; Cinevva 2025-09-15 ◇ says default-on). We keep iPhones on three WebGL2
  because three-WebGPU drew wrongly on an iPhone with **zero reported GPU errors** (`js/render/three/tlx.js:341-348`) and iOS/Safari
  26.0–26.5 do not fire the device-lost listener form three expects (`js/render/three/tlx.js:536`). Neither is re-tested on a current iOS.
  WebGL2 on iOS is ANGLE→Metal, which costs a translation and first-draw conversions (hunt 4: 12.6 of 30.4 MB of montreal's pack
  converted by ANGLE-Metal at first draw, since fixed by 4-byte strides).
- **Why it can matter.** If WebGPU is correct on the current iOS, three's WebGPU backend unlocks `BundleGroup` render bundles
  (static chunked world, CPU only), `writeBuffer` batching, timestamp queries per pass, and the whole WGX path. If it is not, we
  stop paying attention to it. Either way a decision beats a standing unknown.
- **Evidence for what bundles buy.** three docs (Context7, `webgpu_performance_renderbundle` example): `BundleGroup` is "fully
  supported only by WebGPURenderer with a WebGPU backend" and gives no benefit on the WebGL backend; `static` bundles are not
  re-recorded; only renderable objects, no lights ([BundleGroup](https://github.com/mrdoob/three.js/blob/dev/docs/pages/BundleGroup.html)). Toji
  (page updated 2024-01-22, outside the 12-month window, ⚑): bundles pay only if executed more than once and CPU-bound, so
  they do not help a GPU-bound frame ([render-bundles](https://toji.dev/webgpu-best-practices/render-bundles)).
- **Where.** The pin: SETTINGS → three path WEBGPU (`js/perf/renderer-picker.js:715`); `backendState()` reports `pin`/`forceWebGL`.
- **Measure.** On the phone, same race, both pins, §4 window table; read `renderer.info.render.drawCalls`/`timestamp`
  (three `trackTimestamp`, per Context7 `webgpu_storage_buffer` example) on the WebGPU leg.
- **Risks.** The old wrong-picture failure (missing bodywork, sky only): a recurring visual check, not just a number.
- **Effort.** S to measure; a port is L and only opened by a good result.

### 8. Resolution scaling without reallocation

- **What.** `setRenderScale` → `resizeNow` re-creates every HDR/bloom/SSAO/godray target (`js/render/three/tlx.js:3773,4130`). The governor
  header spends ~100 lines on this cost: it holds, backs off and caps *because* each step is a visible hitch
  (`js/perf/governor.js:14-130`); hunt 5 measured 321 ms of a 30 s window in two steps on SwiftShader (F3). The standard alternative
  is **dynamic resolution into fixed-size targets**: allocate at the cap once, render into a sub-rectangle (viewport/scissor),
  scale UVs in every pass that samples it, clamp at the rectangle edge. A step becomes a uniform change, so the governor can
  step finely and often, and iOS never holds old and new target sets at once (a jetsam risk; the project already treats ~100 MB as
  a kill line on an iPhone SE, `docs/notes/CI-RENDERING-PERFORMANCE.md` ~426).
- **Evidence.** Unity Dynamic Resolution manual (◇, undated: scale-to-target pattern) ([manual](https://docs.unity3d.com/es/Manual/DynamicResolution.html)). Apple load/store guidance as #2. three's
  `RenderTarget` exposes `viewport`/`scissor` (Context7 three docs, WebGL/WebGPU renderers); sampling a sub-rect needs a UV scale
  uniform in each of ~15 post quads (`docs/notes/TLX-PERF-HUNT-2026-10-11.md` §D: nothing to cut there without a look change, but
  this is not cutting passes).
- **Win.** No realloc hitch per governor step, finer steps (the `<0.02` contract today), lower peak memory, and a cleaner base
  for #5. Not a steady-state speedup.
- **Measure.** Count `createTargets` calls and `memState()` peak across a forced-throttle race; frame max/p99 around steps.
- **Risks.** Edge bleed in blur/bloom/SSAO taps (clamp), SGSR's own source rectangle (`setSpatialUpscale`), GLX/WGX parity if it
  is TLX-only, the `tlx.js` ratchet (6061 lines). A pixel diff at scale 1.0 must be identical.
- **Effort.** M–L. Land after #1 shows whether steps actually hitch on the phone.

### 9. Render-object diet

- **What.** Each three RenderObject costs ~7.5–8 µs per frame and ~35 µs per post pass (hunt 4), and `updateForRender` was 1.1 s of
  a 30 s window (hunt 5). The census still shows ~90 main + ~37 mirror + ~49 sun draws per frame after the dust merge. Leftovers
  priced earlier and not built: collapse the ~28 instanced prop variants (A2, `docs/notes/TLX-PERF-HUNT-2026-10-11.md`), wheels as one
  `BatchedMesh` (D4: −37 RO, ≈1.1 ms/frame on Mac WebGL2 under braking), brake rings as one transparent instanced run
  (H2: −36 RO, blend-order look risk).
- **Evidence.** three docs (Context7): `BatchedMesh` takes one material and many geometries, multi-draws through
  `WEBGL_multi_draw` **and falls back to a per-draw loop with `_gl_DrawID` uniforms when the extension is absent**, so on a
  device without it a "batch" can cost *more* CPU than separate meshes; `perObjectFrustumCulled` and `sortObjects` default on
  ([BatchedMesh](https://github.com/mrdoob/three.js/blob/dev/docs/pages/BatchedMesh.html)). Our own earlier finding: multi-draw at 1.03 ranges per call was slower (`docs/notes/MEASURING-GPU-PERF-2026-09-16.md` §4). Whether
  Safari exposes `WEBGL_multi_draw` was **not verified** — check `gl.getExtension` on the phone before any BatchedMesh work.
- **Win.** CPU per frame (a few hundred µs to ~1 ms); phone CPU likely not the bottleneck, so **gate this on #1 showing JS-bound
  frames**.
- **Measure.** `renderer.info.render.drawCalls` and RO count (`memState()`), `PerfSpans` `render`.
- **Risks.** Blend order (H2), car livery uniform paths (`js/car/car-draw.js`), flaps/wheel animation; do not migrate shared-buffer
  track chunks to BatchedMesh (it copies geometry; #2631 says the same).
- **Effort.** M.

### 10. Index-LOD for distant chunks and the mirror pass

- **What.** The chunked world shares one position/normal/colour/material buffer across all chunks and carries only an index list
  per chunk (`js/render/three/tlx-chunked.js`; `docs/notes/PERF-FINDINGS.md` §2n: 1.24 MB of indices against a 13.9 MB track). So a
  **coarser index list over the same vertices** is cheap to store and needs no new vertex data. The mirror pass draws ~148 k
  triangles against the main pass's ~176 k at the chase camera (monaco census, `docs/notes/PERF-HUNT-TLX-2026-10-17.md`) at 0.4–1.0×
  resolution (`js/render/shared/mirror-pass.js:79-82`) and is a fine first user; far chunks in the main pass are the second.
- **Why it can matter on Apple GPUs.** A TBDR runs the whole vertex stage and bins primitives before shading, so triangle count
  costs parameter-buffer traffic even when pixels are few; this project measured the macOS frame as GPU-bound but *not* fragment-bound
  (19.17 ms at 0.75 MP vs 20.34 ms at 0.45 MP, `docs/notes/RENDER-PERF-PLAN-2026-09-16.md` §1). That is a Mac, not a phone.
- **Evidence.** meshoptimizer's simplifier is the standard tool; the JS module is low-level and its decoder is WASM with
  SIMD/scalar variants chosen automatically ([npm](https://npmjs.com/package/meshoptimizer), ◇). Earlier verdicts: `meshopt_simplify` at
  bake time was rejected because the repo has no build step and the pack would be 50 circuits × ~28 MB
  (`docs/notes/PERF-OPTIONS-2026-09-16.md` §3.3). That reasoning does **not** cover a **runtime, index-only** simplification of
  props built at track-build time inside the existing Worker (`js/track/build-client.js`), keeping vertices and only dropping
  triangles. Quad-soup props (2.0–2.26 verts/tri) simplify poorly with edge collapse; **ground and terrain ribbons**, which are
  most of the big triangles, are the better target. #2631 (claimed) owns road chunking and mesh efficiency; coordinate before building.
- **Win.** Unknown; the plan is to *count first*: triangles in the mirror and beyond 150 m (`tools/check/occlusion-estimate.mjs`
  style) and only then decide.
- **Measure.** Counted triangles per pass (exact, here); phone window table for the effect.
- **Risks.** Popping and silhouette change (distance hysteresis), shadows (casters must keep full index), lamp cells and chunk AABBs
  unchanged, `ChunkBins` locality. Look change, so frozen pixel A/B and a rendered lap.
- **Effort.** M–L; a counting step first (S).

## 3. Things NOT to do, and why

| idea | why not | source |
|---|---|---|
| Render the game in a Worker with `OffscreenCanvas` | Large rewrite (three, `game.js` and the HUD share the main thread; input and DOM stay there), Safari WebGL2/WebGPU-in-worker support **not verified** by this pass, and a Worker already runs the track build. The frame is GPU-bound on tile hardware, not main-thread-bound, as far as measured. | MDN OffscreenCanvas/`getContext` page says the webgl2 context is available in workers but gives no Safari version (◇ search 2026-10-17) |
| KTX2 / Basis (ASTC, ETC2) for textures | Our texture memory is render targets, cube/cloud caches and the **canvas-painted livery**, which cannot be pre-compressed; the pack textures are 128/256 px arrays. The loader needs a WASM transcoder and `detectSupport`, and format support is per device. Revisit only if a heap census shows static textures matter. | three KTX2Loader docs (Context7: "no single compressed format is supported on every device"); `docs/notes/PERF-FINDINGS.md` §2m–2q (bytes were geometry and passes); ETC1 alpha-black on iPad (forum 2021 ◇) |
| WASM SIMD for mesh building | Build runs in a Worker already; `docs/notes/PERF-OPTIONS-2026-09-16.md` §8 measured the worker trade, and its uploads (119–318 ms) not the maths dominate. No evidence the maths is the wall. | `docs/notes/PERF-OPTIONS-2026-09-16.md` §1–§5 |
| Shipping `BundleGroup` render bundles | Only WebGPU; the phone is on WebGL2 and GPU-bound. Wait for #7. | three docs (Context7); Toji render-bundles (⚑, 2024-01-22) |
| Per-object occlusion queries, multi-draw at 1.03 ranges/call, bottom-face cull, vertex-cache reorder | Measured negative. | `docs/notes/PERF-FINDINGS.md` §4; `docs/notes/RENDER-PERF-PLAN-2026-09-16.md` §4 |
| Releasing three's CPU geometry mirrors | Blanks the chunked world; upstream says do not. | `docs/notes/PERF-FINDINGS.md` §2s |
| A dev snapshot of three, or an uncited tolerance widening to get green | Hunt 4 verdict; AGENTS.md rule 9. | `docs/notes/PERF-HUNT-4-2026-10-14.md` |
| Drop physics below 60 Hz or add AI update-rate LOD to save CPU | Breaks determinism and physics identity; no profile says CPU is the phone limit. Measure `PerfSpans` `physics` on the phone first. | AGENTS.md §Physics |
| Chase mean fps from SwiftShader | CPU-only numbers do not prove a GPU win. | `docs/notes/MEASURING-GPU-PERF-2026-09-16.md` §6 |
| Lower precision (`mediump`/`f16`) for lighting on the phone | Not researched to a source in this pass, and ANGLE/WebKit handling of precision qualifiers was **not verified**; do not start without it. | (gap) |

## 4. Measurement plan for the iPhone itself

Everything below is something Bryce can run; none is automatable from CI (`docs/notes/MEASURING-GPU-PERF-2026-09-16.md` §6: the phone leg is
unreachable). Apple's sources are archived or search results: verify menu names on the device's iOS version.

**Setup (once).** iPhone: Settings → Apps → Safari → Advanced → **Web Inspector** on. Mac with Safari: Settings → Advanced → **Show
features for web developers**; plug in, then **Develop → \<iPhone\> → \<the game page\>** (steps from a third-party guide,
[macmyths](https://macmyths.com/how-to-debug-websites-on-an-iphone/), ◇; Apple's [Timelines help](https://support.apple.com/ar-bh/guide/safari-developer/devcbd090540/mac) was not fetched).
Low Power Mode **off** (it caps rAF at 30), brightness fixed, Do Not Disturb on, charging state noted, phone cased or uncased (note which).

**A. Cold facts, 2 minutes.** In the Web Inspector console on the page: `GLX.__tlx.backendState()` (path, pin, forceWebGL),
`__apex.agentHelp()` for the hook list, `__apex.perf()` for the governor view; record `devicePixelRatio`, and from a console probe
`gl.getExtension("EXT_color_buffer_float")`, `…("EXT_color_buffer_half_float")`, `…("WEBGL_multi_draw")`, `…("EXT_disjoint_timer_query_webgl2")`.
This answers #2.4, #9 (multi-draw) and #7 (path) before any build. Record iOS version and iPhone model.

**B. Soak, 15 minutes (issue #1633).** Fixed circuit, wet, full grid, chase camera. Every 2 minutes read and note
`__apex.perf()` p50/p95/p99, `renderScale()`, governor tier, and `memState()` retained counts and bytes. The decay of p50 and
scale from minute 1 to minute 15 *is* the thermal effect (#5). Repeat once with GRAPHICS preset MEDIUM and once with SGSR on
(#1652).

**C. Safari Timelines, 60 s each.** Record **JavaScript & Events** (frame cost by function: compare with the §0 profile), **Rendering
Frames** (frames that miss the 16.7 ms budget; the tail for #6), **CPU** (per-thread; is the main thread saturated for #9?), and
**Memory/Allocations** over a lap (the GC question for #3, which Chromium's `performance.memory` cannot answer on Safari ◇).
**Energy** if available on that iOS. Record on a hot phone (minute 12) as well as a cool one.

**D. Path A/B (issue for #7).** Same race on the WebGL2 default and on THREE PATH: WEBGPU; screenshot a fixed grid view on each and
look for the old wrong-picture failure; read `renderer.info.render.drawCalls` and `timestamp`; the measurement notes' rules apply
(interleave, floor first, counted oracle beside every timing).

**E. GPU frame capture (optional).** Xcode's Metal frame capture works on a device through a Mac; Apple's guide is for native apps
([Capturing a Metal workload](https://developer.apple.com/tutorials/data/documentation/xcode/capturing-a-metal-workload-in-xcode.md), ◇) and no Safari-specific guide was
found. Use it only if A–D leave a GPU question.

**Record** results in a new `docs/notes/` file per session, with device, iOS, path, preset, scale and the window table
(frame p50/p95/p99, scale, tier, memory, minutes since start).

## 5. Sources (with what was and was not verified)

- three.js docs via Context7 (`/mrdoob/three.js`, queried 2026-10-17): `BundleGroup`, `BatchedMesh`, `KTX2Loader`, `renderer.info`,
  `trackTimestamp` / `resolveTimestampsAsync`, the `webgpu_performance_renderbundle` and `webgpu_mesh_batch` examples. Context7 returns
  dev-branch docs, which may be newer than our vendored 0.186.1.
- three.js releases page, r184–r186 (research agent, fetched; years inferred 2026). r187: no release notes found 2026-10-17.
- Toji, render bundles ([page](https://toji.dev/webgpu-best-practices/render-bundles), updated 2024-01-22, ⚑) and bind groups
  ([page](https://toji.dev/webgpu-best-practices/bind-groups), undated, ⚑).
- web.dev, WebGPU in major browsers (2025-11-25, ⚑); WebKit Bugzilla 299237, 173434 (⚑), 215745, 247240, 217107, 241399 (◇).
  The official WebKit/Apple Safari 26 WebGPU wording was **not retrieved** (the Safari 26.0 release-notes page returned only a title).
- Apple: thermal state guidance (archived, ⚑), Metal Best Practices load/store (◇), WWDC20 10632 and WWDC19 513 (◇), Metal feature
  tables PDF (unreadable: iOS max texture size and MSAA counts **unverified**).
- MDN WebGL best practices (cited by hunt 4), `OffscreenCanvas.getContext`, `performance.memory`, `measureUserAgentSpecificMemory`.
- Not found or not searched: JSC GC cost, PCF/cascade costs on Apple GPUs, KTX2 ASTC-on-iOS size numbers, Spector.js, CDP tracing
  details beyond our own `tools/perf/profile.mjs --mode trace`, `shader-f16` / precision on Safari.
- Our own: the notes listed in §0, `js/` and `vendor/` as of tip `37794758`.

## 6. Next step

Issues for items 1–10 are linked from the PR body. Pick #1 and #2.4/#9's console probes first (a 20-minute phone session); that
re-ranks the rest.
