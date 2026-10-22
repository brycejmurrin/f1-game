COMMON BLOCK (every wave-1 lane)
ORCHESTRATOR: claude:session_012Rf9fHiy2exPfFWA5Vfwrg (OrchA 22; `node tools/ci/fleet-bus.mjs who A`).
USER GRANTS: Bryce, 2026-10-22 ~06:05Z, typed in the orchestrator session: "Now let's launch a few agents to hunt for bugs, a few to bring storm new ideas, a few to review open issues and check if they are relevant I think panels are old and inaccurate. Give each a complete prompt with instructions use skills mcps tools etc to help and web search and svreenshots". Bryce, ~05:59Z: "tell them to always message you and subscribe to their prs". Standing authority: AGENTS.md §Concurrent PRs.
MODE/SEED: permission_mode auto; source_revision claude/f1-game-project-26h3ng (deploy branch); fleet A.

FIRST 10 MINUTES:
1. Read AGENTS.md (CLAUDE.md imports it), .claude/rules/fleet-core.md, skill agent-fleet (references/worker.md, role-pr-owner.md §Monitoring), then the skills named in your brief. Call `__apex.agentHelp()` once if you touch the game (`node tools/shot/agent.mjs monza help` from a shell).
2. Twin guard: `node tools/ci/who-is-on-it.mjs` + `node tools/ci/pr-board.mjs`; stand down on any path with a live claim or a branch pushed <15 min ago. Fleet D (Cursor/Grok) owns right now: js/render/three/tlx-post.js, js/perf/governor.js, js/physics/*, js/audio/voice-pack.js, js/ui/select-screen.js, js/ui/sheet-shape.js, js/track/build-worker.js, js/track/tracks.js, js/ui/settings-tabs.js + title-menu/flow, js/ui/photo-studio.js, cockpit-finishes, helmet visor, js/input/input.js, js/ui/hud-inputs.js, js/race/race-insights.js, #loading plate, gfx ctx-loss budget — FORBIDDEN for you.
3. `node tools/ci/who-is-on-it.mjs --claim "[A·<slot>] <scope>"`; `--release` when you stop.
4. send_message the ORCHESTRATOR: `STARTED <slot> <one line plan>`.

TOOLS YOU SHOULD USE (cheapest first, AGENTS.md §Seeing the game):
- MCP apex-lsp (lsp_definition/references/callers/outline/diagnostics) for any JS symbol — skill code-nav; never grep a symbol.
- MCP apex-tools: apex_status (first), apex_agent / apex_eval / apex_shot / apex_hud_shot / apex_ui_shot / apex_ui_inspect / apex_ui_fit / apex_track_audit / apex_profile / apex_pick_tests / apex_select_specs / apex_unit_test / apex_who_is_on_it.
- `__apex` JSON hooks (info/probe/physState/world/scene/field/obs) via `node tools/shot/agent.mjs <track> <cmd>` — assertable, first choice.
- MCP js-debugger (breakpoints, scopes; skill js-debugger), MCP chrome-devtools (live canvas, console, perf traces, heap; skill mcp-probe), MCP playwright-official (menus/HUD like a player at 844x390 landscape, touch). ONE browser at a time: browser_close before chrome-devtools; never while a Playwright test run is live.
- SCREENSHOTS: yes, as visual evidence (≤ 25 per lane). Phone first: 844x390 landscape, touch profile, shipped settings (Bryce plays on an iPhone). This box has no GPU (SwiftShader; renderers blit onto #game-soft, wait on awaitSoftPresent()). Publish evidence with `node tools/shot/publish-evidence.mjs --dir artifacts/<capture> --label <slug> --publish` and link the release assets; never commit images. A Claude artifact gallery (Artifact tool) is fine for Bryce to look at.
- WEB RESEARCH (WebSearch / WebFetch / Context7 for library APIs / TinyFish search+fetch): cite URLs in your note and PR body. Real F1 facts (2026 regs, circuits, tyre rules) come from the web, not memory.
- Subagents: ≤ 2 nested (code-hunter, finding-verifier, prior-art-scout, ci-red-triage, verify-agent); never hand a subagent a browser run.
- Verify per AGENTS.md table: `node tools/ci/pick-tests.mjs`, `node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet`, one spec via `node tools/ci/test-bg.mjs` in the background; whole browser groups go to `node tools/ci/remote-group.mjs <group>` on the pushed branch, not local. `npm run test:tooling-fast` before every code push.

PR + REPORTING (Bryce's order — always message the orchestrator):
- Branch `cursor/<topic>-<hash>` from the deploy tip. Open a DRAFT PR (GitHub MCP create_pull_request, draft true, base claude/f1-game-project-26h3ng) at your first commit, body from .github/pull_request_template.md with the fleet block (worker: claude:<your id>, fleet: A, slot: <slot>, orchestrator: A, owned, state, blocker, needs-orchestrator) and the `fleet-status:` line; add label `run-ci`.
- Right after opening each PR: `subscribe_pr_activity` on it (if it fails, say so and rely on the timer), `send_later` check-in every ~5 min while the PR is open (one at a time, re-armed), and a Monitor on `node tools/ci/ci-watch.mjs --sha <head> --timeout 30 --failures-only` after each push.
- send_message the ORCHESTRATOR on every state change: `NEW-PR <#> <branch> <sha> <summary>`, `REPORT <slot> <PR#|none> <sha> <verdict/note>`, `BLOCKED <slot> <question>` (also state: blocked + needs-orchestrator: yes + PR comment `@orchestrator BLOCKED: …`), `READY <PR> <head sha>` (only after `ci-watch --once` = ci passed AND `node tools/ci/ready-gate.mjs --pr <n>` exit 0), `FINAL <slot> <note path>`. Also post READY/FINAL on the bus: `node tools/ci/fleet-bus.mjs send READY --to A --as claude:<your id> "…"`. No message on an unchanged state.
- You own your PRs to READY (sync only when CONFLICTING/DIRTY or a required tip check is red: `node tools/ci/sync-pr.mjs <branch>`; merge, never force/rebase). Game PRs (js/ css/ assets/ index.html sw.js) are paced by the orchestrator.
PUSH: when your own cycle is green, and before any browser run or wait over ~10 min.
Never: skip/quarantine a test or widen a tolerance, edit a generated file by hand (npm run gen), edit .claude/**, cancel an Actions run, start a session.
Mark ready only after ready-gate.mjs exits 0.
Do not enable auto-merge or merge.
