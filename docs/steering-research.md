# Steering Redesign — Research Synthesis

Research across mobile racers (Real Racing 3, Asphalt 9, F1 Mobile), console
sims/arcade (F1 24/25, Forza Horizon + Motorsport, Gran Turismo 7), and the
sensor/signal-processing literature. Goal: redesign Apex 26 steering "the right
way" rather than bolting on more sliders.

## 1. The biggest finding: presets first, sliders second

EVERY major racing game leads with 3 difficulty/assist PRESETS and hides the
granular controls behind a "Custom/Advanced" option. We currently do the
opposite: 8 raw sliders, no presets, no good guided default.

| Game            | Top-level presets                  | Granular controls |
|-----------------|------------------------------------|-------------------|
| F1 24/25        | Casual / Standard / Expert         | under Standard    |
| Gran Turismo 7  | Beginner / Intermediate / Expert   | "Custom" unlocks 11 settings |
| Forza Motorsport| 6 assist levels + Custom           | yes               |
| Forza Horizon   | Easy/Medium/Hard/Ultimate + Custom | yes               |

**Design rule:** ship **Casual / Standard / Pro** presets as the primary UI.
Put the detailed sliders inside a collapsed **ADVANCED** section. 90% of players
never open Advanced; good preset defaults are what matter.

## 2. Tilt input pipeline (the "right" order)

Consensus pipeline, raw sensor → steering command:

1. **Read** orientation as a gravity-roll angle (we already do this via
   `atan2` of the gravity vector — good, avoids gimbal-lock jumps).
2. **Calibrate**: subtract the captured neutral (we do this).
3. **Dead zone** with *re-scale*: after subtracting the dead zone, rescale so
   output starts at 0 right at the edge (no jump). Typical 2–3° / 5–8%. (we do this)
4. **Response curve** (expo / power curve): `sign(x)*|x|^k`, k≈1.5–2.5 feels
   good; k=1 linear. (we do this, default ~2.4)
5. **Filter for jitter** — see §3.
6. **Output** clamped to [-1,1].

We have all the stages. The weak link is the filter (§3) and the lack of presets.

## 3. Best filter for "jittery vs laggy": the One-Euro filter

The recurring tilt complaint is the classic tradeoff: heavy smoothing kills
jitter but adds lag ("laggy"); light smoothing is responsive but twitchy. The
literature's standard answer is the **1€ (One-Euro) filter** (Casiez et al.):
an adaptive low-pass whose cutoff rises with movement speed.

- When the hand is **still** → low cutoff → heavy smoothing → no jitter on straights.
- When the hand moves **fast** → high cutoff → little smoothing → no lag on quick turns.

This directly beats our current fixed EMA + fixed slew-rate limiter, which
must compromise one for the other. Two params: `minCutoff` (≈1.0 Hz) and
`beta` (≈0.007–0.05, higher = more responsive to speed).

Sensor note: `DeviceOrientationEvent` beta/gamma are already OS sensor-fused,
so we don't need to build our own complementary/Kalman filter — the 1€ filter
on the derived roll angle is the right level.

## 4. Steering model (physics)

- Arcade games use **speed-sensitive steering**: lots of angle at low speed,
  tapering at high speed (prevents twitchy high-speed darting). We already
  scale grip with speed; keep/strengthen this.
- Distinction between **turning the heading** vs **turning the velocity vector**.
  Our heading model (rotate heading, slide toward it, curvature rotates the
  track frame so no-input runs wide) is a sound arcade choice and matches the
  user's "full manual, no auto-steer" requirement. Keep it.
- Enforce a **max yaw rate / slip clamp** (we do: `STEER_MAX_SLIP`).
- Optional **self-centering** and **counter-steer assist** exist in arcade
  games but conflict with the user's "full manual" intent → keep OFF by default,
  expose as an assist at most.

## 5. Racing line / steering assists

- "Racing line" in almost every game is a **visual** aid, not auto-steer.
- True steering help is layered: gentle bias (Forza "Assisted") → strong
  snap (Forza "Super Easy" / GT7 "Auto-Drive"). The user wants none of this by
  default. Our additive `raceLineAssist` bias (off by default, steerable
  against) is the correct, least-intrusive design. Keep it in Advanced.

## 6. Concrete default numbers (from mobile racers)

- Dead zone: 2–3° (≈5–8%). Real Racing 3 sens "5" = 1:1; Asphalt 9 ~8% dz.
- Full-lock tilt range: ~20–40° of physical roll (ours ~34° default is fine).
- Expo exponent: ~1.5–2.5.
- 1€ filter: minCutoff ≈ 1.0 Hz, beta ≈ 0.01.
- Calibrate on a flat/neutral grip; recalibrate on orientation change (we do).

## Recommended redesign

1. **Add presets** `CASUAL / STANDARD / PRO` as the primary steering UI; move the
   8 sliders into a collapsible **ADVANCED** block. Add **RESET TO DEFAULTS**.
2. **Replace** the fixed EMA + slew limiter with a **1€ adaptive filter** on the
   tilt roll angle. This is the single biggest feel upgrade.
3. Keep the heading physics model and the additive racing-line assist.
4. Re-validate with the Playwright `__apex` harness (add a tilt-path test that
   asserts presets/strength actually change the output).

### Preset definitions (proposed)

| Param         | CASUAL | STANDARD | PRO  |
|---------------|--------|----------|------|
| Tilt strength | 0.55   | 0.70     | 0.95 |
| Response rate | 2.0    | 2.6      | 3.4  |
| Linearity expo| 2.8    | 2.4      | 1.4  |
| 1€ responsive | low    | mid      | high |
| Dead zone     | 3.5°   | 2.4°     | 1.5° |
| Steer lock    | 0.5    | 0.5      | 0.6  |
| Racing line   | PULL 2 | OFF      | OFF  |
