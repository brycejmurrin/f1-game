---
name: tune-physics
description: "Use when the car understeers/oversteers, turn-in should be snappier/lazier, grip/trail braking/road-follow/pace feels wrong, A-B physics settings, a physics sweep, ROAD_FOLLOW, or whether driving feel improved; skidpad/step-steer/`player-dyn` VM A/B. Shake/hit-stop/juice → game-feel; camera lag → playwright-probe; gamepad/touch/tilt/steer sliders → input-controls; AI → ai-racecraft."
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

**The arc must not reach the driver** (AGENTS.md §Physics; columns in `docs/PHYSICS.md`): never "help"
the player by feeding path curvature into steer/throttle with assists off.

**`ROAD_FOLLOW` ships at `0` (OFF)** on purpose. The DRIVING HELP slider maps
notch 1..10 to `0..0.70` (notch 1 = off). Recommending a raised default is a
design reversal, not a tweak — flag it.

Fixed in `js/physics/consts.js` (`PhysicsConsts`, not `setPhysics`): `LONG_GRIP`, `CS_FRONT/CS_REAR`,
`FRONT_WEIGHT`, `LAT_MAX`, `VMAX`.

```sh
# Browser verify (AGENTS.md table): ONE spec — understeer-cue.spec.js or physics-characterization.spec.js — via test-bg.mjs.
node tools/check/check-physics.mjs <grip|bank|roadfollow|steer>  # browser (launchChromium) — stability probe, not an A/B
```

No browser (Node VM, `tools/lib/game-vm.cjs`, deterministic — the first stop for an A/B):

```sh
TRACK=monza FRAC=0.0 node tools/check/player-dyn.mjs [--json] [--seat pin|shipped]   # skidpad, step-steer, trail-brake, midCorner_*
# --seat pin (default) = the bare driving model; --seat shipped = the car a fresh browser boots. Say which seat an A/B measured.
node --test tests/unit/player-dynamics-vm.test.mjs               # the locked SHAPES
```

`player-dyn.mjs` exports `measure(g, frac)`: to A/B one setting, copy the sweep script in
[references/understeer-recipe.md](references/understeer-recipe.md) step 2 and diff the JSON (read `aF`/`aR`, `uF`/`uR`, `yaw`; front
slip past its peak with rear settled = understeer). `physics-tune-sweep.mjs` is BROWSER + long (sharded
DOM-slider laps, `APEX_WORKERS`): not for one setting. Verdict: a directional change in the
same tables; worked "understeers in slow corners" example → [references/understeer-recipe.md](references/understeer-recipe.md).

Theory:
`docs/PHYSICS.md`, `docs/research/steering-research.md`.

## Load on demand

- Worked slow-corner understeer A/B → [references/understeer-recipe.md](references/understeer-recipe.md).
- Closed-loop trial, parallel sweep (`polling: 100`), trail-brake, house-style
  assertions → [references/harness.md](references/harness.md).
- Game feel / juice (shake, hit-stop, kerb and impact feedback that must not
  change physics) is its own skill → **game-feel**.
