# Per-circuit scenery API — `scenery(api)`

Each circuit's bespoke surroundings live in `js/tracks/<id>.js` as a
`scenery(api)` function (see [ARCHITECTURE.md](ARCHITECTURE.md)). The engine
(`buildProps` in `js/tracks.js`) calls it once with an `api` of placement
helpers, geometry primitives, and composite models. Everything emits flat-shaded
geometry into the track's prop mesh.

The per-circuit visual targets are the briefs in [docs/tracks/](tracks/); this
is the toolkit for building them. Verify with the `__apex.view` survey camera —
see [DEBUG-HOOKS.md](DEBUG-HOOKS.md).

## Positioning model

Trackside helpers take `(k, side, dist, …)`:
- `k` — node index, `0 … n-1` (a lap-fraction `s` maps to `k = Math.round(s*n)%n`).
- `side` — `-1` left, `+1` right of the racing direction.
- `dist` — metres **beyond the road edge**.

All trackside helpers anchor to the **terrain height** at that lateral distance
(via `groundYAt`), so props sit on the ground on elevated/embanked sections
instead of floating. World-coord primitives take an explicit `[x,y,z]`.

## What `api` gives you

### Context
`out` (mesh accumulator), `track`, `def`, `theme`, `pal`, `n`, `ds`,
`px/py/pz/hw` (per-node arrays), `pyMin` (lap's low point).

### Placement helpers (box-based, terrain-anchored)
| Helper | Use |
|---|---|
| `place(k, side, dist, [w,h,d], col)` | one box at `dist` beyond the edge, oriented to the track |
| `prop(k, side, gap, [depth,h,len], col)` | box placed by **clearance** `gap` (its inner face never reaches the tarmac) |
| `backdrop(k, side, dist, sz, col)` | distant box settled to the low baseline (skylines, ridges) |
| `groundPlane(k, side, gap, sz, col)` | large flat slab just below grade (water, paddock) |
| `addBox(out, c, [w,h,d], col, [r,u,f])` | raw oriented box at world `c` |
| `ferrisWheel(k, side, dist, radius)` | the cabin-ringed wheel landmark |
| `every(metres, fn)` | call `fn(k)` every ~`metres` around the lap |
| `onTrack(x, z, margin)` | true if `(x,z)` is on any tarmac — guard distant props |
| `groundYAt(k, dist)` | terrain height `dist` beyond the edge |
| `hash(i)` | deterministic 0–1 pseudo-random |

### Geometry primitives (world coords — non-cube shapes)
| Primitive | Shape |
|---|---|
| `addPrism(out, c, [w,h,len], col, basis)` | triangular ridge / A-frame roof (ridge along `len`) |
| `addPyramid(out, c, [w,h,d], col, basis)` | 4-sided peak / spire |
| `addCone(out, c, rad, h, col, seg, basis)` | conifer / spire / round tower |
| `addCyl(out, c, rad, h, col, seg, basis)` | trunk / post / tower / silo |
| `vadd(p, v, s)` | `p + v*s` (build offset points) |
| `anchor(k, side, dist)` | `{ c:[x,y,z], r, u, t }` ground point + track basis, for placing primitives trackside |

`basis` is `[right, up, forward]`; pass `null` for world axes. Winding is
auto-oriented (faces always point outward) so you never fight backface culling.

### Composite models
| Model | Builds |
|---|---|
| `pine(k, side, dist, h, col)` | conifer: tapered trunk + 3 stacked cones |
| `tree(k, side, dist, h, col)` | broadleaf: trunk + rounded twin-cone canopy |
| `palm(k, side, dist, h, frond)` | thin trunk + a crown of frond prisms |
| `peak(x, z, baseY, w, h, col)` | mountain summit (pyramid + foot skirt) |
| `ridge(x, z, baseY, ang, len, w, h, col)` | mountain ridge prism along bearing `ang` (rad) |
| `grandstand(s, side, gap, len, shell, crowd)` | raked stand: shell + crowd + cantilever roof |

## Pattern: an encircling mountain range

Place peaks/ridges in a ring computed from the track centre — far cleaner than
boxes radiating from every node (which scatter across the infield):

```js
let cx = 0, cz = 0;
for (let i = 0; i < n; i++) { cx += px[i]; cz += pz[i]; }
cx /= n; cz /= n;
let rad = 0;
for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px[i] - cx, pz[i] - cz));
for (const [extra, wMin, hMin, count, col] of [
  [200, 180, 46, 26, [0.26, 0.44, 0.28]],   // near range
  [430, 260, 92, 22, [0.45, 0.55, 0.49]],   // far hazed range
]) {
  const ring = rad + extra;
  for (let i = 0; i < count; i++) {
    const a = i / count * 6.2832, h = hash(i * 7 + extra);
    peak(cx + Math.cos(a) * ring, cz + Math.sin(a) * ring, pyMin,
         wMin + h * 90, hMin + h * 60, col);
  }
}
```

## Workflow per track

1. Read the brief in `docs/tracks/<id>.md` (landmarks by lap-fraction, palette).
2. Rebuild `scenery(api)` in `js/tracks/<id>.js` using the models above.
3. Survey it: `__apex.race("<id>")`, then `__apex.view(...)` aerial + trackside.
4. Iterate, then commit.

> Gotcha: destructure exactly what you use from `api`, and remember `out` is
> required by every `add*` primitive. A missing name throws inside `buildProps`,
> which silently leaves the game on the menu — always confirm `info().state ===
> "race"` after `race()`.
