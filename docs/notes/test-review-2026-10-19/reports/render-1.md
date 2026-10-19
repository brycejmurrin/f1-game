<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT render-1 (final)

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6259831013
- Posted: 2026-10-19T04:42:49Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: final
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT render-1

Batch render-1: 25 files, all `tests/unit` (0 specs). Run: **25/25 pass** with `node --test <file>`, 0 fail, 0 skipped. Source read for all 25 by me and two read-only subagents.

**Debugger caveat (said once):** `debugger_targets` returns `[]` for a node `--inspect-brk` process, so the js-debugger MCP could not attach to node. Fallback: `NODE_V8_COVERAGE` per file, with function hit counts for 12 files (13 coverage probes in total). Code in `vm.runInContext` shows as `evalmachine.<anonymous>`, so those were checked by function name only. "hit" means the function ran during the test, not that the specific assertion's branch did. Files marked n.a. were not probed.

## Per-file table
| file | purpose | run | debugger | quality | mock / wrong-target | verdict |
|---|---|---|---|---|---|---|
| always-lamp-floor | Monaco tunnel lamps stay lit by day | pass 3, 0s | hit (setFrameLights x3) | strong, exact equalities | real VM, flicker zeroed; fine | keep; add a vector-`scale` case |
| apex-memory | agent memory CLI | pass 2, 1s | hit (apex-memory.mjs:37, :62) | weak/mixed | tmpdir fixture is dead code; tests live repo memory | rewrite |
| appearance-sunlight-chrome | light-theme CSS contracts | pass 5, 0s | n.a. | mixed (pinned hex, `ok(sys && …)`) | CSS text stands in for paint | strengthen (compute contrast) |
| assets-pack | PBR pack loader races, MAT table, bake tools | pass 64, 9s | n.a. | strong overall; a few regex pins | mock GL/fetch fine; regex scans of wgx/tlx/glx stand in for backends | regroup into loader / bake / pack-data |
| cam-avoid-vm | cameras don't heave over gantries | pass 11, 31s | n.a. | strong; tuned thresholds | none | keep; sweep heli/side |
| cam-avoid | step-in and road corridor | pass 7, 0s | hit (freeEye x5, roadClear x8, blocked x12, clearEye x1) | mixed; street test vacuous | stubs re-implement insideProp | strengthen |
| cam-comfort | touch comfort and CamTune overrides | pass 12, 1s | hit (active x113); `fxSet` NOT-HIT | strong | hand-rolled stores; CamTune tests misplaced | regroup |
| cam-motion | rig pose vs lens layer (driver for tools/shot/cam-motion.mjs) | pass 1, 0s | n.a. | mixed (one `ok` aggregates ~15 checks) | CamTune zeroed, curvature 0, so title "a turn" is false | strengthen |
| cam-round2 | Monaco/Spa/Monza camera regressions | pass 11, 3s | n.a. | mostly strong; a few tautologies | damper copied into test | strengthen |
| camera-defaults | CamTune defaults, CAM gestures, HUD classes | pass 21, 1s | n.a. | mixed; many regex-only | `M4.clamp` copied; ~5 modules in one file | regroup |
| camera-feel | CamFeel curve/shake/hang | pass 19, 0s | hit (shake x6111, drive x185) | mostly strong; 4 game.js/input.js regexes | track stub pasted 3x | strengthen |
| camera-ride | rig framing, ground clamp, cockpit | pass 20, 1s | hit (vantage.js:441) | strong numerics, weak scans | hardcoded tuning constants | regroup |
| camera-tuner-a11y | scope buttons announce state | pass 1, 0s | n.a. (regex only; no code executed) | weak | string scan hides a real bug (F1) | rewrite |
| census-verdict | real-GPU census gate | pass 9, 1s | hit (census-verdict.mjs:135, :146) | strong | `healthy()` is a copy of the leg shape | keep |
| elev-presets | track-designer elevation presets | pass 3, 0s | hit (sanitize x9, apply x7, sample x3, plan x3) | mixed (tautology at :53) | ±60 limit is the fallback, not `CustomTracks` | strengthen |
| floodmast-lamp-register | night lamp fixtures and caps | pass 6, 12s | n.a. (real scenery VM) | mostly strong; copied cap 160 | patches `_vmContext.TrackScenery` | keep, harden |
| flyby-fleet | 12 circuits pass flyby audit | pass 2, 53s | n.a. | strong design | none; no negative control | keep; add control |
| flyby-lighting | flyby lighting order | pass 5, 0s | n.a. | weak (source-slice ordering) | source strings stand in for behaviour | strengthen |
| flyby-panel | shot-list algebra, bake, lazy-load | pass 52, 1s | n.a. | mostly strong | Proxy `anything()` swallows `G` | merge/regroup |
| flyby-shots | flyby planning and intro lifecycle | pass 92, 138s (first run hit my 110 s cap, re-run alone passed) | n.a. | mixed (floors are recorded scores) | slice harnesses with ~25 fake deps | regroup into 3 files |
| frame-fleet | fleet diff report | pass 8, 1s | hit (frame-fleet.mjs:111, :70) | strong | fixture mirrors report shape | keep |
| frame-hitch-analyse | hitch verdict logic | pass 20, 0s | hit (frame-hitch.mjs:134, :857) | strong | one test depends on two anchor strings | keep, strengthen |
| frame-hotpath-alloc | no per-frame allocs | pass 17, 1s | n.a. | mixed (~70% regex) | microbench tests a local loop | strengthen |
| frame-math | no-renderer framing judge | pass 9, 0s | hit (frame-math.mjs:391, :190) | strong | none | keep, strengthen |
| free-cam | free camera corner/car snaps | pass 14, 0s | hit (free-cam.js:72, :285) | mostly strong; some tautologies | `FlybySeq` stubbed | strengthen |

Flakiness: not measured (one run each). The `flyby-shots` timeout was my own 110 s cap, not a test failure.

## Top findings
1. `camera-tuner-a11y.test.mjs:15-20` | regex-matches `tuner-panel.js` lines 380/385 and passes while the code is wrong: `js/camera/tuner-panel.js:375-388` syncs `.on` / `aria-pressed` only for `sm.mode` and `sm.global`; THIS TRACK and THIS CAR (built at :104-112) stay `aria-pressed="false"` after selection (I read the source and confirm) | screen-reader users can't tell the active scope | drive the panel under `mini-dom`, click all 4 buttons, assert exactly one pressed (fails today), then fix tuner-panel | high
2. `apex-memory.test.mjs:15-34` | tmpdir `.claude/memory` fixture is created but never used; the tool hardcodes `ROOT` (`tools/env/apex-memory.mjs:19`); the `retire` success path is untested and the `show` test depends on live file `user-timezone-pacific.md` | breaks when a memory is retired; the one mutating command is unverified | add an `APEX_MEMORY_ROOT` override and run the cycle on the fixture | high
3. `cam-avoid.test.mjs:57-69` | street-circuit test is vacuous: `insideProp` always returns null and `:68` is `assert.ok(insides >= 0)` | the street-circuit step-in path has no real test | use a blocking stub and assert x unchanged | high
4. `frame-hotpath-alloc.test.mjs:105-110` | the GC microbench returns when `globalThis.gc` is absent; neither `package.json` nor `tests/groups.json` passes `--expose-gc` (I grepped both); it also measures a local loop, not `cullInstances` | a silent pass that proves nothing | delete it, or call the real `poolModelMat`/`cullInstances` with an allocation spy | high
5. `cam-motion.test.mjs:6-10` | title promises "a turn" but the tool's track stub has curvature 0 and CamTune returns 0 | bend-hang and corner lead are never exercised in the rig solve | add a curved-track variant or rename; inline the ~15 `must()` checks as separate tests | high
6. `flyby-lighting.test.mjs:75` | anchors on the first `loadTrack(trackIdx)` in `startRaceBody`, which is the `vmNoFramePump` branch (`game.js:2513`); production is `loadTrackStepped` (:2514); `raceIntro` is guarded by `if (world)` at :3990, which the test ignores | the ordering check passes on a branch players don't run (ordering still holds today) | anchor on `loadTrackStepped(`, or run `raceIntro` in a harness like flyby-shots' `introBuild` | medium
7. `camera-feel.test.mjs:267-304`, `camera-ride.test.mjs:387-399, 621-635`, `camera-defaults.test.mjs:149-176, 477-503` | regex scans of game.js, input.js, car-draw.js, vantage.js and hud.css stand in for behaviour | break on reformat, prove nothing at runtime | replace with behaviour tests or delete | high
8. `appearance-sunlight-chrome.test.mjs:26-27, 66-67` | pins hex literals; the claimed ~4.5:1 contrast is never computed | any legitimate retune fails; a real contrast regression passes | compute WCAG contrast from the token pair | medium
9. `assets-pack.test.mjs:1070-1085` | `MAT_LAYERS = 17` / `[17]` are regex-pinned (subagent counts 5 files with the pin; I did not verify the count) | a legitimate 18th material needs many manual edits | import one shared constant | medium
10. `flyby-shots.test.mjs:1795-1848` | frame-report floors are the recorded "was 77/78" scores, not requirements; the file takes 138 s; a conditional assert at :386 `if (!films) assert…` | brittle; slow edit loop | split into real-VM / intro-lifecycle / slow frame-report files | medium
11. `flyby-fleet.test.mjs` vs `flyby-shots.test.mjs:1824` | fleet rules allow pan up to 45 deg/s while flyby-shots pins `PAN_MAX` to 25 (per subagent; not re-measured) | two disagreeing limits for the same property | reconcile; add a negative control feeding `auditTrack` a bad shot list | medium
12. `free-cam.test.mjs:212, 227, 300` | tautologies: asserts the stub planner's own return values; condition-wrapped `G.photoMode && api.close(false)`; real clearance never exercised | the corner-snap framing is only tested against a stub | one real-`FlybySeq` corner snap on a built circuit | medium
13. `elev-presets.test.mjs:53, 57, 84` | tautology at :53, `tiny[1]` never checked, the hilly>rolling check holds for one seed | the real invariant (grade cap `halfM/19.6` in `plan`) is untested | assert max grade over several seeds | medium
14. `cam-round2.test.mjs:195, 235, 240-242` | self-comparison and dead code (`void good`), plus a copy of the damper tested against itself | assertions that cannot fail | remove them; import the real damper | medium
15. `census-verdict.test.mjs` (`healthy()` fixture) | a field renamed in `gpu-game-check.mjs` leaves the test green | the real-GPU gate could drift silently | derive the fixture from the producer's schema | low

## Gaps
- No test of `tuner-panel.js` button sync for track/car scope (F1); `cam-comfort.js` `fxSet` clamp/round (coverage: NOT-HIT).
- `frame-hitch.mjs` analysers `analyseLayout`, `analysePassKinds`, `analyseWork`, `analysePasses`, `raceEntryWindow` (subagent grep: referenced by no test).
- `frame-math.mjs`: `cullBoxes`, `marchGround`, per-flag `THRESH` boundaries, flags `skyPct > 65`, `SUBJECT_FILLS_FRAME`, `SUBJECT_OFF_FRAME`.
- Lamp caps `MAST_LAMP_CAP`/`PIT_LAMP_CAP`/`CUSTOM_LAMP_MAX` and `selectCustomLamps` tie-breaking; the game.js `srcSet` wiring for `alwaysLampFloor`.
- `elev-presets.js`: loop-closure blending of the last 3 nodes, `bumpAt` wraparound, over-long `sanitize` input.
- `collide.js` early-exit and `cullInstances` have no behavioural test.
- The straight-track `Tracks` stub is pasted into ~5 camera tests; `CamTune` is zeroed in nearly all of them, so corner lead is never exercised in the real rig solve (except cam-avoid-vm).

## Not run
- No browser or spec run (batch has none).
- Node debugger could not attach, so no breakpoints were set. Line-level hit status exists only where noted in the table; VM-evaluated code was checked by function name.
- No flake sampling (single run per file).
- `flyby-shots` was read closely only for about half of its ~100 tests (subagent), the rest by title and grep.
- Subagent-reported claims not re-verified by me: findings 9, 11, 12, 13, 14, 15 and the gap-list entries other than F1, F4 and F6.

Artifacts (scratch): `artifacts/test-review/render-1/` (logs, coverage).

---
_Generated by [Claude Code](https://claude.ai/code)_
