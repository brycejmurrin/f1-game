# Orchestration redesign: GitHub is the orchestrator

Proposal, 2026-10-27. Bryce's ask, typed in this session: "I feel like we need to re design our orchestration system,
read full project and assume everyone is changeable and nothing is hard rules and all was created by parallel agents".
Status: PROPOSAL — nothing here is applied. Evidence: five read-only reviews in
[`docs/notes/orchestration-redesign-2026-10-27/`](../notes/orchestration-redesign-2026-10-27/README.md) (bus history, tooling,
rulebook, measured outcomes, current platform docs), plus the audits they cite.

## 1. The verdict in ten lines

1. The fleet's PRODUCTION side works: 366 of 400 recent PRs merged, CI pass rate 0.90 on every host, 40–95 landings a day.
2. The COORDINATION side is the cost: coordination sessions equal production sessions (100 vs 96 in the last week),
   orchestration is ~40 % of spend, Fleet B paid $3,539 for 169 merges ($21 per merge), and a PR that is finished when
   it opens still waits a median 2–3 h for a human-shaped merge protocol.
3. The orchestrator is a chat session that dies every ~50 min (Fleet B: 41 orchestrators in 9 days, median life 42 min;
   20 rotations on 10-26). About half the rulebook exists to survive that rotation. The rotation itself has no platform
   basis: this session reports a 1,000,000-token window with automatic compaction, and the 200k cap was written when a
   fresh session cost 50k (it now costs 100k).
4. The bus is a broadcast status feed, not a coordination channel: 3,735 lines, 49 % typed HANDOFF of which 6 % are
   hand-offs, 39 % addressed to everyone, 12 % of BLOCKED lines ever get a direct reply, 97 PRs READY'd twice or more,
   32 PRs DONE'd twice. Merge freezes, slots and "who is live" are keyword matches over free text, and the parsers have
   been wrong for days at a time (`who D` never worked; `who A` returned an undeliverable id for 68 h).
5. State lives in 17 stores; "who owns this path" is written in six of them, "who is the live orchestrator" in five.
6. The rulebook is 27k words across 32 files, 14 session roles, ~50 message tokens, ~30 channels, 12 wake cadences and
   186 "never" sentences; an orchestrator reads ~13k tokens before its first act, and the files contradict each other on
   budgets, who merges, who spawns and what HANDOFF means.
7. Bryce is the real coordinator: 767 bus lines quote him; he relays between fleets A, B and D by hand, typed "own the
   unowned drafts" 11 times in 6 days and "clean up sessions" 4 times, and answered 22+ questions the rules already answer.
8. The gates are local receipt files parsed by shell hooks; GitHub's own protection binds non-admins only, and every
   session merges as the admin. 13 PRs merged without a green `CI` in 7 days; two broke the base.
9. Coordination code is 27,933 lines (tools 11k, hooks 3.9k, tests 10.8k, skill 1.9k) for a 290k-line game; seven tools
   have zero callers; the tests pin error strings, not behaviour.
10. The fix is not another layer of rules. It is to delete the orchestrator as a process, make GitHub the only state
    store and the only bus, land PRs by workflow, and run dispatch as a stateless hourly job. Workers barely change.

## 2. Root causes (what the symptoms share)

| root cause | symptoms it produces | evidence |
|---|---|---|
| **A long-lived coordinator implemented as a rotating chat session** | hand-off briefs, seeds, successor paths, `who <letter>`, stale addresses, fan-out wakes, re-asking Bryce at every rotation, ~40 % of spend | bus.md §1, outcomes.md §4, rulebook.md problem 1, FLEET-B-TRANSCRIPT-AUDIT rows 1, 6, 9 |
| **A hand-rolled message bus with free-text semantics** | 15 types, 5 meanings of HANDOFF, keyword freezes/slots, duplicate READY/DONE, parsers that fail silently, 12 % reply rate | bus.md §3–§5, SYSTEM-AUDIT-4 item 5 |
| **Facts stored where no tool is the source of truth** | 17 stores, 6 owners of "path ownership", claims nobody reads, `state:` in PR bodies that drift | tooling.md §1 |
| **Authority modelled as Bryce's typed words** | relayed grants refused, "typed in OrchB at 06:40 PT" on the bus, 18 touchpoints where only Bryce can act | rulebook.md §5, fleet-redesign §1 |
| **Merging done by agents instead of by GitHub** | GAME-SLOT pacing, INCIDENT freezes, lent PRs, phantom-merger saga, receipts, merge_policy.py, 13 merges with no green CI | outcomes.md §2, SYSTEM-AUDIT-4 items 2, 5, 6 |
| **Four vendor fleets each with its own coordinator and channel set** | webhooks, relays, env-secret drift (3 naming schemes, 10 test sessions), `@cursor` wakes, 42 BLOCKED lines about a label a Cursor token cannot set | SYSTEM-AUDIT-4 item 7, FLEET-B-TRANSCRIPT-AUDIT row 3 |
| **Rules written per incident instead of mechanisms** | 186 nevers, 7 of 15 incident rules are rotation artefacts, string-pinning tests freeze the prose | rulebook.md §3, §6 |

## 3. Design principles

1. **GitHub is the only state store and the only bus.** Issues are tasks, labels are state, PRs are work, checks are
   gates, comments are the only inter-agent message. Every host (Claude on two accounts, Cursor, Codex, Grok) can read
   and write all of it through its own token. No branch-as-bus, no claims branch, no lease, no queue branch, no receipts.
2. **No coordinator process.** Coordination is a pure function of GitHub state, run by a stateless hourly job
   (`dispatch`). Nothing has to stay alive, so nothing rotates, hands off, or is "absent".
3. **GitHub lands PRs, agents never merge.** A workflow arms auto-merge once the gate check passes; the branch ruleset
   (binding admins) does the rest. That removes GAME-SLOT, INCIDENT, LEND, merge receipts, `merge_policy.py`, the
   auto-mode "merge an unapproved PR" default block, and the single-identity attribution problem at once.
4. **Two roles.** Worker (one task → one PR → merged) and Dispatcher (the hourly job). A human console session is
   optional and has no duties. In-session subagents (reviewers, hunters, verifiers) stay as they are.
5. **Authority by mechanism, not by typed word.** What a role may do is what its token and the ruleset allow. Bryce's
   decisions are labels and config files, not sentences quoted on a bus.
6. **Rules become hooks, checks or tests, or they go.** A rule that cannot be enforced by a mechanism is a one-line
   convention in the worker page, and the worker page is under 1,500 words.

## 4. The target system

### 4.1 Objects and labels (the whole protocol)

| object | meaning | labels / fields |
|---|---|---|
| Issue | a task | `ready` (backlog, unclaimed), `claimed` (a worker owns it; the claiming comment names the session and host), `blocked`, `needs-decision` (waits for Bryce), `area:*` (unchanged) |
| PR | the task in flight; body = Goal, Plan (live checklist), Verified / Not run | draft vs ready; `run-ci` (fast tier on a draft, unchanged); `land` (worker asks for landing: gate + auto-merge); `hold` (replaces `MERGE-HOLD:`; whoever sets it removes it; Bryce can always remove it); `needs-owner` (no live worker); `needs-decision` |
| Pinned issue "Board" | the dashboard: one comment the dispatcher edits each run (open PRs, state, age, owner, cost caps, quota) | — |
| Pinned issue "Dispatch" | Bryce's control surface | `dispatch:pause` (launch nothing), `dispatch:merge-pause` (arm nothing); caps live in `dispatch.json` (beside it) |

The `fleet` block, `fleet-status:` line, `MERGE-HOLD:` line, fleet letters, slots and session tags are retired. A session
is identified by the comment it posts when it claims an issue or adopts a PR; nothing else needs its id.

### 4.2 Worker (one session per task; any host)

```
claim   : comment "claims #<n> — <host>:<session id>" on the issue, add `claimed` (stand down if an older claim comment exists)
branch  : cursor/<topic>-<hash> from the deploy tip; DRAFT PR at the first commit (template: Goal, Plan, Verified)
work    : AGENTS.md §The loop (unchanged: edit, verify once, tooling-fast, one browser group, gate-only, push)
watch   : subscribe_pr_activity on the PR + ONE send_later 50–55 min out (unchanged); fix reds and conflicts until merged
land    : when ready-gate.mjs exits 0: flip ready and add the `land` label; GitHub does the rest
stop    : at merge, at the PR's close, or at the cost cap in the brief — then leave the Plan current and add `needs-owner`
ask     : a question only Bryce can answer = `needs-decision` label + one comment with the options; keep working on the rest
```

Cross-host is the same contract: a Cursor Automation or a Codex task launched on `ready`/`claimed` follows the same labels;
its PR comments wake nobody by magic, but the dispatcher reads them hourly and the owner's subscription reads them live.
No worker sends a message anywhere else. "Report to the orchestrator" disappears; the PR is the report.

Default model: Sonnet (workers at $2.63 per merged PR touched vs Opus $24.35, confounded by lane difficulty but still the
cheapest experiment with the largest upside); Opus or Fable only when the brief names it.

### 4.3 Landing (Actions, not sessions)

- `land.yml`: on `pull_request` `labeled: land`, `ready_for_review`, and on `check_suite` completed for a labelled PR:
  run `merge-gate.mjs` as a CHECK named `gate` (Plan closed, no `hold`, `gen:check` and ratchets on the merge result
  against the current tip, base not more than N game merges behind), then `gh pr merge --auto --merge
  --match-head-commit <sha>` with an app or fine-grained token (a `GITHUB_TOKEN`-armed merge would not start `pages.yml`).
- Ruleset on the deploy branch (GitHub UI, Bryce): require `CI` and `gate`, merge commits only, no direct pushes,
  **bind administrators**. This is the one change that makes "13 merges without green CI" impossible rather than forbidden.
- Game pacing: `pages.yml` gets `concurrency: { group: pages, cancel-in-progress: false }` (one running + one pending,
  the newest pending replaces the older), which is the "one train running, one queued, never dual-dispatch" rule as a
  workflow key. "One game merge per green Pages" becomes the `gate` row "base ≤ N game merges behind" (N = 2 to start;
  the audit found 13.3 % red trains when a merge landed after the PR's green vs 4.3 % when none did).
- Merge queue (GitHub's own serialized CI on the merge result) would replace that row and most of `sync-pr`. It is
  documented for organization-owned repos; `brycejmurrin/f1-game` is user-owned. Decision 3 below.

### 4.4 Dispatcher (a scheduled task, not a session role)

One cloud scheduled task, hourly, `create_new_session_on_fire`, Sonnet, depth 0 (so the lineage limit never binds).
Its whole prompt: `node dispatch.mjs --apply` (new, under `tools/ci`) and post the plan it printed as the Board comment. The script is
a pure function of GitHub state and `dispatch.json` (beside it) (caps: max live workers per host, max launches per run,
max $ per worker, pause flags):

1. `ready` issues with no `claimed` → launch one worker each, up to the cap, newest-updated first; skip when the
   account's `rate_limit_info` is not `allowed` (read from its own `get_session`, no receipt file).
2. Open PRs with no push and no comment for 2 h and no `hold` → add `needs-owner`; launch ONE takeover worker per PR
   with `CONTINUE PR #<n>` (the Plan is the hand-off; nothing else is).
3. Deploy red (`pages.yml` latest run failed on the tip) → label the Board issue `deploy:red` and launch one fixer
   unless one is claimed; everything else continues (the gate's "base behind" row already protects the train).
4. Sessions whose PR merged or closed more than 60 min ago → archive (`fleet-archive.mjs` logic, sessions without a
   claim comment are never touched).
5. Rewrite the Board comment: open PRs (state, age, owner, last activity), launches this run, quota, caps.

Both Claude accounts run the same task against the same GitHub state; the claim comment is the lock (older comment wins;
a dispatcher that loses the race archives its launch). Cursor's coordinator becomes an Automation on the same labels or
is retired. The orchestrator, seed, fleet watch, fleet board crons, relay sessions, inbox routines, webhooks and the
four env secrets go.

### 4.5 The human console (optional)

One long-lived Claude session per account where Bryce types. It runs `dispatch.mjs --plan` on demand, launches when
asked, answers "what is going on", and lifts `hold`/`needs-decision` labels when Bryce decides. It has no duties, no
timers, no bus, and never rotates: compaction handles length, and if it dies the hourly task keeps the fleet moving.
This is what "orchestrator" becomes: a console, not a process. Projects (claude.ai) could be that console later, but
today Project threads do not run repo hooks or skills (platform.md §1), so workers stay cloud sessions.

### 4.6 What is deleted

| area | goes | stays |
|---|---|---|
| tools/ci | fleet-bus, fleet-bus-mirror, agent-msg, fleet-board, fleet-board-snapshot, fleet-tick, fleet-flags, fleet-brief, fleet-queue, fleet-owner, who-is-on-it, launch-lane, launch-gate, handback, post-merge, incident-lift, merge-done, merge-attribution, session-ledger, agent-history, claude-usage (analytics move to `tools/analysis/` if wanted) | merge-gate (as the `gate` check), ready-gate (local pre-flip check, no receipt), ci-watch, needs-sync, sync-pr, wait-for, pr-board, pr-body, session-status, fleet-archive (renamed `archive-sessions`), **new** `dispatch.mjs` |
| branches | `claude/fleet-bus`, `claude/claims-board`, `claude/claims/*`, `fleet-claims/*`, orchestrator state branches | — |
| hooks | merge_policy.py, github-mcp-guard's receipt rows, launch-gate.py, context-cap.py's prose caps, bash-guard's receipt/HELD-path/foreign-push rows | protect-files, bash-guard's force-push / deploy-push / kill / cancel refusals, post-edit, memory-sync, session-start |
| rulebook | skill `agent-fleet` (20 files), `fleet-core.md`, AGENTS.md §Concurrent PRs, §Git branch & deploy's claim clause, rule 13's bus items, roles seed/watch/sync/owner/hunter/reviewer/merge-holder/relay, memory entries about orchestrators | AGENTS.md §The loop, rules 1–12, `steward` trimmed to "a red PR is work now", **new** `WORKERS.md` in `docs/` (≤ 1,500 words: contract, labels, cost cap) |
| tests | the 38 protocol test files that pin strings | behaviour tests for dispatch.mjs (fixtures of GitHub state → plan), land.yml's gate script, the ruleset (a probe that a direct push is refused) |
| GitHub | `fleet.yml` (958 of 1,000 weekly runs were claim dispatches), merge-attribution.yml, the Fleet board datasets that have failed since 10-19 | ci.yml, pages.yml (+ concurrency), **new** land.yml, ci-cancel-on-close.yml |

Net: ~28k lines of coordination code, hooks and tests → under 5k; 14 roles → 2; ~50 message tokens → 8 labels;
17 stores → 1 (GitHub) plus the worker's own PR.

## 5. Why this is possible now (platform facts, read 2026-10-27; URLs in platform.md)

- Context window 1,000,000 tokens with harness-managed compaction: no reason to rotate at 200k.
- Scheduled tasks: hourly floor, `create_new_session_on_fire`, 100 runs/h/account; GitHub-event triggers on PR/issue
  label changes exist, so `needs-decision` or `land` can also fire a task instead of waiting for the hour.
- Auto-mode classifier blocks "merging a PR no human has approved" by default and ignores `autoMode` in repo settings:
  so do not merge from sessions at all; a label plus a workflow sidesteps it cleanly.
- Auto-merge can arm: the deploy branch has a ruleset since 2026-10-26 (HARNESS-SETTINGS); Actions `concurrency` is
  one-running-one-pending pacing for free; a user-owned repo may not get a merge queue (verify in the UI).
- Cursor agents can be triggered by PR label/comment Automations and steered mid-run; Codex is reachable only through
  GitHub. Both fit "labels are the protocol"; neither fits a webhook/env-secret mesh.
- Projects threads do not run repo hooks, skills or `.mcp.json` (contradicts the 10-19 plan §4A): a console, not a worker host.

## 6. Migration (each step measurable; stop at any step and the system is still better)

| step | change | stop/start | measure (baseline → target) |
|---|---|---|---|
| 0. Today, no code | Stop launching orchestrators and seeds; disable the FLEET BUS WATCH and board crons and the inbox/relay routines; the console session(s) run `pr-board.mjs` by hand. Workers unchanged. | stops ~40 % of spend | orchestrator sessions/day 20 → 0; $/merge $21 → < $14 |
| 1. PR "land" | Ruleset binding admins (Bryce, UI); `land.yml` with `gate` as a check and app-token auto-merge; `pages.yml` concurrency group; labels `land`/`hold`/`needs-owner`/`needs-decision` in `.github/labels.json`; worker contract: flip ready + `land`; delete the "Do not enable auto-merge" line and the merge receipts/hooks. | agents stop merging | merges without green CI 13/week → 0; ready→merge median 127 min → < 60; red trains from stale base 13 % → < 5 % |
| 2. PR "dispatch" | `dispatch.mjs` + its JSON config + the hourly scheduled task; PR template without the fleet block; issue claim by comment+label; bus made read-only. | stops hand relaying | unowned PRs > 2 h: 0; Bryce interactions/day ~15 → ≤ 3; questions the rules already answer → 0 |
| 3. PR "delete" | Everything in §4.6; the new `WORKERS.md` in `docs/`; AGENTS.md fleet sections replaced by one labels table; behaviour tests; memory entries retired. | stops reading 13k tokens at boot | coordination lines 28k → < 5k; boot set 13k tokens → < 3k; base context 100k → < 60k (also trim MCP instructions and deferred tool lists) |
| 4. Optional | Transfer the repo to a free organization for a merge queue (replaces the "base behind" row and most syncs); Cursor Automation on `ready`; GitHub-event task on `needs-decision` that pings Bryce's phone. | — | sync merges 63 % of merge commits → < 20 % |

Steps 1–3 are three PRs; the `.claude/**` and `.github/**` edits in them need Bryce's typed yes in the acting session
(claude-config.md), which is why this document is a proposal and not a diff.

## 7. Decisions only Bryce can make

1. **Ruleset binding administrators** on the deploy branch with `CI` + `gate` required and merge commits only (step 1).
   Without it every other gate stays advisory.
2. **A token for `land.yml`** (the Claude GitHub App installation token or a fine-grained PAT as a repo secret), so the
   auto-merge push starts `pages.yml`.
3. **Organization transfer** (free) for a merge queue, or stay user-owned and keep the "base ≤ N behind" row.
4. **Console sessions: one per account, or none** (dispatcher only; Bryce steers by labels from the phone).
5. **Sonnet as the default worker model**, Opus/Fable by brief.
6. **Fleets C and D**: retire the separate coordinators (DAD, the Codex coordinator) in favour of the shared labels, or
   keep them as label followers; either way the webhook, relay sessions and the four env secrets go.
7. **Cost cap per worker** (suggested $10 soft, archived at $15 with `needs-owner`) and launch caps per host.

## 8. Risks and how the design absorbs them

- **Two dispatchers race on one issue.** The claim comment is ordered by GitHub; the loser archives its launch within
  the same run. Worst case: one wasted boot per hour, far below today's fan-out wakes.
- **A worker ignores its cost cap.** The cap is advisory in the brief; the dispatcher's archive rule (merged/closed +
  60 min, or over the hard cap with the Plan current) is the mechanism. Today 83 % of sessions ended above their cap.
- **The gate check goes stale while the tip moves.** The check re-runs on `check_suite` completion of the base; the
  "base ≤ N behind" row refuses until a sync. A merge queue removes the row entirely.
- **Auto-merge via a workflow token.** Known caveat: `GITHUB_TOKEN`-caused pushes start no workflows; decision 2 fixes it.
- **Subscriptions drop events.** Unchanged: the worker's single 50–55 min `send_later` stays as the safety net, and the
  hourly dispatcher is the floor nobody can forget to arm.
- **Lost history.** The bus branch is archived (not deleted) for a month; the five evidence reports keep the numbers.
- **A worker on another host cannot set labels** (the Cursor token case). The dispatcher sets `run-ci` on every new draft
  and `land` on a ready PR whose Plan is closed and whose last comment says "ready", so hosts without label rights still land.

## 9. What to keep from the current design (it is not all wrong)

- The worker loop in AGENTS.md §The loop and the gate ladder (`guards ⊂ tooling-fast ⊂ gate-only`).
- `merge-gate.mjs`'s checks (hold, Plan closed, `gen:check` and ratchets on the merge result, base distance): they move
  from a local receipt to a CI check and lose nothing.
- The PR body as the only hand-off (Goal, Plan with one **now:**, Verified / Not run); drop Status pastes and the fleet block.
- One subscription + one `send_later` per PR; the 1 h cache window as the cadence.
- Read-only reviewer subagents, `Workflow` scripts for fan-out audits, worktrees for parallel work inside one session.
- Phone-first verification (844×390, touch) and "never widen a tolerance to get green".
