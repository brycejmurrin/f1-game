# TLX / GLX live-debug matrix on a drawing runner (#2572), 2026-10-19

Evidence for the five rows of issue #2572, per backend. No `js/` or `css/` change. The harness is
`tools/perf/live-render-matrix.mjs`, run by an opt-in leg of `gpu-census.yml`
(request field `leg: render-live-matrix-2572`, plus `lrm_leg`, `lrm_rows`, `lrm_scale`).

## Runner

`macos-latest`, Chromium, ANGLE Metal on an **Apple Paravirtual device** (the census step reports
`anyHardware: true`, adapter vendor `apple`). It draws, but slowly: the GLX perf snapshot in run
39351604149 reports `fps 1`, frame p50 4.6 s, p95 7.8 s, max 12.7 s, and a TLX first race build took 4.4 min.
Every row therefore has a time cap; a capped row is recorded as **timeout (inconclusive)**, never as a pass.
This container has no `/dev/dri`; nothing here is a SwiftShader verdict.

## Verdicts

Legend: **pass**, **timeout** (inconclusive: runner speed), **blocked** (a probe step could not run), **pending**.

| # | Row | GLX | TLX (three, WebGL2 path) |
|---|---|---|---|
| 1 | Same-circuit rebuild A/B (bahrain, monaco ×3) | **pass** (run 39351604149) | **blocked**: the second circuit's lazy load throws `circuit payload not resident: monaco` after the first race (runs 39339325536, 39354599571); see Finding A |
| 2 | Context loss during build and after settle | game self-heals by reloading within ~8 s in both phases (39351604149); final draw check capped | self-heals in the build phase (39351702257, 39354702088); remaining steps capped |
| 3 | Quality tiers, mirror/shadow/post live, NaN uniform scan | **pass** (39351604149) | timeout (39351702257, 39354702088): `page.evaluate` unanswered for >2 min after race start |
| 4 | visibilitychange / pageshow, 844×390 ↔ 390×844 | pending (run 39354499177) | timeout (39354808426): page unresponsive right after the first hide |
| 5 | Night, mirror on/off, `matTex(0/1)` | timeout (baseline, mirror off/on ran; `matTex` not reached) | timeout (39354808426) |

TLX on the `tlx-native` leg resolved to the same ANGLE/WebGL2 path as `tlx-gl` on this runner (it has a GL
context and counts uploads), so it carries no separate evidence; its rev-4 and rev-5 runs (39349367064,
39351797761) timed out the same way.

### Row 1 — GLX rebuild (run 39351604149, `= result rebuild`)

GL object live counts (created − deleted) per visit:

| visit | VAO | Program | Shader | Buffer | Texture | FBO | RBO |
|---|---:|---:|---:|---:|---:|---:|---:|
| bahrain 1 | 205 | 19 | 0 | 424 | 49 | 17 | 3 |
| monaco 1 | 198 | 19 | 0 | 419 | 51 | 17 | 3 |
| bahrain 2 | 208 | 19 | 0 | 430 | 51 | 17 | 3 |
| monaco 2 | 198 | 19 | 0 | 419 | 51 | 17 | 3 |
| bahrain 3 | 208 | 19 | 0 | 430 | 51 | 17 | 3 |
| monaco 3 | 198 | 19 | 0 | 419 | 51 | 17 | 3 |

The same circuit returns to the same live count on every revisit (visit 1 pays one-time caches).
`gpuErrors` 0 and `lost: false` at every visit. TLX `renderer.info.memory` is recorded in the TLX rows.

### Row 3 — GLX tiers (run 39351604149, `= result tiers`)

`renderScale 0.6 → govHold on → renderScale 1 → govHold off` with the HUD mirror on: 17,773 uniform uploads
scanned (`uniform{1-4}fv`, `uniformMatrix{3,4}fv`: sun direction, camera matrices, light positions), **0 NaN**,
`gpuErrors` 0, no context lost, governor tier stayed 0. Object counts moved by one VAO and two buffers across
the whole sequence (232 → 233 VAO, 458 → 460 buffers).

### Row 2 — context loss

`WEBGL_lose_context.loseContext()` 400 ms into a `race()` build, and again on a settled race. GLX
(`glx.js` "SELF-HEAL") and TLX both reloaded the page on their own within ~8 s (`ctxloss … reloaded=true`);
the game then reached the grid again. The rev-5 row hit its cap before the post-reload draw check.

### Row 4 — why the first visibility results are not verdicts

The game pauses itself on a hidden tab (`platform-session.js`: `setPaused(true, "hidden-tab")`) and does not
render while the pause card is open (`game.js` tick: `render()` only when not paused). The first probe never
resumed, so GL uploads stayed flat (28,220 on GLX, 3,892 on TLX) and its "drawing" check read false. That
was a probe error. The probe now clicks RESUME after each show, then rotates while paused and measures the canvas.

## Findings

**A. TLX: the second circuit's lazy load fails after a first race (3 runs, reproducible on TLX, not on GLX).**
`__apex.ensureCircuit(monaco)` after `race(bahrain)` rejects with `circuit payload not resident: monaco`
(`js/core/lazy-bundles.js:123`) about 67 s after the call, while `page.evaluate` is unanswered (main thread
stuck). `ensureCircuit` rejects when `loadBackendScripts` resolves `false`; `js/core/script-loader.js` resolves
`false` when a lazy file has not fired `onload` within `DEADLINE_MS = 25000`. The hypothesis is that the TLX
post-race-start work holds the main thread past 25 s, so the deadline timer fires first and a file that did
arrive is counted as failed. Unconfirmed: the log line `lazy load timed out after 25000 ms` was not captured
(the probe's diag now records it). Effect if true: a slow device that stays busy after the first race cannot
start a second circuit without a reload. Filed as an issue with this evidence.

**B. TLX on the paravirtual Metal runner is main-thread-bound for minutes per race start.** Race builds took
70-260 s and `page.evaluate` went unanswered for >2 min after `race()` on TLX in every leg; GLX answered. This is
a property of this runner's device as much as of TLX, so it is recorded as a limit of the evidence, not a defect.

## Not run / open

See the PR body for the live list. Rows marked pending above are updated in place when their runs finish.
