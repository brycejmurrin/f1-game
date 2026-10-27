# Unit group 46 — complete semantic map

Read-only mapping, 2026-10-27. All 12 files, 4,159 lines, read from beginning to end in individually returned chunks of at most 100 lines. No tests or browser were run. Initial aggregate terminal output clipped scenery-kits 601–1000; those four chunks were re-read completely. Ranges and SHA-256 identify the actual working-tree source. Assertion spans below include nested callbacks; helper assertions are identified in fixture notes. A test title describes the intended contract; the meaning column describes the observation and its limit.

LSP evidence: attached apex-lsp outline resolved SceneryThemes, LandmarkKit, CircuitKit, SceneryNature, ScriptLoader, RendererBoot, SeasonCal, ScreenLooks and Menus; bounded definition bodies confirmed the routing and guards for resolve/create/award/resume/peek/plan/guessBackend. RendererBoot.guessBackend and SeasonCal.resume returned module-file fallback declarations with caller/export coverage unverified. Local AST function ranges refine those anchors; they do not prove runtime execution.

## Production targets and fixture boundaries

## tests/unit/scenery-kits.test.mjs

SHA-256: `e7947d795c6819b5c7e4fc8b5f367c490c212daca94ce41699b49eec8099fb0f`. Complete read: 1–1288.

Fixture / limit: VM loads real log and selected modules with top-level const rewritten to var (10–22). landmarkHarness 63–75 records primitive callbacks; specs 77–97. circuitHarness 255–314 records groups, bounds and callbacks with fixed node-40 frame; no real road physics. venueHarness 593–613 uses real geom/models and synthetic straight track. Fence fixture 649–681 captures instance placements. spectatorHillFixture 684–709 uses circular frames, controlled stations/jitter and captured boxes/instances. Palm 882–919 and tree 973–1002 capture real primitive vertices and occupancy queries. emittedReservationFixture 1069–1077 slices real build-props reservation closure by textual sentinels. reservedVehicleHarness 1079–1120 uses real non-indexable accumulators; assertVehicleReservation 1122–1143 checks every new vertex and unchanged rails. dayBuildingHarness 1178–1224 stubs instance acceptance/material stamping. No renderer, GPU or complete authored scene is exercised.

Production: js/track/scenery/themes.js:65–86; landmark-kit.js:28–199; circuit-kit.js:64–428; models.js:438–553; venue.js:9–135; structures.js:create 5–1126; nature.js:create 54–1622; city.js:create 14–926; identity.js:create 5–445; build-props.js reserveEmittedSolid; js/circuits/scenery/interlagos.js interlagos.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| SceneryThemes resolves named themes and track overrides (24–35) | 30, 31, 32, 33, 34 | `SceneryThemes.resolve`; Theme resolution/public API; VM values only. |
| SceneryThemes resolves neutral defaults and unknown themes fall back to neutral (37–46) | 42, 43, 44, 45 | `SceneryThemes.resolve`; Theme resolution/public API; VM values only. |
| SceneryThemes exposes only the immutable public operations (48–53) | 51, 52 | Theme resolution/public API; VM values only. |
| SceneryThemes variant selection is stable and bounded (55–61) | 59, 60 | `SceneryThemes.variant`; Theme resolution/public API; VM values only. |
| LandmarkKit emits all six finite forms only into the caller stage (98–113) | 103, 105, 106, 107, 108, 109–112 | Landmark primitives, rejection and bounded emission; recording callbacks. |
| LandmarkKit uses a prism for sawtooth roofs (115–123) | 118–120, 121, 122 | `kit.roof`; Landmark primitives, rejection and bounded emission; recording callbacks. |
| LandmarkKit rejects invalid and non-finite specs without emission (125–143) | 138, 140, 142 | Landmark primitives, rejection and bounded emission; recording callbacks. |
| LandmarkKit rejects excessive repeated counts without emission (145–167) | 148–150, 151–153, 154–156, 157–159, 160–162, 163–165, 166 | `kit.facade`, `kit.tower`, `kit.stadiumSection`; Landmark primitives, rejection and bounded emission; recording callbacks. |
| LandmarkKit caps worst-case bounded emission (169–187) | 173, 174–176, 177–179, 180–182, 183, 184, 186 | `kit.roof`, `kit.facade`, `kit.tower`, `kit.stadiumSection`, `kit.arch`, `kit.canopy`; Landmark primitives, rejection and bounded emission; recording callbacks. |
| LandmarkKit stops and reports primitive callback failures (189–234) | 202, 203, 213, 214, 217–219, 232, 233 | `kit.facade`; Landmark primitives, rejection and bounded emission; recording callbacks. |
| structured shelters keep the roof, columns and recessed panels inside rotated bounds (320–340) | 325–326, 327, 328, 331, 336 | `kit.marshalShelter`; Infrastructure placement/atomic staging guards; mocked dependencies. |
| textured ground patches drape on terrain and restore the caller material (342–360) | 352–353, 354, 355, 357, 358 | Geometry placement/material contract in the named production emitter; synthetic context. |
| CircuitKit exposes all nine infrastructure facilities (362–365) | 364 | Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit routes each complete facility through one atomic model group (367–400) | 384, 385, 387, 388, 389, 390, 391, 392, 393–395, 396–398 | Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit computes finite world bounds from side, gap, and size (402–414) | 404–408, 409–413 | `kit.hospitality`; Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit delegates pedestrian bridges once with safe clearance (416–439) | 418–421, 422, 423, 424–434, 435–437, 438 | `kit.pedestrianBridge`; Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit accepts bounded maximum repeated counts (441–455) | 449, 450, 453 | Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit rejects invalid and excessive repeated counts before staging (457–471) | 466–467, 468 | Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit rejects missing IDs and invalid fractions without throwing (473–490) | 486, 486, 488 | Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit rejects invalid placement and dimensions before model routing (492–511) | 507, 508 | Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit rejects missing and non-finite frames before model routing (513–539) | 528, 529, 537–538, 538 | Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit propagates model and landmark helper failures without throwing (541–580) | 546, 555–556, 556, 562–564, 569, 578–579, 579 | Infrastructure placement/atomic staging guards; mocked dependencies. |
| CircuitKit fails closed when dependencies are missing or invalid (582–591) | 587–588, 588 | Infrastructure placement/atomic staging guards; mocked dependencies. |
| venue facilities are deterministic, bounded, finite and preserve driving limits (615–633) | 617–618, 619, 620, 621, 622, 623, 624, 625, 626, 627, 628, 629, 630, 632 | Venue site search and emitted geometry/reservations on synthetic track. |
| venue guards reject excluded, occupied, fenced, unknown, steep and on-road sites atomically (635–646) | 639, 640, 641, 642, 643–644 | Venue site search and emitted geometry/reservations on synthetic track. |
| fence footings reach terrain or the universal floor without moving tilted panel tops (648–682) | 675, 676, 677, 679, 680, 681 | Geometry placement/material contract in the named production emitter; synthetic context. |
| orphaned upper spectator treads retain crowds on ground-reaching piers within their footprint (711–729) | 713, 714, 715, 719, 720, 724, 725, 728 | Nature terrace and crowd geometric containment/separation; captured solids. |
| outside-bend terrace treads do not interpenetrate between stations (overlap ≤ 0.5 m) (731–764) | 755, 762 | Nature terrace and crowd geometric containment/separation; captured solids. |
| inside-bend terrace treads meet separating planes and retain every spectator (766–777) | 768, 769, 774, 775 | Nature terrace and crowd geometric containment/separation; captured solids. |
| short terrace chords support the entire crowd footprint at both jitter extremes (779–816) | 796, 798–805, 809, 810, 811, 813 | Nature terrace and crowd geometric containment/separation; captured solids. |
| Sector M fascia attaches to track-facing walls and canopy fits its declared envelope (818–849) | 837, 839, 842, 843, 845, 847–848 | Geometry placement/material contract in the named production emitter; synthetic context. |
| every bush form emits foliage and restores its caller material (851–880) | 869, 870, 871, 872, 876, 877 | `nature.bush`; Geometry placement/material contract in the named production emitter; synthetic context. |
| palm occupancy footprints contain every tilted trunk, crown and frond vertex (921–934) | 923, 924, 929–931 | Nature occupancy/relocation against actual generated vertices; controlled terrain and blockers. |
| palm occupancy moves to nearby clear ground and drops an entirely blocked tree atomically (936–947) | 938, 939, 940, 941, 943, 944, 945 | Nature occupancy/relocation against actual generated vertices; controlled terrain and blockers. |
| palm relocation yields to already placed crowns and rejects hillside or unknown foliage sites (949–971) | 956–957, 958, 963–964, 967, 968, 969 | Nature occupancy/relocation against actual generated vertices; controlled terrain and blockers. |
| broadleaf clearance covers actual round, vase, weeping, columnar and dead geometry (1004–1020) | 1008, 1009–1016, 1017, 1018 | Nature occupancy/relocation against actual generated vertices; controlled terrain and blockers. |
| broadleaf relocation preserves shape identity and rejection leaves no geometry or phantom planting (1022–1046) | 1027, 1029, 1030, 1031, 1032, 1033, 1037, 1038, 1039, 1042, 1044, 1045 | Nature occupancy/relocation against actual generated vertices; controlled terrain and blockers. |
| broadleaf relocation respects earlier crowns in either order while authored woodland can interlock (1048–1065) | 1051, 1057–1058, 1063–1064 | Nature occupancy/relocation against actual generated vertices; controlled terrain and blockers. |
| motorhomes and broadcast compounds reserve their emitted tilted footprints without driving limits (1145–1154) |  | City/Identity footprint and rollback; real accumulators, synthetic rejection. |
| rejected vehicle bodies and awnings leave no phantom footprint or detached details (1156–1173) | 1160, 1161, 1161, 1162, 1165, 1165, 1169, 1170, 1171, 1172 | City/Identity footprint and rollback; real accumulators, synthetic rejection. |
| day building() drops facade kit when the wall mass is rejected (1226–1242) | 1229, 1230, 1231, 1235, 1236–1237, 1238–1239, 1240–1241 | City rejection/material propagation; stubbed instancing. |
| neonTower resets out._mat when a rejected body section returns early (1244–1273) | 1271 | `city.neonTower`; City rejection/material propagation; stubbed instancing. |
| a day wall mass carries its facade material into the instanced model (H27) (1275–1288) | 1282, 1284, 1285, 1287 | City rejection/material propagation; stubbed instancing. |

## tests/unit/scenery-preview-budget.test.mjs

SHA-256: `d0b15ee917f502b921d3cd19b54667f3effbe443ba637ba4e03d2ee7f3f96abc`. Complete read: 1–72.

Fixture / limit: planMeasured 12–34 boots real editor helpers, sanitizes valid ellipse designs, instruments Math.hypot and Hash32.unit, hashes entire scene and hash-call sequence and checks input immutability. Golden bytes/call counts are deterministic operation evidence, not wall time/browser responsiveness.

Production: js/editor/scenery-preview.js:11–105 DesignerSceneryPreview.plan; tests/helpers/editor-vm.mjs bootEditor/ellipse/design/read.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| a valid 6.27 km MANY layout stops clearance scans once all 1800 footprints are fixed (36–49) | 38, 39, 40, 41, 42, 45, 46, 47, 48 | Real preview planner deterministic scene/hash sequence and operation bound; no timing claim. |
| FEW foliage on the same valid long layout retains the complete under-budget output (51–60) | 53, 54, 55, 56, 57, 58, 59 | Real preview planner deterministic scene/hash sequence and operation bound; no timing claim. |
| an under-budget 3.14 km MANY layout retains all scene bytes and seeded calls (62–72) | 64, 65, 66, 67, 68, 69, 70, 71 | Real preview planner deterministic scene/hash sequence and operation bound; no timing claim. |

## tests/unit/screen-looks.test.mjs

SHA-256: `614a948d6a41ac36927da7e043135b664cc729dae571e66ec2e7b3085bb1df6b`. Complete read: 1–432.

Fixture / limit: boot 34–92 uses real SettingRow, optional PauseOpts, mini-dom, stub persistence/timers/MutationObserver/SheetShape. Text contracts read shell, manifest, export registry and all CSS. Synthetic capture dispatch and manual timers do not establish browser event propagation, computed layout or visual appearance.

Production: js/ui/screen-looks.js:156–252 registry, 275–345 normalization/persistence, 370–490 peek lifecycle, 492–628 mounting; js/ui/setting-row.js; js/ui/pause-opts.js; js/ui/settings-export.js; index.html; tools/manifest.cjs; css/*.css.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| registry: unique screens, keys and knobs; every default is a legal value (97–122) | 100, 101, 103, 104, 106, 107, 110, 112, 113, 114, 121 | `ScreenLooks.SCREENS.map`, `ScreenLooks.SCREENS.find((s) => s.id === id).knobs.some`, `ScreenLooks.SCREENS.find`; ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| export: every look key is a BACKUP & RESTORE appearance row with a null default (124–128) | 127 | ScreenLooks registry/store/peek source contract; no computed CSS/browser proof. |
| load order: after pause-opts.js, before js/game.js, with a GameStore HARD_EDGES pair (130–135) | 132, 133, 134 | ScreenLooks registry/store/peek source contract; no computed CSS/browser proof. |
| no first-paint copy: nothing these looks touch paints on the first frame (137–140) | 139 | ScreenLooks registry/store/peek source contract; no computed CSS/browser proof. |
| untouched: no data-look-* attribute, no --look-* token, nothing stored (143–149) | 145, 146, 147, 148 | `ScreenLooks.isShipped`; ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| set: enums stamp an attribute, ranges a token + presence; back to default removes both and stores null (151–170) | 153, 154, 155, 156, 157, 158, 159, 160, 161, 163, 164, 165, 166, 168, 169 | `ScreenLooks.set`, `ScreenLooks.isShipped`, `ScreenLooks.reset`; ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| normalize: unknown keys dropped, junk enums read as shipped, ranges clamp and snap (172–183) | 175, 176, 177, 178, 179, 180, 181, 182 | `ScreenLooks.read`, `ScreenLooks.normalize`; ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| density / columns knobs re-run SheetShape so the tier follows at once (185–193) | 190, 192 | ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| build: one fold per screen after TITLE SCREEN, in registry order; pause rows join PAUSE MENU; mount once (196–218) | 202, 203, 204, 205, 207, 208, 210, 211, 214, 217 | `ScreenLooks.build`; ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| a row: stores, paints CUSTOM, peeks that screen; RESET puts it back (220–243) | 224, 225, 226, 227, 228, 230, 233, 235, 239, 240, 241, 242 | ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| PEEK button holds the view until dismissed; Esc ends it without closing SETTINGS (251–266) | 255, 256, 257, 259, 260, 261, 262, 263, 265 | ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| a peek ends on: the pad's cancel, a tap outside the fold (swallowed when held), the page hiding, the tab hiding (268–291) | 273, 276, 277, 278, 281, 285, 290 | ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| a key aimed outside the fold ends a timed peek before it acts; the peek refuses while SETTINGS is closed (293–302) | 298, 300, 301 | ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| stand-ins: an empty screen is dressed while peeked and undressed after; a built one is left alone (304–325) | 308, 309, 311, 314, 316, 320, 321, 324 | `ScreenLooks.peek`, `ScreenLooks.endPeek`; ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| TITLE SCREEN peeks only while the title screen is up (327–333) | 329, 332 | `ScreenLooks.peek`, `ScreenLooks.endPeek`; ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| PAUSE MENU: SHIPPED only while PauseOpts' four and these extras are all shipped (335–342) | 337, 339, 341 | `P.shipped`, `ScreenLooks.set`, `ScreenLooks.reset`; ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| CSS: every non-default answer and every range token has a rule; every peek target is revealed (345–368) | 354, 356, 358, 359, 364, 365, 366, 367 | `ScreenLooks.SCREENS.map`; ScreenLooks registry/store/peek source contract; no computed CSS/browser proof. |
| shell: one home (#2846) — the studio's adopted blocks hold the six, GENERAL holds units and help, before PAUSE MENU (371–389) | 375, 376, 379, 382, 383, 385, 386, 387, 388 | ScreenLooks registry/store/peek source contract; no computed CSS/browser proof. |
| a peek swallows only the dismissing click, not the next one (391–400) | 394, 395, 396, 397, 398, 399 | ScreenLooks registry/store/peek source contract; no computed CSS/browser proof. |
| designer: shipped defaults write nothing; a changed knob persists in apex26.lookDesigner and round-trips (403–425) | 406, 407, 408, 409, 410, 415, 416, 417, 418, 421, 423, 424 | `ScreenLooks.SCREENS.find`, `ScreenLooks.read`, `ScreenLooks.isShipped`, `ScreenLooks.set`, `ScreenLooks.reset`; ScreenLooks registry/store/peek behavior in mini-dom; stub event/timer/store boundaries apply. |
| designer: the knob is in the settings export, and the CSS keeps the tap floor under DESIGNER SIZE (427–432) | 428, 430, 431 | ScreenLooks registry/store/peek source contract; no computed CSS/browser proof. |

## tests/unit/script-loader-preload.test.mjs

SHA-256: `2237501edf134e3356772a58acc35e00baee4fd2ec46b523b701f4560f39168f`. Complete read: 1–256.

Fixture / limit: rig 21–41 captures tags/links and manually fires load/error; bootRig 87–99 stubs storage/GPU/rosters and records preloads. Renderer cases are storage decision tables, not adapter/backend boots. Retry cases use real timers. a.js/b.js/c.js/x.js/y.js/glx.js/tlx.js/wgx.js/spec.js/plain.js are synthetic URLs, not repository dependencies.

Production: js/core/script-loader.js:13–81 metadata/url/preload, 102–251 create/load; js/render/renderer-boot.js:462–528 guess/early adapter/preloadLikelyBackend.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| a chain a -> b -> c: b and c are fetched at load(), injected only after their predecessor loads (44–58) | 48–50, 51, 53, 56, 57 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| files with no waiting predecessor get no hint (they are injected at once) (60–67) | 64, 66 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| deployed shell: the hint carries the content-hash URL and the inject's SRI; a file inject() refuses is not fetched (69–77) | 74–75, 76 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| a newer build controlling the tab: nothing is preloaded (79–84) | 83 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| renderer boot preloads the backend start() will most likely pick (101–123) | 120, 121 | ScriptLoader + RendererBoot storage-choice/preload contract; no backend boot. |
| a guess read off navigator.gpu alone is a hunch: no eval-time TLX roster prefetch (#3536 / SwiftShader GLX fallback) (125–145) | 137, 138, 141, 142, 144 | `sl.ctx.ScriptLoader.preload`; ScriptLoader + RendererBoot storage-choice/preload contract; no backend boot. |
| a TLX guess modulepreloads the whole three vendor island at eval, three.core included (147–166) | 163–164, 165 | ScriptLoader + RendererBoot storage-choice/preload contract; no backend boot. |
| a speculative ScriptLoader.preload can mark fetchPriority low; an unmarked one keeps the default (#3549) (168–175) | 170, 171, 172–174 | `r.ctx.ScriptLoader.preload`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| load reports onSettled after each successful file (#3587 boot progress) (177–189) | 185, 187, 188 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| the resolved-pick load path does NOT deprioritise its gated preloads (#3549) (191–201) | 195, 196–197, 200 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| eval-time hunch guesses skip the TLX roster; sure guesses preload at default priority (#3549 / #3536) (203–213) | 205–206, 209, 210, 212 | ScriptLoader + RendererBoot storage-choice/preload contract; no backend boot. |
| a transient script onerror retries with cache-bust, then succeeds without a fourth inject (215–238) | 234, 235, 236, 237 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| three transient failures on one file settle the load as failed (240–256) | 253, 254, 255 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |

## tests/unit/script-loader-retry-eval.test.mjs

SHA-256: `3e64c29e264d347a301a32c63b3e737ee0a1bd1c3cd0d96de3fa7365f6294f81`. Complete read: 1–108.

Fixture / limit: rig 16–39 and inline rigs use microtask-delivered load/error; no fake script body actually evaluates. a.js and b.js are synthetic siblings; js/net/qr.js is used as an opaque URL (the real file is not executed). The recorded append count proves deduplication, not classic const evaluation itself.

Production: js/core/script-loader.js:102–251 create/load and shared evaluated/inflight caches.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| retry after a sibling failure does not re-inject a script that already evaluated (41–57) | 46, 49, 52, 55–56 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| a healthy retry after the failed sibling recovers still skips the evaluated file (59–86) | 81, 83, 84–85 | `ctx.ScriptLoader.create().load`, `ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| concurrent strict loads insert one classic script and both await it (88–108) | 104, 106, 107 | `ctx.ScriptLoader.create().load`, `ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |

## tests/unit/script-loader-starved.test.mjs

SHA-256: `599ea7d88608d4dda1f036b939504442395078bcf01264e11a78f6c7f8d1d833`. Complete read: 1–59.

Fixture / limit: rig 15–40 supplies virtual Date and timer map; stall runs each due timer once, then tests manually dispatch onload. monaco.js/hung.js are synthetic URLs. Checks responsive-time accounting, not a real stalled browser.

Production: js/core/script-loader.js:102–251 load/inject deadline heartbeat.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| a stall far past the deadline does not fail a file whose load event is queued (42–50) | 48, 49 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| a file that never loads still fails after the deadline of responsive time (52–59) | 57, 58 | `r.ctx.ScriptLoader.create().load`, `r.ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |

## tests/unit/script-loader-throw.test.mjs

SHA-256: `b89036ae1512da22a1d7d693dbdcaa3408f1604a00aefabbbb851bd0c81c0075`. Complete read: 1–138.

Fixture / limit: load 17–33 races completion against 500ms and microtask success tags. integrityLoad 54–80 simulates SRI by hashing published strings and invoking callbacks; audio.js is synthetic content. Hung-file rig captures slow/remove/log and real timers; pit-lane.js is a synthetic URL. No native browser SRI/network was exercised.

Production: js/core/script-loader.js:27–44 integrity; 102–251 load, injection, rejection and timeout handling.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| `prepareLazyLoad throwing settles the load as failed (strict=${strict})` (36–44) | 42, 43 | ScriptLoader tag lifecycle/result contract; simulated events/network. |
| a healthy prepareLazyLoad still loads everything (47–50) | 49 | ScriptLoader tag lifecycle/result contract; simulated events/network. |
| full SRI rejects new deployment bytes after a successful version check (82–89) | 84, 85, 86, 87, 88 | ScriptLoader tag lifecycle/result contract; simulated events/network. |
| matching bytes load and old shells without an integrity block stay compatible (91–94) | 92, 93 | ScriptLoader tag lifecycle/result contract; simulated events/network. |
| `invalid or missing full digest refuses injection: ${block}` (97–101) | 99, 100 | ScriptLoader tag lifecycle/result contract; simulated events/network. |
| an unrelated DOM element is not deployment integrity metadata (104–108) | 106, 107 | ScriptLoader tag lifecycle/result contract; simulated events/network. |
| a hung lazy file fails at the deadline after signalling slow (112–130) | 126, 127, 128, 129 | `ctx.ScriptLoader.create().load`, `ctx.ScriptLoader.create`; ScriptLoader tag lifecycle/result contract; simulated events/network. |
| a file that loads in time never fires slow or the deadline (132–138) | 135, 137 | ScriptLoader tag lifecycle/result contract; simulated events/network. |

## tests/unit/scroll-strips.test.mjs

SHA-256: `f53b5ee21013d66522d0783de15d7c4062c9d576d0dafa1bc84f7f026e9dfefa`. Complete read: 1–143.

Fixture / limit: blocks 58–68 removes comments and scans innermost CSS declaration blocks across css/*.css. Requires declaration presence, not the exact contain/pan-x values or CSS cascade validity; anti-vacuity checks the matcher finds at least four horizontal blocks. No real touch/iOS behavior.

Production: css/*.css innermost overflow declarations (dynamic directory census).

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| every horizontal scroll strip declares the whole pattern (70–97) | 91–96 | CSS declaration census; presence/static parsing only. |
| every vertical scroll region contains its own overscroll (113–128) | 123–127 | CSS declaration census; presence/static parsing only. |
| the strips are found at all — anti-vacuity (130–143) | 140–142 | CSS declaration census; presence/static parsing only. |

## tests/unit/season-cal.test.mjs

SHA-256: `9a690b1672f94da58416527ddb600f9deac76cab72c4c500c8e5538ef4a008d2`. Complete read: 1–1202.

Fixture / limit: load 46–86 runs actual SeasonCal plus real seeded Log/SaveMigrate with Map-backed store, key revisions and explicit foreign notifications. trackDefs 35–41 supplies eight current + three classic fake definitions; field 90–100 creates classified driver/team identities. realTracks 771–780 reads manifest circuit sources by regex; REAL_ORDER/SPRINTS are expected literals. Champion case additionally runs real results-sheet in a tiny hand-built DOM. Persistence is simulated, no native storage event, disk durability or full race.

Production: js/career/season-cal.js:63–77 normalize, 111–232 config/setup, 263–390 resume/load/save/progress, 394–461 format/pay, 463–518 award, 538–629 rankings/seed, 632–705 draws/presets/shuffle; js/ui/results-sheet.js; js/career/career.js; js/game.js; js/race/quali-model.js; tools/manifest.cjs and circuit sources.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| a fresh config is the built-in championship calendar (104–111) | 107, 108, 109, 110 | `SeasonCal.config`; SeasonCal + GameResults rank saved seats and emit accessible standings; tiny DOM. |
| normalise drops unknown ids, collapses duplicates and keeps order (113–117) | 116 | `SeasonCal.normalize`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| an empty or unusable calendar falls back rather than leaving zero rounds (119–124) | 121, 122, 123 | `SeasonCal.normalize`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| out-of-range format values fall back instead of shipping into a race (126–133) | 129, 130, 131, 132 | `SeasonCal.normalize`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| setConfig persists the NORMALISED config, not what it was handed (135–140) | 138, 139 | `SeasonCal.setConfig`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a foreign calendar write invalidates SeasonCal's own resolved cache (142–148) | 144, 147 | `SeasonCal.track`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| an active season keeps its saved rules when seasonCfg changes elsewhere (150–171) | 160, 161, 162, 163, 164, 168, 169, 170 | `SeasonCal.engage`, `SeasonCal.load`, `SeasonCal.track`, `SeasonCal.pointsTable`, `SeasonCal.sprintOn`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| load migrates a legacy season by snapshotting and persisting its current config (173–185) | 180, 181, 182, 183–184 | `SeasonCal.engage`, `SeasonCal.load`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a foreign season save conflicts before standings mutate or stale data writes (187–204) | 198, 199, 200, 201, 202, 203 | `SeasonCal.engage`, `SeasonCal.load`, `SeasonCal.conflicted`, `SeasonCal.award`, `SeasonCal.save`, `SeasonCal.clear`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a refused award clears last round's fastest-lap recipient, so the sheet paints no stale +FL (206–221) | 215, 218, 219, 220 | `SeasonCal.engage`, `SeasonCal.load`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| setup apply refuses a foreign season before changing active rules (223–236) | 231, 232, 233, 234, 235 | `SeasonCal.engage`, `SeasonCal.load`, `SeasonCal.applyConfig`, `SeasonCal.track`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| unchanged setup preserves the first qualifying grid without writing the save (238–255) | 247, 248, 249, 250, 251, 253, 254 | `SeasonCal.engage`, `SeasonCal.restart`, `SeasonCal.save`, `SeasonCal.applyConfig`, `SeasonCal.config`, `SeasonCal.hasProgress`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| unchanged setup preserves round and sprint progress, and session-only save status (257–273) | 267, 268, 269, 270, 271 | `SeasonCal.engage`, `SeasonCal.restart`, `SeasonCal.save`, `SeasonCal.applyConfig`, `SeasonCal.config`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| unchanged setup starts a new championship after every round is complete (275–292) | 281, 283, 284, 285, 286, 287, 288, 289, 290, 291 | `SeasonCal.engage`, `SeasonCal.restart`, `SeasonCal.save`, `SeasonCal.canRace`, `SeasonCal.applyConfig`, `SeasonCal.config`, `SeasonCal.trackIndex`; SeasonCal + GameResults rank saved seats and emit accessible standings; tiny DOM. |
| setup comparison uses saved rules, not mutable preferences, and compares every setup field (294–310) | 302, 305, 307, 308, 309 | `SeasonCal.engage`, `SeasonCal.restart`, `SeasonCal.save`, `SeasonCal.matchesConfig`, `SeasonCal.setConfig`, `SeasonCal.config`, `SeasonCal.applyConfig`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| unchanged setup still refuses a foreign save, then preserves the reloaded winner (312–325) | 319, 320, 321, 323, 324 | `SeasonCal.engage`, `SeasonCal.load`, `SeasonCal.applyConfig`, `SeasonCal.config`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| the calendar is the player's in season AND in gp, but never in career (329–341) | 333, 334, 339, 340 | `SeasonCal.engage`, `SeasonCal.rounds`, `SeasonCal.track`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| trackIndex is a Tracks.LIST index and a classic is a legal round (343–349) | 346, 347, 348 | `SeasonCal.engage`, `SeasonCal.trackIndex`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| format accessors are neutral outside a season, whatever the config holds (353–368) | 356, 357, 358, 359, 360, 361, 364, 365, 366, 367 | `SeasonCal.engage`, `SeasonCal.quali`, `SeasonCal.stage`, `SeasonCal.lapsFor`, `SeasonCal.formatLaps`, `SeasonCal.pointsTable`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a sprint is a third of the race distance, never shorter than two laps (370–376) | 373, 374, 375 | `SeasonCal.engage`, `SeasonCal.lapsFor`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a sprint scores its own table and does NOT advance the round (380–391) | 385, 386, 387, 388, 389, 390 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`, `SeasonCal.scored`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| the Grand Prix leg then scores the full table and closes the round (393–404) | 399, 400, 401, 402, 403 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a sprint weekend qualifies TWICE: SPRINT QUALIFYING, then again for the GP (FIA 2026 SR B2.2.1) (406–422) | 410, 411, 414, 415, 416, 417, 418, 420, 421 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.qualiNext`, `SeasonCal.qualiLabel`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a season with qualifying off never qualifies, sprint or not; outside a season the label is plain (424–433) | 428, 430, 432 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.qualiNext`, `SeasonCal.award`, `SeasonCal.qualiLabel`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a retirement scores nothing while the cars above keep their points (435–443) | 440, 441, 442 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| cars still running at the flag are classified by position, and may take the FL point (445–464) | 457, 458, 459, 460, 461, 462, 463 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| the sprint leg draws retirements on a different key from the Grand Prix (466–475) | 470–471, 474 | `SeasonCal.engage`, `SeasonCal.drawRound`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a no-qualifying sprint weekend no longer grids the GP off the sprint result (477–489) | 485, 486, 487, 488 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| resume repairs a partial save; finished stays; only past-calendar blanks (493–506) | 496, 499, 500, 501, 503, 504, 505 | `SeasonCal.engage`, `SeasonCal.resume`, `SeasonCal.blank`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a completed season is readable but cannot be scored again (508–516) | 512, 513, 514, 515 | `SeasonCal.engage`, `SeasonCal.resume`, `SeasonCal.canRace`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| resume rejects non-integer rounds and normalises score-map shapes (518–528) | 521, 522, 524, 525, 526, 527 | `SeasonCal.engage`, `SeasonCal.resume`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| an OLD mid-weekend save (sprint result as the GP grid) still loads, and its sprintOrder is dropped (530–542) | 536, 537, 538, 539, 541 | `SeasonCal.engage`, `SeasonCal.resume`, `SeasonCal.stage`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| an OLD mid-weekend save that qualified once keeps its order for the GP (no forced re-quali) (544–553) | 551, 552 | `SeasonCal.engage`, `SeasonCal.resume`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| resume keeps a mid-weekend stage, so a reload cannot re-pay a sprint (555–561) | 559, 560 | `SeasonCal.engage`, `SeasonCal.resume`, `SeasonCal.stage`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| STANDINGS is offered as soon as a sprint has paid, not only after a round (563–570) | 566, 567, 568, 569 | `SeasonCal.engage`, `SeasonCal.hasProgress`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| presets slice the championship, and CLASSICS is the retired list (574–580) | 576, 577, 578, 579 | `SeasonCal.presetIds`; SeasonCal + GameResults rank saved seats and emit accessible standings; tiny DOM. |
| shuffled returns a permutation and leaves its input alone (582–589) | 587, 588 | `SeasonCal.presetIds`, `SeasonCal.shuffled`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| shuffled is deterministic when given an explicit seed (591–599) | 597, 598 | `SeasonCal.presetIds`, `SeasonCal.shuffled`; Season model behavior plus source routing contracts where present; stub store/teams. |
| equal points fall to countback, not to who scored first (601–628) | 611, 612, 614, 616, 620, 621, 623, 627 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`, `SeasonCal.rank`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a saved season without finishes normalises to an empty map (630–641) | 637, 639, 640 | `SeasonCal.engage`, `SeasonCal.resume`, `SeasonCal.rank`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| the fastest-lap point pays +1 to a top-ten finisher only, and never on a sprint (645–666) | 650, 651, 653, 654, 655, 656, 662, 663, 665 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`, `sp.S.engage`, `sp.S.blank`, `sp.S.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| under the CLASSIC table the fastest-lap point pays only inside the scoring six (668–682) | 674, 677, 678, 680, 681 | `SeasonCal.engage`, `SeasonCal.pointsTable`, `SeasonCal.blank`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a retired fastest-lap setter earns nothing, and a career never pays the point (684–695) | 689, 690, 694 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a race nobody took the flag in pays the shortened-race scale by the leader's laps (FIA SR Art. 6.5/6.6) (697–714) | 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`, `SeasonCal.payTable`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| roundLaps: NEXT ROUND's distance is the format's laps clamped to the circuit's FULL; a sprint weekend's GP keeps its own (716–728) | 720, 721, 722, 727 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.roundLaps`, `sp.S.engage`, `sp.S.blank`, `sp.S.award`, `sp.S.roundLaps`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| DROP WORST 2 ranks on the best rounds — countback and the gross total are both kept (730–746) | 737, 738, 740, 741, 742, 743, 744, 745 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`, `SeasonCal.netPts`, `SeasonCal.rank`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| an old save without roundPts normalises to {} and a bad lastFl is dropped (748–758) | 752, 753, 754, 756, 757 | `SeasonCal.engage`, `SeasonCal.resume`, `SeasonCal.netPts`, `SeasonCal.normalize`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| 2026 REAL: every round is a shipped circuit, in calendar order, 23 rounds (781–793) | 783, 786, 787, 788, 791, 792 | `SeasonCal.presetIds`, `SeasonCal.REAL_2026.map`, `SeasonCal.REAL_2026.find`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| 2026 REAL: exactly the six real sprint weekends, per round (795–824) | 798, 799, 809, 811, 814, 815, 816, 817, 818, 819, 823 | `SeasonCal.preset`, `SeasonCal.setConfig`, `SeasonCal.engage`, `SeasonCal.restart`, `SeasonCal.rounds`, `SeasonCal.stage`, `SeasonCal.track`, `SeasonCal.award`, `SeasonCal.midWeekend`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| 2026 REAL leaves the other presets and old configs exactly as they were (826–850) | 828, 829–830, 831, 834, 835, 836, 838, 839, 845, 849 | `SeasonCal.PRESETS.map`, `SeasonCal.preset`, `SeasonCal.normalize`, `SeasonCal.setConfig`, `SeasonCal.engage`, `SeasonCal.restart`, `SeasonCal.stage`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| 2026 REAL survives a save/load round-trip, sprint rounds and all (852–872) | 857, 860, 861, 862, 867, 869, 870, 871 | `SeasonCal.engage`, `SeasonCal.applyConfig`, `SeasonCal.preset`, `T.engage`, `T.load`, `T.rounds`, `T.track`, `T.stage`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| the 2026 REAL calendar names its rounds as raced: Bahrain GP at Sepang, Barcelona-Catalunya GP (874–887) | 878, 880, 881, 882, 883, 885, 886 | `SeasonCal.engage`, `SeasonCal.applyConfig`, `SeasonCal.preset`, `SeasonCal.gpName`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a tab that left the championship cannot write its stale season over another tab's newer rounds (891–909) | 905, 906, 908 | `SeasonCal.engage`, `SeasonCal.load`, `SeasonCal.save`; SeasonCal + GameResults rank saved seats and emit accessible standings; tiny DOM. |
| load() never persists a season this build could not read whole (an unknown circuit id) (911–933) | 919, 921, 926, 927, 931, 932 | `a.S.engage`, `a.S.load`, `a.S.lastLoadLossy`, `b.S.engage`, `b.S.load`, `whole.S.engage`, `whole.S.load`, `whole.S.lastLoadLossy`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a season with an unknown circuit races the stored round's circuit and is never saved shrunk (935–963) | 943, 944, 946, 947, 952, 953, 956, 961, 962 | `a.S.engage`, `a.S.load`, `a.S.track`, `a.S.save`, `a.S.restart`, `whole.S.engage`, `whole.S.load`, `whole.S.save`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a calendar shrunk by an unknown circuit keeps roundPts aligned with the remapped round (965–979) | 975, 976, 978 | `a.S.engage`, `a.S.load`, `a.S.award`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| rankTeams: points, then the team's tier, then the id — one order for every constructors' table (981–993) | 984–985, 989, 990, 991, 992 | `SeasonCal.rankTeams`; Season model behavior plus source routing contracts where present; stub store/teams. |
| boot's migrate-and-save never writes back a season load() refused (game.js) (995–998) | 997 | Season model behavior plus source routing contracts where present; stub store/teams. |
| mid-weekend reads the season's own config: the title menu (flow gp) still says AFTER THE SPRINT (1000–1010) | 1004, 1005, 1007, 1009 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`, `SeasonCal.midWeekend`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| title-menu STANDINGS ranks on counting points: the season's own drop rule applies outside season flow (1012–1026) | 1024, 1025 | `SeasonCal.engage`, `SeasonCal.blank`, `SeasonCal.award`, `SeasonCal.netPts`, `SeasonCal.rank`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| constructors rank by points, then the team's countback, then tier, then id — one rule everywhere (1032–1051) | 1040–1041, 1042, 1043, 1046, 1047, 1050 | `SeasonCal.rankTeams`; Season model behavior plus source routing contracts where present; stub store/teams. |
| a standalone season stamps its own luck seed once, saves it, and a reload keeps it (1056–1083) | 1060, 1061, 1062, 1063, 1068, 1072, 1073, 1077, 1080, 1081, 1082 | `SeasonCal.engage`, `SeasonCal.restart`, `SeasonCal.luckSeed`, `again.S.engage`, `again.S.load`, `again.S.luckSeed`; Season model behavior plus source routing contracts where present; stub store/teams. |
| the champion is the season.pts leader even when that seat is no longer on the grid (1090–1121) | 1111, 1114, 1116, 1117, 1118, 1120 | `SeasonCal.engage`, `SeasonCal.blank`; SeasonCal + GameResults rank saved seats and emit accessible standings; tiny DOM. |
| repeated menu loads preserve unknown calendar ids and keep every lossy view unsavable (1123–1139) | 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138 | `SeasonCal.load`, `SeasonCal.engage`, `SeasonCal.track`, `SeasonCal.lastLoadLossy`, `SeasonCal.save`, `SeasonCal.restart`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| an all-unknown calendar cannot be saved when its fallback has the same length (1141–1152) | 1147, 1148, 1150, 1151 | `SeasonCal.load`, `SeasonCal.lastLoadLossy`, `SeasonCal.save`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| an empty saved calendar retains the existing lossy-read protection (1155–1163) | 1159, 1160, 1161, 1162 | `SeasonCal.load`, `SeasonCal.lastLoadLossy`, `SeasonCal.save`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| a season rebuilt blank because its round is out of range is NOT lossy (bug-hunt 1.6) (1169–1188) | 1178, 1179, 1180, 1186, 1187 | `SeasonCal.engage`, `SeasonCal.load`, `SeasonCal.lastLoadLossy`, `SeasonCal.save`, `bad.S.engage`, `bad.S.load`, `bad.S.lastLoadLossy`, `bad.S.save`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |
| netPts is bounded by the stored per-round row, not by season.round (bug-hunt 1.3) (1191–1202) | 1197, 1198, 1201 | `SeasonCal.engage`, `SeasonCal.netPts`; SeasonCal rules/save transition named in case; deterministic fixture state, no full race. |

## tests/unit/select-budget.test.mjs

SHA-256: `7efd6c6a0008ff6f3f6308f8ad33d1eb661ff68c69cb1e68edfa0e9286ce6512`. Complete read: 1–114.

Fixture / limit: Imports real capacity/declaredTests/constants; AST counts actual spec files and circuit/manifest rosters. The missing-spec fixture path is intentionally nonexistent. No CI workload or performance measurement; arithmetic and static count model only. Title about cutting failure cost is limited by actual assertions: no-retry improves capacity by >=3, while doubling budget still exceeds it.

Production: tools/ci/select-budget.mjs capacity/declaredTests/MEASURED/VARIANTS/SPEC_COUNTS; tools/ci/select-specs.mjs DEFAULT_BUDGET_MIN; tests/specs/* count fixtures.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| a failure costs timeout x (1 + retries) — the term the design omitted (18–21) | 19, 20 | CI selection capacity/static AST census; no measured job execution. |
| capacity falls as the number of survivable failures rises (23–27) | 25, 26 | CI selection capacity/static AST census; no measured job execution. |
| a budget smaller than one failure holds NOTHING, and says so (29–35) | 34 | CI selection capacity/static AST census; no measured job execution. |
| cutting the failure cost buys more than doubling the budget (37–47) | 42–43, 44–45, 46 | CI selection capacity/static AST census; no measured job execution. |
| declaredTests counts by AST, and rejects nothing silently (49–55) | 50, 52, 53–54 | CI selection capacity/static AST census; no measured job execution. |
| declaredTests expands statically resolvable for-of loops (per-circuit specs) (57–83) | 63, 70–71, 73–74, 75–76, 78, 80, 82 | CI selection capacity/static AST census; no measured job execution. |
| declaredTests expands the auditTracks() roster (terrain-over-road) (85–96) | 92, 94–95 | CI selection capacity/static AST census; no measured job execution. |
| the spec census is real — anti-vacuity (98–103) | 99, 100–102 | CI selection capacity/static AST census; no measured job execution. |
| per-GROUP selection does not fit, which is why the design changed (105–114) | 111–113 | CI selection capacity/static AST census; no measured job execution. |

## tests/unit/select-preview-defer.test.mjs

SHA-256: `649053c97bbd03febc3ec403c149d76792f1e7e1285fb1ea4e5a8538bb215481`. Complete read: 1–136.

Fixture / limit: boot 19–106 uses real Menus in mini-dom, one fake Monza, queued idle callbacks and TrackMaps counters; optional worker stub disabled by default. Tests observe synchronous/deferred call ordering and placeholder bitmap dimensions, not actual map pixels or latency.

Production: js/ui/select-screen.js:1099–1222 cache/size/paint/schedule, 1224–1307 updateTrackPreview.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| cold updateTrackPreview does not sync-call TrackMaps.corners or draw (108–119) | 112, 113, 114, 116, 118 | `menus.updateTrackPreview`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| cached TrackMaps paints maps synchronously (121–127) | 125, 126 | `menus.updateTrackPreview`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| idle flush runs the deferred map paint (129–136) | 132, 134, 135 | `menus.updateTrackPreview`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |

## tests/unit/select-screen-fixes.test.mjs

SHA-256: `ca6a2c9f14d9529bffc2051e83e8daee8fb2d5114350b018ba063c7e89b022c4`. Complete read: 1–211.

Fixture / limit: boot 27–87 uses real Menus, mini-dom, Map store, three synthetic circuit records and two synthetic teams; buildSetup/AppearanceOpts counters and TrackMaps stubs. Handlers are invoked directly, so native pointer/keyboard/canvas rendering is outside coverage. custom-test is an in-memory circuit id, not a missing source file.

Production: js/ui/select-screen.js:356–453 team picker, 504–620 favorites/filter, 722–961 tiles/buildSelect, 1224–1307 preview, 1310–1525 DRS/detail.

| Case name and full range | Assertion spans | Target and semantic meaning / limit |
|---|---|---|
| G3: tapping the ACTIVE team tile does not touch the seat or the stored driver (89–99) | 94, 95, 96, 97, 98 | `h.menus.setTeamPicker`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| G3: the LEGENDS tile re-tapped while active keeps the legend seat (101–106) | 105 | `h.menus.setTeamPicker`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| G3: picking ANOTHER team still takes the first free seat (108–115) | 112, 113, 114 | `h.menus.setTeamPicker`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| team selection reapplies TEAM appearance accents immediately (117–123) | 121, 122 | `h.menus.setTeamPicker`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| M3: unstarring the ACTIVE circuit under FAVOURITES keeps it selected and on the strip (125–137) | 128, 131, 133, 134, 135, 136 | `h.menus.openTrackDetail`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| M3: the pin ends when another circuit is picked (139–148) | 145, 147 | `h.menus.openTrackDetail`, `h.menus.buildSelect`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| M3: unstarring a circuit that is NOT active still filters as before (150–157) | 155, 156 | Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| CLASSICS filter refreshes the hero preview when the active circuit is hidden (159–166) | 161, 164, 165 | Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| `explicit ${filter} filter leaves a selected custom circuit` (169–185) | 174, 175, 178, 179, 181, 182, 183, 184 | `h.menus.buildSelect`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| DRS zone labels name an S/F wrap with arrow markers (188–204) | 195, 196, 198, 199, 202, 203 | `menus.drsZoneWraps`, `menus.drsZoneRangeHtml`, `h.menus.openTrackDetail`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |
| track detail names its map and elevation canvases for the selected circuit (206–211) | 209, 210 | `h.menus.openTrackDetail`; Menus selection/preview/detail behavior in mini-dom; no browser rendering. |

## Generated-case coverage

The throw-preparation template expands strict=false and strict=true; invalid digest template expands `{`, `{}`, a short sha256 value, and `[]`. The explicit-filter template expands season/classic/fav with their own expected selected indexes and visible tiles. All other loops are within their named cases: six landmark forms; nine facilities/eight non-overhead forms; repeated-count boundaries; both scenery sides and multiple terrain/crown/jitter/material variants; renderer storage decision matrices; season progress/format/remapping variants. These are distinct scenario observations within the full ranges, not additional undiscovered tests.

No execution verdict is implied. Fake filenames in loader fixtures are opaque simulated requests; the deliberately absent spec tests null handling. absSrc filenames identify evaluated real sources for VM diagnostics and do not cause a second source load.

## Target provenance

These hashes pin the directly named production/helper sources; full-file extents are reference bounds, not a claim that all production bodies were fully read. Production navigation used LSP and the test-directed definitions above.

| Path | File extent | SHA-256 |
|---|---|---|
| js/track/scenery/themes.js | 1–89 | `45ad1960354dc6adc4942974938e1f06333c5882101e3f0df98b82930373471a` |
| js/track/scenery/landmark-kit.js | 1–203 | `d4f237a767b9d3c47b96a990d401aa671d5c53664ba4c984190bdaca12bafb91` |
| js/track/scenery/circuit-kit.js | 1–432 | `9aa4b4ede7b0108098c03841ec032a7c0e0550f2e967baf3709ca3761b523279` |
| js/track/scenery/models.js | 1–803 | `eda48fc3a05ecc1c28eed487c07600184a013410939ffcb2755a3ec55f36743f` |
| js/track/scenery/venue.js | 1–140 | `aa2aaf640527467f02a8c60073d29f3dd9585b3624a5f82289362c6382870acd` |
| js/track/scenery/structures.js | 1–1130 | `28c1d77dcdef94fa5ae828dcf6ea7693cd9aca7878fc12c9320ac8e23942b8b5` |
| js/track/scenery/nature.js | 1–1626 | `1a7da353b988c273362b3121129df92b3e4e252dcdd313f8092b0405eeb19faf` |
| js/track/scenery/city.js | 1–930 | `cd54bb6492f48c13b28fb3939f1f6ce32af59a8fda12497f83f87a564e1843dc` |
| js/track/scenery/identity.js | 1–449 | `59794921b71390b85f70296aa2151ebd46687983e81237a6a6bcc59cd25f7ff0` |
| js/track/scenery/build-props.js | 1–2290 | `8b508e1c98ee00ab02a88acd6843371a6fa6c8414837eea86f775a5936eb785c` |
| js/circuits/scenery/interlagos.js | 1–1040 | `e09806dcdfb944923f75603651c5a9d2f5b8922cda7a3943120a387b633f152a` |
| js/editor/scenery-preview.js | 1–150 | `7d6baaac1595b3215c68ec7e331277b1a8af7f1338363f15bd1bc29a88f68097` |
| js/core/script-loader.js | 1–254 | `4fa6f897fc043cf45ffc0b564ac03d9b50a5510e7442289ddd0c0c02d4d22762` |
| js/render/renderer-boot.js | 1–533 | `558313586a3d86144929fa667f5cb608d8b5a43867852febcc332fa13d2757e6` |
| js/career/season-cal.js | 1–717 | `f7a455b7b37beeed3b796b8608569662ecbcabb157e5de342adf52de63b9163f` |
| js/ui/select-screen.js | 1–1540 | `ebefdf18b0a6f804f902f4d3737f02cf3bb7414d21d27efa419b91256b14c1ac` |
| js/ui/screen-looks.js | 1–648 | `880b30d23187894c37865f3a3b373b74253e0b805ecfde1ee5cacfdeb515fa16` |
| tools/ci/select-budget.mjs | 1–413 | `afedd02ebe93be26ba5b2b5fda37aff9dfcb00b32d04af7adc3c5179d9b74d2f` |
| tools/ci/select-specs.mjs | 1–1573 | `9484cda6a9a781373b6356c75075c7ccd3d46417a41b10717742cd9b9cca2cfd` |
| tests/helpers/editor-vm.mjs | 1–48 | `ebbdbb10a8e175aa4b957975fb659e60c782cd62a17aa849d77997db602106df` |
| tests/helpers/mini-dom.mjs | 1–186 | `3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1` |
| tests/helpers/seed-log.mjs | 1–35 | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| tests/helpers/seed-save-migrate.mjs | 1–31 | `01e258dd999942cd1633f79d6ef90b693c2b6529bf11d67ebf7160fd6c505295` |
| tests/helpers/abs-src.mjs | 1–8 | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| js/ui/results-sheet.js | 1–859 | `69bb166da8847b6fe21506fbf65ef1f7daf9d8ba613ef63f13f846ae3b12ebcc` |
| js/career/career.js | 1–2028 | `679d9052fa1682c8aacc4df35c35b9142676b78f34349c1853bce274eadd24f8` |
| js/game.js | 1–9554 | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| js/race/quali-model.js | 1–463 | `862483da27e204ea2224d9b408971948e4f0822d88f93cdb81e26f364b7cd205` |
