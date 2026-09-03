---
name: tune-physics
description: Use when the user says the car understeers/oversteers, turn-in should be snappier/lazier, grip/trail braking/road-follow/pace feels wrong, compare/A-B physics settings, run a physics sweep, test ROAD_FOLLOW, or asks whether driving feel improved. Device/gamepad/touch/tilt bugs → input-controls.
---

# Tune the physics

Per-axle bicycle model + combined-slip friction ellipse. Tune the way the
suite does: **headless, deterministic, relative assertions** — never brittle
absolute magnitudes.

## Constant → behaviour (`__apex.setPhysics({...})`)

| Param | Effect | Bigger = |
|---|---|---|
| `wheelbase` (`WHEELBASE` 3.60 m) | turn-in | lazier |
| `expo` (`STEER_EXPO` 2.4) | input curve | gentler near centre |
| `maxSlip` (`STEER_MAX_SLIP` ≈0.29 rad) | max steer lock | sharper low-speed |
| `speedRef` (`STEER_SPEED_REF` ≈41.7 m/s) | lock taper | keeps lock at speed |
| `drift` (`DRIFT` 0) | rear looseness | more tail-out (debug) |
| `roadFollow` (`ROAD_FOLLOW` **0**, ships OFF) | curvature assist | more auto-drive |
| `frontGrip` (`FRONT_GRIP` 0.89) | front friction bias | less understeer |
| `playerGrip` (`PLAYER_GRIP` 1.15) | player vs AI headroom | more forgiving |
| `yawDamp` (`YAW_DAMP` 1.0) | yaw damping | calmer |
| `yawInertia` (`YAW_INERTIA` 0.7) | rotational inertia | lazier (`<1` snappier) |
| `pace` (`PACE` 0.840) | ground-speed scale | faster everywhere |

Boot-effective defaults come from `js/game/steer-tuning.js`
`applySteerTuning()` — game.js literals (`3.2 m` / `PACE 1.0`) are dead.
`PACE` is a scale, not a cap; compare speeds via `vTop()`/`vStd()`/`aStd()`.

**`ROAD_FOLLOW` ships at `0` (OFF)** on purpose. The DRIVING HELP slider maps
notch 1..10 to `0..0.70` (notch 1 = off). Recommending a raised default is a
design reversal, not a tweak — flag it.

Fixed in `js/game.js` (not `setPhysics`): `LONG_GRIP`, `CS_FRONT/CS_REAR`,
`FRONT_WEIGHT`, `LAT_MAX`, `VMAX`.

```sh
node tools/test-bg.mjs driving      # physics + collision + behaviour + debris (one group, ~30 min)
node tools/test-bg.mjs input        # steering + camera
node tools/check-physics.mjs <grip|bank|roadfollow|steer>
```

If you edited `js/game.js`, `node tools/gen-shell.mjs --check` (no cache bump: tags read `?v=dev` and the deploy stamps the hashes; after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`) before commit. Theory:
`docs/PHYSICS.md`, `docs/research/steering-research.md`.

## Load on demand

- Closed-loop trial, parallel sweep (`polling: 100`), trail-brake, house-style
  assertions → [references/harness.md](references/harness.md).
