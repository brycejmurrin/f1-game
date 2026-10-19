# Test suite review 2026-10-19 — synthesis

Generated from `findings.jsonl`, `reports/` and the status table below; issue #2952. Pass 1 is findings only: nothing here is fixed. `PLANS.md` holds the pass-2 lanes.

## Status

- Reports in: **3/22** batches (2 final, 1 partial). Updated 2026-10-19 ~05:25Z (22:25 Pacific, 10-18).
- Findings: 60 rows, 59 after de-duplication; 50 reviewer-verified, 10 subagent-unverified; 10 re-checked by the synthesis on the tree.
- Not yet in: audio-1, physics-1, physics-2, race-1, race-2, tracks-1, tracks-2, car-1, car-2, modes-1, ui-1, ui-2, tooling-1, tooling-2, tooling-3, tooling-4, tooling-5, net, platform.

| batch | state | report |
|---|---|---|
| audio-1 | pending | — |
| physics-1 | pending | — |
| physics-2 | pending | — |
| race-1 | pending | — |
| race-2 | pending | — |
| render-1 | final | [render-1](reports/render-1.md) |
| render-2 | final | [render-2](reports/render-2.md) |
| render-3 | partial 1/2 | [part 1/2](reports/render-3.part-1of2.md) |
| tracks-1 | pending | — |
| tracks-2 | pending | — |
| car-1 | pending | — |
| car-2 | pending | — |
| modes-1 | pending | — |
| ui-1 | pending | — |
| ui-2 | pending | — |
| tooling-1 | pending | — |
| tooling-2 | pending | — |
| tooling-3 | pending | — |
| tooling-4 | pending | — |
| tooling-5 | pending | — |
| net | pending | — |
| platform | pending | — |

## Top 25 by player or pipeline impact

Score = 2×severity + confidence + impact class (player 2, pipeline 1, hygiene 0), −1 if unverified and not re-checked, +0.5 if re-checked on the tree. Ties break by id.

| # | id | cite | kind | sev | defect → impact | fix | lane | verified |
|---|---|---|---|---|---|---|---|---|
| 1 | R1-01 | `tests/unit/camera-tuner-a11y.test.mjs:15-20` | source-scan | high | regex-pins tuner-panel.js lines and passes while THIS TRACK / THIS CAR scope buttons never get .on/aria-pressed (tuner-panel.js:375-388 syncs only sm.mode and sm.global) → **screen-reader users cannot tell the active camera-tuner scope; a real shipped a11y bug hidden by a text test** | drive the panel under mini-dom, click all 4 scope buttons, assert exactly one pressed (fails today); fix tuner-panel in the same PR | L1 | reviewer |
| 2 | R1-03 | `tests/unit/cam-avoid.test.mjs:57-69` | vacuous | high | street-circuit step-in test: insideProp stub always returns null and the last assert is `insides >= 0` → **the street-circuit camera step-in path has no real test** | use a blocking insideProp stub and assert x unchanged plus insides > 0 | L1 | reviewer · synth: confirmed@cd907d4c |
| 3 | R2-01 | `tests/unit/perf-try.test.mjs:337` | dead-assert | high | assert.match(read('js/ui/scale.js'), /if \(uiEl\) uiEl\.oninput/) sits after a // comment on the same line, so it never runs → **a UI-scale slider regression ships green while the test claims to guard it** | put it on its own line; fix or drop the pin if it then fails; add a lint for asserts after // on a line | L5 | reviewer · synth: confirmed@e90ae858 |
| 4 | R2-05 | `tests/unit/render-rate.test.mjs:99-105 (reported 252-258)` | wrong-target | high | title promises 'returning from it flushes the carry' but asserts only that presenting draws every tick → **dropped carried dt on XR exit (lost sim time, camera lag) passes** | follow the presenting run with non-presenting frames and assert drawnDt pays the carry | L5 | reviewer · synth: confirmed@cd907d4c |
| 5 | R2-07 | `tests/unit/lamp-fixture-anchor.test.mjs:330,98 (reported 302-303,94-95)` | vacuous | high | anti-vacuity check wrapped in if (gantry.length + gate.length >= 52); buriedLamps returns 0 when propsGeo.pos/idx is missing → **a scoped APEX_CIRCUITS run or changed circuit count turns the host guard off; a geometry shape change makes 'start lamps buried' permanently green** | compare against Tracks.LIST.length when unscoped; throw on missing geometry | L4 | reviewer · synth: confirmed@cd907d4c |
| 6 | R3-02 | `tests/specs/assets-api.spec.js:153` | vacuous | high | window.__apexGlErrors is defined nowhere (only this line), so the 'no GL errors' check is always 0 → **a pack load that raises GL errors passes** | use GLX.gpuErrors() (glx.js:2921) plus frameContent | L10 | reviewer · synth: confirmed@cd907d4c |
| 7 | R3-12 | `tests/specs/camera-tuner.spec.js:219` | wrong-target | high | 'a tuned camera never touches the other twelve' checks 4 modes (hood, cockpit, heli, tcam) of ~20 → **15 camera modes unchecked for tuner leaks** | loop all modes except chase | L1 | reviewer · synth: confirmed@cd907d4c |
| 8 | R1-05 | `tests/unit/cam-motion.test.mjs:6-10` | wrong-target | high | title promises 'a turn' but the track stub has curvature 0 and CamTune returns 0; one ok() aggregates ~15 checks → **bend-hang and corner lead are never exercised in the rig solve** | add a curved-track variant (or rename); split the must() checks into separate asserts | L1 | reviewer |
| 9 | R2-04 | `tests/unit/light-presets.test.mjs:212-231` | over-mock | high | 'resolves identically on every track' re-implements pin -> shared -> '*' instead of running profiles.js:113-158; ~90 frozen art literals → **a LightStore resolver bug cannot fail it; every art retune needs a double edit** | run the real LightStore per track/tod/wx (light-store-copy harness) and compare LT[id]; keep only structural invariants | L4 | reviewer |
| 10 | R2-06 | `tests/unit/results-cam.test.mjs:26,56-81,135-144` | over-mock | high | PerfGov stub tier()=0 leaves results-cam.js:19 tier>=2 gate untested; 'finite projection matrices' never checks eye/target; audio breakpoint engine.js:2089 hit 0 times → **a broken PerfGov gate or NaN results-camera pose ships** | stub tier 2 and assert onFlag()===false; assert eye/target finite; re-aim the audio check at feedReplayScrub | L1 | reviewer |
| 11 | R2-08 | `tests/unit/hunt-tlx-create-undo.test.mjs:21-41` | source-scan | high | pure source scan (CDP: 0 hits); test 3 asserts removes.length >= 4, not pairing; tests 1-2 use {0,400} windows → **a new unremoved listener in TLX.create (the original defect) passes** | lift the create try/catch with fake document/window counting add/remove by event name and force a throw | L3 | reviewer |
| 12 | R2-09 | `tests/unit/light-store-cond-layer.test.mjs:30-36,56-63,90-100` | vacuous | high | preset param and GfxQuality.current stub are dead (profiles.js reads neither), so 'EVERY preset gets the layer' cannot fail; header stale → **false coverage of the quality-preset flip path** | test the real GfxQuality.set -> LightStore.reapply, or drop the loop; fix the header | L4 | reviewer |
| 13 | R3-05 | `tests/unit/tlx-car-shadow-cpu.test.mjs:12-23` | source-scan | high | 5 string-presence asserts, one matching a comment; tlx.js:3725 never executes (debugger not-hit) → **the default backend's car-shadow sweep can be dead code and stay green** | lift sweepCarShadowMirrors, drive aging; run sharedInstCap with mobile true/false | L3 | reviewer |
| 14 | R3-06 | `tests/unit/tlx-post-fixed-mats.test.mjs` | source-scan | high | tests 1-2 are regex-only for 'no .tex.value swap'; tlx-post.js:246 not-hit → **does not prove the per-frame swap stopped** | compile the post chain on fake GL (tlx-hunt3 postChain pattern) and count writes | L3 | reviewer |
| 15 | R3-08 | `tests/unit/wall-clamp.test.mjs:77-258` | gap | high | no test of nose-in heading align (wall-clamp.js:121-123), first-strike speed loss (:113), steer-into-wall scrub/wallT (:178-184), the left wall (every human test uses +x), wallHits, WallEndFace (:45), DebrisWorld hooks (:50-65, stubs never asserted); :322-327 regexes game.js → **the player's wall-contact feel is unpinned** | both-wall cases asserting c.head, c.speed, wallT and stub call counts; move the game.js regex to a lint | L10 | reviewer |
| 16 | R3-10 | `tests/unit/xr-opts.test.mjs:317,320-325` | vacuous | high | `includes('XRGPUBinding') \|\| includes('xrgpu') \|\| from === 'webgpu'` passes for any webgpu fallback; :320-325 vacuous; same in xr-plan.test.mjs:153-156 → **a wrong XR fallback reason passes** | assert the exact reason string (xr-plan.js:105); delete the vacuous blocks | L6 | reviewer |
| 17 | R3-11 | `tests/unit/ui-fit-camtune-tap-r5.test.mjs` | source-scan | high | five ui-fit-* tuner CSS files use raw regex with [^}]* across rules and slices anchored on comments; lighting-flyby-stack:47-57 duplicates flyby-tap-r6 → **brittle to comment edits, can match the wrong rule, measures no layout** | port to helpers/css-rules.mjs and merge the 5 files into one | L8 | reviewer |
| 18 | R1-04 | `tests/unit/frame-hotpath-alloc.test.mjs:105-110` | vacuous | high | GC microbench returns early when globalThis.gc is absent and nothing passes --expose-gc (0 hits in package.json and tests/groups.json); it also measures a local loop, not cullInstances → **a silent pass in every run that proves nothing about per-frame allocation** | delete it, or call the real poolModelMat/cullInstances with an allocation spy | L5 | reviewer · synth: confirmed@cd907d4c |
| 19 | R3-01 | `tests/specs/agent-determinism-frame.spec.js:44-49` | vacuous | high | second run(42) calls A.reset(..., seed) and re-seeds, erasing any stream advance during the 20 rAF frames; also timed out at 120 s on SwiftShader → **the determinism contract agents and replays rely on has no working guard** | compare stream position before/after rendered frames, or reset without reseeding | L10 | reviewer · synth: confirmed@cd907d4c |
| 20 | R3-03 | `tests/specs/perf-frametime.spec.js:149-218` | vacuous | high | only hard asserts are snap and frames>4; APEX_PERF_FRAMETIME_STRICT is set by no workflow, tool or group (docs/TESTING.md says soft by design) → **a lane named 'regression' can never fail, yet costs a browser slot** | either enable STRICT with a same-run control, or relabel as telemetry and drop it from gating groups | L5 | reviewer · synth: confirmed@cd907d4c |
| 21 | DBG-01 | `(js-debugger MCP)` | tooling | high | debugger_targets lists Chrome page targets only: a node --inspect-brk target returns [] and attach fails 'Unknown page targetId' (issue #2957; 6 reviewers measured it) → **the review rubric's debugger column cannot use the MCP for any of the 854 unit tests; each reviewer hand-rolls a CDP client** | accept type:'node' targets, skip Page/DOM calls for them, add a unit test, document in the js-debugger skill (#2957) | L0 | reviewer |
| 22 | DBG-02 | `tests/helpers/ (vm loaders)` | tooling | high | modules loaded with vm.runInContext / eval(SRC+';X') carry no filename (evalmachine.<anonymous>): governor.js, lamp-bake, chunked.js, lighting/*, spans.js, renderer-boot.js; breakpoint-by-URL cannot reach them and coverage has no line attribution → **most of the unit suite is not debuggable at line level; render-2 and render-3 fell back to coverage or line-text matching** | a filename: option (the repo path) in every test-helper loader; a lint that forbids vm.run* without filename | L0 | reviewer |
| 23 | R1-02 | `tests/unit/apex-memory.test.mjs:15-34` | wrong-target | high | tmpdir .claude/memory fixture is built and never used (tool hardcodes ROOT, apex-memory.mjs:19); `show` reads the live user-timezone-pacific.md; `retire` success path untested → **goes red when a real memory is retired; the one mutating command is unverified** | add an APEX_MEMORY_ROOT override and run list/show/retire on the fixture | L9 | reviewer |
| 24 | R2-02 | `tests/unit/gfx-backend-canary.test.mjs:251,578,637,3379,3639,3647,3790,3828,4015,4774,4897,4941` | source-scan | high | ~20 fixed-size slice(x, x+N) windows feed doesNotMatch; the file's own span() comment (:52-83) records this pattern disarming a guard before → **a doesNotMatch over a window goes green once the guarded function grows or moves (envFaceEnd, claim-fail, WGX shadow latch)** | use fnBody/span everywhere; add a lint forbidding \.slice\(\w+, *\w+ *\+ *\d+\) in tests | L2 | reviewer |
| 25 | R2-03 | `tests/unit/gfx-backend-canary.test.mjs:43,3200-3482` | wrong-target | high | 252-test catch-all, ~160 source pins and a 65-assert mega-test; read('js/game.js') (:43) returns 4 files concatenated; 'same as GLX' parity is identifier presence → **a failure does not say which behaviour broke; a shader with the right identifier and wrong maths passes** | split into GLX-mock behaviour / picker / boot ledger / census / vendor patches / labelled static pins; make read() name the file it reads | L2 | reviewer |

**Hidden product bugs** (a test passes over a real defect): R1-01 tuner-panel.js scope buttons never set aria-pressed (shipped a11y bug).


## Recurring patterns

Counted over de-duplicated rows; a row can carry several patterns. Counts grow as batches arrive.

| pattern | rows | what it looks like | examples |
|---|---|---|---|
| Source-text scans standing in for behaviour | 17 | regex / indexOf / slice over js, css or md source; nothing under test executes (debugger n.a. or not-hit) | R1-01, R1-06, R1-07, R1-08, R1-09, R2-02, R2-03, R2-08, R2-11, R2-12, R2-13, R3-04, R3-05, R3-06, R3-08, R3-11, R3-16 |
| Condition-wrapped or early-return asserts | 6 | `if (x) assert…`, `if (!gc) return`; the guard turns the test off in the very case it should catch | R1-04, R1-10, R1-12, R2-07, R2-14, R3-07 |
| Tautologies | 9 | asserts a stub's own return, a constant against its copy, `>= 0`, or a disjunction any outcome satisfies | R1-03, R1-12, R1-13, R1-14, R2-10, R2-16, R3-07, R3-10, R3-14 |
| Stub copies of real modules | 12 | a hand copy of the code or data under test (resolver, damper, shader maths, field list, track stub) that cannot drift with it | R1-03, R1-05, R1-12, R1-14, R1-15, R1-18, R2-04, R2-06, R2-09, R2-15, R3-09, R3-15 |
| vm code without a filename | 1 | vm.runInContext / eval with no filename: no breakpoint by URL, coverage without lines | DBG-02 |
| Slow files in fast groups | 1 | a file over ~20 s in toolingFast, the pre-push floor | R1-10 |

- **Source-text scans** dominate the three render reports: gfx-backend-canary alone has ~160 (884 `assert.match`), webgpu-lifecycle ~306 asserts. The cheapest structural fix is a lint over `tests/` for fixed-width `slice(x, x+N)` windows and asserts after `//` on one line (R2-01, R2-02), then one lane per subsystem converting the highest-risk scans to behaviour.
- **vm code without a filename** is counted once (DBG-02) but touches every vm-loaded module in these batches: governor.js, lamp-bake, chunked.js, lighting/*, spans.js, renderer-boot.js, and every `evalmachine.<anonymous>` render-1 met.
- **Slow in fast:** `flyby-shots` (138 s) is a `toolingFast` member, `perf-try` 25 s and `lamp-bake` 14 s too (checked in `tests/groups.json` on cd907d4c). `lamp-fixture-anchor` (109 s) is already in `test:sweeps`, `flyby-fleet` (53 s) in `test:node-slow`, `cam-avoid-vm` (31 s) in the game-vm groups.

## Gaps by subsystem

- **camera**: R1-16 cam-comfort.js fxSet clamp/round never runs (coverage NOT-HIT); CamTune override tests misplaced in this file
- **lighting**: R2-20 LightStore.set() clamp and rebuild/reinitRain/liveEffects branches, tuned(), reset() never run by a test that calls set()
- **physics**: R3-08 no test of nose-in heading align (wall-clamp.js:121-123), first-strike speed loss (:113), steer-into-wall scrub/wallT (:178-184), the left wall (every human test uses +x), wallHits, WallEndFace (:45), DebrisWorld hooks (:50-65, stubs never asserted); :322-327 regexes game.js
- **render**: R2-19 wanted() (DevFlags vs ?gfxdebug vs localStorage), install(), copy button and the max===0 branch never executed
- **render-tlx**: R3-17 TLX is the default backend but __apex.texCensus() on TLX is supported:false and pinned by nothing (tex-census covers GLX only)
- **tooling**: R1-17 analyseLayout, analysePassKinds, analyseWork, analysePasses, raceEntryWindow referenced by no test (subagent grep)
- **ui**: R2-21 Dom.fmtLap / fmtRaceClock, radio-lines timeText and announcer.js:450 round-first logic untested; nothing stops a new copy-pasted formatter
- **xr**: R3-18 untested: XrRig.worldFromAnchorTo, XrUi.onClick/flashMessage, setFoveation, present(); xr-boot storage-throws (:79-81); xr-session _visible vs xr-boot !== 'visible' mismatch; strikeLatch/claimFail documented, not implemented

Reviewer gap lists not carried as rows (low impact or unverified): render-1 lamp caps `MAST_LAMP_CAP`/`PIT_LAMP_CAP`/`CUSTOM_LAMP_MAX` and `selectCustomLamps` ties, `frame-math.mjs` `cullBoxes`/`marchGround`/flag thresholds, `elev-presets.js` loop closure; render-2 GLX partial-failure paths (`createTextureArray`/`createMesh`/`createChunkedMesh`), occlusion with mixed chunks, multi-draw UNSIGNED_INT, governor `cleanRace`, `PerfSpans.loaf()`, `renderer-picker.js` with no test file of its own; render-3 TLX WebGPU path and picker-driven backend switch, lit/sky WGSL compile.

## Debugger findings

- **#2957 (open, claimed):** the js-debugger MCP filters to Chrome page targets, so `debugger_targets` returns `[]` for `node --inspect-brk` and attach fails "Unknown page targetId". Measured by tracks-1, render-2, race-2, render-3 and car-2 (render-1 too). Fix proposed in the issue: accept `type: "node"` targets, skip Page/DOM calls, a unit test that attaches to a child and reads a local, and the Node path in the js-debugger skill. Row DBG-01, lane L0.
- **Reviewer workarounds** (three different ones in three batches, which is itself the finding): render-1 used `NODE_V8_COVERAGE` function counts only; render-2 a hand CDP client with `setBreakpointByUrl` and a logging condition; render-3 `setInstrumentationBreakpoint beforeScriptExecution` plus breakpoints matched by source-line text, which reaches vm scripts without a filename (`artifacts/test-review/render-3/cdpbp2.mjs`, uncommitted). L0 should take render-3's method as the reference.
- **vm without filename (DBG-02):** the root cause of most `hit (coverage)` rows. A `filename:` on the test-helper loaders is the prerequisite for line breakpoints in pass 2.
- **Node 22 flag (DBG-03):** `--experimental-test-isolation=none`, not `--test-isolation=none`.
- **DEBUGGER-A** (`JS-DEBUGGER-IMPROVEMENTS-2026-10-19.md` in docs/notes on its own PR) and **DEBUGGER-B** (`NODE-DEBUGGING-2026-10-19.md` in docs/notes on its own PR, plus sub-issues of #2952): no PR open yet at this update; folded in when they land. Sub-issues of #2952 today: #2957 only.

## Verification

Synthesis spot checks (`git show origin/claude/f1-game-project-26h3ng:<file>`, tip cd907d4c unless noted):
- Confirmed: R1-03 `insides >= 0`; R1-04 no `--expose-gc` in package.json or groups.json; R2-01 assert after `//` on perf-try:337 (e90ae858); R2-05 render-rate test asserts only `drawn === ticks`; R2-07 the `>= 52` wrapper and `return 0`; R3-01 `run(seed)` calls `A.reset(…, seed)`; R3-02 `__apexGlErrors` only on assets-api.spec:153; R3-03 `APEX_PERF_FRAMETIME_STRICT` set nowhere; R3-12 four modes in the loop; R1-10 flyby-shots in toolingFast.
- Partly: R1-09 the `MAT_LAYERS = 17` / `[17]` literal is in 2 test files, not 5. R1-11 both limits exist (45 deg/s in `tests/helpers/flyby-audit-rules.mjs:19`, PAN_MAX 25 deg), but whether they measure the same thing is unproven, so it is ranked low.
- Line drift: reported lines for render-rate (252 → 99) and lamp-fixture-anchor (302 → 330) differ on the tip; rows carry both. Reviewers worked on the 2026-10-19 tip; a pass-2 lane re-locates by the quoted code, not the line.
- Not checked by the synthesis: rows marked `subagent-unverified` without a `synth_check` (R1-12…R1-15, R1-17, R3-07, R3-09, R3-14). They rank one point lower until a lane re-reads them.

## Rows by subsystem

camera 9, lighting 8, tooling 6, render 6, render-tlx 5, render-perf 4, flyby 3, xr 3, debugger 3, ui-css 2, assets 2, ui 2, camera-ui 1, track-editor 1, agent-api 1, render-wgx 1, physics 1, input 1
