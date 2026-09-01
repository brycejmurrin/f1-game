---
name: debug-state
description: Use when the user asks what the car is doing, read telemetry, inspect slip/grip/physics state, dump field order/gaps, show sector/lap timing, check lightState, or run a headless control/obs/act/reset loop in Apex 26. Handling tune / understeer feel → tune-physics; scene lighting knobs → lighting-tuner.
---

# State & telemetry debug hooks

Verified live (`tools/apex-eval.mjs`). Debug-hooks-first: assert relative
behaviour, not brittle magnitudes.

> **Init order:** `obs()`/`physState()`/`probe()` return null until `player.px`
> exists. After `race()` + `go()`, call `jump(frac, speed)` (or `step(1/60,1)`)
> first. `reset(frac,speed,x)` does this for you in the headless loop.

Hook catalog (`probe` / `physState` / `obs` / field / timing / `lightState`) →
[references/hooks.md](references/hooks.md).

## Deterministic headless control loop

```js
await __apex.race("monza");   // AWAIT: it builds the circuit + fetches scenery
__apex.headless(true);
let o = __apex.reset(0.1, 30, 0);
o = __apex.act({steer:-0.3, throttle:true, brake:false}, 1/60, 5);
```

```sh
node tools/apex-eval.mjs monza "(a.go(), a.jump(0.2,55), a.physState())" --raw
node tools/apex-eval.mjs vegas "a.lightState()"
```

Physics tune → **tune-physics**. Parallel harness → **playwright-probe**.
`finishRace()` jumps to the flag without driving every lap.
