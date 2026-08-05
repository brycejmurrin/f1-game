# Testing reference

102 root Playwright spec files (`tests/*.spec.js`) + 38 `node --test` unit suites
(`tests/*.test.mjs`, plus one `.test.cjs`). Everything under `tests/manual/` is
**excluded from default discovery** (`testIgnore: ["**/manual/**"]` in
`playwright.config.js`) and is run by explicit path — see
[`tests/manual/README.md`](../tests/manual/README.md).

The suite covers physics, behaviour, geometry, cameras, UI, parts, steering,
lighting, scenery, gamepad, timing/field hooks, multiplayer, career, the agent
world view, headless RL, and the tooling contracts that keep the load order and
the docs honest.

---

## 1. How to run tests

### Run them in the background. Always.

A foreground Playwright run on this suite blocks the terminal for minutes and
prints nothing you can act on. The default reporter is `tests/live-reporter.js`:
one timestamped, immediately-flushed line per test start and end, plus a
30-second heartbeat naming everything still in flight — so a piped log is
genuinely tail-able and a hung test is the one with a `> start` line and no end
line.

```sh
node tools/test-bg.mjs smoke api collision   # start; returns immediately
tail -f artifacts/logs/smoke.log             # watch one
node tools/test-bg.mjs --status              # what is running / how it ended
node tools/test-bg.mjs --wait                # block until all groups finish
node tools/test-bg.mjs --stop                # kill everything still running
```

Each group gets its own free port, its own `artifacts/report-<port>/` and its
own log, so groups cannot tear down each other's web server and a stall is
attributable to one log rather than to "the run". `WORKERS=2` per group is the
default; every worker is a Chromium + SwiftShader process, so total browsers is
groups × workers and 2-3 groups is the sweet spot on a small box.

`tools/test-shards.sh` does the same fan-out but WAITS for the result — use it
in CI or when you genuinely want to block.

### Run the groups your change needs, not all of them

The whole suite is roughly 40 minutes of software rendering. Which groups a
change needs is mechanical, so ask:

```sh
node tools/pick-tests.mjs                 # vs the branch point + working tree
node tools/pick-tests.mjs --staged
node tools/pick-tests.mjs js/car/parts.js # explicit paths
node tools/pick-tests.mjs --bg            # ready-to-paste background command
```

The routing rules live in `RULES` at the top of `tools/pick-tests.mjs` and are
deliberately coarse and biased toward running too much — a rule that is too
narrow is a missed regression, one that is too wide costs minutes.
`tests/test-groups.test.mjs` asserts every group they name exists.

### Start here, then widen

| When | Run |
|---|---|
| after any edit | `npm run test:tiny` — page loads, `__apex` responds. If this is red nothing else is worth running |
| in the edit loop | `npm run test:tooling-fast` (~4 s, structural) then the groups `pick-tests` named |
| before pushing | those groups + `npm run test:sweeps` if you touched geometry |
| single spec | `npm test -- tests/<file>.spec.js` |
| single unit suite | `node --test tests/<file>.test.mjs` |

### Turning diagnostics up

Levels come from `js/log.js`. `APEX_LOG` is written to `localStorage` before any
game script evaluates, so a spec needs no change to become verbose:

```sh
APEX_LOG=scenery:debug npm test -- tests/props-over-road.spec.js
APEX_LOG=debug node tools/test-bg.mjs scenery
```

Every failure automatically attaches three things (see `tests/fixtures.js`), and
`live-reporter.js` echoes the tail of each inline:

| Attachment | What it holds |
|---|---|
| `apex-state` | `physState` + `probe` + `timing` + `lightState` + `info` — why the car was where it was |
| `apex-logs` | the `Log` ring buffer: retained diagnostics down to `info`, **including ones never printed** |
| `page-console` | what the page actually said, in order, favicon noise stripped |

---

## 2. Test groups

Run with `npm run test:<group>`. Every group below names an intentional set of
specs; `npm run test:audit` fails if any test file belongs to none of them, and
`tests/test-groups.test.mjs` fails if this table and `package.json` disagree.

### Start-here / breadth

| Group | What it runs |
|---|---|
| `tiny` | page loads, `__apex` present, dev hooks respond. The first thing to run and the first thing to fix |
| `fast` | curated fast subset: smoke + api + collision + offtrack + parts-physics + steering |
| `audit` | coverage guard — every test file must belong to ≥1 topical group (`tools/test-coverage-audit.mjs`) |
| `pick` | print the groups a change needs (`tools/pick-tests.mjs`) — not a test run |
| `bg` | start groups in the background (`tools/test-bg.mjs`) — not a test run |

### Physics & behaviour

| Group | What it runs |
|---|---|
| `physics` | per-circuit foundation specs + world-physics, longitudinal, elevation, projection, active aero |
| `collision` | car-to-car and wall collision, drift, off-track |
| `behaviour` | `collision` plus world-physics, physics-fixes, active-aero, aero-zones |
| `barriers` | track wall geometry + the AI-fixes barrier regressions |
| `debris` | the Rapier debris side-world |
| `steering` | presets, sliders, steering modes, gamepad |

### Track & scenery

| Group | What it runs |
|---|---|
| `circuit` | walls + autopilot + elevation + the codebase-audit edge cases |
| `scenery` | props/terrain over road, F1 track accuracy, scenery kits |
| `sweeps` | the full-fleet geometry audits — prop-clipping, road-under-floor, coplanar-faces, and the shared-foundation characterization. Each rebuilds all 40 circuits; `coplanar-faces` is the z-fighting ratchet that `clip-audit` structurally cannot see. Runs `--test-concurrency=1` **on purpose** — see below |
| `map` | minimap polyline + orientation |

### Render

| Group | What it runs |
|---|---|
| `webgl` | instanced draw, GL capability probes, lighting A/B, image grade |
| `ab` | the lighting A/B pixel comparison alone |
| `visual` | per-circuit pixel-diff regression (slow) |
| `baseline` | six blessed pixel baselines for menu IDENTITY — colour, type, spacing (fast) |
| `shimmer` | does baked tarmac crawl under motion |
| `tlx` | the three.js/TSL backend probes |
| `webgpu-lifecycle` | WGX resource lifecycle, as a pure unit suite |

### Car & UI

| Group | What it runs |
|---|---|
| `parts` | catalog, budget, persistence, recipes, factory presets, mesh caches, liveries, ERS, the car viewer, garage aero |
| `ui` | UI screenshots: audit, button/touch, desktop, HUD layout + audit, menu survey + keyboard (slow) |
| `camera` | the 13 camera modes, camera + driving hooks, the camera tuner |
| `audio` | WebAudio engine/sfx smoke + the music library |

### Modes, data & multiplayer

| Group | What it runs |
|---|---|
| `modes` | season, time trial, career, qualifying |
| `career` | career + qualifying alone: the mode axes, the save, the hub, the grid |
| `net` | multiplayer in a browser: car roles, the per-car input seam, the session, the lobby, the waiting room, and the camera SCAN (a real `getUserMedia` against a Y4M of a real QR that Chromium plays as a webcam) |
| `net-unit` | the `js/net` wire as pure logic, no browser: loopback transport, invite codec, snapshot quantisation, clock sync. Under a second |
| `service-worker` | the SW's install/fetch/version behaviour |

### API & agent surfaces

| Group | What it runs |
|---|---|
| `api` | the `__apex` contract: dev-tools, headless, obs/act, new hooks, data lifecycle, telemetry compare, assets, logging |
| `hooks` | camera / driving / map / new `__apex` hook contracts |
| `agent` | the agent world view: world, trackInfo, scene, rollout, determinism, the drive bench |
| `agent-contract` | freezes the shape of the agent-view API |
| `smoke` | page load + `__apex` available |

### Tooling contracts (`node --test`, no browser)

| Group | What it runs |
|---|---|
| `tooling` | every Node contract suite, including the full-fleet sweeps. `--test-concurrency=1`, see below |
| `tooling-fast` | the structural half in ~4 s — load order, docs integrity, test groups, api contracts, css layer discipline, graph, validators. The two full-fleet audits dominate `tooling`; this is everything else, for the edit loop |
| `paths` | output paths are port-scoped and self-creating |
| `graph-parity` | builds each track from a baseline ref AND the working tree and diffs prop geometry vertex for vertex (`tools/graph-parity.cjs`) |
| `float` | floating-prop audit (`tools/float-audit.cjs`) |
| `clip` | prop-clipping gate (`tools/clip-audit.cjs`) |

### Partitions (not topical — they do not count for coverage)

| Group | What it runs |
|---|---|
| `headless` | the whole `headless` project (all non-render specs, no GPU) |
| `render` | the `render` project only (screenshots/pixel/GL) at `--workers=4` |
| `update` | the whole suite with `--update-snapshots` |

---

## 3. Infrastructure

### Two projects, not one

`playwright.config.js` splits the suite into a **`headless`** project
(physics/geometry/hook/data specs — no GPU, scales wide) and a **`render`**
project (screenshot/pixel-diff/GL/DOM-visibility specs, listed in
`RENDER_SPECS`, capped at `--workers=4` because SwiftShader renders on the CPU
and thrashes past ~4-6 concurrent renderers). The old single `chromium` project
is gone — filter with `--project=headless` or `--project=render`.

`RENDER_SPECS` is the partition: the headless project is "everything NOT in that
list", so a name in it that matches no file silently drops a GL spec into the
wide pool. `tests/test-groups.test.mjs` catches that.

### Server lifecycle

The npm wrapper (`tools/run-playwright.mjs`) starts an in-process static server
on a free ephemeral port, passes that port to Playwright, and closes it when the
child exits. Independent npm test commands therefore share neither a server nor
an output directory.

Direct `npx playwright test` defaults to port 3456 and lets Playwright start its
configured Python server. A direct local run may reuse an already-running
server; explicit `APEX_PORT` runs own their server unless `APEX_REUSE_SERVER=1`.
`tests/global-setup.js` pings the port before any spec begins, so a dead server
aborts the run with one clear message instead of dozens of
`net::ERR_CONNECTION_REFUSED`.

**Tests serve `js/` and `css/` straight from the working tree** — do not edit
source while a run is in flight, or its later specs load mixed versions.

### Why the sweeps run serially

`node --test` defaults to a concurrency of CPU-count, and every suite in
`test:sweeps` rebuilds all 40 circuits and holds their meshes. Four of those at
once reached 5.4 GB RSS and the kernel OOM-killed the run — which surfaces as a
`SIGKILL` with `exitCode: ~` and no assertion, i.e. it does not look like a test
failure at all. `--test-concurrency=1` on `test:sweeps` and `test:tooling` is
deliberate: these suites already saturate the machine one at a time, so
overlapping them buys nothing and costs the whole run.

Run several GROUPS concurrently instead (`tools/test-bg.mjs`) — those are
separate processes with separate ports, and the sizing guidance above applies.

### Output

| Path | Contents |
|---|---|
| `artifacts/report-<port>/` | HTML report |
| `artifacts/test-results-<port>/` | failures, traces, attachments, JUnit |
| `artifacts/galleries-<port>/<suite>/` | screenshots and suite-emitted reports |
| `artifacts/logs/` | background-run and shard logs |

All gitignored. Tracked golden baselines live in `tests/*-snapshots/` and stay
outside these roots.

### Fixtures (`tests/fixtures.js`)

Import `test` and `expect` from `./fixtures.js` instead of `@playwright/test`:

| Fixture | What it provides |
|---|---|
| `context` (auto) | injects `window.__TEST_MODE = true` and the `APEX_LOG` level; mocks all Jolpica + OpenF1 calls with stub JSON so runs are offline and deterministic; starts console capture on every page |
| `pageErrors` | `string[]` of uncaught JS exceptions — assert `toHaveLength(0)` after exercising game logic |
| `consoleLines` | `string[]` of every console line and page error, type-prefixed, favicon noise stripped. Prefer this to a hand-rolled `page.on("console", …)` — the hand-rolled ones drifted into a dozen slightly different filters |
| `racePage` | navigates to `/` and waits for `window.__apex` (10 s) |
| `loadTrack` | `loadTrack(id, tod, wx)` — the goto → wait → `race()` → wait built → `go()` block ~54 specs used to hand-roll, with unified timeouts |

`tools/fixture-consumer-audit.mjs` enforces the import for the specs that depend
on those guarantees (`audio-smoke`, `smoke`, `f1-track-accuracy`, `ui-audit`).
Other specs may use the base Playwright fixture.

---

## 4. Philosophy — debug-hooks first

Prefer assertions driven by the `window.__apex` API and geometric/mesh probes
over rendering- or timing-based heuristics.

**Assert behaviour and geometry, not brittle magnitudes.** A threshold like
"speed > 10 after 2 s" goes stale the moment physics is retuned. Prefer
relative/directional checks — "faster on tarmac than on grass", "heading barely
changes off-track with zero steer", "reverses then recovers to forward". The
off-track specs were tightened this way after several thresholds drifted stale.

**Use the deterministic hooks:**

- `obs()` / `act()` / `reset()` — headless control loop
- `seed()` — same seed + same inputs ⇒ same result
- `step()` + `physState()` / `probe()` — physics
- `groundY()` / `Tracks.terrainY()` — rendered-terrain raycast, exact geometry
- `modelDiagnostics()` / `geometryDiagnostics()` — required-model outcomes and finite mesh manifests
- `eyeAt()` / `orbit()` / `view()` — deterministic camera framing for screenshots

**Freeze the render loop before a screenshot, not just the physics.** `park()`/
`freeze()` stop physics; `frame()` in `js/game.js` keeps redrawing every rAF tick
regardless (sky/cloud animation continues on purpose). Under SwiftShader that
redraw never idles, so a `.screenshot()` issued while it is still running queues
behind an endless render loop instead of a quiet compositor — measured on
`tests/smoke.spec.js`'s rendering checks, `headless(true)` after the pose settles
cut solo wall time from 88-96s to 29-32s. `tests/track-helpers.js`'s visual-regression
capture already does this (`snapCam()` → settle → `headless(true)`); reach for the
same shape rather than raising a test's timeout budget.

**Read the log ring, not the console.** `__apex.logs({ns: "scenery"})` returns
structured records; scraping console text ties a spec to a message's exact
wording and misses anything below the print threshold.

**Legacy specs are coarser heuristics** and are inherently flakier:
`tests/manual/blank-scan.spec.js` (PNG byte-size thresholds — the geometric
`terrain-over-road.spec.js` is the modern successor for the terrain subclass)
and `tracks-visual.spec.js` (per-circuit pixel diff). Keep them; write new
checks against hooks and geometry.

**When a spec fails**, first check whether it is a stale expectation rather than
a regression — confirm by reading the actual hook values.

### Viewport rules

- Tests that touch `#pm-steer` / `#pm-calib` must use `hasTouch: true` — desktop
  mode adds `body.desktop`, which hides those elements.
- In-race tests must use LANDSCAPE `{width: 844, height: 390}` to avoid the
  `#rotate-device` overlay blocking interaction.

---

## 5. Coverage table

Every file below is asserted present in this table by
`tests/test-groups.test.mjs` — a new spec fails the tooling suite until it says
what it covers.

### Boot, API & agent surface

| Spec | What it covers |
|---|---|
| `smoke.spec.js` | page loads, `__apex` available, race starts, no WebGL error |
| `dev-tools.spec.js` | the `__apex` API contract (60+ tests) |
| `headless-api.spec.js` | the headless control loop: `headless()`, `obs()`, `act()`, `reset()` |
| `obs-act-edge.spec.js` | edge cases: `act(n=0)`, `reset(0.999)` lap seam, scan wrap-around, `done` semantics, numeric stability |
| `new-hooks.spec.js` | timing/field/energy hooks plus `modelDiagnostics()` / `geometryDiagnostics()` and day/night model manifests |
| `agent-view.spec.js` | the agent world view: `world`, `trackInfo`, `scene`, `describe`, `query`, typed errors |
| `agent-drive-bench.spec.js` | task-success benchmark — can a policy driven off the world view actually drive |
| `agent-determinism.spec.js` | same seed + same inputs ⇒ same result |
| `agentview-api-contract.test.mjs` | freezes the shape of the agent-view API |
| `assets-api.spec.js` | the baked asset pack's runtime path, and that every failure degrades to procedural |
| `logging.spec.js` | `js/log.js` in a real page: `Log` live before any game module evaluates, retention never lagging the console level, single namespace prefix, records flattened rather than holding references, `logs()` filters, a bad spec ignored not thrown |

### Physics & behaviour

| Spec | What it covers |
|---|---|
| `world-physics.spec.js` | the player integrates a bicycle model in WORLD space; `(s, x)` is read back, not authoritative |
| `physics-fixes.spec.js` | the physics/collision robustness pass |
| `longitudinal.spec.js` | longitudinal + grip physics and full-lap progress |
| `projection.spec.js` | world↔track (Frenet) projection continuity — no lap-distance teleport near hairpins |
| `elevation-tracks.spec.js` | slope gravity, banking grip, road-follow on graded circuits |
| `steering.spec.js` | the player heading model in `updateCar` |
| `drift.spec.js` | the dynamic single-track tyre model — per-axle slip-angle forces |
| `collisions.spec.js`, `collisions-deep.spec.js` | car-to-car in Frenet space; driver↔AI, driver↔wall, kerbs |
| `collision-ai-fixes.spec.js` | the June 2026 audit: wrong-way hysteresis, `wallT` on open circuits, rear-end `contactT`, 10-car pack separation, AI banking grip, Jeddah barriers |
| `offtrack.spec.js` | off-track, reversing, wrong-way, auto-rescue, and the prog↔s seam |
| `audit.spec.js` | edge cases from the codebase audit the other suites missed |
| `active-aero.spec.js` | X-mode / Z-mode: flap travel, the downforce/drag trade, the 400 ms transition cap |
| `aero-zones.spec.js` | fixed ACTIVATION ZONES per circuit, Monaco having none, and the overtake gate on lap 1 / under caution driven through a REAL opening lap |
| `debris.spec.js` | the Rapier debris side-world — and that it never moves a game car |
| `autopilot.spec.js` | a closed-loop driver that actually completes laps (monza, suzuka) |
| `presets.spec.js` | RELAX / STANDARD / PRO each push the sliders somewhere distinct |
| `sliders.spec.js` | every pause-menu slider is wired and persists |
| `gamepad.spec.js` | gamepad mapping (steer/throttle/brake/boost/overtake/camera) |

### Per-circuit foundations

| Spec | What it covers |
|---|---|
| `physics-*-foundation.spec.js` (15 circuits: abudhabi, albert_park, bahrain, cota, hungaroring, imola, monaco, montreal, monza, qatar, redbull, spa, suzuka, vegas, zandvoort) | per-circuit runtime build: required models present, props clear of the racing surface, terrain grounded, water safe, walls sane |
| `physics-interlagos-migration.spec.js` | Interlagos' migration to the track-owned foundation |
| `albert-park-foundation.test.mjs`, `baku-migration.test.mjs` | the same, as pure Node VM builds — no browser |
| `shared-track-foundation-characterization.test.cjs` | pins the shared-foundation compatibility behaviour: `startFrac`/`reverse` transforms, open vs street grounding, `recordBarrier` wrap, whole-model road suppression, finite mesh buffers |

### Track geometry & scenery

| Spec | What it covers |
|---|---|
| `tracks-walls.spec.js` | barrier geometry on all 40 circuits — the car stays inside a sane corridor |
| `tracks-visual.spec.js` | per-circuit pixel-diff regression (all 40 circuits × 6 fractions) |
| `terrain-over-road.spec.js` | all-circuit audit: no terrain or verge triangle renders above the racing line. Point-in-triangle vs the asphalt; large road-over-road is ignored as an intentional crossover (Suzuka's figure-8) |
| `props-over-road.spec.js` | all-circuit audit: no PROP triangle sits on/above the racing line, in 3D, 0.2–5 m above the road. Per-track `BASELINE` caps document justified overheads (Miami's beach canopy, Mexico's Foro Sol, gantries) |
| `prop-clipping.test.mjs` | ratchet: prop-vs-prop interpenetration must not grow |
| `component-inventory.test.mjs` | docs/COMPONENTS.md must name every class family in `css/`, name none that has left, and keep the dead-class list accurate — a map that silently rots is worse than none, because it is trusted |
| `road-under-floor.test.mjs` | no visible road surface may sit below the flat floor plane |
| `coplanar-faces.test.mjs` | ratchet: SAME-FACING coplanar faces — the pairs that z-fight at every distance, which `clip-audit` structurally cannot see |
| `f1-track-accuracy.spec.js` | `CircuitPaths` OSM traces vs a pinned subset of real GeoJSON outlines (direction, shape) |
| `track-foundation.test.mjs` | Node contracts for TrackSpace, TrackSurface, TrackModels, atomic diagnostics, terrain grounding, mesh validation |
| `track-graph.test.mjs` | the scenery model library + node graph, and `batches()` |
| `scenery-kits.test.mjs` | Node contracts for deterministic themes, every LandmarkKit form and CircuitKit facility, bounded counts, budgets, fail-closed behaviour |
| `scenery-kits.spec.js` | the browser binding of those kits into Silverstone's `scenery(api)` |
| `scenery-api-contract.test.mjs` | freezes the 107-member `scenery(api)` surface across the `js/track/scenery-*.js` split |
| `track-accuracy-validator.test.mjs` | the accuracy validator tool itself |
| `quick-validate.test.mjs` | the quick-probe validator tool itself |
| `map-hooks.spec.js` | minimap polyline (`mapPts()`) + orientation + `trackBounds()` |

### Render

| Spec | What it covers |
|---|---|
| `webgl-probes.spec.js` | renderer / GL capability contract |
| `instanced-draw.spec.js` | the GLX consumer of `TrackGraph.batches()` |
| `lighting-ab.spec.js` | lighting A/B invariants — the always-on companion to the offline campaign |
| `lighting-campaign.test.mjs` | the offline A/B campaign's own tables (tracks, TODs, weathers, shards, slider groups) |
| `lighting-tuner-grade.spec.js` | the LIGHTING TUNER's image-grade panel |
| `image-grade-visual.spec.js` | image-grade output, pixel-side |
| `image-grade-shaders.test.mjs` | image-grade shader maths, unit-side |
| `material-shimmer.spec.js` | does baked tarmac CRAWL when the car moves |
| `tlx-probes.spec.js` | the three.js/TSL backend behind `apex26.gfxBackend="three"` |
| `webgpu-lifecycle.test.mjs` | WGX resource lifecycle |
| `assets-pack.test.mjs` | the baked pack on disk: licence allow-list, md5, size budget |
| `import-models.test.mjs` | the AX26 model-import output and its determinism |

### Car & parts

| Spec | What it covers |
|---|---|
| `parts-physics.spec.js` | the unified resolver, visual-field ownership, consumed-mesh uniqueness, geometry/triangle budgets, surface/material semantics, static-emissive bounds, signatures, factory presets, physics/costs |
| `parts-catalog.spec.js` | the category setup UI, universal/supplier/signature/factory badges, access filtering, chip interaction |
| `parts-budget.spec.js` | the 600 cr budget UI and the unlimited toggle |
| `parts-persistence.spec.js` | localStorage persistence across reloads |
| `parts-setup-ids.spec.js` | stable `data-cs-cat` / `data-cs-opt` selectors |
| `parts-mesh-cache.spec.js` | bounded body/cockpit/decal/wheel caches with GPU eviction |
| `parts-factory-presets.spec.js` | AI meshes use deterministic team factory setups, never player saves |
| `parts-ers.spec.js` | ERS deploy economics — BOOST must both push and cost, at any speed |
| `parts-liveries.spec.js` | livery catalog shape and the gloss/satin/chrome finish axis |
| `parts-livery-contrast.spec.js` | the auto-picked sponsor/crest ink actually contrasts its background |
| `carview-parts.spec.js` | the isolated car viewer exposes every category, synchronised frames, grounded-effect controls |
| `car-effects.spec.js` | brake heat, ERS deployment, throttle-lift after-fire |
| `garage-aero.spec.js` | the GARAGE active-aero demo shows the real geometry at real angles |
| `custom-team.spec.js` | the MY TEAM livery editor in the GARAGE's TEAM tab |

### UI & cameras

| Spec | What it covers |
|---|---|
| `ui-audit.spec.js` | portrait + landscape screenshots of every screen |
| `ui-button-touch.spec.js` | button/touch steer mode: auto-throttle, disabled calibrate, race-settings layout; the lighting tuner's FREE CAMERA touch sticks (drag registers, no latch when the overlay is pulled away mid-hold, a cancelled scene drag releases) and its layout clearing the docked panel at every UI SIZE |
| `ui-desktop.spec.js` | desktop layout (`body.desktop`), keyboard controls, non-touch UI |
| `hud-layout.spec.js` | touch control + HUD layout across every steering and gearbox mode |
| `hud-audit.spec.js` | HUD screenshots + mode-dependent elements |
| `menu-survey.spec.js` | click every button, capture every state |
| `menu-keyboard.spec.js` | desktop menu input — wheel redirection and arrow/Home/End/PageUp/PageDown focus; an open modal outranks the screen behind it; ESCAPE IS BACK (every layer's `data-esc-close` resolves, picker/garage/title, and a sheet closes without resuming the race) |
| `menu-baseline.spec.js` | SIX blessed pixel baselines (title/select/garage x landscape-phone/desktop) — the IDENTITY half `tools/layout-audit.mjs` structurally cannot see: colour, type, weight, spacing. Deliberately six, not 380: a suite that asks a human to bless 380 images gets rubber-stamped |
| `multiplayer-npeer.spec.js` | the rival is keyed by a cross-peer identity — a packet for an unknown car is dropped rather than posed over somebody |
| `multiplayer-seats.spec.js` | seat exclusivity — a seat somebody else is in cannot be picked, and the clash resolves |
| `camera.spec.js` | all 13 player camera modes, via the hook and the CAM button |
| `camera-hooks.spec.js` | `dolly()`, `roadside()`, `tourShots()` |
| `camera-driving-hooks.spec.js` | orbit fov, cinematic, `carOrbit()` |
| `camera-tuner.spec.js` | per-mode framing offsets, knob→vantage geometry, mode isolation, clamp/persist/reset |

### Modes, data, audio

| Spec | What it covers |
|---|---|
| `season.spec.js` | round progression, points, standings visibility |
| `time-trial.spec.js` | ghost recording, ghost delta HUD, sector-split announces |
| `career.spec.js` | the save and its six slots, the mode axes, the hub, a settled round, ratings, the R&D garage, MY TEAM, objectives/contracts/rollover, reliability, EXTRA FUNDS never raising the fitted cap, the facility, the hire's contract, sponsors — and that career development never reaches a Grand Prix |
| `quali.spec.js` | one-lap qualifying: the simulated field and its spread, the sheet's two states, the grid being the qualifying order car-for-car, every round qualifying, and no classification leaking into the race |
| `data-lifecycle.spec.js` | data hub session plumbing — meeting/year/session/driver responses own their option lists |
| `telemetry-compare.spec.js` | TELEMETRY multi-lane compare and cross-session (one driver's race vs quali) |
| `telemetry-trace.test.mjs` | GPS-trace sanity and the playback dot's motion |
| `audio-smoke.spec.js` | the WebAudio engine/sfx initialise and respond, objectively |
| `music-library.spec.js` | the bring-your-own-music library and the Spotify backend |

### Multiplayer

| Spec | What it covers |
|---|---|
| `multiplayer-roles.spec.js` | the car role split, with no networking anywhere |
| `multiplayer-session.spec.js` | what a session does to the grid: rival posing, extrapolation, loss, hand-back to AI — on a virtual clock, never rAF |
| `multiplayer-lobby.spec.js` | the VS FRIEND screen — the part a person touches |
| `multiplayer-room.spec.js` | the waiting room both players share before the lights go out |
| `multiplayer-seats.spec.js` | seat exclusivity — a seat somebody else is already in cannot be picked, and the clash is reported rather than silently resolved |
| `multiplayer-npeer.spec.js` | the star room with more than two: one session per peer, a car per joiner, and one peer leaving handing only ITS rival back to the AI |
| `multiplayer-scan.spec.js` | reading a code with the camera, against a Y4M of a real QR played as a webcam |
| `multiplayer-scan-cancel.spec.js` | getting OUT of a scan and taking the camera down — a camera outliving its screen is a privacy bug nothing on screen reveals |
| `net-transport.test.mjs` | the wire with no wire: loopback latency/jitter/loss, deterministic via a seeded rnd |
| `net-sdp.test.mjs` | the compact invite codec |
| `net-qr.test.mjs` | the QR encoder, checked by jsQR — a decoder that is not ours |
| `net-snapshot.test.mjs` | the 13 B/car wire format and the interpolation buffer, including the short-way wraps |
| `net-session.test.mjs` | clock sync, routing and liveness over a fake wire |
| `net-rendezvous.test.mjs` | the room-code client against a real relay |
| `net-trystero-api.test.mjs` | the vendored Trystero surface actually used |

### Tooling & repo contracts

| Spec | What it covers |
|---|---|
| `load-order.test.mjs` | `index.html` and `tools/carview.html` `<script>` order matches `tools/manifest.cjs` exactly, including `HARD_EDGES` eval-time dependencies |
| `docs-integrity.test.mjs` | live docs, skills AND source comments reference only files that exist; CLAUDE.md's suite counts, the scenery-api member count, the renderer-backend list, and the skills/tools/docs indexes all match the repo |
| `test-groups.test.mjs` | the taxonomy: pick-tests rules name real groups and route every source dir; this document lists every group and every test file; `RENDER_SPECS` partitions cleanly; the manual suites stay out of default discovery |
| `circuit-def-fields.test.mjs` | every field authored in `js/circuits/<id>.js` survives the field-by-field copy into `Tracks.LIST`, or is named engine-only with a reason — an uncopied field reads as `undefined` at every consumer, silently, and the circuit renders as though it was never written |
| `backend-surface-parity.test.mjs` | every name GLX publishes is an own property of WGX and TLX (`undefined` allowed, absent not) — game.js installs a backend by descriptor-copy, so an absent name keeps GLX's own function running against a null `gl`/`CHK`, and every feature test for it passes before throwing |
| `test-coverage-audit.test.mjs` | the coverage auditor itself |
| `fixture-consumer-audit.test.mjs` | the specs that must import `tests/fixtures.js` do |
| `component-inventory.test.mjs` | the class families in `css/` match `docs/COMPONENTS.md` — a class defined in one file and used from another is the drift this catches |
| `span-kinds.test.mjs` | the agent view's span vocabulary matches the `ctx.noteSpan(...)` emitters — the list had fallen four kinds behind, so any circuit placing a tiered bowl failed `agent-view.spec.js` with a message that pointed nowhere near the cause |
| `css-layers.test.mjs` | every rule in a `@layer`-wrapped stylesheet stays inside its declared layer — an unlayered rule (a stray brace closing the layer early) silently outranks every layered rule regardless of specificity, with no parse error and no console warning |
| `deploy-staging.test.mjs` | the Pages workflow uploads an allow-list of directories — every path the shipped code can fetch must be inside it, or it 404s in production while passing every local run |
| `service-worker.test.mjs` | the SW's install/fetch/version-guard behaviour |
| `perf-sentinel.test.mjs` | the crash sentinel's memory must not outlive the crash |
| `output-paths.spec.js` | gallery paths are port-scoped and create their parents |

---

## See also

- [`tests/manual/README.md`](../tests/manual/README.md) — the human-run suites
- `docs/DEBUG-HOOKS.md` — the full `__apex` reference
- `js/log.js` — the logging facility the fixtures capture
- `playwright.config.js`, `tests/fixtures.js`, `tests/global-setup.js`,
  `tests/live-reporter.js` — the infrastructure sources
- `tools/pick-tests.mjs`, `tools/test-bg.mjs`, `tools/test-shards.sh` — the runners
