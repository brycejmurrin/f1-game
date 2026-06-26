# Testing reference

100+ Playwright specs across 50+ files. The suite covers physics, behaviour,
geometry, UI, parts, steering, timing/field hooks, headless RL, and per-circuit
blank-frame detection.

---

## Running tests

```sh
npx playwright test                                         # run all specs
npx playwright test tests/<file>.spec.js                   # single spec
npx playwright test tests/ui-audit.spec.js                 # → tests/ui-screenshots/
npx playwright test tests/visual-regression-*.spec.js      # pixel-diff regression
```

**Named test groups** (via `npm run test:<group>`):

| Group | What it runs |
|---|---|
| `smoke` | page load + `__apex` available |
| `api` | `__apex` contract: dev-tools + headless + obs/act edge cases |
| `headless` | headless control loop only (fast, no rendering) |
| `physics` | physics regression + elevation |
| `collision` | collision, drift, offtrack |
| `behaviour` | collision + drift + offtrack + collision-ai-fixes (all behaviour) |
| `barriers` | track wall geometry + AI-fixes barrier tests |
| `parts` | parts catalog, budget, persistence, physics |
| `steering` | presets, sliders, steering modes |
| `ui` | all UI screenshots (slow, ~5 min) |
| `visual` | pixel-diff visual regression (slow) |
| `modes` | season + time-trial game modes |
| `circuit` | walls + autopilot + elevation (all circuit-level tests) |
| `fast` | curated fast subset: smoke + api + collision + parts (~3 min) |

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

`playwright.config.js` — baseURL `localhost:3456`, retries 1, SwiftShader
headless GPU.

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
- `visual-regression-*` — pixel diff

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
| `track-*.spec.js` | per-circuit smoke tests |
| `tracks-walls.spec.js` | barrier geometry on all 24 circuits |
| `physics-*.spec.js`, `world-physics.spec.js`, `longitudinal.spec.js` | physics regression |
| `elevation-tracks.spec.js` | slope/gravity, banking grip, road-follow on graded circuits |
| `collisions*.spec.js`, `drift.spec.js`, `offtrack.spec.js` | behaviour tests |
| `collision-ai-fixes.spec.js` | regression tests for June 2026 audit: wrong-way threshold/hysteresis, wallT on open circuits, rear-end contactT, 10-car pack separation, AI banking grip, Jeddah barriers |
| `headless-api.spec.js` | headless control loop: `headless()`, `obs()`, `act()`, `reset()` |
| `obs-act-edge.spec.js` | edge cases: `act(n=0)`, `reset(0.999)` lap seam, scan wrap-around, `done` semantics, numeric stability |
| `ui-audit.spec.js` | portrait+landscape screenshots of all 10 screens |
| `visual-regression-*.spec.js` | pixel-diff regression |
| `presets.spec.js`, `sliders.spec.js`, `steering.spec.js` | steering parameter tests |
| `parts-physics.spec.js` | Parts module unit tests (getMods, getCost, statMult) |
| `parts-budget.spec.js` | budget UI and unlimited toggle |
| `parts-catalog.spec.js` | 8-category setup UI, factory parts, chip interaction |
| `parts-persistence.spec.js` | localStorage persistence across reloads |
| `dev-tools.spec.js` | `__apex` API contract tests (60+ tests) |
| `new-hooks.spec.js` | contract tests for the 8 new hooks: `timing()`, `sectorState()`, `lapHistory()`, `fieldState()`, `aiPlace()`, `setEnergy()`, `setLap()`, `trackProfile()`, `obs().gear` |
| `season.spec.js`, `time-trial.spec.js` | season mode + time trial / ghost delta |
| `ui-button-touch.spec.js` | touch controls, calibrate button, race settings layout |
| `blank-scan/*.spec.js` | 24 per-circuit blank-frame detection |
| `terrain-over-road.spec.js` | all-circuit audit: no terrain (or verge-shoulder) triangle renders above the racing line — the green-wedge / elevation-mound-over-road class. Point-in-triangle face test vs the asphalt; large road-over-road overs are ignored as intentional crossovers (Suzuka figure-8) |

---

## See also

- `docs/DEBUG-HOOKS.md` — full `__apex` API reference (obs/act/reset, headless
  pattern, all hook signatures)
- `playwright.config.js` — full Playwright configuration
- `tests/fixtures.js` — shared fixtures source
- `tests/global-setup.js` — server health-check source
