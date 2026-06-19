# Driving Physics Redesign — Architecture Decision

## TL;DR

Move the **car physics into Cartesian world space** (a bicycle/arcade model:
heading integrated from yaw rate, position from velocity). Keep the track
centerline as a **spline that we project onto** to recover arc-length `s` and
lateral offset for gameplay (lap timing, ranking, track limits, minimap, AI).

This removes the arc-length (Frenet) frame from the *physics* and with it the
curvature-coupling term that makes steering feel unnatural.

## Why — the root cause

Today every car is stored as `(s, x)` = distance along the centerline + lateral
offset, and the player heading is tracked *relative to the track tangent*.
Because the track frame rotates with the corner (curvature `k`), the heading
must constantly fight a drift term:

```
c.angle -= k * c.speed * dt;   // the track frame rotated under us
```

That coupling is inherent to simulating motion in a rotating (Frenet) frame, not
a bug we can tune away. Research consensus (autonomous-racing stacks, game
physics, motion-planning literature):

- Frenet is great for *planning* (decouples lateral/longitudinal) but a poor
  frame for *physics*: it is singular where curvature → 0, distorts distances as
  lateral offset approaches the radius of curvature, and injects
  curvature/Coriolis coupling into the equations of motion.
- Shipped games and robotics run dynamics in **world space** and treat the track
  as a spatial reference, not the state frame.

Sources: Cartesian-vs-Frenet planning papers, ForzaETH race stack, "Autonomous
Driving on Curvy Roads Without Reliance on Frenet Frame" (IEEE), game physics
texts. Full citations in `docs/steering-research.md` and the research notes.

## Target model

### Car state (world space)
```
pos   = {x, z}      // ground-plane world position (y/height derived from track)
head  = θ           // heading, radians, world frame
speed = v           // m/s along heading (arcade: velocity ~ heading direction)
```

### Lateral (steering) — bicycle yaw model, no curvature term
```
δ   = inputCurve(steer) * maxSteer(v)     // steering angle, speed-sensitive
ω   = v * tan(δ) / WHEELBASE              // yaw rate
ω   = clamp(ω, -MAX_YAW, MAX_YAW)         // yaw-rate cap (arcade stability)
θ  += ω * dt
pos += v * dt * (sinθ, cosθ)
```
With **no input the car simply goes straight** (θ unchanged) — it naturally runs
wide at corners because the *track* curves away, not because of a drift hack.
Speed-sensitive `maxSteer(v)` (large at low speed, small at high speed) is the
single most important arcade-steering parameter per the research.

### Longitudinal
```
accel : ACCEL * tractionCurve(v) * gearMult   (+ deploy)
brake : BRAKE
drag  : quadratic with speed (≈ k·v²) when coasting   // replaces flat COAST_DRAG
grip  : lateral grip cap (a_lat ≤ μg) → understeer when exceeded
slope : gravity along elevation grade h(s)
```

### Track as a spatial query (derived each frame)
Project `pos` onto the centerline spline → `(s, lateralOffset)`:
- **lap timing / sector / ranking**: from `s`
- **track limits / walls**: `|lateralOffset|` vs half-width(s)
- **minimap**: world `pos` directly
- **kerbs / grass / elevation**: sampled at `s`
- **AI**: project, aim for a target lateral offset on the racing line, convert
  the desired path back to a steering angle (pure-pursuit style)

Projection = closest point on an arc-length-sampled polyline/Catmull-Rom
centerline, with a **cached last-segment index** so each car only checks a few
neighbouring segments per frame. Cheap for 20 cars at 60 fps.

## Tilt input pipeline (already partly done)
Raw gravity-roll → calibrate → **One-Euro adaptive filter** (shipped) → soft
dead-zone (rescaled) → expo curve → steering command. The One-Euro filter
replaces the fixed EMA + slew limiter and fixes the jittery-vs-laggy tradeoff.

## Settings UX
Lead with 3 presets **CASUAL / STANDARD / PRO**; keep the granular sliders in a
collapsed ADVANCED block (matches F1/GT7/Forza). Defaults reproduce a good feel.

## Staged migration (each phase shippable & testable)

1. **Centerline spline + projection utility** in `tracks.js`:
   `Tracks.project(track, x, z) -> {s, lat, tangent}` with segment caching.
   Verify it round-trips against the existing `(s,x)` sampler. *No behaviour
   change yet.*
2. **World-space mirror (read-only)**: also store `pos/head` for the player,
   integrated in world space, and assert it stays consistent with `(s,x)`.
3. **Switch the PLAYER physics** to world space; derive `(s,x)` by projection for
   all the gameplay queries above. Update the `__apex` test hooks + steering
   tests to the new model.
4. **Switch the AI** to world-space pure-pursuit off the same spline.
5. **Collision / track-limits / camera** cleanups on world positions.
6. Remove the old Frenet integration path.

## Risks
- AI behaviour will shift (re-tune lane/overtake logic).
- Projection instability if a car is far off-track — clamp/search-window guards.
- Big diff; stage it so each phase keeps the game runnable and the tests green.
