# Unit group 50 — complete source map

Read-only map of all 22 assigned files, 4,976 source lines, 2026-10-27. Every assigned line was returned in individual source calls of at most 80 lines and under 10,000 characters; the first aggregate page was truncated and the affected slider chunks were reread. No tests, browser sessions, runtime edits or commits. Case rows describe source assertions, not pass results. Inclusive ranges; loop-generated cases retain their source expression and expansions are identified below.

## Navigation and dependencies

Read AGENTS.md and `.claude/skills/code-nav/SKILL.md`. Local apex-lsp resolves SportingRegs at `js/race/sporting-regs.js:53`, with production uses in game, pit-lane, race-control and jump-start-penalty. Tracks.project resolves to `js/track/core/spline.js:216`, exported through tracks at 859; its fifth height argument and hinted/grid branches are explicit in the definition. startRace resolves to `js/game.js:2734–2771`, using RaceEntryProfile.runSession and returning the request. StartLights has real/stub declarations; reference inventory includes game, lazy-bundles and session-stub, so the bare-name result is not a unique real implementation. SpotifyMusic reference inventory is explicitly a text fallback for the untyped window property: audio panel and lazy-bundles are consumers. SoakRun references include game, bench-run, gpu-test-run and phone-recorder.

All dependencies below are real tree paths or directory inventories. Synthetic scripts, specimen spec identifiers, deliberately invalid input, temporary loader/crash scripts and invalid declaration names are test data rather than missing modules. Native Node modules, Terser and optional Python Pillow/numpy are external dependencies. VM, seed-store, seed-log, abs-src, game-source and tmp-dir helpers establish the harness boundary; no harness stub proves a browser feature.

## tests/unit/slider-effect.test.mjs

Read 1–401; SHA-256 d6813b8db38246a454c8af1ca2d0b53fe9fc1b1208b057376f6c02e9455d2efa. 23 declared case sites.

Lighting CLI classifiers, live recipe planning and synthetic image postprocessing. Fixtures and limits: CLI runner 20–30; Python dependency probe 128–133; synthetic image builders 135–165 and 338–349. Pillow/numpy gates three image cases. No live render or browser launch is exercised.

Exercised targets: tools/lighting/slider-effect.mjs; tools/lighting/slider-effect-live.mjs; tools/lighting/slider-effect-view.py.

| Case / meaning and range | Assertion spans |
|---|---|
| the tool exists (32–34) | 33 |
| --help exits 0 and documents --live visual filter plus the failure-mode table (36–47) | 38, 39, 40, 41, 42, 43, 44, 45, 46 |
| --json lists every TUNE_DEFS knob with id/group (49–63) | 52, 54, 55, 57, 58, 59, 60, 62 |
| nightAmbLift is classified as night-gated / ambient (65–74) | 68, 69, 70, 71–72, 73 |
| overcastFogMul / fogWxMul are weather-gated (76–85) | 80, 81, 82, 83, 84 |
| --gate night returns a non-empty subset smaller than all knobs (87–94) | 90, 91–92, 93 |
| --risk reapply flags apply-only knobs missing from APPLY_RACE_IDS (non-empty: floodEmitMul is one today) (96–108) | 101, 102, 104, 105, 106 |
| --live without an id/--all/--group exits 2 and does not mention a browser launch (110–115) | 112, 113, 114 |
| --live lampLevel --dry-run prints a night chase recipe and launches nothing (117–127) | 119, 121, 122, 123, 124, 125, 126 |
| slider-effect-view.py isolates changed pixels on a synthetic pair (136–165) | 152, 156, 157, 158, 160, 161 |
| every TUNE_DEFS knob has a valid live recipe (no browser) (167–193) | 173, 178, 180, 181, 182, 183, 184, 185, 186, 187, 188, 191 |
| documented live recipes: weather / far-clip / traffic / stars (195–222) | 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221 |
| --live --all --dry-run prints a plan for every knob, batched by condition (224–239) | 226, 227, 230, 231, 232, 233, 235, 236, 237, 238 |
| --live --ids dry-run is an explicit subset and launches nothing (241–249) | 243, 244, 246, 247, 248 |
| --live --group LAMPS --dry-run is a subset, still night-heavy (251–260) | 253, 255, 256, 258, 259 |
| inventory tags: chunk-lamps / saturate / sparse-pixels / wet-drizzle (262–274) | 265, 266, 267, 268, 270, 271, 273 |
| --shots 5 --dry-run linspaces TUNE_DEFS min→max (276–291) | 278, 280, 281, 282, 283, 286, 287, 288, 289, 290 |
| --levels sets explicit values and wins over --shots (293–301) | 295, 297, 298, 299, 300 |
| --from/--to without --shots stays a 2-shot A/B (303–309) | 305, 307, 308 |
| sampleLevels rejects shots < 2 and a single --levels value (311–317) | 315, 316 |
| glareStr recipe uses night + full 0→max range (319–331) | 327, 328, 330 |
| slider-effect-view.py --batch-summary produces summary.png from a synthetic batch (352–374) | 363, 364, 366, 369, 370 |
| slider-effect-view.py writes filter/heat/diff/sheet/view.json and signs the diff (376–401) | 383, 385, 389, 396, 397 |

Shared helper assertion spans: json (26–30): 28; synthPair (338–350): 349.

Exact top-level helper/fixture function spans: run 20–24; json 26–30; hasViewDeps 129–134; synthPair 338–350.

## tests/unit/soak-run.test.mjs

Read 1–143; SHA-256 71849d256f76dbc0e34356992486e91d338006b834ecae42a468113d4b278e1a. 8 declared case sites.

Soak driver lifecycle and anticipatory inputs. Fixtures and limits: rig 19–52 supplies fake G, clock, rAF, recorder, track curvature and visibility callbacks. No integrated physics, video encoding or real race entry.

Exercised targets: js/perf/soak-run.js.

| Case / meaning and range | Assertion spans |
|---|---|
| idle until start(): no rAF, no input (54–59) | 56, 57, 58 |
| start sets a wet fixed-circuit race, picks the chase camera, then drives and records (61–79) | 63, 64, 65, 66, 67, 68, 69, 70, 72, 73, 76, 77, 78 |
| it finishes on time: clears _testInput, pauses, stops the recorder, and cancels its rAF (81–91) | 86, 87, 88, 89, 90 |
| the player quitting ends the soak and hands the input back (93–101) | 98, 99, 100 |
| a second start while active is refused (103–107) | 105, 106 |
| the law brakes for a corner it has not reached and flat-outs a straight (109–120) | 113, 114, 118, 119 |
| it steers back toward the road: right of centre steers one way, left the other (122–130) | 128, 129 |
| a hidden page ends the soak and hands the input back; the listener is removed on finish (132–142) | 136, 138, 139, 140, 141 |

Exact top-level helper/fixture function spans: rig 19–52; rigDocHidden 143–143.

## tests/unit/soundtrack-cache.test.mjs

Read 1–132; SHA-256 1d725a8291eaad841bbd075023275bd0428e676518dd17fd2f716e2f27fab2f8. 4 declared case sites.

Decoded music LRU, serialization and playback ownership. Fixtures and limits: boot 15–64 fakes audio graph, decode, fetch, timers and devices; flush 65. Real soundtrack/engine modules loaded together; last case adds real audition with fake clock. No audible output or memory measurement.

Exercised targets: js/audio/tone-model.js; js/audio/signal.js; js/audio/soundtrack.js; js/audio/radio-fx.js; js/audio/engine.js; js/audio/race-mix-audition.js.

| Case / meaning and range | Assertion spans |
|---|---|
| removeTrack frees its LRU slot: a live cached buffer is not evicted early (66–81) | 70, 71, 75, 78, 80 |
| distinct music loads serialize decoding and skip superseded queued tracks (84–104) | 94, 97, 99, 100, 102, 103 |
| GameAudio exposes soundtrack playback ownership and preserves a replacement upload (106–115) | 111, 112, 113, 114 |
| audition samples and cleanup cannot alter a later race engine claim, including an already-running graph (117–132) | 124, 125, 127, 129, 130, 130, 131 |

Exact top-level helper/fixture function spans: param 14–14; boot 15–63; flush 64–64.

## tests/unit/source-integrity.test.mjs

Read 1–480; SHA-256 554eafff2576d6408562db11c777a174d5a59a4418e1b3020d4a5b986dd6a76b. 17 declared case sites.

Whole-tree grammar, shell structure and targeted integration source contracts. Fixtures and limits: walk/classicParseError 39–54; real filesystem CSS/JS/HTML inventories; setPortraitOk VM 324–351; fake survey click/wait/evaluate 458–480. Regex contracts do not establish browser accessibility or layout. Brace counting is not a CSS parser; tag stack is deliberately not an HTML validator.

Exercised targets: index.html; css/; js/; tools/ui/menu-screens.mjs; tools/gfx/glx-call-census.mjs.

| Case / meaning and range | Assertion spans |
|---|---|
| classic-script parse check rejects ESM syntax and top-level await (56–61) | 57, 58, 59, 60 |
| every js/ file still parses as a classic script (63–75) | 65, 71–74 |
| every css/ file has balanced braces outside comments (77–94) | 90–93 |
| Spotify dialog has an accessible name (96–101) | 98–100 |
| Data Export actions are not announced as toggles (103–110) | 105, 106, 107, 108, 109 |
| no CSS selector can never match (138–187) | 183–186 |
| index.html's tags are balanced and correctly nested (206–235) | 231–234 |
| tools/ui/menu-screens.mjs knows about every screen in the shell (237–274) | 269–273 |
| Settings is a door-index stack with labelled pages (276–291) | 278, 279, 280, 281, 282, 284, 287, 289, 290 |
| portrait race blocker is an actionable accessible dialog (293–320) | 296, 297, 298–299, 300, 301, 304–305, 306–307, 312, 313–314, 315–316, 318–319 |
| RACE IN PORTRAIT has a settings undo: on → off brings the blocker back (324–350) | 328–329, 331–332, 344, 345, 347, 348, 349 |
| no screen fakes modality with a div claiming dialog semantics (352–373) | 366–372 |
| Circuit filters are not nested in a listbox and circuits expose button state (375–382) | 378, 379, 380, 381 |
| scenery SUPPRESSED is coalesced, not a per-prop Log.warn (384–403) | 395–396, 397–398, 401, 402 |
| the audio block cannot deref a null player, and a lone throw no longer kills the loop (406–443) | 415–416, 417–418, 419–420, 432–433, 434–435, 441–442 |
| the GL-call census refuses to report a frame it did not measure (445–460) | 452, 453–454, 457, 458–459 |
| menu survey catalogs relocated settings panels and traverses Controls before Advanced (462–480) | 466, 471, 472, 474, 475, 479 |

Exact top-level helper/fixture function spans: walk 39–46; classicParseError 51–54.

## tests/unit/source-pin-hygiene.test.mjs

Read 1–72; SHA-256 c8dec1937ce1dd4d75f09d4db4a5b19765e3ba38f707dc6557698cbdf9903ae4. 4 declared case sites.

Shrink-only raw source-read ratchet and manifest-derived source helper. Fixtures and limits: real repository reads; RAW 29; synthetic prose/path strings 32–37. Diff-relative ceiling depends on ratchet/base context. No runtime race behavior.

Exercised targets: tests/helpers/game-source.mjs; tools/check/ratchets.mjs; tests/data/ratchets.json.

| Case / meaning and range | Assertion spans |
|---|---|
| the raw-read pattern counts quoted path literals, not possessive prose (32–38) | 34, 35, 36, 37 |
| raw js/game.js source reads under tests/ never grow (read through tests/helpers/game-source.mjs) (40–48) | 43–45, 46–47 |
| gameSource is game.js plus the modules game.js instantiates — derived, not listed (50–65) | 54, 56, 60, 63, 64 |
| symbolSource reads from the one declaring file, and throws on none or many (67–72) | 68, 69, 70, 71 |

Exact top-level helper/fixture function spans: no top-level function fixtures.

## tests/unit/span-kinds.test.mjs

Read 1–73; SHA-256 14185dd0e6ad19d7c80a978694af515b699b6670a98f2e246e77d976f8f7ef1b. 2 declared case sites.

Emitter/span consumer vocabulary consistency. Fixtures and limits: emittedKinds 33–46 recursively scans literal noteSpan calls; specKinds 49–54 parses SPAN_KINDS. Dynamic or differently formatted emitters evade text recognition; no world model render.

Exercised targets: js/track/; tests/specs/agent-view.spec.js.

| Case / meaning and range | Assertion spans |
|---|---|
| every kind an emitter can produce is one the agent view recognises (57–64) | 60, 62–63 |
| the spec does not list kinds nothing emits (66–73) | 71–72 |

Shared helper assertion spans: specKinds (50–55): 53.

Exact top-level helper/fixture function spans: read 31–31; emittedKinds 34–47; specKinds 50–55.

## tests/unit/spec-timings.test.mjs

Read 1–531; SHA-256 d2cec95b33a9986f3f321471cecbad53b3a27647225abc6259a43418f43871bc. 28 declared case sites.

Timing parsing, deduplication, history bounds, provenance, reporter and committed data. Fixtures and limits: JUNIT 38–46; synthetic history objects; disposable artifact trees; fakeRun 380–405 invokes actual reporter with stub tests/environment restoration. No real CI duration measurement; growth is advisory.

Exercised targets: tools/ci/spec-timings.mjs; tools/ci/select-budget.mjs; tests/helpers/live-reporter.js.

| Case / meaning and range | Assertion spans |
|---|---|
| parseJunit reads Playwright's shape: suite timestamp, testcase time, tests/ prefix (50–59) | 52–53, 54–55, 56, 57–58 |
| a RETRIED test is billed once, at its final attempt (61–72) | 70, 71 |
| isolated CI retries bill the final suite, not every failed attempt (74–88) | 86, 87 |
| a FAILED final attempt is not billed — it measures the timeout (docs/BUGS.md) (90–99) | 97–98 |
| STEP GATE: robust rule on the newest sample, report-only, one bucket (101–124) | 115, 117, 118, 119, 120–122, 123 |
| bestSplit and mad are the plain definitions (126–132) | 127, 128, 129, 130, 131 |
| parseLiveLog reads the reporter's own end lines, and only the FINAL ones (134–155) | 144–146, 147–148, 152, 153, 154 |
| MERGE IS IDEMPOTENT: the same run, from either source, lands once (157–180) | 169, 170, 172–173, 178, 179 |
| a different run in the same second but a different BUCKET is a different sample (182–191) | 187, 188, 189–190 |
| HISTORY IS BOUNDED at KEEP samples, keeping the NEWEST (193–209) | 200, 201, 202, 208 |
| serialisation is deterministic and small — sorted, one line per series (211–226) | 219, 221–222, 223, 225 |
| saveDb/loadDb round-trip, and a missing or corrupt file is an EMPTY history (228–241) | 232, 236, 238–239 |
| the GROWTH FLAG fires on 2x, inside one bucket, and never on thin history (243–268) | 249, 251, 254, 255, 256, 257, 266–267 |
| growth bills a SPEC per test, so adding a test to a file is not growth (270–279) | 277–278 |
| envBucket names the RUNNER, and an unmeasured box is never a CI estimate (281–287) | 282, 283, 284, 285, 286 |
| small helpers: isoSecond, median, normaliseSpec (289–298) | 290, 291, 292, 293, 294, 295, 296, 297 |
| defaultSources finds both junit layouts and invents nothing (300–312) | 307–308, 309–310 |
| FALLBACK: a spec with no CI history is billed at the 2026-08-07 constant, and SAYS so (316–322) | 319, 320, 321 |
| MEASURED: a spec with enough CI samples is billed at its own median (324–342) | 332, 333, 334, 335, 340, 341 |
| a LOCAL history never sets a CI budget (344–356) | 353, 354, 355 |
| the bucket with the most samples wins, so a runner move re-bases the estimate (358–368) | 366, 367 |
| billing() hands capacity() a per-spec rate that carries its provenance (370–376) | 372, 373, 374, 375 |
| the reporter records a run through the same merge, on the same key as junit (407–430) | 417, 418–421, 422–423, 424, 425, 427–428 |
| without APEX_SPEC_TIMINGS the reporter writes nothing at all (432–443) | 438–439, 440, 441 |
| a broken timings file cannot turn a green run red (445–460) | 456–457, 458 |
| the committed spec-timings.json is well formed, bounded and honestly bucketed (464–506) | 469, 471, 473, 475, 478, 480, 481, 482, 490, 492, 495–496, 503, 504 |
| select-budget reads the committed file rather than a fixture (508–512) | 510–511 |
| unionDb keeps every distinct sample from both histories, newest `keep` per series (514–531) | 526, 527, 528, 530 |

Exact top-level helper/fixture function spans: tmpdir 48–48; fakeRun 383–405.

## tests/unit/speed-cap-vm.test.mjs

Read 1–58; SHA-256 35da7128538c025a60127ebdb70721753c151c6667cbaee94d08a0b214d49d6f. 2 declared case sites.

Speed ceiling rate and hostile dev knob floors. Fixtures and limits: shared Monza game VM before/after 14–16; fresh/startRace 18–23 resets tuning. One cap transition and finite-state sanity, no browser/GPU evidence.

Exercised targets: tools/lib/game-vm.cjs; js/game.js; js/agent/apex.js.

| Case / meaning and range | Assertion spans |
|---|---|
| a cap that drops under the car bleeds speed at a rate, never in one step (25–43) | 33, 41, 42 |
| setPhysics floors its knobs: a negative pace or expo cannot poison the car (45–58) | 49, 55, 56 |

Exact top-level helper/fixture function spans: fresh 18–18; startRace 20–23.

## tests/unit/speed-coupling.test.mjs

Read 1–133; SHA-256 f11c601cf44154982205ac2ddaf55e2b0e456a2b75e8fd725c77b2b13e49d7f6. 4 declared case sites.

Lateral/longitudinal force coupling. Fixtures and limits: seed 42 Monza VM; pinStraight 33–47 retires opponents and repins position, resetting lateral/yaw/load state. Source guard plus 1/60 s coast traces; pinned track removes normal travel effects.

Exercised targets: js/physics/player-forces.js; js/physics/consts.js; tools/lib/game-vm.cjs.

| Case / meaning and range | Assertion spans |
|---|---|
| COUPLE_V_MIN lives in player-forces; yaw damp / consts untouched (49–58) | 52, 53–54, 55, 56, 57 |
| straight coast (delta=0, vLat=0): couple is 0 so speed path is tip-identical (60–86) | 64, 65, 76–77, 78, 79, 81, 84, 85 |
| held-steer coast loses speed by the couple amount (within tol) (88–122) | 115–116, 118–119, 120–121 |
| below COUPLE_V_MIN (~3 m/s) couple does not reverse through zero (124–133) | 130, 131 |

Exact top-level helper/fixture function spans: mean 24–24; pinStraight 33–47.

## tests/unit/spline-fold-diagnostics.test.mjs

Read 1–134; SHA-256 e70ba182dded92f9f869a8bed9d0647f495dce911401ff958a1b8c74cf2d2bb6. 6 declared case sites.

Spline fold diagnostics and centripetal interpolation. Fixtures and limits: build VM without assets; synthetic irregular hairpin 32–42; SHA1 channel digest 44–49; analytic rings 67–76. Checks selected geometry and numeric fixtures, no complete fleet or visual proof.

Exercised targets: js/track/core/spline.js; tools/lib/track-build-vm.cjs.

| Case / meaning and range | Assertion spans |
|---|---|
| sampleXZ is exact on the Frenet channels and leaves unused channels untouched (51–64) | 59, 60, 61, 61, 62, 62 |
| surfaceFolds: a wide ring has the right radius and no fold; a kink tighter than hw folds (78–85) | 80, 81, 83, 84 |
| the build reports a centreline row; the hairpin shows in it (87–105) | 90, 91, 92, 104 |
| splineAlpha unset / 0 / null / invalid is the uniform path, bit-for-bit (107–112) | 111 |
| crc: passes through the control points, equals uniform Catmull-Rom on equal chords (114–125) | 116, 117, 123 |
| splineAlpha 0.5 on the hairpin: larger radius, fewer folds, same lap within 3 % (127–134) | 130, 131, 132, 133 |

Exact top-level helper/fixture function spans: syntheticHairpin 32–41; digest 43–48; centre 49–49; ring 67–76.

## tests/unit/spline-project-height.test.mjs

Read 1–196; SHA-256 4f522d05e5147017f16355c286192fe795b8d92ed64cbf25230fd0dac1bc093e. 5 declared case sites.

Height-aware spline projection and grid/linear equivalence. Fixtures and limits: built Suzuka/crossover 32–49; copied linear reference 117–148; seeded probes 150–171; cached Suzuka/Monaco/Spa. Full object equality checks numeric behavior; copied oracle can share conceptual mistakes.

Exercised targets: js/track/core/spline.js; js/track/tracks.js; tools/track/verify-track.cjs.

| Case / meaning and range | Assertion spans |
|---|---|
| suzuka crosses itself: legs are close in XZ and far in Y (51–56) | 53, 54, 55 |
| a height-carrying query picks the leg it is actually on; a flat one cannot (58–81) | 76, 79–80 |
| omitting the height changes nothing for callers that never passed one (83–101) | 96–97, 100 |
| `${id}: hint-less project() equals the full ascending scan at every probe` (178–188) | 183, 186, 187 |
| a hinted query is the windowed search, untouched by the grid (191–196) | 195 |

Exact top-level helper/fixture function spans: near 34–34; crossover 37–49; reference 118–146; probes 148–170; trackOf 173–173.

## tests/unit/sporting-regs.test.mjs

Read 1–478; SHA-256 7dad1fd1076c6dabd6f7a6fc003e1929fc3a85b71c46b9615d0ab9fe8953fae8. 29 declared case sites.

Sporting rule verdicts, caution debts, start and blue flag rules. Fixtures and limits: empty VM loads real rules; tyre logs 28; field/run 81–90; blueField/blueRun 366–385 with 0.1 s steps. Plain car records and source wiring checks; no full race classification, steward interpretation or HUD render.

Exercised targets: js/race/sporting-regs.js; js/game.js; js/race/jump-start-penalty.js.

| Case / meaning and range | Assertion spans |
|---|---|
| one dry compound is short; two different ones are not; a wet set lifts the rule (32–40) | 33, 34, 35, 36, 37, 38, 39 |
| the verdict: DSQ in a race the rule covers, 30 s if it ended suspended, nothing otherwise (42–50) | 44, 45, 46, 47, 48–49 |
| flag-time compound compliance survives later live-log changes without freezing unfinished cars (52–59) | 55, 56, 57, 58 |
| applyCompoundRule marks every offender, prices a suspended race, and clears a stale verdict (61–76) | 66, 67, 68, 69, 71, 72, 73, 75 |
| the price scale: 10 s for one kept place, 20 for two, 30 for more (93–99) | 94, 95, 96, 97, 98 |
| a place gained under the SC opens the window; given back in time, nothing (101–113) | 106, 107, 110, 111, 112 |
| info() names the car to let by and counts the window down, for the HUD's flag chip (115–131) | 119, 121, 123, 124, 125, 127, 129, 130 |
| a place KEPT past the window is +10 s; two places are +20 s (133–150) | 139, 140, 141, 142, 148, 149 |
| the window survives the caution ending: a place taken under it is still owed (152–159) | 158 |
| green-flag passes, and passes of a retired, finished or pitting car, are not offences (161–176) | 165, 168, 171, 174, 175 |
| re-passing a car that came past YOU under the caution is not an offence (178–187) | 183, 185, 186 |
| passing a car slowed by an obvious problem is legal; a healthy car beside it is still owed (189–203) | 195, 197, 200, 201, 202 |
| a stricken car that came past the player may be re-passed, and it cannot owe (205–216) | 214, 215 |
| game.js hands the pass watch its stricken-car predicate (218–240) | 220, 222, 223, 224, 225, 228, 229, 230, 231, 232, 233, 234, 235, 236, 238, 239 |
| a passed car that then pits or takes the flag drops the standing debt: no penalty (242–254) | 247, 251, 252 |
| a passed car that is then stricken (beached, rescued) drops the debt: the give-back is impossible (256–267) | 261, 265, 266 |
| the player in the pit lane, or already flagged, gains nothing it must give back (269–276) | 274, 275 |
| reset() forgets the order, so a re-grid cannot read as a pass (278–284) | 283 |
| champOrder: scorers by the standings comparator, the pointless behind in pace order (288–298) | 295, 296, 297 |
| a place gained under a caution and still owed at the FINISH is charged at once, and the passed car cannot clear it (300–315) | 308, 312, 313, 314 |
| a caution pass on the finishing step is charged once, including another same-step finisher (318–336) | 328, 329, 330, 332, 334 |
| a lapped finisher gains no position by crossing before a car one lap ahead (339–350) | 348, 349 |
| jumpStart: throttle at green and a launch inside the reaction window (354–366) | 356, 357, 358, 359, 360, 361, 362, 363, 364, 365 |
| blueFlagCar: only a car a lap up, physically just behind, within the time window (392–401) | 394, 395, 397, 400 |
| no blue flag → no warning and no penalty (403–408) | 406, 407 |
| sustained blocking: WARNING at 4 s, then +5 s IGNORING BLUE FLAGS at 8 s (410–424) | 415, 416, 417, 418, 419, 420, 421, 423 |
| letting the lapper through clears the episode; a new hold-up can warn again (426–435) | 428, 430, 431, 434 |
| a queue of lappers: hold time does not carry over from car A to car B (#2163) (437–455) | 443, 446, 447, 448, 453, 454 |
| exemptions: caution, pit, finished/retired, troubled player, and non-race (457–478) | 472, 477 |

Exact top-level helper/fixture function spans: log 28–28; field 81–85; run 87–91; blueField 373–382; blueRun 383–390.

## tests/unit/spotify-native.test.mjs

Read 1–65; SHA-256 e7f64a690376a79be20deb7aa59fa23803835fa066289afb0c5b7034e1753d0f. 1 declared case sites.

Native Spotify availability gate. Fixtures and limits: loadSpotify 18–59 fakes Capacitor Android, storage, DOM and timers; network rejects. This is not native runtime or OAuth validation.

Exercised targets: js/audio/spotify.js.

| Case / meaning and range | Assertion spans |
|---|---|
| Spotify available() is false under Capacitor even with a client id (61–65) | 63, 64 |

Exact top-level helper/fixture function spans: loadSpotify 18–59.

## tests/unit/spotify-refresh.test.mjs

Read 1–820; SHA-256 6d6838922cb3e855b31b57d25d46ab5d0e45bbc02d58552ae4043933a3a9e3b9. 32 declared case sites.

Spotify asynchronous session ownership and failure recovery. Fixtures and limits: load 29–99 fakes fetch, storage, DOM, SDK scripts, queued timers/intervals; landing/settle 280–290; fakeAudio 669–678; soundtrackAudio 747–752 loads real backend delegation. Requests and callbacks are simulated: no Spotify service, SDK media or real time passage.

Exercised targets: js/audio/spotify.js; js/audio/soundtrack.js; tests/helpers/seed-store.mjs.

| Case / meaning and range | Assertion spans |
|---|---|
| a retryable refresh failure preserves the long-lived Spotify session (101–109) | 106, 107–108 |
| album art hides a failed CDN image and does not resurrect it on refresh (111–116) | 112, 113, 114, 115 |
| failed current artwork keeps the neutral swatch visible in the player DOM (118–137) | 131, 133, 135, 136 |
| a delayed account check cannot overwrite a replacement Spotify session (139–159) | 152, 156, 157, 158 |
| a malformed token response is retryable and preserves the session (161–167) | 165, 166 |
| a token response whose body stalls settles as a retryable refresh failure (169–188) | 183, 184, 185 |
| an account response whose body stalls settles as a network failure (190–211) | 207, 208 |
| a timed-out SDK load restores a pre-existing ready hook for retry (213–230) | 225, 228–229 |
| concurrent callers share one rotating refresh request (232–248) | 246, 247 |
| a stale invalid_grant cannot erase a replacement refresh token (250–267) | 266 |
| invalid_grant for the current token still signs the dead session out (269–273) | 272 |
| remote mode connects on a token with no streaming scope (299–311) | 309–310 |
| browser mode still refuses a token with no streaming scope (313–320) | 318–319 |
| a volume drag sends ONE PUT, carrying the value it ended on (322–344) | 337–338, 342, 343 |
| a debounced volume PUT stays on the device selected when the drag started (346–370) | 366, 367, 368, 369 |
| volume gestures coalesce independently when switching devices and returning (372–409) | 392, 397, 398–399, 407, 408 |
| disconnect cancels queued volume and search callbacks across reconnect (414–435) | 433–434 |
| an old now-playing response cannot overwrite the new connection (437–460) | 455–456, 459 |
| stale device and playlist search responses do not alter the replacement session (462–491) | 482, 484, 488, 489, 490 |
| a pending connect and delayed command do not resurrect a disconnected session (493–522) | 507, 520–521 |
| a 401 from the Web API forces one refresh and retries once with the new token (530–544) | 540–541, 542, 543 |
| a second 401 after the forced refresh is returned, not retried forever (546–556) | 554, 555 |
| the now-playing poll waits out a 429's Retry-After (558–577) | 572, 573, 576 |
| now-playing polling recovers when response headers arrive but JSON body stalls (579–608) | 597, 600, 603, 604, 607 |
| a stalled now-playing body can reject after cancellation without an unhandled rejection (610–629) | 625, 628 |
| "playback refusal restores built-in music when its error body is " + failure (632–665) | 645, 650, 653, 655, 657, 658, 659–660, 664 |
| a transient refresh failure on a connected remote session keeps it connected, backend installed (H12) (679–706) | 696, 697, 702–703, 704, 705 |
| switching play mode tears the OLD transport down before the stored mode flips (H25) (708–733) | 726, 727, 730, 731–732 |
| browser SDK next, previous and volume handle asynchronous and synchronous failures (736–749) | 746, 748 |
| the real soundtrack previous control delegates to Spotify's backend (757–769) | 768 |
| action + " pauses the owned remote transport before clearing credentials, with no late retry" (772–803) | 788, 789, 790–791, 798, 801, 802 |
| disconnect does not pause Spotify when the local soundtrack already owns music (806–820) | 819 |

Exact top-level helper/fixture function spans: token 14–16; jsonResponse 18–23; load 29–99; landing 278–284; settle 288–288; noStreaming 291–297; liveToken 411–412; bearer 528–528; fakeAudio 669–677; soundtrackAudio 751–755.

## tests/unit/spotter-lifecycle.test.mjs

Read 1–153; SHA-256 e2b3fdb172f3d4754bf62a887207898d007eb1e645ce920fa0883fc2aae03f29. 9 declared case sites.

Spotter heard/pending warning lifecycle and decode races. Fixtures and limits: fixture 10–31 fakes speech pack; real VoicePack cases provide synthetic manifest/binary integrity, fake decoders, audio sink and timers. Audibility means valid/audio callback observations, not sound output.

Exercised targets: js/race/spotter.js; js/audio/voice-pack.js.

| Case / meaning and range | Assertion spans |
|---|---|
| a warning lost during decoding is retried while the car remains alongside (34–37) | 36 |
| a decode failure cannot produce clear for a warning that was never heard (39–42) | 41 |
| a failed side change retains an earlier audible warning and still calls clear (44–48) | 47 |
| an old decode completion cannot erase a replacement field's warning (50–56) | 53, 55 |
| a failed still-there decode retains the initial heard side for clear (58–62) | 61 |
| real VoicePack decode rejection restores the spotter's pending warning (64–91) | 80, 86, 87, 87, 89 |
| rapid pre-validation failures retain the call gap instead of decoding each tick (93–103) | 100, 102 |
| `invalid ${pending} retains only warnings previously heard` (106–120) | 115, 118–119 |
| real VoicePack drops stale still-there audio but retains the heard warning for clear (123–153) | 138, 145, 146, 148, 149, 151 |

Shared helper assertion spans: fixture (10–32): 27, 28.

Exact top-level helper/fixture function spans: binaryIntegrity 8–8; fixture 10–32.

## tests/unit/stage-minify.test.mjs

Read 1–285; SHA-256 8c0eb43301713c60f9a571daa8a2a2c71229cbad239a4c86a997c4bf3bccaa4b. 13 declared case sites.

Staged minification invariants and atomic worker failures. Fixtures and limits: real Terser, AST top-level inventory, scenery closure VM; seven-source disposable minifyFixture 164–179; real Worker subclasses and injected crash/loader. Does not boot staged game; CI staged-boot owns that.

Exercised targets: tools/desktop/minify.mjs; tools/desktop/minify-worker.mjs; assets/pack/manifest.json.

| Case / meaning and range | Assertion spans |
|---|---|
| options: compress off, locals-only mangle, names and quoted keys kept (75–83) | 76, 77, 78, 79, 80, 81, 82 |
| only js/**/*.js outside vendor/ is a target (88–94) | 89, 90, 91, 92, 93 |
| every scenery closure names the same models minified as from source (96–116) | 106, 111, 114, 115 |
| top-level declarations, directives and function names survive; no map link (118–129) | 120, 124, 125, 126, 127 |
| keep_fnames: a named function keeps its name and .name (131–136) | 135 |
| minifyStaged is byte-deterministic and writes an unlinked .map beside each file (138–155) | 150, 151, 154 |
| terser loads lazily: pages.yml deploy/verify-live and desktop.yml stage with no root npm ci (157–162) | 160, 161 |
| minify pool is capped by CPU and memory capacity, with a two-worker default (179–187) | 181, 182, 183, 184, 185, 186 |
| persistent minify workers execute multiple tasks and preserve exact code and maps (189–209) | 193, 198, 199, 200, 203, 204, 205, 206, 207 |
| a crashed minify worker stops dispatch and joins a stalled peer before rejecting (211–228) | 224–225, 226, 227 |
| a failed minify task leaves every staged source/map untouched in serial and pool modes (230–245) | 237, 239, 240, 242, 243 |
| jobs1 does not import workers; unavailable Terser skips without changing staged bytes (247–272) | 259, 260, 262, 263, 266, 267, 269, 270 |
| a Terser task error joins every real worker before returning its source path (274–285) | 281–282, 283, 284 |

Exact top-level helper/fixture function spans: read 31–31; idsNamedIn 36–44; topLevelNames 47–55; leadingDirective 58–61; sceneryClosures 64–73; fake 86–86; minifyFixture 164–177.

## tests/unit/stand-curve-gap.test.mjs

Read 1–134; SHA-256 5d8c94d266740132b5278ec4dc7e176f2a9097be161aee3d5b83f4460f2e56c4. 2 declared case sites.

Curved terrace gaps and severe clip self-pairs. Fixtures and limits: measureTerraceGaps 23–83 mirrors emitter math and wraps Jerez terrace; CLI clip audit case filters ≥1 m tier self-pairs. Moderate outside bends only; copied math is weaker than direct mesh measurement; minor/cross-kind clips excluded.

Exercised targets: js/track/scenery/structures.js; js/circuits/scenery/jerez.js; tools/track/clip-audit.cjs.

| Case / meaning and range | Assertion spans |
|---|---|
| jerez terrace outside-of-bend gaps close to ≤ 0.5 m (#2204) (85–116) | 88, 90, 102, 104, 106–115 |
| jerez clip-audit no longer lists tier-emitter self-pairs at severe depth (#2204) (118–134) | 133 |

Exact top-level helper/fixture function spans: measureTerraceGaps 24–83.

## tests/unit/start-lights.test.mjs

Read 1–249; SHA-256 bce66c9f3f492af9694cb8639a454d04ef8884330469461c0391dc637f97b945. 11 declared case sites.

Start gantry lamp placement, pool budgeting and countdown wall time. Fixtures and limits: synthetic straight track 34–39/GATE/stub 43–44; actual particle pool runAt 139–167; actual game VM lampsWall 214–224 at six fps. Brightness proxy sums alpha×red, no raster output; fake props test memo misses separately.

Exercised targets: js/race/start-lights.js; js/fx/particles.js; js/race/session-stub.js; js/game.js.

| Case / meaning and range | Assertion spans |
|---|---|
| each lit lamp is one additive flare on the start gantry, under the beam, proud of the grid-facing face (46–64) | 52, 54, 55, 57, 58, 59, 62, 63 |
| all five on, none outside the count, none without a start gantry (66–84) | 70, 73, 76, 79, 81, 82, 83 |
| lamp positions are memoised per track and recomputed on a new one (86–93) | 90, 91, 92 |
| no gantry at the line: the lamps hang on the engine start gate's beam, which every circuit has (95–111) | 101, 103, 104, 107, 110 |
| a record that names its lamp row (a startLights span) places the lamps there, and wins a tie (113–126) | 121, 123, 124 |
| game.js wires StartLights and the particle pool exposes the lamp flare (128–136) | 130, 131, 133, 134, 135 |
| the lit gantry is equally bright at 30, 60 and 144 Hz and takes nothing from the pool (169–184) | 173, 176, 177, 181, 183 |
| a lookup before the props list exists is not memoised: the lamps appear once the build fills it (186–200) | 191, 194, 197, 199 |
| #1882: the real solo countdown keeps wall-clock time at any frame rate (219–233) | 230 |
| #1882: countCredit gives nothing back at full rate and caps a resumed tab at one lamp (235–243) | 237, 238, 239, 240, 241, 242 |
| #1882: the race-session stub answers countCredit with no credit (245–249) | 248 |

Shared helper assertion spans: lampsWall (208–217): 215.

Exact top-level helper/fixture function spans: load 26–30; track 34–39; stub 44–44; runAt 143–167; lampsWall 208–217.

## tests/unit/start-race-latch.test.mjs

Read 1–86; SHA-256 e2967e01e7d95fdd8478184d787659276e9fa7aec1b671cc9aa44e262b234d0e. 4 declared case sites.

Race entry promise latch, failed-entry cleanup and canceled prerequisites. Fixtures and limits: shared Monza VM hooks 25–27; inject throwing reset and held ready promise; Promise.allSettled identity cases intentionally do not require successful starts. Header says two tests though four now exist.

Exercised targets: js/game.js; tools/lib/game-vm.cjs.

| Case / meaning and range | Assertion spans |
|---|---|
| a concurrent second startRace() call shares the in-flight promise (29–40) | 31, 34, 35 |
| a start that throws after the scenery await rejects, lands on the menu, and releases the latch (42–60) | 55, 56, 58 |
| the latch releases once the in-flight start settles (62–69) | 67 |
| a delayed optional-physics prerequisite cannot start a race after the player quits (71–86) | 79, 83, 84 |

Exact top-level helper/fixture function spans: no top-level function fixtures.

## tests/unit/steel-role.test.mjs

Read 1–163; SHA-256 91c3411cca3bc0a2dca2cfc07470a073ee1277c366605021e89201cd7a7eb4c3. 4 declared case sites.

Steel token role and contrast rationale. Fixtures and limits: CSS inventory/token resolver 48–60; local APCA 63–78; OKLab and opaque mix 80–105. Formula anchors and literal CSS only; no computed style, font rendering or full accessibility audit.

Exercised targets: css/tokens.css; css/.

| Case / meaning and range | Assertion spans |
|---|---|
| the APCA implementation reproduces both published anchors (107–112) | 108–109, 110–111 |
| the --steel alias holds, and the ink behind it measures what the note says (114–135) | 115–119, 128–130, 132–133 |
| the argument this rests on — one ink, two lightnesses — still holds (137–155) | 144–147, 148–151, 152–154 |
| the alias is not inlined away — the name still carries the role (157–163) | 159–162 |

Exact top-level helper/fixture function spans: read 51–51; token 53–57; hex 58–59; screenY 66–69; apca 70–77; lin 80–80; oklab 81–89; hueDeg 90–90; g 91–91; fromOklab 92–100; mixOklab 102–105.

## tests/unit/steer-feel-lift-off.test.mjs

Read 1–78; SHA-256 792a9d7ac1d4fcb93e572729fc7c4edf2d36cdc4e78effc0b8cbd88c18c1eef3. 3 declared case sites.

Lift-off oversteer remains recoverable. Fixtures and limits: shared seeded Monza VM and pinStraight 30–44; 45 m/s, steer .8 and fixed dt. Narrow handling fixture, no human feel or whole-track stability conclusion.

Exercised targets: js/physics/player-forces.js; js/physics/consts.js; tools/lib/game-vm.cjs.

| Case / meaning and range | Assertion spans |
|---|---|
| COAST_YAW_* constants ship and are read by player-forces (46–54) | 49, 50, 51, 52, 53 |
| lift-off at 45 m/s lock 0.8 rotates but does not snap past 1.25× in 0.75 s (56–69) | 61, 65, 66, 67–68 |
| coast yaw damp is idle on throttle (no change to planted mid-corner) (71–78) | 77 |

Exact top-level helper/fixture function spans: pinStraight 30–44.

## tests/unit/steer-lock-taper.test.mjs

Read 1–112; SHA-256 f1d913b7a74a629ddefab18dce5b0d0f5c6e7d6217af3ded37e784356bb7523d. 5 declared case sites.

Low-speed steering lock plateau and high-speed preservation. Fixtures and limits: local raw/boost formula 20–30; gameSource pin; real Monza VM final case retires opponents and repins position at 10/60 m/s. Pure cases test copied math; final applied-angle checks connect to runtime.

Exercised targets: js/game.js; tests/helpers/game-source.mjs; tools/lib/game-vm.cjs.

| Case / meaning and range | Assertion spans |
|---|---|
| game.js ships the vs≤15 1.06 plateau / 15–30 blend / raw≥30 lockTaper (31–38) | 33, 34–35, 36–37 |
| vs ≤ 15 holds the 1.06× low-speed plateau (40–45) | 43 |
| vs ≥ 30 is bit-identical to the old hyperbolic taper (47–54) | 52 |
| blend 15–30 is monotone and lands on the endpoints (56–67) | 58, 59, 63, 64 |
| applied full-lock delta: hairpin holds 1.06×STEER_MAX_SLIP; ≥60 m/s matches old taper (69–112) | 97–98, 104–105, 109 |

Exact top-level helper/fixture function spans: rawTaper 19–21; lockTaper 26–29.

## Coverage, generated instances and cleanup findings

Exact assigned coverage: 22/22 files, 4,976/4,976 lines, 216 declared test-call sites. Dynamic expansions: projection grid site runs Suzuka/Monaco/Spa; spotter invalid-warning site runs still-there/side-change/initial-warning; playback refusal runs stalled/rejected; outgoing Spotify cleanup runs disconnect/replace-client/clear-client. Other per-case loops are assertions over values rather than additional Node test declarations.

Retain regression comments that explain anti-vacuity, audible-versus-decoded ownership, synthetic fixture selection, copied oracles and excluded geometry; these delimit evidence. Cleanup candidates: start-race-latch header says “both tests” though four are declared; spline-fold header claims same lap ±1% while the final case allows 3%; source-integrity opening “three checks” predates many added contracts, and “nothing was running them” is historical rationale rather than current suite state. Its HTML comment calls the shell the only HTML, which should be read as runtime shell rather than a repository inventory. The stage-minify header references an issue-era deployment context; retain the concrete String(fn) and global-name rationale. Slider glare recipe case logs plan/definition diagnostics that could be removed without changing assertions. Soundtrack boot exposes several broad harness options unused by these four cases, a possible shared-helper consolidation rather than production dead-code evidence. Steel-role's long measurement rationale is unusually large but explains why an alias is intentional; compress only while preserving numeric assumptions.

No production dependency was judged removable from test text alone. Raw source pins throughout these files are structural evidence, vulnerable to formatting/refactoring and weaker than runtime behavior; gameSource is already used in migrated steering and portrait cases. Archive-only references are intentionally excluded from this Markdown. No source or comment cleanup was applied.
