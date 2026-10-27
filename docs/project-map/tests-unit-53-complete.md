# tests/unit group 53 — complete source map

Read-only mapping of all 14 assigned files (4,913 lines). Every assigned line was read in bounded, line-numbered calls (at most 100 lines and 10,000 source characters each); an initially aggregated truncated display of chunked lifecycle lines 1–240 was reread in individual bounded calls. No tests, browser sessions, runtime edits or commits were performed. Assertion/case ranges below were checked with a source-only Espree AST inventory; no test modules were imported.

There are 180 lexical test registrations, expanding to 217 named cases through the matrices below. Assertion spans list every `assert.*` call in each case, including callbacks/inner loops; shared harness assertions are listed separately. A span is inclusive; a single number means one line. Assertions inside loops execute for each fixture value. Test names state the intended invariant; fixture/target/limit rows explain what evidence that name actually supplies.

## Source identity and complete read ranges

| Source | Read range | SHA-256 |
|---|---|---|
| `tests/unit/title-menu-even.test.mjs` | 1–502 | `9ec7c385e5df77d8a0d61086f1bc5226c3ad03be014297f19582074976a73fca` |
| `tests/unit/title-warm.test.mjs` | 1–128 | `aa376b7f2bff4fedb6b3966e7af7a64ca651877d6eacea80966457e3c474215d` |
| `tests/unit/tlx-anim-pump.test.mjs` | 1–84 | `6eb375c61fd9255dc0dfd7047f48153c7cb1190728a5d6654fd57978dede5548` |
| `tests/unit/tlx-car-shadow-cpu.test.mjs` | 1–81 | `8d0ee8eeb4e8b1de3b90c9abcb03641cf981e322832b7fa06579ec2bdd5dca83` |
| `tests/unit/tlx-chunked-lifecycle.test.mjs` | 1–486 | `57c309ccb2057ec12b77fe9983951830e12d1d01ccabe02e70f10f482bc3f74f` |
| `tests/unit/tlx-cull-shadow-pack.test.mjs` | 1–178 | `8e775f43f49a3c1bf025904f53a58904569dfbb73e9ea05e79b9e08ff036203d` |
| `tests/unit/tlx-fail-scope.test.mjs` | 1–322 | `4ee34e675abb3b2563284939c28c730fb50af63e1d7017dcff052453ff8246b0` |
| `tests/unit/tlx-fx-warm.test.mjs` | 1–101 | `f1b024f02aad37cac736dc4ca2fdf3efb7519ba4e8233044ffd97ec2c3b6dab0` |
| `tests/unit/tlx-glow-instancing.test.mjs` | 1–123 | `aa306f495fbd012819cc414540feba6d9eacce95022a6f7ce14daf2c3e8f618e` |
| `tests/unit/tlx-gpumem-leak.test.mjs` | 1–56 | `a55d0d5b655059ef55628b7859a78e23012d5d527a7c779cabdc8c3e32ba870a` |
| `tests/unit/tlx-hunt3.test.mjs` | 1–956 | `0e3d76b7d02ed5a80a648c83fa10edb03e89056ec93226ee11b295fc2ba7467d` |
| `tests/unit/tlx-hunt4.test.mjs` | 1–464 | `0471b15645451643e3cb56f598fe19009a2638e1b8893871a1859653e414288f` |
| `tests/unit/tlx-hunt4b.test.mjs` | 1–850 | `84861c837f2aefc4e9140540b4abf053f67043afe4f9e26d857b5f8e6e7aa582` |
| `tests/unit/tlx-hunt4c.test.mjs` | 1–582 | `4b85a72b67838f2bd7e0b0a9242bd2b3b5688842dc58e6e05a34ce9be3df1b5a` |

## Production navigation evidence

Local `bash tools/mcp/lsp-mcp.sh` was used from this checkout (code-nav skill). Navigation only; commands did not execute tests.

| LSP query | Resolved production relationship |
|---|---|
| outline TLX | `js/render/three/tlx.js`: TLX :4, create :174, export :6851. |
| refs TLX.create | `js/render/gfx.js`:280,284 calls the renderer factory; definition :174 and export :6851. |
| outline TitleMenu; refs TitleMenu.create | `js/ui/title-menu.js`:17 organize,59 repairDestinations,103 setText,106 setAttr,109 setHidden,119 usedSaveCount,135 create; `js/game.js`:3500 consumes create. |
| refs TitleWarm.create | `js/perf/title-warm.js`:42 definition,105 export; `js/game.js`:3543 consumes create. |
| outline tlx-chunked | `js/render/three/tlx-chunked.js`:139 packAttr,144 packAttrSteps,319 chunkPrepareConfig,356 prepareChunksSteps,513 prepareChunks,529 chunked,717 splitRanges,732 mergeRuns. |
| refs TLXShaders.chunked | export `js/render/three/tlx-chunked.js`:768; consumed by `js/render/three/tlx.js`:1860,1863. |
| outline tlx-shadow; refs TLXShaders.shadowSys | `js/render/three/tlx-shadow.js`:18 uboInstCap,37 shadowSys,969 export; consumed by `js/render/three/tlx.js`:1320,1323. |
| refs TLXShaders.postChain | `js/render/three/tlx-post.js`:1311 export; `js/render/three/tlx.js`:1375,1376 buildPost consumes it. |

The TLXShaders queries explicitly report **text-match fallback** because window.TLXShaders is untyped and assembled from multiple assignments/spreads; these are candidate usage locations, not a checker-proven unique export. The title and TLX.create references are checker results. Vendored private fields are intentionally inspected by the tests, so vendor updates can invalidate the instrumentation independently of game behavior.

## Case and assertion map

### title-menu-even

`tests/unit/title-menu-even.test.mjs` — Static CSS/HTML pins plus two VM title-menu behaviors.

| Context | Meaning |
|---|---|
| Fixtures | readCssSource resolves CSS source; read reads shell/JS. norm/visibleText strip SVG/tags and normalize labels (316–318); miniature reparenting DOM (393–411); write-tracking El, malformed/null raw saves, in-memory Ferrari career and daily streak (431–479). |
| Production targets | css/menus.css, css/responsive.css, css/experience.css, css/components.css, css/overlays.css, index.html; js/ui/title-menu.js organize/create/refresh; js/race/daily-challenge.js logging. |
| Limits | Regexes freeze spelling/selectors rather than computed layout/cascade. Label normalization is a simplified axe model. Fake DOM does not implement layout/events/a11y tree; refresh covers one live driver slot and raw-hit count, not validity of parsed saves. |
| Shared assertion spans | None outside registrations. |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| title 2-up rows share equal flex cells and fill them | 14–29 | 16, 17, 18, 19, 20–23, 24–27, 28 |
| compact landscape title doors fit without a nested scroller | 31–53 | 33–37, 38–42, 43–47, 48–52 |
| tall title leftover-row is not gated on compact density | 55–75 | 60–64, 65–69, 70–74 |
| title overlay columns grow with --vwz instead of a pixel cap | 77–90 | 80, 81, 82–83, 84, 85, 86, 87, 88, 89 |
| title hero exposes returning-player and daily doors with explicit names | 92–142 | 95, 96, 97, 99, 101–102, 103, 104, 105–106, 107, 108, 109, 112–116, 117–118, 119–123, 124–125, 126–130, 131–132, 137–141 |
| title scrollers never paint a ScrollFade thumb | 144–151 | 149–150 |
| narrow title column hides the native bar and reserves a tap under the last door | 153–183 | 158–162, 163–167, 168–172, 173–177, 178–182 |
| CONTINUE + Daily stack the save line under the label, not beside it | 185–224 | 194–198, 199–203, 204–208, 209–213, 214–218, 219–223 |
| mid-wide title rooms keep one-line labels and air under the utility row | 226–261 | 231–235, 236–240, 241–245, 246–250, 251–255, 256–260 |
| tall Classic docks ANIMATE BACKGROUND to the bottom, not under the wordmark | 263–288 | 268–272, 273–277, 278–282, 283–287 |
| INSTALL APP lifts one tap when ANIMATE BACKGROUND is showing | 290–309 | 292–296, 297–301, 304–308 |
| title doors: the accessible name contains the visible label | 320–328 | 324, 325–326 |
| title doors: the label and its sub-line are separated by a space, never abutting | 330–338 | 334, 335–336 |
| title explore: #mb-watch is WATCH with BROADCAST / REAL RACES in .mb-sub | 340–353 | 346–350, 351–352 |
| title explore doors carry leading .btn-ico like the play-now row | 355–366 | 360–364 |
| title retention doors carry leading .btn-ico like the play-now row | 368–379 | 373–377 |
| title menu: the doors the script re-names start with their visible label | 381–389 | 383, 384, 385, 386, 388 |
| destination grouping preserves original controls and routes shortcuts through settings | 392–424 | 415, 415, 417, 418, 419, 420, 421, 423 |
| title refresh counts saves without cloning them and skips unchanged door text | 426–502 | 484, 485, 486, 487, 488, 489, 490, 491, 493, 495, 496, 497, 500, 501 |

### title-warm

`tests/unit/title-warm.test.mjs` — VM scheduling/state/storage behavior plus source wiring.

| Context | Meaning |
|---|---|
| Fixtures | rig (17–45) loads real GaragePrebuild and TitleWarm with fake clock, DOM, navigator, store and schedule/prepReady; idle begins with first eligible poll. |
| Production targets | js/perf/title-warm.js create/poll/wants/state; js/garage/prebuild.js gates; js/game.js scheduling; tools/manifest.cjs; js/core/save-schema-registry.js. |
| Limits | Schedules are counters, prep readiness injected; no actual prep, pipeline compilation, browser cache persistence or phone timing. Case title says hidden tab/off-title, but explicit coverage is saveData/home/warmable/picker; leaving title is exercised separately. |
| Shared assertion spans | None outside registrations. |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| a phone runs the title warm once per update: schedules after idle, records the build when the prep is warm | 47–61 | 50, 52, 53, 55, 57, 58, 60 |
| a phone that already warmed this build skips it; a new build warms again; a desktop warms every session | 63–74 | 66, 67, 70, 73 |
| never under Save-Data, a 3D Home, no warm(), a hidden tab, or off the title | 76–88 | 81, 82, 86, 87 |
| idle counts from the title showing: a blocker held for longer than MENU_IDLE_MS does not pre-age the quiet clock | 90–101 | 96, 98, 100 |
| leaving the menus mid-prep re-arms it; tapping RACE keeps it running through the picker | 103–117 | 106, 108, 110, 114, 116 |
| game.js wiring: the prep's current() accepts a title warm, and the poll is created and started | 119–128 | 123, 124, 125, 126, 127 |

### tlx-anim-pump

`tests/unit/tlx-anim-pump.test.mjs` — Extracted real pump behavior plus installation source pins.

| Context | Meaning |
|---|---|
| Fixtures | loadPump (20–24) regex-extracts the helper; fakeAnimation (28–35) models start/stop/context with request counters and parked callback. |
| Production targets | js/render/three/tlx.js pumpAnimation, renderer initialization and begin. |
| Limits | Fake three Animation covers tick semantics and XR context replacement, not actual XR/session rendering or vendor animation version compatibility; installation is regex evidence. |
| Shared assertion spans | 22 |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| the pump parks three's tick and runs it once per drain, never through the window | 37–54 | 42, 44, 45, 48, 49, 51, 53 |
| XRManager's save/restore of the context keeps the pump | 56–66 | 64, 65 |
| a renderer without three's Animation is left alone | 68–72 | 70, 71 |
| every backend installs the pump (no backend gate); begin() drains it when present | 74–84 | 76, 77–78, 79, 80–81, 83 |

### tlx-car-shadow-cpu

`tests/unit/tlx-car-shadow-cpu.test.mjs` — Source pins and extracted registration/sweep behavior.

| Context | Meaning |
|---|---|
| Fixtures | lift (26–35) simple brace matching; CountingRef and 4,000 retained ordinary geometries, two car casters, fake release stats (38–54). |
| Production targets | js/car/car3d.js silhouette tag; js/render/three/tlx.js _regGeo/sweepCarShadowMirrors/post health; js/render/three/tlx-shadow.js caster capacity. |
| Limits | CountingRef is deterministic rather than GC; releaseGeoMirrors is a stub. Byte release amount and real CPU/GPU residency are not proven. Regex mobile pad and post-health checks do not execute those paths. |
| Shared assertion spans | 28 |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| silhouette car builds tag CPU mirror release for TLX | 13–18 | 14, 15, 16, 17 |
| M-12: mobile skips UBO pad on the legacy padded shadow caster only | 20–23 | 21, 22 |
| sweepCarShadowMirrors walks only the car casters, not the whole geometry registry | 37–74 | 55, 59, 60, 64, 67, 68, 71, 72 |
| a healthy post frame reuses the post-health record instead of minting one per frame | 76–81 | 78, 80 |

### tlx-chunked-lifecycle

`tests/unit/tlx-chunked-lifecycle.test.mjs` — Real chunk preparation/binning over lightweight THREE ownership objects; source integration pins.

| Context | Meaning |
|---|---|
| Fixtures | THREE stubs (16–34); real ChunkBins and TLXShaders.chunked VM (36–49,96–107); 6×6×70 triangle grid and sorted triSet (108–123); dense/local/wide dust (208–215); preparation VM and snapshot (315–330); retained raw-channel fixture (416–426). |
| Production targets | js/render/three/tlx-chunked.js build/free/pack/splitRanges/mergeRuns/prepareChunks/prepareChunksSteps/config; js/render/shared/chunk-bins.js; js/track/build-client.js replay; js/game.js and js/render/shared/shadow-pass.js ribbon/tier wiring. |
| Limits | No renderer/GPU, real worker or transfer detachment; structuredClone tests payload transport shape. Synthetic AABBs and known triangles bound merge correctness; worker fallback is driven via fake rAF/microtasks. Disposal assertions concern fake geometry counters and release hooks. |
| Shared assertion spans | None outside registrations. |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| free releases and disposes a plain geometry exactly once | 52–63 | 60, 61, 62 |
| free releases every chunk geometry before dropping the handle | 65–89 | 83, 85, 86, 87, 88 |
| merge 1 keeps one draw chunk per lamp cell and no separate lamp table | 125–129 | 127, 128 |
| merge 2 folds 2x2 cells per draw, keeps every triangle once, and keeps the lamp cells | 131–141 | 134, 135, 136, 137, 139, 140 |
| the merge is ON by default (no stored value) | 143–148 | 145, 146, 147 |
| merge ${merge} builds final indices once at the ${vertices}-vertex boundary | 151–181 | 176–177, 178, 179, 180 |
| snorm16 normal pack clamps, never wraps, at the 1.0001 admission edge | 188–203 | 198, 200, 201–202 |
| dust merge folds one-triangle cells into shared draws and keeps every triangle once | 217–227 | 220, 221, 222, 223, 224, 226 |
| orphan dust whose box already spans a block shares one draw across blocks | 229–246 | 241, 242, 243, 245 |
| a dust draw's box is the union of its parts, so the cull never drops a member | 248–254 | 252 |
| game keeps the sole prebuilt ribbon usable across envCull and tier changes | 258–279 | 260, 261, 262, 263, 274, 275, 276, 278 |
| splitRanges covers every index exactly once and boxes its own vertices | 292–301 | 297, 298, 298, 299, 299, 300 |
| mergeRuns joins contiguous ranges and closes the smallest gaps down to the slot cap | 303–313 | 308, 309, 310, 311, 312 |
| prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=${fmt24} pack=${pack} pad4=${pad4} | 332–345 | 341, 344 |
| cooperative old-worker fallback yields during a single record, and canceled ownership allocates no THREE geometry | 348–359 | 355, 356, 357, 358 |
| unsupported prepared versions and changed backend settings use cooperative raw fallback | 361–376 | 372, 373, 374 |
| THREE finalization disposes partially allocated geometries on failure | 378–387 | 385, 386, 386, 386 |
| prepared canceled owner releases payload before any THREE allocation | 389–397 | 395, 396, 396 |
| chunk preparation configuration preserves per-instance merge setting | 399–404 | 402, 403 |
| accepted worker preparation carries packing diagnostics without repeating the CPU work | 406–414 | 412, 413 |
| synchronous source retention matches legacy points chunked=${chunked} full=${keepFull} positions=${keepPositions} | 429–453 | 436, 437, 438, 443, 444, 449, 449, 450, 451, 451, 452 |
| worker and cooperative preparation preserve keep-flagged raw inputs on success and failure | 456–469 | 466, 466, 467 |
| failed synchronous preparation clears refused payload and follows legacy pre-bin release without THREE allocations | 471–486 | 479, 480, 481, 482, 483, 484 |

Registration matrices: lines 150–182 expand `merge ${merge} builds final indices once at the ${vertices}-vertex boundary` for vertices = 65535,65536 × merge = 2,3,4 (6 names); 331–346 expand `prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=${fmt24} pack=${pack} pad4=${pad4}` for fmt24 = false,true × pack = 0,1 × pad4 = 0,1 (8 names); 428–454 expand `synchronous source retention matches legacy points chunked=${chunked} full=${keepFull} positions=${keepPositions}` for chunked = false,true × full = false,true,undefined × positions = false,true,undefined (18 names). The displayed template and full Cartesian domains identify every expanded case; case/assertion spans are shared by all members.

### tlx-cull-shadow-pack

`tests/unit/tlx-cull-shadow-pack.test.mjs` — Extracted backend cullers with real InstCells/Frustum and mirror recorder.

| Context | Meaning |
|---|---|
| Fixtures | span/load (23–52) lift cull/cast/recorder; four instances in two 72m cells (54–62); radialRig (94–119) models TLX/GLX/WGX frame latches and upload counters, four cells including tall silhouette. |
| Production targets | js/render/three/tlx.js cullInstances/castShadowInstanced; js/game.js mirror pack recording; js/render/shared/inst-cells.js and frustum.js; js/render/glx/glx.js and js/render/webgpu/wgx.js cullInstances. |
| Limits | Upload/write and shadow cast implementations are stand-ins; proves selected/retained CPU packs and cache invalidation, not pixels or real backend buffer formats. Mutable inputs deliberately reuse arrays to detect stale scalar snapshots. |
| Shared assertion spans | 25, 27, 37 |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| a cache-hit mirror cull after a sun-shadow cull records the MIRROR's pack, not the shadow's | 64–76 | 70, 73, 74, 75 |
| the shadow cast lends the shadow pack only for its own cull, and hands the camera pack back | 78–90 | 84, 85, 87, 89 |
| ${backend}: radial cull and scalar cache survive mutable frame inputs (cell cache ${enabled}) | 124–156 | 127, 128, 129, 131, 132, 135, 136, 138, 140, 143, 144, 146, 148, 150, 151, 153, 154, 155 |
| TLX mirror instance cull uses the mirror eye and radius instead of the main camera | 159–166 | 162, 164, 165 |
| ${backend}: cell-key hit cannot mix old planes with a newer radial snapshot | 168–178 | 172, 174, 175, 176, 177 |

Registration matrices: 123–157 use backend = tlx,glx,wgx × enabled = true,false (6 radial-cull names); 168–178 use backend = tlx,glx,wgx (3 cell-key names). Exact template names are in the table.

### tlx-fail-scope

`tests/unit/tlx-fail-scope.test.mjs` — Real shadow subsystem under permissive proxies, extracted refusal/mirror code and source post pins.

| Context | Meaning |
|---|---|
| Fixtures | mk recursive TSL/THREE proxy (22–28); throwing depth renderer boot/bootWgpu (30–81); mirrorEnd sandbox (125–136); refusal stores/error ring (147–177), real GfxEscalation; WebKit source slice and iPhone/Chrome UAs (228–240); bound-FBO recorder (267–277). |
| Production targets | js/render/three/tlx-shadow.js pass flags/PCSS/discard hints; js/render/three/tlx.js post rebuild, mirrorEnd, refuseTab, WebKit switch; js/perf/gfx-escalation.js reload budget. |
| Limits | Proxy accepts unknown APIs, so shader construction correctness is untested. Post reconstruction checks source shape; WebGPU hint case constructs recording RenderTargets but performs no GPU pass. Bounded reload tests call stubs rather than navigating a page. |
| Shared assertion spans | 173, 233 |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| a throw in the CAR depth pass disables the car pass, not the sun (M14) | 41–53 | 43, 47, 48, 49, 52 |
| a throw in the LAMP depth pass disables the lamp pass only (M14) | 55–63 | 60, 61, 62 |
| a throw in the SUN depth pass still disables the sun (M14) | 65–72 | 70, 71 |
| a WebGPU phone does not build the PCSS blocker (fixed-R phone rule, §2q) | 84–95 | 91, 92, 93, 94 |
| a WebGPU desktop still builds the PCSS blocker | 97–102 | 99, 100, 101 |
| TLX post chain: re-callable factory, rebuilt at the next realloc, bound label kept (M13) | 104–117 | 106, 107, 109–110, 112, 114–115, 116 |
| mirrorEnd: only four CONSECUTIVE failed mirror renders retire the mirror (08-F4) | 120–143 | 124, 139, 140, 142 |
| refuseTab: AUTO on WebGPU takes three WebGL2, counted against the shared reload budget (08-F1) | 179–188 | 182, 183, 184, 185, 186, 187 |
| refuseTab: a boot already on three WebGL2 binds GLX instead of reloading into itself (08-F1) | 190–199 | 194, 195, 196, 197 |
| refuseTab: bounded at two reloads per tab; past the cap the latch is kept but nothing reloads (08-F1) | 201–215 | 204, 205, 206, 209, 210, 214 |
| ctxLost window.name fallback parses legacy and preserved-prefix markers (c91f) | 217–223 | 221 |
| WebKit kill switch: unset → AUTO may try WebGPU; a latched failure keeps the device on WebGL2 | 242–249 | 244, 245, 247, 248 |
| WebKit kill switch: never on Chromium, never written under a pin | 251–261 | 253, 255, 259 |
| A-P2: a phone's sun pass drops its unread R8 colour store on WebGL2 (the one FBO three rendered into) | 279–286 | 282, 283, 285 |
| A-P2: the desktop sun map keeps its colour for the PCSS blocker; the car map still drops it | 288–295 | 291, 293, 294 |
| A-P2: no discard with another FBO bound, and none without a WebGL backend | 297–304 | 300, 300, 303 |
| A-P2W: on WebGPU every shadow map hints its unread R8 colour discard (vendored patch 17); tlxTagDiscard=0 keeps it | 306–322 | 318, 319, 320 |

### tlx-fx-warm

`tests/unit/tlx-fx-warm.test.mjs` — Real three geometry-cache key behavior over fake WebGL2 plus extracted lineIndex.

| Context | Meaning |
|---|---|
| Fixtures | tslice (21–25), extracted lineIndex (26–28); rig (30–61) builds interleaved 64-vertex line layout and spies getGeometryCacheKey, using simple double-sided node material. |
| Production targets | js/render/three/tlx.js lineIndex/drawDrivingLine/warmFxPrograms; vendor/three-0.186.1/three.webgpu.min.js geometry pipeline key. |
| Limits | As comment 47–49 states, fake WebGL2 shares a GL program across geometry keys: assertions compare keys, not WebGPU pipeline counts. Blob both-winding coverage is a source pin. |
| Shared assertion spans | 23 |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| control: the same attributes, unindexed then indexed, key two pipelines (three keys the index) | 63–71 | 69–70 |
| fixed: the warm gives the probe the race's index, so the race's line reuses the warmed pipeline | 73–80 | 79 |
| lineIndex: (i, i+1, i+2) at full capacity, built once (no orphaned index buffer per re-upload) | 82–92 | 85, 88, 90, 91 |
| tlx.js wiring: drawDrivingLine and the fx warm share lineIndex; the per-record blob warms both windings | 94–101 | 96, 99, 100 |

### tlx-glow-instancing

`tests/unit/tlx-glow-instancing.test.mjs` — Extracted glow stream/draw/warm/prune with real THREE core and actual fake-GL compilation.

| Context | Meaning |
|---|---|
| Fixtures | fixture (13–21) extracts real fx factory and glow helpers; light/many (22–23) builds radius/fade/glare inputs; prune uses real wrapper pruning; pending compile rejection probes ownership; final test instruments vendor pipeline inputs/drawArraysInstanced. |
| Production targets | js/render/three/tlx.js ensureGlowStream/uploadStream/setRange0/drawGlow/prunePool/warmFxPrograms; js/render/three/tsl-fx.js fx/glow and particle materials; vendored three. |
| Limits | CPU attribute payload/layout, draw-call count, material state and disposal ownership only; fake GL cannot measure glow appearance or device upload cost. Four grow/pin combinations inside one pruning case are explicit loop scenarios. |
| Shared assertion spans | None outside registrations. |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| glow admission and packed values retain fade, HDR clamp, order and instance rates | 25–38 | 28, 28, 28, 29, 30, 31, 32, 32, 35, 36, 37, 37 |
| glow growth disposes previous geometry; shrink, zero and moving eye preserve active prefix | 40–46 | 42, 42, 42, 43, 43, 44, 44, 45, 45 |
| glow wrappers survive actual idle pruning after initial allocation and growth | 48–65 | 58, 58, 60, 61, 62, 63 |
| warm owns an independent layout while live draws shrink, grow and compilation fails | 67–89 | 75, 75, 77, 78, 79, 80, 80, 81, 83, 84, 85, 85, 87, 87, 88, 88 |
| actual vendor builds one six-vertex instanced draw; glow state and particle shader remain distinct | 91–123 | 102, 102, 102, 103, 103, 104, 104, 104, 107, 109, 110, 110, 111, 111, 112–113, 117, 118, 118, 119–120, 121 |

### tlx-gpumem-leak

`tests/unit/tlx-gpumem-leak.test.mjs` — Actual vendor render-object cache plateau with real shadow warm.

| Context | Meaning |
|---|---|
| Fixtures | srcGeometry (29–36) makes indexed position/normal layouts with optional color; six warm iterations use fresh geometries; renderer disposed via t.after. |
| Production targets | js/render/three/tlx-shadow.js shadowSys.warm/probe retirement and vendored three render-object ownership. |
| Limits | Counts real JS RenderObjects on a no-op GL context, not actual GPU bytes/driver reclamation. Flat counts from warm 2 onward and nonzero first warm are asserted; no monotonic-first-two constraint. |
| Shared assertion spans | None outside registrations. |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| G1: shadowSys.warm() releases the previous warm's probe render objects (budget: flat across races) | 38–56 | 44, 53, 55 |

### tlx-hunt3

`tests/unit/tlx-hunt3.test.mjs` — Mixed production TSL code generation/vendor state, extracted TLX behavior, and static integration guards.

| Context | Meaning |
|---|---|
| Fixtures | litGLSL (39–55); postChain (172–188); bootParticles (262–286); pool-root real-render rig (341–389); r1Rig (428–468), wheel geometry/reflected matrices (470–481); b14Rig (632–674) records sampler/binding walks; shared bind-group manager instrumented directly (831–893). |
| Production targets | js/render/three/tlx.js material keys, particle streams, pool roots, coalescing/attribute batches, telemetry; tsl-lit.js/tsl-sky.js/tlx-post.js/tsl-post.js/tsl-chunks.js; js/render/shared/post-common.js; js/car/car-draw.js; js/game.js; vendored three and vendor manifest patch IDs. |
| Limits | Fake GL compiles/records generated code and calls; no rendered appearance or hardware timings. CPU matrix composition is exact f32/reflection evidence. Source regex allocation checks cover arrow closures/numeric literals only. Shader branch-depth scan counts braces and taps rather than proving GPU execution speed. |
| Shared assertion spans | 266, 438, 439 |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| lit receiver metadata survives translucent/noAlphaWrite overlays without changing their color blend | 58–111 | 71, 72, 73, 74, 75, 76, 77, 79, 80, 81, 82, 83, 84, 85, 86, 88, 89, 90, 91, 92, 93, 94, 95, 101, 102, 103, 107, 108 |
| decal bake reads stay behind the enabled/extent and occupied-tile gates in WGSL and GLSL | 113–145 | 141, 142–143 |
| R4: the lit program built with envCube null declares no cube sampler and taps none | 147–156 | 149, 152, 154 |
| R4: tlx.js reads the env opt-out before allocating, and allocates no cube target when opted out | 158–169 | 162, 163, 164, 165, 166, 168 |
| R3: ssrTag false builds a one-attachment scene target; the composite keeps a DISTINCT tag sampler (lesson 4) | 190–199 | 192, 193, 193, 194, 195, 195, 198 |
| R3: tlx.js sets the ssrTag MRT only on a tagged chain (present + warm), and swaps the chain when the rule moves | 201–234 | 208–209, 217, 218, 220–221, 222, 224, 225–226, 228, 229, 230–231, 233 |
| R7: the dry-day SSR gate zeroes po.reflect only on a dry day below the 1/64 weight, and only when armed | 236–257 | 239, 243, 244, 245, 246, 247, 248, 250, 251, 252, 253, 254, 255–256 |
| R9: drawParticles wraps the producer's Float32Array (no per-frame copy), re-wraps on reallocation, copies otherwise | 288–322 | 294, 295, 296, 297, 300, 301, 304, 305, 308, 311, 312, 317, 317, 321, 321 |
| R13: chunk cull never shrinks its scratch list; refuseTab is minted once per renderer, not per present() | 324–336 | 327, 328, 329, 331, 334, 335 |
| R6: the pool root's children are exactly this pass's acquired wrappers; three draws those and only those | 341–389 | 349, 367, 368, 368, 370, 371, 372, 373, 375, 376, 378, 382, 388 |
| R6: every acquire site opens its kid list after its _poolBatch++ and closes it with _poolShow() | 391–399 | 394, 395–396, 397, 398 |
| R5: apex26.tlxSkyCache512 is off by default, '1' = mobileTier only, 'all' = everywhere; the sky builds that size | 401–419 | 403, 407, 408, 409, 410, 411, 416 |
| R1: N same-mesh opaque draws are ONE instanced draw; R x W per instance rebuilds W exactly; front face as per record | 483–519 | 487, 488, 490, 491, 495, 496, 497, 502, 503, 505, 506, 516, 517, 518 |
| R1: the sentinel, the fallbacks and the kill switch | 521–547 | 524, 525, 526, 527, 529, 530, 531, 533, 534, 535, 536, 537, 538, 541, 544, 544, 546 |
| R1: shared body transforms, finish fallback and warm remain bounded | 549–589 | 556, 560, 567, 570, 576, 577, 579, 580, 582, 584, 585, 587, 588 |
| R1: the AI material is the lit instanced fragment on its own program key; tlx.js wires draw, warm, release and the capability | 591–604 | 594, 595, 596, 597, 598, 599, 600, 601, 602–603 |
| R1: car-draw.js sends only the OPAQUE wheel layers through a coalescing sibling bag, and only to a backend that asks | 606–626 | 609, 612, 615, 615, 615, 617, 617, 619, 621, 622, 623, 624, 625 |
| B14: the lit textures share renderGroup — walked once per render(), not per object; per-object with tlxSharedTex=0 | 676–685 | 682, 684 |
| B14: every program's sampler units are set by names its OWN GLSL declares (the §13 key carries the binding name) | 687–701 | 691, 696, 700 |
| B14: a texture .value swapped between render() calls is the one bound by the next render | 703–713 | 711, 712 |
| B14: tsl-lit groups the shadow, bake, lamp-grid, material-array and env-cube base nodes; the vendor key and clone pins | 715–725 | 717, 718, 721, 722, 724 |
| A2: two batches on their own geometry each draw their own instance stream at their real count | 730–754 | 732, 738, 739, 747, 749, 750, 751, 753 |
| A2: under tlx.js's own node-builder key, N attribute batches build ONE node graph; N padded InstancedMeshes build N | 756–780 | 759, 774, 779 |
| A2: the fallback / viz rungs get an instance-step copy that keeps the rung's program key | 782–795 | 788, 789, 790, 794 |
| A2: tlx.js builds batches, mirror views and their materials on the attribute path; the caster keeps its InstancedMesh | 797–813 | 799, 800, 801, 803, 804, 805, 806, 808, 810, 811, 812 |
| R1: owned run retirement uses the real warm-aware wrapper queue and preserves source geometry | 816–828 | 819, 823, 823, 824, 824, 824, 824, 826, 826, 826, 826, 827 |
| shared bind groups: last-owner eviction, context isolation and robust keys | 830–894 | 838, 839, 841, 842, 854, 857, 858, 858, 861, 862, 863, 863, 863, 865, 870, 872, 874, 883, 885, 887, 888, 891, 893 |
| memState reports the renderer's primitive resource counts and byte sizes | 896–912 | 899, 904, 905, 906, 907, 908, 909, 910, 911 |
| carFinish rides the material's packB.w and its cache key (finish 60-85 block on car paint only) | 914–922 | 917, 918, 920–921 |
| R1: production body coalescing selects only distant procedural shared rivals | 924–940 | 927, 936, 938 |
| #3115 F8/F9: the per-frame sky update/derive and lit updateFrame mint no closure or array per call | 942–956 | 945, 952, 955 |

### tlx-hunt4

`tests/unit/tlx-hunt4.test.mjs` — Real vendor upload-byte and RenderObject ownership checks over extracted TLX stream code.

| Context | Meaning |
|---|---|
| Fixtures | SRC extraction (42–50), rig (52–104), TRI/mats/cols/batchOf (106–120); casterBytes (314–338) patches prototype usage with finally restoration; warmProbeRig (366–405) drives real compile with reject/hold injection. |
| Production targets | js/render/three/tlx.js instance ranges, batch/mirror/coalescing/FX streams, drop queue and warm probes; js/render/three/tlx-shadow.js fallback caster; tsl-lit.js and vendored three. |
| Limits | bufferSubData bytes model CPU API calls, not actual GPU bus traffic. Legacy caster forced via tlxCasterAttr=0; Stream legacy control intentionally demonstrates stale same-frame relay. Warm failures are injected after real compilation; source pins remain formatting-sensitive. |
| Shared assertion spans | 37, 325 |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| A-H1: an attribute-instanced batch uploads 0 bytes over two unchanged renders; Dynamic (the kill switch) re-sends it whole | 122–143 | 125, 126, 128, 129, 130, 133, 136, 138, 142 |
| A-H1: a changed frame uploads exactly the written range — matrices alone, then matrices + tint — and only once | 145–165 | 152, 153, 155, 162, 164 |
| instance suffix ranges reach the vendored backend with the correct component offsets | 167–186 | 175, 176, 179, 181, 182, 184, 185 |
| A-H1: the mirror view, the R1 runs and the FX streams are Stream: unchanged renders send 0, a write sends its range | 188–234 | 193, 194, 197, 203, 205, 208, 214, 219, 223, 224, 227, 228, 229, 232, 233 |
| #2150: freeing a coalesced source releases its run's RenderObjects (and queues the drop while a warm holds it) | 248–287 | 255, 265, 270, 271, 272, 273, 273, 283, 284, 286, 286, 286 |
| A-H1: the InstancedMesh families keep Dynamic — the real caster, redrawn by one pass after a rewrite, still reaches the GPU | 289–312 | 293, 294, 295, 296, 305, 306, 307, 310, 311 |
| A-H1: tlx.js wiring — every plain-Mesh family on _instUsage, every InstancedMesh site Dynamic, the knob read once | 340–362 | 341, 342, 343, 344, 345, 346, 347, 348, 350, 351, 352, 354, 357, 358, 359, 360, 361 |
| warm probes: repeated actual FX compilation keeps five owned meshes and the warmed programs | 407–431 | 411, 414, 415–416, 417, 419, 420, 421, 422, 423, 425–426, 427, 429, 430 |
| warm probes: rejected compile retries reuse the probe; material disposal releases it | 433–446 | 436, 437, 440–441, 442, 445 |
| warm probes: geometry disposal during a pending compile defers object release through rejection | 448–464 | 454, 458, 460, 461, 462, 463 |

### tlx-hunt4b

`tests/unit/tlx-hunt4b.test.mjs` — Real chunk packing, post-chain resource policy, warm/state behavior, and selected source integration guards.

| Context | Meaning |
|---|---|
| Fixtures | packer/decodeHalf/fetch and seven-vertex pack branches (39–76); mirrorRig and inset RECT (231–257); withStore restores descriptor (315–322); postRig (324–350), DAY/NIGHT/OFF frames (351–360); warmRig (439–490); skyDeriveHarness (547–567); cloudCacheHarness (628–647); gpuPass flag shim (754–763); rig11 (798–809). |
| Production targets | js/render/three/tlx-chunked.js packAttr; tlx.js mirror levels/program draw warm; tlx-post.js/tsl-post.js depth/tag/scene format; tsl-sky.js derive/cache lifecycle; js/render/shared/post-common.js flare predicate; js/render/glx/post.js and shaders/glsl-post.js; vendored three. |
| Limits | WebGPU tests flip a backend flag on fake-WebGL construction and inspect target hints/formats, never run WebGPU. Cloud cache is extracted CPU lifecycle with fake resources. Shader fetch decoding is a reference CPU calculation. The draw warm rig stubs sky/FX/instance registry; not the entire game prep. |
| Shared assertion spans | 226, 633 |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| WebGPU normal packing allocates only final storage and preserves the padded Float32 fetch | 78–110 | 95, 96, 97, 98, 99, 100, 101, 106, 107, 108 |
| A-W2: on WebGL2 every packed attribute has a 4-byte stride and fetches the same values; w is 0 (normal) / 1 (colour) | 112–136 | 114, 115, 122, 123, 126, 127, 130, 131, 134, 135 |
| A-W2: padded WebGL2 normals allocate only final storage and preserve narrow quantization | 138–171 | 152, 153, 153, 153, 155, 157, 157, 158, 159, 164, 165, 165, 166, 167, 170, 170 |
| A-W2: WebGPU (fmt24) and the tools' raw pack (no fmt24) are untouched by the knob | 173–195 | 178, 179, 180, 183, 188, 188, 189, 189, 190, 193 |
| A-W2: the lit program reads a widened colour as vec3 and a Float32 mat as float — the same inputs, one wider fetch | 197–220 | 211, 217, 218, 219 |
| A-H5: the mirror target stores and regenerates 3 levels, not 9, while only the inset reads it | 259–281 | 264, 265, 266, 267, 268, 273, 277, 278, 280 |
| A-H5: the cockpit glass latches the full chain; apex26.tlxMirMips=0 is the old chain, =N pins N under the glass | 283–305 | 287, 290, 291, 293, 297, 298, 302, 304 |
| A-H5: tlx.js wiring — the glass latch in drawMirrorGlass, mirrorState reports the levels | 307–311 | 308, 309, 310 |
| A-P1: no SSAO / contact / godray / SSR / flare input -> the depth is not needed; each one alone brings it back | 362–379 | 364, 365, 366, 367, 368, 370, 371, 372, 375, 376, 377, 378 |
| B·H26-R1: PostCommon.flareTapsDepth is the composite's flare-tap guard; GLX keeps depth for the flare only through it | 384–398 | 386, 387, 388, 389, 390, 392, 393, 394, 396–397 |
| A-P1: WebGL2 invalidates the scene FBO's depth after the scene pass only on frames that read none of it | 400–424 | 403, 404, 405, 406, 408, 409, 411, 412, 413, 414, 418, 419, 422, 423 |
| A-P1: tlx.js brackets the scene pass with depthBegin / depthEnd, before post.present | 426–431 | 428, 429–430 |
| A-W1: the warm's last stage DRAWS the scene, the post chain, the mirror and the casters — 1x1, never the canvas | 492–529 | 498, 499, 500, 501, 503, 504, 507, 508, 509, 510, 512, 513, 513, 514, 515, 517, 519, 520, 521, 522, 523, 524, 526, 526, 526, 526, 527, 528 |
| A-W1: off on a software adapter (unset knob), forced on by apex26.tlxDrawWarm=1, off by =0 | 531–543 | 534, 535, 538, 541, 542 |
| sky derivation suppresses solar scattering for low and high night moon keys | 569–581 | 573, 574, 576, 577, 579, 580 |
| overcast sky targets grow continuously from twilight illumination to daylight | 583–595 | 588, 589, 591, 592, 593, 594 |
| garage warm: noEnv runs post warm then a garage-scene compile on softOutRT (MRT null), no draw stage | 602–626 | 611, 612, 613, 615, 616, 617, 619, 620, 624, 625 |
| failed cloud cache restores render state before retiring optional resources once | 649–655 | 650, 651, 651, 652, 654 |
| failed cloud cache defers retirement until an in-flight compile releases it | 657–665 | 661, 662, 664 |
| cloud retirement still flushes after a rejected compile and individual dispose errors | 668–676 | 672, 674, 675 |
| cloud warm restores target and MRT before retirement (rejected=${rejected}) | 679–690 | 683, 684, 684, 686, 686, 687, 688, 689 |
| stale cloud warm releases resources without overwriting a successor renderer target | 692–700 | 698, 698, 699 |
| A-P2: needsTag — the composite's SSR gate and the haze plume are the tag's only readers | 703–712 | 705, 706, 707, 708, 709, 710, 711 |
| A-P2: WebGL2 invalidates depth AND the tag after a dry phone scene pass; a reader keeps the tag | 714–733 | 716, 717, 718, 719, 720, 722, 723, 725, 726, 729, 732 |
| A-P2: discardAttachments acts only on the FBO three has bound; the mirror hands it depth + tag | 735–748 | 740, 741, 743, 744, 745–746, 747 |
| A-P2W: WebGPU — a dry phone pass hints depth + tag discard before the pass and clears it after | 765–775 | 768, 769, 770, 771, 772, 772, 773, 774 |
| A-P2W: the A/B switches gate the WebGPU hint; MSAA and a one-attachment chain never hint what they lack | 777–786 | 779, 781, 783, 785 |
| A-P2W: discardHint is a no-op off WebGPU | 788–793 | 791, 792 |
| scene11: WebGL2 keeps RGBA16F on every path (the 2026-10-25 revert of #3690's WebGL2 leg) | 811–820 | 816, 817, 818 |
| scene11: the WebGPU leg keeps its rg11b10 phone default (vendored patch 18, #3711); the tag attachment stays half float | 822–842 | 825, 826, 827, 828, 829, 831, 833, 835, 837, 839, 841 |
| scene11: the probe is read before the bloom knob, and no post reader samples scene alpha | 844–850 | 846, 847, 849 |

Registration matrix: 679–690 expands the exact template above for rejected = false,true (2 names).

### tlx-hunt4c

`tests/unit/tlx-hunt4c.test.mjs` — Real vendor caster stream bytes/draw snapshots and mirror warm, with source wiring/CPU-uniform cases.

| Context | Meaning |
|---|---|
| Fixtures | gpuModel (40–61) tracks CPU copies of GL buffers and draw-time snapshots; shadowRig (63–96), triangle/matrices (97–109); mirrorWarmRig (266–335) opts into lazy mode and stubs dispatch surfaces; passRootRun (339–355); real fx decal compilation and shadow probes later. |
| Production targets | js/render/three/tlx-shadow.js caster/ownership/pass roots/warm probes; tlx.js mirror target/shared MRT/lazy warm dispatch; tsl-lit.js ambient/bake placeholders; tsl-fx.js decal glow material; tsl-post.js/tlx-post.js; vendored three. |
| Limits | GPU model proves uploaded rows at draw boundary in the fake context, not device output. mirrorBegin/present rig copies gate order then source-pins the real call sites. Lazy behavior is opt-in despite legacy case wording; explicit default/unset/eager scenarios are tested. Ambient case reads CPU uniforms only. |
| Shared assertion spans | 77, 78, 258 |

| Exact case name (templates expanded by matrix below) | Case lines | Assertion spans |
|---|---|---|
| A-H4: the caster is a plain Mesh on an unpadded Stream instance buffer and ONE shared attribute depth program | 111–133 | 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 128, 129, 130, 131, 132 |
| A-H4: sun -> lamp -> lamp -> car rewrites in ONE frame: each draw sees its own pass's rows; bytes = the rows written | 135–155 | 145, 146, 152, 153 |
| A-H4 control: the same instrument catches the hazard — a Stream InstancedMesh caster redrawn after a rewrite draws stale rows | 157–178 | 170, 174, 176 |
| A-H4: C5's in-place shadow pack (packMatrices === the caster's array) uploads and draws the packed rows | 180–192 | 189, 190 |
| A-H4: a render that wrote nothing (the draw warm over every caster) uploads 0 B; the padded Dynamic caster re-sends it all | 194–215 | 209, 210, 211, 213, 214 |
| A-H4: apex26.tlxCasterAttr=0 is today's caster exactly — padded InstancedMesh, Dynamic, the plain depth material | 217–230 | 222, 223, 224, 225, 226, 227, 228, 229 |
| A-H4: freeInstanced / a geometry swap drop the attribute caster's render object and clone; the knob is read once | 232–253 | 242, 243, 245, 248, 249, 250, 251, 252 |
| pass root: each shadow render walks only its pass's casters; the scene keeps every caster between passes | 356–361 | 358, 359, 360 |
| pass root: apex26.tlxPoolRoot=0 renders the full caster list (the R6 A/B knob) | 362–365 | 364 |
| B-F3.1: AUTO on a real GPU — the entry warm skips the mirror stage and W1's mirror draw, and owes them | 367–382 | 369, 372, 373, 374, 375, 376, 377, 378, 379, 380 |
| B-F3.1: the first mirrorBegin refuses, present() runs the mirror stage alone, owned; the next mirrorBegin draws | 384–409 | 388, 389, 391, 392, 393, 395, 397, 398, 399, 401, 402, 403, 404, 405, 406, 407, 408 |
| B-F3.1: the default (unset), apex26.tlxMirWarmLazy=0, an explicit ON, a PiP ON warm eagerly; OFF and a software GPU owe nothing (today) | 411–431 | 416, 417, 418, 420, 421, 426, 427, 428, 429 |
| A·W14: the mirror shares the scene pass's render context — the eager warm's mirror stage links (almost) nothing new | 435–459 | 439, 440, 441, 449, 450, 451, 452, 453, 455, 457 |
| A·W14: tlx.js wiring — mirrorEnd and the mirror warm arm the scene MRT only for a mirror-shaped target, the knob read once | 461–472 | 464–465, 467, 468–469, 470, 471 |
| B-F3.1: every entry warm re-decides — a race after one that used the mirror defers it again | 474–485 | 478, 480, 481, 483, 484 |
| B-F3.1: tlx.js wiring — mirrorBegin's gate after the in-flight refusal, present()'s dispatch, the knob read once | 487–501 | 489–490, 491, 492–493, 494, 495, 496, 499, 500 |
| TLX ambient fill preserves zero and proportional positive multipliers | 504–520 | 516, 517, 518 |
| A·W14: decal glows share one program; each material keeps its own glow | 525–547 | 537, 538, 539, 540, 546 |
| A·W14: probe casters compile the depth programs with empty pools; one pair per layout, outside castScene after | 552–571 | 560, 563, 564, 565–566, 569, 570 |
| A·W14: the lamp-bake placeholders carry their real textures' filters (one WGSL for day- and night-booted pages) | 573–582 | 578, 579, 580, 581 |

## Dependencies and comment findings

| Finding | Evidence and consequence |
|---|---|
| Shared helpers | `tests/helpers/abs-src.mjs` gives genuine source filenames to VM stacks; `tests/helpers/seed-log.mjs` supplies logging; `tests/helpers/fn-source.mjs` extracts brace-delimited production bodies; `tests/helpers/game-source.mjs` exposes entry-module/wiring source; `tests/helpers/css-source.mjs` resolves authored CSS; `tests/helpers/fake-webgl2.mjs` installs vendor globals and counts GL calls/bytes. They are dependencies, not independently audited assignments here. |
| Vendor coupling | The six larger render suites and glow/fx/GPU-memory suites use the checked-in three 0.186.1 bundle. They depend on private renderer `_objects`, `_pipelines`, `_bindings`, `_textures`, node-builder keys and disposal event semantics. Patch 13 is manifest-pinned in hunt3; patch 17/18 behavior is CPU-policy checked in failure/hunt4b suites. |
| Historical numbers | Header comments and inline notes cite dated census/Device Farm measurements, issue IDs and prior regressions. Those comments explain why invariants exist; no measurement was reproduced here. |
| Legacy lazy wording | hunt4c:267 explicitly injects lazy=1, yet :369 says “lazy by default” and the case name says “real GPU” while it runs fake GL. :411–431 and :487–500 correctly pin eager-by-default policy. |
| Legacy caster scope | hunt3:797–813 pins the padded InstancedMesh caster source branch; it does not establish that branch is current default. hunt4:301–302 and hunt4c:8–10,217–230 explicitly distinguish attribute default and legacy switch. |
| Scene format comment drift | hunt4b:795–797 introduction describes phones generally, while :811–842 explicitly assert the WebGL2 revert (RGBA16F) and WebGPU-only rg11b10 default. Read the tests as the current contract. |
| Raw save semantics | title-menu-even:472–474 feeds malformed text and literal null as raw hits and expects two saves. This tests cheap hit-counting, not parsed validity. Its :480–482 bracket-call comment documents a tooling-impact-map workaround. |
| Test-name breadth | title-warm:76 names hidden-tab/off-title exclusion but its direct rows test saveData, 3D Home, warmable=false and picker visibility; later cases cover leaving title, not hidden document. No direct hidden-tab assertion appears. |
| Historical reproduction path | cull-shadow-pack header references a scratch reproduction script; it is historical context, not a source dependency and is intentionally not rendered here as a file literal/link. Other removed/test-history references are likewise descriptions, not claimed current source files. |
| Extraction fragility | Multiple suites assert source marker existence and regex spelling; relocation, comments/braces inside lifted source and legitimate refactors may break the harness while runtime behavior remains valid. `fnSource` extraction is more structured, but copied surroundings still omit game boot, asynchronous device state and real renderer integrations. |

Mapping status: complete for all assigned lines and all lexical/expanded cases. Runtime verdict: not run by instruction.

## Expanded registration names

All 43 names from the six template registrations are enumerated here; each uses the assertion spans of its template row above. The remaining 174 registrations have literal names in the case tables.

| Source basename under tests/unit | Exact expanded case name | Case lines |
|---|---|---|
| tlx-chunked-lifecycle.test.mjs | merge 2 builds final indices once at the 65535-vertex boundary | 151–181 |
| tlx-chunked-lifecycle.test.mjs | merge 2 builds final indices once at the 65536-vertex boundary | 151–181 |
| tlx-chunked-lifecycle.test.mjs | merge 3 builds final indices once at the 65535-vertex boundary | 151–181 |
| tlx-chunked-lifecycle.test.mjs | merge 3 builds final indices once at the 65536-vertex boundary | 151–181 |
| tlx-chunked-lifecycle.test.mjs | merge 4 builds final indices once at the 65535-vertex boundary | 151–181 |
| tlx-chunked-lifecycle.test.mjs | merge 4 builds final indices once at the 65536-vertex boundary | 151–181 |
| tlx-chunked-lifecycle.test.mjs | prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=false pack=0 pad4=0 | 332–345 |
| tlx-chunked-lifecycle.test.mjs | prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=false pack=0 pad4=1 | 332–345 |
| tlx-chunked-lifecycle.test.mjs | prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=false pack=1 pad4=0 | 332–345 |
| tlx-chunked-lifecycle.test.mjs | prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=false pack=1 pad4=1 | 332–345 |
| tlx-chunked-lifecycle.test.mjs | prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=true pack=0 pad4=0 | 332–345 |
| tlx-chunked-lifecycle.test.mjs | prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=true pack=0 pad4=1 | 332–345 |
| tlx-chunked-lifecycle.test.mjs | prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=true pack=1 pad4=0 | 332–345 |
| tlx-chunked-lifecycle.test.mjs | prepared transfer preserves attributes, indices, lamp cells and bounds fmt24=true pack=1 pad4=1 | 332–345 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=false full=false positions=false | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=false full=false positions=true | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=false full=false positions=undefined | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=false full=true positions=false | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=false full=true positions=true | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=false full=true positions=undefined | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=false full=undefined positions=false | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=false full=undefined positions=true | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=false full=undefined positions=undefined | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=true full=false positions=false | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=true full=false positions=true | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=true full=false positions=undefined | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=true full=true positions=false | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=true full=true positions=true | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=true full=true positions=undefined | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=true full=undefined positions=false | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=true full=undefined positions=true | 429–453 |
| tlx-chunked-lifecycle.test.mjs | synchronous source retention matches legacy points chunked=true full=undefined positions=undefined | 429–453 |
| tlx-cull-shadow-pack.test.mjs | tlx: radial cull and scalar cache survive mutable frame inputs (cell cache true) | 124–156 |
| tlx-cull-shadow-pack.test.mjs | tlx: radial cull and scalar cache survive mutable frame inputs (cell cache false) | 124–156 |
| tlx-cull-shadow-pack.test.mjs | glx: radial cull and scalar cache survive mutable frame inputs (cell cache true) | 124–156 |
| tlx-cull-shadow-pack.test.mjs | glx: radial cull and scalar cache survive mutable frame inputs (cell cache false) | 124–156 |
| tlx-cull-shadow-pack.test.mjs | wgx: radial cull and scalar cache survive mutable frame inputs (cell cache true) | 124–156 |
| tlx-cull-shadow-pack.test.mjs | wgx: radial cull and scalar cache survive mutable frame inputs (cell cache false) | 124–156 |
| tlx-cull-shadow-pack.test.mjs | tlx: cell-key hit cannot mix old planes with a newer radial snapshot | 168–178 |
| tlx-cull-shadow-pack.test.mjs | glx: cell-key hit cannot mix old planes with a newer radial snapshot | 168–178 |
| tlx-cull-shadow-pack.test.mjs | wgx: cell-key hit cannot mix old planes with a newer radial snapshot | 168–178 |
| tlx-hunt4b.test.mjs | cloud warm restores target and MRT before retirement (rejected=false) | 679–690 |
| tlx-hunt4b.test.mjs | cloud warm restores target and MRT before retirement (rejected=true) | 679–690 |
