---
name: game-feel
description: Use when the user says game feel, juice, make it feel good/punchy, screen shake, hit stop/freeze frames, easing, squash and stretch, knockback, impact frames, weak hits/jumps/pickups/deaths, or wants more responsive feedback/polish.
---

# Game feel for Apex 26

Juice in this repo is a **render/audio layer on top of deterministic driving**.
Keep the tyre model, race clock, AI and replayable headless hooks stable; make
events read better through camera, particles, audio, tyre marks, and short visual
body attitude effects.

Adapted from generic game-feel recipes, but the implementation target here is
Apex 26's plain-JS IIFE game loop and `js/game/*` modules.

## Overview: map juice to Apex systems

- **Camera punch / screen shake** -> `js/game.js`: trauma lives in the `shake`
  variable (0..1, decays in the render loop, applied to `eyeT`/`tgtT` after
  `GameCams` picks a rig). `js/game/cameras.js` / `GameCams` owns camera
  *modes* only — not shake storage. Never write shake to `car.px/pz`, `s`, `x`,
  or `psi`.
- **Particles and flashes** -> `js/game/particles.js` / `Particles`: transient
  smoke, sparks, spray, glow puffs. This is render-path feedback; it must not
  feed physics or collision decisions.
- **Audio weight** -> `js/game/audio.js` / `GameAudio`: layer short sfx around
  gear shifts, kerb hits, wall scrapes, ERS/overtake, sector/lap events.
- **Tyre evidence** -> `js/game/skidmarks.js` / `SkidMarks`: marks should follow
  real slip/contact events, not invented curvature or camera-only drama.
- **Visual chassis motion** -> `js/game/bodyattitude.js` / `BodyAttitude`: pitch,
  squat, roll and bob are visual only; they must not alter the driving model.
- **Frame budget/accessibility** -> `js/game/perf.js` / `PerfGov`: juice is
  optional polish under load. Prefer bounded pools and reduce-shake/reduce-flash
  settings over unbounded bursts.

## When to use

- A mechanic already works but feels weak: kerb strike, wall brush, gear shift,
  overtake activation, collision, landing after jump, lap/sector completion.
- You need a small camera impulse, particle burst, sfx layer, tyre mark, HUD pop,
  or short freeze-like emphasis attached to a discrete event.
- You are choosing feedback intensity tiers (small/medium/large) for repeated
  racing events so routine noise does not drown out real impact.

## When NOT to use

- Do not retune steering, grip, braking, yaw damping, or `dt` for "feel"; use
  `tune-physics` when the actual car behaviour is wrong.
- Do not put FX allocation, random bursts, logging, or canvas/audio churn inside
  the `updateCar` hot path. Emit a small event/impulse, then let the owning
  visual/audio module consume it.
- Do not let hit-stop or screen shake change headless determinism. `obs()`,
  `act()`, physics tests, AI and replay should see the same simulation with FX
  enabled or disabled.
- Do not fight `PerfGov`: effects need caps, pooling, decay, and an off/reduced
  mode for low-end devices or motion-sensitive players.

## Quick reference: where to add feedback

| Feedback | Start here | Notes |
|---|---|---|
| Screen shake / camera impulse | `js/game.js` — `shake` var + decay block (~line 5414; grep `shake = Math.min`) | Wall hits: `shake = Math.min(1, shake + 0.1 + incidence * 0.3)` in the wall collision path (~4385). Car-car: `shake += impact * 0.45` in `collideFx()` (~3284). Kerb: `KERB_SHAKE` constant. Lines drift — grep the symbol, don't trust the number. |
| Kerb strike (weak-feeling kerb hits) | `js/game.js` `onKerb` block, ~line 3865-3868 (grep `KERB_SHAKE`) | **Not particles.** The sticky `kerbCueT` hold layers `shake = Math.max(shake, KERB_SHAKE)`, `GameAudio.rumble()` (gated by `kerbSndT` cooldown), and haptics (`navigator.vibrate(15)` + `Input.rumble(0.25, 90)`, gated by `kerbHapT`) into one continuous cue instead of re-arming every ~4 m node. If "kerb hits feel weak", tune `KERB_SHAKE` / the rumble args / the haptic amount **here** — this is the one block that owns kerb feedback. |
| Collision or wall scrape sfx | `GameAudio.collision()` from `js/game.js` wall/car-car paths | Gate repeated scrapes with cooldown (`collideT`, `wallT`) so audio does not buzz. |
| Wall/car-car sparks | `js/game/particles.js` / `Particles.sparks` | Wall scrape sparks: render loop in `game.js` (~6602; grep `Particles.sparks`) reads `Tracks.wallAt` proximity. Collision sparks via `c.fxSparkI` flag set in physics, consumed in render. |
| Off-track dust/grass kickup | `js/game/particles.js` / `Particles.kickup` | Fires only when `c.offroad` is true (`Math.abs(c.x) > hw && !c.onKerb` — **excludes riding a kerb**, ~line 6647; grep `Particles.kickup`). A car on a kerb (not off-track) gets the kerb row above, never `kickup`; don't add kickup particles to "fix" kerb feel — that channel is offroad-only by design. |
| Tyre marks | `js/game/skidmarks.js` | Stamp from measured slip/contact; keep the ring buffer bounded. |
| Chassis pitch/roll/bob | `js/game/bodyattitude.js` | Visual attitude only; never write back into physics. |
| Gear-shift punch | `js/game/audio.js` `GameAudio.shift()` + auto-shift call sites near shift audio in `game.js` `updateCar` | Layer a short sfx/camera tick on upshift/downshift; do not retune physics for shift feel. |
| HUD or menu pop | `js/game/hud.js`, `js/game/menus.js`, CSS components | Prefer short CSS/DOM transitions over per-frame JS where possible. |
| Performance fallback | `js/game/perf.js` | Lower counts/intensity before dropping simulation quality. |

## Apex workflow

1. **Name the event.** Find the existing discrete moment (impact, kerb entry,
   gear shift, sector complete). If it is continuous, add cooldowns or thresholds.
2. **Choose 2-3 channels.** Example: medium kerb = tyre chirp + dust + tiny
   camera impulse; heavy wall = scrape sfx + sparks + stronger decaying shake.
3. **Scale by intensity.** Derive effect amount from existing event data such as
   slip, impact speed, throttle/gear transition, or contact severity.
4. **Keep simulation invariant.** FX may read physics state, but must not write
   forces, pose, timers, racing line, or AI state.
5. **Verify both paths.** Check the visual/audio result with Playwright/debug
   hooks and run the relevant deterministic tests after source edits.

## Common mistakes

- Hunting `js/game/cameras.js` for shake/trauma storage — it only defines camera
  *modes*; the `shake` variable and its writers/decay live in `js/game.js`.
- Reaching for `Particles.sparks`/`Particles.kickup` to fix weak kerb feel —
  kerb feedback is the dedicated `onKerb` block in `js/game.js` (shake +
  `GameAudio.rumble` + haptics), and `kickup` is gated to `c.offroad`, which
  explicitly excludes riding a kerb.
- Editing physics constants because an impact feels soft. First layer audio,
  shake, sparks or tyre evidence; only tune physics when measured behaviour is
  wrong.
- Adding expensive FX directly inside `updateCar` or other per-car hot loops.
  Emit a bounded flag/impulse (e.g. `c.fxSparkI`, bump `shake`) and consume it
  in the render/audio path (`Particles`, `GameAudio`, `SkidMarks`,
  `BodyAttitude`). Do not allocate particles or call audio from the physics step.
- Applying shake to the car, track position, heading, or collision shape. Shake
  the camera/view only (`eyeT`/`tgtT` offsets after the rig is chosen).
- Implementing hit-stop by pausing the physics clock. If you need emphasis, use
  visual/audio freeze cues that do not alter `act()`/`obs()` determinism.
- Letting random effects change reproducible headless runs. Use visual-only RNG
  or deterministic seeds isolated from the simulation stream.
- Ignoring accessibility and low-end devices: cap shake/flash, decay quickly,
  and provide or respect reduce-intensity settings.

## Optional generic recipes

For trauma-shake math, easing intuition, and feedback bundle examples, see
`references/feedback-recipes.md`. Treat it as inspiration only; do not import its
external engine assumptions into Apex.
