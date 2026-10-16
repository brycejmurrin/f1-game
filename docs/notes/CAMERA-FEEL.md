# Camera feel (2026-10-01)

In-race camera behaviour that used to live as scattered branches in
`js/camera/vantage.js` and `js/game.js` now has a home in `js/camera/feel.js`
(`CamFeel`). Player settings inject into SETTINGS › CAMERA FEEL (no shell DOM).

## Free-look

On **cockpit / hood / visor / t-cam** only: right stick (standard axes 2/3) and
RMB-drag on the game canvas yaw/pitch the aim about the eye. Offsets are
additive on top of the CAMERA TUNER's yaw/pitch, damp back to zero when the
stick is released and the right button is up (a held, still RMB holds the
glance — `Input.lookMouseHeld()`, 2026-10-04), and are forced off under
`camComfort()` (Reduce Motion / XR presenting). The stick is read only on a
`mapping: "standard"` pad and never from an axis the wheel wizard mapped to
steer/throttle/brake (a wheel pedal resting at −1 on axis 2 pinned the yaw).

## Look-back

`CamFeel.shouldLookBack(mode, held)` — **reverse** and **rear** already face
aft, so a 180° flip is skipped (the old path flipped every mode). Default is
hold (B / pad). **LOOK BACK LATCH** (off by default) toggles on rising edge.
A flip is a CUT for the aim (2026-10-04): `CamFeel.consumeAimSnap()` makes
game.js snap `camTgt` on the edge (damping the mirrored POINT dragged it
through the eye: −65° pitch in chase, −89° at 144 Hz), and the roll target is
mirrored while `CamFeel.lookingBackNow()`. `snapGameCam` resets every
CamFeel follow, free-look, the latch and vantage's bend hang.

## Speed FOV

One curve: `FOV = base + widen * sp * scale + deploy * dep`.
`CamFeel.modeFov(mode, sp, deploy)` is the table; vantage passes CamTune-scaled
`spFov` (COMFORT › SPEED FOV) so look-ahead keeps full `spN`. Modes that previously ignored
speed (tcam, side, heli) use `scale: 0.5` so they share the curve without the
full chase widen. Side still adds its street-corridor term on top.

## Shake / buzz scope

| effect | where | modes |
|---|---|---|
| Trauma shake (`shake` in game.js → `CamFeel.shake`) | every race camera | all (`CamTune.shakeOffset` applies COMFORT › HEAD BOB / reduce-motion). Real-time sum-of-sines noise, so the same rms reaches the damper at any fps (was per-frame `Math.random()`: 2.2x stronger at 30 than 144 fps). On the bolted set the eye moves ≤ `TUB_EYE_MAX` 3 cm and the trauma becomes aim rotation |
| Speed buzz | game.js after vantage | cockpit, hood, visor, tcam (`CamFeel.isBuzzMode`; amp via `CamTune.buzzAmp`) |
| Kerb rib shiver | `vantage.js` `onboardAttitude` | same bolted set (incl. tcam) |

Buzz stays off on a wet road (SSR flicker); comfort scaling lives in CamTune.

## Speed vignette

Optional CSS tunnel overlay (`#speed-vignette`), **off by default**. Grows with
`spN²`; forced off under `camComfort()`. Does not touch the lighting-tuner
vignette knob (other sessions own that pipeline).
