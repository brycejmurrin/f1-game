<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT race-2 (final (continuation race-2b: the 6 not-run specs of parts 1 and 2))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261855739
- Posted: 2026-10-19T07:17:51Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final (continuation race-2b: the 6 not-run specs of parts 1 and 2)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT race-2b — the 6 Not-run specs from race-2 (partials 1 and 2). Findings only, no repo edits.

Runs used `node tools/ci/run-playwright.mjs` (the underlying runner of `test-bg`; it takes spec paths where `test-bg` takes groups), one at a time, with `APEX_WITH_TWINNED=1` so the VM-twinned specs ran in a real Chromium. The box has no `/dev/dri`, so this is SwiftShader. Logs are in `artifacts/test-review/race-2b/`. Debugger work used `debug-chrome` and the js-debugger MCP with non-pausing logpoints on page `127.0.0.1:3456`, after the test runs finished.

| file | run (real browser) | debugger (code under test) | verdict |
|---|---|---|---|
| specs/debris | **pass 5/5, alone, 71 s**. race-2's Singapore wall-hit fail was **env** (it overlapped other CPU load). | hit: debris-world.js:834 `step` (2037 hits after `debris(true)` and a burst) | keep |
| specs/jump-start | **pass 3/3 in a browser**, 170 s | hit: sporting-regs.js:222 `jumpStartEarlyThrottle` (throttle 1, auto off) and :229 `jumpStartFastLaunch` (214 hits) | keep + fix (F2) |
| specs/pit-lane | **fail 1/7, reproduced alone at loadavg 2.3** (both runs). The other 6 pass: limiter, stop, box, blow-through, wear-off, AI lane. | hit: pit-lane.js:1190 `update` (2486). **Not hit by my probe:** :1414 `serviceCar` (my hand-rolled driver never latched into the box). The spec's own log shows the service path ran: `Pit tyres fitted … Pit stop done held=2.2s`. | fix test (F1) |
| specs/race-control | **pass 3/3 in a browser**, 32 s | hit: race-control.js:343 `update` (1659 hits). `__apex.caution({hazards:true})` returns `level`, `label`, `sector`, `frac`, `total`, `sectors`. | keep; test 3 still weak (race-2 F-list) |
| specs/perf-race-entry | **pass 1/1**, 212 s | not hit directly. The stage table proves `raceEntryStages` and `raceEntryProfile` ran (apex.js:934): race wall 98.9 s, practice 84.2 s. | demote or strict (F3) |
| specs/terrain-over-road | **pass 56/56**, 64 min, 0 failed, 0 retried | hit: apex-track.js:109 `groundY` (`[0.2,14]` in an earlier probe). The per-circuit scan (`scanOverRoad`) is injected as an anonymous script, so the debugger cannot name a file there. The monaco boot timeout in race-2 was **env**: it passed in 130 s here. | keep + fix (F4, F5) |

**Findings**

1. **pit-lane.spec.js:427 | "crew draws and the tyres visibly swap" | test bug / env-bound.** The test calls `A.headless(false)` at L427 and never restores it. The final release loop (L~452, up to 300 `A.step`) and the 20 rAF waits then render every step on SwiftShader. One `page.evaluate` ran 123–135 s against a 120 s test timeout. It failed identically twice: `Test timeout of 120000ms exceeded`, `slow step: 123.4s Evaluate`. The log shows the stop itself finished (`Pit stop done … held=2.2s`), so the assertions never ran. Fix: `A.headless(true)` before the "Finish the stop" loop, and raise the test timeout or split the release loop out. On llvmpipe CI this probably passes, so the red depends on the machine, not the product.
2. **jump-start.spec.js:~37-47 (test 2) | the reaction window is never exercised | med.** The test waits 18 frames (0.3 s) before throttle, so a manual launch inside the 0.2 s window (`sporting-regs.js:228-231`) has no case. The logpoint also shows the boundary: `tSinceGreen = 0.19999999999999998` while speed was still ~0.5, so the gate sits on a float edge. Test 3's `crossedReactionGate === (name === "fast")` couples to tuning. The throttle-at-green test (+5 s) is solid and hit `jumpStartEarlyThrottle`.
3. **perf-race-entry.spec.js:~85-98 | cannot fail by default | med.** The observed race wall was 98.9 s against `RACE_ENTRY_SOFT_MS` = 75 s, and the run was still green: non-strict mode only adds an annotation. The remaining asserts are `marks.length > 8` and any-of mark names. Passes in the gate regardless of regression, as race-2 F15 said. Move it out of the gate, or make strict the default and set a calibrated cap per renderer.
4. **terrain-over-road.spec.js:~175 (per-circuit test) | `headless(true)` after the `expect` | low.** The cleanup line sits after the assertion, so on a failure it is skipped (harmless, the page closes). The 180 s budget against 45 s `BOOT_MS` waits remains an env hazard: monaco took 130 s here (peak 6 s past its budget in race-2's loaded run).
5. **terrain-over-road.spec.js | all 56 pass, yet nothing proves the scan can fail** | med. The 52 per-circuit tests all assert `offenders == []`. The scan's own mutation test lives in `tools/lib/over-road-scan.cjs`'s unit test, not here, and a `console.log("over-road …")` that would show per-circuit maxima is not captured in the log (0 lines). Add a negative control (inject a face 1 m over the road and expect a hit), or keep the margin logged so a trend is visible.
6. **debris.spec.js, pit-lane.spec.js, jump-start.spec.js | env flakes are load-dependent** | info. debris 1/5 red in race-2 was load (passes alone, 71 s); the Singapore wall-hit loop (`act` x 20 per iteration, 12 iterations) is cheap when the box is quiet.

**Classification of the race-2 reds:** debris Singapore — env timeout (alone pass). monaco terrain-over-road — env timeout (passes at 130 s). pit-lane crew-draw — **test bug** (reproduced alone, F1).

**Not run / gaps**
- Debugger: `serviceCar` (pit-lane.js:1414) not hit by my probe, only by the spec's own log lines; the `debris` wall-hit path (`lastImpact` in debris-world) was not driven by a probe; `raceEntryStages` and the terrain scan have no named-file hit.
- No screenshots; no PR; no repo files edited. `debug-chrome` stopped and the debugger detached with `cleanupErrors: []`.
- Browser-run total about 2 h; the rest was waiting on terrain-over-road.

---
_Generated by [Claude Code](https://claude.ai/code)_
