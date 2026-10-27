# Unit group 48 — complete source map

Read-only map of all 13 assigned test files, 4,838 lines, 2026-10-27. Every assigned source line was returned in individual source chunks of at most 100 lines (each under 10,000 characters); obscured aggregate output was reread. No tests, browser sessions, runtime edits or commits were performed. Tables state contracts, not passing results. Ranges are inclusive; case ranges include the test call through its closing parenthesis. Assertion spans identify every line of each assert call, including multiline messages.

## Navigation evidence and dependencies

Read AGENTS.md and `.claude/skills/code-nav/SKILL.md`. Local apex-lsp resolved SettingsExport at js/ui/settings-export.js:36, SettingsNav at js/ui/settings-tabs.js:6, SettingDeps at js/ui/setting-deps.js:26, SetupCamera at js/garage/setup-camera.js:2, CareerScreen at js/career/career-ui.js:2 and SeasonUI at js/career/season-ui.js:2. Reference queries count SettingsExport 20 references/8 files, SettingsNav 42/12, SettingDeps 2/1, SetupCamera 3/2, CareerScreen 5/2, SeasonUI 3/2. SettingsExport consumers include game, garage, career backup/UI and agent hooks; SettingsNav includes audio, search, game, experience, key binds and editor workspace. SetupCamera and SeasonUI are used by game; CareerScreen boots through career-ui-boot. SettingDeps reference results are self-only and do not establish absence of indirect/window consumers. LSP covers production JS, not these Node tests; fixture callbacks with similar names are not production definitions.

Shared test dependencies: Node test/assert/fs/path/vm/url/module/os; mini-dom, abs-src, seed-save-migrate, game-vm, css-rules, seed-dom, editor-vm and parts-sweep. The per-file target lists below distinguish modules executed in sandboxes from source inspected as text. No production source full-read claim is made.

## tests/unit/session-stub-surface.test.mjs

Read 1–195; SHA-256 79ce0a859ad27d81bfc36ed5600c1a4c8fe2ecced3f7f202c5ee94e10abf2766. 5 declared case sites.

Fixtures/setup 39–131: VM evaluates the two real stub files against a minimal G0; manifest lazy sets exclude real implementations from the recursive always-loaded source scan. Eleven instance bindings and 27 globals generate surface checks.

Exercised targets: js/race/session-stub.js; js/audio/stub.js; tools/manifest.cjs.

Meaning and limits: Surface existence and selected return shapes; regex alias/block scanning cannot prove runtime call reachability or preservation of writes when real instances replace stubs. Matrix expansion: 11 instances: pits, records, raceRadio, flyingStart, radioVoice, announcer, engineer, startLights, marshalPanels, carSfx, rivalAudio.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| the stub ${inst.binding} instance answers every call site outside its lazy bundle | 134–141 | 136, 140 |
| the PitLane stub instance answers the call sites R3-SEAMS-3 found (hud.js, driving-coach.js) | 144–154 | 147, 151–153 |
| the stub globals answer every member read outside their lazy bundles | 156–171 | 161, 169–170 |
| RadioVoice.inert() carries sayPreRace like the real inert (loading-screen radioCheck asks for it by name) | 173–176 | 174–175 |
| the stub AudioPanel paints a saved SOUND OFF on the title button before the real panel lands | 178–195 | 190–191, 193–194 |

## tests/unit/session-transcript.test.mjs

Read 1–271; SHA-256 66521b70877503b2966f554b973813861f4f9d81d1d567a3848809980f29dea9. 16 declared case sites.

Fixtures/setup 10–38, 103–117: Handmade event envelopes, tool pairs, injected/hook/result records, quota retry pages and context-usage rows; no remote session access.

Exercised targets: tools/ci/session-transcript.mjs.

Meaning and limits: Pure parser/formatter contracts from fixtures; timestamps, costs and attribution witnesses are synthetic, not live provenance.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| a saved page parses out of its untrusted envelope, with the cursor for the next page | 40–46 | 42–45 |
| calls fold their results; MCP, Bash, Agent and the subagent's own steps each get a row | 48–60 | 51–59 |
| noise drops: control blobs, empty thinking, successful hooks; injected turns are not user prompts | 62–70 | 64–65, 67–69 |
| events across pages dedupe by uuid and sort by time | 72–77 | 75–76 |
| render: --only errors keeps the failures; the footer tallies and names the next cursor | 79–92 | 83–86, 88–91 |
| describeCall shows the part a reader wants | 94–98 | 95–97 |
| quota retries fold into one ×N row; wakes between them are counted, not listed | 118–127 | 121–126 |
| a real turn or a typed prompt between retries splits the fold | 129–132 | 131 |
| quota-parked only when the newest real turn is a limit error | 134–141 | 135–137, 139–140 |
| render folds by default, prints the state line, and --raw keeps every retry | 143–154 | 147–150, 152–153 |
| --summary is one line: title, cost, last real turn, quota state, hook errors | 156–169 | 158–160, 162–163, 165–168 |
| --summary / --json surface by_type from result.subagent_stats (#2893 item 10) | 171–189 | 181–182, 188 |
| --ctx: per-turn context = input + cache read + cache write, one row per message id, main thread only | 191–210 | 201, 203–206, 209 |
| --digest: summary, prompts, replies, tally and failures within a hard size cap; no tool output beyond an excerpt | 215–234 | 219, 224–226, 231–233 |
| attribution: wrong get_session id, a page costlier than the session, or events outside its lifetime is MISATTRIBUTED | 240–254 | 247–250, 252–253 |
| --tally skills counts Skill calls by name; --tally cache-breaks lists turns whose cache read fell > 50 % | 256–271 | 262–263, 266–270 |

## tests/unit/setting-deps.test.mjs

Read 1–338; SHA-256 3d307642cb2eba9e1bfdbb96345b78e5a65b9a0b1a7748468d59a4a2f8637c2a. 12 declared case sites.

Fixtures/setup 16–110, 200–209: mini-dom builds each RULES target from real shell shape; WHEN switches model line, motion, touch, contrast, camera and scene state. EXPLAIN owner controls, captured timers/observer records and write-count instrumentation cover mutation ownership.

Exercised targets: js/ui/setting-deps.js; index.html.

Meaning and limits: All current RULES/EXPLAIN entries are iterated; no browser accessibility tree, CSS appearance or MutationObserver scheduling proof.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| every rule target and parent id exists in the shell | 113–122 | 116, 118–120 |
| each parent OFF greys every dependent with a described reason; ON restores it | 124–151 | 134–135, 138–139, 145–148 |
| an owner's own disable survives a dependency turning back on | 153–160 | 159 |
| a parent missing from the DOM greys nothing (lazy panels) | 162–167 | 166 |
| two rules on one control: lifting one keeps the other's grey (PANEL OPACITY: HUD OFF + HIGH CONTRAST) | 169–184 | 175, 178, 180, 183 |
| a list of parents greys when ANY is off (ENGINE TONE: SOUND row and master button) | 186–196 | 192, 195 |
| every EXPLAIN id is a real control id somewhere in the shell or js/ | 211–219 | 214–215, 217 |
| an owner-greyed control shows its reason (or links the owner's status) and drops it when re-enabled | 221–241 | 231–232, 237–238 |
| EXPLAIN never speaks for a control SettingDeps greyed itself | 243–251 | 250 |
| stable dependencies and owner explanations make no metadata or reason writes | 253–280 | 272, 274–279 |
| disabled observer preserves dynamic owner explanations when disabled remains unchanged | 282–308 | 293, 298, 300, 303, 305, 307 |
| a refresh that changes nothing writes nothing to the DOM | 314–338 | 335–336 |

## tests/unit/settings-defaults.test.mjs

Read 1–245; SHA-256 130b6155f069e06f9dc83b9f7b5f44b9eef2e7f638444ab13165355097e6bade. 14 declared case sites.

Fixtures/setup 21–35, 203–219, 231–239: Real defaults/store in a VM with Map storage and seeded migration; real SPEC parser plus temporary malformed/nested parser source trees.

Exercised targets: js/data/settings-defaults.js; js/core/store.js; js/ui/settings-export.js; tools/gen/settings-defaults.mjs; tools/manifest.cjs.

Meaning and limits: Checks defaults precedence, source-literal agreement and structural parser safety; regex fallback scan intentionally skips expression defaults. Temporary source trees are parser fixtures, not production dependencies.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| every shipped default is a SPEC key and none is device-adaptive | 37–41 | 39–40 |
| the store answers from the file, not from the call-site literal | 43–53 | 51 |
| raw defaults resolve from short and apex26-prefixed keys | 55–62 | 59–60 |
| cautions ship off and SPEC documents every authoritative default | 64–74 | 66–67, 70–71, 73 |
| every literal call-site fallback agrees with the shipped default | 83–106 | 103, 105 |
| a stored value still beats the shipped default | 108–114 | 113 |
| an unlisted key is untouched — the override is opt-in per key | 116–123 | 119–120, 122 |
| settings-export reports the shipped default, so CHANGED stays true | 125–130 | 128–129 |
| the defaults file loads before the store that reads it | 132–137 | 135–136 |
| a SUBSYSTEM key is never silently promoted to a shipped default | 139–155 | 142–143, 152–153 |
| the classification lives on the SPEC row, not in the tool | 157–165 | 161, 163–164 |
| every key the driving model owns is marked | 167–174 | 173 |
| readSpec() parses EVERY SPEC row, whatever optional properties it carries | 176–199 | 190–191, 195, 198 |
| readSpec structurally reads nested defaults and multiline callbacks without executing them | 202–245 | 221–228, 230, 242 |

## tests/unit/settings-export.test.mjs

Read 1–1770; SHA-256 c79fd61e31a7efad2a535832b2e0105042149afab3af062811053dee9f99e7f5. 89 declared case sites.

Fixtures/setup 23–130, 382–398, 561–582, 855–860, 1247–1256, 1363–1369, 1420–1424, 1647–1652: Map-backed fake store/localStorage; opt-in real store, Teams, SaveMigrate, CareerBackup, appearance modules and real livery/controller modules. mini-dom import UI captures timers, chooser actions, FileReader/File.text races and reloads. POISON, GARAGE, CAREER_SAVE and real parts/finish catalogs exercise isolated backup domains.

Exercised targets: js/ui/settings-export.js; js/car/custom-liveries.js; js/input/controller-profiles.js; js/core/store.js; js/career/career-backup.js; js/career/save-migrate.js; js/data/teams.js; appearance modules; tools/car/parts-sweep.mjs.

Meaning and limits: Validates serialization, sanitization, state ownership and UI feedback under modeled APIs; no native share sheet, browser storage grant, real download, raster or XSS execution evidence. Matrix expansion: Five share kinds (setup/livery/daily/undo/invalid); five feedback results; native sharing success/failure/cancelled; asynchronous reads use both File.text and FileReader.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| visor optics and water settings survive both backup modes and reject invalid choices | 132–156 | 140–141, 145–148, 150, 155 |
| backup controls mount once in their own settings page, outside renderer options | 158–165 | 161, 164 |
| backup action navigation exposes one section without exporting or importing | 167–185 | 174, 176–178, 181–184 |
| leaving Restore disarms its overwrite confirmation | 187–197 | 191, 193, 196 |
| Files share feedback stays visible and accessible with Undo instructions | 199–211 | 202–210 |
| Files ${kind} share import releases the Settings modal only when navigating | 213–245 | 236–237, 239, 241, 243–244 |
| Files paste displays messageFor's persistent ${label} feedback | 253–272 | 257, 264–267, 269–271 |
| ensureMounted remounts after the files panel was emptied | 274–285 | 276, 279–280, 283 |
| native backup waits for sharing and reports ${outcome} | 287–312 | 298–301, 303–306, 309–311 |
| browser backup retains its download anchor and re-enables the button | 314–326 | 322–325 |
| a slow older settings import cannot overwrite the newer file (${fileReader ? "FileReader" : "File.text"}) | 329–341 | 335, 338, 340 |
| an old file error cannot replace the latest import result (${fileReader ? "FileReader" : "File.text"}) | 343–354 | 349, 352–353 |
| a completed import locks new file choices until it reloads | 356–365 | 360–362, 364 |
| the import UI stays open and reports a refused storage reset | 367–374 | 371, 373 |
| a fresh store exports no changes, and ALL lists every key at its default | 399–414 | 402–405, 407, 409–413 |
| a changed key carries its value, the default it replaced and the source that owns it | 416–448 | 430–434, 436–447 |
| a tuner that saves its whole table reports only the fields the player moved | 450–462 | 457–461 |
| recorded voice choices and radio sound survive settings backup and restore | 464–475 | 469–471, 473–474 |
| the binding tables count as changed by Input's word, not by value | 477–483 | 479, 481–482 |
| nothing outside the allowlist leaks, whatever the store holds | 485–497 | 491, 493–494 |
| the steering schema version is context, never a change | 499–503 | 501–502 |
| the device decides the graphics default | 505–510 | 506, 508–509 |
| SAVE ALL from a desktop does not pin desktop defaults on a phone | 512–521 | 516, 520 |
| unset gfxBackend exports as null on touch and desktop alike | 523–528 | 524–525, 527 |
| SPEC's defaults agree with the store.get reads in their source files | 534–559 | 540, 543, 555, 558 |
| the garage file carries what the player BUILT, and nothing else in the namespace | 580–598 | 583–590, 594, 597 |
| an empty or blocked store still produces a valid garage file | 600–605 | 602–604 |
| garage export recovers refused existing and cache-only writes without changing storage | 607–635 | 614–618, 624–632, 634 |
| loading a settings file writes the allowlist and refuses everything else | 637–660 | 651–659 |
| a settings file of the wrong shape is refused whole, and a bad value skipped | 662–671 | 663–664, 667–670 |
| an ALL file carries an object key's whole effective value; CHANGES only its moved fields (B·H11 hunt) | 673–678 | 675–677 |
| settings backups preserve the announcer switch and radio effects in both modes | 680–694 | 684–685, 688–689, 692–693 |
| restoring default motion restores OS preference following | 696–712 | 698, 701, 705, 711 |
| a refused raw reset is a storage failure, not an applied setting | 714–724 | 719–723 |
| throwing storage is reported as failed for settings and garage imports | 726–735 | 732, 734 |
| a difficulty the ladder does not name is skipped, not stored | 737–751 | 744–747, 749–750 |
| the difficulty allowlist is exactly PhysicsConsts.DIFF's ladder | 753–759 | 758 |
| loading a garage file writes garage-shaped keys only | 761–781 | 774–780 |
| a file round-trips: save it, load it into a fresh store, get the same values | 783–817 | 797–798, 801–812, 815–816 |
| a malformed custom livery cannot reach the garage screen | 821–854 | 843, 845–849, 852 |
| M26: an enum pill that names an Object.prototype member is dropped, not stored | 864–871 | 868–870 |
| M26: the 32-livery cap is gone — the garage has none, the file-size gate is the bound | 873–878 | 876–877 |
| a garage file reports the livery rows it could not keep, never drops them quietly | 880–887 | 884–886 |
| garage import repairs catalog and sibling id collisions and remaps the selected paint | 889–926 | 900–903, 907–908, 919–920, 925 |
| garage import repairs dangling selections against imported or current custom rows | 928–951 | 934, 936, 940, 949–950 |
| duplicate-id repair stays deterministic for a large admitted custom list | 953–964 | 960–963 |
| M26: a livery id longer than 64 characters is dropped | 966–969 | 968 |
| M26: livery colours are clamped to 0..1 | 971–975 | 973–974 |
| a garage value of the wrong shape is skipped, not written | 977–994 | 988–990, 992 |
| a sound garage file still loads whole | 996–1015 | 1011–1014 |
| the four garage singles are shape-checked like the liveries | 1027–1054 | 1038–1040, 1042, 1051–1053 |
| an imported custom team is rebuilt to the dialog's own limits | 1062–1105 | 1078, 1080–1094, 1096–1104 |
| customLogo accepts only data:image/(png\|jpeg\|webp);base64 with a length cap | 1107–1127 | 1116–1117, 1120, 1125–1126 |
| steerMode / hudProfile / drivingLine rows carry oneOf allowlists | 1129–1135 | 1132–1134 |
| dockLayout is in SPEC and round-trips a per-scheme bag | 1141–1160 | 1151–1152, 1154, 1157–1159 |
| every APPEARANCE store key is in SPEC and round-trips | 1162–1184 | 1165, 1173, 1175–1179, 1182–1183 |
| caption settings keys are in SPEC and round-trip | 1186–1209 | 1196, 1198–1202, 1205–1208 |
| Home settings and bounded visual profiles survive settings backup without carrying unrelated state | 1211–1230 | 1219–1222, 1224–1226, 1229 |
| appearance import rejects malformed bags and enums and clamps profile contents | 1232–1244 | 1235, 1238, 1240–1243 |
| the career file carries the six slots and the live pointer, and nothing else | 1259–1279 | 1267–1273, 1275, 1277–1278 |
| an empty store still produces a valid career file | 1281–1286 | 1283–1285 |
| loading a career file migrates slots and refuses non-career keys | 1288–1310 | 1300–1302, 1304–1309 |
| a career slot with poisoned money is skipped, not restored as a zero-credit career | 1312–1322 | 1318–1321 |
| a career file of the wrong shape is refused whole | 1324–1331 | 1325–1326, 1328, 1330 |
| career round-trip: export then import restores the slot through migrateCareer | 1333–1348 | 1341–1342, 1344–1347 |
| careerRow injects file controls without a static shell id in index.html | 1350–1358 | 1352–1357 |
| save protection only requests persistence on a click and reports the actual grant | 1368–1383 | 1373–1374, 1376–1378, 1380–1382 |
| unsupported and rejected persistence APIs retain an actionable backup reminder | 1385–1395 | 1387–1388, 1391, 1393–1394 |
| BUILD IN BACKGROUND: a pause > SETTINGS row on the key the build worker reads, ON by default | 1397–1406 | 1400, 1402–1403, 1405 |
| M6: the SPEC resMode default is UiScale.defaultResMode() when scale.js ships it | 1409–1418 | 1413, 1415, 1417 |
| SEC2-2: LOAD SETTINGS / CAREER FILE refuse an oversized file before reading it | 1426–1442 | 1430, 1434–1435, 1437–1438, 1441 |
| SEC2-2: a career file with more than 16 bag keys is refused | 1444–1454 | 1449–1450, 1453 |
| a malformed settings / a11y group never throws — it is refused or skipped (#2191) | 1459–1471 | 1464, 1468–1469 |
| LOAD SETTINGS FILE shows a result, not an unhandled rejection, for a malformed a11y group (#2191) | 1473–1487 | 1480, 1482–1483 |
| career export preserves opaque future saves in every slot without altering stored bytes | 1490–1505 | 1499–1501, 1503 |
| future final row refuses the entire mixed legacy import before slots or selection change | 1507–1524 | 1519–1522 |
| future preflight retains legacy migration, scope and slot/selection revision gates | 1526–1546 | 1533–1536, 1543–1544 |
| leaving backup settings clears overwrite confirmation without duplicating lifecycle handlers | 1549–1568 | 1552, 1555, 1557, 1559, 1561, 1563–1564, 1567 |
| Saves and Data explains separate backup scopes and reuses storage health | 1571–1585 | 1575–1578, 1580–1584 |
| leaving Saves and Data invalidates a pending import (${fileReader ? "FileReader" : "File.text"}) | 1588–1597 | 1595–1596 |
| garage reset stays on screen when deleting an extra key is not durable | 1599–1610 | 1607–1609 |
| Saves and Data exposes independent garage and career loaders without duplicate IDs | 1612–1629 | 1616, 1620, 1625–1626, 1628 |
| a livery carrying every Liveries.FIELDS key survives import, with room for new fields | 1633–1645 | 1643–1644 |
| garage import preserves every cosmetic part style and rejects mismatched or performance ids | 1654–1670 | 1662–1663, 1667 |
| garage import validates all regional finishes against the real current registry | 1672–1683 | 1678, 1680–1681 |
| invalid or absent regional finishes are omitted without dropping sound livery data | 1685–1700 | 1693, 1695–1698 |
| garage export and reimport retain new regional finishes alongside sound and invalid siblings | 1702–1733 | 1715–1716, 1719, 1721–1722, 1724, 1726–1728, 1730–1732 |
| SAVE/LOAD SETTINGS carries a calibrated stick rest map to a fresh device (B·H11 hunt) | 1735–1757 | 1740, 1743–1744, 1748, 1751–1752, 1756 |
| cockpit finish choices round-trip as camera preferences without exporting liveries | 1760–1770 | 1763–1766, 1769 |

Shared/top-level assertions (supplement case rows): 859. These validate helper discovery, fixture/API availability or stub revision contracts.

## tests/unit/settings-one-home.test.mjs

Read 1–57; SHA-256 04b672fcac4fc6e0fb66a0af0b0a40f27266568ca3108d898b60615b2c7250a8. 5 declared case sites.

Fixtures/setup 11–13: Reads shell, SettingsNav and Appearance Studio source without evaluating UI.

Exercised targets: index.html; js/ui/settings-tabs.js; js/ui/appearance-studio.js.

Meaning and limits: Text/markup uniqueness and route declaration guards; does not execute navigation or establish rendered label uniqueness beyond matched shapes.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| TILT SENSITIVITY has one control: ADVANCED jumps to FEEL instead of a second tiltDeg slider | 15–19 | 16–18 |
| every settings jump names a real route and an existing control | 21–29 | 23, 25–26, 28 |
| MUSIC & SOUND rows never share a label (two VOLUMEs; a layer's level and its switch) | 31–42 | 38, 40 |
| Appearance Studio names its two accent colours apart | 44–47 | 46 |
| DRIVING HELP and STEER ASSIST: one name each, the FINE sliders and their DRIVING AIDS rows jump to each other | 49–57 | 50–52, 55 |

## tests/unit/settings-open-perf.test.mjs

Read 1–303; SHA-256 f662b128d73908a48bd21dc0ea8b8214821ce7d184b0b310a417eaf660190675. 8 declared case sites.

Fixtures/setup 17–19; per-case sandboxes: mini-dom navigation, synthetic script injection completion, instrumented clientHeight reads, coarse-pointer Menus stub and MenuSheetGate counters.

Exercised targets: js/ui/settings-tabs.js; js/core/script-loader.js; js/core/lazy-bundles.js; js/ui/scroll-fade.js; js/ui/select-screen.js; js/core/menu-sheet-gate.js; js/game.js.

Meaning and limits: Counts marks, concurrency and work suppression; no measured phone latency, frame budget, real script evaluation or visual transition.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| SettingsNav.show marks apex:settings:show and apex:settings:shown | 21–42 | 35–36, 39–41 |
| SettingsNav.show skips ScrollFade.refresh while the sheet is hidden | 44–70 | 62–63, 66–67, 69 |
| ensureAudio loads LAZY_AUDIO one file at a time while Settings is open | 72–145 | 138–144 |
| ScrollFade skips title overlay regions while Settings is open | 147–198 | 193, 196–197 |
| select-screen vt skips startViewTransition on coarse pointer (phone) | 200–243 | 241–242 |
| MenuSheetGate.idle defers while Settings is open | 245–268 | 259, 263–264, 267 |
| MenuSheetGate.parkWarm holds menu warm counters until resume | 270–293 | 281–283, 285–292 |
| game.js menuIdle routes through MenuSheetGate (no inline idle loop) | 295–300 | 297–299 |

Shared/top-level assertions (supplement case rows): 303. These validate helper discovery, fixture/API availability or stub revision contracts.

## tests/unit/settings-reload-vm.test.mjs

Read 1–32; SHA-256 e157cbea4054ed77b9430f32c21a4cfaf769e2d2449aa28f72607133990cdb40. 1 declared case sites.

Fixtures/setup 11–12, 16–31: Three createGame boots: save AUTO, restore parsed stored choice, fresh-install negative control; closes all VMs.

Exercised targets: tools/lib/game-vm.cjs; __apex aeroMode API.

Meaning and limits: Proves VM reboot persistence via explicitly reconstructed storage; no physical page reload/device storage proof.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| an AERO mode choice survives a reload: a second boot on the same storage reads it back (B·H11 settings audit) | 14–32 | 20, 24, 28, 31 |

## tests/unit/settings-search.test.mjs

Read 1–153; SHA-256 079804b9200f852850a955ca1df5d30a90e5d3724639b1e43419c64c0b4c4072. 12 declared case sites.

Fixtures/setup 9–27: Real Search/Nav in mini-dom with explicit pages, controls, focus/scroll, deferred audio and counted option-label/node allocations.

Exercised targets: js/ui/settings-search.js; js/ui/settings-tabs.js; css/player-tools.css; css/settings-controls.css; index.html.

Meaning and limits: Exercises navigation ownership and read-only preferences in explicit geometry; CSS source checks do not establish responsive browser layout.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| search ownership survives a cross-link until BACK unwinds to the original result | 28–42 | 37–40 |
| accessibility searches reach the existing controls and BACK restores the query without preference writes | 43–57 | 52–55 |
| search destinations use navigation titles instead of internal page ids | 58–63 | 61 |
| BACK reveals a below-fold result after the home scroller reset, without changing preference | 64–72 | 69–71 |
| cancelled lazy audio search cannot steal the next category BACK target | 73–79 | 75, 77–78 |
| a fresh settings session cancels search-return ownership while preserving query | 80–85 | 84 |
| successful lazy search still owns BACK and opens ancestor disclosures | 86–90 | 89 |
| narrowing a query reuses result buttons and does not re-read option labels | 91–121 | 105, 108, 112–115, 119–120 |
| search spans the existing two-column door grid and a full flex row on narrow sheets | 123–127 | 125–126 |
| registered owner rows replace safely and update a mounted query without preference writes | 128–136 | 131–135 |
| real resolution/dead-zone controls are registered, option labels searchable, and navigation read-only | 137–146 | 140, 143, 145 |
| external owner navigation reports refusal visibly and restores search on explicit return | 147–153 | 151–152 |

## tests/unit/settings-tabs.test.mjs

Read 1–216; SHA-256 605219f9f1383561389025534e0bec278fe88fbbd9fc23dcd0805f1576b60a1c. 13 declared case sites.

Fixtures/setup 12–26: Real SettingsNav in mini-dom; controlled _ensure promises, callback logs, mock ResizeObserver and window listeners.

Exercised targets: js/ui/settings-tabs.js.

Meaning and limits: Covers lazy success/failure/cancel, route stack, breadcrumbs and focus/scroll restoration; DOM geometry and event dispatch are modeled. Matrix expansion: Late-audio cancellation has six navigation/close variants; Back reflow has stay/interact/navigate/focus/close variants.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| MUSIC & SOUND: a bundle that fails to load is asked once per click and the page still reveals | 28–41 | 32–33, 35–36, 40 |
| MUSIC & SOUND: a rejecting _ensure behaves like false, programmatic show() included | 43–49 | 47–48 |
| MUSIC & SOUND: a bundle that loads reveals the wired page without the offline note | 51–60 | 56–59 |
| onLeave(fn) is called with the page id when back() / show() hides a page | 62–76 | 66, 68, 70, 73, 75 |
| settings title acts as a breadcrumb on the page stack | 78–84 | 81, 83 |
| late audio completion cannot supersede newer navigation or a closed session | 87–97 | 94–95 |
| session tools return directly to their caller and close invalidates page work | 100–113 | 105–108, 111–112 |
| new destinations reveal only their own panel and normal Back returns home | 115–124 | 119–122 |
| Advanced input returns to Controls and restores its launcher's focus and scroll | 127–141 | 134–140 |
| frozen route metadata owns titles, panels, doors and default hierarchy | 143–164 | 146–154, 156–158, 161–162 |
| a cross-link returns through nested pages with each launcher's focus and scroll | 166–180 | 175–179 |
| a runtime-mounted cross-link keeps its origin even when its child is clicked | 182–192 | 189–191 |
| Back reveal follows reflow until interaction, navigation, focus change or close | 195–216 | 205–206, 212–214 |

## tests/unit/settings-ttlb-backup.test.mjs

Read 1–222; SHA-256 fa7009ddebbd6814fcbc337116b75f694bad3c908d5e22c7954868fd1b63206e. 9 declared case sites.

Fixtures/setup 13–61: Real GameStore and SettingsExport with Map localStorage, migration seed, valid lap helper and editor VM generating the full allowed custom roster.

Exercised targets: js/ui/settings-export.js; js/core/store.js; tests/helpers/editor-vm.mjs.

Meaning and limits: Tests optional leaderboard merge, work bounds and durability accounting; no Data Hub ZIP or real storage quota. Matrix expansion: 660-lap matrix = 11 tracks × 6 classes × 10 laps; current shipped/custom roster budget is derived at runtime.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| settings export round-trips ttlb boards (export, clear, import, laps match) | 63–80 | 69–70, 75, 77–79 |
| settings export includes refused updates and new session-only leaderboard keys | 82–100 | 84–85, 91–96, 98–99 |
| a native 660-lap backup round-trips every circuit and class | 102–115 | 108, 110–114 |
| ttlb import retains finite track and lap work budgets | 117–129 | 120–121, 125–128 |
| settings leaderboard export round-trips the full shipped and custom roster within a finite budget | 131–152 | 137, 140, 142, 144, 146–147, 150–151 |
| ttlb import reports quota-refused laps as failed rather than reloading them away | 154–168 | 158–161, 163–167 |
| ttlb import merges and keeps the best laps per class | 170–197 | 195–196 |
| ttlb import rejects invalid laps through ttParseBoard | 199–214 | 209–213 |
| old settings backups without ttlb still import | 216–222 | 219–221 |

## tests/unit/setup-preview-hull.test.mjs

Read 1–202; SHA-256 646f90147abf808923311776ce4df62e4ba02df80b18d2ff86771a0f49cd9478. 5 declared case sites.

Fixtures/setup 27–69, 128–144, 187–191: Real parts-sweep VM builds vertex arrays for optional paint/geometry/style fields; source-extracted camera fit statements, real SetupCamera hullKeyOf and source hook guards.

Exercised targets: js/garage/setup-camera.js; js/car/car3d.js; js/agent/apex.js; tools/car/parts-sweep.mjs.

Meaning and limits: Exact position equality and formula/key contracts; historical viewport numbers are fixture inputs, not fresh browser measurements or proof camera stays inside every bay. Matrix expansion: Geometry enums expand through every current STYLE option; hue checks cover listed optional colors and T-cam paint.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| a HUE change never moves a vertex — only presence can | 70–84 | 73–74, 78, 81–82 |
| SP_HULL_GEOM_FIELDS names exactly the fields whose PRESENCE moves a vertex | 86–102 | 98–101 |
| the garage auto-fit is capped below the manual zoom ceiling | 126–157 | 132, 140–141, 148, 152–153, 156 |
| __apex.garageCam reports the effective distance, not just the stored zoom | 162–180 | 168, 172–173, 178–179 |
| the hull key ignores the livery id and keeps every input that can move a vertex | 185–202 | 189, 193–199, 201 |

Shared/top-level assertions (supplement case rows): 45, 56. These validate helper discovery, fixture/API availability or stub revision contracts.

## tests/unit/setup-screens-state.test.mjs

Read 1–834; SHA-256 13d74427820d05bb254d0667616efac4a4949b6e0e29017e52d780d3a990a1c3. 30 declared case sites.

Fixtures/setup 35–220, 312–322, 446–467, 614–659: mini-dom sandbox with stub Career, Teams, SeasonCal, Parts and G; real Dom/experience/CareerScreen/SeasonUI/SetupUI modules. Controlled backup readers, synthetic hub state and deferred rAF expose transition ownership; css-rules parses wrap declarations.

Exercised targets: js/career/career-ui.js; js/career/experience.js; js/career/season-ui.js; js/garage/setup-sheet.js; js/garage/setup-experiments.js; js/ui/dom.js; css/career.css; index.html.

Meaning and limits: Behavior within stubs proves callbacks, text, focus and cleanup; not actual career economy, browser focus algorithm, layout, storage conflicts or rendered car state. Matrix expansion: Backup cases expand both reader kinds, old success/failure, and close/openSlots/openHub/empty-slot exits; late reader outcomes include both success and failure.

| Case / behavior contract | Case range | Assertion spans |
|---|---|---|
| career backup: ${readerKind} ignores an older ${failure ? "failure" : "success"} after a newer selection | 224–243 | 232, 237–239, 241–242 |
| career backup: ${readerKind} discards reads after ${exit} | 247–264 | 260–262 |
| career backup: opening another ${readerKind} picker cancels the pending read even before selection | 267–280 | 273–274, 277, 279 |
| career backup: a new ${readerKind} picker disarms the previous file while its replacement loads | 282–301 | 286, 292–294, 296–297, 299–300 |
| career backup: a current ${readerKind} read failure is still announced | 303–309 | 307–308 |
| career: a NEW CAREER draft does not survive leaving the screen | 324–345 | 327–331, 335, 338, 343–344 |
| career: an armed DELETE? disarms when the screen closes | 347–360 | 352, 356, 358–359 |
| career: driver-career team tiles carry the per-round salary unit their MY TEAM sibling shows | 362–369 | 367–368 |
| career hub: next race and funds sit on the left; the market ladder is on the right | 371–391 | 375–390 |
| career hub: THE CAR's Fitted row groups thousands like the garage readout | 393–397 | 396 |
| career hub: a greyed-out upgrade card says how far short the balance is | 399–407 | 403–406 |
| career hub: an affordable upgrade card carries no shortfall and no title | 409–417 | 413–415 |
| career hub: RE-SIGN card and the market list quote wages the same way | 419–427 | 425–426 |
| career history: Points carries its unit like every other points figure | 429–434 | 433 |
| career.css: the lines the fixes extend must wrap, not ellipsize | 436–442 | 439–440 |
| season setup: unchanged qualifying survives APPLY; changing rules requires a fresh confirmation | 468–505 | 483, 485–487, 490, 492–494, 497, 500, 502–504 |
| season setup: changed rounds and sprint results still warn, and unchanged APPLY keeps the selected round | 507–527 | 519, 521, 524–525 |
| season setup: START NEW SEASON confirms and restarts completed standings with unchanged rules | 529–556 | 546, 548–549, 551–555 |
| season setup: RACE DISTANCE chips carry a unit and none claims FULL | 558–567 | 562–563, 566 |
| season setup: ↑ / ↓ / ✕ keep keyboard focus on the row they moved or removed | 569–584 | 576, 578, 580, 582–583 |
| season setup: 2026 REAL marks its sprint rounds, and each round toggles | 586–604 | 592–593, 599–600, 602–603 |
| season setup: the sprint note names the unit of the points it quotes | 606–610 | 609 |
| garage: the paint editor and its live-preview override die with the screen | 650–670 | 653–654, 657, 659–660, 664, 668–669 |
| garage: Change Car shows the sheet with aria-busy before heavy buildSetup work | 672–714 | 703–708, 710, 712–713 |
| garage: hiding the screen with no editor open is a no-op | 716–724 | 722–723 |
| garage: livery grid search + factory fold (#3339) | 726–763 | 738, 742, 745–747, 755–756, 761–762 |
| career hub: the round's brief is three pressable choices, with the taken one marked | 765–776 | 769–770, 772–775 |
| career hub: once the weekend is under way the brief is one line again | 778–785 | 783–784 |
| season setup: an APPLY that hits another tab's save reloads it, so the next APPLY can succeed | 787–806 | 800–803, 805 |
| title SEASON door: refreshTitle writes the round into the label span and the accessible name, and reverts | 808–834 | 813–814, 826–829, 832–833 |

Shared/top-level assertions (supplement case rows): 98, 200. These validate helper discovery, fixture/API availability or stub revision contracts.

## Cleanup findings and evidence boundary

No dependencies were removed. Synthetic parser trees, event transcript file labels, malformed storage keys, temporary import filenames and fake circuit/team IDs are intentional inputs rather than missing shipped modules. Fixture-only source paths are described without treating them as live files.

Comment cleanup candidates: settings-reload-vm line 15 says “tests above” although its case is the only test in that file; settings-open-perf lines 301–303 call the manifest assertion unused silencing, but it is a real top-level roster invariant. setup-preview-hull lines 32–35 describe “the one non-colour field” despite the expanded geometry enum/style roster; its timing/viewport anecdotes are historical context, not current measurement. settings-export line 646 says neither listed driving key is in SPEC while line 656 explicitly verifies unlimitedBudget is in SPEC; narrow that comment to the unknown key. The setup-screens-state header uses CareerUI while the actual global is CareerScreen; retain UI family context but use the current module name when navigating. Regression narratives elsewhere explain the failure each fixture protects and need no wholesale deletion.

All 219 declared case sites are mapped; loop templates are retained literally with matrix dimensions noted above, rather than claiming a fixed expanded runtime count. Each case contract is stated by its full name and scoped by its file’s exercised targets/fixtures/limits. Coverage is static source inspection only.
