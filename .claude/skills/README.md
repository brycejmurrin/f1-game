# Apex 26 developer skills

Project skills for recurring agent workflows. Each is a `SKILL.md` (auto-matched
from its `description`, or via `/<name>`), grounded in `__apex`,
`tools/track/verify-track.cjs`, and `npm run test:*` groups.

**A skill is when/how, not the command.** The CLI lives under `tools/`. Local CLIs and their `apex_*` MCP adapters are cataloged in the generated tool
map; adapter availability depends on the host. Full map (servers, wrap table,
never-wrap): [`docs/AGENT-SURFACE.md`](../../docs/AGENT-SURFACE.md).

Descriptions say **when** to load the skill; bodies carry the workflow and
`references/` carry the detail. Canonical directories and smoke recipes are checked together. Historical folds:
 `docs/notes/AGENT-TOOLING-RESEARCH-2026-09-22.md` §4.2.

**A merge is only correct when the hub's `description` absorbs the trigger
words.** That is what a host auto-selects on, so a fold that leaves the
vocabulary behind makes the workflow unreachable — the reason `ai-racecraft`,
`input-controls`, `season-mode`, `data-hub`, `asset-pack` and `slim-bloat`
stayed separate in the 2026-09-03 pass.

| Skill | Use it when |
|---|---|
| **agent-fleet** | One session orchestrating sibling workers (Claude Code, Cursor, Grok): the launch template, the PR `fleet` block, `@orchestrator BLOCKED:` escalation, per-vendor spawn/message tools (`references/orchestrator.md`); the worker loop plan → verify → screenshot → draft PR → subscribe → fix (`references/worker.md`). |
| **agent-view** | Drive Apex 26 without screenshots — `world()`, `field()`, `rollout()`, headless lap, deterministic runs; telemetry / slip-grip / field gaps / sector timing / `lightState` / the headless `reset`-`act` loop (`references/state.md`); track geometry, corners, elevation, curvature, map/bounds, wall audits, `groundY` (`references/track-geometry.md`); read-only: the fix for what it finds is new-track / survey-track. |
| **ai-racecraft** | AI overtakes too aggressive/passive, brake targets, preferred lane, ERS deploy, stuck/unstuck AI (`caution().level` 0, `stuckT` growing; a flag or safety car stuck out is race-incidents-control), `js/physics/ai-drive.js`. |
| **asset-pack** | Missing/wrong/garbled baked PBR materials in `assets/pack` (TLX garble included; read `__apex.assets().uploaded` first), MAT-layer mismatches, `js/render/shared/assets.js` / `tools/gen/assets.mjs`, `matTexMix` / `__apex.assets()` / `matTex()`. |
| **audio-debug** | Engine sounds flat at high speed, sfx not triggering, gear-shift audio wrong, music cuts out, WebAudio debugging. |
| **career-mode** | DRIVER CAREER, MY TEAM, career saves, contracts, sponsors, R&D economy, career qualifying, reliability/DNFs. |
| **check-changes** | Pre-push validation — `verify-change.mjs --fast` / `--plan` + batched `test-bg`; generated shell/cache policy (`references/bump.md`), a Playwright timeout triage (`references/triage.md`), merging with / pushing to the deploy branch (`references/deploy.md`). |
| **css-play** | Iterating on one menu/HUD stylesheet — host localhost, open a screen, dump DOM, hot-swap `css/`, screenshot (`tools/ui/css-play.mjs` / `playwright-mcp.sh play|dom`); restructuring screens/DOM/the class-token system, and whether a CSS methodology is worth adopting (`references/restructure.md`). |
| **data-hub** | Data Hub tabs (schedule/standings/last race/live/telemetry/export), F1API / Jolpica / OpenF1, `js/data/*`, WATCH/HIGHLIGHTS wrong driver/race (a camera snap after a seek is replay-camera). |
| **garage-parts-livery** | GARAGE parts catalog, livery/finish/shark fin, `ersProfile`/`aeroLoad`, career owned-part UI, Car3D visual recipes. |
| **input-controls** | Steering, gamepad, touch steer, tilt/gyro, keyboard, on-screen steer buttons, driving-help/racing-line assists, GRIP STEER; owns the STEER sliders (tune-physics owns them as `setPhysics` A/B knobs). |
| **lighting-tuner** | Night looks washed out, dawn sun too high, floodlights not firing, day scene flat, `lightTune`/`applyRaceSettings`; baking a pasted `window.LightPresets` / `LightEdits` blob (`references/bake.md`, `scripts/bake.mjs`, `scripts/merge-proposals.mjs`). |
| **mcp-probe** | Live working-tree canvas via the Chrome DevTools MCP (`chrome_*`) or `probe-mcp.py chrome-start` — poke `__apex`, heap/perf/console during an interactive repro. |
| **multiplayer-debug** | VS FRIEND, WebRTC connection, phone-as-controller pairing, invite links/QR codes, room codes, build handshakes, Nostr signalling, TURN/ICE, replicated rivals, net determinism. |
| **new-track** | Adding a circuit or editing geometry/metadata in `js/circuits/`. |
| **phone-browser** | User on a phone wants the game in Chromium through the custom Grok connector (`browser_open` / `browser-http-up.mjs`); not chrome-devtools, Playwright, or a desktop shell. Stays off `.mcp.json`. |
| **playwright-probe** | Parent-owned headless screenshots/evals — `shot.mjs`, `apex-eval.mjs`, `apex-capture.mjs`; flicker/shimmer/z-fighting via a recorded driven clip (`references/motion-capture.md`); game-loop CPU profile / flame chart (`references/perf-profile.md`); the isolated car studio — livery, sponsors, part geometry (`references/car-studio.md`); camera modes, `orbit()` vs `snapCam()`, framing a corner (`references/cameras.md`). |
| **pwa-cache-service-worker** | `sw.js`, `version.json`, PWA offline install, cache invalidation, shell version guard, DEFERRED backend precache. |
| **race-incidents-control** | Debris, Rapier side-worlds, incident takeovers, car launches/pileups, cautions, VSC, safety car stuck out (`caution().level` ≠ 0 / `sinceT` growing), reliability retirements. |
| **scenery-dress** | Writing/editing a track's `scenery(api)` callback (trees, buildings, barriers, mountains, floodlight masts; whether lights fire is lighting-tuner); `TrackGraph.instance` migration, graph parity, `batches()`/`bakeOnly` (`references/instancing.md`). |
| **season-mode** | Standalone Season calendar, weekend format, sprint, quali-on/off, points table, `season-cal.js`, `season-ui.js`. |
| **slim-bloat** | Fat SKILL.md, saturated size ratchet, dead or duplicate code, stale comments, extract/split candidates. |
| **steward** | Driving a PR to green here — CI/Pages red, a PR event or check-in, a base merge conflict, a fix push to validate. Only the Apex 26 overrides: the draft/ready dedupe that makes `cancelled` normal, `sync-pr.mjs` over a hand merge, `who-is-on-it.mjs` before a red on the shared deploy branch, the gate a fix push clears, and what "live" means. |
| **survey-track** | Browser-free track-surveyor analysis + parent captures for end-to-end circuit accuracy: survey → diagnose geometry → edit → verify → ship (orchestrates scenery/debug/probe + ground-profile). |
| **track-realism** | Reusable or parallel multi-circuit realism campaign: dated web evidence, exclusive circuit pairs, geometry/scenery/model budgets, parent-owned captures and verification. |
| **survey-ui-matrix** | Parent-owned review of the whole UI across orientations, viewport shapes, UI/HUD scale and pointer type — `playwright-official` `browser_*` resize/DOM/CSS or `layout-audit.mjs`; enumerate screens from source, measure each cell, capture. |
| **tune-physics** | A/B testing or tuning driving physics via headless `obs/act/reset`; game feel / juice — shake, hit-stop, kerb and collision feedback that must not touch determinism (`references/game-feel.md`). |
| **ui-menu-a11y** | Menus, dialogs, Escape/back behavior, keyboard navigation, selected-state announcements, scroll affordances, UI scale, touch layout; owns a cramped / clipped screen or short landscape phone (css-play keeps the edit loop). |
| **renderer-debug** | A wrong or black canvas on any backend — step 0 reads `diag().env.backend` (`three` = TLX, the default; `webgl2` = GLX; `webgpu` = WGX). TLX gates and `tlxForceGL`; GLX HDR/shadow acne/bloom/GL errors/uniform-array lights; WGX NaN-white road, WGSL validation (`wgx-validate --static` first), device lost, silent fallback to WebGL2 (`references/glx.md`, `glx-failures.md`, `wgx.md`, `wgx-defects.md`). |
| **replay-camera** | WATCH/HIGHLIGHTS camera seeks, follow/exit/reentry anchors; offline fixture then serialized rendered lifecycle probe. |
| **f1-animation-cameras** | Garage/Flyby/broadcast camera motion, framing, shot transitions and camera tuners (replay seeks → replay-camera; WATCH wrong driver → data-hub); local game guide and deterministic evidence. |

`node tools/check/skill-smoke.mjs --all --plan` validates the machine-readable
catalog without execution or browser boot. Use `--skill <name> --check` for one
bounded offline contract. `--all --check` runs contracts serially; its JSON
keeps browser and target-device evidence explicitly unverified. A plan, skipped
contract or tool transport response never counts as domain verification.

The committed shell reads `?v=dev` on every tag and the deploy stamps content
hashes while staging: nothing to bump after a `js/`/`css/` edit; after a
`tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs` (check-changes
`references/bump.md`).

**Routing that used to sit in the descriptions** (moved out 2026-09-16 — a
description is loaded every turn; this table is not): hook catalogs →
agent-view; a live canvas → mcp-probe; live `version.json` → deploy-research;
editing a circuit → new-track; a picture-driven accuracy pass → survey-track;
reusable or parallel multi-track realism → track-realism;
whole-UI review → survey-ui-matrix; a single layout bug → ui-menu-a11y;
canvas/3D shots → playwright-probe; restructure decisions → css-play; a new
lighting knob across backends → `../../docs/ARCHITECTURE.md` §Cross-backend
parity.

Subagents (`../agents/`) take the noisy jobs a skill hands off: **verify-agent**
(a read-only `verify-change --fast` verdict; `--base <ref>` answers "was it
already red?"), **bloat-auditor** (BLOAT rows for slim-bloat),
**ci-red-triage** (a red ci.yml / pages.yml run: which test, assertion, lane; was the base already red), **deploy-research** (public web / live `version.json`), **track-surveyor** (one
circuit's def + scenery pair), **physics-contract-auditor** (curvature columns).

See individual `SKILL.md` files under this directory for full workflows.
