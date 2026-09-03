---
name: debug-tracks
description: Use when the user asks about track geometry, corners, elevation, curvature, map/bounds, wall/barrier audits, terrain-over-road gaps, groundY/scan/wallStats, comparing circuits, or whether terrain is poking through the road in Apex 26.
---

# Track debug hooks

Verified live (`tools/shot/apex-eval.mjs`). All return plain JSON — ideal for tests and
audits. `info().track` is null until a circuit is loaded with `race(id)`/`tt(id)`.

## Layout & geometry

| Hook | Returns (verified shape) |
|---|---|
| `tracks()` | `Array(40)` of track objects (`.id`, name, etc.) |
| `info()` | `{state, track, n, total, timeTrial, seasonMode}` — `n` nodes, `total` metres |
| `trackShape(n)` | `Array(n)` normalised centreline pts + curvature `k` |
| `trackProfile(n)` | `Array(n)` of `{frac, y, k, hw, slope}` — elevation/curvature/width |
| `trackBounds()` | `{minX,maxX,minZ,maxZ,spanX,spanZ,centerFrac}` |
| `mapPts()` | `Array(~207)` of `[x,z]` normalised 0..1 (the minimap) |
| `nodeAt(frac)` | `{k, frac, x,y,z, tx,tz, rx,rz}` — world pos + tangent + right vector |
| `corners()` | `Array` of **curvature-peak** fractions — NOT the official FIA turn count (see below) |

## Surface & barriers

| Hook | Returns |
|---|---|
| `groundY(frac, lat)` | `{x,z, roadY, terrainY, gap}` — **gap finder**: `gap<0` = terrain *below* road (fine); `gap>0` = terrain poking *above* the racing surface (a defect) |
| `scan([d1,d2,...])` | look-ahead `Array` of `{s,k,hw,slope}` at each distance ahead |
| `wallStats()` | `{minB, maxB, minOverHw, anyNaN, street, n}` — **barrier envelope vs road edge** (`barR`/`barL` lateral limits minus `hw[k]`); NOT road half-width. `anyNaN:true` or tiny `minOverHw` = bad geometry |

## "How many corners?" — official vs peaks

`corners()` finds **every local curvature maximum** along the centreline. A long
sweeper or a double-apex often registers as multiple peaks, so the count is
**higher** than the FIA turn list (e.g. Spa ~42 peaks vs ~19–20 official turns).

| Question | Hook |
|---|---|
| Official FIA turn **count** | `__apex.info().turns` (length of curated list on `track.def.turns`) |
| Official turn **details** (id, direction, radius) | `__apex.trackInfo({what:"corners"})` |
| Curvature **peaks** (geometry audit) | `__apex.corners().length` |

When someone asks "how many corners does Spa have?", answer with `info().turns` /
`trackInfo`, not `corners().length`.

**Corners have no real names — don't invent "Eau Rouge" or "Casino Square."**
each def's `turns` (`js/circuits/<id>.js`) is a raw array of apex
FRACTIONS per track (`turns: [0.0432, 0.1524, ...]`) — no name, direction, or
radius field lives there at all; it is the curated seed list, nothing else.
Everything in `trackInfo({what:"corners"})` — the `dir` (`"L"`/`"R"`/`"straight"`),
`radiusM`, `apexSpeedKph`, etc. — is computed geometrically by `buildCorners()`
in `js/agent/agentview.js` off those fractions, and the only identifier it
attaches is `turn: "T" + (i+1)` (`"T1"`, `"T2"`, …, in driving order). If a
real-world corner name is needed for a caption or a scenery placement, it has to
come from outside this API (e.g. circuit research/docs) — the game itself does
not know one.

## Load on demand

- Street half-width loop, multi-track sweep, one-off `apex-eval` recipes,
  visual validate → [references/sweeps.md](references/sweeps.md).
