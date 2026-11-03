# Apex 26 developer skills

Project skills for recurring agent workflows. Each is a `SKILL.md` (auto-matched
from its `description`, or via `/<name>`), grounded in `__apex`,
`tools/track/verify-track.cjs`, and the PR's CI tiers.

**A skill is when/how, not the command.** The CLI lives under `tools/`. Local CLIs and their `apex_*` MCP adapters are
cataloged in the generated tool map; adapter availability depends on the host. Full map (servers, wrap table,
never-wrap): [`docs/AGENT-SURFACE.md`](../../docs/AGENT-SURFACE.md).

Descriptions say **when** to load the skill (the description is what a host routes on; the table below is a
pointer, not a second router); bodies carry the workflow and `references/` carry the detail. Current verification
commands and gate meanings live in [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md), so skill text links there
instead of restating the ladder. Long references start with a contents index. A skill whose work IS a file family
also carries `paths:` (file-scoped auto-load). Routing is checked by `tests/unit/skill-descriptions.test.mjs` against
`tests/data/skill-routing/phone.json` (three prompts in Bryce's register plus one near-miss per skill).

**A merge is only correct when the hub's `description` absorbs the trigger words.** That is what a host
auto-selects on, so a fold that leaves the vocabulary behind makes the workflow unreachable.

| Skill | One line |
|---|---|
| **agent-config** | editing skills, AGENTS.md, rules, subagents, hooks; the description budgets |
| **agent-view** | reading or driving the game without screenshots (`__apex`, headless laps, track geometry) |
| **ai-racecraft** | AI cars racing wrong (`js/physics/ai-*.js`) |
| **asset-pack** | baked PBR materials, MAT layers, GLB models |
| **audio-debug** | silence, engine pitch, sfx, music |
| **career-mode** | DRIVER CAREER / MY TEAM saves, contracts, R&D |
| **challenge** | `/challenge <pr>`: an adversarial read-only review of one PR (user-only) |
| **check** | `/check`: one ≤ 6-line status — PR, CI, gate, live |
| **check-changes** | which tests a change needs, the local floor, background runs, timeouts |
| **code-nav** | a JS symbol through `apex-lsp`, not grep |
| **css-play** | one menu/HUD element's styling, or a CSS restructure (`css/**`) |
| **data-hub** | Data Hub tabs and the F1 data feeds |
| **dispatcher** | how workers get launched: the dispatch Action, `dispatch.mjs --plan`, the Board |
| **f1-animation-cameras** | camera and animation motion, replay cameras |
| **game-feel** | shake, hit-stop, sparks, haptics — without changing physics |
| **garage-parts-livery** | the GARAGE parts catalog, liveries, car meshes |
| **handoff** | `/handoff`: a paste-ready cold-start prompt; the cap |
| **input-controls** | steering, touch, gamepad, tilt, assists |
| **js-debugger** | breakpoints, stepping, profiles through the debugger MCP |
| **lighting-tuner** | night/dawn/floodlights, exposure, baking presets |
| **mcp-probe** | poking the live game through the DevTools MCP |
| **multiplayer-debug** | VS FRIEND, pairing, WebRTC, lobby |
| **new-track** | adding a circuit or changing its layout (`js/circuits/**`); the TRACK DESIGNER |
| **phone-bridge** | measuring live play on Bryce's iPhone through the issue bridge |
| **phone-browser** | playing the working tree from a phone through the Grok connector |
| **playwright-probe** | batch headless screenshots, evals, profiles, CAR STUDIO |
| **pwa-cache-service-worker** | `sw.js`, `version.json`, the PWA manifest, stale shells |
| **race-incidents-control** | debris, flags, VSC, safety car, retirements |
| **race-weekend** | tyres, pit stops, strategy HUD, quali, weather, sporting rules |
| **renderer-debug** | a wrong or black canvas on TLX/GLX/WGX (`js/render/**`) |
| **scenery-dress** | track scenery: props, grandstands, barriers, `scenery(api)` |
| **season-mode** | the standalone Season screen |
| **ship** | `/ship`: push, draft PR, ready, land — a pointer at steward §Open / §Land (user-only) |
| **slim-bloat** | files or docs too big: ratchets, dead code, unused CSS |
| **steward** | you own a PR at any stage: lane, open, push, red, land, after land |
| **survey-track** | a circuit that does not match the real place |
| **survey-ui-matrix** | every screen across sizes, orientations, touch vs mouse |
| **tune-physics** | the car handles wrong (`js/physics/**`) |
| **ui-menu-a11y** | menus, focus, keyboard, screen readers, a cramped phone screen (`css/**`) |

The committed shell reads `?v=dev` on every tag and the deploy stamps content
hashes while staging: nothing to bump after a `js/`/`css/` edit; after a
`tools/manifest.cjs` change run `node tools/gen/gen-shell.mjs` (check-changes
`references/bump.md`).

Subagents (`../agents/`) take the noisy jobs a skill hands off: **verify-agent**
(a read-only `verify-change --fast` verdict; `--base <ref>` answers "was it
already red?"), **ci-red-triage** (a red ci.yml / pages.yml run: which test, assertion, lane; was the base already
red), **deploy-research** (public web / live `version.json`), **track-surveyor** (one circuit's def + scenery pair),
**physics-contract-auditor** (curvature columns), **surface-reviewer** (cross-file claims of the agent surface).
Historical folds: `docs/notes/SKILL-REVIEW-2026-10-28.md` and the 2026-11-03 reset
(`docs/plans/2026-11-03-agent-surface-reset.md` §4.5: `worker` and `ship` folded into `steward`, `orchestrate` deleted).

See individual `SKILL.md` files under this directory for full workflows.
