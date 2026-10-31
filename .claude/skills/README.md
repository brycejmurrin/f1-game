# Apex 26 developer skills

Project skills for recurring agent workflows. Each is a `SKILL.md` (auto-matched
from its `description`, or via `/<name>`), grounded in `__apex`,
`tools/track/verify-track.cjs`, and `npm run test:*` groups.

**A skill is when/how, not the command.** The CLI lives under `tools/`. Local CLIs and their `apex_*` MCP adapters are cataloged in the generated tool
map; adapter availability depends on the host. Full map (servers, wrap table,
never-wrap): [`docs/AGENT-SURFACE.md`](../../docs/AGENT-SURFACE.md).

Descriptions say **when** to load the skill; bodies carry the workflow and
`references/` carry the detail. Current verification commands and gate meanings
live in [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md), so skill text
should link there instead of restating the ladder. Long references start with a
contents index and should expose the same compact contract: **Use when**,
**Inputs**, **Procedure**, **Verification**, and **Writes/ownership**. Split a
reference when it serves different tool families or ownership boundaries;
leave a short index reference linking the parts. Canonical directories and smoke recipes are checked together. Historical folds:
 the 2026-09-22 tooling research note §4.2. Folded 2026-10-26: `flake-rerun` and
 `gen-regen` → check-changes `references/triage.md`; `pages-red-triage` → agent `ci-red-triage`;
 `perf-memory-census` → mcp-probe §Census tools; `ci-watch` (Merge Desk era) deleted, PR sweeps
 are steward + `tools/ci/pr-board.mjs`; the unrouted `compound-*` opt-in stubs deleted.

**A merge is only correct when the hub's `description` absorbs the trigger
words.** That is what a host auto-selects on, so a fold that leaves the
vocabulary behind makes the workflow unreachable — the reason `ai-racecraft`,
`input-controls`, `season-mode`, `data-hub`, `asset-pack` and `slim-bloat`
stayed separate in the 2026-09-03 pass.

| Skill | Use it when |
|---|---|
| **agent-config** | Editing the agent surface — `AGENTS.md`/`CLAUDE.md`, a `SKILL.md` or its description, subagents (`.claude/agents`), hooks (`.claude/hooks`), routing queries and the A/B routing eval (`tools/check/skill-routing-eval.py`), the description word/char and AGENTS.md byte budgets, `mirror-skills.sh`; owns trimming a fat SKILL.md. Code/docs bloat stays slim-bloat. |
| **agent-view** | Drive Apex 26 without screenshots — `world()`, `field()`, `rollout()`, headless lap, deterministic runs; telemetry / slip-grip / field gaps / sector timing / `lightState` / the headless `reset`-`act` loop (`references/state.md`); track geometry, corners, elevation, curvature, map/bounds, wall audits, `groundY` (`references/track-geometry.md`); read-only: the fix for what it finds is new-track / survey-track. |
| **ai-racecraft** | AI overtakes too aggressive/passive, brake targets, preferred lane, ERS deploy, stuck/unstuck AI (`caution().level` 0, `stuckT` growing; a flag or safety car stuck out is race-incidents-control), `js/physics/ai-drive.js`. |
| **asset-pack** | Missing/wrong/garbled baked PBR materials in `assets/pack` (TLX garble included; read `__apex.assets().uploaded` first), MAT-layer mismatches, `js/render/shared/assets.js` / `tools/gen/assets.mjs`, `matTexMix` / `__apex.assets()` / `matTex()`. |
| **audio-debug** | Engine sounds flat at high speed, sfx not triggering, gear-shift audio wrong, music cuts out, WebAudio debugging. |
| **career-mode** | DRIVER CAREER, MY TEAM, career saves, contracts, sponsors, R&D economy, career qualifying, reliability/DNFs. |
| **check** | `/check` (phone verb): one ≤ 5-line status — `session-status.mjs --pr`, `ci-watch.mjs --once`, a live `test-bg` run, live sha + ancestor-of-live. Read-only. |
| **ship** | `/ship` ("push", "push to the deploy branch"): check-changes → push + draft PR (`lane:<host>`, `Closes #n`, `run-ci`) → `ready-gate` → flip ready + `land` label (GitHub lands it); "skip the gate" goes in the PR body. Never merges. |
| **handoff** | `/handoff`: a paste-ready cold-start prompt (repo, branch + sha verified on the remote, PR, Plan, skills); never a repo-root HANDOFF file. |
| **check-changes** | Pre-push validation — `verify-change.mjs --fast` / `--plan` + batched `test-bg`; generated shell/cache policy (`references/bump.md`), a Playwright timeout triage (`references/triage.md`), the deploy gate's mechanics (`references/deploy.md`). Landing on the deploy branch is ship. |
| **css-play** | Iterating on one menu/HUD stylesheet — host localhost, open a screen, dump DOM, hot-swap `css/`, screenshot (`tools/ui/css-play.mjs` / `playwright-mcp.sh play|dom`); restructuring screens/DOM/the class-token system, and whether a CSS methodology is worth adopting (`references/restructure.md`). |
| **data-hub** | Data Hub tabs (schedule/standings/last race/live/telemetry/export), F1API / Jolpica / OpenF1, `js/data/*`, WATCH/HIGHLIGHTS wrong driver/race (a camera snap after a seek is f1-animation-cameras). |
| **game-feel** | Juice — shake, hit-stop, kerb/wall/shift/collision feedback, particles, haptic cues — as a render/audio layer that must not change physics or determinism (`determinism-replay-vm` proves it). |
| **garage-parts-livery** | GARAGE parts catalog, EDITING livery/finish/shark fin data and paint code, `ersProfile`/`aeroLoad`, career owned-part UI, car mesh/geometry modules. Livery capture is playwright-probe. |
| **input-controls** | Steering, gamepad, touch steer, tilt/gyro, keyboard, on-screen steer buttons, driving-help/racing-line assists, the GRIP STEER slider (its maths is tune-physics); owns the STEER sliders (tune-physics owns them as `setPhysics` A/B knobs); phone first (844×390 touch). |
| **code-nav** | Where a JS symbol is defined (with its body), every use with its enclosing function, callers before an edit, a module's exports, its type, and the errors an edit introduced — the `apex-lsp` MCP (`lsp_*`, `tools/mcp/lsp-mcp.sh`) over TypeScript 7 `tsc --lsp`, instead of grep. |
| **js-debugger** | Source breakpoints, stepping, call stacks, paused locals and exception pauses through the separate debugger MCP or persistent shell wrapper; heap/CPU/hitch while attached (`debugger_profile`); parent-owned existing local Chrome, fresh pause tokens and explicit cleanup. |
| **lighting-tuner** | Night washed out or like day, dawn sun too high, floodlights not firing (dusk/dawn/night gate, lamp cap), flat day scene, ambient/exposure/fog/`lightTune`/`applyRaceSettings`, `lightState` checks, baking a pasted `window.LightPresets` / `LightEdits` blob into `js/lighting/presets.js`. Bloom as a GPU defect is renderer-debug; adding masts is scenery-dress. |
| **mcp-probe** | Live working-tree canvas via the Chrome DevTools MCP (`mcp__chrome-devtools__*`; `chrome_*` in the CLI) or `probe-mcp.py chrome-start` — poke `__apex`, heap/perf/console during an interactive repro; the `tools/perf` census tools (heap, VM leaks, meshes, garage). |
| **multiplayer-debug** | VS FRIEND, WebRTC connection, phone-as-controller pairing, invite links/QR codes, room codes, build handshakes, Nostr signalling, TURN/ICE, replicated rivals, net determinism. |
| **new-track** | Adding a circuit or editing geometry/metadata in `js/circuits/`; the in-game TRACK DESIGNER, custom circuits and share codes (`js/editor/`, `references/editor.md`). |
| **phone-browser** | User on a phone wants the game in Chromium through the custom Grok connector (`browser_open` / `browser-http-up.mjs`); not chrome-devtools, Playwright, or a desktop shell. Stays off `.mcp.json`. |
| **playwright-probe** | Parent-owned headless screenshots/evals — `shot.mjs`, `apex-eval.mjs`, `apex-capture.mjs`; flicker/shimmer/z-fighting via a recorded driven clip (`references/motion-capture.md`); game-loop CPU profile / flame chart (`references/perf-profile.md`); the isolated car studio — livery, sponsors, part geometry (`references/car-studio.md`); camera modes, `orbit()` vs `snapCam()`, framing a corner (`references/cameras.md`). |
| **pwa-cache-service-worker** | `sw.js`, `version.json`, PWA offline install, cache invalidation, shell version guard, DEFERRED backend precache. |
| **race-incidents-control** | Debris, Rapier side-worlds, incident takeovers, car launches/pileups, cautions, VSC, safety car stuck out (`caution().level` ≠ 0 / `sinceT` growing), reliability retirements. |
| **scenery-dress** | Writing/editing a track's `scenery(api)` callback (trees, buildings, barriers, mountains, floodlight masts; whether lights fire is lighting-tuner); `TrackGraph.instance` migration, graph parity, `batches()`/`bakeOnly` (`references/instancing.md`). |
| **season-mode** | Standalone Season calendar, weekend format, sprint, quali-on/off, points table, `season-cal.js`, `season-ui.js`. |
| **slim-bloat** | Saturated size ratchet, dead or duplicate code (dead-CSS proof included), stale comments, extract/split candidates. A fat SKILL.md is agent-config. |
| **steward** | Driving a PR you own to green — CI/Pages red, cancelled, conflicting, a PR event, a fix push to validate. Only the Apex 26 overrides: the draft/ready dedupe that makes `cancelled` normal, `sync-pr.mjs` over a hand merge, `pr-board.mjs` before a red you did not cause, the local floor a fix push clears, what "live" means, and ready-gate → flip → `land` (the session ends there). The contract is skill `worker`; no-subscription watching: `references/host-watch.md`. |
| **worker** | A LAUNCHED lane (dispatcher prompt, `CONTINUE PR #n`, a hand-started `ready` issue): the nine-item contract — claim, draft PR + `run-ci`, floor, watch, `land`, cap, ask by `needs-decision`, takeover, already-fixed; `references/land.md`. The in-session subagent is `.claude/agents/worker.md`, a different thing. |
| **dispatcher** | The hourly dispatcher session: the `dispatch.mjs` cycle and launch gate, the six rules, lock, quota, ask-once, `PAUSE_TRIGGER`, 300k hand-off, Sonnet workers. |
| **challenge** | `/challenge <pr>` (user-only, forked Sonnet subagent): attack ONE PR's claims against the tree and post a COMMENT review; read-only, never approves or lands. |
| **orchestrate** | `/orchestrate [auto\|ask\|ask+] <task>` (user-only): an orchestrator that fans out workers and drives each PR to `land`; `auto` never asks Bryce, `ask` (default) asks reserved items, `ask+` asks each plan/scope decision; `references/levels.md`. |
| **survey-track** | Browser-free track-surveyor analysis + parent captures for end-to-end circuit accuracy: survey → diagnose geometry → edit → verify → ship (orchestrates scenery/debug/probe + ground-profile), one track-surveyor per circuit; multi-circuit realism campaigns with dated evidence packets (`references/campaign.md`, folded from track-realism). |
| **survey-ui-matrix** | Parent-owned review of the whole UI across orientations, viewport shapes, UI/HUD scale and pointer type — `playwright-official` `browser_*` resize/DOM/CSS or `layout-audit.mjs`; enumerate screens from source, measure each cell, capture. |
| **tune-physics** | A/B testing or tuning driving physics via headless `obs/act/reset`; skidpad / ROAD_FOLLOW; the GRIP STEER maths. Juice → **game-feel**. |
| **ui-menu-a11y** | Menus, settings, dialogs, Escape/back behavior, keyboard navigation, selected-state announcements, screen-reader output, aria-selected and aria-pressed state, scroll affordances, UI scale, touch layout; owns a cramped / clipped screen or short landscape phone (css-play keeps the edit loop). |
| **race-weekend** | Tyre wear/compounds (`js/physics/tyre-model.js`), pit stops and the driven pit lane (`js/race/pit-lane.js`), the STRATEGY/tyre HUD, quali and results sheets, start lights, flying start, the weather arc, sporting regs (two-compound rule, SC passes); `__apex.tyres()` / `pit()` / `weatherArc()`. |
| **renderer-debug** | A wrong or black canvas on any backend — step 0 reads `diag().env.backend` (`three` = TLX, the default; `webgl2` = GLX; `webgpu` = WGX). TLX gates and `tlxForceGL`; GLX HDR/shadow acne/bloom/GL errors/uniform-array lights; WGX NaN-white road, WGSL validation (`wgx-validate --static` first), device lost, silent fallback to WebGL2 (`references/glx.md`, `glx-failures.md`, `wgx.md`, `wgx-defects.md`); WebXR/VR in `js/xr/` (`references/xr.md`). |
| **f1-animation-cameras** | Garage/Flyby/broadcast camera motion, framing, shot transitions and camera tuners; FIXING camera lag (measuring it is playwright-probe); WATCH/HIGHLIGHTS replay seeks and follow/exit/reentry anchors (`references/replay.md`, folded from replay-camera; WATCH wrong driver → data-hub); local game guide and deterministic evidence. |

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
reusable or parallel multi-track realism → survey-track `references/campaign.md`;
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
