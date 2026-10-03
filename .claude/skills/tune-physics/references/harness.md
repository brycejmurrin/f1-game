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
  let o = __apex.reset(0.30, 60, 0, 42);
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

## Seeded serialized A/B

Use a Node VM first; use one parent-owned browser/page only when native evidence
is needed. Stage `seed(42)` BEFORE `race(id)`, then `go()` and a seeded reset.
For each config, reset to the same episode seed/pose and assert a non-null obs
and `world().state.playerReady` (or `world().ego` on success). Record physics
setter results; unknown/nonfinite values are rejected rather than silently used.

```js
const {createGame} = require("./tools/lib/game-vm.cjs");
const g = await createGame({track:"suzuka"});
try {
  const a=g.apex; a.seed(42); await g.race("suzuka"); a.go(); a.headless(true);
  for (const frontGrip of [0.89,1.0]) {
    a.setPhysics({frontGrip});
    let o=a.reset(0.30,60,0,42);
    if (!o) throw new Error("player not staged");
    for(let i=0;i<180;i++) o=a.act({steer:-0.4,throttle:true,brake:false},1/60,1);
    // Save frontGrip, seed, pose, final obs and terminal; compare directionally.
  }
} finally { g.close(); }
```

For browser fallback, use `launchChromium`, finite `waitForFunction(fn,null,
{polling:100,timeout:45000})`, and close each page/browser in `finally`.
Never hand that browser run to a subagent or fan out unbounded pages. Green
headless replay does not verify wall-clock live hitStop: that legacy cue scales
the frame driver; do not extend it to new cosmetic feedback.

## House-style assertions

- "tarmac carries more speed than grass", not "speed > 28.5".
- "lower frontGrip runs wider (larger |x|) through the same corner".
- "heading barely changes off-track with zero steer".
- "reverses then recovers to forward after a spin".
