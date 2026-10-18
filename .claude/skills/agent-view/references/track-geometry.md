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

**The API does not know corner names.** `turns` (`js/circuits/<id>.js`) is a raw array of apex fractions; `trackInfo({what:"corners"})`
computes `dir`, `radiusM`, `apexSpeedKph` in `buildCorners()` (`js/agent/agentview-corners.js`) and labels corners only `T1`, `T2`, ... in driving order.
For a named corner (Eau Rouge, Raidillon), take the frac from the circuit file's comments, e.g.
`grep -n "Eau Rouge\|Raidillon" js/circuits/spa.js` (floor ~0.14, Raidillon peak ~0.165, racing frac), say that is the source, then probe
`groundY(f, lat)` / `trackProfile` around it (sweep recipe: debug-tracks-sweeps.md). Authoring-frame tables (`elevations`, `bankZones`) are
keyed by `def._sceneryShift`-shifted fracs: read the comment for which frame a number is in, and never feed a raw table `frac` to the hooks.

## No browser: Node-VM route (verified 2026-09-30)

Every hook above except `render`/screens runs in `tools/lib/game-vm.cjs` (~5 s per track, no GPU):
`const {createGame}=require("./tools/lib/game-vm.cjs"); const g=await createGame({track:"spa"}); const a=g.apex;`
then `a.info() / a.corners() / a.trackProfile(400) / a.trackInfo({what:"corners"})` as usual (end with `process.exit(0)`;
write the script under `scratch/`, not `/tmp`). Compare circuits: loop `createGame` per id;
elevation range = max−min of `trackProfile(n).y`, tightest radius = `1/max|k|`.
Illustrative only (2026-09-30; re-measure, never quote): monza 11 `turns` / 24 peaks / 6.0 m / minR 15 m; spa 20 / 42 / 102 m / 13 m.
`1/max|k|` is the instantaneous peak (spa 13 m at frac 0.035); `trackInfo` corners' `radiusM` is averaged over the corner window (spa T1 30 m, tightest listed T20 29 m) — name which one "sharpest" means.
Note `trackInfo().cornerCount` (monza 10, spa 15) can be lower than `info().turns` (11, 20): quote which hook you used.
`tools/track/verify-track.cjs <id>` (VM) checks the build only; it prints no geometry stats.

### Whole-lap recipe: steepest grade and worst terrain-over-road (any id)

`slope` in `trackProfile` is the tangent's Y component (sin of the pitch), so
grade % = `100·slope/√(1−slope²)`; `+` is uphill in the driving direction.
```js
// scratch/lap-grade.cjs — node scratch/lap-grade.cjs interlagos
const {createGame}=require("../tools/lib/game-vm.cjs");
(async()=>{ try { const g=await createGame({track:process.argv[2]||"spa"}); const a=g.apex;
  const p=a.trackProfile(1000), L=a.info().total;
  const top=p.map(q=>({frac:q.frac, m:Math.round(q.frac*L), pct:+(100*q.slope/Math.sqrt(1-q.slope*q.slope)).toFixed(1)}))
    .sort((x,y)=>Math.abs(y.pct)-Math.abs(x.pct)).slice(0,5);
  let worst={overRoad:-1/0};
  for(let i=0;i<500;i++) for(const lat of [-1,0,1]){ const f=i/500, r=a.groundY(f, lat*p[Math.floor(f*1000)].hw);
    if(r && r.overRoad!=null && r.overRoad>worst.overRoad) worst={frac:f, lat, overRoad:+r.overRoad.toFixed(3)}; }
  process.stdout.write(JSON.stringify({steepest:top, worstOverRoad:worst})+"\n");
  process.exit(0); } catch(e){ process.stderr.write(e.stack+"\n"); process.exit(1);} })();
```
The VM swallows a rejected promise silently (exit 0, no output), hence the
try/catch; `overRoad` is null where no terrain is sampled. Verified on monza
and interlagos (~10 s each). Report the frac AND metres, the sign (uphill/downhill), and that the grade is
the built road (SRTM bake + bumps + `undulate`), not the real circuit's figure.
Nearby corner: match the frac against `trackInfo({what:"corners"})`.

## Load on demand

- Street half-width loop, multi-track sweep, one-off `apex-eval` recipes,
  visual validate → [references/debug-tracks-sweeps.md](debug-tracks-sweeps.md).
