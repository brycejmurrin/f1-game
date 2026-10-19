# Apex 26 fleet: coordination system, roles, gaps, taxonomy, title/tag scheme

Study by Fleet B (ORCH-B), 2026-10-19; Bryce approved "Land it as proposed" for the §4 taxonomy and §5 title/tag scheme (ORCH-B session, AskUserQuestion). Implementation: the follow-up roles PR.

Status: taxonomy (§4) and title/tag scheme (§5) landed in `.claude/skills/agent-fleet/` by the roles-implementation PR (stacks on #3074); role 6 has the card `references/role-sync.md`, Merge Desk is dormant-unless-designated. `.claude/agents/merge-desk.md:3` (outside that lane) still carries the old wording.

Read-only study, 2026-10-19 (~17:50Z). Sources: `.claude/skills/agent-fleet/**`, `.claude/rules/fleet-core.md`,
AGENTS.md §Concurrent PRs, `.claude/agents/*.md`, `docs/notes/{MULTI-AGENT-ORCHESTRATION-2026-10-10,AGENT-RETRO-2026-10-17,FLEET-COST-2026-10-19,FLEET-BUS-2026-10-19,SHARED-BRANCH-COORDINATION,AGENT-WORK-TRACKING-2026-10-14}.md`,
headers of `tools/ci/{fleet-bus,who-is-on-it,pr-board}.mjs`, `ci-watch` and `steward` skills, `origin/claude/fleet-bus` (all 58 lines),
`origin/claude/claims-board` (last 60 commits, 80 live claim files), one `list_sessions` page (account B, limit 10).

Rulings folded in: Bryce ~17:47Z (bus 17:45 "No you both can merge so fix that") and **~17:50Z "No I want you both to Merge"**:
**N peer orchestrators each merge their own PRs in parallel at Level 3; the lease no longer gates merging at all** (not standing,
not per-merge). Kept safety: merge-commit only, head-sha pin, two-parent check, `gen:check` on the CURRENT tip right before the
merge, a bus DONE line per merge, `MERGE-HOLD:`, and game pacing (one game merge per green Pages run) **read from the bus**,
shared by every orchestrator. This file treats the lease as retired-for-merging (§3c lists every file to change).

---

## 1. The coordination system (25 bullets)

**Channels**
1. **PR body = the per-PR record.** Template Goal / Plan (`- [ ]`, one `now:`) / Status / Verified / Next step; `ready-gate.mjs` refuses ready while a Plan item is open (AGENTS.md rule 12).
2. **Fleet block** in every worker PR body: `worker:`, `orchestrator:`, `owned:`, `state:`, `blocker:`, `needs-orchestrator:` (SKILL.md:58-65), plus a `fleet-status: <state> | <reason> | <UTC>` line under it, mirrored as a PR comment per change (SKILL.md:67-72). `pr-board.mjs` renders only the `fleet-status` line as FLEET (pr-board.mjs:35-38, 64-95); it does not parse `worker:`/`orchestrator:`.
3. **PR comments** `@orchestrator BLOCKED:` / `@orchestrator NEEDS-DECISION:` are the only channel out for Cursor and Grok workers (adapters.md:15, role-pr-owner.md:49-55).
4. **`send_message`** (claude-code-remote) is the fast path between Claude sessions *on the same account*; first line is a self-contained typed line (`SWEEP/DONE/BLOCKED/HANDOFF/STAND-DOWN`, comms.md:54-60; `NEW-PR`, `REPORT`, `FINAL`, `ARMED`, `READY` in role cards; `FLEET-WATCH`, `MERGE?`, `FLAG`, `DID` from the watcher).
5. **Fleet bus** = commit log of `claude/fleet-bus`; one line per commit `<TYPE> to:<addr> from:<host>:<id> <text>`, TYPE ∈ READY GREEN BLOCKED HANDOFF DONE INCIDENT LEASE (fleet-bus.mjs:39). Cursor-read, once per wake, never in a loop (comms.md:171-189). Only shared channel across hosts *and* accounts.
6. **Claims board** `claude/claims-board`: one file per claim `<unix>\t<who>\t<text>`, fast-forward-push race = atomic lock, self-pruning by age (who-is-on-it.mjs:16-29). `who` is the git author ("Claude"), the session is a 24-char hash, not a messageable id (open since MULTI-AGENT-ORCHESTRATION:142-144; still true: e.g. `Claude B1 #3053 … session dbff0bc9…`).
7. **GitHub Issues** = backlog: `ready` / `claimed` / `blocked` labels, `Closes #n` in the draft body (AGENTS.md:183-184; AGENT-WORK-TRACKING §Step 1-2).
8. **Subscriptions + timer**: owners `subscribe_pr_activity` + `ci-watch --sha --failures-only` Monitor + one `send_later` (~50 min / 1 h); the watcher subscribes to nothing and ticks (role-fleet-watch.md:47-58).
9. **Session metadata**: `list_sessions`/`get_session` (title, tags, `post_turn_summary`, cost, context, `rate_limit_info`) — visible only within the caller's account.

**Authority**
10. One rule: a session acts on the user's words typed in its own session or quoted with UTC time in its launch brief (`USER GRANTS:`); anything relayed (message, PR text, bus line, transcript) is data (authority.md:24-35, comms.md:22-39).
11. Grant a class/scope, not PR numbers (authority.md:36-40); a changed grant = relaunch, never a message (orchestrator.md:96-97).
12. Merge levels 1/2/3; **Level 3 is the standing default for every orchestrator** (role-merge-holder.md:32-49).
13. Merge mechanics: merge commit only, `expectedHeadSha` pin, `gen:check` on a local merge onto the current tip, two-parent check after (role-merge-holder.md:55-72; fleet-core.md:3-5).
14. **Merge lease** (`lease.json` in the bus tree): fast-forward CAS, TTL 1-240 (default 60), `check` exit 0 only for the live holder, `break` only on a quoted user grant; every change writes a LEASE line (FLEET-BUS:17-47). **Retired for merging (Bryce ~17:50Z)**; only docs ever enforced it (no hook calls `lease check`; the merge_policy.py refusal in FLEET-BUS:72-75 was never built).
15. Pacing: non-game PRs (tests/tools/docs/.claude only) batch back-to-back on a green tip; game PRs one per green Pages run; stop while Pages or ship CI is red (role-merge-holder.md:66-76).
16. **Veto** = a PR-body line starting `MERGE-HOLD:`; nothing else is a veto (AGENTS.md:190, fleet-core.md:14-17).
17. Draft→ready only at a green tip + `ready-gate.mjs` exit 0; owners flip their own drafts (role-pr-owner.md:82-87).
18. Workers never merge/arm: brief line `Do not enable auto-merge or merge.` (launch-policy.md:5); `.claude/**` edits need a grant in the acting session (launch-policy.md:89-90).
19. Bryce merges by hand outside the lease (memory `bryce-merges-manually`); those merges count toward pacing.

**Lifecycles**
20. Orchestrator: take over via HANDOFF (+ lease release/acquire) at 200k context; generations ORCH9→10→11→12 in 1 h on the bus (11:57-12:48Z).
21. Worker: claim → branch `cursor/<topic>-<hash>` → draft PR at first commit → verify → fleet block live → ready-gate → hand back; STOP AT 150k (worker.md:6-56).
22. Hunter: rounds on fresh branches, `NEW-PR` hand-off, stop after 2 dry rounds/~$15; PR owner: one PR to merged, `ARMED`/`REPORT`/`READY`/`DONE`, archived on DONE.
23. Fleet watch: one per orchestrator, 60 s red loop + 3-min tick + hourly fresh sweep, routine fixes (sync, one rerun, start owners, archive), never merges (role-fleet-watch.md).
24. Escalation: `state: blocked` + `needs-orchestrator: yes` + PR comment + (Claude) `send_message`; quota park = `blocker: quota until <reset>` + one `send_later`.
25. Incident: numbered `INCIDENT <date> #N` superseding messages, tested on one agent first, state in one `docs/notes/INCIDENT-<date>.md` (comms.md:95-122); bus INCIDENT lines freeze merges (14:35Z, 12:09Z).

---

## 2. Role inventory

Bus evidence = `origin/claude/fleet-bus` (58 lines, 08:03-17:45Z 10-19). Claims evidence = `claude/claims-board`. "Sessions" = one `list_sessions` page (account B).

### Session roles (sibling cloud sessions / other hosts)

| Role | Documented | Spawned by | Owns | Merges? | Lifespan | Still used? (evidence) | Overlaps |
|---|---|---|---|---|---|---|---|
| Orchestrator | orchestrator.md, running.md, adapters.md | Bryce (typed) | batch plan, launches, escalations, merge queue at Level 3 | **y** (own PRs; lease was the gate until 17:50Z) | until 200k → HANDOFF | **Yes**: ORCH9-12, ORCH-B write 50 of 58 bus lines; session `[Orchestrator] Fleet B · backlog waves + Level 3 merges`, tags `fleet:b role:orchestrator` | merge holder, Merge Desk, Pages dispatcher, archiver |
| Merge holder | role-merge-holder.md | n/a (a hat the lease-holding orchestrator wears) | lease, merge mechanics, pacing | y | per lease | Was: ORCH12 LEASE/DONE lines; **retired as a role 17:50Z** (every orchestrator merges its own PRs; the card's mechanics survive) | orchestrator (identical in practice) |
| Merge Desk | ci-watch SKILL.md, agents/merge-desk.md, AGENTS.md:188-189 | Bryce designation only | sweep pr-board, ready, disarm foreign arms, staff lanes | arm only (≤2) | Routine or session | **No** (dormant since 10-18, ci-watch SKILL.md:8-12; no bus line) | orchestrator, fleet watch, sync lane |
| Fleet watch | role-fleet-watch.md | orchestrator | PR/CI/session/cost watch, dashboard, routine fixes | n | 100k → HANDOFF | Yes: FLEET-WATCH 2 lines 12:05, 12:39Z | Merge Desk (sweep), archiver, cost steward |
| Worker (builder / lane) | worker.md, launch-policy.md | orchestrator | one task + OWNED globs, its PR to ready | n | task / 150k | **Yes**: 8 `[Worker] B·W1·L1-8` sessions; claims 17:37-17:41 | PR owner (owns own PR) |
| PR owner | role-pr-owner.md, existing-pr.md, steward ownership.md | orchestrator, fleet watch | one existing PR to merged | n | PR life / 150k | Yes (READY lines 10:09, 12:48 from owners; memory) | worker, sync lane, Merge Desk "steward" lane |
| Hunter | role-hunter.md | orchestrator | lane bug hunt + fix PRs | n | ≤3 rounds / ~$15 | Occasional (claims `cursor--hunt-regressions-20261019`) | worker |
| Reviewer | role-reviewer.md | orchestrator | one PR/diff review, FINAL ≤50 lines | n | 120k | Yes ("REVIEW-SYNTH-2" in FLEET-COST:140) | review farm, "synth" (no card) |
| Review farm / synth | launch-policy.md:16, 66 (Size table "synth"), orchestrator.md:93 | orchestrator | ≤2 reviewers + a synthesiser | n | 150k | Yes (REVIEW-SYNTH-2) | reviewer; **no card for synth** |
| Sync lane (conflict-only) | launch-policy.md:43-48, merge-desk.md:86 "sync" lane | Merge Desk / orchestrator / fleet watch | PRs `needs-sync` rates conflict/stale-red | n | per PR | Yes: `[Sync] stale Claude PR #2920` (tags `lane:sync pr:2920`); claims `sync-pr-cursor-*` | PR owner (syncs own PR), fleet watch (syncs itself) |
| Resolve swarm | launch-policy.md:17, APEX-STEWARD-CARD:42 | orchestrator / desk | red/dirty PRs with no specialist owner | n | capped | Not seen 10-19 | sync lane + fix lane |
| Merge Desk lanes: re-cut, fix, steward, survey-assets | merge-desk.md:84-90 | Merge Desk | listed PR classes | n | per lane | No (desk dormant) | sync lane, PR owner |
| Survey lane (track/UI) | launch-policy.md:19-25, survey-track / survey-ui-matrix skills | orchestrator | findings-first, ≤20-line fix | n | one pass | Occasional | track-surveyor subagent |
| Tip fixer (base red) | steward §3 "one owner per red tip", SHARED-BRANCH-COORDINATION | whoever claims it | the ship red | n | until green | Yes: INCIDENT 12:09Z "Fix #3058 by ORCH10"; 14:35Z ORCH12 | orchestrator, fleet watch, every session that sees the red |
| Codex/Cursor coordinator ("DAD", `codex:coordination-…`) | FLEET-BUS:3-15, adapters.md | Bryce on another host | Cursor agents via API | was y (10-19 incident) | ad hoc | Yes: 2 BLOCKED lines 01:45-01:50 (Cursor API 429) | orchestrator |
| Grok Bot orchestrator | orchestrator.md:4, adapters.md:25 | n/a | "sole coordinator" | y (per doc) | n/a | **No**: zero grok: lines; FLEET-BUS:12-15 "no Grok activity in 48 h" | stale |
| Hourly fresh-session sweep (Routine) | role-fleet-watch.md:51 | fleet watch (`create_trigger`) | session/cost sweep safety net | n | per fire | Yes (trigger `trig_01518…` in bus 12:05Z) | fleet watch |

### In-session subagent types (`.claude/agents/`)

| Agent | Model | Role | Writes? | Notes |
|---|---|---|---|---|
| worker | inherit | one scoped change in its own worktree, SendMessage mid-task | y (own worktree) | not a sibling session; no browser runs |
| track-surveyor | inherit | one circuit pair edit + verify-track | y (worktree) | session analogue = survey lane |
| merge-desk | inherit | Merge Desk procedure | GitHub writes | dormant; duplicates ci-watch skill |
| ci-watcher | haiku | pr-board read, suggestions | n | used by orchestrator/watch |
| ci-red-triage | sonnet | name the failing test/lane, base-red check | n | used by owners, watch, orchestrator |
| verify-agent | haiku | verify-change --fast, `--base` already-red | n | |
| deploy-research / release-auditor | haiku | live site / shipped-bytes evidence | n | release-auditor is the Pages-proof half of a "release conductor" |
| code-hunter / finding-verifier / prior-art-scout | opus / sonnet / haiku | hunt pipeline | n | hunter session's tools |
| bloat-auditor, physics-contract-auditor, agent-surface-reviewer | sonnet | audits | n (scratch report) | |

---

## 3. Gaps and friction

### 3a. Doc lines that assume ONE merger / ONE coordinator (must change for N peer orchestrators; lease-specific lines are also in §3c)

| file:line | text (abridged) | why wrong now |
|---|---|---|
| `.claude/rules/fleet-core.md:7-11` (+ twin `.cursor/rules/fleet-core.mdc:13-17`) | "One merger at a time, on any host: the holder of the merge lease… exit 2 names the holder: do not merge." | Wrong now: N mergers in parallel, no lease. |
| `AGENTS.md:188` | "the merge-lease holder (any host, one at a time; … lease check exits 0 before each merge) merges…"; "only the designated Merge Desk arms auto-merge" | Single holder phrasing; desk clause is dormant. |
| `AGENTS.md:189` | "send Merge Desk `SWEEP <PR#>`…" | Desk dormant; READY should go on the bus to the PR's own orchestrator. |
| `.claude/skills/agent-fleet/SKILL.md:6` | "# Agent fleet: one orchestrator, many workers" | N orchestrators. |
| `SKILL.md:29` | "merge holder … (no live Merge Desk: the orchestrator holds the queue…)" | "the orchestrator" singular; queue is per orchestrator. |
| `SKILL.md:83-89` | "The **orchestrator** (sole coordinator) merges… With no live desk, the orchestrator holds that queue." | "sole coordinator" stale. |
| `references/orchestrator.md:4-5` | "Grok Bot is the orchestrator (sole coordinator, 2026-10-17)." | Doubly stale: no Grok activity, and N peers. |
| `references/adapters.md:25-27` | "Grok Bot is the orchestrator, not a worker: it … holds merges…" | Already flagged by FLEET-BUS:76-77, never fixed. |
| `references/role-merge-holder.md:1-6` | "Role: merge holder (no live merge desk)… the orchestrator that holds the merge lease holds the merge queue." | One queue holder model. |
| `role-merge-holder.md:10-30` | §The merge lease: take / renew / check / release / break | Whole section retired for merging. |
| `role-merge-holder.md:19-20` | "Exit 2 names the live holder: you are not the merge holder. Send it your READY lines on the bus and do not merge." | Inverts the new rule: every orchestrator merges its own READY PRs. |
| `role-merge-holder.md:51-53` | "At Level 3 the merge desk (when designated) or the orchestrator (when no desk is live) merges directly" | singular. |
| `role-merge-holder.md:74-77` | "Pacing (game code): at most one merge per green Pages run" | Correct but pacing must be fleet-wide; no shared marker exists (see gap 2). |
| `references/running.md:10-12` | "With no live Merge Desk you are the merge holder" | Every orchestrator is a merger now; holder is transient. |
| `references/role-fleet-watch.md:12-13` | "Merging stays with the merge holder (role-merge-holder.md)" | Should say "the PR's own orchestrator". |
| `references/comms.md:28-32` | "the merge desk arms when live; the merge desk or orchestrator merges…" | singular. |
| `references/launch-policy.md:45-46` | "`--force-clean-behind` is for the orchestrator or merge desk only" | fine per-orchestrator, but needs "the PR's orchestrator". |
| `references/worker.md:58-62` | "Arming is the merge desk's when live; the merge desk or orchestrator merges…"; "paced by the brief's `PUSH SLOT`" | singular + PUSH SLOT retired 10-16 (launch-policy.md:49). |
| `references/role-pr-owner.md:4-5` | "The orchestrator (or Fleet Desk) starts one per PR" | "Fleet Desk" is defined nowhere. |
| `.claude/skills/ci-watch/SKILL.md:3, 10-12, 26-28` | "orchestrator holds merge pacing (role-merge-holder)"; "the orchestrator (when no desk is live) merges" | singular. |
| `.claude/agents/merge-desk.md` description (line 3) | "merge desk user/orchestrator merges at Level 3 per role-merge-holder" | singular; role dormant. |
| `tools/ci/fleet-bus.mjs` (see §3c) | lease subcommands and header | lease retired for merging. |
| `docs/notes/FLEET-BUS-2026-10-19.md` (see §3c) | lease design as the merge refusal | add a 10-19 17:50Z superseding note. |
| `docs/notes/FLEET-BUS-2026-10-19.md:13` | "AGENTS.md named 'Grok Bot' as the sole merge holder" | history, fine; but adapters.md never caught up. |

### 3b. Duties nobody owns, or owned twice

1. **Shared game pacing has no machine state, and with the lease gone nothing serialises it.** Each orchestrator infers "last game merge" from free-text DONE lines ("Level 3 game after green Pages a268bc34", bus 17:25Z) and from Bryce's unlogged merges (memory `bryce-merges-manually`; bus 16:19Z "#2983 merged outside the lease/bus"). Two peers can each believe the one game slot is free and both merge game PRs within the same minute. Without a lease the cheap fix is a **claim-before-merge line**: a strict DONE grammar `DONE #<PR> <sha> game|non-game <fleet>` plus, for game PRs only, a bus `GAME-SLOT #<PR> <fleet>` line pushed first (the bus write is itself a fast-forward CAS, so two racing GAME-SLOT pushes cannot both land on the same parent; the loser re-reads and waits). Plus a `git log --first-parent` check for game-path merges since the last green Pages (catches Bryce's). Non-game merges need no slot.
2. **Pages / release conductor.** Dispatching pages.yml (memory `orchestrator-dispatches-pages`), freezing merges on a red Pages (INCIDENT 14:35Z), and lifting the freeze are done by whichever orchestrator notices. With two parallel mergers, dual-dispatch (forbidden, memory) and conflicting freeze/unfreeze are possible, and the lease can no longer decide it. Rule needed: the orchestrator that merged the game PR (holder of the current GAME-SLOT) dispatches Pages for it after `actions_list` shows none queued; the INCIDENT author lifts its own freeze with `INCIDENT #N lifted`, and any orchestrator may lift it only after the author is silent past one Pages p90 (73 min).
3. **Cross-account blindness.** `list_sessions`/`get_session`/`send_message`/`archive_session` work only inside one account. ORCH-B cannot see ORCH12's sessions and vice versa. Fleet watch "open fleet PR with no live owner session → start one" (role-fleet-watch.md:79) will mis-read the other fleet's owners as dead and launch twins. Ownership must be read from GitHub (fleet block `orchestrator:` / `worker:`) — but pr-board ignores those keys. The bus is the only cross-account relay; nothing requires mirroring READY/BLOCKED there (only 3 READY + 2 GREEN of 58 bus lines came from workers).
4. **Backlog partition between orchestrators.** "ORCH12 keeps existing queue, ORCH-B new backlog" exists only as a bus HANDOFF (17:25Z). Issues have no `fleet:` label; claims have no fleet/orchestrator field; lane mutexes (launch-policy.md:15) are per orchestrator's own plan, so two fleets can each staff a `js/car/*` or lighting lane.
5. **Sync policy conflict.** ORCH12 bus 16:55Z: "game PRs re-sync only on ORCH12 'SYNC <PR#>'"; role-fleet-watch.md:77 lets the watcher `sync-pr --push` any conflict/stale-red PR; role-pr-owner.md:44 tells owners to sync on CONFLICTING; launch-policy.md:43 wants ONE conflict-only resync lane. Four actors, no card for the lane. `SYNC` is not a bus TYPE.
6. **Archiver duplicated.** Archive rights in role-merge-holder.md:80, running.md:11, role-fleet-watch.md:80, merge-desk.md §Archiving, memory `archive-only-after-bryce-done`. Cross-account sessions cannot be archived by the other orchestrator at all.
7. **Message vocabulary split.** Bus TYPES (fleet-bus.mjs:39) lack NEW-PR, REPORT, FINAL, ARMED, SWEEP, SYNC, STAND-DOWN, MERGE?; those exist only on `send_message`, which Cursor/Codex/Grok and the other account cannot read.
8. **Quota/cost per account.** `rate_limit_info` and cost are per account; `fleet-flags.mjs` (running.md:27) runs per orchestrator. No fleet-wide cost line; fine as a fleet-watch duty, but the watcher card assumes one account.
9. **Base-red (tip) ownership.** "One owner per red tip" (steward §3) relies on `who-is-on-it --claim`; INCIDENT lines name a fixer but nothing ties the claim to the bus. Two orchestrators seeing the same ship red is exactly the 2026-09-18 three-fix incident (SHARED-BRANCH-COORDINATION:6-31).
10. **Claims don't identify the claimant.** `who` = "Claude", session = hash (claims sample); MULTI-AGENT-ORCHESTRATION:142-144 open item still open. An orchestrator cannot message the claimant or tell which fleet it is.
11. **Dead / undefined roles.** Merge Desk is dormant but still the target of SWEEP in AGENTS.md:189 and fills a full skill + agent; "Fleet Desk" (role-pr-owner.md:4) undefined; "synth" (launch-policy.md:66) has a size cap but no card; resolve swarm unused.

---

### 3c. Lease retired for merging: every file that would need updating

No hook or workflow enforces the lease today (grep: no `lease check` in `.claude/hooks/`, `.github/workflows/`, `merge_policy.py`; FLEET-BUS:72-75 proposed one, unbuilt). So retirement is docs + one tool header + tests, no hook change.

| file:line | current | change |
|---|---|---|
| `.claude/rules/fleet-core.md:7-11` | "One merger at a time… holder of the merge lease. Before every merge `fleet-bus.mjs lease check` exits 0; exit 2 names the holder: do not merge." | Replace with: each orchestrator merges its own PRs; before every merge re-read the bus (freeze, GAME-SLOT), gen:check on the current tip, head-sha pin, DONE after. |
| `.cursor/rules/fleet-core.mdc:13-17` | generated twin of the above | regenerate (`gen-cursor-rules`), never hand-edit |
| `AGENTS.md:188` | "the merge-lease holder (any host, one at a time; `node tools/ci/fleet-bus.mjs lease check` exits 0 before each merge) merges or arms…" | "each orchestrator (any host) merges its own fleet's PRs at the level in role-merge-holder.md; game pacing is read from the bus" |
| `.claude/skills/agent-fleet/references/role-merge-holder.md:1-8` | title "merge holder (no live merge desk)", "the orchestrator that holds the merge lease holds the merge queue" | retitle "Merging (every orchestrator)"; drop the holder concept |
| `role-merge-holder.md:10-30` | §The merge lease (Take/Renew/Check/Release/Break, LEASE lines) | delete; keep one historical line pointing at FLEET-BUS note |
| `role-merge-holder.md:45-50` | "A new orchestrator … still takes the lease" | drop "still takes the lease" |
| `role-merge-holder.md:58` | "`fleet-bus.mjs lease check` exits 0 (you hold the lease)." | replace with "bus read: no INCIDENT freeze; game PR → GAME-SLOT taken" |
| `role-merge-holder.md:74-80` | pacing "one merge per green Pages run"; DONE line | keep, make fleet-wide (read peers' DONE game lines + first-parent log); DONE grammar `game|non-game <fleet>` |
| `role-merge-holder.md:84-85` | "Never: … merge without the lease." | replace with "merge another fleet's PR" / "merge without gen:check on the current tip" |
| `.claude/skills/agent-fleet/references/comms.md:179, 188-189` | bus TYPES list; "LEASE lines are written only by `fleet-bus.mjs lease …` (role-merge-holder.md §The merge lease)" | add GAME-SLOT; LEASE line becomes historical |
| `.claude/skills/agent-fleet/references/running.md:10-12` | "With no live Merge Desk you are the merge holder" | "you merge your own fleet's PRs" |
| `.claude/skills/agent-fleet/SKILL.md:28-29, 83-89` | "merge holder … the orchestrator holds the queue"; "(sole coordinator) merges … the orchestrator holds that queue" | "each orchestrator merges its own fleet's PRs" |
| `.claude/skills/agent-fleet/references/role-fleet-watch.md:12-13` | "Merging stays with the merge holder" | "with the PR's own orchestrator" |
| `.claude/skills/ci-watch/SKILL.md:3, 10-12, 26-28, 61-63` | "orchestrator holds merge pacing (role-merge-holder)" | "each orchestrator; pacing from the bus" |
| `.claude/agents/merge-desk.md:3` (description) | "merge desk user/orchestrator merges at Level 3 per role-merge-holder" | same rewording |
| `tools/ci/fleet-bus.mjs:2-4, 22-26, 39` | header "the host-neutral merge lease", usage lines for lease acquire/renew/check/break; TYPES without GAME-SLOT | header: "bus (lease subcommands retained, not a merge gate)"; add GAME-SLOT type (tool change + test) |
| `tools/README.md:564` | "Merge lease (one holder, expiry, refusal) and typed fleet bus" | generated from fleet-bus.mjs `@doc` (`npm run gen`), not hand-edited |
| `tests/unit/fleet-bus.test.mjs` (44 `lease` refs), `tests/groups.json:413`, `tools/ci/tooling-fast.mjs:470`, `docs/TESTING-COVERAGE.md:453` | describe "the cross-host merge lease" | keep the lease tests if the subcommand stays (it is still a valid generic mutex); reword descriptions via `tests/groups.json` + `npm run gen`; add a GAME-SLOT race test |
| `docs/notes/FLEET-BUS-2026-10-19.md:1, 17-47, 72-75` | lease as the merge refusal; proposed merge_policy.py lease hook | append a dated "Superseded 2026-10-19 17:50Z: both orchestrators merge" section; strike proposal 2 |
| `.claude/memory/bryce-merges-manually.md:3, 11` | "outside the merge lease/bus", "while an orchestrator holds the merge lease" | reword to "outside the bus"; via `apex-memory.mjs` |
| bus history (`origin/claude/fleet-bus` `lease.json`) | ORCH12 holds a lease until ~18:19Z | ORCH12 should `lease release` once so `lease` shows free and nobody waits on it |

## 4. Proposed taxonomy (9 session roles + subagents)

Principle: a **fleet** = one orchestrator + its watch + its workers, on one account; fleets are peers that meet only on GitHub
(bus, claims, PR bodies). Merging is a per-merge duty of the PR's own orchestrator, run in parallel with peers, not a role.

| # | Role | Kind | One-line charter | Status |
|---|---|---|---|---|
| 1 | **Orchestrator** | cloud session (Opus), one per fleet, N fleets | Plans its fleet's backlog slice, launches and answers its lanes, merges **its own fleet's** PRs at Level 3 in parallel with peers (no lease); takes the bus GAME-SLOT before a game merge and dispatches Pages for it. Absorbs "merge holder". | keep, **redefine** (peer, not sole) |
| 2 | **Fleet Watch** | cloud session (Sonnet), one per fleet | Eyes and routine hands for its fleet's PRs and sessions (red loop, tick, cost/quota, dashboard, archive its own fleet's finished sessions); never touches another fleet's PR except via a bus FLAG. Absorbs archiver + cost steward. | keep, scope to own fleet |
| 3 | **Worker** | cloud session | One task + OWNED globs to a ready PR (owns its own PR until merged or STOP AT). Variants by brief: builder, **medic** (ship-red fix, claim + INCIDENT link), survey (findings-first). | keep; fold tip-fixer + survey lane in as variants |
| 4 | **Hunter** | cloud session | Find-and-fix rounds in one lane with live evidence; hands PRs off (`NEW-PR`). | keep |
| 5 | **Owner** (PR owner) | cloud session (Sonnet) | Drive one existing PR to merged: sub, Monitor, check-in, fix reds, sync only on conflict. | keep, rename title tag to `owner` |
| 6 | **Sync** | cloud session (Sonnet), one per fleet | Conflict-only resync lane: only PRs `needs-sync` rates conflict/stale-red with no live owner, or on its orchestrator's `SYNC <PR#>` bus line. The only non-owner that syncs (watcher's own sync moves here). | **NEW card** (formalises launch-policy.md:43 + merge-desk sync lane) |
| 7 | **Reviewer** | cloud session | One PR/diff review pass, FINAL ≤ 50 lines; a `synth` brief variant merges ≤ 2 reviewers' FINALs. | keep; fold synth + review farm in |
| 8 | **Coordinator (other host)** | Cursor/Codex/Grok agent | A non-Claude orchestrator: same charter as #1, reached only via bus + PR comments. | keep as a host variant of #1 (retire "Grok Bot sole coordinator") |
| 9 | **Merge Desk** | Routine / session, Bryce-designated only | Optional fleet-wide sweeper; arms MERGE only. | **retire to dormant appendix** (drop SWEEP from AGENTS.md; READY goes on the bus to `orchestrator:<id>`) |

Not new session roles, but **duties with an explicit owner** (each one line in role-merge-holder.md / orchestrator.md):
- **Release conductor** = the GAME-SLOT holder for its merge: Pages dispatch (never dual), merge freeze on Pages/ship red (INCIDENT), lift by `INCIDENT #N lifted` from the author (others after 73 min silence).
- **Pacing ledger** = the bus itself: `GAME-SLOT` + `DONE … game|non-game` lines, read by every orchestrator before a game merge, plus `git log --first-parent` for Bryce's untracked merges.
- **Backlog split** = issue label `fleet:a` / `fleet:b` set by the orchestrator that claims an issue; lane mutexes checked across fleets with `who-is-on-it` (claims carry the fleet tag).

In-session subagents (unchanged): `worker`, `track-surveyor` (writers in worktrees); read-only `ci-watcher`, `ci-red-triage`,
`verify-agent`, `deploy-research`, `release-auditor`, `code-hunter`, `finding-verifier`, `prior-art-scout`, `bloat-auditor`,
`physics-contract-auditor`, `agent-surface-reviewer`. `merge-desk` agent: dormant with role 9.

### Per-merge sequence, no lease (replaces role-merge-holder.md:10-30 and 55-80)
1. `fleet-bus.mjs read` once (INCIDENT freeze, latest GAME-SLOT / DONE game); the PR is yours (`orchestrator:` in its fleet block), green tip, ready-gate 0, no `MERGE-HOLD:`.
2. Game PR only: the last game merge (bus DONE `game`, or a first-parent game-path merge on ship — Bryce's included) has a green Pages run, and no newer GAME-SLOT line is open. Then `send GAME-SLOT --to '*' "#<PR> <fleet>"`; a rejected push = a peer raced you: re-read and wait one tick.
3. Re-fetch the CURRENT tip, local merge + `gen:check` (the peer may have merged seconds ago), `merge_pull_request` merge + `expectedHeadSha`, two-parent check. A 405/409 "base modified" from GitHub = a peer merged first: redo step 3.
4. `send DONE --to '*' "#<PR> <sha> game|non-game <fleet>"` (closes the slot). Game: dispatch Pages if none queued (never dual).
5. Non-game PRs skip step 2 and may batch, each re-checked against the tip the previous merge produced (role-merge-holder.md:66-72 stays).

---

## 5. Title + tag scheme

### Title pattern
```
[<Role>] <Fleet>·<Slot> · <scope> · <Model> — <task, ≤ 60 chars>
```
- `<Role>` ∈ `Orchestrator | Watch | Worker | Hunter | Owner | Sync | Review | Coordinator | Merge Desk` (bracket keeps the existing `[Merge Desk]` / `[Worker]` / `[Sync]` / `[Orchestrator]` prefixes that `list_sessions` filters and merge-desk.md:81 already use).
- `<Fleet>` = one capital letter per orchestrator fleet (`A` = ORCH12's account, `B` = Fleet B). Survives orchestrator rotation (ORCH12→13 stays `A`).
- `<Slot>` = the stable id other lines reference:
  - Orchestrator `O<gen>` (A·O12, B·O1); Watch `FW<n>`; Worker `W<wave>·L<lane>`; Hunter `H<n>·<lane>`; Owner / Sync `#<PR>`; Review `R<n>·#<PR>`; Coordinator `<host>`.
- `<scope>` ∈ `game | tests | tools | docs | track | ui | ci | fleet` (game = touches js/, css/, assets/, index.html, sw.js → paced).
- `<Model>` = `Opus | Sonnet` (launch-policy §Model by task).

Examples:
- `[Orchestrator] A·O12 · fleet · Opus — existing PR queue, Level 3 merges`
- `[Orchestrator] B·O1 · fleet · Opus — backlog waves, Level 3 merges`
- `[Watch] B·FW1 · fleet · Sonnet — PR/CI/session watch + dashboard`
- `[Worker] B·W1·L3 · tests · Sonnet — L25 agent-config budgets, ci.yml lint` (matches today's live titles)
- `[Worker] A·W4·L2 · game · Opus — medic: ship red vm-b2 physics-oracle`
- `[Hunter] B·H2·physics · game · Opus — live-debugger round 1`
- `[Owner] A·#3020 · game · Sonnet — drive #3020 to merged`
- `[Sync] A·#2920 · game · Sonnet — conflict-only resync`
- `[Review] B·R1·#3053 · tests · Sonnet — test-review pass`
- `[Coordinator] C·cursor · fleet · — DAD Cursor agents` (non-Claude; title lives in its PR comments / bus)

### Tags (`create_session` `tags`; visible only within one account)
| key | values | already in use |
|---|---|---|
| `f1-game-fleet` | (flag) | role-fleet-watch.md:28 |
| `fleet:<a|b|…>` | fleet letter | yes (`fleet:b`) |
| `role:<orchestrator|watch|worker|hunter|owner|sync|review|merge-desk>` | role | yes (`role:worker`, `role:orchestrator`, `role:fleet-watch` → rename `watch`) |
| `orchestrator:<session id>` | parent orchestrator | yes |
| `wave:<n>`, `lane:<Lnn|sync|…>` | batch / lane | yes (`wave:1`, `lane:sync`) |
| `scope:<game|tests|tools|docs|track|ui|ci>` | pacing class | yes (`scope:game`, `scope:tests`) |
| `pr:<n>` | owner/sync/review target | yes (`pr:2920`) |
| `variant:<medic|survey|synth>` | brief variant | new |

### Same id everywhere (cross-host / cross-account compatible)
- **Fleet block** (SKILL.md:58-65): keep `worker:` / `orchestrator:` as `<host>:<id>`; add two keys `fleet: <a|b>` and `slot: <B·W1·L3>`. Teach `pr-board.mjs` to print FLEET as `<fleet>/<slot> <state> <age>: <reason>` (today it shows only `fleet-status`), so each orchestrator filters "my PRs" from GitHub without `list_sessions`.
- **fleet-status** line unchanged (pr-board parser stays compatible); reason may lead with the slot.
- **Bus**: `from:` stays `<host>:<id>`; text starts with `<fleet>·<slot>` (e.g. `DONE … "#3020 3a0ebc3a game A·O12"`); address `to:orchestrator:<fleet>` or `to:<host>:<id>`; add TYPES `SYNC`, `NEW-PR`, `FLAG` (tool change) so the other account and non-Claude hosts see them.
- **Claims**: text prefix `[<fleet>·<slot>]` (Fleet B already writes "B1 #3053 …") and `--session <real session id>` so a claim is messageable.
- **Branches**: unchanged `cursor/<topic>-<hash>`; optional slot in the hash part is not needed.
