# Apex 26 — scenery & track build

End-to-end map of how a circuit becomes driveable road + dressed scenery.
For the frozen helper catalogue, see [SCENERY-API.md](SCENERY-API.md). For
module contracts, [ARCHITECTURE.md](ARCHITECTURE.md). Contributor orientation:
[ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md).

**Rule of thumb:** circuit **DATA** lives in `js/circuits/`; shared **ENGINE**
lives in `js/track/`. Never put an id-keyed table in the engine
(`js/track/AGENTS.md`).

---

## 1. Two files per circuit

| File | Role | Load |
|---|---|---|
| `js/circuits/<id>.js` | Def: `path`, elevations, palette, theme, `furniture` / `kit` / `barrier` / `standSet` / `cityStyle`, `hwZones`, `bankZones`, sectors/turns, flags | Tagged `<script>` — order == `Tracks.LIST` |
| `js/circuits/scenery/<id>.js` | Bespoke `scenery(api)` closure | **Lazy** (`LAZY_SCENERY` in `tools/manifest.cjs`) — fetched once per session before `Tracks.build` |

A few harnesses still put `scenery` inline on the def; production circuits use
the split. Resolution at build time:

```js
def.scenery || window.TrackScenery[def.id] || null
```

Missing scenery → warn + **bare** build (generic theme dressing only).

---

## 2. Pipeline (what runs, in order)

```
Boot: each circuits/<id>.js pushes into TrackDefs
      tracks.js copies metadata into Tracks.LIST (points = lazy getter)

Menu / startRace:
  ensureScenery(idx)     // await fetch js/circuits/scenery/<id>.js
  loadTrack → Tracks.build(def, opts)

Tracks.build (js/track/tracks.js):
  1. buildCenterline(def)     // Catmull–Rom → arc nodes; _sceneryShift; elev/bridges; banking
  2. TrackPit.build           // pit complex BEFORE terrain/props
  3. TrackSurface.profile     // ribbon rails + heightAt (ground carve)
  4. Upload road / floor
  5. buildTerrain             // left/right ribbons (mesh.js) → keep terrainGeo
  6. buildProps               // theme dressing + scenery(api) + lamps + pits furniture
  7. TrackPit.openBoundary    // AFTER props
  8. Graph batches, glass, water, gate, startline, pit signs
```

`Tracks.build` is **synchronous**. Scenery must already be on
`window.TrackScenery[id]` (game.js awaits `ensureScenery` first).

### `buildCenterline` highlights

- Subsamples the OSM `path`, arc-resamples to ~`total/4` nodes.
- If `sceneryStartFrac` is set, computes `def._sceneryShift` (arc delta between
  authored dressing origin and racing start). Frac-keyed tables must respect it
  (consume via compensated helpers — a raw frac lands ~⅔ of a lap away).
- Elevations / bridges apply with `+ dress` so they stay under the racing line.
- Banking from `bankZones` (prefer `{ turn: N }` into curated `turns`).

### Terrain ribbon

`TrackSurface.profile` builds monotonic rails; `buildTerrain` extrudes left/right
ribbons. Defaults:

| Mode | Outer width default | First rail |
|---|---|---|
| Permanent / park | `terrainOuter` or **120 m** | 2.2 m from edge |
| `flatTerrain` | thinner stack to `outerW` | 2.2 m |
| `street` | **28 m** | **5 m** (ribbon starts further out) |

Street circuits **do** get a ribbon (docs that said otherwise are stale). Far
out / miss → `terrainYAt` returns null → helpers fall back to `groundYAt`.

Bridges raise the **road** deck; terrain under the span stays flat so props do
not ride the flyover.

---

## 3. `buildProps` — two layers of dressing

`buildProps(track)` (`js/track/tracks.js`) fills one shared props buffer (`out`)
plus glass/water. Order matters:

### A. Setup

1. Scratch buffers; optional night flag.
2. **`terrainYAt` grid** over uploaded `terrainGeo` (ribbon raycasts).
3. On-road cull (`rejBox` / `onRoadHit`), note/suppress registry, pit supersession.
4. `groundYAt` ← `surface.heightAt`; universal ground slab; `place` / `prop` / …
5. Resolve **kits**: `SceneryThemes` + `LandmarkKit` + `CircuitKit`.
6. Compose emitters:
   ```
   SceneryNature → SceneryStructures → SceneryCity → SceneryIdentity
   ```

### B. Generic theme dressing (before bespoke)

Runs for every circuit from def keys + theme fallbacks in
`js/track/scenery/data.js`:

| Pass | Driven by | Effect |
|---|---|---|
| Street continuous barriers | `def.street` + `def.barrier` | Armco / panel liveries |
| Corner tyre stacks | non-street | Runoff stacks |
| Corner / braking boards | `def.turns` | `signBoard` |
| City neon / shed / desert rock rows | `theme` + `cityStyle` | Procedural skylines |
| Generic pit-straight grandstands | unless `ownPitStraight` | Avoid fighting authored pits |
| Deferred roadside trees | `furniture` | Planted **after** `scenery()` so barriers are indexed |
| Mast lamps | `furniture.lamp` | Point lights on masts |
| Bridge pillars | `bridges` + `_sceneryShift` | Supports under decks |

### C. Bespoke `scenery(api)`

Builds the ~**112-member** API (frozen by
`tests/unit/scenery-api-contract.test.mjs`), optionally wraps it with
`transformSceneryApi` (shift / reverse / source↔racing), then calls the circuit
closure.

### D. After the callback

1. Flush deferred `forestEdge` foliage, then `plantRoadsideTrees()`.
2. Mast lamp merge; bridge pillars.
3. Seal / diagnostics; **`SceneryPits.build` last**.
4. Return `{ out, glass, water }` for upload.

---

## 4. Who owns which helpers

| Module | Global | Typical helpers |
|---|---|---|
| `tracks.js` locals | — | `place`, `prop`, `backdrop`, `groundPlane`, `groundYAt`, `terrainYAt`, `onTrack`, `bakedModel`, `lampPost`, `K`, `lapBounds`, kits |
| `scenery/nature.js` | `SceneryNature` | `anchor`, trees (`pine`/`tree`/`palm`/…), `mountain`/`ridge`, `grandstand*`, `forestEdge`, `bush`/`hedge` |
| `scenery/structures.js` | `SceneryStructures` | **`along`**, `wall`/`fence`/`guardrail`/`tyreWall`, `gantry`, bleachers/terraces, signs |
| `scenery/city.js` | `SceneryCity` | `building`, `tower`, `billboard`, `neonTower`, houses / motorhomes |
| `scenery/identity.js` | `SceneryIdentity` | Portals, flood masts, canopies, runoff aprons, kerb strips, broadcast compounds |
| `scenery/data.js` | `TrackSceneryData` | `FURN_DEF`, `KIT_DEF`, `STAND_*`, `THEME_DEF`, colour packs |
| `scenery/themes.js` | `SceneryThemes` | Theme palette / spacing / budgets (see §6 — `variants` unused) |
| `scenery/landmark-kit.js` / `circuit-kit.js` | kits | Bound as `landmarkKit` / `circuitKit` — circuits must **call** them |
| `scenery/graph.js` | `TrackGraph` | Engine-internal instancing — **not** part of the 112-member contract |
| `scenery/pits.js` | `SceneryPits` | After `scenery()` — not on `api` |
| `core/geom.js` | `TrackGeom` | Primitives + `addMesh` for baked packs |

---

## 5. Frames, shift, and the placement model

### Positioning

Trackside helpers take `(k, side, dist, …)`:

- **`k`** — node index. `api.K(s)` maps lap fraction → node (**authored frame**,
  unshifted — wrappers remap once).
- **`side`** — `-1` left / `+1` right of racing direction (`reverse` flips).
- **`dist`** — metres **beyond the road edge**.

### Coordinate spaces (`js/track/core/space.js`)

- **Source** — OSM trace before `startFrac` / `reverse`.
- **Racing** — after start-line rotation (sectors/turns live here).
- **Scenery** — `sceneryCoordinates: "racing" | "source"` on the def.

Elevations, bridges, `hwZones` use source-space remaps at materialize time;
curated sectors/turns stay racing-space.

### Grounding

| Helper | Height source |
|---|---|
| `groundYAt(k, dist)` | Closed-form `surface.heightAt` |
| `terrainYAt(x,z)` | Raycast of built ribbon mesh |
| `anchor(k,side,dist)` | Prefer ribbon; if `dist < 2.2` use **road** (hairpin false-hit guard); else terrain then ground; sink ~0.3 m |

`place` / most composites seat via `anchor`. Floating props far out → pull them
in or read `anchor().c[1]` explicitly.

### The `#1 trap`: `along()` + wrapped helpers on a shifted circuit

`transformSceneryApi` shifts **ranges** for `along` / `wall` / …, then shifts
**again** inside `(k,side)` helpers when the callback calls `tree(k,…)` with the
engine-frame `k` that `along` handed it. Props land a whole `_sceneryShift` away
(measured: Imola ~1.8 km, Spa ~277 m on mid-span samples).

**Until an engine fix:** walk with your own `K(s)` loop, or accept the offset.
Do **not** call wrapped helpers inside `along()` on circuits with
`sceneryStartFrac` / non-zero `_sceneryShift`. Full rules:
`.claude/skills/scenery-dress/references/rules.md`.

`bakedModel` **does** remapped correctly now (dedicated `(id,k,side)` wrapper);
older skill text that said it never places on shifted circuits is obsolete.

---

## 6. Scenery accuracy levers (no rewrite)

Work **per circuit** first; touch shared generators only when many circuits need
the same look.

### Per-circuit def (`js/circuits/<id>.js`) — cheap levers

| Lever | What it changes |
|---|---|
| `pal` / `theme` | Sky, grass, fog, ambient — first-read atmosphere |
| `furniture` | Roadside species (`tree`), foliage tint (`fol`), lamp family (`lamp`), `sparse` |
| `kit` | Barrier / fence / rail / tyre / marshal / gantry / camera / hoarding **families** |
| `barrier` | Street armco colour sequence (`a`/`b`/`c`/`night`/`tyre`) |
| `standSet` | Grandstand livery rotation (names into `STAND_LIVERIES`) |
| `cityStyle` | Named neon / day palettes (`TrackSceneryData.NC` / `.DC`) |
| `dressingExclusions` | Suppress foliage/city/lamps in frac windows (sightlines, pits, water) |
| `hwZones` | Narrow / widen road half-width (castle sections, chicanes) |
| `bankZones` | Prefer `{ turn: N }` — banking on real corners |
| `elevations` / `bridges` | Road Y; pillars auto-placed under bridges |
| `terrainOuter` / `flatTerrain` / `street` | Ribbon shape (Montreal ships `flatTerrain`) |
| `ownPitStraight` | Kill generic pit stands when bespoke pits exist |
| `sceneryStartFrac` | Only when dressing was authored against an old start — prefer re-keying scenery instead |
| `sceneryCoordinates` | `"racing"` vs `"source"` for new migrations |

Valid `furniture.tree` words are enforced by `tests/unit/circuit-vocab.test.mjs`
(read from engine tables). Unknown strings **silently** fall back — never
throw.

### Per-circuit scenery (`js/circuits/scenery/<id>.js`) — landmarks & density

| Technique | Use for |
|---|---|
| `building` / `tower` / `neonTower` | Skylines, pits, hotels |
| `grandstandEx` / `tieredBowl` / `bleacher` | Stands matching `standSet` |
| `forestEdge` / `pine`/`stonePine`/`tree` | Vegetation belts (species in the **callback**, not only `furniture`) |
| `mountain` / `ridge` / `peak` + `lapBounds()` | Horizon rings |
| `wall` / `fence` / `guardrail` / `tyreWall` | Driving-boundary furniture (also feeds AI / collision index) |
| `bakedModel(id, …)` | Kenney / pack meshes — **always** keep `if (!bakedModel(…)) procedural…` |
| `modelGroup` / `overheadSpan` / `groundedSegments` | Atomic hero models with clearance checks |
| `waterSurface` / `waterBand` / `groundPatch` | Lakes, runoffs, conforming pads |
| `floodMast` / `lampPost` | Hand-placed lights (generic mast pass covers ordinary posts) |
| `landmarkKit` / `circuitKit` | Shared intentional kits (call into them; binding alone does nothing) |

**Density:** `every(step)`, `hash()` jitter, double rows at two distances.
Vertex budget is incremental — shipped circuits ~400k–900k prop verts; Vegas
~1.8M is the known ceiling. Always `verify-track.cjs <id>` before/after.

### Shared generators (change rarely)

| File | When to touch |
|---|---|
| `scenery/data.js` | New theme fallback, stand livery, colour pack, furniture default |
| `scenery/nature.js` | New tree species mesh / `canopyR` clearance (needs fleet sweep) |
| `scenery/city.js` | Neon tower / street massing behaviour for **all** city themes |
| `scenery/structures.js` | Barrier cross-sections, `along` walker |
| `scenery/identity.js` | Shared portals / flood masts / canopies |
| `scenery/themes.js` | Theme palettes / spacing / budgets (`variants` fields are **currently unused** by any emitter) |
| `tracks.js` `buildProps` | Generic pass order, guards, deferred foliage — high blast radius |

### Materials / look (not mesh authorship)

- Baked PBR pack (`assets/pack/`, `MAT` layer ids) — ships ON; failures degrade
  to procedural. Skill: `asset-pack`.
- Lighting presets / tuner — `js/lighting/`; track lamps from mast pass +
  `lampPost`. Skill: lighting docs, not scenery-dress.
- Picture-driven accuracy: **survey-track** first, then **scenery-dress**.

### Verification ladder for scenery edits

```sh
node tools/track/verify-track.cjs <id>          # must print OK (throws / required models)
TRACK=<id> npm test -- tests/specs/props-over-road.spec.js   # optional footprint
node tools/ci/pick-tests.mjs                    # which browser groups
# Visual: playwright-probe shot.mjs / __apex.view survey camera
```

---

## 7. Def keys cheat sheet

Consumed off the **built** LIST copy (`circuit-def-fields.test.mjs` pins the
copy — a field omitted from the mapper is silently `undefined`).

| Key | Consumer |
|---|---|
| `path` | Centreline (required) |
| `elevations` / `bridges` | Road Y; pillars |
| `hwZones` | Half-width overlays |
| `bankZones` | Banking profile |
| `barrier` | Street panels / tyre tint |
| `furniture` | Trees + mast lamps |
| `kit` | `kitOf(family)` styles |
| `standSet` | `grandstandEx` liveries |
| `cityStyle` | City neon / day rows |
| `dressingExclusions` | Generic pass suppress windows |
| `turns` / `sectors` | Signs, banking re-seat |
| `sceneryStartFrac` / `reverse` / `sceneryLapMirror` | Frame transforms |
| `street` / `flatTerrain` / `terrainOuter` | Ribbon + barrier mode |
| `ownPitStraight` | Skip generic pit stands |
| `pal` / `theme` / `night` | Atmosphere |

---

## 8. Sharp edges (verified)

See [BUGS.md](BUGS.md) §Scenery for the shortlist. Headline traps:

1. **`along()` double-shift** on shifted circuits — high; document / avoid; do
   not “fix” without a per-circuit re-measure.
2. **`furniture.tree: "pine"`** → broadleaf on five circuits — parked; correct
   species needs a `canopyR("fir")` vs mesh-extent fix first
   (`circuit-vocab.test.mjs`).
3. **Silent vocab fallbacks** — unknown kit/stand/tree words never throw.
4. **On-road cull is silent for raw primitives** — composites `Log.warn`;
   primitives only increment a cull count.
5. **`RAW.*` bypasses footprint guards** — only behind shells.
6. **LIST mapper omissions** — new def keys must be copied in `tracks.js`.
7. **Foliage deferred after `scenery()`** — intentional (barrier index).

---

## 9. Related reading

| Doc / skill | Role |
|---|---|
| [SCENERY-API.md](SCENERY-API.md) | Full helper reference + grounding |
| [BUGS.md](BUGS.md) | Verified open/fixed defects |
| `js/track/AGENTS.md` / `js/circuits/AGENTS.md` | Directory rules |
| `.claude/skills/scenery-dress/` | How to place props |
| `.claude/skills/survey-track/` | Picture-driven accuracy |
| `.claude/skills/new-track/` | Adding a circuit |
| `docs/tracks/<id>.md` | Per-circuit visual briefs |
| `docs/notes/DEFECT-LEDGER.md` | Chronological scenery QA campaigns |
