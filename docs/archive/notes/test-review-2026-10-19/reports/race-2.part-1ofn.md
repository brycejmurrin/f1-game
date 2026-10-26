<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT race-2 (partial 1/n)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260103113
- Posted: 2026-10-19T05:06:28Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 1/n (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT race-2 (partial 1/n) — 28 unit files complete; 10 specs: 6 read+run, 4 pending (listed under Not run)

Method: units run with `node --test` (all 28 pass, 0 flaky). Debugger column = real CDP breakpoints on the node inspector (the js-debugger MCP lists only Chrome pages, so it cannot attach to node: `debugger_targets http://127.0.0.1:9229` returns `{"targets":[]}` with `--inspect-brk` running; pass-2 tooling gap). My harness is a ws script that sets `Debugger.setBreakpointByUrl` (or a `beforeScriptExecution` instrumentation breakpoint for vm-evaluated source) and evaluates in the paused frame. "hit N" = hits. Where a finding says "mutation", I broke the code in a scratch copy under artifacts/ and re-ran the test; nothing in the repo was edited. Review of the unit files was split across two read-only subagents, and I re-checked their top claims.

## Per-file table
| file | purpose | run | debugger (code under test) | quality | mock / wrong-target | verdict |
|---|---|---|---|---|---|---|
| unit/race-radio | engineer/TV radio lines, no stale/dup lines | pass 2.0s | hit: race-radio.js:268 (40+), :465 (40+), :687 (27) | strong (~75 exact asserts) | queue copy L1301-1346; regex scans L376-379, L809-812 | strengthen |
| unit/race-session-fixes | sprint vs GP quali field, deleted-lap time, S1+S2+S3 | pass 0.3s | hit: drawRound (vm slice, 4); NOT hit: game.js:6218 (regex scan) | weak/mixed | game.js regex pins; L53-56 recomputes the formula; stub `stage()` differs from real | rewrite |
| unit/race-session-lazy | menus survive lazy session stub; RACE! loader retry | pass 5.2s | hit: lazy-bundles.js:48 (2), session-stub zoneOf (3); test 3 never calls RaceSettings | mixed (4-6 strong, 3 near-vacuous) | final test is a game.js regex | keep 4-6, delete 3 |
| unit/race-settings-pitplan-key | pit pin / stint plan keyed per circuit after QUIT | pass 12.8s | hit: race-settings.js:340 (10), :414 (2) | strong | stale comment L38 | keep |
| unit/race-settings-vm | LAPS ladder, last-setup memory, grid rule, red-flag regrid | pass 50.6s | hit: race-settings.js:340 (4), :623 (22), game.js:1603 (14) | mostly strong | L553-568 condition-wrapped; L445-446 compares a getter with itself | keep + fix |
| unit/race-setup-sheets | CUSTOM chip, weekend header, setup-sheet CSS | pass 0.3s | hit: applyPreset race-settings.js:591 (3), openRaceSettings :623 (9) | mixed | `SettingRow` stubbed; 7 CSS pins; L301 regex | regroup |
| unit/race-step-snap | AI neighbour snapshot order-invariance | pass 25.3s | hit: game.js:4503 (8), :5316 (8); 3 scan tests n.a. (text) | mixed (2 VM tests strong) | 3 source-text scans | keep VM, delete scans |
| unit/rain-cells-vm | grip read at car `s` under local shower | pass 4.0s | hit: game.js:639 gripMult (40+) | mostly strong | cell injected directly | keep |
| unit/rain-cells | segment wetness maths, determinism | pass 0.5s | hit: rain-cells.js:88, :121 (40+) | strong | TAU consts copied; L190 regex | keep |
| unit/real-race-script | OpenF1 fixture to script, trace caches, hub | pass 2.3s | hit: real-race-tab.js:155 (20), :522 (40+) | strong | string-patched eval L585; hub tests in a "script" file | regroup |
| unit/real-race-tab-gap-refresh | explicit refresh replaces stale gap | pass 0.2s | hit: real-race-tab.js:522 (5), :548 (4) | strong | synthetic location rows | keep |
| unit/real-race | JUMP IN / WATCH director | pass 4.2s | hit: real-race.js:452 (4), :907 (17) | strong | L397 always true; L393 escape clause; L728 scan | keep + fix |
| unit/red-flag-fuel-vm | red-flag replay burns fuel | pass 6.6s | hit: game.js:1677 (fuelLap=2), :1678 | strong | none | keep |
| unit/red-flag-pit-vm | stop in flight cleared on red flag | pass 18.2s | hit: game.js:4785 (40+) | strong | tests 1-3 order-coupled | keep |
| unit/red-flag-vm | standing restart laps/grid | pass 24.5s | hit: game.js:1673 (40+) | strong | `lapWant` oracle copy; order-coupled | keep |
| unit/reliability | DNF plan: seed purity, tier bands | pass 0.2s | hit: reliability.js:66, :91 (9 each) | strong stats | stub FNV hash, `CATALOG:[]`, `paceMult` fixed | strengthen |
| unit/start-lights | gantry lamps, brightness at 30/60/144 Hz, countCredit | pass 0.4s | hit (instrumentation, 13 vm instances): countCredit :48 (45+), lampsFor :84 (260+), update :124 (196+) | strong / 2 regex pins | `countdownWall` copies tickBody accounting | strengthen |
| unit/start-race-latch | startRace re-entrancy | pass 6.8s | hit: game.js:2694 (8) | strong | stale comments (wrapper gone) | keep |
| unit/storm-weather | Storm ladder, lightning, SC | pass 1.6s | hit: storm.js:60 (40+), weather-arc.js:144 (3) | strong / 3 regex pins | `room.G.netRoom` dead | strengthen |
| unit/telemetry-trace | stray GPS fixes, gaps, dot position | pass 0.5s | hit: telemetry-model.js:168 (18), :150 (40+) | strong | microtask-count wait L379 | keep |
| unit/terrain-falloff | opt-in falloff leaves shelf/rails identical | pass 1.1s | hit: surface.js:40 (12) | strong | none | keep |
| unit/terrain-normals | ribbon/bank normals | pass 6.5s | hit: mesh.js:529 bankAngle, :556 banking (40+) | strong except the hot-path test | L169-181 spy cannot see bankAngle (mutation confirmed) | strengthen |
| unit/terrain-y | `Tracks.terrainY` gaps/edges | pass 0.6s | hit: tracks.js:755 (60+) | strong except crack case | L36-42 crack probes inside quads (mutation confirmed) | strengthen |
| unit/track-build-grids | perf shortcuts equal slow path | pass 0.3s | hit: mesh.js:634 queryRects (40+) | strong (fuzz) | roundNormals only "changed" | keep |
| unit/ui-journey-race | race-layer CSS contract | pass 0.2s | **n.a.**: pure CSS text scan, no code under test | weak | parser not @media-nesting aware | regroup |
| unit/weather-arc-plan | MIXED plan pure/cached/seeded | pass 0.3s | hit: weather-arc.js:144 (40+), :162 (24) | strong | cap formula copied L79-81 | keep |
| unit/weather-arc-rain | rain overlay follows wetness | pass 8.3s | hit: tick :420 (40+); **NOT hit: wetnessAt :328** | strong behavioural / 2 self-checks | G predicates copied from game.js | keep + fix |
| unit/weather-blend | atmosphere cross-fade | pass 7.9s | hit: atmosphere.js:105, :123 (40+) | strong / L378 condition-wrapped | default boot uses track "t" (no shipped preset) | keep + fix |
| specs/pit-signs | bay decal drawn / hidden by meshToggle | pass 100.9s (real browser) | pending (browser step) | strong | none; LOW preset | keep |
| specs/bahrain-foundation | props clear of road, relief, required models | pass 32s (real browser) | pending | strong, but see F13 | giant single test | strengthen |
| specs/quali | quali screen, grid = quali order, lap | pass 20/20, 737s (real browser) | pending | mixed | see F11 | strengthen |
| specs/real-race | JUMP IN / WATCH wiring | pass 5/5, 102s (real browser) | pending | strong | hand-cut 4-driver script | keep |
| specs/jump-start | false-start penalty | pass 3/3 but as a **VM twin** (no browser); browser re-run pending | pending | mixed | see F14 | keep |
| specs/pit-lane | limiter, stop, box time, AI lane, crew draw | pass 7/7 as **VM twin**; browser re-run pending | pending | strong, except blow-through test (asserts only stops===0) | | keep |
| specs/race-control | caution layer boots, setting survives reload | pass 3/3 as **VM twin**; browser re-run pending | pending | test 2 strong, test 3 weak | | keep; strengthen 3 |
| specs/debris | Rapier side-world | **fail 1/5 (real browser)**: Singapore wall-hit test, `waitForFunction` 60 s timeout; 4 pass. Alone re-run pending | pending | strong | | keep |
| specs/terrain-over-road | no terrain over racing line, 56 tests | running | pending | | | |
| specs/perf-race-entry | race vs practice entry stages | not yet run | pending | weak (diagnostic) | | see F15 |

## Top findings (ranked)
1. **terrain-normals.test.mjs:169-181 | vacuous guard | high (mutation)** — spies on `Tracks.banking`, but `bankAngle` calls TrackMesh's own closure `banking` (mesh.js:529). I rewrote `bankAngle` to call `banking()` on every call (the exact regression the test names) and the test still passed 10/10. Fix: count calls inside TrackMesh, or time-bound 1e5 `bankAngle` calls.
2. **terrain-y.test.mjs:36-42 | crack tolerance untested | high (mutation)** — probes at x=100.004/99.996 sit inside the two quads, so `TRI_EPS` never decides them. With `TRI_EPS = 0` (tracks.js:643) all 6 tests still pass. Fix: two quads separated by 0.005 m must be covered, 0.05 m must be null.
3. **race-session-fixes.test.mjs:21-56 | tests text, not behaviour | high** — game.js:6218 breakpoint is not hit at all; L53-56 recomputes the s3Past formula inside the test; the `stage()` stub differs from season-cal.js:403. Fix: drive a game-vm lap and assert S1+S2+S3 equals lap time to 1e-9, use the real `stage()`.
4. **race-radio.test.mjs:1301-1346 | copied queue | high** — re-implements the announce queue (priority table, QMAX=2, splice order) and lacks "penalty-warn"/"penalty-hit"; a real change to ANN_PRI/ANN_QUEUE_MAX (announce-banner.js:7,25,136) cannot fail it. Fix: load announce-banner.js as L1178-1222 already does. Also L809-812 and L376-379 are source regexes.
5. **real-race.test.mjs:397 | `assert.ok(lapsDown.length >= 0)` always true; L393 has an `|| a.frac === 0.98` escape** | high — the lapped-car claim is never checked.
6. **reliability.test.mjs:29-40 | stub hash hides the production path | high** — local FNV instead of `Hash32.unit` (career.js:85), `paceMult` fixed 1, `CATALOG:[]`. `devNorm`, `buildQuality`, DEV/BUILD_RELIEF, `networked` never run (`grep buildQuality tests/` finds only source). These drive career DNF odds.
7. **weather-arc-rain.test.mjs:134-135, 169 | self-referential | high** — L135 asserts the test's own arithmetic (417); L169 matches a comment string. Also `wetnessAt` (weather-arc.js:328) is never reached by this file.
8. **storm-weather.test.mjs:113-114 | dead assertion | high** — `room.G.netRoom = true` is read nowhere in weather-arc.js, so the "friend room may name storm" check equals the solo one.
9. **start-lights.test.mjs:206-231, 243-250 | model, not game | med** — `countdownWall` copies tickBody's step accounting (5-step cap, 1/4 clamp, `5+1.0`) and then calls the real `countCredit`; the real tickBody is only text-matched. The #1882 "keeps wall-clock time" claim is proved on a copy.
10. **race-session-lazy.test.mjs:47-58 | exercises nothing | high** — "paintPlan does not throw on the stub" never calls RaceSettings (`zoneOf()` is null). Delete; pitplan-key covers the real path. Final test is a game.js regex.
11. **quali.spec.js:~215 (flying lap), ~163, ~135 | weak proxies | med** — AI-held wheel is inferred from `c0.stuckT !== null` (an implementation detail); `r2 !== r1` and `pos !== 12` pass for unrelated reasons (P12 is a legal result). "faster car and better driver" pins 3 roster pairs and cannot separate car from driver.
12. **race-settings-vm.test.mjs:553-568; weather-blend.test.mjs:378-379 | condition-wrapped asserts | med** — `if (zoneOf())` / `if (stampDry.moonBright !== stampWet.moonBright)` skip the assertion silently. Assert the precondition.
13. **bahrain-foundation.spec.js (overlap loop) | blind window | med** — only `0.2 < overlap < 5` counts, and triangles with min y > 35 are skipped: a prop poking more than 5 m through the road passes. One 200-line test also covers the night rebuild.
14. **jump-start.spec.js | gaps + fragile pin | med** — no case for a manual launch inside the 0.2 s reaction window (sporting-regs.js:229-231); `crossedReactionGate === (name === "fast")` couples to tuning. Default `npm test` runs jump-start, pit-lane and race-control as VM twins (`COVERED BY VM TWIN`, needs `APEX_WITH_TWINNED=1` for the browser): a green "spec" run locally is a node run.
15. **perf-race-entry.spec.js | diagnostic posing as a test | med** — assertions are `marks.length > 8` and any-of mark names; the wall-time cap only fails with `APEX_PERF_RACE_ENTRY_STRICT=1`. 1.2 Ms timeout. It cannot catch a regression by default. Keep as a tool, move out of the gate, or make STRICT the default.

## Gaps
- Debugger MCP cannot attach to node (pass-2 tooling fix); used a CDP script instead.
- reliability: `buildQuality`, `devNorm`/DEV_RELIEF, tier clamp, networked branch. start-lights: `countdownCamera`, `lampsFor` with `side != 0`. race-session: nothing runs `request.outcome` → `CustomTracks.afterStart` (game.js:2716-2719). telemetry-render: `chartX`/`chanNorm`/`sampleAt`. storm: the `from === "storm"` guard at weather-arc.js:147 and the 0.25 boundary. terrain-y: terrain-grid memo (`_terrGrid`) and brute-force fallback.
- No test makes sprint and GP quali fields differ through the real quali model.

## Not run (yet)
- specs/terrain-over-road (56 tests, running), specs/perf-race-entry (queued), browser re-runs of jump-start, pit-lane, race-control, and an alone re-run of debris (queued).
- Spec debugger checks (debug-chrome plus the MCP) wait for the spec run to finish; part 2/n will carry them.

---
_Generated by [Claude Code](https://claude.ai/code)_
