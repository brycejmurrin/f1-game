# Unit tests 08: complete read ledger

Read 2026-10-27 at HEAD `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. Scope is group 08 of `docs/project-map/unit-batches.json`: 19 files, 4769 lines. All bodies, comments, setup and cleanup were read; oversized initial combined responses were replaced with bounded reads. No tests, browser, source edits or commits were run by this lane.

AGENTS.md and `.claude/skills/code-nav/SKILL.md` read. LSP CLI resolved Career.settleRound to js/career/career.js:1235 (module-file fallback, caller/export coverage explicitly unverified) and GLXChunked to js/render/glx/chunked.js:4. Bounded LSP bodies were navigation evidence, not full production-file reads. Other targets below are resolved from imports and literal source loads; no inferred path is claimed to exist.

## Full file ledger

| File | Lines / full read range | SHA-256 |
|---|---|---|
| `tests/unit/career-settle.test.mjs` | 1512; 1–1512 | `3506d72a0526c368cb77a376ddf99ef09e10745de0faccc782c231ad5e8642ab` |
| `tests/unit/career-ui-lazy.test.mjs` | 192; 1–192 | `d5f0299d1647de3e99497c885dc965e2cc3f6d2d37a63f306fe0c5b99f73b28d` |
| `tests/unit/carve-a-modules.test.mjs` | 131; 1–131 | `e7472b968b47f9c1844bd207c779e889d69f1316c0aaed94fb44c6a6c4931ebe` |
| `tests/unit/catalog-discovery.test.mjs` | 122; 1–122 | `38a12f05500379baee2019d7e75c233411fd2184645e4c86df9f5df6bef8615b` |
| `tests/unit/cdmcp-measure.test.mjs` | 285; 1–285 | `46f02f9cd132e64b4011b3f7a1b6ce914102a8d9b608469817717bb6c756beb6` |
| `tests/unit/census-verdict.test.mjs` | 310; 1–310 | `eb940448e802d4bef713fd1bdec7b06651c25bb222847cab39a196f45f0dec71` |
| `tests/unit/centreline-kinks.test.mjs` | 55; 1–55 | `ec6ee32a0022aeabf838780ff4d9699d257b5c3a7e5e2688c5b01182d2218189` |
| `tests/unit/change-driver-tools.test.mjs` | 306; 1–306 | `dde4db15cd7fb4c8af32e65a52e7a0d692d3ddd83654b9c215e2d25a41fbf651` |
| `tests/unit/change-kind.test.mjs` | 13; 1–13 | `3f92f0c2f5288fbcdd0b35ca5b7dd152a161c1cdbb58fe5542ce3f84dc561ec4` |
| `tests/unit/changed-files.test.mjs` | 48; 1–48 | `97de46672de5dea4563e78439eb8577ba5609d69a0cb6d4da9e3dc77f1d439cf` |
| `tests/unit/changelog-fragments.test.mjs` | 130; 1–130 | `64290c14e4047a55b51cb894e5448d5c565071194cfbbd934be7b375987317c6` |
| `tests/unit/check-js-types.test.mjs` | 25; 1–25 | `1c24e2c7a4fdd2cac1d0491d5b6803dc9b40101901d2663e042ade918b4551e1` |
| `tests/unit/chrome-server-fixes.test.mjs` | 175; 1–175 | `5ae05112dc57904fa478c5e67c3acfb75ddbe7f5f627727a4c2d2026d84e2f51` |
| `tests/unit/chromium-shell.test.mjs` | 45; 1–45 | `a8c21e94cea68cbd32db9e61cd02ca1708ca81ace61d896b24aeb1e27d5c25f7` |
| `tests/unit/chunked-index-ranges.test.mjs` | 491; 1–491 | `d51905d7d7370cc921ef2090f323cbe6a845c7ce575e038a8c192892063c1b8e` |
| `tests/unit/ci-coverage.test.mjs` | 105; 1–105 | `d6e43ced6d39d10c2f36e14b996e20c8bb073f1442d2416f627deb6999a23b09` |
| `tests/unit/ci-gate-selection.test.mjs` | 411; 1–411 | `28f66340073ee76f27c2e9eab8d7174a5ed1136eb80ba36150261444d1283064` |
| `tests/unit/ci-gpu-census.test.mjs` | 358; 1–358 | `386ab74c85f461dc387a899f2cefcc060df7656887b91365852ccd7f25b413a2` |
| `tests/unit/ci-guard-tools.test.mjs` | 55; 1–55 | `d467ab479d8b1f9af1272bbc72e9644c10156e65b2391945aa39c469854f8aa9` |

## Contracts, fixtures and assertion spans

Every row is one test declaration template, including declarations nested in parameter loops. Contract labels are test claims, qualified by the limits immediately above each table and the findings below. Assertion ranges identify every host-JS assert call in the case (including nested callbacks); embedded Python assertions are within the case body and described at file level. Helper assertions are separately listed. This is a source map, not a runtime test count or pass result.

### career-settle

Targets: Career settlement, planning, goals, rollover, offers, regulations; real js/career/career.js and career-planning.js, optional js/race/sporting-regs.js, race-control.js, season-cal.js.

Fixture: VM career rules with map-backed store, two-team or tier-spread fake grids, flat ratings for winter isolation, real ratings for goal draws; optional real sporting/calendar classification, seeded Log/Hash32/M4. Helpers load 28–75, settle 80–96, settleCleanRace 100–124, loadDriver 291–363, rollWith 367–381, loadWithSeason 476–523, settleCraft 600–615, seasonOf 698–716, hub 775–780.

Limits: Finite seeded VM scenarios; no UI, persistence failure, full real grid or live endRace proof. Case templates expand over flavours/reasons.

| Case body | Contract | Assertion spans |
|---|---|---|
| 127–141 | {flavour}: a compound-rule DSQ fails the clean objective and stored clean fact | 129, 130, 131, 132, 133, 135, 136, 137, 139 |
| 144–153 | a legal clean race keeps its objective bonus, reputation, and sponsor progress | 147, 148, 149, 150, 151, 152 |
| 160–165 | {reason} still fails the clean objective and sponsor fact | 162, 163, 164 |
| 168–173 | mate FINISHED P5: both cars in the points, so the double is recorded | 170, 171, 172 |
| 175–182 | mate classified P5 but RETIRED: a retired car scores nothing — no double | 179, 180–181 |
| 184–193 | MY TEAM: the owner draws no salary or points bonus, and both cars earn prize money | 188, 189, 190, 191, 192 |
| 195–209 | DRIVER career: the salary and points bonus still pay, and there is no team-mate prize | 206, 207, 208 |
| 211–222 | MY TEAM standings include the hired second driver | 220, 221 |
| 224–245 | MY TEAM sponsor settlement records one payout even when settlement is retried | 229, 232, 234, 235, 236, 237, 238, 242, 243, 244 |
| 247–271 | MY TEAM completing a sponsor window through settleRound cannot pay twice | 258, 260, 261, 262, 263, 264, 265, 268, 269, 270 |
| 273–282 | the retired flag is the ONLY discriminator between the two rounds | 279, 280–281 |
| 383–391 | the season goal is RESOLVED at the winter: met lifts reputation | 387, 388, 389, 390 |
| 393–399 | the season goal is RESOLVED at the winter: missed costs reputation | 397, 398 |
| 401–412 | rollover clears the weekend-started stamp: next season's same round is not pre-locked | 410, 411 |
| 414–424 | a multi-year contract suppresses the winter market until it expires | 419, 423 |
| 426–432 | offers ARE drawn the winter the contract runs out | 430, 431 |
| 434–452 | the budget ladder raises the fitted cap, three rungs then stops | 443, 444, 445, 446, 447, 448, 449, 450, 451 |
| 454–472 | RAISE THE CAP is not for sale at a rung the derived ceiling already binds | 466, 467, 468, 469, 470, 471 |
| 525–543 | settleRound is idempotent: a second call for the same raced round pays nothing | 536, 540, 541, 542 |
| 545–559 | settleRound floors money at zero after wage settlement | 558 |
| 561–571 | objective is null and trackIndex clamps once the season is done | 567, 568, 569, 570 |
| 578–591 | silly season moves the driver overall() rates highest, not a coin flip | 588, 589, 590 |
| 617–626 | craftScore is 1.00 for a faultless race and falls with each kind of mark | 619, 620, 622, 624, 625 |
| 628–634 | a RETIREMENT does not touch craft — every DNF here is a reliability draw | 633 |
| 636–650 | the same P3, scruffy by CONTACT: reputation differs, the money is identical | 643, 644, 645, 646–647, 648–649 |
| 652–661 | cuts and penalties cost money only through the brief that already priced them | 657, 658, 659–660 |
| 663–673 | the craft reputation term is bounded, and asymmetric in the clean run's favour | 671–672 |
| 675–681 | craft is recorded on the results row and averaged across the season | 679, 680 |
| 683–689 | rounds saved before craft existed are skipped, not counted as zero | 687–688 |
| 718–730 | a clean season develops the player's craft; a scruffy one costs it | 722, 723, 724–725, 728–729 |
| 732–740 | only the PLAYER'S seat reads race craft — every AI seat keeps the inferred drift | 737–738 |
| 742–767 | a season with no craft rows falls back to the inferred drift, not a bad year | 759, 763–764, 765–766 |
| 782–792 | index 0 is the brief that used to be dealt, so an old save keeps it | 785, 787, 788–789, 790–791 |
| 794–808 | choosing a brief changes what the hub shows and what settleRound pays | 798, 799, 806–807 |
| 810–819 | a pick is keyed on its round — a stale one never applies to another | 814, 816, 817–818 |
| 821–832 | the pick locks once the weekend is under way | 826, 827, 828, 831 |
| 834–848 | a SIMULATED quali or a started race locks the pick too, for that round only | 842, 843, 844, 846, 847 |
| 850–858 | the choices are drawn from the seed, so reloading cannot reroll them | 852, 857 |
| 865–872 | a deal with NO ambition resolves on the old numbers — +5 / -5 REP | 869, 871 |
| 874–885 | promising more pays more, and costs more when missed | 877, 878, 879, 881, 882, 883, 884 |
| 887–899 | the TARGET itself moves with the promise | 896, 897, 898 |
| 901–916 | a season is priced by the promise SIGNED, not by the picker's current rung | 913–914, 915 |
| 918–939 | changing the promise re-stamps the offers already on the table | 923, 930–931, 934–935, 937–938 |
| 941–951 | ambIdx refuses a rung that is not one | 947–948, 949, 950 |
| 958–971 | champPos is the fallback, so an unknown or missing kind cannot silently pass | 968–969, 970 |
| 973–990 | every declared kind derives a target and labels it | 985–986, 988 |
| 992–1003 | a persisted goal/objective type of constructor or __proto__ resolves as champPos / blank, never throws | 998, 999, 1000, 1002 |
| 1005–1018 | ambition shifts every kind that HAS a target, in the same direction | 1013, 1014, 1017 |
| 1020–1032 | each kind resolves against the season it was written for | 1024, 1025, 1026, 1027, 1028, 1029, 1030–1031 |
| 1034–1049 | goalNow / goalOnTrack resolve champPos against live standings (team id, not object) | 1045, 1046, 1047, 1048 |
| 1051–1079 | season goal progress waits for a result, not a starting grid or qualifying | 1059, 1060, 1063, 1074, 1076, 1077 |
| 1081–1098 | a completed zero-point race counts, and the next season starts pending again | 1092, 1093, 1094, 1095, 1096, 1097 |
| 1100–1109 | the kind is drawn from the seed and the year, so it cannot be rerolled | 1105–1106, 1108 |
| 1116–1136 | SIGNING AN OFFER SIGNS WHAT THE BUTTON SHOWED — the kind never redraws | 1133–1134 |
| 1138–1154 | accepting recomputes the TARGET, because a move re-seats you | 1146, 1151–1152, 1153 |
| 1156–1170 | an offer carrying no goal at all still signs something resolvable | 1165, 1168, 1169 |
| 1174–1193 | a LOADED but unplayed career reports NO era, because nothing is regulated | 1186, 1187, 1190, 1191, 1192 |
| 1195–1209 | the era advances on seasons ELAPSED, which survives the archive cap | 1201, 1203, 1204, 1208 |
| 1217–1228 | the rival is never your own garage — that is what beatMate already promises | 1224, 1225–1226 |
| 1230–1253 | a beatRival offer signs the rival it printed: acceptOffer keeps goal.value, not just the type | 1247, 1248, 1249, 1252 |
| 1255–1268 | a rival who finished ahead MISSES the goal, and one behind MEETS it | 1265–1266 |
| 1270–1278 | an unresolvable rival cannot fail the player | 1276–1277 |
| 1280–1298 | ambition moves WHO the rival is, in the direction it moves every other kind | 1291, 1292, 1296–1297 |
| 1300–1332 | ADDING A KIND MUST NOT RE-PROMISE THE OTHER THREE | 1318, 1321, 1323, 1330–1331 |
| 1334–1349 | the LAST sponsor window of a season ends at the finale, and asks pro rata | 1344, 1345, 1346 |
| 1351–1377 | a move takes the player's DEVELOPMENT along (it is keyed by seat); the old seat's AI starts clean | 1369, 1372, 1373, 1376 |
| 1379–1401 | a move consumes the reviewed works snapshot, and browsing offers never changes the live era | 1393, 1394, 1396, 1397, 1400 |
| 1407–1428 | a string offer salary leaves money a finite number after settleRound | 1414, 1417, 1422–1423, 1427 |
| 1430–1442 | paceMult is clamped to [0.9, 1.1] whatever the stored tdev says | 1436, 1437, 1438, 1439, 1440, 1441 |
| 1444–1457 | settlement persists once and saveStatus only reads the last result | 1453, 1454, 1456 |
| 1459–1474 | Committed brief escrows only 50 credits once, locks at weekend start, settles once | 1461, 1464, 1465, 1469, 1470, 1472, 1473 |
| 1476–1486 | sponsor offers stay deterministic, share window and lock after first weekend | 1479, 1480, 1481, 1482, 1483, 1484, 1485 |
| 1488–1498 | clean sponsor reports mathematically lost without inventing a points maximum | 1494, 1496, 1497 |
| 1500–1512 | factory savings uses rounded quotes, owned-all zero and cash forecast owner wages | 1508, 1509, 1509, 1509, 1510, 1511 |

Helper assertion spans: 107–107, 108–108, 122–122.

### career-ui-lazy

Targets: js/career/career-ui-boot.js; tools/manifest.cjs lazy/full placement.

Fixture: mini-dom plus delayed ScriptLoader promises and fake CareerScreen, UiLayers/race/garage states, optional writer.ready.

Limits: Promise and onclick wiring only; no script/network/browser layout or real CareerScreen rendering.

| Case body | Contract | Assertion spans |
|---|---|---|
| 19–78 | CareerUI stub prefetches LAZY_CAREER_UI and defers #cr-garage until CareerScreen mounts | 63, 64, 70, 71, 72, 77 |
| 80–86 | manifest keeps career-ui.js in LAZY_CAREER_UI and the boot stub on FULL | 83, 84, 85 |
| 121–142 | Career {failure} download restores the menu and a later attempt loads the slots | 128, 129, 130, 131, 132, 135, 136, 137, 140, 141 |
| 145–157 | Career failure recovery does not cover a newer screen or race | 154, 155 |
| 159–169 | closing pending Career entry cancels it; the newest entry owns the loaded screen | 165, 168 |
| 171–178 | a successful explicit Career hub request still supports a simulated season return | 177 |
| 181–192 | career entry waits for writer readiness without blocking bundle loading | 188, 191 |

### carve-a-modules

Targets: js/physics/drive-tune.js; js/race/lap-record.js, storm-flash.js, light-tune-edit.js, announce-banner.js; js/fx/grade-tint.js.

Fixture: isolated VM loader; fixed performance, storm/audio/storage/banner stubs.

Limits: Selected defaults and small state transitions; no physics integration, real audio or DOM accessibility tree.

| Case body | Contract | Assertion spans |
|---|---|---|
| 14–25 | DriveTune.create() hands out independent tune bags; ROAD_FOLLOW ships off | 19, 20, 22, 24 |
| 27–40 | LapRecord.create() starts a fresh time-trial and three open sectors | 30, 31, 32, 33, 34, 35, 38, 39 |
| 42–54 | StormFlash decays a flash that is still up after the rain stops | 49, 51, 52, 53 |
| 56–84 | StormFlash in the rain: a strike sets exposure FROM the base, thunder follows its drawn delay, and the scene restores | 72, 73, 74, 78, 79, 80, 81, 82, 83 |
| 86–107 | GradeTint keeps a neutral tint neutral and LightTuneEdit clears the chunk latch on a rising edge | 89, 91, 104, 105, 106 |
| 109–131 | AnnounceBanner holds the floor: a higher card queues instead of replacing the one on screen | 125, 126, 127, 128, 130 |

### catalog-discovery

Targets: tools/mcp/catalog-discovery.mjs; tools/car/parts-sweep.mjs; tools/shot/lib/garage-camera-catalog.mjs; tools/shot/garage-angles.mjs.

Fixture: real loadParts catalog context and canonical camera tables; serial and two-worker fuel/cockpit sweeps.

Limits: Catalog/argv data and bounded mesh sweep comparison; no browser camera rendering or every team/category sweep.

| Case body | Contract | Assertion spans |
|---|---|---|
| 9–18 | all cosmetic part styles are exposed with canonical ids and useful camera stations | 14, 15, 16 |
| 19–33 | parts are canonical, paginated and never expose unavailable team options | 22, 23, 24, 25, 29, 30, 31, 32 |
| 34–52 | liveries expose per-team ids and canonical editable fields without reading saved state | 36, 37, 40, 41, 45, 46, 49, 50, 51 |
| 53–74 | camera metadata has the shape consumers rely on, and the CLI reads the one canonical module | 55, 56, 57, 59, 61–62, 65, 66, 69, 70, 72, 73 |
| 75–83 | catalogs reject invalid ids, oversized responses, and nonliteral inputs | 81, 82 |
| 84–91 | audit argv allows only exact canonical ids, never shell args or paths | 85, 86, 89, 90 |
| 92–102 | team restriction changes real sweep rows and rejects unknown teams | 95, 96, 99, 101 |
| 103–111 | serial and parallel sweep paths apply team selection before mesh measurement | 107, 108, 109, 110 |
| 114–122 | garage MCP catalog discovers workshop cameras by their subject, using the CLI's station IDs | 116, 117, 118, 119, 121 |

### cdmcp-measure

Targets: tools/mcp/cdmcp-measure.py, cdmcp-bg.mjs, cdmcp-cli.py, cdmcp-lamps.py, cdmcp-lamps-tune.py; tools/lighting/look-survey-sheet.py, look-survey-n10.mjs and JSON plan; js/agent/apex.js and docs/DEBUG-HOOKS.md.

Fixture: static source checks, help/status/dry-run subprocesses; Python imports with fake MCP clients and temporary outputs.

Limits: Does not launch Chromium. Text markers prove presence, not operational measurements; fake navigation and 600000-character payload exercise failure/report and private-file handling.

| Case body | Contract | Assertion spans |
|---|---|---|
| 19–30 | cdmcp-measure.py and cdmcp-bg.mjs exist and are executable-ish | 20, 21, 23, 24, 25, 27, 28, 29 |
| 32–38 | cdmcp-cli.py advertises roots so filePath writes under /workspace work | 33, 35, 36, 37 |
| 40–48 | cdmcp-lamps.py exists with terminal-marker log contract | 41, 43, 44, 45, 46, 47 |
| 50–63 | cdmcp-lamps-tune.py asserts dens + warmth + energy with terminal marker | 51, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62 |
| 65–74 | apex lightState documents meanLampRGB / bakedLights / lampPosts probes | 67, 68, 69, 70, 72, 73 |
| 76–82 | cdmcp-measure --help exits 0 and lists profiles | 78, 79, 80, 81 |
| 84–90 | cdmcp-lamps --help exits 0 and mentions background mode | 86, 87, 88, 89 |
| 92–98 | cdmcp-lamps-tune --help exits 0 and lists slider assertions | 94, 95, 96, 97 |
| 100–111 | cdmcp-measure and cdmcp-lamps honour APEX_PORT in --help defaults | 103, 104, 106, 107, 109, 110 |
| 113–119 | cdmcp-lamps.py documents --port and APEX_PORT | 115, 116, 117, 118 |
| 121–125 | cdmcp-bg with no args exits 2 and prints usage | 123, 124 |
| 127–142 | cdmcp-bg --help exits 0 and does NOT detach a measure | 134, 135, 136, 137, 141 |
| 144–150 | cdmcp-cli --help exits 0 (not 'unknown: --help') | 146, 147, 148, 149 |
| 152–156 | cdmcp-bg --status is safe when idle | 154, 155 |
| 158–174 | look-survey settles 1.6s only on day/dark rebuild, not every weather flip | 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 171, 172, 173 |
| 176–187 | look-survey-sheet.py writes ignored artifacts/lighting/sheets grids | 178, 180, 181, 182, 184, 185, 186 |
| 189–209 | sort_combos_min_rebuild groups sessionDark so loadTrack flips once | 207, 208 |
| 211–226 | N10 look-survey command is dry-runnable and targets ignored artifacts | 212, 218, 221, 222, 223, 224, 225 |
| 228–258 | lamps tuner fatal navigation keeps exit, terminal marker and report failed | 252, 254, 255, 256, 257 |
| 260–285 | measure retains complete private JSON beyond the former saved-character cap | 284, 284 |

### census-verdict

Targets: tools/gfx/census-verdict.mjs; .github/workflows/gpu-census.yml; producer keys in js/render/three/tlx.js and tools/gfx/gpu-game-check.mjs.

Fixture: hand-built HW/SW and TLX/GLX/WGX artifacts, temporary JSON/summary directories, embedded workflow Python, temporary git history and stub gh.

Limits: Verdict and orchestration fixtures only; historical run descriptions are provenance comments, not newly reproduced GPU evidence. Python/git availability can skip dynamic portions.

| Case body | Contract | Assertion spans |
|---|---|---|
| 31–81 | historical garage A/B only runs for its explicit full push request; normal census keeps four controls | 33, 42, 45, 46, 47–48, 49–50, 61, 69, 70, 71, 72, 73, 74, 76, 77, 78, 79 |
| 107–124 | healthy() fixture keys exist in the producers (tlx.js envState/backendState, gpu-game-check) | 110, 117, 118, 121, 123 |
| 126–135 | capOverride: only a NON-zero apex26.wgxCapture in the dispatch ls overrides the pin, last one wins | 127, 128, 129, 130, 131, 132, 133, 134 |
| 137–147 | a healthy hardware run passes and prints one block per leg in the fixed order | 139, 140, 141, 143, 144, 145, 146 |
| 149–167 | TLX off the direct present path fails a hardware run while the native pin is in force (promoted 2026-10-14) | 152, 153, 157, 160, 161, 164, 166 |
| 169–182 | WGX off the swapchain fails a hardware run whether or not the UA is headless; the old exemption is gone | 172, 173, 176, 177, 180, 181 |
| 184–203 | every pre-existing gate still fails: missing leg, unfinished leg, GPU and shader errors, env faces, softAdapter, unknown census | 200, 201 |
| 205–217 | readArtifacts reads the files the legs write and maps unreadable ones to null | 212, 213, 214, 215 |
| 219–242 | the CLI: step env in, rows to the summary and stdout, ::error:: lines and exit 1 on a failed gate | 227, 228, 231, 232, 234, 237, 239, 240, 241 |
| 244–255 | the Verdict step runs the tool with the image and the job's CENSUS_LS | 247, 248, 249–250, 251, 254 |
| 259–310 | the plan gate: the nightly skips an unchanged renderer, an inherited push request skips, every unknown runs | 268, 283, 287, 288, 289, 290, 291, 292, 300, 301, 303, 305, 307, 308 |

### centreline-kinks

Targets: tools/lib/centreline-kinks.cjs; tools/lib/track-build-vm.cjs; tests/data/centreline-kinks.json.

Fixture: synthetic 200-node radius-100 circle and four-corner rectangle; real VM track build for monza/sochi/monaco plus pinned counts.

Limits: Only three named built circuits compared; does not prove every pinned circuit count or every hairpin geometry.

| Case body | Contract | Assertion spans |
|---|---|---|
| 23–38 | a lone hard vertex on a straight is a kink; a smooth arc is not | 26, 34, 35, 37 |
| 40–45 | nearestTurn maps a lap fraction onto the 1-based apex list | 42, 43, 44 |
| 47–55 | the pinned counts match the built circuits they name | 52, 54 |

### change-driver-tools

Targets: tools/ci/verify-change.mjs, pick-tests.mjs, tooling-fast.mjs, test-bg.mjs, bump-cache.mjs, test-honesty.mjs; package.json.

Fixture: real CLI plans and JSON; stub git/node keep fast verdict offline; throwaway three-asset shell for cache mutation.

Limits: No actual selected browser runs. Fast gate succeeds through a stub in coverage-verdict cases; source regex pins scheduler shape.

| Case body | Contract | Assertion spans |
|---|---|---|
| 47–54 | verify-change routes a circuit edit to verify-track and graph.js to graph-parity | 50, 51, 52, 53 |
| 56–87 | verify-change hands graph-parity an explicit BASE (never the bare HEAD default) | 66, 67, 69, 71, 85, 86 |
| 89–101 | verify-change batches carry AT MOST ONE browser group each (the 120s-timeout rule) | 95, 98, 99 |
| 103–110 | verify-change batches are size 1 (sequential groups, browser or node) | 105, 107–108 |
| 112–117 | tooling-fast npm script uses the sequential runner | 114–115, 116 |
| 119–126 | test-bg defaults to sequential (one concurrent group) unless --parallel | 121, 124–125 |
| 128–137 | verify-change --plan on a docs-only change selects no browser batches | 130, 131, 132, 133, 134, 135, 136 |
| 139–152 | verify-change --plan exposes a diff-sized tooling-fast budget | 142, 143, 148, 149, 150, 151 |
| 154–179 | verify-change reports UNMATCHED, not pass, for a diff no rule claimed | 167–168, 169, 170–171, 177, 178 |
| 181–216 | verify-change and pick-tests publish the shared per-path selection receipt | 183, 191, 194, 195, 197, 198, 200, 201, 210, 212, 213, 214, 215 |
| 220–275 | bump-cache: --check catches drift, --apply hashes assets and keeps the generation; --advance moves it | 239, 240, 245, 247, 251, 253, 254, 257, 266, 267, 268, 271 |
| 277–284 | bump-cache refuses --apply on the repo shell (hashes are stamped at deploy) | 281, 282, 283 |
| 286–294 | bump-cache --check on the REAL shell agrees with the load-order guard | 291, 292, 293 |
| 298–306 | test-honesty finds no unexplained skips (the silent-skip ratchet) | 301, 305 |

### change-kind

Targets: tools/ci/change-kind.mjs changeKind.

Fixture: literal path arrays including mixed docs/css/code.

Limits: Classification examples only; fictional skill path is an input token, not a current file citation.

| Case body | Contract | Assertion spans |
|---|---|---|
| 5–13 | changeKind classifies docs, css, and code without a pull_request paths filter | 6, 7, 8, 9, 10, 11, 12 |

### changed-files

Targets: tools/lib/changed-files.mjs parseNameStatusZ/changedPaths; tools/ci/pick-unit-slices.mjs pick.

Fixture: NUL-delimited status strings and a real throwaway git rename crossing circuit to docs; scrubbed Git environment.

Limits: Copy parsing synthetic; only rename exercised through git. Fixture circuit/doc paths describe temporary repository contents.

| Case body | Contract | Assertion spans |
|---|---|---|
| 19–27 | parseNameStatusZ reads plain statuses and both ends of R and C records | 21, 22, 23, 24, 25, 26 |
| 29–48 | a real rename lists its source, and the circuit rules fire on it | 40, 42, 45, 46 |

### changelog-fragments

Targets: tools/gen/gen-changelog.mjs parseFragment/fold/foldBuild; .github/workflows/changelog-fold.yml; package.json.

Fixture: synthetic HIST, malformed fragments, real committed-fragment check, branch merge-base comparison, throwaway branches and merge-tree control.

Limits: Branch policy may skip locally without base ref; fixture merge shapes do not prove all merge orders or arbitrary histories.

| Case body | Contract | Assertion spans |
|---|---|---|
| 23–30 | parseFragment accepts Category: entry lines and names every bad line | 25, 26, 28, 29 |
| 32–36 | fold: a new build lands above the newest section, categories in the fixed order | 34, 35 |
| 38–44 | fold: an existing build section is extended in place, never duplicated | 40, 41, 42, 43 |
| 46–49 | every committed fragment is well-formed | 48 |
| 53–64 | this branch edits CHANGELOG.md sections only via a fold (a deleted fragment), never by hand | 54, 62–63 |
| 76–106 | fragments from two PRs and a fold on the tip merge clean; the old top-of-file insert conflicts | 93, 97, 103, 105 |
| 110–130 | fold build: --build wins, else the stamped build; never version.json | 111, 112, 113, 115, 121, 123, 124, 125, 126, 128, 129 |

### check-js-types

Targets: tools/check/check-js-types.mjs; tsconfig.checkjs.json; js/physics/wall-end-face.js, ai-band.js, ai-corridor.js.

Fixture: checker subprocess and JSON/source reads for three starter physics modules.

Limits: Only opted-in compiler scope; checkJs intentionally off globally. No simulation runtime evidence.

| Case body | Contract | Assertion spans |
|---|---|---|
| 15–18 | opted-in files type-check cleanly | 17 |
| 20–25 | checkJs stays opt-in and the starters carry the marker | 22, 23, 24 |

### chrome-server-fixes

Targets: tools/mcp/chrome-devtools-runtime.mjs materializeRuntime; tools/mcp/chrome-devtools-mcp.sh.

Fixture: synthetic upstream npm-package fragments and hash guards, temp cache/locks, EventEmitter page with controlled click promises.

Limits: No real browser/dialog or concurrent process race; source-root separation tested sequentially and live lock via current PID. 1.11.0 pass-through does not behavior-test actual upstream code.

| Case body | Contract | Assertion spans |
|---|---|---|
| 35–65 | materialized Chrome server fixes dialog click and selected-page close without mutating source | 41, 42, 43, 44, 45, 46, 47, 50, 52, 54, 55, 63, 64 |
| 67–74 | materializer fails closed on package version and reviewed-source drift | 70, 73 |
| 76–83 | materializer rejects a hash-approved file when the reviewed patch fragment is absent | 82 |
| 85–97 | different source roots cannot race for or replace the same runtime target | 92, 93, 93, 96 |
| 99–117 | dead materializer owner is recovered while a live owner is preserved | 108, 109, 114, 115 |
| 119–150 | patched click action handles dialog and all locator settlements without leaking listeners | 134, 135, 140, 141, 144, 145, 149 |
| 152–160 | audited 1.11.0 runtime passes through unpatched, untouched and uncached | 157, 158, 159 |
| 162–166 | materializer still fails closed on an unaudited version | 165 |
| 168–175 | Chrome wrapper routes local and pinned npm backends through the version gate | 170, 171, 172, 173, 174 |

### chromium-shell

Targets: tools/lib/chromium-path.mjs resolveChromium/normalizeBrowserFlavor.

Fixture: temporary executable archive-shaped shell/full stubs; explicit roots/env/systemPaths.

Limits: Resolution only; executables are empty shell stubs, no browser launch/version compatibility.

| Case body | Contract | Assertion spans |
|---|---|---|
| 8–25 | a headless shell answers when the full Chromium archive was never unpacked | 20, 21 |
| 27–45 | explicit browser flavor selects only its archive while executable environment overrides win | 34, 35, 36, 37, 38, 39, 41, 43 |

### chunked-index-ranges

Targets: js/render/glx/chunked.js GLXChunked.init/createChunkedMesh and merge-source slice; js/render/shared/vertex-pack.js.

Fixture: recording WebGL stub, actual VM VertexPack/Frustum/ChunkBins, separated grids above/below 2000-triangle threshold and alignment storage knob.

Limits: GPU bytes and pointers in stubs, source guard shapes; no draw, shader, frustum/render performance proof. Merging checks runs up to five chunks, not every-length run.

| Case body | Contract | Assertion spans |
|---|---|---|
| 153–175 | chunks are ranges into ONE index buffer, tiling it with no gap or overlap | 158–159, 164–165, 166, 167, 170–171, 173–174 |
| 177–209 | the concatenated buffer IS the ordered concatenation of the chunk ranges | 185, 188–189, 196, 199, 206–208 |
| 211–243 | merging a run of adjacent chunks draws the identical index sequence | 234–235, 241, 242 |
| 245–252 | a mesh too small to chunk still comes back as a plain mesh | 251 |
| 254–267 | createChunkedMesh packs to 28 bytes without trk and leaves attrib 4 off | 258, 259, 260, 261–262, 264, 265–266 |
| 269–285 | the packed attribute pointers match the format vertex-pack.js documents | 276–278, 279–281, 282–284 |
| 287–310 | packed normals, colours and material ids survive the round trip | 302, 303, 304, 305, 308, 309 |
| 312–340 | createChunkedMesh widens the stride to 40 and enables attrib 4 for road trk | 325, 326, 328, 329, 330, 331, 332, 334, 336, 337, 338, 339 |
| 342–361 | a material column costs no extra byte now that it rides in attrib 2 | 354, 355, 356, 359, 360 |
| 363–376 | production chunking releases render-only source channels but keeps collision/probe positions | 371, 372, 373, 374, 375 |
| 378–388 | trackGeometry debug retention preserves every source channel | 387 |
| 406–453 | the per-chunk merge only extends a run under all four guards | 410, 411, 412, 413, 414–415, 426–427, 428–429, 441, 442–443, 452 |
| 460–491 | C-P7: Uint16 chunk ranges start on 4-byte boundaries when aligned | 464, 469, 470, 471, 474, 490 |

Helper assertion spans: 149–149.

### ci-coverage

Targets: tools/ci/ci-coverage.mjs; package.json; .github/workflows/ci.yml.

Fixture: live ALL_SPECS/group expansion/report reads.

Limits: Declared static coverage and blocking floor; no Actions job execution or proof each spec actually runs in CI.

| Case body | Contract | Assertion spans |
|---|---|---|
| 11–14 | it sees the specs on disk | 12, 13 |
| 16–23 | a single-star glob expands the way package.json means it | 20, 21, 22 |
| 25–29 | a literal path resolves, and a bogus one does not | 26, 27, 28 |
| 31–34 | group scripts resolve to their spec lists | 32, 33 |
| 36–45 | the ci.yml parse finds SOMETHING — anti-vacuity | 39–42, 43, 44 |
| 47–72 | the fixed blocking floor: 3 specs, named, and it may not drift down | 60–62, 66–67, 69, 70, 71 |
| 74–81 | smoke and the driving-model gate are both seen | 77–78, 79–80 |
| 83–99 | it does not claim to cover what it cannot | 94–95, 96–97 |

### ci-gate-selection

Targets:  .github/workflows/ci.yml, pages.yml; tools/ci/ci-select-specs-step.sh, ci-resolve-before.sh, ci-pr-base.sh; tests/groups.json.

Fixture: shared live workflow text/YAML slices; temporary resolver git history and XR test-merge repositories executing extracted bash.

Limits: Most workflow clauses are structural regex/YAML assertions; extracted shell cases exercise finite local histories, not GitHub scheduler/required-check behavior. Retired names and bogus paths are negative/fixture inputs only.

| Case body | Contract | Assertion spans |
|---|---|---|
| 15–41 | every path a ci.yml change filter names still exists | 39–40 |
| 43–84 | the change-aware gate blocks pushes, pull requests AND the deploy gate | 44, 45–54, 65–66, 70, 72, 73, 74, 78, 79, 80, 81–82, 83 |
| 86–103 | selection resolves the event-specific base and fails closed when it cannot | 91, 92, 94, 95, 96, 97, 98, 99, 101, 102 |
| 111–150 | the base resolver: a Pages call with no usable base selects everything, never HEAD~1 | 128, 129, 130, 133, 135, 136, 137, 138, 141, 143, 148, 149 |
| 163–212 | docs-guards.yml is retired; ci.yml's pull_request stays unfiltered and test:docs-guards is a local alias inside tooling-fast | 173–174, 177, 188, 189, 190, 192, 193–194, 202, 206, 211 |
| 214–247 | ci-verdict is the always-run aggregator every other job feeds | 216, 219–220, 221, 222, 223, 225, 230, 242, 245 |
| 249–279 | selected-verdict reds on ANY dropped spec, and owns the carry-forward once per run | 255, 256, 260, 262, 263, 268, 269–270, 272, 275, 277–278 |
| 281–335 | select plans the node-suites matrix and can skip unused slices (unit-plan folded in, 2026-10-15) | 283, 284, 285, 286, 288, 289, 290, 291, 292, 293, 295, 302–303, 307–308, 309, 312, 313, 314, 315, 316, 318, 319, 320, 324, 327, 328, 330, 331, 334 |
| 337–353 | test:xr is path-gated (a filter step of select → xr) and feeds ci-verdict | 339, 340, 341, 342, 343–344, 346, 347, 348–349, 350, 352 |
| 355–411 | XR filter executes renderer, lazy-roster and emulated-spec changes while skipping unrelated paths | 405, 406 |

### ci-gpu-census

Targets: .github/workflows/gpu-census.yml; tools/lib/census-entry.mjs; tools/gfx/gpu-game-check.mjs and census-verdict.mjs.

Fixture: shared workflows parsed/text-sliced into four controls; embedded Python plan run with dispatch and push-request fixtures; stand-in window/GLX globals.

Limits: No GPU/browser/Actions execution. Python spawn errors silently omit some dynamic allowlist checks while static checks remain; race gates use synthetic marks/timelines.

| Case body | Contract | Assertion spans |
|---|---|---|
| 23–51 | gpu-census runs nightly staggered from the boot group, with the full check and its dispatch defaults | 27–28, 29–30, 31, 32, 34, 38, 39–40, 45, 47, 48, 50 |
| 53–80 | gpu-census: agents may still request by push; dispatches queue, push requests never cancel each other | 58, 59–60, 61, 63, 65, 66, 71, 72, 73, 78, 79 |
| 82–107 | gpu-census: the nightly skips an unchanged renderer, fail-safe; legs time out inside the job cap | 88, 89, 90, 91, 92, 93, 94, 95, 99, 101, 102, 104, 106 |
| 109–147 | gpu-census threads a cam input (helmet default, chase for the mirror-mip cap) to every game check (hunt 4 H5) | 113, 114, 114, 114, 115, 116, 117, 118, 120, 122, 123, 125, 131, 136, 137, 138, 139, 140, 143, 144, 145, 146 |
| 149–200 | gpu-census threads an entry input (api default; menu / menu-full = the player's RACE!) to every game check (hunt 5 E) | 152, 153, 154, 155, 156, 158, 159, 160, 162, 171, 177, 178, 179, 180, 182, 182, 182, 183, 184, 189, 190, 191, 192, 193, 194, 196, 197, 198, 199 |
| 202–225 | census-entry parses --entry / --cam A>B and gates START RACE on the menu prep (hunt 5 E) | 204, 205, 205, 206, 206, 207, 208, 209, 210, 211, 212, 212, 213, 217, 218, 219, 221, 222, 224 |
| 227–267 | the census race gate passes an entry that requested NO warm instead of waiting for warm.done (hunt 5 E) | 240, 241, 241, 244, 244, 246, 246, 248, 249, 253, 254, 254, 255, 257, 258, 260, 261, 262, 264, 265, 266 |
| 269–311 | gpu-census has a NATIVE WGX leg with hardware gates (bound, swapchain, gpuErrors) | 273, 274, 280, 281, 283, 284–285, 286, 290–291, 292, 293–294, 295, 297, 298, 301, 307, 309 |
| 313–334 | gpu-census relaunch: one profile, one origin, the TLX/WebGPU check twice (cold, then a returning player's) — opt-in (#3235) | 316, 316, 318, 319, 321, 322, 323, 324, 326, 327, 328, 329, 331, 332, 333 |
| 336–358 | gpu-census mem cycles: race to quit on both three.js paths, opt-in (dispatch input or push request), never the verdict (A·H12) | 340, 340, 341, 342, 343, 344, 346, 347, 348, 349, 350, 351, 352, 353, 355, 357 |

### ci-guard-tools

Targets: tools/ci/ci-rerun.mjs decide/prNumberOf; .github/workflows/ci-cancel-on-close.yml and ci.yml.

Fixture: pure run objects with PR/current-head/attempt variants; workflow text reads.

Limits: No network rerun/cancellation; structural concurrency checks only.

| Case body | Contract | Assertion spans |
|---|---|---|
| 14–18 | ci-rerun: a superseded PR run is refused (the #1800 trap) | 16, 17 |
| 20–27 | ci-rerun: a live run, a green run, an unreadable PR head and a second attempt are refused | 21, 22, 23, 24, 25, 26 |
| 29–35 | ci-rerun: a completed failed run on the current head is allowed; push/dispatch runs need no PR | 30, 31, 32, 33, 34 |
| 37–55 | ci-cancel-on-close.yml joins ci.yml's PR concurrency group exactly | 47, 48, 49, 50, 51, 52, 54 |

## Comment and oracle findings

- career-settle header and retired-mate comments describe the unclassified-retiree fixture. Production settleRound now prefers an explicit classified flag before falling back to !retired (LSP source 1244); these cases do not establish that every retired car scores zero.
- career-settle case “ambition moves WHO” only asserts rival ids are strings/outside the own team and ambition delta ordering. It never compares rival ratings, so its ranking-direction comment is stronger than its checks.
- career-settle “ADDING A KIND” checks declared-kind membership, representation and rival frequency 8–42/100 for seed 7; it does not compare original three-kind draws to a historical oracle, despite the compatibility title/comments. Sponsor-finale case checks end bound and need <= window*25, not an exact pro-rata formula.
- career-settle offer-kind loop can continue on empty offers for individual seeds; subsequent target/goal-less tests and rival checked-count guard add anti-vacuity for their own scenarios. Development/preview move tests return after first successful seed, so the seed list is a search, not five/seven independently verified moves.
- chunked-index-ranges header promises ordered source equivalence. The second case proves index multiset preservation and valid whole-triangle ranges, not original ordering per chunk. The merge case compares slices of the same uploaded buffer; it proves contiguity equivalence for bounded runs, not correctness of spatial assignment. Alignment case does compare stripped-pad sequence with source but returns early for Uint32.
- chunked production-retention test says positions/collision inputs retained; fixture _keepPositions is true and checks pos/idx existence plus render-channel release. It does not independently test the no-retention configuration. Merge light/cull rules are source-shape guards; the comment names another suite for executed multi-draw equivalence, outside this group.
- cdmcp “executable-ish” checks presence/text, not executable permission. “1.6s only on rebuild” is primarily source markers and absence of a literal wait; sort helper dynamic check supports grouping, not measured browser timing.
- chrome different-root “cannot race” case proves separate paths sequentially; no simultaneous materializer workers. Click cases simulate dialogs/events and listener cleanup without Chrome.
- ci-coverage ends with stale explanatory comments about dynamic gate slices after the split; actual change-aware contracts live in ci-gate-selection here. Static floor is >=3 plus named core and baseline membership, not a fixed count of exactly three.
- Changelog branch guard accepts any deleted non-README fragment as evidence of a fold when sections differ; it does not prove the resulting text was actually generated by fold. Git fixture proves selected clean merge/control scenarios, not all advertised orders.
- Historic measurements, issue numbers, old removed modules/workflows and scratch-script mentions in test comments are context only. Fictional malformed paths, shell injection strings and temporary fixture files are test data, not current repository references.

Completion: all 19 assigned files covered. No runtime validation claimed; parent owns any permitted documentation checks.
