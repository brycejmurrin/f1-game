<!-- verbatim copy of an issue #2952 comment; the body below the rule is not edited -->
# REPORT physics-2 (partial 3b/3 (continuation physics-2b))

- Source: https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6261683714
- Posted: 2026-10-19T07:06:36Z (comment author `brycejmurrin`; the reviewer session id is not stated in the comment)
- Status: partial 3b/3 (continuation physics-2b) (a later part supersedes overlapping rows; both are kept)
- Line cites are the reviewer's, taken on the deploy tip of 2026-10-19; see `../SYNTHESIS.md` §Verification for spot checks

---

REPORT physics-2b (partial). This continues [physics-2 part 3a](https://github.com/brycejmurrin/f1-game/issues/2952#issuecomment-6260874560) and stopped near the 120k context soft cap.

This part covers only the items part 3a left open. The static columns (purpose, quality, mock, verdict) are in parts 1 and 2, and I did not redo them. Tip `484d7ea1` (claude/f1-game-project-26h3ng). Box: 4-core SwiftShader, no /dev/dri.

**Helpers** (reuse them): branch [`cursor/test-review-helpers-physics-2b`](https://github.com/brycejmurrin/f1-game/tree/cursor/test-review-helpers-physics-2b/docs/notes/test-review-2026-10-19/helpers/physics-2b). It holds `run-chain.sh` (a one-spec-at-a-time chain gated on loadavg < 3; a `twinned:` prefix sets APEX_WITH_TWINNED=1) and `cdp-eval.mjs` (a one-shot Runtime.evaluate against debug-chrome; `debugger_evaluate` only works while paused).

### Rows: run column, plus debugger where it was executed
Each spec ran alone with `run-playwright.mjs tests/specs/<f> --workers=1`, sequentially. Logs are in this container's `artifacts/test-review/physics-2b/logs/`.

| file | run | debugger |
|---|---|---|
| tests/specs/css-player-smoke.spec.js | pass 1/1, 29 s | not run (game.js:9070 setPaused) |
| tests/specs/garage-aero.spec.js | pass 8/8, 40 s | not run (setup-camera.js:397/:418, game.js:1253) |
| tests/specs/menu-traversal.spec.js | pass 12/12, 319 s | not run (menu-nav.js:625, modal.js:181) |
| tests/specs/menu-baseline.spec.js | pass 6/6, 54 s | not run (title-menu.js:98, select-screen.js:605) |
| tests/specs/parts-physics.spec.js | pass 70/70, 118 s | **hit**: parts.js:719 (1956 hits during race build) and game.js:1424 (1 hit at race start, `[deploy .739, regen 0]`) |
| tests/specs/persistence.spec.js (APEX_WITH_TWINNED=1, **browser**) | pass 5/5, 25 s | **not-hit**: store.js:668 in a healthy store, which is expected; the spec reaches it only through its setItem stub, and that stub repro was not executed |
| tests/specs/collision-ai-fixes.spec.js (twinned, browser) | pass 14/14, 159 s | **hit**: game.js:6258 wrong-way (player rows `[0,false]`), wall-clamp.js:180 (158 hits); rescue at game.js:6332 not set |
| tests/specs/collisions-deep.spec.js (twinned, browser) | pass 15/15, **1222 s** | **hit**: collide.js:548 car–car (440 hits), wall-clamp.js:67 (158 hits); collide.js:539 not set |
| tests/specs/agent-drive-bench.spec.js (twinned, browser) | pass 5/5, 223 s (the VM copy took 40 s in part 3a) | **hit**: agentview.js:586 ego (1 hit per `world()`), agentview-corners.js:136 (11 hits) |

0 failures and 0 retries in 9 runs. To confirm that the browser actually ran, each twinned log starts a Playwright dev server and is 4–6× slower than its VM twin.

**Debugger pass (physics map, one live Monza race in debug-chrome):** 22 logpoints set, 19 hit. The race: `__apex.headless(true)`, then `race("monza")` and `go()`, then `act()` for 420 frames of throttle, 240 of throttle, 240 of right lock, 240 of left lock and 60 of brake.
- **Hit:** physics-characterization game.js:5167 (49k) · physics-hotpath game.js:5276 (`_aiBr` path, 46.8k) · longitudinal game.js:5487 grass drag (583, AI rows `[11.2, floor 9.07]`) · active-aero game.js:5041 (49k) · world-physics/steering game.js:5978 (player `ROAD_FOLLOW=0`, so the assist term is off with assists off, which is the physics contract) · steering game.js:5930 · physics-boot player-forces.js:133 and :352 · parts-ers game.js:4985 and :5398 (**AI rows only**) · aero-zones.js:204 (2 hits, at race build) · collisions and collisions-deep, as listed in the table.
- **Not hit / not set:** store.js:668 (see the persistence row).
- game.js:6059 `c.s = tf.s` fired on **every** player frame with `tf.s < c.s` by 0.083 m. `physState` showed speed −5 m/s after the held brake, so the car was reversing (REVERSE_MAX). These rows are **not** evidence for part 1's back-jump finding #3, which still needs its own repro at speed.

### Top findings (added; numbering continues from part 3a)
| # | file:line | defect | why it matters | proposed fix | confidence |
|---|---|---|---|---|---|
| 19 | tests/specs/collisions-deep.spec.js (whole file) | Its browser run took 1222 s for 15 tests. One test ("closing into a traffic nest … perpetual side-rub") ran over 113 s alone. | Locally this one spec is a 20-minute serialized cost. It is why the VM twin is the default, and why a browser verdict is rarely gathered. | Time each test under APEX_WITH_TWINNED in CI, and split or shorten the nest test (fewer frames, or headless step batching). | high (measured) |
| 20 | js/agent/apex.js:1781-1785 (`act()` input) | `act()` accepts only steer/throttle/brake: there is no boost/ERS key. A headless agent or debugger repro cannot drive the **player** ERS deploy branch at game.js:4985/5398. In my race those logpoints recorded AI cars only. | ERS player coverage depends on the specs' own key/touch paths (parts-ers, parts-physics). Neither `act()` nor the agent bench can check it. | Add `boost` to `act()` input (pass 2), or record in DEBUG-HOOKS that ERS needs `keydown`. | med (source + live logpoints) |
| 21 | part 3a's map: collide.js:548 / game.js:5763 conditions | The proposed logpoint expressions use `a.id`, `b.id` and `c.id`, which are **null** on car objects (observed). | Logpoint output from the map is unreadable as written. | Use `[a.isPlayer, b.isPlayer, a.s|0, b.s|0]`, or the car's driver code field. | high (observed) |
| 22 | persistence.spec.js vs store.js:668 | A live race in a healthy store never reaches store.js:668. The spec's only path there is its `Storage.prototype.setItem` stub. | That still holds the part 1 #14/#18 question (which write sets `store.broken` first) open. It is not answered by running the spec alone. | Run the part 3a stub repro (`Page.addScriptToEvaluateOnNewDocument`) with the logpoint `[name, what, first]`. | med |

### Gaps
- Player ERS deploy and drain cannot be exercised through the agent/`act()` surface (#20).
- The back-jump at game.js:6059 at racing speed is still unconfirmed live; the reverse case masks it.

### Not run
- **Browser debugger, UI half of the map (cap):** css-player-smoke game.js:9070, garage-aero setup-camera.js:397/:418 and game.js:1253, menu-traversal menu-nav.js:625 and modal.js:181, menu-baseline title-menu.js:98 and select-screen.js:605, persistence store.js:668 with the setItem stub, plus every part 3a input/UI row: sliders, steer-migration, tilt-pipeline, touch-steer, gamepad, parts-persistence, persistence-dom, camera-driving-hooks, understeer-cue (player-forces.js:272/:265).
- **Physics map rows not set this pass:** physics-fixes back-jump at speed, drift player-forces.js:209, active-aero game.js:5045, collisions-deep collide.js:539, collision-ai-fixes rescue game.js:6332, physics-hotpath collide.js:222.
- **Browser copies still not run (from part 2):** drift, active-aero, aero-zones, world-physics, collisions (each needs APEX_WITH_TWINNED=1).

SWEEP-N/A (no desk).

---
_Generated by [Claude Code](https://claude.ai/code)_
