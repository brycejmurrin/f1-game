# Leftovers of the old multi-fleet coordination: audit (r2, 2026-10-27)

Tree: deploy tip `5a29eb35` (Merge #3917). Read-only. Seed grep (task regex) hit 595 files outside `.claude/worktrees/`
and `__pycache__`. Most are false positives: the game's net relays (`js/net`, `tools/net`, `net-*.test`), the track/frame
"fleet" (`frame-fleet`, `flyby-fleet`, `track-validate-fleet`, ci.yml's "fleet build"), "orchestration" in ARCHITECTURE,
and `fleet A/B` shard names in `tests/data/spec-timings.json`, `tracks-walls-{a,b}.spec.js` and `select-budget`.
After those were dropped, a targeted pass for `agent-msg|fleet-bus|merge desk|MERGE-HOLD|who-is-on-it|session-ledger|
fleet-core|ORCH X|OrchA/B|fleet-board|github-fleet|fleet-block|inbox|merge train` produced the rows below.
Retired tools confirmed gone: `tools/ci/{fleet-bus,agent-msg,who-is-on-it,fleet-board-snapshot}.mjs` do not exist.
`.github/workflows/fleet.yml` is gone too.

## Findings

| class | path:line | what | action |
|---|---|---|---|
| STILL-NEEDED (stale) | tools/environment/plugin-sources/f1-dev-tools/skills/f1-agent-coordination/SKILL.md:34 | The Codex plugin skill (installed via `install-environment.sh`, `plugin-install.sh`) still tells Codex lanes to "use the existing `claude/fleet-bus` branch" for cross-session coordination | Rewrite step 4 as "GitHub issue/PR comments only (docs/WORKERS.md)". This is the highest-impact leftover because it actively steers live Codex lanes |
| STALE-DOC | …/f1-agent-coordination/references/transports.md:9-39 | Documents `github-fleet.cjs` writing to `claude/fleet-bus`, and calls `the deleted fleet-bus tool` authoritative (that file is deleted) | Delete the fleet-bus section |
| DEAD-CODE | github-fleet.cjs (deleted, #3935) (whole) | A bus writer to `claude/fleet-bus` (addresses `merge-desk`, `orchestrator`). Its only callers are its own test (`the old top-level agent-setup test:4`) and transports.md | Delete it, its test cases and the `tools/README.md:631` row (regenerate with `npm run gen`) |
| DEAD-CODE | …/f1-dev-tools/scripts/agent-readiness.mjs:36,46 | The `githubFleetBus` readiness route and its "fleet message" note | Drop the route and fix `agent-setup.test.mjs:35,45` |
| DEAD-CODE | fleet-block.mjs (deleted, #3935):37 `fleetBlock()` | No caller. The comment at :7 says "ready-gate (fleetBlock) is the remaining caller", but ready-gate no longer imports it | Delete the export; the file stays only if pr-body keeps `--fleet` (next row) |
| DEAD-CODE | pr-body.mjs (deleted, #3935):12,35,153-177 `--fleet` / `setFleet` | Writes a ```` ```fleet ```` block. WORKERS.md:110 retires the fleet block, and `.github/pull_request_template.md` has none | Remove `--fleet`, `setFleet`, the `fleetEntries` re-export and `pr-body.test.mjs:81-94`, then delete `fleet-block.mjs (deleted, #3935)` |
| DEAD-CODE | tools/lib/gate-receipt.mjs:194-220 `readyClaimVerdict`, `READY_CLAIM_MAX_MIN` | Gated READY messages sent through agent-msg (comment :201). The only caller is `tests/unit/merge-gate.test.mjs:356-361`. Comments :6, :25 and :57 also name the bus, MERGE-HOLD and a `fleet-bus` closure entry | Delete the function and its tests, and fix the comments |
| STALE (code) | tools/ci/pr-board.mjs:29,36-41,64-67,222,343 | Legacy display of the `MERGE-HOLD:` body line and the `fleet-status:` / `@orchestrator` FLEET column. `fleetIdentity` (:41) no longer exists in ready-gate | Keep while pre-10-27 PRs are open. After that, delete `hasMergeHold`, the FLEET column and `pr-board.test.mjs:94-101,319-330` |
| STALE (comment) | tools/ci/ci-watch.mjs:323 | "fleet-board-snapshot imports this module". That tool is deleted | Fix the comment. The entry-point guard stays |
| STALE (hook) | .claude/hooks/foreign_push.py:117-126 `QUEUE_BRANCH` | Lets successive orchestrators push to `cursor/*queue-*` branches. There are no orchestrators now | Remove the exemption (needs Bryce's yes: claude-config.md) |
| STALE (hook) | .claude/hooks/shellparse.py:1141 `POLL_WATCH` | Still matches `fleet-bus read` and `who-is-on-it`, two deleted tools | Drop those two alternatives (needs Bryce's yes). Harmless meanwhile |
| STALE (hook text) | .claude/hooks/merge_policy.py:54,64; shellparse.py:1617 | Refusal messages say "ask your orchestrator" | Change to "comment on the PR / needs-decision" (needs Bryce's yes) |
| HISTORICAL-OK | .claude/hooks/{bash-guard.sh:36,protect-files.sh:25,protect-files.py:341,foreign_push.py:1,shellparse.py:871}, tests/unit/safety-bans-hook.test.mjs:1 | "Fleet A + D, Bryce 2026-10-22": provenance of the safety bans | Keep |
| HISTORICAL-OK | .claude/hooks/launch-gate.py:4-5, tools/ci/launch-gate.mjs:7-9, launch-page.py:4 | OrchA 33 incident provenance. The launch gate is STILL-NEEDED because the dispatcher uses it | Keep |
| STALE-DOC | docs/agent-output/policies.json:747 | ready-gate "preserve … missing fleet-block field on a cursor/ branch". Ready-gate has no such check | Edit the preserve string. Also drop the :1344 and :2799 entries and the catalog.json:1748/2438 rows when the files are deleted |
| STALE-DOC | docs/research/APEX-TOOLS-MCP.md:198,241 | Rows for the `apex_who_is_on_it` tool and `who-is-on-it.mjs`. apex-tools-mcp.mjs:2083 calls it retired | Mark the rows retired, or delete them |
| STALE-DOC | docs/TESTING.md:1161-1166 "Merge train (concurrent PRs)" | "merge one large PR at a time; batch small PRs". land.yml and merge-gate now land PRs, so agents never merge | Rewrite the paragraph to point at WORKERS.md §land. The guard misses it because "merge train" is not on its RETIRED list |
| STALE-DOC | cursor-plugins/apex-f1-game/skills/apex-specialty-handoff/SKILL.md:29 | "no orchestrator or watcher lane": correct, history phrasing | Keep (OK) |
| STALE-DOC | .claude/agents/README.md:9-11 | ci-watcher and merge-desk "deleted 2026-10-26" | HISTORICAL-OK |
| HISTORICAL-OK | docs/WORKERS.md:5,88,91,109-111 | The retirement list itself | Keep (it is the home) |
| HISTORICAL-OK | docs/NOTES-INDEX.md:29,34,61,98,101,102,211 | Index rows marked archive/superseded/retired | Keep |
| HISTORICAL-OK | docs/notes/SYSTEM-AUDIT-{2,3,4}-2026-10-26.md, TRANSCRIPT-MINING, DEVICE-FARM-LEDGER, … (30 dated notes); docs/archive/** (126); docs/plans/2026-10-19-fleet-redesign.md (marked superseded); docs/surveys/w24*,w25d; docs/changelog.d (5) | Dated evidence | Keep. Optional: move SYSTEM-AUDIT-2/3/4 (43/16/14 hits) to docs/archive/notes |
| HISTORICAL-OK | .github/workflows/ci.yml:184 ("Fleet D drafts…"), land.yml:3, pages.yml:66 | Provenance comments | Keep |
| STILL-NEEDED | .github/labels.json:6 `fleet-board` | The label now marks the dispatcher's Board issue #1780; :11 `hold` "Replaces MERGE-HOLD:" | Keep. Optional rename to `board` |
| STILL-NEEDED | tools/ci/prune-branches.mjs:39-41,110-113 | Keeps `claude/claims-board` and prunes `claude/claims/*` on age | Keep |
| STILL-NEEDED | tests/unit/rulebook-guards.test.mjs:68-80 RETIRED list | Guard that bans retired mechanisms | Keep. GAP: FILES (:32-34) scans only AGENTS/CLAUDE/WORKERS/TESTING/VERIFICATION/template plus `.claude/{rules,skills,agents,memory}`. It misses `tools/environment/plugin-sources/**/skills`, `cursor-plugins/**`, `.cursor/rules`, `.codex`, and the "merge train" wording. Widen it so the Codex plugin row above would have failed CI |
| HISTORICAL-OK | tests/unit/{ready-gate:125,merge-gate:45} "READY to ORCH A" | Fixtures for the legacy `LAND_ITEM` (ready-gate.mjs:245-246, old bodies) | Keep while old PRs are open, then drop along with `READY to` in LAND_ITEM |
| HISTORICAL-OK | tests/unit/archive-sessions.test.mjs:45; tools/ci/archive-sessions.mjs:34 | Orchestrator, merge-desk and fleet-watch roles are never archived (allow-list design) | Keep. Note: old orchestrator sessions therefore need a manual archive |
| HISTORICAL-OK | tests/unit/{live-run-check (branch name "session-ledger-51cc"), skill-progressive:317, agent-config:589, gen-agent-index-order:4, pr-board:367}, tests/fixtures/{fleet-board/,grok-transcripts/sample.jsonl,launch-lane/} | Fixtures and provenance | Keep. `tests/fixtures/fleet-board/` has no live tool, so check for a caller before deleting |
| HISTORICAL-OK | .claude/memory/{ask-via-askuserquestion,fan-out-with-subagents,rules-are-agent-written-drafts}.md | Dated provenance ("Fleet A transcript audit", "testing relays", "fleet-core") | Keep (rulebook guard passes) |
| STILL-NEEDED | .claude/settings.json:211 `claude-cursor-orchestration@synced: false` | Plugin already disabled | Keep (or drop the key) |
| STALE (comment) | .codex/hooks/mcp-guard.sh:8 | Cites docs/plans/2026-10-19-fleet-redesign.md §8 (superseded) | Keep or re-point; low priority |

## Scheduled tasks (list_triggers, read-only)

| class | trigger | what | action |
|---|---|---|---|
| STILL-NEEDED | trig_01SDbxKY8iHsJctGBEaY55KT "Apex dispatcher — wake the persistent session hourly" (enabled) | The new dispatcher | Keep |
| STALE (enabled) | trig_01LVTyhcecvVX9deFigKWDEt "Backlog check-in #1518", one-shot 2026-10-28 16:00Z | The prompt checks "hourly fleet.yml runs" (workflow deleted), the "Fleet board issue #1780" and "AGENTS.md §Backlog" (now §Coordination) | Update the prompt before it fires tomorrow: dispatcher Board comment and `dispatch.mjs` runs |
| OK (enabled) | trig_01Tn1dpqTNT6JJ7DtL2ro4xK "Monthly knowledge audit" | No fleet terms. It says "never mark ready", which fits a draft docs PR | Keep |
| disabled, fine | trig_0131TEjs7Q7uazLCqgSFzv6c (old dispatcher), trig_01ANsLrvbDGnMapUzqRYmnVL FLEET BUS WATCH, trig_01SbgX9JrMK3yx1fW7GVdWt3 Fleet Board refresh, trig_018zijaBcNhu9DwBxPMWJ8vy "Fleet B inbox → B·R1" (cross-account relay; still holds an API token, hint `sk-ant-oat01-PXcR…`), trig_019axytjyUHsLUDZkLh2TqRY ORCH B safety net, Merge Desk passes, about 20 PR-watch reminders | All disabled, so none fire | Optional: Bryce deletes them. The "Fleet B inbox" task's API token should be revoked or the task deleted |

## GitHub-side leftovers (not edited)
Remote branches still exist: `claude/fleet-bus`, `claude/claims-board` (kept on purpose by prune-branches) and 26
`cursor/orcha*-queue-*` / orch queue branches. A merged-or-absorbed prune may not catch the queue branches, so list
them for Bryce. Old orchestrator, relay and merge-desk sessions are never archived by `archive-sessions.mjs` (role allow-list).

## Deletion list (with caller proof)
1. `github-fleet.cjs (deleted, #3935)`. Callers: only `…/the old top-level agent-setup test:4`
   and `…/f1-agent-coordination/references/transports.md:12` (grep `github-fleet` over tools/tests/.claude/.github/.cursor/.codex).
   Also remove its test cases, the readiness route (`agent-readiness.mjs:36,46`), and the policies.json:2799 / catalog.json:1748 rows, then `npm run gen` (tools/README.md:631).
2. `fleet-block.mjs (deleted, #3935)` `fleetBlock()`: zero callers (only its own comments). Delete the whole file once (3) lands:
   the remaining importer is `pr-body.mjs (deleted, #3935):35` alone.
3. `pr-body.mjs --fleet` / `setFleet` / `fleetEntries` re-export: the only consumer is `pr-body.test.mjs (deleted, #3935):6,81-94`.
   The template has no fleet block (grep `fleet` in .github/pull_request_template.md = 0), and WORKERS.md:110 retires it.
4. `gate-receipt.mjs` `readyClaimVerdict` + `READY_CLAIM_MAX_MIN`: the only caller is `tests/unit/merge-gate.test.mjs:356-361`.
   The agent-msg sender (`the deleted agent-msg tool`) is deleted.
5. Later, once no pre-10-27 PR is open (`pr-board --json`): `pr-board.mjs` `hasMergeHold` and the FLEET column, `ready-gate.mjs:245-246` `READY to`.
6. Hook regex leftovers (with Bryce's grant): `foreign_push.py` `QUEUE_BRANCH`, and the `shellparse.py:1141` fleet-bus/who-is-on-it alternatives.

COVERED: tools/ (ci, lib, mcp, environment/plugin-sources, net excluded as game), .claude/ (hooks, agents, skills, rules,
memory, settings, workflows; worktrees and pycache excluded), .cursor, .codex, .agents, cursor-plugins, docs/ (live docs
line by line; notes, archive, plans and surveys by file and density), tests/ (unit, fixtures, data), .github/ (workflows, labels,
template), package.json, the remote branch list, all scheduled tasks (enabled filter + first page of all).
NOT COVERED: js/ (out of scope: game relays), the contents of each docs/archive file, GitHub issues and labels state.
