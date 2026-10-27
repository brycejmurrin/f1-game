# Browser specs map — batch 17

Static inspection covers all 127,596 assigned bytes. specs-17-evidence.json binds whole-file manifest hashes separately from assigned-part and individually returned ≤8,500-byte chunk hashes. It records every intersecting case, assertion expression, import and hook with exact byte/line spans. Assertions describe source intent; none were executed. No browser, tests, network, game runtime, source edits, staging or commit.

## Scope and shared setup

ui-scale.spec.js covers only bytes 83420–103854: the race-task case begins before this range, which starts inside native touch-scroll settlement. Its imports, earlier helpers, matrix declaration and early assertions belong to batch 16. Other ten files are complete. All ranges are half-open; parameterized declarations represent all loop expansions, rather than separate static cases. No binaries occur.

Fixtures support imports pin GLX and attach failure state/log/console where used; raw Playwright imports in foundation and XR/WebKit cases do not acquire that fixture merely by importing a timeout constant. BOOT_MS/TRACK_MS are shared budgets, and most readiness waits use 100ms polling. Production navigation used local code-nav LSP: RaceWakeLock.create resolves to wake-lock.js:12, XrSession.start to xr-session.js:148, WatchTransport.create to watch-transport.js:10. Bounded definition bodies establish ownership/coalescing/transport seams; they do not prove runtime behavior.

## UI scale tail

| Intersecting case | Semantics |
|---|---|
| Race task, partial | Touch swipes advance to end/back with settlement; Tab stays inside task and reaches GO with ≥44px visible capacity; tyre/weather controls change and restore; one scroller at most, no horizontal overflow, requested/applied zoom equal requested scale; GO trial hit; cancel returns selection and errors empty. Gesture CDP session detaches in finally; screenshots and scroll/focus JSON are evidence outputs. |
| Narrow saved Home after rotation | Touch 852×393→393×852→852×393 preserves saved custom profile; wide menu width is 20% and bounded; race/settings/help remain visible destinations with trial clicks; Settings opens/closes. inspector.mjs measures settled geometry; screenshots/JSON do not establish pixel quality. |
| Factory Home enlargement | Seven viewport/safe-area/returning/enlarged cells keep default layout, readable hit-testable destinations and ≤1px overflow. Normal 852/1280 landscape fits all doors, paired race/TT and practice/garage, utilities one strip; safe edges hold. Words cannot split in selected normal labels; metadata may ellipsize. Race/back works; art-only customization preserves menu x/width. Resets safe area, scale/text/layout and detaches CDP on success. |

## understeer-cue.spec.js

fixtures.js and factory-seat.js provide deterministic factory McLaren, landscape 844×390. loadRig proves vibrate and rumble recorders before clearing them, uses headless physics, seed 42 and roadFollow=0. longStraight chooses a clear aero zone. drive resets road-relative placement, steps 1/60, filters unique 70ms rumble paired with vibration, counts other haptics and stops before kerbs unless explicitly disabled. Haptic stubs persist only in the isolated page.

| Case | Semantics |
|---|---|
| Front saturated, both channels | Full lock produces paired pulses, no other haptic, speed above 1.5m/s. |
| Car answering steering | Same-page positive control fires; gentle steer and straight running stay silent above speed floor. |
| Below speed floor | Near-zero grip crawl remains below 1.5m/s and silent; otherwise same setup at 6m/s fires. |
| Off track | On-track positive control; beyond kerb band stays silent while remaining above speed gate. |
| Bounded repeat | After 14 settle ticks, ≥3 pulses, gaps ≥6 and ≤12 ticks, pulse count below quarter of ticks. |
| Saturation depth | Eleven grip levels yield ≥2 levels with ≥3 pulses; deepest median gap shorter than shallowest, every firing median 6–10 ticks. |
| Pace invariance at same depth | Own-top-speed fractions at pace 1/0.5 change starting speed while both deep slides produce ≥3 pulses and equal median gaps, minima ≥6. Does not claim invariance at equal speed fraction without matched saturation. |

## Circuit foundation cases

Raw Playwright plus BOOT_MS; Vegas uses 844×390 and 360s budget. Zandvoort enables trackGeometry and waits populated props before diagnostics, also 360s. Loading is awaited for each day/night build. Diagnostics test generated metadata, rather than rendered appearance.

| File / case | Semantics |
|---|---|
| vegas: explicit coordinates/dip | Racing coordinates, terrain outer 26, barrier gap 1, elevation definition 0.35, city/foliage exclusion; arc-shifted dip at 0.193 lower than shoulders by >0.4m, distant sample near zero. |
| vegas: landmarks/water/spans | Day and night geometry all OK; no required suppressed/invalid/unsafe models; Sphere, High Roller, two Bellagio basins, gateway and halo emitted; both basins water, two overhead spans clearance ≥4.8m. |
| vegas: street walls/night | No NaN, street flag, tight fraction >0.98, wall offset between −1.5 and 3; positive lights and nullable edge gaps ≤0.18. |
| zandvoort: explicit/safe/clear | Racing coordinates, terrain ≥100; day geometry safe, exact required lighthouse/Ferris wheel/watertoren, wall NaN absent/tight fraction >0.55/offset >−1.5; awaited night geometry and required-model safety. Prop/terrain clearance scans delegated elsewhere, not repeated here. |

## vr-emulated.spec.js

Raw Playwright, serial describe; beforeEach skips absent pinned IWER vendor, installs stereo metaQuest3 emulator and collects page errors. iwer-install.mjs provides XR-frame waits, eye sampling and rAF canvas capture. bootAndProbe requires XrBoot binding/API, pins low quality and renderScale 0.5 before attach, checks positive bounded canvas and probe support/ENTER button. Cases use 180s budgets, XR frame waits 45s; endVr requests end and waits presentation off. These are emulated lifecycle checks: no headset frame-time, multiview, MSAA, foveation or XRGPUBinding proof.

| Case | Semantics |
|---|---|
| Start/exit/re-enter | ENTER→EXIT text, live webgl2 session, frames advance twice across re-entry; no page errors. |
| Seated pose/recenter | Initial anchor centered; physical 0.4/0.2/−0.3 movement retained; repeated recenter stable, restores position and gaze across later frames. |
| Controller mapping | Real title menu zeros pedals/held; forced nav closed maps triggers and thumbstick steer (>0.5) without roll/look-back, B emits pause. Temporarily wraps remoteSample/remoteEvent/navOpen and restores them on success. |
| Disconnect/blur | Enters active Monza race, disconnects controllers then visible-blurred; game pauses and visibility returns. Paused immersive presents continue while raceT stays fixed. Cannot isolate disconnect versus blur as pause cause. |
| WebGPU negotiation | Opt-in webgpu denied by IWER yields webgl2 and absent granted feature; pure feature helper discriminates granted feature, sessionInit requests optional feature. |
| Exit restores tick/camera | Stored pre-VR camera preference retained; XR loop active/saved camera set; exit resumes ≥3 game Input.poll calls, clears XR ownership/saved state and restores camera 1. Poll wrapper restored on success. |
| Backend gate/reload | Boot GLX cannot attach; ensureXrBackend returns reloading, pins three/forceGL/pending and stashes previous choice synchronously before reload. Does not assert complete post-reload restore. |
| Stereo/canvas/flat | Usable left eye/viewport, positive frame count; canvas capture fallback carries PNG >2000 bytes; exit clears presenting, title exists, no page errors. PNG size is a content heuristic, not stereo visual validation. |

## wake-lock.spec.js

fixtures.js supplies clickLive for live-render pause controls. mockWakeLock overrides getter-only navigator API, logs request/release, auto-releases on document hidden. WAIT uses TRACK_MS/100ms wall-clock polling. Page isolation bounds mock listeners; Log.info and Document.prototype.hidden are restored in finally where modified.

| Case declaration (expansion) | Semantics |
|---|---|
| Held/late grant × sync/async release failure (4) | RaceWakeLock owner releases exactly once, wanted false, expected failure log; Log.info restored. |
| UA visible release | Grant count 1→2 without visibilitychange; explicit drop and hidden release never reacquire; hidden descriptor restored. |
| Starting race | Two pending holds coalesce into one screen request. |
| Finishing | finishRace releases granted sentinel. |
| Mid-race quit | Pause plus twice-confirmed QUIT releases without results flow. |
| Hidden/return/resume | Hide releases; becoming visible under pause card does not request; RESUME reacquires. |
| Pause/resume | Same request-release-request ownership lifecycle. |
| Missing API | Race/finish tolerates absent wakeLock without page errors. |
| Rejected request | Permission denial tolerated without page errors. |
| Late grant | Grant arriving after finish is immediately released. |
| Stale release | Old sentinel release event cannot clear replacement: finishing releases sentinel 2 after stale event 1. |

Mock lifecycle proves ownership logic, not real device permission, screen brightness or OS wake behavior.

## Renderer and WATCH

| File / case | Semantics and setup |
|---|---|
| watch-transport-layout: open chapters (932×430, 844×390) | Touch/mobile fixtures; six synthetic replay events, three drivers, inert replay methods; open drawer select/jump bottoms differ <4px, bar <62% height, jump ≥44px and right edge within viewport. No real replay seeking or transport teardown asserted; page isolation disposes DOM. |
| webgl-probes: visible scenery | GLX-pinned fixtures, Monza jump/snap plus ten frames; 72m cells available, >50 total, nonzero strict subset visible, ≤4 nearest with nonnegative distance and 3D size. |
| webgl-probes: current shadow | Madrid; hdrMode boolean and bound webgl2 required; wraps shadow pass/cast/end, teleports from 0.20 to 0.75, first nonempty cast within 30 frames has caster within 5m of current target. Wrappers not restored before isolated page disposal. |
| webgl-probes: night increases lights | lightState shape, arrays length 3 and numeric exposure/count; day settle timeout caught, night positive then night > day. LIGHT_MS=45s; caught day timeout makes separate strict-day case important. |
| webgl-probes: Monza day | Wait/assert exactly zero floodlights and defined sun color. |
| webgl-probes: Monaco day tunnel | Positive light and baked counts, ≤48 total. |
| webgl-probes: shader cap | Positive night light count ≤48; reads lightState rather than uniform buffer. Comment mentioning 32 conflicts with actual assertion's 48. |
| webgl-probes: mobile standard | iPhone UA and touch engage GLX mobile/standard; 30 live race frames generate no INVALID_OPERATION/ENUM/VALUE console text. Emulation does not establish phone GPU performance. |

WebGL probes use 240s budgets and loadRace/go; afterEach best-effort resets time of day to default. Console filter covers selected GL error strings only.

## Remaining boot and physics specs

| File / case | Semantics |
|---|---|
| webkit-boot: three+forceGL | Raw Playwright, only webkit project; 844×390, 360s; pins three/forceGL and 45s boot step. Default Montreal or env track; presented-canvas.js waits presentation. Track and three binding checked, nonzero canvas, >10 rAF deltas after 2s warm/5s sample; second race cycle records nullable heap. Writes report.json under artifacts and attaches report. Reports timing/heap without performance thresholds; WebKit proxy is not iOS Safari, no pass census or leak assertion. |
| world-physics: error free | Fixtures, Monza day/dry, pace 1; 300 stepped ticks with steer/throttle, no page/console errors except favicon. |
| world-physics: progress | Jump 50m/s, 60 coasting ticks advance >35m with finite lateral x. |
| world-physics: steer sign | Opposite half-steers over 30 ticks produce corresponding ±x displacement. |
| world-physics: road follow | First twelve corners filtered by curvature: zero input with assist off drifts to geometric outside; gain 0.6 reduces drift. Requires nonempty samples; restores roadFollow=0. |
| world-physics: wheelbase | Ten full-steer ticks at 2.6m wheelbase turn >1.15× heading at 4.4m. Hook tests mechanism, not slider wiring. |
| world-physics: AI progress | 600 ticks with hand-throttled player; AI only stays within |x|≤18, every car gains >100m from own grid slot, speed >2. Inputs cleared after episodes; wheelbase change otherwise page-local. |
| xr-plan: armed webgl2 | Serial raw Playwright with pinned stereo IWER, absent vendor skip, 120s; armed flags choose ApexXR webgl2, stored renderer webgl2, navigator.xr exists. xrCompatible attributes annotated, explicitly not asserted under SwiftShader. |
| xr-plan: armed webgpu fallback | Without XRGPUBinding exact webgpu→webgl2 fallback reason; if binding exists either backend path accepted. Stored gfxBackend remains webgl2. Boot selection only, no immersive session. |

The evidence JSON preserves full intersecting static spans even for partial cases; it does not label unread leading case bytes as inspected. Support filenames here are navigation names, not expanded claims of complete support-file inspection.
