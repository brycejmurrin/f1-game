# Codex archive mining — 2026-10-26

What OpenAI Codex Cloud sessions on this repo spent their time on, 2026-10-01 → 10-17, and which of those costs the
current tree still carries. Bryce shared a private Drive folder ("Codex Archives Private 2026-10-26") holding a 61-part
export of Codex transcripts plus a generic findings report; he asked to "dig into the raw archives" and then "use
subagents to dive into everything deeply to find patterns". Session `session_01RrkwnTotSpmGMJQggtig8F`.

Read-only evidence. Every proposal below is a proposal; none is applied by this note. Prior art not re-reported:
[TRANSCRIPT-MINING-2026-10-16](TRANSCRIPT-MINING-2026-10-16.md), [AGENT-RETRO-2026-10-17](AGENT-RETRO-2026-10-17.md),
[FLEET-B-TRANSCRIPT-AUDIT-2026-10-26](../archive/notes/FLEET-B-TRANSCRIPT-AUDIT-2026-10-26.md) (all Claude Code sessions; this is the
first pass over Codex).

## Method and coverage

- **Source.** 31 of the 61 zip parts were in the folder (the exporter's upload was paused). Each part was streamed,
  reduced to one compact record per item (command, exit, duration, output size and 300-char tail; MCP tool, args,
  result size; user messages; compactions; subagent events) and deleted. Result: **410 threads, 73,617 shell
  commands, 16,187 MCP calls, 872 user messages, 424 compactions, 12,320 subagent events, 421 command tool-hours**.
  Tool-hours are summed durations and overlap; they are not wall time. Reasoning was excluded by the exporter.
- **Lenses.** Five read-only analyst subagents, one per lens: gates and long jobs; polling and output volume;
  failures and retry loops; Bryce's messages; delegation and compaction. Three re-streamed raw parts for detail.
- **Verification.** Each finding was labelled OPEN / PARTLY-FIXED / STALE against the tree at `17b68ed7`. The two
  claims with code fixes attached were re-checked by hand; one was corrected (finding 6).
- **Limits.** Half the archive is missing, and the 10 biggest fan-outs keep only 4–30 % of their child threads, so
  child-side counts are lower bounds. No token or cost figures exist in the export.

## Ranked findings

### 1. The pre-push gate runs 211 node test files twice — OPEN

`gateOnly()` (`tools/ci/deploy.mjs:823-824`) runs `tooling-fast`, then every script of ci.yml's "Pure-node unit
suites" step (`gateNodeSuites()`, `deploy.mjs:227`). On today's tree **211 of those 333 files are already in
`TOOLING_FAST_FILES`** (`tools/ci/tooling-fast.mjs:77`): state-unit 56/61, steering 39/40, audio 34/39, garage 28/30,
mcp 26/26, desktop 9/9. That is about 1,070 s of recorded file time (~18 serial min) on every gate. The node half
exists to catch pins tooling-fast never runs (the comment at `deploy.mjs:229-234`); the overlap is incidental.
Archive: 388 real gate launches, median 32.5 min, p90 50 min, 142 tool-h (34 % of all command time).
**Proposal:** the node half runs only files tooling-fast did not run on the same tree (after confirming the npm
scripts set no different env); pin overlap = 0 in `tests/unit/prepush-gate-coverage.test.mjs`.

### 2. A gate that dies restarts from zero — OPEN

51 gates ended on a signal (12.5 tool-h); 46 were relaunched from scratch a median 4.5 min later, 24 with no edit in
between (301 min). Causes: 28 killed by the agent itself (deploy branch conflicted mid-gate, early FAIL), 12 Codex
exec-transport drops (ex −1), 6 a Bryce message in the window. Five of Bryce's 22 "Retry" messages followed a dead
gate. Agents hand-built resume: 110 commands in 34 threads import `gateNodeSuites`, 88 write `*-gate-resumed.log`.
`tooling-fast` already stamps a tree hash (`tooling-fast.mjs:421-439`) but only `ready-gate` reads it;
`deploy.mjs:820-873` keeps no per-stage state. **Proposal:** per-stage receipts in `artifacts/logs/` keyed by
work-tree id (`tools/lib/work-tree-id.mjs`) and `deploy.mjs --resume`, refusing when the tree changed.

### 3. Cheap failures surface last — OPEN

37 of 51 reds with a known stage failed inside the guard suite at a median 7.6 min; 72 of 96 failing files run in
under 10 s, and 25 are in the 43-file `test:guards` set (ratchets, merge-hygiene, docs-integrity,
changelog-fragments). The gate orders longest-first with no `--bail` (`deploy.mjs:641,823`;
`tooling-fast.mjs:118-121`). Only 1 of 124 standalone tooling-fast runs used `--changed`. **Proposal:** a fast
prefix in `gateOnly()` (guards → `--changed` → last-failed, with `--bail`), then the full pass skips what the prefix
passed. Context: tooling-fast grew 347 → 647 files in the archive window (median 264 → 622 s) and is 913 today,
while the gate still pins `--jobs=2`.

### 4. Codex watched CI through the GitHub connector, not `ci-watch` — OPEN (guidance)

MCP `github.fetch`: 6,862 calls, **468 MB** of results, in 42 threads (one thread: 2,251 calls, 109 MB). Top
endpoints: `actions/runs/<n>/jobs` 2,840 calls / 182 MB, `actions/runs` 1,036 / 120 MB, `commits/<sha>/check-runs`
278 / 51 MB; the same URL was re-fetched 5,113 times at a median 66 s. 86 % of those calls came from threads where
`ci-watch.mjs` also ran fine (843 calls, 2.6 MB total, ~20× cheaper per call). **2,271 results were truncated at
~64 KiB mid-JSON**, which drove 1,078 `&page=N` retries; `/actions/workflows/*` and `/actions/jobs/<n>` fetches
failed 78 of 78. `AGENTS.md` rule 13 names Claude Code and Cursor only; `agent-fleet/references/adapters.md:13-22`
has no Codex column. **Proposal:** a Codex clause in rule 13 (one foreground `ci-watch.mjs --sha … --failures-only`;
never poll `actions/*` or `check-runs` through the connector; results over ~64 KiB arrive cut) and a Codex column in
adapters.md.

### 5. Log polling: ~34 polls per long gate, `wait-for` never used — PARTLY-FIXED

25,834 log reads (24,680 `tail`) in 280 threads; per gate of ≥10 min a median 34 polls and 21 commentary messages;
472 `sleep` commands and 337 `while`/`until` loops; `wait-for.mjs` used 0 times. `deploy.mjs --status/--wait`
(`deploy.mjs:1040-1055`) and `wait-for.mjs --log-matches` exist, but AGENTS.md step 6 and skill `check-changes` do
not mention `deploy.mjs --wait`, and `wait-for.mjs:26` caps foreground waits at 590 s, a Claude Code limit Codex
does not have. **Proposal:** name `deploy.mjs --wait` in step 6 and check-changes; a Codex line in rule 4.

### 6. Stacked `test-bg --wait` waiters — OPEN (corrected)

73 of 91 `test-bg --wait` calls exited 1, but they trace to only 4 red runs (two 2-second setup failures, one
non-browser half after "20/20 passed", one death at loadavg 9.75); no browser test failure. 65 of the 73 are one
thread where Codex launched a new `--wait` every ~33 s while earlier ones still blocked, all returning together.
A subagent claimed `--wait` reads a stale registry; that is wrong — each start keeps only live runs
(`test-bg.mjs:624-627`), so a wait with nothing running reports the last batch by design. **Proposal:** a
single-waiter lock (`test-bg.mjs:78-90`); print "nothing ran during this wait; last verdict …"; name the failing half
in `outcomeOf` (`:177-182`).

### 7. Bryce's nudges: 140 approvals, 48 "Check", 29 "Retry" — PARTLY-FIXED

872 user messages; 248 of 763 human-typed are ≤12 chars. About 45 approvals only got an agent past a hold it had set
on itself (queue hold, ready cap, someone's claim); he overrode 8 times in so many words. The queue hold and
`ready-full-cap` are retired since (STALE). Still open: a merge asked for before CI is green needs a second "Merge"
(`.claude/skills/ship/SKILL.md:32-34` does not say the grant survives the CI wait). 41 of 48 "Check" messages came a
median 7.5 min after a final answer that claimed "monitoring remains active" with nothing armed; when watching, he
re-checks every ~9 min (p25 7.2, p75 22.3) — data for the check-in cadence still pending him in memory
`short-pr-check-ins`. 11 "Retry" messages came in one 3-minute burst across 11 threads (host-side drop). 16 times he
relayed the same order to 3–11 sessions by hand.
**Proposals:** an in-session merge request stands until that PR merges (gate, then `wait-for.mjs --merged`); a
"monitoring" claim names the armed wake and an ETA in Pacific time.

### 8. Questions agents did not need to ask — PARTLY-FIXED

Of 13 questions put to Bryce, 9 are unnecessary under today's rules (retired holds and caps; the PR owner watches its
own CI), 2 are borderline, 2 were real (a repro detail; a live claim). Every scope question ("which part first?",
"which direction?") got "All" or "(Recommended)". **Proposal** (memory `ask-via-askuserquestion`): for a scope
question, take "All" or the recommended option, say so, and proceed.

### 9. A user message interrupts every running Codex subagent — OPEN (Codex)

37 of 55 child interruptions came within 60 s of a user message (child median age 4.6 min); only 6 interrupted
children were respawned. Two waves lost 19 audit children each after "Fix all in pr" / "use many subagents like 10".
Parents also blocked on untargeted `wait` calls: 2,323 calls, 27.5 tool-h, 45 % timing out empty. Within parents,
more live children did mean more output: 0 live → 1.8 edits/h and 0.53 commits/h; 6+ live → 9.2 and 1.44, without
more waiting; distinct files per hour stayed flat (1.5–1.7). **Proposals:** a Codex row in
`agent-fleet/references/multi-host.md` (list interrupted children, then respawn or strike each); "a parent never
blocks on a worker" in `.claude/agents/README.md`; a 3–6 concurrent-worker default on disjoint OWNED paths in
agent-fleet §In-session worker.

### 10. Instruction re-reads and oversized output — OPEN

AGENTS.md was read by shell 1,386 times (35.7 MB) although Codex loads it natively (`.codex/config.toml:7`); 632 of
those were repeats within one compaction segment. Skill files: 1,380 reads (check-changes 447, steward 349,
agent-fleet 212). Post-compaction windows re-read AGENTS.md ~3× more, with no lost-state reruns. Outputs over 20 kB
were 5,100 of all commands but 213 MB (51 %) of output: whole-file `cat` (AGENTS.md 821×, `js/game.js` 254×),
`rg` without `-m`, and 621 `github.create_blob` calls carrying whole file bodies through the model.
**Proposals:** AGENTS.md header: the file is already in context, re-read one section by line range; a ≤20 kB print
rule in §Critical conventions (write to `artifacts/`, print a count; files reach GitHub by `git push`).

### 11. Failure classes worth a fix — OPEN unless noted

| Class | Threads | Note / proposal |
|---|---|---|
| Credential expiry mid-session (126 auth failures, 107 HTTP 401) | 42 | first at a median ~5 h; nothing classifies a 401 — a shared `isAuthError` in `tools/lib` and "= auth expired — stop" |
| No install after clone; `doctor.mjs:10` imports `yaml` statically, so the doctor crashes without deps | 34 | make the import dynamic; a Codex bootstrap recipe in `docs/AGENT-SURFACE.md` §Bootstrap |
| Tailing a log before it exists | 27 | `wait-for` waits for the file, exits on the verdict line |
| Agent files read as skills (`.claude/skills/ci-red-triage/…`) | 14 | name `.claude/agents/<name>.md` in AGENTS.md routes |
| `props-tris-baseline.json`, `clip-baseline.json` conflicts | 7 | not in `cureableConflicts()` (`deploy.mjs:434-462`) |
| `sync-pr` missing cached PR ref | 6 | `sync-pr.mjs:158` should fetch it |
| Node 24 in Codex vs 22 in CI (646 wrapper calls) | 21 | doctor warns on a major-version mismatch |
| `ratchets.json` / `CHANGELOG.md` conflicts | 27 | STALE — sharded / fragments |
| Concurrent heavy jobs on one box | — | STALE as a concern: 0.50 vs 0.44 non-green, preflight refusals work |

### 12. Bug reports — mostly fixed

No game bug was reported again in a later session; repeats happened within a session. Still OPEN or unverified:
garage camera always the same angle (`js/garage/setup-camera.js`), Photo Studio from the title screen shows no car,
old UI flashing before the profile loads. Fixed since: stuck SAFETY CAR with cautions off
(`js/race/race-control.js:303-310`), rival noise toggle (`js/audio/engine.js:2757-2771`), mobile garage scroll.

## Round 2 — Codex vs Claude, skills, orchestration, prompts, roles

Bryce: "go deeper into these codex transcripts vs Claude and our skills and agent orchestration systems and prompts".
Six more read-only lens subagents. The plan that acts on this is
[2026-10-26-codex-parity](../plans/2026-10-26-codex-parity.md).

### R2-0. Head to head: Codex waits by polling, Claude by waking

Same definitions on both sides. Codex: 37 Bryce-attended parent threads, 458 active hours (gaps ≤ 30 min). Claude:
`list_sessions` metadata for 347 sessions (10-01→17) and 172 (10-20→26), plus 65 transcript pages from 32 sessions
(~14 active hours, tail-heavy — treat the Claude per-hour rates as indicative).

| metric | Codex | Claude 10-01→17 | Claude 10-20→26 |
|---|---|---|---|
| tool calls / active h | 144 | 47 | 33 |
| polls / active h | 42.8 | 6.4 | 4.9 |
| model wakes / h | 1.67 final answers, no self-wake | 12.9 (90 % task-notification) | 9.2 (96 %) |
| wakes with ≤ 1 tool call | — | 48 % | 31 % (median $0.18 a wake) |
| instruction re-reads / h | 5.4 | 0.15 | 0.40 |
| tool output per state change | ~290 kB | ~58 kB | ~26 kB |
| sessions ending failed | — | 20 % (quota) | 1 % |
| merged PRs / wall h (lower bounds) | ≥ 0.27 | ≥ 0.63 | — |

Mechanism: Claude has `run_in_background`, Monitor and `send_later`; Codex has a foreground exec, so it waits by
polling inside a turn and cannot wake itself — hence Bryce's "Check" and "Merge" after final answers. Claude's
remaining waste is the other side of the same coin: a third of its wakes do nothing. Both hosts outlive the gate:
AGENTS.md:57 files `deploy.mjs --gate-only` under "2–15 min" background jobs, but it ran a median 32.5 min on Codex
and 60 min in a sampled Claude session; a Claude tooling-fast run died at its background limit at 64/893 files.
`test-bg.mjs` detaches its run (`:444-457`); `deploy.mjs` and `tooling-fast.mjs` do not. Codex never bootstraps:
`.githooks/pre-commit` guards every host only once `npm install` has run `prepare` (`package.json:75` sets
`core.hooksPath`), and 34 Codex threads never installed — so `check-changes/SKILL.md:47-49` ("the commit hook runs
only in Claude Code") misstates the gap. What Codex did better: one gate verdict per turn with no idle-wake spend,
hand-built gate resume (110 commands), and cheap in-session fan-out without a fresh session's ~100k boot.

### R2-1. Codex lacked the guidance, not the tools

About two-thirds of the round-1 costs share a root cause with a finding in the recent Claude audits
([TRANSCRIPT-MINING-2026-10-16](TRANSCRIPT-MINING-2026-10-16.md), [AGENT-RETRO-2026-10-17](AGENT-RETRO-2026-10-17.md),
[SYSTEM-AUDIT-3](SYSTEM-AUDIT-3-2026-10-26.md), [SYSTEM-AUDIT-4](SYSTEM-AUDIT-4-2026-10-26.md),
[FLEET-B](../archive/notes/FLEET-B-TRANSCRIPT-AUDIT-2026-10-26.md), [AGENT-TOKEN-USE](AGENT-TOKEN-USE-2026-10-20.md)). The Claude-side
fix is usually a repo tool Codex can already call (`ci-watch --failures-only`, `wait-for`, `deploy.mjs --wait`, the
MCP output gateway). What did not reach Codex: AGENTS.md rules 4/13 and `adapters.md:13-22` name Claude Code and
Cursor only; Codex never loads `.claude/rules/fleet-core.md` (Cursor has the generated `.cursor/rules/fleet-core.mdc`)
or `.claude/memory/`; `.codex/hooks.json` guards Bash plus four MCP names, and Codex had no hooks at all until 10-19.
Patterns on **both** hosts, where one repo fix serves all: the slow late-failing gate (findings 1–3); hand-rolled
waiting because the waiters are described per host; raw API polling instead of bounded CLIs; local gates bypassed;
generated-file conflicts; Bryce as the wake and relay channel; read/output volume (Codex and Cursor also load all
197 MCP schemas eagerly, ~58.6k tokens, browserstack 19.7k with 0 calls); unclassified auth expiry.

### R2-2. Codex's own connector bypasses the merge guard — OPEN, security

Codex names connector tools `mcp__codex_apps__github_<tool>` (shape in `tests/unit/session-contracts.test.mjs:42`);
`.codex/hooks.json:15` requires `__` before the tool name, so `mcp__codex_apps__github_merge_pull_request` does not
match (re-checked by hand: `false`), and `github-mcp-guard.sh:78` never reads the connector's `pr_number`. Nothing
guards `mark_pull_request_ready_for_review`, `update_ref` with `force: true` (19 forced calls on one branch, 10-16), or
Git Data API pushes (`create_blob` 621, `create_commit` 82) that skip `.githooks/pre-push`. Agents fell back to those
when `git push` died on "unexpected disconnect while reading sideband packet" or a credential prompt — nothing in the
repo handles either. `tests/unit/cross-tool-guards.test.mjs:147-160` covers only `mcp__github__*` with `pullNumber`.

### R2-3. Orchestration: every thread was its own merge desk — OPEN

26 threads merged 99 PRs; up to 6 merged into the deploy branch inside 2 h, 17 consecutive merges by different threads
under 10 min apart, nothing serialising game merges or waiting for Pages (the churn under round-1 finding 2's
self-killed gates). The fleet bus, agent-msg and merge-gate post-date the archive (0 uses). Today a stand-alone merge
(`ship/SKILL.md:32-34`) still takes no `GAME-SLOT` and posts no `DONE`. Codex **automations** were its real wake: 21
created, 94 fires, median 47 min apart (rule 13 says 50–55) — but rule 13's "four sanctioned wake signals" and the
adapters table never mention them, and `multi-host.md:13` (Codex = fleet-C coordinator) contradicts
`adapters.md:40-50` (Codex children = evidence work only). Claims were honoured (STAND-DOWN / HANDOFF comments) but 21
of 61 claiming threads never released; duplicates came from fixes started before a claim (#2322/#2323, #1809/#1817).
`sync-pr` ran 475 times against 18 `needs-sync` checks.

### R2-4. Prompts: short approval after a concrete plan wins — OPEN (templates)

| prompt shape | n | commit | PR | merge |
|---|---|---|---|---|
| short go-ahead after a numbered agent proposal | 27 | 85 % | 44 % | 30 % |
| pasted structured prompt (≥ 600 chars) | 53 | 51 % | 26 % | 13 % |
| new task Bryce typed | 207 | 30 % | 15 % | 8 % |
| tool-push ("use plugins mcps subagents") | 68 | 24 % | 9 % | 9 % |
| automation firing with no Bryce text | 44 | 11 % | 0 % | 5 % |

Among long prompts, naming tools/plugins went with fewer PRs (15 % vs 42 %), "N subagents" with far fewer commits
(14 % vs 51 %), "deep / adversarial" with more corrections (20 % vs 4 %); 4 of 106 had a stop criterion. "Use many
subagents like 10 to hunt…" went to 5 threads 9 times: 0 commits each. Implementation lanes with separate ownership
and worktrees opened PRs; audit lanes returned reports. Codex automation prompts accreted: 79 % of 160 rewrites grew,
keeping a median 98 % of the old text (one lineage 4.2k → 19.8k chars), with state and restated grants
("LATEST USER AUTHORIZATION… supersedes…") copied in instead of read from the PR body. The repo's own launch template
is 5.1k chars and 15 negations before it is filled (`orchestrator.md:80-128` + `role-pr-owner.md:40-60`), and comms.md
says when to arm a wake but not what it may contain.

### R2-5. Skills: found by path, followed by position — OPEN

The six skills AGENTS.md names by path were read (check-changes 466 reads / 91 threads, steward 370/64, agent-fleet
222/80); domain skills mostly were not: before editing, `js/input/` 0/6 threads read input-controls, `js/ui|css`
11/47 ui-menu-a11y, `js/data/` 4/15, `js/render/` 1/7 (scenery 18/21 for contrast); game-feel, input-controls and
lighting-tuner were never read. 88 of 256 working threads read no skill. Compliance tracks where a rule sits:
gate-before-push at the top of check-changes held 62 %; steward's no-poll rule (line 161 of 184 then, a reference
file now) lost — one thread read steward, killed its own `ci-watch` and fetched runs/jobs every ~30 s to narrate
progress. 81 % of reads are whole-file and re-done on each new "Merge"/"Check". After reading playwright-probe, as
many threads hand-wrote browser scripts (31) as used the shipped tools (30). The routing eval's 352 queries contain
none of Bryce's real phrasings ("Merge", "fix all", "Retry", "Chdck").

### R2-6. Roles: 2 % of Codex children used a repo agent — OPEN

682 children; 16 used a repo agent name. Recurring roles with no definition: UI auditor (104), implementer (89), perf
auditor (24), PR resumer (12, the most tool-hours: 24 gates), diff reviewer (12). `prior-art-scout` and
`physics-contract-auditor`: 0 spawns. 49 read-only-named children edited source (26 commits, 4 pushes) because Codex
children share the parent's checkout and sandbox; harm was small (6 same-file conflicts, 1 revert). Higher effort
bought longer runs and scope creep, not findings: read-only hunters at high effort edited in 59 % of runs vs 12 % at
low, with similar command time. `docs/AGENT-SURFACE.md:37` forbids a Codex persona tree; Codex now loads
`.codex/agents/*.toml` natively and `.codex/config.toml` has no `[agents]` table.

### R2-7. Codex did one thing Claude does not: live-site QA

Codex drove the live github.io game in a real browser (Browser Use 49 starts, TinyFish 25 automation runs) and found
real defects — the WebGPU "Instance dropped in popErrorScope" overlay (since handled in
`js/render/shared/compatibility-recovery.js:15`), a Data Hub launch failure, a Baku Highlights lifecycle bug; 20
issues filed across 5 threads. Claude's `mcp-probe` treats github.io as unreachable and `AGENT-SURFACE.md:188` limits
hosted TinyFish to search/fetch. (Its result polling — 628 `wait_browser_result` calls, a median 7 per run — is the
same waste as finding 5.)

### R2-8. Corrections

A subagent's "test-bg reads a stale registry" claim is wrong (finding 6). The test-bg exit-1 cluster is stacked
waiters, not a registry bug. Spawn prompts are absent from the export (every `collabAgentToolCall` is a `wait`), so
child-brief quality could not be judged.

## Next step

Acting on these is planned in [2026-10-26-codex-parity](../plans/2026-10-26-codex-parity.md): W0 (the guard gap)
first, then the host-independent tool fixes (W1 gate, W2 waiters), then Codex guidance, roles, skills and prompts
(W3–W6, which need Bryce's word for `AGENTS.md` / `.claude/**`).
