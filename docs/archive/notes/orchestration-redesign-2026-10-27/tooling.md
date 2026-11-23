# Orchestration tooling + enforcement — inventory and assessment (read-only, 2026-10-27)

Repo: /home/user/f1-game. Callers counted by grep over tools/, .claude/, .github/, tests/, docs/; "active prose" = .claude/skills, .claude/rules, .claude/agents, AGENTS.md (docs/notes are history, not callers).

## A. tools/ci — one line each

| tool (lines) | does | code callers | reads / writes | duplicates |
|---|---|---|---|---|
| fleet-bus.mjs (703) | typed message log + "lease" mutex on branch `claude/fleet-bus`; `send/read/who/watch/lease` (fleet-bus.mjs:2-4, 23-37) | 11 tools, fleet.yml, settings allow | R/W bus commit subjects; W `lease.json` in that tree; W cursors `artifacts/fleet-bus/<sender>` (fleet-bus.mjs:93-95); dispatches fleet.yml via `pokeFleetBoard` import | agent-msg (send), lease≈MERGE-HOLD/GAME-SLOT |
| agent-msg.mjs (401) | webhook POST + mirror onto the bus (agent-msg.mjs:2-9); own `MSG_TYPES` list (:30) | fleet-bus (comment), settings allow; 19 prose refs | W bus (sendBusLine), POST `APEX_AGENT_WEBHOOK_URL`, `APEX_<L>_RELAY_URL` | fleet-bus send |
| fleet-bus-mirror.mjs (111) | posts each `to:#n` bus line as a PR comment (fleet-bus-mirror.mjs:2-4) | fleet.yml only | R bus; W PR comments (issues API) | 3rd copy of one message (bus + webhook + comment) |
| fleet-board.mjs (237) | pinned "Fleet board" issue + derived `claimed` label (fleet-board.mjs:2-15) | fleet.yml hourly (cron 23,53) | R issues/PRs/claims board; W issue body, labels, comments | pr-board, fleet-board-snapshot, fleet-tick |
| fleet-board-snapshot.mjs (229) | six JSON datasets for a claude.ai dashboard into `artifacts/fleet-board/` (:2-4) | **0 code callers, 0 active prose** | R REST, bus, claims, Pages run; W artifacts | pr-board + fleet-board |
| fleet-tick.mjs (139) | diff pr-board/ci-watch/flags against `artifacts/fleet-watch/state.json` (:2-14) | fleet.yml tick job only; prose: role-fleet-watch.md:9 says the bus Monitor replaced the tick | R pr-board, ci-watch, needs-sync; W state.json (Actions cache) | pr-board |
| fleet-flags.mjs (65) | cost/context/stall flags from saved `get_session` JSON | fleet-tick only | R stdin | context-cap.py (same live-context idea) |
| fleet-brief.mjs (172) | ≤2 KB hand-off JSON + digest from queue file + bus + board (:2-12) | fleet-bus (comment), settings allow; 6 prose refs | R `fleet/queue.json`, bus, pr-board json; W `artifacts/fleet-brief/`; rewrites a `scratch/*.md` queue | fleet-queue, session-status, PR body |
| fleet-queue.mjs (130) | JSON queue of PRs on an orchestrator "state branch" (:8-15) | fleet-brief only; **0 active prose**; file absent in this checkout | R/W `fleet/queue.json` | PR body fleet block `state=`, pr-board |
| fleet-owner.mjs (450) | HELD (open-PR diff) / CLAIMED (claims board) / FREE per path (:2-10) | ready-gate, bash-guard.sh:48 push check, generated-paths | R PR files API (cache `artifacts/fleet-owner/`), claims board; W nothing | who-is-on-it (claims), launch-lane (lane claims) |
| fleet-archive.mjs (162) | archive verdict over a saved `list_sessions` page (:2-20) | launch-lane, settings allow; 11 prose refs | R saved page, PR state (`gh api`), bus (`whoIs`) | — |
| who-is-on-it.mjs (413) | recent pushes + claims on branch `claude/claims-board` (one file per claim, `<ts>\t<who>\t<text>`) (:2-28) | 9 tools, fleet.yml, prune-branches.yml, apex-tools MCP | R/W claims board branch; POST fleet.yml dispatch (`pokeFleetBoard`, :251-270: 958 of ~1,000 fleet.yml runs/week) | fleet-owner CLAIMED, launch-lane |
| merge-gate.mjs (385) | the merge proof: open/hold/ready/ci/gen/ratchets/pacing → receipt (:2-33) | fleet-bus, incident-lift, ready-gate, merge-attribution, hooks | R GitHub PR+checks, bus (GAME-SLOT/INCIDENT/DONE, :91-135), Pages runs, throw-away worktree; W `artifacts/merge-gate/<pr>.json` | — |
| ready-gate.mjs (521) | draft→ready proof: Structural guards check-run or local stamp, Plan closed, fleet block (:2-26, 382-426) → receipt | 8 tools, hooks, ci.yml, tooling-fast | R checks API, PR body, `artifacts/logs/tooling-fast-ready.sha`; W `artifacts/ready-gate/<pr>.json`; re-exports `api` (:52) | github-api.mjs |
| merge-done.mjs (117) | DONE bus line from a merge commit, idempotent (:2-15) | merge-attribution.yml:92 | R merge commit; W bus | merge-attribution bus line, hand-sent DONE |
| merge-attribution.mjs (~) | flags merges lacking `Merged-by:` trailer: bus HANDOFF line + PR comment (:15-28) | merge-attribution.yml | W bus, PR comments | merge-done |
| post-merge.mjs (64) | 2-parent check, release claim, list check-ins | **0 callers, 0 active prose** | R PR, W claims board | merge-done, handback |
| handback.mjs (80) | prints SWEEP + DONE lines, lists `checkin:` trigger ids (:2-13) | **0 callers, 0 active prose** | R PR body fleet block, ci-watch, ready-gate | fleet-brief, session-status |
| launch-gate.mjs (93) | quota receipt from a saved `get_session` (:2-14) | launch-lane, launch-gate.py | R saved page; W `artifacts/launch-gate/receipt.json` | — |
| launch-lane.mjs (274) | quota + revision + twin + lane claim, prints create_session JSON (:2-27) | settings allow; 1 prose ref | R saved pages, bus; W branch `refs/heads/fleet-claims/<fleet>-<lane>` (parentless-commit lock), launch-gate receipt | who-is-on-it claims (2nd claim store) |
| incident-lift.mjs (42) | sends `INCIDENT … lifted` when Pages is green on the fix sha | **0 callers** (a comment, fleet-bus.mjs:33) | R bus, Pages; W bus | merge-gate.pagesGreenFor |
| pr-board.mjs (413) | read-only table of open PRs + SUGGESTION (:1-16) | 6 tools, fleet.yml, MCP | R REST, ready-gate verdict, needs-sync | fleet-board, snapshot, tick |
| session-status.mjs (255) | hand-off block generated from git + logs (:2-15) | pr-body, MCP, PR template | R git, `artifacts/logs/` | fleet-brief |
| session-transcript.mjs (404) | digest saved `list_events` pages | agent-history, context-cap.py (method) | R saved files | agent-history |
| agent-history.mjs (843), claude-usage.mjs (199), session-ledger.mjs (385), cursor-agents.mjs (915) | transcript/usage analytics (session-ledger, agent-history, claude-usage: **0 code callers**; cursor-agents: `apex_cursor_agents` MCP only) | — | local JSONL, Cursor API | each other (four digesters) |
| needs-sync.mjs (119) | `conflict \| stale-red \| no` verdict | pr-board, fleet-tick, sync-pr, fleet.yml | R git merge-tree, ci runs | — |
| sync-pr.mjs (317) | fetch/merge/verify a PR branch; refuses clean-behind, claims | 8 tools, hooks | R/W git, claims (`--ignore-claims`) | — |
| ci-watch.mjs (592) | poll CI/Pages for a sha → `= ci` line | 8 tools, ci.yml, fleet.yml, MCP | R Actions API; W `artifacts/ci-watch/` | — |
| wait-for.mjs (146) | generic waiter (load/file/pid/merged) | sync-pr, lane-preamble, hooks | R /proc, git | — |
| queue-depth.mjs (414) | Actions job gauge; hold retired 2026-10-16 (bash-guard.sh:402-405) | bash-guard only | R Actions API; W `apex-status/queue-depth.json` | — |
| tools/lib/gate-receipt.mjs (159) | receipt write/verdict + gate-file sha256 (GATE_FILES :54) | gates, hooks (Python twin `merge_policy.py`) | R/W `artifacts/{merge,ready}-gate/` | merge_policy.py receipt_check (twin by design) |

## B. Hooks (.claude/settings.json wiring; APEX_MERGE_DESK is NOT in `env`, retired 2026-10-26 — bash-guard.sh:32, test bash-guard-hardening.test.mjs:113)

| hook | event | enforces | fails |
|---|---|---|---|
| github-mcp-guard.sh (119) + merge_policy.py (211) | PreToolUse mcp__github merge/arm/update_pull_request/actions_run_trigger | deny squash/rebase; deny merge without fresh (10 min) receipt pinned to `expectedHeadSha`; deny draft→ready without ready receipt; deny run cancel; ask rerun/close (github-mcp-guard.sh:87-111) | closed (ask) |
| bash-guard.sh (715) + shellparse.py (2017) + foreign_push.py (149) | PreToolUse Bash | same receipts for `gh pr merge/ready`; no force/deploy-branch push; foreign-pusher check; `cursor/*` push over another PR's HELD paths (fleet-owner); refuses pkill/PID kills/run cancels; test:guards before commit | closed |
| launch-gate.py (66) | PreToolUse create_session | `artifacts/launch-gate/receipt.json` ok and < 120 s (launch-gate.py:9-11) | **open** (:15-18) |
| context-cap.py (180) | UserPromptSubmit/PostToolUse/PreToolUse Agent+create_session | advisory context line; deny spawn over hard cap; caps parsed from the brief prose and `launch-policy.md` table (context-cap.py:9-10, ROLE_DOC) | open |
| subagent-contract.py (166) | SubagentStop / SubagentHandback | report shape for 7 reporter agents | open, advisory |
| stop-guard.sh (49), memory-sync.sh (233) | Stop / PostToolUse | live browser run nudge; auto-memory 3-way sync (`.claude/memory` ↔ `~/.claude/projects/...` ↔ `artifacts/.memory-base`) | not fleet |

## C. Workflows: fleet.yml (board + mirror every 30 min, cron `23,53`, plus a dispatch per claim; tick job = fleet-tick.mjs with Actions-cache state), merge-attribution.yml (push to deploy: merge-attribution.mjs + merge-done.mjs DONE lines), ci-cancel-on-close.yml (one `gh` step), ci.yml (draft=fast only with `run-ci` label or a `CI: run` body line, ready=full; 70 lines of comments on tiers, ci.yml:155-208), pages.yml (push/dispatch/6-h cron train, single-flight group). 336 lines in the three fleet-only workflows.

## D. Tests: 38 files, 10,778 lines, 617 `test()` calls pin the protocol (plus 2 VM hook suites). They freeze exported constant lists and error text verbatim (fleet-bus.test.mjs:17-19, :118 asserts the `ADDRESS_FORMS` string inside the thrown message, :120 role names, :388 TYPES), the `= merge-gate/ready-gate …` lines, settings.json shape (bash-guard-hardening.test.mjs:113-121) and the prose itself: rulebook-guards.test.mjs:73-121 requires each rule sentence in exactly one home and bans "retired mechanisms". Literal-string asserts: fleet-bus 92, bash-guard 88, ready-gate 71, pr-board 47, agent-msg 45, merge-gate 43. Renaming a bus type or a verdict line breaks on the order of a hundred tests; the tests pin surface text, not behaviour.

## 1. State stores (17)

| # | store | writers | readers |
|---|---|---|---|
| 1 | bus commit log `claude/fleet-bus` (3,735 lines; 1,847 HANDOFF, 476 READY, 450 DONE, 273 BLOCKED, 210 GAME-SLOT, 119 INCIDENT, 22 LEASE, LEND 1, RETURN/TRANSFER 0) | fleet-bus send, agent-msg, merge-done, merge-attribution, incident-lift, humans (637 lines by Bryce) | fleet-bus read/who/watch, merge-gate pacing, fleet-brief, snapshot, mirror, fleet-archive, launch-lane |
| 2 | `lease.json` in that tree (currently `{}`) | fleet-bus lease | fleet-bus lease check only — nothing gates on it (fleet-bus.mjs:2) |
| 3 | claims board branch `claude/claims-board` (+ legacy `claude/claims/*`) | who-is-on-it --claim/--release, post-merge | who-is-on-it, fleet-owner, fleet-board, snapshot, sync-pr, bash-guard push check |
| 4 | lane-claim branches `fleet-claims/<fleet>-<lane>` | launch-lane | launch-lane only |
| 5 | PR body ```fleet block (`fleet:`, `orchestrator:`, `state=`, `checkin=trig_`) | pr-body.mjs, orchestrators by hand | ready-gate (fleet-block), merge-gate (attribution), pr-board/fleet-tick, handback |
| 6 | PR body MERGE-HOLD line, Plan checklist, Status block | agents, pr-body, session-status | merge-gate hold row, ready-gate plan-open, fleet-core rule |
| 7 | PR comments | fleet-bus-mirror, merge-attribution, fleet-board | PR subscriptions (wake), humans |
| 8 | labels (`claimed` derived, `run-ci`, `area:*`; `.github/labels.json`) | fleet-board, pr-body --label, humans | ci.yml tier, fleet-board |
| 9 | pinned "Fleet board" issue | fleet-board | Bryce's phone |
| 10 | bus read cursors `artifacts/fleet-bus/<sender>` (per checkout, lost with the container) | fleet-bus read/watch | fleet-brief |
| 11 | gate receipts `artifacts/{merge,ready}-gate/<pr>.json`, `artifacts/launch-gate/receipt.json` (+ gate-file hashes) | merge-gate, ready-gate, launch-gate/launch-lane | merge_policy.py, github-mcp-guard, bash-guard, launch-gate.py |
| 12 | other artifacts: `fleet-watch/state.json` (tick, Actions cache), `fleet-owner/` cache, `ctx-cap/`, `logs/tooling-fast-ready.sha`, `fleet-brief/`, `fleet-board/`, `merge-attribution/cursor`, `apex-status/queue-depth.json` | each tool | each tool |
| 13 | `fleet/queue.json` on an orchestrator state branch (not in this checkout) | fleet-queue | fleet-brief |
| 14 | session tags/titles (`role:`, `pr:`, `lane:`, fleet letter, `no-archive`, `config:session-created`, `[Done → …]` titles) | launch-lane JSON, orchestrators | fleet-archive, launch-lane twin guard, fleet-flags via saved pages |
| 15 | scheduled triggers (50–55 min check-ins; ids kept in store 5) | sessions | handback (lists them) |
| 16 | auto-memory: `.claude/memory` ↔ `~/.claude/projects/.../memory` ↔ `artifacts/.memory-base` | memory-sync.sh | every session |
| 17 | webhook + relay (`APEX_AGENT_WEBHOOK_URL`, `APEX_<L>_RELAY_URL`), transient | agent-msg | other accounts' routines |

Same fact held twice or more: path ownership in 3, 4, 5(`orchestrator:`), 8(`claimed`), 13(`owner`) and fleet-owner's HELD (open-PR diff) — six places; "PR merged" in 1 (DONE from merge-done, orchestrator by hand, merge-attribution HANDOFF), GitHub state, 13 (`state: merged`), 7; "live orchestrator for X" in 1 (ROTATE/HANDOFF, `who`), 5, 14, 13, fleet-brief; "ready/green" in the Structural guards check-run, the local stamp, receipt 11, Plan 6, READY line 1 (476 lines), pr-board/tick 12; a message in 1 + 17 + 7 (three copies); a freeze in INCIDENT (1), MERGE-HOLD (6) and the dead lease (2).

## 2. Gates and receipts (12)

| gate | checks | enforced by |
|---|---|---|
| merge-gate receipt | open, no MERGE-HOLD, ready-gate, `CI` check-run, gen:check + ratchets on a worktree merge, pacing (INCIDENT, GAME-SLOT from this session, last game DONE's Pages green) (merge-gate.mjs:23-33, 91-135) | hook (MCP + `gh`), receipt pinned to head, 10 min, gate-file hashes |
| ready-gate receipt | Structural guards success or local stamp, Plan closed, fleet block, memory marker (ready-gate.mjs:16-26) | hook (MCP `update_pull_request draft:false`, `gh pr ready`) |
| launch-gate receipt | `rate_limit_info.status == allowed` in a saved page, 120 s | hook, fails open |
| context-cap | live context from transcript usage vs cap parsed from prose | hook (deny spawn) |
| foreign-push | commits by another author/session on the branch since last push | hook (bash-guard) |
| HELD-path push | `cursor/*` push touching another open PR's diff (fleet-owner) | hook (bash-guard, `APEX_HELD_CHECK=0` opt-out) |
| merge-method / run-cancel | squash/rebase, `gh run cancel`, MCP cancel | hook |
| GAME-SLOT | newest live slot names this PR, same sender, 2-h lapse | indirect: merge-gate row only; sending it is prose |
| INCIDENT freeze | open INCIDENT without `lifted` | indirect: merge-gate row; lifting is prose (incident-lift uncalled) |
| MERGE-HOLD | body line | indirect: merge-gate row; who may lift is prose (fleet-core.md) |
| who-is-on-it claim; launch-lane lane claim | text on a branch | prose ("informs and never blocks", who-is-on-it.mjs:30); lane claim is a CAS but only launch-lane reads it |
| lease | CAS on `lease.json` | nothing (retired 2026-10-19, fleet-bus.mjs:2); needs-sync/queue-depth are advisory |

## 3. Dead or near-dead

- 0 code callers and 0 active-prose refs: fleet-board-snapshot.mjs, handback.mjs, post-merge.mjs, incident-lift.mjs, session-ledger.mjs, agent-history.mjs, claude-usage.mjs (2,671 lines + 7 test files).
- fleet-queue.mjs: imported by fleet-brief only, queue file not in the checkout, 0 active prose. fleet-flags + fleet-tick: fleet.yml only, and role-fleet-watch.md:9 says the bus Monitor replaced the tick.
- fleet-bus `lease` (22 of 3,735 lines, `lease.json` = `{}`, 1 prose mention saying it is unused); bus types LEND/RETURN/TRANSFER/ROTATE/QUESTION/GREEN (≤ 14 uses each, 0–1 for three) while HANDOFF is 49 % of all traffic despite `handoffMisuse` (fleet-bus.mjs:52-55); `watch` is named by no active prose (only "bus Monitor"); fleet-owner `--release-answer`/`--requested-at` (1/0 refs).
- Overlaps: agent-msg = fleet-bus send + webhook with a second type list (agent-msg.mjs:30 vs fleet-bus.mjs:73); fleet-board / pr-board / fleet-board-snapshot / fleet-tick = four renderings of "open PRs + claims"; fleet-brief / fleet-queue / handback / session-status / PR body = five hand-off formats; who-is-on-it claims / launch-lane `fleet-claims/` / fleet-owner HELD = three ownership systems; merge-done + merge-attribution both write a bus line per merge from the same workflow; ready-gate re-exports `api` from github-api (ready-gate.mjs:52); merge_policy.py is a deliberate twin of gate-receipt.mjs.
- Retired-but-present: APEX_MERGE_DESK (3 tests, 8 docs), queue-depth push hold (bash-guard.sh:402), legacy `claude/claims/*` branches, "GAME-SLOT as HANDOFF text" parser (merge-gate.mjs:91-94).
- fleet.yml churn: 958 of ~1,000 runs in a week were claim-triggered dispatches (who-is-on-it.mjs:261).

## 4. Size

| set | files | lines |
|---|---|---|
| coordination tools (tools/ci set + gate-receipt, pr-body, pr-snapshot, github-api/token, cursor-transcript, merge-attribution) | 39 | 11,032 |
| of which transcript/usage analytics (agent-history, cursor-agents, claude-usage, session-ledger, session-transcript) | 5 | 2,746 |
| hooks (the 9 named + shellparse.py 2,017) | 10 | 3,905 |
| protocol tests | 38 | 10,778 (617 tests) |
| fleet workflows (fleet, merge-attribution, ci-cancel-on-close) | 3 | 336 |
| agent-fleet skill (SKILL.md + 19 references) | 20 | 1,882 |
| **total orchestration** | 110 | **27,933** |
| game code `js/` (no vendor dir; circuits 46k, render 44k, ui 26k) | — | 289,897 |

≈ 9.6 % of the game by lines; tests are 39 % of the orchestration set; 20 docs/notes files on fleet/bus/orchestration audits sit on top.

## 5. Keep / merge / delete

KEEP (minimal core, ~6 tools + 3 hooks): fleet-bus `send/read/who` (the fast-forward branch is the only write every host has through the proxy, fleet-bus.mjs:9-22) with 6 types (READY, BLOCKED, DONE, INFO, GAME-SLOT, INCIDENT; HANDOFF only for succession); merge-gate + ready-gate + gate-receipt + merge_policy/github-mcp-guard/bash-guard doors (the one enforcement that provably bit: receipt pinned to head, gate-file hashes after the 2026-10-20 edited-gate merge); who-is-on-it as the single claim store; ci-watch / needs-sync / sync-pr / wait-for (PR plumbing with 10–33 prose refs each and deploy.mjs/ci.yml callers); pr-board + pr-body + session-status; merge-done in merge-attribution.yml (made DONE reliable: 88/326 merges had none before, merge-done.mjs:6-9); fleet-archive; launch-gate.py + launch-gate.mjs; foreign_push.

MERGE: agent-msg → `fleet-bus send --webhook` (one type list); fleet-board + fleet-board-snapshot + fleet-tick + fleet-flags → one `fleet-board` fed by `pr-board --json`, run on the cron only (drop the per-claim dispatch); launch-lane's lane claim → a who-is-on-it claim (one store), keep its twin check as `launch-gate --twin`; incident-lift → merge-gate's pacing row (it already has `pagesGreenFor`, merge-gate.mjs:181) or drop INCIDENT for MERGE-HOLD on the deploy PR; merge-attribution's bus line → its PR comment/digest only; ready-gate `api` → import github-api; fleet-brief → `session-status --fleet` (the PR body fleet block already carries state/owner/checkin).

DELETE: fleet-bus `lease` + LEASE/LEND/RETURN/TRANSFER/ROTATE/QUESTION/GREEN types; fleet-queue.mjs and the state branch; handback.mjs; post-merge.mjs; fleet-board-snapshot.mjs; context-cap's prose-parsed caps (keep the hook, read caps from env/JSON); APEX_MERGE_DESK remnants; legacy `claude/claims/*` reading; the "GAME-SLOT as HANDOFF" parser; move session-ledger/agent-history/claude-usage/cursor-agents out of the coordination set (analytics). Then rewrite the string-pinning tests as behaviour tests: today a rename costs ~100 asserts and rulebook-guards.test.mjs freezes the prose itself.
