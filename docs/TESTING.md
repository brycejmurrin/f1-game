# Testing reference

45 root Playwright spec files (`tests/*.spec.js`), plus 24-file
`tests/blank-scan/` and `tests/inspect/` per-circuit suites and explicit-path
helpers under `tests/galleries/`. **`inspect/**`, `blank-scan/**`, and
`galleries/**` are excluded from default test discovery** via `testIgnore` in
`playwright.config.js`, so a bare `npx playwright test` runs the 45 root specs
only; run the excluded suites by naming them explicitly. The suite covers
physics, behaviour, geometry, cameras, UI, parts, steering, lighting, scenery,
gamepad, timing/field hooks, headless RL, and per-circuit blank-frame detection.

The 45 root specs are split into two Playwright projects (see
`playwright.config.js`): a **`headless`** project (physics/geometry/hook specs,
no GPU — the default) and a **`render`** project (screenshot/pixel-diff/GL specs
in `RENDER_SPECS`, run at `--workers=4` to cap SwiftShader concurrency). The old
single `chromium` project is gone; filter with `--project=headless` /
`--project=render`.

---

## Running tests

```sh
npx playwright test                                         # run all specs
npx playwright test tests/<file>.spec.js                   # single spec
npx playwright test tests/tracks-visual.spec.js            # per-circuit pixel-diff regression

npm test -- tests/ui-audit.spec.js
# output: artifacts/galleries-<allocated-port>/ui-audit/
```

**Named test groups** (via `npm run test:<group>`):

| Group | What it runs |
|---|---|
| `headless` | the whole `headless` project (all non-render specs, no GPU) |
| `render` | the `render` project only (screenshots/pixel/GL) at `--workers=4` |
| `smoke` | page load + `__apex` available |
| `api` | `__apex` contract: dev-tools + headless + obs/act + new-hooks |
| `hooks` | camera/driving/map/new `__apex` hook contracts |
| `physics` | physics regression + elevation + projection |
| `collision` | collision, drift, offtrack |
| `behaviour` | collision + drift + offtrack + world-physics + physics-fixes |
| `barriers` | track wall geometry + AI-fixes barrier tests |
| `parts` | parts catalog, budget, persistence, physics |
| `steering` | presets, sliders, steering modes, gamepad |
| `camera` | camera modes + camera hooks + driving hooks |
| `ui` | UI screenshots: audit + button-touch + desktop + hud (slow) |
| `visual` | pixel-diff visual regression (`tracks-visual.spec.js`, slow) |
| `scenery` | props/terrain over road + f1-track-accuracy |
| `webgl` | webgl-probes + lighting-ab |
| `audio` | engine/sfx audio smoke |
| `modes` | season + time-trial game modes |
| `map` | minimap hooks |
| `circuit` | walls + autopilot + elevation + audit (all circuit-level) |
| `fast` | curated fast subset: smoke + api + collision + offtrack + parts-physics + steering (~3 min) |
| `ab` | lighting A/B pixel comparison (`lighting-ab.spec.js`) |
| `audit` | coverage guard: every spec must belong to ≥1 group (`tools/test-coverage-audit.mjs`) |

---

## Infrastructure

### Global setup (`tests/global-setup.js`)

Pings `localhost:3456` up to 5 times (~10 s total) before any spec runs. If the
server doesn't respond the run aborts immediately with a clear message:

```
Dev server did not respond at http://localhost:3456 after 5 attempts (~10 s).
Start it with: python3 -m http.server 3456
```

Start the server first: `npx serve -l 3456 .` or `python3 -m http.server 3456`.

### Fixtures (`tests/fixtures.js`)

Import `test` and `expect` from `./fixtures.js` instead of `@playwright/test` to
get three extras at zero per-test cost:

| Fixture | What it provides |
|---|---|
| `context` (auto) | Injects `window.__TEST_MODE = true`; mocks all Jolpica + OpenF1 API calls with minimal stub JSON so tests run offline and results are deterministic |
| `pageErrors` | `string[]` — collects uncaught JS exceptions. Assert `expect(pageErrors).toHaveLength(0)` after exercising game logic to catch silent errors |
| `racePage` | Navigates to `/`, waits up to 10 s for `window.__apex` to be available, then hands the loaded page to the test — saves the goto + waitForFunction boilerplate |

### Playwright config

`playwright.config.js` — baseURL `localhost:3456` (per-run free port via
`tools/run-playwright.mjs`), retries 1, SwiftShader headless GPU, and the
`headless` / `render` project split. The npm wrapper allocates a free port per
run and writes:

- `artifacts/report-<port>/` — HTML report
- `artifacts/test-results-<port>/` — failures, traces, attachments, JUnit
- `artifacts/galleries-<port>/<suite>/` — screenshots and suite-emitted reports

Run excluded suites explicitly by path, e.g. `npm test -- tests/inspect/monaco.spec.js`,
`npm test -- tests/blank-scan/monaco.spec.js`, or
`npm test -- tests/galleries/track-trace.spec.js`.

---

## Philosophy — debug-hooks first

Prefer assertions driven by the `window.__apex` API and geometric/mesh probes
over rendering- or timing-based heuristics.

**Assert behaviour and geometry, not brittle magnitudes.** A threshold like
"speed > 10 after 2 s" goes stale the moment physics is retuned. Prefer
relative/directional checks:
- "faster on tarmac than on grass"
- "heading barely changes off-track with zero steer"
- "reverses then recovers to forward"

The off-track specs were tightened this way after several thresholds drifted stale.

**Use the deterministic hooks:**
- `obs()` / `act()` / `reset()` — headless control loop
- `step()` + `physState()` / `probe()` — physics
- `groundY()` / `Tracks.terrainY()` — rendered-terrain raycast; exact geometry
  (e.g. `terrain-over-road.spec.js`)
- `eyeAt()` / `orbit()` / `view()` — deterministic camera framing for screenshots

**Legacy specs are coarser heuristics** and are inherently flakier:
- `blank-scan/*` — PNG byte-size thresholds (the geometric `terrain-over-road.spec.js`
  is the modern successor for the terrain-over-road subclass)
- `tracks-visual.spec.js` — per-circuit pixel diff

Keep the legacy specs, but write new checks against hooks/geometry where possible.

**When a spec fails**, first check whether it's a stale expectation vs the current
intended behaviour before assuming a regression — confirm by reading the actual
hook values.

---

## Viewport rules

- Tests that touch `#pm-steer` / `#pm-calib` must use `hasTouch: true` — desktop
  mode adds `body.desktop` which hides those elements.
- In-race tests must use LANDSCAPE viewport `{width: 844, height: 390}` to avoid
  the `#rotate-device` overlay blocking interaction.

---

## Spec coverage table

| Spec(s) | What they cover |
|---|---|
| `smoke.spec.js` | page loads, `__apex` available, race starts |
| `autopilot.spec.js` | closed-loop programmatic driving (monza, suzuka) |
| `tracks-visual.spec.js` | per-circuit pixel-diff regression (all 24 circuits × 6 fractions) |
| `tracks-walls.spec.js` | barrier geometry on all 24 circuits |
| `f1-track-accuracy.spec.js` | CircuitPaths OSM data vs real bacinger/f1-circuits GeoJSON outlines (direction, shape) |
| `physics-fixes.spec.js`, `world-physics.spec.js`, `longitudinal.spec.js` | physics regression |
| `projection.spec.js` | world↔track (Frenet) projection continuity — no lap-distance teleport near hairpins |
| `elevation-tracks.spec.js` | slope/gravity, banking grip, road-follow on graded circuits |
| `collisions.spec.js`, `collisions-deep.spec.js`, `drift.spec.js`, `offtrack.spec.js` | behaviour tests |
| `audit.spec.js` | edge cases from the codebase audit (collisions/physics/AI/boundaries) the other suites missed |
| `collision-ai-fixes.spec.js` | regression tests for June 2026 audit: wrong-way threshold/hysteresis, wallT on open circuits, rear-end contactT, 10-car pack separation, AI banking grip, Jeddah barriers |
| `headless-api.spec.js` | headless control loop: `headless()`, `obs()`, `act()`, `reset()` |
| `obs-act-edge.spec.js` | edge cases: `act(n=0)`, `reset(0.999)` lap seam, scan wrap-around, `done` semantics, numeric stability |
| `ui-audit.spec.js` | portrait+landscape screenshots of all 10 screens |
| `presets.spec.js`, `sliders.spec.js`, `steering.spec.js` | steering parameter tests |
| `parts-physics.spec.js` | Parts module unit tests (getMods, getCost, statMult) |
| `parts-budget.spec.js` | budget UI and unlimited toggle |
| `parts-catalog.spec.js` | 8-category setup UI, factory parts, chip interaction |
| `parts-persistence.spec.js` | localStorage persistence across reloads |
| `dev-tools.spec.js` | `__apex` API contract tests (60+ tests) |
| `new-hooks.spec.js` | contract tests for the timing/field/energy hooks: `timing()`, `sectorState()`, `lapHistory()`, `fieldState()`, `aiPlace()`, `setEnergy()`, `setLap()`, `trackProfile()`, and `obs().gear` |
| `season.spec.js`, `time-trial.spec.js` | season mode + time trial / ghost delta |
| `custom-team.spec.js` | custom-team livery editor: colour save frees/rebuilds the decal texture |
| `data-lifecycle.spec.js` | data hub session plumbing: meeting/year/session/driver responses own their option lists (no stale races) |
| `ui-button-touch.spec.js` | touch controls, calibrate button, race settings layout |
| `ui-desktop.spec.js` | desktop-mode layout (`body.desktop`), keyboard controls, non-touch UI |
| `camera.spec.js`, `camera-hooks.spec.js`, `camera-driving-hooks.spec.js` | all 13 camera modes, `camera()`/`previewCam()`/`view()`/`orbit()`/`eyeAt()` framing, driving-camera behaviour |
| `hud-audit.spec.js` | HUD layout screenshots + mode-dependent HUD elements |
| `map-hooks.spec.js` | minimap polyline (`mapPts()`) + orientation |
| `lighting-ab.spec.js` | lighting A/B pixel comparison (the `test:ab` group) |
| `gamepad.spec.js` | gamepad mapping (steer/throttle/brake/boost/overtake/camera) |
| `webgl-probes.spec.js` | renderer/GL capability probes |
| `audio-smoke.spec.js` | WebAudio engine/sfx smoke (objective pitch, no listening) |
| `blank-scan/*.spec.js` | 24 per-circuit blank-frame detection (**excluded from default discovery** via `testIgnore`; run explicitly) |
| `inspect/*.spec.js` | 24 per-circuit inspection/screenshot specs (**excluded from default discovery** via `testIgnore`; run explicitly) |
| `galleries/*.spec.js` | explicit-path gallery emitters such as track traces and all-tracks building surveys (**excluded from default discovery** via `testIgnore`; run explicitly) |
| `terrain-over-road.spec.js` | all-circuit audit: no terrain (or verge-shoulder) triangle renders above the racing line — the green-wedge / elevation-mound-over-road class. Point-in-triangle face test vs the asphalt; large road-over-road overs are ignored as intentional crossovers (Suzuka figure-8) |
| `props-over-road.spec.js` | all-circuit audit: no PROP triangle sits on/above the racing line (roofs, canopies, buildings, crowds). Same point-in-triangle method against the props mesh, in 3D (0.2–5 m band above the road). Per-track `BASELINE` caps document justified overheads (Miami beach canopy, Mexico Foro Sol pass-through, gantries) and small tracked residuals; any new/worsened intrusion on a clean track fails. Measure one track: `TRACK=<id> PORT=<p> node tools/measure-props-over-road.mjs --shots` |

---

## See also

- `docs/DEBUG-HOOKS.md` — full `__apex` API reference (obs/act/reset, headless
  pattern, all hook signatures)
- `playwright.config.js` — full Playwright configuration
- `tests/fixtures.js` — shared fixtures source
- `tests/global-setup.js` — server health-check source
