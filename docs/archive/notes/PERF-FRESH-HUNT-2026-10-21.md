# Fresh perf hunt: research first, assumptions out (2026-10-21)

Bryce (2026-10-21, typed in the B·W11 session): "I know we have lots of
'findings' already but these have been agent found and may have lots of
assumptions. Let's pull current deploy branch and first use context7, web
research for how to debug, speed up, profile web games with three js. Use
parallel subagents to brainstorm new ideas and hunts ignoring assumptions."

Method:
- Base: the deploy tip `cfefcbf7`.
- Two research agents: Context7 on the three.js r186 docs, and web research
  on profiling three.js/WebGL/WebGPU games, phone first. Their notes are in
  `scratch/perf-research/` (gitignored); the key sources are cited below.
- Then five read-only hunters, one per slice: render passes, scene graph and
  culling, per-frame CPU, HUD/DOM on phone, frame pacing.
- None of them read the existing `PERF-*`, `LIVE-*` or `MEM-*` notes or the
  defect ledgers.
- Live lanes were excluded: H8 boot/shader warm and TLX heap, H10 road split
  and phone recorder, H12 memory gate, H13 livery memo, H14 race entry and
  step gate, H11 tests/audio.

**Everything below is a hypothesis traced from code, not a measurement**,
except two Node VM checks:
- a replay of the real `js/perf/governor.js` `tick()` on synthetic frame times;
- a batch and triangle census of the circuit scenery.

No browser or GPU numbers were taken. This container has only SwiftShader, so
GPU claims need `gpu-census.yml` on `macos-latest` or a real phone.

## What the research changes

- **Phones are usually fill/bandwidth-bound before draw-call bound.** The test
  is that if halving resolution helps, you are fill-bound. Render-target
  switches, and storing depth or stencil, cost bandwidth on tile-based GPUs.
  Sources: the Arm and Khronos tile-based rendering guides, MDN
  "WebGL best practices"
  (https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices),
  and the PlayCanvas mobile optimisation guide.
- **iPhone exposes almost no GPU timer queries.** Infer GPU time as frame time
  minus JS span time, and profile with Safari Web Inspector Timelines from a
  Mac. Android uses `chrome://inspect` with the Performance panel and custom
  tracks via `performance.measure`.
- **Dynamic resolution practice is allocate once, render into a sub-rect.**
  This is Unity's documented approach. Pick the scale from measured cost, not
  0.1 nudges.
- **WebGPU is not automatically faster.** A three.js forum measurement found
  WebGL 2–4× faster on the same scene. A/B it on the device.
- **There is no browser thermal API.** Detect throttling from a rising frame
  time trend at constant load. iOS Low Power Mode caps rAF at about 30 Hz on
  purpose.

Checked against the code and NOT applicable:
- `DirectRenderPipeline`: TLX's last pass already writes to the canvas, with
  NoToneMapping and LinearSRGB.
- `shadowMap.autoUpdate`: TLX runs its own snap-cached sun pass.
- BatchedMesh `perObjectFrustumCulled`, and the bounding-sphere-after-`setMatrixAt`
  rule: TLX culls on the CPU with its own AABBs.
- `matrixAutoUpdate`: already off on static objects.
- Far impostors: the far geometry is cheap low-poly.

## Ranked ideas (payoff ÷ effort; each has a confirm/refute number)

| # | idea | anchor | evidence | measure → confirm if | effort | payoff |
|---|---|---|---|---|---|---|
| 1 | The governor times the **rAF interval, not the drawn frame**, when `RenderRate` skips frames (120 Hz "half", or "30" mode). It degrades a steady game. | game.js:8361 vs 8453; render-rate.js:25-27,72 | Node replay: 4 scale reallocations in 60 s (120 Hz half); 10 moves and tier 4 shed while holding a steady 30 fps ("30" mode) | 120 Hz Android, `__apex.renderRate("half")`, 3 min: `post.state().rtResizes`>0 or autoShed>0 while drawn-frame p95 ≤17 ms | small | high on 120 Hz |
| 2 | A **0.1 scale step cannot cross a vsync quantum**. The post-step check reverts it and marks the scale lever futile, so a phone that could do 60 fps at about 0.7 is stuck at 30. | governor.js:258,629-651,718 | Node replay: 2 moves, then scale 1 and a 33.3 ms floor for good | phone: `perf().frameTimes` p50≈33 with `scaleFutile()`, then pin `renderScale(0.7)`: p50≈17 | medium | high (30→60) |
| 3 | **Fixed render targets are OFF by default** (`apex26.tlxFixedTargets`), so every governor step reallocates all post targets. | tlx.js:1123-1131; tlx-post.js:311-329 | code | `profile.mjs <track> --mode trace`, forced `renderScale(0.8)`/`(1)`: a step frame over 50 ms (LoAF) with OFF and none with ON | low (check SGSR parity) | hitch on every step |
| 4 | **Android AUTO picks three-WebGPU.** | tlx.js:401-402 | forum data, WebGL 2–4× faster | same Android phone, `apex26.tlxForceGL` 0 vs 1, 3 min each: WebGL p50 ≥20 % lower | 1 line | possibly large |
| 5 | **Physics catch-up cap of 5 steps a frame**: one hitch on a hot phone triggers 3–5-step frames that miss vsync again. | game.js:8427,8437 | code | `profile.mjs monza --mode step` + `--mode spans`; live `__apex.perf()` steps per frame >2.3 at 30 fps or physics p99 ≥3× p50 | 1 line + physics-characterization | med |
| 6 | **Scene depth is kept whenever the sun is merely in front of the camera.** The flare shader reads it only when sunUV is on screen. Pixel-identical fix. | tlx-post.js:987-988; post-common.js:128-135; tsl-post.js:934-937 | code | day lap: `__tlx.postState().depth.kept/discards`; >25 % of day frames move to discarded | tiny | med |
| 7 | **The mirror is a second world pass every frame**, into RGBA16F + depth + mips, with depth never invalidated. Measure it first; then RGBA8 + `invalidateFramebuffer(DEPTH)`. | mirror-pass.js:85,105; tlx.js:1414,5156 | code | `profile.mjs monza --mode spans`, hudMirror on vs off: mirror ≥20 % of the render span | low (format) | med-high if confirmed |
| 8 | **Submission order is fixed with the floor first.** renderOrder = submit index overrides front-to-back, which wastes early-Z on Adreno/Mali (Apple's hidden-surface removal hides most of it). | game.js:6683; tlx.js:5704,5820 | code | localStorage A/B, Android GPU frame time ≥5 % lower | low | med Android |
| 9 | **The spotter glow is a full-viewport animated `::after` under the HUD**: a compositor layer and a possible layer-tree rebuild on toggle. | css/hud.css:2151-2167 | code | DevTools trace at 844×390 with `data-along` on vs off: layers +5 or a Paint storm | low | med |
| 10 | **Per-frame HUD paint.** The speed text has no `contain` and a 12 px blur shadow; the rpm bar uses a `clip-path` repaint plus an animation toggled near redline. Use `contain`, a cheaper shadow, and `transform: scaleX`. | hud.js:1938-1945; hud.css:251,272,312,322 | code | trace: Layout root above `#hud-speed`, or Paint >0.3 ms at 4× CPU | low | 0.2–1 ms/frame (est.) |
| 11 | **`innerWidth` is read every frame**, plus mirror rect reads every 500 ms inside render. That is a forced reflow on Android after any earlier DOM write. Cache on resize. | canvas-css-size.js:33; mirror-pass.js:307-357 | code (comments disagree) | Android remote trace: a "Forced reflow" under `applyResize`/`rectOf` | low | med Android |
| 12 | **`Wind.sync` builds a string key per car per physics step** (about 1.3k/s). Sync once per `update()`. | game.js:4775; wind.js:143 | code | `profile.mjs --mode step --base HEAD`, identical digest | tiny | small, zero risk |
| 13 | **Sun-shadow rebuild spike** at every 20 m cell crossing (about 4/s at race speed). Scroll the map or spread the build over 2 frames. | shadow-pass.js:328-377; tlx-shadow.js:560-615 | code | `profile.mjs bahrain --mode hitch`: spike period = 20 m / speed, rebuild frames ≥1.5× median | high | med |
| 14 | **Collapse each record's visible chunks into one index range.** Chunks now exist only for culling: about 100–150 draws a pass → about 4. | tlx-chunked.js:402-537; lamp-chunks.js:141-156 | VM census: monaco 457 merged blocks, spa 252 | `mesh-census.mjs monaco --backend tlx --mobile`: drawCalls −60 % and render-span CPU p50 −1 ms | high | high if CPU/driver bound |
| 15 | **AI plans every step for all 21 AI.** Far cars (>550 m) could plan at 30 Hz. | game.js:5236-5291 | code | spans: `ai` ≥60 % of `physics` | medium (behaviour; physics-characterization) | up to ~½ AI cost |
| 16 | **LOW-tier direct path**: scene → RGBA8 → FXAA, skipping the float intermediate and the composite. | tlx.js:5892-5913; tlx-post.js:912-913 | code | census gpuTimer at GRAPHICS LOW: GPU −15 % | high | high at LOW |

Smaller items, worth doing when the file is already open:
- SGSR runs after FXAA, so one pass is redundant (tlx-post.js:916-930).
- Fold bloom's bright threshold into the first downsample (tlx-post.js:750-786).
- The SSR tag attachment is RGBA16F for one value (tlx-post.js:206).
- Scene RGBA16F → R11F_G11F_B10F, which needs iPhone `EXT_color_buffer_float`
  data from the H10 recorder (tlx-post.js:132).
- Batch keys split by colour or jitter, 5–10 draws a pass (nature.js:261).
- Far-pine LOD: spa pines are about 167k tris.
- The minimap bitmap runs at 3× DPR while the scene runs at 1.5×
  (hud-minimap.js:52-62).
- `sweepContacts` is all-pairs even when bucketed (collide.js:368-374).
- Allocations in a few sites: `ranked.concat(parked)` (game.js:4531), the wet
  `_sprayRoll` sort (particles.js:302), and `scQueueFrac` under the safety car.
- `render`/`update` may never be optimised by V8 (check `--trace-opt` in
  Chromium); splitting them would be high effort.

## What needs a real device (only Bryce can run it)

- **iPhone (Safari Web Inspector Timelines from a Mac):** ideas 2, 9, 10, and
  input-to-photon latency.
- **A 120 Hz Android phone (`chrome://inspect`):** ideas 1, 4, 8, 11.
- **The H10 phone recorder** should log `EXT_color_buffer_float`, a histogram
  of rAF deltas, and PerfSpans `frame` work against interval p50 (the thermal
  trend).

## Overlaps sent to the owning lanes

- **H10:** phone LOW draws road and terrain fused and unculled (spa 63k + 69k
  tris; game.js:6693,6738), which is road split #3396. Device-extension and
  frame-delta logging belong in the recorder.
- **H8:** nothing re-hunted.
