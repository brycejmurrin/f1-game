# Game-feel channels, workflow, mistakes

Load this when picking a channel for kerb / wall / shift / collision juice.
Generic trauma-shake math: [feedback-recipes.md](feedback-recipes.md).

## Where to add feedback

| Feedback | Start here | Notes |
|---|---|---|
| Screen shake | `js/game.js` `shake` (grep `shake = Math.min`) | Wall: `addShake(0.1 + incidence * 0.3)` from `js/physics/wall-clamp.js`. Car-car: `collideFx()`. Kerb: `KERB_SHAKE`. Lines drift — grep the symbol. |
| Kerb strike | `js/game.js` `kerbCueT` block (grep `KERB_SHAKE`); numbers `KERB_SHAKE` 0.22 / `KERB_CUE_HOLD` 0.10 in `js/physics/consts.js` | **Not particles.** The cue block holds shake + `GameAudio.rumble` (`js/audio/engine.js`, 70 ms throttle) + haptics (`Input.vibrate/rumble`, 120 ms). Cue-only tuning: those consts, the throttles, `rumble()`. The lines just above it (the `c.speed` cut `6 * (1 - kerbGripSm) / 0.3 * dt`, `kerbGripSm` → 0.7) are PHYSICS — never touch them for feel. |
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

- Hunting `js/camera/vantage.js` for shake — it only defines modes; `shake`
  lives in `js/game.js`.
- Using `Particles.sparks`/`kickup` to fix kerb feel — kerb is `onKerb`.
- Editing physics constants because an impact feels soft. Layer audio/shake
  first; **tune-physics** only when measured behaviour is wrong.
- Allocating FX inside `updateCar`. Emit `c.fxSparkI` / bump `shake`, consume
  in render/audio.
- Applying shake to car/track/heading/collision. Camera/view only.
- A NEW hit-stop that touches the sim clock. The one exception already exists:
  `feel.hitStop` (game.js, `simTime = dt * 0.15`) slows the sim, fed only by
  car-to-car `collideFx` (`impact * 0.015` s); wall impacts add shake, not hitStop.
  Leave it as the only sim-slowing cue and never feed it from kerbs or walls.
  For any other "freeze" (the "hit-stop with no lap-time change" ask), hold the
  render instead: freeze the camera/particle/audio update for 1–3 frames while
  `updateCar` keeps stepping, so `obs()` and lap times are unchanged.
- Random effects that change headless runs. Isolate RNG from the sim stream.
- Ignoring reduce-intensity / low-end: cap shake/flash, decay quickly.
