# Perf research pass, 2026-10-17 — what is left to win on an iPhone, ranked

Research lane, docs only (no `js/`, `css/`, `tools/`, `tests/` change). Question from Bryce (2026-10-17 ~09:12Z): do a large, sourced
pass on rendering, mesh building, the three.js / WebGPU / WebGL2 pipeline, JS CPU and GC, and phone performance, then turn it
into a ranked, codebase-specific plan. Bryce plays on an **iPhone in landscape**, so mobile Safari / WebKit GPU and thermal
behaviour come first.

Scope addition (Bryce via the orchestrator, ~09:14Z): "it should also research three js". §7 is a dedicated three.js section
(version, backends on iOS, unused features, other games, profiling) with a **three.js upgrade: yes/no/when** recommendation.

Method: Context7 (three.js docs, `/mrdoob/three.js`), two delegated public-web reads plus my own fetches (WebKit, Apple, Chrome,
Toji, three.js releases, migration guide and issues, MDN browser-compat data, web3dsurvey), a read of the render, perf, physics
and track code, and every prior perf note listed under §0. **No browser run, no GPU number.** This box is SwiftShader: counted
oracles from earlier notes are quoted as counts, never as phone milliseconds. The second web pass changed three findings
(float render targets, multi-draw and the GPU timer on iOS; §2.2, §2.9, §4) and added one (three's WebGL backend overhead; §2.7, §7).

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
| 4 | **three's WebGL fallback never deletes GL programs, shaders or VAOs** (three #34597, fixed for VAOs by #34610 in r187; our vendored 0.186.1 has zero `deleteVertexArray`/`deleteProgram`/`deleteShader`): count creates vs deletes across track switches, backport as vendor patch 15 now, full r187 bump when released (also node-build CPU −28–34 %, depth-only RTs) | med–high if it holds memory (jetsam) | S | med (the leak is verified in three's source; its size in our scene is not) | filed (#2651, rewritten) |
| 5 | **Thermal-aware governor + 45/30 fps render-rate tier** (physics stays 60 Hz) | high on long sessions | M | med | filed |
| 6 | **Tail-frame budget scheduler** (spread lamp rebuilds, sky bake bands, HUD fits, mirror re-cull so p95/p99 stop spiking) | med (feel) | M | med | filed |
| 7 | **Three-way phone A/B: GLX (plain WebGL2) vs TLX on three's WebGL backend vs TLX on WebGPU**; three's WebGL backend is reported ~31 % slower per `render()` and +80 % GL calls than plain WebGLRenderer (three #30560); decides whether GLX, bundles or staging are worth anything on the phone | unknown, possibly high | S to measure | low–med | filed |
| 8 | **Resolution scaling without reallocation** (viewport-scaled render into fixed targets) | med–high (kills the governor's realloc hitch and peak-memory spike) | M–L | med | filed |
| 9 | **Render-object diet**: 28 instanced prop variants, wheels as a batch, brake rings (A2 / D4 / H2 of earlier hunts) | med (JS per RO ≈ 7.5–8 µs) | M | med | filed |
| 10 | **Index-LOD for distant chunks and the mirror pass** (alternate index ranges over the shared vertex buffer); Apple says vertex count is not a worry on its TBDR, so count first | low–med | M–L | low | filed |

**three.js upgrade: not a version bump today; yes when r187 ships; one backport sooner.** We vendor 0.186.1, which is the latest
release (npm `latest` = 0.186.1, published 2026-09-24; r187 is not published as of 2026-10-17). The one thing worth not waiting for
is the WebGL-fallback disposal fix (row 4): the fallback is exactly the iPhone path, and the vendored bundle contains no GL delete calls for
programs, shaders or VAOs (§9a). Take the rest with r187 (node-build CPU, depth-only RTs, MSAA/depth fixes in the WebGL backend); its
breaking changes mostly miss us (§7a). Never a dev snapshot.

Ranking logic: 1 first because #2–#10 are predictions until a phone number exists. #2–#4 are small, mostly flag-gated and
reversible; #4 is the only row with a verified upstream defect on the shipped phone path, and its size is measurable here by
counting GL object creates and deletes (an exact oracle, no GPU needed). #5–#6 attack what a phone player actually feels (sustained throttle, hitches), which averages hide. #7 is cheap
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
     `EXT_color_buffer_half_float` (`js/render/three/tlx-post.js:111-129`). The second web pass **points the other way**:
     web3dsurvey reports `EXT_color_buffer_float` on iOS at 100 % (fetched 2026-10-17; the page states no date or sample method)
     and MDN-mirror data lists Safari iOS from 15 (◇). Old WebKit bugs said the opposite for iOS at the time (216010, 2020; 247240
     comment, 2022; ◇). Likely outcome: **bloom is already R11F on the phone and the code comment is stale**; the 32-bit float
     *blend* extension `EXT_float_blend` is a different thing (about 40 % on iOS per the same survey, ◇) and we do not need it.
     The code probes at runtime, so nothing to change: read the probe on the phone (§4 A) and fix the comment.
  5. *Draw order for hidden-surface removal.* WWDC20 10602 (⚑ transcript) recommends sorting draws by visibility state: opaque first, then alpha-test/discard/depth-feedback, then translucent;
     avoid interleaving opaque and non-opaque meshes, so the GPU's hidden-surface removal stays effective. TLX gives every dynamic record `renderOrder = i` (the GLX submission index,
     `js/render/three/tlx.js:4606,5318-5319`), so three sorts by caller order and HSR depends on how `js/game.js` emits records; decals use `alphaTest` (`js/render/three/tsl-fx.js:343`). An audit of the emit order
     against that checklist is cheap and changes no pixels if it only moves discard/alpha draws after opaque ones. This runs through ANGLE-Metal, so treat the benefit as direction, not proof.
  6. *Load/store actions.* Apple (⚑ 10632): load and store actions "consume the majority of your app's system bandwidth"; clear instead of load when contents are not needed; store only what you need; fewer passes means less load/store
     traffic. Our post chain is ~15 full-screen draws and a mirror pass; three's WebGL backend does call `invalidateFramebuffer` on the MSAA resolve path and, for non-MSAA targets, on depth when three allocated it
     (raw `src/renderers/webgl-fallback/WebGLBackend.js`, ⚑, ~lines 1640 and 1665), so the audit in item 7 below is partly answered: the scene target samples its depth later (`resolveDepthBuffer`), so depth is kept by design (`js/render/three/tlx-post.js:869`).
  7. *Framebuffer discards, answered in part.* three's WebGL backend issues `invalidateFramebuffer` itself (see 6), so the remaining audit is only which of our own targets (post ping-pong RTs, mirror) end a pass with contents nobody reads.
     Apple's retired OpenGL ES guide for A7 and later (⚑ fetched 2026-10-17) says: "Always use framebuffer discard operations
     when your framebuffer contents are no longer needed. The penalty for not doing so is higher than it was on earlier GPUs."
     It also caps render targets at four attachments and 128/256 bits total on A7/A8 (our scene target is RGBA16F plus R8, fine)
     ([guide](https://developer.apple.com/library/archive/documentation/3DDrawing/Conceptual/OpenGLES_ProgrammingGuide/BestPracticesforAppleA7GPUsandLater/BestPracticesforAppleA7GPUsandLater.html), retired; OpenGL ES deprecated in iOS 12). This is native GL, not ANGLE-Metal, so
     treat it as direction, not proof.
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
- **JavaScriptCore's side (third pass).** Primary: WebKit's "Understanding Garbage Collection in JavaScriptCore From Scratch" (2022-07-29, ⚑): a small eden plus an old space; "when the eden is full, an
  eden GC is invoked"; marking is mostly concurrent, but a Space-Time Scheduler limits the mutator's time when it allocates too quickly, which the author estimates costs "at least 30 %"
  of mutator throughput while a GC runs, with a stop-the-world fallback in the extreme ([post](https://webkit.org/blog/12967/understanding-gc-in-jsc-from-scratch/)). WebKit's Speedometer 3.0 post (2024-04-10, ⚑): WebCore now hints JSC to run GC and
  sweeping **between rendering updates, backing off when rAF callbacks are imminent**; Eden or full GC runs early only if enough idle time remains ([post](https://webkit.org/blog/15249/optimizing-webkit-safari-for-speedometer-3-0/)). A game that is busy every frame
  has little idle time, so its allocation rate (13.7 MB/s here) is paid inside frames. Riptide (2017-01-20, ⚑) put remaining pauses at about 1 ms; the cost is the throttling, not a long pause. That is the mechanism for #2650, still unmeasured on the phone.
- **Caveat on the vendored `for…of` claim.** The 16 KB/frame `_bindUniforms` iterator figure came from V8's heap sampler in Chromium (hunt 5 F5). JavaScriptCore's FTL has allocation sinking and inlines `ArrayIterator.next` in `for…of` (WebKit commit "FTL should sink object allocations"; an exploit write-up, ◇),
  so those iterators may not allocate on iOS at all. **Do the vendor patch only after a Safari JavaScript Allocations timeline (heap snapshots every 10 s, ⚑ Timelines tab help) shows it**; the `game.js` rows are plain object and array creation and survive that doubt.
- **Win.** ~60–75 KB/frame of the 229 (≈ 30 %), if the phone shows GC at all. Without a Safari timeline it is hygiene.
- **Measure.** `scratch/allocprobe.mjs` method (3 interleaved runs per arm, per-site rows, idle box); on the phone, the JavaScript
  Allocations timeline over 60 s of racing, before and after.
- **Risks.** **Physics identity**: the AI/lateral/brake sites sit in the deterministic step; keep arithmetic order, no `Math.hypot`
  → `sqrt` swaps (not bit-identical, prior note). `tests/specs/physics-characterization.spec.js` is the gate. `js/game.js` is
  ratcheted (every added line counts; extracting scratch into `js/physics/` is the way). A vendor patch needs `vendor-three.mjs --check`.
- **Effort.** S per site, M total.

### 4. three's WebGL fallback never frees GL programs, shaders or VAOs (and the r187 bump)

- **What.** three issue #34597 (opened 2026-09-17, closed 2026-09-20, milestone r187; ⚑ fetched): `Pipelines._releaseProgram` calls the
  stats-only `info.destroyProgram` and never `backend.destroyProgram`, and `WebGLBackend.destroyProgram` only does a map delete, so
  `gl.deleteProgram` and `gl.deleteShader` never run; `vaoCache` keys on a monotonically growing attribute id, so every scene swap
  or re-upload creates new VAOs and `gl.deleteVertexArray` appears nowhere under `webgl-fallback/`. The reporter measured 4 create/dispose
  cycles: programs 21 created / 0 deleted, shaders 38 / 0, VAOs 25 / 0 (a public-API reproduction), while buffers were freed (88 deleted).
  They found it chasing an iOS WebKit GPU-process jetsam kill on an iPhone 8 (iOS 16.7), where WebGPURenderer falls back to WebGL2
  ([#34597](https://github.com/mrdoob/three.js/issues/34597) ⚑). The fix for VAOs is PR #34610 "WebGPURenderer: Improve VAO caching and disposal"
  (merged 2026-09-20, r187, commit d64e6bd: VAO logic moved into `WebGLVertexArrayUtils`, new backend method `deleteVertexState()`, stable attribute
  id; ⚑). The program/shader half was not described in that PR's text; hunt 4 lists #34690, #34601 and #34603 as the program/pipeline disposal PRs (not re-fetched).
- **Is it ours?** Yes by construction: TLX on iOS runs that exact backend (`js/render/three/tlx.js:341-348`). **Verified here:** the vendored
  `vendor/three-0.186.1/three.webgpu.min.js` contains `deleteVertexArray` ×0, `deleteProgram` ×0, `deleteShader` ×0 (and `deleteBuffer` ×3, `deleteTexture` ×1,
  `deleteFramebuffer` ×6). TLX already patches around one disposal problem at the other end (`js/render/three/tlx.js:6004-6022`, the `WEBGL_lose_context` mask).
- **Why it matters on a phone.** Programs and shaders are small in number for us (hunt 5: 19 materials, no growth), so the VAO side is the
  suspect: a track switch or a race restart re-uploads geometry under new attribute ids, so each switch adds a VAO set. Whether a VAO that is never
  deleted keeps its attribute buffers alive in ANGLE-Metal (so that `gl.deleteBuffer` frees nothing until the VAO dies) is a **hypothesis, not
  verified**: it is how GL object lifetimes usually work (an object attached to another object is released when the last reference goes), but no source for
  ANGLE-Metal's `VertexArrayMtl` was read. If true, a 13–28 MB track pack could survive each switch. The earlier measured leaks (`docs/notes/PERF-FINDINGS.md` §2m–2s)
  were attributed to other causes; hunt 5 F2 found the retained counts flat across switches, but those counts are three's `renderer.info`, not GL objects,
  and `renderer.info.programs` is empty on the WebGL backend with stubbed links.
- **Measure (exact, runs in this container).** Wrap `WebGL2RenderingContext.prototype.createVertexArray/deleteVertexArray/createProgram/deleteProgram/createShader/deleteShader`
  in the stubbed-link probe of `docs/notes/TLX-PERF-HUNT-5-2026-10-16.md` §Method, switch circuits five times, print creates minus deletes. Growth per switch is the
  finding; zero growth closes the item. On the phone, Safari's Memory timeline across 5 switches (§4 C).
- **Fix options.** (a) vendor patch 15: backport #34610 and the program/shader deletion from the r187 branch into `vendor/three-patches/patches.mjs` (the exact-count patch generator
  stops if the needle shape changed; the canary test pins it); (b) wait for r187. Both retire the same bytes. The r187 bump additionally brings #34815 (TSL node build −28 to −34 % CPU,
  merged 2026-10-13), #34782 (depth-only render targets, 2026-10-06), #34726 (pipeline key includes the vertex-buffer layout) and WebGL-backend fixes: "Fix MSAA with default depth textures" (#34927),
  "Fix FloatType depth textures with MSAA" (#34768; our desktop PCSS copy uses FloatType depth, `js/render/three/tlx-shadow.js:103`), "Use correct depth texture for clear" (#34928)
  (merged 2026-10-03 to 2026-10-09, r187 milestone ⚑). The migration guide's 186 → 187 section (⚑) mostly misses us (§7a).
- **Evidence for timing.** r187 is not published: npm `latest` for `three` is 0.186.1 (2026-09-24, from the registry on 2026-10-17); the releases page shows r186 as Latest.
- **Where.** `vendor/three-0.186.1/`, `vendor/three-patches/patches.mjs`, canary `tests/unit/gfx-backend-canary.test.mjs`, recipe in `vendor/three-0.186.1/PATCHES.md`; probe under `tools/gfx/` (a new tool is outside this lane).
- **Risks.** A patch that deletes a VAO still in use breaks rendering (the reporter's own warning: three gives no signal that a VAO is dead, so #34610 re-keys by stable id first);
  re-deriving patches at the bump; **no dev snapshot**.
- **Effort.** S for the count; S–M for the backport; S for the bump once r187 ships.

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
- **How much throttle to expect (third pass).** 3DMark Wild Life Extreme's 20-minute stress test reports a "stability" ratio (lowest loop over highest): iPhone 17 Pro 64 %
  ([GSMArena](https://m.gsmarena.com/apple_iphone_17_pro-review-2887p4.php), 2025-09-30 ⚑); iPhone 17 Pro Max 65.2 % and 68.4 % over two runs and iPhone 16 Pro Max 54.7 % and 67.7 %
  ([Tom's Guide](https://www.tomsguide.com/phones/iphones/iphone-17-pro-max-endurance-tested-does-the-new-design-actually-improve-performance), ◇ snippet; the article body did not load). So a saturated phone GPU runs roughly a third
  slower by the end of a long session. Our game is not 3DMark, so the real loss is unmeasured, but it sets the order of magnitude the governor has to absorb. WWDC18 session 612
  (⚑ transcript, wording approximate): "design for sustained performance"; "stay at 30 frames per second if you cannot sustain 60 for ten minutes or more"; lower intermediate
  render-target resolution and drop post-processes under thermal pressure ([session](https://developer.apple.com/videos/play/wwdc2018/612)).
- **rAF rate is 60 Hz by default, and our game has no render-rate cap.** Safari renders web content at 60 Hz by default on ProMotion hardware; 120 Hz needs Settings → Safari → Advanced → Feature Flags →
  turn off "Prefer Pages Rendering Updates near 60fps" ([heise, 2026-02-12 ⚑](https://www.heise.de/en/news/Safari-browsing-with-ProMotion-Initially-deactivated-on-iPhone-Mac-Co-11174983.html);
  WebKit bug 173434 ⚑: iPhone Pro support arrived in the iOS 18 public release per user testing; Low Power Mode caps rAF at 30). `tick(now)` runs the full render on every rAF
  (`js/game.js:8605-8640`, no cap in `js/perf/governor.js`). A player who turns the flag off, or a future WebKit default flip, doubles GPU work and heat with no governor rung to refuse it.
  Cheap guard in this issue: measure rAF cadence at boot and render every second rAF when it is ≥ ~100 Hz (physics already steps fixed).
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

### 7. Three-way phone A/B: GLX vs TLX-on-WebGL vs TLX-on-WebGPU

- **What.** WebGPU shipped in Safari 26 on iOS: WebKit's own "WebKit Features in Safari 26.0" (2025-09-15, ⚑) says WebGPU "is now
  shipping in Safari 26.0 for macOS, iOS, iPadOS, and visionOS", "supersedes WebGL" and "is preferred for new sites and web
  apps"; it does not say "default" in those words ([post](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). Safari 26.2 (2025-12-12, ⚑) added GPUTexture as depth-stencil/resolve
  attachment ([post](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/)); the 26.6 notes (2026-07-27, ⚑) list no WebGPU/WebGL item. **A Safari 26.4 regression broke WebGPU
  rendering black on macOS, iPadOS and iOS** (WebKit bug 315186, reported 2026-05-20, fixed 2026-05-22 as 313712@main; cause: buffer-map
  counting; iOS 26.3.1 was fine; [bug](https://bugs.webkit.org/show_bug.cgi?id=315186) ⚑, [Rerun #12788](https://github.com/rerun-io/rerun/issues/12788) ⚑, which switched its Safari default back to WebGL).
  That is a second "silent wrong picture" class on a point release, a reason to keep the phone on WebGL2 by default.
  **Our phone path is three's WebGPURenderer running its WebGL backend (TLX), not plain WebGLRenderer and not our own GLX.**
  three issue #30560 (open, high priority, last comment 2026-09-15 ⚑) says that backend gives every render object its own UBO,
  updated and bound every frame: Mugen87 (Jan 2026) measured WebGPURenderer-on-WebGL vs WebGLRenderer at 12 vs 60 FPS in Chrome
  macOS, 28 vs 60 in Firefox, **19 vs 57 on a Pixel 8a**; at r186 on an M4 Max with ~380 draws, `render()` took 2.88 vs 2.20 ms
  (+31 %) with ~2350 vs ~1300 GL calls (`bufferSubData` 789 vs 0, `bindBuffer` 632 vs 0) ([issue](https://github.com/mrdoob/three.js/issues/30560)). Those are non-instanced
  scenes; ours has ~90 main + 37 mirror + 49 sun draws. The project's own per-RO measurement (7.5–8 µs, hunt 4) is the same
  mechanism. **GLX (plain WebGL2) is still in the tree and was the phone default until TLX's memory was brought down**
  (`docs/notes/PERF-FINDINGS.md` §2q: TLX 149 MB vs GLX 48 MB on the iPhone profile; current numbers unknown), so the
  A/B has three arms, not two. We keep iPhones on three WebGL2
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
- **Where.** The pins: SETTINGS → three path WEBGPU vs default (`js/perf/renderer-picker.js:715`), and `apex26.gfxBackend = "webgl2"` for
  GLX (`js/render/gfx.js:213`); `backendState()` reports `pin`/`forceWebGL`.
- **Measure.** On the phone, same race, **three arms** (GLX, TLX default, TLX WebGPU), §4 window table; compare window-1 frame
  p50 and, from Safari Timelines, JavaScript time per frame (the UBO overhead is CPU and GL-call count, so it shows in the
  JavaScript & Events timeline, not as a GPU time). GPU timers do not exist on iOS (§4), so a GPU-bound result needs Rendering
  Frames, not a query. `renderer.info.render.drawCalls` and `timestamp` apply to the WebGPU arm only.
- **Risks.** The wrong-picture failure (missing bodywork, sky only; the Safari 26.4 black-3D regression): a fixed-view screenshot per arm,
  not just a number. GLX lacks features TLX has (check `docs/ARCHITECTURE.md` before calling it a regression), and its older
  memory numbers are stale.
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
  ([BatchedMesh](https://github.com/mrdoob/three.js/blob/dev/docs/pages/BatchedMesh.html)). Our own earlier finding: multi-draw at 1.03 ranges per call was slower (`docs/notes/MEASURING-GPU-PERF-2026-09-16.md` §4). web3dsurvey
  reports `WEBGL_multi_draw` on iOS at 99.99 % (fetched 2026-10-17; no date or sample method on the page), so the fallback-loop
  worry is probably moot on a current iPhone; still confirm with `gl.getExtension` (§4 A) before any BatchedMesh work. One cheaper
  lever first: three's `NodeMaterialObserver` returns early when `object.static === true`
  (vendored `three.webgpu.min.js`, `needsRefresh`: `const n = true === e.object.static … if (n || a) return i`), skipping the
  per-object material-equality check; grep finds **no** `static = true` in `js/`. Static chunk meshes and static prop batches are
  candidates (hunt 5 measured `updateForRender` at 1.1 s of a 30 s window). Check first that nothing on those objects depends on
  the FULL refresh (lamp and weather uniforms, `tsl-lit.js` takes FULL anyway per `docs/notes/TLX-PERF-PLAN.md`). #30560 (§7) notes
  `static` still binds every object each frame, so the gain is limited to the check.
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
- **Why it might matter on Apple GPUs, and why that argument is weaker than it first looked.** Apple's TBDR documentation (⚑) says the GPU processes all the geometry of a render pass,
  bins it into tiles, and shades only visible primitives; WWDC20 session 10602 (⚑ transcript) says the vertex stage shades every vertex and writes a Tiled Vertex Buffer, which "may cause a
  Partial Render if full", and then: "the takeaway is for you to know that the Tiled Vertex Buffer exists, but don't worry too much over it." The same talk says bandwidth is the thing to tune.
  So triangle count is **not** an Apple-documented bottleneck; this project measured the *Mac* frame as GPU-bound but not fragment-bound (19.17 ms at 0.75 MP vs 20.34 ms at 0.45 MP,
  `docs/notes/RENDER-PERF-PLAN-2026-09-16.md` §1), which is not a phone. Keep this item last and count before building.
- **Evidence.** meshoptimizer's simplifier is the standard tool; the JS module is low-level and its decoder is WASM with
  SIMD/scalar variants chosen automatically ([npm](https://npmjs.com/package/meshoptimizer), ◇). Earlier verdicts: `meshopt_simplify` at
  bake time was rejected because the repo has no build step and the pack would be 50 circuits × ~28 MB
  (`docs/notes/PERF-OPTIONS-2026-09-16.md` §3.3). That reasoning does **not** cover a **runtime, index-only** simplification of
  props built at track-build time inside the existing Worker (`js/track/build-client.js`), keeping vertices and only dropping
  triangles. Quad-soup props (2.0–2.26 verts/tri) simplify poorly with edge collapse; **ground and terrain ribbons**, which are
  most of the big triangles, are the better target. #2631 (claimed) owns road chunking and mesh efficiency; coordinate before building.
- **Win.** Unknown and probably small on Apple hardware; the plan is to *count first*: triangles in the mirror and beyond 150 m (`tools/check/occlusion-estimate.mjs`
  style) and only then decide. Downgraded to low–med in §1.
- **Measure.** Counted triangles per pass (exact, here); phone window table for the effect.
- **Risks.** Popping and silhouette change (distance hysteresis), shadows (casters must keep full index), lamp cells and chunk AABBs
  unchanged, `ChunkBins` locality. Look change, so frozen pixel A/B and a rendered lap.
- **Effort.** M–L; a counting step first (S).

## 3. Things NOT to do, and why

| idea | why not | source |
|---|---|---|
| Render the game in a Worker with `OffscreenCanvas` | Large rewrite (three, `game.js` and the HUD share the main thread; input and DOM stay there). Support is not the blocker: MDN compat data (fetched 2026-10-17) lists OffscreenCanvas from Safari/iOS 16.4, its `webgl2` context from 17 and its `webgpu` context from 26 (a 16.4-era report had only a 2D context, ◇). The blocker is cost and that a Worker already runs the track build. The frame is GPU-bound on tile hardware as far as measured. | MDN browser-compat-data `api/OffscreenCanvas.json` (⚑); [MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) "Baseline widely available since March 2023" |
| KTX2 / Basis (ASTC, ETC2) for textures | Our texture memory is render targets, cube/cloud caches and the **canvas-painted livery**, which cannot be pre-compressed; the pack textures are 128/256 px arrays. The loader needs a WASM transcoder and `detectSupport`, and format support is per device. Revisit only if a heap census shows static textures matter. | three KTX2Loader docs (Context7: "no single compressed format is supported on every device"); `docs/notes/PERF-FINDINGS.md` §2m–2q (bytes were geometry and passes); ETC1 alpha-black on iPad (forum 2021 ◇) |
| WASM SIMD for mesh building | Build runs in a Worker already; `docs/notes/PERF-OPTIONS-2026-09-16.md` §8 measured the worker trade, and its uploads (119–318 ms) not the maths dominate. No evidence the maths is the wall. | `docs/notes/PERF-OPTIONS-2026-09-16.md` §1–§5 |
| Shipping `BundleGroup` render bundles | Only WebGPU; the phone is on WebGL2 and GPU-bound. Wait for #7. | three docs (Context7); Toji render-bundles (⚑, 2024-01-22) |
| Per-object occlusion queries, multi-draw at 1.03 ranges/call, bottom-face cull, vertex-cache reorder | Measured negative. | `docs/notes/PERF-FINDINGS.md` §4; `docs/notes/RENDER-PERF-PLAN-2026-09-16.md` §4 |
| Releasing three's CPU geometry mirrors | Blanks the chunked world; upstream says do not. | `docs/notes/PERF-FINDINGS.md` §2s |
| A dev snapshot of three, or an uncited tolerance widening to get green | Hunt 4 verdict; AGENTS.md rule 9. | `docs/notes/PERF-HUNT-4-2026-10-14.md` |
| Drop physics below 60 Hz or add AI update-rate LOD to save CPU | Breaks determinism and physics identity; no profile says CPU is the phone limit. Measure `PerfSpans` `physics` on the phone first. | AGENTS.md §Physics |
| Chase mean fps from SwiftShader | CPU-only numbers do not prove a GPU win. | `docs/notes/MEASURING-GPU-PERF-2026-09-16.md` §6 |
| Lower precision (`mediump`/`f16`) for lighting on the phone | Apple's retired OpenGL ES guide says medium and low precision are both computed as 16-bit floats on A7 and later (⚑), so `mediump` is *half* on native GL; but nothing found says ANGLE-Metal maps `mediump` to Metal `half` (WebKit bug 237434 is about fast-math differences, ◇), and three emits `precision highp` GLSL for node materials. Unity docs and an Apple forum thread (◇) say `half` can save power on Apple GPUs. Position and normal maths must stay `highp` (banding/shimmer). Unproven lever; Safari 26 `shader-f16` exposure unverified. Worth one experiment only after the phone shows ALU-bound frames. | Apple OpenGL ES guide for A7+ (⚑, retired); Unity metal-requirements doc (◇) |
| GPU-driven rendering with indirect draws on Safari | Core WebGPU has no multi-draw-indirect, `indirect-first-instance` was unimplemented in WebKit (bug 251665; a fix has landed, shipping version not confirmed), and a WebKit bug filed 2026-08 reports a GPU hang from repeated indirect draws on shipping Safari 26.3 (resolved; build unconfirmed). Our phone path is WebGL2 anyway. | WebKit bugs 251665 and the 2026-08 hang report (◇ snippets) |
| Blind Rapier upgrade or the SIMD build | We vendor `@dimforge/rapier3d-compat` 0.19.3 (`vendor/rapier-0.19.3/rapier.mjs`, 2.24 MB). npm `latest` is 0.21.0 (0.20.0 2026-08-08, 0.21.0 2026-09-25, from the registry); 0.21.0's compat `rapier.mjs` is **4.34 MB** and the SIMD build 4.62 MB (packed and measured here), nearly 2× the bytes for a lazily loaded debris world, and no changelog with a performance claim was found (the repo CHANGELOG fetched stops at 0.19.3). The README says the main build is only locally deterministic and a separate `-deterministic` build exists; the debris side-world feeds race logic (`js/physics/debris-world.js:77`), so a SIMD build that changes float results is a behaviour risk. WASM SIMD itself is supported in Safari since 16.4 (WebKit, ⚑). Measure the debris `step()` on the phone first (it was ~16 % of physics CPU in an old desktop profile, `docs/notes/PERF-FINDINGS.md` §2). | npm registry 2026-10-17; rapier.js README; WebKit "Features in Safari 16.4" (⚑) |
| An uncapped render rate on 120 Hz displays | See §2.5: add the guard rather than rely on Safari's 60 Hz default. | heise 2026-02-12 (⚑); WebKit 173434 (⚑) |

## 4. Measurement plan for the iPhone itself

Everything below is something Bryce can run; none is automatable from CI (`docs/notes/MEASURING-GPU-PERF-2026-09-16.md` §6: the phone leg is
unreachable). Apple's sources are archived or search results: verify menu names on the device's iOS version.

**Setup (once).** iPhone: Settings → Apps → Safari → Advanced → **Web Inspector** on. Mac with Safari: Settings → Advanced → **Show
features for web developers**; plug in by cable and trust the Mac, then **Develop → \<iPhone\> → \<the game page\>**. Apple's own
page (⚑, copyright 2026): iPhone Settings → Apps → Safari → Advanced → **Web Inspector** on; wireless "Connect via Network" needs
one cable connection first ([Inspecting iOS and iPadOS](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios.md)). Apple's [Timelines tab help](https://support.apple.com/guide/safari-developer/timelines-tab-devcbd090540/mac)
(⚑) covers networking, JavaScript, rendering and memory timelines but has no iPhone-specific content.
Low Power Mode **off** (it caps rAF at 30), brightness fixed, Do Not Disturb on, charging state noted, phone cased or uncased (note which).

**A. Cold facts, 2 minutes.** In the Web Inspector console on the page: `GLX.__tlx.backendState()` (path, pin, forceWebGL),
`__apex.agentHelp()` for the hook list, `__apex.perf()` for the governor view; record `devicePixelRatio`, and from a console probe
`gl.getExtension("EXT_color_buffer_float")`, `…("EXT_color_buffer_half_float")`, `…("WEBGL_multi_draw")`, `…("EXT_disjoint_timer_query_webgl2")`.
This answers #2.4, #9 (multi-draw) and #7 (path) before any build. Record iOS version and iPhone model. Expect, per web3dsurvey
(⚑ fetched, no date): `EXT_color_buffer_float` yes (100 % iOS), `WEBGL_multi_draw` yes (99.99 %), and
**`EXT_disjoint_timer_query_webgl2` no (0.12 % iOS)**: there is no in-page GPU timer on the iPhone, so `__apex.gpuTimer()` reads
"not measured" and the three Inspector's GPU tab stays empty (it also needs WebGPU timestamp-query). GPU cost on the phone is
inferred from Rendering Frames and the §7 A/B, or an Xcode capture (E). Also record whether `navigator.gpu` and
`adapter.features.has("shader-f16")` exist (decides the `half` experiment). The Compute Pressure API does not exist in Safari
(caniuse, ⚑: unsupported in every iOS Safari version listed), so there is no thermal signal either.

**B. Soak, 15 minutes (issue #1633).** Fixed circuit, wet, full grid, chase camera. Every 2 minutes read and note
`__apex.perf()` p50/p95/p99, `renderScale()`, governor tier, and `memState()` retained counts and bytes. The decay of p50 and
scale from minute 1 to minute 15 *is* the thermal effect (#5). Repeat once with GRAPHICS preset MEDIUM and once with SGSR on
(#1652).

**A2. Refresh rate.** Record the rAF cadence the page actually gets (the metrics overlay or `PerfGov.fpsEMA()` on an unloaded menu) and whether Settings → Safari → Advanced → Feature Flags →
"Prefer Pages Rendering Updates near 60fps" is on; Safari defaults to 60 Hz web content on ProMotion iPhones (heise, 2026-02-12 ⚑) and Low Power Mode caps at 30. Everything below changes meaning at 120 Hz.

**C. Safari Timelines, 60 s each.** Record **JavaScript & Events** (frame cost by function: compare with the §0 profile), **Rendering
Frames** (frames that miss the 16.7 ms budget; the tail for #6), **CPU** (per-thread; is the main thread saturated for #9?), and
**Memory/Allocations** over a lap (the GC question for #3, which Chromium's `performance.memory` cannot answer on Safari ◇).
**Layers** tab (⚑ WebKit docs): per-layer memory and the reason each layer exists, with "show compositing borders" and "paint flashing"; WebKit warns that too many layers "can have disastrous results
on memory-constrained devices", and an Apple forum thread (⚑, 2026-04) has an iPhone 17 Pro WebContent process killed at an ActiveHard 2048 MB limit by a page with heavy CSS animations (an Apple engineer: iPhones have stricter
jetsam limits than iPads). Use it once over the HUD during a race to count layers and repaint flashes. **Energy** if available on that iOS. Record on a hot phone (minute 12) as well as a cool one.

**D. Path A/B (issue for #7).** Same race on the WebGL2 default and on THREE PATH: WEBGPU; screenshot a fixed grid view on each and
look for the old wrong-picture failure; read `renderer.info.render.drawCalls` and `timestamp`; the measurement notes' rules apply
(interleave, floor first, counted oracle beside every timing).

**E. GPU frame capture (optional).** Xcode's Metal frame capture works on a device through a Mac; Apple's guide is for native apps
([Capturing a Metal workload](https://developer.apple.com/tutorials/data/documentation/xcode/capturing-a-metal-workload-in-xcode.md), ◇) and no Safari-specific guide was
found. Use it only if A–D leave a GPU question.

**F. Is `mediump` really `half`? (Mac, 10 minutes).** WebKit's ANGLE can print the Metal Shading Language it generates: set `__XPC_ANGLE_METAL_PRINT_MSL_ENABLE=1` for Safari's GPU process (ANGLE's
[MetalBackendShaders.md](https://chromium.googlesource.com/angle/angle/+/refs/heads/main/doc/MetalBackendShaders.md) ⚑; Chrome uses `--enable-angle-features=printMetalShaders`), run the game, and search the dumped lit/post shaders for `half`. Apple says Apple GPUs "are optimized for 16-bit data
types" (fewer registers, higher occupancy, faster arithmetic, WWDC20 10632 ⚑), but three emits `highp` GLSL and nothing found says ANGLE maps it; this settles whether the §3 `mediump` row is a real lever.

**Record** results in a new `docs/notes/` file per session, with device, iOS, path, preset, scale and the window table
(frame p50/p95/p99, scale, tier, memory, minutes since start).

## 5. Sources (with what was and was not verified)

Legend: ⚑ fetched and read; ◇ search snippet or secondary; ✗ not found.

- three.js docs via Context7 (`/mrdoob/three.js`, queried 2026-10-17): `BundleGroup`, `BatchedMesh`, `KTX2Loader`, `renderer.info`,
  `trackTimestamp` / `resolveTimestampsAsync`, the `webgpu_performance_renderbundle` and `webgpu_mesh_batch` examples. Context7 returns
  dev-branch docs, which may be newer than our vendored 0.186.1.
- three.js releases page r183–r186 (⚑, 2026-10-17; r186 "Latest", 24 Sep; years not printed on the page, r186 = Sep 2026 per cgworld ◇);
  three.js wiki Migration Guide (⚑; has steps through 186 → 187, r187 not on the releases page); issue #30560 (⚑, open, last comment
  2026-09-15); forum "WebGPU performance issue" (⚑, 2025-11-05, r181); forum "stats-gl no longer compatible" (◇, r181).
- WebKit: "WebKit Features in Safari 26.0" (⚑, 2025-09-15), "… for Safari 26.2" (⚑, 2025-12-12), "… for Safari 26.6" (⚑, 2026-07-27, no
  graphics items), bug 315186 (⚑, 2026-05, WebGPU 26.4 regression, fixed), Rerun #12788 (⚑, 2026-05-19), bugs 173434 (⚑), 215745,
  247240, 217107, 241399, 216010, 237434 (◇). Riptide GC post (⚑, 2017-01-20: concurrent marking, pauses "1 ms or less", eden
  collections); no 2024–2026 JSC GC guidance found (✗).
- MDN browser-compat-data: `api/OffscreenCanvas.json` (⚑: Safari 16.4, `webgl2` context 17, `webgpu` context 26), `api/GPU.json`
  (⚑: Safari/iOS 26); web.dev WebGPU support (2025-11-25, ⚑); caniuse Compute Pressure (⚑: unsupported in all Safari/iOS Safari versions listed).
- web3dsurvey (⚑, undated, sample method not stated): `EXT_color_buffer_float` iOS 100 %, `WEBGL_multi_draw` iOS 99.99 %,
  `EXT_disjoint_timer_query_webgl2` iOS 0.12 %. Treat as strong hints, confirm on the phone.
- Apple: OpenGL ES guide for A7 and later (⚑, retired: fp16 `mediump`, discard framebuffers, MRT bit limits), WWDC18 session 612
  (⚑ transcript, approximate wording: design for sustained performance, ProcessInfo thermalState, stay at 30 fps if you cannot hold
  60 for ten minutes), thermal-state guidance (archived, ⚑), Metal Best Practices load/store (◇) and WWDC20 10632 (◇); the Metal
  Best Practices TBDR, memoryless and parameter-buffer sections were not reached (✗); Metal feature tables PDF unreadable (✗: iOS max
  texture size and MSAA counts unverified).
- Dynamic resolution: Intel dynamic-resolution whitepaper and Unity HDRP manual (◇: render into a sub-viewport of a max-size
  target, scale gradually); no GDC talk or mobile FSR/SGSR cost found (✗).
- Toji render bundles (⚑, updated 2024-01-22) and bind groups (⚑, undated). MDN WebGL best practices (cited by hunt 4).
- Not found or not verified: iOS max texture size / renderbuffer samples / canvas jetsam thresholds by RAM (a 2020 Apple forum thread
  reports a process kill near 1.25 GB on an iPad Air 3 under repeated canvas resizes, ◇), KTX2Loader's transcode target on Safari,
  KTX2 memory savings (arithmetic only: ASTC 4×4 is 8 bpp vs 32 bpp RGBA8, about 4× before mipmaps), ANGLE `mediump` → `half`
  mapping, Safari `shader-f16`, Spector.js and three.js compatibility, PCF/cascade costs on Apple GPUs, `invalidateFramebuffer`
  handling in three's WebGL backend and in ANGLE-Metal, `KHR_parallel_shader_compile` on iOS.
- Third pass (2026-10-17): npm registry (`three` latest 0.186.1, 2026-09-24; `@dimforge/rapier3d-compat` 0.21.0, 2026-09-25; `meshoptimizer` 1.3.0; packed and measured here); three issues #30560, #34597, #30047 (⚑),
  PRs #34610, #33413 (⚑), r187 merged-PR lists (⚑ titles only); three raw KTX2 loader and WebGL backend sources under `examples/jsm/loaders` and `src/renderers/webgl-fallback` (⚑); three `Object3D.static` doc via Context7; Apple "Tailor your apps for Apple GPUs and tile-based
  deferred rendering" (⚑, 2026), WWDC20 10602 and 10632 transcripts (⚑), WWDC18 612 (⚑); WebKit "Understanding GC in JSC" (⚑, 2022), Speedometer 3.0 post (⚑, 2024-04-10), "Features in Safari 16.4" (⚑); WebKit bug 315186 (⚑), 300782 (⚑);
  Apple forum thread 823061 (⚑); web3dsurvey iOS figures for ASTC, ETC2, half-float, `OES_texture_float_linear`, `KHR_parallel_shader_compile`, `MAX_TEXTURE_SIZE`, `MAX_SAMPLES` (⚑, undated); caniuse `requestIdleCallback`
  and Compute Pressure (⚑); WebKit Web Inspector Timelines and Layers docs (⚑); Intel dynamic-resolution whitepaper (⚑ via `pdftotext`), Unity HDRP dynamic resolution (⚑), Snapdragon GSR repo (⚑); Arm/Nordeus post-processing posts (⚑, 2018);
  GSMArena (⚑) and Tom's Guide (◇) stress tests. Still not retrieved: the Metal feature-set tables (iOS max texture size: the survey says ≥ 8192 for all iOS reports, ≥ 16383 for 99 %), ANGLE-Metal `VertexArrayMtl` buffer lifetime, any JSC guidance after 2024.
- Our own: the notes listed in §0, `js/` and `vendor/` as of tip `37794758`.

## 6. What the second web pass changed

| finding | before | after | where it lands |
|---|---|---|---|
| float render targets on iOS | code comment: iOS has only `EXT_color_buffer_half_float`, so bloom stays RGBA16F | web3dsurvey: `EXT_color_buffer_float` iOS 100 %; bloom is probably already R11F on the phone | §2.2 item 4; fix the comment after the phone probe |
| multi-draw on iOS | unverified; BatchedMesh could cost more CPU | `WEBGL_multi_draw` iOS 99.99 % (survey) | §2.9 |
| GPU timer on iOS | assumed available (our `gpuTimer`) | `EXT_disjoint_timer_query_webgl2` iOS 0.12 %: absent | §4 A; every phone "GPU ms" claim is off the table |
| thermal signal | unverified | Compute Pressure unsupported in Safari | §2.5 |
| three's WebGL backend cost | not considered | ~31 % more `render()` and +80 % GL calls than plain WebGLRenderer (#30560, r186, M4 Max); 19 vs 57 FPS on a Pixel 8a | §2.7 three-way A/B; §7 |
| Safari WebGPU on iOS | "drew nothing on one iPhone" | plus a May 2026 26.4 black-3D regression, fixed in WebKit 2026-05-22 | §2.7 |
| OffscreenCanvas on Safari | unverified | 16.4 (2D), 17 (`webgl2`), 26 (`webgpu`) | §3 |
| `Object3D.static` | unused | skips three's per-object material-equality check; no `static = true` in `js/` | §2.9 |
| three WebGL fallback disposal | not considered (hunt 4 filed "disposal fixes" as hygiene) | vendored 0.186.1 has 0 `deleteVertexArray`/`deleteProgram`/`deleteShader`; #34597 documents the leak; #34610 fixes VAOs in r187 | §2.4, new #2651 body |
| Apple vertex-count argument | "triangle count costs on a TBDR" | Apple's own talk: "don't worry too much" about the Tiled Vertex Buffer; bandwidth is the thing | §2.10 downgraded |
| rAF rate | assumed 60 | 60 Hz by default on ProMotion Safari, 120 Hz opt-in; we have no render cap | §2.5 |
| Rapier | not considered | 0.19.3 vendored, 0.21.0 latest, 2× bytes, SIMD not deterministic | §3 |
| JSC GC | "no source" | eden GC, scheduler tax ≥ 30 % while collecting, GC between frames backs off when rAF is imminent | §2.3 |
| `for…of` iterator allocation | counted from V8 | JSC may sink it; measure with Safari's allocations timeline first | §2.3 |
| draw order | not considered | Apple HSR checklist; TLX `renderOrder = i` leaves it to `game.js` order | §2.2 item 5 |

## 7. three.js — version, backends, unused features, other games, profiling

### 7a. Our version against the latest, and whether to upgrade

We vendor **three 0.186.1** (`vendor/three-0.186.1/MANIFEST.json`, generated by `tools/gen/vendor-three.mjs`, 14 patches in
`vendor/three-patches/patches.mjs`). The releases page (⚑ 2026-10-17) shows **r186 as Latest (24 Sep 2026)**; r185 01 Jul, r184 16 Apr,
r183 20 Feb. So **we are on the newest release.** What r184–r186 already gave us (all in 0.186.1; from the release notes, summarised by
the fetch, some entries truncated on the page):

| release | relevant items | status for us |
|---|---|---|
| r184 | `compileAsync()` truly non-blocking; TSL compilation "3.0x faster"; `WEBGL_multi_draw` fallback; render targets use the working colour space; BatchedMesh deprecated instancing paths removed | in; our warm path relies on `compileAsync` (`js/render/three/tlx.js:2608-3182`) |
| r185 | UBO updates optimised to reduce GC churn; `submit()` optimised; pooled uniform update-range objects; `InstancedMesh` fully supported in render bundles; surfaced uncaptured GPU errors and WGSL diagnostics; premultiplied-alpha change in WebGPURenderer | in |
| r186 | DirectRenderPipeline; `compileComputeAsync`; `Info` uses WeakMap; BatchedMesh visibility/draw-offset fixes; `PCFSoftShadowMap` removed; async `dispose()`; `SimplifyModifier` is now meshoptimizer-based and async | in; we use none of `PCFSoftShadowMap`, PMREM or `SimplifyModifier` (grep `js/`) |

**r187** appears in the migration guide (⚑) with a 186 → 187 section but **not** on the releases page (2026-10-17). Its listed
breaking changes, mapped to us: TSL math operands coerced to wider types (retest our TSL, `js/render/three/tsl-*.js`); PMREMs rebuilt on cube
render targets (we do not use PMREM: no hits in `js/`); custom-light registration API (not used); `setViewport`/`setScissor` no longer scale by pixel
ratio when a render target is bound (**TLX sets `renderer.setPixelRatio(1)`, `js/render/three/tlx.js:469`, so a no-op**, but re-check the mirror inset
at `js/render/three/tlx-post.js:410` and the warm scissors at `tlx.js:2977`, `tlx-post.js:930`); `WeakRef`/`FinalizationRegistry` internally.
Performance items merged on dev for r187 (from hunt 4, not re-fetched): node-build CPU −28 to −34 % (#34815), depth-only render targets
(#34782), pipeline key includes the vertex-buffer layout (#34726), disposal fixes. The migration guide itself advises upgrading in steps
of about ten releases because each release deprecates for ~10.

**three.js upgrade: not yet; yes when r187 is released, in one step, no dev snapshot** (#2651). Reasons it is worth it: free CPU at warm
(3.9–9.5 s on Metal per hunt 4), a shadow target without the R8 attachment, a layout-correct pipeline key for our many packed
vertex layouts, retiring patches 6/9/10. Reasons for caution: our 14 patches (the canary test pins their shapes), the TSL coercion change, and
that the render-tlx gate plus a `gpu-census.yml` leg are mandatory (`.claude/rules/render-tlx.md`). Cost: S–M.

### 7b. WebGPURenderer vs WebGLRenderer on iOS Safari, today

- Safari 26.0 shipped WebGPU on iOS (WebKit, 2025-09-15 ⚑); Safari 26.4 regressed WebGPU to a black 3D view on macOS, iPadOS and iOS, fixed in
  WebKit 2026-05-22 (bug 315186 ⚑); iOS 26.3.1 was fine. Dear ImGui #9103 (◇) reports a device-lost on Safari 26.1 macOS and iOS under Emscripten
  (cause unconfirmed). `js/render/three/tlx.js:536` already notes the iOS/Safari 26.0–26.5 device-lost listener gap.
- three's `WebGPURenderer` falls back to its **WebGL backend**, which is what our iPhone runs (`js/render/three/tlx.js:341-348`). That is *not*
  `WebGLRenderer`: #30560 (⚑) documents the per-object UBO design and 19 vs 57 FPS on a Pixel 8a, 12 vs 60 in Chrome macOS, and +31 %
  `render()` / +80 % GL calls at r186 on an M4 Max forced-WebGL. A forum thread (r181, 2025-11-05 ⚑) shows the same on 5k–50k cubes. The maintainers
  say the workaround is instancing and batching; no fix is merged in the thread. Their `Object3D.static` suggestion is limited (it still binds every object).
- Implication: our per-RO CPU (7.5–8 µs) is partly structural to three's WebGL backend, **so cutting render objects (§2.9) and the
  three-way A/B (§2.7) are the two levers**. GLX remains in the tree as plain WebGL2.
- Recommendation: stay on three's WebGL backend by default on iOS; re-test WebGPU and GLX on every iOS point release that touches WebGPU; keep the
  fixed-view screenshot gate.

### 7c. Idiomatic three.js features we do not use (or use partly), with a verdict

| feature | status in `js/` | verdict |
|---|---|---|
| `InstancedMesh` | used for props and casters (`js/render/three/tlx.js`, `js/render/three/tlx-shadow.js`) | in use; §2.9 is about the leftovers |
| `BatchedMesh` | not used (only a drawId comment, `js/render/shared/lamp-chunks.js:147`) | wheels only (D4). Do **not** move shared-buffer chunks to it: it copies geometry (#2631 agrees); multi-draw is probably present on iOS (§2.9) |
| `Object3D.static` | not used | cheap candidate, §2.9 |
| `LOD` (`THREE.LOD`) | not used; the project has its own `FieldLod` for cars (`js/car/field-lod.js`) | no: chunk LOD is index-based (§2.10), not object swapping; keep `FieldLod` |
| `BundleGroup` render bundles | not used | WebGPU only; wait for §2.7 |
| `compileAsync` | used heavily | done |
| `renderer.info` | used (`memState()`, probes) | done |
| `trackTimestamp` / `resolveTimestampsAsync` | used by `gpuTimer` on WebGPU | no GPU timer on iPhone (§4 A) |
| KTX2 / Basis | not used | not now (§3): our texture bytes are targets and a painted livery |
| meshopt decode / `SimplifyModifier` | not used | `SimplifyModifier` is now meshopt-based but async and operates on indexed geometry; relevant only to §2.10 and only at build time inside the Worker |
| `BufferGeometryUtils.mergeGeometries` | not used | our `ChunkBins` and packers already merge; no gain |
| node materials / TSL | used throughout (`js/render/three/tsl-*.js`) | done; r184's "3.0x faster compile" already in |
| Inspector (`renderer.inspector`) | opt-in `?inspector=1` (`js/perf/three-inspector.js`) | done; GPU tab needs WebGPU |

### 7d. How other three.js racing and open-world games handle large tracks and scenery

Honest result: **no primary, documented pipeline from an open three.js racing game was found.** HexGL's repository page (⚑) has no rendering
documentation (README covers install and status; "development is in a hiatus"). The search pass returned only general guidance (◇): instance
repeated scenery, chunk large scenery and rely on frustum culling at the cost of a few extra draw calls, use `LOD` for distant barriers and
stands, and optimise assets with glTF-Transform (dedupe, weld, simplify, compress). **Each of those is already in this project**
(chunking with lamp-cell bins, merge factors, instanced props, packed vertices), and the project's own measurements (merge, dust merge, occlusion) go further
than the generic advice. Treat the "what other games do" question as answered: nothing missing, and no source worth citing for the track mesh.

### 7e. three.js-specific profiling

| tool | what it gives | on the iPhone |
|---|---|---|
| `renderer.info` (`render.drawCalls`, `triangles`, `timestamp`; `memory`) | exact counts per frame; timestamp on WebGPU only | usable via `memState()`; counts, not ms |
| three Inspector (`?inspector=1`, `js/perf/three-inspector.js`, notes `docs/notes/THREE-INSPECTOR-2026-10-16.md`) | Performance, Memory, Timeline, Viewer, Parameters, Console; r181's replacement for stats-gl (forum ◇) | tabs work on WebGL; GPU timings need WebGPU + `timestamp-query`; panel is pointer-events-none except controls |
| stats-gl | CPU/GPU panels; reported incompatible with WebGPU from r181 (◇ forum), README still documents it | skip: the Inspector replaces it |
| Spector.js | WebGL call capture | no source found for current three compatibility or an iOS Safari route (✗); use Web Inspector instead |
| Safari Web Inspector Timelines (JavaScript & Events, Rendering Frames, Memory) | the only per-frame truth on the iPhone | primary tool, §4 C |
| `tools/perf/profile.mjs` (`--mode spans|cpu|hitch|trace`, `--base`) and `PerfSpans` | span budgets and A/B with a noise rule | desktop and CI only |

## 9. Third research pass — facts worth keeping, with where they bite

### 9a. What an iPhone exposes to WebGL2 (survey figures, ⚑ fetched 2026-10-17, undated, sample method not stated: confirm in §4 A)

| item | iOS | Safari | what it means for us |
|---|---|---|---|
| `EXT_color_buffer_float` | 100 % | 100 % | R11F bloom probably already on; `bloom11` needs it (`js/render/three/tlx-post.js:111-129`) |
| `EXT_color_buffer_half_float` | 99.98 % | 99.99 % | RGBA16F HDR targets fine |
| `OES_texture_float_linear` | **52.13 %** | 58.98 % | Do not sample FloatType textures with linear filtering: our float DataTextures use `NearestFilter` (`js/render/three/tlx.js:1498`), clean |
| `WEBGL_multi_draw` | 99.99 % | 99.99 % | BatchedMesh uses the multi-draw path, not the per-draw loop (§2.9) |
| `KHR_parallel_shader_compile` | 98.76 % | 99.03 % | three's `compileAsync` (`js/render/three/tlx.js:2608-3182`) really compiles in parallel on iOS: three polls `COMPLETION_STATUS_KHR` |
| `EXT_disjoint_timer_query_webgl2` | **0.12 %** | 0.12 % | no in-page GPU timer on iPhone |
| `WEBGL_compressed_texture_astc` / `_etc` | 99.96 % / 99.96 % | 97.59 % | KTX2 would transcode to ASTC for UASTC (three's loader priority: ASTC, BPTC, ETC2, ETC1, S3TC, PVRTC; ETC1S excludes ASTC and prefers ETC2; raw loader source ⚑); a viable format, still not needed (§3) |
| `MAX_TEXTURE_SIZE` | ≥ 8192: 100 %; ≥ 16383: 99 % | same | no texture-size ceiling for our atlases |
| `MAX_SAMPLES` | ≥ 4: 100 %; ≥ 8: 22 % | ≥ 4: 100 %; ≥ 8: 18 % | 4× MSAA exists; phones use FXAA by choice (`js/render/three/tlx-post.js:90`) |
| Compute Pressure API | none | none | no thermal signal |
| `requestIdleCallback` | disabled by default (all versions listed) | same | already handled: our callers fall back to timers (`js/car/car-draw.js:511`, `js/physics/debris-world.js:239`, `js/game.js:131`) |

### 9b. Apple GPU guidance that applies through ANGLE-Metal (primary, ⚑)

- Load and store actions "consume the majority of your app's system bandwidth"; clear rather than load; store only what you need; merge render passes (WWDC20 10632).
- Draw order: opaque, then alpha-test/discard/depth-feedback, then translucent; do not interleave (WWDC20 10602).
- Apple GPUs "are optimized for 16-bit data types": fewer registers, higher occupancy, faster arithmetic, conversions free (WWDC20 10632). Whether ANGLE emits `half` for `mediump` is unverified; §4 F dumps the MSL.
- The Tiled Vertex Buffer and vertex binning exist; "don't worry too much over it" (WWDC20 10602). Alpha blending always happens in tile memory; MSAA resolves from tile memory.
- A Metal pass that splits only because load/store actions differ is a wasted pass ("Render passes don't need to be split when only load and store actions change").

### 9c. Memory limits on iPhone (what we can and cannot say)

- WebContent processes have a soft limit of about 1.5 GB per an Apple-side commenter (◇ search result, not a documented figure); an iPhone 17 Pro (12 GB RAM) page with heavy CSS animations was killed at **ActiveHard 2048 MB** on iOS 26.3, 26.4 and 26.4.1, and an Apple frameworks engineer confirmed iPhones are stricter than iPads (Apple forum thread 823061, 2026-04, ⚑).
- WebKit bug 300782 (NEW, ⚑): WebGL- and texture-heavy pages are killed and reloaded in a loop with no `webglcontextlost` and no JS signal; a commenter says uncollected garbage, not only live memory, can trigger it. So the page cannot detect it coming: budgets have to be conservative and measured with Safari's Memory timeline.
- The project's own record puts a phone kill near ~100 MB on an iPhone SE (3rd gen) (`docs/notes/CI-RENDERING-PERFORMANCE.md` ~426): the old low-RAM floor; the budget for an iPhone Pro is larger and unmeasured.
- three issue #30047 (WebGL2 canvases stay in memory on Safari, a WebKit-side bug, 2024-12 to 2025-01): a reason not to create and drop canvases.

### 9d. Techniques checked and found already covered

- **Cached shadow maps.** Unity HDRP's "mixed cached" shadows (static casters redrawn only on request, dynamic every frame) are the same split as our L1 lamp map and car-only rebuild (`docs/notes/TLX-PERF-PLAN.md`). Nothing missing.
- **Bloom on tile GPUs.** Arm's post-processing case study (2018-04-17, ⚑): Dual Filtering "roughly 14× faster at 1080p" than a naive Gaussian but little gain when the blur already downsamples first; an R8 luminance bloom buffer "significantly lowers bandwidth"; cheap texture-based bloom under 1 ms. Our pyramid already downsamples and uses R11F. An R8 luminance-only bloom would be a look change; record, do not start.
- **Dynamic resolution.** Intel's whitepaper (Doug Binks, GDC 2011, ⚑ via `pdftotext`): render into a viewport of a larger target, clamp sampled UVs with `min(uv, ratio)` and recompute the ratio from the integer viewport, draw the GUI at native resolution; at 0.5× resolution package power fell to 0.7× at constant frame rate. Unity HDRP (⚑): allocate at maximum, scale the viewport, keep the screen percentage above 50 %. SGSR1 (Qualcomm, BSD-3, ⚑) is a single pass, a 12-tap Lanczos-like filter with adaptive sharpening on one input texture, and advises drawing UI at device resolution; we already have SGSR built and `setRenderScale`'s floor is 0.5 (`js/render/three/tlx.js:4130`).
- **WebGL call overhead on iOS.** WebGL runs in WebKit's GPU process; WebKit bugs describe batching GL commands through shared memory and synchronous IPC messages as a known hazard (◇ 2020–2022). Fewer GL calls is therefore doubly useful, which is #30560's +80 % GL calls in context (§2.7).
- **meshoptimizer** is at 1.3.0 on npm; its simplifier is relevant only to §2.10, which is last.
- **Playwright and CDP tracing** (Context7, `/microsoft/playwright`): `browser.startTracing(page, {categories})` drives Chromium's `Tracing.start`; default categories include `devtools.timeline`, `disabled-by-default-devtools.timeline.frame`, `disabled-by-default-v8.cpu_profiler`; our `tools/perf/profile.mjs --mode trace` is this. Desktop Chromium only: it cannot see the iPhone.

## 8. Next step

Issues for items 1–10 are linked from the PR body; the three.js and third-pass follow-ups are listed there too. Order of work: (1) the 20-minute phone session
(§4 A, A2, then the three-way A/B in §2.7); (2) the GL create/delete count across track switches (§2.4), which needs no phone and can start now; (3) the rest by the §1 table.
