---
name: debug-tracks
description: Query and visualize track geometry through the __apex debug hooks — tracks/info, trackShape/trackProfile/trackBounds/mapPts/nodeAt/corners for layout & elevation, groundY/scan/wallStats for surface & barriers — plus the parallel multi-track sweep pattern. Use to inspect a circuit's corners/elevation/curvature, audit walls, find a terrain-vs-road gap, or compare many tracks at once. Triggers - "how many corners does Spa have", "check the elevation profile", "audit the barriers", "compare track curvature", "is terrain poking through the road".
---

# Track debug hooks

Verified live (`tools/apex-eval.mjs`). All return plain JSON — ideal for tests and
audits. `info().track` is null until a circuit is loaded with `race(id)`/`tt(id)`.

## Layout & geometry

| Hook | Returns (verified shape) |
|---|---|
| `tracks()` | `Array(24)` of track objects (`.id`, name, etc.) |
| `info()` | `{state, track, n, total, timeTrial, seasonMode}` — `n` nodes, `total` metres |
| `trackShape(n)` | `Array(n)` normalised centreline pts + curvature `k` |
| `trackProfile(n)` | `Array(n)` of `{frac, y, k, hw, slope}` — elevation/curvature/width |
| `trackBounds()` | `{minX,maxX,minZ,maxZ,spanX,spanZ,centerFrac}` |
| `mapPts()` | `Array(~207)` of `[x,z]` normalised 0..1 (the minimap) |
| `nodeAt(frac)` | `{k, frac, x,y,z, tx,tz, rx,rz}` — world pos + tangent + right vector |
| `corners()` | `Array` of apex fractions (e.g. Spa → 42, Suzuka → 37, Monaco → 29) |

## Surface & barriers

| Hook | Returns |
|---|---|
| `groundY(frac, lat)` | `{x,z, roadY, terrainY, gap}` — **gap finder**: `gap<0` = terrain *below* road (fine); `gap>0` = terrain poking *above* the racing surface (a defect) |
| `scan([d1,d2,...])` | look-ahead `Array` of `{s,k,hw,slope}` at each distance ahead |
| `wallStats()` | `{minB, maxB, minOverHw, anyNaN, street, n}` — barrier audit; `anyNaN:true` or tiny `minOverHw` = bad geometry |

## One-off queries

```sh
node tools/apex-eval.mjs spa   "({corners:a.corners().length, bounds:a.trackBounds()})"
node tools/apex-eval.mjs monza "a.wallStats()"
node tools/apex-eval.mjs monaco "a.groundY(0.18, 10)"          # gap finder at a corner
node tools/apex-eval.mjs suzuka "a.trackProfile(40)" --raw     # full elevation profile
```

## Parallel multi-track sweep (compare all circuits fast)

Validated pattern — 4 tracks profiled concurrently in ~10 s using parallel
servers (see the **playwright-probe** skill for the harness). Example output of a
profile sweep:

```
suzuka  37 corners  elev 12.0 m   maxk 0.042
monaco  29 corners  elev 27.5 m   maxk 0.060
spa     42 corners  elev 23.4 m   maxk 0.044
vegas   27 corners  elev  4.0 m   maxk 0.030   (night-default → numLights 32)
```

`lightState().numLights` is a quick night/floodlit tell (>0 = dark session with
floodlights built; 0 = bright day).

## Validate visually

```sh
node tools/apex-capture.mjs tracks scratch/tracks            # one orbit PNG per circuit
node tools/apex-capture.mjs tracks scratch/tracks spa monza  # just these two
```
The manifest flags any `blank:true` render. For geometry regressions the full
suite's `terrain-over-road.spec.js` and `tracks-walls.spec.js` are the assertions;
these hooks are how you investigate a failure. After any `js/tracks/*` edit, run
`node tools/verify-track.cjs <id>` first (see the **new-track** skill).
