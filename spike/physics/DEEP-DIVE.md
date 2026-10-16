# Rapier deep-dive — tuning, side-world cost, airborne handover

> **Status:** R0–R2 subsequently shipped — `js/game/debrisworld.js` (the §2
> side-world, default-on) and `js/game/incidentsim.js` (the §3 bounded
> takeover). This file remains the measurement record behind them.

Follow-up to the baseline eval (`README.md` in this directory), de-risking the
R0–R3 adoption phases in `spike/ADOPTION-PLAN.md` Part 2. Same setup: vendored
`@dimforge/rapier3d-compat` 0.19.3, Node 22, fixed 1/60 s steps, real Singapore
geometry from `build-geometry.cjs` where a road is needed.

Reproduce:

```sh
node spike/physics/build-geometry.cjs singapore   # once → geometry-singapore.json
node spike/physics/deep-tuning.mjs                # investigation 1 (flat plane + road)
node spike/physics/deep-sideworld-run.mjs         # investigation 2 (browser, playwright)
node spike/physics/deep-handover.mjs              # investigation 3
```

---

## 1. Vehicle-tuning sweep — the understeer was a measurement artifact; the friction ellipse is structurally absent

`deep-tuning.mjs`. All cornering runs on a **flat plane collider** (4 km cuboid,
friction 1.0) to isolate the tyres from road banking/camber; speed held by a
clamped P-controller on the rear axle; radius = mean(v)/mean(|yawRate|) over the
final 2 s of an 8 s steady 0.2 rad corner. Kinematic reference:
wheelbase/tan(0.2) = **16.3 m**.

### a. The baseline's "~2× understeer" does not reproduce — it was the car leaving the road

Grid sweep, 0.2 rad lock, speed held at 16 m/s (57.6 km/h):

| frictionSlip | sideFrictionStiffness | radius | artifacts |
|---:|---:|---:|---|
| 10.5 (default) | 0.5 | **16.3 m** | none |
| 10.5 | 1.0 (default) | 16.4 m | none |
| 10.5–84 | 2 | 5.2–16.1 m | yaw-rate std 54–77 % of mean — violent oscillation |
| 10.5–84 | 4 | 1.3–15.9 m | oscillation; at 84×4 rollover (minUp −0.97) |
| any | 0.5–1.0 | 16.3–16.4 m | none — all identical |

**At factory defaults the controller already corners at exactly the kinematic
radius**, and reaches it in < 0.25 s after the steer step (transient probe:
radius 16.3 m at t+0.25 s, t+0.5 s, … t+4 s — no measurable rise time).
Suspension stiffness 50→200 and a 0.30 m CoM drop change nothing (16.3–16.8 m).

So where did the baseline's 35.1 m come from? Replaying the eval's exact
scenario (its tune, its fixed 1800 N drive, steer at t=4 s) **on the Singapore
road trimesh** and sampling at its measurement instant (1 s into the steer)
reproduces 35.1 m exactly — and at that instant the car is **10.3 m from the
centreline on a 6.0 m half-width road with all four wheels reporting no ground
contact** (`wheelIsInContact` = n,n,n,n). The car had already run off the road
edge and was ballistic; v/yawRate of a falling body is not a turn radius.
**The baseline README's "understeers ~2× at speed" claim should be read as
retracted by this measurement.** Nothing needed fixing.

### Why it corners "perfectly": the tyres are rails, not tyres

`frictionSlip` behaves as a friction coefficient on a load-scaled side-impulse
clamp (measured clamp ∝ `wheelSuspensionForce`). At the default 10.5 that is
μ ≈ 10.5 — never reached by any sane manoeuvre, so below the clamp the wheels
are **bilateral no-slide constraints**: zero slip angle, exactly kinematic
response, at any speed. Speed sweep at defaults, same 0.2 rad lock:

| speed | radius | lateral accel |
|---:|---:|---:|
| 43 km/h | 16.3 m | 8.7 m/s² |
| 57 km/h | 16.3 m | 15.3 m/s² |
| 70 km/h | 16.3 m | 23.4 m/s² |
| 84 km/h | 16.3 m | 33.1 m/s² |
| 96 km/h | 16.2 m | **44.1 m/s²** (4.5 g, no slide, no rollover) |

A realistic grip limit exists only by tuning `frictionSlip` down to a real μ
(sweep at sideStiff 1.0): 1.0 → saturates at ~9.5 m/s², 1.5 → ~14 m/s²,
2.0 → ~18.6 m/s², 3.0 → ~27.9 m/s². Above the limit the radius grows with
speed as expected. But there is **no progressive region**: below the clamp the
car is on rails (zero slip), above it the wheel slides — the sweep's
sideStiffness ≥ 2 rows show what living near that boundary looks like
(yaw-rate std 50–77 %, i.e. grip/slide limit-cycling), and this binary
character is exactly what the bespoke model's slip-angle curves exist to avoid.

### b. Trail-braking probe — structural verdict

Steady 0.2 rad corner at 60 km/h, then 1 s of braking mid-corner. Brake
calibrated on the straight first: `setWheelBrake` 80 ≈ 22.3 m/s² (the bespoke
BRAKE), so 25 % = 20, 50 % = 40. Bespoke friction-ellipse reference behaviour:
moderate brake → yaw rate **rises** (car rotates into the corner), hard
brake → line widens (understeer).

At the on-rails tune (defaults, μ never saturated):

| brake | yaw rate vs baseline | radius | character |
|---|---:|---:|---|
| coast | −2 % | 16.3 m | unchanged |
| 25 % | −20 % | 16.5 m | w falls exactly with v — same arc, slower |
| 50 % | −39 % | 16.7 m | same |
| 100 % | −75 % | 17.8 m | fronts approach lock, slight widening |

Yaw rate only ever **falls**, in proportion to speed: the car decelerates along
the same geometric arc. No coupling whatsoever.

At a near-limit tune (frictionSlip 1.8 ≈ tyres at ~90 % of their clamp in this
corner — the regime where an ellipse would matter most):

| brake | yaw response through the 1 s window | drift angle at end | character |
|---|---|---:|---|
| coast | w(t) = 1.00, 0.99, 0.99, 0.98 | 4° | unchanged |
| 25 % | 1.07, 1.02, 0.79, 0.70 (−2 % mean) | 5° | nothing, then slows |
| 50 % | 1.27, 1.63, 2.14, **2.55 and still climbing** | 26° and climbing | **divergent breakaway** |
| 100 % | 1.59, 2.38, 2.76, 1.47; 118° of yaw swept | **74°** | **full spin** |

There is longitudinal↔lateral interaction near the clamp (Bullet's crude
combined check exists in the port), but its character is **binary**: 25 % brake
does nothing, 50 % triggers a divergent rear breakaway (yaw rate still rising
when the window ends), 100 % spins the car through 118° in one second. And the
hard-brake direction is **inverted** vs the bespoke model (bespoke: hard
braking mid-corner understeers/widens; Rapier: hard braking snap-spins).

**Verdict: structural, not tunable.** The graduated friction-ellipse behaviour
— partial brake produces a *stable, proportional* yaw-rate rise; hard brake
produces understeer — does not exist at any point in the tuning space. The
controller offers only (a) on rails with yaw ∝ speed, or (b) breakaway/spin.
There is no slip-angle model to shape the transition. This confirms the
baseline's API-fit table conclusion (player handling stays bespoke) even though
its understeer number was wrong.

### c. Load sensitivity

- The side-impulse clamp **does scale with instantaneous wheel load**
  (measured: clamp ∝ `wheelSuspensionForce`; per-wheel steady-corner readout
  shows the outside wheels carrying proportionally larger side impulses). The
  baseline README's "frictionSlip does not scale with load" is **wrong as
  stated** — the *coefficient* is load-independent, the *clamp* is load-scaled.
- But grip is exactly load-proportional (Coulomb μN): doubling chassis mass
  leaves the radius bit-for-bit at 16.3 m; suspension 50 vs 200 changes it by
  < 1 %. Real-tyre load sensitivity (μ falling with load — the reason the
  bespoke `loadF`/`loadR` scaling exists) is absent, and steady-state lateral
  load transfer can never reduce total grip. Nothing to tune here either.

### Caveats

- Flat plane, friction 1.0, single body; no aero downforce modelled anywhere.
- "Best clean tune" radii are controller-level truths, not gameplay claims —
  at defaults the car corners like a train, which is its own (different)
  handling-character problem.
- 4×4 grid + finalists only; sideStiffness between 1 and 2 was not bisected —
  the oscillation onset lies somewhere in that interval.

---

## 2. Browser side-world cost — the R1 tax fits, with margin

`side-world.html` + `deep-sideworld.js` (ES-module island, the R0 loading
pattern) driven headless by `deep-sideworld-run.mjs` (preinstalled Chromium
141, SwiftShader ANGLE — irrelevant here, physics is pure CPU/WASM). The
Singapore road trimesh is **fetched at runtime** from
`geometry-singapore.json` (chosen over embedding: no build step, JSON stays
regenerable). Scene: road trimesh + **22 kinematic position-based car
mirrors** driven along a scripted lap-like centreline path at 45–55 m/s
(several plough through the debris zone, keeping contacts alive) + **100
dynamic debris** dropped over the first 300 m. 600 measured ticks after 60
warm-up; the three JS↔WASM phases timed separately with cross-origin-isolated
`performance.now()` (COOP/COEP headers — otherwise headless Chromium clamps
the timer to 100 µs and the numbers are quantisation noise).

Representative run (three runs varied < 10 % on every row; box quiet,
loadavg 0.08 on 4 cores — the Babylon-arm browser was idle):

| phase (per 60 Hz tick) | mean | p95 | max |
|---|---:|---:|---:|
| sync-in — 22 `setNextKinematicTranslation/Rotation` pose writes (incl. path math) | 0.010 ms | 0.020 ms | 0.095 ms |
| `world.step()` | 0.248 ms | 0.810 ms | 2.39 ms |
| — first 300 ticks (debris airborne/being punted) | 0.415 ms | 0.905 ms | 2.39 ms |
| — last 300 ticks (sleeping kicks in) | 0.081 ms | 0.155 ms | 0.32 ms |
| read-back — 100 debris `translation()`+`rotation()` into a preallocated Float32Array | 0.102 ms | 0.240 ms | 0.83 ms |
| **total** | **0.360 ms** | **1.07 ms (p95 sum)** | — |

One-time costs: module import 44 ms + `RAPIER.init()` 45 ms (≈ 90 ms
lazy-load hit, nowhere near boot), geometry fetch+parse 52 ms, trimesh
collider build 86 ms, 122 bodies 7 ms. Heap: **+8.4 MB** JS heap for the
import/init (the 2.2 MB bundle inflates to its base64-decoded WASM plus
module objects), **+18.5 MB** for geometry JSON + world (most of that is the
parsed 3.6 MB JSON and its arrays, which the real game would not hold — it
already owns the road mesh as typed arrays).

**R1 mobile-budget verdict: fits.** At the ~2× mobile-CPU rule of thumb the
worst honest planning number (p95 sum ≈ 1.1 ms → ~2.2 ms mobile, max burst
~2.4 ms → ~5 ms on the worst tick during a full 100-piece debris shower) is
a bounded, capped cost against a 16.7 ms frame — and R1's debris counts are
pooled/capped lower on mobileTier anyway. The mirror-sync direction the plan
worried about (JS→WASM kinematic writes) is essentially free at 22 cars
(0.01 ms); read-back is similarly trivial. The dominant cost is `world.step()`
itself and it matches the Node numbers from the baseline eval — there is no
extra browser/WASM-boundary tax worth planning around.

Caveats:

- JS heap numbers exclude WASM linear memory (not visible to
  `performance.memory`); treat total added memory as "tens of MB", not 27 MB.
- Timed with setTimeout pacing, not rAF, so no render work interleaves —
  deliberate (this isolates the physics tax), but GC pressure from a real
  frame would add jitter on top.
- Desktop-class dev box CPU; the mobile verdict is the 2× rule of thumb, not
  a device measurement.

---

## 3. R2 airborne-handover probe — clean continuity and bitwise determinism; rollovers are the design problem, not the solver

`deep-handover.mjs`. Protocol per episode: bespoke-like pre-state (80 km/h on
the Singapore road, known `(s, x, head)`) → hand TO a Rapier 6-DoF dynamic
cuboid (798 kg) with matching pose+velocity plus a kerb-strike vertical
impulse (Δvy 2–5 m/s) and a roll torque impulse → fly to touchdown + settle
(30 consecutive steps of |vy| < 0.4, |ω| < 0.8, up·y > 0.85, near road level;
6 s cap) → hand BACK: extract pose/velocity, recompute `(s, x)` with a
trackFrom-like **local** nearest-node projection (window around the predicted
s), cross-checked against a global brute-force projection. 20 seeded variants
per suite; a flat "pseudo-terrain" pad 0.3 m below the local road catches
off-road landings (the real game has sculpted terrain — approximation).

**Hand-to continuity** (after one step, projection round-trip vs the bespoke
prediction): max |Δs| **0.37 m** (node quantisation is ~4.0 m, so this is the
projection's discretisation floor, not solver drift), max |Δx| **0.021 m**,
max |Δhead| **0.00°**. No teleports.

**Moderate suite** (roll impulse ±500 N·m·s ≈ up to 2.7 rad/s roll rate):

| metric | result |
|---|---|
| settled upright within 6 s | 10/20 — settle times min 1.05 s, median 1.33 s, max 2.02 s |
| came to rest inverted | 8/20 |
| still moving at the 6 s cap | 2/20 |
| non-finite / explosions | **0** — worst flight state apex 2.1 m, max |ω| 7.9 rad/s, all finite |
| local vs global projection disagreement (wrong-leg risk) | **0/20** |
| settled handbacks | speed retained 0.43–0.71×, heading-vs-velocity drift ≤ 5°, yaw-rate residual < 0.8 rad/s by construction |

**Aggressive suite** (±1600 N·m·s): 18/20 roll mid-air; 8 settle (some after
rolling back onto their wheels), 9 rest inverted, 3 timeout. Still zero
non-finite states and the same continuity numbers.

**Determinism: bitwise.** Two fresh 20-episode moderate suites produce
bit-identical final pose + velocity + settle-step for every episode — the
handover protocol adds no nondeterminism on top of Rapier's per-platform
guarantee.

What the numbers say about R2's design:

- The solver side is a non-issue: no explosion, no NaN, no wrong-leg
  projection, deterministic, and clean `(s, x)` resync to within the node
  grid. The touchdown+settle detector works (median 1.3 s takeover window).
- The real design work is **rollover fate**: a bare cuboid at 80 km/h ends
  inverted in 40 % of moderate kerb strikes (the tip-over boundary sits
  around ~1.8 rad/s of imparted roll for these hang times). "Hand back to the
  bicycle model" is only defined for upright outcomes — R2 needs an explicit
  policy: clamp the imparted roll at hand-to, and/or route rest-inverted
  outcomes to the existing rescue flow rather than a handback. The plan's
  "ghosts/laps invalidated during takeover" already anticipates this; the
  probe says inverted-rest is common enough to need the rescue branch, not an
  edge case.
- Touchdown costs speed: settled episodes retain 0.43–0.71× of entry speed —
  a slick cuboid digs its nose in. Tunable (restitution/friction/shape) but
  worth knowing the default feel is "heavy" landings.
- Height mapping caveat: the cuboid rests with its centre ~0.36 m above the
  road while the bicycle model's reference ride is ~0.6 m (wheel geometry) —
  the handback must reconstruct the bespoke y from `(s, x)` road height, not
  copy the Rapier body's y. Same for any wheel-less proxy shape.

---

## What changes for the ADOPTION-PLAN (R0–R3)

1. **R1 is confirmed cheap and can start any time.** Real browser tax
   measured: ~0.36 ms mean / ~1.1 ms p95 per tick all-in for 22 mirrors +
   100 debris, ~90 ms lazy init, no boundary-crossing surprises. The plan's
   budget assumptions hold in the browser, not just in Node.
2. **R2 is feasible but needs a rollover policy in its spec.** Continuity and
   determinism are solved problems (measured above); add to the R2 phase:
   roll-impulse clamp at hand-to, rescue-flow branch for inverted rest, and
   y-reconstruction from road height at handback. Settle detection at ~1.3 s
   median keeps takeover windows short.
3. **The non-goal stands, with a corrected reason.** Player handling stays
   bespoke — but not because of "~2× understeer" (that number was the eval car
   falling off the road edge; at defaults the controller actually corners
   *exactly kinematically*). The structural reasons are: binary grip (rails →
   breakaway, no slip-angle region), no graduated friction-ellipse (partial
   brake does nothing at the limit, then 50 %+ snap-spins — inverted vs the
   bespoke hard-brake understeer), and no tyre load sensitivity (grip exactly
   ∝ load). None of these are reachable through the exposed tuning surface.
4. **R3 gets a small new data point for free:** the side-world already
   resolves kinematic-car ↔ debris contacts stably at 50 m/s closing speeds
   with zero non-finite results, and the handover probe shows contact
   resolution against the real trimesh is robust. No sequencing change — R3
   still waits on R1/R2 field experience because its risk is the writeback
   path, not the solver.

## Files

- `deep-tuning.mjs` — investigation 1 (flat-plane grid sweep, trail-braking,
  load sensitivity, baseline reconciliation)
- `side-world.html` / `deep-sideworld.js` — investigation 2 browser probe
- `deep-sideworld-run.mjs` — headless Chromium driver for investigation 2
- `deep-handover.mjs` — investigation 3 (R2 handover protocol simulation)
