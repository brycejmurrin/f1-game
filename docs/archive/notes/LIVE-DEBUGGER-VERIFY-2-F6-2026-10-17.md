# Live debugger hunt, round 2: F6 live and the remaining phases (#2586), 2026-10-17

Companion to `LIVE-DEBUGGER-VERIFY-2-2026-10-17.md` (PR #2595). Deploy tip `1d85d52a8` (#2554 merged). js-debugger MCP, SwiftShader headless Chrome.

| id | where | verdict | evidence |
|---|---|---|---|
| F6-live | `js/render/three/tlx.js` `TLX.create` catch / `_createUndo` | CONFIRMED-LIVE (fix works) | TLX is deferred and not loaded under the default GLX path here, so `tlx.js` was injected as a script and `TLX.create(canvas, {initOwner})` called with an owner whose `check()` throws on call k (create makes 7 checks in total). Counted `ResizeObserver`s (constructor/`disconnect` wrapper) and `visibilitychange`/`pageshow`/`webglcontextrestored` add/remove calls. k=7 (after every registration): peak 1 observer + 3 listeners, after the throw 0 + 0. k=6, 5, 4 throw before registration: 0 + 0 throughout. `create` resolves `null` on failure (it does not rethrow). Unthrown run (k=10): create succeeds and leaves 1 + 3 live, as designed. |
| R2-count | all non-skipped `__apex` hooks, mid-countdown/race, 13 bad-arg sets, PR #2595's guards in the tree | no new finding | 0 throws / non-finite / physState poison. (`act`/`step` start the race from the countdown, so the later hooks ran in `race`.) |
| R2-finish | same, after `finishRace()` (state `results`) | no new finding | 0 findings. |
| R2-snapCam | `snapCam(truthy)` | BY-DESIGN | a truthy `paint` does one sync render; 13 argument sets took minutes under SwiftShader. Not a hang in the hook. |

Not covered: hooks skipped as unsafe (net*, lobby*, career reset/delete/sim, rollout, survey, frametimeBench, audio*, race/tt/redFlag/retire), `jump`, `previewCam`, `eyeAt/groundY/projTest/scan` (read-only, NaN in -> NaN out).
