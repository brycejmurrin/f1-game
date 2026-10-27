# Orchestration redesign: GitHub is the orchestrator

Proposal, 2026-10-27. Bryce's ask, typed in this session: "I feel like we need to re design our orchestration system,
read full project and assume everyone is changeable and nothing is hard rules and all was created by parallel agents",
then "Go deeper, read agent transcripts, look at codex transcripts". Status: PROPOSAL — nothing here is applied.
Evidence: eight read-only reviews in [`docs/notes/orchestration-redesign-2026-10-27/`](../notes/orchestration-redesign-2026-10-27/README.md)
(bus history, tooling, rulebook, measured outcomes, current platform docs, Claude session transcripts, Cursor agent
transcripts, Codex transcripts), plus the audits they cite.

## 1. The verdict in twelve lines

1. The fleet's PRODUCTION side works: 366 of 400 recent PRs merged, CI pass rate 0.90 on every host, 40–95 landings a day.
2. The COORDINATION side is the cost: coordination sessions equal production sessions (100 vs 96 in the last week),
   orchestration is ~40 % of spend, Fleet B paid $3,539 for 169 merges ($21 per merge), and a PR that is finished when
   it opens still waits a median 2–3 h (Cursor: 10 h) for a human-shaped merge protocol.
3. The orchestrator is a chat session that dies every ~50 min (Fleet B: 41 orchestrators in 9 days, median life 42 min;
   20 rotations on 10-26). In the transcripts 39 % of orchestrator turns are no-op wakes, 0 % are merges, and a rotation
   costs $3–5 plus 4–5 min with no orchestrator while the successor restores what its predecessor archived. The rotation
   has no platform basis: the window is 1,000,000 tokens with automatic compaction, and the 200k cap was written when a
   fresh session cost 50k (a fleet session now sits at 130–230k before its first act).
4. The bus is a broadcast status feed, not a coordination channel: 3,735 lines, 49 % typed HANDOFF of which 6 % are
   hand-offs, 39 % addressed to everyone, 12 % of BLOCKED lines ever get a direct reply, 97 PRs READY'd twice or more.
   For Cursor and Codex lanes it was write-only: nothing on it ever woke them.
5. State lives in 17 stores; "who owns this path" is written in six of them, "who is the live orchestrator" in five.
6. The rulebook is 27k words across 32 files, 14 session roles, ~50 message tokens, ~30 channels, 12 wake cadences and
   186 "never" sentences; an orchestrator reads ~13k tokens before its first act; the files contradict each other on
   budgets, who merges, who spawns and what HANDOFF means. Codex re-read AGENTS.md 1,427 times in 409 threads.
7. Bryce is the real coordinator. In the Claude transcripts only 4 of his 21 typed prompts were input a correct system
   needs (priorities); the rest were launch grants, status checks, cleanup and relay wiring. 90 % of what he typed to the
   Cursor coordinator was inter-fleet traffic control, none about the game. In Codex, 258 of 739 messages were him acting
   as merge desk ("Merge pr asap", "Override", "Screw limits") because Codex never merges or advances on its own.
8. The two Claude accounts cannot message each other; the relay built to bridge them never delivered a real message
   (401/404) and cost three sessions and five of Bryce's prompts. Fleets A and B coordinate through Bryce.
9. The gates are local receipt files parsed by shell hooks; GitHub's own protection binds non-admins only, and every
   session merges as the admin. 13 PRs merged without a green `CI` in 7 days; two broke the base. Codex runs none of the
   hooks and committed 621 blobs through the GitHub API, past the commit hook.
10. Verification is where lane time goes: 72 % of Codex tool time (19 % of those commands failed; 501 ran over 15 min),
    Claude train workers spent 7 of 10 turns on CI echoes, Cursor lanes spent 69 % of their runs on standby wakes.
11. Coordination code is 27,933 lines (tools 11k, hooks 3.9k, tests 10.8k, skill 1.9k) for a 290k-line game; seven tools
    have zero callers; the tests pin error strings, not behaviour.
12. The fix is not another layer of rules. Delete the orchestrator as a process, make GitHub the only state store and the
    only bus, land PRs by workflow, run dispatch as a stateless hourly job, and give each vendor the one channel that
    actually reaches it. Workers barely change.

## 2. Root causes (what the symptoms share)

| root cause | symptoms it produces | evidence |
|---|---|---|
| **A long-lived coordinator implemented as a rotating chat session** | hand-off briefs (up to 11k chars), seeds, successor paths, `who <letter>`, stale addresses, fan-out wakes, re-asking Bryce at every rotation, ~40 % of spend, a rotation triggered by an ambiguous sentence ("Spawn a new session to be orchestrator and coordinate with other fleets") | bus.md §1, outcomes.md §4, claude-sessions.md §1–2, rulebook.md problem 1 |
| **A hand-rolled message bus with free-text semantics** | 15 types, 5 meanings of HANDOFF, keyword freezes/slots, duplicate READY/DONE, parsers that fail silently, 12 % reply rate, 6 of 31 `send_message` calls to dead sessions | bus.md §3–§5, claude-sessions.md §5, SYSTEM-AUDIT-4 item 5 |
| **Facts stored where no tool is the source of truth** | 17 stores, 6 owners of "path ownership", claims nobody reads, `state:` in PR bodies that drift | tooling.md §1 |
| **Authority modelled as Bryce's typed words** | relayed grants refused, "typed in OrchB at 06:40 PT" on the bus, 18 touchpoints where only Bryce can act, "Launch it" before every seed launch | rulebook.md §5, claude-sessions.md §3, fleet-redesign §1 |
| **Merging done by agents instead of by GitHub** | GAME-SLOT pacing, INCIDENT freezes, lent PRs, phantom-merger saga, receipts, merge_policy.py, 13 merges with no green CI, Cursor READY→merge median 10 h, 59 Cursor PRs folded into one train and lost | outcomes.md §2, cursor-agents.md §4, SYSTEM-AUDIT-4 items 2, 5, 6 |
| **Four vendor fleets, each with a coordinator and a channel set the vendor cannot use** | webhooks, relays, env-secret drift, `@cursor` wakes, a Cursor token that cannot label (42 BLOCKED lines about `run-ci`), a Cursor brief that contradicts the repo in 10 places, a Codex lane nothing can wake, 37 of 86 Cursor lanes with no PR | cursor-agents.md §2, §6, codex.md §2, §5 |
| **Verification run locally, in the foreground, by every lane** | 72 % of Codex tool time, 184 exit-124 timeouts, log-tail polling (×28, ×57, ×68 per thread), two `tooling-fast` runs at once in one Cursor VM | codex.md §1, cursor-agents.md §1 |
| **Rules written per incident instead of mechanisms** | 186 nevers, 7 of 15 incident rules are rotation artefacts, string-pinning tests freeze the prose | rulebook.md §3, §6 |

## 3. Design principles

1. **GitHub is the only state store and the only bus.** Issues are tasks, labels are state, PRs are work, checks are
   gates, comments are the only inter-agent message. Every host (Claude on two accounts, Cursor, Codex) can read and
   write all of it through its own token, and it is the one place every vendor already polls. No branch-as-bus, no
   claims branch, no lease, no queue branch, no receipts, no relay.
2. **No coordinator process.** Coordination is a pure function of GitHub state, run by a stateless hourly job
   (`dispatch`). Nothing has to stay alive, so nothing rotates, hands off, or is "absent".
3. **GitHub lands PRs; agents never merge.** A workflow arms auto-merge once the gate check passes; the branch ruleset
   (binding admins) does the rest. That removes GAME-SLOT, INCIDENT, LEND, merge receipts, `merge_policy.py`, the
   auto-mode "merge an unapproved PR" default block, Bryce as merge desk, and the single-identity attribution problem.
4. **Two roles.** Worker (one task → one PR → `land`) and Dispatcher (the hourly job). A human console session is
   optional and has no duties. In-session subagents (reviewers, hunters, verifiers) stay as they are.
5. **A lane ends; it does not wait.** A worker ends at `land` (or at its cost cap). Reds and conflicts after that are a
   fresh launch with `CONTINUE PR`, not a warm session on a timer. Idle wakes were 39 % of orchestrator turns, 38 % of
   Claude worker turns and 69 % of Cursor runs; a cold boot is cheaper than a week of them.
6. **Verification is CI's job.** A lane runs the diff-aware check and one spec locally; the full tiers run on the PR
   (`ci.yml`, `browser-group.yml`) and the `gate` check runs on the merge result. No lane runs `deploy.mjs --gate-only`
   in the foreground.
7. **Authority by mechanism, not by typed word.** What a role may do is what its token and the ruleset allow. Bryce's
   decisions are labels and config, not sentences quoted on a bus.
8. **Each vendor gets the one channel that reaches it.** Claude: its own PR subscription. Cursor: an API follow-up
   turn. Codex: nothing (pull-only, human-driven); state it can poll lives on the PR. No channel is built for a vendor
   that cannot read it.
9. **Rules become hooks, checks or tests, or they go.** A rule that cannot be enforced by a mechanism is a one-line
   convention in the worker page, and the worker page is under 1,500 words.

## 4. The target system

### 4.1 Objects and labels (the whole protocol)

| object | meaning | labels / fields |
|---|---|---|
| Issue | a task | `ready` (backlog, unclaimed), `claimed` (a worker owns it; the claiming comment names the session and host), `blocked`, `needs-decision` (waits for Bryce), `priority` (Bryce's one steering word), `area:*` (unchanged) |
| PR | the task in flight; body = Goal, Plan (live checklist), Verified / Not run, Hand-off (branch, head, verified, not run, next step) | draft vs ready; `run-ci` (fast tier on a draft, unchanged); `land` (worker asks for landing: gate + auto-merge); `hold` (replaces `MERGE-HOLD:`; whoever sets it removes it; Bryce can always remove it); `needs-owner` (no live worker); `needs-decision`; `lane:claude` / `lane:cursor` / `lane:codex` |
| Pinned issue "Board" | the dashboard: one comment the dispatcher edits each run (open PRs, state, age, owner, launches, quota per host, caps) | — |
| Pinned issue "Dispatch" | Bryce's control surface | `dispatch:pause` (launch nothing), `dispatch:merge-pause` (arm nothing); caps live in the dispatcher's JSON config |

The `fleet` block, `fleet-status:` line, `MERGE-HOLD:` line, fleet letters, slots and session tags are retired. A session
is identified by the comment it posts when it claims an issue or adopts a PR; nothing else needs its id.

### 4.2 Worker (one session per task; Claude by default)

```
claim   : comment "claims #<n> — <host>:<session id>" on the issue, add `claimed` (stand down if an older claim comment exists)
branch  : cursor/<topic>-<hash> from the deploy tip; DRAFT PR at the first commit (template: Goal, Plan, Verified, Hand-off)
work    : AGENTS.md §The loop, local part only: edit, `tooling-fast --changed`, ONE spec; push; `run-ci` on the draft
watch   : subscribe_pr_activity on the PR while CI runs on its head; no timers; a red on its own head is work now
land    : when ready-gate passes: flip ready, add `land`, refresh the Hand-off block; the session ENDS here
stop    : also at the cost cap in the brief ($10 soft) — leave the Plan and Hand-off current, add `needs-owner`
ask     : a question only Bryce can answer = `needs-decision` + one comment with the options; keep working on the rest
```

What is gone from today's worker: the bus, the claims board, the fleet block, the `fleet-status:` comment, the 50–55 min
timer, "fix until merged" after `land`, the local full gate, `AskUserQuestion`, and reporting to an orchestrator. The PR
is the report. Default model Sonnet (workers at $2.63 per merged PR touched vs Opus $24.35, confounded by lane
difficulty but the cheapest experiment with the largest upside); Opus or Fable only when the brief names it.

### 4.3 Landing (Actions, not sessions)

- `land.yml`: on `pull_request` `labeled: land`, `ready_for_review`, and on `check_suite` completed for a labelled PR:
  run `merge-gate.mjs` as a CHECK named `gate` (Plan closed, no `hold`, `gen:check` and ratchets on the merge result
  against the current tip, base not more than N game merges behind), then `gh pr merge --auto --merge
  --match-head-commit <sha>` with an app or fine-grained token (a `GITHUB_TOKEN`-armed merge would not start `pages.yml`).
- Ruleset on the deploy branch (GitHub UI, Bryce): require `CI` and `gate`, merge commits only, no direct pushes,
  **bind administrators**. This is the one change that makes "13 merges without green CI" and "621 API commits past the
  hook" impossible rather than forbidden.
- Game pacing: `pages.yml` gets `concurrency: { group: pages, cancel-in-progress: false }` (one running + one pending,
  the newest pending replaces the older), which is the "one train running, one queued, never dual-dispatch" rule as a
  workflow key. "One game merge per green Pages" becomes the `gate` row "base ≤ N game merges behind" (N = 2 to start;
  red trains were 13.3 % when a merge landed after the PR's green vs 4.3 % when none did).
- Merge queue (GitHub's own serialized CI on the merge result) would replace that row and most of `sync-pr`. It is
  documented for organization-owned repos; `brycejmurrin/f1-game` is user-owned. Decision 3 below.

### 4.4 Dispatcher (a scheduled task, not a session role)

One cloud scheduled task, hourly, `create_new_session_on_fire`, Sonnet, depth 0 (so the lineage limit never binds).
Its whole prompt: run `dispatch.mjs --apply` (new, under `tools/ci`) and post the plan it printed as the Board comment.
The script is a pure function of GitHub state and its JSON config (caps: max live workers per host, max launches per
run, max $ per worker, pause flags):

1. `ready` issues with no `claimed` → launch one worker each (`priority` first), up to the cap; skip when the account's
   `rate_limit_info` is not `allowed` (read from its own `get_session`, no receipt file) and say so on the Board.
2. Open PRs with no push and no comment for 2 h (6 h for `lane:codex`) and no `hold` → add `needs-owner`; launch ONE
   takeover worker per PR with `CONTINUE PR #<n>` (the Hand-off block is the hand-off; nothing else is).
3. Deploy red (`pages.yml` latest run failed on the tip) → label the Board issue `deploy:red` and launch one fixer
   unless one is claimed; everything else continues (the gate's "base behind" row already protects the train).
4. Sessions whose PR merged or closed more than 60 min ago → archive (today's `fleet-archive.mjs` logic; sessions without
   a claim comment are never touched; never mid-turn).
5. Rewrite the Board comment: open PRs (state, age, owner, last activity), launches this run, quota per host, caps.

Both Claude accounts can run the same task against the same GitHub state; the claim comment is the lock (older comment
wins; a dispatcher that loses the race archives its launch). The orchestrator, seed, fleet watch, fleet board crons,
relay sessions, inbox routines, webhooks and the four env secrets go.

### 4.5 Vendors (what each one actually needs)

| vendor | what reached it (measured) | what it cannot do | its contract under this design |
|---|---|---|---|
| Claude cloud session | its own PR subscription; `send_later`; a typed prompt | message another account | the full worker contract (§4.2); the dispatcher launches it through `create_session` |
| Cursor cloud agent | an API follow-up turn (59 of 59 delivered, a STOP in minutes); GitHub subscription wakes | label, comment on others' PRs, read the bus, run the repo hooks' intent, resist self-arming timers | launched by the dispatcher through the Cursor API (`CURSOR_API_KEY` exists) for self-contained issues only (`lane:cursor`); the dispatcher sets `run-ci` and `land` on its behalf from the Hand-off block; one run, ends at ready; a red is a follow-up turn from the dispatcher; no coordinator of its own, no bus, no `MERGE-HOLD`, a 10-line brief that points at `WORKERS.md` |
| Codex cloud thread | nothing: it polls GitHub (6,862 fetches) and wakes on Bryce or its own automation | receive a message, run hooks, resist local full gates | Bryce's personal tool, outside the fleet: `lane:codex` on its PRs, the Hand-off block at first push, the same `land` label; the dispatcher re-owns a `lane:codex` draft silent for 6 h without asking; AGENTS.md stays under Codex's 32 KiB cap and names no Claude-only tool |

The DAD coordinator and the Codex coordinator are retired: both existed to compensate for channels their vendor cannot
use, and both ended up routing through Bryce. Cross-fleet "lends" disappear with them: a PR has one owner and GitHub
merges it.

### 4.6 The human console and Bryce's interface

One long-lived Claude session per account where Bryce types. It runs `dispatch.mjs --plan` on demand, launches when
asked, answers "what is going on", and removes `hold`/`needs-decision` labels when Bryce decides. It has no duties, no
timers, no bus, and never rotates: compaction handles length, and if it dies the hourly task keeps the fleet moving.
Projects (claude.ai) could be that console later, but today Project threads do not run repo hooks or skills
(platform.md §1), so workers stay cloud sessions.

Bryce's interface is the Board plus three verbs: `priority` (a label on an issue or PR), `dispatch:pause` / resume on
the Dispatch issue, and a decision on a `needs-decision` thread. Nothing asks him to approve a launch, pick sessions to
archive, add a label for another host, lift a hold he did not set, wire a relay, or relay a message between fleets. A
typed sentence in a console is never read as a rotation or a grant; the labels are.

### 4.7 What is deleted

| area | goes | stays |
|---|---|---|
| tools/ci | fleet-bus, fleet-bus-mirror, agent-msg, fleet-board, fleet-board-snapshot, fleet-tick, fleet-flags, fleet-brief, fleet-queue, fleet-owner, who-is-on-it, launch-lane, launch-gate, handback, post-merge, incident-lift, merge-done, merge-attribution, session-ledger, agent-history, claude-usage (analytics move to `tools/analysis/` if wanted) | merge-gate (as the `gate` check), ready-gate (local pre-flip check, no receipt), ci-watch, needs-sync, sync-pr, wait-for, pr-board, pr-body, session-status, fleet-archive (renamed `archive-sessions`), cursor-agents (the Cursor launcher), **new** `dispatch.mjs` |
| branches | `claude/fleet-bus` (archived for a month, then deleted), `claude/claims-board`, `claude/claims/*`, `fleet-claims/*`, orchestrator state branches | — |
| hooks | merge_policy.py, github-mcp-guard's receipt rows, launch-gate.py, context-cap.py's prose caps, bash-guard's receipt/HELD-path/foreign-push rows | protect-files, bash-guard's force-push / deploy-push / kill / cancel refusals, post-edit, memory-sync, session-start |
| rulebook | skill `agent-fleet` (20 files), `fleet-core.md`, AGENTS.md §Concurrent PRs, §Git branch & deploy's claim clause, rule 13's bus and timer items, roles seed/watch/sync/owner/hunter/reviewer/merge-holder/relay, memory entries about orchestrators | AGENTS.md §The loop, rules 1–12, `steward` trimmed to "a red PR is work now", **new** `WORKERS.md` in `docs/` (≤ 1,500 words: contract, labels, cost cap, per-vendor notes) |
| tests | the 38 protocol test files that pin strings | behaviour tests for `dispatch.mjs` (fixtures of GitHub state → plan), `land.yml`'s gate script, the ruleset (a probe that a direct push is refused) |
| GitHub | `fleet.yml` (958 of 1,000 weekly runs were claim dispatches), merge-attribution.yml, the Fleet board datasets that have failed since 10-19, the FLEET BUS WATCH and inbox scheduled tasks | ci.yml, pages.yml (+ concurrency), **new** land.yml, ci-cancel-on-close.yml |

Net: ~28k lines of coordination code, hooks and tests → under 5k; 14 roles → 2; ~50 message tokens → 10 labels;
17 stores → 1 (GitHub) plus the worker's own PR; boot set 130–230k → a bare session (63k) plus a 2k card.

## 5. Why this is possible now (platform facts, read 2026-10-27; URLs in platform.md)

- Context window 1,000,000 tokens with harness-managed compaction: no reason to rotate at 200k.
- Scheduled tasks: hourly floor, `create_new_session_on_fire`, 100 runs/h/account; GitHub-event triggers on PR/issue
  label changes exist, so `needs-decision` or `land` can also fire a task instead of waiting for the hour.
- Auto-mode classifier blocks "merging a PR no human has approved" by default and ignores `autoMode` in repo settings:
  so do not merge from sessions at all; a label plus a workflow sidesteps it cleanly.
- Auto-merge can arm: the deploy branch has a ruleset since 2026-10-26 (HARNESS-SETTINGS); Actions `concurrency` is
  one-running-one-pending pacing for free; a user-owned repo may not get a merge queue (verify in the UI).
- Cursor agents accept API follow-up turns (measured: 59/59 delivered) and PR label/comment Automations; Codex is
  reachable only through GitHub and its own automations. Both fit "labels are the protocol"; neither fits a bus.
- Projects threads do not run repo hooks, skills or `.mcp.json` (contradicts the 10-19 plan §4A): a console, not a worker host.

## 6. Migration (each step measurable; stop at any step and the system is still better)

| step | change | stop/start | measure (baseline → target) |
|---|---|---|---|
| 0. Today, no code | Stop launching orchestrators, seeds and relays; disable the FLEET BUS WATCH, board and inbox scheduled tasks; retire DAD and the Codex coordinator; the console session(s) run `pr-board.mjs` by hand. Workers unchanged. | stops ~40 % of spend and the relay wiring | orchestrator sessions/day 20 → 0; $/merge $21 → < $14; Bryce prompts that are traffic control → 0 |
| 1. PR "land" | Ruleset binding admins (Bryce, UI); `land.yml` with `gate` as a check and app-token auto-merge; `pages.yml` concurrency group; labels `land`/`hold`/`needs-owner`/`needs-decision`/`priority`/`lane:*` in `.github/labels.json`; worker contract: flip ready + `land`, then end; delete the "Do not enable auto-merge" line and the merge receipts/hooks. | agents stop merging and stop idling on timers | merges without green CI 13/week → 0; ready→merge median 127 min (Cursor 596) → < 60; red trains from a stale base 13 % → < 5 %; idle wakes 39 % / 38 % / 69 % → < 5 % |
| 2. PR "dispatch" | `dispatch.mjs` + its JSON config + the hourly scheduled task; Cursor launches through the same script; PR template with the Hand-off block and without the fleet block; issue claim by comment+label; bus made read-only. | stops hand relaying and "own the unowned drafts" | unowned PRs > 2 h: 0; Bryce interactions/day ~15 → ≤ 3; questions the rules already answer → 0; Cursor lanes with no PR 37/86 → < 10 % |
| 3. PR "delete" | Everything in §4.7; the new `WORKERS.md` in `docs/`; AGENTS.md fleet sections replaced by one labels table (and kept under 32 KiB for Codex); behaviour tests; memory entries retired. | stops reading 13k tokens at boot | coordination lines 28k → < 5k; boot set 13k tokens → < 3k; base context 100k → < 60k (also trim MCP instructions and deferred tool lists) |
| 4. Optional | Transfer the repo to a free organization for a merge queue (replaces the "base behind" row and most syncs); a GitHub-event scheduled task on `needs-decision` that pings Bryce's phone; `deploy.mjs --gate-only` refuses to run in a Codex or Cursor container without `--remote`. | — | sync merges 63 % of merge commits → < 20 %; lane time in local verification 72 % → < 20 % |

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
6. **Vendors**: retire DAD and the Codex coordinator; keep Cursor for self-contained issues launched by the dispatcher
   (or drop it: 103 agent-hours → 49 PRs on 10-26, cost unreadable); treat Codex as Bryce's own tool with `lane:codex`.
   Either way the webhook, relay sessions and the four env secrets go.
7. **Cost cap per worker** (suggested $10 soft, archived at $15 with `needs-owner`) and launch caps per host.
8. **Upload Codex export parts 032–061** if the fleet-era Codex threads should be read in full (the Drive folder holds
   parts 001–031 = 2026-10-01 → 10-16; the fleet era was reconstructed from index files and the bus).

### Decided 2026-10-27 (Bryce: "Make best decisions for me")

1. Ruleset: yes — `CI` + `gate` required, merge commits only, no bypass list (admins bound). Applied by Bryce after
   this PR merges, so the PR that adds `land.yml` is not blocked by its own `gate`.
2. Token: a fine-grained PAT as `LAND_TOKEN` (Contents and Pull requests: read and write; this repository only). It
   only arms and disarms auto-merge; the `gate` check run is posted by the job's own `GITHUB_TOKEN` (`checks: write`),
   since only GitHub Apps can create check runs.
3. Stay user-owned: a transfer changes the Pages URL Bryce plays on; the base-distance row covers the risk.
4. At most one console session per account (Bryce's own); every other session is a dispatcher launch.
5. Sonnet is the default worker model (`tools/ci/dispatch.json` `model`); a brief names Opus/Fable when needed.
6. DAD and the Codex coordinator retired; Cursor kept for self-contained issues, `maxLiveWorkers.cursor` 1 and
   `hosts.cursor.enabled` false until a dispatcher week reads its cost; Codex is Bryce's tool (`lane:codex`).
7. $10 soft cap in every brief (`workerCostCapUsd`); the $15 hard-cap archive is not implemented yet (follow-up).
8. Parts 032–061 are not needed: the design is decided; they would only add history.

## 8. Risks and how the design absorbs them

- **Two dispatchers race on one issue.** The claim comment is ordered by GitHub; the loser archives its launch within
  the same run. Worst case: one wasted boot per hour, far below today's fan-out wakes.
- **A worker ignores its cost cap.** The cap is advisory in the brief; the dispatcher's archive rule (merged/closed +
  60 min, or over the hard cap with the Hand-off current) is the mechanism. Today 83 % of sessions ended above their cap.
- **A red after `land`.** The lane is gone; the dispatcher's `needs-owner` rule launches `CONTINUE PR` from the Hand-off
  block. A cold boot (~63k) costs less than the idle wakes it replaces (an orchestrator at 700k paid $0.30 per no-op).
- **The gate check goes stale while the tip moves.** The check re-runs on `check_suite` completion of the base; the
  "base ≤ N behind" row refuses until a sync. A merge queue removes the row entirely.
- **Auto-merge via a workflow token.** Known caveat: `GITHUB_TOKEN`-caused pushes start no workflows; decision 2 fixes it.
- **Subscriptions drop events.** The worker's subscription only has to survive one CI run on its own head; the hourly
  dispatcher is the floor nobody can forget to arm, and a `needs-owner` relaunch is the recovery.
- **Quota cliffs.** The dispatcher reads `rate_limit_info` before launching and writes the host's quota state on the
  Board; a lane that cannot continue ends with `needs-owner`, so the silence that lost Fleet B for 68 h and seven Codex
  drafts for two days has a label.
- **Lost history.** The bus branch is archived (not deleted) for a month; the eight evidence reports keep the numbers.
- **A Cursor or Codex lane cannot set labels.** The dispatcher sets `run-ci` on every new draft and `land` on a ready
  PR whose Plan is closed and whose Hand-off says ready, so hosts without label rights still land.

## 9. What to keep from the current design (it is not all wrong)

- The worker loop in AGENTS.md §The loop and the gate ladder (`guards ⊂ tooling-fast ⊂ gate-only`), with the full
  rungs moved to CI for lanes.
- `merge-gate.mjs`'s checks (hold, Plan closed, `gen:check` and ratchets on the merge result, base distance): they move
  from a local receipt to a CI check and lose nothing.
- The PR body as the only hand-off (Goal, Plan with one **now:**, Verified / Not run, Hand-off); drop Status pastes
  and the fleet block.
- One subscription per PR while CI runs; the 1 h cache window as the only cadence that matters.
- Read-only reviewer subagents, `Workflow` scripts for fan-out audits, worktrees for parallel work inside one session.
- The hooks that fired correctly in the transcripts (8 blocks, all right; 0 classifier denials): force-push, deploy
  push, PID kill, run cancel, protected files, commit-hook guards.
- Phone-first verification (844×390, touch) and "never widen a tolerance to get green".
