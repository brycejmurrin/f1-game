# Unit tests group 07 — complete source map

Read-only mapping, 2026-10-27. All 11 assigned files, 4,544 lines, were read in full. No tests, browsers, runtime writes, commits or production edits were performed. This is a description of asserted contracts, not a passing-test verdict. Test titles below are used as concise contract labels; assertion line indexes retain every oracle's exact location without copying its expression or expected payload. Ranges are inclusive.

## Full-read ledger

Every test line, including setup, comments, loops and teardown, is covered by the following contiguous reads. Combined output that was truncated was re-read in smaller bounded chunks. SHA-256 is over complete raw file bytes.

| File | Fully read ranges | SHA-256 |
|---|---|---|
| `tests/unit/career-backup.test.mjs` | 1–400; 401–800; 801–1200; 1201–1600; 1601–2016 | `b63b4c166115a3c5d13824d766b157d2e238de19d04ee2bd3bca23089d02ea36` |
| `tests/unit/career-cross-tab.test.mjs` | 1–320; 321–620; 621–760; 761–894 | `628c3c2e2b82da535cf49221f200be60e20248b339bc09b555fe2645e288eaf9` |
| `tests/unit/career-data-audio-improvements.test.mjs` | 1–85 | `956f35cbe0e5de41e27d7cec971f4ff5612b1a1c77202ff45fb51f4e76c7d846` |
| `tests/unit/career-determinism.test.mjs` | 1–102 | `02dcf446b1238dfc2dfb7ca0bc226c2b97c9d39e8851f6ae2bd7d4a8b1ed6869` |
| `tests/unit/career-experience.test.mjs` | 1–142 | `d135bd95d208865473f6ed40f55867937661d64573a9ee770e2078c1443f6aeb` |
| `tests/unit/career-hire-rating.test.mjs` | 1–130 | `86f015b0dc8b688ea701a93a1d0f1f534bf93473dcbb30d2d47478bc0a69dc05` |
| `tests/unit/career-legends.test.mjs` | 1–143 | `258dac8cba23ce7e48fe566b58710d2ac5e93026104d446fb3234d9214d41592` |
| `tests/unit/career-readslot-quota.test.mjs` | 1–114 | `46fcd3fe14ef0d77e5de6356acd259da03afc7cb92726acc1c8695878e22aa30` |
| `tests/unit/career-regulations.test.mjs` | 1–213 | `a5a32e650c88ed760f64ef593bd316389cc0cfabfd424c9cb300bf6f3f258df3` |
| `tests/unit/career-round2.test.mjs` | 1–260; 261–513 | `f5f1adaab9a62a32aae5b200d99a0066ca62f418ef113a43d70ef1da8b320aa4` |
| `tests/unit/career-seat-rollover.test.mjs` | 1–192 | `a0e29112d995b95963c65285801212acd7ba184680a93a7a36060520d8c15852` |

## Production and fixture ownership

Attached apex-lsp outlines resolved CareerBackup, Career, CareerPlanning, SaveMigrate, SeasonCal, CareerScreen, CareerExperience, ResultsStory, Regulations, GameStore and DriverRatings. A definition query resolved Quali.create to the real model. Source reads then followed their concrete implementations. Symbols below are source-map keys, not alternate implementations.

| Key | Owning source spans and behavior |
|---|---|
| B1 | `js/career/career-backup.js:109–229`: clone/migrate six rows, per-slot identity, optional extras, serialization/download/export budget. |
| B2 | `js/career/career-backup.js:37–107,231–291`: version/scalar/shape/duplicate/ghost/UTF-8 and serialization gates; no migration coercion before payload rejection. |
| B3 | `js/career/career-backup.js:352–549`: per-extra cleaner, qualifying ownership/row validation, bounded allowlists, Daily JSON context keys and byte budget. |
| B4 | `js/career/career-backup.js:551–617,802–975`: armed/current revisions, destination preservation, detached migration preflight, scope, writes and durability; refresh/re-arm readers. |
| B5 | `js/career/career-backup.js:619–800,871–955`: same-season qualifying/sprint progress checks, badge earliest-unlock union, Daily best/min and laps/max, later streak, records fill gaps, read-only preview. |
| B6 | `js/career/career-backup.js:295–349,817–820,926–950`: explicit recovery destination, strict calendars/schema, career-season alias exclusion, reviewed season revision and selection isolation. |
| C0 | `js/career/career.js:82–101`: stateless Hash32 draws and year-specific season seed; `js/career/season-cal.js:686` unseeded calendar shuffle is an allowlisted nondraw use. |
| C1 | `js/career/career.js:130–141,149–259,303–360,393–480`: identity adoption, legacy moves, cache-only readSlot, restore-batch reconciliation, held pointer, unsupported occupancy, slot creation and seat/identity fields. |
| C2 | `js/career/career.js:113–123,261–301,362–386,962–982`: blocked writer/calendar/conflict state, armed revisions, refusal before gameplay/deletion. |
| C3 | `js/career/career.js:1194–1203,1235–1348`: objective verdict, settlement, staged championship award and in-place rollback preserving the season alias. |
| C4 | `js/career/career.js:1848–1960`: stamp/resolution, protect original raw bytes, explicit calendar adoption/remap/archive, durable-only acceptance, current track. |
| C5 | `js/career/career.js:602–635,1561–1669`: safe goal kinds, rival offers, weaker new seat, pure signature/revision-bound preview, authored works ownership and signing. |
| C6 | `js/career/career.js:1362–1457,1689–1846`: real-grid standings, driver/team development, cumulative tally, winter report and goal-reputation-before-market ordering; reset in place. |
| C7 | `js/career/career.js:742–769,1351–1395,1578–1588`: player/hire overrides, real-team grid filtering and market entrants. |
| C8 | `js/career/career.js:823–990,1074–1101`: era-keyed works cap, owned-only deterministic refit, grants, tier expectation, facility price/discount and free-money charging. Tier expectation specifically at 742–745. |
| C9 | `js/career/career.js:1501–1559`: expiring/poached hire decision, pending-ask renewal, sitting-hire replacement refusal, development reset only for replacement. |
| M | `js/career/save-migrate.js:8–40,125–172,188–217,287–393`: version ladder/scalar policy, tally, points/countback and career row/part/deal/stake normalization. |
| I | `js/career/team-identity.js:1–34`; `js/career/career.js:130–141`; `js/ui/settings-export.js:677–744`: per-career appearance gate and GP fallback. |
| U | `js/career/career-ui.js:77–374,830–861,1320–1350,1610–1668,1704`: read-only/export UI, file generation ownership, reviewed revisions, scoped second confirmation, previews/warnings, cancel/delete, hire tiles, hub and picker. |
| L | `js/ui/settings-export.js:893–933,1037–1073,1277–1289`: legacy first-tap revision snapshot, adapter into shared backup writer, apply counts, storage warning/no reload and success reload timer. |
| P | `js/career/career-planning.js:6–25,27–153`: protection predicate, locked weekend remap, snapshot comparison, factory/cash and pure future-era projections. |
| PUI | `js/career/career-planning-ui.js:4–90`: local/stored download snapshots, deliberate two-tap adoption, sponsor/stake locks, factory/wage estimates. |
| W | `js/core/store.js:29–210,310–355,663–750`: session/durable result distinction, requireDurable, retries, revisions, lifetime exclusive browser writer, mirror batch restoration. |
| S | `js/career/season-cal.js:140–162,263–365,394–410,463–519,538–628`: career calendar delegation, lossy-read protection/re-arm, sprint stage and award, seed, driver/constructor countback. |
| Q | `js/race/quali-model.js:86–113,329–376,408–424`: restore grid only for matching track/mode/seat and complete distinct live IDs; order/times retained. |
| D | `js/race/daily-challenge.js:58–119,141–156`: native select/record history and per-class share result; `js/race/race-control.js:211–216`: short-run lap fraction fixture. |
| R | `js/career/regulations.js:42–113`: four-season era cadence, catalog cost/hash tie-break bans and unrestricted null predicate. |
| A | `js/car/parts.js:839–963`: active legality, equivalent/default resolution, era-keyed factory cache and effective setup price. |
| H | `js/data/driver-ratings.js:16–61,101–130`; `js/career/career.js:33–43`: separate authored hire rows, tier-independent retrieval and weighted overall. |
| E | `js/career/experience.js:12–113`: live career metadata, cumulative totals, stamped calendar/brief and live objective status. |
| RS | `js/ui/results-story.js:10–57`: canonical verdict/points, classified retirement, watched/practice/duel presentation. |
| T | `js/ui/title-menu.js:195–216`: restored-batch refresh and guard against replacing an entering session's season. |

The shared mini-dom fixture (`tests/helpers/mini-dom.mjs:1–200`) implements attributes, selectors, listeners and node trees but no browser layout; textContent does not clear child arrays. The affected tests explicitly clear panes or select the latest paint. `seed-dom.mjs` evaluates the real Dom after changing lexical const to var; `seed-log.mjs` and `seed-hash32.mjs` evaluate the real modules; `abs-src.mjs` supplies VM filenames only. `fn-source.mjs:36–54` extracts the real objectiveMet function by indentation. These helpers are fixtures, not separate production oracles.

Backup fixture spans: save/loadHarness/fillSix/slotSnap at 44–157; qualifying/scored weekends at 418–452; device identity at 813–830; mini-dom screen and picker at 939–1029; legacy UI at 1299–1314; extras envelope at 1412–1418; recovery picker at 1586–1590. Real store/migration/career/season modules run against Map localStorage, one miniature real-team roster, 24 synthetic tracks and stub Parts/download/audio. Cross-tab fixture at 19–119 additionally emulates async IndexedDB request completion; planning UI at 629–674 uses its own small Node and action spies; writerLocks at 812–828 emulates lifetime lock ownership. No actual browser lock or IndexedDB implementation is exercised.

Other fixtures: data-audio 9–19 uses clone-on-read Map storage and real team/parts/regulation tables; determinism 55–95 poisons both random sources while simulating three four-round seasons; experience 9–15 loads real Dom/presentation against supplied Career mocks; hire-rating 31–46 uses real ratings and an empty grid, then 74–125 builds a tier-3 custom-team UI spy; legends 40–89 uses two real teams, custom and twelve legend rows; readslot-quota 25–72 uses real storage with quota on the career body; regulations 25–37 uses real catalog and roster; round2 28–88 offers optional real catalog and a stamped 24-track synthetic calendar; seat-rollover 34–77 uses flat ratings and identity migration.

## Per-case contracts

Each row covers its full test callback. “Assert lines” is a lossless location index of assertion calls, including assertions inside matrix loops; exact expected values and malformed fixture matrices live in those source spans. Parameterized declarations are listed once with their dimensions below, never mistaken for a single runtime case. Source keys refer to the concrete owners above.

### career-backup.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 159–188 | export → wipe → import round-trips byte-equal across all six slots | 166, 169, 170, 171, 172, 177, 182, 183, 186 | B1, M |
| 190–216 | a v0 save exports and imports through the migration ladder | 200, 201, 205, 206, 207, 211, 213, 214, 215 | B1, M |
| 218–238 | a current digit-string version imports durably without rerunning old migrations | 227, 229, 230, 232, 233, 234, 236, 237 | B1, M |
| 240–295 | hostile payloads are rejected with a reason and change nothing | 283, 284, 286, 287, 292, 293, 294 | B2 |
| 297–321 | import over a newer live revision is refused | 312, 318, 319, 320 | B4 |
| 323–345 | import from a driver card does not touch myteam without confirm | 334, 335, 336, 337, 343, 344 | B4 |
| 347–375 | a sparse backup restores its own slots and never erases the ones it lacks | 354, 364, 365, 366, 367, 372, 373, 374 | B4 |
| 377–401 | standalone qualifying survives backup serialization and restores its driven grid | 386, 389, 397, 398, 399, 400 | B3, B5, Q, S |
| 403–415 | legacy ID-only qualifying grids stay unstamped and retain their order | 407, 409, 410, 414 | B3, B5, Q, S |
| 454–469 | older backup keeps the Grand Prix stage after a zero-point sprint | 458, 459, 460, 462, 464, 465, 466, 467 | B3, B5, Q, S |
| 471–479 | seasonAhead compares the cleaned round: round 250 is 0, so a local round-5 season stays | 476, 477, 478 | B3, B5, Q, S |
| 481–487 | sprint-stage preservation keeps paid-sprint and zero-point Grand Prix protection | 484, 485 | B3, B5, Q, S |
| 489–518 | sprint-stage protection does not retain an unrelated weekend or replace incoming progress | 513, 515, 516 | B3, B5, Q, S |
| 520–542 | older backup preserves completed local qualifying, including the first racing seed | 529, 531, 532, 533, 534, 538, 539, 540 | B3, B5, Q, S |
| 544–555 | qualifying preservation compares progress maps independently of insertion order | 552, 553, 554 | B3, B5, Q, S |
| 557–592 | qualifying protection does not retain unrelated, stale, incomplete or corrupt grids | 586, 588, 589, 590 | B3, B5, Q, S |
| 594–619 | qualifying completeness follows standalone real/custom/Legends field rules | 605, 606, 611, 612, 616, 617 | B3, B5, Q, S |
| 621–637 | incoming qualifying and later progress replace local qualifying | 630, 631, 633, 634, 635 | B3, B5, Q, S |
| 639–664 | malformed qualifying classifications refuse the whole backup before slot or season writes | 660, 661, 662 | B3, B5, Q, S |
| 666–697 | import unions badges and keeps a standalone season that is further along | 678, 679, 681, 688, 695, 696 | B5 |
| 703–718 | import refuses the live slot once its revision moved past the one Career armed | 709, 711, 712, 714, 715, 716, 717 | B5 |
| 722–764 | import merges the daily challenge per day and keeps the later streak; records only fill gaps | 741, 743, 744, 745, 746, 747, 748, 751, 759, 763 | B5 |
| 766–790 | malformed history / offers / moves / roster rows import without crashing career | 777, 779, 780, 781, 782, 784, 789 | M, B4 |
| 792–809 | career imports keep only catalog part IDs and fitted category options | 805, 807, 808 | M, B4 |
| 832–851 | MY TEAM backups carry per-slot identity and never replace the one-off GP identity | 834, 836, 837, 838, 839, 843, 844, 845, 846, 848, 850 | I, B1, B4 |
| 853–899 | a driver-only or identity-less backup never erases a local MY TEAM identity | 867, 873, 883, 884, 885, 886, 894, 895, 896, 897, 898 | I, B1, B4 |
| 901–935 | garbage MY TEAM identity values are dropped without throwing | 905, 907, 922, 923, 924, 925, 926, 927, 928, 929, 933, 934 | I, B1, B4 |
| 1031–1051 | career slot cards expose EXPORT and IMPORT buttons | 1035, 1036, 1038, 1041, 1043, 1048, 1049, 1050 | U, B4, B5 |
| 1054–1073 | IMPORT confirmation keeps the reviewed revision and previews backup destinations | 1062, 1064, 1065, 1066, 1067, 1071, 1072 | U, B4, B5 |
| 1075–1092 | backup preview follows mode/extras scope and explains shared identity without writing | 1083, 1084, 1085, 1087, 1088, 1089, 1090, 1091 | U, B4, B5 |
| 1094–1117 | slot and extras quota failures preserve session success but never claim confirmed saving | 1106, 1107, 1108, 1109, 1110, 1111, 1115 | U, B4, B5 |
| 1119–1133 | a rejected extra after slot restoration reports partial application | 1130, 1131, 1132 | U, B4, B5 |
| 1135–1149 | slot-owned MY TEAM identity contributes to slot restore durability | 1143, 1144, 1145, 1146, 1147, 1148 | U, B4, B5 |
| 1151–1169 | the other-mode preview names the incoming team and retains an earlier saving warning | 1163, 1164, 1167, 1168 | U, B4, B5 |
| 1172–1200 | ALL MODES after ${focus} imports only the remaining mode and preserves later progress | 1183, 1185, 1193, 1194, 1195, 1196, 1197, 1198, 1199 | U, B4, B5 |
| 1203–1219 | ALL MODES refuses changes to the remaining mode since file selection | 1216, 1217, 1218 | U, B4, B5 |
| 1221–1241 | the MY TEAM replacement market does not offer a departed driver | 1229, 1234, 1235, 1239, 1240 | U, B4, B5 |
| 1244–1257 | IMPORT leaves a changed empty backup destination alone while restoring populated slots | 1254, 1255, 1256 | U, B4, B5 |
| 1262–1288 | ALL MODES after ${focus} preserves an active other-mode revision${peerWrite ? " and refuses a peer edit" : " until confirmation"} | 1276, 1277, 1278, 1286, 1287 | U, B4 |
| 1316–1336 | legacy file picker refuses a peer's ${flavour} write before touching any slots | 1328, 1332, 1333, 1334, 1335 | L, B4 |
| 1338–1350 | legacy file confirmation captures revisions on the first tap, including the selected-slot pointer | 1347, 1348, 1349 | L, B4 |
| 1352–1365 | legacy file imports both modes and refreshes the selected career through the shared authority | 1359, 1360, 1361, 1362, 1363, 1364 | L, B4 |
| 1367–1380 | empty and malformed legacy files preserve saves and do not reload | 1375, 1376, 1377, 1378 | L, B4 |
| 1382–1394 | legacy imports report refused storage and stay on the page | 1390, 1391, 1392, 1393 | L, B4 |
| 1396–1408 | real cached store preserves an unknown season through boot and menu loads | 1403, 1404, 1405, 1406, 1407 | S |
| 1420–1430 | SEC2-1: an oversized extra is refused before anything is written | 1426, 1427, 1428 | B2, B3 |
| 1432–1446 | SEC2-1: an extra with an own __proto__ key is refused | 1443, 1444 | B2, B3 |
| 1448–1479 | SEC2-1: each extra is rebuilt from its allowlist — junk keys and bad values never reach the store | 1458, 1460, 1461, 1462, 1463, 1464, 1465, 1466, 1468, 1469, 1471, 1472, 1473, 1474, 1476, 1477, 1478 | B2, B3 |
| 1481–1489 | SEC2-1: a legitimate backup's extras stay under the per-extra cap | 1486, 1487, 1488 | B2, B3 |
| 1492–1501 | C8: a restored standalone season re-arms SeasonCal, so its next save is not a conflict | 1497, 1498, 1500 | B4, S |
| 1505–1515 | portable recovery adapter reviews one chosen slot, restores offline, and leaves selection alone | 1509, 1510, 1511, 1514 | B6, U |
| 1516–1546 | active-career recovery aliases restore the career without replacing the standalone season | 1538, 1539, 1540, 1541, 1543, 1544, 1545 | B6, U |
| 1548–1565 | recovery rejects lossy career calIds before restoring any career or standalone data | 1559, 1560, 1561, 1562 | B6, U |
| 1567–1572 | recovery future, unknown or lossy calendars and malformed files are refused without changing raw or disk | 1570, 1571 | B6, U |
| 1573–1579 | recovery checks standalone revision before any career write and preserves newer local season | 1577, 1578 | B6, U |
| 1580–1584 | recovery qualifying uses the merged PR1517 validator without losing ownership stamps | 1582, 1583 | B6, U |
| 1591–1597 | recovery file UI previews its chosen destination and Cancel leaves every save untouched | 1595, 1596 | B6, U |
| 1598–1602 | recovery file UI confirms only its reviewed card and reports durable completion | 1601 | B6, U |
| 1605–1619 | import cannot replace future ${flavour}:${i} or partially write its bag | 1616, 1617, 1618 | B2, B4, M |
| 1622–1633 | a future schema in the last incoming backup row rejects the whole bag before writes | 1631, 1632 | B2, B4, M |
| 1635–1661 | bulk import preserves destinations with invalid explicit versions and accepts current controls | 1646, 1647, 1648, 1649, 1658, 1659 | B2, B4, M |
| 1663–1681 | single-slot recovery writer preserves invalid-version destinations | 1670, 1671, 1672, 1673, 1679, 1680 | B2, B4, M |
| 1686–1726 | import keeps the Daily per-class bests keyed by a JSON records context (#2165) | 1695, 1699, 1701, 1710, 1711, 1720, 1722, 1723, 1724, 1725 | B3, B5, D |
| 1728–1753 | native Daily backup round-trips 61 days of nine full records contexts | 1744, 1746, 1747, 1750, 1751, 1752 | B3, B5, D |
| 1755–1770 | native histories beyond the former class/day counts export without truncation | 1765, 1767, 1768 | B3, B5, D |
| 1772–1793 | Daily merge preserves nine classes and remains exportable | 1782, 1783, 1785, 1786, 1787, 1789, 1791, 1792 | B3, B5, D |
| 1795–1807 | merging valid Daily histories preserves their entire day union | 1804, 1805, 1806 | B3, B5, D |
| 1809–1828 | over-budget Daily union rejects before career, selection or extra writes | 1820, 1823, 1824, 1825, 1826, 1827 | B3, B5, D |
| 1830–1840 | hostile local Daily is refused before a merge can disguise its keys | 1837, 1838, 1839 | B3, B5, D |
| 1842–1852 | valid Daily import repairs non-object local history | 1849, 1850 | B3, B5, D |
| 1855–1865 | backup byte cap applies to UTF-8 strings and object imports before writes | 1859, 1861, 1863, 1864 | B2 |
| 1867–1872 | in-memory unserialisable backups are refused before any write | 1870, 1871 | B2 |
| 1874–1896 | pending career backup read respects ${action} ownership | 1887, 1895 | U |
| 1898–1921 | late ${failsWith} migration failure refuses the whole import before persistence | 1915, 1916, 1917, 1918, 1919, 1920 | B4, M |
| 1923–1944 | backup imports repair malformed JSON numeric leaves without mutating the envelope | 1936, 1937, 1938, 1939, 1940, 1941, 1942, 1943 | B4, M |
| 1946–1958 | object schema versions are refused before coercion or any import write | 1954, 1955, 1956 | B4, M |
| 1960–1986 | apply migrates each planned row exactly once before writing any destination | 1979, 1980, 1981, 1982, 1983, 1985 | B4, M |
| 1988–1994 | a {toString:1} version marker does not throw out of validate/apply | 1992, 1993 | B4, M |
| 1997–2016 | read-only career screen explains ownership, disables mutations and keeps exports available | 2002, 2003, 2006, 2007, 2008, 2010, 2012, 2014 | U, W |

### career-cross-tab.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 121–143 | migrateCareer coerces a corrupt deal, budget level and results ledger | 132, 133, 134, 135, 136, 137, 138, 139, 141 | M |
| 145–158 | year falls back to the first season for a missing, zero or junk value, and truncates a float | 151, 152, 153, 154, 155, 156, 157 | M |
| 160–177 | remapPoints sanitises the per-round and finish records, not only pts | 172, 173, 175, 176 | M |
| 179–199 | legacy migration preserves its source when the destination write hits quota | 195, 197 | C1 |
| 201–212 | legacy migration preserves a save when its destination set is full | 210 | C1 |
| 214–226 | an active career refuses to overwrite a newer foreign save | 221, 224, 225 | C2 |
| 228–245 | a conflicted career refuses grant/research so RAM does not drift from disk | 236, 237, 238, 239, 240, 241, 242, 243, 244 | C2 |
| 247–265 | settleRound refuses a conflicted save before mutating results | 258, 261, 262, 263, 264 | C2 |
| 267–278 | career scoring checks its slot before championship points mutate | 274, 275, 276, 277 | C3, S |
| 280–297 | career scoring commits points and settlement together on an unchanged slot | 290, 291, 292, 293, 295, 296 | C3, S |
| 299–320 | a revision changing after award staging leaves the live season alias untouched | 315, 316, 317, 318, 319 | C3, S |
| 322–345 | a rejected settlement rolls back staged points and economy in place | 339, 340, 341, 342, 343, 344 | C3, S |
| 347–362 | a conflicted career cannot be cleared or deleted, including from a stale slot card | 353, 354, 355, 360, 361 | C2, W |
| 364–384 | quota-refused clear and deletion report session-only outcomes | 374, 375, 376, 377, 381, 382, 383 | C2, W |
| 386–390 | career hub BACK hides the title STANDINGS chip from the standalone season | 388, 389 | U |
| 392–401 | outside active play a foreign live-slot save refreshes Career's object | 398, 399, 400 | C1, W |
| 403–421 | a restored non-default career and its pointer reconcile in the current boot | 414, 416, 417, 418, 419, 420 | C1, W |
| 423–426 | the title menu refreshes after a restored career batch selects its slot | 425 | T |
| 428–434 | title-menu season hydrate skips when a session entry is already open | 430, 432, 433 | T |
| 436–463 | missing calendar preserves exact raw JSON through reads, save, mutation and slot switch | 446, 447, 448, 449, 451, 452, 453, 457, 458, 459, 460, 461, 462 | C4, P |
| 465–485 | all missing and malformed calendar stamps are read-only; explicit adoption resets progress | 476, 477, 479, 480, 481, 482, 483 | C4, P |
| 487–500 | calendar adoption refuses newer stored revision and compares local versus stored without writes | 495, 496, 498, 499 | C4, P |
| 502–514 | v1 migration defaults Standard and original sponsor; v2 validates choices and stake | 506, 507, 512, 513 | M |
| 516–538 | quota-failed calendar adoption retains original through slot switching and unsupported future versions refuse adoption | 528, 529, 531, 532, 534, 535, 536 | C4, P, W |
| 541–573 | refused calendar adoption leaves cache and retry ownership on the original scored save | 555, 556, 557, 558, 559, 560, 561, 563, 564, 565, 567, 568, 569, 570, 571 | C4, P, W |
| 575–593 | public start preserves protected live save, refuses all protected targets, and explicit deletion frees slot | 581, 582, 583, 584, 585, 586, 587, 588, 589, 591, 592 | C4, P, W |
| 595–607 | explicit null stamp and huge future version preserve raw and block public overwrite | 601, 602, 603, 604, 605 | C4, P, W |
| 609–626 | calendar adoption carries current paid escrow and weekend lock to the remapped round | 617, 618, 619, 620, 621, 622, 623, 624 | C4, P, W |
| 676–688 | actual planning recovery UI exports different local/stored JSON, reloads without automatic adoption | 678, 679, 681, 682, 683, 684, 686, 687 | PUI |
| 690–701 | actual protected UI requires two taps to adopt, reports failure and rebuilds only on success | 692, 693, 695, 696, 697, 698, 699, 700 | PUI |
| 703–725 | actual planning cards explain lost sponsors, lock style/stake controls, and quote factory/wages | 705, 707, 709, 710, 711, 712, 713, 714, 719, 720, 722, 723, 724 | PUI |
| 727–752 | real CareerScreen creates and opens hub and slots with planning helper present and no leaked locals | 744, 745, 746, 747, 748, 749, 750, 751 | U, PUI |
| 755–772 | future ${flavour}:${i} remains occupied and protected until explicit deletion | 760, 761, 763, 764, 765, 766, 767, 769, 770, 771 | C1, C2 |
| 779–796 | a missing live slot restored from the mirror stays the selected career (#2193) | 788, 789, 792, 793, 794, 795 | C1, W |
| 798–808 | a fallback with nothing to restore persists the fallback pointer once the mirror settles (#2193) | 803, 806, 807 | C1, W |
| 830–861 | one lifetime writer protects saves before storage events, including a stale localStorage snapshot | 839, 840, 843, 844, 845, 846, 847, 848, 849, 850, 851, 852, 854, 857, 858, 860 | W, C2 |
| 863–881 | writer acquisition discards pre-lock reads and owner quota failures preserve session progress | 870, 873, 876, 877, 878, 879, 880 | W, C2 |
| 883–894 | missing or denied browser locks fail closed while leaving career reads and other settings available | 887, 888, 889, 890, 891, 892 | W, C2 |

### career-data-audio-improvements.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 20–33 | two MY TEAM identities persist independently and never overwrite GP appearance | 24, 25, 27, 28, 29, 30, 31, 32 | I, C1 |
| 34–46 | contract comparison is pure and final signing agrees on seat, deal, works parts and cap | 38, 39, 40, 41, 42, 43, 45 | C5 |
| 47–52 | a reviewed contract cannot sign after an offer or career-state change | 51 | C5 |
| 53–63 | winter report records actual applied driver/team deltas and reload never reapplies them | 58, 59, 60, 61, 62 | C6 |
| 64–69 | stale primary slot revision prevents signing or repainting before any career mutation | 68 | C5, C2 |
| 70–77 | legacy team identity is adopted once, independently per slot | 74, 76 | I, C1 |
| 78–85 | contract preview preserves authored works research across era bans without changing the live legality predicate | 82, 83, 84 | C5, R, A |

### career-determinism.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 29–35 | js/career/ never consumes the physics simRnd() stream | 30, 33 | C0 |
| 37–46 | js/career/ calls Math.random only at the allowlisted non-draw sites | 41, 44 | C0 |
| 97–102 | a career played through three rollovers is byte-identical twice, with Math.random and simRnd poisoned | 99, 100, 101 | C0, C6 |

### career-experience.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 17–28 | career garage decoration is gated by live flow, not a loaded save | 23, 25 | E |
| 30–40 | calendar stories map saved zero-based round results without inventing missing results | 34, 35, 36, 37, 39 | E |
| 42–50 | result story uses canonical retirement verdict and preserves supplied classification order | 47, 48, 49 | RS |
| 52–62 | classified retirement gets paid points but is excluded from the podium | 56, 57, 59, 61 | RS |
| 64–71 | a watched replay never congratulates the followed car as the player, and duels have no podium | 68, 70 | RS |
| 73–91 | armed unscored practice reports its finish without earned points, podium or stale career settlement | 79, 80, 81, 82, 83, 85, 88, 89, 90 | RS |
| 93–98 | totals read the cumulative tally, so a trimmed history archive does not cap the record | 97 | E |
| 100–142 | the pause card's career brief reads Career.objectiveMet on settleRound's ctx, live | 105, 117, 119, 121, 123, 125, 127, 129, 131, 133, 135, 137, 139, 141 | E, C3 |

### career-hire-rating.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 48–61 | every free agent rates the same whatever tier asks (tile tier == race tier) | 51, 55, 58, 59 | H |
| 63–72 | a dearer free agent never rates lower: overall is non-decreasing in ask | 69 | H |
| 74–125 | the tile asks the way the race asks: with the custom team's tier, not the agent's | 111, 117, 119, 120, 122 | H, U |
| 127–130 | HIRES stays out of BASE, so the grid statistics are about the real 22 only | 129 | H |

### career-legends.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 91–99 | no legend takes a seat on the career grid | 95, 96, 97 | C7 |
| 101–111 | standings count the constructors, not the guests | 105, 108, 110 | C7 |
| 113–125 | the driver market and contract offers stay inside the real grid | 119, 122, 124 | C7 |
| 127–143 | an unknown team id falls back to MY TEAM, not to whatever booted last | 135, 136, 137, 139, 140, 141 | C1, C7 |

### career-readslot-quota.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 74–114 | readSlot keeps a cache-only protected career when captured raw was null (#3559) | 92, 93, 94, 95, 96, 99, 100, 101, 102, 106, 107, 108, 112, 113 | C1, C4, W |

### career-regulations.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 39–52 | the first era is OPEN, and it lasts the whole first build | 43, 44, 46, 48, 50 | R |
| 54–62 | eras advance on a fixed cadence and wrap | 58, 60, 61 | R |
| 64–86 | a ban takes the DEAREST options, is derived from the catalog, and never takes a free one | 68, 69, 74, 80, 83 | R |
| 88–99 | NO ERA EVER EMPTIES A CATEGORY — _resolve() always has somewhere to fall | 94, 95 | R |
| 101–119 | A REGULATION MOVES THE AI's FACTORY BUILD, not just the player's | 112, 114, 118 | R, A |
| 121–141 | the factory CACHE cannot serve a pre-regulation build | 131, 136, 138, 140 | R, A |
| 143–157 | a banned option resolves to something legal rather than throwing or sticking | 153, 154, 155 | R, A |
| 159–167 | legalityFor returns nothing for an unrestricted era | 164, 165 | R |
| 169–188 | the banned set does not depend on the catalog's authoring order (tie-break is explicit) | 181, 182, 187 | R |
| 190–213 | next-era impact preview preserves inventory and active legality with resolver-equivalent fallback | 204, 205, 208, 211 | R, P, A |

### career-round2.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 90–108 | an era cap fall refits only researched parts and persists a legal budget without spending | 93, 94, 97, 98, 99, 100, 102, 105, 107 | C8, A |
| 110–125 | activating an old over-cap save repairs fitting; inactive reads and valid fits stay untouched | 115, 118, 119, 120, 121, 123, 124 | C8, A |
| 127–139 | slot activation normalizes an old fitting without touching ownership or automatically restoring it later | 134, 135, 136, 138 | C8, A |
| 141–155 | budget repair preserves a banned stored id whose resolved category costs nothing | 147, 149, 150, 151, 154 | C8, A |
| 158–161 | C1: start() stamps the calendar by id | 160 | C4, S |
| 163–172 | C1: a circuit dropped from Tracks.SEASON mid-career does not skip the next race or shorten the season | 166, 168, 169, 170, 171 | C4, S |
| 174–182 | C1: circuits inserted earlier in Tracks.SEASON do not repeat the one just raced | 178, 179, 181 | C4, S |
| 184–190 | C1: SeasonCal.list() in the career flow follows the stamped calendar | 188, 189 | C4, S |
| 192–204 | C1: a save without a stamp adopts the current calendar on load; rollover re-stamps | 198, 202, 203 | C4, S |
| 206–224 | C1: a stamped circuit this build no longer knows is dropped and the round remapped like SeasonCal.resume | 217, 218, 219, 220, 221, 222, 223 | C4, S |
| 226–262 | removed raced circuits retain achievements through migration, reload and rollover | 236, 237, 239, 240, 243, 245, 249, 254, 258, 259, 260, 261 | C4, C6, M, E |
| 264–287 | unsupported career card keeps the picker and never opens the previous career (foreign change: ${changedAfterRender}) | 278, 281, 282, 283, 284, 286 | U, C1 |
| 289–300 | C1: the hub's NEXT RACE card names the circuit Career.trackIndex() will load, after the calendar changed | 297, 298, 299 | E, C4 |
| 303–321 | C2: a beatRival move offer signs the rival it printed, and never names the offered team's own driver | 312, 318, 320 | C5 |
| 323–332 | C2: a hostile offer goal type is stored as champPos, not as 'constructor' | 328, 329, 331 | C5 |
| 335–350 | C3: the player takes the weaker seat of the new team whichever seat they left | 345, 348 | C5 |
| 353–363 | C4: hireDriver(the sitting hire) is refused, so renewal cannot be dodged and development survives | 356, 359, 360, 361, 362 | C9 |
| 366–383 | C5: a met contract goal's reputation counts in this winter's market value | 382 | C6 |
| 386–393 | C9: a p:0 result row is not a podium | 392 | C6 |
| 396–402 | D6: NEW CAREER accepts number 1 (0 and blank stay 99) | 400 | C1 |
| 404–412 | a slot whose team is null still describes itself with strings (the CAREER MODES card upper-cases it) | 410, 411 | C1 |
| 414–432 | calendar protection: a save naming a retired circuit loads read-only, refuses engage and writes, and keeps its stamped calendar | 423, 424, 426, 428, 429, 430, 431 | C4 |
| 436–462 | facility upgrades charge the geometric ladder, refuse when short or maxed, and cost nothing under free money | 444, 445, 447, 448, 450, 451, 452, 455, 456, 459, 460, 461 | C8 |
| 464–473 | grant credits the balance: the default amount, an explicit one, never a negative one; nothing without a career | 466, 469, 470, 471, 472 | C8 |
| 475–486 | tierFinish / expectedFinish: the stronger the tier the better the expected finish, reputation shifts it, both stay on the grid | 477, 479, 481, 483, 484, 485 | C8 |
| 488–502 | renewHire pays the PENDING figure, clamps the term to 1..3 years, and refuses without a renew offer | 491, 493, 495, 496, 497, 498, 501 | C9 |
| 504–513 | constructors' countback: equal points rank by the best finishes of BOTH cars, then tier, then id | 510, 512 | S |

### career-seat-rollover.test.mjs

| Test span | Contract | Assert lines | Source keys |
|---|---|---|---|
| 79–97 | a MY TEAM career is created in seat 0, so the player drives their OWN identity | 87, 92, 95 | C1, C7 |
| 99–105 | a DRIVER career still honours the seat the player picked | 103 | C1, C7 |
| 108–119 | constructor ties use the same tier policy in standings and winter history | 115, 117, 118 | C6, S |
| 121–140 | a driver poached in winter cannot be immediately signed back | 130, 133, 134, 135, 137, 138, 139 | C9, C6 |
| 142–155 | an ordinary expiring hire can still accept the renewal offer | 150, 151, 152, 153, 154 | C9, C6 |
| 157–178 | the career record outlives the HISTORY_MAX archive (12 titles stay 12 titles) | 171, 173, 174, 175, 176, 177 | C6 |
| 180–192 | a career saved before the tally existed counts from the history it still has | 187, 188, 191 | C6 |

## Matrix and semantic details

- Backup 240–295 rejects 17 explicitly named hostile cases before mutation, plus a raw-text size case; reasons are pinned independently for validate and apply. 639–664 covers invalid grid container/row/identity/time/flag/stamp values as a whole-file refusal, retaining unrelated slot data.
- Backup 454–469 crosses sprint true/round-list × seed before export false/true × previous round false/true. 489–518 enumerates 13 unrelated-weekend controls; 557–592 enumerates 22 stale/incomplete/corrupt qualifying controls. 594–619 checks real/custom/Legends field membership and rejects one extra car. Qualifying restoration tests call the real Quali reader, beyond JSON retention.
- Backup second-mode declarations expand driver/myteam (1172), driver/myteam × peer-write false/true (1262), and legacy peer writes in either flavour (1316). Null backup rows neither overwrite nor conflict with newly populated destinations. Second confirmation restores only the remaining mode, never replaying first-mode or shared progress; prior nondurable warning survives a later durable write.
- Backup future destinations at 1605 cross two flavours × three slots; one future incoming last row also refuses the entire file. Invalid explicit version matrices at 1635/1663 distinguish invalid markers from current number/string/missing controls. 1946 rejects thirteen invalid incoming forms. 1898 crosses throw/null late migration failure, preserving disk, cache revision and original envelope; 1960 verifies exactly-once detached migration before writes, while public writeSlot still migrates.
- Recovery matrices retain raw input and disk on refusal, reject unknown/duplicate/empty/wrong-type/overlong calendars, keep aliased career championship out of standalone storage, enforce reviewed season revision before career writes, preserve newer local progress and keep selected slot unchanged. Mini-dom cancel/confirm pins the chosen second driver card.
- Daily history cases exercise JSON context keys with hostile/oversized keys removed, a native 61-day × nine-context export over the former 256 KiB ceiling, nine classes/121 days beyond former counts, nine-class merge and 240-day union. Over-budget union preflights before any slot/pointer/extras mutation; skipping extras bypasses that merge. UTF-8 byte checks distinguish character length from bytes; circular objects return bad-json.
- Pending-read test expands delete-arm/delete-confirm/close/normal; only normal may revive review. Read-only UI expands busy/unavailable, disables mutations and programmatic entry while preserving export.
- Cross-tab 267–345 injects a revision move at second/third keyRevision read to distinguish pre-award rejection from post-staging settlement rollback; both preserve the exact live season object and original serialized RAM. Unchanged-slot control awards 25 points and one settlement durably.
- Cross-tab adoption controls cover partially missing versus all-missing/malformed calendars, reset or archived achievements as appropriate, stale raw/revision refusal, quota and future versions, cache/retry ownership, explicit protected deletion, and escrow/objective/weekend remap. Future occupancy declaration expands every flavour/slot. Lifetime writer tests exercise both stale localStorage snapshots and absent/denied lock APIs; busy documents never take over automatically after owner close.
- Determinism scans every js/career JavaScript file after comment stripping, allows at most one Math.random call in season-cal and restore-points, rejects all simRnd references, and dynamically compares three saved rollovers twice for seed 31 against distinct seed 32. The dynamic path asserts four settlement rows per year to prevent a vacuous comparison.
- Hire ratings check all eight agents at tiers 0–4, monotonic overall sorted by ask and absence from BASE. UI spy uses custom tier 3 to catch a hard-coded 2; printed pace/craft/ask must agree with actual retrieval.
- Regulations iterate all eras/categories/options, test at least two complete cycles, actual tied costs, reversed/rotated catalog order, effective AI factory prices and cache restoration. Future transition preview is compared with the real resolver while inventory and currently installed legality stay unchanged.
- Round2 beatRival sweep uses seeds 1–120 and requires at least ten moving rival offers; weaker-seat matrix uses five teams × both old seats. Goal reputation sweep uses seeds 1–40 and requires some tier-3 offers. Number controls cover 1/2/0/100/undefined. Facility loops all levels, charges price/change, rejects short/max and checks free money; grant covers missing career/default/explicit/negative; expected finish covers tiers/reputation/grid bounds; renewals cover pending kind/ask and 1–3 year clamps.
- Seat-rollover separates owner forced seat 0 from driver-selected seat 1, constructor ranking/history agreement, deterministic poach versus renew control, HISTORY_MAX+2 winters and pre-tally history fallback.

## Limits and comment issues

No runtime verification was requested or run. Source-regex cases (cross-tab 386,423,428; determinism scans; experience export-surface pin) prove text placement/patterns, not browser behavior. VM tests omit boot script ordering, real browser event scheduling, native downloads, actual quota reclamation, rendering, layout and audio. The data-audio filename contains no audio assertions. Several harnesses intentionally use identity migrateCareer or fixed CAREER_V values, so those files do not verify current migration compatibility; backup/cross-tab/readslot use the actual migration module. Tiny rosters and calendars constrain the demonstrated domain.

Comment discrepancies: backup header describes one global MY TEAM identity while current assertions/implementation own it per slot. Backup header's cross-tab “still green” is a suggested adjacent run, not an assertion or result in this file. Seat-rollover header claims a countback histogram survives a season, while rollover implementation clears prior-year finishes; this file's actual tests concern constructor tie policy and cumulative history. Cross-tab scoring comment at 286 says still-running cars cannot score and marks its player finished, but current SeasonCal.award explicitly scores running classified cars; the fixture still demonstrates its narrower committed-scoring case. Planning UI adoption warning says removed round results are removed, whereas current adoption archives scored achievements and drops their active round index; round2/cross-tab assertions pin the archive behavior. These are mapping observations only; no comments were edited.

Production source spans are selective reads resolving the tested contracts, not a claim that every production file was fully read. Fictional IDs t0/t1, a/gone/missing, x1/n1/n2 and blob:test are fixture values, not repository paths or live resources. Download names apex26-career-local.json and apex26-career-stored.json are generated filenames, not existing report links.

## Source identity ledger

These complete-file hashes identify source/helper versions used for selective navigation. They do not expand the read claims above.

| Source/helper | SHA-256 |
|---|---|
| `js/career/career-backup.js` | `25d223bc99ff1d74487827ea97a88dbe7cd0bdcde7e40837c0dfc44fa35bff4c` |
| `js/career/career.js` | `679d9052fa1682c8aacc4df35c35b9142676b78f34349c1853bce274eadd24f8` |
| `js/career/save-migrate.js` | `4cda0b16446ec654bfdab06d873ef934c45b9bebd8906621b2a908f8896793e7` |
| `js/career/career-planning.js` | `5ef9a227c780aee8b446b977148556a75ddb6ed97f1f398a71e9b432ee2a4828` |
| `js/career/season-cal.js` | `f7a455b7b37beeed3b796b8608569662ecbcabb157e5de342adf52de63b9163f` |
| `js/career/career-ui.js` | `5454d6e4199ef3e19ef567d2ba615e29ca1295a594c202cdec30bd9a773fec8c` |
| `js/career/career-planning-ui.js` | `f9c4604cf65f086760939847121287b608b26db9f37302b3d3b3d5ec4cded067` |
| `js/career/team-identity.js` | `b620977819698729f87b6e431ebad9add8d4fffc2084fb08b4e4d12865a17af4` |
| `js/career/regulations.js` | `8423af9b935c719538a622e091216a8476a4b6a4c8695727b6e0141a948bc6d2` |
| `js/career/experience.js` | `45c478355ba3b94543193726af17f2267d5d8b2cc6dd23a9011879cb4faccaa3` |
| `js/ui/results-story.js` | `90f6bdfea96b08cf96ad51f02c90ee4ed30a379f4d6b5d28ed7c8575e06725c1` |
| `js/ui/settings-export.js` | `f88dcf1dfe421bd91f8777328723045a6c7336a375e81cb372a2137bccf8ebf3` |
| `js/ui/title-menu.js` | `7925708921ae016559e3a2a8e3fc1e9e2f5fec652686a131caff5db75f7d5ff6` |
| `js/core/store.js` | `736b2573d7a8376f5eaa7526486310fa1455e47ee7aa20c510ba4f648f2dda0b` |
| `js/car/parts.js` | `7b4c53b388b06b294b59faf46f44f5d01b7fccece83e8732b3c083194558fe4f` |
| `js/data/driver-ratings.js` | `307e1e1695953cea7f489a82e96e96e4b6343aeb66b8c261307d5d4e190263d1` |
| `js/data/teams.js` | `6ff73b5e60b9d510d9a9d4a17129f1947811ce217fda0dc8c1ccf8b64fdfe838` |
| `js/race/quali-model.js` | `862483da27e204ea2224d9b408971948e4f0822d88f93cdb81e26f364b7cd205` |
| `js/race/daily-challenge.js` | `4bc3631c088a32d91bad20d9f18a5254bb06d497cd8261b5f9296c00c1333a06` |
| `js/race/race-control.js` | `1dfaf228a9906bc173fdccad5e6605514cc530fdc48ff9883935813c80dd67ca` |
| `tests/helpers/mini-dom.mjs` | `3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1` |
| `tests/helpers/seed-dom.mjs` | `39a9641b0db53f03c540f3551b6176679a79251fff3cbb599a75e47cbb49be94` |
| `tests/helpers/seed-log.mjs` | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| `tests/helpers/seed-hash32.mjs` | `63898201b1f334c30eeca8bfc0d4bc799fef1083263bee876aebb2574f2e2d24` |
| `tests/helpers/abs-src.mjs` | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| `tests/helpers/fn-source.mjs` | `3f40d63e82348c9e48ed950481386b75d3f8c17c03502748aa600d1444ae9e19` |

Coverage inventory: 188 test declarations; parameterized cases and callback-internal sweeps are described above. All assigned files are represented.
