# Rows for race-2 part 2/2 (REPORT partial 2/2, comment c6260585884), normalized by the synthesis session.
# status: PARTIAL (handoff at the reviewer's context limit). Adds spec results only; part 1 rows stand unchanged.
#   terrain-over-road 22/56 done at 05:46Z, 1 failed (monaco, BOOT_MS waitForFunction 45 s at loadavg 4.7: environment,
#   not re-run alone); debris 1/5 still unconfirmed (alone re-run queued). perf-race-entry and the APEX_WITH_TWINNED
#   browser re-runs of debris/jump-start/pit-lane/race-control were queued in the reviewer's container and never reported.
# debugger: no spec debugger column (a browser run was live); proposed breakpoints per spec are in the report.
# Synth checks on origin/claude/f1-game-project-26h3ng @ 7b27c153.
NEW = [
("RC2-19","race-2","tests/specs/terrain-over-road.spec.js","20-31","flaky","med","med",
 "one test() per circuit carries three BOOT_MS (45 s) waitForFunction boots inside a 180 s budget; on SwiftShader one slow build turns red (monaco 262 s, loadavg 4.7)",
 "a red that measures the machine, not geometry, in a sweep that gates terrain edits",
 "boot once per worker and reuse the page across circuits, or move the scan to the node build VM (scanOverRoad is already node-tested)","M","tracks",R,
 "confirmed@7b27c153: BOOT_MS waits at :25/:27/:31 and :49/:51/:55 inside each test","pipeline",[],None),
("RC2-20","race-2","tests/specs/terrain-over-road.spec.js","16","wrong-target","med","med",
 "CROSSOVER_TRACKS (madrid, suzuka, zandvoort) is a hard-coded set that changes how the road scan treats those 3 circuits, so a real over-road defect there is judged by a different rule",
 "a new figure-8 circuit is scanned without the crossover rule (false red) and a defect on the 3 named ones can hide behind it",
 "derive known crossovers from track metadata (bridges/flyover defs) instead of a name list; assert the list matches the metadata","S","tracks",R,
 "partly@7b27c153: the set at :16 is passed into the in-page scan as knownCrossover (:245); roadFails(max, TOL) itself is not relaxed","pipeline",[],None),
("RC2-21","race-2","tests/specs/terrain-over-road.spec.js","","hygiene","low","high",
 "the Madrid test builds TrackSurface.profile directly with real code and needs no browser, yet runs in a browser spec",
 "browser minutes spent on a check a node unit test could do",
 "move the Madrid profile check to a tests/unit file on the track VM","S","tracks",R,None,"hygiene",[],None),
]
