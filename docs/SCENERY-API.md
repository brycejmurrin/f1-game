# Per-circuit scenery API — `scenery(api)`

Each circuit's bespoke surroundings live in `js/circuits/<id>.js` as a
`scenery(api)` function (see [ARCHITECTURE.md](ARCHITECTURE.md)). The engine
(`buildProps`, split across the `js/track/scenery-nature.js` / `scenery-city.js`
/ `scenery-structures.js` / `scenery-identity.js` modules and orchestrated by
`js/track/tracks.js`) calls it once with an `api` of placement helpers, geometry
primitives, and composite models. The **111-member `api` surface is a frozen
contract** — `tests/unit/scenery-api-contract.test.mjs` fails on any rename/removal,
because every circuit callback destructures from it. Everything emits
flat-shaded geometry into the track's prop mesh.

The per-circuit visual targets are the briefs in [docs/tracks/](tracks/); this
is the toolkit for building them. Verify with the `__apex.view` survey camera —
see [DEBUG-HOOKS.md](DEBUG-HOOKS.md).

> **Separate from this:** `buildProps` *also* lays down shared, theme/`def.id`-keyed
> **city dressing** on top of each `scenery(api)` — procedural buildings, armco
> barrier liveries, roadside trees/lamps, and per-track tarmac/verge tints. That
> system lives in the code, not in a prose section: the `STYLES` / `BARRIER` /
> `FURN` tables are in `js/track/scenery-data.js`, the generators (`neonTower`,
> `streetLamp`, …) in `js/track/scenery-city.js`, `conifer` and the rest of the
> flora in `js/track/scenery-nature.js`, and the theme tables in
> `js/track/themes.js`. This doc covers only the per-circuit `scenery(api)`
> toolkit.

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
float over the lower ground. `place()` now anchors to the rendered-ribbon
raycast first — `terrainYAt(cx, cz)`, falling back to `groundYAt` only where it
returns null — and still sinks the base ~0.8 m against any residual gap.

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
| `overheadSpan(spec)` | intentional cross-track span with explicit `clearance` (minimum 4.8 m) and support-footprint checks; optional `offset` shifts the band laterally |
| `lampPost(spec)` | registers a light fixture the circuit has drawn itself, so it emits a real point light |
| `waterSurface(k, side, gap, size, col, opts?)` | typed water emission to the reflective water buffer |
| `groundPatch(k, side, gap, size, col, opts?)` | subdivided terrain-conforming patch; `opts.collision` optionally registers its visual boundary |
| `groundedSegments(spec)` | multi-sample connected model segments grounded at every endpoint |

Use `required: true` only for a hero model whose absence must fail
`verify-track`. Invalid or suppressed groups are skipped instead of uploading
malformed buffers and appear in `__apex.modelDiagnostics()`.

**`overheadSpan` lateral offset.** `offset` (metres, +right of the centreline)
shifts a band sideways. A centred span can only ever be a flat lid; an ARCHED
soffit needs bands that sit beside the crown and leave the middle open. Build a
vault as concentric bands whose `clearance` DROPS as `offset` grows (Monaco's
tunnel: crown 6.45 m at offset 0, haunches 6.05 m, springing 5.55 m). `clearance`
still means underside height above the road datum at that node, so it is the
offset band's own clearance — the 4.8 m minimum applies to each band, and the
prop-over-road audits still ignore anything above 5.0 m.

**`lampPost(spec)`** — `{ pos:[x,y,z], k?, side?, kind?, aim?, energy?, radius?,
always? }`. The generic mast pass owns every ordinary lamp on every circuit and
emits one point light per exported mast lens. `lampPost` covers the case it
cannot: a luminaire the circuit had to model by hand because no mast could stand
there (a tunnel soffit, a canopy underside, a portal reveal). Hand back the world
position of the lens you drew and the light follows the same fixture-anchored
rule as every other lamp — no light without something visible emitting it.

- `pos` is a RAW WORLD position, like the `px`/`py`/`pz` arrays, and is *not*
  remapped by the reversed-lap wrapper.
- `kind` names an entry in track-lights.js's internal `LAMP_KINDS` table (`led`,
  `fluor`, `halide`, `sodium`, …) and
  sets colour, cone and volumetric weight, exactly as for a mast.
- `aim` overrides the default beam direction. The default aims at the centre of
  the near lane, which is right for a lamp standing *beside* the road and wrong
  for one already over it.
- `always: true` marks a fixture that burns in daylight. Ordinary lamps only
  reach the shader once the session is dark; these are baked into a separate set
  that a bright session still uploads, for the places the sun cannot reach.
- Capped at 96 fixtures per circuit.

**`floodMast` light registration.** Shared `floodMast` / `floodMastRing` register
a `flood_bank` (cool) or `halogen` (warm) lens into `track.lampPosts` by default,
on a separate 512-cap mast-lamp budget (not the 96 `lampPost` cap). Pass
`opts.light: false` when the mast is accent geometry on top of the generic
`"lamps"` dressing pass — otherwise the same stretch gets two light
sources. Circuits that exclude `"lamps"` / `"lighting"` and use `floodMastRing`
as the race-lighting rig leave the default on so pools anchor to the tall
fixtures.

### Scene graph (`ctx.instance`) — engine-internal, not part of the `api` contract

Engine emitters are being migrated off "push primitives into the soup" and onto
`ctx.instance(key, place, build, meta)` (`js/track/graph.js`): `build(rec)`
records the model's primitives ONCE in canonical space (origin, identity basis),
and each placement becomes a node carrying `{o, r, u, t, s?}`. Replay runs
through the same guarded emitters, so geometry and on-track suppression are
unchanged — the build simply also leaves behind `track.graph`, a description of
what stands where.

This is internal to `js/track/`: the 111-member `scenery(api)` surface a circuit
destructures is untouched, and circuit files need no changes. Gate any migration
with `node tools/graph-parity.cjs --all`. See
[research/SCENE-GRAPH-PLAN.md](research/SCENE-GRAPH-PLAN.md).

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

Generic city, foliage, and lamps can be disabled by racing-lap sector and side.
Track lighting is one system: `"lamps"` is the canonical dressing kind for the
generic mast pass (street posts and flood banks). `"floodlights"` is kept as an
alias; `"lighting"` matches either:

```js
dressingExclusions: [
  { kinds: ["city", "lamps"], s0: 0.12, s1: 0.24, side: 1 },
  { kind: "foliage", s0: 0.92, s1: 0.08 }, // wraparound, both sides
  { kind: "lamps", s0: 0, s1: 1 },         // suppress generic night masts
  { kind: "lighting", s0: 0.40, s1: 0.55 }, // same family (alias umbrella)
]
```

The shared furniture `streetLamp()` dressing pass is retired — the generic mast
pass draws street-style posts / flood banks (keyed off `fz.lamp`) and fills
`track.lampPosts`. Bespoke `floodMast` / `lampPost` register into the same list.
`streetLamp` is engine-internal only — it is NOT on the scenery `api`
(destructuring it in a circuit's `scenery(api)` gets `undefined` and the call
throws; bespoke posts go through `lampPost` / `floodMast`). Tuner
**LAMP DENSITY** scales mast spacing (~22 m at 1.0).

## What `api` gives you

### Context
`out` (mesh accumulator), `track`, `def`, `theme`, `pal`, `n`, `ds`,
`px/py/pz/hw` (per-node arrays), `pyMin` (lap's low point), plus resolved
`sceneryTheme`, `landmarkKit`, and `circuitKit`.

Also on the 111-member contract but not detailed in this doc: `MAT` (material
ids), the math utilities `lerp` / `norm` / `cross` / `upOf`, the `night`
session flag, `groundUnder` (world-XZ ground query — ribbon-aware, distinct
from `terrainYAt`/`groundYAt`), the grounding helpers `seat` / `foundation` / `frameAt` / `cantilever` and
`recordBarrier` (see SCENERY-GROUNDING.md), the emitters `cityFront`, `house`,
`motorhome`, `forestEdge`, `signBoard`, `signDigit`, `waterBand`,
`waterField`, and `modelDiagnostics` (also exposed as
`__apex.modelDiagnostics()`).

### Reserving ground (`indexSolid`)

`indexSolid(s0, s1, side, gap, width)` books a footprint in the solid spatial
index so later placement guards route around it. Engine emitters have always
called it — it is why `spectatorHill`, `bleacher`, `terrace` and the rest do not
get trees growing through them — and it is now on the circuit `api` too.

Use it whenever a circuit builds a **large prop out of raw primitives**: a
farmhouse, a campsite, a hand-rolled stand. Without it the roadside scatter and
the treelines have no idea the ground is taken.

```js
// Book the yard — house, tower and both cypresses — BEFORE drawing any of it.
const halfFrac = (d * 0.5 + w * 1.1) / track.total;
indexSolid(sf - halfFrac, sf + halfFrac, side, gap - 4, w * 2.0);
```

- `gap` is the reservation's **inner face** (metres beyond the road edge) and
  `width` its extent across; the recorded centreline sits half a width out, so
  clearance is measured from the reserved **surface**.
- Purely geometric. Like `indexBarrier` it never touches `barL`/`barR`, so it
  cannot move the driving limits.
- Remapped for `reverse` / `sceneryCoordinates: "source"` circuits exactly like
  `recordBarrier`, whose signature it shares.

**What it does and does not fix.** It steers what is placed *afterwards* and
consults the index — chiefly the generic roadside scatter and the treelines,
both of which are **deferred until after `def.scenery()`** precisely so they see
the finished set. It does **not** remove planting your own `scenery()` already
placed earlier in the same callback. Silverstone's campsites are the worked
example: reserving their footprint does not let them move inside the circuit's
own `hedge()`/`forestEdge()` runs, because those trees already exist by then
(measured: clip 19 → 21 severe and coplanar to 14 when tried). Against
authored planting, distance is still the fix.

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
| `terrainYAt(x, z)` | terrain height at a WORLD XZ point, or `null` off the rendered ribbon. Reach for this the moment a placement walks away from the centreline: `groundYAt` is a NODE query, and its absence is what makes Trap B in docs/SCENERY-GROUNDING.md so easy to write — Spa's old-road ribbon reused one anchor's height for 248 m and left its treeline 17 m in the air |
| `hash(i)` | deterministic 0–1 pseudo-random |
| `ATM` / `COL` | named atmosphere & colour packs from `scenery-data.js` (see below) |

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

**Species** — `pine`/`tree`/`palm`/`conifer` are four silhouettes for forty
circuits, so a Portuguese hillside, an Argentine avenue and a Highveld plain all
planted the same rounded cone. These five are the forms circuit files kept
rewriting locally, promoted with an options bag. All share `tree()`'s signature
plus a trailing `opts` — `(k, side, dist, h, col, opts)` — and are anchored,
on-track guarded and noted like it. Choose by **silhouette**, not by palette:
passing an autumn colour to `tree()` still gives you a `tree()` shape.

| Model | Silhouette | `opts` |
|---|---|---|
| `cypress(k, side, dist, h, col, opts)` | columnar dark spire — Italian avenue | `{slim, trunkCol}` |
| `stonePine(k, side, dist, h, col, opts)` | Mediterranean parasol: bare trunk + flared underside + shallow dome | `{lean, spread, trunkCol}` |
| `broadleafFall(k, side, dist, h, col, opts)` | turning autumn crown — overlapping off-axis lobes, not one cone of colour | `{lobes, spread, barkCol}` |
| `acacia(k, side, dist, h, col, opts)` | flat-topped veld thorn: low fork + near-horizontal umbrella | `{spread, layers, barkCol}` |
| `plane(k, side, dist, h, col, opts)` | pollarded avenue tree — pale mottled trunk + broad flattened crown discs | `{stages, spread, trunkCol}` |

**`FURN[id].tree` reaches these too.** The generic roadside scatter runs on
every circuit and used to resolve to exactly three silhouettes — `"palm"`,
`"fir"`, or `"broad"` for everything else — so eighteen circuits shared one tree
shape on the one foliage pass that is guaranteed to run. The five species above
are now valid `FURN.tree` values as well (`"cypress"`, `"stonePine"`,
`"broadleafFall"`, `"acacia"`, `"plane"`), each with its own `canopyR()` entry
so the scatter's fence guard clears a barrier by exactly what the species
actually spans. Unknown names still fall back to `"broad"`, so the field stays
backward-compatible.

Note that `FURN.tree` does nothing on a circuit whose `dressingExclusions`
suppress `"foliage"` lap-wide (imola plants its own bespoke parkland instead) —
setting it there is a declaration of the local species, not a visible change.

### Composite models — structures
| Model | Builds |
|---|---|
| `building(k, side, gap, w, h, d, opts)` | mass + window bands; 3rd arg is **clearance** `gap` (metres beyond the road edge; the emitter computes `dist = gap + w/2` so the inner face sits `gap` off the edge). `opts:{wall,window,floor,arch,kind,neon}` — see **Building forms** below |
| `tower(k, side, dist, baseW, h, opts)` | tapered tower; `opts:{col,seg,cap,capCol,mast}` |
| `grandstand(s, side, gap, len, shell, crowd)` | raked stand: shell + crowd + cantilever roof (legacy 6-arg form; delegates to `grandstandEx` with no opts) |
| `grandstandEx(s, side, gap, len, shell, crowd, opts)` | the full stand model — see **Grandstand variants** below |
| `spectatorHill(s0, s1, side, gap, opts)` | informal grass-bank terracing: stepped earth risers + standing crowd, no shell/roof. `opts:{rows,rise,depth,grass,riser,density,step,crowd}` |
| `bleacher(s0, s1, side, gap, opts)` | open raked seating on a bolted frame — see **Open seating** below |
| `scaffoldStand(s0, s1, side, gap, opts)` | rented tube-and-plank temporary seating — see **Open seating** below |
| `terrace(s0, s1, side, gap, opts)` | mass-concrete stepped terracing — see **Open seating** below |
| `tieredBowl(s0, s1, side, gap, opts)` | stepped bowl, tiers climbing and receding — see **Open seating** below |
| `cameraTower(k, side, gap, opts)` | lattice camera mast + railed platform + camera head. `opts:{h,col,boom,railCol}` |
| `broadcastCompound(k, side, gap, opts)` | OB-truck row + satellite uplink dishes + link mast. `opts:{vans,dishes,mastH,vanCol,dishCol,spacing}` |
| `sponsorHoarding(s0, s1, side, gap, opts)` | continuous trackside advertising-board run. `opts:{h,step,palette,postCol}` |
| `billboard(k, side, gap, w, h, col)` | advertising hoarding on two posts |
| `gantry(s, h, col)` | overhead structure spanning the track (start/scoring) |
| `marshalPost(k, side, gap)` | orange-roofed post + flag pole |
| `underpassPortal(s, opts)` | dark overhead slab + off-edge piers (cars pass under). `opts:{h,thick,col,pierGap,pierW,depth}` |
| `floodMast(k, side, dist, opts)` | tall dual-arm cool-white flood + optional ground pool. `opts:{h,cool,pool,arms,light}`. Registers a point light at the lens bank unless `light:false` |
| `floodMastRing(stepM, opts)` | both sides every ~`stepM` m; forwards `opts` to `floodMast` (`opts.dist` default 14) |
| `ledFacadeBands(c, h, opts)` | stacked emissive frustum bands (Flame Towers / Sphere). `opts:{r,bands,cols,seg,basis}` |
| `sailCanopy(c, basis, opts)` | disc/ellipse sail on a hub mast. `opts:{rad,rx,rz,h,col,ribs,thick}` |
| `gridshellCanopy(c, basis, opts)` | arched LED lattice veil. `opts:{w,depth,h,cols,rows,ledCols,strutCol}` |
| `concreteCanyon(s0, s1, side, gap, opts)` | pale grey Jersey wall + optional accent stripes. `opts:{h,thick,col,stripeCol,stripeH,stripeEvery}` |
| `runoffApron(k, side, gap, sz, col)` | wide low asphalt/gravel apron; `sz` = `[depth,thick,len]` or depth number |
| `bankedKerbStrip(s0, s1, side, opts)` | tilted red/white kerbs + optional SAFER rail. `opts:{saferGap,safer,step,kerbRed,kerbWht,saferCol}` |
| `bowlSeatWall(s0, s1, side, gap, opts)` | continuous eye-height seat/crowd wall. `opts:{h,thick,shell,step,crowdCols}` |
| `pastelStreetRow(s0, s1, side, gap, opts)` | sparse Med apartment boxes. `opts:{palette,minH,maxH,depth,step,lit,windowCol}` |

### Grandstand variants (`grandstandEx`)

`grandstand()` is one template, and the circuit files call it hundreds of times — with
only `len` and two colours variable, every stand on every circuit rendered the
same 12 m grey box. `grandstandEx` adds the shape knobs; the legacy entry point
delegates to it, so existing calls are unchanged.

| `opts` key | Effect |
|---|---|
| `livery` | name into `TrackSceneryData.STAND_LIVERIES` — supplies shell/roof/fascia/crowd in one go. Explicit `shell`/`crowd` args still win. |
| `tiers` | 1–3 raked decks; each upper deck is set back and lifted with a concourse band closing the step |
| `h` | back-shell height (default 12) |
| `roof` | `"cantilever"` (default), `"flat"` (tight over the shell), `"truss"` (open lattice deck on cross-braces), `"none"` (uncovered bleacher) |
| `suites` | glazed hospitality band under the roof (strictly opt-in — pass `true`) |
| `endWalls` | closing walls at both ends (strictly opt-in — pass `true`) |
| `pylons` | support columns under the roof's trackside edge (strictly opt-in — pass `true`) |
| `roofCol` / `fasciaCol` / `suiteCol` | explicit colour overrides |

Cantilever/flat roofs are a single slab. The only added bands are a rear
gap-closing fascia at the roof's outer edge (over the shell, behind the crowd —
not trackside) and a night under-roof light strip.

Liveries live in `js/track/scenery-data.js`: `STAND_LIVERIES` holds the named
families (`steel`, `darkSteel`, `concrete`, `alu`, `scaffold`, `sandstone`,
`terracotta`, `pastel`, `crimson`, `navy`, `teal`, `orange`) and `STAND_SETS`
maps each circuit to the families it should rotate through, so a venue's stands
differ from each other while staying recognisably one place.

```js
// A big two-tier main stand with hospitality suites and a truss roof
grandstandEx(0.00, -1, 12, 120, null, null,
  { livery: "navy", tiers: 2, roof: "truss", suites: true, endWalls: true });
// General-admission grass bank at a fast corner — no shell, no roof
spectatorHill(0.43, 0.52, 1, 14, { rows: 5, density: 0.6 });
```

**Cost note:** `spectatorHill` runs ~70 verts/metre (the standing bodies dominate),
so a 350 m bank spends a facility-sized budget rather than a furniture-sized one.
Lower `density`/`rows` or raise `step` on long runs.

### Open seating (`bleacher` / `scaffoldStand` / `terrace` / `tieredBowl`)

`grandstandEx` models one thing: a roofed stand with a **back shell**. Every other
kind of seating a circuit has — a bolted bleacher, rented scaffolding,
mass-concrete terracing, a stepped bowl — was therefore hand-rolled circuit-side,
and the same four models were independently reinvented across fourteen files (a
bleacher alone in ten). These are those implementations generalised. Note
`grandstandEx({roof:"none"})` is *not* a bleacher: it still builds the 12 m shell
wall behind the crowd.

All four are **range** emitters — `(s0, s1, side, gap, opts)` — and walk the arc
with `along()`, so they follow a corner. The hand-rolled versions were mostly
point-anchored with a straight `len` box, which at Curva Grande or Parabolica
cuts the chord instead of the road. All four `indexSolid()` their own footprint,
so treelines and the roadside scatter no longer grow through them.

| Model | Builds | `opts` |
|---|---|---|
| `bleacher` | planks on a bolted frame + back guard rail. No shell, no roof, no fascia. | `{rows, rise, setback, frame:"steel"\|"timber", frameCol, plankCol, riserCol, crowd, density, rail, step, lift}` |
| `scaffoldStand` | scaffold tubes + timber deck + benches, legs visible below the rake; optional striped canvas awning instead of a roof | `{rows, rise, setback, tubeCol, deckCol, bench, crowd, density, awning, awningCols, step, legEvery}` |
| `terrace` | poured flight of concrete steps, open front, retaining wall, plain back wall; optional raw earth `cut` face above the top step | `{rows, rise, depth, conc, concAlt, crowd, density, retainer, backWall, cut, cutCol, step}` |
| `tieredBowl` | tiers climbing **and** receding in big steps, each with a crowd band + pale fascia lip; optional cantilever over the top tier | `{tiers, tierDepth, base, rise, shell:[colA,colB], fascia, crowd, density, roof, roofCol, step}` |

```js
// Bolted timber bleacher on the inside of a fast corner
bleacher(0.09, 0.13, -1, 12, { rows: 8, frame: "timber", density: 0.7 });
// Rented scaffolding with a period canvas awning
scaffoldStand(0.00, 0.03, -1, 13, { rows: 5, awning: true });
// 1950s mass-concrete terracing cut into a hillside
terrace(0.035, 0.095, 1, 16, { rows: 8, cut: true, density: 0.6 });
// Historic tribuna: four crimson-shelled tiers with a cantilever
tieredBowl(0.90, 0.94, 1, 26, { tiers: 4, roof: true,
  shell: [[0.60, 0.44, 0.42], [0.48, 0.34, 0.32]] });
```

**Crowd discipline (baked in, not the caller's problem).** A crowd is a
continuous banded run plus **sparse speckle** standing proud of it — never one
box per spectator. The hand-rolled versions emitted a body per ~1 m seat pitch,
i.e. ~30 per row per bay, which is how the street circuits reached 1.8 M prop
verts; at night the individual bodies are invisible anyway and what the eye picks
up is the scatter of phone screens over an unbroken dark mass. The promoted
models emit one speckle head per ~6 m, capped at 16 per segment, with a hash
skip against `density`. Do not add your own bodies on top.

**Cost note:** these run ~120–160 verts/metre with default `rows` (about half
what the circuit-local versions cost, and roughly double `spectatorHill`). On a
run longer than ~200 m raise `step`, or drop `rows`/`density`.

### Building forms (`building` `opts.kind`)

`building()` used to have exactly one massing: a plinth, a hash-picked
`flat`/`setback`/`taper`/`spire` archetype and a sculpted crown. Meanwhile
`neonTower()` carried a ~20-form massing library — but the only way in was the
city generator's `STYLES` table, so every hand-placed pit block, paddock and
hospitality unit in the fleet came out as the same box.

`opts.kind` opens that library to `building()`. **Omit it and nothing changes**;
the default path is untouched.

| `opts` key | Effect |
|---|---|
| `kind` | `"tiered"`, `"podium"`, `"slab"`, `"twin"`, `"jenga"`, `"cylinder"`, `"spire"`, `"pyramid"`, `"screen"`, `"clad"`, `"dome"`, `"chevron"`, `"notch"`, `"fin"`, `"antenna"`, `"cross"`, `"arch"`, `"ziggurat"`, `"drum"`, `"hall"`, `"setback"` |
| `neon` | 0…1 neon amount for a `kind` form; `0` = a plain building with warm office windows, `1` = a full neon tower. Defaults to 0.85 on `street_night` themes, 0.32 elsewhere — a pit block is not a casino. |
| `arch` | `"flat"`/`"setback"`/`"taper"`/`"spire"` — the ORIGINAL archetype knob, used only when no `kind` is given |

`wall`/`window` carry through either path: `wall` sets the body tone (a dark
night-tuned wall is lifted to concrete for daylight, as the default path does),
`window` the glazing/neon tint.

```js
// A stepped-terrace paddock block instead of the usual box
building(K(0.02), 1, 26, 30, 22, 34, { kind: "ziggurat", wall: [0.62, 0.60, 0.55] });
// Squat arena drum behind the far hairpin
building(K(0.55), -1, 40, 46, 26, 46, { kind: "drum" });
```

### Composite models — barriers / track furniture
| Model | Builds |
|---|---|
| `wall(s0, s1, side, gap, h, col, thick)` | continuous solid wall (pit/concrete) |
| `fence(s0, s1, side, gap, h, col)` | catch/debris fence — posts + pale mesh |
| `guardrail(s0, s1, side, gap, col)` | waist-high armco rail on posts |
| `tyreWall(s0, s1, side, gap, capCol)` | stacked tyres + coloured conveyor cap |

### Baked models from the asset pack (`api.bakedModel`)

`bakedModel(id, k, side, dist, opts?) → boolean`

Places a modelled asset from `assets/pack/` — either generated offline by
`node tools/assets.mjs bake-synthetic-models` (no network) or imported via
`bake-model` / `import-models.mjs` from a glTF. Geometry is the game's own
vertex format with a `MAT` id per vertex.

`opts`: `{ scale, rotY, lift, tint:[r,g,b], mat }`. Without `rotY` the model is
yawed to face the track (a model authored facing **+Z** looks at the road from
either side). `tint` multiplies the baked vertex colour; `mat` overrides the
baked per-vertex material id, so one mesh can be dressed as concrete on one
circuit and rusted metal on another.

**It returns `false` and emits nothing when the pack has no such model** — which
is the state of a fresh checkout, since no models ship by default. Treat it as an
enhancement and always keep the procedural fallback:

```js
if (!bakedModel("grandstand_tifosi", K(0.12), -1, 14, { scale: 1.2 }))
  grandstand(K(0.12), -1, 14, 40);          // procedural fallback
```

`bakedModels()` lists the ids the installed pack actually has.

Never async: `js/render/assets.js` prefetches every model at boot precisely so
prop placement cannot vary with network timing — the same circuit must build
identically every time.

### Atmosphere / colour packs (`api.ATM` / `api.COL`)

Exported from `js/track/scenery-data.js` and exposed on the scenery `api`.
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
shell. `tests/specs/props-over-road.spec.js` audits all 40 circuits and fails on any new
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
2. Rebuild `scenery(api)` in `js/circuits/<id>.js` using the models above.
3. Survey it: `__apex.race("<id>")`, then `__apex.view(...)` aerial + trackside.
4. Iterate, then commit.

> Gotcha: destructure exactly what you use from `api`, and remember `out` is
> required by every `add*` primitive. A missing name throws inside `buildProps`,
> which silently leaves the game on the menu — always confirm `info().state ===
> "race"` after `race()`.
