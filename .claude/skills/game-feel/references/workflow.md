# Game-feel channels, workflow, mistakes

Load this when picking a channel for kerb / wall / shift / collision juice.
Generic trauma-shake math: [feedback-recipes.md](feedback-recipes.md).

## Where to add feedback

| Feedback | Start here | Notes |
|---|---|---|
| Screen shake | accumulator `feel.shake` in `js/game.js`; applied by `CamFeel.shake` (`js/camera/feel.js`) via `CamTune.shakeOffset` (`js/camera/offsets.js`, zero under comfort) | Wall: `addShake` from `js/physics/wall-clamp.js`. Car-car: `collideFx()`. Kerb: `KERB_SHAKE`. Decay and curve: read `feel.shake` in game.js and `shakeOffset`. |
| Kerb strike | `js/game.js` `kerbCueT` block (grep `KERB_SHAKE`); `KERB_SHAKE` / `KERB_CUE_HOLD` in `js/physics/consts.js` | **Not particles.** `KERB_SHAKE` is a HELD FLOOR (`Math.max(feel.shake, KERB_SHAKE)` while the cue holds): raising it makes a steadier buzz, not punch. PUNCH = a one-off add on the kerb-ENTRY edge (`kerbCueT` rising from 0), with a cooldown, scaled by speed; keep the floor. AUDIO = the continuous kerb loop in `js/audio/engine.js` (`kerbSrc`/`kerbGain`, `setEngine`'s `onKerb`); `GameAudio.rumble()` is a no-op while `kerbLive`. Haptics `Input.vibrate/rumble` (none on iOS). Onboard shiver: `js/camera/vantage.js` `onboardAttitude`. The lines just above the cue block (the `c.speed` cut and `kerbGripSm`) are PHYSICS — never touch them for feel. |
| Collision / wall sfx | `GameAudio.collision()` | Gate with `collideT` / `wallT`. |
| Wall/car-car sparks | `Particles.sparks` | Wall scrape from `Tracks.wallAt` proximity; collision via `c.fxSparkI`. |
| Off-track kickup | `Particles.kickup` | Only when `c.offroad` (`Math.abs(c.x) > hw && !c.onKerb`). Kerbs never get kickup. |
| Tyre marks | `js/fx/skidmarks.js` | Stamp from measured slip; keep the ring bounded. |
| Chassis attitude | `js/physics/body-attitude.js` | Visual only; never write back into physics. |
| Gear-shift punch | `GameAudio.shift()` | Layer sfx/camera tick; do not retune physics. |
| HUD/menu pop | `js/ui/hud.js`, `js/ui/select-screen.js` | Prefer CSS/DOM transitions. |
| Perf fallback | `js/perf/governor.js` | Lower counts before dropping simulation quality. |

## Workflow

The loop and its determinism commands are in [SKILL.md](../SKILL.md) §Loop. One caveat
it leaves out: the VM fixtures pin the simulation paths they exercise, so a headless
green does not prove live wall-clock timing. A change touching `feel.hitStop` must
compare equal sim time and equal wall time separately.

## Common mistakes

- Adding a second shake accumulator — feed `feel.shake`; `vantage.js` owns only the onboard kerb shiver.
- Shipping a kerb "punch" as shake or vibrate only — see SKILL.md (touch phone).
- Using `Particles.sparks`/`kickup` to fix kerb feel — kerb is `onKerb`.
- Editing physics constants because an impact feels soft. Layer audio/shake
  first; **tune-physics** only when measured behaviour is wrong.
- Allocating FX or drawing RNG inside `updateCar`. Setting flags/scalars there is fine:
  emit `c.fxSparkI` / bump `feel.shake`, consume in render/audio.
- Applying shake to car/track/heading/collision. Camera/view only.
- A NEW hit-stop that touches the sim clock. The one exception already exists:
  `feel.hitStop` (game.js, grep `feel.hitStop > 0`; skipped under NetPlay) slows the sim, fed only by
  car-to-car `collideFx`; wall impacts add shake, not hitStop.
  Leave it as the only sim-slowing cue and never feed it from kerbs or walls.
  For any other "freeze" (the "hit-stop with no lap-time change" ask), hold the
  render instead: freeze the camera/particle/audio update for 1–3 frames while
  `updateCar` keeps stepping, so `obs()` and lap times are unchanged.
- Random effects that change headless runs. Isolate RNG from the sim stream.
- Ignoring reduce-intensity / low-end (`motionReduced()` / `camComfort()`): cap shake/flash, decay quickly.
