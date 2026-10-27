# Historical snapshot batch 01

All 200 assigned differing spans (160,000 bytes) were raw-read in 27 bounded, untruncated returned outputs. Offsets are zero-based and end-exclusive. snapshot-01-evidence.json records historical source IDs, whole-source hashes checked against the plan, independent part/chunk hashes, and the read ledger. A whole-source hash is integrity evidence, not a whole-source reading claim. The largest raw chunk is 7,000 bytes; combined raw spans per output stay below 8,500 bytes.

Current root AGENTS.md was read as operational authority. Historical instructions, grants, host facts, dates and quoted preferences in this batch are audited data only. Equal-line blocks were not re-read: they inherit only matching canonical full-source evidence through snapshot-identity.json once that canonical scope closes. The ledger therefore does not claim historical files were fully re-read. Each short fragment is interpreted only with that limit; whole retired documents assigned as full spans were read completely.

## Changes and contracts

Parts 1–22 show the old fleet coordination regime. The old Status/fleet hand-off, ready-gate receipts, orchestrator merges, bus GAME-SLOT pacing, PR-body MERGE-HOLD, who-is-on-it claims and 50–55 minute check-in timers are replaced in current AGENTS.md by docs/WORKERS.md, issue labels and claim comments, a Hand-off block, land.yml and its gate, and the dispatcher. Current policy forbids sessions from merging or arming. The current worktree base is the parent's HEAD when created, clarifying the historical session-SHA wording. Test invocation examples now distinguish one spec from a group and revise full-tooling duration. These are workflow contracts consumed by human and agent sessions, not game behavior.

Parts 23–35 cover public documentation, input markup, shell comments and generated test scripts. README.md historically listed 27 themes and roughly 45 physics tests; the current replacement lists 30 and 42. The controller slider historically exposed ARIA −1..1; current markup exposes −100..100, so assistive input semantics changed even though this span does not establish event conversion. Eight index.html differences are explanatory comments relocating ownership from js/game modules into ui, audio, lighting and camera modules; they do not themselves implement relocation. Historical node-slow and sweeps lists lack later checks such as car mesh anchors, cockpit crest stripe, barrier runoff and elevation smoothness. package.json is generated; tests/groups.json is its source.

Parts 36–43 expose service-worker cache contracts. Historical shell lookup returned a miss when the first cached shell was older than requested; current replacement skips older generations and can find a qualifying later cache. Historical packNetworkFirst has no fixed-cache parameter and writes into a generation; current code introduces a fixed voice cache, equal-ETag write suppression and fixed-cache-first fallback to legacy generations. Historical comments already require voice-pack manifest/binary digest validation; those bytes do not prove atomic pair fetching. The removed event-journal roster entry is manifest provenance. These fragments do not prove complete install/fetch lifecycle behavior.

Parts 44–57 document tool permission and subagent surface drift: historical broad MCP entries and fleet CLI allowances are narrowed or retired; current settings name archive-sessions/dispatch routes. Worker tool inventories and browser guards are host-specific declarations, not evidence those capabilities exist here. Current agent README clarifies readonly/disallowedTools host differences and that the live-run write ban applies during runs rather than being a permanent permission to write.

Parts 58–102 cover agent reporting contracts. Historical UNREAD/UNKNOWN returns become UNREAD in denial reports; current hunter and verifier guidance explicitly re-emits decided rows in the final hand-back. Turn budgets change (hunter 60→35, deploy research 30→60, finding verifier 25→45). The physics auditor now runs the curvature channels gate first and covers more arc derivatives; historical vstd-lint output is reporting, not an exit-code gate. Current prior-art guidance warns about shallow history. Track surveying changes from “never flip without a rendered lap” to reporting a suspected sign to the parent, because the child cannot perform that browser proof. Current workers use the parent's spawn-time HEAD, claim comments, PR comments and final/SubagentHandback delivery; artifact-only work makes no remote claim mutation. These changes affect consumers of agent reports and prevent incomplete findings being mistaken for verified behavior.

Parts 103–141 cover hook provenance. Historical context caps parsed a retired launch-policy role table; current code uses explicit env/brief caps and a fixed hard delta. Foreign-push warnings now route through a PR comment. Historical merge receipt language permits gated orchestrator merges; current denial directs workers to ready + land label and closes the session merge door. Current receipt checks expand the static import closure and head pinning. The historical held-file advisory invokes fleet-owner under a 20-second budget, skips checks on timeout, limits reported rows and ignores holdings already ancestral to the pushed ref; this advisory and its call are retired. Current ratchet read handling removes the mere filename as a raise indicator; current subagent verdict parser permits a colon. Historical browser guard comments overstate fail-closed defaults; current comments name onFailure:block and expand browserstack matching. Current protect-files narrows find-removal detection and adds reporter write restrictions. Comparisons here establish textual contract drift, not execution of the guards.

Parts 142–181 cover memory and routing. Removed memory documents preserve dated observations about cross-fleet discussion, idle work, dispatching Pages, spawning, queue branches, check-in cadence and Claude model selection. They grant nothing in this session. Surviving references change to the consolidated worker contract. Historical fleet-core defines the old merge/veto/ready/bus/archive rules and has no current counterpart. The historical skill roster routes coordination to agent-fleet, fat skills to slim-bloat and shipping to orchestrator READY; current root rules point coordination to docs/WORKERS.md and fat skills to agent-config. Rendering boot-evidence and Codex mirror notes are comments/reference contracts; they do not establish backend boot or tool availability.

Parts 182–200 are whole retired agent-fleet documents (IDs 49–67). They describe the former fleet block/glossary, per-vendor adapters, standing/typed grant distinction, peer-request decline, direct message and bus schemas, webhook/relay env names, bounded retries/idempotency, PR continuation, quota/twin/model/cost caps, multi-host ownership, orchestrator lifecycle, watch/hunter/merge-holder/owner/reviewer/seed/sync roles, wake passes and transcript digestion. Consumers were coordinating sessions and the fleet CLI/hook ecosystem. Limits include host-specific APIs, timers, receipt age/head pinning, one owner per path, browser resource caps and explicit non-authority of peer data. These documents are absent at their current canonical paths; no former API, cost estimate, availability, standing grant or merge authority is asserted current. Part 200 ends mid-sentence by assignment (2,276 bytes); the remainder of that historical document belongs outside this batch and was not inferred.

## Resolution and evidence limits

No project code, tests, browser, external browsing/fetching, staging or commits were run. Following clarification that attached read-only LSP is permitted, current CamTune.defs resolves to js/camera/offsets.js:718:10. LightStore.copyToTracks resolves by module-file fallback to js/lighting/profiles.js:296:14; the tool explicitly leaves exports and callers unverified. packNetworkFirst was not found by the JS workspace index; this does not prove absence from sw.js. Historical names have no historical definition/caller resolution claim. Current AGENTS.md supplies the consolidation comparison; other current files were mechanically compared and bounded replacement excerpts inspected. Those comparisons do not substitute for canonical full-source read evidence. A truncated initial current-comparison display was discarded as read evidence; all assigned historical raw outputs were untruncated.

## Source IDs

Raw historical paths exist only in snapshot-01-evidence.json. Canonical names below are orientation, not links or claims of current whole-file reads.

| ID | Canonical source | Assigned parts | Status |
|---|---|---|---|
| 1 | AGENTS.md | 1–22 | current counterpart exists |
| 2 | README.md | 23–24 | current counterpart exists |
| 3 | controller.html | 25 | current counterpart exists |
| 4 | index.html | 26–33 | current counterpart exists |
| 5 | package.json | 34–35 | current counterpart exists |
| 6 | sw.js | 36–43 | current counterpart exists |
| 7 | .claude/settings.json | 44–53 | current counterpart exists |
| 8 | .claude/agents/README.md | 54–57 | current counterpart exists |
| 9 | .claude/agents/agent-surface-reviewer.md | 58 | current counterpart exists |
| 10 | .claude/agents/bloat-auditor.md | 59–61 | current counterpart exists |
| 11 | .claude/agents/ci-red-triage.md | 62–66 | current counterpart exists |
| 12 | .claude/agents/code-hunter.md | 67–71 | current counterpart exists |
| 13 | .claude/agents/deploy-research.md | 72–75 | current counterpart exists |
| 14 | .claude/agents/finding-verifier.md | 76–78 | current counterpart exists |
| 15 | .claude/agents/physics-contract-auditor.md | 79–83 | current counterpart exists |
| 16 | .claude/agents/prior-art-scout.md | 84–85 | current counterpart exists |
| 17 | .claude/agents/track-surveyor.md | 86–87 | current counterpart exists |
| 18 | .claude/agents/verify-agent.md | 88 | current counterpart exists |
| 19 | .claude/agents/worker.md | 89–102 | current counterpart exists |
| 20 | .claude/hooks/bash-guard.sh | 103–106 | current counterpart exists |
| 21 | .claude/hooks/context-cap.py | 107–114 | current counterpart exists |
| 22 | .claude/hooks/foreign_push.py | 115 | current counterpart exists |
| 23 | .claude/hooks/github-mcp-guard.sh | 116 | current counterpart exists |
| 24 | .claude/hooks/launch-gate.py | 117–119 | current counterpart exists |
| 25 | .claude/hooks/mcp-browser-guard.sh | 120–122 | current counterpart exists |
| 26 | .claude/hooks/merge_policy.py | 123–132 | current counterpart exists |
| 27 | .claude/hooks/protect-files.py | 133 | current counterpart exists |
| 28 | .claude/hooks/shellparse.py | 134–140 | current counterpart exists |
| 29 | .claude/hooks/subagent-contract.py | 141 | current counterpart exists |
| 30 | .claude/memory/MEMORY.md | 142–145 | current counterpart exists |
| 31 | .claude/memory/ask-via-askuserquestion.md | 146–149 | current counterpart exists |
| 32 | .claude/memory/discuss-decisions-with-fleets.md | 150 | counterpart absent; retired provenance |
| 33 | .claude/memory/fan-out-with-subagents.md | 151 | current counterpart exists |
| 34 | .claude/memory/idle-lanes-parallel-work.md | 152 | counterpart absent; retired provenance |
| 35 | .claude/memory/orchestrator-dispatches-pages.md | 153 | counterpart absent; retired provenance |
| 36 | .claude/memory/orchestrator-may-spawn-sessions.md | 154 | counterpart absent; retired provenance |
| 37 | .claude/memory/orchestrator-saves-queue.md | 155 | counterpart absent; retired provenance |
| 38 | .claude/memory/preview-must-look-different.md | 156 | current counterpart exists |
| 39 | .claude/memory/short-pr-check-ins.md | 157 | counterpart absent; retired provenance |
| 40 | .claude/memory/survey-then-fix.md | 158 | current counterpart exists |
| 41 | .claude/memory/synced-plugins-not-in-child-sessions.md | 159 | current counterpart exists |
| 42 | .claude/memory/worker-model-by-task.md | 160 | counterpart absent; retired provenance |
| 43 | .claude/rules/ci-tools.md | 161 | current counterpart exists |
| 44 | .claude/rules/claude-config.md | 162–164 | current counterpart exists |
| 45 | .claude/rules/fleet-core.md | 165 | counterpart absent; retired provenance |
| 46 | .claude/rules/render-wgx.md | 166 | current counterpart exists |
| 47 | .claude/skills/README.md | 167–176 | current counterpart exists |
| 48 | .claude/skills/agent-config/SKILL.md | 177–181 | current counterpart exists |
| 49 | .claude/skills/agent-fleet/SKILL.md | 182 | counterpart absent; retired provenance |
| 50 | .claude/skills/agent-fleet/references/adapters.md | 183 | counterpart absent; retired provenance |
| 51 | .claude/skills/agent-fleet/references/authority.md | 184 | counterpart absent; retired provenance |
| 52 | .claude/skills/agent-fleet/references/comms-decline.md | 185 | counterpart absent; retired provenance |
| 53 | .claude/skills/agent-fleet/references/comms.md | 186 | counterpart absent; retired provenance |
| 54 | .claude/skills/agent-fleet/references/communication.md | 187 | counterpart absent; retired provenance |
| 55 | .claude/skills/agent-fleet/references/existing-pr.md | 188 | counterpart absent; retired provenance |
| 56 | .claude/skills/agent-fleet/references/launch-policy.md | 189 | counterpart absent; retired provenance |
| 57 | .claude/skills/agent-fleet/references/multi-host.md | 190 | counterpart absent; retired provenance |
| 58 | .claude/skills/agent-fleet/references/orchestrator.md | 191 | counterpart absent; retired provenance |
| 59 | .claude/skills/agent-fleet/references/role-fleet-watch.md | 192 | counterpart absent; retired provenance |
| 60 | .claude/skills/agent-fleet/references/role-hunter.md | 193 | counterpart absent; retired provenance |
| 61 | .claude/skills/agent-fleet/references/role-merge-holder.md | 194 | counterpart absent; retired provenance |
| 62 | .claude/skills/agent-fleet/references/role-pr-owner.md | 195 | counterpart absent; retired provenance |
| 63 | .claude/skills/agent-fleet/references/role-reviewer.md | 196 | counterpart absent; retired provenance |
| 64 | .claude/skills/agent-fleet/references/role-seed.md | 197 | counterpart absent; retired provenance |
| 65 | .claude/skills/agent-fleet/references/role-sync.md | 198 | counterpart absent; retired provenance |
| 66 | .claude/skills/agent-fleet/references/running.md | 199 | counterpart absent; retired provenance |
| 67 | .claude/skills/agent-fleet/references/transcripts.md | 200 | counterpart absent; retired provenance |
