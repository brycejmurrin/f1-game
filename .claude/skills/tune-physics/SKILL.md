---
name: tune-physics
description: Use when the user says the car understeers/oversteers, turn-in should be snappier/lazier, grip/trail braking/road-follow/pace feels wrong, compare/A-B physics settings, run a physics sweep, test ROAD_FOLLOW, or asks whether driving feel improved. Also GAME FEEL / juice — screen shake, hit-stop, weak kerb/wall/gear-shift/collision feedback, punchier camera/particles/audio polish that must NOT change driving physics. Skidpad/step-steer/`player-dyn` VM A/B. Camera lag as a framing/state bug → playwright-probe; device/gamepad/touch/tilt bugs → input-controls; AI racecraft → ai-racecraft.
---

# Tune the physics

Per-axle bicycle model + combined-slip friction ellipse. Tune the way the
suite does: **headless, deterministic, relative assertions** — never brittle
absolute magnitudes.

## Constant → behaviour (`__apex.setPhysics({...})`)

| Param | Effect | Bigger = |
|---|---|---|
| `wheelbase` (`WHEELBASE` 4.2 m) | turn-in | lazier |
| `expo` (`STEER_EXPO` ≈2.11) | input curve | gentler near centre |
| `maxSlip` (`STEER_MAX_SLIP` ≈0.34 rad) | max steer lock | sharper low-speed |
| `speedRef` (`STEER_SPEED_REF` 55 m/s) | lock taper | keeps lock at speed |
| `drift` (`DRIFT` 0) | rear looseness | more tail-out (debug) |
| `roadFollow` (`ROAD_FOLLOW` **0**, ships OFF) | curvature assist | more auto-drive |
| `frontGrip` (`FRONT_GRIP` 0.94) | front friction bias | less understeer |
| `playerGrip` (`PLAYER_GRIP` 1.15) | player vs AI headroom | more forgiving |
| `yawDamp` (`YAW_DAMP` 1.0) | yaw damping | calmer |
| `yawInertia` (`YAW_INERTIA` 0.58; 1.0 on a coarse pointer) | rotational inertia | lazier (`<1` snappier) |
| `pace` (`PACE` 0.840) | ground-speed scale | faster everywhere |

Boot-effective defaults come from `js/input/steer-tuning.js`
`applySteerTuning()` (slider defaults in `js/ui/settings-export.js`) — game.js
literals (`3.2 m` / `PACE 1.0`) are dead.
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
node tools/ci/test-bg.mjs physics-core # browser-gated — driving model (~35 tests, mostly fast)
node tools/ci/test-bg.mjs collisions  # browser-gated — car-to-car + wall contact
node tools/ci/test-bg.mjs aero         # aero-zones, active-aero, drift, understeer (~37 tests)
node tools/ci/test-bg.mjs input        # steering + camera
node tools/check/check-physics.mjs <grip|bank|roadfollow|steer>  # browser (launchChromium) — stability probe, not an A/B
```

No browser (Node VM, `tools/lib/game-vm.cjs`, deterministic — the first stop for an A/B):

```sh
TRACK=monza FRAC=0.0 node tools/check/player-dyn.mjs [--json]   # skidpad, step-steer, trail-brake, midCorner_*; no flags to set physics
node --test tests/unit/player-dynamics-vm.test.mjs               # the locked SHAPES
```

`player-dyn.mjs` exports `measure(g, frac)`: to A/B one setting, script it in
`scratch/` — `createGame({track})`, `await g.race(track)`, `g.apex.setPhysics({frontGrip: x})`,
`measure(g, frac)` per value — and diff the JSON (read `aF`/`aR`, `uF`/`uR`, `yaw`; front
slip past its peak with rear settled = understeer). `physics-tune-sweep.mjs` is BROWSER + long (sharded
DOM-slider laps, `APEX_WORKERS`): not for one setting. Verdict: a directional change in the
same tables; stop there, then the named browser group.

If you edited `js/game.js`, `node tools/gen/gen-shell.mjs --check` ([shell/cache](../check-changes/references/bump.md)) before commit. Theory:
`docs/PHYSICS.md`, `docs/research/steering-research.md`.

## Load on demand

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
