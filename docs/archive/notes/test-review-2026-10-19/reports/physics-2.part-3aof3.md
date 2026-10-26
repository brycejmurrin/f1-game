<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT physics-2 (partial 3a/3 (continuation physics-2b; stopped at the 120k reviewer cap))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260874560
- Posted: 2026-10-19T06:10:11Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 3a/3 (continuation physics-2b; stopped at the 120k reviewer cap) (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT physics-2 (partial 3a/3) — continuation physics-2b; stopped at the new 120k reviewer cap (ORCH3, 06:05Z)

Parts 1/2 hold the static rows (purpose, quality, mock, verdict), and I didn't redo them. This part fills the **run** column for 11 of the 19 not-run files. It also records the logpoint map for the browser debugger pass, which I prepared but did not execute.

### Rows: run column (the other columns are unchanged from part 1)
Each spec was run alone with `node tools/ci/run-playwright.mjs tests/specs/<f> --workers=1`, sequentially on this 4-core SwiftShader box (no /dev/dri). Logs are in this container's `artifacts/test-review/physics-2b/logs/`.

| file | run | debugger |
|---|---|---|
| tests/specs/understeer-cue.spec.js | pass 7/7, 275 s | not run (target player-forces.js:272 `Input.vibrate`, :265 dwell) |
| tests/specs/parts-ers.spec.js | pass 4/4, 139 s | not run (game.js:4985 deploy, :5398 drain, cond `c.human`) |
| tests/specs/sliders.spec.js | pass 22/22, 671 s | not run (input/steer-tuning.js:699 pm-rate oninput, :553 boot clamp) |
| tests/specs/steer-migration.spec.js | pass 8/8, 60 s | not run (steer-tuning.js:536 early return, :452 migSet; boot logpoint) |
| tests/specs/tilt-pipeline.spec.js | pass 14/14, 56 s | not run (input/input.js:469 dead zone, :499 tiltSteering) |
| tests/specs/touch-steer.spec.js | pass 9/9, 44 s | not run (input.js:1126 touchCmd, :1291 lift-off ramp) |
| tests/specs/gamepad.spec.js | pass 27/27, 1370 s | not run (input.js:844 padAxisShape, :2234 disconnect / :1493 poll) |
| tests/specs/agent-drive-bench.spec.js | **VM only**: pass 5/5, 40 s (run-playwright routed it to vm-page; browser copy not run) | not run (agent/agentview.js:586 ego, agentview-corners.js:136 straight exit) |
| tests/specs/parts-persistence.spec.js | pass 8/8, 289 s | not run (garage/setup-sheet.js:744, game.js:1207 getTeamParts) |
| tests/specs/persistence-dom.spec.js | pass 2/2, 17 s | not run (ui/select-screen.js:59 showSaveWarning, :53, :113 export) |
| tests/specs/camera-driving-hooks.spec.js | pass 25/25, 4.1 m | not run (agent/apex.js:766 cinematic, apex-cam.js:311 carOrbit) |

0 failures and 0 retries so far.

### Top findings (added; numbering continues from part 1)
| # | file:line | defect | why it matters | proposed fix | confidence |
|---|---|---|---|---|---|
| 16 | tools/ci/run-playwright.mjs:110-139 | When `npm test -- <spec>` names a TWINNED or ADAPTED spec, it silently runs the VM twin and prints `[VM twins, no browser]`. A real browser run needs `APEX_WITH_TWINNED=1`. | A reviewer or agent who "ran the spec" may never have exercised the browser path. Part 2's "browser copies not run" list grew for this reason. | Say it in TESTING.md §5 / the rubric: a browser verdict for a twinned spec needs `APEX_WITH_TWINNED=1`. | high (observed: agent-drive-bench) |
| 17 | part 1 #12 (garage-aero), car-mesh.js:1796 | The proposed fix target is wrong. car-mesh.js:1796 is `drawAeroEdge`, a debug strip gated on `apex26.aeroEdge=="1"`. The real flap draw during the ease is game.js:1253, and it runs only when rendering is on. | Asserting "through the draw path" at :1796 would test a debug overlay. | Point the strengthened test at game.js:1253 (or `Car3D.aeroFlaps`), with rendering on. | med (source read, not executed) |
| 18 | part 1 #14 (persistence) | `store.broken` is probably first set at boot by migSet, steer-tuning.js:452 (it writes drivingHelp on an empty store). Part 1 said :538. The steering file is `js/input/steer-tuning.js`, and STEER_SCHEMA is 5. | This doesn't change the verdict, but the continuation should log `what` at store.js:668 to confirm. | Logpoint store.js:668 `[name, what, first]`. | med |

### Debugger logpoint map (ready for the continuation, all 30 specs)
Every line was re-read with sed on tip claude/f1-game-project-26h3ng. Use `debug-chrome start`, then debugger_logpoint at the URL with `?v=dev`, then reproduce via `__apex`. For per-car lines, use `c.isPlayer` as the condition.
- physics-characterization game.js:5167 `[c.s,c.x,c.speed,c.slipDeg,c.head]` · physics-boot player-forces.js:133 `[axFracF,axFracR]`, :352 `[vLat0,ay,r0]` · physics-fixes game.js:6059 `[c.s,tf.s]` (back-jump), wall-clamp.js:180 `[steer,pushIn,c.speed]`, :67 contact · physics-hotpath game.js:5276 `(__br0??=_aiBr)===_aiBr`, collide.js:222 (test 2 never reaches it) · longitudinal game.js:5487 `[c.speed,grassFloor,grassDrag]`, :5404 brake · drift player-forces.js:209 `[DRIFT,muR]`, :352 · active-aero game.js:5041 `[c.xArmed,want,c.aeroX]`, :5045 `vmax` · aero-zones aero-zones.js:204 `[track.def.id,zones.length]`, :217 · world-physics game.js:6059 `tf.s-c.s` (a negative value is the backward move from finding #3), :5978 ROAD_FOLLOW · collisions collide.js:548 `[a.id,b.id,dX,penLat,corr]`, game.js:5763 unstuck · collisions-deep collide.js:539 `[ct.oriented,ct.sideContact]`, wall-clamp.js:67 per-frame overshoot (finding #7) · collision-ai-fixes game.js:6258 `[ds,c.wrongT,c.wrongWay]`, wall-clamp.js:180, rescue game.js:6332 · agent-drive-bench agentview.js:586, agentview-corners.js:136 (cached: use a fresh page) · steering game.js:5930 `[steer,shaped,lockTaper]`, :5978 · understeer-cue player-forces.js:272/:265
- parts-ers game.js:4985/:5398 · sliders steer-tuning.js:699/:553 · steer-migration steer-tuning.js:536/:452 · tilt-pipeline input.js:469/:499 · touch-steer input.js:1126/:1291 · gamepad input.js:844/:2234 (start a race first; on the title screen the pad drives menu-nav) · parts-persistence setup-sheet.js:744, game.js:1207 · persistence-dom select-screen.js:59/:53/:113 · persistence store.js:668/:671 (stub `Storage.prototype.setItem` with `Page.addScriptToEvaluateOnNewDocument`) · camera-driving-hooks apex.js:766, apex-cam.js:311 · css-player-smoke game.js:9070 setPaused (use CDP `Input.dispatchMouseEvent`; a page `.click()` is untrusted) · garage-aero setup-camera.js:397/:418, flap draw game.js:1253 · menu-traversal menu-nav.js:625, modal.js:181 · menu-baseline title-menu.js:98, select-screen.js:605 (screenshot spec; these lines are boot-path evidence only) · parts-physics parts.js:719 (cond `cat.id==="engine"`), game.js:1424

### Not run (final for this session)
- **Browser, not run (context cap):** css-player-smoke, garage-aero, menu-traversal, menu-baseline, parts-physics. Then persistence, collision-ai-fixes and collisions-deep, which need `APEX_WITH_TWINNED=1` for a browser verdict (VM twins otherwise).
- **Browser copy not run:** agent-drive-bench (VM pass only), plus drift, active-aero, aero-zones, world-physics and collisions from part 2.
- **Browser debugger (MCP) pass:** 0/30 executed. The map above is ready; debug-chrome can't run beside the spec chain, and the cap came before the chain finished.

SWEEP-N/A (no desk).

---
_Generated by [Claude Code](https://claude.ai/code)_
