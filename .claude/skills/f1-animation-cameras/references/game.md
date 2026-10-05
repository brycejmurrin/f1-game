# Local game guide

Repository: `brycejmurrin/f1-game`. Read root `AGENTS.md` before implementation.
No build step; static IIFE modules. Camera mode/transition ownership lives in
`js/camera/`; real-race playback in `js/race/real-replay.js`; garage pit-work arrival and
drive-out in `js/garage/arrival.js` (poses) and `js/garage/setup-camera.js`
(playback), pit lane in `js/race/pit-lane.js`. Locate symbols with `rg` rather than
following old game.js line numbers. Use `__apex.agentHelp()` for the current
hook manifest and `docs/DEBUG-HOOKS.md` for values/units.

Motion validation: stage race then readiness, `go`, seeded reset, and verify a
ready player before recording. Hold track, seed, driver, settings, wall/sim
frame policy and initial state constant in serialized A/B comparisons. Trace
entry/seek/exit discontinuities without a compensating snap or reset. For a
still framing task call `snapCam()` after `park()`/`jump()`; never call it after
`orbit()`, which owns its debug camera directly.

Use `tests/unit/camera-ride.test.mjs` for rig math, existing Flyby/garage unit
contracts (`tests/unit/garage-arrival.test.mjs`, `flyby-*.test.mjs`) for their specific owners, and **replay-camera** for the replay probe.
Unit math is independent of rendered blend/transition appearance. The parent
runs one browser at a time, captures through `awaitPresent` and shared probe
helpers, and records backend fallback, viewport and software/native hardware.
For reduced motion inspect OS media query and in-game MOTION separately.

Host integration: repository paths are the local adapter. An unavailable hosted
skill resource or MCP transport is an upstream capability limit; supply host
catalog metadata to `tools/check/doctor.mjs` and report it rather than claiming
local game changes repair the host. No account or external messages required.
