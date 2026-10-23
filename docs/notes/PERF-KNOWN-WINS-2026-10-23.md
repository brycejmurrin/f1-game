# Known perf wins not yet landed, cross-checked against the Device Farm iPhone evidence (2026-10-23)

Base: `origin/claude/f1-game-project-26h3ng` @ 9d15d0b7, fetched 2026-10-23. Notes were read from that ref.
The 17 open PRs and the open issues came from the GitHub REST API. This was read-only: nothing was built, and
nothing was run on a device. A·X1 (session_01Jxz6BMpucD8Gm23RmWTptJ) did the cross-check for OrchA 28.
Routing, from OrchA 28 at 08:20Z: items 1 and 3 are with A·W14 and A·D1. #3479 is queued third in the game
train. Items 4, 7 and 9 become Device Farm A/B legs when the devices are free.

## Context change that resets the ranking

**F1 is already acted on.** #3603 (9f0ce9c6, merged 10-22) makes AUTO on WebKit try three's WebGPU
(`js/render/three/tlx.js:426-435`; `forceWebGL` now only on pin/`!_gpuCanvasOk`/`_autoStayGL`/`_webkitStayGL`).
So every iOS 26+ player now takes the WebGPU leg. Wins on that leg (cold pipeline warm, per-variant warm,
WebGPU submit cost) are worth more than before. WebGL2-leg fill wins still apply to iOS <= 18, to latched
devices and to the player's own pin. #3604 (6931fdf7) already shrank `mirrorPrepare` (now reported as
`programWarm`). PR #3612 (open, MERGE-HOLD) measured that Safari's shader cache survives a force-quit: WebGPU
programWarm takes 7.3, then 2.3, then 0.24 s over three loads.

## Ranked list (phone impact × confidence ÷ effort)

| # | win | source | DF link | gain as measured | status | evidence | effort | risk |
|---|---|---|---|---|---|---|---|---|
| 1 | **Pre-warm the night and rain (session-variant) pipelines** on the idle menu or the first countdown | Device Farm note §9 (PR #3612 branch); mechanism PERF-HUNT-4 A-W1 | F2 | First night race 14.1 s on WebGPU vs 3.6 s on WebGL2; first rain race 5.1 vs 2.9 s; once compiled, 2.8–3.0 s | not landed. Assigned to A·W14; no PR or branch found | `tlx.js` warm stages (`warmFxPrograms` :3121, `warmLateLit` :3180, `warmMirrorStage` :3329) warm only the current session's scene; no night/wet variant warm | M | menu/countdown CPU and memory; it must yield (`menuIdle`) |
| 2 | **Merge #3479**: LOW look-post shed, phone half-res post, `phoneSlowLatch`, renderScale target free | PR #3479 body; IPHONE-TLX-WEBGPU G4 | F1 | iPhone 15 WebGPU: LOW 51.2 vs MEDIUM 57.6 fps before the fix; renderScale linger fixed | in open PR #3479 (ready, full tier green, `MERGE-HOLD: OrchA 25 merges`) | PR head 31f2b236 | done; merge only | low (CI green); no phone re-soak yet |
| 3 | **Post warm on the WebGPU leg**: the second WebGPU load still pays about 1.9 s of `post` pipelines the first warm deferred. `warmPlusOn()` is WebGL-only | Device Farm §8 (PR #3612); tlx.js comment cites census 244 ("WebGPU post does not compile lazily") | F2 | 2.3 s second-load programWarm, mostly post 1.9 s, vs 0.37 s on WebGL2 | not landed | `tlx.js:3224-3226` `warmPlusOn = … backend.isWebGLBackend`; A/B is already possible with `apex26.tlxWarmPlus=1` | S (A/B on Device Farm, then flip) | longer first entry if it adds work to the cold leg; measure both loads |
| 4 | **Fixed render targets ON** (no post-target realloc on governor steps or rotation) | PERF-FRESH-HUNT #3; PERF-RESEARCH §8; LIVE-DEBUGGER-TLX-GPUMEM GPUMEM-5 | F1, memory | Rotation (#3311): 60 fps falls to 24.8 fps/p95 83 ms after one flip, tier 2→4 shed for about 8 s. Every scale step reallocates every post target | not landed. Flag default OFF; #2655 closed "completed" with the lever shipped off | `tlx.js:1187-1195` (`=== "1"`); orchestrator hold 10-17 pending a same-canvas fractional pixel A/B | S–M (finish the pixel A/B, flip for mobileTier) | look (upscale path), SGSR parity |
| 5 | **Thermal drift → 45 fps render rate ON by default on phones** | PERF-IPHONE-AUDIT §6 item 3; #2652 (closed) | F1 (iPhone 14 41.8–55.7 fps on WebGL2) | not measured on a device; #3529 wired drift→RenderRate 45 but only behind opt-in | partial: wired, default OFF | `governor.js:445` reads `apex26.thermalDrift === "1"`; changelog iphone-perf-2026-10-21 says "With thermal-drift detection opted in" | S + device soak (#1633 open) | false positives cap a cool phone at 45; LPM 30 Hz interplay |
| 6 | **Scale step that can cross a vsync quantum** (a phone that could do 60 at about 0.7 sits at 30 with `scaleFutile`) | PERF-FRESH-HUNT #2 | F1 (fill slope 8 ms per full frame on iPhone 14 WebGL2) | Node replay: 2 moves, then scale 1 and a 33.3 ms floor for good | not landed | `governor.js:837,986` still `cur - 0.1`; `:911` | M | governor regressions; perf-governor tests pin behaviour |
| 7 | **SGSR1 upscale default ON at phone MEDIUM/LOW** | PERF-IPHONE-AUDIT §6 item 2; #1652 | F1 | Pending a real-GPU A/B; Device Farm can now run it | not landed; issue #1652 open | `tlx.js:1177-1180` `spatialUpscale=false` unless the DevFlag | S flip + device A/B | look; extra pass cost on the WebGPU leg |
| 8 | **Sky cloud cache 512² on mobileTier** | PERF-HUNT-3 R5; #2649 | memory, fill | 2×2.1 MB instead of 2×4.7 MB RGBA16F (about 5.2 MB GPU) plus less tile load/store on the 16 re-bake band frames; look delta predicted under the A/B floor, not measured | not landed (default off); #2649 open | `tlx.js:1740-1751` (`"1"` only, `&& mobileTier`) | S | small look change at night (max 4.3 LSB predicted) |
| 9 | **Release TLX CPU geometry copies on phones** (static sweep + bounds fix) | PERF-FINDINGS §2m/§2n/§2r (lines ~1900-1990, 3925-4000); PHONE-RENDERER-AB gap 2 | F3 | Desktop 31.6 MB (2r) measured; TLX-vs-GLX gap 42–53 MiB in a race on phone caps; jetsam history | not landed. Triple-gated off (opt-in `apex26.tlxMirrorSweep`, mobile decline 94b9a2da, env gate). **#1647 closed "completed" but nobody gets the bytes** | `tlx.js:6164-6192`; warning still logged at `tlx.js:201` | M (re-enable on purpose, then a handset soak on Device Farm) | HIGH: four earlier attempts failed, one shipped road loss on a phone |
| 10 | ~~Physics catch-up cap 5 → lower on phones~~ **measured, no change** | PERF-FRESH-HUNT #5; PR #3620 (`PHYSICS-CATCHUP-CAP-2026-10-23.md`, A·W25) | F1 | At 6× CPU throttle: p99 8.82 ms, max 11.6 ms per step, against the 16.7 ms budget. Only a pathological case sustains 5 steps | closed: no change. Re-open only if a handset trace shows physics p99 above about 12 ms | PR #3620 | — | — |
| 11 | **Mirror pass cheaper**: RGBA8 + depth invalidate, and/or the full-rung 400 m cull for a 230×66 target | PERF-FRESH-HUNT #7; PERF-TLX-WEBGPU F7; #2657 | F1 | mirror 55–67k tris, about 25% of frame tris; GPU cost unmeasured | partial: #3396 road split covers the mirror (6c631c57); #3604 shares programs; format still HDR, cull still 400 | `tlx.js:1469` (HalfFloat when hdrOk); `mirror-pass.js:84` | S (format) / design call (cull) | look |
| 12 | **Boot: defer the three.js island guess-preload; size the unbundled shell** | #3515 (open); PERF-P2 "~280 boot script tags"; PERF-HUNT-BOOT | F5 (8.5k network rows unanalysed) | 0.7–1.1 MB wrong-backend fetch on a guess miss; index.html carries 310 `<script>` tags; minify landed, bundling did not | partial: low-priority speculative preloads landed (`script-loader.js:59-76`, `renderer-boot.js:9,455`); island half open | issue #3515 body "Fix (partial)" | M | boot ordering |
| 13 | **Garage prebuild holds about 11 MB in the menu** on phones | LIVE-MEMORY-H12 #4 | memory | about 11 MB transient | open ("by design?") | `js/garage/prebuild.js` has no mobile gate | S | slower first garage open |
| 14 | **WebGPU leg submit/bind cost**: about 9 `queue.submit` and 38 `writeBuffer` per frame; per-object bind groups | PERF-TLX-WEBGPU F6; PERF-IPHONE-AUDIT item 8 | F1 | not measured on a phone | not landed; needs a three bump past r186 (#30560). UNVERIFIED whether a release carries it | `vendor/three-0.186.1` | L | vendor bump |
| 15 | **Scene RGBA16F → R11F_G11F_B10F** (and SSR tag RGBA16F for one value) | PERF-FRESH-HUNT smaller items | fill/memory | 1.76 MB scene colour at phone size; bandwidth | not landed. UNVERIFIED whether the WebGPU leg exposes renderable rg11b10 | `tlx-post.js:132,206` per the note | S–M | banding; capability probe |
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
10. **"Stream the chunk system"** to fix CPU copies: withdrawn (PERF-FINDINGS §2n; index half is about 1/40 of the gap). **forceMobileTier device-lost**: a paravirtual artefact (TLX-FORCED-MOBILE-DEVICE-LOST-2026-10-20).

## Unverified

- Whether a three release after r186 carries the per-object UBO/bind-group work (#30560) or the depth-only shadow RT (r187). No web check was done here.
- Renderable `rg11b10ufloat` on iOS WebGPU.
- Device Farm §8/§9 numbers live on the PR #3612 branch, not yet on the deploy branch.
