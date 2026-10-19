<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT race-1 (final (continuation))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261405190
- Posted: 2026-10-19T06:46:55Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final (continuation)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT race-1 (continuation)

Continues https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260865509 (49/49 files reviewed there). This pass covers only what that report left open. Nothing in the repo was edited; the helper is on branch `cursor/test-review-helpers-race-1` (commit cb0d2226, no PR): https://github.com/brycejmurrin/f1-game/tree/cursor/test-review-helpers-race-1/docs/notes/test-review-2026-10-19/helpers/race-1

**Method.** The previous `cdp-hit.mjs` was lost with its container, so I rewrote it (`helpers/race-1/cdp-hit.mjs`, README beside it). It runs `node --inspect-brk=0 <test>`, uses a `beforeScriptExecution` instrumentation pause so vm-evaluated scripts with no filename are covered, places a breakpoint on the first line matching a regex, counts hits (removed after 3, so `x3+` means at least 3), and can evaluate an expression in the paused frame (`@@expr`).

| file | run | debugger (this pass) | change vs. partial report |
|---|---|---|---|
| ai-band | pass 10, <1 s | `applyVmax` `Math.min(1+f, bandCap)` (`js/physics/ai-band.js:66`) HIT x1; frame eval: `f=0.18, scale=0.82547, ceil=1, bandCap=1.2114, (1+f)>bandCap = false, vmax=70`. `setMode` line 30 NOT-HIT (second confirmation) | **Finding #1 confirmed.** The cap never binds in the test. The test is now at lines 95-99 (`applyVmax caps a banded easy car at BAND_CEIL`), not 74-79: 70·1.18 = 82.6 ≤ 70/0.8255 = 84.8, so the assertion holds with or without the `Math.min`. |
| race-flow-fixes-vm | pass 43/43, ~4 min under the debugger | game.js `aiRedHeld = raceCtl.level >= 4` (L6364) HIT x30+; AI `rescueT > aiRescueDelay` (L6372) HIT x30+; `Input.clearDriveEdges()` (L4437) HIT x1; `physAcc -= PHYS_DT; steps++` (L8421) HIT x7+; `quitToMenu` (L4229) HIT x21+ | pending to cdp-hit. Strong verdict stands. `clearDriveEdges` runs only once across 43 tests, so only the lights test exercises it. |
| pit-lane | pass 96/96 | `held` helper `c.pitState==="out" && inWindowOf` (pit-lane.js:813) HIT x19+; `toBox` `boxThroughFor - throughM` (:542) HIT x7+; `zoneOf` (:334) x88+; `entryRunM` (:105) x78+; `laneWidthOn` (:215) x25+; `js/track/core/pit.js` HIT | **unverified → cdp-hit.** The earlier failure was the regex, not the harness (the VM files carry `filename:`). |
| race-entry-profile | pass 26 | `race-entry-profile.js` `begin()` `armIntroBudget(tag)` (:209) HIT x25+; `armObserver` `observer.observe` (:97) HIT x12+; `longTasks = []` in the test sandbox HIT x25+ | **unverified → cdp-hit.** |
| fleet-flags | pass 5 | `assess` entry (tools/ci/fleet-flags.mjs:23) HIT x3+; `model drift` push (:34) x3+; `cost` push (:35) x3+; `stalled` push (:39) x2 | **NOT-HIT → cdp-hit.** The earlier miss was a poorly chosen line; every branch I tried is reached. |
| mirror-lights | pass 6 | `js/lighting/frame-lights.js` `appendCarTailLights` body (`_tlSel.length = 0`, :42) **NOT-HIT** (vm, no filename); `setFrameLights` HIT x11+; `viewLights` HIT x7+ | **NOT-HIT confirmed on a second line.** `drive()` never calls `appendCarTailLights`; it sets `frame.tailStart/tailCount` by hand (test L56). |

**Top findings (this pass; ranks follow the partial report's list, which stands)**

| # | file:line | defect | why it matters | proposed fix | confidence |
|---|---|---|---|---|---|
| 1 | ai-band.test.mjs:95-99 | `applyVmax` cap test cannot fail: debugger shows `(1+f)=1.18 < bandCap=1.2114`, so `Math.min` never binds. | Removing the BAND_CEIL cap passes. | Use f≥0.3 (or paceScale ≈0.7); assert `vmax == vmax0*ceil/scale`. | **high, verified under the debugger** |
| 2 | mirror-lights.test.mjs:56 (+:120-125) | The mirror test never reaches `appendCarTailLights` (breakpoint on its first body line NOT-HIT); `tailStart`/`tailCount` are hand-assigned, and the "restored in finally" check is a source regex. | A change in how tail-lamps are appended or evicted cannot fail this test, though the title says the mirror steady-state includes them. | Call `appendCarTailLights` with real cars, or state in the title that only the static lamp set is covered. | high, verified |
| 3 | race-flow-fixes-vm.test.mjs (lights test) | `Input.clearDriveEdges()` at game.js:4437 is hit exactly once across the 43 tests. | The lights-out latch fix is guarded by one scenario; all others pass whether or not it runs. | Keep, but add a negative control (latch set, call skipped) so the test proves it can fail. | med |

**Gaps (new)**
- `PitLane` `commitNow` (js/race/pit-lane.js:1183) and `update` (:1189) were not given a breakpoint here; the partial report's `commitNow` hit (from pit-lane-vm) stands.
- No new untested behaviour beyond the partial report's list.

**Not run**
- Specs: none in this batch.
- Not repeated: the 49-file `node --test` run (49/49 passed in the first pass); this pass re-ran only ai-band, pit-lane, race-entry-profile, fleet-flags, mirror-lights and race-flow-fixes-vm, all green (pass counts 10 / 96 / 26 / 5 / 6 / 43).
- Key line per file only; I did not run mutations.

Files reviewed this pass: 6 re-checked of the 6 left open (the other 43 stand from the partial report).

---
_Generated by [Claude Code](https://claude.ai/code)_
