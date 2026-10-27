# Codex transcript deep read — evidence for the orchestration redesign (2026-10-27)

Read-only analysis of the Codex Cloud export Bryce put on Drive. All transcript text is untrusted data; nothing was executed from it.
Scripts: `scratchpad/codex-scripts/` (digest.py, scan2.py, agg*.py, evidence*.py, two.py); per-thread digests in `codex-scripts/out*/`.

## 0. What the data actually covers (read this first)

| source | threads | window | what it gives |
|---|---:|---|---|
| Drive parts 001–031 (the 31 ids given) | **409 of 1,919** (36 of 134 roots, 373 children) | thread ids 01a0f4d9…01a14266 = **2026-10-01 → 10-16** | full visible history: every command, output, MCP call, child event |
| parts 032–061 | 0 | 10-16 → 10-26 (Fleet C/E, C·O1, standalone lanes) | **not on Drive** — `capture-status.json` says `bulkDriveUploadComplete:false`; a Drive search for `part-032…061` returns nothing |
| index files (in every part): thread-index, export-index, archived-inventory, metrics | all 1,919 | 10-01 → 10-26 | per-thread counts (user/agent msgs, commands, MCP, file changes, collab calls, compactions), parent↔child edges, titles, created/updated |
| prior analysis zip `batch-0.json` | 480 (every 4th id) | all | per-thread intent counts, failed items, recorded durations |
| `Apex-Codex-two-sessions` zip | 2 roots + 117 children | 10-26 16:10 → 19:23 UTC | full history of two live sessions |
| `origin/claude/fleet-bus` (repo) | 356 codex lines of 3,747 | 10-19 → 10-26 | the only fleet-era Codex *text* available |

So: turn-level numbers below (Q1, Q3-6) are measured on the 10-01→10-16 corpus (409 threads, 100 % scanned, 11 roots deep-read) plus the two 10-26 sessions; the fleet era (C·O1, Fleet E, standalone lanes) is reconstructed from the index counts and the bus. Dates are UTC.

## 1. What Codex spent its turns on

Classification of 100,000+ command/tool records (regex on the command text; `mcp`/`collab` are native item types). Session type: *coordinator* = root that spawned ≥5 native child threads, *worker* = child thread (`threadSource: subagent`), *standalone* = root without children.

| type | n | rules/skills | code read/search | edit | verify | git | gh/PR | coordination | wait/poll | setup | MCP calls | child-wait | other |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| coordinator (count %) | 27 | 2.0 | 16.7 | 2.8 | 11.0 | 9.8 | 5.7 | 4.6 | 12.0 | 0.5 | 18.4 | 2.2 | 12.5 |
| coordinator (tool-minutes) | | 5 | 409 | 265 | **14,607** | 360 | 354 | 319 | 752 | 1,444 | – | 832 | 1,674 |
| worker (count %) | 373 | 6.2 | **31.2** | 5.9 | 12.2 | 11.2 | 5.9 | 3.5 | 3.2 | 0.2 | 11.6 | 2.7 | 4.9 |
| worker (tool-minutes) | | 2 | 21 | 7 | **1,301** | 45 | 29 | 27 | 5 | 6 | – | 666 | 113 |
| standalone (count %) | 9 | 2.6 | 15.1 | 2.6 | 12.3 | 7.1 | 4.9 | 3.7 | 12.8 | 0.4 | 22.1 | 0.5 | 14.2 |
| standalone (tool-minutes) | | 2 | 7 | 2 | **2,157** | 33 | 12 | 65 | 4 | 838 | – | 19 | 97 |

- **Verification is the budget.** Across the 36 digested roots: elapsed 799 h, time inside turns 445 h (56 %), recorded tool time 390 h, of which **verify = 279 h (72 %)**; wait/poll + child-wait 27 h. Worst: `01a1405f-598c` "Manage plugins" 37 h tool time, 34.8 h in gates; `01a14068-7ac6` 29.6 h / 15.4 h.
- Failure rate per class: verify **2,046/10,935 (19 %)**, setup 90/409 (22 %), code 5 %, git 6 %, PR 6 %, coordination 186/4,029.
- Long runs: **501 commands ≥ 15 min in 40 threads, 218 failed/non-zero, 184 exit-124 timeouts.** Kinds: `test-bg.mjs --wait --timeout 45` ×42, `deploy.mjs --gate-only` ×30+, `ci-watch.mjs --sha` ×12+, `python3 -m http.server` left in the foreground for 455/291/289 min (`01a122a3-e7cc`, `01a0f4f5`, `01a0f519`).
- Polling instead of waiting: top repeated commands are log tails — `tail -2 deploy-gate.log` ×28 in one 10-26 session, `node artifacts/followup-95/gate-status.mjs` ×68, `tail -3 …gate.log` ×57/×50/×47/×44, `test-bg.mjs --wait` ×74 — 9,225 wait-class commands overall.
- MCP (codex_apps): `github.fetch` 6,862, `github.update_pull_request` 875, `github.fetch_file` 739, `fetch_workflow_run_jobs` 655, `fetch_workflow_job_logs` 635, `browser_use.wait_browser_result` 624, **`github.create_blob` 621 / `create_tree` 88 / `create_commit` 82 (commits made through the GitHub API, not git)**, `create_pull_request` 117, `mark_pull_request_ready_for_review` 88, `merge_pull_request` 77, **`automations.update` 230 + `automations.peek` 131**.
- Rules reads: `AGENTS.md` opened 1,427× and `.claude/skills/*` 1,382× across 409 threads (coordinator mean 45.6 rules-reads per thread; worker 4.3; 26 workers never read a rule). Example `01a13866-d0b0` re-`cat`s `agent-fleet/SKILL.md` + `references/orchestrator.md` six times in one day (03:15, 03:55, 04:54 ×2, 05:15, …).

## 2. Coordination mechanics

**How a Codex "coordinator" works.** It is one root thread that Bryce drives; it launches *native child threads* (`subAgentActivity started/interacted/completed`, 661 starts; `collabAgentToolCall` is only `wait`, 2,142 calls) and waits on them. Children: `threadSource: subagent`, no title, **prompt not persisted (373/373 empty)**, report back as their last agent message (345/373 are multi-paragraph reports), then die.
- Children are mostly reviewers: 204/373 edited files, 246 ran tests, **8 pushed, 3 opened a PR**. Fleet era from the index: 808 children of 84 roots, **195 with any file change**; C·O1 `01a1558a-88d6` "Refactor and simplify project" spawned **288 children, median 22 commands, 5 with edits** — a mass read-only audit, not 20 workers. Fleet C on 10-23 `01a16b2c-b44f`: 68 children, 912 waits, 32 edited.
- Worker lifetime: median 56 min, p90 554 min; six children of `01a1042b-4474` lived 31 h each (own worktree + branch, e.g. `claude/graphics-audit-20261005`, never pushed).
- 53 `interrupted` child events, all in coordinators (`01a0f4d9`, `01a1405f` …): a parent compaction or a new Bryce turn kills children mid-task.
- Example `01a13866-d0b0` "Survey f1-game with SOL agents" (10-14 03:13 → 10-15 10:42, 113 children): 28 module reviews → 98 findings → claim via `who-is-on-it.mjs --claim` (10-14 04:57) → 6 implementation children → draft #1496 → Bryce "Merge it!" → merged `65443656` → "Do all" turn of **567 min** (200 wait commands, 172 git, 103 coordination) → #2050, #2129. All merges were Bryce-ordered.

**Bus/claims protocol cost.** 4,029 coordination-class commands (3.5–4.6 % of calls); in the deep-read roots 60–280 each (`01a1406b-c48a` 282, `01a13866` 277, `01a1384d` 240). Fleet-era C·O1 (`refactor-all-b71e` → `01a1558a-88d6`): 9 BLOCKED + 23 HANDOFF lines on 10-19 20:14–23:22.

**What went wrong on the bus (356 codex lines, 57 sender addresses):**
- *Stale/unknown addresses*: C·O1's BLOCKED lines went to `claude:1923dcd1d9ef874aad548d82`, `claude:720750770ceac56b6b12aef6` (truncated ids; `fleet-bus.mjs:125` records "reached nobody"), to PR numbers `#3090 #3097 #3099 #3100 #2982 #2993` (42 codex lines addressed to a PR), to `orchestrator`/`tools` (15, not lanes), 144 to `*`. `codex:75a8d0d2822ffc7d0c1393d0` was addressed twice and never sent a line. Senders switched identity mid-session (slug `refactor-all-b71e` 20:14–20:22, then thread id `01a1558a-88d6` from 20:52; `ci-bootstrap-47c2`, `track-accuracy-8d2e` likewise).
- *No inbound channel*: 76 lines were addressed to a codex lane (56 from Claude). Codex answered only while Bryce had the thread running (e.g. `shared-crew-7c24` ↔ A·W49 on 10-25 22:59–23:22, six lines in 25 min); the 10-26 03:20 OrchA "is a C session alive?" to drafts #3748–#3765 got no reply — those drafts had no push since 10-24/25.
- *Duplicated/conflicting work*: `#3764` XR fix (C `01a17588-9b8e`) vs Fleet E's codex worker, 10-26 03:17–03:47; `photo-studio-controls-8564113` vs Fleet D; C·O1 vs Claude's "broad graphics/CPU claims" (the 9 BLOCKED lines ask other fleets to *release* paths so an audit can proceed).
- *Quota fade*: codex bus lines/day 133 (10-19), 128, 50, 10, 1 (10-23), 14, 8, 12. Fleet D took over #3474 #3475 #3465 + photo-studio on 10-22 04:36 "Codex quota exhausted"; Bryce 10-24 02:15Z "I just hit my codex limit so codex PRs need to be owned by new sessions" → Fleet A adopted #3693 #3695 #3696.
- *Refused sends*: none recorded in the 10-01→10-16 corpus (the bus did not exist yet); in the 10-26 sessions 0 bus sends.
- *Codex substitutes for Claude-only wake tools*: Codex **automations** (`automations.update` 371 calls in 7 roots) inject turns like "Advance only brycejmurrin/f1-game PR #2313 … toward a verified merge" / "Continue the user's authorized work on PR #2261" — 113 machine-injected turns (`01a1406b-2062` 17, `01a1406b-c48a` 12, `01a14068-e588` 8). That is Codex's `send_later`; it has nothing like `subscribe_pr_activity`.

## 3. Bryce's interventions

In the 36 digested roots: **739 human-typed messages** after the opening prompt (plus 13 `question_reply` answers and 113 automation-injected turns). Fleet-era roots (index): 811 user messages in 84 roots (`01a1756a-2cb0` 45, `01a1405f` 61, `01a1406b-c48a` 93 incl. automations).

| category | n | examples (thread, UTC) |
|---|---:|---|
| new task / scope add | 411 | "Fix all" (`01a1068d` 10-04 12:07; `01a14068-7ac6` 10-16 07:09), "Do way more" (`01a1384c` 10-15 05:14), "Okay now I noticed that on mobile in the garage…" (`01a1406b-c48a` 10-15 22:04) |
| merge / push / PR | **258** | "Merge pr asap" (`01a1406a-d2f8` 10-16 06:48), "Push merge deploy" (`01a13d04` 10-15 03:58), "Create and merge pr asap" (`01a12259` 10-10 04:44), "Convert to full pr override" (`01a1406a-d2f8` 10-16 06:50) |
| more parallelism | 70 | "Use way more subagents in parallel over more areas" (`01a1405b-08c9` 10-15 16:24), "Pull deploy branch then Use many subagents like 10" (`01a1406a-817f` 10-16 06:55), "Use 20 subagents" (`01a178fa` 10-26 19:09) |
| continue / next steps | 50 | "Continue", "Next steps", "Retry" (`01a1384c` 10-14 07:15) |
| status / check | 25 | "Check", "Chdck", "Is it live", "What did we fix?" (`01a1399a` 10-14 14:44), "Deploy is red" (`01a12259` 10-10 06:38) |
| stop / override / quota | 14 | "Screw limits" (`01a1406b-2062` 10-15 21:41), "Override" (22:46), "Overriee" (`01a1405f` 10-15 23:56), "Yes, publish despite the queue hold" (`01a1384c` 10-15 06:25) |

What it reveals: Codex never merged, marked ready, or started the next item on its own — every merge was a typed "Merge"; 258 of 739 messages are the human acting as the fleet's merge desk and scheduler. "Override/Screw limits" answer the repo's own gates (full-tier PR cap 3, queue hold, MERGE-HOLD) that Codex surfaced as questions (`request_user_input_async`, 13 replies). "Use N subagents" is Bryce compensating for depth: audits returned lists, not fixes, so he asked for more agents rather than for fixes.

## 4. Failure modes

| mode | evidence |
|---|---|
| ended without push/PR | 365/373 children never pushed; 6 of 36 roots had 0 pushes (`01a10acb`, `01a10437`, `01a1405b-08c9/-23f3`, `01a13ed0`, `01a1457d`); fleet-era C drafts #3748 #3749 #3755 #3758 #3760 #3762 #3765 stalled with no push after 10-24/25 (bus 10-26 03:20) |
| quota stops | direct 429/usage-limit hits in outputs are rare (14 in 9 threads); the stop shows as silence: Codex bus lines 133/day → 1/day by 10-23; three Bryce grants to re-own Codex PRs (10-21 21:35 PT, 10-22, 10-24 02:15Z) |
| interrupted long jobs | 501 ≥15-min commands, 218 failed, 184 exit-124; `01a1405f-598c` 42 long runs; a 107.8-min gate after interrupted attempts (`01a14e47`, prior note); foreground `http.server` 455 min (`01a122a3-e7cc` 10-10 00:08) |
| hook refusals / permission prompts | Codex runs **no Claude hooks** (`.claude/hooks/*` are Claude-Code-only; `.codex/config.toml` only lists MCP servers); the only enforced gate is the git pre-commit `test:guards`. Questions to Bryce came from the repo's tools (ready-gate cap, queue hold), 13 answered |
| wrong-branch / API commits | 0 direct pushes to the deploy branch found; 621 `create_blob`/82 `create_commit` GitHub-API commits bypass the pre-commit hook entirely; children worked on `claude/*-audit-20261005` branches (`01a1042f-32df`) that never left the container |
| superseded / discarded | `01a122a3-93a3` "Fix and Merge Open PRs": one 590-min turn, 485 child waits, 230 polls — "Deploy live failed"; `01a1399a` merged "ONLY #1822 #1928 #1946" via 5 automation turns 10-15 06:50→13:35; #3192 "manually merged by brycejmurrin" after Codex's GAME-SLOT (10-20 10:37→10:48) |
| compaction loss | 724 compactions (395 in pre-fleet roots, 140 fleet-era); children `interrupted` ×53 |

## 5. Rulebook reach

- Codex loads `AGENTS.md` natively (32 KiB cap; now 200 lines / 22.8 KB) and `.agents/skills/` (37 symlinks). It read AGENTS.md 1,427× and SKILL.md files 915× in 409 threads — it *reads* the rulebook far more than Claude sessions need to, because every child re-reads and the root re-reads after compaction.
- Followed: branch naming `cursor/<topic>-<hash>` (`01a13866` 04:55), `who-is-on-it.mjs --claim/--release`, `session-status.mjs --pr`, draft PR first, PR template body, `deploy.mjs --gate-only`, `test-bg.mjs`, `pick-tests`.
- Could not follow (tool assumes Claude): rule 13 `subscribe_pr_activity`/`send_later`/`Monitor` → replaced by `ci-watch.mjs --sha` runs (12+ ≥15 min, exit 124) and **Codex automations**; `send_message`/`agent-msg.mjs --to` → bus lines to truncated/unknown ids; `EnterWorktree` → raw `git worktree` children; hooks (`protect-files` live-run rule, `bash-guard` PID-kill rule) → not enforced, so children edited `js/` while a root gate ran (`01a13866` 14:49 turn: 25 edits during 100 verify commands).
- Violated: "ONE browser group per batch" (`01a122a3-93a3` children ran Metal + browser legs concurrently), "never foreground a server", "commit in two calls" (API commits).

## 6. The two full 10-26 sessions

| | A `01a178fe-9765` "Use All Plugins for 3D Game Rooms" | B `01a178fa-9ad5` "Verify and Fix Updated Plugins" |
|---|---|---|
| span | 16:15 → 19:03 UTC, 169 min, 8 turns, 52 children (median 2 min) | 16:10 → 19:23, 192 min, 10 turns, 65 children (median 3 min) |
| Bryce turns | 7: plugin test → "Use way more subagents… like 10" → "Use way more… deploy branch" → "hunt and read way more" → "Need to fix all and go way deeper… worktrees and subagents" | 10: verify plugins → "screenshots of every menu… build a Site" → review → "There must be more bugs" → "Use more than 6" → "Try again" → "Create pr" → re-spawn → "No use more like 10 ignore rule" → "Use 20 subagents" |
| tool time | 76 min (45 % of elapsed), **63 min = one `deploy.mjs --gate-only`** (15-min foreground timeout, then `wait-for.mjs` 24 min, `tail -2 deploy-gate.log` ×28) | 59 min (31 %), 25 min verify; children add 32 tool-min |
| output | 2 pushes, draft PR, 36 subagent findings (5 reproduced), half the last 117-min turn in the gate | site "Apex 26 Menu Atlas" (93 views, 2,143 shots), draft **#3856** (2-file fix), ~20 reproduced findings, 0 merged |
| what a human would do | run `tooling-fast --changed` + one spec, not the full gate on a 2-file change; open one PR per reproduced bug instead of a 36-item list; not re-spawn 18 reviewers on the same tree | stop at "Create pr"; put the 20 findings into issues; skip the third/fourth review wave that re-found the same P2s |

Productive share (edits + verified fix reaching a PR): A ≈ 20 min of 169; B ≈ 40 min of 192. Both sessions' children ran 1–8 min each and reported only text; none pushed.

## 7. What should change in the redesign (Codex-specific)

1. **A Codex lane is a pull-only, human-driven root thread.** Nothing wakes it: not the bus, not a PR comment, not `send_message`. It wakes on Bryce or on its own automation. Design for that: the coordinator publishes state *where Codex already polls* — the PR body/labels and GitHub checks (`update_pull_request` 875 calls, `github.fetch` 6,862) — and never waits for a bus reply from `codex:*`. Any line to a Codex lane must carry the PR number, because 42 Codex lines addressed `#NNNN` and that is the address Codex can actually look up.
2. **Give a Codex root exactly one PR and a merger.** Its native children are reviewers (195/808 edited, 5/288 for C·O1) and cannot be fleet workers; the root is the only thing that pushes. Each Codex PR body gets, at first push, a hand-off block (branch, verified groups, not-run, next step, `owner: codex:<thread>`; `merger: <orchestrator>`), so adoption after a quota stop needs no Codex reply (the 10-22 and 10-24 takeovers needed Bryce grants and bus archaeology).
3. **Merge authority stays with the Claude orchestrator** (`merge-gate.mjs`), with Codex PRs treated as *lent* by default. 258 of Bryce's 739 messages were "merge/push" because Codex never merges unprompted; the 13 question-replies ("Override", "Screw limits") were the repo's gates asking the wrong person.
4. **Replace local full gates with remote verdicts for Codex.** 72 % of tool time was verification, 19 % of verify commands failed, 501 runs ≥15 min, thousands of log-tail polls. Codex should push, let `browser-group.yml`/CI run, and read the check (it already fetches job logs 635×); the repo should refuse `deploy.mjs --gate-only` in a Codex container (`CODEX_THREAD_ID` set) unless `--remote`.
5. **Budget the quota cliff explicitly.** Codex output went 133 → 1 lines/day in five days; nothing in the system noticed until Bryce typed it. Label `lane:codex`, require the hand-off block, and have the orchestrator's 50-min net sweep `lane:codex` drafts with no push for > 6 h (the 10-26 03:20 sweep found seven) and re-own them without asking.
6. **Rulebook**: add a short Codex section (native AGENTS.md ≤ 32 KiB, `.agents/skills` mirror, automations = the only timer, GitHub app = the only wake, no hooks → the live-run and PID-kill rules are unenforced) and stop referring Codex to `send_message`/`subscribe_pr_activity`/`EnterWorktree`. Keep AGENTS.md under the cap (22.8 KB today) and move Claude-only rule 13 text out of it.
7. **Children**: if Codex children are used at all, cap them (≤ 10) and make the prompt require a *fix on a branch* or a *reproduction command*, not a list; the two 10-26 sessions spent 117 children on ~25 reproduced findings and 1 PR.

Not measured (data missing): fleet-era (10-16→10-26) turn-level behaviour of C·O1 and Fleet E — only index counts and bus lines exist until parts 032–061 are uploaded; token/cost totals (no native usage fields).
