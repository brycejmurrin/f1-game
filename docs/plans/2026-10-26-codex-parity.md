# Codex parity and cross-host fixes — plan (2026-10-26)

Date: 2026-10-26  
Status: **PLAN** — docs-only; each workstream lands as its own draft PR against `claude/f1-game-project-26h3ng`.  
Evidence: [CODEX-ARCHIVE-MINING-2026-10-26](../notes/CODEX-ARCHIVE-MINING-2026-10-26.md) (round 1 findings 1–12,
round 2 §R2-1…R2-8). Ask: Bryce, 2026-10-26 PT — "go deeper into these codex transcripts vs Claude and our skills
and agent orchestration systems and prompts", then "Yes start planning".

**Grant (Bryce, typed in session_01RrkwnTotSpmGMJQggtig8F, 2026-10-26 ~16:30 PT, AskUserQuestion):** start W0, W1+W2,
W3 and W4–W6 (covers the `.claude/**` and `AGENTS.md` edits they list); W7 "Allow, one run at a time" (sanction
hosted TinyFish live-site QA, one run at a time, read once at completion; browserstack stays).

## Principle

About two-thirds of the Codex costs share a root cause with a Claude finding, and the Claude-side fix is usually a
repo tool Codex can already call. What never reached Codex is the **guidance and the guards**: AGENTS.md rules 4/13
and `agent-fleet/references/adapters.md` describe Claude Code and Cursor only, Codex never loads
`.claude/rules/fleet-core.md` or `.claude/memory/`, and `.codex/hooks.json` guards Bash plus four MCP names that do
not match Codex's own connector. So: fix host-independent tools once (serves all three hosts), then give Codex the
same rules and guards Claude and Cursor already have. Rank by hosts served × cost.

## Workstreams (in landing order)

Legend — **Grant**: needs Bryce's typed word (a `.claude/**`, `AGENTS.md`, hold or authority edit) · **Hosts**: who
benefits · **Verify**: the check that proves it.

### W0 — Codex merge/ready/push guard gap (security) · Grant: yes (`.claude/hooks/`) · Hosts: Codex

The Codex connector's tools reach hooks as `mcp__codex_apps__github_<tool>` (shape pinned in
`tests/unit/session-contracts.test.mjs:42`); `.codex/hooks.json:15` requires `__` before the tool name, so
`mcp__codex_apps__github_merge_pull_request` does not match (re-checked: `false`). `github-mcp-guard.sh:78` reads
`pullNumber|pull_number|number|pr`, not the connector's `pr_number`. Nothing guards
`mark_pull_request_ready_for_review`, forced `update_ref` (19 in the archive), or `create_commit`/`create_blob`
pushes that skip `.githooks/pre-push` (621 blobs).

- [ ] Capture one real Codex PreToolUse payload for a connector call (name format, arg keys) — the matcher must be built from evidence, not inference; read the current Codex hooks docs and cite them
- [ ] Widen the `.codex/hooks.json` matcher to the connector shape; add `mark_pull_request_ready_for_review`, `update_ref`, `create_commit`, `create_blob`, `create_tree`, `push_files`, `create_or_update_file`
- [ ] `github-mcp-guard.sh`: accept `pr_number`; ready → requires a ready-gate receipt; `update_ref force:true` and any write to the deploy branch → deny; Git Data API file pushes → deny with "use `git push`"
- [ ] An edit guard: `apply_patch|Edit|Write` → `protect-files.sh` (verify the matcher string on the installed Codex)
- [ ] `tests/unit/cross-tool-guards.test.mjs`: cases in the real Codex payload shape
- Verify: the new unit cases; `npm run test:tooling-fast`

### W1 — Pre-push gate: faster, earlier, resumable · Grant: no (`tools/ci/`) · Hosts: all

- [ ] Node half skips files tooling-fast already ran on the same tree (211/333 today, ~18 serial min); confirm the npm scripts set no different env first; pin overlap = 0 in `tests/unit/prepush-gate-coverage.test.mjs`
- [ ] Fast prefix in `gateOnly()`: `test:guards` → `tooling-fast --changed` → last-failed, all `--bail`; the full pass skips what the prefix passed
- [ ] Per-stage receipts keyed by `tools/lib/work-tree-id.mjs` + `deploy.mjs --resume` (refuses when the tree moved)
- [ ] `autoJobs()` instead of the pinned `--jobs=2`; port `--wait-load` from sync-pr
- [ ] `deploy.mjs --gate-only --detach` and `tooling-fast.mjs --detach` (copy `test-bg.mjs:444-457`): log + receipt, so the job outlives a dropped task or exec transport and feeds `--resume`
- [ ] `cureableConflicts()` (`deploy.mjs:434-462`): add `props-tris-baseline.json`, `clip-baseline.json`
- Verify: `tests/unit/deploy-tool*.test.mjs`, prepush-gate-coverage, `npm run test:tooling-fast`, one timed `deploy.mjs --gate-only` before/after (record both in `docs/notes/PREPUSH-GATE-LADDER.md`)

### W2 — Waiters, auth and transport · Grant: no (`tools/`) · Hosts: all

- [ ] `test-bg.mjs`: single-waiter lock; "nothing ran during this wait; last verdict …"; name the failing half in `outcomeOf`
- [ ] `wait-for.mjs:26`: the 590 s foreground cap only when `CLAUDECODE=1`
- [ ] `tools/lib` `isAuthError()` used by ci-watch, sync-pr, pr-board, queue-depth → "= auth expired — stop", own exit code
- [ ] `tools/lib` git-push helper: `GIT_TERMINAL_PROMPT=0`, one retry on a sideband/hung-up disconnect
- [ ] `sync-pr.mjs:158` fetches a missing PR ref; `pr-board.mjs:299` says merged vs closed
- [ ] `doctor.mjs:10` imports `yaml` dynamically; doctor warns when node's major differs from CI's (22)
- Verify: unit tests per tool; `npm run test:tooling-fast`

### W3 — Give Codex the rules · Grant: yes (`AGENTS.md`, `.claude/**`) · Hosts: Codex (+ Cursor cells)

- [ ] AGENTS.md rule 13: a Codex clause — one foreground `ci-watch.mjs --sha … --failures-only`; never poll `actions/*` or `check-runs` through the connector (results over ~64 KiB arrive cut); the timer is one automation 50–55 min out, scoped to one PR
- [ ] AGENTS.md rule 4 + loop step 6: a host without background tasks blocks on `deploy.mjs --wait` / `wait-for --background`; one waiter only; move `deploy.mjs --gate-only` out of the "2–15 min" band (median ~33 min measured) and give Claude background gates a long timeout
- [ ] AGENTS.md rule 1 + `docs/AGENT-SURFACE.md` §Bootstrap: a Codex row — `npm ci` first (it sets `core.hooksPath`, arming `.githooks/pre-commit`); or `.codex/hooks/shell-guard.sh` refuses `git commit` while `core.hooksPath` is unset; fix `check-changes/SKILL.md:47-49` ("runs only in Claude Code" is wrong — the gap is the missing install)
- [ ] A Codex final answer names its wait outcome and never claims "monitoring" with nothing armed
- [ ] AGENTS.md header: "already in your context — after a compaction re-read one section by line range"; §Critical conventions: print ≤ 20 kB (full output to `artifacts/`), files reach GitHub only by `git push`
- [ ] Generated Codex mirror of `fleet-core.md` (as `gen-cursor-rules` does for Cursor), or one AGENTS.md line making Codex read it at start
- [ ] Move host-independent rules out of Claude-only memory into fleet-core: an in-session merge request stands until that PR merges (gate, then `wait-for --merged`); a scope question takes "All"/recommended and says so; "monitoring" names the armed wake and an ETA (PT) or says none is armed; an automation/scheduled prompt carries no grant
- [ ] `agent-fleet/references/adapters.md`: a Codex column (spawn, message, status/stop, PR events = none, timer = `automations.*`, CI = foreground `ci-watch`); fix the Cursor cells system-audit-4 §1 found wrong; reconcile `adapters.md:40-50` with `multi-host.md:13` (is a Codex thread a fleet-C coordinator / PR owner?)
- [ ] `multi-host.md`: Codex row — a user turn interrupts every running child (list, then respawn or strike); never an untargeted `wait`; Codex children share the checkout and sandbox (read-only is advice)
- [ ] `ship/SKILL.md:32-34`: a stand-alone merge of a game PR takes `GAME-SLOT` and posts `DONE`
- Verify: `node --test tests/unit/docs-integrity.test.mjs tests/unit/agent-config.test.mjs`; `npm run gen:check`

### W4 — Codex roles · Grant: yes (`.claude/agents/`, `AGENT-SURFACE.md:37` rule) · Hosts: Codex (+ Claude for new roles)

Codex used repo agent names in 16 of 682 spawns; its most-spawned roles (UI auditor 104, implementer 89, perf
auditor 24, PR resumer 12 — the most tool-hours) have no definition.

- [ ] `npm run gen` emits `.codex/agents/<name>.toml` from `.claude/agents/<name>.md` (body → `developer_instructions`; tier → effort); lockstep test in `agent-config.test.mjs`; `[agents] max_concurrent_threads_per_session = 6`; rewrite `AGENT-SURFACE.md:37,45-52` (read the current Codex subagent docs first and cite them)
- [ ] New agents: `ui-auditor`, `perf-auditor` (read-only), `diff-reviewer`; decide whether `pr-resumer` is an agent or stays the sibling-session role `role-pr-owner`
- [ ] `.claude/agents/README.md`: "a parent never blocks on a worker"; "a read-only role gets the low tier — higher effort bought scope creep, not findings"
- Verify: agent-config, docs-integrity, `gen:check`

### W5 — Skills that are found and followed · Grant: yes (`.claude/skills/`, `AGENTS.md`) · Hosts: all

- [ ] AGENTS.md §Agent extensions: one path → skill line (`js/ui|css` ui-menu-a11y, `js/audio` audio-debug, `js/input` input-controls, `js/lighting` lighting-tuner, `js/data` data-hub, `js/net` multiplayer-debug, `js/career` career-mode, `js/garage|car` garage-parts-livery, `js/render` renderer-debug); skill names in `js/circuits/AGENTS.md`
- [ ] steward step 2: no connector/`gh api` polling of runs/jobs/check-runs; per-job progress from the watcher's log, never kill it; `host-watch.md:11` the same
- [ ] An event → section index at the top of steward and check-changes, so a re-entry reads one section, not the file
- [ ] `check-changes/references/sync-pr.md`: the real-conflict recipe (resolve on `sync-pr-<branch>`, then `--resume`)
- [ ] Agent names always written "agent `x`" (`check-changes/SKILL.md:3`, `steward/SKILL.md:34,42,100`)
- [ ] playwright-probe and mcp-probe open with "name the shot/apex-eval flag that cannot do it before writing a scratch script"
- [ ] `tests/data/skill-routing/queries/`: Bryce's real phrasings ("Chdck", "Merge", "merge it when green", "Retry", "Fix all")
- [ ] steward: `--release` claims before the final answer
- Verify: skill-routing eval, agent-config, docs-integrity

### W6 — Prompts and wake messages · Grant: yes (`.claude/**`, memory) · Hosts: all

- [ ] `agent-fleet/references/comms.md`: a wake message ≤ 300 chars — PR #, head sha, "read the PR body Plan/Status, then `ci-watch --once`"; replace, never append; grants never in it
- [ ] `orchestrator.md:102-118` → one pointer to `references/worker.md` §The loop (template is 5.1k chars / 15 negations unfilled)
- [ ] agent-fleet §In-session worker: "use N subagents / plugins" → disjoint OWNED areas, finders with a stop round, a numbered fix list, then workers implement the top items in the same turn; 3–6 concurrent
- [ ] `worker.md:54-56`: DONE WHEN and STOP in the brief
- [ ] handoff skill: a fresh-task prompt shape (≤ 25 lines, no tool lists); always answer in chat when stopping
- [ ] Memory: tool-push asks → state the target and done-when, then proceed; evidence for Bryce goes out as an Artifact link that opens on a phone
- Verify: agent-config, docs-integrity

### W7 — Live-game QA lane · Grant: yes (policy) · Hosts: all

Codex's real-browser runs against the live site found real defects (the WebGPU popErrorScope overlay, a Data Hub
launch failure; 20 issues filed). `mcp-probe` and `AGENT-SURFACE.md:188` do not sanction it on the Claude side.

- [ ] Decide: sanction hosted TinyFish `run_web_automation` (metered) and/or browserstack for exploratory live QA — one run at a time, read once at completion, findings in a fixed row format via `deploy-research` or a new `live-qa` agent
- [ ] Or drop browserstack from `.codex/config.toml` / `.mcp.json` if unused (0 calls; ~19.7k schema tokens loaded eagerly)

### W7b — Re-runnable comparison · Grant: no (`tools/ci/`) · Hosts: all

- [ ] `tools/ci/session-transcript.mjs --waits`: turn origins, no-op wakes, $ per wake, polls — so this Codex-vs-Claude comparison re-runs in one call instead of scratch scripts; Claude's 31 % no-op wake share is the target to drive down

### W8 — Unverified game reports · Grant: no · Hosts: —

- [ ] Garage camera always the same angle (`js/garage/setup-camera.js`), Photo Studio from the title shows no car, old UI flashing before the profile loads — reproduce at 844×390 touch first; fix or close each

## Outside the repo

- [ ] Bryce: set the Drive folder "Codex Archives Private 2026-10-26" back to Restricted (currently anyone-with-link = editor)

## Order and parallelism

W0 first (a guard gap outranks speed). W1 and W2 are non-game `tools/` PRs that can run in parallel worker subagents
on disjoint files (W1 owns `deploy.mjs` + its tests; W2 owns `test-bg`, `wait-for`, `sync-pr`, `pr-board`, `doctor`,
`tools/lib`). W3–W6 are one docs/rules PR each once granted; W3 before W5/W6 because they cite its wording. W7 is a
decision. W8 is independent game work.
