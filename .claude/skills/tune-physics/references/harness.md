# Physics A/B harness and trail-brake probe

Load this when comparing two `setPhysics` configs or writing a directional
assertion.

## Trail-brake probe

Mid-corner: `{ brake: true, steer: ±0.3..0.5 }`, then read
`physState().slipFactor` and `axFrac` while braking. Lower `slipFactor` =
longitudinal grip eating lateral budget; compare runs directionally.

`LONG_GRIP` is not `setPhysics`-tunable (SKILL.md): A/B it with two builds or a source edit.
`slipFactor = sqrt(1 − (axEstSm/LONG_GRIP)²)` scales lateral grip.

## Closed-loop trial

The `frontGrip` 0.94 vs 1.00 trial (`reset(0.30,60,0,42)`, 180 `act` steps) is the VM version under
§Seeded serialized A/B. Higher `frontGrip` holds a tighter line (smaller |x|); for mid-corner understeer
raise `frontGrip` (or lower `yawInertia`).

Open-loop:

```js
__apex.jump(0.0, 60, 0);
__apex.setInput({ steer: 0, throttle: true }); __apex.step(1/60, 120);
const p = __apex.physState();
```

Init order: AGENTS.md §`window.__apex` dev API; `reset()` does it for you.

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
  for (const frontGrip of [0.94,1.0]) {
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
Parent only (SKILL.md); never fan out unbounded pages. Green
headless replay does not verify wall-clock live hitStop: that legacy cue scales
the frame driver; do not extend it to new cosmetic feedback.

## House-style assertions

- "tarmac carries more speed than grass", not "speed > 28.5".
- "lower frontGrip runs wider (larger |x|) through the same corner".
- "heading barely changes off-track with zero steer".
- "reverses then recovers to forward after a spin".
