# Performance and lifecycle hunt (perf-debug-e5b2, 2026-10-21)

Source: deploy tip `50cc71dd` (`claude/f1-game-project-26h3ng`). Live Pages served
`apex-sha eda39fd5` (4 merges behind the tip) when this pass started. PR #3407
(`0dcb92ea`, draft, MERGE-HOLD) was unmerged; nothing here repeats its list
(scratch `known.md` was every lane's do-not-report input), and claimed paths
(c71e, c91f, 7c2e, c7e4, h14, h16, h19, h21, #3396, w11d) were not edited.

## Method

Six read-only `code-hunter` lanes (simulation/AI, rendering/lighting,
lifecycle, UI/input, replay/net/audio, loading/assets), no browser and no
timing runs inside them. The parent owned every browser run and timing window.

Workload identity for every browser number below: Chromium 141 headless,
844×390, `hasTouch`, DPR 1, reduced motion off, Monza, 22 cars, seed 42 set
**before** `await __apex.race()`, then `go()`, `headless(true)` (step mode),
`reset(0.02, 55, 0, 42)`, input throttle + steer 0.02. Every run asserted
`info().track`, `state === "race"`, 22 cars and a field digest that moved.
Backend actually drawing: GLX on SwiftShader (the present path in the profile is
`glx.js`), not TLX — software rendering, no phone/GPU claim.

## Findings, ranked

| # | Trigger | Hotspot / bug | Evidence | Impact | Owner | Action | Validation |
|---|---|---|---|---|---|---|---|
| 1 | Wet race, onboard camera, pause → QUIT | `#fx-droplets` stays shown over the title and Home garage; `Droplets.clear()` had no caller (game.js render returns before `Droplets.tick` in the menu) | Browser repro on the deploy tip: after quit `display:block`, `shown:true`, z-index 2; patched: `display:none`, `shown:false` | Visible artifact; a full-screen fixed layer kept composited on the menu | this PR | `Droplets.clear()` in `quitToMenu` | `game-round2-vm` QUIT-FX (red on base, green), repro script |
| 2 | Any race with smoke/sparks → QUIT → race settings on another circuit | Particle pool never cleared on quit; the flyby runs `Particles.update/draw` with no state gate | Same repro: 38 live particles after quit on the base, 0 patched | Old circuit's particles drawn at its coordinates in the next flyby | this PR | `Particles.clear()` in `quitToMenu` | QUIT-FX asserts `Particles.count() === 0` |
| 3 | Pause / quit / SFX OFF / flag after a crowd cheer | Two faults: `silence()` deduped against `aim()`'s stale cached 0, and even when it did call `setTargetAtTime(0)` the cheer's pending exponential ramp replaces a SetTarget (Web Audio automation rules) | Chromium `OfflineAudioContext` A/B (`cheer-ab.mjs`, cheer peak 0.07 at 0.14 s, silence at 0.3 s): gain at 0.5 s **0.0092** with no silence, **0.0189** with setTarget only, **0.0005** with cancelAndHold + setTarget (0 by 0.8 s) | Audible cheer tail (≤0.07 gain, ≤1.2 s) over pause/results | this PR | `cancelAndHoldAtTime` (fallback `cancelScheduledValues`) on each cheer, then aim at 0 without the stale dedupe | `crowd-audio` new test (records the hold) |
| 4 | Debris opt-in, qualifying, takeover, QUIT within the window | `IncidentSim.reset()` ran after `cars = qualiField`, so trim index 0 handed back onto the full field's car 0 | VM spy: reset saw 22 cars on the base, 1 then 22 patched | Wrong-object pose write (cosmetic; next race rebuilds the field) | this PR | Hand back before the swap | `game-round2-vm` QUIT-INC |
| 5 | Every track build (props compaction) | `compact()` allocated a second same-size index buffer next to `keptIndices`' private output | Byte compare of compacted props `pos/nrm/col/mat/idx` on monza/vegas/spa: identical (`props-hash.cjs`) | −2.0 MB (monza 498,915 u32) transient per build at the build peak | this PR | Remap keptIndices' exact-size idx in place (a sealed subarray view keeps the exact copy so its spare capacity is released) | hash compare + props unit tests |
| 6 | Every AI car, every fixed step (laneX → roadOf) | Two `{sIn,sOut}` literals per call | Code-traced; ~2.5k objects/s at 21 AI (count, not timing) | Young-gen churn | this PR | Scalar `inSpan` | pit-lane unit tests; VM raw parity (no car entered the lane, so the pit path is unit-covered only) |
| 7 | Every car, every step, wind "real" (default) | `Wind.sync` built a `"seed|track"` string per call | Profile: `sync` 7 ms self over 19 frames; code-traced | ~1.3k strings/s | deploy (`4310b6bc`, same fix landed independently; this branch takes it at the merge) | Two scalar keys | VM raw parity, wind tests |
| 8 | Every frame with AUDIO DRIVING CUES and the predictive cue on | `BrakeCue.debug()` (2 objects, 2 `toFixed`) evaluated before the urgency gate | Code-traced; new test counts calls | Per-frame garbage | this PR | Ask only past the gate | `driving-cues` new test (red on base) |

Simulation parity for #6–#8: raw IEEE bytes of every primitive field of all 22
cars, every 100 steps for 6,000 steps, base vs patched, through the real game
in the Node VM (`scratch/perf-e5b2/parity.cjs`; wind real, tyre wear real,
three AI pit calls): **identical** on bahrain dry, monza rain and vegas dry.

## Leads checked and left (do not re-hunt)

- **GLX `getError` dominates the rendered-frame profile here.** It is the
  bounded 30-present boot drain (`DRAIN_PRESENTS`) absorbing SwiftShader's
  raster sync, not a steady-state cost. A PerfGov tier-1 shed calls
  `envProbeReset()`, which re-arms that drain for 30 presents; this is minor
  and GLX-only, and `glx.js` is claimed (c91f).
- **Fixed-step profile** (3,000 steps, profiled): `updateCar` ≈ 65 % inclusive;
  AI brake plan, collide and tyre are the leaders and are #3407's scope. In
  `__apex.step` mode `race-radio`, engine `setEngine` and HUD rect reads show
  per step only because the harness has no frame stamp; the game gates them
  to once per frame (`_s8Stamp`, `_audioParamStep`).
- WATCH `watchTimeline` rescans lap rows every frame (~1.4k compares): µs-scale,
  next to 7c2e's WATCH ownership; left.
- `hud-relative` `fitRows` once a second (opt-in RELATIVE box), `HudInputs`
  before `fitHud` (opt-in INPUTS), duplicate same-key rect reads in `fitHud`,
  `layers.js` navOpen memo dropped by HUD root custom-property writes (pad
  polling only): all low, unmeasured.
- `tsl-lit.updateFrame` / `tlx-post.present` per-pass helper closures: 4–6
  short-lived functions per frame; not worth the churn.
- `tracks.js` `idx.every` + `Uint32Array.from` double scan, `surface.heightAt`
  duplicate pit-band call, debris `drainForces` per-step closures/`toFixed`
  (opt-in debris), weather-arc / race-control SC-only allocations: low.
- `wheel-state.js` evaluates the one-argument (FRONT) lateral curve in its
  combined-slip Fx path, so zero-alpha Fx peaks near κ≈0.081 rather than
  KAPPA_PEAK 0.10 (opt-in `apex26.wheelState`). c91f's source review (bus
  f935d36) narrows it: PlayerForces keeps the rear pure-lateral plateau, so the
  defect is rear combined-slip scaling. Needs per-axle force characterization;
  not edited here.

## Limits

Fixed-step A/B (the workload above, 1,500 warm + 3,000 timed steps, three
repeats per page load, eight loads in B-H-H-B-B-H-H-B order, run 0 of each load
dropped as JIT warm-up, nothing else running): base median **1038.9 ms**
(911.6–1256.2), patched **1045.8 ms** (915.3–1187.7), n = 8 each. No measurable
change either way: #5–#8 are allocation and peak-memory fixes, not a step-time
claim. Raw lines: `artifacts/logs/perf-e5b2-abba.log` in the working checkout.

No physical-device, Safari or GPU timing. Allocation figures are counts of
constructed objects, not heap or GC measurements.
