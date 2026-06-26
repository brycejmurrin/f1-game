---
name: tune-physics
description: A/B test and tune the driving physics in js/game.js deterministically, using the __apex headless control loop (obs/act/reset), setPhysics overrides, and step/physState probes. Includes the constant-to-behavior map (WHEELBASE, STEER_*, DRIFT, ROAD_FOLLOW, FRONT_GRIP, LONG_GRIP, PACE, ...) and which test groups to re-run. Use for "the car understeers", "make turn-in snappier", "tune grip", "trail-braking feels wrong", "compare two physics settings".
---

# Tune the physics

The car uses a per-axle bicycle model with a combined-slip friction ellipse. Tune
it the way the test suite does: **deterministically, with the headless loop, and
assert relative/behavioural facts — never brittle absolute magnitudes** (those go
stale the moment physics is retuned).

## Constant → behaviour map (live-tunable via `__apex.setPhysics({...})`)

| Param | Effect | Bigger = |
|---|---|---|
| `wheelbase` (`WHEELBASE` 3.2 m) | turn-in response | lazier turn-in |
| `expo` (`STEER_EXPO` 2.4) | input curve shape | gentler near centre |
| `maxSlip` (`STEER_MAX_SLIP` 0.32 rad) | max steer lock | sharper low-speed |
| `speedRef` (`STEER_SPEED_REF` 60 m/s) | speed-sensitive lock taper | keeps lock at speed |
| `drift` (`DRIFT` 0) | rear looseness / oversteer | more tail-out (debug only) |
| `roadFollow` (`ROAD_FOLLOW` 0.7) | curvature steering assist | more auto-drive |
| `frontGrip` (`FRONT_GRIP` 0.89) | front friction bias | less understeer-safe |
| `playerGrip` (`PLAYER_GRIP` 1.15) | player grip headroom vs AI | more forgiving |
| `yawDamp` (`YAW_DAMP` 1.0) | yaw damping | calmer rotation |
| `yawInertia` (`YAW_INERTIA` 0.7) | rotational inertia | snappier turn-in (<1) |
| `pace` (`PACE` 1.0) | global speed multiplier | faster everywhere |

Fixed (edit `js/game.js` to change): `LONG_GRIP = 34 m/s²` (longitudinal axis of
the traction circle — braking/accel consumes grip; `slipFactor =
sqrt(1 − (axEstSm/LONG_GRIP)²)` scales lateral grip → trail-braking rotation,
hard-braking understeer), `CS_FRONT/CS_REAR`, `FRONT_WEIGHT`, `LAT_MAX`, `VMAX`.

## A/B harness (deterministic, headless)

```js
// In page context via Playwright page.evaluate, or the dev console:
__apex.race("suzuka");
// wait for load, then:
__apex.headless(true);                 // skip render; physics runs uncapped

function trial(phys) {
  __apex.setPhysics(phys);
  let o = __apex.reset(0.30, 60, 0);    // frac, speed, lateral → obs
  for (let i = 0; i < 180; i++)         // 3 s of closed-loop input
    o = __apex.act({ steer: -0.4, throttle: true, brake: false }, 1/60, 1);
  return o;                             // o.x, o.speed, o.slipFactor, o.k, o.clearL/R, o.offT, o.wrongWay, o.reward
}

const a = trial({ frontGrip: 0.89 });
const b = trial({ frontGrip: 0.80 });
// Compare: does the lower-frontGrip run carry less apex speed / run wider (larger |x|)?
```

For open-loop physics probes use `step` + `physState`/`probe` instead:
```js
__apex.jump(0.0, 60, 0);
__apex.setInput({ steer: 0, throttle: true }); __apex.step(1/60, 120);
const p = __apex.physState();          // { s, x, speed, slipFactor, axFrac, wrongWay, ... }
```

> **Init order:** after `race()` + `go()`, you must `jump()` or `step(1/60,1)`
> **before** `obs()`/`physState()` — they return null until `player.px` exists.
> `reset()` does this for you.

## Asserting in tests (the house style)

Write **relative / directional** checks that survive retuning:
- "tarmac carries more speed than grass", not "speed > 28.5".
- "lower frontGrip runs wider (larger |x|) through the same corner".
- "heading barely changes off-track with zero steer".
- "reverses then recovers to forward after a spin".

Re-run after any change:
```sh
npm run test:physics      # physics + elevation + longitudinal regression
npm run test:behaviour    # collision + drift + offtrack + collision-ai-fixes
npm run test:steering     # presets + sliders + steering modes
```
There are also standalone Playwright probes in `tools/` worth running for grip
work: `node tools/check-grip.mjs`, `check-bank.mjs`, `check-roadfollow.mjs`,
`check-steer.mjs` (each verifies stability / no-NaN / forward motion).

If you edited `js/game.js`, bump the cache version (`bump-cache` skill) before
committing.
