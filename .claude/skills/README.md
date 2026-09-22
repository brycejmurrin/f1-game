# Apex 26 developer skills

Project skills for recurring agent workflows. Each is a `SKILL.md` (auto-matched
from its `description`, or via `/<name>`), grounded in `__apex`,
`tools/track/verify-track.cjs`, and `npm run test:*` groups.

**A skill is when/how, not the command.** The CLI lives under `tools/`. Ten
CLIs are pinned as `apex_*` MCP tools (eleven tools — `apex_garage` is a
session over one of them); most are not. Full map (three MCP
servers, wrap table, never-wrap): [`docs/AGENT-SURFACE.md`](../../docs/AGENT-SURFACE.md).

Descriptions say **when** to load the skill; bodies carry the workflow and
`references/` carry the detail. 27 skills (44 until 2026-09; which folded into
which: `docs/notes/AGENT-TOOLING-RESEARCH-2026-09-22.md` §4.2).

**A merge is only correct when the hub's `description` absorbs the trigger
words.** That is what a host auto-selects on, so a fold that leaves the
vocabulary behind makes the workflow unreachable — the reason `ai-racecraft`,
`input-controls`, `season-mode`, `data-hub`, `asset-pack` and `slim-bloat`
stayed separate in the 2026-09-03 pass.

| Skill | Use it when |
|---|---|
| **agent-view** | Drive Apex 26 without screenshots — `world()`, `field()`, `rollout()`, headless lap, deterministic runs; telemetry / slip-grip / field gaps / sector timing / `lightState` / the headless `reset`-`act` loop (`references/state.md`); track geometry, corners, elevation, curvature, map/bounds, wall audits, `groundY` (`references/track-geometry.md`). |
| **ai-racecraft** | AI overtakes too aggressive/passive, brake targets, preferred lane, ERS deploy, stuck/unstuck, `js/physics/ai-drive.js`. |
| **asset-pack** | Baking or verifying `assets/pack`, `js/render/shared/assets.js`, `matTexMix`/baked PBR blend, MAT layer mismatches. |
| **audio-debug** | Engine sounds flat at high speed, sfx not triggering, gear-shift audio wrong, music cuts out, WebAudio debugging. |
| **career-mode** | DRIVER CAREER, MY TEAM, career saves, contracts, sponsors, R&D economy, career qualifying, reliability/DNFs. |
| **check-changes** | Pre-push validation — `verify-change.mjs --fast` / `--plan` + batched `test-bg`; the cache bump (`references/bump.md`), a Playwright timeout triage (`references/triage.md`), merging with / pushing to the deploy branch (`references/deploy.md`). |
| **css-play** | Iterating on one menu/HUD stylesheet — host localhost, open a screen, dump DOM, hot-swap `css/`, screenshot (`tools/ui/css-play.mjs` / `playwright-mcp.sh play|dom`); restructuring screens/DOM/the class-token system, and whether a CSS methodology is worth adopting (`references/restructure.md`). |
| **data-hub** | Data Hub tabs (schedule/standings/last race/live/telemetry/export), F1API / Jolpica / OpenF1, `js/data/*`. |
| **garage-parts-livery** | GARAGE parts catalog, livery/finish/shark fin, `ersProfile`/`aeroLoad`, career owned-part UI, Car3D visual recipes. |
| **input-controls** | Steering, gamepad, touch steer, tilt/gyro, keyboard, on-screen steer buttons, driving-help/racing-line assists. |
| **lighting-tuner** | Night looks washed out, dawn sun too high, floodlights not firing, day scene flat, `lightTune`/`applyRaceSettings`; baking a pasted `window.LightPresets` / `LightEdits` blob (`references/bake.md`, `scripts/bake.mjs`, `scripts/merge-proposals.mjs`). |
| **mcp-probe** | Live working-tree canvas via the Chrome DevTools MCP (`chrome_*`) or `probe-mcp.py chrome-start` — poke `__apex`, heap/perf/console during an interactive repro. |
| **multiplayer-debug** | VS FRIEND, WebRTC connection, invite links/QR codes, room codes, Nostr signalling, TURN/ICE, replicated rivals. |
| **new-track** | Adding a circuit or editing geometry/metadata in `js/circuits/`. |
| **playwright-probe** | (forked) Headless screenshots/evals — `shot.mjs`, `apex-eval.mjs`, `apex-capture.mjs`; flicker/shimmer/z-fighting via a recorded driven clip (`references/motion-capture.md`); game-loop CPU profile / flame chart (`references/perf-profile.md`); the isolated car studio — livery, sponsors, part geometry (`references/car-studio.md`); camera modes, `orbit()` vs `snapCam()`, framing a corner (`references/cameras.md`). |
| **pwa-cache-service-worker** | `sw.js`, `version.json`, PWA offline install, cache invalidation, shell version guard, DEFERRED backend precache. |
| **race-incidents-control** | Debris, Rapier side-worlds, incident takeovers, car launches/pileups, cautions, VSC, safety car, reliability retirements. |
| **scenery-dress** | Writing/editing a track's `scenery(api)` callback (trees, buildings, barriers, mountains); `TrackGraph.instance` migration, graph parity, `batches()`/`bakeOnly` (`references/instancing.md`). |
| **season-mode** | Standalone Season calendar, weekend format, sprint, quali-on/off, points table, `season-cal.js`, `season-ui.js`. |
| **slim-bloat** | Fat SKILL.md, saturated size ratchet, dead or duplicate code, stale comments, extract/split candidates. |
| **steward** | Driving a PR to green here — CI/Pages red, a PR event or check-in, a base merge conflict, a fix push to validate. Only the Apex 26 overrides: the push/PR dedupe that makes `cancelled` normal, `sync-pr.mjs` over a hand merge, `who-is-on-it.mjs` before a red on the shared deploy branch, the gate a fix push clears, and what "live" means. |
| **survey-track** | (forked, track-surveyor) End-to-end circuit accuracy: survey → diagnose geometry → edit → verify → ship (orchestrates scenery/debug/probe + ground-profile). |
| **survey-ui-matrix** | (forked) Reviewing the whole UI across orientations, viewport shapes, UI/HUD scale and pointer type — `playwright-official` `browser_*` resize/DOM/CSS or `layout-audit.mjs`; enumerate screens from source, measure each cell, capture. |
| **tune-physics** | A/B testing or tuning driving physics via headless `obs/act/reset`; game feel / juice — shake, hit-stop, kerb and collision feedback that must not touch determinism (`references/game-feel.md`). |
| **ui-menu-a11y** | Menus, dialogs, Escape/back behavior, keyboard navigation, selected-state announcements, scroll affordances, touch layout. |
| **webgl-debug** | Blank/dark GLX canvas, shadow acne, bloom, HDR, shader/uniform bugs, GLX renderer artifacts. |
| **webgpu-debug** | WGX black screen, NaN-white road, WGSL compile/validation failures, device lost, silent fallback to WebGL2. |

The committed shell reads `?v=dev` on every tag and the deploy stamps content
hashes while staging: nothing to bump after a `js/`/`css/` edit; after a
`tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs` (check-changes
`references/bump.md`).

**Routing that used to sit in the descriptions** (moved out 2026-09-16 — a
description is loaded every turn; this table is not): hook catalogs →
agent-view; a live canvas → mcp-probe; live `version.json` → deploy-research;
editing a circuit → new-track; a picture-driven accuracy pass → survey-track;
whole-UI review → survey-ui-matrix; a single layout bug → ui-menu-a11y;
canvas/3D shots → playwright-probe; restructure decisions → css-play; a new
lighting knob across backends → `../../docs/ARCHITECTURE.md` §Cross-backend
parity.

Subagents (`../agents/`) take the noisy jobs a skill hands off: **verify-agent**
(a read-only `verify-change --fast` verdict; `--base <ref>` answers "was it
already red?"), **bloat-auditor** (BLOAT rows for slim-bloat),
**deploy-research** (public web / live `version.json`), **track-surveyor** (one
circuit's def + scenery pair), **physics-contract-auditor** (curvature columns).

See individual `SKILL.md` files under this directory for full workflows.
