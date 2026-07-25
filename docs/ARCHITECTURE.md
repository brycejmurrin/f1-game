# Apex 26 — Architecture & Module Contract

Pure JS/CSS/HTML, **no build step**. The **runtime has zero dependencies**;
Playwright is the only `devDependency` (test harness, never shipped). Served as
static files (GitHub Pages). Every JS file is an IIFE that assigns ONE global.

Modules are grouped by domain: `js/render/` (renderers), `js/track/` (the track
**engine** — shared spline/mesh/scenery code), `js/circuits/` (the 24 circuit
**data** files), `js/car/` (car geometry, liveries, parts, teams), `js/data/`
(API clients + data hub), `js/game/` (game subsystems), with `js/mat4.js` and
the `js/game.js` entry at the root.

**`tools/manifest.cjs` is the single source of truth for load order.** The
`<script>` tag order in `index.html` must match it — `tests/load-order.test.mjs`
(run via `npm run test:tooling`) asserts they never diverge. Adding a file means
a script tag AND a manifest entry. The abbreviated sketch below is a subset;
consult the manifest for the full, current order:

```
js/mat4.js               -> M4, V3
js/render/shaders/*      -> GLXChunks, GLXShaders   (pure data, before glx.js)
js/render/glx.js + glx/* -> GLX        (default WebGL2 renderer + its passes)
js/render/webgpu/*       -> WGX        (opt-in WebGPU renderer)
js/render/gfx.js         -> Gfx        (renderer selection seam)
js/car/teams.js          -> Teams      (2026 grid data)
js/track/*               -> the track engine (spline, mesh, scenery, markings…)
js/circuits/*.js         -> TrackDefs  (one file per circuit; registers itself on the list)
js/track/tracks.js       -> Tracks     (engine shell: resolve + build; reads TrackDefs)
js/car/*                 -> Car3D, Liveries, LiveryTex, Parts, Ghost
js/game/*                -> Input, GameAudio, LightTune, Particles, GameCams, GameHud, …
js/data/*                -> F1API, DataHub + tab modules
js/game.js               -> (main, self-executing)
```

Conventions: `const` + `camelCase`, constants `UPPER_CASE`, colors are
`[r,g,b]` floats 0–1, angles in radians, distances in meters, world space is
**+Y up**, car/track local forward is the spline tangent. No ES modules, no
`import`/`export`, no `async` top-level. Each file starts with
`"use strict";` inside its IIFE. localStorage keys prefixed `apex26.`.

---

## Reorg (2026-07)

The July 2026 architecture reorg moved every module into a domain directory
(old→new map in the git history) and split the three giants (`game.js` 8,955 →
~4,700 lines; `glx-shaders.js` → chunked shader files; `buildProps` → four
scenery modules). The mechanisms that keep a no-build, script-tag codebase
coherent after the split:

- **The `G` ctx façade.** Extracted `js/game/*` modules never reach into
  game.js's closure. game.js builds one `G` object — live getters/setters over
  its closure state (player, cars, race flags, …) plus stable helpers — and
  instantiates each module once via `Module.create(G)`. A module reads
  `G.player`, calls `G.helpers`, and stays testable/loadable in isolation.
- **`tools/manifest.cjs`** — the load-order single source of truth, asserted by
  `tests/load-order.test.mjs`. Its `HARD_EDGES` list records **eval-time load
  dependencies** (B destructures A's global at eval time, so A must precede B —
  e.g. shaders before glx.js). Its `TRACK_VM` list names the files
  `tools/verify-track.cjs` and the VM-based tests load into a bare Node VM, so
  headless guards follow the layout automatically.
- **`tools/extract-module.mjs`** assists further extractions from game.js
  (moves a block, wires the `create(G)` boilerplate, updates manifest + tags).
- **Cache busting is unchanged** — every JS/CSS edit still needs the `?v=N` sed
  across `index.html` plus the matching `version.json` bump.

### Deferred follow-ups (known debt, in rough priority order)

- **game.js pass 2** — promote the remaining closure `let`s to a shared state
  object and split the two megafunctions (`render()`, `updateCar()`).
- **tracks.js → GLX direct calls** — the track engine still calls `GLX.*`
  directly in places, bypassing the `Gfx` façade; route them through the handle.
- **`liverytex.js` duplicates GLX's mobile-tier detection** — extract one shared
  tier probe.
- **`TUNE_DEFS` mirror-comment invariants** in `glx.js`/`gfx.js` — comments that
  must track the registry by hand; replace with a checked mapping.
- **WebGPU lazy-load** — `js/render/webgpu/*` is parsed by every visitor but
  activated by almost none; load it on opt-in only.
- **`css/style.css` split** — pending committed visual baselines (the visual
  suite has no tracked golden images yet, so a CSS split can't be gated).

---

## js/mat4.js — `M4`, `V3`

Column-major `Float32Array(16)`, compatible with `uniformMatrix4fv`.

```
M4.ident()                            -> mat
M4.mul(a, b)                          -> mat (a*b)
M4.perspective(fovY, aspect, near, far) -> mat
M4.lookAt(eye, target, up)            -> VIEW matrix (already inverted, ready to use)
M4.translation(x, y, z)               -> mat
M4.rotX(a) / M4.rotY(a) / M4.rotZ(a)  -> mat
M4.scale(x, y, z)                     -> mat
M4.invert(m)                          -> mat (general 4x4 inverse)
M4.transformPoint(m, [x,y,z])         -> [x,y,z]
V3.add(a,b) V3.sub(a,b) V3.scale(a,s) V3.dot(a,b) V3.cross(a,b)
V3.len(a) V3.norm(a) V3.lerp(a,b,t)   -> [x,y,z] / number
```

## js/render/shaders/ — `GLXChunks`, `GLXShaders`

All GLSL sources for the renderer as template-literal strings with no
interpolation — pure data. `chunks.js` (`GLXChunks`) holds the shared leaves
(noise/hash, GGX BRDF trio, tonemap/grade) authored once; `lit.js`, `sky.js`,
`fx.js`, and `post.js` compose them into the program sources
(LIT/SKY/SHADOW/MARK/DECAL/GLOW, the post chain, SSAO/GODRAY/COMPOSITE/FXAA/
DEPTH) on the shared `GLXShaders` global. Replaces the old monolithic
`js/shaders/glx-shaders.js`. `glx.js` destructures `GLXShaders` at the top of
its IIFE, so these files must load first (a manifest `HARD_EDGES` entry).

## js/render/glx.js (+ js/render/glx/) / js/render/webgpu/wgx.js / js/render/gfx.js — renderers

GLX is the default WebGL2 renderer. `js/render/glx.js` is the core; the
heavier passes live beside it in `js/render/glx/` — `post.js` (`GLXPost`, the
HDR post chain), `shadow.js` (`GLXShadow`, sun/car shadow maps), `chunked.js`
(`GLXChunked`, the chunked-mesh path) — each created with a shared `GLXCore`
context object so the public `GLX` surface is unchanged. WGX is selected
through the active Gfx seam only when `apex26.gfxBackend=webgpu` opts in and
WebGPU initializes successfully; otherwise game.js uses GLX. One standard lit
shader handles everything except the sky on the GLX path. Shader source
strings live in `js/render/shaders/` (globals `GLXChunks`/`GLXShaders`).

```
GLX.init(canvasEl) -> boolean         // false if no WebGL2
GLX.resize()                          // canvas.clientWidth*dpr, dpr capped at 2;
                                      // sets GLX.width, GLX.height, GLX.aspect
GLX.createMesh(data) -> mesh          // data = {pos:Float32Array(3n), nrm:Float32Array(3n),
                                      //         col:Float32Array(3n), idx:Uint16Array|Uint32Array}
                                      // builds VAO; mesh is opaque handle
GLX.begin(frame)                      // clears color+depth, stores frame uniforms:
   frame = { viewProj: mat4, eye:[x,y,z], sunDir:[x,y,z] (normalized, TOWARD sun),
             sunColor:[r,g,b], ambientGround:[r,g,b], ambientSky:[r,g,b],
             fogColor:[r,g,b], fogDensity: number,    // exp2 fog
             lights: [x,y,z, r,g,b, rad, …] }         // optional point lights (≤32)
GLX.draw(mesh, modelMat, opts)        // opts optional {emissive:0..1, alpha:0..1}
                                      // lit: hemisphere ambient (mix ground/sky by N.y)
                                      //      + lambert sun + up to 32 point lights
                                      //      (diffuse, quadratic falloff to radius);
                                      //      fog by view distance.
                                      // emissive=1 -> full albedo, no lighting (night glow)
GLX.drawSky(sky)                      // fullscreen triangle via gl_VertexID, depth 1.0
   sky = { invViewProj: mat4, zenith:[r,g,b], horizon:[r,g,b],
           sunDir:[x,y,z], sunColor:[r,g,b], stars:0|1 }   // stars: cheap hash sparkle for night
GLX.drawShadow(modelMat, w, l)        // dark radial-alpha blob quad, w x l meters,
                                      // at local y=0 plane of modelMat, blended, no depth write
```

Depth test LEQUAL, backface culling CCW, `alpha:false, antialias:true`
context. The lit fragment shader fades to `fogColor` with
`1-exp(-(d*fogDensity)^2)`.

## js/render/gltf.js — `GLTF`

Self-contained binary glTF 2.0 (`.glb`) parser that bakes a model down to the
plain mesh data `createMesh` expects (`{pos,nrm,col,idx}`) — materials'
baseColorFactor and any COLOR_0 baked into vertex colours, all primitives
merged with node transforms applied. Self-test: `tools/gltf-selftest.mjs`.

## js/car/teams.js — `Teams`

2026 grid, hardcoded.

```
Teams.LIST -> [ { id:"mercedes", name:"Mercedes-AMG Petronas", short:"MER",
                  color:[r,g,b], color2:[r,g,b], engine:"Mercedes",
                  tier:0,                 // 0 fastest .. 4 slowest
                  drivers:[ {name:"George Russell", code:"RUS", num:63},
                            {name:"Kimi Antonelli", code:"ANT", num:12} ] }, ... ]
// 11 teams in 2026 spec: Mercedes(t0), Ferrari(t1), McLaren(t1, Norris num:1),
// Red Bull(t2, Verstappen num:3), Alpine(t3), Racing Bulls(t3), Haas(t3),
// Williams(t3), Audi(t4), Aston Martin(t4), Cadillac(t4, Perez 11 / Bottas 77)
Teams.POINTS  -> [25,18,15,12,10,8,6,4,2,1]   // top 10, no fastest-lap point
```

## js/track/geom.js — `TrackGeom`

The pure geometry emitters shared by the road/terrain builders and the scenery
modules: `addBox, emit, addPrism, addPyramid, addCone, addCyl, addFrustum,
addMountain` plus the vec helpers (`cross`, `norm`, `vadd`) and the `MAT`
material-id map. Each `add*(out, …)` pushes pos/nrm/col/idx into the caller's
accumulator; stateless, renderer-free (loads under verify-track's bare VM).
The engine destructures it and the scenery modules re-wrap the emitters with
the on-track rejection guard (`RAW`).

## js/track/scenery-data.js — `TrackSceneryData`

The static dressing tables hoisted out of buildProps: `BARRIER` (armco
liveries), `FURN`/`FURN_DEF` (per-track trees + lamps), `CROWD_DAY`,
`WINTINTS`, `HOUSE_*`, `MOTORHOME_BODY`, `SIGN_SEG`/`SIGN_DIGIT`, and the city
generator's `NC`/`DC`/`BLD`/`STYLES`/`THEME_DEF`. Pure constants — anything
that closes over placement state stays in the scenery modules.

## js/track/ — the rest of the engine

One concern per file, all loaded before `tracks.js`:

| File | Global | Owns |
|---|---|---|
| `spline.js` | `TrackSpline` | closed Catmull-Rom sampling, curvature |
| `mesh.js` | `TrackMesh` | road/terrain mesh extrusion (`buildRoad`/`buildTerrain`) |
| `space.js` | `TrackSpace` | world↔track (Frenet) projection used by physics |
| `surface.js` | `TrackSurface` | road-surface build details, per-track tarmac/verge tints |
| `markings.js` | `CircuitMarkings` | curated FIA-aligned sector splits + turn apexes (racing-lap fractions; feeds `Tracks.LIST`, sectorAt, minimaps, corner boards) |
| `models.js` | `TrackModels` | composite prop models shared across circuits |
| `themes.js` | `SceneryThemes` | theme tables for the city generator |
| `landmark-kit.js` / `circuit-kit.js` | — | landmark & circuit composite kits for `scenery(api)` |
| `geo-paths.js` | `CircuitPaths` | real OSM circuit centrelines (bacinger/f1-circuits, ODbL) — was `circuits.js` |
| `maps.js` | `TrackMaps` | offline 2D picker outlines from the spline engine — was `trackmaps.js` |
| `scenery-nature.js` / `scenery-city.js` / `scenery-structures.js` / `scenery-identity.js` | `Scenery*` | the buildProps split (below) |

**The buildProps split.** Prop placement is four `Scenery*.create(ctx)`
modules — nature (trees/terrain furniture), city (the `STYLES` building
generator, neon, glass), structures (grandstands, gantries, barriers,
floodmasts), identity (per-circuit landmark passes) — each instantiated with a
ctx of the placement helpers and accumulators. Together they serve the
**84-member `scenery(api)` contract**, frozen by
`tests/scenery-api-contract.test.mjs`: a circuit's `scenery(api)` callback can
destructure any of those 84 names, so removing/renaming one is a breaking
change the test catches. See [SCENERY-API.md](SCENERY-API.md).

## js/circuits/<id>.js — `TrackDefs` (circuit data)

One file per circuit. Each is a self-contained IIFE that pushes a plain data
object onto the global `TrackDefs` list. No engine logic, no palette helpers —
just raw fields. Loaded *before* `js/track/tracks.js`, in the order their
`<script>` tags appear in `index.html` (this is **not** the real-world F1
calendar order). **Tag order == `Tracks.LIST` order == picker/season order.**

```
def = { id, name, gp, country, night, theme, lengthKm, baseHW,
        street?:true,                              // continuous-barrier street circuit
        pal: { ...palette overrides... },          // engine wraps with day/nightPal
        segs: [ {t,l,h?,b?,w?}, ... ],             // authored fallback if no OSM trace
        bridges?:   [ {s,halfM,rise}, ... ],       // figure-8 overpass deck (terrain stays flat)
        elevations?:[ {s,halfM,rise}, ... ],       // real elevation bumps (terrain follows road)
        hwZones?:   [ {s0,s1,hw,ease?}, ... ] }    // half-width overlays (CircuitPaths ignores segs w:)
```

## js/track/tracks.js — `Tracks` (engine shell)

Resolves each `TrackDefs` entry (palette from the `night` flag, geometry from
the OSM trace in `js/track/geo-paths.js` or the authored `segs`), samples the
closed Catmull-Rom spline (via `TrackSpline`), and orchestrates the build —
road/terrain meshes through `TrackMesh`/`TrackSurface`, props through the four
scenery modules.

```
Tracks.LIST -> [ trackDef, ... ]   // 24 circuits. LIST order == the `<script>` load
                                   // order in index.html (each circuits/<id>.js registers
                                   // itself as it loads) — it is NOT the real F1 calendar
                                   // order. Check tools/manifest.cjs / index.html.
trackDef = { id, name:"MONZA", gp:"Italian GP", country:"Italy",
             laps:3, night:false, lengthKm:5.79,
             palette: { zenith,horizon,sun:[r,g,b], grass:[r,g,b], runoff:[r,g,b],
                        fog:[r,g,b], fogDensity:number, kerbA:[r,g,b], kerbB:[r,g,b],
                        ambientSky:[r,g,b], ambientGround:[r,g,b], sunColor:[r,g,b],
                        sunDir:[x,y,z] },
             points: [ [x, y, z, halfWidth?, bank?], ... ] }  // halfWidth default 7, bank rad default 0

Tracks.build(trackDef) -> track
track = { def, total,                       // total = length of loop in meters
          n,                                // sample count (spacing ~4 m)
          // parallel typed arrays, length n (closed loop, sample i at s = i*total/n):
          px,py,pz, tx,ty,tz, rx,ry,rz,     // position, tangent, right (banked)
          hw,                               // half width
          meshes: { road, terrain, props, gate },  // renderer mesh handles (created by build)
          map: [ [x,z], ... ] }             // ~200 pts for the DOM minimap, normalized 0..1

Tracks.sample(track, s, out)   // s wraps; out = {p:[3], t:[3], r:[3], hw:number}
                               // linear interp between samples; REUSE out, no alloc
Tracks.curvature(track, s)     // signed curvature 1/m at s (+ = right turn), smoothed
```

Mesh content baked as vertex colors: asphalt `[0.16,0.16,0.17]` with subtle
per-slice variation, white edge lines, red/white kerb stripes alternating
every ~4 m on corner outsides, start/finish checker band at s≈0, grass/runoff
terrain skirt ~40 m each side, simple themed props (boxes/prisms: grandstands,
trees, buildings, floodlight poles for night tracks) and a start gantry. Props
should be ONE merged mesh per track. Road slices: 14 verts across the section
(grass shoulder · kerb · bold edge line · asphalt · dashed centre · asphalt ·
edge line · kerb · grass shoulder), banked along `up` on banked corners. The
grass-shoulder verts sit a hair below the asphalt plane and any shoulder vert
that chords over a nearby node's tarmac (tight-corner inside) is buried under it.

**Terrain ribbon (`buildTerrain`)**: a 5-vert-per-side skirt whose inner edge
hugs the road and outer edge eases (quadratic) down to the lap low point.
An **over-track clip** lowers any ribbon vert/face that would render above the
racing surface — the inside of corners, fold-backs, and the channel cut where an
elevation mound (e.g. a rise that runs close to a lower part of the lap) bulges
over the road. The raw geometry is kept on `track.terrainGeo` so the scenery
modules' `anchor()` can raycast it (`terrainY`) and seat roadside props on the
real carved ground rather than the closed-form `groundYAt` estimate — no
floating/sunk props. Two whole-circuit audits assert nothing renders over the
racing line: `tests/terrain-over-road.spec.js` for terrain/road faces (large
road-over-road overs ignored as intentional crossovers, e.g. Suzuka figure-8),
and `tests/props-over-road.spec.js` for scenery props (roofs/canopies/buildings/
crowds). The prop guard itself wraps every primitive emitter in a
full-footprint Minkowski test (`rejBox`/`onRoadHit`) against the road
half-width, so `building()`/`neonTower`/floodlight masts drop any part that
would overhang the tarmac on a curving stretch — not just their inner-face point.

## js/car/car3d.js — `Car3D`

```
Car3D.build(color, color2) -> meshData   // PLAIN data {pos,nrm,col,idx} for renderer.createMesh
                                         // (game creates one renderer mesh per team, shared by both cars)
```
Local space: origin at ground under center of gravity, **+Z forward, +Y up**.
~1.9 m wide, ~5.4 m long. Parts: floor, tapered nose, front wing + endplates,
sidepods, cockpit + halo (3 thin boxes), engine cover spine + airbox, rear
wing on endplates, 4 wheel boxes (dark `[0.05,0.05,0.05]`, slightly rounded
via chamfer prisms ok). color = livery body, color2 = wings/accents. Flat
shading (duplicated verts, face normals).

## js/car/ — the rest of the car domain

| File | Global | Owns |
|---|---|---|
| `liveries.js` | `Liveries` | custom paint jobs — `{id, name, c1, c2, stripe?, noseStripe?, …}` |
| `liverytex.js` | `LiveryTex` | per-team livery texture atlas (canvas-2D; stylised fan-art crests, invented sponsor wordmarks, car number onto a 1024² atlas mapped by panel UVs) |
| `parts.js` | `Parts` | upgrade catalog — 8 ordered categories, `getMods`, `getCost`, `statMult`, 600 cr budget (see CLAUDE.md "Parts system") |
| `ghost.js` | `Ghost` | time-trial ghost: records the player's lap as parallel `(t, s, x)` arrays, replays the best one; pure data layer — game.js feeds samples and draws |

## js/game/input.js — `Input`

Steering priority: keyboard > tilt > touch.

```
Input.init(canvasEl, {onPause})
Input.requestGyro() -> Promise<boolean>   // call from user gesture (iOS)
Input.calibrate()                          // capture neutral tilt
Input.steer() -> -1..1                     // deadzone 2.5deg, MAX_TILT=36deg for full lock,
                                           // One-Euro low-pass, remap by screen.orientation.angle
Input.braking() -> bool                    // ArrowDown/S or BRAKE touch button
Input.boosting() -> bool                   // boost is a TOGGLE (Space / BOOST button taps
                                           // flip it on/off — not held)
Input.consumeOvertake() -> bool            // X key or OT button tap (edge-triggered)
Input.tiltActive() -> bool
Input.setUseTilt(b) / Input.useTilt() -> bool
Input.touchControlsNeeded() -> bool        // coarse pointer
```
Touch layout (game.js shows/hides the DOM buttons, input.js wires them):
left/right steer halves on the lower screen when tilt off; `#btn-boost`,
`#btn-ot`, `#btn-brake` buttons always in race. Listeners use
`{passive:false}` + preventDefault on the canvas only.

## js/game/audio.js — `GameAudio`

All synthesized, no assets. Engine = 2026 hybrid turbo: saw+square pair
~90–700 Hz with lowpass following speed + a soft turbo whine (high sine)
+ harvest whirr when braking. Must init from a user gesture.

```
GameAudio.init()  GameAudio.setEnabled(b)  GameAudio.enabled() -> bool
GameAudio.startEngine() / stopEngine() / setEngine(rev01, boost01, offroad, speed01, gear)
GameAudio.setSkid(x 0..1)
SFX: lightOn(i 0..4), lightsOut(), overtakeReady(), deployBoost(), collision(),
     offtrack(), lap(), finish(), uiTick(), uiSelect(), penalty()
GameAudio.startMusic(trackIdx) / stopMusic()   // menu uses startMusic(-1)
// lookahead scheduler (300 ms, timer + rAF), 2-3 short loops reused across tracks ok
```

## js/data/api.js — `F1API`

Jolpica `https://api.jolpi.ca/ergast/f1/` + OpenF1 `https://api.openf1.org/v1`.
All methods return Promises of SIMPLIFIED plain objects (not raw API shapes).
Single internal queue: min 400 ms between requests, localStorage cache
(`apex26.api.<url>` -> `{t, data}`), TTLs: schedule 24 h, standings/results
1 h, openf1 latest-session 10 min, finished session data 7 d. On 429 or
network error: serve stale cache if present, else reject. Never auto-poll.

```
F1API.schedule()              -> [{round, name, circuit, locality, country, date, time, hasSprint}]
F1API.nextRace()              -> same item or null
F1API.driverStandings()       -> [{pos, points, wins, name, code, number, team}]
F1API.constructorStandings()  -> [{pos, points, wins, name}]
F1API.lastRace()              -> {name, round, date, results:[{pos, name, code, team, grid, points, status, time}]}
F1API.latestSession()         -> {sessionKey, name, type, circuit, country, dateStart} | null
F1API.weather(sessionKey)     -> {airT, trackT, humidity, rainfall, windSpeed} | null
F1API.positions(sessionKey)   -> [{num, pos}] | null      // folded latest per driver
F1API.sessionDrivers(sessionKey) -> [{num, code, name, team, color}] | null
```

## js/data/ — the hub and its tabs

`hub.js` (`DataHub`, was `data.js`) is the DOM overlay (`#datahub` in
index.html) and the shared session plumbing; each tab is its own module
exposing `create(ctx) -> { load<Tab>, … }`, instantiated once by the shell
with exactly the helpers it needs (`el`/`clear`/`spinner`/`emptyMsg` DOM
builders, `ensureSession`/`buildPicker`/`invalidateOther` session plumbing,
`COMPOUND`, `findTeam`/`cssColor`, message constants). All use the `F1API`
global directly and load before hub.js.

| File | Global | Tab |
|---|---|---|
| `schedule.js` | `DataSchedule` | SCHEDULE |
| `standings.js` | `DataStandings` | STANDINGS (drivers + constructors) |
| `lastrace.js` | `DataLastRace` | LAST RACE |
| `live.js` | `DataLive` | LIVE (30 s refresh loop) |
| `telemetry.js` | `DataTelemetry` | TELEMETRY (trace viewer/map/playback; also returns `closeTelemPopup` — the shell closes the popup on tab switch / hub close) |
| `export.js` | `DataExport` | EXPORT dev tool (GPS traces → ZIP) |

Tabs build DOM with createElement (no innerHTML for API data), show loading
spinners, stale-data notes ("cached Xm ago"), graceful errors. Team color
chips use `Teams.LIST` colors matched by name substring.

```
DataHub.init(rootEl)   DataHub.open()   DataHub.close()   DataHub.isOpen() -> bool
```
Styles in `css/data.css` only (prefix all classes `dh-`).

## js/game/tables.js — `GameTables`

Static gameplay/render data destructured by game.js at the original sites:
`DEFAULT_CUSTOM` (the custom team), `TIER_V` (AI tier speeds), `GEARS`/
`GEAR_TOP`/`IDLE_RPM`/`MAX_RPM` (gearbox), `DIFF` (difficulty), `CAM_MODES`
(player camera list) and the `PAINT_*` car-paint material constants.

## js/game/lighting.js — `LightTune`

The lighting-tuner core: `TUNE_DEFS` (slider registry — the `def` values ARE
the shipped tuning), the live `LT` value object (a plain object mutated in
place by game.js's profile resolution and `__apex.lightTune`), `floodColor` +
`LAMP_KINDS` (per-theme/fixture light character), `buildTrackLights(track)`
(bakes the per-track light records), plus the per-frame light upload —
`setFrameLights` (distance-sorted cull to the frame CAP) and
`appendCarTailLights`. Profile persistence and the (track, time-of-day,
weather) resolution stay in game.js — they read live session state.

## js/game/carmesh.js — `CarMesh`

Car decal-quad geometry (`carDecalData` + the shared decal meshes), the effect
quads (brake-glow ring, rain light, exhaust/boost flames, ERS strip) and the
cockpit-rig instrument builders (wheel, LED strip, gear/speed digits, ERS and
pedal bars, OT lamp), with their memo caches. Only dependency is the renderer
handle, injected once at boot: `CarMesh.init(gfx)`. State-coupled car drawing
(teamMesh, playerBodyMesh, cockpitBodyMesh, drawCockpitRig, decal textures)
stays in game.js.

## js/game/particles.js — `Particles`

Shared transient-particle pool (tyre smoke, collision sparks, gravel/grass
kickup, rain spray): a fixed CPU pool of camera-facing soft billboards drawn
in two batches per frame via `gfx.drawParticles()` — alpha-blended
(smoke/dust/spray) and additive (sparks; HDR tints feed bloom for free). Also
owns the **rain overlay** (`Particles.rain*`). Emitters only READ car state;
update/draw run in the RENDER path only, never inside the physics step, so
headless obs/act runs are identical with FX on or off.

## js/game/ — the extracted game modules

Each is an IIFE global instantiated by game.js with the **`G` ctx façade**
(see Reorg above) — one object of live getters/setters over game.js closure
state plus stable helpers, passed to `Module.create(G)`:

| File | Global | Owns |
|---|---|---|
| `store.js` | `GameStore` | localStorage persistence (settings, season, parts, records) |
| `perf.js` | `PerfGov` | adaptive performance governor (render scale / FX tiers) |
| `cameras.js` | `GameCams` | the 13 player camera modes + the `__apex.view` debug free-cam framing |
| `hud.js` | `GameHud` | in-race DOM HUD (pos/lap/times, speed, energy, gaps, minimap) |
| `results.js` | `GameResults` | results + season-end screens, penalties, points |
| `apex.js` | `ApexApi` | the **whole `window.__apex` dev API** (see DEBUG-HOOKS.md) |
| `atmosphere.js` | `Atmosphere` | `applyRaceSettings` — time-of-day/weather scene state, palettes, flood activation |
| `setup-ui.js` | `SetupUI` | CAR SETUP screen (8 part categories, budget) |
| `menus.js` | `Menus` | menu/select/pause DOM flows |
| `photomode.js` | `Photomode` | photo mode |
| `tuner.js` | `TunerPanel` | LIGHTING TUNER pause-menu panel (COPY VALUES export) |
| `steer-tuning.js` | `SteerTuning` | ADVANCED STEERING panel (presets + sliders) |

## js/game.js — main

The entry point (post-reorg ~4,700 lines: loop, physics, AI, race logic — the
subsystems above are extracted). States: `menu | select | count | race |
results | seasonEnd`. Player + 21 AI.
Position model: the car drives in **world space** (`player.head` = world
heading, `px/pz` world position); `s` (metres along centreline, wraps) and `x`
(lateral metres, +right) are recovered by projection each frame. Physics:
arcade — vmax base `VMAX = 72` m/s scaled by tier (player = tier1 equivalent),
electric deploy (`DEPLOY_A = 3.0` m/s²) tapers to 0 across the `TAPER_LO..TAPER_HI`
= 41–53 m/s band, boost drains energy bar (recharges under braking + slow
corners), OVERTAKE: when gap to car ahead < 1.0 s, OT light on; activating gives
4 s full-taper-free deploy (then 12 s cooldown). Grass (|x| > hw) = heavy drag.
Walls sit at the per-node barrier limit from `Tracks.wallAt`: soft push back.
Cars collide as ~4.8 × 2.0 m oriented boxes: lateral push + small speed loss.
AI: follow racing-line offset = -curvatureAhead * k, brake by curvature, tier
speed + rubber-band by difficulty (EASY/NORMAL/HARD). Start: grid 22 (player P12
default, tier order), five red lights (1 s apart) then out. Race =
`GAME_LAPS` (3). HUD (DOM): pos/lap/laptime/best, speed km/h, energy bar, OT
indicator, gaps, minimap canvas 2D. Penalty: 4+ full-off-track shortcuts -> +5 s
on results screen. Points per Teams.POINTS; SEASON mode = all 24 circuits
(`Tracks.LIST.length`) in load order, standings table between races, saved in
`apex26.season`. localStorage: hiscore N/A, settings (team, difficulty, tilt,
sound), season.

Camera: 13 player modes (`CAM_MODES` in `js/game/tables.js`, driven by
`GameCams`) cycled with the CAM button / C key (persisted) — CHASE (close,
behind+above), FAR (pulled back/up), DRIFT (swings outside on a slide),
COCKPIT (onboard eye, player car hidden), HOOD (nose cam), OVERHEAD (top-down
drone), HELI (broadcast heli), REVERSE (mounted ahead looking back), TV SIDE
(trackside panning), CINEMATIC (slow orbit), LOW (surface skimmer), T-CAM
(roll-hoop broadcast), REAR CAM (tail-mounted looking back). Chase modes
anchor a fixed arc-length behind the car so they never lag at speed; onboard
modes ride ON the car with very high damping. fov widens with speed; a debug
free camera (`__apex.view`) can override all of it.

Debug & test API: `window.__apex` (built by `js/game/apex.js`) drives the game
from the console or a headless harness — loading/positioning
(race/park/jump/aim/sky/go/info), cameras (camera/view/snapCam), telemetry
(probe/physState/tuning/cars/corners/wallStats), deterministic physics
(setInput/clearInput/step/setPhysics), and collision/AI scenarios
(rival/rivals/pair/jam). Full reference in [DEBUG-HOOKS.md](DEBUG-HOOKS.md).
Per-circuit scenery design briefs live in [docs/tracks/](tracks/).

## index.html / css

`index.html` owns ALL static DOM: canvas `#game`, HUD, overlay menus, select
screen, pause menu, data hub root, touch buttons, help modal. Script tags must
match `tools/manifest.cjs` (asserted by `tests/load-order.test.mjs`).
`css/style.css` = layout/HUD/menus (F1 style: black `#0a0a0f`, red `#e10600`
accents, bold italic headings); `css/data.css` = data hub only. Cache-bust
every script/style URL with `?v=N`, where `N` is a monotonic per-build integer
(check `index.html` for the current value). `version.json` `{ "build": N }`
mirrors the same `N`; the shell version guard uses it to force-refresh a stale
installed PWA.

## Deploy

`.github/workflows/pages.yml`: on push to `claude/f1-game-project-26h3ng` or
workflow_dispatch, stage the runtime subset in `_site` (`index.html`,
`version.json`, `manifest.json`, `sw.js`, `js/`, `css/`, `icons/`, and `assets/`)
and deploy that Pages artifact. Tests, tools, docs, and other repository-only
files are not shipped. `manifest.json` defines the PWA. NOT affiliated with
FIA/F1 — fan project disclaimer in README and menu footer ("Unofficial fan
project").
