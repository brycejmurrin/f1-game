---
name: tune-physics
description: Use when the user says the car understeers/oversteers, turn-in should be snappier/lazier, grip/trail braking/road-follow/pace feels wrong, compare/A-B physics settings, run a physics sweep, test ROAD_FOLLOW, or asks whether driving feel improved.
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
| `roadFollow` (`ROAD_FOLLOW` **0**, ships OFF) | curvature steering assist | more auto-drive |
| `frontGrip` (`FRONT_GRIP` 0.89) | front friction bias (`muF *= FRONT_GRIP`) | more front grip / less understeer |
| `playerGrip` (`PLAYER_GRIP` 1.15) | player grip headroom vs AI | more forgiving |
| `yawDamp` (`YAW_DAMP` 1.0) | yaw damping | calmer rotation |
| `yawInertia` (`YAW_INERTIA` 0.7) | rotational inertia (`<1` = snappier) | lazier turn-in |
| `pace` (`PACE` 1.0) | global speed multiplier | faster everywhere |

**`ROAD_FOLLOW` ships at `0` (OFF) — this is a deliberate, opt-in default, not
a stale table entry.** The in-game DRIVING HELP slider (`js/game/steer-tuning.js`
`helpFromSlider`) maps notch 1..10 to `0..0.70`, with notch 1 = exactly `0`
(off) — the range used to bottom out at `0.25`, which meant the assist was
always steering part of every corner with no way to disable it; that floor was
removed on purpose. `0.70` is only the slider's *ceiling*, reachable by a player
choosing max assist — never assume it, or a "default" in a sweep/table, without
saying so. If you are testing whether raising `roadFollow` toward `0.70` "feels
better", say so explicitly: that direction reintroduces the always-on assist the
team deliberately took out, so a recommendation to raise the default back up is
a design reversal, not a tuning tweak — flag it as one.

Fixed (edit `js/game.js` to change): `LONG_GRIP = 34 m/s²` (longitudinal axis of
the traction circle — braking/accel consumes grip; `slipFactor =
sqrt(1 − (axEstSm/LONG_GRIP)²)` scales lateral grip → trail-braking rotation,
hard-braking understeer), `CS_FRONT/CS_REAR`, `FRONT_WEIGHT`, `LAT_MAX`, `VMAX`.
**`LONG_GRIP` is NOT live-tunable via `setPhysics`** — A/B it with two builds or
a source edit between runs.

### Trail-brake probe

Mid-corner: `{ brake: true, steer: ±0.3..0.5 }`, then read `physState().slipFactor`
and `axFrac` while braking. Lower `slipFactor` = longitudinal grip eating lateral
budget; compare runs directionally, not on absolute thresholds.

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

const a = trial({ frontGrip: 0.89 });          // baseline
const b = trial({ frontGrip: 1.00 });          // more front grip → less understeer
// Compare: does the higher-frontGrip run hold a tighter line (smaller |x|) / keep more apex speed?
// For mid-corner understeer: RAISE frontGrip (or LOWER yawInertia toward snappier). Do not copy an
// example that lowers frontGrip — that widens the line.
```

For open-loop physics probes use `step` + `physState`/`probe` instead:
```js
__apex.jump(0.0, 60, 0);
__apex.setInput({ steer: 0, throttle: true }); __apex.step(1/60, 120);
const p = __apex.physState();          // { s, x, speed, slipFactor, axFrac, wrongWay, ... }
```

### Parallel two-page sweep (faster, fully isolated)

For a multi-config sweep, run each config on its **own** headless page in
parallel — no cross-contamination of physics state, and wall-clock is one trial,
not N. Same loop as `trial()` above, fanned out with `Promise.all`:

```js
const CONFIGS = [0.4, 0.6, 0.8, 1.0, 1.2].map(v => ({ label:`rf=${v}`, physics:{ roadFollow:v } }));
const results = await Promise.all(CONFIGS.map(async cfg => {
  const page = await browser.newPage({ viewport:{ width:844, height:390 } });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__apex?.info().track != null);  // after race()
  return page.evaluate(async ({ physics }) => {
    __apex.headless(true); __apex.setPhysics(physics);
    let o = __apex.reset(0.30, 60, 0);
    const slips = [];
    for (let i = 0; i < 300; i++) { o = __apex.act({ steer:-0.4, throttle:true }, 1/60, 1); slips.push(o.slipFactor ?? 1); }
    return { finalSpeed:o.speed, avgSlip: slips.reduce((a,b)=>a+b)/slips.length, offT:o.offT, done:o.done };
  }, cfg).then(r => ({ label: cfg.label, ...r }));
}));
console.table(results);   // → finalSpeed / avgSlip / offT / done per config
```

See `tools/harness.mjs` (`pickChromium`, `startStaticServer`) and the
**playwright-probe** skill for free-port servers and headless Chromium.
boilerplate that wraps this. Metrics: `finalSpeed` (speed carried), `avgSlip`
(< 1 = traction consumed, 1 = on the edge), `offT` (off-track time = stability),
`done` (crashed out). For a harder, adaptive test, run `tests/autopilot.spec.js`
under each config and compare lap times — it stresses the racing line in a way a
fixed input sequence can't.

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

Related: for deep vehicle-dynamics theory review, read `docs/PHYSICS.md` and
`docs/research/steering-research.md`.
