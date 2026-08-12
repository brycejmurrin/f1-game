# Apex 26 developer skills

Project skills for recurring agent workflows. Each is a `SKILL.md` (auto-matched
from its `description`, or via `/<name>`), grounded in `__apex`,
`tools/verify-track.cjs`, and `npm run test:*` groups.

Descriptions say **when** to load the skill; bodies carry the workflow.

| Skill | Use it when |
|---|---|
| **survey-track** | End-to-end circuit accuracy: survey → diagnose geometry → edit → verify → ship (orchestrates scenery/debug/probe + ground-profile). |
| **bump-cache** | Any `js/` or `css/` edit (or script/link tag change) — bump `?v=N` and matching `version.json` before commit. |
| **new-track** | Adding a circuit or editing geometry/metadata in `js/circuits/`. |
| **scenery-dress** | Writing/editing a track's `scenery(api)` callback (trees, buildings, barriers, mountains). |
| **tune-physics** | A/B testing or tuning driving physics via headless `obs/act/reset`. |
| **car-viewer** | Inspecting the car in isolation (no track) — `tools/carview.html` + `tools/car/render-car.mjs`. |
| **check-changes** | Pre-push validation — `pick-tests`, `test-bg`, `verify-track`, cache bump. |
| **survey-ui-matrix** | Reviewing the whole UI across orientations, viewport shapes, UI/HUD scale and pointer type with the Chrome DevTools MCP — enumerate screens from source, measure each cell, capture. |
| **restructure-screens-css** | Restructuring/consolidating screens, menus, dialogs, the DOM or the CSS class/token system — collapsing duplicate families, adding/removing a layer, the split-index.html question, height-responsive design. |
| **ui-menu-a11y** | Menus/dialogs, Escape/back, keyboard nav, UI scale, AriaState, layout tests. |
| **multiplayer-debug** | VS FRIEND / WebRTC — loopback, invite SDP, room codes, ICE/TURN, authority. |
| **career-mode** | DRIVER / MY TEAM career — saves, economy, R&D, quali/reliability weekend flow. |
| **race-incidents-control** | Debris, incident takeovers, race-control flags, caution/VSC/SC, determinism. |
| **debug-cameras** | The 13 camera modes + free framing hooks (`view`/`eyeAt`/`orbit`/…). |
| **debug-tracks** | Track geometry/surface/barrier query hooks + multi-track sweeps. |
| **debug-state** | Live race/physics/lighting telemetry + headless `act`/`obs`/`reset`. |
| **agent-view** | Perceive and drive the game as text — `__apex` agent-view + `tools/agent.mjs`. |
| **playwright-probe** | Headless screenshots/evals — `shot.mjs`, `apex-eval.mjs`, `apex-capture.mjs`. |
| **mcp-probe** | Driving the LIVE game or DEPLOYED site interactively — Chrome DevTools MCP (render/heap/perf, the live twin of a scratch script) + tinyfish post-deploy liveness check. |
| **motion-capture** | Temporal artifacts while driving (flicker/shimmer/crawl) — `tools/capture/motion-capture.mjs`. |
| **audio-debug** | WebAudio synth — engine pitch, sfx, music layers, mute/volume. |
| **perf-profile** | Headless V8 CPU flame chart of the game loop (Playwright CDP). |
| **lighting-tuner** | Scene lighting — `lightTune`, time-of-day/weather, `lightState`, orbit shots. |
| **bake-lighting** | Baking a pasted `window.LightPresets = {…}` export into shipped presets. |
| **webgl-debug** | WebGL2/GLX issues — lights, shadows, bloom, shader compile, GL errors. |
| **game-feel** | Juice/feedback on Apex systems (camera/particles/audio/skids) without touching physics. |
| **scene-graph-instancing** | Migrating scenery emitters to `TrackGraph`, graph parity, instanced draws, `bakeOnly`. |
| **garage-parts-livery** | Parts catalog, SIGNATURE/FACTORY presets, garage UI, livery finish/fin, ERS/aero load. |
| **asset-pack** | Baking/verifying `assets/pack`, MAT layers, `matTexMix`, procedural fallback. |
| **pwa-cache-service-worker** | `sw.js` precache, `version.json` network-first, DEFERRED optional assets, stale PWA. |

The debug-* skills pair with `tools/apex-eval.mjs` / `tools/capture/apex-capture.mjs` so
changes are validated visually, not just asserted.

Output paths: batch/test under `artifacts/`, human-reviewed captures under
`scratch/` (see `CLAUDE.md`).

Design principles:
- **No build step** — bump `?v=N` + `version.json` on asset edits.
- **Debug-hooks first** — assert via `__apex`, not brittle magnitudes.
- **Headless verify-track** — fast pre-push guard for circuit/track engine edits.
