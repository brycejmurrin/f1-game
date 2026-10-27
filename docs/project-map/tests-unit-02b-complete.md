# Unit tests group 02b: complete reading map

Reading completed 2026-10-27 at checkout HEAD `8a222466bc83de7cdbe6a42989f19f7824ce4c06`.
This is a source-reading record, not a test verdict. No unit suite or browser was run, and no production or test source was edited.

## Read ledger

SHA-256 below hashes the entire file, including prefixes read for fixture context. All requested ranges were read without omitted or truncated test bodies. Appearance prefixes 1–180 were also read. The asset file was read in four successive chunks: 1–600, 601–1200, 1201–1800, 1801–2360. The other three files were read completely in single bounded outputs.

| File | Requested inclusive lines | Entire file lines | SHA-256 |
| --- | --- | --- | --- |
| `tests/unit/assets-pack.test.mjs` | 1–2360 | 2360 | `a0ff5fe0011ac40aed4fbfea39b0dee59541f18bfc1cf008fb6dbab85fdd67aa` |
| `tests/unit/async-lifecycle.test.mjs` | 1–686 | 686 | `b14925fa3145094cd4b7f2ceaa3d760f74a73c8688d9d73018fbfc1f238e910d` |
| `tests/unit/appearance-opts.test.mjs` | 181–605 | 605 | `3ce674c03a043e8d3f409119a416eaa1c5b04f4af353b3c07f405b8517377061` |
| `tests/unit/appearance-studio.test.mjs` | 181–570 | 570 | `915d1b29eba189e07f612cf4d3f309d3f2cc54d9da65325744d7f59926765904` |

Repository instructions read: `AGENTS.md`, `.claude/skills/code-nav/SKILL.md`; the prior code-nav audit in `docs/notes/system-audit-4/skills/code-nav.md` was also consulted. Symbol navigation used the checkout's `bash tools/mcp/lsp-mcp.sh` CLI. These are local checkout results, rather than a claim about a remote workspace. `outline AppearanceOpts` initially picked an unrelated reference file; repeating by exact file `outline js/ui/appearance-opts.js --all` resolved the actual module. Studio's outline lists its frozen returned methods as internal, so its return object and bodies were read directly.

## Production ownership and semantic map

### Assets and authoring

`js/render/shared/assets.js` owns pack lifetime. LSP anchors: `manifest`:61, `_request`:30 (15 s shared transfer deadline, abort ownership), `_fetchManifest`:85, `_fetchStrip`:100, `_yieldDecode`:124, `_decodeStripBytes`:203, `_decodeStrip`:246, `_ensureScratchGl`:314, `readLayerBytes`:347, `readLayerBytesAsync`:429, `load`:596, `retry`:618, `_load`:626, `adopt`:721, `unload`:746, `_parseModel`:799, `_decodeModel`:843, `model`:856, `modelSync`:886, `_idsNamedIn`:894, `loadModelsFor`:915, `loadModels`:937, `modelsReady`:963, `state`:986. `MAT_LAYERS`:14 is 17. `modelsReady` was also opened through LSP definition/body: optional closure-scoped loading is raced against a caller timer, default 4 s; timeout reports -1 and clears that waiter's timer without aborting another caller's request.

The assets assertions cover these connected contracts:

- Manifest success is cached and in-flight callers share one fetch; failure releases memoization for retry. Unload and adopt reject stale generations, including cached-manifest continuations and completed old body/JSON promises. Fresh explicit model requests can populate the next generation.
- Albedo and optional normals download together, but decoding/uploads preserve albedo-first order and original blob/crop inputs. Missing or malformed normal data still permits albedo; albedo failure governs the pack failure. Accounting counts completed compressed downloads, resets on unload, and ignores late expired bodies.
- Every bitmap decode, including Safari whole-strip fallback and subsequent crops, requests straight alpha and no color conversion. No 2D canvas participates in strip decoding. Partial allocations and both whole-strip/crop owners close exactly once, including cancellation at task boundaries.
- Synchronous readback uses one retained scratch WebGL2 context with straight pixel-store flags; raw bytes bypass GL. Upload/read/FBO/throw/lost-context failures preserve valid siblings and drain error flags. Destination buffers remain local and do not become session scratch roots.
- Async readback returns identical bytes to sync: one page PBO per image, offset zero, one fence/flush, nonblocking timer polling, whole-buffer copies into the correct destination layer, then all PBO/fence cleanup. Four clean-batch error queries precede publishing callbacks. Throwing callbacks cannot strand work or duplicate notifications. Allocation, queue and GL flag failures omit failed layers; early fallback callbacks see no bound PBO while images are alive. Failed waits retain byte-layer successes. Missing fence support/null sync/no GL return null for immediate sync fallback; byte-only input creates no scratch canvas.
- `js/render/three/tlx.js` real extracted `readbackTextureLayers`, `createTextureArray`, `setMaterialMaps`, `materialArrayAnisotropy` run with the real Three r186 `DataArrayTexture`: pending tokens schedule no upload until ready; stale/disposed tokens never bind; latest shared/partial tokens remain alive while old exclusive ownership disposes once. Async-null/setting-off returns sync textures; refused layers use existing 2D fallback, absent layers remain neutral, total failure disposes the token.
- WGX `_matLayerBytes` and TLX use `Assets.readLayerBytes`; WGX external-image upload keeps straight alpha. Save-Data/2G choose low tier unless explicitly overridden. One failed boot material load gets one nonblocking race-entry `Assets.retry()` from `js/game.js`; unsupported backend and explicit unload are excluded.
- Models share downloads and decode promises, own compact output arrays rather than the fetched buffer, serialize parsing on task admissions, survive a failed predecessor, cancel obsolete admissions, and leave no decoded payload in `_modelDecodeTail`. Short readiness timeouts leave shared healthy work alive; transfer deadlines settle fetch and body stalls, release memos, permit retry, and prevent late responses overwriting fresh residents.
- `js/core/lazy-bundles.js` `LazyBundles.create`:5 / nested `ensureScenery` awaits `Assets.modelsReady(0, String(scenery))` for fetched, already resident and inline closures before build. Boot `js/game.js` must not prefetch the full model pack. Closure scanning selects only quoted ids present in the manifest, deduplicates ids and skips unnamed models.

`js/render/shared/gltf.js`: `parseGLB`:118, `toMesh`:282 (LSP) own GLB decoding. The hand-built triangle fixtures pin accessor/bufferView bounds and strides, base colors, indices, parent/node transforms and inverse-transpose supplied normals. A frozen pre-hoist normal arithmetic oracle compares complete Float32 buffers for mirrored, singular and tiny scales, and instrumentation proves one normal-matrix calculation per instance, none for generated normals.

`js/track/core/geom.js`: `TrackGeom.MAT`:7 and `addMesh`:323 (LSP) own material ids and placement. Assertions pin +90° yaw mapping +X to -Z, scale/translation versus unit normals, index rebasing, MAT preservation/override, multiplicative tint, and atomic rejection of malformed placement.

`tools/gen/assets.mjs` owns authoring commands and serialized contracts. Real child processes exercise `bake-synthetic`, `bake-synthetic-models`, `bake-model`, `bake-atlas`, `verify`, help and unknown-flag handling. The tests compare its MAT copy with the VM-loaded real `TrackGeom.MAT`; GLASS/FLAG/FLAT never receive baked layers and ASPHALT remains 16. Shader and backend source guards cover `js/render/glx/shaders/glsl-lit.js`, GLX, TSL uniforms and WGX depth; five GLSL JS wrappers are syntax-checked. `js/lighting/knobs.js` keeps `matTexMix` wired/on with a zero escape path and prohibits photoscan/CC0 provenance claims when every shipped material is procedural.

Pack-installed checks read `assets/pack/manifest.json`, its material PNGs/models and `CREDITS.md`: schema/version, power-of-two size, unique valid layers/scales, allow-listed licensing/source, matching mobile layer coverage, smaller mobile size/file, PNG signature/declared dimensions (17 layers), all referenced files, credit coverage and an 8 MiB recursive budget excluding `src/`. These checks explicitly skip if no manifest is installed. Synthetic rebake preserves models/env; synthetic-model rebake removes retired procedural files while preserving CC0 imports. Model baking round-trips a generated GLB and embedded data URI through the shipped AX26 reader; compact layout/version/counts, geometry/MAT/color and byte identity are asserted. Atlas baking builds a genuine 4×4 PNG, maps BRICK, checks provenance, runtime mobile decoding and disable-low behavior without stale low pixels or lost unrelated records. Bad-manifest verification tests establish a good control then reject traversal, missing md5, bad v1/v2 indices, invalid MAT layer/name, truncated body and drifted counts, naming each defect. `assets/pack/webbake.js` owns `WebBake.toGLB`/`zip`: generated GLB headers/alignment/geometry/colors must survive the real GLTF reader and ZIP CRC/offset/content must pass system unzip when present.

### Async lifecycle

LSP production anchors: `AudioPanel.create` in `js/audio/panel.js`:16; `NetScan.create` in `js/net/scan.js`:68 and `loadDecoder`:38; `window.MusicLib` in `js/audio/music-lib.js` (`openDb`:55, `write`:108, `readAll`:121, `syncPlaylist`:235, `init`:250, `add`:288, `list`:359); `F1Transport.create` in `js/data/api-transport.js`:5; `F1API` in `js/data/api.js` (`weather`:214, `positions`:258, `livePositions`:279, `intervals`:306, `liveIntervals`:314); `DataLive` in `js/data/live.js` (`create`:55, merge/status/time test exports:431–434).

The select-screen test executes the real transition helper sliced from `js/ui/select-screen.js`: native ready/finished/update rejections must be handled; delayed native callback and fallback timer apply the DOM change once; reduced motion bypasses snapshots. Audio tests execute the real panel: restore respects saved master-off plus music-on, sound/music/SFX gestures enable master before synchronously unlocking WebAudio, master-off stops radio/announcer/pack, and menu UI sound toggles route to the engine. Voice auditions/volume stay usable with automatic channels off; selecting a race system voice disables the recorded pack while announcer selection preserves it; a same-length replaced voice list refreshes both selectors.

QR tests cancel both late getUserMedia and pending video.play, stop stream tracks once, avoid late srcObject/interval installation, and retry a loaded-but-unregistered decoder script. Music tests close late successful orphan DB handles after timeout; serialize cross-call imports until transaction commit; reserve duplicates only while a write is viable; recover initial reads, quota abort and versionchange; successful empty libraries stay memoized; counts, playlist and blob URLs reflect committed tracks once.

API tests inject both stalled fetch and stalled JSON bodies to prove shared queue release on deadlines; 403 authentication errors retain status/message and cannot use stale cache. LIVE status/time text agree, CSS panes can shrink, completed badges have muted styling. Snapshot/delta mapping chooses latest rows, preserves null positions and lapped strings/zero gaps, advances watermarks, merges deltas without dropping untouched drivers, accepts plain interval maps and ignores `values:null` metadata. LIVE paths never write localStorage. Ordinary writes sweep cache keys at most once in five minutes.

### Appearance options and Studio

LSP `js/ui/appearance-opts.js` anchors: normalization:71/76, speed:94, ink/color helpers:100–164, menu/HUD application:177/195, swatches:237/278/299, readability:310, applyAll:330, setters:344–433, hex wiring:441, restore:465, initUI:483, boot/media listener:553–564. Real source was read for swatch keyboard/focus ownership, restoration and runtime-built rows. `index.html`, `css/tokens.css`, assembled `css/components.css`, and `js/ui/settings-export.js` are the static-shell/CSS/export contract targets.

Options assertions pin eval-time dark/ember/team plus large/high defaults; stored-value sanitization; valid icon sets; setting persistence versus persistence-free profile restore; theme/system stamps and OS-change ink-cache invalidation; menu/HUD accent separation; concrete team RGB conversion, CSS-owned presets and brand linkage; light/dark custom ink choices; full six-digit hex acceptance; custom-well visibility; exact SettingRow/swatches assembly; one tab stop per list; bounded arrow/Home/End choices; unconsumed Tab/modified/defaultPrevented/synthetic vertical keys; pointer/restoration focus preservation and stable hex-editor focus; export keys; token preset parity/forced colors; readability and rounded mph conversion. HELP TEXT agrees with the inline first-paint script, hides explanatory `.adv-help` only, retains status/live/keep readouts, and keeps its own row and dynamic warnings reachable. Dynamic keep targets include `js/garage/setup-experiments.js`, `js/ui/title-layout.js` and settings-export notes.

LSP `js/ui/appearance-studio.js` anchors: `normalizeSnapshot`:51, `snapshot`:68, scene/camera/motion:75–90, history/owners:91–101, `applySnapshot`:102, presets:121, Undo/reset:133/134, profile normalization/storage:135–155, hooks:156, preview/render:175/200, photo selection/load/choose:225/231/256, mount/events:265–350. Source bodies confirm only changed selected-scope keys persist; nullable motion removes an explicit choice; muted owner refresh prevents subscription churn; preview children/profile options rebuild while stable choice buttons retain focus.

Studio assertions cover visual-only state isolation from steering/career/budget/confirmation/race state; hostile values clamped and unknown/prototype keys stripped; profile identity/name/limit boundary and durable versus session-only disclosure; global/screen preset/reset/Undo semantics and HUD global-profile exclusion; each ScreenLooks page scope/preview; preserved accessibility/units under every cosmetic preset; normalized Home camera/environment plus scene-event deduplication, OS reduced motion and unsubscribe; throwing preview owner isolation; owner hooks refreshed on profile/reset/Undo. Integration prefixes additionally pin real `UiScale` touch button CSS/input refresh, actual AppearanceOpts CVD palette/select updates, title/pause controls and no duplicate construction. Mounted preview reads independent HUD accent and high-contrast opacity precedence. Opening is busy and defers heavy preview through two frames; Studio creates no duplicate theme/scale/color controls and supplies exact settings jumps. Photo picker filters unsafe thumbnails, caps to six, previews selection without saving, persists only Choose, keeps import/reset doors, recovers empty/failure/write errors, and ignores superseded/closed-panel responses. Render counters require exactly one final-state preview/profile rebuild per meaningful operation, including external stores/advanced owner events and coalesced click+subscription; unchanged clicks/no-op Undo rebuild zero times while scene events and Undo remain correct.

## Fixtures and boundaries

| Fixture / helper | Test-file anchor | What it provides / what remains outside this evidence |
| --- | --- | --- |
| `assetLoader`, `deferredAssetDownload` | assets-pack:75,116 | Fresh real Assets IIFE per VM, window alias and seeded Log; injectable fetch/bitmap/backend/timers. Not a live GPU. |
| `makeAsyncGl`, `layerImage` | assets-pack:595,631 | Mock GL/PBO/fence/error operations with distinctive per-layer bytes; deterministic busy/refused/error paths. |
| `tlxPackRig`, `tlxImages` | assets-pack:874,898 | Exact real TLX source extraction, real vendored Three texture object, fake renderer/material owner and 2D fallback sentinel 201. |
| `realMAT` | assets-pack:1109 | Real geom IIFE in VM, realm-normalized MAT object. |
| GLB/PNG/ZIP authoring fixtures | assets-pack tests:41,1331,1437,1628,1691,2148 | Construct binary data directly; temporary directories cleaned. Some fixtures use OS tmpdir internally; this reading task did not execute them. |
| `MODEL_V2`, `packFetch`, `assetRequestClock` | assets-pack:1785,1793,1868 | Minimal compact triangle model and fake 4/15/20-second clocks; assert request-owned timer existence, use actual tasks for decode admissions. |
| `readAX26`, `ax26Version` | tests/helpers/ax26.mjs | Binary verification uses game's reader, rather than a second test parser. |
| `deferred`, `audioPanelHarness` | async-lifecycle:42,48 | Gate promises; node/store/SettingRow/GameAudio stand-ins plus optional voice DOM. Real panel owns its behavior. |
| `musicLibraryFixture` | async-lifecycle:303 | Mock IDB transactions/read failures/quota/version handles, playlist and blob URL ownership; commit scheduling is explicit. |
| `dataApiHarness`, `liveMergeHelpers` | async-lifecycle:499,525 | Real concatenated transport/API and tab-utils/live source, fixture responses, storage observations and advancing Date. No OpenF1 request. |
| `load`, `makeEl` | appearance-opts:23,38 | Real module with DOM/style/store/rows/Teams/media/computed-token stand-ins; controls focus and synthetic keyboard events. CSS checks inspect text, not rendered contrast. |
| `load`, `loadWithControls`, `studioForScope` | appearance-studio:9,54,197 | Sanitized clone store/durability/hooks; optional real SettingRow/AppearanceOpts/TitleLayout/PauseOpts. Prefix integration uses `gameSource` real game attachment and UiScale. |
| `photoPickerHarness`, `photoTick` | appearance-studio:413,428 | mini-dom, mock PhotoStudio album/background owner, observer invalidation; event-loop tick lets responses settle. |
| `loadStudioRenderCounts`, `expectRenders` | appearance-studio:471,497 | Store subscribers and deterministic timers/microtasks; instruments actual preview/profile `replaceChildren`, drives advanced owner events. |
| Shared DOM/source/log helpers | tests/helpers/{mini-dom,game-source,seed-dom,seed-log,abs-src,fn-source,css-source}.mjs | DOM behavior, source extraction and source filenames, logger stubs, assembled CSS access; helper imports do not imply each helper file was fully audited here. |

## Exhaustive test and assertion index

The following index is derived from parsed test ASTs after the full manual read. Every literal `assert.*(...)` call in each test body is indexed by its starting line, including callback and nested helper assertions. Parameterized test declarations appear once and run for the loop cases described above; a runtime test count must not be inferred from row count. Prefix-only tests are included for integration context. The semantic families above map each row to production ownership; assertion lines are precise navigation anchors, not a claim that assertions were executed. Fixture assertions outside test calls are listed separately. Repeated line numbers mean multiple distinct assertion calls on that line. The parsed inventory contains 162 test declarations and 1,035 assertion calls: assets 69/526, lifecycle 29/130, options 32/173, Studio 32/206 (declarations/assertions, including fixture calls).

### assets-pack.test.mjs

| Inclusive test lines | Contract | Assertion start lines |
| --- | --- | --- |
| 41–73 | "GLTF accessors stay inside their declared bufferView and reject invalid stride" | 68, 69, 70, 71, 72 |
| 85–99 | "asset loader shares an in-flight manifest across boot consumers" | 95, 98 |
| 101–114 | "asset loader shares an in-flight manifest failure and retries a later request" | 109, 110, 111, 113 |
| 122–181 | "material strips download together, then preserve sequential decode and upload inputs" | 138, 149, 150, 151, 152, 154, 155, 156, 157, 164, 166, 169, 170, 172, 173, 174, 175, 176, 177, 178, 179, 180 |
| 183–208 | "an albedo-only material variant never requests or decodes a normal strip" | 194, 195, 196, 202, 203, 204, 205, 206, 207 |
| 210–233 | "a normal fetch failure is not the pack's failure: a later albedo rejection still decides" | 227, 228, 229, 230, 231, 232 |
| 235–252 | "a missing normal strip still ships the albedo pack (normal = null)" | 246, 247, 248, 249, 250, 251 |
| 254–282 | "a normal decode failure keeps the albedo upload and closes its bitmaps" | 274, 275, 276, 277, 278, 279, 280, 281 |
| 284–308 | "unload during parallel downloads rejects the stale generation before any decode" | 301, 302, 303, 304, 305, 306, 307 |
| 310–340 | "unload drops cached models and rejects late manifest/model responses" | 326, 328, 329, 330, 336, 337, 338, 339 |
| 342–367 | "material and model loads recover after a temporarily unavailable pack" | 359, 360, 362, 363, 364, 365, 366 |
| 374–421 | "a failed pack load is retried once at race entry, and only once (3-F2)" | 387, 388, 389, 390, 392, 393, 399, 402, 403, 409, 413, 414, 415, 419, 420 |
| 424–455 | `asset loader closes every decoded bitmap when fallback ${failFallback ? "fails" : "succeeds"}` | 446, 451, 452, 453, 454 |
| 466–499 | `every material-strip createImageBitmap passes straight-alpha options (${path} path)` | 485, 486, 489, 490, 491, 495, 496, 498 |
| 502–548 | "readLayerBytes reads layers straight through a scratch WebGL2 context, never a 2D canvas" | 529, 530, 531, 532, 533, 534, 535, 536, 537, 537, 537, 538, 539, 545, 546, 547, 547 |
| 551–588 | `synchronous layer readback validates GL flags and keeps valid siblings (${failure})` | 580, 581, 582, 583, 584, 585, 586, 587 |
| 635–674 | "P4: readLayerBytesAsync returns byte-identical layers to readLayerBytes through a PIXEL_PACK_BUFFER + fenceSync" | 652, 653, 654, 655, 656, 657, 658, 664, 665, 666, 667, 667, 668, 669, 670, 670, 672, 673 |
| 676–691 | "P4: the clean 14-layer pack batches GL error checks before publishing callbacks" | 684, 685, 688, 689, 690 |
| 694–714 | `P4: a throwing ${refusal} consumer cannot strand the job or duplicate callbacks` | 700, 708, 709, 710, 711, 712, 713 |
| 718–761 | `P4: a ${failure} failure releases its buffer before fallback and preserves sibling layers` | 743, 751, 752, 755, 756, 757, 758, 759, 760 |
| 765–802 | `P4: nonthrowing ${failure} cannot report zero bytes as a completed layer` | 786, 792, 794, 795, 796, 797, 798, 799, 800, 801 |
| 805–853 | "P4: readLayerBytesAsync degrades the way the sync path does — refused layers, a failed wait, no fence API" | 816, 817, 818, 825, 826, 828, 833, 835, 837, 847, 848, 848, 849, 851 |
| 855–868 | "WGX and TLX take pack bytes from Assets.readLayerBytes, not a 2D-canvas getImageData" | 860, 864, 865, 866, 867 |
| 902–919 | "P4 (TLX #2149): createTextureArray returns a pending token, uploads only once every layer landed, bytes = the sync path" | 906, 906, 907, 907, 912, 912, 913, 913, 914, 915, 916, 917, 917, 918 |
| 921–949 | "P4 (TLX #2149): setMaterialMaps holds a pending token back, binds it when ready, and a newer call supersedes it" | 927, 929, 930, 930, 930, 939, 940, 947, 947 |
| 951–973 | "TLX repeated pending material adoption keeps shared tokens alive for the latest request" | 964, 966, 967, 969, 971 |
| 975–992 | "P4 (TLX #2149): the fallbacks — async null and apex26.tlxPackAsync=0 take the sync path; a refused layer takes the 2d copy" | 980, 980, 980, 984, 985, 986, 991, 991 |
| 996–1025 | "the material pack takes the low tier under Save-Data or 2G (#3110 F2)" | 1017, 1018, 1019, 1021, 1022, 1023, 1024 |
| 1027–1066 | "unload invalidates an in-flight pack upload and frees its partial texture" | 1060, 1061, 1062, 1063, 1064, 1065 |
| 1068–1104 | "adopt owns the latest generation when an older pack decode finishes later" | 1097, 1100, 1101, 1102, 1103 |
| 1127–1136 | "bake tool's MAT table matches TrackGeom.MAT exactly" | 1132, 1135 |
| 1138–1151 | "GLASS and FLAG are never given a baked layer" | 1141, 1147, 1148, 1149, 1150 |
| 1153–1165 | "the shader's layer count matches the MAT table size" | 1155, 1158, 1160, 1161, 1163, 1164 |
| 1167–1181 | "shader sources parse as JS (no stray backticks in GLSL comments)" | 1179 |
| 1183–1196 | "the baked-material knob is wired, and ON so the pack can contribute" | 1189, 1190, 1192, 1194, 1195 |
| 1198–1235 | "bake-synthetic produces a dual-tier Apex26-Procedural pack with no network" | 1219, 1221, 1222, 1223, 1224, 1225, 1227, 1228, 1230, 1231 |
| 1237–1254 | "pack manifest is well-formed" | 1238, 1240, 1241, 1243, 1247, 1248, 1250, 1251, 1252 |
| 1256–1273 | "the pack carries a mobile LOW variant" | 1262, 1263, 1265, 1266, 1272 |
| 1275–1296 | "every referenced file exists and the strip is the right height" | 1281, 1285, 1290, 1291, 1295 |
| 1298–1312 | "pack stays inside the clone-time budget" | 1310 |
| 1314–1351 | "bake-synthetic-models drops retired procedural bins and keeps CC0 imports" | 1340, 1342, 1343, 1344, 1345, 1346, 1347 |
| 1353–1435 | "bake-model round-trips glTF into the game's own vertex format" | 1399, 1404, 1405, 1405, 1407, 1409, 1410, 1413, 1415, 1429, 1430 |
| 1437–1573 | "bake-atlas slices a 4x4 sheet onto the named MAT layer" | 1499, 1502, 1504, 1505, 1508, 1509, 1510, 1511, 1528, 1532, 1533, 1534, 1551, 1553, 1554, 1555, 1556, 1557, 1558, 1561, 1562, 1563, 1565, 1568, 1569 |
| 1575–1626 | "TrackGeom.addMesh transforms a baked model correctly" | 1588, 1601, 1604, 1605, 1606, 1609, 1611, 1613, 1618, 1619, 1623, 1624, 1625 |
| 1628–1689 | "webbake toGLB re-packs .gltf + .bin into something gltf.js accepts" | 1648, 1675, 1676, 1677, 1678, 1682, 1683, 1684, 1687 |
| 1691–1732 | "webbake writes a ZIP that real unzip accepts" | 1722, 1724, 1725 |
| 1734–1747 | "credits cover every asset in the pack" | 1738, 1740, 1742, 1743, 1745 |
| 1764–1777 | "the UI never claims a provenance the pack contradicts" | 1767, 1772 |
| 1799–1811 | "per-circuit model loads cannot restart pack fetches after unload" | 1805, 1806, 1807, 1808, 1809, 1810 |
| 1813–1822 | "per-circuit model readiness does not count models unloaded during its wait" | 1820, 1821 |
| 1824–1839 | "modelsReady resolves once the prefetched models are resident, and loadModels is one run" | 1829, 1833, 1834, 1836, 1837, 1838 |
| 1843–1858 | "a parsed v2 model owns its arrays: none aliases the fetched buffer (#3110 F5)" | 1851, 1852, 1854, 1855, 1857, 1857 |
| 1860–1866 | "modelsReady gives up at its cap when the pack hangs, and never rejects on a failing pack" | 1862, 1865 |
| 1888–1921 | "shared model fetch and body deadlines settle stalled work and permit both readiness routes to retry" | 1904, 1905, 1906, 1908, 1909, 1910, 1911, 1912, 1917, 1918, 1919 |
| 1923–1940 | "a short model waiter leaves a shared healthy request alive for its remaining callers" | 1933, 1934, 1936, 1937, 1938, 1939 |
| 1942–1963 | "a stalled manifest fetch or JSON body releases its memo and permits a fresh model request" | 1954, 1955, 1956, 1960, 1961 |
| 1965–1983 | "unload cancels request ownership without clearing a newer model memo or accepting late bytes" | 1977, 1977, 1979, 1980, 1981, 1982, 1982 |
| 1985–2012 | "a stalled optional normal fetch or body expires while the albedo pack still uploads" | 2003, 2004, 2004, 2005, 2006, 2009, 2010 |
| 2014–2058 | "ensureScenery awaits THIS circuit's models (Assets.modelsReady with the closure source) before any build" | 2044, 2048, 2049, 2050, 2054, 2057 |
| 2060–2078 | "modelsReady(ms, src) fetches only the models a scenery closure names" | 2070, 2071, 2072, 2073, 2075, 2076, 2077 |
| 2080–2085 | "unknown bake flag is refused before rewriting the pack" | 2083, 2084 |
| 2087–2092 | "assets.mjs --help prints usage and exits 0" | 2090, 2091 |
| 2100–2146 | "verify refuses model files outside the pack, unhashed, or with out-of-range indices/layers" | 2119, 2121, 2129, 2143, 2144 |
| 2148–2215 | "glTF supplied normals match transformed triangle normals for rotations, nonuniform scale and parents" | 2169, 2193, 2195, 2196, 2199, 2211 |
| 2217–2241 | "asset decode fallback yields a task between layers and unload during the yield cannot upload" | 2231, 2232, 2235, 2236, 2237, 2238, 2239 |
| 2244–2273 | "readback destination ownership is local across sync, overlapping async, failure and unload" | 2254, 2256, 2262, 2262, 2264, 2264, 2266, 2267, 2269, 2269, 2270, 2271 |
| 2275–2293 | "obsolete Safari fallback stops at a layer task and closes both crop and full-strip owners" | 2288, 2290, 2290, 2290, 2291, 2292 |
| 2296–2335 | "model decode lane paces ready bodies, shares duplicates, and survives failures and unload" | 2316, 2318, 2319, 2321, 2322, 2324, 2325, 2328, 2329, 2330, 2334 |
| 2338–2360 | "model admission tail drops decoded payloads across cache generations" | 2350, 2351, 2352, 2354, 2355, 2357, 2357, 2358, 2359 |

Fixture assertions outside test declarations:

- `assets-pack:608`: `assert.equal(t, GL.PIXEL_PACK_BUFFER)`
- `assets-pack:609`: `assert.equal(t, GL.PIXEL_PACK_BUFFER)`
- `assets-pack:609`: `assert.equal(usage, GL.STREAM_READ)`
- `assets-pack:614`: `assert.ok(pbo, "an offset needs a bound PIXEL_PACK_BUFFER")`
- `assets-pack:617`: `assert.equal(cond, GL.SYNC_GPU_COMMANDS_COMPLETE)`
- `assets-pack:617`: `assert.equal(flags, 0)`
- `assets-pack:620`: `assert.equal(timeout, 0, "never a blocking wait")`
- `assets-pack:623`: `assert.equal(t, GL.PIXEL_PACK_BUFFER)`
- `assets-pack:623`: `assert.ok(pbo, "bound for the copy")`
- `assets-pack:879`: `assert.ok(a > 0 && b > a, "tlx.js readback block moved — update this test")`
- `assets-pack:1120`: `assert.ok(G && G.MAT, "TrackGeom.MAT not reachable from the VM sandbox")`
- `assets-pack:1881`: `assert.ok(due.length, a ${ms}ms timer must be owned by this request/waiter)`

### async-lifecycle.test.mjs

| Inclusive test lines | Contract | Assertion start lines |
| --- | --- | --- |
| 19–40 | "a skipped View Transition cannot raise unhandled animation rejections or apply the screen twice" | 21, 33, 35, 39, 39 |
| 140–150 | "audio boot restore keeps saved master sound off when music is on" | 144, 145, 146, 147, 148, 149 |
| 152–161 | "the sound button unlocks WebAudio synchronously after enabling its master" | 159, 160 |
| 163–174 | "master sound off cancels pending announcements and every recorded channel" | 170, 171, 172, 173 |
| 176–188 | "music and SFX enable clicks also unlock a saved-off master synchronously" | 184, 185 |
| 190–198 | "MENU SOUNDS row persists apex26.menuSfx and gates the engine's ui blips" | 193, 196, 197 |
| 200–228 | "a stopped QR attempt disposes a camera stream that arrives late" | 223, 224, 225, 226, 227 |
| 230–253 | "a canceled QR attempt cannot arm an interval after video.play settles" | 250, 251, 252 |
| 255–277 | "a decoder that loads without registering is retried" | 271, 274, 276 |
| 279–301 | "an IndexedDB open that succeeds after timeout closes its orphan handle" | 299, 300 |
| 351–363 | "music imports serialize across calls until their transactions commit" | 357, 358, 361, 361, 361, 362, 362, 362, 362 |
| 365–374 | "music library retries a failed initial read and restores saved tracks" | 369, 370, 372, 372, 372, 373, 373 |
| 376–382 | "a successful empty music library stays available and does not reread on every panel entry" | 379, 381, 381, 381 |
| 384–392 | "a quota-aborted music import releases its duplicate reservation for a queued retry" | 388, 388, 389, 390, 390, 391, 391, 391, 391 |
| 394–402 | "music library invalidates a version-changed connection and reopens for the next import" | 397, 398, 400, 400, 400, 401, 401, 401 |
| 404–436 | "a timed-out API fetch releases the shared queue" | 423, 433, 434 |
| 438–470 | "a response whose BODY stalls still times out and releases the queue" | 459, 467, 468 |
| 472–497 | "API auth failures never fall back to stale cached data" | 492, 493, 494 |
| 531–537 | "LIVE labels sessions as upcoming, live, or completed" | 534, 535, 536 |
| 539–547 | "LIVE session time copy agrees with the status badge" | 543, 544, 545, 546 |
| 549–555 | "LIVE split panes can shrink without creating modal-wide horizontal overflow" | 552, 553 |
| 557–562 | "LIVE completed badge has a distinct muted treatment" | 559, 560, 561 |
| 564–581 | "mergeIntervalBatch ignores values:null and never writes meta keys into gaps" | 568, 569, 570, 571, 574, 575, 580 |
| 583–610 | "LIVE position/interval requests use watermarks and never touch localStorage" | 596, 600, 605, 606, 607, 608, 609 |
| 612–644 | "snapshot and delta classification share row mapping while retaining their empty-response shapes" | 629, 630, 631, 634, 635, 636, 637, 638, 639, 640, 642, 643 |
| 646–655 | "ordinary API writes sweep the cache at most once per five-minute window" | 653, 654 |
| 657–664 | 'voice volume and auditions remain available with automatic radio and announcer off' | 660, 661, 662, 663 |
| 666–678 | 'choosing a system voice for a race channel switches source, but the announcer pick leaves it alone' | 674, 676, 676 |
| 680–686 | 'same-size voice-list replacements refresh both settings selectors' | 685 |

Fixture assertions outside test declarations:

- `async-lifecycle:336`: `assert.ok(mode === "readonly" || mode === "readwrite")`

### appearance-opts.test.mjs

| Inclusive test lines | Contract | Assertion start lines |
| --- | --- | --- |
| 232–247 | "shell carries Appearance door, panel, swatches and hex fields" | 233, 234, 235, 236, 238, 239, 241, 242, 243, 244, 245, 246 |
| 249–259 | "defaults apply at eval: dark / ember / team data attrs" | 251, 252, 253, 254, 255, 256, 257, 258 |
| 261–268 | "APP ICON accepts CLASSIC and sets A-F, rejects the rest, and persists" | 263, 264, 264, 265, 265, 266, 267 |
| 270–282 | "profile restore updates live appearance caches and rows without another persistence batch" | 274, 274, 274, 275, 275, 275, 276, 276, 277, 277, 278, 278, 280, 280, 281, 281 |
| 284–288 | "menu custom colours receive the same safe ink selection as swatches" | 286, 287 |
| 290–295 | "setTheme persists and stamps data-ui-theme" | 293, 294 |
| 297–305 | "SYSTEM theme stamps data-ui-theme and re-applies on matchMedia change" | 300, 301, 304 |
| 307–313 | "named menu preset stores and leaves --red to CSS" | 310, 311, 312 |
| 315–323 | "custom menu accent writes inline --red and reveals the well" | 318, 319, 320, 321, 322 |
| 325–331 | "leaving CUSTOM hides the well again" | 328, 330 |
| 333–338 | "HUD brand points --accent at var(--red)" | 336, 337 |
| 340–345 | "menu TEAM writes a concrete team hex into --red" | 343, 344 |
| 347–355 | "HUD TEAM clears inline --accent so data-team owns it" | 350, 352, 353, 354 |
| 357–362 | "pickInk chooses --bg on a light custom HUD accent (dark theme)" | 360, 361 |
| 367–375 | "SYSTEM theme: an OS colour-scheme flip re-reads --text/--bg for the accent ink" | 371, 374 |
| 377–381 | "pickInk chooses --text on a dark custom HUD accent" | 380 |
| 383–392 | "garbage theme / accent / hex values fall back or keep prior" | 385, 386, 387, 389, 390, 391 |
| 394–403 | "bad store values at load fall to shipped defaults" | 398, 399, 400, 401, 402 |
| 405–414 | "DOM ready wires SettingRows and builds both swatch rows" | 407, 410, 411, 412, 413 |
| 416–424 | "swatch click selects the accent" | 419, 421, 422, 423 |
| 426–449 | "each accent list has one tab stop and keyboard focus selects only that list" | 431, 432, 436, 436, 437, 438, 439, 446, 446, 448, 448 |
| 451–473 | "swatches leave Tab and modified shortcuts alone; pointer choice and restoration maintain focus ownership" | 459, 459, 460, 460, 463, 463, 464, 464, 466, 466, 466, 467, 469, 469, 469, 471, 471, 471, 472 |
| 475–486 | "hex text field accepts a full #rrggbb and rejects junk" | 481, 482, 485 |
| 488–493 | "appearance keys are registered for settings export/import" | 490 |
| 495–507 | "tokens.css defines every named menu preset AppearanceOpts ships" | 498, 500, 505 |
| 509–512 | "forced-colors opts the appearance chips out with the swatch family" | 510, 511 |
| 514–529 | "READABILITY: text size, high contrast and speed units persist and apply" | 516, 517, 518, 520, 521, 523, 525, 526, 528 |
| 531–544 | "SPEED UNITS is display-only: km/h by default, mph converts and rounds" | 533, 534, 535, 537, 538, 539, 541, 542, 543 |
| 546–550 | "tokens.css defines both text sizes and the high-contrast block" | 548, 549 |
| 554–568 | "HELP TEXT: SHOW by default, HIDE stamps data-menu-help=off, garbage reads as SHOW" | 556, 557, 558, 560, 561, 562, 564, 565, 566, 567 |
| 570–585 | "HELP TEXT: the inline boot stamp agrees with the module" | 572, 583 |
| 587–605 | "HELP TEXT: CSS hides explanations in settings + race setup, never status lines or kept readouts" | 588, 590, 591, 595, 598, 601, 602, 603, 604 |

Fixture assertions outside test declarations:

None.

### appearance-studio.test.mjs

| Inclusive test lines | Contract | Assertion start lines |
| --- | --- | --- |
| 20–52 | "game's Studio integration refreshes touch button size after profile apply, reset and Undo" | 39, 44, 45, 46 |
| 79–103 | "Colour Vision profiles, reset and Undo update the actual owner, palette and select; screen scope retains the global choice" | 82, 83, 84, 85, 86, 91, 100 |
| 105–132 | "profile restore, Undo and reset repaint mounted title and pause controls without duplicating them" | 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124 |
| 134–145 | "Studio mounts once the document has passed loading (interactive included)" | 140, 140, 142, 143 |
| 147–156 | "visual profiles and coordinated presets preserve driving, career, confirmation and budgets" | 151, 152, 152, 152, 153, 155, 155 |
| 158–165 | "hostile visual snapshots are clamped, normalized and stripped of unrelated keys" | 162, 162, 162, 163, 163, 163, 164, 164, 164 |
| 167–175 | "Undo restores the last visual batch; current-screen preset preserves other views" | 169, 170, 170, 170, 171, 172, 172, 174, 174 |
| 177–179 | "HUD screen scope does not rewrite the global HUD profile" | 178 |
| 181–195 | "every ScreenLooks page has a screen scope and a preview entry" | 184, 185, 186, 187, 188, 189, 190, 193 |
| 201–208 | "Named profiles can be updated and deleted without changing the live visual state" | 203, 204, 204, 205, 206, 206, 207 |
| 210–214 | "Storage durability failures remain explicit while current-session profiles work" | 212, 212, 212, 213 |
| 216–222 | "Profile boundary rejects duplicates and bad ids and enforces the saved-profile limit" | 219, 219, 219, 221, 221 |
| 224–229 | "Scene events and independent background motion respect OS reduce and unsubscribe" | 225, 227, 228, 228, 228 |
| 231–234 | "Apply calls the live owner hook with sanitized snapshots" | 233, 233, 233 |
| 236–241 | "A failed preview owner cannot prevent persistence, undo or profile restoration" | 239, 239, 240, 240 |
| 243–248 | "Unrelated visual edits do not restart the Home scene" | 245, 247, 247 |
| 250–261 | "Home camera defaults and hostile saved choices normalize without expanding scene payload" | 252, 252, 254, 254, 257, 257, 257, 258, 259, 260, 260 |
| 263–276 | "Circuit, pit lane and mixed environments persist through named visual profiles" | 267, 272, 273, 273, 274 |
| 278–286 | "Home scoped reset includes camera and environment while undo preserves other screens" | 281, 281, 282, 282, 282, 283, 283, 284, 284, 285, 285 |
| 288–298 | "profile apply, reset and Undo disclose session-only restoration when storage is unavailable" | 294, 296, 297 |
| 300–312 | "Studio previews independent HUD accent and contrast precedence" | 308, 309, 311 |
| 314–352 | "Opening Appearance marks the panel busy and defers scene preview off the click stack" | 339, 342, 343, 344, 347, 350, 351 |
| 354–366 | "M2: Studio edits never pin motion:'on' and write only the keys that changed" | 357, 358, 359, 361, 363, 364, 365 |
| 369–379 | "one home (#2846): the Studio builds no second copy and jumps to HUD and motion homes" | 374, 376, 378 |
| 381–393 | "cosmetic presets retain accessibility and units without writing those preferences" | 388, 389, 391 |
| 395–411 | "profile application obeys selected screen scope and undo restores the affected screen" | 406, 407, 407, 408, 410, 410 |
| 430–443 | "saved photo picker previews only on selection and persists only on explicit Choose" | 434, 434, 435, 435, 435, 437, 437, 438, 438, 439, 439, 440, 441, 442 |
| 445–456 | "saved photo empty, failed load and failed background writes are recoverable" | 451, 451, 452, 452, 453, 453, 455, 455, 455 |
| 458–467 | "saved photo refresh ignores superseded responses and responses after Appearance closes" | 463, 466, 466 |
| 504–531 | "Studio renders choices, presets, Undo, reset and profile application once with final state" | 511, 512, 513, 514, 517, 518, 519, 520, 523, 524, 525, 527, 528, 529, 530 |
| 533–551 | "Studio renders external changes and advanced input/click history without losing updates" | 536, 546, 547, 548 |
| 553–570 | "Studio coalesces an advanced click and its store notification while preserving scene events and Undo" | 560, 561, 563, 565, 566, 567, 568, 569 |

Fixture assertions outside test declarations:

- `appearance-studio:499`: `assert.deepEqual(counts, { preview: expected, profiles: expected })`

## Coverage limits

All four assigned ranges are complete. This map establishes source comprehension and navigation, not passing tests, rendered UI behavior, network integration, actual WebGL/WebGPU execution, or filesystem artifact integrity at runtime. Source-shape guards and extracted function rigs are distinguished from actual module integration above. No tests, browser work, source modifications or commit were performed for this subtask.
