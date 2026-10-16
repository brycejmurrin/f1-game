---
name: tune-physics
description: "Use for physics A/B tuning, grip, braking, road-follow, pace, or game feel; camera → playwright-probe; controls → input-controls; AI → ai-racecraft."
---

# Tune the physics

Per-axle bicycle model + combined-slip friction ellipse. Tune the way the
suite does: **headless, deterministic, relative assertions** — never brittle
absolute magnitudes.

## Constant → behaviour (`__apex.setPhysics({...})`)

| Param | Effect | Bigger = |
|---|---|---|
| `wheelbase` (`WHEELBASE`) | turn-in | lazier |
| `expo` (`STEER_EXPO`) | input curve | gentler near centre |
| `maxSlip` (`STEER_MAX_SLIP`, rad) | max steer lock | sharper low-speed |
| `speedRef` (`STEER_SPEED_REF`, m/s) | lock taper | keeps lock at speed |
| `drift` (`DRIFT`) | rear looseness | more tail-out (debug) |
| `roadFollow` (`ROAD_FOLLOW`, ships **0** = OFF) | curvature assist | more auto-drive |
| `frontGrip` (`FRONT_GRIP`) | front friction bias | less understeer |
| `playerGrip` (`PLAYER_GRIP`) | player vs AI headroom | more forgiving |
| `yawDamp` (`YAW_DAMP`) | yaw damping | calmer |
| `yawInertia` (`YAW_INERTIA`) | rotational inertia | lazier (`<1` snappier) |
| `pace` (`PACE`) | ground-speed scale | faster everywhere |
| GRIP STEER (`js/physics/grip-steer.js`; notch 1 = OFF) | assist-gated steering cap at the front's peak slip | steadier front under steer |

`expo` / `maxSlip` / `speedRef` are also the player's STEER sliders (LINEARITY / STEER LOCK /
SPEED STEER): the slider UI, defaults and migration are **input-controls**; here they are A/B knobs.
There is no "steer gain" knob: `updateCar` (js/game.js) steers `sign(s)·|s|^expo · maxSlip · lockTaper`, where
`lockTaper` is 1 up to 15 m/s (vStd), `1/(1 + vStd/speedRef)` from 30 m/s, and a linear blend between, so slow corners
sit in the blend. A/B `maxSlip` (linear gain), `expo` (near centre) or `speedRef` (speed taper); turn-in understeer also
moves with `frontGrip` and `yawInertia`.

Numbers are not quoted here (they drift): read the live values with `__apex.tuning()` (js/agent/apex.js). Boot-effective
defaults come from `js/input/steer-tuning.js` `applySteerTuning()` (slider defaults in `js/ui/settings-export.js`) —
the game.js literals are dead.
`PACE` is a scale, not a cap; compare speeds via `vTop()`/`vStd()`/`aStd()`.

**The arc must not reach the driver.** With assists off, nothing derived from
track curvature / racing line may affect the player. New `Tracks.curvature()`
(or equivalent) reads belong in a legitimate column — AI-only, assist-gated,
broadcast-only, or surface — see `docs/PHYSICS.md`. Do not "help" the player
by feeding path curvature into steer/throttle when assists are off.

**`ROAD_FOLLOW` ships at `0` (OFF)** on purpose. The DRIVING HELP slider maps
notch 1..10 to `0..0.70` (notch 1 = off). Recommending a raised default is a
design reversal, not a tweak — flag it.

Fixed in `js/physics/consts.js` (`PhysicsConsts`, not `setPhysics`): `LONG_GRIP`, `CS_FRONT/CS_REAR`,
`FRONT_WEIGHT`, `LAT_MAX`, `VMAX`.

```sh
# Verify per AGENTS.md rule 4 and its table: prefer ONE spec (`npm test -- tests/specs/understeer-cue.spec.js`,
# `physics-characterization.spec.js`) via test-bg.mjs, then `test-bg.mjs --wait --timeout 45`; cap two groups
# (physics-core, collisions, aero, input; `pick-tests` names them); a whole group → remote-group.mjs on the pushed branch.
node tools/check/check-physics.mjs <grip|bank|roadfollow|steer>  # browser (launchChromium) — stability probe, not an A/B
```

No browser (Node VM, `tools/lib/game-vm.cjs`, deterministic — the first stop for an A/B):

```sh
TRACK=monza FRAC=0.0 node tools/check/player-dyn.mjs [--json]   # skidpad, step-steer, trail-brake, midCorner_*; no flags to set physics
node --test tests/unit/player-dynamics-vm.test.mjs               # the locked SHAPES
```

`player-dyn.mjs` exports `measure(g, frac)`: to A/B one setting, script it in
`scratch/` — `createGame({track, storage: {difficulty: "normal", autoThrottle: false}})` (copy `main()`'s options), `await g.race(track)`, `g.apex.setPhysics({frontGrip: x})`,
`measure(g, frac)` per value — and diff the JSON (read `aF`/`aR`, `uF`/`uR`, `yaw`; front
slip past its peak with rear settled = understeer). `physics-tune-sweep.mjs` is BROWSER + long (sharded
DOM-slider laps, `APEX_WORKERS`): not for one setting. Verdict: a directional change in the
same tables; worked "understeers in slow corners" example → [references/understeer-recipe.md](references/understeer-recipe.md).

If you edited `js/game.js`, `node tools/gen/gen-shell.mjs --check` ([shell/cache](../check-changes/references/bump.md)) before commit. Theory:
`docs/PHYSICS.md`, `docs/research/steering-research.md`.

## Load on demand

- Worked slow-corner understeer A/B → [references/understeer-recipe.md](references/understeer-recipe.md).
- Closed-loop trial, parallel sweep (`polling: 100`), trail-brake, house-style
  assertions → [references/harness.md](references/harness.md).
- **Game feel / juice** — which Apex system owns which channel, and the hard
  line that juice is a render/audio layer that must never write `car.px/pz`,
  `s`, `x`, `psi` or change `obs()`/`act()` determinism →
  [references/game-feel.md](references/game-feel.md); channel table and the
  kerb-vs-kickup mistakes in
  [references/game-feel-workflow.md](references/game-feel-workflow.md);
  trauma-shake math (inspiration only) in
  [references/game-feel-feedback-recipes.md](references/game-feel-feedback-recipes.md).
