# iPhone device checks over Claude Link, 2026-11-25

Kind: measurement · Re-measure-by: 2027-01-25

One hands-off bridge window on Bryce's iPhone, run through issue #6558 (skill `phone-bridge`), 07:49–08:05Z.

- **Build:** hello `facts.sha` `3cc576595e464a7026d71ff4f8730233d5c43a1e` (the #6425 train), build 29427.
- **Device:** iPhone, iOS 18.7 Safari tab (not the Home Screen app), dpr 3, landscape 852×368 CSS, UI SIZE 70 (`--ui-scale` 0.7).
- **Render:** three.js r187 on **WebGPU** (`live: webgpu`, no fallback, D-013).

Commands were read-only `call`, `frames`, `diag`, `nav`, `tap` and `drive`. The one renderer change, `path webgl2`, was
restored with `path auto`, which puts the live path back on webgpu and leaves the stored pin at `backend: "three", threePath: null`.
Long tasks are not measurable on iOS: `raceEntryProfile.supported` is false (commands.md §Cannot measure).

## Readings

| PR / issue | Run | Numbers | Verdict |
|---|---|---|---|
| #6371 HIGH dprCap 2 | Monza race, 15 s after green | 60.01 fps, p99 21, max 41 ms; dprCap 2, buffer 1704×736, userTier 0 | PASS |
| #6519 lamp gate | Monza night race, `diag` | IS_MOBILE true, MOBILE_TIER true; fx.shadows 20 at night vs 1 by day; tlxLampGrid 291 lamps; 60.0 fps | measured: the predicates agree on this phone |
| #6419 prewarm | `race("monza")`, `raceEntryProfile` | longTasks unsupported (0 = not measured); window 772 ms; post-green max 41 ms; opening window one 402 ms frame (cold), 63 ms warm | INCONCLUSIVE (`garagePrebuild` not callable) |
| #6435 SKIP | cold `nav tt monza`, then warm with `ld-skip` | watched: driveOut 11338, flyby 20078, window 37289 ms; skip: driveOut 4355, no flyby, window 5688 ms; 60 fps | PASS (phone part) |
| #6396 TT garage | `drive {to:"box"}`, END TIME TRIAL, SKIP | box reached in 139.7 s; garage in 324 ms; state results; 59.3 fps; cs-done → results → title | PASS on the route; visual pending |
| #6415 R11 / R12b | day + night race `diag` | gpuErrors 0 | R11 PASS on errors; R12b not run (bridge `path webgl2` is three-on-WebGL2, not GLX) |
| #6404 garage reuse | — | `garagePrebuild` not in `CALL_OK` | INCONCLUSIVE |
| #6424 RESOLUTION AUTO | — | desktop check; no RESOLUTION setter on the bridge; iPhone governor auto:false, chaseMs 0 | NOT RUN |
| #6486 check 0 | — | iPhone baseline only (liteGpu, tier 1 / autoShed 1 later in the session) | desktop part with Bryce |
| #6405, #6403, #6408/#6429/#6393/#6334 | — | real touches, a paired phone, a BT keyboard, a file import | NEEDS BRYCE |
| #6518, #6529, #6530, #6533 | — | still open (`land`), not in 3cc57659 | not yet deployed |

## Notes for the next window

- `BATCH_MAX` is 10 steps; a longer batch is refused whole.
- `pm-quit` is guarded: two taps 350 ms–5 s apart.
- `nav` with the default `go` answered only once the race was live, after the flyby (37 s), not at the drive-out. To tap
  `ld-skip`, use `nav {go:false}` + `tap rs-go` + a wait.
- When Bryce switches to chat, the page pauses: `drive` answers "the session is paused". Re-send once he is back.
- Bridge gaps worth adding (all read-only): `garagePrebuild` in `CALL_OK`, a GLX route in `path`, `#res-garage` in `TAP_OK`.

## Window 2 (bridge #6571)

A second hands-off window on the same iPhone, Safari tab, three.js r187 on **WebGPU** (no fallback), 08:28Z on.

- **Builds:** Safari tab: hello `d520d375` (08:28Z, portrait 393×695), then after a `reload` `8e4ff051` (08:33Z, landscape 852×368, dpr 3).
  Home Screen app (standalone): `de36c731`, build 29443 (09:24Z, landscape 852×393, dpr 3, tier 4).

| PR | Run | Numbers | Verdict |
|---|---|---|---|
| #6396 TT garage | 8e4ff051 (Safari): `drive {to:"box"}` → `tap hud-end-session until:garage` → `cs-arrival-skip` → `screen` → `snap` | box in 43 s from mid-lap (lap → approach 196 km/h → entry 67 → lane → box); `pitActions` END SESSION + PIT WORK; garage in 331 ms; `{screen:garage, state:results}`; snap 320×138 shows the drawn garage, mean luma 52.7, sd 54.1 | PASS (route and visual; Bryce confirmed END TIME TRIAL → SKIP TO GARAGE → garage → VIEW RESULTS by eye) |
| #6529 held viewport read | de36c731 (Home Screen): `display`, `geom`, `call race monza`, `go`, `frames 10`, `perf` | inner = client = visualViewport = 852×393 (scale 1); vh/svh/dvh/lvh all 393; insets L59 R59 B20; density compact, shape wide; Monza 10 s: 50 fps, p50 17, p95 42, p99 45, max 54 ms, over33 98/500; tier 4, phoneSlowLatch true, autoShed 1 | PASS on the viewport read; fps not comparable with window 1 (tier 4 app vs userTier 0 Safari) |
| #6518 portrait chase camera | not in de36c731 (merge 0d99d2d3 ships with cdcbcedd); phone held landscape | — | next window, portrait hold |

### What the attempts taught

- A real touch ends `drive` (`reason: "touch"`), twice here (pit lane at 175 s; mid-lap at 150 s). The phone must be left alone.
- `call rollout [{policy:"box"}]` reaches the box (sim-stepped, `stoppedEarly policy:box`), but a `tap hud-end-session` in the
  same batch answers "not visible (screen race)": the HUD has not rendered after the synchronous rollout. Use real-time `drive`.
- The TT starts at frac 0.977, past Monza's pit entry, so `to:"box"` from the start needs a full lap (~140–175 s) and a
  120 s rollout does not reach the box.
- A batch over 10 steps is refused whole (`batch.steps must hold 1–10 steps`).
- Bridge asks for a later PR: `tap` with a wait-for-visible, a periodic `watch` status post, a longer batch or a `when` step,
  and an on-screen "CLAUDE DRIVING" banner while `drive` holds the car.
