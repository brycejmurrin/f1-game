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
