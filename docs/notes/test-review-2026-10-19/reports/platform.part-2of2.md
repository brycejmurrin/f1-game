<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT platform (final (continuation; 9 specs re-run alone, ui-audit not re-run, no debugger pass))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6263765590
- Posted: 2026-10-19T09:12:48Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final (continuation; 9 specs re-run alone, ui-audit not re-run, no debugger pass)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT platform (continuation)

Continues https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261348439. Rows already reported there (map-hooks, output-paths, soak-run, logging, boot-guard, rotation-recovery, agent-determinism, wake-lock, autopilot, audit, headless-api, obs-act-edge) are not repeated. Helpers (no PR): https://github.com/brycejmurrin/f1-game/tree/cursor/test-review-helpers-platform/docs/notes/test-review-2026-10-19/helpers/platform

**Method:** each spec alone, `npm test -- tests/specs/<f> --workers=1 --retries=0` (test-bg takes groups only), one at a time, waiting for loadavg < 3 before each start (idle at start of every spec: 0.7-2.8). SwiftShader, no /dev/dri. Logs in artifacts/test-review/platform/ (local, not committed).

## Per-file table (continuation items)

| file | run | classification | debugger | quality / notes | verdict |
|---|---|---|---|---|---|
| smoke | **FAIL again solo**, 1009 s: same 3/10 timeouts (`park()` 216 s, DRIVING LINE 186 s, HUD speed 162 s) with box idle at start (0.72) | **environment, reproducible**: log shows `race car assets ready cpuMs:15661 maxStepMs:12324` (a 12 s single step) and a SW install/activation landing mid-test; not load-induced | not run | unchanged from partial | keep, strengthen; the gate cannot go green on this box |
| dev-tools-dom | **FAIL again solo**, 529 s: only `hud(false) hides the HUD` (177 s; a 60 s Screenshot step, 30 s toBeHidden); other 4 pass | environment (screenshot of a WebGL page under SwiftShader), reproducible | not run | `toBeHidden` is the real assertion; the screenshot adds only cost | strengthen and trim |
| ui-resize | **FAIL 2/2 runs**, 157 s / 147 s: first test `resizing into a size matches loading fresh at that size` hits `waitForFunction` 15 s (30 s total); other 6 pass | cold-start timeout in the file's first test, deterministic here; the 15 s wait is shorter than the cold boot (27 s) | not run | as partial | keep; give the first wait a boot-sized budget |
| dev-tools | pass 36 s | n.a. | not run | as partial | delete browser copy |
| new-hooks | pass 1453 s (24 min, second slowest) | n.a. | not run | as partial | split |
| ui-redesign | pass 246 s | n.a. | not run | as partial | split |
| ui-button-touch | **FAIL**, 45 tests / 17 failed, 1 h 1 m wall (07:44-08:37): 15 test timeouts at 120 s (Lighting tuner pause lifecycle and free-camera, Pause menu calibrate, Touch dock REPOSITION), 2 `waitForFunction` 5 s | environment: single Click/Evaluate steps take 20-27 s here; no assertion message among the 17 | not run | as partial | split by subject; budget does not fit SwiftShader |
| agent-view | pass 52 s | n.a. | not run | as partial | keep ~12 render-dependent |
| ui-scale | **FAIL, real assertion**, 1254 s, 1/45: `portrait › every main screen fits at 200%` → `title portrait @200% — #overlay scrolls sideways`, expected <= 1, received 6 (12.9 s, no timeout) | **real / product-or-test-viewport defect**, reproduced on the second run (not a timeout); not yet debugged | not run | as partial | keep; owner to decide product fix vs fixture |
| ui-audit | NOT RUN in the continuation (78 tests, est. > 1 h); partial result stands | n.a. | n.a. | as partial | n.a. |

Totals this continuation: 9 specs run: **4 pass** (dev-tools, new-hooks, ui-redesign, agent-view), **5 fail** (smoke, dev-tools-dom, ui-resize, ui-button-touch, ui-scale); ui-audit not re-run. Combined with the partial: 22 specs, 22 run at least once, 1 (ui-audit) without a solo re-run.

## Top findings (new / confirmed)

1. `tests/specs/audit.spec.js:53-67` | **CONFIRMED by run** (Node VM, `helpers/platform/audit-probe.sh`): `jump(0.01,25,0)` lands s=53.9 m past the line; 90 reverse frames end at s=12.7 m; lap stays 0 → 0. The car never reaches the line, so `lap1 <= lap0` cannot fail on the bug it names | the test is green for a counter that counts backwards | assert the line was crossed (`s` wraps/passes 0) or start at s≈5 m; sibling :88 covers it | high
2. `tests/specs/audit.spec.js:178-192` | **CONFIRMED by run** (VM): player and rival both 50 m/s at start (rival inherits speed, apex.js:870), closing speed ~0, so no contact scrub happens and `maxV <= v0+0.5` holds for any coast | cannot fail on a collision speed gain | rival at 10 m/s, assert speed drop or a contact flag | high
3. `tests/specs/ui-scale.spec.js` portrait 200% | **real failure**: the title screen's `#overlay` scrolls sideways by 6 px at portrait @200% | the only deterministic assertion failure in the batch; a player with large UI scale sees a horizontally scrollable title screen | find the 6 px overflowing child (js-debugger on the title DOM, not done) | medium (reproduced 1x solo, root cause unknown)
4. `smoke.spec.js` / `dev-tools-dom.spec.js` | 4 timeouts reproduce solo with an idle box, so the earlier "loadavg 3-5" explanation is wrong: SwiftShader cost itself (`maxStepMs` 12 s on race build, 20-27 s per click in ui-button-touch) exceeds the 120 s budget | on this container these gates cannot be used as signals; CI llvmpipe is the only valid verdict | run on CI (`remote-group.mjs`) not locally | high
5. `ui-resize.spec.js` test 1 | 15 s `waitForFunction` is the first thing after a cold navigate (cold boot logged at 27 s) | deterministic false-red on a cold server | raise to boot budget or warm in `beforeAll` | medium-high
6. `ui-button-touch.spec.js` | 17/45 fail by timeout, 1 h wall locally | a 45-test file with 1 worker is not a local unit | split (already proposed), run on CI shards | high
7-15. unchanged from the partial report (wake-lock/twinned specs, headless-api:31-35, obs-act-edge:5, soak-run:20-43, new-hooks:729-760 and :540-950, boot-guard gaps, pinned-look UI specs, phone viewports without hasTouch, autopilot floors).

## Gaps
As in the partial. New: nothing covers the title/overlay horizontal overflow outside ui-scale (grep of tests/specs for `scrolls sideways`: ui-scale only).

## Not run
- **JS debugger pass: not done for any of the 22 files.** Container wall time (~2.5 h, specs at 1-24 min each under SwiftShader) went to the spec runs. The two `audit.spec.js` findings were confirmed with the Node-VM `__apex` path instead (setup/readouts in helpers), which is source/VM evidence, not a breakpoint hit; hit/not-hit columns remain unverified.
- ui-audit solo re-run (78 tests).
- ui-button-touch was run once only (1 h); smoke, dev-tools-dom and ui-resize reproduced on a second run.


---
_Generated by [Claude Code](https://claude.ai/code)_
