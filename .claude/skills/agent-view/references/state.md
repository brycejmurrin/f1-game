# State & telemetry debug hooks (folded from the debug-state skill)

Verified live (`tools/shot/apex-eval.mjs`). Debug-hooks-first: assert relative
behaviour, not brittle magnitudes.

> **Init order:** `obs()`/`physState()`/`probe()` return null until `player.px`
> exists. After `race()` + `go()`, call `jump(frac, speed)` (or `step(1/60,1)`)
> first. `reset(frac,speed,x)` does this for you in the headless loop.

Hook catalog (`probe` / `physState` / `obs` / field / timing / `lightState`) is
below. Handling tune / understeer feel → **tune-physics**; scene lighting knobs
→ **lighting-tuner**.

## Deterministic headless control loop

```js
__apex.race("monza");
__apex.headless(true);
let o = __apex.reset(0.1, 30, 0);
o = __apex.act({steer:-0.3, throttle:true, brake:false}, 1/60, 5);
```

```sh
node tools/shot/apex-eval.mjs monza "(a.go(), a.jump(0.2,55), a.physState())" --raw
node tools/shot/apex-eval.mjs vegas "a.lightState()"
```

**No browser (Node VM, verified 2026-09-30):** the same loop runs in `tools/lib/game-vm.cjs`
(~70 s of wall time per 120 s of sim; write the script under `scratch/`, end with `process.exit(0)`):
`const g=await createGame({track:"suzuka"}); const a=g.apex; a.seed(1); a.headless(true); let o=a.reset(0.97,30,0);`
then `a.world({detail:"brief"})` → `a.act(input,1/60,6)` → `a.terminal()`. `createGame` already calls `race()`.
Gotchas: **`sectorState().last`/`lapHistory().best` fill only once `lap>=1`** (game.js `c.lap >= 1 && sectorValid`), so
`reset(0.0…)` (lap 0) records no splits — reset at ~0.97, cross the line, then drive S1→S3.
`obs()` carries `s` (metres), not `frac`; log `o.s` for where the car left the track (`|lateralM| > halfWidthM`).
The starter policy in surface.md (`CAP` 33 m/s = 119 kph, so "top speed" just reads the cap) was tuned on Monza:
on Suzuka it is `rescued` at ~120 s / s≈1250 m after ~17 off-track entries and never finishes a lap — tune per circuit
before quoting sector times; record seed, start frac, policy and `terminal()` with any number.

Physics tune → **tune-physics**. Parallel harness → **playwright-probe**.
`finishRace()` jumps to the flag without driving every lap.

## Telemetry hook catalog

Increasing detail on the player:

- `probe()` → `{x, angle, k, hw, speed, s}` — lateral offset, curvature,
  half-width, speed, arc pos.
- `physState()` → adds `{prog, head, vLat, slipDeg, slope, wrongWay, rescueT,
  lap, axEstSm, axFrac, slipFactor}` — `slipFactor<1` = grip consumed by
  braking/accel; `wrongWay` / `rescueT` = off-track recovery.
- `obs()` → full headless observation: everything above plus `{raceT,
  speedKph, gripMult, weather, wallR, wallL, clearR, clearL, gear, offT,
  posInField, scan, reward, done}`. `clearR/clearL` = metres to each barrier.

### Field & timing

| Hook | Returns |
|---|---|
| `cars()` | `Array(22)` telemetry, sorted by progress |
| `fieldState()` | `Array(22)` `{pos,id,name,code,team,isPlayer,lap,frac,speed,gap,finished}` — **`gap` = metres behind leader** |
| `timing()` | `{raceT,lapTime,best,lastLap,lap,pos,total,gapAhead,gapBehind,energy,gear,sector,sectorElapsed}` — interval gaps use `gapAhead` / `gapBehind` |
| `sectorState()` | `{idx, elapsed, bests:[3], last:[3]}` (S1/S2/S3) |
| `lapHistory()` | `{mode, laps:[], best, lastLap}` — **in race mode `laps` is empty** (only `best` + `lastLap`); multi-lap history is Time Trial |

### Scene / lighting

`lightState()` → `{ambientSky, ambientGround, sunColor, exposure, numLights,
sunY, builtNight, trackNight, floodEmit}`. `numLights>0` = floodlit dark scene;
`builtNight` reflects whether meshes were built for night.

Verified single-call from cold:
`(a.headless(true), a.reset(0.1,30,0), a.act({steer:-0.3,throttle:true,brake:false},1/60,5))`
returns a full obs.
