# Unit batch 52 — complete source map

Read-only source review of all 21 assigned files, 4,760 lines. Every assigned source line was returned in individually bounded reads of at most 100 lines and 10,000 characters; no source truncation. No test, browser, runtime edit or commit was performed. Source hashes below identify the reviewed bytes; case and assertion spans are one-based inclusive.

Code navigation followed `.claude/skills/code-nav/SKILL.md` after `AGENTS.md`. Shell apex-lsp provided outlines and file reference pages for the runtime symbols. Node tooling lives outside the runtime JS project: direct import declarations and exported-function source locations supply those edges; attempted bare-file outlines were rejected by the shell parser and are not claimed as LSP evidence.

## Runtime symbol and production usage evidence

| Symbol (LSP declaration/export location) | Production consumers confirmed by LSP refs --files |
|---|---|
| DataTelemetryModel `js/data/telemetry-model.js:2`; clipCar :9, cumDist :32, distAtT :60, timeAtDist :64, brakingDuel :84, locAt :156, dropStrays :202, locBounds :214, gapLimitMs :223, isGap :234 | telemetry controller (4), player/view (2 each), renderer (1), lazy bundles (1); module self refs (2) |
| DataTelemetryView `js/data/telemetry-view.js:2`, create :5 | controller and lazy bundles; module self refs |
| DataTelemetryRender / DataTelemetryPlayer `create` :5 in their respective files | model references above establish common wiring; direct VM load list and controller lifecycle test exercise concrete collaborators |
| TrackSurface `js/track/core/surface.js:3`, profile :34, heightAt :176 | profile refs: mesh (2), surface (2), build-client/build-props/tracks (1 each) |
| TrackMesh `js/track/core/mesh.js:2`, bankAngle :529, banking :556, buildRoad :676, buildTerrain :904 | Tracks.bankAngle references: game and agentview-corners plus tracks re-export; terrain mesh consumed through Tracks/VM |
| Tracks `js/track/tracks.js:3`, terrainY :788 | nature (7), agentview/flyby-seq/flyby-sight/lamp-bake/build-props/tracks (2 each), apex-track/Spa scenery/structures (1 each) |
| ThermalDrift `js/perf/thermal-drift.js:15`, drift :28 | governor (2) plus own declaration |
| RenderRate `js/perf/render-rate.js:21`, init :51, setMode :63, gate :95, dt :127 | game (10), governor (3), apex/phone-recorder (2 each), own file (2) |
| ThreeInspector `js/perf/three-inspector.js:8`, wanted :33, set :109, status :114 | apex (4), own file (2); selected declaration explicitly because two names exist |
| Input `js/input/input.js:4`; setThrottleLatch queried by member | setThrottleLatch: game (2), platform-session (1), own file (1) |
| TitleFlow `js/ui/title-flow.js:3`, create :5 | game (1), own file (2) |
| TitleFx `js/ui/title-fx.js:41`, onChange :66, choice :79, mode :86, setters :149–178, replay :203 | a11y-opts (7), setting-deps (6), appearance-studio/title-layout (5 each), game/hud-inputs/hud (3 each), experience/home-world/own (2 each) |
| TitleLayout `js/ui/title-layout.js:45` (dynamic return means outline reports 61 internals and no static exports) | appearance-studio (6), own declaration (1) |

Additional LSP usage pages: F1API is declared at `js/data/api.js:2` and used by live/real-race-tab (12 each), telemetry (11), results/hub/export/standings/schedule, apex and lazy bundles. PerfGov at `js/perf/governor.js:9` has 185 references across 29 files, led by game (46) and apex (35). ScreenLooks at `js/ui/screen-looks.js:40` has 24 references across appearance-studio/pause-opts/hud-layout/title-fx/title-layout/own file. AppearanceOpts and SettingRow pages explicitly report **text-match fallback** because their window exports are untyped: their telemetry-model and title-layout/title-fx edges are navigation hints, not checker-resolved identity proof. `GLX.texCensus` member lookup was refused because the facade has no checker-visible member; the test loads the real recording-mock backend and calls the member directly, so the map does not infer missing runtime functionality from that LSP limit.

Tooling import targets: `tools/ci/test-bg.mjs` procStart :115, aliveRun :128, outcome :170, outcomeOf :183, parseTestBgArgv :245, probeChromeSessions :502, chromeRefusal :509, docsOnlyWasteWarning :521; `tools/ci/test-coverage-audit.mjs` auditCoverage :24; `tools/gen/gen-test-groups.mjs` loadGroups :30, filesOnly :35, nodeFlags :41, commandFor :47; `tools/ci/run-node-group.mjs` nodeGroupPhases :12/runNodeGroup :24; `tools/ci/test-observed.mjs` reporterTitle :53/parseLiveReporterLine :59/titlesIn :71/observedTitles :168/audit :187. These are tooling/test-dependency edges, not browser runtime dependencies.

## tests/unit/telemetry-trace.test.mjs

SHA-256: `7e7c260a545eebb3e6080513685d08e42a0624cebb3085193b5cb792f23b0237`. Complete read: 1–652.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 18–29 shared VM; lap 92–100; driver/sweep 196–223; mini DOM/timers/RAF/observer/feed 421–505; API transport stubs 160–179,554–565,625–636; unit prefs 592–613 | DataTelemetryModel clipCar/cumDist/distAtT/timeAtDist/brakingDuel/locAt/dropStrays/locBounds/gapLimitMs/isGap; DataTelemetryRender.create; DataTelemetryPlayer.create; DataTelemetryView.create; DataTelemetry.create; F1API locationData/carData; AppearanceOpts | GPS bounds reject isolated strays yet retain real excursions; map breaks gaps and closes only complete boundary; own-lap clocks and unknown distance remain honest; mutable inverse domains refresh; popup colors/clipping/scrub/close/focus and speed units preserve canonical data. Inert canvas validates finite arguments and state, not pixels, layout, network reliability or actual playback scheduling. Three sample-count expansions: 8, 9, 801. Comment at 196 claims phase input, but helper has no phase parameter. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "comparison map closes only the lap boundary while preserving GPS gaps" | 31–67 | 65 |
| "braking duel aligns distance and refuses clamped or missing feed intervals" | 69–89 | 76 ×3, 77, 78, 79, 81, 83, 86 ×3, 88 |
| "a stray sample does not move the fitted bounds" | 102–109 | 106, 107 |
| "the lap's own extremities survive — only outliers go" | 111–118 | 114, 117 |
| "a real excursion is kept rather than truncated" | 120–126 | 125 |
| "too few samples to judge a distribution are passed through" | 128–135 | 130, 133, 134 |
| "coverage gaps are detected, ordinary cadence is not" | 137–148 | 140, 141, 146, 147 |
| "locBounds never returns a degenerate transform" | 150–156 | 153, 154 |
| "F1API.locationData drops origin rows and unparseable timestamps" | 160–184 | 181, 182, 183 |
| "the dot completes exactly one forward lap over the lap's duration" | 225–231 | 229, 230 |
| "the dot tracks the lap clock in real time, not just at the ends" | 233–243 | 241 |
| "comparison mode: each dot runs on its OWN lap length" | 245–259 | 251, 252, 257, 258 |
| "a driver with no GPS of their own rides the path on THEIR lap, not the other's" | 261–270 | 268–269 |
| "compare gaps stay at the reference finish while a slower lap keeps playing" | 272–308 | 294, 295, 296, 305, 306, 307 |
| "telemetry gauges preserve stable text, update rounded/null values and repair external edits" | 310–356 | 329, 330, 331, 334, 337, 340, 341, 342, 343, 344, 347, 348, 349, 352, 354, 355 |
| "integrated distance retains unknown intervals and legitimate stops" | 358–373 | 363, 364, 365, 366, 367, 368, 371, 372 |
| "distance inversion respects every finite-prefix boundary and complete-lap clamping" | 375–399 | 383, 384, 385, 386, 387, 388, 389, 390, 395, 396, 397, 398 |
| "distance inversion reads current arrays when a finite prefix is replaced or extended" | 401–416 | 405, 407, 409, 411, 413, 415 |
| `telemetry clipping, lane colors and playback teardown (${sampleCount} lap samples)` | 421–552 | 431, 486, 509, 516, 518, 520, 521, 523, 524, 528, 531, 537, 539, 544, 546, 548, 549, 550, 551 |
| "windowed telemetry retains the lap clock and refuses unequal leading/trailing distance coverage" | 554–590 | 567, 568, 570, 583, 586, 588 |
| "telemetry uses speed preferences in channels, gauges, axis and summary without changing canonical data" | 592–623 | 614, 615, 616, 617, 619, 620, 621 ×2 |
| "normal sub-sample boundary skew uses observed bracketing rows while a leading outage stays unknown" | 625–652 | 638, 639, 641, 642, 644 ×2, 645, 646, 648, 649 |

## tests/unit/telemetry-view-resize.test.mjs

SHA-256: `1921964b5a950f87b6194cd9000776b7056a8102a4f3540677ecd96268bf93bf`. Complete read: 1–124.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 13–25 synthetic driver; 28–97 mini DOM with fake canvas boxes, ratio/zoom, manual ResizeObserver/RAF and F1API | DataTelemetryView.create via DataTelemetry.create/loadTelemetry and popup creation | Ratio-only DPR 1→1.5 at zoom 2 must refit chart AND map buffers from ratio 2→3. Source describes shared-ratio overwrite regression. No real ResizeObserver/browser resizing or visual sharpness evidence. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "a DPR change under unchanged boxes refits the map canvas as well as the chart" | 27–124 | 107, 109, 110, 112, 118, 122, 123 |

## tests/unit/terrain-falloff.test.mjs

SHA-256: `c589613de448d61c648bc91e9779f7c6a8b541060e957486f7924046a5436347`. Complete read: 1–92.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 5–13 real buildContext, Spa raw def and legacy/30m profiles; 25–28 fabricated pit keep/depth; 82–86 Madrid | TrackDef.fromRaw; Tracks.buildCenterline; TrackSurface.profile; TrackMesh.buildTerrain | Shelf/rails/floor and near-road vertex positions remain equal; high ground drops monotonically and smoothly; invalid opt-in falls back; Madrid is below road with near-flat runoff and drop restored by 30m. Sparse node/distance sampling and thresholds are geometry evidence, not visible shading. Historical migrated browser spec is described in comments, not a current dependency. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "gradual terrain preserves the road shelf and rails" | 15–22 | 16, 20, 21 |
| "the pit-side shelf remains level to the complex boundary" | 24–35 | 32, 33 |
| "high terrain distributes its drop and joins the floor smoothly" | 37–51 | 41, 42, 43, 47, 50 |
| "invalid or absent falloff retains the legacy profile and definition shape" | 53–62 | 56, 60 |
| "the opt-in keeps actual banked near-road terrain positions unchanged" | 64–75 | 73 |
| "Madrid terrain drops away from the road instead of forming a raised floor" | 81–92 | 87, 88, 89, 90, 91 |

## tests/unit/terrain-normals.test.mjs

SHA-256: `dbea3e2351d31c1c4584194ec2acadf5d9a61b6e33b1f8550a8f2676c544f6e3`. Complete read: 1–196.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 25–64 cached real engine builds/stats for Monaco/Silverstone; 101–135 banked-vs-unbanked face-normal comparator for Zandvoort/Madrid/Indianapolis | TrackMesh.buildTerrain/buildRoad; Tracks.banking/bankAngle; js/game.js bank-grip source | Unit/up normals and tilt distribution catch constant-up shading; bank adds <4° worst/<0.5° mean error with >100 premise vertices; every Zandvoort fractional node roll agrees; body/source pins prevent duplicate banking/grip lookups. Face comparison excludes edge lines/end nodes; sampled circuits and regex pins cannot prove rendered lighting or measured hot-path cost. Comments retain dated timings/counts as rationale. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| `${id}: terrain normals are unit length and point up` | 67–75 | 71, 74 |
| `${id}: terrain normals follow the ribbon's shape, not a constant up-vector` | 77–87 | 83–84, 85–86 |
| `${id}: banked road vertex normals follow the bank` | 138–143 | 140, 141, 142 |
| "Tracks.bankAngle is banking()'s roll at every node (zandvoort)" | 149–162 | 160, 161 |
| "Tracks.bankAngle does not call banking() (AI look hot path)" | 169–184 | 174, 175, 181 |
| "updateCar bank grip does not re-read bankAngle" | 189–196 | 192, 194, 195 |

Shared helper assertion calls outside case bodies: 45, 49. These apply whenever their helper is reached.

## tests/unit/terrain-y.test.mjs

SHA-256: `4b4533a272f64166d3ba4c9ccdc664ce18dd69dc726ed5f03c49badde7cde92e`. Complete read: 1–130.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 14–20 real track-build VM and quad/merge helpers; 76–102 deterministic seed-7 random mesh with 20,000 probes; 119–129 CPU ribbon conversion fixture | Tracks.terrainY and dropRibbonCpuIfReady; internal terrain grid/floor | Real meter-scale gaps stay null, 5mm cracks tolerate slack but 5cm gaps do not; shared/grid max/negative edges and slopes interpolate; grid floor bounds returned values including steep extrapolation; typed ribbons preserve samples. Random hit-count premise >15k; synthetic geometry does not exercise entire circuit or GPU upload. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "a 1 m gap between two 100 m rectangles is not terrain" | 22–27 | 24, 25, 26 |
| "the gap stays a gap at other scales" | 29–34 | 32 |
| "a shared edge stays covered" | 36–39 | 38 |
| "a float-sized crack (5 mm) is covered, a 5 cm gap is not" | 44–49 | 46, 48 |
| "exact maximum grid edges are covered; just beyond is not" | 51–55 | 53, 54 |
| "negative coordinates and non-cell-aligned extents" | 57–64 | 59, 60, 62, 63 |
| "a point inside a sloped triangle interpolates height" | 66–70 | 68, 69 |
| "terrainGrid's per-cell floor lies under every terrainY answer" | 75–103 | 99, 102 |
| "the floor covers a lone steep triangle's extrapolation past its lowest corner" | 108–113 | 111, 112 |
| "dropRibbonCpuIfReady types a main-thread build's ribbon pos/idx" | 118–130 | 124, 126, 127, 129 |

## tests/unit/test-bg-outcome.test.mjs

SHA-256: `e786707e319d21d80a6c8a7dfac6ae61c573b8cfa2fbefdc2e54a62453617de9`. Complete read: 1–175.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 18 direct tooling imports; synthetic log strings 28–60; current process identity 68–82; real Linux zombie subprocess 93–119; injected tmux/chrome sessions 126–137; Python import with stubbed edges 141–159 | tools/ci/test-bg.mjs procStart/aliveRun/outcome/outcomeOf/parseTestBgArgv/probeChromeSessions/chromeRefusal; tools/mcp/probe-mcp.py cmd_chrome_start | Nonzero exit and unfinished later browser halves trump earlier passes; pid/start/boot/zombie identity controls liveness; mutual browser exclusion occurs before supersede; CLI rejects malformed arguments. Missing-log absolute paths are intentionally nonexistent fixtures. Linux /proc, shell/sleep and Python required by specific tests; no actual Playwright group or MCP daemon is launched. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "parseTestBgArgv reads --timeout and --timeout=N as minutes" | 20–25 | 21, 22, 23, 24 |
| "a non-zero exit wins over an earlier passing summary" | 27–32 | 29, 31 |
| "exit 0 keeps the rich summary; the old formats still read" | 34–40 | 35, 36, 37, 38, 39 |
| "a stopped browser half never inherits its VM twin's passing TAP verdict" | 42–54 | 47, 48, 49, 50, 51, 52–53 |
| "a later browser shard must finish after an earlier browser pass" | 56–61 | 59, 60 |
| "a recycled pid is not the run: liveness needs the recorded start time and boot id" | 63–83 | 70, 71, 72, 73–74, 75, 76, 77, 81, 82 |
| "a zombie supervisor is not a live run (#1921)" | 86–120 | 101, 105, 107, 108, 109, 110, 117, 118, 119 |
| "test-bg refuses a browser group while the MCP Chrome daemon is live (box-wide, --force overrides)" | 125–138 | 127, 128, 129, 130, 131, 132, 136–137 |
| "probe-mcp chrome-start refuses while a Playwright run is live in this checkout" | 140–165 | 160, 161, 162, 163, 164 |
| "parseTestBgArgv: --spec runs one spec as a pseudo-group, --workers is read, an unknown flag throws (audit3 T8)" | 167–175 | 169, 170, 171, 172, 173, 174 |

## tests/unit/test-bg-waste.test.mjs

SHA-256: `c084fd9c806c1e5adcf34513f4f8046c498354e6defcbf54efd178a62d00cfa1`. Complete read: 1–58.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 12–17 synthetic npm script table; changed-path lists and force flag in each case | tools/ci/test-bg.mjs docsOnlyWasteWarning | Exact advisory WASTE output for docs-only browser groups; multiple groups named and force silences; code/no-change/nonbrowser groups produce null. Synthetic skill path in changed list is a classification string, not a repository dependency. This tests warning logic, not CLI integration/start refusal. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "docs-only + browser group → WASTE line naming the group" | 19–30 | 26–29 |
| "multiple browser groups are listed; --force silences" | 32–43 | 39, 40–42 |
| "code diff or non-browser group → no WASTE" | 45–58 | 46–48, 49–51, 52–54, 55–57 |

## tests/unit/test-coverage-audit.test.mjs

SHA-256: `e549245384459ce615ae2bb5fc9957d3000e2d4244cace2c11fe752a1d684bb5`. Complete read: 1–74.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 33 ROOT; 36–50 synthetic names/scripts; 59–68 current package and tests root/specs/unit directory scans | tools/ci/test-coverage-audit.mjs auditCoverage; package.json scripts; tests/groups.json source referenced in remedy | Project-wide discovery does not count as topical coverage; explicit Node/Playwright paths do; real repository >100 scan premise and zero orphans closes synthetic-only guard gap. Fake alpha/worker names are inputs only. Flat scans and basename matching follow audit contract; grouping quality and assertion coverage remain outside scope. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "project-wide scripts do not count as topical coverage" | 35–41 | 40 |
| "explicit Playwright and Node test files count as named coverage" | 43–52 | 51 |
| "every test file in THIS repo belongs to a topical test:* group" | 54–74 | 66, 69–73 |

## tests/unit/test-groups-generated.test.mjs

SHA-256: `9bbee2c20a787d07c7827367672f1f30b85669a77f3b45b0156103655cdba3f7`. Complete read: 1–178.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 20–22 current package/loadGroups; 86–97 fake phase definitions; 100–122 disposable artifacts/tmp runner/test-file generator with cleanup; 127–129 rendezvous marker bodies | tools/gen/gen-test-groups.mjs loadGroups/commandFor/filesOnly/nodeFlags; tools/ci/run-node-group.mjs nodeGroupPhases/runNodeGroup; tools/ci/tooling-fast.mjs TOOLING_FAST_FILES | Generated package/runtime roster drift, empty/missing Node paths, notes filtering and isolated benchmark coverage pinned. Disposable child Node phases check forwarded filters, serial benchmarks, ordinary concurrency, failure/signal stop and invalid-argument preflight. Fixture-generated selected/excluded contract tests at 108–109 and intentional throw in unlisted fixture 143 are child workload, not extra top-level cases. No browser is invoked; process timing/rendezvous can depend on loaded host. Historical removed backend location is comment rationale only. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "package.json and the tooling-fast list match tests/groups.json" | 24–30 | 26, 28, 29 |
| "every test:* script is a group, and every group is a script" | 32–36 | 34–35 |
| "each group's command is the one its definition renders" | 38–42 | 40 |
| "no group is left naming nothing" | 44–57 | 56 |
| "every file a group names exists on disk" | 59–68 | 67 |
| "toolingFast notes are comments, and the exported array is files only" | 70–78 | 72, 73–74, 76 |
| "shared benchmark policy generates wrappers only for affected Node groups and retains coverage rosters" | 80–98 | 81, 85, 88–91, 92, 93, 94, 95, 96, 97 |
| "generated Node phases forward npm filters everywhere, isolate both benchmarks, and preserve ordinary parallelism" | 124–139 | 133, 135, 136, 137, 138 |
| "isolated-only groups never discover unrelated tests and a failed benchmark prevents the ordinary pool" | 141–152 | 145, 146, 150, 151 |
| "interrupting a Node group forwards the signal and prevents later phases" | 154–167 | 163, 165, 166 |
| "isolated group wrappers refuse extra paths and separate option values before any phase starts" | 169–178 | 174, 175, 176 |

## tests/unit/test-groups.test.mjs

SHA-256: `b66722eea71b3caef749f53cb16f006c8d18e26092bfa1888c105f453acc40f4`. Complete read: 1–460.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 23–34 real package/group list and META exclusions; section helper 119–124; render/headless synthetic scanner 295–313; Playwright own createFileMatcher and config subprocesses 388–459 | tools/ci/pick-tests.mjs RULES; package.json; tests/groups.json; playwright.config.js; docs/TESTING.md and docs/TESTING-COVERAGE.md | Mechanical taxonomy: routes exist, dirs route, dedicated specs retain group, topics disjoint, docs/count floors/guards align, manual and opt-in WebKit discovery honors project precedence, screenshot captures classified render, pinned projects cannot exclude named specs, no duplicates. The directory probe and definitely-not-render inputs are deliberately fabricated. Screenshot/source regexes and documented lists are not semantic render detection or good-grouping judgment. Own matcher/config imports launch no browser. Explicit anti-vacuity and dormant-project rationale prevent empty success. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "every group tools/ci/pick-tests.mjs routes to exists in package.json" | 36–43 | 41–42 |
| "test:tooling-fast is the sequential runner (not a parallel node --test dump)" | 45–50 | 46–47, 48–49 |
| "pick-tests routes every source directory somewhere" | 52–66 | 64–65 |
| "a js/game file with its own browser spec routes to that spec's group" | 68–86 | 81, 84 |
| "the topical browser groups are a DISJOINT partition of the specs" | 88–115 | 113, 114 |
| "docs/TESTING.md documents every test group, and no group that is gone" | 126–134 | 132, 133 |
| "docs/TESTING-COVERAGE.md names every root spec and unit suite" | 136–151 | 139, 140, 149–150 |
| "docs/TESTING.md's file-count floors never exceed the files on disk" | 153–170 | 166, 167 |
| "the guards row's count is the size of the guards group" | 172–183 | 180, 181–182 |
| "the manual suites stay out of default discovery" | 185–199 | 193–194, 195–196, 197–198 |
| "RENDER_SPECS / XR_SPECS partition root specs — every named project entry exists" | 201–224 | 207, 208, 216–217, 218, 219, 220, 221, 222–223 |
| "a spec that CAPTURES an image is in RENDER_SPECS" | 226–274 | 253, 268–269, 271–273 |
| "no test:* group pins a --project that excludes one of the specs it names" | 276–346 | 288, 310, 311, 312, 313, 338–340, 344–345 |
| "no test group names the same spec file twice" | 362–380 | 379 |
| "Playwright collects tests/specs/*.spec.js by default — no unit file, no manual suite" | 382–460 | 409, 416–417, 418, 419–420, 446, 448, 456, 457, 459 |

Shared helper assertion calls outside case bodies: 121. These apply whenever their helper is reached.

## tests/unit/test-observed.test.mjs

SHA-256: `981d48e7830423afe0dcad953c282a1900711a6171709282a0c1bb8932a488e4`. Complete read: 1–152.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 24 ROOT; synthetic source and reporter strings 26–109; real audit/spec read 111–141; optional current local logs 144–152 | tools/ci/test-observed.mjs titlesIn/audit/observedTitles/parseLiveReporterLine/reporterTitle | Title extraction handles implicit/nested/shared/dynamic/skipped cases, regex escaping and GHA reporter prefixes. Real suite parses, >500 declared premise, real smoke titles round-trip without logs; local-log compatibility explicitly skips without current-spec results. Test title at 118 says log matching but body only checks real declarations; later tests own matching. Synthetic fixture import path is inert source text. Observed does not establish passing/correct behavior. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "a top-level test carries its testDir-relative path as an implicit suite" | 26–30 | 29 |
| "a test inside a describe does NOT get the implicit suite" | 32–36 | 35 |
| "nested describes nest, and each test is emitted once" | 38–48 | 44–47 |
| "sharedTest declarations are counted like test declarations" | 50–56 | 55 |
| "a loop-generated title becomes a PATTERN, not a dropped declaration" | 58–70 | 65, 66, 67, 69 |
| "regex metacharacters in a template's literal chunks are escaped" | 72–80 | 78, 79 |
| "parseLiveReporterLine matches live-reporter and strips a GHA log prefix" | 82–89 | 86, 87, 88 |
| "reporterTitle matches live-reporter for nested describes" | 91–101 | 95, 99, 100 |
| "skipped tests are declared but not counted as unobserved" | 103–109 | 108 |
| "every spec in the repo parses" | 111–116 | 115 |
| "the audit finds real tests, and its titles match real log lines" | 118–127 | 124, 126 |
| "a live-reporter result line for a declared title round-trips to that title (no logs needed)" | 129–142 | 134, 139, 140 |
| "when local Playwright logs exist, observed titles match declared ones" | 144–152 | 149–151 |

## tests/unit/tex-census.test.mjs

SHA-256: `f97a09b131a1f9229d48cdc18ad98c104691b47dd4d6c586da29ce4d341eaf4c`. Complete read: 1–165.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 29 bootGlx recording mock; 35–42 independent exact mip sum; image dimensions only; 134–147 extracted production installWrap with mock WebGL2 methods | GLX.texCensus/createTexture/createTextureArray/freeTexture and context-loss path; tools/gfx/gpu-mem-census.mjs installWrap | Empty explicit zero/exclusions, exact nonsquare chain, 22-atlas ~147MiB arithmetic, arrays/kinds, freeing/context loss and 2D/3D allocation bookkeeping. Counts resident ledger allocations under recording mock, not real race residency, driver overhead, VRAM or GPU validation. Wrapper extraction depends on textual function/main delimiters. Dated plan references are historical rationale. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "an empty census reports zero, not undefined" | 46–57 | 49, 50, 51, 52, 55–56 |
| "a 2D texture is counted at its exact mip-chain size" | 59–69 | 63, 64, 68 |
| "the census reproduces the livery arithmetic the plan opens with" | 71–81 | 75, 80 |
| "a texture array counts every layer" | 83–91 | 88, 89, 90 |
| "freeing a texture removes its bytes — the census is RESIDENT, not cumulative" | 93–106 | 98, 101, 102, 105 |
| "kinds are separated, so the livery share is readable off the census" | 108–117 | 114, 115–116 |
| "a lost context does not leave stale bytes on the books" | 119–130 | 122, 128, 129 |
| 'GPU allocation wrapper preserves array layers while mipmapping true 3D depth and 2D sizes' | 133–165 | 157, 159, 164 |

## tests/unit/thermal-drift.test.mjs

SHA-256: `3aaf94b9bf8f77c5f536dbeddc40ce01787b6ea275f33a39863e3150a991bd3f`. Complete read: 1–212.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 18–27 log/store globals and eval real sources; 30–39 synthetic time/jitter; 113–119 storage-backed render-rate tier; 165–177 mocked mobile gfx scale/governor | ThermalDrift.drift; RenderRate.init/gate/dt/setMode/state; PerfGov.init/setThermalDrift/tick/thermalDrift | Steady/hitch/recovery/budget and elapsed-without-cost drift windows; 60/45/30 counts, 120Hz, accumulated camera dt, menu/XR/warmup exemption and invalid modes; governor default/off versus early existing scale rung. Synthetic time series and exact ticks cannot show real thermal/GPU savings, actual physics invariance or camera presentation; header delegates physics evidence elsewhere. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "steady frames never ask for a step, however long" | 41–48 | 45, 46, 47 |
| "thermal windows use active elapsed time while skipped callbacks supply no cost sample" | 50–64 | 54, 55, 56, 60, 61, 63 |
| "a slow upward drift is flagged after the baseline minute, before any hitch" | 66–76 | 72, 73, 74, 75 |
| "a single 10 s hitch window is not drift" | 78–83 | 82 |
| "stepped() re-baselines on the cheaper state and waits a cooldown; recovery stays quiet" | 85–98 | 90, 92, 93, 96, 97 |
| "a step budget caps the detector (the ladder is finite)" | 100–110 | 109 |
| "RenderRate tier: draws per 60 physics ticks are exactly 60 / 45 / 30, no frame carries more than render's clamp" | 121–129 | 126, 127 |
| "RenderRate tier: skipped time is handed to the next drawn frame (camera damping stays on the wall clock)" | 131–137 | 136 |
| "RenderRate tier: a 120 Hz display still lands on the chosen rate; off-race, XR and the first 90 race frames always draw" | 139–152 | 143, 145, 147, 151 |
| "RenderRate tier: setMode switches at run time and refuses an unknown mode" | 154–162 | 156, 157, 158, 159, 160, 161 |
| "governor: drift off (default) never moves the scale on a vsync-bound steady device" | 180–185 | 183, 184 |
| "governor: drift on, steady device -> no step" | 187–191 | 190 |
| "governor thermal baseline includes skipped elapsed intervals without judging their cost" | 193–202 | 198, 199, 200 |
| "governor: drift on takes an EXISTING rung early on a slow drift, off does not" | 204–212 | 208, 209, 210, 211 |

## tests/unit/three-inspector.test.mjs

SHA-256: `48cde7636c3813e1958fe176bcbe6a74bdad5011c04ef67590b4bf3ca6cd3162`. Complete read: 1–227.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 13 real vendored WebGPURenderer/InspectorBase; 41–58 VM with injected async import; 94–128 fake DOM/host/timer hold and Inspector subclass using real renderer setter | ThreeInspector.wanted/set/status/stop; TLX inspectorHost hold; agent hook/help/manifest; vendor manifest | Hashes/license/core-only assets, no eager delivery, host/automation/storage/URL defaults, unsupported reasons; ownership/timestamp/timer holds restore through close/fail/replace/backend switch and stale async results. Fake backend and injected module boundary do not render inspector panel/GPU timers or prove live backend availability. Distinct local variable also named ThreeInspector makes LSP name ambiguous; declaration at perf module line 8 selected. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "inspector files are vendored, hash-pinned, and licensed (core only, no extensions)" | 18–28 | 21, 22, 25, 27 |
| "nothing ships the inspector eagerly: sw.js, index.html preloads, ApexRoster.DEFERRED" | 30–39 | 31, 34, 36, 37, 38 |
| "host matrix: dev hosts default ON, deployed site and automation OFF, URL and storage override" | 60–73 | 62, 63, 64, 65, 66, 67, 68, 69, 70, 72 |
| "off by default under automation and on a backend without a three renderer: no import, clear reason" | 75–82 | 77, 79, 80, 81 |
| "hook is wired: tlx holds gpuTimer off for the inspector; apex + help + docs name inspector()" | 84–92 | 86, 87, 88, 89, 90, 91 |
| "closing the inspector restores the actual r186 InspectorBase and timestamp state" | 130–153 | 136, 137, 142, 143, 144, 145, 146, 147, 150, 151 |
| "initialization failures return renderer ownership and release the timer hold" | 155–166 | 160, 161, 162, 163, 164 |
| "teardown preserves an inspector installed by a later owner" | 168–181 | 176, 177, 178, 179, 180 |
| "switching renderer or unsupported backend detaches the previous panel" | 183–198 | 189, 190, 191, 193, 194, 195, 196, 197 |
| "an import resolving after close cannot reattach or claim a timer hold" | 200–212 | 208, 209, 210, 211 |
| "a stale import rejection cannot overwrite a newer attached inspector" | 214–227 | 223, 224, 225 |

## tests/unit/three-shared-binding-update.test.mjs

SHA-256: `d91e62cdb75bbced7865104cff2a056543228b6b33bce471c761ef826cbfd383`. Complete read: 1–79.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 5–28 parses actual minified vendor classes/methods with Acorn + eslint-scope free-reference adapters; 30–65 synthetic 12-binding, 400-call backend/nodes/texture/attribute traces | vendor three.webgpu.min.js Bindings._update and Nodes.updateGroup extracted by structural methods | Fourteen scenarios compare all side-effect traces with shared skip cache disabled/enabled: version/object/mixed/replacement/node/cache/flag/empty/exception changes. Exact lookup/visit counts pin shared gate speed work, not wall time/GPU behavior. Unrelated uniform diff helper stub always true, no NodeUniformBuffer fixture. Minifier-local discovery avoids unstable names but depends on method structure. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| 'production shared group gate preserves all binding side effects and reduces repeated lookups' | 66–79 | 70, 72 ×2, 73, 74, 75, 76, 77 |

## tests/unit/throttle-latch.test.mjs

SHA-256: `620212c0dfbd57b933f91ba8063fdf68d49d1fc8e8752477444caf183a48b542`. Complete read: 1–442.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 30–84 real Input VM plus retained per-ID DOM/event listeners/clock; 88–105 real pad-menu with synthetic pad/pause; tapActions 302–305; 423–431 extracted enableTilt snippet with generation/timers | Input poll/throttle/hold modes/capture/edges/semantic actions; InputPadMenu; js/game.js enableTilt/inputOf; bindings reserved keys; lobby tilt handlers | Menu/capture ownership consumes gamepad toggle edges; poll caches layer gate; HOLD/LATCH full-travel reset/blur/multitouch and ARIA/class feedback; source hunt pins; mirror edges, pointer vs semantic click dedupe, disabled/native keys and release bookkeeping; 1.5s gyro fallback belongs only to current silent request. Generated native-button family expands four IDs. Fake UA events and capture do not prove actual browser default activation, gamepad hardware, permissions or motion sensors. Header accessibility rationale references XAG 107. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "gamepad A on RESUME cannot arm GAS TOGGLE, including a confirm held into the resumed frame" | 108–125 | 113, 114, 117, 120, 121, 123 |
| "button and axis capture consume driving toggle edges even when their callback ends capture" | 127–144 | 137, 139, 140, 142 |
| "gamepad driving toggles still latch on fresh presses and release on the second press" | 146–156 | 152, 153, 154 |
| "the on-screen pedal's menu gate is read once per poll(), not once per pedal read (PERF-HUNT-2 S5)" | 158–176 | 163, 165, 169, 170, 171, 173, 174 |
| "HOLD is unchanged: the pedal follows the thumb" | 178–185 | 181, 183, 184 |
| "LATCH: a tap sticks, a second tap lifts" | 187–196 | 191, 192, 194, 195 |
| "LATCH is FULL travel, not the pedal's last modulation" | 198–206 | 204, 205 |
| "a latch drops on blur and on reset — it never outlives the window" | 208–218 | 213, 215, 216 |
| "leaving LATCH mode clears a live latch" | 220–227 | 225, 226 |
| "the pedal SHOWS the latch: :active follows the thumb, .on outlives it" | 229–240 | 232, 234, 235, 237, 239 |
| "the LAST FINGER LIFTING keeps the latch (touchend has touches.length 0 on every lift)" | 242–254 | 246, 248, 249, 251, 253 |
| "LATCH: a second finger landing on GAS does not cancel the latch while the first is down" | 256–270 | 260, 262, 265, 266, 269 |
| "input hunt fixes: pad steer gated under a menu, rotation keeps the tilt zero, Ctrl/Alt reserved, lobby asks for tilt" | 272–288 | 277, 279, 281, 284, 287 |
| "a MIRROR press on the grid does not survive clearDriveEdges (it would toggle the mirror at lights-out)" | 290–299 | 295, 297, 298 |
| "HUD tap actions accept semantic clicks and keep pointer presses immediate without firing twice" | 307–334 | 311, 314, 317, 321, 325, 328, 332 |
| "HUD tap actions honor native and announced disabled states for both activation paths" | 336–350 | 344, 348 |
| "Enter and Space on a HUD tap button activate its click without also reaching BOOST" | 352–371 | 363, 364, 365, 367, 368, 369 |
| "a driving key released after focus moves into a HUD tap button clears its held latch" | 373–383 | 378, 382 |
| id + " leaves native activation keys to the button and preserves movement releases" | 386–417 | 401, 402, 403, 405, 407, 409, 413, 415, 416 |
| "a silent gyro falls back after 1.5s only while its permission attempt still owns tilt" | 421–442 | 433, 434, 439, 440 |

## tests/unit/title-art.test.mjs

SHA-256: `e4f260291edbad71079239720e28dae688ca9f5aecaf0f53d3a5740eb1965c7d`. Complete read: 1–171.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 18–25 generated shell block and aggregate CSS source; geometry/path/group/gradient scans; responsive media query 152–161 | tools/gen/title-art.mjs generated index.html title-art block; css/menus.css and css/responsive.css | Closed or explicitly unfilled paths; >500 geometry points, >90% inside 1400×900 and feet inside; opacity/trail specificity, one drawing/tall bands, gradients/aspect/reveal order and tablet-only nudge. Static string/regex/coordinate approximation cannot establish actual SVG appearance; group-level open detection can allow an open path if another fill-none path shares split segment. No pixel signoff. Historical second drawing only described. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "the art lives in a generated block" | 27–31 | 28–29, 30 |
| "every path is closed or explicitly fill:none" | 33–46 | 42–43 |
| "the placed art lands inside its own viewBox" | 48–68 | 62, 65, 67 |
| "the fade rides on stroke-opacity, never on the group" | 70–75 | 73–74 |
| "the trail colour comes from a CSS rule, not a presentation attribute" | 77–88 | 82, 83–84, 86–87 |
| "one drawing serves every shape, laid out per shape" | 90–102 | 96–97, 98–99, 101 |
| "every gradient the art references is defined" | 104–109 | 107 |
| "the box carries the viewBox's own aspect" | 111–117 | 115–116 |
| "every art group carries its reveal stage and order" | 119–146 | 126, 131, 132, 135, 136, 137, 141, 144 |
| "the tablet wing nudge does not land on the desktop golden" | 148–162 | 154, 156–157, 158–159, 160–161 |
| "no path carries pathLength" | 164–171 | 169 |

## tests/unit/title-flow.test.mjs

SHA-256: `e14a61412f0063cd9660667ae8fe358ef8b27f898e77923eae2224be6b22f744`. Complete read: 1–213.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 8 real module source; 11–42 G facade, captured click propagation, delayed ensureNet and optional queued transitions | TitleFlow.create/openTimeTrial/openCareerSlots; js/game.js integration; Tracks/DailyChallenge/GhostShare/UiLayers stubs | VS completion refuses stale navigation across sheets/BACK/race picker/queued transitions, dedupes shared loads, preserves accessory toggles, warns only current refusal; latest transition owns apply/release; DAILY and TT warm selected track. No real net bundle/UI transition or ghost hash event exercised despite ghost-link header/fixture fields; settled promises and manual callbacks determine ordering. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "Settings/Help visits cancel pending VS success and failure even after BACK" | 44–71 | 54, 59, 60, 61 ×2, 62, 66, 67 ×2, 68 |
| "repeated VS activations sharing one download open the lobby only once" | 73–82 | 80, 81 |
| "title sound and background-motion toggles do not cancel a pending VS entry" | 84–93 | 91, 92 |
| "M5: VS FRIEND leaves flow/selection alone and announces when the net bundle is refused" | 95–105 | 99, 100, 101, 102, 103, 104 |
| "M5: VS FRIEND sets the gp/race flow and opens the lobby once the bundle lands" | 107–114 | 111 ×2, 112 ×2, 113 |
| "VS FRIEND loading cannot open the lobby over a newer title sheet or race picker" | 116–137 | 127, 128, 129, 134 |
| "a queued title transition owns navigation before its DOM callback runs" | 139–159 | 145, 146, 150, 151, 153, 157 |
| "a superseded VS load stays cancelled even after the player returns to the title" | 161–172 | 170, 171 |
| "overlapping queued title transitions cannot release or apply another transition's ownership" | 174–198 | 183, 186, 189, 190, 193, 196 |
| "DAILY and TIME TRIAL both warm the selected circuit under the picker" | 202–213 | 205, 206, 207, 210, 211, 212 |

## tests/unit/title-fx.test.mjs

SHA-256: `d26eb57abddbd9870e030c921cfa93874c4a08964227f600061364004d546cfd`. Complete read: 1–347.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 16–23 real module/CSS/shell/export/manifest; 25–123 DOM attributes, fake store/SettingRow/timers/RAF/MutationObserver/media/vibration | TitleFx choice/mode/setChoice/set/introMode/washMode/artMode/setIntro/setWash/setArt/replay/initUI; export/manifest/CSS contract | Defaults/legacy/junk and OS reduce, three title looks dataset/store round-trip; delayed UI wiring; one-shot/full/quick/off/replay preview/hidden boot and no forced layout; visibility pause and trusted enabled bigbtn haptic; selectors/export categories. Stub SettingRow verifies spec wiring not rendered widgets; manual clocks do not verify CSS animation or OS/browser scheduling. Intro 2800ms/full and 1200ms/quick pinned. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "shell declares TITLE INTRO, MENU WASH, TITLE ART and REPLAY INTRO (motion is a11y)" | 126–136 | 127, 128, 129, 130, 131, 132, 133, 134, 135 |
| "defaults: motion AUTO (effective ON), intro FULL, wash FULL, title art ON (no data-*)" | 138–149 | 140, 141, 142, 143, 144, 145, 146, 147, 148 |
| "AUTO follows OS; OFF overrides OS; legacy ON reads as AUTO" | 151–159 | 153, 154, 155, 157, 158 |
| "a stored REDUCE (ON) lands on a normal OS, and garbage reads as AUTO" | 161–165 | 162, 163, 164 |
| "TITLE INTRO quick/off stamp data-title-intro; garbage falls to full" | 167–176 | 169, 170, 171, 173, 174, 175 |
| "MENU WASH soft/off stamp data-menu-wash; garbage falls to full" | 178–185 | 180, 181, 183, 184 |
| "TITLE ART soft/off stamp data-title-art; garbage falls to on" | 187–194 | 189, 190, 192, 193 |
| "Appearance rows wire and round-trip intro + wash + titleArt (motion via setChoice)" | 196–225 | 198–200, 202, 203, 205, 206, 208, 209, 211, 212, 214, 216, 218, 220, 222, 224 |
| "wiring waits for DOMContentLoaded while deferred scripts still run" | 227–232 | 229, 231 |
| "REPLAY INTRO button calls replay()" | 234–242 | 237, 239, 241 |
| "the intro plays ONCE: held one pass, then gone for good" | 244–252 | 246, 247, 249, 250, 251 |
| "QUICK intro holds for 1200 ms" | 254–257 | 256 |
| "reduced motion and INTRO OFF drop the intro at once" | 259–265 | 260, 261, 264 |
| "replay under INTRO OFF lifts the stamp for one FULL preview" | 267–279 | 269, 270, 272, 274, 275, 277, 278 |
| "booted past the title, the intro waits for the first time it is seen" | 281–291 | 284, 285, 287, 288, 290 |
| "replay() restarts on the next frame, never with a forced layout" | 293–303 | 297, 299, 301, 302 |
| "a hidden tab pauses the title animations and a visible one resumes them" | 305–311 | 308, 310 |
| "a title .bigbtn click taps through Input.vibrate, anything else does not" | 313–324 | 321, 323 |
| "CSS keys off data-motion / data-title-intro / data-menu-wash / data-title-art; export lists all four" | 326–347 | 327–328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346 |

## tests/unit/title-home-scene-prepaint.test.mjs

SHA-256: `942fd5f7a3050cffc8edebd5411cb043e745cf33353e766c404d20a349fa8e5c`. Complete read: 1–153.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 12–21 manifest/shell/blocking CSS; 108–144 optional real Chrome via harness/static server at 393×659, 3s delayed metrics | index.html homeScene prepaint; blocking tokens/components/title/menus/responsive CSS; js/ui/experience.js stamps | Prepaint live/auto scene stamps and blocking grid/skew/car visibility; compact subgrid retains scroll box, wrap/touch floor/leading icons/padding; html/overlay runtime stamps aligned. Browser test silently returns without executable, not explicit skip; records homeReady but never asserts it, so title claiming before ready is stronger than proof. 3s measurement may include loaded experience runtime. This mapping ran no browser. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "pre-paint script stamps html[data-home-scene] from apex26.homeScene" | 23–28 | 24, 25, 26, 27 |
| "live Home grid geometry lives in blocking css/menus.css" | 30–54 | 33–37, 38–42, 43–47, 48, 49–53 |
| "compact-wide live Home grid-places #menu-secondary under the door stack" | 56–105 | 59–63, 64–68, 69–73, 74–78, 79–83, 84–88, 89–93, 94–98, 102, 103, 104 |
| "portrait live Home #menu-buttons is tall before data-home-ready" | 107–145 | 137, 138, 139–140 |
| "experience.js keeps html and #overlay home-scene stamps aligned" | 147–153 | 149–152 |

## tests/unit/title-layout.test.mjs

SHA-256: `a856ce98adc4f8d56b54f9c250aba9d5f71b3df8d1dfd5145d696a796daf255a`. Complete read: 1–460.

| Fixtures / setup ranges | Targets | Meaning, comments and limits |
|---|---|---|
| 24–77 real SettingRow/TitleLayout/ScreenLooks VM mini DOM/store/timer/observers; 121–140 extracted inline first-paint script; 203–213 fixed screen rectangles + event helpers; 419–421 fake TitleFx subscription | TitleLayout normalize/current/all/set/reset/resetShape/shape/vars/editor/build/screenShipped; SettingRow/ScreenLooks; index first paint; CSS/export/manifest | Clamps/default normalization; sparse tokens/store cleanup; v1→v2 per-shape preservation, rotation/copy/resets; inline module parity; editor pointer ownership/drag/scale/clamp/swallowed doors, keyboard/docked controls, DONE/focus/race exclusion; fold/peek/summary and TitleFx changes; responsive gating and motion-chip fixes. Synthetic rects/events validate model and DOM contract, not real CSS geometry/focus/default-event routing. First-paint parity samples four stores×two shapes rather than arbitrary input space. |

| Exact case name / expression | Case range | Assertion call spans |
|---|---|---|
| "normalize clamps every field and reads junk as shipped" | 79–90 | 82, 84, 85, 86, 87 ×2, 88 ×2, 89 |
| "untouched, the page carries nothing; custom lands as --tl-* tokens and html attributes" | 92–112 | 94, 95, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 108, 109, 110, 111 |
| "a stored layout applies at eval" | 114–119 | 116, 117, 118 |
| "index.html's first-paint copy writes exactly what the module writes" | 121–141 | 123, 135, 136, 138, 140 |
| "v1 → v2: a one-layout store is BOTH shapes, and the next write keeps the untouched shape" | 143–161 | 146, 147, 148, 151, 152, 153, 155, 157, 158, 159, 160 |
| "per shape: each shape applies its own layout, and a rotation re-applies" | 163–182 | 165, 166, 167, 168, 169, 170, 172, 173, 174, 175, 176, 177, 179, 181 |
| "COPY TO the other shape, RESET THIS SHAPE, RESET ALL, and the summary counts both shapes" | 184–200 | 190, 192, 193, 194, 195, 196, 198, 199 |
| "editor: the fold's button trades the settings page for the title screen and a docked bar" | 215–235 | 217, 218, 219, 220, 222, 223, 224, 225, 227, 228, 229–230, 232, 233, 234 |
| "editor: a pointer drag moves a piece in screen percent, the corner handle sizes it, and door clicks are swallowed" | 237–268 | 241, 243, 244, 246, 249, 250, 255, 259, 260, 263, 264, 267 |
| "editor: keys nudge, size and cycle the pieces; the bar's steps and RESET PIECE" | 270–299 | 273, 275, 276, 278, 280, 282, 284, 285, 287, 288, 291, 293, 295, 297, 298 |
| "editor: DONE gives the settings page back, opens the fold and focuses its button; mid-race it cannot open" | 301–326 | 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 316, 318, 321, 323, 324, 325 |
| "the APPEARANCE fold: built inside TITLE SCREEN before REPLAY INTRO, sliders store and PEEK, choices wire, RESET clears" | 328–359 | 331, 332, 333, 335, 337, 338, 341, 343, 344, 345, 346, 348, 351, 352, 354, 355, 356, 358 |
| "CSS: every TITLE LAYOUT rule is gated on a custom layout (or the peek) and lives in the overlays layer" | 361–377 | 366, 367, 370, 373, 374, 375, 376 |
| "shell: UI SIZE lives in APPEARANCE › READABILITY, before TEXT SIZE, and left DISPLAY" | 386–401 | 389, 390, 392, 393, 394, 395, 396, 398, 399, 400 |
| "shell: every title-screen knob sits in ONE TITLE SCREEN fold; REDUCE MOTION is Accessibility" | 403–416 | 405, 407, 409, 411, 412, 413, 414, 415 |
| "TITLE SCREEN summary: SHIPPED only while the layout AND TitleFx's three looks are shipped" | 418–444 | 424, 425, 428, 430, 433, 434, 436, 439, 442, 443 |
| "registered: manifest, export key, and the shell loads it" | 446–451 | 447, 448, 449, 450 |
| "the home-scene motion chip cannot steal HOW TO PLAY at compact 200%" | 453–460 | 458, 459 |

Shared helper assertion calls outside case bodies: 382. These apply whenever their helper is reached.

## Inventory accounting and limits

217 source test-call declarations and 986 source assertion calls inventoried (multiple calls on one line marked ×N). Parameterized declarations expand at runtime: telemetry clipping ×3; terrain-normal pairs ×2 circuits; banked-road case ×3; throttle native-button case ×4. Generated child-test strings are identified separately above. This is a semantic source map, not an execution/pass report.

Dependencies shared across suites include Node built-ins, VM global seeding, mini DOM, absolute-source diagnostic naming, CSS aggregation, engine-build helpers, Acorn/eslint-scope and vendored Three.js. Browser-independent tests often assert source text: those pins constrain spelling/structure and can pass despite unrelated runtime defects. Real-repository taxonomy/coverage checks intentionally differ from synthetic checker tests. No production defect or runtime fix is claimed from historical comments alone. Historical/archive/fabricated filenames quoted in source are described by role here rather than promoted to current-file links or nonexistent JavaScript path literals.
