# Player physics — tier 2 and beyond: research, designs and ranked plan (2026-09-16)

Second research round, run while tier 1 (`docs/notes/PLAYER-PHYSICS-RESEARCH-2026-09.md`)
was in its browser groups. Four read-only passes: a scored brainstorm across
the whole surface, web research on the shared longitudinal laws and AI pace
balance, concrete designs for the feedback channels and pad assists, and an
implementation plan for the slip-ratio model (§5). Nothing here is built;
every item names the bench number that must move.

## 1. Two findings that change tier 1's follow-up

- **`frontUtil` / `rearUtil` are non-monotonic now.** They are `|Fy| / mu`,
  which peaks at 1.0 and FALLS to 0.75 past the peak of the new curve — so a
  consumer keyed on `util > 0.9` goes quiet exactly when the driver has
  overdriven most. `js/race/driving-coach.js` keys its front/rear sliding
  tips on 0.9, and `__apex.obs()` publishes both. Fix: publish the curve
  abscissa normalised to the peak (`x / CURVE_PEAK_X`: 1.0 = at the peak,
  above it = past) as the utilisation, which is monotonic, and key the coach
  on it. Shipped with tier 1's follow-up commit.
- **The lock-up render is unreachable in the dry.** `c.wheelLock` fires at
  `axFracF > 0.92`; full dry braking is `BRAKE / LONG_GRIP = 22 / 34 = 0.65`,
  rain on slicks `0.90`. It was equally unreachable before tier 1 (the shared
  fraction had the same ceiling). Item 4 below makes lock-ups a consequence
  instead of retuning the threshold.

## 2. Ranked ideas (brainstorm, 36 scored; score = impact × confidence ÷ cost)

| # | Idea | Score | Measure |
|---|---|---|---|
| 1 | Extract the player force block from `updateCar` into a new `js/physics/` module (proposed name: player-model) (bit-identical; buys ratchet room for everything below) | 2.0 (enabler) | `player-dyn.mjs --json` and `physics-baseline.json` unchanged |
| 2 | Pre-limit tyre **howl** audio layer keyed to the front's approach to its peak, distinct from the over-limit squeal | 4.0 | new audio-tune mapping test; howl > 0 at lock 0.6, squeal 0 there |
| 3 | **Keyboard-path bench**: drive `player-dyn` through `Input.digitalStep` and the pedal booleans, not `setInput` | 4.0 | new rows kbSlalom / kbHairpin / kbFlick — today every keyboard claim is inferred |
| 4 | **Aero-limited braking** shared with the AI planner (§3.2) | 2.0 | `brake_55.6.g_avg` 2.14 → ~3, `brake_27.8` ≈ 1.5; `wheelLock` > 0 at the end of a zone |
| 5 | **Grip steer**: pad/touch/keys steering cap at the front's peak slip + countersteer allowance, slider, default OFF (§4.1) | 2.0 | with cap on: `flick.fullLock_deg ≈ smooth_deg`; skidpad lock 1.0 `ay_g` == lock 0.8 |
| 6 | Dirty air hits the front harder than the rear (front wing first): per-axle `dirtyAirMul` for humans | 2.0 | new `wakeSkidpad` row: `aF` rises, `aR` flat |
| 7 | Load-sensitive peak μ (Perantoni 1.8 → 1.45 from 2 → 6 kN) | 1.8 | `turnIn_brake.yaw / turnIn_coast.yaw` 2.27 → ~1.6; lift-off still rotates |
| 8 | Speed-weighted kerb stall (2026 floor): kerb penalty scales with aero share | 1.8 | `kerbSkidpad` at 20 vs 60 m/s: −10 % vs −40 % |
| 9 | Asymmetric key return (to-centre 0.75× steer-in, crossing to opposite lock 1.5×) | 1.8 | kbSlalom overshoot down; `digital-steer.test.mjs` re-cut |
| 10 | Speed-scaled yaw damping (`YAW_DAMP · clamp(20 / vStd, 0.5, 1)`) | 1.8 | `stepSteer.overshoot_pct` 0 → 8–15 % at 50 m/s, `fullLock.yawMax` still bounded |

Flagship by impact, ranked lower only by cost: **11. scrub drag + the
power-limited acceleration law** (§3.1, §3.3) and **12. the per-axle
wheel-speed / slip-ratio state** (§5). Other scored items: preset-linked
curve shape (owner decision: a preset that changes lap physics splits
records); cold tyres lowering cornering stiffness, not just μ; an
engine-braking map on the setup sheet; brake bias mid-lap (owner decision:
no sixth touch-dock slot); gear-aware traction cap for manual gears; X-mode
balance shift (sign unknown); keyboard pedal ramps (measure first — `axEstSm`
already smooths the charge); a stability-control assist past the rear's
peak (own-state only, legal; default OFF); lock-up haptic (dead until item
4); HUD grip bars (§4.4); chase-cam yaw lag; coach tips from the per-axle
signals (§4.5); an ISO 7401 sine-sweep bench; a player-lap-vs-AI gate with
≥ 6 seeds. Rejected with a number: tyre relaxation lag (τ = 0.5 m / v is
11 ms at 45 m/s against a 100 ms step response) and a differential (a
relabel of `DRIFT` without wheel state).

Owner decisions the list needs: may a preset or a default change lap
physics (and are records tagged by assist class); what ROOKIE and RELAX
bundle (grip steer, stability control and auto-brake each hide part of the
tier-1 model from the players they target); where brake bias lives on
touch; HUD clutter policy; whether a second pace-ladder re-cut in a week is
acceptable (items 4 and 11 both force one).

Suggested order: 1 → 3 → 2 (no physics change, no `REVISION`) → 7 + 6 + 8 +
10 in one `REVISION` bump with one characterization re-baseline → 4 with the
AI re-cut → 5 + 9 as the controls session → 11 → 12.

## 3. Longitudinal laws (shared with the AI; a pace rebalance)

All formulas in `u = v / vTop()` so the RACE PACE slider scales the envelope
and never shrinks it; constants that are accelerations stay absolute unless
they carry `PACE` today.

### 3.1 Power-limited acceleration

Today `a = ACCEL·PACE·(1 − u)·gearMult` — an exponential approach whose
top end is asymptotic: 0.3 → 0.9 vTop takes 20 s / 837 m. A real car's
traction limit RISES with downforce until the power crossover (~0.5–0.6 of
top speed), then falls as `P / v`:

```
a(u) = min( A0·(1 + K_A·u²),  C / u ) − C·u²      A0 = ACCEL·PACE, K_A = 2.1, C = 5·PACE
```

`a(1) = 0` exactly, so `vmax` stays the ceiling and `accelCeil` semantics
hold. Computed at pace 0.84: t(0.286) 2.8 s, t(0.571) 5.3 s, t(0.857) 9.5 s,
t(0.92) 11.9 s; ratios t(0.571)/t(0.286) = 1.84 and t(0.857)/t(0.286) = 3.34
against real F1's 1.73 and 3.3–4.0 (today: 2.51 and 5.77). Cost: 0.3 → 0.9
vTop in 8 s / 327 m — every real-length straight reaches vTop and lap times
drop a lot, for the AI too. One shared helper (`accelShape(u)` in
`PhysicsConsts` or a new longitudinal module under `js/physics/`) read by `updateCar`'s
throttle integration, its `axEstTarget`, and `AiDrive`.

### 3.2 Speed-dependent braking

Brembo corner cards: 4.3–4.8 g peaks, 2.5 g means; 100 → 0 km/h in < 15 m;
downforce = weight at ~150 km/h; g(300)/g(100) ≈ 2.3 (a pure `1 + (v/v_w)²`
overshoots to 3.5 because μ falls with load).

```
a_b(u) = B0·(1 + K_B·u²)·tractionMul·brakeLvl        B0 = 12 m/s², K_B = 2.1
d(u1→u2) = vTop()² / (2·B0·K_B) · ln((1 + K_B·u1²) / (1 + K_B·u2²))          // TORCS `brakedist` form
entry² = ((1 + K_B·uC²)·exp(2·B0·K_B·0.85·d / vTop()²) − 1)·vTop()² / K_B  // replaces AiDrive.brakeTarget's vC² + 2·brake·0.85·d
```

Computed: g(0.88)/g(0.29) = 2.23; the 0.9 → 0.3 vTop stop is 60 m, identical
to today's flat 22 m/s² (B0 = 11.9 makes it exact) — lap-neutral by
construction, with later fast-corner entries and gentler slow ones (1.45 g
at 0.3 vTop). The same helper must feed `brake-cue.js`'s urgency,
`race-insights.js`'s peak-decel and `driving-coach.js`'s `/BRAKE`
normalisation, or they read > 1. With it, `axFracF` exceeds 1 at the end of
a zone unless the driver eases — lock-ups, flat spots and the lock-up haptic
become real without a slip-ratio state.

### 3.3 Slip scrub

`ax_scrub = −(Fyf·sin αf + Fyr·sin αr)` on `c.speed`, scaled by a
`SCRUB_GAIN` (0.6–1.0) and capped at `LONG_GRIP / 2`. Pace-invariant by
construction (both `Fy` and the accel law are absolute); reads own slip only.
Ships in the same change as §3.1: today the car has ~1.5 m/s² to pay scrub
back at 45 m/s, with §3.1 it has 6–8. Measure: skidpad at lock 0.75 vs 1.0 —
the flick loses speed, the smooth input does not.

### 3.4 Engine braking and harvest

`COAST_DRAG` (flat 6 m/s²) becomes `C_E·ebMap + C·u²` — an rpm/gear floor
plus the SAME drag constant as §3.1, so coast and throttle share one drag
and lift-off decel is ~4× stronger at 0.9 vTop than at 0.3 (drag-dominated,
as on the real car: ~1 g at 300 km/h, 0.2–0.3 g at 100). `ebMap` in
[0.3, 1] as a setup-sheet slider (F1 24 / rFactor 2 style) that also feeds
the ERS harvest rate and the rear axle's ellipse charge, so lift-off
oversteer becomes speed-dependent for free. `xCoastCut` keeps scaling the
drag term only.

### 3.5 AI pace balance

Every shipped title calibrates AI to a REFERENCE LAP per circuit with a
multiplicative strength scalar and validates by measured lap-time deltas
(rFactor `.AIW` Worst/Mid/BestAdjust; Codemasters' slider ≈ 0.12 % of lap
time per point, third-party measurement). Recipe: (1) freeze today's AI lap
per circuit from `tools/check/ai-race.mjs pace` into `tests/data/`; (2) after
§3.1–3.4 land, fit one calibration per circuit class so the median AI lap
returns to reference ± 0.5 %; (3) document the per-notch lap delta of the
RACE PACE slider; (4) validation table per circuit: reference lap, new AI
lap, player-bot lap, straight-line share of the delta. The AI's
`lateralScale` (falls with speed) and the player's `aeroGrip` (rises) must be
unified in the same pass or the calibration fits two different cars.

### 3.6 Target table (pace 0.84)

| quantity | today | proposed | real F1 shape |
|---|---|---|---|
| t(0.571) / t(0.286) | 2.51 | 1.84 | 1.73 |
| t(0.857) / t(0.286) | 5.77 | 3.34 | 3.3–4.0 |
| t(0.92 vTop) | 26.0 s | 11.9 s | — |
| brake g(0.88) / g(0.29) | 1.00 | 2.23 | ~2.3 |
| stop 0.9 → 0.3 vTop | 60 m | 60 m | lap-neutral by choice |
| coast decel(0.9) / (0.3) | 1.0 | ~4–5 | ~4 |

## 4. Feedback and assist designs (reports-only or assist-gated; no curvature)

Shared signal: the curve abscissa `x = cs·|α| / mu` per axle (`sat` /
`satR` already exist as locals in the force block), peak at `π/2`, plateau
to ≈ 2.1, 0.85 at 3, floor 0.75 by ≈ 5. All designs key on `x`, never on
`util`.

### 4.1 Grip steer (assist-gated slider; AC Advanced Gamepad Assist, BeamNG Advanced Steering, LFS "stabilised")

Right after `driverDelta`, player only, reads `vLat`, `yawRateCur`, `speed`,
`muF`, `CS_FRONT`, `steer`:

```
βf = atan2(vLat + af·r, vx); βr = atan2(vLat − ar·r, vx)     // front-axle velocity angle, slide angle
αpk = (π/2)·muF/CS_FRONT · TARGET (0.95)
capIn  = αpk + clamp(s·βf, −0.5·αpk, ∞)   (×0.9 while braking)   // "dynamic limit" while oversteering
capCtr = (0.1 + 0.6·CR)·αpk − s·βr         CR = 0.3               // countersteer to the slide angle + 0.28·αpk
cap = lerp(capIn, capCtr, smoothstep(0, 0.05, −s·βr)); cap ≥ 0.25·αpk; low-pass τ 40 ms
δcap = s·min(|driverDelta|, cap)
self = clamp(−βr·0.35, ±0.5·αpk) − r·0.012;  self *= (1 − 0.7·|shaped|)   // caster self-centre, input authority
δ = lerp(driverDelta, δcap + self, k · smoothstep(2, 6 m/s, speed))       // k = slider; off at rest and in reverse
```

Slider `pm-gripsteer` 1..10, notch 1 = OFF; defaults STANDARD/PRO OFF, RELAX
6, ROOKIE 8 (owner decision). Store key `apex26.gripSteer` in `PRESETS`,
`PRESET_STORE`, `STEER_LEVELS`. No curvature site — guard with a source-regex
test (no `Tracks`, `curvature`, `kCur`) and keep the characterization
bit-identical at notch 1. Countersteer is faster than steer-in by
construction (the cap tracks the slide angle), which is what tier 3's
asymmetric-return item wanted.

### 4.2 Tyre voice (two layers × two axles)

```
approach(x) = smoothstep(0.70, 1.00, x / PEAK)      // onset matches the front haptic (1.15)
past(x)     = smoothstep(1.00, 1.90, x / PEAK)      // full by x ≈ 3 (force 0.85, "stretched")
HOWL  per axle: bandpass Q 8, f = 1500·(1 + 0.25·approach)·trim, gain 0.09·approach·(1 − 0.6·past)
SQUEAL per axle: the existing voice, f = (wet ? 480 : 760)·trim + 320·past − 120·past², gain 0.16·past·(wet ? 0.6 : 1)
trim: front 1.12, rear 0.88; rear pans ±0.35 to the outside of the slide
```

Keep `skidIntensity` for marks, smoke and wear. Export the pure mapping
(`tyreVoiceParams(xF, xR, wet)`) for a unit test without Web Audio. Sources:
Lost Chocolate Lab's racing sound study ("a howling sound as a tyre
approaches its grip limit"; Forza 4's four independent tyre voices), AC and
ACC community practice of driving by scrub vs skid volume.

### 4.3 Camera and body (render-only)

Roll from `c.lateralAccel` instead of `speed·yawRate` (force leads yaw rate,
so the lean precedes the rotation); a rear grip-loss sag `+0.25·ROLL_MAX·
past(x_r)`; pitch `−0.3·PITCH_MAX·wheelLock`; chase camera only: heading lag
τ 0.12 s and FOV −2° under hard braking / +2° on a planted throttle above
half vTop, damped through the existing FOV path. Onboard cameras untouched
(F1 24 players turn shake off). No developer statement of a "perceptual
minimum" was found; Mather (F1 24) names weight transfer as the missing
feel.

### 4.4 HUD grip bars (off by default, `apex26.hudGrip`)

Front and rear bars, fill = `min(x / PEAK, 1)`; past the peak the fill stays
full, the bar turns red AND its end-cap changes shape (chevron) with a
hatched fill — colour is never the only channel (XAG 103). A lock glyph on
`wheelLock`, a spin glyph on `axFracR > 0.9 && x_r > PEAK`. 20 Hz, 60 ms
ease-down so a flick is visible.

### 4.5 Coach tips from the per-axle signals

First fix the 0.9 util thresholds (§1). Then five tips on the existing
dwell/cooldown machinery, thresholds in `x` so pace does not move them:

| id | trigger | text |
|---|---|---|
| patience | `x_f > 1.9` and steer still rising, speed > 0.3 vTop | MORE LOCK ISN'T TURNING — HOLD THE WHEEL AND WAIT |
| feed | throttle +0.4 in 0.25 s and `x_r` crosses the peak within 0.4 s, `axFracR > 0.5` | FEED THE THROTTLE — THE REAR STEPPED OUT ON THE PEDAL |
| brakePeak | `wheelLock > 0` and `x_f > 1.2` with steer applied | EASE THE BRAKE — A LOCKED FRONT WON'T TURN |
| flick | steer jump > 0.6 in 0.15 s and `x_f` from < 1.0 to > 1.9 inside 0.3 s | SMOOTHER TURN-IN — THE FLICK COST FRONT GRIP |
| spare | per corner: max `x_f`, `x_r` < 0.9 and slower than the ghost at the apex | GRIP TO SPARE — CARRY MORE SPEED IN |

## 5. Implementation plan: the slip-ratio model, aero braking, power law, scrub

Player-only for the wheel state and scrub; the braking and acceleration laws
are shared because the AI plans and integrates off the same seams.

**Module.** a new file under `js/physics/` (proposed: wheel-slip) → `window.WheelSlip`, pure functions
over numbers with hoisted scratch objects (the `_aiBr` idiom), no `create(G)`,
zero new `G` members: `axleStep(state, params, out)`, `decelAt(v, q)`,
`entrySpeedSq(vC, d, q)`, `accelAt(vStd, vmaxStd)`, `assistK(level, digital)`.
Manifest after `tyre-model.js`, before `ai-drive.js`, HARD_EDGES to
`mat4.js`, `consts.js` and `game.js`; then `gen-shell`.

**State per human car** (rim speed in m/s, not ω): `vwF, vwR, kappaF,
kappaR`, ABS/TC latches and hold timers, smoothed `absAct/tcAct` for haptics,
`wheelSpin`, achieved `fxF/fxR` (one-tick lag), torque demands. Initialised
in `makeCars`, synced to `speed` on `jump()`/`reset()` and when non-finite,
all added to `EPISODE_TRANSIENTS`.

**Maths per axle** (accel units per unit mass, as today): `κ = (vw − vx) /
max(|vx|, KAPPA_VMIN)`, `κn = κ / KAPPA_PEAK`, `αn = α / αpeak` with `αpeak =
CURVE_PEAK_X·muLat / cs`; `ρ = hypot(αn, κn)`; `f = TyreModel.lateralCurve(ρ·
CURVE_PEAK_X)` — ρ = 1 is the peak on both axes, so a freely rolling wheel
recovers today's lateral path bit for bit. `Fy = −muLat·f·αn/ρ`, `Fx =
muLong·f·κn/ρ`: a locked wheel (κ → −1) keeps 0.75 of its longitudinal
force and ~7 % of its lateral — lockup understeer for free; wheelspin is the
rear's mirror. Torque-limited regime: κ relaxes to the closed-form `κ*`
over `KAPPA_RELAX_M` (0.4 m); runaway regime (demand beyond the ellipse):
explicit `vw += (aReq − Fx)/WHEEL_J·dt` with an impulse clamp so a step never
carries `vw` back across `vx`. `muLong = LONG_CAP·load·surfMu·gripMult·
tractionMul·aeroGrip·kerbGrip`, so braking capacity rises with v² and shifts
forward under decel. Demands: brake by bias per axle (`SetupTune.bbScales`
retires from the player path), drive + ERS on the rear, engine braking on
the rear (replaces `brakeMix`). The human's three `c.speed ±=` lines become
one: `c.speed += (fxF + fxR − scrub)·dt`; `axEstTarget` becomes the ACHIEVED
longitudinal force so load transfer, `brakeYawDamp`, the coach and the cue
keep their meaning. Telemetry names keep their meaning with κ behind them
(`axFracF/R = min(1, |κn|)`, `wheelLock` from `−κF`, `wheelSpin` from `κR`);
`car-draw.js` spins the front wheels from `vwF` so locked fronts freeze.

**ABS / TC as levels** (`off | medium | full`, default medium): torque
clamps with hysteresis — latch when `κ` passes the level's threshold, cut
torque by `cut`, hold ≥ 50 ms, release above threshold + `KAPPA_HYST`; the
8–12 Hz latch flicker IS the ABS feel and drives a haptic. **Pedal help**:
only when the level is `off` AND the pedal source is digital (keys, touch,
auto-throttle): wide thresholds, soft cut — you can still lock and spin,
just not from a binary pedal alone. Two setting rows next to gears, re-read
in `onAssistBundle()`, registered in `settings-export`.

**New constants**: `LONG_CAP 26` (absolute, like `LAT_MAX`), `BRAKE_PEDAL
40` (absolute full-pedal torque, above capacity below ~vTop/2 so lockups are
real), `KAPPA_PEAK 0.10`, `KAPPA_MAX 1`, `KAPPA_VMIN 3` m/s (compared to a
local `vx`, never `.speed`), `KAPPA_RELAX_M 0.4`, `WHEEL_J 0.10` (a lock
takes ~100 ms at 40 m/s, above the physical 0.04 for driveability),
`KAPPA_HYST 0.06`, `ABS_HOLD 0.05`, the `ASSIST` table (medium abs 0.20 /
tc 0.22 / cut 0.55; full 0.12 / 0.14 / 0.45; help 0.35 / 0.35 / 0.75).
`LONG_GRIP` and `THR_*` retire from the player path.

**AI consistency — one shared `decelAt(v)`** (option 3 of three): the AI's
`_aiBr` carries `{a0, β, vTop, pedal}` and `brakeTarget` replaces `vC² +
2·brake·0.85·d` with the closed form `u_entry = (u_C + vT²/β)·exp(2·USE·a0·β·
d / vT²) − vT²/β` (pedal cap by splitting at the speed where capacity meets
the pedal); the AI brake integration and `queueBrake` read `decelAt`;
`brake-cue`, `quali-model.lapTime`, `drivingLineApi` and the coach's
`brakeUse` move to the same function or they disagree with the car. The
other two options — a duplicated table, or capping the player at today's
2.2 g — were rejected (drift, and burying the point).

**Power law, shared, preserving vTop and the PACE structure**: today `a =
PACE·a_std(v/PACE)`; keep that and change `a_std`:
`a_std(v_std, vmax_std) = min(ACCEL, POWER_K / max(v_std, ε)) − POWER_K·
v_std² / vmax_std³`, with `ACCEL 7 → 12` and `POWER_K 420`. Drag is derived
from each car's own `vmax`, so `a(vmax) = 0` exactly and tow, X-mode, tier,
pit and caution caps all keep working; `accelCeil` is untouched. 0–100 ≈
3 s, 0–200 ≈ 10–12 s at pace 0.84. (§3.1's `u`-form is the same law written
on the top-speed scale.)

**Scrub**: `SCRUB_K·(|Fyf|·sin|αf| + |Fyr|·sin|αr|)` subtracted in the single
human integration line, previous-tick values, `SCRUB_K 1.0`. The
steer-projection term is a named follow-up.

**Tests.** Re-baseline `physics-baseline.json` (browser) after steps 2, 5
and 6 (or once if they ship together) and read each diff. Extend
`player-dyn.mjs` and its VM test with: braking g rising with speed; lockup
with ABS off (`κF < −0.5` within 0.3 s, `FyF/muF < 0.3` while steering);
the TC ladder on a hairpin exit (off > medium > full, off still > 0.3);
pedal help between raw-off and medium; the keyboard hairpin with medium;
`t200 < 14 s`; full-lock speed loss > coast loss + 2 m/s; lock-onset chatter
≤ 2 sign flips/s. Will break and must be re-pinned, never loosened:
`gfx-backend-canary`'s lock-up and wheel-spin pins, `physics-rows-vm`'s
`THR_*` pin, `mechanics-integration-vm`'s braking-drill ideal (from
`entrySpeedSq`), `episode-transients`, `load-order`, `ratchets`, the coach
test's `PhysicsConsts` mock, `settings-export`. Verify and re-read:
`longitudinal` (both twins), `sliders` "OVERALL SPEED reaches the full
gearbox" (the power law reaches 0.83 vTop in ~12 s), `drift`,
`understeer-cue`, `ai-racecraft-vm`, `speed-cap-vm`.

**Budget.** `game.js` sits at its line ceiling (one line of headroom).
Step 1 extracts the per-axle force block (~110 lines) into
`WheelSlip.axleStep` with identical maths; the call site is ~35 lines, net
≈ −75, which pays for the assist rows, the demand lines and scrub. No new
`G` members unless `G.decelAt`/`G.accelAt` are needed by quali-model and
the driving line in the same change (then +2, stated in the commit). No new
top-level `let`s (`const playerAssist`).

**Order, with a gate after each step.**
0. Bench rows first; capture the current tree's `--json`; existing 9 shape
   tests green.
1. Module + extraction with identical maths: `physics-characterization-vm`
   green WITHOUT re-baseline; ratchets lowered; load-order green.
2. Wire κ, demands, the single integration line, achieved-force
   `axEstTarget`, `BRAKE_PEDAL` initially 22: `brake_27.8` within ±5 %;
   trail-brake still rotates; lockup row passes at `PLAYER_GRIP 0.5`;
   chatter ≤ 2/s; baseline re-cut #1.
3. ABS/TC levels, pedal help, settings, `physState`, transients, wheel
   render: TC ladder monotonic; ABS medium stops shorter than off-locked
   from 55 m/s; keyboard hairpin; transients green.
4. `BRAKE_PEDAL 40`, `decelAt`/`entrySpeedSq` into the AI planner and every
   flat-`BRAKE` reader: brake-g ladder rises with v; `ai-pace.mjs` all three
   levels faster by a similar fraction, spread ±0.3 %; `ai-human.mjs`
   follower not out-braked into T1 by > 0.1 s.
5. Power law for every car: `t100 ≈ 2.5–3.5 s`, `t200 < 14 s`; the sliders
   "full gearbox" logic replayed in the VM at three paces; AI pace
   re-measured; `REVISION`; baseline re-cut #2.
6. Scrub: flick ratio < 2.0; skidpad rows hold speed at lock ≤ 0.6;
   full-lock 2 s loses > 5 m/s; AI pace unchanged; baseline re-cut #3.
7. Docs (`PHYSICS.md` combined slip around ρ, a longitudinal-law paragraph,
   the braking section, `DEBUG-HOOKS.md`, `CEILING-HISTORY.md`); verify per
   AGENTS.md (tooling-fast, then the two most specific browser groups).

**Keyboard and touch (binary pedals).** A binary brake with `BRAKE_PEDAL`
above capacity locks the fronts instantly, so ABS medium ships as the
default and `off` + a digital source gets pedal help — and step 3 precedes
step 4 on purpose so keys never meet the strong pedal without it. A binary
throttle against a rear capacity of ~14 m/s² static is traction-limited on
the launch but not a spin; mid-corner it is power oversteer, held by TC
medium and the keyboard-hairpin gate; touch auto-throttle counts as digital.
Grass scales `muLong` too or a grass brake never locks. Reverse crawl keeps
the scalar path. Remote humans are pose-replicated and untouched;
`REVISION` keys the handshake and records. No `Math.random`; every new field
in `EPISODE_TRANSIENTS`; `determinism-replay-vm` is the guard. Out of scope,
named: one grip law for AI `lateralScale` vs player `aeroGrip` (item 8),
the scrub steer-projection term, a TC audio cut, AI rear-wheel spin render.

## 6. Sources (round 2)

Marco Monster "Car Physics for Games"; Physics Forums "When vehicle power
dictates acceleration"; Vehicle Physics Pro engine block; Wassimulator
"Programming Vehicles in Games"; FastF1 telemetry gallery; Wikipedia
"Formula One car"; Brembo corner cards via scuderiafans / conceptcarz /
thebrakereport; Autosport "the complicated art of F1 braking"; Mercedes
"Downforce explained"; TORCS `bt` driver `brakedist`; rFactor AI tutorial
(`.AIW` adjusts, grip-usage fractions); f1laps AI difficulty measurement;
formula1.com 2026 power-unit explainer; Honda 2026 commentary; thef1db
engine-braking explainer; F1 24 / rFactor 2 engine-brake settings;
Paradigm Shift "car setup science: tires"; AC Advanced Gamepad Assist
(`assist.lua`, ConfigGuide); BeamNG Advanced Steering ConfigGuide; LFS
manual (controls); Lost Chocolate Lab racing sound study; EA F1 22 camera
page; racefans Mather interview; SimHub wheel-slip indicator; Xbox
Accessibility Guideline 103; Traxion on ACC driver ratings. Unverified
items are marked in the agents' reports and were not used for any number
above except where labelled "computed" (a scratch integrator, not the game).
