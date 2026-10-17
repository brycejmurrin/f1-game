# Thermal drift step and the 45/30 fps render tier (#2652)

Grant: Bryce to the orchestrator, 2026-10-17 ~10:00Z: "Yes spawn for 2652". Brief: `docs/notes/PERF-RESEARCH-2026-10-17.md` §2 item 5.
Code: `js/perf/thermal-drift.js` (pure drift detector), one `driftStep()` in `js/perf/governor.js`, and the 45/30 tier as two more modes of the cadence guard `RenderRate` (`js/perf/render-rate.js`, PR #2686) so `tickBody` has one gate.

## What shipped (both default OFF)
- **Drift step** (`localStorage apex26.thermalDrift=1` or `__apex.thermalDrift(true)`). Frames are cut into 10 s windows; the first is
  skipped, the next six fix the baseline p50; an EMA (alpha 0.15) of later window p50s that sits 12 % and at least 1 ms above it asks the
  governor for one step. The governor takes only its existing rungs (scale −0.1 via `gfx.setRenderScale`, else one feature tier) with no
  verify (a preemptive step is a bet on the future; a verify would revert it), sets `_scaleCap` so the restore gate does not climb straight
  back, then the detector re-baselines and cools for a minute; four steps per race at most. #2655 stopped (FINAL, 2026-10-17): no
  no-realloc scaling API is coming (11 render-target reallocs per governor step, monza; oracle `tlx-post state().rtResizes` and the res-scale census tool
  on PR #2683), so each step costs a realloc: that is why this is off, and why the render tier (no scale
  change) is the part to favour.
- **Render tier** (`localStorage apex26.renderRate=45|30` or `__apex.renderRate("45")`; the same key as the 100 Hz guard's `off|half|auto`).
  While racing, `RenderRate.gate` earns `rate` credits per second and draws when one is banked: 45 is 3 of 4 frames, 30 every 2nd on 60 Hz; 120 Hz
  lands on the same rate. A drawn frame gets the wall time since the last draw (clamped to render's own 1/20), so camera and visual damping run on the
  wall clock, and HUD smoothing gets the carried ms. Physics, AI, input polling and the governor's tick are untouched: the physics `while` loop above the
  gate does not know it exists. The first 90 race frames always draw (handoff card, first presents); menus, pause and XR always draw.

## Evidence
No thermal or GPU evidence exists in the SwiftShader container. `tests/unit/thermal-drift.test.mjs` proves, on synthetic series: steady and
single-hitch series never step; a minutes-long rise steps after the baseline minute; `stepped()` re-baselines and recovery stays quiet; the
cap is four; RenderRate draws exactly 60/45/30 per 60 ticks; skipped time is carried; a real `PerfGov` with drift on takes only scale rungs
and drift off never moves on a steady device. Open: a phone soak (#1633) decides whether either default should flip, and whether the p50
signal is enough on a vsync-bound device (it reads drift only once work stops fitting the refresh interval).

## Known limits
- Touch steering: input is sampled per physics step, not per draw, so latency does not grow; what the player SEES lags by up to one render
  frame (22 ms at 45, 33 ms at 30).
- Skipping a draw leaves the last presented frame on the canvas (and on `#game-soft`); no clear happens.
