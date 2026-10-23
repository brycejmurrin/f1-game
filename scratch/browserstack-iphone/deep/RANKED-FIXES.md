# Apex iPhone deep profile: ranked fix candidates
Run on Wed Oct 21 2026, 9:39–10:05 PM PT. Live build https://brycejmurrin.github.io/f1-game/?apex (deploy of 9:40 PM PT, repo HEAD 4e04638929 locally). Evidence only; no repo changes.
Devices: BrowserStack iPhone 15 / iOS 26 Safari (three.js TLX on WebGPU) and iPhone 13 / iOS 18 (WebGL2), landscape, MEDIUM preset unless noted. Local: headless Chromium, SwiftShader, 4x CPU throttle (CPU attribution only; its GPU numbers are meaningless).
Raw data: results/*.json (one per session), results/local-*.cpuprofile, sessions.txt (links + minutes). Runner: deep.mjs + probe.js (in-page, read-only).

## Headline numbers (iPhone 15, MEDIUM, renderScale 0.5)
| What | Value | Source |
|---|---|---|
| Race entry (tap to green-ready), cold | 13.0–13.4 s (4 sessions) | raceEntry.entryMs |
| ...of which `mirrorPrepare` (waits on the TLX program warm) | 9.9–10.0 s | raceEntryStages |
| Race entry, warm device (same batch, 3 sessions) | 4.3–5.7 s, mirrorPrepare 1.2–2.8 s | r2/r3 runs |
| TLX warm stages (soak session, cold) | total 8647 ms: compile-scene 4959, post 713, mirror 1331, draw-warm 1441, fx 202 | GLX.__tlx.memState().warm |
| Longest single frame gap during entry | 5.26–5.33 s plus a 1.44–1.47 s one (cold) | rAF gap recorder |
| Race entry on iPhone 13 (WebGL2) | 3.1 s, no mirrorPrepare stall, largest gap 481 ms | iPhone 13 session |
| CPU per frame (tickBody `frame` span) while driving | 3.8–6.4 ms (physics 1.2–1.8, AI 0.8, render submit 2.4–4.0, HUD 0.2–0.4) | PerfSpans |
| Frame interval while driving | 17–28 ms → GPU/compositor-bound, not JS-bound | sample + spans |
| Soak (5 min Monza): first 2 min / after 2 min | 36→44 fps (gt33: 228,105,90,38 per 30 s) / 56–59 fps (gt33 2–8) | soak windows |
| Soak GPU memory (three info.memory) | 75.8 → 76.3 MB, flat; geometries 399→458, then flat | soak |
| renderScale pinned per session | 0.5: 43.8 / 54.7 / 57 (soak tail) · 0.75: 23.5 · 1.0: 28.3 fps | scale= sessions |
| Ablation (Monza, 8 s windows) | base 53.6 · no props 53.7 · no terrain 46.3 · no cars 52.0 fps | meshToggle |
| iPhone 13 WebGL2 drive | 27.7 fps, CPU frame 7.4 ms (physics 4.0, AI 1.6, HUD 1.05), governor tier 3 | iPhone 13 session |

## Ranked candidates

### 1. Race entry: the TLX program warm compiles the whole race scene cold on WebGPU, ~10 s with a 5.3 s frozen frame
- **Where:** `js/render/three/tlx.js` `startProgramWarm()` (stage `compile-scene`: `await renderer.compileAsync(scene, camera)`, then post / mirror / draw-warm). Entry waits on it in `js/render/shared/mirror-pass.js` `prepareFrame()` (`if (g.warming && g.warming()) return;`) under `js/game.js` `RaceEntryProfile.spanAsync("mirrorPrepare", …)` (~line 2688). Warm is keyed per track in `js/game.js` `warmPrograms()` (`menuKey(trackIdx)`, line ~2195), so the title/flyby warm for the menu track (bahrain) does not cover Monza or Singapore.
- **Evidence:** 4 of 4 cold iPhone 15 sessions: mirrorPrepare 9959–9985 ms of a 13.0–13.4 s entry; single rAF gaps of 5.26–5.33 s and 1.44–1.47 s inside it. The warm breakdown has compile-scene at 4959 ms of 8647 ms. On a device that had just run the game (batch 3), mirrorPrepare fell to 1.2–2.8 s and entry to 4.3–5.7 s, which fits a cold pipeline/shader compile. iPhone 13 on WebGL2 enters in 3.1 s. Safari's WebGPU `compileAsync` still blocks the main thread here (the 5.3 s gap).
- **Fix ideas:** (a) start the race-track warm when the player selects the circuit on race select (ensureCircuit + a warm before the tap), or make the warm key cover the material/vertex-layout set rather than the track; (b) split `compileAsync(scene)` into per-material batches with yields so the loading card animates; (c) run it alongside `warmCarAssets` (about 1.7–2.0 s, serial today) instead of after it.
- **Expected gain:** cold entry 13 s → about 5–6 s (the warm-device runs show what is left); the 5 s freeze becomes chunks of 200 ms or less.
- **Player impact:** the biggest one. A frozen loading card for 5 s and a 13 s wait for every race on iPhone 15.

### 2. GPU-bound frame: the cost is per pixel (post/lighting), not scene geometry or JS
- **Where:** TLX post chain `js/render/three/tlx-post.js` and the tier gating in `js/perf/governor.js` / `js/perf/quality-preset.js` (look-defining post reads `PerfGov.autoTier()`). Scale switching belongs to D·IP3, the ULTRA cap to D·IP1; this is evidence for them.
- **Evidence:** CPU `frame` span is 3.8–6.4 ms while frames take 17–28 ms. Pinning renderScale per session: 0.5 → 44–58 fps, 0.75 → 23.5, 1.0 → 28.3 (one session each, noisy, but 0.75 and 1.0 both lose about half). Hiding props, terrain or cars changes fps by noise only (53.6 vs 53.7 / 46.3 / 52.0). The governor sits at autoTier 4 (most shed) in most race sessions; the 23–28 fps sessions ended at tier 2 / autoTier 0, which points to the post stack coming back on as the main cost. Not proven: I didn't toggle post or shadows one at a time (see gaps).
- **Fix ideas:** render bloom/SSAO/god rays at half of the already-reduced scene resolution on phones; keep autoTier from recovering to 0 on a phone that has already been measured slow (hysteresis); A/B each post pass with timestamp queries on a device where they're supported.
- **Expected gain:** 1.5–2x fps in sessions where the post stack is on (23–28 → 45–55 fps), going by the tier-4 sessions.
- **Player impact:** steady 55+ fps vs 25 fps. The difference between smooth and a slideshow.

### 3. First ~2 minutes of every race run at 36–44 fps with heavy stutter, then 57 fps
- **Where:** still to pin down. Lazy GPU resource creation in TLX (`memState().rGeo` grows 399 → 458 over the first 2 min, then stays flat) and the bunched 22-car pack early on (render span 4.0 → 2.4 ms). Likely `js/car/car-draw.js` lazy LOD/body meshes (`teamBodyMesh` / FieldLod on first draw) and the deferred car warm queue (`_deferredCarWarm`), plus scenery chunks.
- **Evidence:** 5-min soak, 30 s windows: 36.4 / 38.5 / 42.0 / 43.6 / 57.2 / 55.6 / 58.6 / 56.6 / 58.7 / 57.7 fps; gt33 frames 228 → 105 → 90 → 38 → 2–8. Geometry count rises during the slow part and then stops. The 30-s drive windows in every other session also land in this slow part.
- **Fix ideas:** build the per-rival LOD/body meshes and pending geometry inside the entry warm (or over the countdown); log `memState` geometry creation per frame to name the lazy builders.
- **Expected gain:** the first 2 minutes go from about 38 to about 55 fps; about 400 fewer stutter frames per race start.
- **Player impact:** high. The opening lap, the part players see most, is the worst.

### 4. Title-screen hitch = boot menu prep (world + garage program warm), and probably the "Settings freeze"
- **Where:** `js/game.js` `G.menuPrep` / `warmPrograms()` and `js/garage/prebuild.js` (title prebuild, `G.gfx.warm()` at ~line 221); TLX `_warmHistory` says the world warm runs 11–15 s on Metal.
- **Evidence:** iPhone 15 title idle right after boot: rAF gaps of 1217 ms and 694 ms (2.6 s total in 5.5 s). Opening Settings itself: largest gap 144–149 ms, 278–294 ms total, in 2 of 2 sessions. The earlier 3.7 s "settings-idle" freeze fell about 5 s after boot, which is inside this prep window. Local 4x-throttle profile of back-to-title: `_buildGrid` (build-props.js), `weld` (car-geometry.js), `refinish` (car-materials.js) = garage prebuild work. **Evidence for D·IP2:** the freeze looks like it's the boot warm overlapping, not the Settings sheet.
- **Fix ideas:** delay menu prep until after the first idle second and slice it; don't run program warm while a modal is opening.
- **Expected gain:** title hitches of 1.2 s → under 200 ms; the Settings 3.7 s freeze goes away if the overlap theory holds.
- **Player impact:** medium-high. It's the first impression.

### 5. Race-select screen: 1.5–1.9 s of frame gaps (hitches of 150–234 ms) from the track preview build and a forced-layout observer
- **Where:** `js/ui/select-screen.js` `updateTrackPreview()` → `js/track/tracks.js` `buildPaced()` → `js/track/core/mesh.js` `buildTerrainSteps` / `ribbon` / `u.query`; and `js/ui/sheet-shape.js` `watchVisibility()` (MutationObserver that calls `getBoundingClientRect()` on every managed element and `classify()` writes in between, so layout is forced once per element).
- **Evidence:** iPhone 15: open-race-select gaps total 1463 ms and 1900 ms over about 4.5 s (2 sessions), six gaps of 115–234 ms. Local 4x CPU profile: getBoundingClientRect 442 ms with 441 ms of it under sheet-shape's MutationObserver callback; mesh.js ribbon/query/buildTerrainSteps about 600 ms.
- **Fix ideas:** batch the reads and then the writes in `watchVisibility` (or defer to rAF); build the preview off the main thread (`js/track/build-worker.js` exists) or from a cached 2D outline.
- **Expected gain:** about 100 ms per screen open from the layout fix; most of the 1.5 s of gaps from moving the preview off the thread.
- **Player impact:** medium. Menu scrolling and selecting feels sticky.

### 6. Serial `warmCarAssets` (1.6–2.0 s) before the program warm
- **Where:** `js/car/car-draw.js` stepped race warm (`warmCarPhase`, "race car assets ready"), inside `gridCountdown`.
- **Evidence:** warmCarAssets 1643–2018 ms on iPhone 15 (cpuMs 1442, maxStepMs 77, 40 yields), 1251 ms on iPhone 13. Already sliced, so it isn't a freeze, but it's on the critical path. Hot CPU locally: car-shade `smooth`, car-geometry `addTri` / `weld` / `foilThick`. Logs build each team body 2–3 times (once per car, e.g. "build redbull" ×3).
- **Fix ideas:** share teammates' body meshes when livery and setup match; overlap with candidate 1's warm.
- **Expected gain:** 0.5–1.0 s off race entry.
- **Player impact:** medium (loading time).

### 7. iPhone 13 (WebGL2) CPU: physics is the largest JS span
- **Where:** physics step in `js/game.js` tickBody (`PerfSpans "physics"`), which includes AI.
- **Evidence:** iPhone 13: physics 4.0 ms, AI 1.6, HUD 1.05, render submit 1.9 of a 7.4 ms CPU frame at 27.7 fps (floorMs 30.6), so it's still mostly GPU-bound. iPhone 15: physics 1.2–1.8 ms.
- **Fix ideas:** look at physics substep count on 30 fps devices; HUD at 1 ms is worth throttling on WebGL2 phones.
- **Expected gain:** 1–2 ms CPU on older phones; small fps change while GPU-bound.
- **Player impact:** low-medium.

### 8. Voice pack (`assets/voice/fable.bin`, 5.9 MB) downloads during race entry
- **Where:** VoicePack load (js/audio, radio-voice).
- **Evidence:** fetched at about 6.4 s into entry, 508 ms on device; in local runs it timed out after 17 s ("VoicePack fable unavailable: pack fetch timed out").
- **Fix ideas:** fetch after green or at idle on the title.
- **Expected gain:** small on fast networks; avoids fighting for bandwidth on cellular.
- **Player impact:** low.

### Tooling note (not a game fix)
`__apex.diag()` with no arguments triggers a JSON **download** in iOS Safari. The download navigation aborts in-flight fetches, so the next `ensureCircuit` fails ("circuit payload not resident: monza", fetch "Load failed"). Use `__apex.diag({download:false})` in harnesses. This cost three short sessions here.

## Gaps (not covered)
- **Per-pass GPU split (post / shadows / SSR):** `gpuTimer` is unsupported on iOS Safari WebGPU (no timestamp-query), and I didn't run a pass-by-pass ablation. Candidate 2 rests on renderScale and tier correlation, not a direct measurement.
- **Draw calls and triangles:** `xrInfo` isn't reachable on the deployed build. `memState().calls` reads as a cumulative counter (6011 → 36508 over the soak), so it isn't per-frame. Geometry, texture, program and memory counts were captured.
- **Presets:** only MEDIUM was re-profiled. LOW/HIGH/ULTRA numbers are from the earlier suite run (ULTRA 24.5, HIGH/LOW ~2 repeats each); this run added no new sessions for them (ULTRA cap = D·IP1, LOW/MEDIUM = D·IP3).
- **renderScale:** one session per scale (0.75, 1.0). Device-to-device variance is large (Monza 0.5: 43.8 vs 54.7), so treat those as single samples.
- **The 3.7 s Settings freeze didn't reproduce** (2 of 2 opens were under 150 ms). The attribution to the boot warm is an inference.
- **Singapore vs Monza:** spans are similar (CPU frame 5.0 vs 5.4 ms). Singapore r1 drive 46.7 fps, then fell to 23–29 for the rest of the session; r2 was 27.8. The ablation there is unusable because of that collapse.
- **Long-task attribution on device:** Safari has no longtask or LoAF entries, so on-device attribution comes from RaceEntryProfile stages, TLX warm stages, rAF gaps and game logs. Local Chromium CPU profiles (`results/local-*.cpuprofile`) cover the JS side, but SwiftShader's software blit (`readPixels` in soft.js) dominates local race entry, so that part isn't representative.
- **BrowserStack MCP `getFailureLogs`** returned "Unable to access console logs/video – check credentials". Session links come from the REST API instead.
