# Apex 26 developer skills

Project skills for recurring agent workflows. Each is a `SKILL.md` (auto-matched
from its `description`, or via `/<name>`), grounded in `__apex`,
`tools/verify-track.cjs`, and `npm run test:*` groups.

**A skill is when/how, not the command.** The CLI lives under `tools/`. Some
CLIs are pinned as `apex_*` MCP tools; most are not. Full map (seven MCP
servers, wrap table, never-wrap): [`docs/AGENT-SURFACE.md`](../../docs/AGENT-SURFACE.md).

Descriptions say **when** to load the skill; bodies carry the workflow.

| Skill | Use it when |
|---|---|
| **apex-env-setup** | First thing on a cold machine / after Playwright or MCP failures — installs Node deps, Playwright Chromium, Chrome DevTools MCP, tinyfish, Vulkan packages via `tools/cloud-agent-install.sh`. |
| **survey-track** | End-to-end circuit accuracy: survey → diagnose geometry → edit → verify → ship (orchestrates scenery/debug/probe + ground-profile). |
| **bump-cache** | Any `js/` or `css/` edit (or script/link tag change) — refresh `?v=<sha256>` hashes and the shell generation in `version.json` before commit. |
| **new-track** | Adding a circuit or editing geometry/metadata in `js/circuits/`. |
| **scenery-dress** | Writing/editing a track's `scenery(api)` callback (trees, buildings, barriers, mountains). |
| **tune-physics** | A/B testing or tuning driving physics via headless `obs/act/reset`. |
| **car-viewer** | Inspecting the car in isolation (no track) — `tools/carview.html` + `tools/car/render-car.mjs`. |
| **check-changes** | Pre-push validation — `verify-change.mjs --fast` (no browsers) or `--plan` + batched `test-bg`; `--wait` only when asked. Cloud: `./tools/apex-tools-mcp.sh call apex_*`. |
| **test-timeout-triage** | A Playwright test timed out or hangs — machine vs wait vs budget vs bug, `test-solo.mjs` re-runs, the load-inversion case. |
| **cross-backend-parity** | A look/knob/feature differs between GLX, WGX and TLX — the parity audit loop, drift hotspots, gap recording. |
| **deploy-merge** | Merging with / pushing to the deploy branch — cross-lineage cache max+1, union sweeps, baseline re-measure. Live version.json → deploy-research. |
| **survey-ui-matrix** | Reviewing the whole UI across orientations, viewport shapes, UI/HUD scale and pointer type — Playwright MCP resize/DOM/CSS (`tools/playwright-mcp.sh`) or Chrome DevTools MCP; enumerate screens from source, measure each cell, capture. |
| **css-play** | Iterating on one menu/HUD stylesheet — host localhost, open a screen, dump DOM, hot-swap `css/`, screenshot (`tools/css-play.mjs` / `playwright-mcp.sh play|dom`). |
| **playwright-probe** | Headless screenshots/evals — `shot.mjs`, `apex-eval.mjs`, `apex-capture.mjs`. Run **apex-env-setup** first if browsers missing. |
| **mcp-probe** | Live canvas via Chrome DevTools MCP / tinyfish. Run **apex-env-setup** first if MCP/Chrome missing. |
| **agent-view** | Agent world view / headless lap / `world()` / `field()` / `rollout()` without screenshots. |
| **ai-racecraft** | AI overtakes, brake targets, preferred lane, ERS, stuck/unstuck, driver craft ratings. |
| **asset-pack** | Baking/verifying `assets/pack`, matTexMix, procedural-vs-textured tarmac. |
| **audio-debug** | Engine pitch, sfx, gear-shift audio, music, mute/volume, WebAudio layers. |
| **bake-lighting** | Paste/save `window.LightPresets` / LIGHTING TUNER COPY VALUES into the repo. |
| **career-mode** | DRIVER CAREER / MY TEAM, contracts, sponsors, R&D, reliability, career quali. |
| **data-hub** | Data Hub tabs, F1API / Jolpica / OpenF1, `js/data/*`, telemetry export. |
| **debug-cameras** | Cockpit/chase/orbit/cinematic cameras, camState, framing a corner. |
| **debug-state** | Telemetry, slip/grip, field order/gaps, sector timing, lightState, headless loop. |
| **debug-tracks** | Track geometry, corners, elevation, walls, terrain-over-road, groundY. |
| **game-feel** | Juice, screen shake, hit-stop, kerb/wall/gear feedback without changing physics. |
| **garage-parts-livery** | Garage parts catalog, livery/finish, SIGNATURE/FACTORY_PRESETS, ersProfile. |
| **input-controls** | Steering, gamepad, touch/tilt, on-screen buttons, racing-line assists. |
| **lighting-tuner** | Night washed out, dawn sun height, floodlights, ambient/exposure/fog knobs. |
| **motion-capture** | Flicker while driving, shadow shimmer, z-fighting, temporal artifacts. |
| **multiplayer-debug** | VS FRIEND, WebRTC, invite/QR, Nostr signalling, TURN/ICE, net determinism. |
| **perf-profile** | Game-loop profiling, frame-budget hog, GC spikes, flame charts. |
| **pixel-perfect** | Visual regression / screenshot diff / toHaveScreenshot baseline checks. |
| **pwa-cache-service-worker** | `sw.js`, version.json, offline install, shell version guard, DEFERRED precache. |
| **race-incidents-control** | Debris, cautions, VSC, safety car, incident takeovers, reliability DNFs. |
| **restructure-screens-css** | Consolidating screens/menus/CSS tokens, height-responsive layout, methodology. |
| **scene-graph-instancing** | TrackGraph.instance migration, graph parity, instanced GLX draws. |
| **season-mode** | Standalone Season calendar, weekend format, sprint, points, season-ui. |
| **slim-bloat** | Fat SKILL.md, dead code, module-size ceilings, simplify / too much context. |
| **ui-menu-a11y** | Menus, Escape/back, keyboard nav, selected-state, scroll, touch layout. |
| **webapp-testing** | Playwright Python toolkit for local web apps (prefer playwright-probe for Apex). |
| **webgl-debug** | Blank/dark GLX canvas, shadow acne, bloom, HDR, shader/uniform bugs. |
| **webgpu-debug** | WGX black screen, NaN-white road, WGSL failures, device lost, MSAA/HDR. |
| **webgpu-inspector** | GPU object inspection, validation errors, frame profiling on WebGPU. |

See individual `SKILL.md` files under this directory for full workflows.
