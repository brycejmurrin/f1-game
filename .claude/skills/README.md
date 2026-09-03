# Apex 26 developer skills

Project skills for recurring agent workflows. Each is a `SKILL.md` (auto-matched
from its `description`, or via `/<name>`), grounded in `__apex`,
`tools/verify-track.cjs`, and `npm run test:*` groups.

**A skill is when/how, not the command.** The CLI lives under `tools/`. Twelve
CLIs are pinned as `apex_*` MCP tools; most are not. Full map (three MCP
servers, wrap table, never-wrap): [`docs/AGENT-SURFACE.md`](../../docs/AGENT-SURFACE.md).

Descriptions say **when** to load the skill; bodies carry the workflow and
`references/` carry the detail. 31 skills (44 until 2026-09 — the folded ones
are named in the rows that absorbed them: `bump-cache`, `deploy-merge`,
`test-timeout-triage` → check-changes; `motion-capture`, `perf-profile` →
playwright-probe; `bake-lighting` → lighting-tuner; `scene-graph-instancing` →
scenery-dress; `debug-state` → agent-view; `cross-backend-parity` →
`docs/RENDERERS.md` §Cross-backend parity. `apex-env-setup`, `pixel-perfect`,
`webapp-testing`, `webgpu-inspector` were deleted: env setup is AGENTS.md
§Verification 1 + `tools/env/cloud-agent-install.sh`.)

| Skill | Use it when |
|---|---|
| **agent-view** | Drive Apex 26 without screenshots — `world()`, `field()`, `rollout()`, headless lap, deterministic runs; telemetry / slip-grip / field gaps / sector timing / `lightState` / the headless `reset`-`act` loop (`references/state.md`). |
| **ai-racecraft** | AI overtakes too aggressive/passive, brake targets, preferred lane, ERS deploy, stuck/unstuck, `js/physics/ai-drive.js`. |
| **asset-pack** | Baking or verifying `assets/pack`, `js/render/shared/assets.js`, `matTexMix`/baked PBR blend, MAT layer mismatches. |
| **audio-debug** | Engine sounds flat at high speed, sfx not triggering, gear-shift audio wrong, music cuts out, WebAudio debugging. |
| **car-viewer** | Inspecting the car in isolation (no track) — `tools/carview.html`, `tools/car/render-car.mjs`, `tools/car/carshot.mjs`. |
| **career-mode** | DRIVER CAREER, MY TEAM, career saves, contracts, sponsors, R&D economy, career qualifying, reliability/DNFs. |
| **check-changes** | Pre-push validation — `verify-change.mjs --fast` / `--plan` + batched `test-bg`; the cache bump (`references/bump.md`), a Playwright timeout triage (`references/triage.md`), merging with / pushing to the deploy branch (`references/deploy.md`). |
| **css-play** | Iterating on one menu/HUD stylesheet — host localhost, open a screen, dump DOM, hot-swap `css/`, screenshot (`tools/css-play.mjs` / `playwright-mcp.sh play|dom`). |
| **data-hub** | Data Hub tabs (schedule/standings/last race/live/telemetry/export), F1API / Jolpica / OpenF1, `js/data/*`. |
| **debug-cameras** | Switch or check camera modes, cockpit/chase/orbit/cinematic/roadside shots, `camState`/`viewState`, camera lag. |
| **debug-tracks** | Track geometry, corners, elevation, curvature, map/bounds, wall/barrier audits, terrain-over-road gaps, `groundY`. |
| **game-feel** | Screen shake, weak kerb/wall/gear-shift/collision hits, hit-stop, more responsive camera/particles/audio polish. |
| **garage-parts-livery** | GARAGE parts catalog, livery/finish/shark fin, `ersProfile`/`aeroLoad`, career owned-part UI, Car3D visual recipes. |
| **input-controls** | Steering, gamepad, touch steer, tilt/gyro, keyboard, on-screen steer buttons, driving-help/racing-line assists. |
| **lighting-tuner** | Night looks washed out, dawn sun too high, floodlights not firing, day scene flat, `lightTune`/`applyRaceSettings`; baking a pasted `window.LightPresets` / `LightEdits` blob (`references/bake.md`, `scripts/bake.mjs`, `scripts/merge-proposals.mjs`). |
| **mcp-probe** | Live working-tree canvas via the Chrome DevTools MCP (`chrome_*`) or `probe-mcp.py chrome-start` — poke `__apex`, heap/perf/console during an interactive repro. |
| **multiplayer-debug** | VS FRIEND, WebRTC connection, invite links/QR codes, room codes, Nostr signalling, TURN/ICE, replicated rivals. |
| **new-track** | Adding a circuit or editing geometry/metadata in `js/circuits/`. |
| **playwright-probe** | Headless screenshots/evals — `shot.mjs`, `apex-eval.mjs`, `apex-capture.mjs`; flicker/shimmer/z-fighting via a recorded driven clip (`references/motion-capture.md`); game-loop CPU profile / flame chart (`references/perf-profile.md`). |
| **pwa-cache-service-worker** | `sw.js`, `version.json`, PWA offline install, cache invalidation, shell version guard, DEFERRED backend precache. |
| **race-incidents-control** | Debris, Rapier side-worlds, incident takeovers, car launches/pileups, cautions, VSC, safety car, reliability retirements. |
| **restructure-screens-css** | Restructuring screens, menus, dialogs, DOM, or the CSS class/token system — collapsing duplicate component families. |
| **scenery-dress** | Writing/editing a track's `scenery(api)` callback (trees, buildings, barriers, mountains); `TrackGraph.instance` migration, graph parity, `batches()`/`bakeOnly` (`references/instancing.md`). |
| **season-mode** | Standalone Season calendar, weekend format, sprint, quali-on/off, points table, `season-cal.js`, `season-ui.js`. |
| **slim-bloat** | Fat SKILL.md, saturated size ratchet, dead or duplicate code, stale comments, extract/split candidates. |
| **survey-track** | End-to-end circuit accuracy: survey → diagnose geometry → edit → verify → ship (orchestrates scenery/debug/probe + ground-profile). |
| **survey-ui-matrix** | Reviewing the whole UI across orientations, viewport shapes, UI/HUD scale and pointer type — `playwright-official` `browser_*` resize/DOM/CSS or `layout-audit.mjs`; enumerate screens from source, measure each cell, capture. |
| **tune-physics** | A/B testing or tuning driving physics via headless `obs/act/reset`. |
| **ui-menu-a11y** | Menus, dialogs, Escape/back behavior, keyboard navigation, selected-state announcements, scroll affordances, touch layout. |
| **webgl-debug** | Blank/dark GLX canvas, shadow acne, bloom, HDR, shader/uniform bugs, GLX renderer artifacts. |
| **webgpu-debug** | WGX black screen, NaN-white road, WGSL failures, device lost, MSAA/HDR, `wgx-validate` with real Dawn. |

Cache busting is the deploy's job: the committed shell reads `?v=dev` on
every tag and `pages.yml` stamps content hashes while staging. Nothing to
bump after a `js/`/`css/` edit; after a `tools/manifest.cjs` change run
`node tools/gen/gen-shell.mjs` (check-changes `references/bump.md`).

See individual `SKILL.md` files under this directory for full workflows.
