# Unit group 33 — complete source map

Read-only mapping, 2026-10-27. All seven sources were read in individually returned chunks of at most 100 lines; truncated aggregate pages were re-read. No tests or browser runs were performed. This is source evidence, not a passing verdict. Line ranges and SHA-256 refer to this checkout.

Navigation: read AGENTS.md and `.claude/skills/code-nav/SKILL.md`; used local apex-lsp outline for all nine principal networking modules and definition/body for retireCar. Function boundaries below are AST-resolved against local source; targeted source reads confirm settings consent, seed rewind/start ownership, finish clock, cancellation polling and scanner generation.

## Source inventory

| Source | Full read range | SHA-256 |
|---|---|---|
| tests/unit/net-lobby-lifecycle.test.mjs | 1–2622 | `711e207bb3e91274504ddb1cb4136bf68557389e0aac617a40b917f32d389bd2` |
| tests/unit/net-nostr-sockets.test.mjs | 1–271 | `e9bf073a142a5bd9d2bb0f39f6024209c1537d2a7bbb599ebb13196300547a42` |
| tests/unit/net-qr.test.mjs | 1–248 | `dd490d7a62f9df31becdc92ffdeb7d237bdedc3058dc03ad71b8755781b53179` |
| tests/unit/net-rendezvous.test.mjs | 1–728 | `c11719f97a17dfefd7705fd187b145a93c7a90db8c72409e04e21a9ca42b6a02` |
| tests/unit/net-roster.test.mjs | 1–647 | `af590a3e53025a95312d7674b7945b68deb8868f0aa0674d7a96d3d150a5759a` |
| tests/unit/net-sdp.test.mjs | 1–318 | `a80537e97abf4b93287f653f120e0b0e08f340a71fe45902be734e75ee56253a` |
| tests/unit/net-seed-sync-vm.test.mjs | 1–122 | `62661b6872464b5824aef987992dcde85e8c2e630a1c7f47724d7af8d0683f86` |

## Harnesses and limits

Lobby lifecycle uses VM-evaluated real lobby, lobby-codes, lobby-roster, lobby-settings and NetPlay, with fake elements, transports, sessions, handshake, teams, parts and rendezvous (lines 1–176; fake sessions/connected guest 626–660; connected host 791–812; closable harness 1212–1225; code room 1543–1578; ready host 1974–1997; quali guest 2133–2154; reveal harness 2300–2330). Assertions inside these helpers are fixture preconditions, listed separately below. It exercises real async continuations/timers, without DOM layout, camera permissions, WebRTC or relay transport. Source regex guards pin spelling/structure rather than executing their claimed branch.

Nostr boot (25–75) patches only the vendored dynamic import and optionally join timeout, uses real WebCrypto/bytes/rendezvous and manually controlled fake sockets/visibility; `.test` relay URLs are descriptive fixture endpoints, never live relay evidence. QR raster/roundTrip (30–55) uses independent jsQR over synthetic perfect pixels; the “every byte” case actually covers printable ASCII cycling 32–126, not all 256 byte values. Scan world (125–149) replaces media/DOM/detector globals; restart cases use manually driven intervals and promise completions. No physical-camera reliability is established.

Rendezvous relay (66–116) is an ephemeral loopback HTTP stand-in for the Worker contract, with real fetch, JSON, status codes and WebCrypto. Dead/rate-limited responses, skewed clocks, overridden fetch and crypto counters are fixture controls. It does not run Cloudflare or real Nostr. Reserved, loopback and `.test`/`.invalid` URLs and documentation IPs are fixtures, not operational references.

Roster fakeSession/stubG (44–102), hostWithGuest (382–402), real snapshot/session codecs, straight-track sampler and selected retireCar extraction isolate ownership, timing and authority. No actual network, track driving or audio output is proven. SDP REAL (47–67) is embedded Chromium capture; variants are synthetic address/role mutations. Codec round trips do not establish ICE connectivity. Seed-sync hostLobby (25–85) proxies a real game VM through real lobby start; network and DOM remain fake. Two VMs compare skill and grid strings; lane equality is not directly asserted.

Helper implementations read: `tests/helpers/seed-log.mjs:1–35` evaluates real Log; `tests/helpers/seed-clipboard.mjs:1–21` evaluates real ApexClipboard; `tests/helpers/abs-src.mjs:1–8` supplies absolute VM filenames; `tests/helpers/game-source.mjs:1–84` resolves extracted declarations over the manifest-derived game union. These are evaluation/source-location seams, not browser substitutes.

## Case map

Each row gives exact declaration/callback range, every lexical assertion call span, production targets and the contract expressed by the test. Loop expansions share source and assertions; names are expanded individually. “VM” means evaluated production logic with the fixture limits above.

### tests/unit/net-lobby-lifecycle.test.mjs

| Case / meaning | Case range | Assertion spans | Production targets | Evidence limit |
|---|---|---|---|---|
| peer leave refreshes the friend-quali gate so a dropped rival unlocks the sheet | 178–183 | 179–179, 180–180, 181–181, 182–182 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086; js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | Source-shape guard; no branch execution. |
| a consumed or cancelled URL invite is removed without losing unrelated URL state | 185–206 | 196–196, 197–197, 205–205 | js/net/lobby.js:2219–2242; js/net/lobby.js:345–349 | VM/fake-wire evidence; see harness limits. |
| an invite link opened in a RUNNING tab opens the lobby on hashchange, once | 208–238 | 221–221, 222–222, 227–227, 228–228, 232–232, 235–235, 236–236 | js/net/lobby.js:2219–2242; js/net/lobby.js:345–349 | VM/fake-wire evidence; see harness limits. |
| a link tapped while the host has an offer out is deferred, and close() keeps an unhandled invite | 240–271 | 255–255, 256–256, 260–260, 262–262, 263–263, 267–267, 269–269 | js/net/lobby.js:2219–2242; js/net/lobby.js:345–349; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| a newer join operation prevents a late host continuation | 273–284 | 280–280, 281–281, 282–282 | js/net/lobby.js:1424–1452; js/net/lobby.js:1483–1500 | VM/fake-wire evidence; see harness limits. |
| cancel then reopen prevents the prior lobby generation from attaching | 286–299 | 295–295, 296–296, 297–297 | js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| open() is a no-op while How to Play is visible | 303–313 | 307–307, 308–308, 310–310, 311–311 | js/net/lobby.js:2032–2057 | VM/fake-wire evidence; see harness limits. |
| MAKE ANSWER during a join still fetching relay credentials waits for the transport | 315–351 | 335–335, 336–336, 338–338, 340–340, 341–341, 342–342, 348–348 | js/net/lobby.js:1483–1500 | VM/fake-wire evidence; see harness limits. |
| MAKE ANSWER waiting on ICE cannot cross close | 356–382 | 374–374, 375–375, 376–376, 378–378, 379–379, 380–380 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| MAKE ANSWER waiting on ICE cannot cross reopen | 356–382 | 374–374, 375–375, 376–376, 378–378, 379–379, 380–380 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| MAKE ANSWER waiting on ICE cannot cross join | 356–382 | 374–374, 375–375, 376–376, 378–378, 379–379, 380–380 | js/net/lobby.js:1483–1500 | VM/fake-wire evidence; see harness limits. |
| MAKE ANSWER waiting on ICE cannot cross host | 356–382 | 374–374, 375–375, 376–376, 378–378, 379–379, 380–380 | js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| pending invite clipboard code cannot enter a replacement lobby attempt | 387–421 | 413–413, 414–414, 415–415, 416–416, 418–418, 419–419 | js/net/lobby.js:2104–2210 | VM/fake-wire evidence; see harness limits. |
| pending invite clipboard empty cannot enter a replacement lobby attempt | 387–421 | 413–413, 414–414, 415–415, 416–416, 418–418, 419–419 | js/net/lobby.js:2104–2210 | VM/fake-wire evidence; see harness limits. |
| pending invite clipboard denied cannot enter a replacement lobby attempt | 387–421 | 413–413, 414–414, 415–415, 416–416, 418–418, 419–419 | js/net/lobby.js:2104–2210 | VM/fake-wire evidence; see harness limits. |
| pending answer clipboard code cannot enter a replacement lobby attempt | 387–421 | 413–413, 414–414, 415–415, 416–416, 418–418, 419–419 | js/net/lobby.js:2104–2210 | VM/fake-wire evidence; see harness limits. |
| pending answer clipboard empty cannot enter a replacement lobby attempt | 387–421 | 413–413, 414–414, 415–415, 416–416, 418–418, 419–419 | js/net/lobby.js:2104–2210 | VM/fake-wire evidence; see harness limits. |
| pending answer clipboard denied cannot enter a replacement lobby attempt | 387–421 | 413–413, 414–414, 415–415, 416–416, 418–418, 419–419 | js/net/lobby.js:2104–2210 | VM/fake-wire evidence; see harness limits. |
| changing directly to join invalidates an outstanding clipboard read | 426–446 | 442–442, 443–443, 444–444 | js/net/lobby.js:2104–2210; js/net/lobby.js:1483–1500 | VM/fake-wire evidence; see harness limits. |
| changing directly to host invalidates an outstanding clipboard read | 426–446 | 442–442, 443–443, 444–444 | js/net/lobby.js:2104–2210; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| changing directly to code-picker invalidates an outstanding clipboard read | 426–446 | 442–442, 443–443, 444–444 | js/net/lobby.js:2104–2210 | VM/fake-wire evidence; see harness limits. |
| a newer clipboard request wins when reads finish out of order | 449–469 | 462–462, 465–465, 466–466, 467–467 | js/net/lobby.js:2104–2210 | VM/fake-wire evidence; see harness limits. |
| scanner completion is guarded by scanner identity and generation | 471–496 | 484–484, 485–485, 488–488, 489–489, 490–490, 493–493, 494–494 | js/net/lobby.js:2104–2210; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| wake-lock requests coalesce and a lock granted after close is released | 498–514 | 509–509, 513–513 | js/net/lobby.js:1977–1998; js/net/lobby.js:1999–2005 | VM/fake-wire evidence; see harness limits. |
| an old wake sentinel's release event cannot clear the current sentinel | 516–547 | 540–540, 545–545 | js/net/lobby.js:1977–1998; js/net/lobby.js:1999–2005 | VM/fake-wire evidence; see harness limits. |
| the reopen, watch and clash timers are all owned and cancellable | 550–587 | 556–556, 557–557, 558–559, 564–564, 566–567, 570–572, 573–574, 578–580, 583–583, 584–584, 585–586 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | Source-shape guard; no branch execution. |
| a seat-clash move is in-memory only — the lobby never writes the saved team | 589–603 | 600–600, 601–601 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086 | VM/fake-wire evidence; see harness limits. |
| a MY TEAM (custom) car is moved off in the room, whatever the player's rank | 605–619 | 614–614, 615–615, 616–616, 617–617 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086 | VM/fake-wire evidence; see harness limits. |
| a guest keeps its seat against a LATER guest relayed onto it | 664–674 | 670–670, 671–671, 672–672 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086 | VM/fake-wire evidence; see harness limits. |
| a guest drops another guest the host says has LEFT the lobby | 676–688 | 684–684, 686–686 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| a guest yields its seat to the host and to an EARLIER guest | 690–702 | 695–695, 696–696, 700–700 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| a LEGENDS car is moved off in the room like MY TEAM (legends: true, no custom) | 704–721 | 709–710, 716–716, 717–717, 718–718, 719–719 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086 | VM/fake-wire evidence; see harness limits. |
| CHANGE CAR withdraws READY before the garage opens; returning re-announces but does not re-ready (#1919) | 723–750 | 736–736, 738–738, 739–739, 740–740, 744–744, 745–745, 746–746, 748–748 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| CHANGE CAR when not READY sends no READY traffic | 752–762 | 759–759, 760–760 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| the host tags relayed HELLOs and its own with the join rank | 764–768 | 765–765, 766–766, 767–767 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086; js/net/lobby.js:1424–1452; js/net/lobby.js:1483–1500 | Source-shape guard; no branch execution. |
| modsFromProfile falls back to the factory setup when the declared parts exceed the budget | 773–785 | 780–780, 781–781, 782–782, 783–783 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086 | VM/fake-wire evidence; see harness limits. |
| a host relays only validated guest qualifying laps to the other guest | 814–834 | 821–821, 829–829, 830–831, 832–832 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| X on a sub-step while in a room stops the scanner as well as keeping the room | 836–849 | 840–840, 841–841, 844–844, 845–845, 846–846, 847–847 | js/net/lobby.js:2104–2210; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| INVITE ANOTHER stops a scanner left running from the previous sub-step | 851–859 | 854–854, 856–856, 857–857 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086; js/net/lobby.js:2104–2210; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| makeAnswer refuses a second run for the same invite and reports a thrown handshake | 866–895 | 877–877, 878–878, 880–880, 881–881, 891–891, 892–892, 893–893 | js/net/lobby.js:1509–1568 | VM/fake-wire evidence; see harness limits. |
| acceptAnswer refuses a re-entry inside the decode window and releases the guard after | 897–917 | 910–910, 912–912, 913–913, 915–915 | js/net/lobby.js:1574–1604 | VM/fake-wire evidence; see harness limits. |
| a pc that already took an offer is not answered again | 919–928 | 926–926 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| openRoom resets READY only for a FRESH room, not on every connection | 946–954 | 949–951, 952–953 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | Source-shape guard; no branch execution. |
| READY is host-relayed with from, and guests key _ready by from\|\|id | 956–965 | 959–960, 961–962, 963–964 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1424–1452 | Source-shape guard; no branch execution. |
| cancel and fresh open clear READY before the first replacement peer receives catch-up | 967–993 | 973–973, 974–974, 978–978, 983–983, 987–987, 988–988, 989–989, 990–990, 991–991 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:2032–2057; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| last guest leaving clears READY before the host invites a replacement directly | 995–1039 | 1015–1015, 1018–1018, 1026–1026, 1027–1027, 1030–1030, 1034–1034, 1035–1035, 1036–1036, 1037–1037 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| host catch-ups READY to a late joiner (same as HELLO catch-up) | 1041–1069 | 1050–1050, 1054–1054, 1057–1058, 1059–1060, 1064–1065, 1066–1067 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:540–764; js/net/lobby.js:1046–1086; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| the host publishes seed and round with its settings | 1079–1081 | 1080–1080 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1424–1452 | Source-shape guard; no branch execution. |
| a guest applies the host's seed and round, and keeps its own on a payload without them | 1083–1096 | 1088–1088, 1089–1089, 1090–1090, 1092–1092, 1093–1093, 1094–1094 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| an invalid seed or round rejects the whole payload, as every other field does | 1098–1109 | 1104–1104, 1105–1105, 1106–1106 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| a guest accepts STORM in settings and in a MIXED plan, and still rejects unknown weather | 1111–1123 | 1116–1116, 1118–1118, 1121–1121 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| the host publishes dirty air and AI pace with its settings | 1129–1131 | 1130–1130 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1424–1452 | Source-shape guard; no branch execution. |
| a guest applies dirty air and AI pace in memory, and rejects bad values | 1149–1165 | 1154–1154, 1155–1155, 1156–1156, 1157–1157, 1160–1160, 1162–1162, 1163–1163 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| leaving the room gives the guest back its own rules | 1167–1183 | 1174–1174, 1176–1176, 1177–1177, 1178–1178, 1179–1179, 1180–1180, 1181–1181, 1182–1182 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| the race end (a LOCAL NetPlay stop) restores the guest's rules, a mid-race drop does not | 1185–1189 | 1186–1186, 1187–1187, 1188–1188 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | Source-shape guard; no branch execution. |
| makeAnswer and acceptAnswer refuse a malformed code before they need a transport | 1197–1210 | 1203–1203, 1204–1204, 1206–1206, 1208–1208 | js/net/lobby.js:1509–1568; js/net/lobby.js:1574–1604 | VM/fake-wire evidence; see harness limits. |
| CLOSE from the waiting room clears the race-settings room flag | 1227–1239 | 1235–1235, 1236–1236, 1238–1238 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| the host leaving the ROOM says so, drops the room flag and shows the pick — not 'rivals are now AI' | 1241–1254 | 1247–1247, 1249–1249, 1250–1250, 1251–1251, 1252–1252 | js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| the host leaving the ROOM forgets every guest it relayed, not just the host | 1256–1271 | 1267–1267, 1269–1269 | js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| host leave during 3p friend quali forgets relayed rivals (QualiNet unlock) | 1273–1301 | 1286–1286, 1289–1289, 1292–1292, 1293–1293, 1295–1295, 1296–1296, 1297–1297, 1298–1299 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| mid-race one guest leaving of two keeps the other — occupancy is transports, not lobby sessions | 1303–1355 | 1328–1328, 1331–1331, 1335–1335, 1336–1336, 1340–1340, 1346–1346, 1348–1349, 1350–1350, 1351–1351, 1352–1353 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| a transport that never connected closes silently: the watcher's diagnosis is not overwritten | 1357–1369 | 1364–1364, 1367–1367 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| createInvite throwing becomes a typed result, not an unhandled rejection | 1371–1382 | 1378–1378, 1379–1379, 1380–1380 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| join()'s late prompt does not wipe an error said during its ICE wait | 1384–1410 | 1394–1394, 1395–1395, 1397–1397, 1398–1398, 1406–1406, 1407–1407 | js/net/lobby.js:1483–1500 | VM/fake-wire evidence; see harness limits. |
| a connection shows its verification code, and only the HOST can remove that guest | 1417–1454 | 1440–1440, 1443–1443, 1444–1444, 1446–1446, 1447–1447, 1448–1448, 1449–1449, 1451–1451, 1452–1452 | js/net/lobby.js:1247–1270; js/net/lobby.js:520–538; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| a guest the host evicts sees a dedicated message, not 'host left' | 1456–1487 | 1478–1478, 1483–1483, 1484–1484, 1485–1485 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086; js/net/lobby.js:1247–1270; js/net/lobby.js:520–538; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| host remove: evicting the last guest keeps the host in the waiting room | 1489–1499 | 1492–1492, 1494–1494, 1495–1495, 1496–1496, 1497–1497 | js/net/lobby.js:1247–1270; js/net/lobby.js:520–538; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| a guest cannot remove anybody, and a transport with no pc shows no code | 1501–1507 | 1504–1504, 1505–1505 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| HOST A RACE (link) closes a room code left open by a code join | 1509–1520 | 1515–1515, 1517–1517, 1518–1518, 1519–1519 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086; js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495; js/net/lobby.js:2219–2242; js/net/lobby.js:345–349; js/net/lobby.js:1424–1452; js/net/lobby.js:1483–1500; js/net/lobby.js:2032–2057 | Source-shape guard; no branch execution. |
| private room entry accepts a full shared token and public entry still asks for six characters | 1522–1535 | 1529–1529, 1530–1530, 1531–1531, 1532–1532 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| a joiner whose ICE fails while a guest is in the room reopens the SAME code | 1580–1597 | 1589–1589, 1592–1592, 1593–1593, 1594–1594, 1595–1595 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| a failed joiner with NOBODY in the room does not reopen it later | 1599–1611 | 1604–1604, 1608–1608, 1609–1609 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| the last guest leaving the ROOM seals the reopened code and restores every route | 1613–1638 | 1622–1622, 1623–1623, 1624–1624, 1625–1625, 1627–1627, 1628–1628, 1629–1629, 1630–1630, 1631–1631, 1632–1632, 1633–1633, 1634–1634, 1636–1636 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| INVITE ANOTHER stops the reopened code room, and CLOSE brings the same code back (#2197) | 1640–1660 | 1650–1650, 1651–1651, 1652–1652, 1655–1655, 1656–1656, 1658–1658 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495 | VM/fake-wire evidence; see harness limits. |
| a room code that expires with nobody in it is taken down, with host copy (#2200) | 1662–1676 | 1667–1667, 1668–1668, 1670–1670, 1671–1671, 1672–1672, 1673–1673, 1674–1674 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| the only guest leaving while INVITE ANOTHER's scanner runs stops the camera (#2200) | 1678–1695 | 1687–1687, 1689–1689, 1690–1690, 1692–1692, 1693–1693 | js/net/lobby.js:2104–2210; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| codeJoin and phone-pad acceptInvite do not pass gatherTimeoutMs: 2500 | 1701–1708 | 1702–1702, 1703–1704, 1706–1707 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | Source-shape guard; no branch execution. |
| once guest connected, status never regresses and no expiry error | 1715–1778 | 1731–1731, 1737–1738, 1743–1743, 1745–1746, 1747–1747, 1770–1770, 1771–1771, 1772–1774 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495 | VM/fake-wire evidence; see harness limits. |
| host onFail during a half-built join closes that peer PC and clears pending | 1784–1853 | 1823–1823, 1824–1824, 1825–1825, 1827–1827, 1828–1828, 1829–1829, 1838–1838, 1839–1839, 1840–1840, 1841–1841, 1844–1844, 1845–1845, 1846–1846, 1847–1847, 1848–1848, 1849–1849 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495; js/net/lobby.js:1424–1452; js/net/lobby.js:1483–1500 | VM/fake-wire evidence; see harness limits. |
| room-code expiry while watching keeps expiry copy, not TURN; pure ICE still uses failureMsg | 1859–1925 | 1880–1880, 1897–1897, 1898–1898, 1899–1900, 1905–1905, 1906–1906, 1911–1912, 1913–1915, 1919–1920, 1921–1921 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495; js/net/lobby.js:384–415 | VM/fake-wire evidence; see harness limits. |
| host onFail expiry with watcher armed and empty room uses INVITE ANOTHER copy | 1927–1974 | 1959–1959, 1962–1962, 1967–1968, 1969–1970 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| a startRace that resolves false closes the room instead of starting NetPlay over the menu | 1999–2014 | 2009–2009, 2011–2011, 2012–2012 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| a canceled startRace still closes the room (the branch the false case shares) | 2016–2028 | 2025–2025, 2026–2026 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| the host rewinds its sim stream before the race builds, as the guest's applySettings does | 2030–2049 | 2047–2047 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| a retry after a failed connect starts from empty invite, QR and answer widgets (bug-hunt H6) | 2063–2101 | 2072–2072, 2073–2073, 2076–2076, 2077–2077, 2078–2078, 2083–2083, 2084–2084, 2085–2085, 2086–2086, 2087–2087, 2088–2088, 2089–2089, 2090–2090, 2096–2096, 2098–2098, 2099–2099 | js/net/lobby.js:207–318; js/net/lobby.js:540–764; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| HOST A RACE shows the hosting step at once, not after the ICE wait (bug-hunt H6) | 2103–2113 | 2109–2109, 2111–2111 | js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| an empty CONNECT tap during invite preparation does not cancel the host's invite (bug-hunt H5) | 2115–2130 | 2124–2124, 2127–2127, 2128–2128 | js/net/lobby.js:1424–1452; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| a stale success race build cannot consume or close a replacement room | 2156–2182 | 2165–2165, 2166–2166, 2169–2169, 2176–2176, 2177–2177, 2178–2178, 2179–2179, 2180–2180 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| a stale false race build cannot consume or close a replacement room | 2156–2182 | 2165–2165, 2166–2166, 2169–2169, 2176–2176, 2177–2177, 2178–2178, 2179–2179, 2180–2180 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| a stale canceled race build cannot consume or close a replacement room | 2156–2182 | 2165–2165, 2166–2166, 2169–2169, 2176–2176, 2177–2177, 2178–2178, 2179–2179, 2180–2180 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| a stale rejection race build cannot consume or close a replacement room | 2156–2182 | 2165–2165, 2166–2166, 2169–2169, 2176–2176, 2177–2177, 2178–2178, 2179–2179, 2180–2180 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| a peer leaving during the same race build still releases the empty room and qualifying gate | 2185–2199 | 2189–2189, 2195–2195, 2196–2196, 2197–2197 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| a start that throws after the quali sheet cancels and quits instead of failing silently (bug-hunt H30) | 2201–2213 | 2207–2207, 2209–2209, 2210–2210, 2211–2211 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| a start that throws with the lobby on screen keeps the room and its message (bug-hunt H30) | 2215–2228 | 2222–2222, 2224–2224, 2225–2225, 2226–2226 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| the screen wake lock survives the lobby closing for friend quali and drops when the race starts (bug-hunt H30) | 2230–2247 | 2240–2240, 2241–2241, 2245–2245 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412; js/net/lobby.js:1977–1998; js/net/lobby.js:1999–2005 | VM/fake-wire evidence; see harness limits. |
| a guest's BACK from the quali sheet tells the host | 2249–2256 | 2253–2253, 2254–2254 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| a guest that backed out of quali joins the race when the host sends qgo (additive; old clients ignore it) | 2258–2276 | 2266–2266, 2270–2270, 2271–2271, 2274–2274 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| a failed quali prepare (sheet never opens) cancels the lobby so persistOrder is not gated for the page session | 2278–2285 | 2282–2282, 2283–2283 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| a quali sheet that did open keeps the room armed | 2287–2294 | 2291–2291, 2292–2292 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412; js/net/lobby.js:2032–2057 | VM/fake-wire evidence; see harness limits. |
| codeHost does not set #vs-code-value or enable COPY until invite.ok and the first publish | 2332–2360 | 2340–2340, 2341–2341, 2342–2342, 2343–2343, 2348–2348, 2349–2349, 2350–2350, 2354–2354, 2355–2355, 2356–2356, 2357–2357, 2358–2358 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495 | VM/fake-wire evidence; see harness limits. |
| codeHost never reveals a dead code when invite or publish fails | 2362–2377 | 2365–2365, 2366–2366, 2367–2367, 2372–2372, 2373–2373, 2374–2374, 2375–2375 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495 | VM/fake-wire evidence; see harness limits. |
| failed guest start restores rules and releases session/pump: false | 2381–2399 | 2390–2390, 2391–2391, 2392–2392, 2395–2395, 2396–2396, 2397–2397 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| failed guest start restores rules and releases session/pump: {"kind":"canceled"} | 2381–2399 | 2390–2390, 2391–2391, 2392–2392, 2395–2395, 2396–2396, 2397–2397 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412 | VM/fake-wire evidence; see harness limits. |
| guest readiness follows effective settings revision and identical replay preserves consent | 2402–2420 | 2408–2408, 2410–2410, 2412–2412, 2415–2415, 2418–2418 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| host settings edits invalidate every ready acknowledgment and stale READY cannot unlock START | 2422–2438 | 2430–2430, 2432–2432, 2434–2434, 2436–2436 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| rejected settings block GO until valid settings are accepted and explicitly readied | 2440–2455 | 2446–2446, 2446–2446, 2447–2447, 2449–2449, 2451–2451, 2453–2453 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| guest roster bursts settle to each peer's latest HELLO and READY without another event | 2457–2473 | 2466–2466, 2468–2468, 2469–2469, 2471–2471 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:540–764; js/net/lobby.js:1046–1086 | VM/fake-wire evidence; see harness limits. |
| LEFT and cancel discard queued roster state | 2475–2483 | 2481–2481 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086; js/net/lobby.js:2090–2102 | VM/fake-wire evidence; see harness limits. |
| delayed first full SETTINGS cannot inherit pre-snapshot READY | 2486–2506 | 2491–2491, 2492–2492, 2493–2493, 2495–2495, 2498–2498, 2498–2498, 2500–2500, 2502–2502, 2504–2504 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| revisionless initial settings keep legacy optional defaults but require an initial READY | 2508–2520 | 2515–2515, 2515–2515, 2516–2516, 2518–2518 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980 | VM/fake-wire evidence; see harness limits. |
| revisionless READY after a host edit explains the required client update | 2522–2533 | 2527–2527, 2530–2530, 2531–2531 | js/net/lobby.js:910–957; js/net/lobby.js:830–878; js/net/lobby.js:972–980; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| guest coalescing retains the last valid profile when the final HELLO is invalid | 2535–2549 | 2546–2546, 2547–2547 | js/net/lobby.js:540–764; js/net/lobby.js:1046–1086 | VM/fake-wire evidence; see harness limits. |
| an expired room after a failed connect is taken down with host copy, not read as watched | 2554–2567 | 2557–2557, 2562–2562, 2563–2563, 2564–2564, 2565–2565 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |
| removing one of two code-room guests rotates the room code (the removed player cannot walk back in) | 2569–2584 | 2579–2579, 2582–2582 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495; js/net/lobby.js:1247–1270; js/net/lobby.js:520–538 | VM/fake-wire evidence; see harness limits. |
| removing the last guest of a LINK room mints no room code | 2597–2609 | 2600–2600, 2606–2606, 2607–2607 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495; js/net/lobby.js:1247–1270; js/net/lobby.js:520–538; js/net/lobby.js:2219–2242; js/net/lobby.js:345–349 | VM/fake-wire evidence; see harness limits. |
| removing the last guest of a CODE room rotates it, and its expiry reads in host copy | 2611–2622 | 2619–2619, 2620–2620 | js/net/lobby.js:1664–1868; js/net/lobby.js:1871–1941; js/net/lobby.js:417–495; js/net/lobby.js:1247–1270; js/net/lobby.js:520–538; js/net/lobby.js:1424–1452 | VM/fake-wire evidence; see harness limits. |

Shared fixture/precondition assertion spans: 657–657, 810–810, 1564–1564, 1568–1568, 1569–1569, 1571–1571, 1575–1575, 1988–1988, 2147–2147, 2151–2151, 2590–2590, 2594–2594.

### tests/unit/net-nostr-sockets.test.mjs

| Case / meaning | Case range | Assertion spans | Production targets | Evidence limit |
|---|---|---|---|---|
| the REQ carries no `since`: a fast device clock must not filter the host's offer | 77–91 | 81–81, 85–85, 86–86, 87–87, 89–89 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | VM/fake-wire evidence; see harness limits. |
| a socket the browser dropped is reopened, and once at return to the foreground | 93–123 | 104–104, 108–108, 109–109, 111–111, 113–113, 116–116, 118–118, 119–119, 122–122 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | VM/fake-wire evidence; see harness limits. |
| after stop() a closing socket is not reopened | 125–135 | 134–134 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | VM/fake-wire evidence; see harness limits. |
| JOIN_TIMEOUT_MS is the ~8–15 s lobby join target, not a two-minute hang | 137–141 | 139–139, 140–140 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | VM/fake-wire evidence; see harness limits. |
| HOST_TIMEOUT_MS is ~120 s so a typed room code still works (#1061 guest stay short) | 143–149 | 145–145, 146–146, 147–148 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | VM/fake-wire evidence; see harness limits. |
| Nostr expired copy is actionable (no false 'couple of minutes' claim) | 151–157 | 153–153, 154–154, 155–155, 156–156 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | Source-shape guard; no branch execution. |
| host expiry uses HOST_TIMEOUT_MS; guest keeps JOIN_TIMEOUT_MS (source) | 159–164 | 161–161, 162–162, 163–163 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | Source-shape guard; no branch execution. |
| host room survives past JOIN_TIMEOUT; guest still expires around it (acceptance) | 166–201 | 185–185, 188–188, 193–193, 194–194, 198–198, 199–199 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | VM/fake-wire evidence; see harness limits. |
| a guest that finds the offer late is not expired while it builds the answer (bug-hunt 8.3) | 203–230 | 209–209, 225–225, 226–226, 227–227 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | VM/fake-wire evidence; see harness limits. |
| a replayed old offer is ignored; a fresh offer is still answered (created_at floor) | 232–271 | 247–247, 257–257, 258–258, 267–267, 268–268 | js/net/nostr.js:225–524; js/net/rendezvous.js:270–279 | VM/fake-wire evidence; see harness limits. |

Shared fixture/precondition assertion spans: 65–65.

### tests/unit/net-qr.test.mjs

| Case / meaning | Case range | Assertion spans | Production targets | Evidence limit |
|---|---|---|---|---|
| a short string survives an independent decoder | 57–59 | 58–58 | js/net/qr.js:284–308; js/net/qr.js | Perfect raster + independent decoder; no camera. |
| a REAL invite link round-trips — the whole reason this exists | 61–73 | 68–68, 72–72 | js/net/qr.js:284–308; js/net/qr.js | Perfect raster + independent decoder; no camera. |
| every byte value survives, not just printable ASCII | 75–80 | 79–79 | js/net/qr.js:284–308; js/net/qr.js | Perfect raster + independent decoder; no camera. |
| it steps up versions as the payload grows, and each one still decodes | 82–90 | 86–86, 87–87 | js/net/qr.js:284–308; js/net/qr.js | Perfect raster + independent decoder; no camera. |
| a payload that will not fit returns null rather than a wrong picture | 92–97 | 95–95, 96–96 | js/net/qr.js:284–308; js/net/qr.js | Perfect raster + independent decoder; no camera. |
| the empty string encodes rather than throwing | 99–101 | 100–100 | js/net/qr.js:284–308; js/net/qr.js | Perfect raster + independent decoder; no camera. |
| the quiet zone is required, and its absence is what breaks scanners | 103–115 | 113–114 | js/net/scan.js:68–222; js/net/scan.js:18–28 | VM/fake-wire evidence; see harness limits. |
| NetScan uses BarcodeDetector when the platform reads qr_code, and stops the camera on a hit | 151–165 | 157–157, 158–158, 160–160, 161–161, 162–162, 163–163 | js/net/scan.js:68–222; js/net/scan.js:18–28 | VM/fake-wire evidence; see harness limits. |
| a BarcodeDetector result landing after stop() delivers nothing | 167–182 | 173–173, 175–175, 179–179, 180–180 | js/net/scan.js:68–222; js/net/scan.js:18–28 | VM/fake-wire evidence; see harness limits. |
| without qr_code support (or without BarcodeDetector) NetScan falls back to jsQR | 184–200 | 188–188, 191–191, 192–192, 194–194, 196–196, 198–198 | js/net/scan.js:68–222; js/net/scan.js:18–28 | VM/fake-wire evidence; see harness limits. |
| a restarted QR scanner keeps its in-flight guard after an old resolve | 204–247 | 227–227, 231–231, 232–232, 233–233, 234–234, 239–239, 240–240, 243–243, 244–244, 245–245 | js/net/scan.js:68–222; js/net/scan.js:18–28 | VM/fake-wire evidence; see harness limits. |
| a restarted QR scanner keeps its in-flight guard after an old reject | 204–247 | 227–227, 231–231, 232–232, 233–233, 234–234, 239–239, 240–240, 243–243, 244–244, 245–245 | js/net/scan.js:68–222; js/net/scan.js:18–28 | VM/fake-wire evidence; see harness limits. |

Shared fixture/precondition assertion spans: 50–50, 53–53.

### tests/unit/net-rendezvous.test.mjs

| Case / meaning | Case range | Assertion spans | Production targets | Evidence limit |
|---|---|---|---|---|
| a successful response arriving after cancellation never publishes a payload | 43–61 | 57–57, 58–58, 59–59 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:423–444; js/net/rendezvous.js:50–61 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| codes avoid the characters people mishear | 122–134 | 127–127, 131–131, 132–132 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:50–61 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| codes are drawn without modulo bias | 136–153 | 151–151, 152–152 | js/net/rendezvous.js:85–97 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| codes are not sequential or repeated | 155–160 | 159–159 | js/net/rendezvous.js:85–97 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| typing is forgiving about case and spacing, strict about the rest | 162–171 | 164–164, 165–165, 168–168, 169–169, 170–170 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:102–105; js/net/rendezvous.js | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| the two halves meet at the same code | 177–194 | 181–181, 183–183, 184–184, 185–185, 187–187, 188–188, 190–190, 192–192 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:338–348 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| an encrypted offer retry changes ciphertext but keeps ownership | 196–208 | 200–200, 202–202, 204–204, 205–205, 206–206 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:338–348 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| a plaintext (or v1) mailbox record from the relay is refused, never used as an SDP | 210–224 | 219–219, 220–220, 222–222 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:338–348 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| the private-relay backend still trades both ways | 226–249 | 237–237, 238–238, 240–240, 245–245, 246–247 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:338–348; js/net/rendezvous.js:395–416 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| a replier waits first, then posts what it produced | 251–268 | 263–263, 264–264, 265–265, 266–266 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:338–348; js/net/rendezvous.js:395–416 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| a reply that fails reports it rather than posting nothing | 270–282 | 279–279, 280–280 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:395–416 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| waitFor resolves as soon as the other side posts | 284–295 | 292–292, 293–293 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:423–444 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| waitFor stops when it is cancelled, and does not resolve later | 297–310 | 307–307, 308–308 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:423–444 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| an empty code reports nobody there, not an error | 312–320 | 316–316, 317–317, 318–318 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:338–348 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| a second host on a live code is refused rather than stealing the guest | 322–333 | 328–328, 329–329, 331–331 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:338–348 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| a dead relay is reported, never thrown | 335–345 | 341–341, 342–342, 343–343 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:338–348 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| a captive portal answering 200 with HTML is 'relay', not 'offline' | 347–367 | 359–359, 360–360, 361–361, 362–362 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:338–348; js/net/rendezvous.js:50–61 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| an unreachable relay is reported, never thrown | 369–375 | 373–373, 374–374 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:338–348 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| room codes are available with nothing configured at all | 377–387 | 382–382, 383–383, 385–385 | js/net/rendezvous.js:50–61 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| the payload round-trips under the room code | 393–399 | 397–397, 398–398 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:270–279; js/net/rendezvous.js:281–293 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| a wrong code cannot read the payload | 401–414 | 409–409, 413–413 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:270–279; js/net/rendezvous.js:281–293 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| two seals of the same text differ | 416–423 | 422–422 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:270–279 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| the envelope is bound to its slot: an offer cannot be replayed as an answer | 425–440 | 431–431, 432–432, 433–433, 436–436, 437–437, 439–439 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:270–279; js/net/rendezvous.js:281–293 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| the private-relay envelope is v2 only — plaintext from the Worker is refused | 442–456 | 449–449, 450–450, 451–451, 452–452, 453–453, 454–454, 455–455 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:296–298; js/net/rendezvous.js:303–307 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| repeated seals and opens of one code run PBKDF2 exactly once | 459–484 | 476–476, 477–477, 478–478, 480–480 | js/net/rendezvous.js:270–279; js/net/rendezvous.js:281–293 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| waitFor() rides out a transient 429 instead of aborting the wait | 486–495 | 490–490, 492–492, 493–493 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:423–444 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| waitFor() still gives up on a relay that is refusing every poll | 497–505 | 502–502, 503–503 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:423–444 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| the Nostr topic costs a PBKDF2 per guessed code, and the verification code is the MITM check | 508–566 | 519–519, 520–520, 521–521, 527–527, 536–537, 538–538, 551–551, 560–560, 561–561, 562–562, 563–563, 564–564, 565–565 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:216–222; js/net/rendezvous.js:248–260 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| verifyFor reads both fingerprints off a connected peer connection and never rejects | 568–580 | 575–575, 576–576, 577–577, 578–578, 579–579 | js/net/rendezvous.js:248–260; js/net/rendezvous.js:263–268 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| private room traffic never reveals the high-entropy token or a usable encryption key | 583–609 | 587–587, 588–588, 589–589, 590–590, 591–591, 593–593, 594–594, 601–601, 604–604, 605–605, 606–606, 607–607 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js; js/net/rendezvous.js:338–348; js/net/rendezvous.js:296–298; js/net/rendezvous.js:303–307; js/net/rendezvous.js:50–61 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| private tokens fail closed without cryptographic randomness | 611–615 | 614–614 | js/net/rendezvous.js:85–97 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| an old Worker requires an upgrade, never a six-character or plaintext downgrade | 617–632 | 626–626, 627–627, 629–629, 630–630 | js/net/rendezvous.js:85–97; js/net/rendezvous.js; js/net/rendezvous.js:50–61 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| QR relay configuration is validated and scoped to the controller document | 635–653 | 638–638, 639–639, 640–640, 643–643, 644–644, 646–646, 647–647, 648–648, 649–649, 651–651 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:66–72; js/net/rendezvous.js:50–61 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| persistent relay configuration uses the same secure URL policy | 655–667 | 658–658, 661–661, 662–662, 664–664, 665–665 | js/net/rendezvous.js:50–61 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| POLL_TIMEOUT_MS is the ~8–15 s lobby join target, not a two-minute hang | 670–673 | 671–671, 672–672 |  | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| waitFor expired copy is actionable (no false 'couple of minutes' claim) | 675–700 | 690–690, 691–691, 692–692, 693–693, 694–694, 695–695 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:423–444 | Local HTTP/crypto or isolated API fixture; no deployed relay. |
| a private-relay HOST keeps polling past the guest's 12 s; guests keep 12 s (bug-hunt 8.4) | 702–728 | 703–703, 704–705, 714–714, 722–722, 723–723 | js/net/rendezvous.js:85–97; js/net/rendezvous.js:395–416; js/net/rendezvous.js:423–444 | Local HTTP/crypto or isolated API fixture; no deployed relay. |

Shared fixture/precondition assertion spans: none.

### tests/unit/net-roster.test.mjs

| Case / meaning | Case range | Assertion spans | Production targets | Evidence limit |
|---|---|---|---|---|
| host: a guest's session closing broadcasts LEFT for that wire id to the others | 104–124 | 109–109, 111–111, 113–113, 117–117, 118–118, 119–119, 120–120, 122–122, 123–123 | js/net/netplay.js:613–862; js/net/netplay.js:886–1028; js/net/netplay.js:1183–1218; js/net/netplay.js:864–884 | VM/fake-wire evidence; see harness limits. |
| guest: LEFT from the host hands the named rival to the HOST's AI (posed from the wire) | 130–145 | 135–135, 140–140, 141–141, 142–142, 143–143, 144–144 | js/net/netplay.js:613–862; js/net/netplay.js:886–1028; js/net/netplay.js:1183–1218; js/net/netplay.js:864–884 | VM/fake-wire evidence; see harness limits. |
| guest without AI replication: LEFT from the host hands the named rival back to local AI | 147–165 | 152–152, 154–154, 160–160, 161–161, 162–162, 163–163, 164–164 | js/net/netplay.js:613–862; js/net/netplay.js:886–1028; js/net/netplay.js:1183–1218; js/net/netplay.js:864–884 | VM/fake-wire evidence; see harness limits. |
| host: a guest's LEFT is ignored — only the host speaks for the roster | 167–176 | 175–175 | js/net/netplay.js:613–862; js/net/netplay.js:886–1028; js/net/netplay.js:1183–1218; js/net/netplay.js:864–884 | VM/fake-wire evidence; see harness limits. |
| a local stop() says BYE before closing the sessions | 178–191 | 184–184, 185–185, 190–190 | js/net/netplay.js:613–862; js/net/netplay.js:886–1028; js/net/netplay.js:1183–1218; js/net/netplay.js:864–884 | VM/fake-wire evidence; see harness limits. |
| a repeated start cannot abandon the active race's owned session | 193–210 | 197–197, 202–202, 203–203, 204–204, 205–205, 206–206, 208–208, 209–209 | js/net/netplay.js:613–862; js/net/netplay.js:886–1028; js/net/netplay.js:1183–1218; js/net/netplay.js:864–884 | VM/fake-wire evidence; see harness limits. |
| host: the owner's LAP `fin` becomes the rival's finishT, sender-bound | 213–240 | 224–224, 225–225, 231–231, 232–232, 235–235, 236–236, 239–239 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| guest: the host's LAP `fin` lands on the host's car, found by code | 242–252 | 250–250, 251–251 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| a remote is never marked finished from an EXTRAPOLATED lap wrap | 254–278 | 264–264, 265–265, 270–270, 271–271, 276–276, 277–277 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: an ARMED that lands after the moment was named is answered with START | 281–305 | 287–287, 290–290, 292–292, 293–293, 295–295, 296–296, 297–297, 304–304 | js/net/netplay.js:613–862; js/net/netplay.js:1114–1118; js/net/netplay.js:1120–1139; js/net/netplay.js:1226–1412 | VM/fake-wire evidence; see harness limits. |
| guest: ARMED is re-sent until a START lands, and never again once the countdown consumed it | 308–338 | 318–318, 320–320, 323–323, 326–326, 329–329, 330–330, 334–334, 336–336 | js/net/netplay.js:613–862; js/net/netplay.js:1114–1118; js/net/netplay.js:1120–1139; js/net/netplay.js:1226–1412 | VM/fake-wire evidence; see harness limits. |
| predict() and the tick's _n fields are clamped through the same helper as the pose | 344–377 | 349–349, 358–358, 359–359, 360–360, 360–360, 360–360, 361–361, 362–362, 362–362, 363–363, 364–364, 367–367, 368–368, 369–369, 372–372, 373–373, 374–374, 375–375 | js/net/netplay.js:613–862; js/net/netplay.js:62–82; js/net/netplay.js:1226–1412 | VM/fake-wire evidence; see harness limits. |
| host: a guest's wire lap cannot jump to the chequered flag | 404–412 | 408–408, 409–409, 411–411 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: toggling s across the line without driving the lap earns nothing | 414–421 | 417–417, 419–419, 420–420 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: laps faster than the wire's speed ceiling allows are refused | 423–434 | 426–426, 429–429, 430–430, 433–433 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: a lap actually driven still counts, through to the finish | 436–448 | 441–441, 444–444, 446–446, 447–447 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: an early extrapolated crossing, a short real packet, then the real crossing still counts | 453–466 | 456–456, 460–460, 462–462, 465–465 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: a LAP `fin` far from this race clock is refused | 468–477 | 472–472, 473–473, 475–475, 476–476 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: a guest's short-distance fin cannot raise or relay the chequered flag | 479–498 | 483–483, 484–484, 488–488, 489–489, 490–490, 493–493, 496–496 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: a lapped fin preceding the winner's interpolated pose waits, then relays | 500–515 | 505–505, 506–506, 509–509, 510–510, 512–512, 513–513 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: lap times outside what can be driven never reach the car | 517–528 | 522–522, 523–523, 526–526, 527–527 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: a guest's LAP is relayed to every OTHER guest, named by its seat | 531–560 | 536–536, 539–539, 540–540, 542–542, 543–543, 544–544, 545–545, 546–546, 549–549, 550–550, 553–554, 556–556, 558–558 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| host: a finishing LAP relays the owner's lap so guest B does not finish early | 562–585 | 567–567, 568–568, 570–570, 571–571, 572–572, 576–577, 581–581, 582–582, 583–583 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |
| retireCar clears the car's skid intensity so a parked car does not screech | 589–600 | 597–597, 598–598, 599–599 | js/game.js:6570–6605 retireCar | VM/fake-wire evidence; see harness limits. |
| host remove: each guest row exposes a host-only remove control | 605–609 | 606–606, 607–607, 608–608 | js/net/lobby.js:1218–1233; js/net/lobby.js:1247–1270 | Source-shape guard; no branch execution. |
| host remove: evict stays in the room, broadcasts lobby LEFT, and rotates the code | 611–621 | 612–612, 613–613, 614–614, 615–615, 616–616, 617–617, 618–618, 619–619, 620–620 | js/net/lobby.js:1218–1233; js/net/lobby.js:1247–1270 | Source-shape guard; no branch execution. |
| a receiver with frozen physics validates and stamps the guest finish against the live shared clock | 624–647 | 640–640, 641–641, 642–642, 644–644 | js/net/netplay.js:613–862; js/net/netplay.js:486–556; js/net/netplay.js:98–115 | VM/fake-wire evidence; see harness limits. |

Shared fixture/precondition assertion spans: 389–389.

### tests/unit/net-sdp.test.mjs

| Case / meaning | Case range | Assertion spans | Production targets | Evidence limit |
|---|---|---|---|---|
| NetBytes round-trips base64, base64url, hex and ascii | 27–42 | 30–30, 32–32, 33–33, 34–34, 35–35, 36–36, 37–37, 38–38, 39–39, 40–40, 41–41 | js/net/bytes.js:1–58 | Embedded SDP/byte fixture; no RTC connection. |
| the five facts survive a real gathered offer | 71–80 | 73–73, 74–74, 75–75, 76–77, 78–78, 79–79 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| every line is CRLF-terminated, including the last | 82–90 | 87–87, 88–88, 89–89 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| the rebuild keeps the lines a data channel cannot connect without | 92–99 | 98–98 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| it is dramatically smaller than the text it replaces | 101–108 | 105–105, 107–107 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| pack() allocates exactly the bytes it writes — no stray trailing 0x00 | 110–124 | 120–121, 123–123 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| a server-reflexive IPv4 candidate round-trips with its port | 126–136 | 132–132, 135–135 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| an IPv6 host candidate round-trips, including :: compression | 138–144 | 143–143 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| NAT64 / embedded-IPv4 v6 candidates keep the full address, not a truncated hextet | 146–162 | 153–154, 155–155, 161–161 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| dirty hextets and trailing-empty IPv4 octets are refused, never rewritten | 164–176 | 170–170, 175–175 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| TCP and non-data components are dropped, not mangled | 178–189 | 186–186, 187–187, 188–188 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| an answer keeps its setup role, which is what makes it an answer | 191–194 | 193–193 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| anything not fully understood packs to null rather than partially | 196–205 | 199–199, 200–200, 201–201, 202–202, 204–204 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| a truncated struct unpacks to null rather than a plausible offer | 207–212 | 209–209, 210–210, 211–211 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| the relay candidate survives the budget, because it arrives last | 214–261 | 247–247, 250–250, 252–252, 254–256, 257–257, 258–260 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| an IPv6 relay candidate round-trips — it is the whole relay leg on a v6-only path | 263–269 | 268–268 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| an IPv4-mapped IPv6 address is packed as the IPv4 candidate it is | 271–278 | 277–277 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |
| identity() reads the same ufrag + fingerprint off the verbatim and the rebuilt SDP | 284–295 | 287–287, 288–288, 289–289, 290–290, 293–293, 294–294 | js/net/sdp.js:333–337; js/net/sdp.js:327–332 | Embedded SDP/byte fixture; no RTC connection. |
| link-local IPv6, loopback and non-numeric ports are not packed | 299–318 | 312–312, 313–313, 314–314, 315–315, 317–317 | js/net/sdp.js:146–219; js/net/sdp.js:234–283; js/net/sdp.js:91–125 | Embedded SDP/byte fixture; no RTC connection. |

Shared fixture/precondition assertion spans: none.

### tests/unit/net-seed-sync-vm.test.mjs

| Case / meaning | Case range | Assertion spans | Production targets | Evidence limit |
|---|---|---|---|---|
| a host that has raced before builds the guest's field once both rewind to the host's seed | 87–109 | 96–96, 99–99, 101–101, 106–106, 107–107 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412; tools/lib/game-vm.cjs (real game harness) | VM/fake-wire evidence; see harness limits. |
| without the host rewind the second race diverges (the premise of the fix) | 111–122 | 120–120 | js/net/lobby.js:1303–1334; js/net/lobby.js:1341–1412; tools/lib/game-vm.cjs (real game harness) | VM/fake-wire evidence; see harness limits. |

Shared fixture/precondition assertion spans: 80–80.

Expanded case count: 223. Production dependency fingerprints (including supporting codecs; these are dependency inventory, not claims of full-file reading):

| Production source | SHA-256 |
|---|---|
| js/net/lobby.js | `91ef67f43cc1b03488a2a3dff6f83ada24c459fd2638cf51ccbb026ca496d110` |
| js/net/lobby-settings.js | `32ec2ddb3268a17b3d2ed6aed0177344fa5cc8d997db1b7dccdd7d82d25e48f9` |
| js/net/lobby-roster.js | `a60fb05e2d2c7d8bdf938b7cd4072d629c969a7ba01300b516bc75b64f944cda` |
| js/net/lobby-codes.js | `22acb631ec421aac5e46541e131fa9d287204aa0a28549401aa596d047b0cf63` |
| js/net/netplay.js | `49332e13214c1e5e9eb7c186af0591ef8b1054e33d5fc5df1a80abc957b9566c` |
| js/net/snapshot.js | `23659eed7cbe28b23d7a8363576db9e39c774e13af4e4b7b517b70e5ddb66298` |
| js/net/session.js | `7d016f38240c2360241162100995480a5c6635d67a6f876c54274c5b16456b01` |
| js/net/rendezvous.js | `928f275c5b914e1f9414c270a5a9f505f78decc0be369505239741d59c9fe087` |
| js/net/nostr.js | `1ed832e0b025ba2e040a04e07d995720a60d36d1421df2cea7492921fbb90749` |
| js/net/qr.js | `ae24090cc94a81386da17c90fed7cc8f8ef2a68cb6551ee327535808dbdb5108` |
| js/net/scan.js | `b7439a2cfe52e5bde0acdfb84cc5987dc4766a3f96f7fb34aad04c998dc438d3` |
| js/net/sdp.js | `399ad9a1ac8630650e3c41cc077a601eaf71fb5f010175caffc30002018827c4` |
| js/net/bytes.js | `bcbd948cab766323fb0277c834e0e942a10120eb6118c7870d808a844d4f13fc` |
| js/game.js | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| tools/lib/game-vm.cjs | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| tests/helpers/seed-log.mjs | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| tests/helpers/seed-clipboard.mjs | `e4f18d266dc740416dc84129c6e512cd6941572df3f4c27fd9611ea926050897` |
| tests/helpers/abs-src.mjs | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
| tests/helpers/game-source.mjs | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
