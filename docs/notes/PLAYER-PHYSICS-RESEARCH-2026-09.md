# Player driving, physics and controls — realism research (2026-09-16)

Four parallel passes: a code map of the player's model and input pipeline,
and three web passes (tyre / vehicle dynamics; controls and assists in shipped
titles; developer statements on what makes handling feel real). Everything
measurable was measured on the working tree with a headless bench
(`tools/check/player-dyn.mjs`, described in §3) before anything was changed.
Prior controls research (`docs/research/DRIVING-CONTROLS-RESEARCH.md`,
`docs/research/CONTROLS-AUDIT-2026-09.md`) is not repeated: its ranked items
are shipped, and its two standing negatives (no TC/ABS without a slip model,
`ROAD_FOLLOW` ships OFF) still hold.

## 1. What this concluded, at a glance

| Finding | Evidence | Decision |
|---|---|---|
| **The lateral tyre curve has no peak.** `-mu·tanh(cs·a/mu)` saturates and never falls, so the front can be driven to 16° of slip with the force still at 100 %. | Slip sweep at 45 m/s: front force 1.43 g at 10.6°, 1.51 g at 13.6°, still rising. Full lock for 0.6 s turns the car 29° against 12° for a moderate input, at no cost. | **Built (tier 1):** a curve with a linear range, a peak, a plateau and a post-peak floor. Every developer source says the width of the plateau and the steepness of the fall ARE the feel. |
| **Throttle costs the front axle.** The combined-slip ellipse scales `muBase`, which both axles share, so a planted throttle takes grip from the undriven front exactly as it does from the rear. | Power-on test at 28 m/s: yaw 0.658 → 0.651 rad/s (no rotation); ellipse `slipFactor` 0.926 at every speed. | **Built (tier 1):** throttle and engine braking charge the REAR axle only; the charge is traction-limited at low speed and power-limited at high speed. Power-on oversteer becomes a technique, not a menu item. |
| **Lift-off and trail braking rotate the car by about 10 %.** Longitudinal transfer exists (`WT_LONG` 0.22) but the tyre had no post-peak drop for the lightened rear to fall into. | Lift-off at 45 m/s: yaw 0.406 → 0.446; turn-in at 55 m/s: coast 0.309 vs brake 0.342 rad/s. | Re-measured after tier 1 (the new curve changes both) — see §6. `WT_LONG` untouched. |
| **No longitudinal slip state.** Braking is a scalar on `c.speed`; lockup and wheelspin are cosmetic (`c.wheelLock`, launch smoke). | Code map §A6, §A10. | **Tier 2** (the one structural item): one wheel-speed state per axle with a slip ratio. It is the prerequisite for real lockups, ABS/TC levels, and keyboard "pedal help". |
| **Braking is a constant 2.2 g.** Real F1 braking falls from ~5 g at 300 km/h to ~2 g at 100 as downforce bleeds off. | Bench: 2.24 g from 100 km/h, 2.14 g from 200. | **Tier 2**, shared with the AI planner (`AiDrive.brakeTarget` assumes `BRAKE` is flat), so it is a pace rebalance, not a player tweak. |
| **Acceleration fades linearly to top speed**, so 0 → 92 % of `vTop` takes 28 s where a power-limited car takes ~10. | Bench: 0–100 km/h 6.4 s, 0–200 km/h 27.8 s at pace 0.84. | **Tier 2**, same reason: `ACCEL·(1 − v/vmax)` is shared with the AI. |
| **Controls are already at the category norm** — expo, speed-taper, One-Euro filter, rate half, deadzone + saturation, haptics. The two things shipped titles add that we lack are a grip-derived steering cap and a countersteer allowance for pads. | Web pass §2, §6. | **Tier 3**, assist-gated column only. Not this session. |

Acceptance criterion adopted from Codemasters' handling designer: "a racing
car is easy to drive, but it is difficult to be fast with it." Assists off, a
novice must complete a lap; being fast must require technique (smooth inputs,
trail braking, throttle discipline). Tier 1 makes technique matter without
making the lap impossible.

## 2. The model as found (code map summary)

- Per-axle bicycle model, fixed 60 Hz. Steer → road-wheel angle
  `shaped·STEER_MAX_SLIP·lockTaper` (a wheel angle, not a target slip).
  Slip angles from `vLat`, yaw rate and the axle arms; lateral force
  `-mu·tanh(cs·a/mu)` per axle (`CS_FRONT` 130, `CS_REAR` 175); yaw from
  `(af·Fyf·cosδ − ar·Fyr)/kz2 − YAW_DAMP·brakeYawDamp·r`.
- Grip stack `muBase = LAT_MAX·PLAYER_GRIP·aeroGrip·surfMu·kerbGrip·gripMult·
  mods.cornering·bankMu·(1+vertLoad)·slipFactor·marbleMu·tyreMu`, then per axle
  `loadF/loadR` (longitudinal transfer), `FRONT_GRIP`, wear split, roll
  balance. Aero grip RISES with v² (`DOWNFORCE` 0.65). Dirty air costs it.
- Longitudinal: `c.speed` integrates `ACCEL·PACE·(1 − v/vmax)·gearMult`
  under throttle, `BRAKE` under brake, `COAST_DRAG` off throttle. No slip
  ratio, no wheel speed. Auto gears are a readout; manual gears bog and limit.
- Combined slip: `axUsed = max(|axEstSm|, throttleDemand·THR_ELLIPSE)`,
  `slipFactor = sqrt(1 − (axUsed/LONG_GRIP)²)`, shared by both axles unless a
  non-default brake bias splits it. Braking costs 23 % of lateral grip,
  throttle 7 %, at every speed.
- Tyre wear and temperature (`js/physics/tyre-model.js`) multiply `muBase`;
  ships at `light`. Body pitch/roll (`js/physics/body-attitude.js`) is
  render-only. Lockup and flat spots are render-only.
- Boot tunables (VM, `__apex.tuning()`): wheelbase 4.2 m, expo 2.11, lock
  0.34 rad, speed ref 55, pace 0.840, yaw inertia 0.58 / damp 1.0 (10 on a
  coarse pointer: 1.0 / 1.4), driving help 0, racing line 0.

## 3. Bench: `tools/check/player-dyn.mjs`

Headless, deterministic, no browser (`tools/lib/game-vm.cjs`). The car is
re-pinned to one straight's centreline every step — position only; heading,
yaw rate, lateral velocity and speed persist — so skidpad, step-steer and
technique tests run without walls or grass ending them. Tests: braking
distance, acceleration, skidpad (5 speeds × 5 locks), ISO-style step steer,
trail-brake vs coast turn-in, lift-off, power-on, throttle charge by speed,
slip sweep, flick vs smooth, and two seconds at full lock. `--json` prints
the raw table; `measure(g)` is what the unit test imports.

Baseline (tree before this change, Monza, pace 0.84):

| Test | Before |
|---|---|
| 100 → 0 km/h | 17.5 m, 2.24 g |
| 200 → 0 km/h | 71.6 m, 2.14 g |
| 0 → 100 / 0 → 200 km/h | 6.4 s / 27.8 s |
| Skidpad 45 m/s, full lock | 2.90 g, front slip 13.8°, rear 7.3°, front util 0.98 |
| Step steer 50 m/s | rise 10–90 % 67 ms, t90 100 ms, overshoot 0 % |
| Slip sweep 45 m/s | front force still rising at 13.6° (1.51 g) |
| Flick (full lock 0.6 s) vs smooth (0.55) | 28.8° vs 12.0° heading change |
| Power-on at 28 m/s | yaw 0.658 → 0.651 rad/s |
| Lift-off at 45 m/s | yaw 0.406 → 0.446 rad/s |
| Turn-in 55 m/s, coast vs brake | yaw 0.309 vs 0.342 rad/s |

## 4. Literature, condensed to what changed a decision

**Tyre curve shape.** iRacing (Kaemmer): three zones — linear, a "limit zone"
where more slip changes nothing, and a "scary zone" where more slip means
less force; "the width of the limit zone and the steepness of the scary zone
have a dramatic effect on drivability". Forza Motorsport 2023 and iRacing's
2025 GT3 update both moved toward SMOOTHER post-peak falloff ("resilience to
sliding, better grip recovery"). Codemasters (Greco, F1 2019): "much more
grip loss when you're outside the peak, you have to be much smoother"; F1 25:
"flicking will be less effective". Vehicle Physics Pro's shipped "forgiving"
curve peaks at 1.1 and floors at 0.8 (a 27 % drop over a wide band); its
"competition" curve drops 45 % over a narrow one. Oxford's F1 optimal-control
tyre (Perantoni & Limebeer) peaks at 8–9° of slip angle and 0.10–0.11 slip
ratio with shape factor 1.9; peak μ falls with load (1.8 → 1.45 from 2 to 6 kN).

**Combined slip.** The normalised-ellipse form (one curve on
`ρ = hypot(α/αpeak, κ/κpeak)`, forces split by the slip direction) gives
power oversteer and lockup understeer for free — but needs a slip ratio. Until
tier 2 provides one, the honest approximation is to charge the driven axle for
drive torque and both axles (by bias) for braking, which is what a real
traction circle does per axle. Drive force is traction-limited at low speed
and power-limited (`P/v`) at high speed (Marco Monster's structure).

**Load transfer.** `ΔFz = m·a·h/L`; with h/L ≈ 0.09 the front gains ~9 % of
weight per g of braking. Lift-off oversteer and trail-brake rotation are
consequences of that plus a tyre that LOSES force when overdriven — the
second half was missing here.

**Controls.** Shipped consensus: expo (EA "linearity" 30–40 on a pad), a
speed taper on lock, a rate limit (EA "steering rate" 120–130 % on a pad,
"essential" on keys), opposite lock faster than steer-in (AC 4.0 vs 2.5),
return slower than steer-in (LFS). Apex has all but the asymmetric return.
The pad-specific additions shipped titles make — a steering cap at the front's
optimal slip angle (BeamNG/AC Advanced Gamepad Assist, LFS "stabilised"),
a countersteer allowance beyond it, a weak caster self-centre — are
assist-column features and belong behind a slider.

**Feedback without a wheel.** Tyre audio with a pre-limit "howl" layer
distinct from the over-limit squeal (Forza 4 sound study); trigger/rumble
tied to slip (F1 22 DualSense: brake trigger stiffens on lock-up, throttle
on wheelspin); body pitch/roll (F1 24: "what we were lacking was the feeling
of weight transfer"). Apex has the front-saturation haptic; the rear has no
channel.

**Validation.** ISO 4138 skidpad, ISO 7401 step steer; reference F1 values:
0–100 km/h 2.6 s, 0–200 4.5 s, 100–0 ~17 m, 200–0 ~65 m, peak braking
5.4 g, lateral up to 5 g, downforce = weight at ~150 km/h. In Apex all speeds
sit on the `PACE` scale, so shapes matter, not absolutes.

## 5. Plan

### Tier 1 — built and measured in this change

1. **`TyreModel.lateralCurve(x)`** replaces `tanh(x)` in the player's axle
   forces. `x = cs·α/mu` as before, so the linear range (and every `CS_*`
   constant) means what it meant. Shape: `sin(x)` up to the peak at
   `x = π/2` (slope 1 at the origin, peak force exactly `mu`), then a
   Gaussian fall from 1 to `TYRE_FLOOR` (0.75) with width `TYRE_FALL_W` (1.4):
   ≥ 0.97 of peak out to x ≈ 2.1 (the limit zone), 0.85 at x = 3, the floor
   by x ≈ 5. Peak slip angle at 45 m/s ≈ 9° front (rises with aero load, as
   it should). Never oscillates, never negative, C¹ at the peak — a plain
   Magic Formula with a sharpening E goes negative at spin-sized slips, which
   this model reaches.
2. **Rear-only drive charge on the ellipse.** The front spends longitudinal
   grip only under braking; the rear spends under braking, coast (engine
   braking) and throttle. The throttle charge is
   `min(THR_CAP, THR_K / vStd) · throttleLvl` of `LONG_GRIP` — traction-
   limited at ≤ 23 m/s (0.62 → 78 % of rear lateral grip left), power-limited
   above (0.31 at 45 m/s, 0.19 at 72). Replaces the flat `THR_ELLIPSE`
   charge (0.38 everywhere, both axles).
3. **A rear-slip haptic** mirroring the front-saturation cue, with a slower,
   heavier pulse so a pad or phone can tell the two ends apart.
4. **Bench promoted to `tools/check/player-dyn.mjs`** and a VM unit test
   (`tests/unit/player-dynamics-vm.test.mjs`) locking the invariants as
   relative assertions: force falls past the peak; a flick gains less heading
   than 1.6× a smooth input; throttle costs the rear more than the front;
   power-on raises rear slip at low speed; lift-off and trail braking raise
   yaw; full lock at 45 m/s does not spin; no NaN.
5. `PhysicsConsts.REVISION` bumped (lap records and netplay key on it),
   `tests/data/physics-baseline.json` regenerated in the browser and the diff
   read, `docs/PHYSICS.md` updated.

### Tier 2 — next session, needs pace rebalancing with the AI

6. **One wheel-speed state per axle** (`ω`, slip ratio `κ`), the ellipse
   evaluated on `hypot(α/αpeak, κ/κpeak)`. Unlocks real lockups (the flat
   spot becomes a consequence), wheelspin, ABS/TC as levels, keyboard "pedal
   help" (weakened ABS/TC only when the real assist is off, as AC's keyboard
   mode does). Player-only; the AI keeps its scalar path.
7. **Aero-limited braking and power-limited acceleration**, shared with the
   AI planner (`AiDrive.brakeTarget`, the `ACCEL·(1 − v/vmax)` law). Both
   shift lap times and must be re-measured with `tools/check/ai-race.mjs
   pace` and the AI-vs-player bench before shipping.
8. **One grip law for player and AI** (survey item #2): the AI's
   `lateralScale` falls with speed while the player's `aeroGrip` rises.

### Tier 3 — assist column, sliders, not physics

9. Pad steering cap at the front's optimal slip (+ countersteer allowance,
   caster self-centre), all behind a slider, all reading own slip and speed —
   legal under the arc rule, but an assist and labelled as one.
10. Asymmetric key return rate (return 0.5–0.75× steer-in).
11. Pre-limit tyre "howl" audio layer keyed to front slip at 70–90 % of peak.

### Never (unchanged)

- No curvature or racing-line term in the player's forces with assists off.
- No TC/ABS until item 6 exists. No raised `ROAD_FOLLOW` default.
- Juice never writes `px/pz/s/x/psi`.

## 6. Tier 1 results

Same bench, same tree otherwise (`node tools/check/player-dyn.mjs`). The
technique tests were moved to the grip limit (lock 0.75–1.0) once the first
run showed that in the linear range a grip change does not change the force —
lift-off and power-on oversteer only exist near the peak, in a real car too.

| Test | Before | After |
|---|---|---|
| Slip sweep 45 m/s, front normalised force | 0.98 at 10.6°, 0.995 at 13.6°, still rising | **1.00 at 10.4°, 0.98 at 13.2° — a peak** |
| Skidpad 45 m/s, full lock | 2.90 g, front 13.8°, util 0.98 | 3.07 g, front 12.6°, util 0.99, rear 0.89 |
| Skidpad 20 m/s, full lock | 1.87 g | 2.00 g (sin is stiffer than tanh below the peak) |
| Throttle charge, front / rear, at 20 → 72 m/s | 0.38 / 0.38 flat | **0 / 0.52 → 0 / 0.34** |
| Power-on at the limit (28 m/s, full lock, then planted) | rear slip 3.7°, yaw FELL on the throttle | **rear slip 12.7° → 23.9°: the rear steps out** |
| Lift-off at the limit (45 m/s, lock 0.8) | yaw 0.557 → 0.840 | yaw 0.653 → 0.990 |
| Turn-in 55 m/s, lock 0.75, coast vs brake | 0.776 vs 1.403 rad/s | 0.790 vs 1.790 rad/s |
| Flick vs smooth (45 m/s, 0.6 s) | 28.8° vs 12.0° | 27.5° vs 12.3° |
| Full lock at 45 m/s for 2 s | washes wide | washes wide, yaw ≤ 1.14 rad/s, rear ≤ 9° |
| Keyboard hairpin (20 m/s, full lock + full throttle, 2 s) | — | no spin: rear ≤ 6°, yaw ≤ 1.3 rad/s |
| Braking, acceleration, step steer | 2.2 g / 6.4 s / t90 100 ms | unchanged (tier 2 items) |

What did NOT change, and why the flick still turns the car: the front's peak
is at x = π/2, which at 45 m/s is ~11° of slip; full lock reaches 13–16°,
inside the plateau (0.97–0.98). Narrowing the fall (width 0.7) took the flick
from 27.6° to 25.1° — the curve shape is not where the flick's cost lives.
Its real cost in a car is SCRUB: a sliding tyre's force has a component
against the velocity (`Fy·sin α`, ~8 m/s² at full lock), and the game's
`c.speed` never pays it. Adding scrub alone would make every fast corner slow,
because the acceleration law only has ~1.5 m/s² to pay it back at 45 m/s
(a real F1 engine has ~13). Scrub therefore ships together with the
power-limited acceleration law in tier 2, not before.

## 7. Sources

Developer-authored, in the order used above: iRacing "The Sticking Points
in Modeling Tires" and the NTM V7 / 2025 GT3 notes; Turn 10 on Forza
Motorsport 2023 tyre physics; Kunos ACC tyre blog; Codemasters interviews
(Greco F1 2019, Mather F1 24, EA F1 25 deep dive); BeamNG tyre blog part 2;
Live for Speed Dec 2009 report; Reiza AMS2 v1.5 notes; Polyphony GT7 1.31 /
1.71 notes; Vehicle Physics Pro tyre block; Edy's Pacejka guide; Perantoni &
Limebeer, "Optimal control for a Formula One car with variable parameters"
(Oxford ORA); VDrift and TORCS tyre source; Marco Monster "Car Physics for
Games"; AC Advanced Gamepad Assist and BeamNG Advanced Steering config
guides; LFS manual (controls); rFactor 2 keyboard guide; EA F1 22 calibration
page; PlayStation Blog on F1 22 DualSense; Lost Chocolate Lab racing sound
study; formula1.com 2026 aero regulations; f1technical / Brembo braking data;
Driver61 trail-braking and oversteer guides. Unverified items (paywalled or
unfetchable: Criterion GDC 2018 slides, Seta tyre model text, Kunos forum
posts, racer.nl) were not used for any number in this note.
