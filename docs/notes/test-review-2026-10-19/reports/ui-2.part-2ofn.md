<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT ui-2 (partial 2/n (continuation; covers the items part 1 listed as not run))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261404014
- Posted: 2026-10-19T06:46:50Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 2/n (continuation; covers the items part 1 listed as not run) (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT ui-2 (continuation, partial)

Continues https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260884152. Only the items it listed as Not run / open are covered here. The 30 unit rows and the other spec rows in that report are unchanged.

## Per-file table (continuation)
| file | purpose | run | debugger | quality | mock / wrong target | verdict |
|---|---|---|---|---|---|---|
| tests/specs/photo-studio.spec.js | Home/race Photo Studio placement, 200% controls, IDB concurrent saves | **pass 5/5 alone, 286 s** (116.7 / 53.4 / 98.5 / 6.4 / 3.8 s), loadavg 1–4 | hit (browser logpoint) js/ui/photo-studio.js:294 x1, via pause → `pm-photo` on a bahrain race | strong design (unchanged) | 852x393/393x852 hasTouch, none faked | keep. The earlier `ps-capture inside viewport` failure is **classified flaky / load-sensitive**: the first run had loadavg 4–6 and two reviewer subagents running node, the re-run alone passed. Caveat: one pass does not prove the geometry assertion is load-immune. |
| tests/specs/hud-mirror.spec.js | rear-view mirror renders, composites into `#hud-mirror`, key turns it off | **FAIL 2/3 alone, 680 s**. GLX pass 255.4 s, TLX prepare pass 43.2 s, TLX render **FAIL at the 300 s test timeout (378 s incl. close)**: "Test timeout of 300000ms exceeded", no assertion error | not attached (a spec run cannot share the box with debug-chrome, and the test never reaches an assertion). Proposed: glx.js:2940, tlx.js:4994, mirror-pass.js:307 | strong where measured | 1280x720, no touch | **classified environment (SwiftShader, no /dev/dri), reproducible**. The step log shows `count->race` at 85 s, a 65.8 s Evaluate and a 32.4 s Evaluate. GLX needs 255 s of a 300 s budget, so it is next. Not a product defect, but the spec has no headroom on this box: run it on the CI llvmpipe shards. |
| tests/specs/hud-layout.spec.js (last 14 of 51) | real-browser HUD overlap / safe-area gate | **pass 15/15, 588 s** (30–52 s each) | hit (browser logpoint) js/ui/hud.js:1013 `fitHud` x2 in a live race. `syncPhoneFit` hud.js:2428 hit 0 on the desktop profile, as expected (phone-only). | mixed-strong (unchanged from the first report) | phone profiles hasTouch | with the first run (37 passed), all 51 tests have passed. See the caveat in Not run. |
| touch-pedals (hold-buttons.js:149) | pedal travel | not re-run | **not-hit** on the desktop-profile debug page (no touch pointer) | n.a. | n.a. | the spec uses hasTouch, so this was a limit of my probe, not a defect |

## Top findings (this continuation)
| file:line | defect | why it matters | proposed fix | confidence |
|---|---|---|---|---|
| tests/specs/hud-mirror.spec.js (TLX render test) | 300 s test timeout is reproducible alone on SwiftShader. GLX passes at 255 s. | A local run looks like a regression, and a slightly slower runner turns GLX red too. | Give the render tests their own `test.setTimeout` sized on measured time, or split the single long test into prepare / render / key-off tests. Keep CI on the shards that have llvmpipe. | medium (measured twice, once per session) |
| tests/specs/photo-studio.spec.js (paused race photo, "keeps controls reachable at 200%") | The geometry assertion `ps-capture inside viewport` failed once under load and passed once alone. | It looks like a flaky geometry assert. If it fails under CI load it could hide a real layout bug, or cause pointless reruns. | Do not widen the tolerance. If it recurs, log the rect values in the message and wait for layout to settle (`requestAnimationFrame` x2) before measuring. | low–medium (one fail, one pass) |

## Gaps
- No spec among the 13 has had a full browser-debugger pass under its own Playwright flow. Only 3 targets were probed live (hud.js fitHud, photo-studio.js:294, hold-buttons.js:149 not hit on desktop).
- Touch-profile probing needs a debug Chrome started with `--device` phone or touch emulation. The default debug-chrome page is not touch.

## Debugger notes
The js-debugger MCP did attach to Chrome at 9222 (`debugger_attach`, `debugger_logpoint`, `debugger_logpoint_read`, `debugger_detach` with `cleanupErrors: []`), run only after all spec runs and with no browser run live. Recipe in the helpers README.

## Not run
- Browser-debugger pass for the specs not named above: hud-audit, picker-edit-button, picker-tab-inplace, photo-studio-conditions, touch-buttons, browser-ui-hunt, menu-survey, title-menu-rotation, menu-keyboard (proposed breakpoints are in the first report). Reason: soft budget; the rest of the pass needs a touch-emulated debug Chrome.
- hud-layout: the 15-test `--grep` tail overlapped the earlier run by one test, and I did not recover which of the original 14 was recorded, so "all 51 passed" is the union of the two runs, not one run.
- Flakiness beyond one re-run per file was not measured.

Helpers (runner and debugger recipe): https://github.com/brycejmurrin/f1-game/tree/cursor/test-review-helpers-ui-2/docs/notes/test-review-2026-10-19/helpers/ui-2

Findings only: no product/test edits, no PR, no tolerance, quarantine or ratchet changes.

---
_Generated by [Claude Code](https://claude.ai/code)_
