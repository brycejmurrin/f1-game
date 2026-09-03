# Physics A/B harness and trail-brake probe

Load this when comparing two `setPhysics` configs or writing a directional
assertion. Never assert brittle absolute magnitudes.

## Trail-brake probe

Mid-corner: `{ brake: true, steer: ±0.3..0.5 }`, then read
`physState().slipFactor` and `axFrac` while braking. Lower `slipFactor` =
longitudinal grip eating lateral budget; compare runs directionally.

`LONG_GRIP` (34 m/s²) is **not** live-tunable via `setPhysics` — A/B it with
two builds or a source edit. It is the longitudinal axis of the traction
circle; `slipFactor = sqrt(1 − (axEstSm/LONG_GRIP)²)` scales lateral grip.

## Closed-loop trial

```js
__apex.race("suzuka");
// wait for load, then:
__apex.headless(true);

function trial(phys) {
  __apex.setPhysics(phys);
  let o = __apex.reset(0.30, 60, 0);
  for (let i = 0; i < 180; i++)
    o = __apex.act({ steer: -0.4, throttle: true, brake: false }, 1/60, 1);
  return o;  // o.x, o.speed, o.slipFactor, o.k, o.clearL/R, o.offT, o.wrongWay
}

const a = trial({ frontGrip: 0.89 });
const b = trial({ frontGrip: 1.00 });
// higher frontGrip should hold a tighter line (smaller |x|) / keep more apex speed
```

For mid-corner understeer: **raise** `frontGrip` (or lower `yawInertia`). Do
not copy an example that lowers `frontGrip`.

Open-loop:

```js
__apex.jump(0.0, 60, 0);
__apex.setInput({ steer: 0, throttle: true }); __apex.step(1/60, 120);
const p = __apex.physState();
```

**Init order:** after `race()` + `go()`, `jump()` or `step(1/60,1)` **before**
`obs()`/`physState()` — they return null until `player.px` exists. `reset()`
does this for you.

## Parallel two-page sweep

Each config on its **own** headless page. Any `waitForFunction` on a rendering
page needs `{ polling: 100 }` (default rAF polling starves under SwiftShader).

```js
const CONFIGS = [0.4, 0.6, 0.8, 1.0, 1.2].map(v => ({ label:`rf=${v}`, physics:{ roadFollow:v } }));
const results = await Promise.all(CONFIGS.map(async cfg => {
  const page = await browser.newPage({ viewport:{ width:844, height:390 } });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__apex?.info().track != null, { polling: 100 });
  return page.evaluate(async ({ physics }) => {
    __apex.headless(true); __apex.setPhysics(physics);
    let o = __apex.reset(0.30, 60, 0);
    const slips = [];
    for (let i = 0; i < 300; i++) {
      o = __apex.act({ steer:-0.4, throttle:true }, 1/60, 1);
      slips.push(o.slipFactor ?? 1);
    }
    return { finalSpeed:o.speed, avgSlip: slips.reduce((a,b)=>a+b)/slips.length, offT:o.offT, done:o.done };
  }, cfg).then(r => ({ label: cfg.label, ...r }));
}));
```

See `tools/lib/harness.mjs` (`pickChromium`, `startStaticServer`) and
**playwright-probe**. Metrics: `finalSpeed`, `avgSlip` (< 1 = traction
consumed), `offT` (stability), `done` (crashed). Harder: run
`tests/specs/autopilot.spec.js` under each config and compare lap times.

## House-style assertions

- "tarmac carries more speed than grass", not "speed > 28.5".
- "lower frontGrip runs wider (larger |x|) through the same corner".
- "heading barely changes off-track with zero steer".
- "reverses then recovers to forward after a spin".
