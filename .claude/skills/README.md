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

| **agent-view** | Drive Apex 26 without screenshots — `world()`, `field()`, `rollout()`, headless lap, deterministic run reproduction. |
| **ai-racecraft** | AI overtakes too aggressive/passive, brake targets, preferred lane, ERS deploy, stuck/unstuck, `js/game/ai-drive.js`. |
| **asset-pack** | Baking or verifying `assets/pack`, `js/render/assets.js`, `matTexMix`/baked PBR blend, MAT layer mismatches. |
| **audio-debug** | Engine sounds flat at high speed, sfx not triggering, gear-shift audio wrong, music cuts out, WebAudio debugging. |
| **bake-lighting** | Baking a `window.LightPresets` blob or LIGHTING TUNER COPY VALUES output, saving lighting presets. |
| **career-mode** | DRIVER CAREER, MY TEAM, career saves, contracts, sponsors, R&D economy, career qualifying, reliability/DNFs. |
| **data-hub** | Data Hub tabs (schedule/standings/last race/live/telemetry/export), F1API / Jolpica / OpenF1, `js/data/*`. |
| **debug-cameras** | Switch or check camera modes, cockpit/chase/orbit/cinematic/roadside shots, `camState`/`viewState`, camera lag. |
| **debug-state** | Read telemetry, inspect slip/grip/physics state, dump field order/gaps, show sector/lap timing, headless control loop. |
| **debug-tracks** | Track geometry, corners, elevation, curvature, map/bounds, wall/barrier audits, terrain-over-road gaps, `groundY`. |
| **game-feel** | Screen shake, weak kerb/wall/gear-shift/collision hits, hit-stop, more responsive camera/particles/audio polish. |
| **garage-parts-livery** | GARAGE parts catalog, livery/finish/shark fin, `ersProfile`/`aeroLoad`, career owned-part UI, Car3D visual recipes. |
| **input-controls** | Steering, gamepad, touch steer, tilt/gyro, keyboard, on-screen steer buttons, driving-help/racing-line assists. |
| **lighting-tuner** | Night looks washed out, dawn sun too high, floodlights/lamps not firing, day scene flat, `lightTune`/`applyRaceSettings`. |
| **motion-capture** | Flicker while driving, z-fighting, geometry pop-in, texture shimmer, temporal artifacts, record a driven lap. |
| **multiplayer-debug** | VS FRIEND, WebRTC connection, invite links/QR codes, room codes, Nostr signalling, TURN/ICE, replicated rivals. |
| **perf-profile** | Profile the game loop, find frame-budget hogs, GC jitter/spikes, slow track load, measure physics/render CPU cost. |
| **pixel-perfect** | Visual regression testing — pixel-by-pixel screenshot comparison, `toHaveScreenshot`, snapshot mismatch. |
| **pwa-cache-service-worker** | `sw.js`, `version.json`, PWA offline install, cache invalidation, shell version guard, DEFERRED backend precache. |
| **race-incidents-control** | Debris, Rapier side-worlds, incident takeovers, car launches/pileups, cautions, VSC, safety car, reliability retirements. |
| **restructure-screens-css** | Restructuring screens, menus, dialogs, DOM, or CSS class/token system — collapsing duplicate component families. |
| **scene-graph-instancing** | Migrating scenery emitters to TrackGraph.instance, graph parity or instancing reuse, batches()/bakeOnly, GLX instanced draws. |
| **season-mode** | Standalone Season calendar, weekend format, sprint, quali-on/off, points table, `season-cal.js`, `season-ui.js`. |
| **slim-bloat** | Fat SKILL.md, saturated module-size ceiling, dead or duplicate code, stale comments, extract/split candidates. |
| **ui-menu-a11y** | Menus, dialogs, Escape/back behavior, keyboard navigation, selected-state announcements, scroll affordances, touch layout. |
| **webapp-testing** | Playwright Python scripts for verifying frontend functionality, debugging UI behavior, capturing browser screenshots. |
| **webgl-debug** | WebGL2 rendering issues, shader errors, texture/buffer problems, GLX backend failures. |
| **webgpu-debug** | WebGPU boot failures, WGSL compile errors, WGX pipeline validation, GPU device lost. |
| **webgpu-inspector** | Inspect GPU objects (buffers, textures, shaders, pipelines), profile frame performance, diagnose visual artifacts. |

See individual `SKILL.md` files under this directory for full workflows.
