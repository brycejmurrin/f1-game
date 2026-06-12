# Apex 26 — Architecture & Module Contract

Pure JS/CSS/HTML, **no build step, no dependencies**. Served as static files
(GitHub Pages). Every JS file is an IIFE that assigns ONE global. Load order
(script tags in `index.html`):

```
js/mat4.js     -> M4, V3
js/glx.js      -> GLX        (WebGL2 renderer)
js/teams.js    -> Teams      (2026 grid data)
js/tracks.js   -> Tracks     (12 circuits: data + spline + meshes)
js/car3d.js    -> Car3D      (procedural F1 car geometry)
js/input.js    -> Input      (keyboard / touch / tilt)
js/audio.js    -> GameAudio  (WebAudio synth: engine, sfx, music)
js/api.js      -> F1API      (Jolpica + OpenF1 clients, cached)
js/data.js     -> DataHub    (data hub DOM overlay)
js/game.js     -> (main, self-executing)
```

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

## js/glx.js — `GLX`

WebGL2 only. One standard lit shader for everything except the sky.

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
             fogColor:[r,g,b], fogDensity: number }   // exp2 fog
GLX.draw(mesh, modelMat, opts)        // opts optional {emissive:0..1, alpha:0..1}
                                      // lit: hemisphere ambient (mix ground/sky by N.y)
                                      //      + lambert sun; fog by view distance.
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

## js/tracks.js — `Tracks`

Each circuit is control points + theme; module samples a closed Catmull-Rom
spline and emits meshes.

```
Tracks.LIST -> [ trackDef, ... ]   // 12: bahrain, monaco, silverstone, spa, monza,
                                   // suzuka, singapore, cota, interlagos, vegas,
                                   // madrid, zandvoort  (calendar order)
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
should be ONE merged mesh per track. Road slices: 6 verts
(grassEdgeL, kerbL, edgeL, edgeR, kerbR, grassEdgeR), kerbs raised 0.04 m.

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
LAST RACE | LIVE. Builds DOM with createElement (no innerHTML for API data).
Loading spinners, stale-data note ("cached Xm ago"), graceful errors.
Team color chips use `Teams.LIST` colors matched by name substring.

```
DataHub.init(rootEl)   DataHub.open()   DataHub.close()   DataHub.isOpen() -> bool
```
Styles in `css/data.css` only (prefix all classes `dh-`).

## js/game.js — main

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

Camera: chase, eye = p - t*9.5 + up*3.4, lookAt = p + t*6 + up*1.1,
exp damp (lambda 6 eye, 10 target), fov 62 -> 76 with speed.
```

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
