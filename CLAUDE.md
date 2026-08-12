# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks. Pure IIFE modules
loaded via `<script>` tags; static files, served from GitHub Pages. This file is
the working reference: commands, rules, the file map, and pointers. The deep
references live in `docs/` — start at `docs/README.md`.

---

## Key commands

```sh
npx serve -l 3456 .                   # run locally (or: python3 -m http.server 3456)
node tools/pick-tests.mjs             # which test groups does this change need?
node tools/test-bg.mjs <groups>       # run them in the background (see Testing)
npm run test:tooling-fast             # the ~15 s no-browser guard suite
node tools/verify-track.cjs <id>      # 2 s headless build check for track edits
node tools/assets.mjs verify          # asset-pack licence allow-list + md5 + budget
                                      # (bake-synthetic regenerates a SYNTHETIC pack —
                                      #  the committed one is baked from Poly Haven CC0)
tools/README.md                       # the index of all 60+ tools (test-asserted)
```

## Testing

**The reference is `docs/TESTING.md`** — every group, every spec, fixtures,
philosophy. `tests/unit/test-groups.test.mjs` fails if it and `package.json`
disagree. Concurrency and worktrees: `docs/PARALLEL-WORK.md`. The suite is
111 Playwright specs plus 74 `node --test` unit suites; the browser half is
SwiftShader-rendered and slow, which forces three rules:

**1. Run browser groups in the BACKGROUND — never block, never poll.**
A group is minutes to tens of minutes. Start it, arm a watcher, do other work:

```sh
node tools/test-bg.mjs smoke api      # returns immediately; logs in artifacts/logs/
node tools/test-bg.mjs --status --wait --stop
```

The watcher pattern (each stdout line becomes one notification):

```
Monitor: until grep -qE "= run (passed|failed|timedout|interrupted)" artifacts/logs/<g>.log
         do sleep 15; done; grep -E "= run " artifacts/logs/<g>.log | tail -1
```

Anchor on the reporter's terminal line `= run <status>` and NOTHING looser:
the 30 s heartbeat lines contain `N/M done, K failed`, so a pattern like
`[0-9]+ (passed|failed)` fires on the FIRST heartbeat (this file recommended
exactly that for weeks and every watcher built from it misfired). Match every
terminal status, not just `passed` — a success-only watcher is silent through
a crash, and silence looks like "still running". Watch the LOG, never the
process table (a watcher whose command line contains its own grep pattern
matches itself — `pgrep -cf "python3 -m http.server"` returned 1 for a box with
no server on it, and that 1 was the grep). Never `| tail` a live background run
— tail buffers to EOF and the file stays empty. Adding `|Error:` to the UNTIL
pattern makes the watcher fire on the first failing test's stack trace — useful
for early warning, but then re-arm it for the terminal line.

**A long queue needs three things the one-shot pattern above does not have.**
Measured over a 2026-08-07 run of seven groups, which a container restart killed
at the 80-minute mark:

- **`Monitor` caps at 30 minutes and `persistent: true` DOES NOT LIFT IT.**
  Tried twice; both lapsed silently, and a lapsed watcher looks exactly like a
  quiet one. Pair every Monitor with a `Bash run_in_background` waiter on the
  queue's own completion marker — that has no cap and is the backstop that
  actually survives.
- **Seed the seen-file when you arm it.** A de-duplicating watcher started
  against a log that already has content emits the ENTIRE backlog as its first
  event. Run the scan once into the seen-file before entering the loop.
- **Make the driver resumable, or an interruption costs everything before it.**
  A driver that walks a fixed list from the top re-runs banked groups after any
  restart — 86 minutes of `parts` + `modes` that were already in the logs. Skip
  a group whose log carries the terminal marker the driver itself writes AFTER
  the run returns. A group that started and died has no such marker and
  correctly re-runs from scratch: a killed Playwright run banks nothing, and
  resuming it mid-way would be trusting a partial result the same way a
  cancelled CI run tempts you to.

`artifacts/logs/queue-driver.sh` is the worked example of all three.

**2. Run the groups the change needs — not all of them.** Ask
`node tools/pick-tests.mjs [--staged|<paths>]`. Escalate: `npm run test:tiny`
after any edit → `test:tooling-fast` in the edit loop → the groups pick-tests
named. For a track/scenery edit run `node tools/verify-track.cjs <id>` FIRST.

**3. Respect the box: 4 cores, and one heavy group is its full capacity.**
`test-bg.mjs` enforces the cap; `--force` overrides it and is almost always a
mistake. A timeout (`Test timeout of 120000ms exceeded`, exit 143/144) on a
busy box is a measurement of the machine, not the code — re-run that spec ALONE
before believing it. Check `pgrep -cf pw-browsers` and `/proc/loadavg` (< 3)
before starting; orphans from a killed run keep eating the box invisibly
(`node tools/test-bg.mjs --stop`, then `pkill -9 -f 'tools/run-playwright';
pkill -9 -f pw-browsers` if anything is left). Before concluding "orphans",
check `ps -eo pid,etimes,args` for a LIVE `playwright test` — a second run you
forgot is indistinguishable from orphans by process count alone.

**ONE Playwright PROCESS at a time**, however many specs it covers. Local runs
set `reuseExistingServer`, so a second process attaches to the first's
`python3 -m http.server` rather than starting its own; kill either run and the
survivor's remaining tests all die `net::ERR_CONNECTION_REFUSED` (measured: 33
false failures in a row, all of which read like product bugs). To cover more at
once, hand every spec to ONE process and raise `APEX_WORKERS` — two processes
also just oversubscribe the four cores.

Three hard edges while a run is in flight:
- **Don't edit `js/` or `css/`** — the test server serves the working tree, so
  later specs load a mixed build. Use a worktree (`docs/PARALLEL-WORK.md`);
  `EnterWorktree` is sanctioned here without asking. Editing `docs/`, `tests/`
  (new files), `tools/` is safe.
- **Never bump `?v=N`/`version.json` mid-run** — the shell version guard
  force-reloads every open test page. Bump as the LAST edit before commit.
- **Don't hand a subagent a test run** — give it a flat prohibition ("report it
  unverified"), not a load threshold it will check once and outrun.

**A `waitForFunction` timeout DOES NOT BOUND THE WAIT on a rendering page.**
Playwright polls the predicate on `requestAnimationFrame` by default, and a page
running the game loop under SwiftShader starves that poll badly enough that the
declared timeout never gets to fire. MEASURED: `{ timeout: 3000 }` against a
never-true predicate ran **109,665 ms** on a parked Monza and died on the TEST
budget instead — 36x its declared bound. It overran on a menu page too. Only a
predicate that THROWS terminates promptly (11 ms), because the exception
propagates without polling — which is why an absent global fails fast and a
plain `false` does not. Pass `{ polling: 100, timeout: N }` for any wait on a
page that is rendering. Most of the suite's `waitForFunction` bounds are still
decorative — a condition that never becomes true burns the whole test budget and
reports `Test timeout of Nms exceeded` from a line that claims to wait 30 s
(`tlx-probes`' M6 skid was the worked example — 344 s inside a 30 s wait). The
`polling` fix is in active, ratcheted adoption; `docs/TESTING.md` owns the live
count of fixed-vs-decorative sites (`tests/unit/wait-polling.test.mjs` guards it,
so the number lives there, not here). Reasoning of the form "this test's explicit
waits total N seconds, so the time must be elsewhere" is UNSOUND until the call
sites carry `polling`.

And once they are fixed, a wait that still overruns is telling you the CONDITION
is unreachable, not that the page is slow. M6 skid took four wrong mechanisms
before anyone asked whether `skidVerts` could ever move: `skids.stamp()` runs
inside `render()`, the stint was driven through `act()` (which never presents a
frame), and 120 steps of full lock crashed the car below both stamp gates
anyway. Both of that file's never-passing tests are green now — M9 env from
`polling` alone, M6 from being rewritten against what the code actually does.
The habit that settled it was reaching for an instrument
(`tests/manual/skid-probe.spec.js`) instead of a fifth theory.

Write tests against `__apex` hooks, not rendering magnitudes; prefer relative
assertions ("faster on tarmac than grass") over absolute thresholds. New-test
checklist and the two-project (headless/render) split: `docs/TESTING.md`.

## Logging (`js/log.js`, global `Log`)

Every diagnostic goes through `Log`, never bare `console.*`. First argument is
a NAMESPACE (`Log.NAMESPACES`: scenery, track, gfx, game, data, net, audio,
assets, apex). Two thresholds: console (default `warn`) decides what prints,
buffer (default `info`) decides what the 500-entry ring retains for
`__apex.logs()` after the fact. Guard hot-path debug lines with
`Log.enabled(ns, level)`. Set via `__apex.logLevel("scenery:debug")`,
`?log=<spec>`, `apex26.logLevel`, or `APEX_LOG=<spec>` for a test run.

## Output dirs

Regenerable output goes in two gitignored roots — never `/tmp`, never the repo
root: `artifacts/` (test results/reports/logs/galleries/tmp) and `scratch/`
(captures, renders, profiles). Golden baselines exist for the MENUS only
(`tests/specs/menu-baseline.spec.js-snapshots/`); `npm run test:visual` is skip-gated
until circuit baselines are ever generated.

---

## File layout

**`js/track/` is the ENGINE** (spline, mesh, scenery placement — shared code);
**`js/circuits/` is the DATA** (one def file per circuit; 40 circuit data files,
24 season rounds then 16 retired classics; script-tag order == `Tracks.LIST` ==
picker/season order). `tools/manifest.cjs` is the single source of truth for
load order (see Conventions).

```
js/log.js        Log            levelled, namespaced logging + retained ring buffer.
                                  Loads FIRST — everything below may log at eval time
js/mat4.js       M4, V3         matrix math
js/game.js       (main)         entry — game loop, physics, AI, race logic; owns the
                                  closure state and hands the G ctx façade to js/game/*

js/render/       — renderers —
  gfx.js         Gfx            renderer façade — selects GLX (WebGL2, default),
                                  TLX (three.js) or WGX (WebGPU); one shared surface
  glx.js + glx/  GLX, GLXPost, GLXShadow, GLXChunked   WebGL2 core + post/shadow/
                                  chunked passes wired via the GLXCore ctx
  shaders/       GLXChunks, GLXShaders   GLSL sources as pure data; loads before glx.js
  gltf.js        GLTF           binary .glb loader → plain {pos,nrm,col,idx}
  assets.js      Assets         baked asset-pack loader (assets/pack); every failure
                                  falls back to the procedural look
  webgpu/        WGX            WebGPU backend — DEFERRED (no script tag), frozen,
                                  not at GLX parity (no volumetrics/MSAA/gpuTimer/
                                  createTextureArray)
  three/         TLX            three.js r184/TSL backend — DEFERRED, opt-in via
                                  localStorage apex26.gfxBackend="three"; installed by
                                  descriptor-copy onto GLX. Vendored three in
                                  vendor/three-0.184.0

js/track/        — track ENGINE (shared code) —
  tracks.js      Tracks         engine shell: spline resolve, build orchestration
  spline.js      TrackSpline    Catmull-Rom sampling / curvature
  mesh.js        TrackMesh      road/terrain mesh extrusion
  geom.js        TrackGeom      pure geometry emitters + MAT ids
  graph.js       TrackGraph     scenery model library + node graph; migrations gated
                                  by tools/graph-parity.cjs (vertex-for-vertex diff)
  space.js       TrackSpace     world↔track (Frenet) projection
  surface.js     TrackSurface   road surface build / tarmac-verge tinting
  markings.js    CircuitMarkings  curated FIA sector splits + turn apexes
  models.js      TrackModels    composite prop models
  themes.js      SceneryThemes  city-generator theme tables
  landmark-kit.js, circuit-kit.js   landmark/circuit composite kits
  geo-paths.js   CircuitPaths   OSM circuit centrelines
  maps.js        TrackMaps      offline 2D picker outlines
  scenery-data.js  TrackSceneryData  static buildProps tables — data only
  scenery-nature.js / scenery-city.js / scenery-structures.js / scenery-identity.js
                 Scenery*.create(ctx)  the buildProps split; together they serve the
                                  109-member scenery(api) contract frozen by
                                  tests/unit/scenery-api-contract.test.mjs (docs/SCENERY-API.md)

js/circuits/     — circuit DATA — one file per circuit, registers on Tracks.LIST

js/car/          — car —
  car3d.js       Car3D          procedural F1 car geometry
  liveries.js    Liveries       paint jobs (+ finish gloss|satin|chrome; shark-fin
                                  fin/finArt slots)
  liverytex.js   LiveryTex      canvas-2D livery texture atlas
  parts.js       Parts          upgrade catalog — 12 categories, 600 cr budget
                                  (docs/PARTS.md binds ersProfile/aeroLoad)
  ghost.js       Ghost          time-trial ghost record/replay data layer
  teams.js       Teams          2026 grid (11 teams, 22 drivers)
  driver-ratings.js  DriverRatings  five-axis AI skill table, keyed by driver CODE

js/data/         — data hub (docs: see js/data/hub.js header) —
  api.js         F1API          Jolpica + OpenF1 clients, localStorage cache
  hub.js         DataHub        hub DOM overlay shell + shared session plumbing
  telemetry.js   DataTelemetry  TELEMETRY tab (traces/map/playback, N-lane compare)
  export.js      DataExport     EXPORT dev tool (GPS traces → ZIP)
  schedule.js / standings.js / lastrace.js / live.js   the other tabs

js/net/          — multiplayer wire (2-4 players, WebRTC, no backend) —
                 docs/MULTIPLAYER.md is the reference. transport.js NetTransport,
                 sdp.js NetSdp, nostr.js NetNostr, rendezvous.js NetRendezvous,
                 qr.js NetQr, scan.js NetScan, handshake.js NetHandshake,
                 snapshot.js NetSnapshot (13 B/car; extrapolates ALONG s),
                 session.js NetSession, netplay.js NetPlay (each peer owns its
                 own car; host owns AI + race control), lobby.js NetLobby

js/game/         — game modules, each Module.create(G) with the G ctx façade —
  physics-consts.js  PhysicsConsts  the driving model's immutable numbers with
                                  their tuning rationale; game.js destructures it
                                  once. Tunable values stay `let`s in game.js
  tables.js      GameTables     static game data (CAM_MODES, DIFF, gears, paints)
  lighting.js    LightTune      TUNE_DEFS registry, live LT values, track lights
  light-store.js LightStore     lighting PROFILE STORE — per (track, tod, weather)
                                  five-layer resolution + persistence
  light-presets.js  LightPresets  shipped lighting-tuner values ("track|tod|wx")
  carmesh.js     CarMesh        car decal/effect/cockpit-instrument geometry
  particles.js   Particles      transient particle pool + rain overlay
  bodyattitude.js  BodyAttitude chassis pitch/squat/roll read — visual only
  debrisworld.js   DebrisWorld  Rapier side-world; NEVER moves a game car
  incidentsim.js   IncidentSim  bounded incident window that MAY move a car
  agentview-raster.js  AgentRaster  character-grid rasters behind __apex.render
  agentview.js   AgentView      agent-facing JSON world view (docs/AGENT-WORLD-API.md)
  apex.js        ApexApi        the whole window.__apex dev API
  ariastate.js   AriaState      mirrors option-group selection onto aria-pressed
  sheetshape.js  SheetShape     self-init: writes data-shape/data-pair per .sheet.
                                  ITS CONSUMER IS CSS — not orphaned
  topmodal.js    TopModal       self-init: top-layer ladder over the <dialog> screens
  uilayers.js    UiLayers       THE LAYER STACK — the one answer to "which screen is
                                  on top"; Escape is "back" via data-esc-close
  music-lib.js   MusicLib       bring-your-own-music library (IndexedDB)
  spotify.js     SpotifyMusic   optional Spotify Premium soundtrack
  audio-panel.js AudioPanel     MUSIC & SOUND panel — mixer screen, ♪ master
                                  button, audio-settings persistence
  input.js       Input          keyboard / gamepad / touch / tilt
  audio.js       GameAudio      WebAudio synth: engine, sfx, music
  store.js       GameStore      localStorage persistence
  perf.js        PerfGov        adaptive performance governor
  cameras.js     GameCams       the 13 player camera modes + debug free-cam
  cam-modes.js   CamModes       the CAM button / picker-grid / C-key mode switch
                                  UI (broadcast-only; mutates camMode via G)
  cam-tune.js    CamTune        CAMERA TUNER data: per-mode framing values + apply()
  cam-tuner.js   CamTunerPanel  CAMERA TUNER pause-menu panel (the UI for cam-tune)
  hud.js         GameHud        in-race DOM HUD
  results.js     GameResults    results / season-end screens
  atmosphere.js  Atmosphere     applyRaceSettings — time-of-day/weather scene state
  setup-ui.js    SetupUI        GARAGE screen — team/driver, 12 categories, livery
  career.js      Career         CAREER rules core (saves, economy, contracts, R&D);
                                  pure rules, no DOM; gameplay accessors gated on
                                  inCareer(). docs/CAREER.md
  career-ui.js   CareerUI       the CAREER screen — setup + season hub
  quali.js       Quali          one-lap qualifying; the field is MODELLED on the
                                  same constants the driving model uses
  reliability.js Reliability    DNFs — risk derived from tier/parts, drawn once at
                                  the green light; ships OFF behind a race setting
  menus.js       Menus          menu/select/pause DOM flows
  scrollfade.js  ScrollFade     scroll-edge fade + position indicator (self-init)
  menunav.js     MenuNav        desktop menu wheel/arrow-key navigation (self-init)
  photomode.js   Photomode      photo mode — the tuner panels' free camera
  aerozones.js   AeroZones      ACTIVE AERO activation zones — pure circuit geometry
  racecontrol.js RaceControl    caution flag machine — READ-ONLY w.r.t. the cars;
                                  the HOST owns it in multiplayer
  skidmarks.js   SkidMarks      tyre-mark ring buffer, batched draw
  tuner.js       TunerPanel     LIGHTING TUNER pause-menu panel
  steer-tuning.js  SteerTuning  ADVANCED STEERING panel (STEER_SCHEMA versioning)

css/             tokens.css + components/menus/hud/overlays/carsetup/data/tuner/
                 track-detail/career/responsive (docs/COMPONENTS.md is test-asserted)
index.html       shell — script tags, all static DOM, cache-bust version
sw.js            service worker — precache derived from the shell's own tags
tools/           see tools/README.md (bidirectionally test-asserted index)
tests/           111 Playwright specs + 74 `node --test` unit suites (docs/TESTING.md)
docs/            the reference library — docs/README.md is the index
.claude/         skills/ (task recipes, .claude/skills/README.md) and
                 workflows/ (multi-agent orchestration scripts, README there)
spike/           concluded renderer/physics evaluations (kept as provenance)
worker/          optional Cloudflare rendezvous relay (worker/README.md)
```

## Critical conventions

- **Cache busting**: every asset URL in `index.html` carries `?v=N`. After ANY
  js/css change: bump every instance to max+1 AND set `version.json` to the
  same N (`.claude/skills/bump-cache` has the exact steps). Last edit before
  commit, never mid-test-run.
- **No ES modules** — every file is a `"use strict"` IIFE assigning one global.
  The single exception is the vendored three.js island used by the deferred TLX
  backend.
- **Load order lives in `tools/manifest.cjs`** — asserted against `index.html`
  by `tests/unit/load-order.test.mjs`. New-file checklist: (1) IIFE file in the
  right `js/<domain>/`; (2) `<script>` tag at the matching position;
  (3) manifest entry (+ a `HARD_EDGES` pair if something destructures its
  global at eval time); (4) name it in this file's layout; (5) bump `?v=N` +
  `version.json`. DEFERRED backends (webgpu/, three/) have no script tag and
  are injected at boot; `DEFERRED`, `BACKEND_FILES` in game.js and the sw.js
  precache seed must agree (all three asserted).
- **`js/track/` = engine, `js/circuits/` = data.** A circuit edit goes in
  `js/circuits/<id>.js`; engine/placement changes go in `js/track/`.
- **The `G` ctx façade**: extracted `js/game/*` modules never reach into
  game.js — it builds one `G` object of live getters/setters and instantiates
  each module via `Module.create(G)`. `tests/unit/module-size.test.mjs` ratchets
  game.js's size; lower the ceiling when you extract.
- **Naming in `js/game/`**: new multi-word files are hyphenated
  (`light-store.js`); the older squashed names (`debrisworld.js`) are
  grandfathered — do not churn them. Disambiguation for the look-alike
  clusters: `cam-tune` = data, `cam-tuner` = its panel, `tuner` = the lighting
  panel; `lighting` = registry/records, `light-store` = persistence/resolution,
  `light-presets` = shipped values.
- **localStorage keys** are all prefixed `apex26.`.
- **Coordinates**: +Y up, metres, radians, arc position `s` in metres
  (0 → track.total), lateral `x` metres (+right of centreline). Curvature
  sign: **+k = LEFT-hand turn** (measured — the corner-table note in
  js/game/agentview.js is the proof). The opposite label shipped for months
  and put three broadcast cameras on the inside of every corner; when code
  reads `sign(k)`, check it against that note, not against a comment.

## Physics

**Full reference: `docs/PHYSICS.md`.** Two rules bind code all over the repo:

- **`PACE` is a ground-speed scale, not a cap.** Anything that divides a speed
  by `VMAX` or compares one against a literal must use `vTop()` / `vStd()`
  (accelerations: `aStd()`). Enforced by `tools/vstd-lint.mjs` +
  `tests/unit/vstd-invariant.test.mjs` — a bare literal needs a written reason.
- **The arc must not reach the driver.** With assists off, nothing derived
  from track curvature or the racing line may affect the player — steering,
  lap progress, rendered position, nose angle, squeal, barrier alignment all
  have defined legitimate sources (the table in docs/PHYSICS.md). When adding
  a `Tracks.curvature()` read, decide which column it belongs in: AI-only,
  assist-gated, broadcast-only, or surface.

Read `c.aeroX` (or `aeroDfMult(c)`), never `c.xOn`. Overtake inherits DRS-like
restrictions; active aero only works inside a zone. Immutable model numbers
live in `js/game/physics-consts.js`; tunables stay `let`s in game.js.

## Lighting & sky

References: `docs/LIGHTING-REF.md`, `docs/LIGHTING-KNOBS.md`,
`docs/LIGHTING-PRESETS.md`. `TUNE_DEFS` (js/game/lighting.js) is the slider
registry and `LT` the live values; profiles resolve per (track, time-of-day,
weather) lowest→highest across defaults → shipped presets → player edits
(js/game/light-store.js). The tuner's COPY ALL row spreads the condition on
screen to every other circuit at the same time+weather (`copyToTracks`,
`__apex.lightCopy()`). `.claude/skills/bake-lighting` lands a COPY VALUES export.

## Baked asset pack (`assets/pack/`)

PBR material arrays: one `TEXTURE_2D_ARRAY` whose layer index IS the `MAT` id —
no UV channel. Blended, not replaced (`albedo * tex.rgb * 2.0`), so per-track
tint and racing-line wear survive. **Ships ON.** (`matTexMix` def 1.0;
`__apex.matTex(0)` is the A/B off-switch.) Every failure degrades to the
procedural look; boot never awaits assets. GLX and TLX implement it; WGX does
not. `tools/assets.mjs verify` enforces licence allow-list + 8 MB budget.

## `window.__apex` dev API

~180 hooks; `docs/DEBUG-HOOKS.md` is the full reference and
`tests/unit/hooks-documented.test.mjs` keeps it honest. `__apex.agentHelp()` is the
machine-readable manifest — read it once per session. The short list:

```js
__apex.race("monza"); __apex.go(); __apex.jump(0.5, 60, 0)
__apex.park(0.1); __apex.snapCam()   // snapCam REQUIRED after park()/jump() before a shot
__apex.info(); __apex.timing(); __apex.probe(); __apex.physState(); __apex.cars()
__apex.setInput({steer:1,throttle:true}); __apex.step(1/60, 10); __apex.seed(42)
__apex.headless(true); __apex.obs(); __apex.act({steer,throttle}, dt, n)
__apex.world({detail:"brief"}); __apex.scene({radius:120}); __apex.field()
__apex.render({what:"view"})         // the ONE raster: view|map|circuit|car
__apex.camera("cockpit"); __apex.view({s:0.3}); __apex.orbit(f, az, el, dist)
__apex.weather("wet"); __apex.setTimeOfDay("night"); __apex.lightTune(obj?)
__apex.aero(true); __apex.caution(); __apex.career(); __apex.qualiSim()
__apex.logs({ns:"scenery"}); __apex.logLevel("scenery:debug")
```

Sharp edges: `obs()`/`physState()` need `player.px` initialised (call `jump()`
or `step()` after `race()`+`go()`); agentview calls never return null —
failures are `{ok:false, error, message, fix}`; `render({what:"view"})` reuses
the LAST RENDERED frame and is stale under `headless(true)`.
`node tools/agent.mjs <track> <cmd>` is the same surface from a shell.

## Git branch & deploy

Work happens on a `claude/<topic>` feature branch — `git branch --show-current`
is the truth, prose is not. Never push to the deploy branch without review.
**The deploy branch is `claude/f1-game-project-26h3ng`**:
`.github/workflows/pages.yml` fires only there, gated by ci.yml, and ships the
runtime subset to https://brycejmurrin.github.io/f1-game/.
