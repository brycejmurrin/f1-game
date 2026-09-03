---
name: game-feel
description: Use when the user says game feel, juice, punchy feedback, screen shake, weak kerb/wall/gear-shift/collision hits, hit-stop, or wants more responsive camera/particles/audio polish without changing driving physics.
---

# Game feel for Apex 26

Juice is a **render/audio layer on top of deterministic driving**. Keep the
tyre model, race clock, AI, and headless hooks stable; make events read
better through camera, particles, audio, tyre marks, and visual body
attitude.

## Map juice to Apex systems

- **Shake** → `js/game.js` `shake` (not `js/game/cameras.js` — that file is
  modes only). Never write shake into `car.px/pz`, `s`, `x`, or `psi`.
- **Particles** → `js/game/particles.js`. Render-path only.
- **Audio** → `js/game/audio.js` (shifts, kerb, wall, ERS, sector/lap).
- **Tyre marks** → `js/game/skidmarks.js` from real slip/contact.
- **Chassis motion** → `js/physics/body-attitude.js` — visual only.
- **Budget** → `js/game/perf.js` / `PerfGov`. Cap and decay.

## When NOT to use

- Actual car behaviour wrong → **tune-physics**.
- FX allocation inside `updateCar`.
- Hit-stop or shake that changes `obs()`/`act()` determinism.

## Load on demand

- Channel table, workflow, kerb-vs-kickup mistakes →
  [references/workflow.md](references/workflow.md).
- Generic trauma-shake math (inspiration only) →
  [references/feedback-recipes.md](references/feedback-recipes.md).
