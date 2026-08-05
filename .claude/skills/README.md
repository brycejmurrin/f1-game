# Apex 26 developer skills

Project skills for recurring agent workflows. Each is a `SKILL.md` (auto-matched
from its `description`, or via `/<name>`), grounded in `__apex`,
`tools/verify-track.cjs`, and `npm run test:*` groups.

Descriptions follow Skill Discovery Optimization: they say **when** to load the
skill, not how to run it. Bodies carry the workflow.

| Skill | Use it when |
|---|---|
| **survey-track** | End-to-end circuit accuracy: survey → diagnose geometry → edit → verify → ship (orchestrates scenery/debug/probe + ground-profile). |
| **bump-cache** | Any `js/` or `css/` edit (or script/link tag change) — bump `?v=N` and matching `version.json` before commit. |
| **new-track** | Adding a circuit or editing geometry/metadata in `js/circuits/`. |
| **scenery-dress** | Writing/editing a track's `scenery(api)` callback (trees, buildings, barriers, mountains). |
| **tune-physics** | A/B testing or tuning driving physics via headless `obs/act/reset`. |
| **car-viewer** | Inspecting the car in isolation (no track) — `tools/carview.html` + `tools/render-car.mjs`. |
| **check-changes** | Pre-push validation — `pick-tests`, `test-bg`, `verify-track`, cache bump. |
| **ui-menu-a11y** | Menus/dialogs, Escape/back, keyboard nav, UI scale, AriaState, layout tests. |
| **multiplayer-debug** | VS FRIEND / WebRTC — loopback, invite SDP, room codes, ICE/TURN, authority. |
| **career-mode** | DRIVER / MY TEAM career — saves, economy, R&D, quali/reliability weekend flow. |
| **race-incidents-control** | Debris, incident takeovers, race-control flags, caution/VSC/SC, determinism. |
| **debug-cameras** | The 13 camera modes + free framing hooks (`view`/`eyeAt`/`orbit`/…). |
| **debug-tracks** | Track geometry/surface/barrier query hooks + multi-track sweeps. |
| **debug-state** | Live race/physics/lighting telemetry + headless `act`/`obs`/`reset`. |
| **agent-view** | Perceive and drive the game as text — `__apex` agent-view + `tools/agent.mjs`. |
| **playwright-probe** | Headless screenshots/evals — `shot.mjs`, `apex-eval.mjs`, `apex-capture.mjs`. |
| **motion-capture** | Temporal artifacts while driving (flicker/shimmer/crawl) — `tools/motion-capture.mjs`. |
| **audio-debug** | WebAudio synth — engine pitch, sfx, music layers, mute/volume. |
| **perf-profile** | Headless V8 CPU flame chart of the game loop (Playwright CDP). |
| **lighting-tuner** | Scene lighting — `lightTune`, time-of-day/weather, `lightState`, orbit shots. |
| **bake-lighting** | Baking a pasted `window.LightPresets = {…}` export into shipped presets. |
| **webgl-debug** | WebGL2/GLX issues — lights, shadows, bloom, shader compile, GL errors. |
| **game-feel** | Juice/feedback on Apex systems (camera/particles/audio/skids) without touching physics. |

## Removed / deferred

| Item | Decision |
|---|---|
| **hermes** | Removed — persona/council protocol, missing `notes/council-log.md`, not an Apex technique. Use `tune-physics` + `docs/PHYSICS.md`. |
| **scene-graph-instancing** | Deferred — migrate emitters via `TrackGraph` / `graph-parity`; absorb into scenery work when next needed. |
| **garage-parts-livery** | Deferred — catalog/garage rules still live in `docs/PARTS.md` + `car-viewer` for visuals. |
| **asset-pack** | Deferred — `tools/assets.mjs` + `docs/research/ASSET-API-RESEARCH.md` cover bake/verify for now. |
| **pwa-cache-service-worker** | Deferred — `bump-cache` for routine bumps; `sw.js` + `test:service-worker` for SW work. |

## Pressure-test notes (2026-08)

Invoked every skill with fast subagents (`composer-2.5-fast`; Haiku not available
in this environment) against fictional user requests. Highest-confidence fixes
applied: wrong APIs (`UiLayers.gateOpen` → `anyOpen`), inverted physics table
(`frontGrip`/`yawInertia`), wrong `setEngine` signature, shake location
(`game.js` not `cameras.js`), career facility≠budget-cap, missing `incident()`/
`net()` hooks, `corners()` vs FIA turns, 40-circuit roster, `perf-profile` tool
lag, folklore corner fractions.

Still PARTIAL by design for some requests (e.g. motion-capture is track-generic;
agent-view race `finished` needs chained rollouts). Re-run a skill scenario after
editing it.

The debug-* skills pair with `tools/apex-eval.mjs` / `tools/apex-capture.mjs` so
changes are validated visually, not just asserted.

Output paths: batch/test under `artifacts/`, human-reviewed captures under
`scratch/` (see `CLAUDE.md`).

Design principles:
- **No build step** — bump `?v=N` + `version.json` on asset edits.
- **Debug-hooks first** — assert via `__apex`, not brittle magnitudes.
- **Headless verify-track** — fast pre-push guard for circuit/track engine edits.
