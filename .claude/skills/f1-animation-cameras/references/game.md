# Local game guide

Camera mode/transition ownership lives in
`js/camera/`; real-race playback in `js/race/real-replay.js`; garage pit-work arrival and
drive-out in `js/garage/arrival.js` (poses) and `js/garage/setup-camera.js`
(playback), pit lane in `js/race/pit-lane.js`. Locate symbols with `rg` rather than
following old game.js line numbers. Use `__apex.agentHelp()` for the current
hook manifest and `docs/DEBUG-HOOKS.md` for values/units.

Garage arrival ends short, then snaps (or any pit-work arrival easing bug):
`GarageArrival.pose(t, cfg, calm)` is pure — the car's `{x, z, yaw}` at time `t`;
the back-in is `ease()` (smoothstep) over `IN_BACK` along the drive-out's own arc
(`pathAt`), done at `DURATION - 0.3`. Playback is `create().step(dt)`, which clamps
`dt` to 0.1 s, scales by `config.speed`, and calls `finish()` — a jump to
`pose(DURATION)` — once `active` drops. So a visible snap means the last stepped
pose was not yet the parked one: sample `pose(t)` in Node across the last
second and assert the final-pose delta (`pose(DURATION - 0.3)` vs
`pose(DURATION + 0.5)`, which must be `x = z = yaw = 0`) is under a centimetre.
The parked-pose and same-arc assertions live in `tests/unit/garage-arrival.test.mjs`
("…backs into the bay and parks"); extend that test, not a browser capture.
Drive-out is `poseOut` with the same shape (`OUT_SETTLE`, `OUT_DURATION`).

Motion validation: stage race then readiness, `go`, seeded reset, and verify a
ready player before recording. Hold track, seed, driver, settings, wall/sim
frame policy and initial state constant in serialized A/B comparisons. Trace
entry/seek/exit discontinuities without a compensating snap or reset. For a
still framing task call `snapCam()` after `park()`/`jump()`; never call it after
`orbit()`, which owns its debug camera directly.

Use `tests/unit/camera-ride.test.mjs` for rig math, existing Flyby/garage unit
contracts (`tests/unit/garage-arrival.test.mjs`, `flyby-*.test.mjs`) for their specific owners, and [replay.md](replay.md) for the replay probe.
Unit math is independent of rendered blend/transition appearance. The parent
runs one browser at a time, captures through `awaitPresent` and shared probe
helpers, and records backend fallback, viewport and software/native hardware.
For reduced motion inspect OS media query and in-game MOTION separately.
