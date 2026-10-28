# Known perf wins and remaining opportunities, cross-checked against the Device Farm iPhone evidence (2026-10-23)

Base: `origin/claude/f1-game-project-26h3ng` @ 9d15d0b7, fetched 2026-10-23. Notes were read from that ref.
The 17 open PRs and the open issues came from the GitHub REST API. This was read-only: nothing was built, and
nothing was run on a device. A·X1 (session_01Jxz6BMpucD8Gm23RmWTptJ) did the cross-check for OrchA 28.
Routing, from OrchA 28 at 08:20Z: items 1 and 3 are with A·W14 and A·D1. #3479 is queued third in the game
train. Items 4, 7 and 9 become Device Farm A/B legs when the devices are free.

## Reconciliation against 95f836e9 (2026-10-23)

The base, routing and historical measurements above describe the original 08:20Z survey. The statuses below
were reconciled against deploy commit `95f836e9dc128bac4ceb0ce4b10ef8c7bbe6148b`, its source and merged PRs.
This reconciliation ran no device sessions; it cites the existing [Device Farm ledger](DEVICE-FARM-LEDGER-2026-10-23.md#1-runs).
Row numbers remain stable so existing handoffs still resolve; landed rows are retained as history, not work to repeat.

The remaining first-entry problem is measured on an actual iPhone 14. Ledger **row 21** (#3664), at live build
`5e325f91` after #3653 and #3662, records cold Monza-night WebGPU entry **18.4 s**, race warm **14.0 s**
(scene **9.5 s**, draw **3.4 s**, FX **1.1 s**, including rig **1.11 s / 28 pairs** within draw),
`programWarm` **14.9 s**, then **59.9 fps**. Row 17's corresponding entry/warm were **22.3 / 16.9 s**.
This is not an isolated A/B: row 21 also ran #3633's **7.5 s menu warm** (garage scene 6.7 s, scene 0.6 s),
which row 17 did not. Some work may have moved to the menu rather than disappeared. Attribute the remaining
scene pipelines and measure total menu-plus-entry work before proposing further warm changes.

The WebGL2 visor problem **#3657 remains unresolved**. Ledger **rows 19–20** (#3663) follow merged #3659:
the 12-arm order test recorded governor trips at tier >= 3 for additive blend **3/4**, plain-over **3/4**,
visor-off **1/4**, with mean FPS **52.9 / 52.4 / 52.2**. That run does not demonstrate a benefit from the blend
change. It concerns the WebGL2 fallback; the owner's preferred TLX WebGPU path has a different cost profile.

## Context change that resets the ranking

**F1 is already acted on.** #3603 (9f0ce9c6, merged 10-22) makes AUTO on WebKit try three's WebGPU
(`js/render/three/tlx.js:426-435`; `forceWebGL` now only on pin/`!_gpuCanvasOk`/`_autoStayGL`/`_webkitStayGL`).
Eligible iOS 26+ AUTO players now try the WebGPU leg; failed devices and explicit pins retain their fallback.
Wins on that leg (cold pipeline warm, per-variant warm, WebGPU submit cost) are worth more than before. WebGL2-leg fill wins still apply to iOS <= 18, to latched
devices and to the player's own pin. #3604 (6931fdf7) already shrank `mirrorPrepare` (now reported as
`programWarm`). PR #3612 (merged 2026-10-23) measured that Safari's shader cache survives a force-quit: WebGPU
programWarm takes 7.3, then 2.3, then 0.24 s over three loads.

## Ranked list (original order; statuses reconciled above)

| # | win | source | DF link | gain as measured | status | evidence | effort | risk |
|---|---|---|---|---|---|---|---|---|
| 1 | **Remaining cold first-race pipelines; re-measure session variants** | Historical Device Farm §9 / ledger row 11; latest ledger row 21 (#3664) | F2 | Historical: first night 14.1 s WebGPU vs 3.6 s WebGL2; rain 5.1 vs 2.9 s; warm 2.8–3.0 s. Latest cold iPhone 14 race warm 14.0 s (context above) | partial: #3651 unified day/night lit WGSL; #3653 dropped an unused winding pipeline; #3662 makes finish tints 60–85 compile on demand. Remaining night/rain cost needs a current-build attribution | `tlx.js:3190-3229,3423-3498`; ledger rows 17, 21. Do not repeat the old day/night-lit diagnosis as unfixed | M | first-entry latency and menu CPU/memory; compare total work and yield |
| 2 | **LOW look-post shed, phone half-res post, `phoneSlowLatch`, renderScale target free** | #3479; IPHONE-TLX-WEBGPU G4; ledger row 18 (#3654) | F1 | Historical iPhone 15 WebGPU: LOW 51.2 vs MEDIUM 57.6 fps. Post-fix iPhone 14: MEDIUM 59.9, LOW 59.8, MEDIUM 59.3 fps; scale reads back 1 / 0.75 / 0.5 without linger | landed: #3479 merged (e64e4259); real-device follow-up recorded | ledger row 18, live 9003114e | done | keep the historical before/after devices distinct |
| 3 | **WebGPU menu warm covers post/shadow/cockpit** | Historical Device Farm §8 / ledger row 10; #3633 | F2 | Historical second-load programWarm 2.3 s, mostly post 1.9 s, vs WebGL2 0.37 s; current menu warm measured separately in ledger row 21 | landed: #3633 enables WebGPU post warm on the menu and yields between warm stages; caster warm defaults on across backends | `tlx.js:3231-3263,3461-3477`: `warmPlusOn()` includes WebGPU when `where === "menu"`; loading/race post warm retains its gate | done; validate remaining first-entry cost under item 1 | do not count work moved to the menu as eliminated |
| 4 | **Fixed render targets for governor scale changes** (orientation changes still resize physical targets) | PERF-FRESH-HUNT #3; PERF-RESEARCH §8; LIVE-DEBUGGER-TLX-GPUMEM GPUMEM-5 | F1, memory | Historical #3311 software-GL rotation: 60 fps to 24.8 fps/p95 83 ms after one flip, tier 2→4 for about 8 s; not handset GPU evidence. Default scale steps reallocate post targets | not landed. Flag default OFF; #2655 closed "completed" with the lever shipped off. A same-canvas fractional-pixel handset A/B remains required | `tlx.js:1192-1203`; `tlx-post.js:319-332,545-563`: fixed mode avoids scale reallocations, but rotating still changes physical PW/PH | S–M (A/B before a default decision) | upscale/SGSR parity, retained full-size allocations; rotation is a separate case |
| 5 | **Thermal drift → 45 fps render rate ON by default on phones** | PERF-IPHONE-AUDIT §6 item 3; #2652 (closed) | F1 (iPhone 14 41.8–55.7 fps on WebGL2) | not measured on a device; #3529 wired drift→RenderRate 45 but only behind opt-in | partial: wired, default OFF | `governor.js:445` reads `apex26.thermalDrift === "1"`; changelog iphone-perf-2026-10-21 says "With thermal-drift detection opted in" | S + device soak (#1633 open) | false positives cap a cool phone at 45; LPM 30 Hz interplay |
| 6 | **Scale step that can cross a vsync quantum** (a phone that could do 60 at about 0.7 sits at 30 with `scaleFutile`) | PERF-FRESH-HUNT #2 | F1 (fill slope 8 ms per full frame on iPhone 14 WebGL2) | Node replay: 2 moves, then scale 1 and a 33.3 ms floor for good | not landed | `governor.js:837,986` still `cur - 0.1`; `:911` | M | governor regressions; perf-governor tests pin behaviour |
| 7 | **SGSR1 upscale default ON at phone MEDIUM/LOW** | PERF-IPHONE-AUDIT §6 item 2; #1652 | F1 | Decided 2026-10-27: stays OFF; iPhone 14 A/B (PR #3708, ledger row 24) showed no gain over noise | not landing; #1652 closed by docs PR | `tlx.js:1177-1180` `spatialUpscale=false` unless the DevFlag | S flip + device A/B | look; extra pass cost on the WebGPU leg |
| 8 | **Sky cloud cache 512² on mobileTier** | PERF-HUNT-3 R5; #2649 | memory, fill | 2×2.1 MB instead of 2×4.7 MB RGBA16F (about 5.2 MB GPU) plus less tile load/store on the 16 re-bake band frames; look delta predicted under the A/B floor, not measured | not landed (default off); #2649 open | `tlx.js:1740-1751` (`"1"` only, `&& mobileTier`) | S | small look change at night (max 4.3 LSB predicted) |
| 9 | **Release TLX CPU geometry copies on phones** (static sweep + bounds fix) | PERF-FINDINGS §2m/§2n/§2r (lines ~1900-1990, 3925-4000); PHONE-RENDERER-AB gap 2 | F3 | Desktop 31.6 MB (2r) measured; TLX-vs-GLX gap 42–53 MiB in a race on phone caps; jetsam history | not landed. Triple-gated off (opt-in `apex26.tlxMirrorSweep`, mobile decline 94b9a2da, env gate). **#1647 closed "completed" but nobody gets the bytes** | `tlx.js:6164-6192`; warning still logged at `tlx.js:201` | M (re-enable on purpose, then a handset soak on Device Farm) | HIGH: four earlier attempts failed, one shipped road loss on a phone |
| 10 | ~~Physics catch-up cap 5 → lower on phones~~ **measured, no change** | PERF-FRESH-HUNT #5; PR #3620 (`PHYSICS-CATCHUP-CAP-2026-10-23.md`, A·W25) | F1 | At 6× CPU throttle: p99 8.82 ms, max 11.6 ms per step, against the 16.7 ms budget. Only a pathological case sustains 5 steps | closed: no change. Re-open only if a handset trace shows physics p99 above about 12 ms | PR #3620 | — | — |
| 11 | **Measure mirror bandwidth before changing its target or cull** | PERF-FRESH-HUNT #7; PERF-TLX-WEBGPU F7; #2657/#3104 | F1 | Historical full-rung census: 55–67k tris, about 25% of frame tris; GPU cost unmeasured. This is not the default phone rung | partial: #3396 splits road; #3604 shares scene/mirror programs. Phones have at least the lite rung (120 m), while desktop full remains 400 m | `mirror-pass.js:83-87,579-590`; `tlx.js:1470-1488`: mirror HDR/MRT attachment state matches the scene to reuse pipelines | M (handset pass-cost and visual A/B) | RGBA8 can reintroduce distinct pipelines/warm work; cull changes affect the look |
| 12 | **Boot: defer the three.js island guess-preload; size the unbundled shell** | #3515 (open); PERF-P2 "~280 boot script tags"; PERF-HUNT-BOOT | F5 (8.5k network rows unanalysed) | 0.7–1.1 MB wrong-backend fetch on a guess miss; index.html carries 310 `<script>` tags; minify landed, bundling did not | partial: low-priority speculative preloads landed (`script-loader.js:59-76`, `renderer-boot.js:9,455`); island half open | issue #3515 body "Fix (partial)" | M | boot ordering |
| 13 | **Avoid speculative title garage prebuild retention on phones** | LIVE-MEMORY-H12 #4; #3632 | memory | Historical idle-title retention about 11 MB; no new handset memory measurement in this reconciliation | landed: #3632 gates speculative title prebuild on phones/low-memory clients and releases an existing title prebuild; race settings still prebuilds for RACE! | `js/garage/prebuild.js:81-92,119-123` (`phoneHold` / `phone-hold`); title release path in the same module | done | first garage open may do more work; race-settings warm remains intentional |
| 14 | **WebGPU leg submit/bind cost**: about 9 `queue.submit` and 38 `writeBuffer` per frame; per-object bind groups | PERF-TLX-WEBGPU F6; PERF-IPHONE-AUDIT item 8 | F1 | not measured on a phone | not landed; needs a three bump past r186 (#30560). UNVERIFIED whether a release carries it | `vendor/three-0.186.1` | L | vendor bump |
| 15 | **Scene RGBA16F → R11F_G11F_B10F** | PERF-FRESH-HUNT smaller items | fill/memory | Historical scene-colour estimate 1.76 MB at phone size; GPU benefit unmeasured. The old SSR-tag RGBA suggestion is already addressed on WebGPU | scene-format proposal unlanded; renderable rg11b10 on iOS WebGPU remains unverified. SSR tag uses RedFormat on WebGPU / indexed-blend WebGL2 | `tlx-post.js:209-231`; WebGL2 without indexed blending intentionally retains RGBA for source alpha | S–M | banding; capability probe; preserve the WebGL2 blending fallback |
| 16 | **LOW-tier direct path** (scene → RGBA8 → FXAA) | PERF-FRESH-HUNT #16 | F1 | GPU −15% at LOW (predicted) | not landed; #3479 sheds look-post at LOW (partial overlap) | — | high | look parity |

Lower and not phone-led: GLX dust-chunk fold, `_triY` constants, `toF32` upload copy (PERF-P1 §6); boxed doubles in
`updateCar*` (PERF-CPU-LOAD #1); collapse chunk index ranges (FRESH #14, −60% draws, but G4 says phones are
pixel-bound); far-car AI at 30 Hz (FRESH #15); `Wind.sync` string key (FRESH #12); garage livery +26.7 MB textures (#3609, open, not from a perf note).

## Already landed or stale (do not redo)

1. **AUTO = WebGL2 on WebKit (F1)**: reversed by #3603 (9f0ce9c6). The Device Farm note's F1 text predates it.
2. **mirrorPrepare = whole warm (F2)**: #3604 (6931fdf7) makes the mirror share the scene's programs; the stage is now `programWarm`.
3. **Governor blind below 10 fps** (§2t, 09-02) and **ladder stuck at rung 1** (§2u): landed (#3529, e5cc6edf).
4. **Governor timed the rAF interval under RenderRate** (FRESH #1): landed (`governor.js:593-602`, `game.js:8455` passes `RenderRate.drew()`).
5. **Scene depth kept with the sun off screen** (FRESH #6): landed (`tlx-post.js:984-993`).
6. **PCSS blocker on WebGPU phones**: gated off (#3529). **ULTRA on phones**: capped (#3478).
7. **TLX road unchunked/unculled** (H10 overlap, part of #2657): split into culled drawRange runs, main and mirror (#3396).
8. **First-2-min lazy flap meshes, Settings freeze, race-select hitch** (G3/G5): #3487, #3491, #3489 merged 10-23.
9. **Godray RGBA16F→R11F** (#2649 item): kept on purpose because alpha carries the folded SSAO (`tlx-post.js:100-102`). Not a free win.
10. **Day/night lit shader duplication, unused cockpit winding pipeline, eager finish-tint graph**: #3651, #3653 and #3662 landed; remaining cold scene compile cost is item 1, not evidence those fixes are absent.
11. **WebGPU menu post/shadow/cockpit warm**: #3633 landed; item 3 records the current menu-specific policy.
12. **Idle-title garage retention on phones**: #3632 landed; item 13 retains the original memory estimate as history.
13. **LOW slower than MEDIUM / renderScale linger**: #3479 landed, with the device follow-up in ledger row 18.
14. **"Stream the chunk system"** to fix CPU copies: withdrawn (PERF-FINDINGS §2n; index half is about 1/40 of the gap). **forceMobileTier device-lost**: a paravirtual artefact (TLX-FORCED-MOBILE-DEVICE-LOST-2026-10-20).

## Unverified

- Whether a three release after r186 carries the per-object UBO/bind-group work (#30560) or the depth-only shadow RT (r187). No web check was done here.
- Renderable `rg11b10ufloat` on iOS WebGPU.
- The original Device Farm §8/§9 numbers are now on deploy via merged #3612 and ledger rows 10–11; they describe older builds. Remaining rain/night cost after #3651/#3633 needs a current-build A/B.
- Fixed targets and 512² sky-cache defaults still need their device and visual A/Bs; this reconciliation changes no renderer defaults.
- #3657 visor-induced WebGL2 quality shedding remains unresolved; merged #3659 did not demonstrate a performance gain in ledger rows 19–20.
