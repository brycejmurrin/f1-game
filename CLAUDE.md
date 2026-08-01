# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks. Pure IIFE modules
loaded via `<script>` tags. Static files — runs on GitHub Pages.

---

## Key commands

```sh
npx serve -l 3456 .               # run locally (or: python3 -m http.server 3456)
node tools/assets.mjs bake-synthetic  # rebuild assets/pack (no network, no deps)
node tools/assets.mjs verify          # licence allow-list + md5 + size budget
node tools/verify-track.cjs <id>  # headless build check (no browser) — catches a
                                  #   scenery/buildRoad/buildProps THROW that would
                                  #   strand the game on the menu (e.g. a bad ref).
                                  #   Fast pre-push guard for track scenery edits.
npx playwright test               # run all specs
npx playwright test tests/<file>.spec.js   # single spec
npx playwright test tests/ui-audit.spec.js # → artifacts/galleries-<port>/ui-audit/
npx playwright test tests/tracks-visual.spec.js  # per-circuit pixel-diff regression

# Named test groups (via npm run <script>):
npm run test:headless   # the whole headless project (all non-render specs, no GPU)
npm run test:render     # the render project only (screenshots/pixel/GL) at --workers=4
npm run test:smoke      # page load + __apex available
npm run test:api        # __apex contract: dev-tools + headless + obs/act + new-hooks
npm run test:hooks      # camera/driving/map/new __apex hook contracts
npm run test:physics    # physics regression + elevation + projection
npm run test:collision  # collision, drift, offtrack
npm run test:behaviour  # collision + drift + offtrack + world-physics + physics-fixes
npm run test:barriers   # track wall geometry + AI-fixes barrier tests
npm run test:parts      # parts catalog, budget, persistence, physics
npm run test:steering   # presets, sliders, steering modes, gamepad
npm run test:camera     # camera modes + camera hooks + driving hooks + camera tuner
npm run test:ui         # UI screenshots: audit + button-touch + desktop + hud (slow)
npm run test:visual     # pixel-diff visual regression (tracks-visual, slow)
npm run test:scenery    # props/terrain over road + f1-track-accuracy
npm run test:webgl      # webgl-probes + lighting-ab
npm run test:audio      # engine/sfx audio smoke
npm run test:modes      # season + time-trial game modes
npm run test:map        # minimap hooks
npm run test:agent      # agent world view (world/trackInfo/scene/visible/rollout)
npm run test:circuit    # walls + autopilot + elevation + audit (all circuit-level)
npm run test:tiny       # START HERE: page loads, __apex present, dev hooks respond
                        #   (~40 s, headless project only). If this is red nothing
                        #   else is worth running.
npm run test:fast       # curated fast subset: smoke + api + collision + offtrack +
                        #   parts-physics + steering (~3 min)
npm run test:ab         # lighting A/B pixel comparison (tests/lighting-ab.spec.js)
npm run test:audit      # coverage guard: every spec must belong to ≥1 group
npm run test:tooling-fast  # the STRUCTURAL half of test:tooling in ~4 s (load order,
                        #   docs integrity, api contract, graph, validators). Two
                        #   full-fleet audits dominate test:tooling's ~3 min —
                        #   this is everything else, for the edit loop.
npm run test:sweeps     # those two: prop-clipping + road-under-floor (~3 min,
                        #   rebuilds all 24 circuits). test:tooling still runs both.
```

### Running tests without stalls (background + logs, parallel ports)

Playwright runs are slow (UI groups ~5 min) and look "stuck" when run silently in
the foreground. The default reporter is `tests/live-reporter.js`: one timestamped,
immediately-flushed line per test **start** and **end** (`> start` / `+ pass` /
`x FAIL`, with duration), so a piped log is genuinely tail-able and a hung test is
identifiable — it's the one with a `> start` line and no end line. The webServer's
per-request stderr spam is suppressed in playwright.config.js. Run in the
background and tail:

```sh
npm test -- tests/foo.spec.js > artifacts/tmp/foo.log 2>&1 &
tail -f artifacts/tmp/foo.log
```

The npm scripts use `tools/run-playwright.mjs`, which allocates a free port and
port-suffixed report/artifact paths for every invocation. Independent npm test
commands can therefore run concurrently without sharing and tearing down each
other's web server:

```sh
npm test -- tests/a.spec.js > artifacts/tmp/a.log 2>&1 &
npm test -- tests/b.spec.js > artifacts/tmp/b.log 2>&1 &
```

Reports land in `artifacts/report-<port>/`, artifacts in `artifacts/test-results-<port>/`
(both gitignored). Direct `npx playwright test` still uses port 3456; prefer npm.

**Two projects, not one.** `playwright.config.js` splits the suite into a
`headless` project (physics/geometry/hook specs — the default, no GPU) and a
`render` project (screenshot/pixel-diff/GL specs, listed in `RENDER_SPECS`). The
old single `chromium` project is gone — target `--project=headless` or
`--project=render` when filtering, not `--project=chromium`. `npm run test:render`
runs the render project at `--workers=4` to cap SwiftShader (CPU-GL) concurrency;
`npm run test:headless` runs everything else and can use more workers safely.

**`tools/test-shards.sh`** wraps all of this — run whole npm groups concurrently,
one port + log per group, with a pass/fail summary at the end:

```sh
tools/test-shards.sh smoke api collision        # 3 groups at once
WORKERS=2 tools/test-shards.sh circuit barriers # workers per group (default 2)
tail -f artifacts/logs/smoke.log                # watch one group live
```

Sizing: total browsers = groups × WORKERS, and rendering is SwiftShader (CPU),
so on a small box 2-3 groups × 2 workers is the sweet spot. A single local run
defaults to at most 4 workers (`APEX_WORKERS=N` overrides it). Playwright shards
are for distributing CI work across machines; local `SPLIT` multiplies browser
pools and usually makes this software-rendered suite slower.

IMPORTANT: tests serve `js/`/`css/` straight from the working tree — don't edit
source files while a run is in flight, or its later specs load mixed versions.

The npm wrapper owns its static server in-process and forwards termination
signals to Playwright so browser children shut down. Direct CLI/sharded runs
still use Python; after an uncatchable SIGKILL, check for an orphan with
`pgrep -fa http.server` before removing it.

### Output dirs (standard)

All regenerable output lives in **two** top-level gitignored dirs — never `/tmp`,
never scattered at the repo root:

- **`artifacts/test-results-<port>/`** — test failures, traces, attachments, JUnit
- **`artifacts/report-<port>/`** — HTML report
- **`artifacts/logs/`** — shard and batch logs
- **`artifacts/galleries-<port>/`** — test-emitted screenshots/reports
- **`artifacts/tmp/`** — one-off batch probes
- **`scratch/captures/`** — interactive tool captures
- **`scratch/renders/`** — car/parts/aero review sheets
- **`scratch/profiles/`** — CPU/GPU profiles

Both roots are created on demand. `assets/`, committed generated sources, and the
tracked golden baselines in `tests/*-snapshots/` stay outside these roots. The
current consolidated visual suite has no tracked replacement baselines yet; do the
Linux/SwiftShader regeneration as a separate required operation before treating
`npm run test:visual` as a reliable regression gate.

---

## File layout

Modules are grouped by domain. **`js/track/` is the ENGINE** (spline, mesh,
scenery placement — shared code); **`js/circuits/` is the DATA** (one def file
per circuit). Don't mix them up: a circuit edit goes in `js/circuits/<id>.js`,
an engine/placement change goes in `js/track/`. `tools/manifest.cjs` is the
single source of truth for load order (see Critical conventions).

```
js/mat4.js       M4, V3         matrix math
js/game.js       (main)         entry — game loop, physics, AI, race logic; owns the
                                  closure state and hands the G ctx façade to js/game/*

js/render/       — renderers —
  gfx.js         Gfx            renderer façade — selects GLX (WebGL2) or WGX (WebGPU),
                                  both expose the same surface to game.js
  glx.js         GLX            WebGL2 renderer core
  glx/           GLXPost, GLXShadow, GLXChunked   post chain (post.js) / shadow
                                  passes (shadow.js) / chunked-mesh path
                                  (chunked.js), wired via the GLXCore ctx
  shaders/       GLXChunks, GLXShaders   chunks.js = shared GLSL leaves;
                                  lit.js / sky.js / fx.js / post.js assemble GLXShaders
                                  (pure data; loads before glx.js)
  gltf.js        GLTF           binary .glb loader → plain {pos,nrm,col,idx}
  assets.js      Assets         baked asset-pack loader (assets/pack) — PBR material
                                  ARRAYS indexed by MAT id, baked models, HDRI ambient.
                                  Every failure (no pack, bad pack, backend without
                                  createTextureArray) falls back to the procedural look
  webgpu/        WGX            WebGPU backend (wgx.js) + WGSL sources
                                  (wgsl-chunks/-post/-fx.js); feature-detected, GLX fallback
  three/         TLX            three.js r184 / TSL backend — the THIRD renderer behind
                                  the Gfx seam (tlx.js core, tlx-chunked/-post/-shadow.js;
                                  tsl-lit/-sky/-fx/-post/-chunks.js are the TSL shader
                                  graphs). Opt-in via localStorage apex26.gfxBackend =
                                  "three"; installed by descriptor-copy onto GLX so every
                                  GLX.* call site keeps working. Vendored three lives in
                                  vendor/three-0.184.0 (the only ES-module island)

js/track/        — track ENGINE (shared code) —
  tracks.js      Tracks         engine shell: spline resolve, build orchestration
  spline.js      TrackSpline    Catmull-Rom sampling / curvature
  mesh.js        TrackMesh      road/terrain mesh extrusion
  geom.js        TrackGeom      pure geometry emitters (addBox/emit/addCyl/…) + MAT ids
  graph.js       TrackGraph     scenery MODEL LIBRARY + NODE GRAPH. A model is a list
                                  of primitive OPS in canonical space (origin, identity
                                  basis); each placement is a node {model, o, r,u,t, s?}.
                                  Migrated emitters call ctx.instance(key, place, build,
                                  meta) instead of emitting inline — replay runs through
                                  the same GUARDED emitters, so geometry and on-track
                                  suppression are unchanged. Gate any migration with
                                  `node tools/graph-parity.cjs --all` (builds each track
                                  from a baseline ref AND the working tree and diffs the
                                  prop geometry vertex for vertex). `graph.stats().byKind`
                                  reports per-emitter instancing reuse.
                                  See docs/research/SCENE-GRAPH-PLAN.md.
  space.js       TrackSpace     world↔track (Frenet) projection
  surface.js     TrackSurface   road surface build / tarmac-verge tinting
  markings.js    CircuitMarkings  curated FIA sector splits + turn apexes
  models.js      TrackModels    composite prop models
  themes.js      SceneryThemes  theme tables for the city generator
  landmark-kit.js, circuit-kit.js   landmark/circuit composite kits
  geo-paths.js   CircuitPaths   OSM circuit centrelines (was circuits.js)
  maps.js        TrackMaps      offline 2D picker outlines (was trackmaps.js)
  scenery-data.js  TrackSceneryData  static buildProps tables (BARRIER, FURN,
                                  city palettes/styles) — data only, no placement logic
  scenery-nature.js / scenery-city.js / scenery-structures.js / scenery-identity.js
                 Scenery*.create(ctx)   the buildProps split; together they serve the
                                  96-member scenery(api) contract frozen by
                                  tests/scenery-api-contract.test.mjs

js/circuits/     — circuit DATA —
  <id>.js        TrackDefs      24 circuits (one file each, registers on Tracks.LIST);
                                  script-tag order == Tracks.LIST == picker/season order

js/car/          — car —
  car3d.js       Car3D          procedural F1 car geometry
  liveries.js    Liveries       custom paint jobs
  liverytex.js   LiveryTex      canvas-2D livery texture atlas (crests/sponsors/number)
  parts.js       Parts          upgrade catalog (8 categories, getMods, getCost, statMult)
  ghost.js       Ghost          time-trial ghost record/replay data layer
  teams.js       Teams          2026 grid (11 teams, 22 drivers, engine supplier per team)

js/data/         — data hub —
  api.js         F1API          Jolpica + OpenF1 clients, localStorage cache
  hub.js         DataHub        data hub DOM overlay shell + shared session plumbing
                                  (was data.js)
  telemetry.js   DataTelemetry  TELEMETRY tab (trace viewer/map/playback), created by
                                  hub.js via DataTelemetry.create(ctx). N-lane
                                  compare (up to 4) via a module-scoped tray that
                                  survives a SESSION switch → same driver's race
                                  vs quali lap side by side; laps[0] is the delta
                                  reference. Pure playback/GPS-sanity helpers are
                                  exported (_locAt/_dropStrays/…) for the tests.
  export.js      DataExport     EXPORT dev tool (GPS traces → ZIP)
  schedule.js / standings.js / lastrace.js / live.js   the other tabs, same
                                  Data*.create(ctx) pattern

js/game/         — game modules (each created with the G ctx façade from game.js) —
  tables.js      GameTables     static game data (CAM_MODES, DIFF, gears, paints)
  lighting.js    LightTune      TUNE_DEFS registry, live LT values, floodColor,
                                  LAMP_KINDS, buildTrackLights, setFrameLights,
                                  appendCarTailLights (profile store stays in game.js —
                                  it reads live track/tod/weather state)
  light-presets.js  LightPresets  shipped lighting-tuner values, keyed "track|tod|weather"
                                  (baked from the LIGHTING TUNER panel's COPY VALUES export)
  carmesh.js     CarMesh        car decal/effect/cockpit-instrument geometry
                                  (renderer handle injected via CarMesh.init(gfx))
  particles.js   Particles      transient particle pool (smoke/sparks/spray) + the
                                  rain overlay (Particles.rain*)
  bodyattitude.js  BodyAttitude the chassis pitch/squat/roll/bob read — visual only,
                                  never feeds the driving model
  debrisworld.js   DebrisWorld  Rapier side-world (vendor/rapier-0.19.3): debris and
                                  kinematic car mirrors. NEVER moves a game car
  incidentsim.js   IncidentSim  bounded incident window that MAY move a car — the
                                  high-risk layer; safety contract in its header
  agentview-raster.js  AgentRaster  the character-grid rasters behind
                                  __apex.render({what}) (view/map/circuit/car)
  ariastate.js   AriaState      mirrors each option group's visual selection onto
                                  aria-pressed for screen readers
  music-lib.js   MusicLib       bring-your-own-music library (IndexedDB), fed to GameAudio
  spotify.js     SpotifyMusic   optional personal-use Spotify Premium soundtrack
  input.js       Input          keyboard / gamepad / touch / tilt
  audio.js       GameAudio      WebAudio synth: engine, sfx, music
  store.js       GameStore      localStorage persistence
  perf.js        PerfGov        adaptive performance governor
  cameras.js     GameCams       the 13 player camera modes + debug free-cam
  cam-tune.js    CamTune        CAMERA TUNER data: per-mode framing offsets
                                  (height/dist/side/pitch/yaw/fov), store + apply();
                                  plus cornerLead (chase/far-only knob read by
                                  cameras.js to swing the chase INTO corners)
  hud.js         GameHud        in-race DOM HUD
  results.js     GameResults    results / season-end screens
  apex.js        ApexApi        the whole window.__apex dev API
  agentview.js   AgentView      the agent-facing JSON world view — world()/
                                  field()/trackInfo()/scene()/describe()/query()/
                                  atmosphere()/objective()/carView()/render()/
                                  survey()/rollout()/terminal()/corners()/
                                  agentHelp(); composes the __apex hooks
                                  into one egocentric snapshot with typed errors.
                                  render({what}) is the ONE raster (view|map|
                                  circuit|car); visible()/worldModel()/frame()/
                                  plan() still exist as DEPRECATED aliases —
                                  prefer render({what}) and scene({visible})
                                  (docs/AGENT-WORLD-API.md)
  atmosphere.js  Atmosphere     applyRaceSettings — time-of-day/weather scene state
  setup-ui.js    SetupUI        CAR SETUP screen
  menus.js       Menus          menu/select/pause DOM flows
  scrollfade.js  ScrollFade     "there is more below" edge fade + position indicator
                                  for every menu scroll region (self-initialising)
  menunav.js     MenuNav        desktop menu input (self-initialising): redirects a
                                  wheel/trackpad gesture that lands outside a pane
                                  into the open menu's nearest pane, and moves focus
                                  with the arrow keys / Home / End / PageUp / PageDown
  photomode.js   Photomode      photo mode
  tuner.js       TunerPanel     LIGHTING TUNER pause-menu panel
  cam-tuner.js   CamTunerPanel  CAMERA TUNER pause-menu panel
  steer-tuning.js  SteerTuning  ADVANCED STEERING panel

css/                            tokens.css (design tokens) + components/menus/hud/
                                  overlays/carsetup/data/tuner/track-detail/responsive
index.html                      shell — script tags, DOM structure, cache-bust version
tools/manifest.cjs              load-order single source of truth (script tags must match)
tests/*.spec.js                 Playwright specs (81) + tests/*.test.mjs unit suites (22)
docs/            developer docs (ARCHITECTURE.md, DEBUG-HOOKS.md, SCENERY-API.md, …)
```

---

## Critical conventions

- **Cache busting**: `index.html` uses `?v=N` on every asset URL (check `index.html` for the current N).
  **Always increment N when changing any JS or CSS file** — search `?v=` and replace
  all instances (`sed -i -E 's/\?v=[0-9]+/?v=N/g' index.html`). **Also bump
  `version.json` `{ "build": N }` to the SAME N** — the shell version guard in
  `index.html` fetches it (no-store) and force-reloads a stale installed PWA when
  the deployed build is newer than the cached shell (index.html itself has no
  `?v=`, so this is the only thing that refreshes the HTML markup — e.g. a new
  pause-menu button).
- **No ES modules** — everything is `"use strict"` IIFE, assigns one global. No
  `import`/`export`.
- **Load order lives in `tools/manifest.cjs`** — the single source of truth,
  asserted against `index.html` by `tests/load-order.test.mjs` (run via
  `npm run test:tooling`). **New-file checklist:** (1) create the IIFE file in the
  right `js/<domain>/` dir; (2) add its `<script>` tag to `index.html` at the
  correct position; (3) add the matching entry to `tools/manifest.cjs` — the test
  catches any divergence; (4) bump `?v=N` + `version.json`. `HARD_EDGES` in the
  manifest records eval-time load dependencies (A must load before B because B
  reads A's global at eval time). `tools/verify-track.cjs` and the VM-based tests
  read the manifest's `TRACK_VM` list instead of hardcoding paths.
  `tools/extract-module.mjs` assists further game.js extractions.
- **`js/track/` = engine, `js/circuits/` = data.** Circuit defs (one per track)
  live in `js/circuits/<id>.js`; all shared spline/mesh/scenery code lives in
  `js/track/`. Circuit script-tag order == `Tracks.LIST` == picker/season order.
- **The `G` ctx façade**: extracted `js/game/*` modules never reach into game.js —
  game.js builds one `G` object of live getters/setters over its closure state
  plus stable helpers, and instantiates each module via `Module.create(G)`.
- **localStorage keys** are all prefixed `apex26.` (e.g. `apex26.team`,
  `apex26.parts.mercedes`).
- **Coordinates**: +Y up, distances in metres, angles in radians, arc position `s`
  in metres (0 → track.total), lateral `x` in metres (+right of centreline).

---

## Parts system (`js/car/parts.js`)

`Parts.CATALOG` — an **array** of 8 category objects (ordered, not keyed by id):
`engine`, `aero`, `suspension`, `brakes`, `tyres`, `ers`, `gearbox`, `fuel`. Each
category is `{ id, label, options:[…] }`; each option has
`{ id, label, cost, desc, speed?, accel?, cornering?, braking?, supplier? }`.
Budget = 600 cr. `Parts.getMods(setup, teamEngine)` returns
`{speed, accel, cornering, braking}` multipliers. Supplier-exclusive options
(e.g. `manu_mercedes`) are only shown when `team.engine` matches.
`unlimitedBudget` (localStorage `apex26.unlimitedBudget`) removes the 600 cr cap.

---

## Physics

Per-axle bicycle model. Key tuning variables in `game.js`: `WHEELBASE`,
`STEER_EXPO`, `STEER_MAX_SLIP`, `STEER_SPEED_REF`, `DRIFT`, `ROAD_FOLLOW`,
`PLAYER_GRIP`, `FRONT_GRIP`, `YAW_DAMP`, `YAW_INERTIA`, `PACE`. Modify via
`__apex.setPhysics(o)` for A/B tests.

**Combined-slip (friction ellipse)**: `LONG_GRIP = 34 m/s²` is the longitudinal
axis of the traction circle. Braking or accelerating consumes longitudinal grip;
`slipFactor = sqrt(1 − (axEstSm/LONG_GRIP)²)` scales lateral grip. Trail-braking
rotates the car; hard braking mid-corner understeers. Exposed via `physState()`
fields `axEstSm`, `axFrac`, `slipFactor`.

**The player is a world-space rigid body.** `px`/`pz`/`head` are the authority:
the car integrates its own position in world metres from tyre forces alone and
owes the road nothing. `(s, x)` is READ BACK off that position each frame by
`trackFrom()` — a predictor (distance along the road ÷ the Frenet stretch `h`,
see `frenetH`) plus two local Newton steps onto the perpendicular foot — purely
so the rest of the game can ask "where on the track is that?" (lap timing, walls,
kerbs, race position, HUD). The refinement is deliberately **local**: it never
leaves a few metres of last frame's `s`, so it cannot snap onto the wrong leg of
a hairpin the way a global `Tracks.project()` search does. That was the original
reason this code integrated in the road frame instead — keeping the search local
buys the road frame's robustness without surrendering the car's independence.

Only two things may move the player in road coordinates, because both are hard
constraints rather than suggestions: the **barrier clamp** (`xPinned`) and
**car-to-car collisions** (resolved in the `(prog, x)` plane). Both write back
into `px`/`pz`. Everything else flows world → `(s, x)`. Rebuilding the world
position from `(s, x)` unconditionally — as the code did when `(s, x)` was the
authority — silently puts the car back on the road's rails.

**Road-follow assist is OPT-IN and ships at 0.** `ROAD_FOLLOW` used to default to
0.7 with a DRIVING HELP slider that bottomed out at 0.25, so a quarter to a half
of every corner was steered for you and it could not be switched off (~20 % of
available lock at 50 m/s, ~40 % in a slow corner). Nothing steers the car by
default now except the driver; `helpFromSlider` runs `0 .. 0.70` with v1 = OFF,
and RELAX is the preset that opts back in. When enabled it steers toward the
curvature of the arc the car is actually on (`kPath = k/h`, not the centreline's),
**fades to zero off-track** (`offAssistFade`, over ~3 m of grass past the edge) so
the driver keeps full manual authority to recover, and fades under hard braking
(`brakeFade`) to kill the turn-in snap.

**Changing an assist DEFAULT does not reach existing players.** `store.get(k, d)`
returns the stored value whenever the key exists, so a new default only lands on a
fresh install — anyone who ever opened the settings keeps the old behaviour
forever. `drivingHelp` and `raceLine` are migrated once via `STEER_SCHEMA` in
`js/game/steer-tuning.js`; bump it if a slider's *meaning* changes again (an old
stored number does not carry over when the scale it was written against moves).

### The arc must not reach the driver

With the assists off, **nothing derived from the track's curvature or its racing
line may affect the player** — not just the forces. Auditing forces alone missed
several channels, each of which read as "the car is being pulled":

| channel | must come from |
|---|---|
| steering | driver input + tyre forces (assist only when opted in) |
| lap progress | the car's own world motion, via `trackFrom()` |
| rendered position | `px`/`pz` interpolated in **world** space, never lerped/damped `(s, x)` |
| drawn nose angle | the real heading `psi`, unclamped and unlagged |
| tyre squeal / marks / smoke | body **slip angle**, never `|k| * speed` |
| barrier alignment | the **barrier's** tangent (`wallAt` slope), not the centreline's |
| chase / cockpit / hood cameras | the car's world pose + heading |

Legitimate track reads are *surface* properties — grip, kerbs, banking, slope
gravity, crest/dip vertical load, road width, barrier position — plus AI-only
logic (racing line, corner braking, ERS) and the broadcast cameras.

When adding anything that reads `Tracks.curvature()`, ask which column it belongs
in. `grep -rn "Tracks.curvature\|kCur" js/game.js js/game/*.js` is the sweep;
every hit should be AI-only, assist-gated, broadcast-only, or surface.

---

## Lighting & sky (`js/render/glx.js` + `applyRaceSettings` in `js/game/atmosphere.js`)

Lit shader = directional sun (shadow map) + hemisphere ambient (`uAmbSky`/`uAmbGround`)
+ up to 32 point lights (uniform arrays, 15 floats per light). Composite: ACES tone-map + `colourGrade` + bloom +
lens flare + vignette. Night: ambient floored+capped, sun dimmed to moonlight,
floodlights on. Day: `_trackAtmoBias` per circuit. `buildTrackLights()` (in
`js/game/lighting.js`) places floodlights every ~22 m; `setFrameLights()` culls
to nearest CAP per frame (`LT.lampCull` def 28 with traffic, else 32 solo; shader max 32).

```js
__apex.lightState()           // { ambientSky, ambientGround, sunColor, numLights, … }
__apex.setTimeOfDay('night')  // 'dawn'|'day'|'dusk'|'night'|'default'
```

See `docs/LIGHTING-REF.md` for the light-record layout, shader uniforms, time-of-day branches, masts.

### Lighting tuner (`TUNE_DEFS` / `LT` in `js/game/lighting.js`)

The in-game **LIGHTING TUNER** (pause-menu page) exposes every hand-tuned
lighting/rendering value as a live slider. `TUNE_DEFS` is the registry and `LT`
the live values (both in `js/game/lighting.js`, global `LightTune`; the profile
store/resolution lives in game.js because it reads live track/tod/weather); the
driver reads `LT.<id>` each frame instead of a literal (shader-side ones upload
via `frame.tune`/`opts.tune` — `u:` field names the uniform). Values are stored
**per (track, time-of-day, weather) profile**. Resolution, lowest→highest
precedence: `TUNE_DEFS.def` → `LightPresets["*"]` → `LightPresets["track|tod|wx"]`
→ localStorage `"*"` → localStorage `"track|tod|wx"`. So `js/game/light-presets.js` is
the shipped baseline and a player's live edits (localStorage `apex26.lightTune`)
always win. Panel COPY VALUES exports the merged store as the paste-ready
`window.LightPresets = {…}` body to bake in. `__apex.lightTune(obj?)` gets/sets
the current profile. Add a knob: append to `TUNE_DEFS` (+ a shader uniform &
`frame.tune` upload if not a driver literal); the A/B harness catalog
(`tools/ab-lighting.mjs`) must point at its new home.

---

## City & scenery dressing (`buildProps` / `buildRoad` in the `js/track/` engine)

Procedural per-circuit dressing on top of each track's `scenery(api)` callback.
Session-time-aware (rebuilt on day↔night flip). Street/modern themes get the city
generator (`STYLES[def.id]`): building silhouettes, neon palettes, reflective glass
mesh (`track.meshes.glass`). All 24 tracks get furniture (`FURN`): trees and street
lamps (glow HDR at night). Street circuits get armco barrier liveries (`BARRIER`).
`buildRoad` tints tarmac/verge via a stable per-track hash.

See `docs/SCENERY-API.md` for the `scenery(api)` reference, building kinds, tables.

---

## Baked asset pack (`assets/pack/` + `js/render/assets.js` + `tools/assets.mjs`)

Optional PBR **material arrays**: one `TEXTURE_2D_ARRAY` whose **layer index is
the `MAT` id**, so any surface can be textured from the per-vertex material id it
already carries — **no UV channel** (the sample reuses the procedural materials'
own triplanar convention in `lit.js`) and no new vertex attribute.

- **Blended, not replaced.** `albedo * tex.rgb * 2.0`, so per-track tarmac tint,
  racing-line wear and per-vertex grain all survive.
- **Ships OFF.** `matTexMix` is a `TUNE_DEFS` knob with `def: 0`. A pack is inert
  weight until someone moves it (`__apex.matTex(1)`).
- **Every failure degrades to procedural** — no pack, malformed pack, or a
  backend with no `createTextureArray` (WGX/WebGPU, which has not ported the
  procedural material system either). Boot never awaits or fails on assets.
- **GLX and TLX implement it; WGX does not.** Feature-detected, never assumed.
- The committed pack is generated by our own tool from our own noise
  (`Apex26-Procedural`) — no third-party licence obligation. Real CC0 scans drop
  in through the same manifest. `tools/assets.mjs verify` enforces a licence
  allow-list, per-asset source traceability and an 8 MB budget.

See `docs/research/ASSET-API-RESEARCH.md`.

## `window.__apex` dev API  — see `docs/DEBUG-HOOKS.md` for the full reference.

```js
__apex.race("monza")          // load track, skip menus
__apex.park(0.1)              // stationary at 10% lap, frozen for screenshot
__apex.snapCam()              // REQUIRED after park()/jump() before a shot: the camera
                              //   eases toward its rig target, so without this you
                              //   photograph a camera still flying to the car
__apex.jump(0.5, 60, 0)       // teleport to 50% lap at 60 m/s
__apex.go()                   // start race, grid intact
__apex.finishRace()           // trigger results screen
__apex.freeze(bool?)          // get/set physics-frozen state
__apex.hud(show?)             // toggle HUD visibility
__apex.weather("wet"|"dry")   // live weather change
__apex.setTimeOfDay("night")  // live dawn|day|dusk|night|default — no asset reload (rebuilds only on day↔dark flip)
__apex.resetPlayer()          // force immediate rescue
__apex.carAt(idx?)            // detailed telemetry for one car
__apex.tracks()               // list all circuit ids
__apex.teams()                // list all teams + engine suppliers
__apex.camera("cockpit")      // switch camera mode (clears any view() free-cam)
__apex.camTune("chase", {height:0.6, dist:2})  // CAMERA TUNER: per-mode framing offsets
                              //   (height/dist/side/pitch/yaw/fov, 0 = shipped framing);
                              //   no args lists them, null resets that mode
__apex.view({ s:0.3, side:"L" }) // free debug camera (camera()/snapCam() clear it)
__apex.eyeAt(0.116, 0, 2.5)   // track-relative free-cam: eye at frac/lat/height, look ahead
__apex.orbit(0.116, 45, 15, 35) // orbit a track point (az,el,dist) — inspect from all sides
__apex.carOrbit(0, 40, 10, 4)  // orbit a CAR (idx, az, el, dist) — az 0 = behind, 180 = head-on
__apex.studio({intensity:3})  // studio light rig around the player car (false = off)
__apex.groundY(0.11, 12)      // rendered terrain height + road height + gap at frac/lat (gap finder)
__apex.viewState()            // combined scene/camera snapshot
__apex.camState()             // active camera {eye,tgt,fov,debug} (debug=true under a view() override)
__apex.lightState()           // lighting snapshot: ambientSky/Ground, sunColor, exposure, numLights
__apex.gpuTimer(on?)          // GPU frame timer {supported,on,ms} — Chrome/Android only (no iOS Safari/SwiftShader); GPU-side counterpart to perf-profile
__apex.assets()               // baked-pack state {supported,pack,uploaded,tier,layers,scales,…}
__apex.assetLoad(tier?)       // (re)load the material arrays ("low"|"high"); false = unload
__apex.matTex(0..1)           // BAKED MATERIALS blend — the A/B knob for the pack (ships at 0)
__apex.credits()              // attribution roll for every baked asset
__apex.setPhysics({pace:0.8}) // override physics params
__apex.probe()                // player telemetry (x, angle, k, hw, speed, s)
__apex.physState()            // full state (slip, wrongWay, lap, rescueT)
__apex.cars()                 // all car telemetry sorted by prog
__apex.scan([10,30,60])       // look-ahead curvature/width at distances
__apex.corners()              // apex fractions for the loaded track
__apex.wallStats()            // barrier geometry audit
__apex.setInput({steer:1,throttle:true}) // override input
__apex.step(1/60, 10)         // pump physics deterministically
__apex.clearInput()
__apex.tiltSim.step(deg, dt)  // tilt pipeline emulation (for autopilot harness)
// ── Timing & field ──
__apex.timing()               // compact race clock: raceT, lapTime, best, lap, pos, energy, gear, sector
__apex.sectorState()          // live S1/S2/S3 splits: {idx, elapsed, bests[3], last[3]}
__apex.lapHistory()           // completed lap times — full array in TT, best/lastLap in race
__apex.fieldState()           // full grid sorted by race position with gap (m)
__apex.aiPlace(idx,frac,v?,x?) // teleport any AI car (by cars[] index) to a track position
__apex.setEnergy(v)           // set player ERS charge 0–1 (clamped)
__apex.setLap(n)              // override player lap counter (for results-screen tests)
__apex.trackProfile(n?)       // [{frac,y,k,hw,slope}] — elevation/curvature profile (default 100 pts)
// ── Headless / RL control loop ──
__apex.headless(true)         // skip render() — physics runs uncapped
__apex.obs()                  // full debug observation (pos, slip, clearances, scan, reward, gear)
__apex.act({steer,throttle,brake}, dt, n) // set input + step n ticks → obs (1 round-trip)
__apex.reset(frac, speed, x)  // fast episode reset without reloading assets → obs
// ── Agent world view (js/game/agentview.js) — never returns null; failures are
//    {ok:false, error, message, fix}. Two exceptions to know: scene() on a
//    street circuit whose props are still building returns a SUCCESSFUL empty
//    list (not an error), and visible()/render({what:"view"}) reuse the last
//    RENDERED frame — stage and let frames draw before trusting either.
//    seed() below lives in apex.js, not agentview.js, and just returns a
//    number. See docs/AGENT-WORLD-API.md ──
__apex.agentHelp()            // manifest of this surface (~5.7 KB, ~1.4k tokens —
                              //   read it ONCE per session, never per tick)
__apex.objective()            // what the GAME is: win condition, trade-offs,
                              //   constraints. Static; does NOT describe car
                              //   dynamics (learn those from rollout()/act())
__apex.seed(42)               // get/set the SIM seed; same seed + same inputs
                              //   => same result. reset(f,v,x,seed) does both.
                              //   Cosmetic randomness stays unseeded by design.
__apex.world({detail:"brief"})// egocentric snapshot; brief|drive|full; since= → delta
__apex.trackInfo({what:"corners"}) // STATIC per-track: corners/sectors/profile
__apex.scene({radius:120})    // NAMED scenery nearby (trees, buildings, stands…)
__apex.field({detail:"brief"})// THE GRID — race order, gap-to-leader, interval
__apex.atmosphere()           // the light as text — day/night, sun/moon, fog, wet
__apex.describe("prop:12")    // EVERYTHING about one entity — also corner:T3,
                              //   car:4, span:2; ids come back from scene()/
                              //   query()/trackInfo()/field()
__apex.query({kind:"pine", near:150})  // a BOUNDED slice; returns prototype +
                              //   instances so repeated dressing costs one shape
                              //   plus a position each. Narrow, don't raise limit
__apex.render({what:"view"})  // the ONE raster — view|map|circuit|car. APPROXIMATE,
                              //   for intuition, not measurement. {cols,ss,camera}
                              //   (replaces frame()/plan()/worldModel()/visible(),
                              //   which remain as deprecated aliases)
__apex.carView({team:"ferrari", detail:"render"}) // the car as JSON + edge+shade
                              //   text elevations (side/top/front) from the real
                              //   mesh; detail:"parts" = per-part measured boxes
__apex.survey({stations:24})  // geometry DEFECTS: floating/buried props, props
                              //   over the racing line, terrain through the road,
                              //   holes and cliffs in the ground ribbon. ALWAYS
                              //   scans the whole lap — `stations` is a sample
                              //   COUNT, not a position; it cannot be aimed
__apex.rollout({seconds:5, policy})  // drive an interval → digest, not frames
__apex.terminal()             // {done, reason} — finished|wrong_way|rescued
```

Corner data in `world().nextCorner` / `trackInfo({what:"corners"})` is smoothed
over a 30 m window with radius taken from heading swept across the corner —
`Tracks.curvature`'s 12 m window is right for physics but reads centreline zigzag
as a hairpin. Curated `CircuitMarkings` apexes are snapped onto the real
curvature peak and overlapping results merged (`T9-T10`).

`node tools/agent.mjs <track> <world|track|scene|visible|rollout|help> [flags]`
is the same surface from a shell, with the staging (race/go/jump + let frames
render) done correctly.

**Note:** `obs()` / `physState()` require `player.px` initialised (`jump()` or one
tick). After `race()` + `go()`, call `jump(frac, speed)` or `step(1/60, 1)` first.

---

## Testing

81 Playwright specs + 22 `node --test` unit suites. Run groups with `npm run test:<group>` (see Key
commands). Assert behaviour and geometry via `__apex` hooks — not brittle rendering
magnitudes. Use `obs()`/`act()`/`reset()` for physics, `groundY()` for terrain
geometry, `eyeAt()`/`orbit()` for camera framing. Viewport: `hasTouch: true` for
`#pm-steer`/`#pm-calib` tests; landscape `{width:844, height:390}` for in-race.

See `docs/TESTING.md` for spec coverage table, fixture docs, and philosophy.

---

## Steering modes

`steerMode`: `"tilt"` | `"buttons"` | `"touch"`. Set via `#pm-steer` in pause
menu. `autoThrottle()` returns true **only** in `"touch"` mode (hides the gas
pedal); `"buttons"` mode gets an explicit GAS control. Calibrate button
(`#pm-calib`) and the GEARS toggle (`#pm-gears`) are **disabled, not hidden**,
when unavailable — hiding them reflowed the settings grid so the next tap hit
the wrong button.

---

## Git branch

Active development branch: `claude/project-architecture-reorganize-7hv8ez`. Never push to main
without review.
