# Dead-tools survey — tools/{ci,env,lib,mcp,check,gen,shot} (2026-10-27, read-only)

Method: one node pass (`scratchpad/r2dead/refs.mjs`) over 328 scripts (.mjs/.cjs/.js/.sh/.py; json/dirs skipped).
Per basename, a path-anchored match counted in: package.json, .github/, tools/ (minus the script itself and tools/**/*.md,
i.e. the generated tools/README.md), tests/unit, tests/ (other), .claude/{skills,agents,hooks,rules,settings.json},
AGENTS.md, docs/, .mcp.json, .cursor+.codex. Classes: LIVE = a package.json/workflow/tools/.mcp.json caller;
DOC-ONLY = no code caller, but a skill/hook/rule/AGENTS.md names it; TEST-ONLY = only tests (+docs); ORPHAN = none.
Caveats: `docs/agent-output/{catalog,policies}.json` are generated and list every @doc tool, so every docs count is
inflated by 2; a LIVE hit can be a comment mention in another tool (over-counts LIVE, never under-counts).

Totals: LIVE 273 | DOC-ONLY 14 | TEST-ONLY 39 | ORPHAN 2.

## ORPHAN (no reference outside generated catalogs / tools/README.md)
| class | path | callers | action |
|---|---|---|---|
| ORPHAN | check-doctor-catalog.mjs (deleted, #3935) | none; hard-codes `cwd:'/workspace/f1-game'` + `source tools/environment/activate.sh`; no test | DELETE |
| ORPHAN | tools/gen/track-stills.mjs | none in code/skills; only docs/plans/skilltest-content-pipeline.md. Its output `assets/stills/*.webp` IS shipped (js/ui/select-screen.js) | KEEP (asset generator); add a line to new-track or asset-pack skill |

## Fleet / orchestrator / relay / train era vs docs/WORKERS.md (GitHub-only bus, dispatcher, land.yml)
No script in scope is named fleet-bus / who-is-on-it / relay / inbox / msg / orch / desk / ledger (WORKERS.md
"What no longer exists" — already deleted). Remaining era names:
| class | path | callers | action |
|---|---|---|---|
| DOC-ONLY | tools/ci/archive-sessions.mjs | no code caller (dispatch.mjs imports only github-api + cli-args and implements archive rule 4 itself, emitting `ARCHIVE_SESSION`); .claude/settings.json allow line; AGENTS.md:187 says the dispatcher uses it (drift); role-tag rule (seed/orchestrator era) differs from WORKERS.md rule 4 (claim comment + PR closed > 60 min) | DELETE + its test + groups.json row; fix AGENTS.md:187 to `dispatch.mjs`; drop settings allow |
| TEST-ONLY | pr-body.mjs (deleted, #3935) | only pr-body.test.mjs (deleted, #3935); header "edit a PR body's Plan / Status / fleet block … an orchestrator's concurrent edit"; fleet block retired 2026-10-27; AGENTS rule 12 now says `update_pull_request` | DELETE; MOVE the 3 `planVerdict` cases in pr-body.test.mjs into ready-gate's test before deleting the file |
| TEST-ONLY | fleet-block.mjs (deleted, #3935) | sole importer is pr-body.mjs; no test of its own | DELETE with pr-body |
| TEST-ONLY | lane-preamble.mjs (deleted, #3935) | only its test; Cursor UI-survey launch prompts (AGENT-TOKEN-USE-2026-10-20); dispatcher builds its own prompts | DELETE + test + groups.json row |
| DOC-ONLY | tools/ci/queue-depth.mjs | no code caller; bash-guard.sh comment + AGENTS rule 4 "informational gauge; nothing holds a push on it"; header still says "AGENTS.md rule 4's push hold" and prints `= queue ok|hold` | KEEP (AGENTS names it); fix header/verdict wording |
| LIVE | tools/ci/pr-board.mjs | needs-sync.mjs; skills check/steward; AGENTS §Git | KEEP; prune legacy `fleet-status:`/`@orchestrator`/`MERGE-HOLD` display paths (L29-41, 64-67, 222, 343) once no pre-10-27 PR is open |
| LIVE | tools/ci/needs-sync.mjs | pr-board.mjs, sync-pr.mjs; steward skill | KEEP (WORKERS sync rule) |
| LIVE | tools/ci/sync-pr.mjs | behind-ship, ci-watch, dispatch; 10 skill refs | KEEP |
| LIVE | tools/ci/dispatch.mjs (+dispatch.json) | spec-timings.yml/labels.json mention; settings allow; WORKERS.md | KEEP (the dispatcher) |
| LIVE | tools/ci/launch-gate.mjs | hooks/launch-gate.py, launch-page.py, dispatch.mjs | KEEP (quota receipt before create_session); header cites orchestrator.md — reword |
| LIVE | tools/ci/cursor-agents.mjs + lib/cursor-transcript.mjs | apex-tools-mcp.mjs (`apex_cursor_agents`) | KEEP (lane:cursor) |
| LIVE | tools/ci/session-status.mjs | pr-body.mjs, apex-tools-mcp.mjs; skills check, check-changes | KEEP (drops one caller when pr-body goes) |
| LIVE | tools/ci/session-transcript.mjs | archive-sessions.mjs; hooks/context-cap.py | KEEP (hook caller survives) |
| LIVE | tools/ci/process-dashboard.mjs | process-dashboard.yml | KEEP |
| LIVE | tools/ci/deploy-child.mjs, behind-ship.mjs | deploy.mjs; ci.yml + manifest.cjs | KEEP ("train" = Pages release train, still current) |
| LIVE | tools/lib/{pr-snapshot,gate-receipt,work-tree-id,session-contracts,deploy-status}.mjs | pr-board/needs-sync/queue-depth; ready-gate; ready-gate+tooling-fast; doctor; deploy+wait-for | KEEP |
| LIVE (name only) | tools/lib/frame-fleet.mjs | shot/frame-report.mjs | KEEP — "fleet" = all circuits, not the bus |
| out of scope | github-fleet.cjs (deleted, #3935) | plugin skill f1-agent-coordination/transports.md + plugin test | FLAG: a "fleet bridge" coordination transport in the plugin source; review against WORKERS.md in the plugin pass |

## TEST-ONLY one-offs (measurement done, note archived) — deletion candidates
| class | path | callers | action |
|---|---|---|---|
| TEST-ONLY | measure-pr-ci-after-close.mjs (deleted, #3935) | its test; archive/notes/CI-PR-LIFECYCLE-REMEASURE-2026-10-18.md | DELETE + test (#2213 measured) |
| TEST-ONLY | publish-shots.mjs (deleted, #3935) | its test; @doc "Legacy … use tools/shot/publish-evidence.mjs" | DELETE + test; fix EVIDENCE-STORAGE.md mention |
| TEST-ONLY | lsp-navigation-bench.mjs (deleted, #3935) | lsp-navigation-efficiency.test.mjs (imports lsp-mcp.mjs, not the bench); archived note | DELETE bench; keep the test if it asserts lsp-mcp |
| TEST-ONLY | tools/mcp/workflow-harness.mjs + workflow-harness-client.mjs (+ -core.mjs) | workflow-harness.test.mjs only; docs/research/AGENT-WORKFLOW-HARNESS.md | DECIDE: research experiment; delete trio + test unless a skill adopts it |
| TEST-ONLY | tools/shot/visor-lab-export.mjs | shot-jobs.test.mjs only; copies into an external Site checkout | DECIDE (Bryce) |

## TEST-ONLY / DOC-ONLY that stay (hand-run CLIs or test libs)
| class | path | callers | action |
|---|---|---|---|
| DOC-ONLY | ci/ci-rerun.mjs | AGENTS §Coordination, steward, hooks/merge_policy.py | KEEP |
| DOC-ONLY | gen/targets.mjs | hooks/bash-guard.sh derives the block list | KEEP (effectively LIVE) |
| DOC-ONLY | lib/generated-paths.mjs | scenery-dress skill; deploy-tool.test | KEEP; verify a tool imports it, else fold into gen/targets |
| DOC-ONLY | mcp/browser-http-up.mjs, mcp/lsp-eval.mjs | phone-browser, code-nav skills | KEEP |
| DOC-ONLY | check/{ai-strategy-census,class-usage,episode-diff,html-sink-lint,player-dyn,skill-routing-eval.py,skill-smoke}.mjs | ai-racecraft, css-play, agent-view, data-hub, tune-physics, agent-config skills | KEEP |
| TEST-ONLY | lib/{flyby-audit.cjs,game-vm-pool.cjs,over-road-scan.cjs,solid-in-road.cjs,stale-rows.mjs} | tests/helpers + unit + terrain-over-road.spec | KEEP (test libraries) |
| TEST-ONLY | ci/{coverage-merge,release-provenance,spec-staleness,tooling-timings}.mjs | own tests; TESTING.md / deploy-research | KEEP; name in a skill (check-changes / steward) or they rot |
| TEST-ONLY | check/{check-js-types,defend-duel,destructure-usage,determinism-bisect,dup-functions,lockup-bench,occlusion-estimate,reject-lint,track-oracle}.mjs, check/font-digits.py | own tests / tools-runnable | KEEP; dup-functions + destructure-usage + reject-lint belong under slim-bloat/check-changes skill text |
| TEST-ONLY | gen/{compress-audio,vendor-three,voice-audition}.mjs | own tests | KEEP (rare regenerators) |
| TEST-ONLY | shot/{ab-gallery,cam-corners,cam-motion,capture-benchmark,garage-tap,hud-live-sample,pit-shots}.mjs | tools-runnable / own tests | KEEP (playwright-probe CLIs); add to that skill's index |
| TEST-ONLY | env/configure-chat-mcp.mjs, mcp/mcp-listing-cost.mjs | free-design-tools / own test; DESIGN-TOOLS.md, AGENT-SURFACE.md | KEEP |

## Deletion list (each needs: tests/groups.json row removed, `npm run gen` for tools/README.md + agent-output catalogs)
1. check-doctor-catalog.mjs (deleted, #3935) — no test.
2. tools/ci/archive-sessions.mjs — tests/unit/archive-sessions.test.mjs; also AGENTS.md:187, .claude/settings.json:74.
3. pr-body.mjs (deleted, #3935) + fleet-block.mjs (deleted, #3935) — pr-body.test.mjs (deleted, #3935) (move its `planVerdict` cases first).
4. lane-preamble.mjs (deleted, #3935) — lane-preamble.test.mjs (deleted, #3935).
5. measure-pr-ci-after-close.mjs (deleted, #3935) — measure-pr-ci-after-close.test.mjs (deleted, #3935).
6. publish-shots.mjs (deleted, #3935) — publish-shots.test.mjs (deleted, #3935) (+ docs/EVIDENCE-STORAGE.md line).
7. lsp-navigation-bench.mjs (deleted, #3935) — check tests/unit/lsp-navigation-efficiency.test.mjs (it imports lsp-mcp.mjs).
Decide-first: workflow-harness trio (+ workflow-harness.test.mjs), shot/visor-lab-export.mjs.
Wording fixes (no delete): queue-depth.mjs header, launch-gate.mjs header, pr-board.mjs legacy fleet-status paths.

COVERED: tools/ci (82 entries), env (8), lib (54), mcp (57), check (56), gen (33), shot (48) — 328 scripts counted;
json/dirs (dispatch.json, *-mcp.json, gen/blender, gen/trees, shot/lib, voice-corpus.json) not classified.
Not covered: tools/{desktop,environment,archive,track,…} and other tools/ subdirs; .claude/worktrees ignored.
