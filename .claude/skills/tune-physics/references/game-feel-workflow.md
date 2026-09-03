# Game-feel channels, workflow, mistakes

Load this when picking a channel for kerb / wall / shift / collision juice.
Generic trauma-shake math: [feedback-recipes.md](game-feel-feedback-recipes.md).

## Where to add feedback

| Feedback | Start here | Notes |
|---|---|---|
| Screen shake | `js/game.js` `shake` (grep `shake = Math.min`) | Wall: `shake + 0.1 + incidence * 0.3`. Car-car: `collideFx()`. Kerb: `KERB_SHAKE`. Lines drift — grep the symbol. |
| Kerb strike | `js/game.js` `onKerb` (grep `KERB_SHAKE`) | **Not particles.** `kerbCueT` holds shake + `GameAudio.rumble` + haptics. Tune here. |
| Collision / wall sfx | `GameAudio.collision()` | Gate with `collideT` / `wallT`. |
| Wall/car-car sparks | `Particles.sparks` | Wall scrape from `Tracks.wallAt` proximity; collision via `c.fxSparkI`. |
| Off-track kickup | `Particles.kickup` | Only when `c.offroad` (`Math.abs(c.x) > hw && !c.onKerb`). Kerbs never get kickup. |
| Tyre marks | `js/fx/skidmarks.js` | Stamp from measured slip; keep the ring bounded. |
| Chassis attitude | `js/physics/body-attitude.js` | Visual only; never write back into physics. |
| Gear-shift punch | `GameAudio.shift()` | Layer sfx/camera tick; do not retune physics. |
| HUD/menu pop | `js/ui/hud.js`, `js/ui/select-screen.js` | Prefer CSS/DOM transitions. |
| Perf fallback | `js/perf/governor.js` | Lower counts before dropping simulation quality. |

## Workflow

1. Name the discrete event (impact, kerb entry, shift, sector). Continuous
   events need cooldowns.
2. Choose 2–3 channels. Scale from existing data (slip, impact, gear).
3. FX may **read** physics, never write forces/pose/timers/AI.
4. Verify visual/audio with hooks; run the relevant deterministic tests.

## Common mistakes

- Hunting `js/camera/vantage.js` for shake — it only defines modes; `shake`
  lives in `js/game.js`.
- Using `Particles.sparks`/`kickup` to fix kerb feel — kerb is `onKerb`.
- Editing physics constants because an impact feels soft. Layer audio/shake
  first; **tune-physics** only when measured behaviour is wrong.
- Allocating FX inside `updateCar`. Emit `c.fxSparkI` / bump `shake`, consume
  in render/audio.
- Applying shake to car/track/heading/collision. Camera/view only.
- Hit-stop by pausing the physics clock. Visual/audio freeze only.
- Random effects that change headless runs. Isolate RNG from the sim stream.
- Ignoring reduce-intensity / low-end: cap shake/flash, decay quickly.
