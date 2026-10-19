<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT platform (partial 1/n (15/22 specs run, no debugger pass; stopped at the 120k reviewer cap))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261348439
- Posted: 2026-10-19T06:43:02Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 1/n (15/22 specs run, no debugger pass; stopped at the 120k reviewer cap) (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT platform (partial)

Batch platform: 22 specs. Stopped at the new 120k context cap. **15/22 run, 7/22 not run, debugger pass NOT run on any file** (see Not run). Source reading was done by two read-only subagents (11 specs each, full spec + module under test). Their findings are NOT spot-checked by me beyond the run results; confidence is stated per row.

**Run method:** `test-bg.mjs` only takes whole groups, so each spec ran alone via `npm test -- tests/specs/<f>.spec.js --workers=1`, strictly one at a time (loadavg 3-5 on 4 cores, SwiftShader, no /dev/dri).

**Debugger:** not run (context cap). The "debugger target" column is the breakpoint/logpoint location in the code under test that the subagents identified; **hit/not-hit is unverified**. Do not read it as hit.

## Per-file table

| file | purpose | run | debugger target (unverified) | quality | mock / wrong target | verdict |
|---|---|---|---|---|---|---|
| map-hooks | `mapPts`/`trackBounds` hooks return sane geometry | pass 31 s | apex-track.js:121,~137 | weak: shape only, no north-up, no real min/max; Monaco build ~55 s | none | strengthen or move to VM |
| output-paths | `APEX_PORT`/output-path helper | pass 5 s | n.a. (tests a test helper) | ok | pure Node, no browser | regroup into tests/unit; add invalid-port case |
| soak-run | `SoakRun` produces recorder data | pass 89 s | soak-run.js:117,119 | weak: `early.s` read at :20 never used; car movement never asserted | none | strengthen |
| logging | `Log` ring, namespaces, levels | pass 9 s | log.js:110,132 | mixed | no `Log.clear()` before `loadTrack` (:67-76) | keep, strengthen |
| dev-tools-dom | finishRace panel, results table, hud(false/true) | **FAIL 470 s**: `hud(false)` 120 s timeout, 60 s screenshot step, service worker re-activated mid-test; other 4 pass. Solo re-run NOT done | apex.js:1264,1287; game.js:2878 | weak: `count()>0` table check; 2 screenshots not assertions; weak track wait (:10-15,40) | none | strengthen and trim |
| boot-guard | lazy-script 404 reload guard | pass 22 s | index.html:399,427 | mixed | none | keep, add 3 cases |
| rotation-recovery | rotation/resize recovery | pass 42 s | game.js:4197,8576; layers.js:243 | strong | test 3 mergeable into 1 | keep |
| agent-determinism | same seed => same sim | pass 11 s | apex.js:2118,902 | strong | `carState()` numbers/booleans only | keep |
| wake-lock | wake-lock acquire/release | pass 7 s | wake-lock.js:25,31 | mixed | mocks `navigator.wakeLock` + `document.hidden`; 13 cases have identical VM twins in `tests/unit/wake-lock-vm.test.mjs` | delete browser copies, keep one smoke |
| autopilot | autopilot completes laps | pass 142 s | soak-run.js:32-34 (copy of controller) | mixed: `direct` lap only logged (:252-256), floors 40/30/2500 arbitrary | controller constants duplicated | strengthen and trim |
| audit | lap-undo, wrong-way, road-follow, rear-end, Suzuka | pass 906 s (slowest) | race-control.js:131; game.js:6232,6258,5978 | mixed: see findings 2,3 | rival gets player's speed (apex.js:870); :194-207 "Suzuka ferris + bridge" never reaches the crossover | prune and strengthen |
| headless-api | `headless()` API | pass 9 s | apex.js (headless) | mixed: "false by default" asserts the fixture's reset | VM twin in twinned-specs | delete browser copy after fixing test 1 |
| obs-act-edge | obs/act edge cases | pass 17 s | apex.js:1693,1803 | mixed | raw `@playwright/test` import (:5): no fixtures; VM twin | delete or import fixtures |
| smoke | boot, park, driving line, HUD | **FAIL 846 s**: 3/10 timeouts at 120 s (`park()` 193 s, DRIVING LINE 186 s, HUD speed 149 s), loadavg 4-5. Solo re-run NOT done | game.js (park) | weak non-blank check: file size > 5000 bytes | desktop 1280x720 only | keep, strengthen |
| ui-audit | 78-test screenshot gallery, no assertions | **FAIL**: 7/78 failed, 1 skipped, all timeouts 127-182 s (portrait 15; landscape 09, 14, 15, 21, 22; desktop 08 pause menu) | n.a. (no assertions) | vacuous by design: `.catch(()=>{})` swallows failures | none | keep as on-demand harness; stop swallowing; rename test 16 |
| ui-resize | resize / viewport behaviour | NOT RUN | sheet-shape.js:244 | read-only: pins old look; phone sizes without hasTouch/isMobile | pins text normal, contrast off | keep, add touch + unpinned pass |
| dev-tools | dev-tools hooks | NOT RUN | apex.js:240 | read-only | VM twin; mis-grouped in `ui`; `setPhysics({pace:0.5})` leaks | delete browser copy |
| new-hooks | misc hooks + 410 lines of scenery checks | NOT RUN | apex.js, agentview.js:560 | read-only: :729-760 night test asserts `day>0, night>0` only | 55-of-56 VM twin | split; move scenery to foundation specs |
| ui-redesign | redesign screens | NOT RUN | game.js:9128 | read-only: 650-line single test (:71-727) | Last Race builds its own `<table>` (:449-463); `activeColor` never asserted (:818) | split, drive real renderer |
| ui-button-touch | touch buttons | NOT RUN | n/a | read-only: many `waitForTimeout`, conditional GAS press :1367 | pins old look | split by subject |
| agent-view | agentview hooks | NOT RUN | agentview.js:560,498 | read-only | ~119 tests duplicated by VM twin | keep ~12 render-dependent, delete rest |
| ui-scale | UI scale matrix | NOT RUN | n/a | read-only: 11 inspector tests (:921-1178) on `setContent` fixtures, one stubs `window.__apex` | pins old look; phone viewports without hasTouch/isMobile (:183) | move tool tests out; unpin |

"NOT RUN" rows are subagent reads only: nothing was executed.

## Top findings (ranked; read-only unless noted)

1. `smoke.spec.js`, `dev-tools-dom.spec.js`, `ui-audit.spec.js` | **Measured:** 11 tests across three specs exceeded their 120 s timeout at loadavg 3-5 (`park()`, DRIVING LINE, HUD speed, `hud(false)`, and 7 ui-audit screens, mostly season/results/pause screens). Classification pending solo re-run; most likely environment (SwiftShader, 4 cores, a service worker re-activated mid-test in dev-tools-dom), but `park()` at 193 s may be a real perf signal | smoke is the "does it boot" gate | re-run each alone on a quiet box | medium
2. `audit.spec.js:53-67` | "backwards across the line" never asserts the line was crossed; `jump(0.01,25,0)` is ~58 m past the line and 90 frames of reverse cover ~45 m; with `lap0=0` the `race-control.js:131` path returns `changed:false` anyway | cannot fail on the bug it names; the :88 sibling covers it | delete or add `expect(crossed)` | med-high (geometry estimated, not run)
3. `audit.spec.js:178-192` | rear-end test coasts with `throttle:false`, rival has player speed (apex.js:870), nothing asserts contact | `maxV <= v0+0.5` passes with no collision | lower rival speed, assert contact/speed drop | high
4. `wake-lock.spec.js:74-312` | all 13 cases mock the wake lock and `document.hidden`, each has a VM twin | ~12 Bahrain builds for no extra evidence | delete browser copies, keep one live smoke | high
5. `tools/ci/twinned-specs.mjs:25-36` | ~210 browser tests (agent-view 119, dev-tools 54, headless-api 24, obs-act-edge 16) duplicate VM twins test-for-test | large wall-time cost | delete browser copies; keep render-dependent ones | high
6. `headless-api.spec.js:31-35` | "headless() false by default" asserts the fixture's own reset (`fixtures.js:424`), not the product default (`game.js:835`) | cannot fail for its name | assert on a virgin page | high
7. `obs-act-edge.spec.js:5` | imports raw `@playwright/test`: skips `fixtures.js` pins and API stubs (TLX, tyre wear and wind on, no `__TEST_MODE`) | results depend on an unpinned environment | import `fixtures.js` or delete | high
8. `soak-run.spec.js:20-43` | nothing proves the car drove (`early.s` unused) | a driver whose `control()` returns null passes | assert `obs().s` or recorder distance advanced | high
9. `new-hooks.spec.js:729-760` | night props test asserts only `day>0`, `night>0`; real assertion commented out | vacuous | delete or restore | high
10. `new-hooks.spec.js:540-950` | 410 lines of per-circuit scenery checks in a hooks file; `.every()` passes on empty arrays; vertex budgets widened repeatedly | wrong home, weak | move, assert `length>0` first | med-high
11. `boot-guard.spec.js` vs `index.html:392,413,431` | no test for lazy-script 404 (must not reload), `navigator.onLine=false`, or sweep deleting only `apex26-*` caches | a flaky lazy fetch wiping caches mid-race comes back with no red | 3 routed cases | med-high
12. `ui-resize`, `ui-redesign:10-17`, `ui-button-touch:148`, `ui-scale:83` | four UI specs pin text normal / contrast off / garage scene; shipped defaults are large text + high contrast (`appearance-opts.js:86,473`) | the shipped look is not tested | add one unpinned 844x390 pass each | high
13. `ui-resize` phone sizes, `ui-scale:183` | phone viewports without `hasTouch`/`isMobile`; coarse-pointer CSS not exercised (Bryce plays on a phone) | phone-only regressions missed | add both | high
14. `ui-button-touch.spec.js:722-743,1367` | "chips are compact inline" only checks `#rs-go` visible; sleeps; conditional GAS press | passes without the layout it names | assert geometry, condition waits | high
15. `autopilot.spec.js:232,252-269` + `soak-run.js:32-34` | arbitrary floors; `direct` lap only logged; controller constants copied into soak-run | a 30% pace regression passes; copies drift | seeded lap-time band; share the controller | med

## Gaps
`Log` ring overflow (500 records), `?log=` precedence, `buffer:` terms; boot-guard `data-apex-lazy` exemption and offline branch; `trackBounds` north-up and real min/max; soak-run movement; agent-determinism leaked arrays/objects and cosmetic `Math.random` staying out of the sim; rotation-recovery race pausing behind the blocker; `output-paths` invalid `APEX_PORT`. Subagents grepped tests/ for most; I did not re-verify.

## Not run
- **dev-tools-dom, smoke, ui-audit**: ran red (timeouts); solo re-runs NOT done.
- **Never started (stopped at the 120k cap):** ui-resize, dev-tools, new-hooks, ui-redesign, ui-button-touch, agent-view, ui-scale.
- **Debugger pass:** not run for any file; the rubric's js-debugger / `debug-chrome.mjs` check is still owed for all 22.

Continuation needs: a quiet box, then the 7 specs + 3 solo re-runs one at a time, then the debugger pass per spec.

---
_Generated by [Claude Code](https://claude.ai/code)_
