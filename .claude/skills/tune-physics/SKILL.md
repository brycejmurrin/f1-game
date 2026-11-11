---
name: tune-physics
description: "Use when the car handles wrong: understeer, oversteer, running wide, lazy or snappy turn-in, grip, braking, pace, GRIP STEER maths, or a physics A/B. Not for: shake → game-feel; steering sliders → input-controls; camera lag → playwright-probe; AI → ai-racecraft."
---

# Tune the physics

Per-axle bicycle model + combined-slip friction ellipse. Compare speeds through `vStd()`/`vTop()`
(the gate is `tests/unit/vstd-invariant.test.mjs`; `tools/check/vstd-lint.mjs` is a report that always exits 0). Tune the way the
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
| `roadFollow` (`ROAD_FOLLOW`, ships **OFF**) | curvature assist | more auto-drive |
| `frontGrip` (`FRONT_GRIP`) | front friction bias | less understeer |
| `playerGrip` (`PLAYER_GRIP`) | player vs AI headroom | more forgiving |
| `yawDamp` (`YAW_DAMP`) | yaw damping | calmer |
| `yawInertia` (`YAW_INERTIA`) | rotational inertia | lazier (`<1` snappier) |
| `pace` (`PACE`) | ground-speed scale | faster everywhere |
| GRIP STEER (`js/physics/grip-steer.js`; notch 1 = OFF) | assist-gated steering cap at the front's peak slip (maths here; its slider → input-controls) | steadier front under steer |

`expo` / `maxSlip` / `speedRef` are also the player's STEER sliders (LINEARITY / STEER LOCK /
SPEED STEER): the slider UI, defaults and migration are **input-controls**; here they are A/B knobs.
There is no "steer gain" knob: `updateCarBicycle` (js/game.js) steers `sign(s)·|s|^expo · maxSlip · lockTaper`, where
`lockTaper` is a slight low-speed boost, `1/(1 + vStd/speedRef)` at speed, and a linear blend between (thresholds: that source), so slow corners
sit in the blend. These are STANDARD-scale speeds (`vStd(v) = v·VMAX/vTop`, js/race/pace-math.js): at a shipped PACE below 1
a ground speed reads higher in vStd, so pick rows by vStd, not ground m/s. A/B `maxSlip` (linear gain), `expo` (near centre) or `speedRef` (speed taper); turn-in understeer also
moves with `frontGrip` and `yawInertia`.

Numbers are not quoted here (they drift): read the live values with `__apex.tuning()` (js/agent/apex.js). The tunable
state bag and its literal defaults are `js/physics/drive-tune.js` (`DriveTune.create`); boot-effective values come from
`js/input/steer-tuning.js` `applySteerTuning()` (slider defaults in `js/ui/settings-export.js`), which overwrites them.

**Which car?** CAR WEIGHT is device-aware: `applySteerTuning()` boots a heavier `carWeight` (`heavyDefault`) on a `(pointer: coarse)` PHONE than on
desktop, and sets BOTH `YAW_INERTIA` (`weightFromSlider`) and `YAW_DAMP` (`yawDampFromSlider`) from it — the phone car is
the heavy, lazier one Bryce drives. The VM stubs `matchMedia` as desktop, so a turn-in complaint from a phone is measured
with `storage: { carWeight: <the phone default> }` (both cars, labelled). **Rule out assists and input first:** read `tuning()` and the
reporter's store (`gripSteer`, `drivingHelp`, `carWeight`, touch rows); a touch range / DRAG AT SPEED cause → input-controls.
Speed scaling and the no-curvature-assist contract live in
[AGENTS.md §Physics](../../../AGENTS.md#physics) and `docs/PHYSICS.md` §Curvature channels.
After any player-path change run `node --test tests/unit/curvature-channels.test.mjs` and spawn agent `physics-contract-auditor`.

**Touching steering or GRIP STEER:** `GripSteer.forPlayer` (called from `js/physics/player-forces.js`) must
receive the SHAPED lock (`og.shaped` — the stick run through `STEER_EXPO` in `js/physics/player-forces.js`), as `grip-steer.js`'s `apply()`
contract says, not the raw stick; an `expo` A/B is exactly what makes the two diverge. Pins:
`node --test tests/unit/grip-steer.test.mjs`. `player-dyn.mjs` measures a bare seat (GRIP STEER off), so A/B it
with `--seat shipped` plus a GRIP STEER on/off pair and say which seat each row came from.

DRIVING HELP maps its notch to `ROAD_FOLLOW` (`helpFromSlider`, js/input/steer-tuning.js); raising its OFF default is a design reversal, not a tweak — flag it.

Fixed in `js/physics/consts.js` (`PhysicsConsts`, not `setPhysics`): `LONG_GRIP`, `CS_FRONT/CS_REAR`,
`FRONT_WEIGHT`, `LAT_MAX`, `VMAX`.

Browser proof is CI's, not a local run (AGENTS.md rule 5): `node tools/ci/pick-tests.mjs` names the groups for the
tree — a player-path edit maps to `physics-core` (holds `physics-characterization.spec.js`); `understeer-cue.spec.js` is
in `aero`. On the pushed branch request one with `node tools/ci/remote-group.mjs physics-core` (or `aero`).

No browser (Node VM, `tools/lib/game-vm.cjs`, deterministic — the first stop for an A/B):

```sh
TRACK=monza FRAC=0.0 node tools/check/player-dyn.mjs [--json] [--seat pin|shipped]   # skidpad, step-steer, trail-brake, midCorner_*
# --seat pin (default) = the bare driving model; --seat shipped = the car a fresh browser boots. Say which seat an A/B measured.
node --test tests/unit/player-dynamics-vm.test.mjs               # the locked SHAPES
node tools/check/lockup-bench.mjs [--json]                       # braking: straight-line sweep, wheelLock, flat spots
node tools/check/brake-cue-calibrate.mjs [--json] [--track id] [--notch n]   # brake cue vs AiDrive.brakeTarget
```

`player-dyn.mjs` exports `measure(g, frac)`: to A/B one setting, copy the sweep script in
[references/understeer-recipe.md](references/understeer-recipe.md) step 2 and diff the JSON (read `aF`/`aR`, `uF`/`uR`, `yaw`; understeer =
front slip `aF` past its peak with `uR` settled below ~1). `tools/check/physics-tune-sweep.mjs` is BROWSER + long (sharded
DOM-slider laps, `APEX_WORKERS`): not for one setting. Verdict: a directional change in the
same tables.

Theory:
`docs/PHYSICS.md`, `docs/research/steering-research.md`.

## Load on demand

- Worked slow-corner understeer A/B → [references/understeer-recipe.md](references/understeer-recipe.md).
- Closed-loop trial, parallel sweep (`polling: 100`), trail-brake, house-style
  assertions → [references/harness.md](references/harness.md).
- Game feel / juice (shake, hit-stop, kerb and impact feedback that must not
  change physics) is its own skill → **game-feel**.
