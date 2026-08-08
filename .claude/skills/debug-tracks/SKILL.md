---
name: debug-tracks
description: Use when the user asks about track geometry, corners, elevation, curvature, map/bounds, wall/barrier audits, terrain-over-road gaps, groundY/scan/wallStats, comparing circuits, or whether terrain is poking through the road in Apex 26.
---

# Track debug hooks

Verified live (`tools/apex-eval.mjs`). All return plain JSON — ideal for tests and
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
`js/track/markings.js`'s `CircuitMarkings.turns` is a raw array of apex
FRACTIONS per track (`turns: [0.0432, 0.1524, ...]`) — no name, direction, or
radius field lives there at all; it is the curated seed list, nothing else.
Everything in `trackInfo({what:"corners"})` — the `dir` (`"L"`/`"R"`/`"straight"`),
`radiusM`, `apexSpeedKph`, etc. — is computed geometrically by `buildCorners()`
in `js/game/agentview.js` off those fractions, and the only identifier it
attaches is `turn: "T" + (i+1)` (`"T1"`, `"T2"`, …, in driving order). If a
real-world corner name is needed for a caption or a scenery placement, it has to
come from outside this API (e.g. circuit research/docs) — the game itself does
not know one.

## One-off queries

```sh
# official turn count vs curvature peaks:
node tools/apex-eval.mjs spa "({official:a.info().turns, peaks:a.corners().length})"
node tools/apex-eval.mjs spa "a.trackInfo({what:'corners'})" --raw   # curated FIA list

node tools/apex-eval.mjs monza "a.wallStats()"
node tools/apex-eval.mjs monaco "a.groundY(0.18, 10)"          # gap finder at a corner
node tools/apex-eval.mjs suzuka "a.trackProfile(40)" --raw     # full elevation profile
```

## Street circuits (`street: true`)

Street layouts are track defs with `street: true` — continuous barrier envelope,
no terrain ribbon. Currently: **monaco**, **singapore**, **vegas**, **baku**,
**jeddah** (verify with `grep 'street: true' js/circuits/*.js` if the roster
changes). `wallStats().street` mirrors the flag; `trackProfile().hw` is still the
**road** half-width — compare the two, not either alone.

### Half-width vs barrier (one-liner)

```sh
for id in monaco singapore vegas baku jeddah; do
  node tools/apex-eval.mjs "$id" "(({id:'$id', hw:a.trackProfile(80).map(p=>p.hw), w:a.wallStats()}))" --raw
done
```

Compute min/max/mean of `hw` from the profile array; compare against `w.minOverHw`.

## Parallel multi-track sweep (compare all circuits fast)

Validated pattern — 4 tracks profiled concurrently in ~10 s using parallel
Chromium workers (see the **playwright-probe** skill for the harness). Example output of a
profile sweep:

```
suzuka  18 official / 37 peaks  elev 12.0 m   maxk 0.042
monaco  19 official / 29 peaks  elev 27.5 m   maxk 0.060
spa     19 official / 42 peaks  elev 23.4 m   maxk 0.044
vegas   17 official / 27 peaks  elev  4.0 m   maxk 0.030   (night-default → numLights 32)
```

`lightState().numLights` is a quick night/floodlit tell (>0 = dark session with
floodlights built; 0 = bright day).

## Validate visually

```sh
node tools/capture/apex-capture.mjs tracks scratch/captures/apex-capture/tracks            # one orbit PNG per circuit
node tools/capture/apex-capture.mjs tracks scratch/captures/apex-capture/tracks spa monza  # just these two
```
The manifest flags any `blank:true` render. For geometry regressions the full
suite's `terrain-over-road.spec.js` and `tracks-walls.spec.js` are the assertions;
these hooks are how you investigate a failure. After any `js/circuits/*` edit, run
`node tools/verify-track.cjs <id>` first (see the **new-track** skill).
