# Track debug hooks

Verified live (`tools/shot/apex-eval.mjs`). All return plain JSON — ideal for tests and
audits. `info().track` is null until a circuit is loaded with `race(id)`/`tt(id)`.

## Layout & geometry

| Hook | Returns (verified shape) |
|---|---|
| `tracks()` | `Array` of `{id, name, i}` per `Tracks.LIST` entry |
| `info()` | `{state, track, n, total, timeTrial, seasonMode}` — `n` nodes, `total` metres |
| `trackShape(n)` | `Array(n)` normalised centreline pts + curvature `k` |
| `trackProfile(n)` | `Array(n)` of `{frac, y, k, hw, slope}` — elevation/curvature/width |
| `trackBounds()` | `{minX,maxX,minZ,maxZ,spanX,spanZ,centerFrac}` |
| `mapPts()` | `Array` of `[x,z]` normalised 0..1 (the minimap) |
| `nodeAt(frac)` | `{k, frac, x,y,z, tx,tz, rx,rz}` — world pos + tangent + right vector |
| `corners()` | `Array` of **curvature-peak** fractions — NOT the official FIA turn count (see below) |

## Surface & barriers

| Hook | Returns |
|---|---|
| `groundY(frac, lat)` | `{x,z, roadY, roadSurfaceY, bankDy, terrainY, gap, overRoad}` — read **`overRoad`**: `>0` = terrain poking above the BANKED racing surface (a defect). `gap` is the trap it replaces — it measures against the raw centreline plane, so inside a bankZone (Lesmo 1 lifts the outer edge 0.66 m) terrain correctly tucked under the road reads as proud of it |
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

## No browser: Node-VM route (verified 2026-09-30)

Every hook above except `render`/screens runs in `tools/lib/game-vm.cjs` (~5 s per track, no GPU):
`const {createGame}=require("./tools/lib/game-vm.cjs"); const g=await createGame({track:"spa"}); const a=g.apex;`
then `a.info() / a.corners() / a.trackProfile(400) / a.trackInfo({what:"corners"})` as usual (end with `process.exit(0)`;
write the script under `scratch/`, not `/tmp`). Compare circuits: loop `createGame` per id;
elevation range = max−min of `trackProfile(n).y`, tightest radius = `1/max|k|`.
Measured: monza 11 `turns` / 24 peaks / 6.0 m / minR 15 m; spa 20 / 42 / 102 m / 13 m.
`1/max|k|` is the instantaneous peak (spa 13 m at frac 0.035); `trackInfo` corners' `radiusM` is averaged over the corner window (spa T1 30 m, tightest listed T20 29 m) — name which one "sharpest" means.
Note `trackInfo().cornerCount` (monza 10, spa 15) can be lower than `info().turns` (11, 20): quote which hook you used.
`tools/track/verify-track.cjs <id>` (VM) checks the build only; it prints no geometry stats.

## Load on demand

- Street half-width loop, multi-track sweep, one-off `apex-eval` recipes,
  visual validate → [references/debug-tracks-sweeps.md](debug-tracks-sweeps.md).

---

_Folded into `agent-view` on 2026-09-03 (tree restructure Phase 5). Selection trigger it carried, now merged into `agent-view`'s description: Use when the user asks about track geometry, corners, elevation, curvature, map/bounds, wall/barrier audits, terrain-over-road gaps, groundY/scan/wallStats, comparing circuits, or whether terrain is poking through the road in Apex 26._
