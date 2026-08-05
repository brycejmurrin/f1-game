# External 3D model sources for track scenery — research

Research-only. Nothing here is adopted. The question: **can we pull ready-made 3D
models from an API and use them as track scenery instead of hand-writing every
prop as boxes and cones?**

Short answer: **yes, but only through an offline authoring-time bake**, and only
after decimation to a vertex-colour mesh. The runtime must never call a model
API. The reasons are all in the pipeline we already have, so that comes first.

---

## 1. How scenery geometry works today

### The two halves

`js/track/` is the **engine** (shared placement/geometry code); `js/circuits/` is
the **data** (one `scenery(api)` callback per circuit). Everything a circuit
places funnels through `buildProps` in `js/track/tracks.js`, which builds an
`api` of ~84 helpers and hands it to the circuit's callback.

### Everything is triangle soup in four accumulators

`buildProps` opens plain JS arrays and every emitter pushes into them:

```js
const out      = { pos: [], nrm: [], col: [], idx: [], mat: [], _mat: 0 };  // props
const glassBuf = { … };   // reflective window panes (low-roughness material)
const waterBuf = { … };   // water surfaces (sky-reflecting)
```

There is no scene graph, no instancing, no per-prop transform. A "grandstand" is
not an object — it is a few thousand triangles appended to `out` and then
forgotten. `Tracks.build()` uploads the finished arrays once:

```js
track.meshes.props = G.createChunkedMesh(propsGeo, 72);   // 72 m XZ cells, frustum-culled
track.meshes.glass = G.createChunkedMesh(glassGeo, 72);
```

### The vertex format is the hard constraint

`GLX.createMesh` (js/render/glx.js:401) interleaves **9 floats per vertex** —
`pos(3) + nrm(3) + col(3)` — with two optional extras: `mat` (1 float,
per-vertex procedural-material id) and `trk` (3 floats, road-only). There is
**no UV attribute anywhere in the scene mesh format.** Scenery is lit vertex
colour plus a procedural material id (`MAT.CONCRETE`, `MAT.BRICK`, `MAT.FOLIAGE`
…, in `js/track/geom.js`) that the lit shader turns into bump/roughness detail.

So an imported model's textures are unusable as-is. Any external mesh has to
arrive as **baked per-vertex colour**, which is exactly what our loader already
does.

### The layers of the toolkit

| Layer | File | What it gives a circuit |
|---|---|---|
| primitives | `js/track/geom.js` | `addBox`, `addCyl`, `addCone`, `addPrism`, `addFrustum`, `addMountain`, `emit` (auto-oriented convex face), plus the `MAT` ids |
| composites | `js/track/scenery-*.js` | `building`, `grandstandEx`, `tower`, `pine`, `floodMast`, `tyreWall`, … — the ~84-member frozen `api` contract |
| atomic staging | `js/track/models.js` | `modelGroup(id, bounds, emit, opts)` — preflights a footprint, emits into a scratch buffer, validates finiteness, enforces a vertex budget, and commits **atomically** or not at all. Also `overheadSpan`, `waterSurface`, `groundPatch`, `groundedSegments` |
| kits | `landmark-kit.js`, `circuit-kit.js` | `roof`/`facade`/`tower`/`arch`; `pitBuilding`/`hospitality`/`raceControl`/`pedestrianBridge` |

### The four guarantees any new source has to keep

1. **On-track rejection.** Every primitive is wrapped in a full-footprint
   Minkowski test (`rejBox`/`onRoadHit`) against the road half-width. A prop
   overlapping tarmac is dropped whole. `tests/props-over-road.spec.js` audits
   all 24 circuits.
2. **Terrain anchoring.** `anchor(k, side, dist)` raycasts the *built* terrain
   ribbon (`terrainYAt`, a binned XZ triangle grid) and returns
   `{ c:[x,y,z], r, u, t }` — ground point plus track basis. Props seat on the
   ribbon, not on a closed-form estimate.
3. **Semantic registry.** `note(kind, c, size, extra)` records placements so
   `__apex.scene()` / `worldModel()` can answer "is there a grandstand on my
   left". Geometry that skips `note()` is invisible to the agent API.
4. **Vertex budget.** Defaults: 50k hero, 25k facility, 10k repeated furniture
   (`docs/SCENERY-API.md`). Measured whole-track totals today, via
   `node tools/verify-track.cjs <id>`:

   | track | props verts | road | terrain |
   |---|---|---|---|
   | monaco | 445,290 | 16,246 | 8,240 |
   | spa | 446,414 | 33,696 | 31,266 |
   | vegas | 1,822,578 | 29,398 | 15,430 |

   That is the number that governs everything below. A typical untouched
   Sketchfab grandstand is 100k–300k triangles — **one** of them would be a
   quarter of Monaco's entire prop budget.

### The one precedent for an imported mesh

`js/render/gltf.js` (`GLTF`) is a self-contained binary-`.glb` parser that bakes
a model down to `{pos,nrm,col,idx}`: merges all primitives of all meshes, applies
node transforms, multiplies `baseColorFactor` and any `COLOR_0` into per-vertex
colour, computes flat normals when absent. Deliberately unsupported: textures,
UVs, external `.bin`/image URIs, Draco/meshopt, animation, skins, sparse
accessors, `.gltf` text form.

It is wired to exactly one thing — the **car**:

```js
// js/game.js:1395
async function loadCarModel(url) { … GLTF.toMesh(buf, { scale, tint }) … }
// js/game/apex.js:876
loadCarModel: (url) => loadCarModel(url),
```

Nothing in `js/track/` calls `GLTF` today. **That is the gap this research is
about.**

---

## 2. Why the runtime can never call a model API

- **Static hosting.** GitHub Pages, no build step, no server, no headers. An API
  key in a static site is public.
- **CORS + rate limits.** Sketchfab/Poly Pizza download URLs are short-lived
  signed links; none of these APIs promise browser-origin CORS for a game.
- **`Tracks.build()` is synchronous.** `buildProps` runs inside it; `scenery()`
  cannot await anything. Assets must be resident *before* the build.
- **PWA/offline.** The shell is cached and version-guarded (`version.json`); a
  track that needs a network fetch to look right breaks offline play.
- **Determinism.** `tests/props-over-road.spec.js`, `tracks-visual.spec.js` and
  the agent-view specs assume a track builds identically every time.

So the shape is: **fetch at authoring time, commit the baked asset, load it as a
local file.**

---

## 3. The APIs, ranked for this codebase

> Note: this session's network policy blocks arbitrary outbound hosts (the agent
> proxy answered 403 to `CONNECT api.polyhaven.com:443` and `api.poly.pizza:443`),
> so endpoint shapes below come from the vendors' published docs, not from live
> probes. Re-verify on a machine with open egress before writing a fetch tool.

### Tier 1 — best fit

**Poly Pizza** — <https://poly.pizza>, API docs at `/docs/api/v1.1`.
The successor to Google Poly (shut down June 2021) and the closest match to our
look: **low-poly, flat-shaded, untextured** models that already carry their
colour in materials/vertex colours. Free API key from an account; auth via an
`x-auth-token` header (integrations use a `POLYPIZZA_AUTH_TOKEN` env var).
Search / popular / by-id endpoints returning glTF, OBJ and FBX download URLs
with triangle counts and creator/licence metadata. Licences are mixed **CC-BY
and CC0** (the Google Poly legacy corpus is CC-BY; Quaternius/Kenney imports are
CC0). Best value for generic dressing: fences, cones, marshal posts, street
furniture, trees, vehicles.

**Kenney** (<https://kenney.nl>) and **Quaternius** (<https://quaternius.com>) —
**no API, plain CC0 zips.** For furniture and vehicles this beats every API on
effort-per-usable-asset: already low-poly, already flat-colour, no attribution
obligation, downloadable once and committed. Start here for anything generic.

**OSM Overpass API** — <https://wiki.openstreetmap.org/wiki/Overpass_API>.
Not models, **data**, and arguably the highest-leverage entry in this list for
*this* engine. Query real building footprints around each circuit
(`building=*` + `height` / `building:levels`, `leisure=stadium`,
`building=grandstand`) and extrude them — which is precisely what `buildProps`
already does with boxes, so the output needs no new renderer capability and no
licence bake-in beyond ODbL attribution. We already consume OSM for circuit
centrelines (`js/track/geo-paths.js`). Caveats: `height` coverage is patchy
(fall back to `building:levels × ~3 m`), and footprints need simplification
before extrusion. **Overture Maps** buildings and the Microsoft ML building
footprints are better-covered alternatives for heights, distributed as bulk
files rather than a query API.

### Tier 2 — usable with work

**Sketchfab Data API v3 + Download API** — <https://sketchfab.com/developers>.
1M+ downloadable models, 700k+ under Creative Commons, filterable by licence
slug (`cc0`). Auth is `Authorization: Bearer {OAUTH_TOKEN}` or
`Authorization: Token {API_TOKEN}`; `GET /v3/models/{uid}/download` returns
temporary links to a glTF archive. Biggest and best-quality catalogue by far,
and the only realistic source for specific landmark buildings. Costs: OAuth
setup, per-model licence hygiene, and heavy decimation — these are film/AR
assets, not game props. Note the Download API guidelines forbid presenting it as
a bulk mirror.

**Poly Haven** — `https://api.polyhaven.com` (`/types`, `/assets?t=models`,
`/info/{id}`, `/files/{id}`; Swagger via the Public-API repo). **CC0, no key, no
login**; requires a unique `User-Agent` header, and a "Powered by Poly Haven"
credit if you build on the live API. Superb quality, but it is a
photogrammetry/PBR library: high-poly, texture-dependent, and the catalogue is
small props and vegetation rather than architecture. Its **HDRIs** are arguably
more useful to us than its models — but our sky is procedural, so that too is a
separate project.

**Smithsonian Open Access API** (`api.si.edu`, free key) and **NASA 3D
Resources** — CC0 scans, tiny relevant overlap. Filed for completeness.

**Khronos glTF Sample Assets** (GitHub raw) — not scenery; the right corpus for
**testing** `js/render/gltf.js` against spec edge cases.

### Tier 3 — ruled out for this project

**Google Photorealistic 3D Tiles** — real-world 3D of actual circuits, which
sounds perfect. Needs an API key with billing, a streaming tiles renderer
(3D Tiles + Draco), and the terms forbid caching/redistribution. Incompatible
with no-build-step static hosting on every axis.

**AI generation (Meshy, Tripo, Luma)** — text/image → GLB over a REST API. Meshy
gates API access behind Pro ($20/mo, 1000 credits) and up. Real use case: a
**one-off hero landmark** with no CC0 equivalent (a specific pit complex, a
distinctive tower). Output is high-poly and texture-dependent, so it still lands
in the same decimate-and-bake pipeline; the win is that generated assets are
licence-clean (owned by the account on paid plans) with no attribution chain.
Not a bulk dressing strategy.

**Objaverse / HuggingFace 3D datasets** — 800k+ objects, but mixed and often
unclear licensing, and geared to ML training rather than shipping. Legal risk
outweighs convenience.

---

## 4. The bake pipeline

`gltf-transform` (Context7: `/donmccurdy/gltf-transform`) is the right tool and
runs in Node with no build step in our repo:

```bash
npx @gltf-transform/cli weld     in.glb  a.glb
npx @gltf-transform/cli simplify a.glb   b.glb --ratio 0.05 --error 0.01
npx @gltf-transform/cli prune    b.glb   c.glb
npx @gltf-transform/cli dedup    c.glb   out.glb
```

`weld` before `simplify` matters: split vertices cap what the meshoptimizer
simplifier can collapse. Programmatically:

```js
import { simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
await document.transform(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: 0.05, error: 0.01 }));
```

Do **not** use `draco`/`meshopt` compression on the output — `js/render/gltf.js`
explicitly does not support either, and adding a decoder would drag a WASM
dependency into a zero-dependency runtime.

The step `gltf-transform` does not do is **texture → vertex colour**. That needs
a repo tool: sample each material's base-colour texture at the triangle centroid
(or just take `baseColorFactor` when the texture is near-uniform), write
`COLOR_0`, then drop all textures with `prune`. `GLTF.toMesh` already multiplies
`COLOR_0` into the baked colour, so once that attribute exists the rest is free.

Rough target: **≤2,000 verts for furniture, ≤8,000 for a facility, ≤25,000 for a
hero landmark** — one order of magnitude under the `modelGroup` budgets, because
these props get placed many times per lap.

---

## 5. How an imported model would reach a track

Sketch, not a proposal to merge. Three pieces:

**(a) A model registry, populated before the build.** `Tracks.build()` stays
synchronous; `game.js` already has an async gate before `loadTrack()`. Add
`js/track/model-lib.js` (IIFE, one global `TrackModelLib`, manifest entry +
script tag + `?v=N` bump per the new-file checklist):

```js
TrackModelLib.preload(["assets/models/grandstand-a.glb", …])  // async, before loadTrack
TrackModelLib.get("grandstand-a")                             // sync {pos,nrm,col,idx} or null
```

`preload` uses the existing `GLTF.load`; a miss returns `null` and the circuit
falls back to the procedural composite — the same fail-soft contract
`loadCarModel` already uses.

**(b) One new `api` helper**, `model(id, k, side, gap, opts)`, implemented on top
of `TrackModels.modelGroup` so it inherits atomic staging, the vertex budget and
the diagnostics. It must:

- resolve the mesh from `TrackModelLib`, returning `false` on a miss;
- compute the world transform from `anchor(k, side, dist)` — `{c, r, u, t}` — plus
  `opts.scale` / `opts.yaw`, so the model seats on the terrain ribbon and faces
  the track;
- transform positions **and normals** (inverse-transpose for non-uniform scale);
- run `rejBox(centre, aabb, basis)` on the model's *full* oriented AABB, never a
  single `onTrack()` point;
- stamp `out._mat` (a single `MAT` id, or a glTF-material-name → `MAT` map);
- call `note(kind, c, size)` so `__apex.scene()` can name it.

**(c) Provenance in the repo.** `assets/models/CREDITS.md`: source URL, author,
licence, and the exact decimation command per asset. CC-BY assets additionally
need a visible in-game credit — a licence panel or an addition to the existing
menus — before any CC-BY model ships.

### Verification, unchanged

`node tools/verify-track.cjs <id>` (build guard + vertex count),
`npm run test:scenery` (props-over-road, terrain-over-road), and
`npm run test:tooling` (`scenery-api-contract` — adding an `api` member changes
the frozen 84-member contract and that test must be updated deliberately).

---

## 6. What this is actually worth

Honest cost/benefit, because the pipeline above is a real chunk of work:

- **Generic furniture** (cones, fences, barriers, lamps, benches, TV trucks):
  a clear win. CC0 packs, drop-in, better silhouettes than boxes, tiny vertex
  cost. Kenney/Quaternius, no API needed.
- **Real building footprints** (Overpass/Overture): the biggest realism win per
  unit of effort, and it needs *no* new renderer capability at all — it feeds
  the existing box extruder. This is probably the first thing to try.
- **Hero landmarks** (a specific pit complex, the Sphere, Flame Towers): the
  CC0 catalogues mostly do not have them; Sketchfab sometimes does, AI
  generation otherwise. Highest effort, highest visual payoff, worst licence and
  trademark exposure.
- **Trees/vegetation**: probably not worth it. Our `pine`/`tree` composites are
  ~100 verts and read correctly at speed; a scanned tree is 50k verts for
  detail nobody sees at 80 m/s.

One thing no licence covers: circuit landmarks, sponsor boards and team marks
are **trademarks** independent of a model's copyright licence. A CC0 model of a
branded building does not grant the brand.

---

## Sources

- [Poly Pizza](https://poly.pizza/) · [API docs v1.1](https://poly.pizza/docs/api/v1.1) · [Poly-Pizza-MCP](https://github.com/MatthewHallCom/Poly-Pizza-MCP)
- [Sketchfab Developers](https://sketchfab.com/developers) · [Data API v3](https://sketchfab.com/developers/data-api/v3) · [Download API](https://sketchfab.com/developers/download-api) · [Download API guidelines](https://sketchfab.com/developers/download-api/guidelines)
- [Poly Haven API](https://polyhaven.com/our-api) · [Public-API repo](https://github.com/Poly-Haven/Public-API) · [3D model standards](https://docs.polyhaven.com/en/technical-standards/models)
- [Overpass API (OSM wiki)](https://wiki.openstreetmap.org/wiki/Overpass_API) · [Simple 3D Buildings](https://wiki.openstreetmap.org/wiki/Simple3DBuildingsV1) · [Overture buildings guide](https://docs.overturemaps.org/guides/buildings/) · [OSM Buildings data](https://osmbuildings.org/data/)
- [glTF Transform — simplify](https://gltf-transform.dev/modules/functions/functions/simplify) (via Context7 `/websites/gltf-transform_dev`)
- [Meshy 3D generation API](https://www.meshy.ai/api) · [Meshy pricing](https://www.meshy.ai/pricing)
- [Poly (Google) shutdown](https://en.wikipedia.org/wiki/Poly_(website))
