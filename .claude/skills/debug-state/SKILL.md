---
name: debug-state
description: Inspect and visualize live race/physics/lighting state through the __apex telemetry hooks — probe/physState/obs for the player, cars/fieldState for the grid, timing/sectorState/lapHistory for the clock, lightState for the scene, plus the deterministic headless act/obs/reset loop. Use to read the car's slip/grip, dump the field order and gaps, check sector splits, inspect lighting, or drive a headless control loop. Triggers - "what's the car doing", "dump the field", "show sector times", "is the player understeering", "read the telemetry", "headless control loop".
---

# State & telemetry debug hooks

Verified live (`tools/apex-eval.mjs`). These visualize what the sim is doing —
the basis for the codebase's debug-hooks-first testing.

> **Init order:** `obs()`/`physState()`/`probe()` return null until `player.px`
> exists. After `race()` + `go()`, call `jump(frac, speed)` (or `step(1/60,1)`)
> first. `reset(frac,speed,x)` does this for you in the headless loop.

## Player telemetry (increasing detail)

- `probe()` → `{x, angle, k, hw, speed, s}` — quick local state (lateral offset,
  curvature, half-width, speed, arc pos).
- `physState()` → adds `{prog, head, vLat, slipDeg, slope, wrongWay, rescueT,
  lap, axEstSm, axFrac, slipFactor}` — the physics snapshot. `slipFactor<1` =
  grip consumed by braking/accel (friction ellipse); `wrongWay`, `rescueT` =
  off-track recovery state.
- `obs()` → the full headless observation: everything above plus `{raceT,
  speedKph, gripMult, weather, wallR, wallL, clearR, clearL, gear, offT,
  posInField, scan, reward, done}`. `clearR/clearL` = metres to each barrier.

## Field & timing

| Hook | Returns |
|---|---|
| `cars()` | `Array(22)` telemetry, sorted by progress |
| `fieldState()` | `Array(22)` `{pos,id,name,code,team,isPlayer,lap,frac,speed,gap,finished}` |
| `timing()` | `{raceT,lapTime,best,lastLap,lap,pos,total,gapAhead,gapBehind,energy,gear,sector,sectorElapsed}` |
| `sectorState()` | `{idx, elapsed, bests:[3], last:[3]}` (S1/S2/S3) |
| `lapHistory()` | `{mode, laps:[], best, lastLap}` (full array in TT; best/last in race) |

## Scene / lighting

`lightState()` → `{ambientSky, ambientGround, sunColor, exposure, numLights,
sunY, builtNight, trackNight, floodEmit}`. `numLights>0` = floodlit dark scene;
`builtNight` reflects whether meshes were built for night.

## Deterministic headless control loop

The fast, render-free path (physics uncapped). One round-trip per decision:

```js
__apex.race("monza");            // wait for load
__apex.headless(true);           // skip render()
let o = __apex.reset(0.1, 30, 0);          // frac, speed, lateral → obs
o = __apex.act({steer:-0.3, throttle:true, brake:false}, 1/60, 5);  // input + 5 ticks → obs
// branch on o.speed, o.clearR/clearL, o.slipFactor, o.offT, o.done, o.reward ...
```

Verified single-call from cold: `(a.headless(true), a.reset(0.1,30,0),
a.act({steer:-0.3,throttle:true,brake:false},1/60,5))` returns a full obs.

## One-off / scripted

```sh
node tools/apex-eval.mjs monza "(a.go(), a.jump(0.2,55), a.physState())" --raw
node tools/apex-eval.mjs spa   "(a.go(), a.jump(0.5,60), a.fieldState().slice(0,5))" --raw
node tools/apex-eval.mjs vegas "a.lightState()"
```

For tuning physics with this loop, see **tune-physics**; for the parallel harness
that drives many of these at once, see **playwright-probe**. Assert
**relative/behavioural** facts (slip direction, gap ordering, grip-vs-grass), not
brittle absolute magnitudes — they go stale when physics is retuned.
