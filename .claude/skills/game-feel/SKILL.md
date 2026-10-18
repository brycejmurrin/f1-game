---
name: game-feel
description: "Use when impacts, kerbs, walls, gear shifts or collisions feel weak or flat: screen shake, hit-stop, sparks/kickup, tyre marks, haptics, punchier camera/audio polish that must NOT change physics or determinism. Car behaviour wrong → tune-physics."
---

# Game feel for Apex 26

Juice is a **render/audio layer on top of deterministic driving**. Keep the
tyre model, race clock, AI and headless hooks stable; make events read better
through camera, particles, audio, tyre marks and visual body attitude. The
reason is the test suite: `obs()`/`act()` runs and the physics baseline must
replay identically, so feedback may *read* physics state but never write it.

## Map juice to Apex systems

- **Shake** → `js/game.js` `shake` (not `js/camera/vantage.js` — that file is
  modes only). Never write shake into `car.px/pz`, `s`, `x`, or `psi`.
- **Particles** → `js/fx/particles.js`. Render-path only.
- **Audio** → `js/audio/engine.js` (shifts, kerb, wall, ERS, sector/lap).
- **Tyre marks** → `js/fx/skidmarks.js` from real slip/contact.
- **Chassis motion** → `js/physics/body-attitude.js` — visual only.
- **Budget** → `js/perf/governor.js` / `PerfGov`. Cap and decay.

## Loop

1. Name the discrete event (impact, kerb entry, shift, sector); continuous
   events need a cooldown.
2. Pick 2–3 channels from the table in
   [references/workflow.md](references/workflow.md) and scale from data the
   sim already has (slip, impact speed, gear).
3. Prove determinism without a browser (~3 s):
   ```sh
   node --test tests/unit/physics-characterization-vm.test.mjs tests/unit/player-dynamics-vm.test.mjs
   ```
   Never regenerate `tests/data/physics-baseline.json` to make it pass. Then the
   browser spec `physics-characterization` once, via `node tools/ci/test-bg.mjs physics-core`.

## When NOT to use

- The car's measured behaviour is wrong (understeer, grip, pace) → **tune-physics**.
- Camera lag or framing → **playwright-probe**; replay/broadcast cuts → **f1-animation-cameras**.
- Rumble/haptics *mapping* on a gamepad → **input-controls**.
- FX allocation inside `updateCar`, or hit-stop/shake that changes `obs()`/`act()`.

## Load on demand

- Channel table, the kerb-vs-kickup trap, the existing `hitStop` caveat and
  common mistakes → [references/workflow.md](references/workflow.md).
- Generic trauma-shake math and easing (inspiration only; Godot/Unity snippets) →
  [references/feedback-recipes.md](references/feedback-recipes.md).
