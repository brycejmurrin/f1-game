# Fixture and evidence contract

`replay-camera-probe.mjs --help` is the CLI authority. `--fixture default`
uses the checked-in Baku race data fixture (requires `--track baku`); explicit
track-frame traces are honored, otherwise the probe builds deterministic synthetic
two-car track-frame traces; `--fixture FILE` validates an explicit fixture
before any server/browser boot. `--track`, `--backend three|webgl2|webgpu`,
`--frames 1..120`, `--seed <uint32>` and contained `--out artifacts/...` select
a bounded run. `--plan` performs offline preflight and creates no outputs.
Start software-rendered smoke with one frame per phase at 640x360; increase
frame counts for a longer motion sample when rendering capacity permits.
`--timeout-ms 1000..900000` bounds the whole run. Each operation records its
effective budget and elapsed time; exhausted budgets remain failed evidence.

Keep entry, seek, follow, exit and reentry in one session. Do not manually reset
the camera between phases: that masks retained replay anchors. Capture frame
state, followed-car/world anchor, camera eye/target and backend-presented pixels
for entry/seek/follow/reentry. Exit records the menu and stopped replay explicitly;
a menu has no race-camera frame.
Inspect pre/exit saved and live camera preferences for restoration; compare
`cameraState()` eye/target/lens/damping anchors and simulation/replay clocks
separately from browser callback timestamps. Renderer presentation counters
are included only when exposed; private spring velocities are not observable.
Assert finite anchors and expected ownership separately from visual review;
a PNG byte count alone cannot establish nonblank or correct framing.

Offline smoke evidence covers only the reported fixture contract. A plan is
`not_run` browser evidence. Live failure, fallback, unsupported device or omitted
phase must remain explicit in the receipt. A software WebGPU run cannot prove
native Apple/Windows GPU behavior. Never contact OpenF1 to make a smoke fixture.

Research: [Playwright Page](https://playwright.dev/docs/api/class-page), checked
2026-10-01: wait options are the third `waitForFunction` argument. Use finite
polling and the shared backend-aware presented-canvas capture helper.
