# Per-circuit scenery API — `scenery(api)`

Each circuit's bespoke surroundings live in `js/tracks/<id>.js` as a
`scenery(api)` function (see [ARCHITECTURE.md](ARCHITECTURE.md)). The engine
(`buildProps` in `js/tracks.js`) calls it once with an `api` of placement
helpers, geometry primitives, and composite models. Everything emits flat-shaded
geometry into the track's prop mesh.

The per-circuit visual targets are the briefs in [docs/tracks/](tracks/); this
is the toolkit for building them. Verify with the `__apex.view` survey camera —
see [DEBUG-HOOKS.md](DEBUG-HOOKS.md).

> **Separate from this:** `buildProps` *also* lays down shared, theme/`def.id`-keyed
> **city dressing** on top of each `scenery(api)` — procedural buildings, armco
> barrier liveries, roadside trees/lamps, and per-track tarmac/verge tints. That
> system (the `STYLES` / `BARRIER` / `FURN` maps, `neonTower`, `streetLamp`,
> `conifer`, …) is summarised in the **City & scenery dressing** section of
> `CLAUDE.md`. This doc covers only the per-circuit `scenery(api)` toolkit.

## Road half-width overlays (`hwZones`)

CircuitPaths traces ignore segs `w:`. To squeeze a section (e.g. Baku castle),
set on the track def:

```js
hwZones: [{ s0: 0.42, s1: 0.50, hw: 3.8, ease: 0.02 }]
```

`hw` is half-width in metres; `ease` is a soft blend shoulder in lap fraction
(default `0.025`). Zones remapped with `startFrac`/`reverse` like elevations.

---

## Positioning model

Trackside helpers take `(k, side, dist, …)`:
- `k` — node index, `0 … n-1` (a lap-fraction `s` maps to `k = Math.round(s*n)%n`).
- `side` — `-1` left, `+1` right of the racing direction.
- `dist` — metres **beyond the road edge**.

All trackside helpers anchor to the **terrain height** at that lateral distance,
so props sit on the ground on elevated/embanked sections instead of floating.
World-coord primitives take an explicit `[x,y,z]`.

`anchor()`-based helpers (walls, fences, guardrails, tyre walls, trees …) seat
on the **actual rendered terrain ribbon** — `anchor()` raycasts the built terrain
mesh (`terrainY`) and uses that height, falling back to the closed-form
`groundYAt` estimate only where the ribbon doesn't cover the point (far out, or
street circuits, which build no ribbon). This matters wherever the ribbon is
**carved or sags below the flat estimate** — corner-inside verges, and the
channel cut where an elevation mound bulges over a lower part of the track
(see `buildTerrain`'s over-track clip): without it, props anchored to `groundYAt`
float over the lower ground. `place()`/`prop()` still anchor to `groundYAt` and
sink their base ~0.8 m, which hides the small estimate-vs-ribbon gap.

### Coordinate contract

`TrackSpace` distinguishes source-trace fractions from racing-lap fractions:

```js
TrackSpace.toRacingFrac(def, sourceFrac);
TrackSpace.toSourceFrac(def, racingFrac);
TrackSpace.sourceNodeToRacing(def, sourceNode, nodeCount);
TrackSpace.sampleSource(def, racingFrac, sourceSampler);
```

Legacy scenery remains unchanged. New migrations should set
`sceneryCoordinates: "source"` when authored against the original trace, or
`sceneryCoordinates: "racing"` when authored after `startFrac`/`reverse`.
Elevations, bridges, and half-width zones use source coordinates; curated
sectors and turns remain racing-lap data.

### Intentional and atomic models

| Helper | Contract |
|---|---|
| `modelGroup(id, bounds, emit, opts?)` | preflights one complete footprint and commits staged geometry atomically; `emit(stage)` must produce a finite, non-empty group |
| `overheadSpan(spec)` | intentional cross-track span with explicit `clearance` (minimum 4.8 m) and support-footprint checks |
| `waterSurface(k, side, gap, size, col, opts?)` | typed water emission to the reflective water buffer |
| `groundPatch(k, side, gap, size, col, opts?)` | subdivided terrain-conforming patch; `opts.collision` optionally registers its visual boundary |
| `groundedSegments(spec)` | multi-sample connected model segments grounded at every endpoint |

Use `required: true` only for a hero model whose absence must fail
`verify-track`. Invalid or suppressed groups are skipped instead of uploading
malformed buffers and appear in `__apex.modelDiagnostics()`.

### Scenery themes and reusable kits

Every `scenery(api)` receives `sceneryTheme`, `landmarkKit`, and `circuitKit`.
Binding them never places geometry: a track must explicitly call a helper.
Definitions may opt in with:

```js
sceneryTheme: "street",
sceneryThemeOverrides: {
  palette: { accent: [0.1, 0.8, 1.0] },
  budgets: { facility: 18000 },
},
```

Theme names are `permanent`, `street`, `desert`, `park`, and `night-event`.
Resolution precedence, lowest to highest, is neutral defaults, the named theme,
then `sceneryThemeOverrides`; the session context is applied last (currently
dark sessions brighten the resolved window colour). Without an explicit name,
street definitions use `street`, definitions whose legacy `theme` is `desert`
use `desert`, and all others use `permanent`. Unknown names resolve to
`neutral`. Resolution is deterministic for the same definition, time, weather,
and overrides.

All LandmarkKit forms have signature `(stage, spec) -> boolean`. `spec` requires
finite `center:[x,y,z]` and positive `size:[w,h,d]`; `color` and `basis` pass
through to the primitive emitters.

| LandmarkKit helper | Form and bounded options |
|---|---|
| `roof(stage, spec)` | flat/cantilever box, or prism when `kind:"sawtooth"` |
| `facade(stage, spec)` | separated facade bays; `bays` defaults to 6 and is capped at 24 |
| `tower(stage, spec)` | tapered stacked tower; `levels` defaults to 4 and is capped at 12 |
| `stadiumSection(stage, spec)` | raked seating section; `rows` defaults to 8 and is capped at 16 |
| `arch(stage, spec)` | two posts and a lintel; optional positive `postWidth` |
| `canopy(stage, spec)` | eight-sided mast plus roof slab; optional `mastColor` |

CircuitKit helpers accept a spec containing stable `id`, racing-lap `frac`,
`side` (`-1` or `1`), and non-negative `gap`; `size:[w,h,d]`, `required`, and
`style` are optional. IDs are diagnostic and persistence identities: make them
unique, stable across builds, and conventionally prefix track-owned additions
with `kit:<track>:`. Do not derive IDs from loop order that may change.

| CircuitKit helper | Facility and options |
|---|---|
| `pitBuilding(spec)` | garage bays plus roof; `garages` defaults to 12, maximum 24 |
| `hospitality(spec)` | alternating modules plus canopy; `modules` defaults to 4, maximum 12 |
| `raceControl(spec)` | six-level tower using the hero budget |
| `pedestrianBridge(spec)` | one atomic overhead span; `clearance` defaults to 5.5 m and cannot be below 4.8 m; optional positive `span`, `thickness`, `depth` |
| `cameraCrane(spec)` | mast and camera boom |
| `marshalShelter(spec)` | compact shelter with roof |
| `recoveryBay(spec)` | service pad with canopy |
| `serviceCompound(spec)` | bounded vehicle grid; `vehicles` defaults to 6, maximum 16 |
| `trackSigns(spec)` | repeated sign slabs; `count` defaults to 8, maximum 64 |

Complete grounded facilities emit through exactly one
`TrackModels.modelGroup`; bridges delegate through exactly one
`TrackModels.overheadSpan`. Staging is atomic: a rejected footprint, malformed
or empty geometry, primitive/helper failure, exception, or exceeded vertex
budget returns `false` and commits none of that model. Missing kit globals or
dependencies also fail closed without preventing legacy scenery from building.
Repeated loops are capped; no helper performs unbounded per-node emission.

Default maximums are 50,000 vertices for a hero, 25,000 for a facility, and
10,000 for repeated furniture in one sector. `raceControl` uses the hero
budget; pit buildings, hospitality, and service compounds use the facility
budget; camera cranes, marshal shelters, recovery bays, and track signs use the
repeated budget. A definition can lower these through
`sceneryThemeOverrides.budgets`; exceeding one rejects the complete staged
model and records `reason: "vertex budget exceeded"`.

### Shared dressing exclusions

Generic city, foliage, lamps, and floodlights can be disabled by racing-lap
sector and side without changing defaults:

```js
dressingExclusions: [
  { kinds: ["city", "lamps"], s0: 0.12, s1: 0.24, side: 1 },
  { kind: "foliage", s0: 0.92, s1: 0.08 }, // wraparound, both sides
  { kind: "floodlights", s0: 0, s1: 1 },
]
```

## What `api` gives you

### Context
`out` (mesh accumulator), `track`, `def`, `theme`, `pal`, `n`, `ds`,
`px/py/pz/hw` (per-node arrays), `pyMin` (lap's low point), plus resolved
`sceneryTheme`, `landmarkKit`, and `circuitKit`.

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
| `ATM` / `COL` | named atmosphere & colour packs from `track-scenery-data.js` (see below) |

### Geometry primitives (world coords — non-cube shapes)
| Primitive | Shape |
|---|---|
| `addPrism(out, c, [w,h,len], col, basis)` | triangular ridge / A-frame roof (ridge along `len`) |
| `addPyramid(out, c, [w,h,d], col, basis)` | 4-sided peak / spire |
| `addCone(out, c, rad, h, col, seg, basis)` | conifer / spire / round tower |
| `addCyl(out, c, rad, h, col, seg, basis)` | trunk / post / tower / silo |
| `addFrustum(out, c, rBase, rTop, h, col, seg, basis)` | truncated cone — colour-banded mountains, tapered towers |
| `addMountain(out, c, baseR, h, opts)` | organic craggy summit, height colour zones + snow (see below) |
| `vadd(p, v, s)` | `p + v*s` (build offset points) |
| `anchor(k, side, dist)` | `{ c:[x,y,z], r, u, t }` ground point + track basis, for placing primitives trackside |
| `along(s0, s1, stepM, fn)` | walk nodes from `s0`→`s1` (wraps), ~`stepM` apart — for linear furniture |

`basis` is `[right, up, forward]`; pass `null` for world axes. Winding is
auto-oriented (faces always point outward) so you never fight backface culling.

`addMountain` / `mountain` opts: `{ seg, seed, rough, forest, rock, snow,
snowline (0–1, fraction of height where snow starts; >1 = none), right, fwd }`.

### Composite models — landscape & vegetation
| Model | Builds |
|---|---|
| `mountain(x, z, baseY, w, h, opts)` | **organic** colour-zoned, snow-capped summit + foot skirt |
| `peak(x, z, baseY, w, h, col)` | simple clean pyramid summit |
| `ridge(x, z, baseY, ang, len, w, h, col)` | mountain ridge prism along bearing `ang` (rad) |
| `pine(k, side, dist, h, col)` | conifer: tapered trunk + 3 stacked cones |
| `tree(k, side, dist, h, col)` | broadleaf: trunk + rounded twin-cone canopy |
| `palm(k, side, dist, h, frond)` | thin trunk + a crown of frond prisms |
| `bush(k, side, dist, col)` | low rounded shrub |
| `hedge(s0, s1, side, gap, h, col)` | continuous clipped hedge / treeline |

### Composite models — structures
| Model | Builds |
|---|---|
| `building(k, side, gap, w, h, d, opts)` | mass + window bands; 3rd arg is **clearance** `gap` (metres beyond the road edge; the emitter computes `dist = gap + w/2` so the inner face sits `gap` off the edge). `opts:{wall,window,floor,setback,roof}` |
| `tower(k, side, dist, baseW, h, opts)` | tapered tower; `opts:{col,seg,cap,capCol,mast}` |
| `grandstand(s, side, gap, len, shell, crowd)` | raked stand: shell + crowd + cantilever roof |
| `billboard(k, side, gap, w, h, col)` | advertising hoarding on two posts |
| `gantry(s, h, col)` | overhead structure spanning the track (start/scoring) |
| `marshalPost(k, side, gap)` | orange-roofed post + flag pole |
| `underpassPortal(s, opts)` | dark overhead slab + off-edge piers (cars pass under). `opts:{h,thick,col,pierGap,pierW,depth}` |
| `floodMast(k, side, dist, opts)` | tall dual-arm cool-white flood + optional ground pool. `opts:{h,cool,pool,arms}` |
| `floodMastRing(stepM, opts)` | both sides every ~`stepM` m; forwards `opts` to `floodMast` (`opts.dist` default 14) |
| `ledFacadeBands(c, h, opts)` | stacked emissive frustum bands (Flame Towers / Sphere). `opts:{r,bands,cols,seg,basis}` |
| `sailCanopy(c, basis, opts)` | disc/ellipse sail on a hub mast. `opts:{rad,rx,rz,h,col,ribs,thick}` |
| `gridshellCanopy(c, basis, opts)` | arched LED lattice veil. `opts:{w,depth,h,cols,rows,ledCols,strutCol}` |
| `concreteCanyon(s0, s1, side, gap, opts)` | pale grey Jersey wall + optional accent stripes. `opts:{h,thick,col,stripeCol,stripeH,stripeEvery}` |
| `runoffApron(k, side, gap, sz, col)` | wide low asphalt/gravel apron; `sz` = `[depth,thick,len]` or depth number |
| `bankedKerbStrip(s0, s1, side, opts)` | tilted red/white kerbs + optional SAFER rail. `opts:{saferGap,safer,step,kerbRed,kerbWht,saferCol}` |
| `bowlSeatWall(s0, s1, side, gap, opts)` | continuous eye-height seat/crowd wall. `opts:{h,thick,shell,step,crowdCols}` |
| `pastelStreetRow(s0, s1, side, gap, opts)` | sparse Med apartment boxes. `opts:{palette,minH,maxH,depth,step,lit,windowCol}` |

### Composite models — barriers / track furniture
| Model | Builds |
|---|---|
| `wall(s0, s1, side, gap, h, col, thick)` | continuous solid wall (pit/concrete) |
| `fence(s0, s1, side, gap, h, col)` | catch/debris fence — posts + pale mesh |
| `guardrail(s0, s1, side, gap, col)` | waist-high armco rail on posts |
| `tyreWall(s0, s1, side, gap, capCol)` | stacked tyres + coloured conveyor cap |

### Atmosphere / colour packs (`api.ATM` / `api.COL`)

Exported from `js/track-scenery-data.js` and exposed on the scenery `api`.
Merge into a track `pal` or use as literal colours:

| Pack | Intent |
|---|---|
| `ATM.coolNight` | Near-black zenith, cool fog (night streets / desert floods) |
| `ATM.warmNight` | Magenta/amber haze (Vegas) |
| `ATM.dampArdennes` | Grey zenith/horizon, dense cool fog |
| `ATM.britishOvercast` | Pale grey-blue sky, lush grass |
| `ATM.dustyBowl` | Bleached straw-olive grass/runoff |
| `ATM.alpineGreen` | Vivid green aprons + cool sky |
| `ATM.rivieraDay` | Clear blue + warm pastels |
| `COL.aquaRunoff` | Miami aqua apron RGB |
| `COL.basinTeal` | Montreal basin / river RGB |
| `COL.desertSand` | Warm tan runoff RGB |

```js
// Example: cool night retune inside scenery(api)
const { ATM, underpassPortal, floodMastRing, concreteCanyon } = api;
Object.assign(pal, ATM.coolNight);
underpassPortal(0.18, { h: 6, depth: 18 });
floodMastRing(48, { h: 38, dist: 16 });
concreteCanyon(0.40, 0.55, -1, 0.6, { stripeCol: [0.05, 0.52, 0.28] });
```

> Verify a track builds: `node tools/verify-track.cjs <id>` (catches a scenery
> that throws — which silently strands the game on the menu).

## On-track guard — props must never sit on/above the racing line

Every primitive emitter (`addBox`/`addCyl`/…) is wrapped in a **full-footprint**
Minkowski test (`rejBox`/`onRoadHit`) against the road half-width at each node it
rises above. If any part of a prop's oriented `w×d` footprint covers tarmac, the
whole shape is dropped (`[scenery] ... SUPPRESSED at k=...`). Composite helpers
(`building`, `neonTower`, floodlight masts) guard their full box up front — do the
same for any new composite (`rejBox(centre,[w,h,d],basis)`), never a single
`onTrack()` point, which misses a long/deep model swinging over a curving stretch.
`RAW.*` emissions (crowd spectators) skip the guard for speed — keep them behind a
shell. `tests/props-over-road.spec.js` audits all 24 circuits and fails on any new
intrusion; measure one with `TRACK=<id> PORT=<p> node tools/measure-props-over-road.mjs --shots`.

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
