# Unit batch 32 — complete semantic map

Read-only mapping at `8a222466bc83de7cdbe6a42989f19f7824ce4c06`. Seven files, 2,721 lines. All test files were returned individually in contiguous ≤80-line chunks, each <10,000 characters, with untruncated individual results. No tests or browser runs; this report describes assertions, not passing results.

LSP evidence: local `tools/mcp/lsp-mcp.sh outline` resolved NetPlay, NetLobby and QualiNet; `def NetPlay.create --body --max-lines=70` resolved js/net/netplay.js:302 and export :1480; `def GameHud.create` resolved js/ui/hud.js:47 and export :2535. The checker cannot see dynamic `TrackScenery.mugello`; scenery text/source inspection is the fallback, not a claimed LSP definition. Production ranges below identify inspected implementation ownership; ancillary dependencies are not independently verified by these cases.

## Fixture and interpretation limits

- Move fixtures deliberately invent the zzfix namespace. They are descriptive scratch paths, not repository citations. Git/genShell paths are disabled except live MOVED validation; generated shell and real git mv are not covered.
- Mugello uses real track-build-vm geometry capture and a locally reproduced orbit formula. AABBs/centres and repeated sample counts establish clearance and cues, not pixel appearance or unique tree counts.
- needs-sync uses injected APIs plus temporary actual Git repositories with deploy aliases and fixture identity; no network CI/fetch is proven.
- Authority suite evaluates real net modules with seedLogGlobal and stub G/cars. fakeSession directly delivers events, synchronous close callbacks expose teardown reentry. stateSession uses real snapshot codec; poseG uses straight-track sample/world stubs. Lobby cases load real transport/session/handshake/codes/roster/settings over loopback, but null DOM, synthetic teams/tracks, disabled ICE prefetch and finite settle delays exclude browser/WebRTC/backend/visual proof.
- Quali gates use fake clock/timer/button surfaces. Extracted game-source functions/clock and source regex guards prove only that selected body/shape; full game integration is limited to game-vm PitLane and audio cases. Audio uses fake-audio-vm, not physical output. HUD uses mini-dom/minimap context stubs, not layout.

## Cases

Each row gives literal case name, inclusive declaration/body range, assertion spans (including harness preconditions inside the body), production owner and semantic meaning/limits. Shared fixture assertions outside bodies are described above.

### tests/unit/move-tree.test.mjs

Full read: 1–149; SHA-256 `aa0cb45ef509ffb11e1bb8a69d6fa04e0165ebc501e3faecb5bc29f3b78608ca`. Read chunks: 1–80, 81–149.

| Case / body lines | Assertion spans | Production target | Meaning and limits |
|---|---|---|---|
| a move rewrites exact path citations, leaves bare names and the archive, records MOVED (42–71) | 46, 48–50, 52–69 | tools/gen/move-tree.mjs:92-247; tools/manifest.cjs (MOVED) | Exact citations follow move while bare names, archive, sibling/nested checkouts and binary stay; MOVED records redirect and leftover is reported. |
| a re-sweep never rewrites the MOVED block's own historical keys (73–93) | 85–86, 90–91 | tools/gen/move-tree.mjs:92-247; tools/manifest.cjs (MOVED) | Repeated unrelated or same sweep preserves historical MOVED keys. |
| a path built from separate quoted segments is REPORTED, not rewritten (95–110) | 102–103, 105–108 | tools/gen/move-tree.mjs:92-247; tools/manifest.cjs (MOVED) | Split path.join segments are reported but never guessed/replaced. |
| --plan changes nothing and still reports what would be rewritten (112–121) | 117–119 | tools/gen/move-tree.mjs:92-247; tools/manifest.cjs (MOVED) | Plan reports changes while source and manifest stay unchanged. |
| a missing source or an occupied target refuses before touching anything (123–131) | 126–129 | tools/gen/move-tree.mjs:92-247; tools/manifest.cjs (MOVED) | Missing source and occupied target validate/refuse before source removal. |
| the live MOVED table holds only real redirects (133–149) | 144, 148 | tools/gen/move-tree.mjs:92-247; tools/manifest.cjs (MOVED) | Live MOVED has no identities or nonexistent nonempty destinations; not a full redirect-graph check. |

### tests/unit/mugello-arrabbiata-orbit.test.mjs

Full read: 1–135; SHA-256 `8705aee68ea971eb0468015d43fe183821be06c4f428f4bce751d7e385c16853`. Read chunks: 1–80, 81–135.

| Case / body lines | Assertion spans | Production target | Meaning and limits |
|---|---|---|---|
| mugello mid-lap survey orbit clears Arrabbiata canopy (#3375) (52–90) | 55, 84–87 | js/circuits/scenery/mugello.js:188-261, 583-609, 718-726; js/circuits/mugello.js | Orbit eye is outside all foliage bounds with no centre within 6m; only fixed midlap preset. |
| mugello Arrabbiata keeps cypress ranks + casale cue (#3375) (92–135) | 131–133 | js/circuits/scenery/mugello.js:188-261, 583-609, 718-726; js/circuits/mugello.js | Casale model-group emits and sampled Arrabbiata band has at least 20 tall-foliage hits 55–90m beyond edge; counts may repeat primitives. |

### tests/unit/needs-sync.test.mjs

Full read: 1–73; SHA-256 `84fce58f41804df3ae00dd194a3b6767d2125b11b8d300984b6aa0f074315aaf`. Read chunks: 1–73.

| Case / body lines | Assertion spans | Production target | Meaning and limits |
|---|---|---|---|
| decideSync: up to date is no, even with a red (13–15) | 14 | tools/ci/needs-sync.mjs:43-105 | Already-current overrides red CI. |
| decideSync: a conflict wins over everything (16–18) | 17 | tools/ci/needs-sync.mjs:43-105 | Conflict overrides green CI when behind. |
| decideSync: red + tip moved after the run = stale-red (19–21) | 20 | tools/ci/needs-sync.mjs:43-105 | Newer deploy tip after failed run requires sync. |
| decideSync: red but the tip is older than the run = no (the red is the branch's own) (22–24) | 23 | tools/ci/needs-sync.mjs:43-105 | Failure newer than tip remains branch-owned. |
| decideSync: clean-behind green / running / unknown / none = no (25–29) | 27 | tools/ci/needs-sync.mjs:43-105 | Six clean-behind nonfailure states do not require sync. |
| exit codes and verdict line (30–37) | 31–36 | tools/ci/needs-sync.mjs:43-105 | Pins verdict order, sync/no/error exit codes and verdict formatting. |
| needsSync on a real repo: disjoint edits are clean-behind = no (53–56) | 55 | tools/ci/needs-sync.mjs:43-105 | Disjoint real Git commits remain clean-behind. |
| needsSync on a real repo: the same line edited twice = conflict (57–60) | 59 | tools/ci/needs-sync.mjs:43-105 | Same-line real Git edits report conflict. |
| needsSync: an unresolvable ref is an error, not a verdict (61–64) | 63 | tools/ci/needs-sync.mjs:43-105 | Missing ref yields error rather than verdict. |
| needsSync: API failure degrades to a note, never a stale-red (65–68) | 67 | tools/ci/needs-sync.mjs:43-105 | Injected API error yields note without stale-red. |
| needsSync: red head + newer tip commit = stale-red via the injected API (69–73) | 72 | tools/ci/needs-sync.mjs:43-105 | Injected failed workflow older than tip yields stale-red. |

### tests/unit/net-audio-revs-vm.test.mjs

Full read: 1–88; SHA-256 `90d9a34e9218970c203bea3af4368f363904f5c134e16f6dc061456c94177808`. Read chunks: 1–80, 81–88.

| Case / body lines | Assertion spans | Production target | Meaning and limits |
|---|---|---|---|
| net-owned rivals at speed use rpmFor gear/speed, not makeCars IDLE_RPM (56–88) | 79–81, 83, 85–86 | js/game.js:4845-4850; js/race/pace-math.js; js/audio/rivals.js | Game VM guest receives moving snapshots: net-owned rivals rev above idle and audible fake rival voice exceeds 200Hz; no actual speaker/browser proof. |

### tests/unit/net-authority.test.mjs

Full read: 1–1821; SHA-256 `4669617f3b3027205450ed7d550878574d5afb8988c92d08fd72b827a5648bac`. Read chunks: 1–80, 81–160, 161–240, 241–320, 321–400, 401–480, 481–560, 561–640, 641–720, 721–800, 801–880, 881–960, 961–1040, 1041–1120, 1121–1200, 1201–1280, 1281–1360, 1361–1440, 1441–1520, 1521–1600, 1601–1680, 1681–1760, 1761–1821.

| Case / body lines | Assertion spans | Production target | Meaning and limits |
|---|---|---|---|
| a host RESULT must be a bijection before its timing mutates any guest car (54–75) | 69–70, 73–74 | js/game.js:2852-2911 (netOrder) | Duplicate/missing IDs and bad timing leave order/times intact; a valid permutation changes both. |
| host RESULT preserves authoritative laps and NC status, with optional fields for older payloads (77–100) | 86, 91, 94, 98 | js/game.js:2852-2911 (netOrder) | Host publishes lap/NC state; guests apply it, retain absent legacy fields, and reject invalid optional fields atomically. |
| no_slot rolls back the car role and disposes the unadopted session (151–172) | 162–171 | js/net/netplay.js:615-859 (bound event handlers); create/start | Failed seating closes transport, removes handlers and restores temporary AI roles. |
| the harness itself works — a GUEST obeys the host's START (214–224) | 221–223 | js/net/netplay.js:615-859 (bound event handlers); create/start | Positive START delivery proves the fake wire actually reaches the guest. |
| a guest keeps racing after the host leaves and is told that rivals are now AI (226–237) | 229, 233–236 | js/net/netplay.js:351-400, 630-680, 1183-1224 | Host transport loss ends net ownership and announces AI continuation. |
| a HOST ignores a START arriving from a guest (239–246) | 245 | js/net/netplay.js:615-859 (bound event handlers); create/start | Guest START cannot arm the host. |
| a HOST ignores a CAUTION arriving from a guest (248–255) | 254 | js/net/netplay.js:615-859 (bound event handlers); create/start | Guest caution cannot invoke host race control. |
| a GUEST obeys a CAUTION from the host (257–261) | 260 | js/net/netplay.js:615-859 (bound event handlers); create/start | Host caution reaches guest race control. |
| a HOST ignores a RESULT arriving from a guest (263–270) | 269 | js/net/netplay.js:615-859 (bound event handlers); create/start | Guest RESULT cannot populate host classification. |
| a GUEST obeys a RESULT from the host (272–277) | 276 | js/net/netplay.js:615-859 (bound event handlers); create/start | Valid host rows populate guest peerResult. |
| a malformed host RESULT does not end the guest's classification wait (279–287) | 284, 286 | js/net/netplay.js:615-859 (bound event handlers); create/start | Malformed rows leave classification wait active. |
| the per-peer events a host DOES own are still accepted from a guest (289–299) | 298 | js/net/netplay.js:615-859 (bound event handlers); create/start | Sender-owned LAP still reaches host scoring. |
| a HOST accepts a QUALI naming the sender's own driver (308–314) | 313 | js/net/netplay.js:615-859 (bound event handlers); create/start | Matching driver ID reaches host qualifying. |
| a HOST drops a QUALI naming another driver (316–323) | 322 | js/net/netplay.js:615-859 (bound event handlers); create/start | Host and unrelated driver claims are rejected. |
| a HOST drops a QUALI naming no driver at all (325–331) | 330 | js/net/netplay.js:615-859 (bound event handlers); create/start | A missing driver ID cannot claim a qualifying time. |
| a GUEST accepts the host's QUALI for any driver (333–340) | 339 | js/net/netplay.js:615-859 (bound event handlers); create/start | Host can supply qualifying for any remote driver. |
| lobby relay hook sees only sender-bound, normalized qualifying events (342–356) | 352–355 | js/net/netplay.js:141-226, 615-624 | Relay callback receives only accepted, normalized qualifying/live events. |
| a QUALI whose t is a numeric string arrives as a NUMBER; junk and implausible laps never arrive (363–380) | 366–367, 371–374, 377, 379 | js/net/netplay.js:141-226, 615-624 | Numeric strings normalize; junk and implausible lap times drop; live clocks clamp. |
| QLIVE is bound to the sender on the host the same way (382–389) | 388 | js/net/netplay.js:141-226, 615-624 | Host live timing accepts only sender driver. |
| IN-RACE phase: the host caps one connection's QUALI+QLIVE at the lobby's shared rate (bug-hunt 2) (391–400) | 393, 395, 397, 399 | js/net/netplay.js:141-226, 615-624 | Race QUALI/QLIVE share a per-connection cap; normal traffic passes. |
| a guest's CAUTION neither applies on a two-guest host nor reaches the other guest (404–425) | 419, 422, 424 | js/net/netplay.js:615-859 (bound event handlers); create/start | Guest caution neither applies on host nor relays to another guest. |
| on a two-guest host, each guest's QUALI is accepted for its own seat only (427–452) | 440, 448–451 | js/net/netplay.js:615-859 (bound event handlers); create/start | Two guests can report only their own separately seated driver. |
| LOBBY phase: the host accepts a guest's own-seat QUALI (554–566) | 564 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Real lobby loopback accepts HELLO-bound own-seat lap. |
| LOBBY phase: the host drops a QUALI naming another driver (568–580) | 578 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Real lobby drops host-seat and bystander claims. |
| LOBBY phase: no HELLO filed means no claim at all (582–591) | 589 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Without HELLO, qualifying has no sender identity. |
| LOBBY phase: the same coercion applies before the hand-off (593–602) | 600 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Lobby shares numeric coercion and invalid-time rejection. |
| LOBBY phase: more than five HELLOs (or READYs) in a second are dropped, per connection (604–622) | 613, 616, 620 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | HELLO/READY stop after five per window; later HELLO succeeds after reset. |
| LOBBY phase: QLIVE is bound to the sender the same way (624–634) | 632 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Lobby live timing honors HELLO-bound driver. |
| LOBBY phase: a guest accepts the host's QUALI for any driver (636–646) | 644 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Guest accepts remote-driver qualifying through its host. |
| LOBBY phase: SETTINGS is validated atomically before guest state changes (648–693) | 677, 685–688, 691 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Invalid settings preserve every field; valid batch applies and weather plan can clear. |
| LOBBY phase: a guest whose HELLO claims the HOST's seat cannot post the host's time (697–709) | 707 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Claiming the host seat in HELLO cannot authorize its lap. |
| LOBBY phase: a guest drops a relayed QUALI naming its OWN seat (711–719) | 717 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Host relay cannot overwrite guest local seat; remote lap remains accepted. |
| LOBBY phase: room tyre-wear / reliability rules never overwrite the guest's SAVED choice (721–741) | 736–739 | js/net/lobby.js:540-777, 885-948; js/net/netplay.js:141-226 | Room wear/reliability apply in memory while saved and unset preferences survive. |
| NO TIME crosses as a marker, never as the synthetic back-of-grid time (743–759) | 748–749, 751–752, 754, 758 | js/net/netplay.js:141-226, 615-624 | Infinity serializes as marked NO TIME, returns to Infinity; unmarked null rejects. |
| QualiNet: a peer entry never replaces the local player's time; NO TIME is kept (761–775) | 772–774 | js/race/quali-net.js:93-237 | Local lap wins over peer spoof; remote Infinity and real laps remain distinct. |
| QualiNet (NP-2): a silent rival cannot hold the gate past the cap (800–815) | 804–805, 807–808, 810–812, 814 | js/race/quali-net.js:93-237 | Guest wait survives 30s, opens after 60s by timer, with missing rival absent from driven times. |
| QualiNet (NP-2): the host can START ANYWAY early; a rival's lap still ends the wait (817–834) | 822–823, 825–828, 831, 833 | js/race/quali-net.js:93-237 | Host gains early START ANYWAY; re-arm resets clock and a real rival lap opens gate. |
| QualiNet (NP-2): BACK before driving tells the room NO TIME (836–841) | 840 | js/race/quali-net.js:93-237 | BACK before driving reports local Infinity. |
| stop() clears the armed start — a quit mid-countdown must not leak into the next race (845–856) | 853, 855 | js/net/netplay.js:351-400, 630-680, 1183-1224 | Stopping clears countdown start state. |
| a duplicate START after lights-out does not re-arm a past instant (NP-6) (858–867) | 861, 863, 866 | js/net/netplay.js:739-772, 1114-1156 | Duplicate START before green is harmless; after consumption cannot re-arm. |
| a peer WITHOUT a grid slot cannot arm the start (869–898) | 885–887, 890–893, 896–897 | js/net/netplay.js:739-772, 1114-1156 | Slotless ARMED cannot start the race; seated peer ARMED can. |
| pickRemoteSlot keeps any-fallback only when profile is null (900–931) | 902–903, 918–919, 928–930 | js/net/netplay.js:404-439 | Null profile permits any free slot; unmatched explicit team fails with profile-miss status; includes source wording guards. |
| strategy events require this race epoch and the sender's own car (934–952) | 943–944, 946, 948, 950 | js/net/netplay.js:265-299, 712-721, 1340-1419 | Own-car strategy applies and relays in receiver epoch; other cars and stale epochs reject. |
| host AI strategy crosses real sessions with human state and survives host departure (954–998) | 975–977, 979, 981–984, 986, 988, 991–996 | js/net/netplay.js:265-299, 712-721, 1340-1419 | Real sessions replicate AI/human service fields and fitted tyre; host departure preserves adopted AI service. |
| AI strategy publishes on phase changes, bounded cadence, and every new receiver epoch (1000–1045) | 1011–1014, 1017–1018, 1021, 1023–1024, 1028–1029, 1035–1036, 1038, 1040, 1042–1043 | js/net/netplay.js:265-299, 712-721, 1340-1419 | Stable AI publishes once per second without eager history reads; phase/service/compound changes and new receiver epoch publish immediately. |
| AI strategy rejects stale epochs, bad models/tracks, wrong hosts, and guest forgeries (1047–1074) | 1055, 1058, 1060, 1062, 1068–1070, 1072 | js/net/netplay.js:265-299, 712-721, 1340-1419 | Wrong host, epoch, track, model and wire reject strategy; valid AI host and own-human guest updates pass. |
| strategy service extensions validate atomically, stay bounded, and accept legacy v1 (1076–1103) | 1082, 1084, 1088–1089, 1092–1094, 1096–1097, 1100–1102 | js/net/netplay.js:230-299 (strategy codec) | Strategy copies bounded records, rejects invalid extensions atomically, preserves optional legacy state and compound evidence in truncated history. |
| a real PitLane stop handed back before or after fitting matches uninterrupted service (1105–1181) | 1121, 1129, 1133, 1141, 1143, 1145, 1147, 1149–1152, 1157–1158, 1162–1163, 1165, 1169, 1171–1173, 1176–1177 | js/net/netplay.js:230-299, 712-721; js/race/pit-lane.js; js/race/sporting-regs.js | Real PitLane adoption before fit, after fit and post-flag matches uninterrupted service; malformed/legacy updates preserve state and frozen compliance verdict. |
| a GUEST parks the host's AI when the host reports its retirement (1198–1210) | 1200, 1203–1205, 1207, 1209 | js/net/netplay.js:615-859 (bound event handlers); create/start | Authoritative AI retirement parks once and survives disconnect. |
| a HOST ignores a guest's claim that one of the host's AI retired (1212–1221) | 1217, 1220 | js/net/netplay.js:615-859 (bound event handlers); create/start | Guest cannot retire host AI. |
| retireCar reports the host's own AI retirements on the reliable channel, not only the local car's (1223–1227) | 1225–1226 | js/game.js:6570-6618 (retireCar) | Source guard pins host-AI reliable retirement and driverId inclusion; no runtime send here. |
| a lapped rival's finish (fin at a lap below the target) finishes it on the other peer (1234–1244) | 1241–1243 | js/net/netplay.js:615-859 (bound event handlers); create/start | Owner finishing lap below race target still finishes lapped rival. |
| a fin ahead of the pose waits for the pose to reach THAT lap, not the target (1246–1256) | 1253–1255 | js/net/netplay.js:615-859 (bound event handlers); create/start | Finish event waits for reported crossing lap in pose. |
| a full-distance finish still needs the pose past the target, as before (1258–1269) | 1264–1265, 1268 | js/net/netplay.js:615-859 (bound event handlers); create/start | Full-distance finish waits until pose reaches target-plus-one. |
| a rival's retirement arrives on the LAP event and parks it as retired, once (1271–1286) | 1278–1279, 1281, 1285 | js/net/netplay.js:615-859 (bound event handlers); create/start | Retirement reason must be string; retired car cannot also finish. |
| a rival handed back to the AI does not time the rest of its lap as a whole one (1288–1299) | 1296–1298 | js/net/netplay.js:351-400, 630-680, 1183-1224 | Handback invalidates partial lap and clears sector clock. |
| a stale disconnect reason does not outlive the race: stop() on an inactive session forgets it (1301–1307) | 1304–1306 | js/net/netplay.js:351-400, 630-680, 1183-1224 | Explicit inactive stop clears old disconnect reason. |
| a mid-race BYE keeps lastReason and does not fire onStop (race continues offline) (1315–1343) | 1321, 1323–1326, 1334–1337, 1339–1342 | js/net/netplay.js:351-400, 630-680, 1183-1224 | BYE preserves reason, avoids local-only callback, and hands rival to AI; remaining guest stays active. |
| a guest BYE tells the other guests why:\"bye\", not the close() artefact \"local\" (1348–1361) | 1352–1355, 1358–1360 | js/net/netplay.js:351-400, 630-680, 1183-1224 | Other guests receive exactly one LEFT with bye rather than synchronous close artefact. |
| dropping one incompatible guest tells the others why:\"incompatible_physics\", not \"local\" (1364–1377) | 1368–1371, 1373, 1375–1376 | js/net/netplay.js:351-400, 630-680, 1183-1224 | Incompatible peer drops alone and LEFT carries incompatible_physics. |
| a local stop fires onStop once and keeps reason local through socket teardown (1379–1388) | 1384–1387 | js/net/netplay.js:351-400, 630-680, 1183-1224 | Local stop invokes restoration callback once and retains local reason. |
| the published snapshot carries the pose time the game loop hands in (1394–1408) | 1400, 1402, 1404, 1407 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Publish uses supplied recent pose timestamp; missing/future/old stamps fall back to frame. |
| the host relays every other guest's car in ONE aged datagram per guest, each with its own stamp (1428–1454) | 1432–1434, 1448–1451 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Each guest gets own-host packet plus one batched aged relay excluding its car; packet count/IDs asserted, individual age checked separately. |
| the host stops relaying a rival that has gone quiet instead of stamping its frozen pose fresh (NP-5) (1456–1486) | 1460–1462, 1481–1482 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Quiet rival disappears from relay even if fallback AI crosses target. |
| a guest poses each entry of an aged relay at ITS OWN stamp (tick − age) (1488–1502) | 1493, 1500 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Aged entries derive independent lag from header tick minus per-entry age. |
| the publish rate is a fixed 20 Hz at 30, 60 and 144 fps (1504–1516) | 1509, 1513 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Ten synthetic seconds at 30/60/144fps yield about 200 snapshots. |
| a rival's lag is measured from the transport's ARRIVAL stamp, not the frame that drained it (1518–1537) | 1523, 1535–1536 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Transport arrival yields 40ms lag; missing stamp falls back to 70ms drain time. |
| the host publishes its AI field at 10 Hz in each guest's aged packet, never that guest's own car (1540–1553) | 1544, 1549–1551 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Host own car publishes 20Hz and AI packet 10Hz, excluding receiving human. |
| a guest seats the host's AI as host-owned remotes and poses them from the packet (1555–1576) | 1559, 1561–1563, 1569–1570, 1573–1574 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Guest poses host AI as net-owned nonhuman; hostAi:false retains local simulation. |
| the host's actual AI retirement reaches a guest, including one that binds after it happened (1578–1622) | 1595–1596, 1598–1601, 1603, 1610, 1612, 1616–1617, 1620 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Real extracted retirement sender stamps receiver epoch, terminal state survives stale pose and replays once for each new receiver. |
| AI retirements require the host and the current receiver epoch (1624–1640) | 1630, 1632, 1637–1638 | js/net/netplay.js:351-381, 558-612, 1226-1407 | AI retirement requires current receiver epoch and host authority. |
| silence grace: a rival quiet > 2 s is the local AI's, back on the wire when it speaks; the race session waits 25 s (1642–1667) | 1648–1649, 1654–1655, 1657–1660, 1663–1665 | js/net/netplay.js:351-381, 558-612, 1226-1407 | After 2.1s silence human becomes AI, stale reliability clears; resumed packet restores ownership; race session timeout set to 25s. |
| temporary fallback cannot finish a connected human or remove it from the result wait (1669–1696) | 1679, 1682–1685, 1688, 1690–1692, 1694 | js/net/netplay.js:351-381, 558-612, 1226-1407; js/race/race-control.js:31-76, 117-167 | Fallback crossing cannot flag/finish connected human or release result wait; actual disconnect releases membership. |
| an owner finish arriving during fallback is preserved when its finishing pose resumes (1698–1718) | 1710, 1713, 1716 | js/net/netplay.js:351-381, 558-612, 1226-1407; js/race/race-control.js:31-76, 117-167 | Owner finish waits for owner pose during fallback and persists through subsequent fallback/resume. |
| the host tells a guest that arms late about a rival that left before it was built (1724–1745) | 1727–1729, 1732, 1734–1735, 1737, 1740–1741, 1743 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Late ARMED earns missed LEFT once; receiving guest releases leaver human role. |
| a human rival that never speaks is the local AI's after the start's own backstop, not never (1747–1763) | 1749, 1754, 1756–1758, 1761 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Never-heard human retains build grace then falls back after start backstop; later packet reclaims it. |
| a session ending hands the HOST's AI cars back scrubbed too, not only the human rivals (1765–1782) | 1771–1772, 1776–1780 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Ending session scrubs host AI as well as human partial laps, reliability and net flags. |
| a hidden tab keeps pumping the session but publishes no pose; it resumes on return (1784–1809) | 1795, 1800–1801, 1804–1805 | js/net/netplay.js:351-381, 558-612, 1226-1407 | Hidden document pumps transport while suppressing poses; visible resumes immediately. |
| QUALI and QLIVE reject a rival driverId even with the sender's code (1812–1821) | 1817–1818, 1820 | js/net/netplay.js:141-226, 615-624 | A valid sender code cannot override a conflicting driverId; own ID remains accepted. |

### tests/unit/net-grid-separation.test.mjs

Full read: 1–114; SHA-256 `91588bb56b5bacc05fac35ebbaf2ac985d12f706ad9a8bf40c738400f27793d6`. Read chunks: 1–80, 81–114.

| Case / body lines | Assertion spans | Production target | Meaning and limits |
|---|---|---|---|
| a PACE grid is re-laid, because every peer's own car is at P12 (97–104) | 102–103 | js/net/netplay.js:404-476 (separateGrid/start) | Nonconsecutive reversed fixture provokes pace-grid swaps; does not assert final layout coordinates. |
| a QUALIFYING grid is left exactly as qualifying laid it (106–114) | 110–113 | js/net/netplay.js:404-476 (separateGrid/start) | Preordered qualifying grid retains all positions and produces zero swaps. |

### tests/unit/net-lobby-friend-quali.test.mjs

Full read: 1–341; SHA-256 `84efced2daaec676aebe3eda85e1795e89612ffd9e7a315fb62e1c1a1ea3695f`. Read chunks: 1–80, 81–160, 161–240, 241–320, 321–341.

| Case / body lines | Assertion spans | Production target | Meaning and limits |
|---|---|---|---|
| friendQualifying after a cancelled start (60–68) | 63–64, 66 | js/net/lobby.js:540-777, 1341-1410; js/race/quali-net.js | Canceled start result clears friendQualifying after TO THE GRID. |
| friendQualifying after a failed start (60–68) | 63–64, 66 | js/net/lobby.js:540-777, 1341-1410; js/race/quali-net.js | Thrown build clears friendQualifying after TO THE GRID. |
| a failed start after the lobby closed lands on the menu WITH a visible notice, not a silent return (H30) (71–84) | 78, 81–82 | js/net/lobby.js:540-777, 1341-1410; js/race/quali-net.js | Hidden-lobby failure calls menu first then visible announcement. |
| hunt fixes: SIMULATE / no valid lap still reports a time; tyres + reliability are race rules; a paused friend race brakes the car (86–99) | 91–93, 95, 98 | js/game.js; js/net/lobby.js:885-948 | Source regexes pin simulate/no-valid-time reporting, pause braking and room-only rules; spelling-sensitive, not integrated behavior. |
| the HUD hides eligible garage work during a friend race and restores it when solo (101–131) | 122, 124, 126, 128, 130 | js/ui/hud.js:2160-2166 | Mini-DOM HUD hides eligible WORK in multiplayer, restores solo eligibility and hides again on rejoin. |
| a networked race clock is anchored to the SHARED green, so a peer that lost frames is not classified ahead (133–162) | 136–137, 139, 149, 152, 157–158, 161 | js/game.js:4544, 4569-4576 | Extracted real clock code catches up to shared green, never moves backward, clears anchor after disconnect and leaves WATCH clock intact. |
| a reopened room code remembers the answers it already took (a guest's reposts are not a new joiner) (164–169) | 167–168 | js/net/lobby.js:1703-1704 | Source guard retains deduplication set for quiet reopen of same code; no signaling backend exercised. |
| a roster peer with no string team is not a rival to wait for (bug-hunt 8.5) (171–184) | 181, 183 | js/race/quali-net.js:54-103 | Malformed roster profiles do not add waiters; valid rival lap releases gate. |
| a rival's lap arriving after ours was deleted keeps us at NO TIME, not a model lap (A·H1 Q1) (186–203) | 198–199, 202 | js/race/quali-net.js:164-192 | Peer arrival preserves locally deleted NO TIME; undriven local seat remains absent for model fill. |
| a guest that backs out of friend quali releases the host's wait on its lap (206–219) | 211–212, 214–217 | js/net/lobby.js:540-777, 1341-1410; js/race/quali-net.js | In-quali qabort delivers marked Infinity for departing rival. |
| a qabort outside friend quali does nothing (221–229) | 227 | js/net/lobby.js:540-777, 1341-1410; js/race/quali-net.js | Qabort before friend qualifying leaves scoring untouched. |
| the host drops a guest's QUALI/QLIVE flood past a small per-second cap (231–249) | 237, 241, 244, 247 | js/net/lobby.js:540-777, 1341-1410; js/race/quali-net.js | Normal 3-event burst passes; 200 live/50 lap floods cap in real lobby. |
| friend quali: after the bounded wait TO THE GRID opens (NO LAP FROM THEM) (268–286) | 273–276, 278, 280–283, 285 | js/race/quali-net.js:93-145 | Boundary check waits until 60s then enables button and leaves silent rival absent from driven map. |
| friend quali: a late real lap after the cap still replaces the empty seat (288–297) | 293, 295–296 | js/race/quali-net.js:118-192 | Late genuine lap replaces absent rival and clears timeout label. |
| friend quali: leaving is open once timed out, and re-arming forgets the timeout (299–310) | 304, 306, 308–309 | js/race/quali-net.js:194-237 | Timeout allows leave; re-arm clears timeout and holds leave again. |
| the host tells guests it went on after friend quali (qgo), so a guest that backed out can follow (312–324) | 318, 322 | js/net/lobby.js:540-777, 1341-1410; js/race/quali-net.js | Host completing qualifying sends qgo to aborted guest over loopback. |
| TO THE GRID after every connection closed lands on the menu with a notice, not a blank screen (327–341) | 333, 337–339 | js/net/lobby.js:540-777, 1341-1410; js/race/quali-net.js | No remaining connections sends menu notice and clears qualifying instead of blank screen. |

Inventory: 118 expanded cases (the friendQualifying loop declares two cases from one body).

## Evidence hashes for production and supporting fixtures

SHA-256 values pin inspected owners and harness dependencies; hashes are inventory, not execution evidence.

| File | SHA-256 |
|---|---|
| tools/gen/move-tree.mjs | `a0eb39b8dbea81e98866c40dfbe2ca2c1da1a67221c460ae31d81bda23f2dc9b` |
| tools/manifest.cjs | `bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb` |
| tools/ci/needs-sync.mjs | `89ec470f7b7b3ce7ed80dadb95690c40f966e25c4b52677311c429ec34875729` |
| js/net/netplay.js | `49332e13214c1e5e9eb7c186af0591ef8b1054e33d5fc5df1a80abc957b9566c` |
| js/net/lobby.js | `91ef67f43cc1b03488a2a3dff6f83ada24c459fd2638cf51ccbb026ca496d110` |
| js/net/snapshot.js | `23659eed7cbe28b23d7a8363576db9e39c774e13af4e4b7b517b70e5ddb66298` |
| js/net/session.js | `7d016f38240c2360241162100995480a5c6635d67a6f876c54274c5b16456b01` |
| js/net/transport.js | `ae8e23ab480d0663a1576bbf8f52a1380f933ef5e84946dc4945c0b5c5a76bf4` |
| js/race/quali-net.js | `c68f3003063b3c58ad38fccdffb54a4aa2a270204c1843684e4217a4f671987d` |
| js/race/race-control.js | `1dfaf228a9906bc173fdccad5e6605514cc530fdc48ff9883935813c80dd67ca` |
| js/game.js | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| js/ui/hud.js | `34025c6524ab09293553ea05907cc0e3b063a1d31b00a17e2f6707960477355f` |
| js/circuits/mugello.js | `5e2e637cfb5c511885c62c2873925856484a1b96ec7c30a069aac3a1a0f55e52` |
| js/circuits/scenery/mugello.js | `ddde9704891bb526ecfb5dbaaadca9eca2f3725c98193e9b9adf8e89ee914c3a` |
| js/race/pace-math.js | `671c957ce1143bd37775b045ad13890ae97b8c3e953e23f6e6aaf541ef3f8591` |
| js/audio/rivals.js | `60f7b6f9f8ccd38412bcdd6dea053d364fce39c452fa4fdbdcd4768c5c57e7b8` |
| tools/lib/game-vm.cjs | `2fc70b5f4181bc698cbfdc51b6052e253f9b0fffab4fcd00ddfcb7ec0504ddc0` |
| tools/lib/track-build-vm.cjs | `09e00ae387a0e46bf25c9d7cbe4eb71ab32c891b7aba36e645c5d6614f6f311b` |
| tests/unit/fake-audio-vm.cjs | `bf3d952dddc793d791b722d55c1349d62e5a9e5b7987340086987356f94f7ec7` |
| tests/helpers/game-source.mjs | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| tests/helpers/mini-dom.mjs | `3406f017e765ad4cfef78493aafa8da95846a0e1cb9d28b28a53abd2b296e5c1` |
| tests/helpers/git-fixture-env.mjs | `4c1552f60e11920ca758fd7f913db6604ac90adcbd59437a694576f2e7f9cf82` |
| tests/helpers/seed-log.mjs | `b4104089fb78794e16e7e40d8f467d7e49f8deb0a9ed260d6f387bfa2d1f69c1` |
| tests/helpers/abs-src.mjs | `f33a40d278e2ec7ab00571e2020304a9c21b300861bba501c799947560e32d47` |
