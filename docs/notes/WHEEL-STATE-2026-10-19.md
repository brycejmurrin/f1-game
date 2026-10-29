# Wheel state — scoped first slice (#1628) — 2026-10-19

## Confirm first

`rg wheelOmega|slipRatio` across `js/physics` and `js/game.js` found **no**
prior angular / slip-ratio state. Only the heuristic `c.wheelLock` from
`axFracF` vs `WHEEL_LOCK_ONSET` in `player-forces.js` (render/feel, not a
torque balance). Plan row still open:
`docs/plans/2026-09-14-mechanics-coherence.md` / Tier2 §5.

## What shipped (this PR)

| Piece | Where | Default |
|---|---|---|
| Per-axle rim speed `vwF`/`vwR`, slip ratio `kappaF`/`kappaR` | `js/physics/wheel-state.js` | — |
| Torque balance: brake/drive demand vs tyre Fx; runaway → lock/spin | `WheelState.axleStep` / `stepPlayer` | — |
| Combined-slip lateral scale from \|κn\| | returned `latScaleF/R`, applied to Fy in `PlayerForces.step` | — |
| Opt-in gate | `WheelState.setEnabled` / `apex26.wheelState` | **OFF** |
| DriveTune bag field | `WHEEL_STATE: false` | documentation only until game.js mirrors it |

**Out of scope here:** brake temperature / fade; ABS/TC levels; replacing
`game.js`'s longitudinal speed integrator with `fxF+fxR` (forbidden file this
wave — #2924 owns `js/game.js`). Follow-up: read `DriveTune.WHEEL_STATE` /
`setPhysics({wheelState})` in game.js, sync `vw*` on `jump()`/`reset()`, add
fields to `EPISODE_TRANSIENTS`, feed achieved Fx into `c.speed` and
`axEstTarget`.

## Enable

```js
WheelState.setEnabled(true);           // session / VM
localStorage.setItem("apex26.wheelState", "1");  // next resolve
```

## Proof (VM)

`node --test tests/unit/wheel-state.test.mjs`:

1. **Lock-up** — stamp brake, low grip (`weatherGrip 0.55`, `surfaceMu 0.7`),
   ~1.5 s → `kappaF < -0.08`, `wheelLock > 0.25`, `vwF < speed − 1`.
2. **Wheelspin** — full throttle + deploy at 8 m/s, reduced rear load →
   `kappaR > 0.08`, `wheelSpin > 0.2`, `vwR > speed + 1`.
3. Coast free-roll keeps \|κ\| small and `latScale ≈ 1`.

## physics-characterization

| Flag | Result |
|---|---|
| **OFF** (shipped default) | Must match `tests/data/physics-baseline.json` bit-for-bit via `physics-characterization-vm.test.mjs` — the `WheelState.enabled()` branch is never entered. |
| **ON** | Lateral Fy scales with κ; `wheelLock`/`axFrac*` become κ-derived. Longitudinal speed still comes from the legacy game.js path, so scenarios that load the ellipse hard will diverge. Recorded deltas after the ON run land in the table below. |

### ON deltas (measured 2026-10-19, `scratch/wheel-state-char-on.mjs`)

`physics-characterization-vm` with default OFF: **7/7 pass** (bit-identical to
`tests/data/physics-baseline.json`). Same recipe with `WheelState.setEnabled(true)`:

| Scenario | nDiff cells | First diverge | maxAbs highlights |
|---|---|---|---|
| straight-line accel | **0** | — | identical (no lat load; long still from game.js) |
| steady corner load | 33 | step 0 `x` 0.0035 vs 0.0041 | slipDeg ≤83.97°, speed ≤53.07, s ≤18.63 |
| trail brake into rotation | 36 | step 0 `s` (+1e-4) | slipDeg ≤85.82°, speed ≤50.33, x ≤1.81 |
| off-track recovery | 34 | step 0 `x` 11.0025 vs 11.0009 | slipDeg ≤85.40°, speed ≤30.84, x ≤3.72 |

Corner / brake / recovery diverge hard because κ spends the ellipse and there is
still no Fx→`c.speed` wiring in game.js — ON is experimental telemetry + lateral
scale only. Do **not** flip the default until that follow-up lands and these
scenarios are re-baselined.

## Second slice — Fx→speed and a calibrated demand (2026-10-19, later)

Measured on the first slice with `WheelState.setEnabled(true)` (VM, Monza,
player-dyn bench): **every dry stop locked** (κF −1, `wheelLock` 1: a fixed
40 m/s² pedal against a 26 m/s² capacity) and **stopping distance did not
change** (70.6 m from 200 km/h, ON = OFF), because no Fx reached `c.speed`.
The dry skidpad at 60 m/s fell from 2.99 g to 0.65 g. A full throttle from
0.5 m/s read κR −0.16 (a phantom lock: the rim speed relaxed slower than the
body accelerated).

Changes:

| What | Where |
|---|---|
| Demand and capacity come from PlayerForces on the legacy circle (pedal × `brakeFront` × bias, `axThrDemand × LONG_GRIP`; capacity `LONG_GRIP × weather × surface × kerb × wear × marbles × aero × axle`) | `player-forces.js` |
| Shortfall (1 − delivered/asked) goes back into `c.speed` and `axEstSm` via `ctx.axTarget` (game.js's own target, one field on an existing line; no line growth) | `player-forces.js`, `game.js` |
| Relax κ, not rim speed, while torque-limited (no phantom lock) | `axleStep` |
| Runaway when demand exceeds the lateral-slip room `√(1−αN²)` | `axleStep` |
| Lock/spin telemetry starts past the peak (κn > 1), not at 0.55 of it | `LOCK_KAPPA`, `LOCK_SPAN` |
| Lateral share = combined force's direction share, not `√(1−κn²)` floored at 0.05 | `axleStep` |
| Placement re-sync: a speed step > 80 m/s² in one tick re-syncs the rims (jump, reset, rescue) without touching apex.js | `WheelState.sync` |

After (same bench):

| scenario | OFF | ON |
|---|---|---|
| dry stop 100 / 200 / 288 km/h | 17.5 / 70.6 / 142.0 m | identical, κF −0.064, no lock |
| dry 0–100 km/h | 6.33 s | 6.33 s, κR 0.062, no spin |
| dry skidpad lock 0.6 at 30 / 60 m/s | 1.50 / 2.99 g | 1.54 / 3.07 g |
| storm, slicks, bias 0.75, stop from 100 / 200 km/h | 17.5 / 57.7 m | 18.9 / 59.7 m, κF −1 |
| grass launch, speed after 0.5 s | 1.7 m/s | 1.1 m/s, κR 1, shortfall 0.49 |

The dry skidpad gains ~3 % ON: the direction-share lateral scale gives back
more than the legacy `√(1−axFrac²)` ellipse at the same charge.

Pinned by `tests/unit/wheel-state.test.mjs` (axle shapes) and the three
`wheel state ON` rows of `tests/unit/player-dynamics-vm.test.mjs` (dry
unchanged; over-circle lock stops longer; grass spin pulls slower).
`physics-characterization-vm` stays 12/12 with the flag OFF.

## Plan to turn ON by default

1. ~~Land game.js Fx→speed wiring + jump/reset sync~~ — done, second slice above.
2. Re-measure stopping distance / skidpad / player-dyn with ON; retune
   `BRAKE_PEDAL` / `WHEEL_J` / `LONG_CAP` if lock is too eager on dry.
3. Add ABS/TC levels (Tier2 §5) before shipping default ON for digital pedals.
4. Flip default: `DriveTune.WHEEL_STATE = true`, storage default, drop the
   heuristic `WHEEL_LOCK_ONSET` path once characterization is re-baselined.
5. Only then claim brake temperature / fade on top of real lock.

## Closing slice — option B, opt-in by decision (2026-10-27)

Decision (dispatcher, on Bryce's 2026-10-27 delegation; issue #1628): the wheel
state **stays opt-in**. This slice finishes the mirror and records the
integrated evidence; turning it on by default, with ABS/TC and a re-baseline,
is #3983.

| What | Where |
|---|---|
| `vwF`, `vwR`, `kappaF`, `kappaR`, `_wsV` registered (born `undefined`, shape-stable) | `js/race/car-fields.js` |
| Same fields in `EPISODE_TRANSIENTS`: `__apex.reset()` clears them; `ensure()` re-seeds from `c.speed` | `js/agent/apex.js` |
| `tuning().wheelState`; `setPhysics({wheelState})` toggles for the session without rewriting `apex26.wheelState` (`setEnabled(v, false)`) | `js/agent/apex.js`, `wheel-state.js` |
| `DriveTune.WHEEL_STATE` documented as the default (false), not a dead mirror | `js/physics/drive-tune.js` |
| Pin: session-only toggle, `tuning()` report, reset clears the rims | `tests/unit/player-dynamics-vm.test.mjs` |

Integrated evidence on the 2026-10-27 tip. VM, monza, player-dyn `measure()`
plus a straight stop from 200 km/h; storm = slicks, BB 0.75:

| | stop 200 km/h | lock | skidpad 30 m/s, 0.6 | 60 m/s, 0.6 | 72 m/s, 0.8 |
|---|---|---|---|---|---|
| dry OFF | 70.6 m | 0 | 1.50 g | 2.99 g | 3.63 g |
| dry ON | 70.6 m | 0 | 1.54 g | 3.07 g | 3.64 g |
| storm OFF | 95.2 m | 1 (heuristic) | 1.47 g | 1.30 g | 1.21 g |
| storm ON | 97.2 m | 1 (κ) | 1.59 g | 1.01 g | 1.17 g |

Dry is unchanged within 3 %. In the storm, ON locks for real and stops 2 m
longer, and at 60 m/s grip falls further once κ spends the ellipse. That is the
physical behaviour the issue asked for; whether players want it by default is
#3983.

## SWEEP-N/A

Merge desk owns merge; no sweep message from this hunter.
