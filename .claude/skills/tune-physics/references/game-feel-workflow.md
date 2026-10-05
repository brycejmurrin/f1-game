# Game-feel channels, workflow, mistakes

Load this when picking a channel for kerb / wall / shift / collision juice.
Generic trauma-shake math: [game-feel-feedback-recipes.md](game-feel-feedback-recipes.md).

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

1. Name the discrete event (impact, kerb entry, shift, sector). Continuous
   events need cooldowns.
2. Choose 2–3 channels. Scale from existing data (slip, impact, gear).
3. FX may **read** physics, never write forces/pose/timers/AI.
4. Verify visual/audio with hooks; run the relevant deterministic tests.
5. Determinism proof, no browser: `node --test tests/unit/physics-characterization-vm.test.mjs` (~3 s, same
   `tests/data/physics-baseline.json` as the browser spec; never regenerate it) plus `player-dynamics-vm.test.mjs`. These fixtures pin their exercised simulation paths; headless green alone
   does not establish live hit-stop wall/sim timing. Existing `hitStop` deliberately
   scales live sim time, while cosmetic shake belongs only in camera/render.
   Compare equal simulation time separately from equal wall time in a frame-driver
   contract before changing impact behavior; do not extend the slowdown to kerbs.
   Then the browser spec `physics-characterization` once (test-bg `physics-core`).

## Common mistakes

- Hunting `js/camera/vantage.js` for shake — it only defines modes; `shake`
  lives in `js/game.js`.
- Using `Particles.sparks`/`kickup` to fix kerb feel — kerb is `onKerb`.
- Editing physics constants because an impact feels soft. Layer audio/shake
  first; **tune-physics** only when measured behaviour is wrong.
- Allocating FX inside `updateCar`. Emit `c.fxSparkI` / bump `shake`, consume
  in render/audio.
- Applying shake to car/track/heading/collision. Camera/view only.
- Hit-stop by pausing the physics clock. Visual/audio freeze only. NB the existing `hitStop` (game.js, `simTime = dt * 0.15`,
  fed only by car-to-car `collideFx`, `impact * 0.015` s; wall impacts add shake, not hitStop) DOES slow the sim clock: it is live-only determinism-affecting, so do not extend it to kerbs; a kerb
  cue never needs it.
- Random effects that change headless runs. Isolate RNG from the sim stream.
- Ignoring reduce-intensity / low-end: cap shake/flash, decay quickly.
