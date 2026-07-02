# Apex 26 — Architecture & Module Contract

Pure JS/CSS/HTML, **no build step, no dependencies**. Served as static files
(GitHub Pages). Every JS file is an IIFE that assigns ONE global. Load order
(script tags in `index.html`):

```
js/mat4.js          -> M4, V3
js/glx-shaders.js   -> GLXShaders   (18 GLSL shader-source strings; loads before glx.js)
js/glx.js           -> GLX          (WebGL2 renderer; destructures GLXShaders)
js/gltf.js          -> GLTF         (binary .glb loader -> {pos,nrm,col,idx})
js/teams.js         -> Teams        (2026 grid data)
js/circuits.js      -> CircuitPaths (real circuit centrelines from OSM traces)
js/tracks/*.js      -> TrackDefs    (one file per circuit; registers itself on the list)
js/tracks-spline.js -> TracksKit    (spline engine; creates the shared TracksKit namespace)
js/tracks-mesh.js   -> (TracksKit)  (road/terrain/gate mesh builders; extends TracksKit)
js/tracks-scenery.js-> (TracksKit)  (procedural scenery + buildProps; extends TracksKit)
js/tracks.js        -> Tracks       (public engine API: build/sample/curvature; reads TracksKit)
js/trackmaps.js     -> TrackMaps    (offline 2D circuit outlines for the track picker)
js/car3d.js         -> Car3D        (procedural F1 car geometry)
js/input.js         -> Input        (keyboard / gamepad / touch / tilt)
js/audio.js         -> GameAudio    (WebAudio synth: engine, sfx, music)
js/api.js           -> F1API        (Jolpica + OpenF1 clients, cached)
js/data.js          -> DataHub      (data hub DOM overlay)
js/parts.js         -> Parts        (upgrade catalog: 8 categories, budget, stat mods)
js/ghost.js         -> Ghost        (time-trial ghost-lap recorder/replay data layer)
js/game-config.js   -> AXC          (config constants + live-tunable physics knobs)
js/game-state.js    -> AX           (shared mutable state bag + store/ttBoard)
js/game-weather.js  -> AXWeather    (applyRaceSettings + rain overlay; .init(deps))
js/game-track.js    -> AXTrack      (loadTrack + makeCars/gridUp; .init(deps))
js/game-ui.js       -> AXUi         (menus/panels/sliders wiring; .init(deps))
js/game-hud.js      -> AXHud        (race HUD overlay + minimap; .init(deps))
js/game-render.js   -> AXRender     (camVantage + render, floodlights, car meshes; no init — self-contained)
js/game-physics.js  -> AXPhysics    (update + updateCar, collisions; .init(deps))
js/game-debug.js    -> AXDebug      (AXDebug.install(deps) builds window.__apex)
js/game.js          -> (main, self-executing; boot wiring only)
```

The former `glx.js`, `tracks.js` and `game.js` monoliths were each split into
several files (shaders / track-engine stages / game subsystems). The split is
purely organisational — no build step, no ES modules, still one global per file.
See [MODULE-GRAPH.md](MODULE-GRAPH.md) for the dependency edges and the
`AXC`/`AX` namespace + `AX*.init(deps)` boot convention.

Full dependency graph + rules for adding a file: [MODULE-GRAPH.md](MODULE-GRAPH.md).
localStorage key reference: [STORAGE-SCHEMA.md](STORAGE-SCHEMA.md).
Section-by-section map of game.js: [GAME-JS-MAP.md](GAME-JS-MAP.md).

Conventions: `const` + `camelCase`, constants `UPPER_CASE`, colors are
`[r,g,b]` floats 0–1, angles in radians, distances in meters, world space is
**+Y up**, car/track local forward is the spline tangent. No ES modules, no
`import`/`export`, no `async` top-level. Each file starts with
`"use strict";` inside its IIFE. localStorage keys prefixed `apex26.`.

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

## js/glx-shaders.js — `GLXShaders`

Pure data: the 18 `#version 300 es` vertex/fragment shader-source strings used
by the renderer, split out of `glx.js` so the GL logic stays readable. `glx.js`
destructures `GLXShaders` at module-eval time, so this file **must load first**
(see load order above). No logic, no deps.

## js/glx.js — `GLX`

WebGL2 only. One standard lit shader for everything except the sky. Shader
sources live in `js/glx-shaders.js` (`GLXShaders`); this file owns the GL
context, programs, meshes, and draw calls.

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

## js/gltf.js — `GLTF`

Self-contained binary glTF 2.0 (`.glb`) parser. Bakes a model down to the plain
mesh data `GLX.createMesh` expects — vertex-colour only (no textures/UVs; each
material's `baseColorFactor` and any `COLOR_0` attribute is baked into per-vertex
colour), all primitives merged, node transforms applied.

```
GLTF.parseGLB(arrayBuffer) -> { json, bin }
GLTF.toMesh(glb)           -> { pos, nrm, col, idx }
GLTF.load(url)             -> Promise<mesh data>
```

## js/teams.js — `Teams`

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

## js/circuits.js — `CircuitPaths`

Data-only: real circuit centrelines projected from OpenStreetMap traces
(bacinger/f1-circuits, ODbL). `CircuitPaths[id] = { len, pts: [[x,z], …] }` —
metres, recentred, one open lap. `Tracks.build` snaps a track def to its real
trace when present.

## js/tracks/<id>.js — `TrackDefs` (circuit data)

One file per circuit. Each is a self-contained IIFE that pushes a plain data
object onto the global `TrackDefs` list. No engine logic, no palette helpers —
just raw fields. Loaded (in calendar order) *before* `js/tracks.js`.

```
def = { id, name, gp, country, night, theme, lengthKm, baseHW,
        street?:true,                              // continuous-barrier street circuit
        pal: { ...palette overrides... },          // engine wraps with day/nightPal
        segs: [ {t,l,h?,b?,w?}, ... ],             // authored fallback if no OSM trace
        bridges?:   [ {s,halfM,rise}, ... ],       // figure-8 overpass deck (terrain stays flat)
        elevations?:[ {s,halfM,rise}, ... ] }      // real elevation bumps (terrain follows road)
```

## js/tracks-spline.js · tracks-mesh.js · tracks-scenery.js · tracks.js — `Tracks` (engine)

The track engine is split across four files that share one internal namespace,
`TracksKit` (created by `tracks-spline.js`, extended by the next two; not a
public global). They must load in this order (before any consumer):

- **tracks-spline.js** — centreline generation (Catmull-Rom over `segs` or the
  OSM trace), arc-length sampling, curvature.
- **tracks-mesh.js** — road ribbon (markings, kerbs), terrain skirt, floor,
  start gate/line, plus banking/kerb query helpers.
- **tracks-scenery.js** — primitive emitters, the on-track-rejection scenery
  API, and `buildProps()` per-circuit dressing (see [SCENERY-API.md](SCENERY-API.md)).
- **tracks.js** — the public `Tracks` global (`build`/`sample`/`curvature`/`LIST`);
  ties the stages together.

`Tracks` resolves each `TrackDefs` entry (palette from the `night` flag, geometry
from the OSM trace in `js/circuits.js` or the authored `segs`), samples a closed
Catmull-Rom spline, and emits meshes.

```
Tracks.LIST -> [ trackDef, ... ]   // 24 circuits: bahrain, monaco, silverstone, spa, monza,
                                   // suzuka, singapore, cota, interlagos, vegas, madrid,
                                   // zandvoort, imola, baku, jeddah, albert_park, shanghai,
                                   // miami, mexico, montreal, qatar, redbull, hungaroring,
                                   // abudhabi  (calendar order = load order)
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
          meshes: { road, terrain, props, gate },  // GLX mesh handles (created by build)
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
over the road. The raw geometry is kept on `track.terrainGeo` so `buildProps`'
`anchor()` can raycast it (`terrainY`) and seat roadside props on the real carved
ground rather than the closed-form `groundYAt` estimate — no floating/sunk props.
A whole-circuit audit (`tests/terrain-over-road.spec.js`) asserts nothing renders
over the racing line; large road-over-road overs are ignored as intentional
crossovers (Suzuka figure-8).

## js/trackmaps.js — `TrackMaps`

Offline 2D circuit outlines for the track picker — builds each circuit's
centreline with the game's own spline engine (no race, no network) and caches
the normalised minimap polyline + detected corners per track id.

```
TrackMaps.outline(id)    -> [[x,y], …] normalised    TrackMaps.corners(id)
TrackMaps.direction(id)  TrackMaps.drsZones(id)      TrackMaps.elevRange(id)
TrackMaps.elevProfile(id) TrackMaps.themeColor(id)   TrackMaps.draw(ctx, id, opts)
```

## js/car3d.js — `Car3D`

```
Car3D.build(color, color2) -> meshData   // PLAIN data {pos,nrm,col,idx} for GLX.createMesh
                                         // (game creates one GLX mesh per team, shared by both cars)
```
Local space: origin at ground under center of gravity, **+Z forward, +Y up**.
~1.9 m wide, ~5.4 m long. Parts: floor, tapered nose, front wing + endplates,
sidepods, cockpit + halo (3 thin boxes), engine cover spine + airbox, rear
wing on endplates, 4 wheel boxes (dark `[0.05,0.05,0.05]`, slightly rounded
via chamfer prisms ok). color = livery body, color2 = wings/accents. Flat
shading (duplicated verts, face normals).

## js/input.js — `Input`

Same shape as driving-game. Steering priority: keyboard > tilt > touch.

```
Input.init(canvasEl, {onPause})
Input.requestGyro() -> Promise<boolean>   // call from user gesture (iOS)
Input.calibrate()                          // capture neutral tilt
Input.steer() -> -1..1                     // deadzone 2.5deg, full lock 22deg, expo 1.4,
                                           // low-pass tau~60ms, remap by screen.orientation.angle
Input.braking() -> bool                    // ArrowDown/S or BRAKE touch button
Input.boosting() -> bool                   // Space held, or BOOST touch button held
Input.consumeOvertake() -> bool            // X key or OT button tap (edge-triggered)
Input.tiltActive() -> bool
Input.setUseTilt(b) / Input.useTilt() -> bool
Input.touchControlsNeeded() -> bool        // coarse pointer
```
Touch layout (game.js shows/hides the DOM buttons, input.js wires them):
left/right steer halves on the lower screen when tilt off; `#btn-boost`,
`#btn-ot`, `#btn-brake` buttons always in race. Listeners use
`{passive:false}` + preventDefault on the canvas only.

## js/audio.js — `GameAudio`

All synthesized, no assets. Engine = 2026 hybrid turbo: saw+square pair
~90–700 Hz with lowpass following speed + a soft turbo whine (high sine)
+ harvest whirr when braking. Must init from a user gesture.

```
GameAudio.init()  GameAudio.setEnabled(b)  GameAudio.enabled() -> bool
GameAudio.startEngine() / stopEngine() / setEngine(speed01, boost01, offroad)
GameAudio.setSkid(x 0..1)
SFX: lightOn(i 0..4), lightsOut(), overtakeReady(), deployBoost(), collision(),
     offtrack(), lap(), finish(), uiTick(), uiSelect(), penalty()
GameAudio.startMusic(trackIdx) / stopMusic()   // menu uses startMusic(-1)
// lookahead scheduler (300 ms, timer + rAF), 2-3 short loops reused across tracks ok
```

## js/api.js — `F1API`

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

## js/data.js — `DataHub`

DOM overlay (`#datahub` in index.html), tabs: SCHEDULE | STANDINGS |
LAST RACE | LIVE | TELEMETRY | EXPORT (dev-only: pulls OpenF1 start-line
traces per circuit to validate/correct s=0 against the game's centreline).
Builds DOM with createElement (no innerHTML for API data).
Loading spinners, stale-data note ("cached Xm ago"), graceful errors.
Team color chips use `Teams.LIST` colors matched by name substring.

```
DataHub.init(rootEl)   DataHub.open()   DataHub.close()   DataHub.isOpen() -> bool
```
Styles in `css/data.css` only (prefix all classes `dh-`).

## js/parts.js — `Parts`

Upgrade catalog: 8 categories (`engine, aero, suspension, brakes, tyres, ers,
gearbox, fuel`), budget 600 cr (`apex26.unlimitedBudget` removes the cap).
Supplier-exclusive options only shown when `team.engine` matches.

```
Parts.CATALOG   Parts.DEFAULTS   Parts.BUDGET
Parts.getMods(setup, teamEngine) -> { speed, accel, cornering, braking }
Parts.getCost(setup)             Parts.statMult(stat)
```

## js/ghost.js — `Ghost`

Pure data layer for the time-trial ghost car: records the player's lap as
parallel `(t, s, x)` arrays, persists the best per track in localStorage
(`apex_ghost_v1` — note: NOT `apex26.`-prefixed), and answers "where is the
ghost at lap-time t". `js/game-render.js`'s `render()` owns the drawing. Also
loadable under Node (`module.exports`) for unit tests.

```
Ghost.setTrack(id)  Ghost.setEnabled(b)  Ghost.startLap()  Ghost.record(t, s, x)
Ghost.finishLap(t)  Ghost.at(t)          Ghost.timeAt(s)   Ghost.hasGhost()
Ghost.bestTime()    Ghost.clear()
```

## js/game-config.js · game-state.js · game-weather.js · game-track.js · game-ui.js · game-hud.js · game-render.js · game-physics.js · game-debug.js

Subsystems extracted from the old `game.js` monolith (~5,400 lines originally,
now ~580). Two are plain namespaces read directly everywhere; the rest are
IIFEs. Six expose an `.init(deps)` that game.js calls once at boot, handing
over its DOM cache + the closures it still owns (see the `AX*.init(...)` /
`AXDebug.install(...)` block near game.js's boot) — `AXRender` needs no
init, it's fully self-contained. `AXRender`/`AXPhysics`/`AXDebug` call each
other's exports directly (`AXDebug` → `AXPhysics.update`, `AXRender.camVantage`,
etc.) since every `AX*` module is a `window` global by the time any of this
runs; only names game.js *itself* still owns get threaded through init/install.
All load *after* the engine modules and *before* `game.js`.

```
game-config.js  -> AXC        physics constants, gear table, DIFF tiers, CAM_MODES,
                              and the live-tunable knobs (AXC.PACE/WHEELBASE/… — mutated
                              by __apex.setPhysics and the pause sliders)
game-state.js   -> AX         the mutable state bag every game-* module reads/writes
                              (state machine, track, cars[], race/sector timing, camera,
                              mode flags) + the `store` localStorage helper (STORAGE-SCHEMA.md)
                              + `ttBoard` time-trial leaderboard
game-weather.js -> AXWeather  applyRaceSettings() (TOD/weather → sun/sky/fog/exposure/
                              floodlights/paint), per-circuit atmo bias, 2D rain overlay
game-track.js   -> AXTrack    async loadTrack() (build+upload a circuit, menu flyby) and
                              makeCars()/gridUp() (assemble + place the 22-car field)
game-ui.js      -> AXUi       car-setup panel, select/menu/pause screens, steering presets
                              & sliders, sound/music toggles (all event wiring in .init)
game-hud.js     -> AXHud      the live race HUD overlay + minimap canvas
game-render.js  -> AXRender   camVantage() (12 camera-mode framing solver) + render()
                              (the per-frame camera/shadow/sky/car/post draw), floodlight
                              building (buildTrackLights/setFrameLights), car-mesh builders
                              (teamMesh/playerBodyMesh/drawPlayerWheels/loadCarModel)
game-physics.js -> AXPhysics  update() (field driver: countdown, per-car step, collision
                              resolution, race-end) + updateCar() (the ~650-line per-car
                              physics/AI core — see docs/DEBUG-HOOKS.md and CLAUDE.md's
                              Physics section), rescuePlayer/onTTLap/coast
game-debug.js   -> AXDebug    AXDebug.install(deps) builds and assigns window.__apex
                              (~50 methods — see docs/DEBUG-HOOKS.md)
```

## js/game.js — main

Now just the orchestrator (~580 lines): shared-namespace refs at the top
(destructured from `AXC`/`AX`/every `AX*` module), the DOM cache, sky/weather
animation state game-render.js reads, race-flow functions no other module
needed to own (`startRace`/`endRace`/car-setup helpers), the fixed-step main
loop (`tick()`, which calls `AXPhysics.update` + `AXRender.render`), and the
boot block (`GLX.init` guard, every `AX*.init(deps)` / `AXDebug.install(deps)`
call, initial state, `requestAnimationFrame(tick)`). Section map:
[GAME-JS-MAP.md](GAME-JS-MAP.md).

States: `menu | select | count | race | results | seasonEnd`. Player + 21 AI.
Position model: `s` meters along centerline (wraps), `x` lateral in meters
(+right), heading relative to tangent. Physics: arcade — vmax base 92 m/s
scaled by tier (player = tier1 equivalent), electric deploy adds up to +12 m/s
but tapers to 0 above 80 m/s (2026 taper), boost drains energy bar (recharges
under braking + slow corners), OVERTAKE: when gap to car ahead < 1.0 s, OT
light on; activating gives 4 s full-taper-free deploy (then 12 s cooldown).
Grass (|x| > hw) = heavy drag. Walls at hw+9: soft push back. Cars collide as
circles r=1.4 m: lateral push + small speed loss. AI: follow racing-line
offset = -curvatureAhead * k, brake by curvature, tier speed + rubber-band by
difficulty (EASY/NORMAL/HARD). Start: grid 22 (player P12 default, tier
order), five red lights (1 s apart) then out. Race = trackDef.laps. HUD (DOM):
pos/lap/laptime/best, speed km/h, energy bar, OT indicator, gaps, minimap
canvas 2D. Penalty: 4+ full-off-track shortcuts -> +5 s on results screen.
Points per Teams.POINTS; SEASON mode = 12 races in calendar order, standings
table between races, saved in `apex26.season`. localStorage: hiscore N/A,
settings (team, difficulty, tilt, sound), season.

Camera: 12 player modes cycled with the CAM button / C key (persisted) —
CHASE (close, behind+above), FAR (pulled back/up), COCKPIT (onboard eye, player
car hidden), HOOD (nose cam), OVERHEAD (top-down drone), HELI (broadcast heli),
REVERSE (mounted ahead looking back), TV SIDE (trackside panning), CINEMATIC
(slow orbit), LOW (surface skimmer), T-CAM (roll-hoop broadcast), REAR CAM
(tail-mounted looking back). Chase modes anchor a fixed arc-length behind the
car so they never lag at speed; onboard modes ride ON the car with very high
damping. fov widens with speed; a debug free camera (`__apex.view`) can override
all of it.
```

Debug & test API: `window.__apex` drives the game from the console or a headless
harness — loading/positioning (race/park/jump/aim/sky/go/info), cameras
(camera/view/snapCam), telemetry (probe/physState/tuning/cars/corners/wallStats),
deterministic physics (setInput/clearInput/step/setPhysics), and collision/AI
scenarios (rival/rivals/pair/jam). Full reference in
[DEBUG-HOOKS.md](DEBUG-HOOKS.md). Per-circuit scenery design briefs live in
[docs/tracks/](tracks/).

## index.html / css

`index.html` owns ALL static DOM: canvas `#game`, HUD, overlay menus, select
screen, pause menu, data hub root, touch buttons, help modal. `css/style.css`
= layout/HUD/menus (F1 style: black `#0a0a0f`, red `#e10600` accents, bold
italic headings); `css/data.css` = data hub only. Cache-bust all
script/style URLs with `?v=1`.

## Deploy

`.github/workflows/pages.yml`: deploy whole repo to Pages on push to
`claude/f1-game-project-26h3ng` + workflow_dispatch. `manifest.json` PWA like
driving-game. NOT affiliated with FIA/F1 — fan project disclaimer in README
and menu footer ("Unofficial fan project").
