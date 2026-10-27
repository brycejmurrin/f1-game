# Unit group 51 — complete source map

Read-only map of all 19 assigned files, 4,472 source lines, 2026-10-27. Every assigned line was returned in individual source calls of at most 90 lines and under 10,000 characters. Truncated aggregate responses were reread in bounded returns (store-registry 1–90, surface-id-parity 1–270, team-livery 271–360). No tests, browser sessions, runtime edits or commits. Inclusive line ranges; case rows state asserted meaning, not test verdicts.

## Navigation and dependency boundaries

Read AGENTS.md and `.claude/skills/code-nav/SKILL.md`. Attached apex-lsp resolves GameStore at js/core/store.js:2 and SteerTuning at js/input/steer-tuning.js:2. Storm references: game, atmosphere, race-control, storm-flash, weather-arc and its declaration (11 references / 6 files). SurveyHud: renderer-picker, game and declaration (8 / 3). Liveries.forTeam: custom-liveries, liveries and cockpit-preview (9 / 3). Car3D.bodyAnchors resolves through the alias at car3d:211 and exported member at 2888, so those locations are alias/export evidence rather than a unique implementation body.

Dependency inventories below contain existing tree paths only. Node built-ins, espree and Python are external. abs-src, seed-save-migrate, seed-log, seeded-fuzz, glx-mock, fn-source, mini-dom and game-vm define harness boundaries. The shared store-key-scan helper excludes circuit data, vendor/three library islands and presets data; seed-save-migrate loads real career migration before GameStore. Synthetic report/transcript locations, fixture scripts, fake origin/build values and rejected identifiers are intentional test data. No archive source is needed by these suites.

## tests/unit/steer-presets.test.mjs

Read 1–345; SHA-256 ce9b85b188c2e05d888c2fe08a5725692226e58eb9045d15ccbd7ac8f1f99365. 16 declared case sites; 51 direct assertion calls.

Preset/FEEL/default equivalence, calm-to-SIM ladder, capability changes, slider persistence, chip ownership and stale claim reconciliation.

Fixtures and limits: table 38–51 extracts brace-balanced source tables; bootTuning 148–177 supplies fake nodes, captured row/event handlers, disk and no-op/recording Input. Table extraction is format-sensitive; VM callbacks do not prove real DOM or car response.

Exercised targets / source dependencies: `js/input/steer-tuning.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| every preset bundle lands exactly ON its feel level | 66–74 | 69–71 |
| NO preset — named here or not — can match no level at all | 76–91 | 85–89 |
| STANDARD is the shipped car: it equals the store fallbacks exactly | 93–100 | 97–98 |
| materialized shipped brake cue keeps STANDARD after an ALL restore | 102–111 | 110 |
| the ladder is monotonic on what it differentiates: LOCK and the speed taper | 113–128 | 120–121, 123–124, 126–127 |
| RELAX is the most forgiving bundle, which is the whole point of it | 130–139 | 134–135, 136, 137, 138 |
| the open settings haptics row follows phone capability changes and pad disconnects | 179–191 | 182, 184, 186, 188, 190 |
| each driving slider applies on input and re-applies from storage after a reload | 196–230 | 222, 224, 227, 228 |
| FEEL › SIM on a fresh install does not light a preset its unset keys do not match (B·H11 hunt) | 232–245 | 238, 239, 244 |
| a row no preset writes (HAPTICS, pad DEAD ZONE, WEIGHT, …) keeps the preset chip | 253–270 | 254, 258, 261–262, 266, 268, 269 |
| a preset-owned row still clears the chip | 272–281 | 275, 277, 279 |
| lineBand treats PUSH / non-named notches as CUSTOM, never CORNERS | 283–290 | 286, 287, 288, 289 |
| AIDS fold and DRIVING HELP row share OFF/MEDIUM/HIGH labels | 292–300 | 296, 297, 298, 299 |
| STEER ASSIST fold token is STEER OFF, not LINE OFF | 302–306 | 304, 305 |
| refreshPresetButtons reconciles a stale preset chip against live values | 308–331 | 312, 313, 314, 323–324, 330 |
| the injected AUDIO DRIVING CUES row drops the preset chip by delegation (bug-hunt H11) | 333–345 | 338, 341, 344 |

Shared helper assertion spans: 40.

Top-level helper/fixture function spans: table 38–51; bootTuning 148–177; presetOwned 248.
Imported local harness/tool dependencies: `tests/helpers/abs-src.mjs`.


## tests/unit/steer-tuning-lock.test.mjs

Read 1–45; SHA-256 7505fea24d2bb7ac0fd7868c047740ddc2dc3fe58cb9b7546caa070ec79e4dbf. 2 declared case sites; 10 direct assertion calls.

Shipped steering lock and touch range calibration.

Fixtures and limits: lockFromSlider 13–15 duplicates the formula but source regex pins it; extractFn 25–34 evaluates the real touch function. Not a runtime input/physics test.

Exercised targets / source dependencies: `js/input/steer-tuning.js`; `js/input/input.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| lockFromSlider source: notch 7 is 0.35 rad (NORMAL / STANDARD steerLock) | 17–22 | 18, 19, 20, 21 |
| touchRangeFromSlider: notch 5 is input.js TOUCH_RANGE_FRAC 0.12, ends 0.24 / 0.06, monotonic | 36–45 | 40, 41, 42, 43, 44 |

Shared helper assertion spans: 27.

Top-level helper/fixture function spans: lockFromSlider 13–15; extractFn 25–34.
Imported local harness/tool dependencies: none.


## tests/unit/storage-key-prefix.test.mjs

Read 1–65; SHA-256 486583d426759777eeae230082a10dd1253cff141f46444fbe075b538114f94f. 2 declared case sites; 3 direct assertion calls.

Literal raw-storage prefix hygiene and removal of obsolete exceptions.

Fixtures and limits: walk 26–33 inventories JS; one documented ghost legacy key exemption. Regex sees literal dotted get/set/remove APIs only; aliases/computed keys and comments can evade or satisfy it.

Exercised targets / source dependencies: `js/car/ghost.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| every literal localStorage/sessionStorage key is apex26.-prefixed (or allowlisted with a reason) | 35–53 | 50–52 |
| the allowlist does not hold entries the tree no longer needs | 55–65 | 58, 61–62 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: walk 26–33.
Imported local harness/tool dependencies: none.


## tests/unit/store-cross-tab.test.mjs

Read 1–1158; SHA-256 7764d297f9bc19aa0047975608efa911b66d5c345de5112427fc7652c752f00c. 54 declared case sites; 294 direct assertion calls.

Cache/revision invalidation; session versus durable write results; mirror batching, ownership, baseline recovery and races; corruption, raw lane retries, career/season migration and page lifecycle.

Fixtures and limits: load 37–63 uses Map disk, mutable quota/security error and captured storage listener; evt 116 models foreign events. fakeIndexedDb 233–297 implements microtask requests and macrotask/held/aborted transactions, read/scan counters and row metadata. loadMirrored 299–326 adds IDB and visibility/pagehide hooks; bootLogged 771–788 captures warnings. loadCareerMirrored 805–823 adds real Career/SeasonCal/Backup plus stub roster, tracks and Parts; savedCareer 825 seeds v0 saves. Synthetic shared disk/IDB exercises ordering, not browser multi-tab scheduling, eviction or process-crash durability.

Exercised targets / source dependencies: `js/core/store.js`; `js/core/hash32.js`; `js/core/mat4.js`; `js/data/driver-ratings.js`; `js/career/career.js`; `js/career/season-cal.js`; `js/career/career-backup.js`; `js/camera/cam-comfort.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| durable-only refusal preserves prior pending session ownership for retry | 65–85 | 75, 76, 77, 78, 79, 80, 81, 83, 84 |
| durable-only serialization refusals never replace prior cache or enqueue invalid retries | 87–99 | 93, 94, 95, 96, 97 |
| write reports session success separately from reload durability | 101–113 | 106–108, 109–110, 111–112 |
| the module arms its own storage listener at load | 118–123 | 120–122 |
| without the listener the cache lies — the setup this suite is about | 125–132 | 128, 130–131 |
| a foreign write to an apex26. key drops exactly that key and the next read is fresh | 134–150 | 138, 139, 144, 149 |
| rev bumps on a foreign write, so memoised derivations re-run | 152–157 | 156 |
| keyRevision changes only for the key that moved | 159–168 | 164, 165, 167 |
| subscribers receive named foreign changes and can unsubscribe | 170–178 | 177 |
| a foreign clear() drops the whole cache | 180–192 | 184, 185, 190, 191 |
| a foreign write to someone else's key is ignored entirely | 194–204 | 198, 200, 201, 203 |
| a write this tab made still wins its own cache — no self-invalidation loop | 206–223 | 210, 211, 215, 218, 219, 222 |
| a career-only mirror flush reads its own key and leaves authored totals | 328–356 | 336, 337, 340, 342, 343, 344, 345, 346, 347, 353, 354, 355 |
| an authored mirror flush still scans every row and refreshes the totals | 358–371 | 362, 366, 367, 368, 369, 370 |
| career and season writes are mirrored into IndexedDB; other keys are not | 373–390 | 381, 383–384, 385, 386, 389 |
| a quota-refused save still reaches the mirror | 392–400 | 396, 398–399 |
| at boot the mirror restores only what localStorage lacks, and announces it | 402–429 | 413, 417, 418, 419, 420, 421, 423, 424, 426–427, 428 |
| a failed mirror transaction retains its batch and a later flush retries it | 431–444 | 437, 438, 439, 441, 442, 443 |
| a failed mirror batch never replaces a newer pending value for the same key | 446–458 | 453, 455, 456–457 |
| overlapping mirror flushes serialize so an older value cannot commit last | 460–481 | 467, 472–473, 476, 477, 478, 479–480 |
| a quota-refused save to an EXISTING slot wins at the next boot, over the stale disk copy and its re-save | 483–501 | 493, 496, 497, 499, 500 |
| a peer tab cannot replace an lsOk:false mirror row with an older lsOk:true value | 503–522 | 519–520, 521 |
| the tab that wrote the quota-refused row can still supersede it (no rollback on reload) | 524–545 | 537, 542, 543, 544 |
| a refused career mirror cannot roll back a newer primary saved before the mirror flush | 547–572 | 558, 564, 565, 566, 569 |
| repeated automatic migrations keep the pre-repair baseline for genuine refused-save recovery | 574–584 | 581, 582 |
| without indexedDB the mirror is inert and the store is unchanged | 586–593 | 588, 589, 591, 592 |
| the time-trial board caps classes but keeps the record and the class in use | 603–618 | 610, 611, 612, 613, 616, 617 |
| BLOCKED storage: a read that throws is remembered, not retried (and re-logged) every frame | 621–634 | 631, 632, 633 |
| BLOCKED storage: a throwing global getter does not abort boot when IndexedDB exists | 636–654 | 643–644, 646–647, 648, 649–650, 651, 652–653 |
| BLOCKED IndexedDB getter preserves primary writes and observer notifications | 656–676 | 661, 666, 667, 668, 669, 670, 672, 673, 674, 675 |
| a restored newer row that LANDED makes this session its owner: its later saves replace the row, no rollback next boot | 678–695 | 687, 690, 691, 694 |
| an oversized numeric literal on disk is refused, not returned as Infinity | 701–713 | 704–705, 708–709, 712 |
| a corrupt key is removed and logged; storage is not flagged broken | 718–729 | 722, 723, 724, 725, 726, 727, 728 |
| write(k, undefined) removes the key instead of storing the string "undefined" | 731–747 | 734, 736, 737, 738, 739, 741, 745, 746 |
| write rejects top-level functions and Symbols without deleting the previous value | 749–767 | 755, 756, 757, 758, 759, 762, 763, 764, 765, 766 |
| writeFailed() names a failed write until that key is written durably again | 790–801 | 793, 794, 795, 798, 800 |
| an explicit backup import before mirror restore survives Career.load migration re-saves | 827–840 | 833, 834, 837, 838, 839 |
| automatic Career.load migration still adopts the newer refused mirror save | 842–855 | 846, 847, 848, 849, 852, 853, 854 |
| deleting a career before restore cannot resurrect it, even when localStorage is full | 857–874 | 862, 865, 866, 871, 872 |
| a former mirror owner cannot overwrite another tab's finished career round | 876–905 | 892, 895, 896, 900, 901, 904 |
| an aborted mirror transaction cannot grant ownership of a peer's next payload | 907–921 | 915, 919, 920 |
| standalone season migration yields to recovery but an explicit replacement survives it | 924–946 | 934, 935, 939, 940, 942, 943 |
| unchanged standalone setup APPLY still recovers a newer mirror save | 948–965 | 956, 957, 958, 961, 962, 963, 964 |
| a stale deletion cannot remove a peer's newer mirror-only career | 967–978 | 976, 977 |
| legacy slot migration cannot displace a newer current-layout mirror save | 981–997 | 986, 987, 990, 991, 992, 995 |
| a storage event from another storage area (sessionStorage) leaves the cache alone | 999–1015 | 1002, 1005, 1006–1007, 1008, 1009, 1011, 1013, 1014 |
| retryFailed rewrites a refused JSON write once storage has room, and clears writeFailed | 1017–1033 | 1019, 1020, 1021, 1023, 1024, 1025, 1028, 1029, 1030, 1031, 1032 |
| retryFailed carries the raw lane too, and a later successful write drops the entry | 1035–1047 | 1037, 1038, 1042, 1043, 1044, 1045, 1046 |
| a value JSON cannot serialise is refused whole: cache, rev and mirror are untouched | 1049–1073 | 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1068, 1069, 1070, 1071, 1072 |
| onversionchange drops the memoised IndexedDB handle, so the next flush reopens instead of using a closed db | 1075–1084 | 1078, 1082, 1083 |
| failed raw deletion replaces an older set and retries the deletion | 1087–1102 | 1094, 1095, 1096, 1098, 1099, 1100 |
| raw failures retain touch comfort and foreign writes supersede pending session values | 1104–1120 | 1108, 1109, 1112, 1113, 1117, 1119 |
| hidden flush commits before debounce; visible leaves the mirror queued | 1123–1134 | 1126, 1128, 1129, 1132, 1133 |
| hidden and pagehide serialize a held batch and retain the newer value after abort | 1136–1158 | 1144, 1145, 1146, 1147, 1148, 1150, 1153, 1154, 1155, 1156, 1157 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: load 37–63; evt 116; fakeIndexedDb 233–297; loadMirrored 299–326; bootLogged 771–788; loadCareerMirrored 805–823; savedCareer 825.
Imported local harness/tool dependencies: `tests/helpers/seed-save-migrate.mjs`; `tests/helpers/abs-src.mjs`.


## tests/unit/store-key-types.test.mjs

Read 1–229; SHA-256 a097800b65ca63570deb7ce9a97032639664f9f2f284e11a506ce5bf36cfa7c4. 5 declared case sites; 14 direct assertion calls.

AST key-type consistency, alias scanner self-check, TT board v1-to-v2 migration, storage size and corrupt row handling.

Fixtures and limits: walk 48–56, litType 60–73, scanFile 75–119 and jsFiles 121–129 scan literals/defaults; loadStore 176–188 uses Map storage and real migration; host 189 normalizes VM realms; ctxOf 191–192 seeds 516-character contexts. Computed values/keys are ignored; alias collection is not scope-aware. Size assertion counts JS characters, not UTF-8 bytes.

Exercised targets / source dependencies: `js/core/store.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| no storage key is written with two different value types | 131–156 | 141, 155 |
| the scanner resolves an aliased key, which is how the defect hid | 162–173 | 170–171 |
| TT board: a v1 array reads the same rows per class, and the first v2 write loses no lap | 194–212 | 201, 202, 207, 208, 210, 211 |
| TT board: a full board (10 laps x 6 classes of 516-char contexts) stays under 15 KiB | 214–223 | 219, 220, 222 |
| TT board: junk in a v2 blob is dropped, not thrown on | 225–229 | 227, 228 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: walk 48–56; litType 60–73; scanFile 75–119; jsFiles 121–129; loadStore 176–188; host 189; ctxOf 191–192.
Imported local harness/tool dependencies: `tests/helpers/seed-save-migrate.mjs`; `tests/helpers/abs-src.mjs`.


## tests/unit/store-registry.test.mjs

Read 1–329; SHA-256 9b7622c317a6c412911b681ba12d6ac0923bc33faeaee114297b567aa74863f8. 9 declared case sites; 22 direct assertion calls.

Storage census health floors and writerless/mixed-default ratchets, with lexical AST proofs for indirect writers and negative scanner fixtures.

Fixtures and limits: indirectWriters 47–146 tracks bindings, mutations and finite forwarding fixed point; inventory 148–177 combines AST evidence with line regexes. WRITERLESS 180–186 and MIXED_DEFAULTS 197–198 are tolerated sets; synthetic temporary probes are removed in finally. Dynamic writers outside supported lexical shapes remain unknown; known exceptions are not proven bugs.

Exercised targets / source dependencies: `js/ui/condition-cue-controls.js`; `js/ui/key-binds.js`; `js/game.js`; `js/core/save-schema-registry.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| the scanner still sees the store (health floor, not a ceiling) | 203–210 | 205, 206, 207, 208, 209 |
| RATCHET: no new apex26.* key without a writer in code | 212–218 | 214–216, 217 |
| RATCHET: no new key read with two different defaults | 220–228 | 225–226, 227 |
| the scanner sees a second default and a writer-less key in every lane | 232–247 | 243, 244, 245 |
| indirect writers require a lexical path to a real storage write | 249–263 | 262 |
| production helper/config writers are independently discovered at their actual call sites | 265–277 | 273, 274, 275 |
| lookalike helpers, unused configs, comments and shadowing cannot hide unknown developer flags | 279–308 | 305–306 |
| local forwarding chains resolve writers without treating a read-only wrapper as a writer | 310–322 | 319, 320, 321 |
| the shared js/ walk includes the engine and skips circuit data, vendored code and presets tables | 325–329 | 327, 328 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: indirectWriters 47–146; inventory 148–177; listDefaults 201.
Imported local harness/tool dependencies: `tests/helpers/store-key-scan.mjs`.


## tests/unit/storm-vm.test.mjs

Read 1–110; SHA-256 55e33fe7e8de172f10ceb635587f13a2336e3cd1ef04ea2d8807a3dcd3309a43. 4 declared case sites; 18 direct assertion calls.

Game-VM storm grip/cautions, seeded flashes and reduced-motion preference, room staging and forecast agreement with the armed arc.

Fixtures and limits: before/after 17–18 create/close one Monza game; race 21–26 stages weather and goes headless; flashes 53–62 advances and samples half-second frames. Real game orchestration runs against inert DOM/render harness; no real GPU or visual brightness proof.

Exercised targets / source dependencies: `tools/lib/game-vm.cjs`; `js/game.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| a storm race: rain's wetness and grip; the start behind the safety car only with CAUTIONS on | 28–50 | 34, 35, 36, 37, 39, 40, 41, 47, 48 |
| lightning strikes in a storm, and never flashes under REDUCED MOTION | 64–81 | 66, 73, 76, 79 |
| a friend room keeps a storm staged: the lobby accepts it | 83–91 | 87, 89 |
| MIXED: the sheet's FORECAST line shows the plan the green arms, and STABLE hides it | 93–110 | 100, 105, 109 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: race 21–26; flashes 53–62.
Imported local harness/tool dependencies: none.


## tests/unit/storm-weather.test.mjs

Read 1–290; SHA-256 5eb42af9d13982fe4a41247caf1a1ba7fd910fe1b7818df1340667bf2eb9494e. 14 declared case sites; 69 direct assertion calls.

Pure storm ladder/grip/particles, weather-plan odds and room lifecycle, deterministic lightning interval ownership, reduced-motion source gate, safety-car windows and weather UI/lobby parity.

Fixtures and limits: context 26–33 seeds randomness; bootArc 36–56 loads real arc, tyre, particles and storm over stub G/audio; walk 78–90 steps arcs; bootRC 181–195 stubs debris/network/store and advances raceT. Drawn particle counts and source expressions are not pixel/audio evidence.

Exercised targets / source dependencies: `js/core/mat4.js`; `js/physics/consts.js`; `js/physics/tyre-model.js`; `js/fx/particles.js`; `js/race/storm.js`; `js/race/weather-arc.js`; `js/race/race-control.js`; `js/race/race-settings.js`; `js/net/lobby-settings.js`; `js/agent/apex.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| storm is on the ladder above rain, and an arc walks to it stage by stage | 58–64 | 60, 61, 62, 63 |
| a storm's road wetness, tread call and grip are exactly rain's | 66–76 | 71, 72, 73, 74, 75 |
| dry → storm stages dry, wet, rain, storm in order; storm → dry walks back down | 92–98 | 94, 95, 97 |
| storm rain is heavier than rain: more streaks drawn | 100–104 | 102, 103 |
| MIXED: a drawn rain escalates to storm, in a friend room too | 106–125 | 111, 115, 120, 124 |
| lightning: the schedule is a pure function of the seed and clock, and frame-rate independent | 127–149 | 131, 133, 135, 136, 137, 138, 139, 145, 147, 148 |
| lightning: interval filtering preserves exact strike records and endpoint ownership | 151–168 | 158, 159, 160, 162, 163, 167 |
| lightning never flashes under reduced motion (source guard on renderLightingPrep strike) | 170–178 | 172, 173, 175, 176, 177 |
| a race STARTED in a storm runs behind the safety car, then goes green | 197–208 | 200, 201, 202, 203, 205, 207 |
| a storm rolling in mid-race deploys the SC until it eases back to rain | 210–223 | 213, 216, 218, 221, 222 |
| CAUTIONS off: a storm raises no SC and no storm call; a scripted hold still flies | 225–260 | 232, 233, 234, 236, 241, 246, 248, 251, 253, 256, 259 |
| RACE SETTINGS: the ⛈ STORM chip is offered solo and in a room, matching the lobby's WEATHER list | 262–272 | 267, 269, 270, 271 |
| __apex.race() keeps weather "storm" instead of racing it dry | 274–279 | 277, 278 |
| R2: a practice rewind does not extend the storm SC (raceT jumps back, the window follows) | 281–290 | 286, 289 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: read 23; run 24; context 26–33; bootArc 36–56; walk 78–90; bootRC 181–195.
Imported local harness/tool dependencies: `tests/helpers/seed-log.mjs`; `tests/helpers/seeded-fuzz.mjs`; `tests/helpers/abs-src.mjs`.


## tests/unit/stuck-census.test.mjs

Read 1–37; SHA-256 2d5f602728d22244d0fecd29d7fc60f474270ad6043d340ae37b17fcbcf39bf5. 3 declared case sites; 9 direct assertion calls.

Synthetic AI stuck-episode hysteresis, exact-zero rescue filtering and independent car counters.

Fixtures and limits: DT 6 and feed 7 drive samples at 60 Hz. No real AI rescue or race is run.

Exercised targets / source dependencies: `tools/lib/stuck-census.mjs`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| a stuckT climb through the threshold is ONE episode until it falls back under half | 9–18 | 12, 15, 16, 17 |
| a rescue is rescueT dropping to exactly 0 in one frame; the idle decay and a pit box are not | 20–28 | 23, 25, 27 |
| cars are counted independently and an idle car reports zeros | 30–37 | 35, 36 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: feed 7.
Imported local harness/tool dependencies: `tools/lib/stuck-census.mjs`.


## tests/unit/subagent-contract-hook.test.mjs

Read 1–159; SHA-256 9e9911453873e87b2fa73bc8eee6a20353f6d6ea131444d9476966f0e0039f9b. 9 declared case sites; 20 direct assertion calls.

Real Python report-contract hook acceptance, row caps, shape/required lines, fail-open policy, matcher wiring and one-denial handback guard.

Fixtures and limits: run 23–28 would spawn python3; stop 29–32 supplies synthetic event payloads; passes 33 and blocks 34–39 share assertions; finding/claim/known/bloat/site 41–45 and GOOD 47–55 are report specimens. Fake report locations/transcripts are text inputs, never dependencies. Tests inspect hook JSON/settings, not a live Claude subagent integration.

Exercised targets / source dependencies: `.claude/hooks/subagent-contract.py`; `.claude/settings.json`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| a good report from every contracted agent passes | 57–61 | shared assertion helpers; see fixture ranges |
| over the row cap blocks | 63–71 | shared assertion helpers; see fixture ranges |
| a missing verdict / required line blocks | 73–79 | shared assertion helpers; see fixture ranges |
| a wrong prefix or row shape blocks | 81–90 | shared assertion helpers; see fixture ranges |
| the block reason is one paragraph that names the agent file | 92–96 | 94, 95 |
| fail open: loop guard, unknown agents, denial reports, empty and garbage input | 98–111 | shared assertion helpers; see fixture ranges |
| settings.json runs the hook on SubagentStop for exactly the contracted agents | 113–124 | 116, 119, 120, 123 |
| a malformed report handed back through SubagentHandback is denied once, with the contract reason | 133–151 | 141, 142, 143, 144, 145 |
| settings.json runs the contract hook on PreToolUse SubagentHandback | 153–159 | 156, 157, 158 |

Shared helper assertion spans: 33, 33, 35, 36, 37, 38.

Top-level helper/fixture function spans: run 23–28; stop 29–32; passes 33; blocks 34–39; finding 41; claim 42; known 43; bloat 44; site 45.
Imported local harness/tool dependencies: none.


## tests/unit/surface-id-parity.test.mjs

Read 1–439; SHA-256 6e469dda1761b33d03c6cd805b0d09e0d66aa89026499b52cbae29a2b4a780d0. 15 declared case sites; 83 direct assertion calls.

Surface ID/classification coverage and cross-language constants/order for visor, normal maps, puddles, particles, sun/moon, car wet/AO/materials, lamps, road paint, baked pack gating and per-draw carFinish.

Fixtures and limits: BACKENDS 30–37 names regexes; stripComments 41 and idsIn 42–46 implement census. Inline shader slice helpers assert source markers; final case uses real GradeTint, extracted garage/viewer/WGX functions and bootGlx mock. Source parity does not compile GLSL/WGSL/TSL or establish GPU visual equivalence.

Exercised targets / source dependencies: `js/render/glx/shaders/glsl-lit.js`; `js/render/webgpu/wgsl-chunks.js`; `js/render/three/tsl-lit.js`; `js/car/car-materials.js`; `js/render/glx/shaders/glsl-fx.js`; `js/render/three/tsl-fx.js`; `js/render/webgpu/wgsl-fx.js`; `js/render/webgpu/wgx.js`; `js/render/glx/shaders/glsl-sky.js`; `js/render/three/tsl-sky.js`; `js/render/glx/glx.js`; `js/fx/grade-tint.js`; `js/garage/scene.js`; `tools/carview.html`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| every car surface id is branched on in all three shading languages | 48–61 | 52, 57–59 |
| classifiedCar's upper bound covers every id each backend branches on | 63–72 | 66, 68–70 |
| every id the shaders branch on is a real Car3D surface, and vice versa | 74–97 | 84, 87, 90, 94, 96 |
| the visor's dielectric reflection constants agree across the three backends | 99–127 | 108, 121–122, 125–126 |
| the baked normal map's tangent frame is the tile's world axes on every backend | 129–158 | 141, 151–152, 153–154, 155–156 |
| puddles follow the road shape on every backend — crown drains, the low side of a camber pools | 160–186 | 167, 170, 171, 172, 173, 175, 178, 179, 180, 182, 183, 184, 185 |
| particles are lit by the frame hemisphere and fogged by the lit pass's fog on every backend | 188–212 | 195, 196, 197, 200, 201, 202, 203, 206, 207, 208, 209, 210, 211 |
| the sun disc sits behind the cloud deck on every backend | 214–240 | 224, 232, 233, 234, 235, 236, 237, 238, 239 |
| the moon disc hangs on the night key light, not a constant, on every backend | 242–265 | 251, 260–261, 262–263 |
| car materials: wet look, ground AO, metal env, sidewall and carbon agree on every backend | 267–311 | 306, 309–310 |
| lamps and the baked lamp pools light the base BEFORE the lacquer's ccTrans absorb on every backend | 317–344 | 332, 334, 336, 342, 343 |
| road paint reaches the edge lines on WGX: roadMarkings is not gated on the asphalt id | 346–365 | 351–352, 355, 357–358, 362, 363–364 |
| the baked normal map has its own fade on WGX, not the procedural bump's early returns | 367–383 | 374, 375–376, 379, 381–382 |
| no material pack means no baked mix on WGX, as on GLX | 385–401 | 389, 391, 392–393, 398, 399–400 |
| carFinish: every car-paint source sets it, and GLX / WGX hand it to the shader per draw | 405–439 | 411, 414, 416, 419, 427, 429, 437, 438 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: read 27; stripComments 41; idsIn 42–46; code 315.
Imported local harness/tool dependencies: `tests/helpers/abs-src.mjs`; `tests/helpers/glx-mock.mjs`; `tests/helpers/fn-source.mjs`.


## tests/unit/survey-hud.test.mjs

Read 1–269; SHA-256 4ca44f0cc7dc9d297815992391cd9c24dd4310979cdf89795e69a85f16b5e4f7. 15 declared case sites; 86 direct assertion calls.

Survey flag OR activation, chrome fixture/pause/context-loss recovery, denied storage and boot/manifest/CSS-play wiring.

Fixtures and limits: load 16–23 evaluates real SurveyHud; memStore 27–34 is fake storage; fakeDom 66–104 supplies nodes, classes, docks and screen queries. No layout, accessibility or WebGL context is exercised.

Exercised targets / source dependencies: `js/ui/survey-hud.js`; `js/perf/renderer-picker.js`; `js/game.js`; `tools/ui/css-play.mjs`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| enabled: query ?APEX_SURVEY_HUD=1 wins | 36–41 | 37, 38, 39, 40 |
| enabled: hash #APEX_SURVEY_HUD=1 (also &-joined) wins | 43–48 | 44, 45, 46, 47 |
| enabled: localStorage APEX_SURVEY_HUD==="1" wins; any one is enough | 50–57 | 51, 52, 53–54, 55–56 |
| enabled: missing / hostile inputs are off | 59–63 | 60, 61, 62 |
| apply: shows #hud + docks + pausebtn; hides overlay / nogl; no race warm | 106–131 | 113, 114, 115, 116, 117, 118, 119, 120, 121, 122–123, 124, 125, 126, 127, 128, 129, 130 |
| apply: hides WATCH transport play chrome if present | 133–141 | 138, 139, 140 |
| apply: works without LoadingScreen.busy (pre-#1012 tip) | 143–149 | 146, 147, 148 |
| openPause: unhides #pausemenu without race state | 151–157 | 154, 155, 156 |
| holdChrome: restores #hud after Graphics unavailable / ctxLost hide | 159–173 | 167, 168, 169, 170, 171, 172 |
| holdChrome: works from document.getElementById alone (no $) | 175–182 | 179, 180, 181 |
| showUnavailable survey early-return keeps HUD (#1033 ctxLost) | 184–198 | 188, 190, 191, 192, 196–197 |
| boot: applies when armed; wires pause + webglcontextlost rehold | 200–220 | 207–209, 210, 211, 212, 213, 218, 219 |
| boot: off when flag unset | 222–228 | 224–226, 227 |
| armed and boot tolerate a denied global storage getter, including query activation | 230–242 | 233, 236, 237, 239, 240, 241 |
| manifest + game.js boot hook + css-play screen are wired | 244–268 | 249, 250, 251, 254, 255, 256, 257, 259, 260, 261, 263, 264, 265, 266, 267 |

Shared helper assertion spans: 21.

Top-level helper/fixture function spans: read 14; load 16–23; memStore 27–34; fakeDom 66–104.
Imported local harness/tool dependencies: `tests/helpers/abs-src.mjs`.


## tests/unit/suzuka-circuit-wheel.test.mjs

Read 1–64; SHA-256 2a41e0f32b8da97e1800afeb7118819b4e74b4314a7fca19cb72b9ecfa300c67. 1 declared case sites; 1 direct assertion calls.

Required wheel registration/landmark emission, height/distance skyline bounds and mid-lap stand camera gap.

Fixtures and limits: blockYRange 14–30 measures emitted block positions; real buildContext creates Suzuka and landmark JSON/source regex supplements geometry. Numeric AABB and sampled road distances do not prove orbit visibility/occlusion pixels.

Exercised targets / source dependencies: `js/circuits/scenery/suzuka.js`; `tests/data/landmarks/suzuka.json`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| suzuka-circuit-wheel owns Motopia skyline and clears orbit @ 0.50 | 32–64 | 53–63 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: blockYRange 14–30.
Imported local harness/tool dependencies: none.


## tests/unit/suzuka-crossover-span.test.mjs

Read 1–86; SHA-256 c50a32b3f706fe31ba8a0406820ad1482333aa18887dd23fbc75d697f62ac3d2. 2 declared case sites; 14 direct assertion calls.

Green overhead flushness, required crossover model diagnostics, lower clearance and soffit seating under upper ribbon.

Fixtures and limits: blockYRange 12–24 measures block bounds; real Suzuka build and fractions 0.845/0.437 sample crossing elevations. ymax includes whole block, ymin includes piers; no underside or raster claim.

Exercised targets / source dependencies: imports listed below.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| suzuka-crossover-green-span emits flush with the upper ribbon | 26–57 | 29, 32, 35, 36, 37–40, 43, 44, 47, 50, 56 |
| suzuka-crossover-deck soffit seats under the upper ribbon | 59–86 | 67, 73–76, 78, 82–85 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: blockYRange 12–24.
Imported local harness/tool dependencies: none.


## tests/unit/sw-build-meta.test.mjs

Read 1–172; SHA-256 a315ab90dd3e3320ca141ef6c9384487dc572d39886d379ace0db546e01c618f. 3 declared case sites; 6 direct assertion calls.

Navigation cache rejects no-build-meta HTML while preserving normal matching shell caching and offline fallback.

Fixtures and limits: requestKey 17–20 normalizes URLs; createHarness 22–101 supplies in-memory Cache API, listener capture, real Request/Response/webcrypto and controlled fetch. Build 321 and captive portal strings are fixtures; no installed browser service worker or real captive network.

Exercised targets / source dependencies: `sw.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| query-less navigation with no apex-build meta is not written to the shell cache (#3293) | 103–127 | 121, 125, 126 |
| query-less navigation with a matching apex-build meta is still written | 129–145 | 142, 144 |
| offline after a no-meta 200 still serves the prior precached shell | 147–172 | 171 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: requestKey 17–20; createHarness 22–101.
Imported local harness/tool dependencies: `tests/helpers/abs-src.mjs`.


## tests/unit/sweep-shards.test.mjs

Read 1–57; SHA-256 64fc93ff41ada33acf9dab5a9b61de77690de0b1639b74d6a2af85f7af645000. 6 declared case sites; 17 direct assertion calls.

Deterministic exactly-once LPT packing, fallback timing, invalid inputs, timing table membership and CLI JSON.

Fixtures and limits: files 7 and timings 8 are synthetic weights; final case would spawn CLI. Static scripts/timing inventory is coupled to current generated package script. No sweep suite or timing benchmark runs here.

Exercised targets / source dependencies: `tools/ci/sweep-shards.mjs`; `package.json`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| packs every suite exactly once and keeps the result deterministic | 10–16 | 13, 14, 15 |
| unknown suites use a bounded fallback weight | 18–23 | 20, 21, 22 |
| rejects duplicate suites and invalid shard counts | 25–28 | 26, 27 |
| LPT packing balances shards: the heaviest-minus-lightest spread stays within the largest single suite | 30–35 | 33, 34 |
| every measured timing key names a suite test:sweeps still runs | 37–46 | 41, 45 |
| the CLI prints one shard's files as JSON for --shard/--json | 48–57 | 51, 53, 54, 55, 56 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: none; fixtures inline in cases.
Imported local harness/tool dependencies: `tools/ci/sweep-shards.mjs`.


## tests/unit/sync-pr-robust.test.mjs

Read 1–69; SHA-256 18e9b4685c2f3a5a55eae04f8707c3034c9447f1307645ddd357aae3d41ace55. 5 declared case sites; 19 direct assertion calls.

Stale branch safety, moved-origin ancestry direction, exact git argv, tooling stop parse and registered process-tree stop isolation.

Fixtures and limits: calls 13, exact 14 and git 15 stub git; final case would spawn child/grandchild/bystander and clean them in finally. This is the sole assigned suite with actual process termination behavior when run; mapping did not run it. No remote merge/push exercised.

Exercised targets / source dependencies: `tools/ci/sync-pr.mjs`; `tools/ci/tooling-fast.mjs`; `tools/lib/run-pid.mjs`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| staleSyncBranch: a leftover with no commits of its own is stale; one with commits is kept and says why | 17–22 | 18, 20, 20, 21 |
| remoteMoved: true when origin/<branch> is not contained in the merge result | 24–27 | 25, 26 |
| sync-pr asks git for exactly these refs (a wrong ref or direction fails here, not in a real merge) | 29–37 | 32, 33, 35, 36 |
| tooling-fast accepts --stop (and still rejects unknown flags) | 39–43 | 40, 41, 42 |
| stop kills a real registered process tree and nothing else | 45–68 | 56, 57, 59, 61, 62, 65 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: exact 14; git 15.
Imported local harness/tool dependencies: `tools/ci/sync-pr.mjs`; `tools/ci/tooling-fast.mjs`; `tools/lib/run-pid.mjs`.


## tests/unit/team-livery.test.mjs

Read 1–450; SHA-256 78bf0174ae4bd3ff7d18720cfd41b38e4c660ea5183707518e8c1a948fbe9c28. 18 declared case sites; 87 direct assertion calls.

Team livery duplicate/field validity, parser self-tests/tree census, draft/save/preview parity, fallback/migration, preview coalescing/hints, studio parity, sanitization, My Team slot ownership, carbon paint and concurrent edits.

Fixtures and limits: loadParts 31 loads car stack; listFrom 164–168 asserts source tables; VM cases use real Liveries/CustomLiveries/CarMaterials; final generated cases use mini-dom, extracted draft/focus/save code and Map disk. Source shape pins are formatting-sensitive; coalescing case checks expressions rather than timers; DOM fixture does not render 3D. Last site 417–450 expands missingSource=false/true into replacement versus preserve-peer-draft cases.

Exercised targets / source dependencies: `js/data/teams.js`; `js/garage/setup-sheet.js`; `js/car/liveries.js`; `js/car/custom-liveries.js`; `js/game.js`; `tools/carview.html`; `js/car/car-materials.js`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| no team record declares `livery:` twice | 33–42 | 36, 40 |
| the duplicate-key scanner knows what is and is not a duplicate | 44–74 | 52, 53, 54, 55, 58–59, 60–61, 62–63, 66–67, 68–69, 70–71, 72–73 |
| no object literal in js/ declares the same key twice | 76–94 | 93 |
| every livery field a team names is one the renderer knows | 96–141 | 130, 133–134, 137–138 |
| the paint editor builds every draft through one constructor | 170–182 | 173–175, 179, 181 |
| the editor's draft table and forTeam name the same fields | 184–203 | 201, 202 |
| forTeam's default entry carries the team's whole livery block | 207–224 | 218, 220–221 |
| resolveLivery falls back through the team's own list | 226–234 | 227–228, 229–230, 231–233 |
| resolveLivery and the live preview keep every editor tint | 236–280 | 244, 247, 250–251, 263, 264, 267–268, 269–270, 271–272, 273, 274, 275, 276, 279 |
| the save and the live preview both convert through livDraftTo | 291–300 | 292, 293, 296–297, 298–299 |
| continuous colour input coalesces expensive 3D preview rebuilds | 302–317 | 303, 304, 305–306, 307–308, 309–310, 312, 313, 314–315, 316 |
| every row in the paint editor says what it paints | 319–331 | 330 |
| the car studio passes every livery field the game does | 338–343 | 341, 342 |
| sanitizeCustom keeps only real finShape / numFont / finish ids | 347–356 | 351, 353, 355 |
| sanitizeCustom keeps only real zone-finish ids (inherit, gloss or a FINISH_SURFACE key) | 360–370 | 366, 367, 368 |
| My Team livery adapters stay within the active slot and invalidate cache without a store write | 372–402 | 388, 390, 390, 391, 392, 394, 395, 396, 397, 399, 400, 401 |
| carbon moving flap color overrides hidden wing paint and paint returns when toggled back | 404–415 | 412, 414 |
| "saving a custom edit " + (missingSource ? "keeps both drafts after another tab replaced its source" : "replaces its existing row and focuses the fitted livery") | 417–450 | 430, 442, 443, 444, 445, 446, 447, 448, 448, 449 |

Shared helper assertion spans: 166.

Top-level helper/fixture function spans: listFrom 164–168.
Imported local harness/tool dependencies: `tools/car/parts-sweep.mjs`; `tools/check/dup-keys.mjs`; `tests/helpers/abs-src.mjs`; `tests/helpers/fn-source.mjs`; `tests/helpers/mini-dom.mjs`.


## tests/unit/team-style-relief.test.mjs

Read 1–99; SHA-256 88a310e61ab1c814012d963c600c41357bc02fec5f193b5fd702e034acd00ec2. 3 declared case sites; 17 direct assertion calls.

Frozen per-team style coverage, ≥4 cm showcase silhouette separation and deterministic stock car construction.

Fixtures and limits: loadParts({shade:true}) 8 supplies car stack; STOCK 10 fixes engine/aero; SHOW 11 selects four teams; podSample 13–22 samples anchors. Last case arms host Math.random to throw and restores in finally. Geometric sampled distances do not establish full-grid visual recognizability.

Exercised targets / source dependencies: `js/car/car3d.js`; `js/data/teams.js`; `tools/car/parts-sweep.mjs`.

| Case / asserted meaning | Case range | Assertion spans |
|---|---|---|
| TEAM_STYLE lists every 2026 constructor plus the My Team default | 24–38 | 27, 30, 34, 36 |
| stock-recipe sidepods: four showcase teams stay ≥4 cm apart at the inlet or waist | 40–82 | 54, 58–59, 60–61, 63–64, 66–67, 68–69, 71–72, 73–74, 79–80, 81 |
| TEAM_STYLE is frozen and never consults Math.random | 84–99 | 85, 86, 98 |

Shared helper assertion spans: none.

Top-level helper/fixture function spans: podSample 13–22.
Imported local harness/tool dependencies: `tools/car/parts-sweep.mjs`.


## Cleanup findings and coverage

- store-registry 3–5 says there is no registry, but its final case 327 explicitly requires the current save-schema registry. The historical header should name its old baseline rather than imply the registry still does not exist; its claim that the shared scan has one home does not cover the separate type scanner in store-key-types.
- store-registry 205 is a long accumulated change log attached to an assertion; keep the ceiling contract and move historical flag explanations to their existing debug-hook documentation. WRITERLESS repeats gfxBootStepMs (Set hides it). The original hunter script location is historical provenance, not an executable dependency.
- storm-vm 4–5 claims lobby rejection, and helper comment 20 says race() lacks storm support, while its room case and storm-weather 274–279 assert the opposite. Update those comments; source guards also refer to older module owners (renderLightingPrep/lobby) while actual reads target storm-flash and lobby-settings.
- survey-hud header 2 describes only the storage property spelling; cases 50–57 correctly establish an OR of all activation channels rather than precedence despite the word “wins.” Clarify wording without changing behavior.
- sw-build-meta 4–5 retains a temporary ownership explanation for a copied service-worker harness. Consider shared harness extraction when touching both suites, preserving the no-meta response/cache distinction.
- team-livery's whole-tree duplicate scan skips every directory named three, including owned renderer code, broader than its “vendored island” comment suggests. Review scan scope before narrowing/expanding it. Many shader/editor cases intentionally pin exact source spelling; refactors require semantic review, not blind regex replacement.
- No production dependency deletion is justified by this mapping. Fake report locations, temporary probes and intentionally invalid ids must not be treated as missing files or dead production paths.

Exact coverage: 19/19 assigned files; 4,472/4,472 source lines; 186 declared test sites and 840 direct assert call sites. The final team-livery site expands twice, so there are 187 statically determined case instances (other loops iterate assertions inside cases). Shared passes/blocks/extraction helpers supply assertions beyond direct per-case spans. No runtime pass/fail evidence was gathered.
