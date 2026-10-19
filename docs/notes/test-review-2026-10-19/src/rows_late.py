# Rows for the late continuations (after PLANS FINAL at 6438c6aa), normalized by the synthesis session itself.
#
# ---- car-2 part 2/2 (REPORT final, comment c6261492542)
# status: FINAL. Covers only part 1's open items: hit/not-hit for all 46 files and the team-style-relief :87-88 check.
#   Units 27/27 pass (each < 1 s); run, quality, mock and verdict columns stand as in part 1 (45 pass, 1 environment fail:
#   parts-mesh-cache warm-up timed out twice).
# debugger: js-debugger MCP lists no node targets (= DBG-01) -> V8 function coverage (NODE_V8_COVERAGE + a vm-name preload),
#   hit/total functions per js/ file: 23 of 27 units hit their targets; helmets, title-home-scene-prepaint,
#   ui-fit-garage-livery-r6 and ui-journey-career not attributable (new Function / DOM-less loads, = DBG-02).
#   C2-02 is now runtime-confirmed: `${S.Car3D}` is "[object Object]", so the Math.random guard can never fail.
# not run: the 19 specs under a debugger (8-798 s each, ~5000 s total on SwiftShader). Helpers on branch
#   cursor/test-review-helpers-car-2 (a7a45cd3), not on a PR.
#
# ---- physics-2 part 3b (REPORT physics-2b partial, comment c6261683714)
# status: PARTIAL (120k cap), tip 484d7ea1. 9 specs run alone, 0 fail, 0 retry: css-player-smoke, garage-aero,
#   menu-traversal, menu-baseline, parts-physics, and persistence / collision-ai-fixes / collisions-deep /
#   agent-drive-bench in the browser (APEX_WITH_TWINNED=1; each 4-6x slower than its VM twin).
# debugger: one live Monza race in debug-chrome, 22 logpoints set, 19 hit (physics-characterization, hotpath, grass drag,
#   active aero, steering with ROAD_FOLLOW=0 under assists off, player-forces, parts-ers AI rows only, aero-zones,
#   collide car-car, wall-clamp). game.js:6059 `c.s = tf.s` fired every frame while reversing: not evidence for
#   P2 part 1 #3 (back-jump at speed), which still needs its own repro.
# not run: the UI half of the browser debugger map, the store.js:668 setItem-stub repro, back-jump at speed, drift
#   player-forces.js:209, collide.js:539/:222, rescue game.js:6332; browser copies of drift, active-aero, aero-zones,
#   world-physics, collisions. Helpers on branch cursor/test-review-helpers-physics-2b, not on a PR.
NEW = [
("C2-22","car-2","tests/unit/livery-finish-contract.test.mjs","","wrong-target","med","med",
 "the finish contract is checked at data level: V8 coverage shows car-materials 5/10 and car-material-shade 1/1 functions, no mesh build",
 "a finish that the mesh build drops or mis-applies passes",
 "add one build-through assertion: build a car with each finish and read the material the mesh carries","S","garage-livery",R,None,"player",[],None),
("C2-23","car-2","tests/unit/parts-ladder.test.mjs","","wrong-target","med","med",
 "livery-tier, parts-ladder and parts-locked-equivalent check tier and ladder data while the code that applies it barely runs (car3d 2/6, liverytex 2/72, car-mesh 1/92 functions)",
 "a regression in the applying code fails none of the three",
 "keep the data checks; add a mesh-level assertion per tier in the spec layer (parts-catalog or carview-parts)","M","garage-livery",R,None,"player",[],None),
("C2-24","car-2","tests/unit/livery-draft-mesh-cache.test.mjs","","gap","low","med",
 "the cache path is touched but car-draw is 17/81 functions; the cache hit/miss branch itself is not shown to be asserted",
 "a cache that never hits (or never invalidates) may pass",
 "assert one hit and one miss explicitly (build twice, change the livery, build again)","S","garage-livery",R,None,"player",[],None),
("P2-25","physics-2","tests/specs/collisions-deep.spec.js","","slow","high","high",
 "the browser run takes 1222 s for 15 tests; the traffic-nest perpetual side-rub test alone runs over 113 s",
 "a 20-minute serialized local cost, which is why the VM twin is the default and a browser verdict is rarely gathered",
 "time each test under APEX_WITH_TWINNED in CI; split or shorten the nest test (fewer frames, headless step batching)","M","collisions",R,"measured by the reviewer (1222 s alone at 484d7ea1)","pipeline",[],None),
("P2-26","physics-2","js/agent/apex.js","1781-1785","gap","med","med",
 "`act()` takes only steer/throttle/brake: no boost/ERS key, so a headless agent or debugger repro cannot drive the player ERS deploy branch (game.js:4985/:5398 logged AI cars only)",
 "player ERS coverage rests on the specs' own key/touch paths; neither act() nor the agent bench can check it",
 "add `boost` to act() input, or document in DEBUG-HOOKS that ERS needs keydown","S","agent-api",R,None,"pipeline",[],None),
("P2-27","physics-2","tests/specs/collisions-deep.spec.js","","stale-doc","low","high",
 "part 3a's proposed logpoint expressions (collide.js:548, game.js:5763) read a.id / b.id / c.id, which are null on car objects (observed live)",
 "logpoint output from the published map is unreadable as written",
 "use [a.isPlayer, b.isPlayer, a.s|0, b.s|0] or the driver code field in the map","S","debugger",R,None,"hygiene",[],None),
("P2-28","physics-2","tests/specs/persistence.spec.js","","wrong-target","med","med",
 "a live race in a healthy store never reaches store.js:668; the spec's only path there is its Storage.prototype.setItem stub, so which write sets store.broken first (P2 part 1 #14/#18) stays open",
 "the broken-store path is proven only through a stub, not through a real failing write",
 "run the part 3a stub repro (Page.addScriptToEvaluateOnNewDocument) with the logpoint [name, what, first] and assert the first writer","S","persistence",R,None,"pipeline",[],None),
]

# ---- race-2 part 3/3 (REPORT race-2b final, comment c6261855739)
# status: FINAL for race-2: the 6 specs parts 1/2 left unrun, each alone in a real Chromium (APEX_WITH_TWINNED=1,
#   SwiftShader): debris 5/5 (71 s), jump-start 3/3, pit-lane 6/7 (1 test fails alone twice: RC2-22), race-control 3/3,
#   perf-race-entry 1/1 (race wall 98.9 s vs the 75 s soft cap, still green = RC2-15 confirmed), terrain-over-road 56/56
#   (64 min, 0 retries). Reclassified: RC2-17 debris Singapore red and RC2-19 monaco boot red were environment load.
# debugger: js-debugger logpoints on the live page: debris-world.js:834 step, sporting-regs.js:222/:229, pit-lane.js:1190,
#   race-control.js:343, apex-track.js:109 hit; pit-lane.js:1414 serviceCar not hit by the probe (the spec's log shows it
#   ran); the terrain scan is an injected anonymous script (no file to break on, = DBG-02). RC2-14 gains a float edge:
#   tSinceGreen = 0.19999999999999998 at the 0.2 s reaction gate.
#
# ---- physics-2 part 3c (REPORT physics-2c final, comment c6262452032)
# status: FINAL for physics-2: the five browser twins (drift 6/6 458 s, active-aero 409 s, aero-zones 641 s,
#   world-physics 6/6 490 s, collisions 297 s; no retries) plus logpoint probes for the UI half of the map. Probes only
#   (no spec re-run) for physics-fixes, collision-ai-fixes, hotpath, css-player-smoke, menu-*, garage-aero, persistence,
#   understeer-cue. store.js:668 hit 8x only under a setItem-throw stub (= P2-28). The part 3a input rows have no probe.
NEW += [
("RC2-22","race-2","tests/specs/pit-lane.spec.js","427","flaky","high","high",
 "the crew-draw test calls A.headless(false) and never restores it, so the final 300-step release loop renders every step on SwiftShader; one page.evaluate ran 123-135 s against the 120 s test timeout",
 "a reproducible red (alone, loadavg 2.3, twice) that measures rendering, not the pit stop, which the log shows finished",
 "restore headless(true) before the release loop (try/finally), or assert the crew draw in one rendered frame and step headless","S","race-weekend",R,"reproduced by the reviewer alone at 484d7ea1 (2/2 fail)","pipeline",[],None),
("RC2-23","race-2","tests/specs/terrain-over-road.spec.js","175","hygiene","low","high",
 "the per-circuit test calls headless(true) after its expect, so a failing circuit skips the cleanup",
 "harmless today (the page closes), but a reused page would carry a rendering state into the next circuit",
 "move the cleanup into a finally or afterEach","S","tracks",R,None,"hygiene",[],None),
("RC2-24","race-2","tests/specs/terrain-over-road.spec.js","","vacuous","med","med",
 "all 52 per-circuit tests assert offenders == [] and nothing shows the in-page scan can fail; its mutation test lives only in the over-road-scan unit test and the per-circuit maxima are not logged",
 "a scan broken in the page wiring (wrong road set, wrong tolerance) passes every circuit",
 "add a negative control that injects a face 1 m over the road and expects a hit, and log each circuit's max margin","S","tracks",R,None,"pipeline",[],None),
("P2-29","physics-2","tests/specs/drift.spec.js","","gap","med","med",
 "a driven lap never enters the drift branch: player-forces.js:209 hit 1316 times with DRIFT=0 throughout",
 "the drift model's active path is untested by the twins that claim it",
 "drive a scripted lift-off oversteer (or set the slip state) and assert DRIFT > 0 and the force it adds","M","player-physics",R,None,"player",[],None),
("P2-30","physics-2","tests/specs/active-aero.spec.js","","wrong-target","med","med",
 "game.js:5045 hit 28952 times, every sample an AI car: the active-aero spec never samples the player's aeroX",
 "a player-only active-aero regression passes",
 "assert the player's aeroDfMult/aeroX through physState on a straight and in a corner","S","aero",R,None,"player",[],None),
("P2-31","physics-2","tests/specs/physics-fixes.spec.js","","gap","med","med",
 "the back-jump guard (game.js:6059) and the rescue timer (game.js:6332, collision-ai-fixes) never fire in normal driving (rescueT = 0), and the oriented contact path (collide.js:539, collisions) saw only non-oriented AI-vs-AI contacts",
 "three guarded branches pass because the driving never reaches them",
 "force each branch: a teleport behind the car for the back-jump, a wedged car for the rescue, a nose-to-side contact for the oriented path; assert the guarded outcome","M","collisions",R,None,"player",[],None),
("P2-32","physics-2","tests/specs/garage-aero.spec.js","","gap","low","med",
 "select-screen.js:605, setup-camera.js:418 and game.js:1253 are unreachable through __apex hooks, and a bare garageAero call with the garage closed returns null with no signal",
 "UI branches of garage-aero and menu-baseline are only reachable by DOM driving; a silent null hides misuse",
 "drive them through the DOM in their specs; make garageAero report that the garage is closed","S","garage",R,None,"pipeline",[],None),
("P2-33","physics-2","tests/specs/understeer-cue.spec.js","","gap","low","med",
 "the understeer cue's vibrate branch (player-forces.js:272) is never hit; only :265 runs (71 hits)",
 "a broken haptic cue passes",
 "stub navigator.vibrate and assert one call while understeering with haptics on","S","input",R,None,"player",[],None),
]

# ---- platform part 2/2 (REPORT platform continuation, final, comment c6263765590)
# status: FINAL for platform: the 9 specs part 1 read but did not run (or ran red at load) re-run alone, one at a time,
#   loadavg < 3 at each start (0.7-2.8), SwiftShader, no /dev/dri. 4 pass (dev-tools 36 s, new-hooks 1453 s, ui-redesign
#   246 s, agent-view 52 s), 5 fail (smoke, dev-tools-dom, ui-resize, ui-button-touch, ui-scale). ui-audit not re-run (78
#   tests, est. > 1 h); part 1's result stands. All 22 specs have now run at least once.
# reclassified: PL-01 smoke (3/10 timeouts again solo at loadavg 0.72; maxStepMs 12324 on the race build, a SW activation
#   mid-test) and PL-02 dev-tools-dom (hud(false) again solo, a 60 s screenshot step) are environment, reproducible: the
#   SwiftShader cost, not load. These gates give no local verdict on this container; CI llvmpipe (remote-group.mjs) does.
# confirmed by run (Node VM __apex, helpers/platform/audit-probe.sh on branch cursor/test-review-helpers-platform, no PR):
#   PL-05 jump(0.01,25,0) lands s=53.9 m, 90 reverse frames end at s=12.7 m, lap 0 -> 0 (the line is never crossed);
#   PL-06 player and rival both 50 m/s at start, closing speed ~0, no contact.
# debugger: not done for any of the 22 files (wall time went to spec runs); hit/not-hit stays unverified.
NEW += [
("PL-27","platform","tests/specs/ui-scale.spec.js","","gap","med","med",
 "the only deterministic assertion failure in the batch: `portrait › every main screen fits at 200%` reports the title screen's #overlay scrolling sideways by 6 px (expected <= 1, received 6; 12.9 s, no timeout), reproduced on a second solo run; root cause not found, and no other spec checks title/overlay horizontal overflow",
 "a player with a large UI scale may see a horizontally scrollable title screen; product defect versus test viewport is undecided",
 "find the overflowing child (js-debugger on the title DOM at portrait @200%), then fix the product or the fixture; add an overflow check outside ui-scale","S","ui",R,"reproduced by the reviewer alone (2 runs)","player",[],None),
("PL-28","platform","tests/specs/ui-resize.spec.js","","flaky","med","high",
 "the file's first test (`resizing into a size matches loading fresh at that size`) waits 15 s in waitForFunction right after a cold navigate, while cold boot logs 27 s; it failed on both solo runs (157 s, 147 s); the other 6 pass",
 "a deterministic false red on a cold server that hides whether the resize path works",
 "give the first wait a boot-sized budget or warm the page in beforeAll","S","ui",R,"reproduced by the reviewer alone (2/2 fail)","pipeline",[],None),
("PL-29","platform","tests/specs/ui-button-touch.spec.js","","slow","high","high",
 "45 tests with 1 worker take 1 h 1 m locally; 17 fail (15 at the 120 s test timeout: lighting tuner pause lifecycle and free camera, pause menu calibrate, touch dock REPOSITION; 2 waitForFunction 5 s), with single click/evaluate steps at 20-27 s and no assertion message among them",
 "the file is not a usable local unit and its red count measures SwiftShader, not the touch UI",
 "split by subject and run the parts on CI shards","M","touch-ui",R,"measured by the reviewer (one 1 h run)","pipeline",[],None),
]
