# Apex 26 developer skills

Project skills for recurring agent workflows. Each is a `SKILL.md` (auto-matched
from its `description`, or via `/<name>`), grounded in `__apex`,
`tools/verify-track.cjs`, and `npm run test:*` groups.

**A skill is when/how, not the command.** The CLI lives under `tools/`. Some
CLIs are pinned as `apex_*` MCP tools; most are not. Full map (four MCP
servers, wrap table, never-wrap): [`docs/AGENT-SURFACE.md`](../../docs/AGENT-SURFACE.md).

Descriptions say **when** to load the skill; bodies carry the workflow.

| Skill | Use it when |
|---|---|
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
| **survey-ui-matrix** | Reviewing the whole UI across orientations, viewport shapes, UI/HUD scale and pointer type with the Chrome DevTools MCP — enumerate screens from source, measure each cell, capture. |
| **restructure-screens-css** | Restructuring/consolidating screens, menus, dialogs, the DOM or the CSS class/token system — collapsing duplicate families, adding/removing a layer, the split-index.html question, height-responsive design. |
| **ui-menu-a11y** | Menus/dialogs, Escape/back, keyboard nav, UI scale, AriaState, layout tests. |
| **multiplayer-debug** | VS FRIEND / WebRTC — loopback, invite SDP, room codes, ICE/TURN, authority. |
| **career-mode** | DRIVER / MY TEAM career — saves, economy, R&D, quali/reliability weekend flow. |
| **season-mode** | Standalone Season calendar + weekend format (`season-cal` / `season-ui`); career stays on `Tracks.SEASON`. |
| **input-controls** | Gamepad / touch / tilt / keyboard / driving-help assists — devices, not forces. |
| **data-hub** | Data Hub tabs + F1API / `js/data/` — empty/stale/wrong-year tabs. |
| **ai-racecraft** | AI OT/brake/lane/ERS + driver-rating axes (`ai-drive.js`). |
| **race-incidents-control** | Debris, incident takeovers, race-control flags, caution/VSC/SC, determinism. |
| **debug-cameras** | The 13 camera modes + free framing hooks (`view`/`eyeAt`/`orbit`/…). |
| **debug-tracks** | Track geometry/surface/barrier query hooks + multi-track sweeps. |
| **debug-state** | Live race/physics/lighting telemetry + headless `act`/`obs`/`reset`. |
| **agent-view** | Perceive and drive the game as text — `__apex` agent-view + `tools/agent.mjs`. |
| **playwright-probe** | Headless screenshots/evals — `shot.mjs`, `apex-eval.mjs`, `apex-capture.mjs`. |
| **mcp-probe** | Driving the LIVE game or DEPLOYED site interactively — Chrome DevTools MCP + tinyfish, unified via `tools/probe-mcp.py` (`chrome_*` / `tinyfish_*`; `chrome-start` daemon for multi-call state; TinyFish requires one-time setup plus an injected key). Local CLI pins → `apex-tools` / `./tools/apex-tools-mcp.sh`, not this skill. |
| **motion-capture** | Temporal artifacts while driving (flicker/shimmer/crawl) — `tools/capture/motion-capture.mjs`. |
| **audio-debug** | WebAudio synth — engine pitch, sfx, music layers, mute/volume. |
| **perf-profile** | Headless V8 CPU flame chart of the game loop (Playwright CDP). |
| **lighting-tuner** | Scene lighting — `lightTune`, time-of-day/weather, `lightState`, orbit shots. |
| **bake-lighting** | Baking a pasted `window.LightPresets = {…}` export into shipped presets. |
| **webgl-debug** | WebGL2/GLX issues — lights, shadows, bloom, shader compile, GL errors. |
| **webgpu-debug** | WebGPU/WGX issues — black screen, WGSL derivative uniformity, GPU validation errors, device-loss ladder, `wgx-validate.mjs --static` (full Dawn parent-only). |
| **game-feel** | Juice/feedback on Apex systems (camera/particles/audio/skids) without touching physics. |
| **scene-graph-instancing** | Migrating scenery emitters to `TrackGraph`, graph parity, instanced draws, `bakeOnly`. |
| **garage-parts-livery** | Parts catalog, SIGNATURE/FACTORY presets, garage UI, livery finish/fin, ERS/aero load. |
| **asset-pack** | Baking/verifying `assets/pack`, MAT layers, `matTexMix`, procedural fallback. |
| **pwa-cache-service-worker** | `sw.js` precache, `version.json` network-first, DEFERRED optional assets, stale PWA. |

The debug-* skills pair with `tools/apex-eval.mjs` / `tools/capture/apex-capture.mjs` so
changes are validated visually, not just asserted.

**Route:** deploy/`version.json` → `deploy-research`; pre-push → `verify-agent`;
live canvas → `mcp-probe`; local CLI pins → `apex-tools`. Do not attach
`mcp-probe` for a version.json check. Wrap table: `docs/AGENT-SURFACE.md`.

Output paths: batch/test under `artifacts/`, human-reviewed captures under
`scratch/` (see `AGENTS.md`).

Design principles:
- **No build step** — refresh `?v=<sha256>` + shell generation in `version.json` on asset edits (`tools/bump-cache.mjs`).
- **Debug-hooks first** — assert via `__apex`, not brittle magnitudes.
- **Headless verify-track** — fast pre-push guard for circuit/track engine edits.
- **Progressive disclosure** — keep `SKILL.md` short (when / entry / hard
  don'ts / dispatch). Move war stories and long recipes to
  `references/*.md` or `docs/` and `Read` them only when the task needs them.
  Fat always-loaded skills burn tokens; `mcp-probe` is the template.
  Official cap is 500 lines
  (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices);
  the project template is thinner. `tests/unit/skill-progressive.test.mjs` holds both.
  Cursor `paths:` on file-family skills (`webgpu-debug`, `webgl-debug`,
  `new-track`, `scenery-dress`) so they surface only when matching files are in
  play; leave it unset on cross-cutting skills (`check-changes`, `bump-cache`,
  `deploy-merge`).
- **Description = what + when** — third person, under 1024 chars, must contain
  a trigger (`Use when` / `Use proactively`). Vague descriptions ("helps with
  documents") fail discovery in a 38-skill library.
- **One command over a ritual** — `verify-change.mjs` composes pick-tests +
  the fast gate + batched groups; skills should name the composer, not restated
  five-step prose.
