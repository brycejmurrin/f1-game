# Local game guide

Camera mode/transition ownership lives in
`js/camera/`; real-race playback in `js/race/real-replay.js`; garage pit-work arrival and
drive-out in `js/garage/arrival.js` (timeline, poses) and `js/garage/setup-camera.js`
(playback), pit lane in `js/race/pit-lane.js`. Never use
old game.js line numbers. Use `__apex.agentHelp()` for the current
hook manifest and `docs/DEBUG-HOOKS.md` for values/units.

Garage arrival ends short, then snaps (or any pit-work arrival easing bug):
`GarageArrival.pose(t, cfg, calm)` gives the car's `{x, z, yaw}` at time `t`. The SHIPPED
entrance is Blender-authored: `poseIn` delegates to `GarageEntranceMotion.pose` / `sample`
(`js/garage/entrance-motion.js`, data `js/data/garage-entrance-motion.js` — regenerate it,
never hand-edit: `docs/notes/GARAGE-ENTRANCE-BLENDER.md`) whenever `available()`, latched per
config. Only when the data is missing or corrupt does it fall back to the procedural back-in,
`ease()` over `IN_BACK` along the drive-out's own arc (`pathAt`). Timing for both comes from
`timeline()`; read the `DURATION` definition.
Playback is `create().step(dt)`, which clamps `dt`, scales by `config.speed`, and calls
`finish()` — a jump to `pose(DURATION)` — once `active` drops. So a visible snap means
the last stepped pose was not yet the parked one: sample `pose(t)` in Node across the
last second and assert the final-pose delta against the parked pose (tolerance: the
test below).
Authored-path contracts (phase joins, parked finish, fallback, camera) live in
`tests/unit/garage-entrance-motion.test.mjs`; the parked-pose and same-arc assertions in
`tests/unit/garage-arrival.test.mjs` ("…backs into the bay and parks"); extend those, not a browser capture.
Drive-out is procedural `poseOut` (`OUT_SETTLE`, `OUT_DURATION`).
Designing a new path or camera: the Blender previz in `docs/DESIGN-TOOLS.md`
§Garage arrival and drive-out previz (`tools/env/install-blender.sh` first); the entrance
source and export sequence are `docs/notes/GARAGE-ENTRANCE-BLENDER.md`.

Motion validation: stage race then readiness, `go`, seeded reset, and verify a
ready player before recording. Hold track, seed, driver, settings, wall/sim
frame policy and initial state constant in serialized A/B comparisons. Trace
entry/seek/exit discontinuities without a compensating snap or reset. For a
still framing task never call `snapCam()` after
`orbit()`, which owns its debug camera directly.

Use `tests/unit/camera-ride.test.mjs` for rig math, existing Flyby/garage unit
contracts (`tests/unit/garage-arrival.test.mjs`, `flyby-*.test.mjs`) for their specific owners, and [replay.md](replay.md) for the replay probe.
Unit math is independent of rendered blend/transition appearance. The parent
runs one browser at a time, captures through `awaitPresent` and shared probe
helpers, and records backend fallback, viewport and software/native hardware.
For reduced motion inspect OS media query and in-game MOTION separately.
