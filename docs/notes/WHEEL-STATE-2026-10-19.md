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

## Plan to turn ON by default

1. Land game.js Fx→speed wiring + jump/reset sync (separate PR; game.js owner).
2. Re-measure stopping distance / skidpad / player-dyn with ON; retune
   `BRAKE_PEDAL` / `WHEEL_J` / `LONG_CAP` if lock is too eager on dry.
3. Add ABS/TC levels (Tier2 §5) before shipping default ON for digital pedals.
4. Flip default: `DriveTune.WHEEL_STATE = true`, storage default, drop the
   heuristic `WHEEL_LOCK_ONSET` path once characterization is re-baselined.
5. Only then claim brake temperature / fade on top of real lock.

## SWEEP-N/A

Merge desk owns merge; no sweep message from this hunter.
