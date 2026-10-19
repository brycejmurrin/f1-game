# Rows for batch 7: platform part 1/n (new, PL-nn) plus continuations of race-1 (2of2), ui-2 (2ofn), tracks-2 (2of2).
# Synth checks run against origin/claude/f1-game-project-26h3ng @ a027eaf4.
#
# ---- platform (REPORT partial 1/n, comment 6261348439)
# status: PARTIAL 1/n. 15 of 22 specs run, 7 never started (stopped at the 120k reviewer cap); no debugger pass on any file.
#   Each spec ran alone (npm test -- <spec> --workers=1) at loadavg 3-5 on 4 cores, SwiftShader, no /dev/dri.
#   Two read-only subagents read 11 specs each; the reviewer did not re-verify their findings (confidence per row).
# run totals: 12 pass, 3 FAIL on 120 s timeouts with no solo re-run: smoke 3/10 (park 193 s, DRIVING LINE 186 s, HUD speed
#   149 s), dev-tools-dom 1/5 (hud(false) 120 s), ui-audit 7/78 (+1 skipped; 127-182 s each). Slowest pass: audit 906 s.
# debugger: NOT run. The report's breakpoint column is a proposal; hit / not-hit is unverified for all 22.
# not run: ui-resize, dev-tools, new-hooks, ui-redesign, ui-button-touch, agent-view, ui-scale (read-only rows, nothing executed);
#   solo re-runs of smoke, dev-tools-dom, ui-audit; debugger pass for all 22.
# low-impact gaps: Log ring overflow (500) and ?log= precedence, boot-guard data-apex-lazy and offline branches, trackBounds
#   north-up, soak-run movement, agent-determinism leaked arrays, rotation-recovery pause behind the blocker, output-paths
#   invalid APEX_PORT.
#
# ---- race-1 continuation (REPORT final, comment 6261405190)
# status: FINAL continuation. Re-checked the 6 files left open (ai-band 10, pit-lane 96, race-entry-profile 26, fleet-flags 5,
#   mirror-lights 6, race-flow-fixes-vm 43 tests), all green, <1 s to ~4 min under the debugger.
# debugger: rewritten cdp-hit helper (beforeScriptExecution pause covers vm scripts with no filename). ai-band applyVmax HIT with
#   frame eval (1+f)=1.18 < bandCap=1.2114 so Math.min never binds; mirror-lights appendCarTailLights NOT-HIT (2nd line);
#   clearDriveEdges hit once across 43 tests; pit-lane, race-entry-profile, fleet-flags branches hit.
# slowest: race-flow-fixes-vm ~4 min under the debugger. not run: no mutations; pit-lane commitNow/update given no breakpoint.
# low-impact gaps: none beyond the partial report.
#
# ---- ui-2 continuation (REPORT partial 2/n, comment 6261404014)
# status: PARTIAL 2/n. photo-studio 5/5 pass alone (286 s), hud-mirror 2/3 FAIL (TLX render at the 300 s cap, GLX 255 s),
#   hud-layout last 14 of 51 pass (15 run, 588 s; all 51 now passed only as a union of two runs).
# debugger: browser logpoints hit photo-studio.js:294, hud.js:1013 fitHud; syncPhoneFit not hit on desktop (expected); touch
#   pedals not hit (probe limit, no touch pointer). hud-mirror not attached (never reaches an assertion).
# slowest: hud-mirror 680 s, hud-layout 588 s, photo-studio 286 s.
# not run: browser-debugger pass for hud-audit, picker-edit-button, picker-tab-inplace, photo-studio-conditions, touch-buttons,
#   browser-ui-hunt, menu-survey, title-menu-rotation, menu-keyboard; flake rate beyond one re-run.
# low-impact gaps: no touch-emulated debug Chrome for the touch profile.
#
# ---- tracks-2 continuation (REPORT final, comment 6261284192)
# status: FINAL continuation, closes the open items. Solo re-runs: livery-sidewall pass 2/2 (121 s); track-designer 18/19 pass,
#   test 3 fails reproducibly at the 120 s cap (639 s); props-over-road tail 6/6 pass (230 s), so all 52 circuits have passed.
# debugger: browser logpoints hit trackGeometry (apex-track.js:87) 1x and wall-clamp wallLimits (:41) 2684x; a positional-arg
#   race() call is required (the object form silently leaves state at menu). Remaining specs not breakpointed.
# slowest: track-designer 639 s, props-over-road tail 230 s, livery-sidewall 121 s.
# not run: nothing else; per-spec breakpoints for track-designer, livery-sidewall, scenery-kits, track-switch-release,
#   f1-track-accuracy, elevation-tracks.
# low-impact gaps: none new; the earlier ranked list stands.

NEW = [
# ---- platform
("PL-01","platform","tests/specs/smoke.spec.js","","slow","med","med",
 "3 of 10 smoke tests hit the 120 s timeout at loadavg 4-5 (park() 193 s, DRIVING LINE 186 s, HUD speed 149 s); no solo re-run, so env vs product is unclassified",
 "the does-it-boot gate is red locally; park() at 193 s may be a real perf signal rather than SwiftShader load",
 "re-run each test alone on a quiet box and classify; give slow tests an explicit per-test timeout","S","boot",U,None,"pipeline",[],None),
("PL-02","platform","tests/specs/dev-tools-dom.spec.js","","slow","med","med",
 "hud(false) test hit its 120 s timeout (470 s file; also a 60 s screenshot step and a service worker re-activating mid-test); other 4 pass; no solo re-run",
 "a service worker re-activation during a test is a real isolation hazard and the failure is unclassified",
 "re-run alone; block service workers in the fixture or wait for activation before the test body","S","dev-tools",U,None,"pipeline",[],None),
("PL-03","platform","tests/specs/dev-tools-dom.spec.js","","vacuous","low","med",
 "results-table check is count()>0, two screenshots are not assertions, and the track wait is weak",
 "finishRace panel regressions that keep one row pass",
 "assert row content for the finished race and replace screenshots with DOM assertions","S","dev-tools",U,None,"player",[],None),
("PL-04","platform","tests/specs/ui-audit.spec.js","","vacuous","med","high",
 "78-test screenshot gallery has no assertions and .catch(()=>{}) swallows failures; 7/78 timed out (127-182 s: portrait 15, landscape 09/14/15/21/22, desktop 08 pause menu) and test 16 is misnamed",
 "a broken screen is invisible and the red count is load noise; the spec reads as coverage it does not give",
 "keep as an on-demand harness but stop swallowing errors, rename test 16, and move it out of the gating group","M","ui",U,None,"pipeline",["tautology"],None),
("PL-05","platform","tests/specs/audit.spec.js","53-67","vacuous","med","med",
 "'driving backwards across the line' never asserts the line was crossed; jump(0.01,25,0) starts ~58 m past it, 90 reverse frames cover ~45 m (estimated, not run), and lap0 = 0 makes the lap path return unchanged",
 "cannot fail on the bug it names; the sibling test at :88 is the real guard",
 "assert the crossing happened or delete the test","S","race-control",U,None,"player",[],None),
("PL-06","platform","tests/specs/audit.spec.js","178-192","vacuous","high","high",
 "rear-end test coasts with throttle false and the rival inherits the player's speed (apex.js:870), so maxV <= v0+0.5 holds with no collision; nothing asserts contact",
 "a collision that adds speed (or no collision at all) passes",
 "slow the rival, assert contact (speed drop or collision flag) before the speed bound","S","collisions",U,
 "confirmed@a027eaf4: :178-192 setInput({steer:0,throttle:false}), jump then rivals([{dProg:3,dx:0}]); js/agent/apex.js:870 sets c.speed = G.player.speed when spec.speed is absent; only expect is maxV <= v0+0.5","player",[],None),
("PL-07","platform","tests/specs/audit.spec.js","194-207","wrong-target","med","med",
 "the 'Suzuka ferris + bridge' test never reaches the crossover; it checks barrier clipping on a lap only; audit.spec is also the slowest file (906 s)",
 "the figure-8 crossover that gives the test its name is not exercised, and 906 s buys little",
 "park the car on the bridge span or rename; prune the 906 s file","M","track-geometry",U,None,"player",[],None),
("PL-08","platform","tests/specs/wake-lock.spec.js","74-312","slow","med","high",
 "all 13 cases mock navigator.wakeLock and document.hidden and each has an identical case in the VM twin (wake-lock-vm.test.mjs); ~12 Bahrain builds for no extra evidence",
 "minutes of browser time with no extra coverage",
 "delete the browser copies and keep one live smoke","S","wake-lock",U,None,"pipeline",[],None),
("PL-09","platform","tools/ci/twinned-specs.mjs","25-36","slow","med","high",
 "about 210 browser tests (agent-view 119, dev-tools 54, headless-api 24, obs-act-edge 16) are duplicated test-for-test by VM twins listed here",
 "a large share of the browser-group wall time proves nothing the VM twin does not",
 "delete browser copies; keep the render-dependent dozen in agent-view","M","ci",U,None,"pipeline",[],None),
("PL-10","platform","tests/specs/headless-api.spec.js","31-35","tautology","med","high",
 "'returns false by default' asserts the fixture's own reset (fixtures.js:424), not the product default (game.js:835)",
 "cannot fail for the thing its name states",
 "assert on a virgin page with no fixture reset, or delete after the VM twin covers it","S","agent-api",U,None,"player",["tautology"],None),
("PL-11","platform","tests/specs/obs-act-edge.spec.js","5","hygiene","med","high",
 "imports raw @playwright/test instead of the shared fixtures, so TLX, tyre wear and wind pins and the API stubs (no __TEST_MODE) are skipped",
 "results depend on an unpinned environment and differ from every other spec",
 "import the shared fixtures or delete the browser copy (VM twin exists)","S","agent-api",U,None,"pipeline",[],None),
("PL-12","platform","tests/specs/soak-run.spec.js","20-43","vacuous","med","high",
 "early.s (the obs s read) is never used and nothing proves the car drove; a driver whose control() returns null still passes the recorder-schema asserts",
 "the soak harness can record a parked car and report complete",
 "assert obs().s or recorder distance advanced between samples","S","soak",U,None,"pipeline",[],None),
("PL-13","platform","tests/specs/autopilot.spec.js","232,252-269","wrong-target","med","med",
 "floors 40 / 30 / 2500 are arbitrary, the direct lap time is only logged, and soak-run.js:32-34 copies the controller constants",
 "a 30% pace regression passes and the copy drifts from the real controller",
 "seeded lap-time band; share one controller between soak-run and the test","M","autopilot",U,None,"player",["stub-copy"],None),
("PL-14","platform","tests/specs/new-hooks.spec.js","729-760","vacuous","low","high",
 "the night props test asserts only day>0 and night>0; the real not.toBe(day) assertion is commented out with a documented NOT YET TRUE note (Singapore adds no night geometry)",
 "a known, documented gap rather than hidden: the test only guards the rebuild race and cannot catch a night-prop regression",
 "restore the assertion when night geometry lands, or rename the test to what it checks","S","scenery",U,None,"hygiene",[],None),
("PL-15","platform","tests/specs/new-hooks.spec.js","540-950","hygiene","med","med",
 "410 lines of per-circuit scenery checks live in a hooks file; .every() passes on empty arrays and vertex budgets were widened repeatedly",
 "wrong home and weak asserts duplicate the foundation specs",
 "move to the foundation specs and assert length>0 before every()","M","scenery",U,None,"pipeline",["tautology"],None),
("PL-16","platform","tests/specs/boot-guard.spec.js","","gap","med","med",
 "no test for the lazy-script 404 exemption (data-apex-lazy must not reload), navigator.onLine=false, or the cache sweep deleting only apex26-* caches (index.html:392-431); only one-off and permanent 404 are covered",
 "a flaky lazy fetch wiping caches mid-race, or a sweep that deletes another project's caches on the shared origin, returns with no red",
 "add three routed cases: lazy 404 no reload, offline overlay with caches intact, sweep leaves foreign caches","M","boot",U,
 None,"player",[],None),
("PL-17","platform","tests/specs/ui-resize.spec.js","161-163","gap","high","high",
 "ui-resize, ui-redesign, ui-button-touch and ui-scale pin textSize normal, uiContrast off and the garage scene, but shipped defaults are large text and high contrast (appearance-opts.js:86-87, 473-474); no unpinned pass",
 "the look the player actually sees is untested in four UI specs; a large-text or high-contrast overflow ships green",
 "add one unpinned 844x390 pass per spec","M","ui",U,
 "confirmed@a027eaf4: ui-resize :161-163 and ui-redesign :10-17 and ui-scale :80-86 pin the old look; appearance-opts.js:86-87 and :473-474 default to 'large' and 'high'","player",[],None),
("PL-18","platform","tests/specs/ui-resize.spec.js","","gap","med","high",
 "phone viewports run without hasTouch or isMobile (zero hits in the file), so coarse-pointer CSS is not exercised; ui-scale sets hasTouch (:183) but not isMobile",
 "phone-only regressions are missed although the user plays on a phone",
 "set hasTouch and isMobile on the phone cells","S","ui",U,
 "partly@a027eaf4: ui-resize has no hasTouch/isMobile (confirmed); ui-scale.spec.js:183 already sets hasTouch: true, only isMobile is missing, so the ui-scale half is refuted","player",[],None),
("PL-19","platform","tests/specs/ui-scale.spec.js","921-1178","wrong-target","med","med",
 "11 inspector-tool tests run on setContent fixtures and one stubs window.__apex, so they test the tool, not the game UI",
 "tool tests inflate the UI-scale suite and cannot catch a game regression",
 "move the inspector tests to unit tests","M","ui",U,None,"hygiene",["stub-copy"],None),
("PL-20","platform","tests/specs/ui-redesign.spec.js","71-727","wrong-target","med","med",
 "one 650-line test; the Last Race check builds its own table (:449-463) and activeColor is never asserted (:818)",
 "a Last Race renderer regression passes and one failure hides the rest",
 "split by screen and drive the real renderer","M","ui",U,None,"player",["stub-copy"],None),
("PL-21","platform","tests/specs/ui-button-touch.spec.js","722-743,1367","vacuous","med","high",
 "'chips are compact inline' only checks #rs-go is visible and then screenshots; fixed sleeps and a conditional GAS press (if gas.isVisible) skip the assertion",
 "passes without the layout it names; hidden GAS silently skips the arrange-mode guard",
 "assert chip geometry, replace sleeps with condition waits, require the GAS button","S","touch-ui",U,None,"player",["condition-wrapped"],None),
("PL-22","platform","tests/specs/dev-tools.spec.js","","hygiene","low","med",
 "setPhysics({pace:0.5}) leaks into later tests and the spec is mis-grouped in ui; VM twin exists",
 "order-dependent results in a shared page context",
 "reset physics in teardown or delete the browser copy","S","dev-tools",U,None,"hygiene",[],None),
("PL-23","platform","tests/specs/map-hooks.spec.js","","gap","low","med",
 "mapPts/trackBounds checks are shape only: no north-up check, no real min/max; Monaco build costs ~55 s of the 31 s file",
 "a flipped or mis-scaled map hook passes",
 "assert bounds against the point set and north-up on a known circuit; move to VM","S","agent-api",U,None,"player",[],None),
("PL-24","platform","tests/specs/logging.spec.js","67-76","gap","low","med",
 "no Log.clear() before loadTrack (:67-76) and no test of the 500-record ring overflow, ?log= precedence or buffer: terms",
 "earlier records can satisfy later asserts and ring limits are unguarded",
 "clear first and add overflow and precedence cases","S","logging",U,None,"hygiene",[],None),
("PL-25","platform","tests/specs/output-paths.spec.js","","hygiene","low","med",
 "pure Node helper test sits in the browser specs and has no invalid-APEX_PORT case",
 "runs under the browser runner for nothing; invalid-port handling is untested",
 "regroup into the unit tests and add the invalid-port case","S","tooling",U,None,"hygiene",[],None),
("PL-26","platform","tests/specs/agent-determinism.spec.js","","gap","low","med",
 "carState() compares numbers and booleans only; leaked arrays/objects and cosmetic Math.random staying out of the sim are not compared",
 "a nondeterministic array or object field passes the determinism gate",
 "include arrays/objects in the snapshot and spy on Math.random in the sim path","S","determinism",U,None,"player",[],None),
# ---- race-1 continuation
("RC1-21","race-1","tests/unit/mirror-lights.test.mjs","56, 120-125","wrong-target","med","high",
 "drive() never calls appendCarTailLights (breakpoint on its first body line NOT-HIT on two lines); tailStart/tailCount are hand-assigned and 'restored in finally' is a source regex",
 "a change in how tail lamps are appended or evicted cannot fail the mirror steady-state test whose title includes them",
 "call appendCarTailLights with real cars, or retitle to the static lamp set","S","lighting",R,None,"player",["source-scan","stub-copy"],"RC1-15"),
("RC1-22","race-1","tests/unit/race-flow-fixes-vm.test.mjs","","gap","low","med",
 "Input.clearDriveEdges() (game.js:4437) is hit once across 43 tests, so only the lights-out latch test exercises it; no negative control",
 "the lights-out latch fix is guarded by one scenario that never proves it can fail",
 "add a case with the latch set and the call skipped","S","race-flow",R,None,"player",[],None),
# ---- ui-2 continuation
("U2-22","ui-2","tests/specs/hud-mirror.spec.js","","slow","med","med",
 "TLX render test fails alone at the 300 s test timeout (378 s with close; no assertion error) and GLX needs 255 s of 300 s; the single long test has 65.8 s and 32.4 s evaluates",
 "a local run looks like a regression and a slightly slower runner turns GLX red; classified environment (SwiftShader), not a product defect",
 "split into prepare / render / key-off tests or set a measured per-test timeout; run on CI llvmpipe shards","S","mirror",R,None,"pipeline",[],None),
# ---- tracks-2 continuation
("TK2-20","tracks-2","tests/specs/track-designer.spec.js","92","slow","med","high",
 "test 3 (workspace organization preserves controls and scroll) exceeds 120 s on every run (2.1 min x2); the AUTO look-summary assert at :131 is only where the clock ran out; the multi-viewport test passes 6 s under the cap",
 "a slow runner turns this red with an unrelated-looking assertion; reproducible, so TK2-06's flaky label understates it",
 "test.slow() or split per mode / viewport; keep :131 as the state assertion","S","track-editor",R,None,"pipeline",[],"TK2-06"),
("TK2-21","tracks-2","tests/specs/livery-sidewall.spec.js","64","slow","med","high",
 "test 2 takes ~102 s solo against the 120 s cap and only checks a class removal; passes 2/2 alone (121 s)",
 "flakes under any load and gives little signal",
 "delete test 1 (unit twin), assert real ink on the wheel in test 2 and speed up its click steps","S","garage",R,None,"pipeline",[],"TK2-07"),
]
