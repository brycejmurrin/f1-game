# Rapier physics-engine evaluation spike

**Decision context:** we are NOT replacing the bespoke player physics (the
deterministic per-axle bicycle model in `js/game.js`). This spike measures
whether Rapier could serve **additive** roles — car-to-car / wall collision
resolution, debris, airborne moments — and how its built-in vehicle controller
compares to the bespoke model. Data below, recommendation at the end.

## Setup

| item | value |
|---|---|
| engine | `@dimforge/rapier3d-compat` **0.19.3** (vendored in `vendor/`, WASM inlined as base64, no network) |
| runtime | Node 22.22.2, pure `node`, no browser |
| geometry | **real** track geometry, browser-free: `build-geometry.cjs` replays the `tools/manifest.cjs` `TRACK_VM` file list in a Node VM (the `tools/verify-track.cjs` pattern), calls `Tracks.build(def)`, exports the road mesh + centreline |
| track | Singapore: 23,250 road verts, 42,778 tris, 4,906 m lap, 1,227 centreline nodes (`geometry-singapore.json`, 3.6 MB) |
| collider | `RAPIER.ColliderDesc.trimesh(Float32Array, Uint32Array, TriMeshFlags.FIX_INTERNAL_EDGES)` on a fixed body — the flag suppresses internal-edge ghost bumps on the tessellated road |
| timestep | fixed 1/60 s, gravity −9.81 |

Reproduce:

```sh
node spike/physics/build-geometry.cjs singapore   # → geometry-singapore.json
node spike/physics/rapier-eval.mjs singapore      # all tests below
```

(One cosmetic `using deprecated parameters for the initialization function`
warning comes from inside the 0.19.3 compat bundle's own WASM init; harmless.)

## b. Vehicle test — `world.createVehicleController` (DynamicRayCastVehicleController)

Chassis: 798 kg dynamic cuboid, half-extents 0.75 × 0.25 × 2.0 m (forward =
local +Z). Wheels at the game's footprint: frontZ 1.7, rearZ −1.6, halfTrack
0.75, wheel radius 0.34, suspension rest 0.15 (stiffness 50, Bullet-style
chassis-mass-scaled units; settles ~0.05 m compressed). Spawned at
`centreline[0]` + 0.8 m, heading from the tangent. Script: 1 s settle → 3 s
rear-axle engine force → 3 s engine + 0.2 rad front steering. 60 Hz.

Engine-force calibration (speed after 3 s of drive):

| N per rear wheel | speed @ 3 s |
|---:|---:|
| 1200 | 33.5 km/h |
| **1800** | **49.6 km/h** ← chosen (target 40–60) |
| 2400 | 65.8 km/h |
| 3000 | 82.1 km/h |

Run log (excerpt; `ride` = chassis y − road y at nearest centreline node):

```
t=1.0s  v=  0.3 km/h  yaw=0.989  ride=0.567 m    (settled)
t=2.0s  v= 16.8 km/h  yaw=0.989  ride=0.583 m
t=4.0s  v= 49.6 km/h  yaw=0.989  ride=0.553 m    (end of straight-line phase)
t=4.5s  v= 57.0 km/h  yaw=1.437  ride=0.454 m    (steering)
t=5.0s  v= 63.5 km/h  yaw=1.841  lat=10.0 m      [off road mesh — falls]
```

Results:

- **Accelerates: PASS** — 0.3 → 49.6 km/h over the 3 s drive phase.
- **Turns: PASS** — yaw delta 2.145 rad over the steer phase. Measured turn
  radius 1 s into the steer at 57 km/h: **v/yawRate = 35.1 m** vs the kinematic
  wheelbase/tan(0.2) = 16.3 m — i.e. the controller understeers ~2× at speed
  with default tyre settings (`frictionSlip` 10.5, `sideFrictionStiffness` 1.0).
  Handling character comes from opaque impulse clamps, not slip math.
- **Tracks road height: PASS** — ride height while over the tarmac stayed in
  [0.395, 0.631] m (expected ~0.54): no fall-through, no launch, 0 non-finite
  samples across 420 steps.
- At t = 4.68 s the car legitimately steers off the road edge and falls
  (expected: 0.2 rad lock held 3 s; the collider is road-only, no terrain).
  The fall itself is a useful data point — clean 6-DoF ballistic behaviour off
  the mesh edge, no solver explosion.

## c. Determinism

Identical 10 s / 600-step sim in two **fresh worlds** (same process, same WASM
instance), contact-rich on purpose: driven vehicle + 22 car-sized dynamic
cuboids on the grid + 100 debris cubes raining onto the road (124 bodies,
seeded PRNG placement).

| check | result |
|---|---|
| vehicle pose bitwise identical, all 600 steps × 7 components (x y z qx qy qz qw, compared as raw u64 bits) | **true** |
| all 124 bodies' final pose bitwise identical | **true** |
| first divergent step | none |
| max per-step divergence | **0.0** |

**Verdict: bitwise deterministic** for same build + same insertion order + same
inputs on this platform. (Caveat for any future use: Rapier documents
cross-platform bit-determinism only with its `enhanced-determinism` build; the
standard build is deterministic per-platform, which is what the game's
fixed-step replay/ghost use cases need. `world.takeSnapshot()` exists for
state save/restore.)

## d. Performance — `updateVehicle + world.step()` per tick

600 timed steps after 60 warm-up steps, `perf_hooks.performance.now()`,
single-threaded WASM on the dev box CPU:

| scenario | mean | p95 | max |
|---|---:|---:|---:|
| road trimesh + 1 vehicle | 0.011 ms | 0.018 ms | 0.31 ms |
| + 22 car-sized dynamic cuboids on the grid | 0.053 ms | 0.31 ms | 0.46 ms |
| + 100 debris cuboids (0.1–0.5 m) dropped over the road | 0.239 ms | 1.19 ms | 1.54 ms |

Notes: means benefit from Rapier's sleeping (settled grid cars go idle) — p95/max
are the honest planning numbers. Worst observed step (123 dynamic bodies mid-pile
on a 42k-tri trimesh) is **1.5 ms**, ~9 % of the 16.7 ms frame budget. Each
vehicle controller costs 4 raycasts/step; even 23 full vehicle controllers
extrapolate to well under 1 ms. The one-time trimesh build + first-step
broad-phase warm-up is why warm-up steps are excluded.

## e. API fit — bespoke bicycle model vs DynamicRayCastVehicleController

The bespoke model (constants near the top of `js/game.js`; see CLAUDE.md
"Physics"): per-axle bicycle model where the player is a world-space rigid body
(`px/pz/head` authoritative), `(s,x)` read back locally per frame by
`trackFrom()`, with a **combined-slip friction ellipse** — `LONG_GRIP = 34 m/s²`
longitudinal axis, `slipFactor = sqrt(1 − (axEstSm/LONG_GRIP)²)` scaling lateral
grip (trail-braking rotates the car; hard braking mid-corner understeers).

| bespoke knob (js/game.js) | value | Rapier vehicle-controller equivalent | fit |
|---|---|---|---|
| `LONG_GRIP` friction ellipse (combined slip) | 34 m/s² | **none** — engine/brake and side friction are resolved independently (Bullet-style raycast vehicle) | **lost**: no trail-braking rotation, no braking-kills-cornering coupling |
| `CS_FRONT` / `CS_REAR` cornering stiffness (slip-angle model) | 130 / 175 | `setWheelFrictionSlip`, `setWheelSideFrictionStiffness` — impulse clamps, not slip-angle curves | **lost**: no tyre slip model at all; wheels are rays, not patches |
| `FRONT_GRIP` axle balance | 0.89 | per-wheel `frictionSlip` bias front vs rear | partial |
| `DRIFT` progressive rear looseness 0..1 | 0 | lower rear `frictionSlip`/`sideFrictionStiffness` | partial — breakaway is abrupt, not progressive |
| `YAW_DAMP` / `YAW_INERTIA` (yaw-axis shaping) | 1.0 / 0.7 | chassis inertia via collider mass properties; `setAngularDamping` is scalar (damps roll+pitch too) | **lost** as per-axis knobs; needs manual torques |
| `WHEELBASE` (turn-in response slider) | 3.2 m | wheel connection points (pure geometry) | partial — response emerges, not tunable independently |
| `STEER_EXPO`, `STEER_MAX_SLIP`, `STEER_SPEED_REF` | 2.4 / 0.32 / 60 | input shaping stays game-side; `setWheelSteering(rad)` takes the final angle | parity (shaping was never the model's job) |
| `PLAYER_GRIP`, `gripMult` (weather/kerb/banking), `PACE` | 1.15 / — / 1.0 | per-wheel `frictionSlip` settable per frame; `PACE` external | workable |
| `ACCEL` 7, `BRAKE` 22 (m/s²) | — | `setWheelEngineForce` / `setWheelBrake` in newtons, per wheel | parity |
| load transfer → grip (`loadF`/`loadR` scale mu) | explicit | suspension transfers load but `frictionSlip` does not scale with wheel load | **lost** |
| suspension | none (flat model + kerb hacks) | full per-wheel: rest length, stiffness/compression/relaxation, max force, contact queries | **gained** — but Bullet-style mass-scaled units are opaque to tune |
| barrier clamp `xPinned` + car-car resolution in `(prog,x)` plane | hard constraints | real contact resolution on the actual trimesh, restitution/friction, torque-induced spins, contact events | **gained** |
| airborne / rollover | not modelled | full 6-DoF free (verified: clean ballistic fall off the mesh edge) | **gained** |
| debris | not possible | 100 tumbling boxes ≈ 0.24 ms/step mean | **gained** |
| determinism + headless stepping (`__apex.act/obs`) | fixed-step closure state | bitwise deterministic (measured); `world.takeSnapshot()` | parity — but state lives across the JS↔WASM boundary, so the closure-state/`trackFrom()` writeback patterns need an explicit sync layer |

**Lost** (if the vehicle controller replaced player handling): friction-ellipse
coupling, slip-angle tyre model, load-sensitive grip, per-axis yaw shaping,
progressive drift — i.e. exactly the hand-tuned feel the bespoke model exists
for, plus ~2× understeer at speed out of the box (35 m measured vs 16 m
kinematic radius). **Gained** (additive roles): real contact resolution against
the real road mesh, debris, airborne/rollover, contact events, query pipeline,
sleeping, snapshots, bitwise determinism.

## Recommendation

Additive adoption is technically viable and cheap; replacing handling is not
attractive. The vehicle controller is a Bullet-style arcade raycast vehicle
with no combined-slip, no slip-angle tyre model and no load-sensitive grip — it
cannot reproduce the trail-braking/friction-ellipse behaviour that `LONG_GRIP`
and the per-axle stiffness constants deliberately encode, so **the player model
stays bespoke**. Where Rapier earns its place is everything the bespoke model
punts on: a static road trimesh plus ~120 dynamic bodies steps in ≤1.5 ms
worst-case (≤0.24 ms mean) and is bitwise deterministic across fresh worlds, so
**debris fields, barrier-impact set pieces and airborne/rollover moments** could
run as a Rapier side-world that reads the game's car poses as kinematic bodies
and only writes back impulse results — consistent with the existing rule that
only hard constraints (barrier clamp, car-car contacts) may move the player.
Car-to-car/wall resolution via Rapier contacts is plausible for the same reason
but touches the `(prog,x)`-plane writeback path, so it should be a second step
after debris. AI traffic as full Rapier vehicles is affordable (4 rays/car/step)
but would change AI handling character for no gameplay gain; not recommended.
Main integration costs: the JS↔WASM state boundary (explicit sync each tick),
the ~2.2 MB compat bundle vs the game's no-build IIFE loading, and per-platform
(not cross-platform) determinism of the standard build.

## Files

- `build-geometry.cjs` — browser-free geometry extractor (VM pattern from `tools/verify-track.cjs`)
- `geometry-singapore.json` — road mesh `{pos,nrm,idx}` + centreline `px/py/pz/tx/ty/tz/hw` (regenerable)
- `rapier-eval.mjs` — all tests above (`node spike/physics/rapier-eval.mjs [trackId]`)
- `vendor/` — `@dimforge/rapier3d-compat` 0.19.3 (`rapier.mjs`, LICENSE Apache-2.0, package.json)
