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
