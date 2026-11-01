---
name: game-feel
description: "Use when crashes, kerbs or gear shifts feel weak: screen shake, hit-stop, sparks, tyre marks, haptics or punchier sound, without changing physics. Not for: handling → tune-physics; steering input → input-controls; measuring camera lag → playwright-probe."
---

# Game feel for Apex 26

Juice is a **render/audio layer on top of deterministic driving**. Keep the
tyre model, race clock, AI and headless hooks stable; make events read better
through camera, particles, audio, tyre marks and visual body attitude. The
reason is the test suite: `obs()`/`act()` runs and the physics baseline must
replay identically, so feedback may *read* physics state but never write it.

## Map juice to Apex systems

Shake, kerb, sfx, sparks, kickup, tyre marks, body attitude, HUD pops and the perf budget each have one
start file: the channel table in [references/workflow.md](references/workflow.md). Every channel is
render/audio only; never write shake into `car.px/pz`, `s`, `x`, or `psi`.

**Bryce plays on a touch phone (iPhone).** Touch auto-comfort (`js/camera/cam-comfort.js`) turns shake, the kerb
shiver and the onboard buzz OFF on first touch boot, and iOS Safari has no `navigator.vibrate`. So a phone "punch"
must be AUDIO or VISUAL (body attitude, particles, HUD); shake and haptics alone ship invisible to him.

## Loop

1. Name the discrete event (impact, kerb entry, shift, sector); continuous
   events need a cooldown.
2. Pick 2–3 channels from the table in
   [references/workflow.md](references/workflow.md) and scale from data the
   sim already has (slip, impact speed, gear).
3. Prove physics AND race determinism without a browser:
   ```sh
   node --test tests/unit/physics-characterization-vm.test.mjs tests/unit/player-dynamics-vm.test.mjs
   node --test tests/unit/determinism-replay-vm.test.mjs   # same seed twice, AI finishing order: catches FX RNG/state leaks
   ```
   The first two pin the player model only; the third is the race-level check.
   Never regenerate `tests/data/physics-baseline.json` to make it pass. Then the single specs
   (AGENTS.md §Verification, rules 5 and 10): `node tools/ci/test-bg.mjs --spec tests/specs/physics-characterization.spec.js`,
   then `--spec tests/specs/agent-determinism.spec.js`. Touching `feel.hitStop`:
   compare `__apex.obs()` and lap time before/after on a seeded run.
4. See / hear it live at 844×390 touch: skill **mcp-probe** (`__apex.obs()`/`physState()` for kerb state).

## When NOT to use

- Silent or broken audio, rather than punchier feedback → **audio-debug**.
- The car's measured behaviour is wrong (understeer, grip, pace) → **tune-physics**.
- Camera lag: measure → **playwright-probe**, fix → **f1-animation-cameras** (also replay/broadcast cuts).
- Rumble/haptics *mapping* on a gamepad → **input-controls**.
- FX allocation or an RNG draw inside `updateCar`, or shake/freeze that changes `obs()`/`act()`:
  forbidden, see references/workflow.md §Common mistakes.

## Load on demand

- Channel table, the kerb-vs-kickup trap, the existing `hitStop` caveat and
  common mistakes → [references/workflow.md](references/workflow.md).
- Trauma-shake math, easing curves and the rest of the feedback menu →
  [references/feedback-recipes.md](references/feedback-recipes.md).
