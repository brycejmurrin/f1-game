> Coverage update: Raw continuation closed by tests-unit-21a/b/c/d.md. The semantic inventory below is retained; evidence-mode corrections in21c/d supersede its source-pin classifications. Parent verified assigned raw intervals exactly fill the recorded gaps.

# Unit group 21 — renderer/backend canary map

Scope: the sole group-21 file, `tests/unit/gfx-backend-canary.test.mjs`, 1–7648, 492646 bytes, SHA-256 `33a435d522a6bb6672574f77e199265d4a658d6c6119d371bbf88692e60ef080`. Espree parsed the entire file and inventoried all 275 test declarations, including the five declarations inside the late GLX block and the scenario template at 7625–7647. That template expands into five cases (scope-rejection, diagnostics-rejection, validation, pipeline-rejection, clean), giving 279 concrete named cases. 1903 direct assertion call sites belong to test callbacks; helper assertions add extraction/precondition checks. No test or browser was run.

**Read-status limitation:** this is a complete AST/assertion inventory and semantic map, but not a claim of complete verbatim source review. The initial 1–1600 output was truncated and is excluded from raw-read evidence. Exact raw-read evidence and remaining gaps follow. A completion gate requiring every source line to be returned untruncated remains open.

## Interpretation and limits

Test ranges and assertion spans refer to the test file, inclusively. P identifiers resolve to current production/configuration/support paths below. Modes identify the evidence actually supplied: source pins inspect text/shape; GL mock executes the actual GLX code against a recording proxy; VM and extracted/VM run real code or lifted functions against injected state; Verdict CLI executes the production census tool over temporary JSON artifacts; child process loads the real generated vendor methods with a fake GPU device. None proves browser rendering, shader compilation, physical-GPU behavior, compositor correctness, or phone memory safety.

Rows use each test’s explicit contract as its concise meaning. Assertions often check several subordinate details (e.g. a state reset plus event order); exact call spans are retained for review without duplicating predicates. Loops execute multiple fixture inputs within the stated declaration. Unavailable-backend roster strings, x.js/y.js/bad.js lint inputs, glsl-chunks.js/glx.js in bootScenario, and tlx.js/wgx.js in rendererBootRun are synthetic fixture identifiers, not claims that these abbreviated files exist at repository root.

The local read(GAME_REL) combines renderer-boot.js, lazy-bundles.js, platform-session.js and game.js. gameSource()/symbolSource() instead derive game.js plus instantiated extracted modules from tools/manifest.cjs. A js/game.js target in a row can therefore be a union/extraction anchor rather than the function’s physical owner. CSS reads pass through readCssSource. Most code() pins strip block and full-line comments; direct read() pins and vendor pins retain raw text. span()/spanBack() assert endpoint presence/order; fnBody() is a simple brace counter, not a parser, so extraction assumptions remain part of the test’s limits.

## Fixture and helper map

| Test-file range | Fixture/helper | Target and evidence boundary |
|---|---|---|
| 29–60 | imports; read/readFile/code/gameUnionCode | fs source loading, comment stripping and game union; seedLog/seedStore/seedClipboard inject support globals |
| 74–106 | span, spanBack, fnBody | endpoint assertions prevent empty slices; brace extraction cannot validate runtime behavior |
| 239–248 | bootLiveBackend | RendererBoot VM, pending timeout, GLX facade/backend stubs, events and selected creates |
| 969–977 | makeStorage | Map-backed local/session storage with string coercion |
| 1427–1481 | verdictScript; tlxLegJson/glxLegJson/wgxLegJson; runVerdict | checks workflow invokes CLI; writes synthetic census/leg JSON to temporary cwd; real child exit/output; no real census |
| 2186–2299 | makePickerDom; bootPicker | minimal DOM, event handlers, timer/reload queues, roster availability and storage; no layout or native browser select behavior |
| 2452–2474 | element | recovery-panel DOM stub inside its test |
| 2870–2873; 3151–3163 | TLX/GLX/TSL_LIT/THREE_BUNDLE; rendererParams | source aliases and constructor-object brace extraction |
| 4107–4139 | rendererBootRun | cold-boot shared-LS strike ledger; fresh SS; stub adapter/loader and optional actual Gfx |
| 6203–6229 | tlxTimerFixture | real timer code lifted into controlled clock, query pool, deferred async resolutions and disjoint/loss states |
| 6267–6284 | glxTimerFixture | real timer begin/end and accessors with query, clock, loss and availability mocks |
| 6770–6781; 6819–6844 | fallback extraction; bootScenario | actual renderer-boot fallback block and facade, fake script loader/install/context claims and durable session latch |
| 7217–7229 | tlxSceneSamples | real preset rule lifted with storage, backend GL format caps; helper also checks queried formats |
| 7571–7622 | exerciseVendorPipelineScopes | actual generated vendor pipelines, injected GPU scope/pipeline/diagnostic outcomes; collects rejected promises and bounded console logs |

## Production navigation

Attached apex-lsp lsp_outline checked the following source anchors: Gfx.createInitOwner js/render/gfx.js:239 and create:267; GLXBackend.init js/render/glx/glx.js:564, resize:1017, createMesh:1090; RendererBoot.create js/render/renderer-boot.js:32; RendererPicker.readBackend js/perf/renderer-picker.js:27, liveBackend:39, clearRendererStorage:229, applyBackend:399; TLX.create js/render/three/tlx.js:174; postChain js/render/three/tlx-post.js:57; shadowSys js/render/three/tlx-shadow.js:37; WGX.create js/render/webgpu/wgx.js:342; ShadowPass.create js/render/shared/shadow-pass.js:16. These confirm current physical owners, not successful runtime execution.

| ID | Current target |
|---|---|
| P01 | `.github/workflows/gpu-census.yml` |
| P02 | `css/overlays.css` |
| P03 | `index.html` |
| P04 | `js/agent/apex.js` |
| P05 | `js/audio/engine.js` |
| P06 | `js/car/car-draw.js` |
| P07 | `js/car/liverytex.js` |
| P08 | `js/core/lazy-bundles.js` |
| P09 | `js/core/menu-sheet-gate.js` |
| P10 | `js/game.js` |
| P11 | `js/garage/scene.js` |
| P12 | `js/garage/setup-camera.js` |
| P13 | `js/lighting/knobs.js` |
| P14 | `js/perf/gfx-debug-overlay.js` |
| P15 | `js/perf/gfx-escalation.js` |
| P16 | `js/perf/governor.js` |
| P17 | `js/perf/loop-health.js` |
| P18 | `js/perf/menu-quit-tail.js` |
| P19 | `js/perf/menu-teardown.js` |
| P20 | `js/perf/quality-preset.js` |
| P21 | `js/perf/race-entry-profile.js` |
| P22 | `js/perf/renderer-picker.js` |
| P23 | `js/physics/debris-draw.js` |
| P24 | `js/physics/player-forces.js` |
| P25 | `js/race/light-tune-edit.js` |
| P26 | `js/race/race-settings.js` |
| P27 | `js/render` |
| P28 | `js/render/gfx.js` |
| P29 | `js/render/glx/chunked.js` |
| P30 | `js/render/glx/glx.js` |
| P31 | `js/render/glx/post.js` |
| P32 | `js/render/glx/shaders/glsl-fx.js` |
| P33 | `js/render/glx/shaders/glsl-lit.js` |
| P34 | `js/render/glx/shaders/glsl-post.js` |
| P35 | `js/render/glx/shaders/glsl-sky.js` |
| P36 | `js/render/glx/shadow.js` |
| P37 | `js/render/glx/soft.js` |
| P38 | `js/render/renderer-boot.js` |
| P39 | `js/render/shared/assets.js` |
| P40 | `js/render/shared/glx-facade.js` |
| P41 | `js/render/shared/inst-cells.js` |
| P42 | `js/render/shared/post-common.js` |
| P43 | `js/render/shared/shadow-pass.js` |
| P44 | `js/render/three/tlx-chunked.js` |
| P45 | `js/render/three/tlx-post.js` |
| P46 | `js/render/three/tlx-shadow.js` |
| P47 | `js/render/three/tlx.js` |
| P48 | `js/render/three/tsl-chunks.js` |
| P49 | `js/render/three/tsl-fx.js` |
| P50 | `js/render/three/tsl-lit.js` |
| P51 | `js/render/three/tsl-post.js` |
| P52 | `js/render/three/tsl-sky.js` |
| P53 | `js/render/webgpu/wgsl-chunks.js` |
| P54 | `js/render/webgpu/wgsl-fx.js` |
| P55 | `js/render/webgpu/wgsl-post.js` |
| P56 | `js/render/webgpu/wgx-chunked.js` |
| P57 | `js/render/webgpu/wgx-post.js` |
| P58 | `js/render/webgpu/wgx-shadow.js` |
| P59 | `js/render/webgpu/wgx.js` |
| P60 | `js/ui/post-fx-opts.js` |
| P61 | `js/ui/scale.js` |
| P62 | `js/ui/select-screen.js` |
| P63 | `tests/helpers/fixtures.js` |
| P64 | `tests/specs/image-grade-visual.spec.js` |
| P65 | `tests/specs/instanced-draw.spec.js` |
| P66 | `tests/specs/lighting-ab.spec.js` |
| P67 | `tests/specs/lighting-tuner-grade.spec.js` |
| P68 | `tests/specs/webgl-probes.spec.js` |
| P69 | `tools/check/dup-functions.mjs` |
| P70 | `tools/gfx/census-verdict.mjs` |
| P71 | `tools/gfx/gfx-probe.mjs` |
| P72 | `tools/gfx/gpu-game-check.mjs` |
| P73 | `tools/gfx/readback-garage-oracle.mjs` |
| P74 | `tools/gfx/readback-quit-menu-oracle.mjs` |
| P75 | `tools/gfx/tlx-pack-check.cjs` |
| P76 | `tools/manifest.cjs` |
| P77 | `vendor/three-0.186.1` |
| P78 | `vendor/three-0.186.1/three.core.min.js` |
| P79 | `vendor/three-0.186.1/three.webgpu.min.js` |

## Test contracts

| # | Name / meaning | Test range | Direct assertion spans | Target(s) | Evidence / limit |
|---|---|---|---|---|---|
| 1 | gfx-probe cannot report a stale optional frame as fresh | 108–122 | 110–111, 112–113, 114–115, 116–117, 118–119, 120–121 | P71 | source pin; shape only |
| 2 | #pm-renderer is visible in the SETTINGS markup (not hidden) | 124–129 | 127, 128 | P03 | source pin; shape only |
| 3 | no stored renderer means Three.js on touch and desktop alike | 131–154 | 138–139, 140, 141, 145–146, 149–150, 153 | P15, P22, P30, P38 | VM + pins; injected environment; no browser |
| 4 | renderer-picker readBackend is Three.js when unset and preserves explicit picks | 156–175 | 173 | P15, P22, P47, P59 | extracted/VM; injected environment; no browser |
| 5 | Gfx binds TLX when the preference is unset and honours explicit backends | 177–198 | 195, 196, 197 | P28, P47 | extracted/VM; injected environment; no browser |
| 6 | Gfx.create discards a backend whose init owner was revoked and logs why it fell back (audit4 R3) | 200–213 | 209, 210, 212 | P28, P47 | extracted/VM; injected environment; no browser |
| 7 | dup-functions lint: a function declared twice in one scope is a finding; js/ has none | 218–227 | 221, 223, 224, 226 | P69 | AST lint; injected environment; no browser |
| 8 | boot canary disarms after a successful bind, not only after present() | 229–237 | 233, 235–236 | P10, P30 | source pin; shape only |
| 9 | a successful deferred bind clears a stale GLX live-backend latch | 250–264 | 255, 256, 257, 258, 259, 260, 261, 262 | P30, P38 | VM; injected environment; no browser |
| 10 | every successful game.js GLX fallback publishes the live backend | 266–281 | 275, 276, 277, 278, 279 | P30, P38 | VM; injected environment; no browser |
| 11 | the shared Playwright fixture pins native GLX coverage | 283–288 | 286–287 | P30, P63 | source pin; shape only |
| 12 | gfx specs that name GLX import Playwright test from fixtures | 295–309 | 304–305, 306–307 | P30, P64, P65, P66, P67, P68 | source pin; shape only |
| 13 | first world present re-arms the canary so a jetsam mid-frame still reverts | 311–343 | 324–325, 326, 333–334, 335, 340 | P10 | extracted/VM + pins; injected environment; no browser |
| 14 | RENDERER picker lives in renderer-picker.js, not game.js or gfx-quality.js | 345–355 | 349, 350–352, 354 | P10, P20, P22 | VM + pins; injected environment; no browser |
| 15 | TLX AUTO may land on three WebGL2 and uses a lite swapchain on WebGPU | 357–386 | 359, 360, 361, 374–375, 377, 378, 379–380, 381, 382, 383, 384, 385 | P47, P50 | source pin; shape only |
| 16 | GLX upscale toggles preserve scene targets at unchanged render resolution | 388–412 | 393, 394, 395, 396, 400, 402, 403, 406, 407, 408, 411 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 17 | GLX create* / draw* fail closed when the context is lost | 414–464 | 423, 428, 431, 432, 433, 434, 461, 462, 463 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 18 | GLX chunked create/free and instanced free fail closed after context loss | 466–505 | 485, 488, 489, 498, 502–503, 504 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 19 | GLX restores even when sessionStorage is blocked | 507–520 | 517, 519 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 20 | GLX's third visible context loss says so instead of leaving a silent dead canvas | 522–553 | 540, 541, 542, 543, 545, 546, 547, 548, 549, 550 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 21 | TLX past ctx-loss budget records ring only, not the full-screen error overlay | 555–622 | 604, 605, 606, 607, 608, 617, 618, 619, 620, 621 | P15, P47 | extracted/VM; injected environment; no browser |
| 22 | TLX aborts program warm on device loss so race-start cannot hang on warming() | 624–634 | 628, 629, 630, 631, 632, 633 | P47 | source pin; shape only |
| 23 | WGX backendState carries ctxLost, the field game.js gfxContextLost() reads | 636–641 | 640 | P59 | source pin; shape only |
| 24 | race-start render fail-fasts on backendState.ctxLost (drops handoff) | 643–657 | 645, 646, 647, 649, 651–652, 653–654, 655–656 | P10, P21 | source pin; shape only |
| 25 | GLX re-reads the canvas box after a viewport change, even when a frame read it too early | 659–705 | 679, 690–691, 692, 703–704 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 26 | TLX hoists crack fwidth and MAT samples before the detail/live If (WGSL derivative_uniformity) | 707–724 | 716–717, 720, 723 | P47, P50 | source pin; shape only |
| 27 | TLX frame uniforms share one render-group buffer (setGroup loop after the last U member) | 726–753 | 733, 736, 737, 738, 739, 741, 742, 747, 748, 751, 752 | P47, P49, P50 | source pin; shape only |
| 28 | TLX decal cache evicts without Material.dispose (three #33952) | 755–769 | 765, 766, 767, 768 | P47, P49 | source pin; shape only |
| 29 | TLX decal programs share a material map reference, not the first car's texture node | 771–785 | 773, 774, 779, 780, 781, 782, 783–784 | P47, P49 | source pin; shape only |
| 30 | a refused WGX/TLX create does not persist WEBGL2 over the user's pick | 787–869 | 789, 790, 791–792, 800, 802, 803, 805, 806, 807, 816–817, 818–819, 823, 828–829, 830–831, 832, 833, 834, 835, 836, 837, 846, 849, 852, 853, 864, 866, 868 | P10, P15, P22, P30, P38, P47, P56, P59 | VM + pins; injected environment; no browser |
| 31 | RENDERER label names the live backend when WEBGPU fell back to GLX | 871–881 | 875, 876, 877, 879, 880 | P15, P22, P30 | VM; injected environment; no browser |
| 32 | TLX HDR accepts iOS half-float and a refused create records why | 883–904 | 885, 886, 887, 889, 890–891, 892, 893, 894, 897, 901, 902, 903 | P30, P45, P46, P47 | source pin; shape only |
| 33 | TLX composite skips ACES and HDR grade on an 8-bit scene target | 906–915 | 908, 909, 910, 912, 914 | P31, P45, P47, P51 | source pin; shape only |
| 34 | TLX AO and god-ray blurs cannot share a node-program cache key | 917–923 | 919, 920, 921–922 | P47, P51 | source pin; shape only |
| 35 | TLX material-map ownership keeps placeholders and reports pack state | 925–939 | 930, 931, 932, 933, 934, 936, 937, 938 | P30, P47, P59 | source pin; shape only |
| 36 | TLX rejects partial material readbacks so Assets can retry | 941–949 | 944, 946, 947–948 | P47 | source pin; shape only |
| 37 | nextBackend / prevBackend wrap both ways around webgl2 → three → webgpu | 951–967 | 959, 960, 961, 962, 963, 964, 965, 966 | P15, P22 | extracted/VM; injected environment; no browser |
| 38 | RESET RENDERER is injected next to #pm-renderer, not written into the shell | 979–988 | 985, 986–987 | P03 | source pin; shape only |
| 39 | clearRendererStorage drops backend crash flags and leaves GRAPHICS quality | 990–1161 | 1028–1051, 1052–1058, 1059, 1097, 1106–1107, 1138–1139, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160 | P15, P22, P27, P47 | extracted/VM; injected environment; no browser |
| 40 | applyBackend clears session renderer latches before reload | 1163–1182 | 1176, 1178, 1180–1181 | P15, P22 | VM; injected environment; no browser |
| 41 | THREE PATH and SCREENSHOTS clear session renderer latches on reload | 1184–1215 | 1195, 1197, 1199, 1206, 1210, 1213 | P15, P22 | VM; injected environment; no browser |
| 42 | blocked sessionStorage skips the opt-in so this tab never claims the canvas | 1217–1223 | 1220–1221, 1222 | P10, P30 | source pin; shape only |
| 43 | RESET RENDERER click wipes storage, disarms the sentinel, and reloads | 1225–1300 | 1286, 1287, 1288, 1289, 1290, 1292, 1293, 1294, 1295, 1296, 1297, 1299 | P15, P22, P30 | extracted/VM + pins; injected environment; no browser |
| 44 | GLX pins the per-chunk uploadLightSet revert (arity 3) | 1302–1312 | 1311 | P30 | source pin; shape only |
| 45 | the GPU-census gate scopes hardware expectations, and only those | 1314–1353 | 1326, 1328, 1330, 1332, 1334, 1336, 1340, 1342, 1345, 1350, 1352 | P01, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 46 | GLX exports a real gpuErrors counter and the workflow fails on a missing one | 1355–1376 | 1362, 1363, 1367, 1369, 1370, 1372, 1374–1375 | P30, P31, P37, P70 | GL mock + pins; recorded calls/state; no driver |
| 47 | GLX drainGpuErrors() lets the census drain ~1 Hz instead of on every present (hunt 4 I2) | 1378–1399 | 1388, 1389, 1390, 1391, 1398 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 48 | GLX honours SCREENSHOTS = NATIVE under automation: no preserveDrawingBuffer, no overlay (hunt 4 I1) | 1401–1419 | 1409, 1410, 1411, 1413–1414, 1415, 1417–1418 | P30, P31, P37, P47 | GL mock + pins; recorded calls/state; no driver |
| 49 | gpu-game-check reports appearance, and can say when it could not measure it | 1483–1502 | 1492, 1493, 1494–1495, 1496–1497, 1500–1501 | P70, P72 | source pin; shape only |
| 50 | gpu-game-check's finally can actually reach the console buffer | 1504–1528 | 1519, 1520, 1521–1523, 1524, 1526–1527 | P72 | source pin; shape only |
| 51 | the GPU gate passes a hardware run whose GLX leg reports no env probe | 1530–1541 | 1540 | P01, P30, P47, P70 | Verdict CLI; synthetic artifacts; no hardware |
| 52 | the GPU gate fails a census that measured nothing instead of calling it software | 1543–1565 | 1552, 1553, 1556, 1564 | P01, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 53 | the GPU gate holds the native WGX leg to bind + swapchain whenever the native pin is in force | 1567–1601 | 1580, 1582, 1583, 1585, 1587, 1588, 1590, 1591, 1593, 1595, 1596, 1598, 1600 | P01, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 54 | the Verdict names stale A/B captures and the GLX drain mode (hunt 4 I1/I2) | 1603–1623 | 1618, 1619, 1621, 1622 | P01, P30, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 55 | the Verdict prints the driven window and a skipped A/B, not the end-of-run ring alone (hunt 4 I4) | 1625–1636 | 1631, 1632, 1633, 1634, 1635 | P01, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 56 | the Verdict prints the rAF gap view the spike rows cannot see (hunt 4 §A gap ii) | 1638–1650 | 1646, 1647, 1648, 1649 | P01, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 57 | the Verdict names the race-entry span each long task fell in, from the saved marks (hunt 4 B-F3.3) | 1652–1672 | 1658, 1659, 1660, 1668, 1669, 1670, 1671 | P01, P70, P72 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 58 | the Verdict prints TLX's depth-discard row and names its absence on a TLX leg (hunt 4 A-P1) | 1674–1689 | 1677–1678, 1679, 1685, 1686, 1687, 1688 | P01, P30, P47, P70, P72 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 59 | the Verdict prints the camera each leg drove and its mirror chain, and flags one not as asked (hunt 4 H5) | 1691–1702 | 1698, 1699, 1700, 1701 | P01, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 60 | the Verdict prints the menu entry, a mid-window camera switch and the lazy mirror warm it paid (hunt 5 E) | 1704–1728 | 1719, 1720, 1721, 1722, 1723, 1724, 1725, 1726, 1727 | P01, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 61 | the census labels which work each backend's GPU timer spans (hunt 4 I5) | 1730–1747 | 1735, 1739, 1745, 1746 | P01, P30, P47, P59, P70, P72 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 62 | the GPU gate fails a hardware TLX leg that stopped reporting an env count | 1749–1778 | 1760, 1761, 1768, 1769, 1773–1774, 1775–1776, 1777 | P01, P30, P47, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 63 | the instancing gate is declared through the cache, never bracketed per draw | 1780–1805 | 1796, 1797, 1802, 1804 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 64 | begin() does not re-bind the per-pass sampler units when nothing changed | 1807–1820 | 1814, 1818, 1819 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 65 | material uniforms survive begin(): a second pass with the same material uploads none | 1822–1843 | 1836, 1840, 1842 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 66 | uModel goes through the redundancy cache, not a raw upload | 1845–1871 | 1857, 1865, 1868, 1869–1870 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 67 | updateInstances clears the cull snapshots it did not produce | 1873–1902 | 1885, 1886, 1888, 1889, 1892, 1893, 1894, 1895, 1896, 1899, 1900, 1901 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 68 | GLX shadow cull upload:false leaves the camera pack and cache alone | 1904–1928 | 1913, 1918, 1919, 1920, 1921, 1922, 1923, 1924, 1926, 1927 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 69 | GLX lamp shadow cull honours opts.reach, re-uses an unchanged shadow pack, casts through a depth VAO (PERF-HUNT-2 G5) | 1930–1962 | 1942, 1944, 1945, 1947, 1948, 1953, 1954, 1957, 1958, 1961 | P30, P31, P37, P47 | GL mock; recorded calls/state; no driver |
| 70 | GLX shared instance buffer (apex26.glxInstPerPass=0, the mobile default): lamp cast, mirror cull / freeze replay and main cull each draw their own pack (PERF-HUNT-2 G5 + G8 fallback) | 1964–2020 | 1971, 2001, 2004, 2012, 2016, 2019 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 71 | GLX instPerPass: the mirror pass culls and draws its own instance buffer, and holds it on freeze frames (PERF-HUNT-2 G8) | 2022–2057 | 2026, 2027, 2035, 2038, 2040, 2041, 2042, 2044, 2045, 2046, 2049, 2050, 2053, 2054, 2056 | P30, P31, P37, P47 | GL mock; recorded calls/state; no driver |
| 72 | the debris pools instance behind a capability read, with the loop as fallback | 2059–2074 | 2065, 2066, 2067–2068, 2069–2070, 2072, 2073 | P23, P30, P47 | source pin; shape only |
| 73 | the interleaved uLight[] lanes agree between glx.js and shaders/lit.js | 2076–2116 | 2087, 2088, 2092, 2093, 2094, 2095, 2105, 2107, 2108, 2109–2110, 2111, 2115 | P30, P31, P33, P37 | GL mock + pins; recorded calls/state; no driver |
| 74 | WGX sky ports GLX overcast grey-shift, horizon bank, and azimuthal variation | 2118–2128 | 2120, 2121, 2122, 2123, 2125–2126, 2127 | P30, P53 | source pin; shape only |
| 75 | TLX sky gates night corona and the day-band atan like GLX | 2130–2138 | 2133–2134, 2135–2136 | P30, P47, P52 | source pin; shape only |
| 76 | TLX shadow cull packs CPU-side without uploading the lit InstancedMesh | 2140–2166 | 2149–2150, 2159–2160, 2161–2162, 2163–2164 | P43, P47 | source pin; shape only |
| 77 | WGX phone post targets use the slim GLX-equivalent formats | 2168–2178 | 2171, 2172, 2176, 2177 | P30, P57, P59 | source pin; shape only |
| 78 | TLX present() records gfxBound when a fallback still paints | 2180–2184 | 2183 | P47 | source pin; shape only |
| 79 | WGX/TLX-only DISPLAY controls are not injected when their files are gone | 2301–2318 | 2309, 2310, 2311, 2312, 2316, 2317 | P15, P22, P30, P47 | VM; injected environment; no browser |
| 80 | a stop whose files left the tree says UNAVAILABLE instead of writing the pref | 2320–2334 | 2329, 2332, 2333 | P15, P22, P76 | VM + pins; injected environment; no browser |
| 81 | a STORED pick whose files left the tree is labelled (WEBGL2), not left claiming the backend | 2336–2359 | 2350, 2351–2352, 2358 | P15, P22, P30 | VM + pins; injected environment; no browser |
| 82 | the metrics panel reports what is DRAWING, not what is stored | 2361–2387 | 2366, 2367, 2370, 2377, 2384, 2385–2386 | P15, P22, P30, P47 | VM; injected environment; no browser |
| 83 | boot and picker normalize invalid renderer preferences to WEBGL2 | 2389–2405 | 2392–2393, 2394, 2395, 2398, 2402, 2403–2404 | P15, P22, P38 | VM; injected environment; no browser |
| 84 | diagnostics use Three as the unset default and report the live bind | 2407–2430 | 2411, 2412, 2417–2418, 2421–2422, 2423, 2426–2427, 2428, 2429 | P04, P14, P15, P22, P30 | VM + pins; injected environment; no browser |
| 85 | terminal graphics failure hides interactive game UI and offers recovery controls | 2432–2444 | 2437–2438, 2439–2443 | P02 | source pin; shape only |
| 86 | terminal graphics recovery works before the late menu wiring | 2446–2571 | 2450, 2531–2532, 2533, 2534, 2535, 2536, 2536, 2537, 2537, 2538, 2542, 2543, 2544, 2545–2546, 2549, 2549, 2551, 2551, 2556, 2556, 2559, 2559, 2560, 2560, 2562, 2562, 2565, 2566, 2567, 2568, 2570 | P10, P15, P22 | extracted/VM + pins; injected environment; no browser |
| 87 | RENDERER control becomes a select with prev/next, not a one-way cycle | 2573–2594 | 2576, 2577, 2578, 2579, 2580, 2581, 2582, 2583, 2585, 2586, 2587, 2588, 2589, 2590–2591, 2592, 2593 | P15, P22 | VM; injected environment; no browser |
| 88 | selecting THREE persists the pick and reloads; WEBGPU without gpu does not | 2596–2613 | 2601, 2602, 2604, 2610, 2611, 2612 | P15, P22 | VM + pins; injected environment; no browser |
| 89 | ‹ from WEBGL2 jumps to WEBGPU without opening THREE | 2615–2625 | 2621, 2622, 2624 | P15, P22 | VM; injected environment; no browser |
| 90 | THREE PATH and SCREENSHOTS are injected, and only reload when live | 2627–2694 | 2632, 2633, 2634, 2635, 2636, 2637, 2638, 2641, 2642, 2643, 2644, 2645, 2648, 2649, 2650, 2651, 2654, 2655, 2657, 2658, 2659, 2661, 2668, 2669, 2670, 2672, 2673, 2675, 2681, 2682, 2684, 2691, 2693 | P15, P22 | VM + pins; injected environment; no browser |
| 91 | presentStatus names the three screenshot paths in plain language | 2696–2733 | 2707, 2709, 2712, 2714, 2716, 2717, 2718, 2724, 2725, 2726, 2730, 2731, 2732 | P15, P22, P30 | extracted/VM + pins; injected environment; no browser |
| 92 | TLX shadow depth camera remaps GL clip z to WebGPU's [0,1] (Z01), like the main camera | 2735–2755 | 2741, 2742, 2743, 2744, 2752, 2753 | P46, P47 | source pin; shape only |
| 93 | TLX publishes capturePixels / awaitSoftPresent as the three.js screenshot API | 2757–2777 | 2760, 2761, 2765, 2766–2767, 2768, 2769, 2770, 2771, 2772, 2773, 2774, 2775, 2776 | P30, P45, P47 | source pin; shape only |
| 94 | TLX coalesces window resize to one target realloc per frame | 2779–2786 | 2781, 2782, 2783, 2784, 2785 | P47 | source pin; shape only |
| 95 | TLX WebGPU remaps the RASTER projection with Z01, but hands post the GL invProj | 2788–2812 | 2791, 2792, 2793, 2805, 2806–2807, 2810–2811 | P47, P51 | source pin; shape only |
| 96 | WGX remaps off-axis proj (garage lens shift) with Z01·P before V | 2814–2821 | 2817, 2818, 2819, 2820 | P59 | source pin; shape only |
| 97 | setup preview passes explicit view for garage off-axis backends | 2823–2826 | 2825 | P12 | source pin; shape only |
| 98 | TLX WebGPU path never claims #game as WebGL2 after renderer.init() | 2828–2841 | 2833–2836, 2839, 2840 | P47 | source pin; shape only |
| 99 | GLX's env probe cannot latch _envActive against a disabled/null framebuffer | 2879–2898 | 2888–2889, 2892, 2896–2897 | P30 | source pin; shape only |
| 100 | latches come down BEFORE early returns — the shape that bricked the GLX env probe | 2900–2921 | 2909–2910, 2915–2916, 2917, 2919–2920 | P10, P16, P25, P30, P36 | source pin; shape only |
| 101 | the vendored three carries the swizzle patch — Chromium 141 rejects r185's string swizzle | 2923–2934 | 2930–2931, 2932–2933 | P47, P79 | source pin; shape only |
| 102 | getDynamicCacheKey fills a scratch array instead of minting one per draw (PATCHES.md §6) | 2935–2955 | 2948–2950, 2953–2954 | P79 | source pin; shape only |
| 103 | TextureNode clones share the BASE node's flipY / uv-matrix uniforms (PATCHES.md §10) | 2957–2973 | 2962–2963, 2964–2965, 2966–2967, 2970, 2972 | P50, P79 | source pin; shape only |
| 104 | shadow-bug batch: lamp/car targets warmed, caster key from the cast matrix, thrown-pass recovery | 2975–2994 | 2978, 2979, 2981, 2982, 2984, 2985–2986, 2988, 2989, 2991, 2992, 2993 | P43, P46, P47 | source pin; shape only |
| 105 | lit material scalars ride two packed per-object vec4s, not seven materialReference nodes | 2996–3009 | 3001, 3002, 3004, 3006, 3007, 3008 | P50 | source pin; shape only |
| 106 | TextureNode.update rebuilds the UV matrix only for a node that samples through it (PATCHES.md §9) | 3011–3019 | 3017–3018 | P79 | source pin; shape only |
| 107 | the vendored three emits render-stage node variables at FUNCTION scope (WebKit 8 KB private cap, PATCHES.md §4) | 3021–3055 | 3028–3029, 3030–3031, 3032–3033, 3034–3035, 3040–3041, 3048–3049, 3052–3053 | P48, P50, P52, P79 | source pin; shape only |
| 108 | the vendored three has upstream's #33954 bind-group fix (patch 2 retired in r186) | 3056–3064 | 3062–3063 | P47, P79 | source pin; shape only |
| 109 | the vendored three keys WebGPU pipelines on polygonOffset (patch 3 retired in r186, PR #34406) | 3065–3074 | 3070–3071, 3072–3073 | P47, P79 | source pin; shape only |
| 110 | WebGPU beginRender honours the single-sample discard hint, storeOp only (PATCHES.md §17) | 3075–3087 | 3082–3083, 3085–3086 | P47, P79 | source pin; shape only |
| 111 | the WGSL builder gives a 3-component colour target a vec4 output (PATCHES.md §18) | 3088–3104 | 3097, 3098, 3099, 3101, 3103 | enclosing source fixture | source pin; shape only |
| 112 | the vendored three matches its MANIFEST.json — generated by tools/gen/vendor-three.mjs, never hand-edited | 3105–3147 | 3112, 3113, 3115, 3116, 3118, 3120, 3121, 3123, 3124, 3125, 3126, 3127, 3128, 3129, 3130, 3131, 3133, 3136, 3143, 3145, 3146 | P47, P77, P79 | source pin; shape only |
| 113 | GLX asks for an opaque canvas — the behaviour TLX has to match | 3165–3173 | 3168, 3169–3171, 3172 | P30, P31, P37, P47 | GL mock; recorded calls/state; no driver |
| 114 | GLX keeps the drawing buffer under HeadlessChrome so captures see the car | 3175–3188 | 3182–3183, 3184–3185, 3186–3187 | P30 | source pin; shape only |
| 115 | GLX soft-presents under HeadlessChrome so CDP sees the car | 3190–3273 | 3203, 3204, 3205, 3207, 3208, 3209, 3210–3211, 3217, 3218, 3219, 3220, 3221, 3222, 3230, 3231, 3237, 3238, 3239, 3244, 3245, 3251, 3254, 3260, 3262, 3269, 3272 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 116 | menuBlank hides #game-soft with #game | 3275–3279 | 3277–3278 | P10 | source pin; shape only |
| 117 | SAVE SCREENSHOT reads #game-soft when the overlay exists | 3281–3288 | 3284–3285, 3286–3287 | P22, P30 | source pin; shape only |
| 118 | the alpha tag that makes canvas opacity load-bearing still exists | 3290–3297 | 3294–3296 | P50 | source pin; shape only |
| 119 | TLX pack sampling skips car surface ids, matching GLX matTexUV | 3299–3314 | 3305–3306, 3308–3309, 3310–3311, 3312–3313 | P30, P33, P47, P50 | source pin; shape only |
| 120 | TLX pooled meshes write matrixWorld — scene auto-update is off | 3316–3334 | 3325, 3327–3328, 3329–3330, 3332–3333 | P46, P47 | source pin; shape only |
| 121 | the SSR tag is not three's opacity socket — that is what made cars vanish | 3336–3360 | 3344–3345, 3346–3347, 3348–3349, 3350–3351, 3352–3353, 3354–3355, 3356–3357, 3358–3359 | P30, P50 | source pin; shape only |
| 122 | three still treats NoBlending as non-opaque (why the tag cannot live in opacityNode) | 3362–3370 | 3366–3369 | P79 | source pin; shape only |
| 123 | the garage floor reflection depth-resolves after the room on all backends | 3372–3396 | 3377–3378, 3379–3380, 3381, 3382, 3383–3384, 3387, 3390, 3393, 3394–3395 | P11, P30, P47, P50, P59 | source pin; shape only |
| 124 | TLX asks for an opaque canvas on the WebGPU backend | 3398–3405 | 3399–3401, 3402–3404 | P47 | source pin; shape only |
| 125 | TLX world-frame Color clear prefers skyZenith over fog (missed TSL sky is not beige) | 3407–3433 | 3414, 3416, 3417, 3420–3421, 3423, 3424–3425, 3429–3430, 3431–3432 | P47, P52 | source pin; shape only |
| 126 | B·H26-R2: TLX skyState() tells the zenith-only software fallback from the full sky | 3435–3443 | 3439, 3440–3442 | P47 | source pin; shape only |
| 127 | TLX late sky depth-tests less-equal and does not write depth | 3445–3457 | 3451, 3453, 3454, 3455, 3456 | P47 | source pin; shape only |
| 128 | TLX pins the sky material before the HDR scene render, not only the canvas fallback | 3459–3467 | 3463, 3465–3466 | P47 | source pin; shape only |
| 129 | TLX software-WebGPU soft-presents like WGX (never getCurrentTexture) | 3469–3753 | 3487, 3492–3493, 3494–3495, 3496–3497, 3523–3525, 3529–3530, 3531–3532, 3536–3537, 3538–3539, 3554–3555, 3571–3572, 3573, 3575, 3581–3582, 3601–3602, 3603–3604, 3609–3610, 3611–3612, 3613–3614, 3615–3616, 3617–3618, 3619–3620, 3624–3625, 3626–3627, 3635–3636, 3637–3639, 3640–3641, 3643–3644, 3646–3647, 3649, 3651–3652, 3657–3658, 3662–3663, 3664–3665, 3671–3672, 3676–3677, 3678–3679, 3680–3681, 3682–3683, 3684–3685, 3723–3724, 3725–3726, 3727–3728, 3742–3743, 3744–3745, 3746–3747, 3749–3750, 3751–3752 | P30, P44, P45, P47 | extracted/VM + pins; injected environment; no browser |
| 130 | TLX soft-present overlay is opaque — SSR tag 0.35 is not compositor opacity | 3755–3770 | 3761, 3762–3763, 3764–3765, 3766–3767, 3768–3769 | P47 | source pin; shape only |
| 131 | TLX InstancedMesh preserves vertex colour and owns a capped placement tint | 3772–3803 | 3782–3783, 3784–3785, 3788–3789, 3790–3791, 3793–3794, 3795–3796, 3799, 3801–3802 | P46, P47, P50 | source pin; shape only |
| 132 | GLX cull cache only hits the transform pack resident in the GPU buffer (behaviour) | 3805–3860 | 3820, 3821, 3823, 3824, 3830, 3833, 3834, 3843, 3846, 3847, 3848, 3855, 3856, 3858, 3859 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 133 | instanced cull cache only hits the transform pack resident in the GPU buffer | 3862–3942 | 3870–3871, 3872–3873, 3874–3875, 3876–3877, 3889, 3891, 3893–3894, 3899–3900, 3902, 3911–3912, 3913–3914, 3915–3916, 3919–3920, 3921–3922, 3936–3937, 3938–3939, 3940–3941 | P30, P41, P47, P58, P59 | source pin; shape only |
| 134 | all three backends take a shadow KEEP, and game.js says which skips are cadence | 3945–4004 | 3952, 3963, 3968–3969, 3981–3982, 3983–3984, 3985–3986, 3990–3991, 3994, 3996–3997, 4002–4003 | P30, P36, P43, P46, P47, P58 | source pin; shape only |
| 135 | shadow state reports the frame-live armed flag, not just a lifetime count | 4007–4029 | 4018, 4021–4022, 4027, 4028 | P30, P47, P58, P59 | source pin; shape only |
| 136 | the boot probe disarms on hide and on a clean exit | 4032–4045 | 4039–4040, 4041–4042, 4043–4044 | P10 | source pin; shape only |
| 137 | WGX's static shadow latch is NOT cleared by envProbeReset | 4048–4073 | 4051, 4061–4062, 4067–4068, 4071–4072 | P10, P30, P43, P47, P59 | source pin; shape only |
| 138 | the boot canary holds across a run of frames, and no path arms it behind skipClaim | 4076–4102 | 4078–4079, 4080–4081, 4084–4085, 4098, 4099–4101 | P10, P30, P47 | source pin; shape only |
| 139 | unset default skips three.webgpu when requestAdapter is null | 4141–4174 | 4171, 4172, 4173 | P30, P38, P47 | extracted/VM; injected environment; no browser |
| 140 | XR's resolved backend reaches Gfx without changing the saved 2D renderer | 4176–4190 | 4181, 4182, 4183, 4184, 4187, 4188, 4189 | P30, P38, P47 | VM; injected environment; no browser |
| 141 | a GLX fallback boot that proves itself does not erase the pick's crash strike | 4192–4216 | 4200, 4201, 4202, 4203, 4204, 4209, 4213, 4214, 4215 | P30, P38 | VM; injected environment; no browser |
| 142 | the strike ledger is per backend: one death each on two backends retires neither (#3514) | 4218–4235 | 4222, 4223, 4224, 4228, 4229, 4232, 4233, 4234 | P30, P38, P47 | VM; injected environment; no browser |
| 143 | eval-time preload skips TLX on unset navigator.gpu hunch (#3536 Graphics unavailable) | 4237–4241 | 4239–4240 | P38, P47 | source pin; shape only |
| 144 | GLX backendState and race entry defer pack retry on software GL (#3584) | 4243–4249 | 4245, 4247, 4248 | P10, P30 | source pin; shape only |
| 145 | software GL garage path gates readback and stall reload (#3589) | 4251–4260 | 4253, 4255, 4257, 4259 | P10, P17, P37, P39 | source pin; shape only |
| 146 | software GL quit-to-menu and garage-close use MenuTeardown readback cover | 4262–4278 | 4264, 4265, 4267, 4268, 4269, 4270, 4272, 4273, 4276, 4277 | P10, P17, P18, P19, P31, P37, P39, P73, P74 | source pin; shape only |
| 147 | GLX boot waits on progress, not one fixed wall clock (#3587) | 4280–4286 | 4282, 4283, 4284, 4285 | P30, P38 | source pin; shape only |
| 148 | Graphics unavailable RETRY and USE WEBGL2 scrub canary state (#3587) | 4288–4294 | 4290, 4291, 4292, 4293 | P22 | source pin; shape only |
| 149 | a pick that proves itself still pays off an older strike | 4296–4316 | 4299, 4300, 4301, 4305, 4306, 4307, 4311, 4313, 4314–4315 | P10, P30, P38 | VM + pins; injected environment; no browser |
| 150 | applyBackend clears the canary strike ledger on a hand re-pick (#3547) | 4318–4334 | 4323, 4324, 4325–4326, 4331, 4332–4333 | P15, P22 | VM; injected environment; no browser |
| 151 | the boot canary re-arms from the bind, never from the saved pick alone | 4337–4350 | 4344–4345, 4346–4347, 4348–4349 | P10, P30 | source pin; shape only |
| 152 | the instanced prop shadow cast carries no frame-parity gate | 4354–4373 | 4357, 4366–4367, 4368–4369, 4371–4372 | P43 | source pin; shape only |
| 153 | TLX instanced shadows consume the light-frustum packed slice | 4375–4387 | 4378–4379, 4383–4384, 4385–4386 | P46, P47 | source pin; shape only |
| 154 | env cube 4× anisotropy is on all three backends (grazing clearcoat) | 4389–4411 | 4397, 4398, 4401, 4403, 4405, 4406, 4408, 4409, 4410 | P30, P31, P37, P47, P53, P59 | GL mock + pins; recorded calls/state; no driver |
| 155 | WGX car-paint flake and orange-peel key in object space like GLX | 4413–4442 | 4420–4421, 4422–4423, 4424–4425, 4426–4427, 4428–4429, 4430–4431, 4432–4433, 4434–4435, 4436–4437, 4438–4439, 4440–4441 | P30, P33, P47, P50, P53 | source pin; shape only |
| 156 | WGX SAA mixes geometric N with a uniform-CF peel hoist | 4444–4459 | 4446–4447, 4451–4452, 4453–4454, 4455–4456, 4457–4458 | P53 | source pin; shape only |
| 157 | WGX hoists every pack layer with textureSample so walls match GLX aniso | 4461–4483 | 4463–4464, 4469–4470, 4471–4472, 4473–4474, 4477–4478, 4481–4482 | P30, P53 | source pin; shape only |
| 158 | GLX/TLX SAA snapshot N before wall bump so walls match WGX | 4485–4505 | 4493–4494, 4495–4496, 4497–4498, 4499–4500, 4501–4502, 4503–4504 | P30, P31, P33, P47, P50 | source pin; shape only |
| 159 | GLX readbackLdrPixels skips software GL readPixels while menu/race-entry sheets are up | 4507–4512 | 4509, 4511 | P16, P30, P31 | source pin; shape only |
| 160 | GLX present() reins in bloom on software GL when the scene target is LDR | 4514–4517 | 4516 | P30, P31 | source pin; shape only |
| 161 | GLX software GL knees when lowest rung sheds bloom (tier 4 stall watchdog) | 4519–4533 | 4521, 4522, 4524, 4526, 4527, 4529, 4531, 4532 | P10, P12, P30, P31, P42, P60 | source pin; shape only |
| 162 | softwareGlowScale tier-4 knee follows lookPostShed on software GL (watchdog userTier shed) | 4535–4548 | 4545, 4547 | P42 | extracted/VM; injected environment; no browser |
| 163 | GLX MSAA cap decodes the JSON-encoded gfxPreset (ULTRA 4×, HIGH 2×, unset 2×) | 4550–4574 | 4557–4558, 4559–4560, 4561–4562, 4563–4564, 4565–4566, 4567–4568, 4571, 4572–4573 | P30, P31, P37, P59 | GL mock + pins; recorded calls/state; no driver |
| 164 | TLX shadow pool parks idle wrappers on an empty geometry; GLX road bias is one shared array | 4576–4659 | 4580, 4584–4585, 4586–4587, 4588, 4591, 4592, 4593–4594, 4596, 4601, 4602, 4605, 4606, 4607–4608, 4609–4610, 4615–4616, 4617, 4618–4619, 4626–4627, 4628–4629, 4630, 4631, 4632, 4633, 4634, 4635, 4637–4638, 4639–4640, 4641–4642, 4646, 4648, 4655, 4657–4658 | P10, P30, P46, P47, P49 | extracted/VM + pins; injected environment; no browser |
| 165 | all three backends carry the driving line's colour-blind palette | 4661–4677 | 4672–4673, 4674–4675 | P30, P32, P47, P49, P54 | source pin; shape only |
| 166 | WGX cloud deck carries GLX's overcast / golden / twilight / moon shading | 4679–4698 | 4695, 4696 | P30, P35, P47, P53 | source pin; shape only |
| 167 | boot audit: scenery loads are memoised, car assets warm in startRace, decal key prefix is cached | 4700–4739 | 4706, 4708, 4709, 4710, 4712, 4716–4717, 4718, 4726–4727, 4731, 4732, 4735, 4736, 4738 | P06, P08, P10 | source pin; shape only |
| 168 | GLX links its core programs as one parallel batch when KHR_parallel_shader_compile exists | 4741–4774 | 4756–4757, 4758, 4759, 4760–4761, 4767, 4768–4769, 4770–4771, 4773 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 169 | GLX still diagnoses and releases a failed shader after linking | 4776–4787 | 4779, 4782, 4783, 4785 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 170 | GLX chunked road draws honor depth bias and back faces, then restore state | 4789–4820 | 4803, 4804, 4805, 4808, 4810, 4812, 4813, 4819 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 171 | the flyby plays on the pre-race loading screen only; the picker pre-builds it hidden once the pick settles | 4822–4875 | 4826–4827, 4828–4829, 4832–4833, 4834–4835, 4839, 4847, 4848–4849, 4850–4851, 4852, 4853–4854, 4857–4858, 4862, 4864–4865, 4867–4868, 4869–4870, 4871–4872, 4873–4874 | P10, P26, P62 | source pin; shape only |
| 172 | driving feel: the player tows on car positions only, the fronts lock, every car pops on lift | 4877–4897 | 4880, 4881, 4882, 4885, 4890, 4891, 4893, 4894, 4896 | P05, P06, P10, P24 | source pin; shape only |
| 173 | pcssPen help names desktop three.js WebGL2 as live | 4899–4907 | 4901–4902, 4903–4904, 4905–4906 | P13 | source pin; shape only |
| 174 | GLX present reuses scratch vectors and skip-equals grade | 4909–4923 | 4915, 4918, 4920, 4921, 4922 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 175 | WGX COMPOSITE declares ssrWet and does not remul wetness | 4925–4937 | 4931–4932, 4933–4934, 4935–4936 | P55 | source pin; shape only |
| 176 | WGX bloom final upsample overwrites mip0 like GLX/TLX | 4939–4943 | 4941–4942 | P30, P47, P59 | source pin; shape only |
| 177 | WGX screen sun-shaft is zero when bloom is shed | 4945–4949 | 4947–4948 | P59 | source pin; shape only |
| 178 | WGX godray requires invViewProj like GLX/TLX | 4951–4955 | 4953–4954 | P30, P47, P59 | source pin; shape only |
| 179 | TLX godray uses partial nearest-K, not a full sort | 4957–4963 | 4961, 4962 | P45, P47 | source pin; shape only |
| 180 | TLX software/phone WebGL2 scales Poisson R from pcssPen | 4965–4973 | 4967–4968, 4969–4970, 4971–4972 | P47, P50 | source pin; shape only |
| 181 | lamp bounce ALU is gated when bounceK is 0 on all three backends | 4975–4985 | 4979–4980, 4981–4982, 4983–4984 | P30, P33, P47, P50, P53 | source pin; shape only |
| 182 | WGX SSAO kernel is the GLX/TLX K[0..7] fan, not an even ring | 4987–4996 | 4989–4990, 4991–4992, 4993–4995 | P30, P47, P55 | source pin; shape only |
| 183 | HDR grade is gated on all three backends when knobs are neutral | 4998–5019 | 5003–5004, 5006–5007, 5008–5009, 5011–5012, 5014–5015, 5017–5018 | P30, P34, P45, P47, P51, P55, P59 | source pin; shape only |
| 184 | TLX software sky fallback is a zenith-horizon mix, not a flat lid | 5021–5027 | 5023–5024, 5025–5026 | P47, P52 | source pin; shape only |
| 185 | TLX desktop WebGL2 builds a color-depth PCSS blocker | 5029–5037 | 5031–5032, 5033–5034, 5035–5036 | P46, P47 | source pin; shape only |
| 186 | WGX SSR car streak uses carGloss like GLX/TLX | 5039–5059 | 5044–5045, 5046–5047, 5048–5049, 5050–5051, 5052–5053, 5054–5055, 5057–5058 | P30, P34, P47, P51, P55, P59 | source pin; shape only |
| 187 | WGX SSR is consumed same-frame in COMPOSITE, not next-frame LIT | 5061–5070 | 5063–5064, 5065–5066, 5068–5069 | P53, P55 | source pin; shape only |
| 188 | WGX SSR consume/march/sinT match GLX (no wetness remul, dry sheen lives) | 5072–5096 | 5074–5075, 5076–5077, 5078–5079, 5080–5081, 5082–5083, 5084–5085, 5086–5087, 5088–5089, 5090–5091, 5092–5093, 5094–5095 | P30, P47, P55 | source pin; shape only |
| 189 | LOW SSR retains a bounded, matching march budget across renderers | 5098–5113 | 5102, 5108, 5108, 5110, 5110, 5112 | P34, P51, P55 | source pin; shape only |
| 190 | SSR mask expressions have portable bounds and preserve near/far fades | 5115–5182 | 5129, 5135, 5165–5166 | P30, P34, P47, P51, P55 | extracted/VM; injected environment; no browser |
| 191 | WGX SAA widens roughness before wet like GLX | 5184–5194 | 5190–5191, 5192–5193 | P30, P53 | source pin; shape only |
| 192 | TLX FS mat stays a smooth attribute (flat varying blanks the garage car) | 5196–5206 | 5198–5199, 5200–5201, 5202–5203, 5204–5205 | P30, P47, P50 | source pin; shape only |
| 193 | TLX SSAO does not flip N.z; SSR self-hit still does | 5208–5215 | 5211–5212, 5213–5214 | P30, P47, P51 | source pin; shape only |
| 194 | road-marking mip uses unclamped fwX on all three backends | 5217–5231 | 5221–5222, 5223–5224, 5225–5226, 5227–5228, 5229–5230 | P30, P33, P47, P50, P53 | source pin; shape only |
| 195 | SSAO tap setup is skipped when strength is 0 on all three backends | 5233–5245 | 5237–5238, 5240–5241, 5243–5244 | P30, P34, P47, P51, P55 | source pin; shape only |
| 196 | Gfx seam lists instancing on all three backends | 5247–5251 | 5249–5250 | P28, P30, P47 | source pin; shape only |
| 197 | TLX garage (noEnv) paints the canvas, not the HDR scene target | 5253–5262 | 5258–5259, 5260–5261 | P30, P47 | source pin; shape only |
| 198 | TLX copies matrix → matrixWorld on every pooled mesh (cars otherwise sit at origin) | 5264–5280 | 5270–5271, 5273, 5275–5277, 5278–5279 | P47 | source pin; shape only |
| 199 | three's WebGPU backend still maps the alpha parameter to the canvas alphaMode | 5282–5288 | 5286–5287 | P79 | source pin; shape only |
| 200 | TLX supplies its own WebGL2 context, because three hardcodes alpha there | 5290–5305 | 5292–5293, 5299, 5301, 5303–5304 | P47 | source pin; shape only |
| 201 | the hand-made WebGL2 context still matches three's own attribute set | 5307–5334 | 5317–5318, 5322, 5323, 5324, 5331, 5332–5333 | P30, P47, P79 | source pin; shape only |
| 202 | GLX and TLX road-marking mip use the raw footprint, like WGX | 5336–5345 | 5339–5340, 5341–5342, 5343–5344 | P30, P33, P47, P50 | source pin; shape only |
| 203 | WGX's canvas is opaque too — it writes the same tag with NO gate | 5347–5364 | 5356–5357, 5360–5361, 5362–5363 | P30, P47, P53, P59 | source pin; shape only |
| 204 | three's WebGL backend still hardcodes an alpha canvas (why we pass a context) | 5366–5377 | 5371, 5373–5375, 5376 | P47, P79 | source pin; shape only |
| 205 | TLX env probe culls and lights like GLX — not the chase camera | 5379–5406 | 5387, 5389–5390, 5391–5392, 5393–5394, 5395–5396, 5398, 5400–5401, 5402–5403, 5404–5405 | P30, P47 | source pin; shape only |
| 206 | TLX car SSR tag lives on a second HDR attachment, not scene alpha | 5408–5447 | 5414–5415, 5416–5417, 5422–5423, 5424–5425, 5427–5428, 5429–5430, 5431–5432, 5435, 5437–5438, 5439–5440, 5443–5444, 5445–5446 | P45, P47, P50, P51 | source pin; shape only |
| 207 | GLX caches uNumLights, and nothing else writes it on the lit program | 5462–5496 | 5470, 5473, 5474, 5477, 5485–5487, 5491, 5492–5493, 5494–5495 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 208 | GLX's uf3 cache keeps float64 precision, and owns every lit/sky vec3 | 5514–5545 | 5526, 5533, 5538–5540, 5543–5544 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 209 | TLX binds on a phone by default, declines only on apex26.tlxMobile=0 with a REASON, before importing three | 5556–5588 | 5562, 5567, 5568, 5573, 5574–5575, 5576–5577, 5578, 5580, 5586–5587 | P47 | source pin; shape only |
| 210 | three still re-reads attribute.array after upload (why the release fix is impossible) | 5594–5606 | 5598–5599, 5604–5605 | P79 | source pin; shape only |
| 211 | the attribute packer proves its precondition instead of assuming it | 5614–5686 | 5637, 5639, 5640, 5642–5643, 5645, 5646, 5649, 5650, 5655, 5656, 5657, 5662, 5664, 5668, 5669, 5672, 5673, 5680–5681, 5682–5683, 5684–5685 | P44, P47 | extracted/VM + pins; injected environment; no browser |
| 212 | the packing round-trip check is wired to the shader's own decisions | 5688–5708 | 5693–5694, 5695–5696, 5698, 5701–5702, 5706, 5707 | P44, P75 | source pin; shape only |
| 213 | TLX pools meshes by (geometry, material), and prunes on a clock | 5716–5751 | 5726, 5727–5728, 5729, 5730–5731, 5735, 5736–5737, 5741, 5742, 5743–5744, 5749–5750 | P47 | source pin; shape only |
| 214 | TLX builds its SSR MRT node once, not once per frame | 5761–5779 | 5766, 5767–5768, 5769–5771, 5776–5778 | P47 | source pin; shape only |
| 215 | the geometry mirror sweep caches bounds before it frees, and never runs on a phone | 5788–5828 | 5809, 5810, 5811–5812, 5813–5814, 5815–5816, 5822–5823, 5826–5827 | P47 | source pin; shape only |
| 216 | TLX placeholder material arrays carry the pack's sampling state (WGSL access mode is compiled in) | 5841–5859 | 5844, 5847, 5856, 5857 | P47 | source pin; shape only |
| 217 | GLX spatial upscale spike: SGSR1, no textureGather, flag-gated size split | 5865–5888 | 5867, 5868–5869, 5871–5872, 5873, 5875, 5876–5877, 5878, 5880, 5881, 5882–5883, 5884–5885, 5887 | P04, P30, P31, P34 | source pin; shape only |
| 218 | UPSCALE SettingRow + TLX spatial API markers | 5890–5921 | 5912, 5916, 5917–5918, 5919–5920 | P03, P30, P45, P47, P51, P55, P57, P59, P61 | source pin; shape only |
| 219 | spatial upscale persists once through GameStore at the UI boundary | 5923–5938 | 5926, 5928–5929, 5932–5933, 5935–5936 | P04, P30, P47, P59, P61 | source pin; shape only |
| 220 | TLX timing enables the bundled backend, not a shadow renderer property | 5941–5954 | 5949, 5950, 5952, 5953 | P47 | source pin; shape only |
| 221 | TLX cube readback selects all six faces of attachment zero | 5956–5976 | 5963, 5971, 5972, 5973, 5975 | P47 | source pin; shape only |
| 222 | TLX registry pruning preserves live refs and is independent of mirror release | 5978–5992 | 5985, 5987, 5988, 5990, 5991 | P47 | source pin; shape only |
| 223 | TLX _regGeo registers once and upgrades __tlxKind on a second call | 5997–6014 | 6003, 6004, 6005, 6006, 6007, 6008, 6011, 6012, 6013 | P47 | source pin; shape only |
| 224 | TLX warm holds renderer state across awaits and restores it on rejection | 6016–6111 | 6031, 6031, 6032, 6035, 6036, 6036, 6046, 6047, 6048, 6059, 6059, 6062, 6062, 6062, 6068, 6068, 6069, 6069, 6072, 6073, 6074, 6092, 6093–6094, 6095, 6096, 6100, 6100, 6100, 6102, 6102, 6102, 6103, 6103, 6105, 6105, 6105, 6105, 6105, 6105, 6106, 6106, 6106, 6108, 6108, 6109, 6110 | P47 | source pin; shape only |
| 225 | TLX post warm compiles serially and holds each target across awaits | 6113–6147 | 6125, 6127, 6128, 6141, 6143, 6144, 6144, 6145, 6145, 6146, 6146, 6146 | P45, P47 | source pin; shape only |
| 226 | GPU verdict rejects captured compilation errors even with zero uncaptured errors | 6149–6157 | 6156, 6156 | P01, P70 | Verdict CLI + pins; synthetic artifacts; no hardware |
| 227 | TLX defers resize during compilation and applies the latest requested size afterward | 6159–6201 | 6194, 6195, 6198, 6199, 6200 | P47 | source pin; shape only |
| 228 | TLX timer publishes one serial per fresh resolution, including identical durations, never cached reads | 6231–6248 | 6235, 6237, 6237, 6237, 6239, 6239, 6240, 6242, 6243, 6245, 6246 | P47 | extracted/VM; injected environment; no browser |
| 229 | TLX ignores old epochs, inspector/lost-device completions and disjoint results | 6250–6265 | 6253, 6253, 6253, 6255, 6255, 6257, 6257, 6259, 6259, 6259, 6262, 6262, 6262, 6264, 6264, 6264 | P47 | extracted/VM; injected environment; no browser |
| 230 | GLX timing serial counts completed queries, not cached reads, and survives invalidation | 6286–6301 | 6289, 6289, 6291, 6291, 6291, 6293, 6293, 6293, 6295, 6295, 6295, 6297, 6297, 6297, 6299, 6300, 6300, 6300 | P30 | extracted/VM; injected environment; no browser |
| 231 | all track loaders release selector ownership before building, even on failure | 6303–6318 | 6310, 6311, 6312, 6316, 6317 | P10 | source pin; shape only |
| 232 | three warm-up fallback yields tasks without waiting for display frames | 6320–6353 | 6323, 6335, 6340, 6340, 6343, 6343, 6344, 6344, 6346, 6348, 6349, 6350 | P78 | extracted/VM; injected environment; no browser |
| 233 | menu player and cockpit preparation reuse the real race mesh keys | 6355–6390 | 6378, 6379, 6380, 6383, 6383, 6384, 6386, 6387, 6389 | P06 | source pin; shape only |
| 234 | selector car assets yield for costly work, skip cached waits, and cancel stale settings | 6392–6480 | 6452, 6453, 6454, 6455, 6456, 6456, 6460, 6464, 6465, 6473–6474, 6476, 6477, 6478 | P06 | source pin; shape only |
| 235 | selector preparation waits for the player's hands before the build and the warm frames | 6482–6523 | 6490–6491, 6492, 6493–6494, 6495–6496, 6500–6501, 6502–6503, 6505–6506, 6519, 6520, 6522 | P09, P10, P47 | extracted/VM + pins; injected environment; no browser |
| 236 | selector preparation rejects stale requests, reuses the world, and waits for compilation | 6525–6579 | 6560, 6561, 6563, 6564, 6565, 6567, 6569, 6571, 6572, 6573, 6575, 6576, 6578 | P10, P30 | source pin; shape only |
| 237 | selector retains a different circuit during compilation, then releases it and starts the stepped build without an idle wait | 6581–6622 | 6592, 6593, 6612, 6613, 6615, 6615, 6615, 6616, 6618, 6619, 6620, 6620, 6621, 6621 | P10 | source pin; shape only |
| 238 | TLX bounds GPU error history and preserves resize context at receipt | 6624–6638 | 6632, 6632, 6633, 6633, 6634, 6635, 6636, 6637 | P47 | source pin; shape only |
| 239 | tick()'s fatal catch arms the boot-canary probe before rethrowing (a pre-present crash must not go unrecorded) | 6640–6663 | 6650, 6651, 6652, 6653, 6655, 6659, 6660, 6661–6662 | P10 | source pin; shape only |
| 240 | the startline mesh beats the unbiased road without burying the cars | 6665–6681 | 6674, 6676, 6677, 6679, 6680 | P10 | source pin; shape only |
| 241 | TLX FX: double-sided FX draw in ONE pass and their programs warm on the stream layouts (PERF-FINDINGS §2ah) | 6683–6704 | 6688–6689, 6693, 6694, 6695, 6696–6697, 6699–6700, 6702–6703 | P06, P30, P47, P49 | source pin; shape only |
| 242 | lamp shadow: the player takes the AI cars' lamp-radius bound in BOTH the key and the cast (TLX-PERF-PLAN L0) | 6706–6719 | 6712–6713, 6714, 6715–6716, 6717, 6718 | P43, P47 | source pin; shape only |
| 243 | lamp static map: car-only rebuilds copy the static props depth and draw the cars alone (TLX-PERF-PLAN L1) | 6721–6750 | 6725, 6726, 6727, 6732, 6733–6734, 6738, 6739, 6741, 6742, 6747, 6748, 6749 | P43, P46, P47 | source pin; shape only |
| 244 | godray: lamp beams alone take one blur pair, sun shafts keep two, on TLX and GLX alike (TLX-PERF-PLAN G1) | 6752–6767 | 6760, 6761, 6762, 6763, 6764, 6765 | P30, P31, P45, P47 | source pin; shape only |
| 245 | the eager GLX handle preserves eval-time mobile tier and live backend getters | 6783–6809 | 6792, 6793, 6794, 6797, 6798, 6799, 6807, 6808 | P30, P40 | extracted/VM; injected environment; no browser |
| 246 | GLX implementation is deferred and ordered, while the facade precedes its consumers | 6811–6817 | 6812, 6813, 6814, 6815, 6816 | P07, P30, P40, P76 | source pin; shape only |
| 247 | explicit GLX and refused opt-in backends load the implementation before context claim | 6846–6855 | 6849, 6850, 6851, 6852, 6853 | P30, P38, P40 | VM; injected environment; no browser |
| 248 | missing GLX script shows an unavailable panel without reloading indefinitely | 6857–6861 | 6859, 6860 | P30, P38, P40 | VM; injected environment; no browser |
| 249 | an already-claimed canvas reloads once only with a durable session skip | 6863–6876 | 6866, 6867, 6868, 6873, 6874 | P38, P40 | VM; injected environment; no browser |
| 250 | godray: WGX takes the same one-pair lamp-only blur as TLX/GLX | 6879–6883 | 6881, 6882 | P30, P47, P59 | source pin; shape only |
| 251 | lamp shadow cache keys on the lamp's VP inputs, not its position alone | 6885–6893 | 6889, 6890, 6892 | P43, P46 | source pin; shape only |
| 252 | TLX draw records are pooled, one fixed shape, reset through resetRecs (TLX-PERF-PLAN R1) | 6895–6921 | 6898, 6900, 6901, 6902, 6912, 6914, 6915, 6915, 6915, 6917, 6918, 6918, 6918, 6919, 6920 | P47 | extracted/VM + pins; injected environment; no browser |
| 253 | GLX racing-line chevrons keep vAlong at highp, and a restored context obeys the reload budget | 6923–6935 | 6928, 6932, 6933 | P30, P32, P47 | source pin; shape only |
| 254 | cancelled menu finishing cannot change the active montage | 6938–6955 | 6952, 6953 | P10 | source pin; shape only |
| 255 | the mirror composite's flip reaches every backend: default flipped (the mirror), false straight (the broadcast PiP) | 6957–6979 | 6963, 6964, 6966, 6967, 6968, 6970, 6971, 6972, 6974, 6975, 6977, 6978 | P30, P31, P34, P45, P47, P51, P59 | source pin; shape only |
| 256 | TLX mirror preparation skips software AUTO and off settings, but honours forced mirror or PiP | 6982–7000 | 6991, 6993, 6994, 6995, 6995, 6996, 6996, 6997, 6997, 6998, 6999, 6999 | P47 | source pin; shape only |
| 257 | TLX mirror composite warm holds its destination and real texture across awaits and restores on failure | 7002–7018 | 7009, 7010, 7010, 7011, 7011, 7016, 7017, 7017 | P45, P47 | source pin; shape only |
| 258 | TLX mirror honours software readback backpressure and resumes when the read finishes | 7021–7039 | 7027, 7032, 7033, 7034, 7035, 7037, 7038 | P47 | source pin; shape only |
| 259 | TLX car shadow pass honours software readback backpressure (#2226) | 7041–7056 | 7050, 7051, 7053, 7055 | P47 | source pin; shape only |
| 260 | TLX scene MSAA: preset-driven on the desktop WebGL2 backend only, depth resolved | 7058–7070 | 7066–7067, 7068–7069 | P30, P45, P47 | source pin; shape only |
| 261 | GLX live mirror glass: mips in mirrorEnd, a spare texture unit, unit 0 restored, and every refusal | 7078–7159 | 7085, 7089, 7090, 7093, 7095, 7097, 7098, 7101, 7103–7104, 7105, 7107, 7108, 7113, 7119, 7121, 7122, 7123, 7124, 7127, 7128, 7129, 7130, 7131, 7133, 7134, 7135, 7141, 7142, 7147, 7149, 7150, 7154, 7155, 7157, 7158 | P30, P31, P37 | GL mock + pins; recorded calls/state; no driver |
| 262 | TLX live mirror glass: one record on mirRT, the same refusals, warmed under the scene target | 7165–7212 | 7182, 7183, 7184, 7188, 7189, 7192, 7196, 7197–7198, 7199–7200, 7201, 7203, 7204, 7205, 7209, 7210, 7211 | P47, P49 | extracted/VM + pins; injected environment; no browser |
| 263 | TLX scene MSAA follows the GRAPHICS preset like glx/post.js (ULTRA 4x, else 2x, phones/WebGPU 0) | 7230–7241 | 7231, 7232, 7233, 7234, 7235, 7236, 7237, 7238, 7239, 7240 | P47 | extracted/VM; injected environment; no browser |
| 264 | TLX abort path disposes three without losing #game's WebGL2 context | 7247–7279 | 7260, 7266, 7267, 7274, 7276, 7277, 7278 | P47 | extracted/VM + pins; injected environment; no browser |
| 265 | GLX decals: premultiplied upload, premultiplied blend restored after, shadow + lamp-pool uniforms | 7285–7315 | 7291, 7294, 7302, 7303, 7305, 7306, 7307, 7308, 7309, 7310, 7314 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 266 | decal shaders: sun-map PCF + lamp pools in GLSL, TSL and WGSL; TLX premultiplied | 7317–7333 | 7320, 7321, 7322, 7323, 7324, 7326, 7328, 7329, 7330, 7332 | P32, P47, P49, P50 | source pin; shape only |
| 267 | PCSS blocker: 32-bit float and the min over the whole 4x4 source footprint (GLX + TLX) | 7338–7361 | 7341, 7342, 7343, 7345, 7346, 7348, 7349, 7352, 7359, 7360 | P30, P34, P36, P46, P47 | source pin; shape only |
| 268 | paused race keeps presenting while SETTINGS is open (SAVE SCREENSHOT) | 7365–7370 | 7368–7369 | P10, P30 | source pin; shape only |
| 269 | SAVE SCREENSHOT on headed GLX reads only a live frame and never saves a black one (M15) | 7376–7405 | 7392, 7393, 7394, 7395, 7397, 7398, 7403, 7404 | P22, P30, P37 | extracted/VM + pins; injected environment; no browser |
| 270 | SAVE SCREENSHOT on headed TLX reads #game inside the presenting task, and says NO LIVE FRAME when paused (R3-RENDER-2) | 7412–7453 | 7417, 7419, 7447, 7448, 7450, 7451, 7452 | P22, P30, P47 | extracted/VM + pins; injected environment; no browser |
| 271 | the GLX mirror pass runs with the lamp shadow off — the forward slot names another lamp there (M16) | 7456–7463 | 7458, 7459, 7460, 7462 | P29, P30 | source pin; shape only |
| 272 | GLX mirrorBegin / envFaceBegin put their active flag down when begin() throws (07-F4) | 7467–7497 | 7473, 7479, 7483, 7485, 7486, 7490, 7491, 7492, 7494, 7495 | P30, P31, P37 | GL mock; recorded calls/state; no driver |
| 273 | game.js gfxContextLost reads the cheap ctxLost() accessor, not backendState() (08-F3) | 7501–7534 | 7506, 7507, 7508, 7509, 7510, 7511, 7512, 7515, 7517, 7520, 7523, 7525, 7528, 7529, 7530, 7532, 7533 | P10, P30, P31, P37, P47, P59 | GL mock; recorded calls/state; no driver |
| 274 | COPY DIAG copies a real payload when __apex is null, and prefers __apex.diag when present (14-F1) | 7539–7566 | 7558, 7560, 7561, 7562, 7563, 7565 | P22, P30 | extracted/VM + pins; injected environment; no browser |
| 275 | actual three render/compute pipelines handle ${scenario} in sync and async modes | 7625–7647 | 7629, 7631, 7632, 7635, 7636, 7637, 7639, 7640, 7642, 7644, 7645 | P79 | child process; generated methods; fake device |

## Range/hash ledger

All bytes were consumed by the successful whole-file Espree parse and source hash. This ledger hashes exact UTF-8 line ranges, retaining their terminating newline. “Parsed” is not a substitute for raw source review. Assertion/message summaries for declarations 1–275 were reviewed in bounded outputs; summary extraction intentionally omits predicates and fixture bodies.

| Range | SHA-256 | Inventory evidence |
|---|---|---|
| 1–150 | `777c410ed7cbee0f558c296f8ebca8295417b5183f945e9caaee4a1e0d81c0f9` | full AST parsed |
| 151–300 | `62da8622938ec29a829e4c1b5d22482e5102f58f828b9051ba3414c9b7cdcf10` | full AST parsed |
| 301–450 | `99afeee82741ede718d205d76759411f0f08feca8589d59490174a7255df39b2` | full AST parsed |
| 451–600 | `af8593ee160a3855c2ceaf0e0cebd8fa8eb2a33b94a7babc4042fd1bb3829b41` | full AST parsed |
| 601–750 | `05ca610fe4ca2be362fe7be2b0f305588e47e1c9122360f09307e61d8ed01e11` | full AST parsed |
| 751–900 | `2d0224e0ad870dd562205810075d8683dfdda13dd4b0f0f8bbcbce6fba7b5aa1` | full AST parsed |
| 901–1050 | `8c06f83680980f1da2adda02a95fdbb28965304081764609315faff45770b3be` | full AST parsed |
| 1051–1200 | `c75419f60ac198d51154fa305588deab48353fd52eddf3be5b390ffd0ed70c76` | full AST parsed |
| 1201–1350 | `b00bc6d397a1563fea55be3ee08006dd9c580487a7628781c7dd7e676fee5254` | full AST parsed |
| 1351–1500 | `72be8e6085f6e0946c605b0f532140156951510d51d61cf10d84aedd8a9d14ef` | full AST parsed |
| 1501–1650 | `864138226635340e92614db0f8ff1cfaa9db2d76b6a731b144e33a82b90e2d7b` | full AST parsed |
| 1651–1800 | `de366dd3972510467ced80b6f960ef7ad492df11cdf2876bec7e70072fd4b12a` | full AST parsed |
| 1801–1950 | `78f87fa577dcde3ec72045cfd367c59305ee9f1b5bb126df94ebe8713822a12a` | full AST parsed |
| 1951–2100 | `effe4d73596f59984b49c0bd18b393ee91d323ca0983724147d3b72fa9737712` | full AST parsed |
| 2101–2250 | `c144ed4d7488946d32b264de5fa705d7c0bd27c5cf44726ddd5a4cc7c7d70352` | full AST parsed |
| 2251–2400 | `ae9785f3cd7e503e8bc348b90b7de2883981b523108a7a80a98a8a1ccae82366` | full AST parsed |
| 2401–2550 | `1f4a7bec64e10ffc43bde0a8c6f4d40ab1538cf2d7032c29b43718ec16d8b905` | full AST parsed |
| 2551–2700 | `2d0aa5e1f4e84bca8870ec894e0911e3e5c3ecf8b749e17a80b3d1a4ccd7ecd3` | full AST parsed |
| 2701–2850 | `46313ac0d144f9168b2c9af8b59a404e00d0890692f78928ade768d7edca1dd2` | full AST parsed |
| 2851–3000 | `88a52c6bc4a062843694dcebc1fa01c75312cfc08779afaf00b8f4723d58ec5f` | full AST parsed |
| 3001–3150 | `c4a6b4b7029bf06abeb523d0b3336cff1fdee1bfd47d9c01507e80e394a38cb9` | full AST parsed |
| 3151–3300 | `da40b5804d6357d29c28ab55fd365583447c0db6491123977bd2832e7d6e0311` | full AST parsed |
| 3301–3450 | `d465765508dbad03170fa8ed710f997cad99a61002e285282c3372275eca7de2` | full AST parsed |
| 3451–3600 | `32cda08edc4519a32cde50f5192cd0a5f3cfe6c7888e880a28fd6cb6bb187525` | full AST parsed |
| 3601–3750 | `59397b5b899f7021c0d7a5d7bbb9cdc97749ddce89869932a4e04f7d775bbb3a` | full AST parsed |
| 3751–3900 | `99733c2c322b861cceae25555c875b17c112ac154084e0970bafbb5d9001605f` | full AST parsed |
| 3901–4050 | `e7afa69af01be9fe067925de5e05a8a1b47b5161ea23d8685d140cee681d366b` | full AST parsed |
| 4051–4200 | `3ba4afb9667776cd8b1b0236ed11734337826c1636240e12ee2f194f744cf0bc` | full AST parsed |
| 4201–4350 | `445192278c444cb34f548025f2a07a6dca40f597a41c6a82dcce33ba1b958917` | full AST parsed |
| 4351–4500 | `0e116be5b3410c4423dcb943727c3f7d9b5679755c5573040fab10b3446a1459` | full AST parsed |
| 4501–4650 | `8904be86376e2f0d4e65a5fbc8017905fbdb297716ad75a3c85f7cfe1127bdee` | full AST parsed |
| 4651–4800 | `151c0e883d49bb5f20b0546149bcb94ea5c8fb5e4dd0f32b72a115081c71b0b6` | full AST parsed |
| 4801–4950 | `25bf6e9dddf7cd40e36e7011682c910e4a613d21bb6a7c09c73ae2a68e84e75a` | full AST parsed |
| 4951–5100 | `2d095ef28c4518f0d89775bb19d2682f1811ec94375f7a23f291f6658b7bea7e` | full AST parsed |
| 5101–5250 | `10584a5107464c2e0285d3af55acfb9c0f01817cf1fb46d5b56464c00ec3db07` | full AST parsed |
| 5251–5400 | `004ffa867af094a938e399c0057b7aa88cb3101dba78a7ddbc253b11e1a2b0ec` | full AST parsed |
| 5401–5550 | `467d25f23940164a80990f9517dd4e4f6f46539b03d70a3fde6c2dd7e7391b8d` | full AST parsed |
| 5551–5700 | `c08c9bdbe427b8496cc3a386884d1755f4207acdf670aaab9ee84844f7f7531d` | full AST parsed |
| 5701–5850 | `0956189d6b6b18d826e98750fa0f1b9a946e17da8e290ab02e112d9106e50a3d` | full AST parsed |
| 5851–6000 | `0f595be0c8aec23deddb8576646e1227ec1e1658ffa49ad33cd9d071ba2ceeb5` | full AST parsed |
| 6001–6150 | `71af52be86f9f2f167d4b3e9b4ee7923db49c5d33db3441da593d58e50cc733f` | full AST parsed |
| 6151–6300 | `f0e4a457de5107722ea4320eced1b5fd0d3a293b6a6bd48dac5286482a9b9984` | full AST parsed |
| 6301–6450 | `25c9ffe56e2058b5d78a1f8a3da182f605ddb97d43a1a020096dd8059c8c6610` | full AST parsed |
| 6451–6600 | `48ce2d4a11e055b508c3e1f4d3262601035eeb6fd6662d42f193f98b365632e4` | full AST parsed |
| 6601–6750 | `99795afdf6c09217960d9d362c88dd9208dd0866b9f26a360f9ee961b0d15730` | full AST parsed |
| 6751–6900 | `6801fc13339e8ec22ee36a6d71ab7fdc3023462ecf49a0ff97bc6e7e6a99c996` | full AST parsed |
| 6901–7050 | `2141c3e5ec6b471a84c35ea8083ce98bb0e7ad2a4d45529c84a253665eb3eb82` | full AST parsed |
| 7051–7200 | `ad5009dc978c94326729dd6c1940c91aed041753ec10f54838b67f457ec77f3d` | full AST parsed |
| 7201–7350 | `da2d98cb4aaa08b4e0e5726286cb1cb56b571dc9f5e99b389e2fe411cb0af305` | full AST parsed |
| 7351–7500 | `7a990cae877d3f2de8f21492d5b11b6f6b656a1d8f029333548c79d86fe5938b` | full AST parsed |
| 7501–7648 | `240c781def5c2ee747821316a3249d712b9edcd91dc78a5cbdcef1a8b47287dc` | full AST parsed |

Untruncated raw source ranges returned: 2186–2300, 2843–2878, 3150–3163, 4104–4140, 6203–6230, 6267–6285, 6768–6878, 7214–7229, 7567–7648.
Remaining raw-review gaps: 1–2185, 2301–2842, 2879–3149, 3164–4103, 4141–6202, 6231–6266, 6286–6767, 6879–7213, 7230–7566.

The malformed initial oversized output is not credited. The AST inventory includes assertions in nested callbacks and fixture setup inside each test; assertions located solely in shared helpers are documented in the helper map. Production targets are a conservative source/fixture dependency map: shader/source parity tests can name multiple renderer owners even when only text is inspected.
