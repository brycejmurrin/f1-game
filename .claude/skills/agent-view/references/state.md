# State & telemetry debug hooks (folded from the debug-state skill)

Verified live (`tools/apex-eval.mjs`). Debug-hooks-first: assert relative
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
node tools/apex-eval.mjs monza "(a.go(), a.jump(0.2,55), a.physState())" --raw
node tools/apex-eval.mjs vegas "a.lightState()"
```

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
