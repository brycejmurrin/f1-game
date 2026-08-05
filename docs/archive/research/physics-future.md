# Steering & Physics — Research Findings and Next Steps

Synthesis of parallel web research (arcade car-physics models + mobile tilt UX)
against our current implementation. Goal: decide whether/how to upgrade, and
keep it grounded in what shipped games actually do.

## Where we are today

- **Player physics**: kinematic bicycle model in world space.
  `yawRate = speed · tan(steerAngle) / WHEELBASE`, heading integrated from yaw
  rate, and **velocity is always exactly along heading**
  (`pos += speed · (sinθ, cosθ)`). Gameplay `(s, x)` derived by projecting onto
  the centreline each frame.
- **No lateral velocity, no slip, no grip circle, no weight transfer.** The car
  is "on rails" — it points where it's going, always.
- **Tilt input**: deviceorientation → gravity-roll → One-Euro adaptive filter →
  soft dead-zone → expo → slew limiter → command. Auto-calibrates at the lights.

This is correct and cheap, and matches the *simplest* tier of shipped arcade
games. The research consensus is that it's a fine base — the question is only
whether to add *feel*.

## Physics: the model hierarchy (research)

| Tier | Adds | Feel | CPU/car | Shipped examples |
|---|---|---|---|---|
| (a) Kinematic bicycle *(us)* | — | responsive, "on rails" | ~1–2 µs | classic arcade, Asphalt-tier |
| (b) **+ lateral-velocity damping + grip circle** | drift/slide, understeer at the limit | satisfying, forgiving | ~5–7 µs | TrackMania, NFS Underground |
| (c) Dynamic bicycle (cornering stiffness, slip angles) | natural under/oversteer | "simcade" | ~8–12 µs | Forza Horizon |
| (d) Pacejka tyre model | true tyre-limit behaviour | sim | ~15–25 µs | iRacing, ACC |

**Recommended upgrade: tier (b).** Highest feel-per-cost, ~5–7 µs/car × 22 cars
≈ negligible in a 16.6 ms frame, and it's the arcade-benchmark approach.

### What (b) adds, concretely
A **lateral velocity** `vLat` that lags the heading (a "drift factor"), plus a
**grip circle** that caps combined cornering+braking force so over-driving a
corner produces understeer.

```
δ        = inputCurve(steer) · maxSteer(speed)        // already have
yawRate  = speed · tan(δ) / WHEELBASE                 // already have
heading += yawRate · dt

vLat    *= GRIP_DECAY            // 0.90–0.95: lower = more slide, higher = more grip
gripCap  = MAX_GRIP - |brake/accel force|             // friction-circle coupling
vLat     = clamp(vLat + yawRate·speed·dt, -gripCap, gripCap)

pos += dt · ( speed·(sinθ,cosθ) + vLat·(cosθ,-sinθ) ) // forward + sideways slip
```

Tuning knobs: `GRIP_DECAY` (slide), `MAX_GRIP` (understeer onset), plus the
existing `WHEELBASE`/`STEER_EXPO`/`STEER_MAX_SLIP`. This would naturally give the
game "slip when you overcook a corner" without touching the AI or projection
(they keep consuming `(s, x)` exactly as now).

**Risk**: it changes feel and needs hands-on tuning; the projection search
window may need widening if a big slide throws the car far off the centreline in
one frame. Stage it behind a flag and tune on-device.

## Tilt input: research verdict

Our pipeline is **sound** and matches best practice. Specific findings:

- **One-Euro is a good choice.** For a single 1-D steering signal it beats fixed
  EMA (jitter-vs-lag tradeoff) and is far cheaper than Kalman. Kalman/Madgwick
  only pay off for full 3-D attitude/sensor-fusion, which we don't need.
- **Gravity-roll source is correct** — using the gravity vector (not raw
  beta/gamma) is what avoids the gimbal-lock "acts different held upright"
  problem near vertical. We already do this.
- **Auto-calibrate + manual recalibrate** is the recommended combo (we have
  both: calibrate at the lights + RECALIBRATE button). Nice-to-have:
  re-calibrate prompt if the neutral drifts a lot mid-session.
- **Speed-sensitive steering** is "the single most important arcade param" — we
  have it (`maxDelta` tapers with speed). Could expose its curve as a slider.
- **Dead-zone + expo** are standard; ours are adjustable. Good.

No change strongly indicated for tilt. Optional small wins: a "steering
sensitivity vs speed" curve, and a drift-watchdog that suggests recalibration.

## Test coverage added alongside this research

- `tests/longitudinal.spec.js`: throttle/coast/brake ordering, top speed bound,
  grass drag, speed-sensitive cornering, start/finish lap-cross + wrap.
- (existing) `world-physics`, `steering`, `sliders`, `collisions`, `projection`.

If we implement tier (b), add tests for: slide decays to zero with no input,
over-driving a corner widens the line (understeer), and `vLat` never makes
`(s,x)`/projection blow up.

## Recommendation

1. **Keep the tilt pipeline as-is** (validated by research).
2. **Prototype tier (b)** (lateral-velocity damping + grip circle) behind a flag,
   tune on-device, ship if it feels better. This is the one change most likely
   to make cornering feel "great" rather than "fine".
3. Optionally expose a speed-sensitivity curve slider.

Sources: TrackMania/NFS/Forza physics breakdowns, SergeyMakeev ArcadeCarPhysics,
Rocket League GDC, friction-circle (SAE), Casiez 2012 One-Euro, York Univ. tilt
HCI studies, Android/iOS motion-sensor docs. Full link list in the research
transcript.
