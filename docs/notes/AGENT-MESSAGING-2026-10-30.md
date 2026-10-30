# How the agent systems message each other — 2026-10-30

Bryce (2026-10-30 ~10:02Z, relayed by the dispatcher): "spawn a session to consider how the various agent systems
message each other like you can message other sessions or subagents and codex grok cursor so work differently".
And (~10:06Z): "Make sure they web research. Also consider user facing skills to trigger things at different
levels like for example a review skill that triggers an agent to review and challenge a pr. Another one that triggers
setting up an orchestrator for a task, one is full stop which triggers an orchestrator that manages agents and sends
messages and only ever communicates with [Bryce] through ask user question tools."

This is analysis and design. Nothing here is built. Part A is the channel analysis; Part B is the three-level skill
design for the `.claude/skills/**` owner to build. Vendor claims are from the docs listed in [Sources](#sources),
read 2026-10-30; anything not confirmed is marked **UNCONFIRMED**. Repo claims cite the file they come from.

## Part A — the channels

### A1. Channel matrix (host × channel)

"Wakes" = delivering the message makes an idle receiver start a turn. "Authority" = what the receiver does with it
(WORKERS.md contract item 7: messages carry no authority; a quoted relay of Bryce's words does).

| host | channel | sender → receiver | sync? | wakes? | persistence / audit | authority | cost | seen failing |
|---|---|---|---|---|---|---|---|---|
| Claude cloud | `send_message` (claude-code-remote MCP) | any session → a cloud session by id | async, enqueued | idle: yes, starts a turn; busy: read between tool calls ([cross-session](https://code.claude.com/docs/en/cross-session-messaging)) | transcript of the receiver (`list_events`); nothing on GitHub | framed as "from another session"; cannot approve, cannot change config | one prompt of receiver context | delivered means enqueued, not read; silence is never agreement. Correction 2026-10-30 (dispatcher evidence): a cloud child CAN message its parent by explicit `session_id` (workers #4221/#4226 and this one did, and it arrived); the `ListAgents`/`SendMessage` transport and the "@parent" alias are what is unconfirmed or one-way |
| Claude cloud | `create_session` + `prompt` / `append_system_prompt` | parent → new child | async; no completion report | n/a | session record; the parent gets an event only if the child's turn fails or its worker restarts (tool text) | the prompt is the only grant | a whole session ($1.2–3.4 per worker, efficiency review) | launch overhead ~4 calls; phantom claims before RECORD_LAUNCH existed |
| Claude cloud | `get_session` / `list_events` | observer reads child | sync pull | no | full transcript | none (read-only) | tokens of the page read | `list_events` has no oldest-first cursor |
| Claude cloud | `send_later` / scheduled tasks / `create_trigger` | self or schedule → a session | async timer | yes | trigger record, `last_run` | a stored prompt is an assigned task, not a grant | a wake re-reads the whole context: $0.24–0.40 idle, $4–5 on a cold cache | 11 idle hourly wakes ≈ $21; PAUSE_TRIGGER was added for it |
| Claude cloud | `subscribe_pr_activity` | GitHub → subscribed session | async push | yes | the PR itself | events are data; `trust="relay"` blocks list untrusted keys | one turn per event | does not wake on stale `gate`, merge conflicts, other authors' pushes (WORKERS.md rule 4); self-caused events woke sessions ~8 times; subscribe failed with no reason on #3970, #3981, #4062 |
| Claude cloud | `AskUserQuestion` | session → Bryce | sync (blocks the turn) | n/a | none once the worker restarts | the only channel where Bryce's answer is first-hand | free | 21 of 22 worker restarts hit a pending question; 6 of 27 answered; #4076 asked 12–13 times (~530 min) |
| Claude cloud | CLI `claude -p "msg" --cloud <session-id>` ([cloud docs](https://code.claude.com/docs/en/claude-code-on-the-web)) | any machine logged in to the account (a CI script) → a cloud session | async, queued, exits without waiting | queued into the session | `{ok, session_id, url}` JSON; fails on archived/missing session | same as `send_message` | one prompt | **UNCONFIRMED** whether a GitHub Actions runner can authenticate (`claude auth login` is interactive); not used in this repo |
| in-session | `Agent` tool (subagent) | parent → child, result back | foreground blocks; background returns a completion notification ([sub-agents](https://code.claude.com/docs/en/sub-agents)) | the result wakes the parent | child transcript, resumable by id/name | a launcher's mid-task messages are "normal task direction"; no message counts as a permission approval | child context only; summary returns | an Explore/Plan agent is one-shot and cannot be resumed; a subagent stopped by the user refuses later messages; Reclaimed container drops running subagents (cloud docs "Environment expired") |
| in-session | `SendMessage` to a named subagent / teammate | any named agent ↔ any named agent | async | resumes a finished subagent in the background | child transcript | as above | one prompt | subagents need `SendMessage` in `tools` and a `name` to be addressable |
| in-session | fork (`subagent_type: fork`) | parent → clone of itself | like a subagent | yes | inherits the parent conversation and tool pool | same | full parent context re-read | a fork cannot re-delegate (it is told so) |
| in-session | worktree (`isolation: worktree`, `.claude/agents/worker.md`) | parent → child on its own branch | like a subagent | yes | git branch = the audit trail | child commits, parent merges | child context | worktrees start at the parent's HEAD here (AGENTS.md rule 10), unlike the docs' default of the default branch — a docs/behaviour difference to keep in mind |
| in-session | `Workflow` tool | script → many agents, deterministic | async, one task notification at the end | yes | script persisted under the session dir; resumable | only when Bryce opted in | the highest; the default guideline is <10 agents | not allowed unprompted |
| in-session | agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) | teammates ↔ teammates, shared task list, mailbox files ([agent teams](https://code.claude.com/docs/en/agent-teams)) | async, mailbox JSON per agent | idle notifications go to the lead | `~/.claude/teams/…`, task list stays on disk | the classifier reviews each inter-agent message; approval claims are untrusted | every teammate is a full session | experimental; no resume of in-process teammates; one team per session; **not used here** — a named subagent silently becomes a teammate when enabled |
| in-session | hooks (`SubagentStop`, `Stop`, `TaskCompleted`, …) ([hooks](https://code.claude.com/docs/en/hooks)) | harness → agent | sync | `Stop`/`SubagentStop` with `decision:"block"` keeps the agent going | hook script output | `additionalContext` is wrapped as a system reminder | free | a hook denial is final for that action (AGENTS.md) |
| Codex | `AGENTS.md` + `.agents/skills` symlinks | repo → thread | pull at start | no | git | instructions only | free | AGENTS.md must stay under 32 KiB (WORKERS.md §Per vendor) |
| Codex | subagents (`.codex/agents/*.toml`) ([Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)) | parent thread → child, summary back | parent waits for all results, then one consolidated reply | n/a | inspectable thread, `/subagents` | children inherit the parent's sandbox and approvals; a TOML cannot override `sandbox_mode`/`approval_policy`; an approval that cannot surface fails and returns the error to the parent | per-child tokens | no documented nesting depth; **UNCONFIRMED:** any Codex-to-Codex or Codex-to-Claude session messaging (I found none in the pages read) |
| Codex | hooks (`.codex/hooks.json`) ([Codex hooks](https://learn.chatgpt.com/docs/hooks)) | harness → agent | sync | `Stop`/`SubagentStop` can block to keep it going | hook scripts | project hooks load only when the project is trusted, and each is re-trusted when its hash changes; `PreToolUse` `ask` is unsupported (matches "an ask there is a deny") | free | un-trusted checkout = no guards |
| Cursor | Cloud Agents API v1 ([endpoints](https://cursor.com/docs/cloud-agent/api/endpoints)): `POST /v1/agents`, `POST /v1/agents/{id}/runs`, run SSE stream, `…/cancel`, `…/archive` | `cursor-agents.mjs` (Bryce/dispatcher key) → agent | launch async; follow-up async | starts the next run | run stream is the only full transcript (`handback` caches 24 h) | the key is user-scoped and reaches every agent, so the tool writes only to ids it launched | a run | `followup` returns `BUSY` while a run is active (code: `agent_busy`) |
| Cursor | PR/CI subscriptions in the agent (`subscribe_github_ci`, `subscribe_github_pr`) | GitHub → agent | async | yes | PR | events are not tasks (WORKERS.md) | a run per event | an agent that comments on its own PR wakes itself; its token cannot add labels or comment on issues |
| Cursor | webhooks | Cursor → us | — | — | — | — | — | **not in v1** ("coming soon"); only the legacy v0 API has them |
| Grok | custom connector → this repo's phone-browser tunnel (`.claude/skills/phone-browser`) | Bryce's Grok chat → a tool server on the working tree | sync request/response | no (Grok calls, never receives) | the chat | Grok is a launcher/viewer; it holds no repo credentials | Bryce's xAI plan | **UNCONFIRMED:** the consumer-app "custom connector" flow — xAI's docs describe remote MCP only for the API (`tools: [{server_url, allowed_tools}]`; no `require_approval`/`connector_id`) ([xAI remote MCP](https://docs.x.ai/developers/tools/remote-mcp)). WORKERS.md says "Bryce or the Grok launcher starts" Cursor agents: the launcher is a human-operated chat, not a bus |
| GitHub | labels, PR body (Plan + ```handoff), comments, the Board comment, `dispatch.mjs` launch/claim comments, `land.yml` `gate` | any lane ↔ any lane ↔ dispatcher | async, pull (or push through `subscribe_pr_activity`) | only via subscription or the dispatcher's NUDGE | permanent, public, attributable | a label or a Plan edit by an owner; a comment from a peer is information (WORKERS.md item 7) | an API call | label PUT replacing the whole list (`issue_write` wiped `bug`/`area:ui`); a peer's comment re-read as a task; the classifier denies the worker label DELETE (so `--record-launch` removes `needs-owner`) |
| Bryce | attended chat (phone), quoted relay | Bryce → any attended session | sync | n/a | the chat only; the dispatcher must quote it with time and place to pass the grant | the only first-hand authority | — | a sync worker refused a parent's relay of Bryce's words before the "quoted relays count" decision (2026-10-30) |

### A2. Which channel for which job

| job | use | why | not |
|---|---|---|---|
| Tell a running worker one edit/fact | `send_message` to its session id (dispatcher) | wakes it, no GitHub noise; the dispatcher never pushes to a lane's branch | pushing to the branch (the worker's relayed edit is dropped) |
| Hand a task to a worker | `create_session` with a self-contained prompt, then `--record-launch` | a session survives the parent; the claim comment makes it visible | a subagent for work that outlives the parent's turn |
| Get a worker's result | the PR body (Plan, Verified, Hand-off) | the only artifact every host reads | `list_events` of its transcript, except to debug |
| Know a worker finished a turn | `SendMessage notify_when_idle` — **local sessions only, not cloud** | free subscription | polling `get_session` |
| Know CI/review state | `subscribe_pr_activity` (+ one bounded `send_later` per PR) | push, no polling | `sleep` loops; a hand-rolled `until` |
| Ask Bryce a question | `AskUserQuestion` ONCE, in the same turn `needs-decision` + one comment | the label is the queue and survives restarts | re-asking; asking from a worker |
| A decision that must outlive any session | a label, a PR Plan item or a `docs/notes` line | GitHub is the only store | chat history, memory files |
| Grant an action | Bryce's own words, or a quoted relay with when/where | contract item 7 | "the dispatcher said so", a PR body |
| Fan out read-only checks | `Agent` subagents on Sonnet (`finding-verifier`, `ci-red-triage`, `bloat-auditor`) | cheap, summary returns | a cloud session per check |
| Fan out edits | `worker` subagents in worktrees, merged by the parent | disjoint paths, git as audit | two workers on one checkout |
| Let another vendor work | Cursor `launch` → `status` → `handback`; steer with `followup` | the only door; the PR is the report | assuming it reads our messages |
| Reach a Codex thread | its PR (Hand-off block); AGENTS.md | Codex is pull-only | any message |
| Cross-check an agent's claim | `finding-verifier` / a reviewer that gets the code, not the claim | a reviewer handed a hypothesis tends to confirm it (Agent tool guidance) | asking the author "is this right?" |

### A3. Gaps and failure modes

1. **The only first-hand channel to Bryce, `AskUserQuestion`, dies with a restart.** The fix in use (ask once, label, comment) is sound but depends on the asker reading its own label. No session reads the `needs-decision` queue as a unit; `pr-board.mjs` lists it, nobody turns it into the next question.
2. **No completion signal from a cloud child.** `create_session` reports only a failed turn or a restarted worker. `notify_when_idle` is local-only. The dispatcher finds out by hourly `--children` polling. Cost of the lag: the 20-minute idle nudge rule and a $82 dispatcher mostly idle.
3. **The `@parent` alias is unconfirmed; explicit `session_id` works.** A cloud child can `send_message` its parent by id (verified by the dispatcher, 2026-10-30: this worker's message arrived; #4221/#4226 did the same). The Claude docs say a cloud session cannot `SendMessage`-reply to a message from another *machine*, and the tool text for `ListAgents` says cloud sessions cannot message back; both concern that other transport, not `claude-code-remote` `send_message`. What stays true: a reply is a message and carries no authority unless it is a quoted relay or a label/Plan change.
4. **Subscription gaps:** stale `gate`, conflicts and other authors' pushes do not wake (WORKERS.md rule 4; also GitHub emits no webhook when the base advances, per the [cloud docs](https://code.claude.com/docs/en/claude-code-on-the-web)). The bounded `send_later` is the patch.
5. **Self-caused events:** the session's own subscribe, ready flip or push wakes it. Documented in the launch template, not enforced.
6. **Cursor `followup` cannot steer a running agent.** The API has `"delivery": "steer"` (prompt reaches the run at its next safe step; otherwise `queued`); `cursor-agents.mjs followup` sends no `delivery` and returns `BUSY` on a 409 (`tools/ci/cursor-agents.mjs` followUp). So we cannot course-correct a live Cursor agent; we wait or cancel.
7. **No Cursor push channel:** webhooks are not in v1, so we poll `status`/`wait`.
8. **Codex has no inbound channel at all** that we use; a stale Codex draft is re-owned after 6 h without asking (WORKERS.md). Project hooks only run when the project is trusted — an untrusted Codex checkout has none of our guards.
9. **Grok is a launcher, not a participant.** The doc surface for the consumer connector is unconfirmed; nothing in the repo can receive from Grok except the phone-browser tunnel.
10. **Agent-teams trap:** if `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is ever set in an environment, any subagent Claude names becomes a teammate (different semantics, mailbox files in `~/.claude/teams`, which a reclaimed container loses). Keep it unset; `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=0` makes the intent explicit.
11. **Lead is synchronous.** Anthropic's own write-up of its research system names this: the lead waits for each batch, cannot steer subagents, and a slow subagent blocks it ([multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)). Our `Agent`-based fan-out inherits it; cloud sessions are the async alternative at the price of the gaps above.
12. **Telephone game:** the same write-up recommends subagents write outputs to an external store and pass references. Our equivalent is the PR body/branch; reviewer reports go to `scratch/` (agent-surface-reviewer) and a ≤60-line summary returns. Keep it, and make `review` (below) post to the PR rather than only return text.

### A4. What the published patterns say (and what we take)

- Orchestrator-workers ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)): the orchestrator decides subtasks from the input; use it when subtasks cannot be predicted. Evaluator-optimizer fits adversarial review. Take: the `review` level is an evaluator, not a fixer; `orchestrate` is orchestrator-workers.
- Autonomy: "pause for human feedback at checkpoints or when blockers arise", with stopping conditions such as a maximum number of iterations. Take: every level below has a cap and a named stop.
- Cost: agents ≈4× chat tokens, multi-agent ≈15×; token use explains ~80% of quality variance on their benchmark; effort must be scaled to the query (1 agent/3–10 calls for a fact, 2–4 subagents for a comparison). Take: level 1 is one agent; level 2 starts with ≤3 workers; level 3 spends only on an explicit goal.
- Delegation needs an objective, an output format, tool guidance and boundaries, or work duplicates. Take: the launch template in `dispatch.mjs` is this; the skills below must carry the same four things.
- Handoff vs supervisor ([OpenAI Agents SDK handoffs](https://openai.github.io/openai-agents-python/handoffs/); [LangGraph supervisor](https://pypi.org/project/langgraph-supervisor/)): a handoff transfers the whole conversation to one specialist; a supervisor delegates and keeps control. Our workers are supervisor-style (the dispatcher keeps the loop); our `CONTINUE PR #n` takeover is a handoff, carried by the Hand-off block instead of the chat. A source warned the LangGraph supervisor library itself is now recommended to be replaced by plain tool delegation for most cases (secondary source; low weight).
- Agent teams ([docs](https://code.claude.com/docs/en/agent-teams)) are the vendor's answer to "teammates challenge each other" — useful for adversarial review in an attended local session, but experimental, local-only (mailbox files), and non-resumable, so not a base for the cloud lanes.

## Recommendations (ranked; for the dispatcher to assign)

Tool and hook changes are recommendations only; this PR edits none.

1. **Teach `cursor-agents.mjs followup` the `delivery` option** (`--delivery steer|queue`, default: try plain, on `agent_busy` report BUSY and suggest `--delivery steer`). Closes gap 6 with a documented API field. Files: `tools/ci/cursor-agents.mjs`, its unit test. Small, no risk to Claude lanes.
2. **Make the `needs-decision` queue the asker's input.** A dispatcher step (or `pr-board.mjs --decisions`) that lists open `needs-decision` items with their comment's options and pick, so ONE `AskUserQuestion` batch (≤4 questions, the tool's cap) covers them when Bryce is attended. Removes gap 1's dependence on a worker re-asking.
3. **Standardise the worker → parent question as a label + comment, with `send_message @parent` as a courtesy ping**, and say in WORKERS.md item 7 that the parent's reply must be a quoted relay or a label change to count. Closes gap 3 in text. (WORKERS.md is owned by another worker; send the text, below.)
4. **Add a "completion beacon":** a worker's last act is a one-line PR comment `done: <sha> <verdict>` (already de facto the Hand-off refresh). The dispatcher's `--children` could treat the Hand-off `next:` line as the signal and skip `get_session` for PRs whose newest Hand-off is `next: land`. Reduces gap 2's polling cost. Needs a `dispatch.mjs` change.
5. **Pin `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` unset** in `.claude/settings.json` `env` (explicit `0`) and add a test line, so gap 10 cannot happen by an environment edit. Hook/settings change.
6. **Evaluate `claude -p … --cloud <id>` from a workflow** as a push channel for "gate went stale / conflict" events (gap 4). **UNCONFIRMED** that a runner can authenticate; needs a Bryce decision on putting an account credential in Actions, so it is a question, not a task.
7. **Codex hooks trust:** note in `docs/AGENT-SURFACE.md` that `.codex/hooks.json` runs only after `/hooks` trust review (done in this PR), and consider a `codex` doctor line in `tools/env` that warns when the project is untrusted. Low value until Codex lanes are used more.
8. **Do not adopt agent teams** for cloud lanes. Revisit when the feature leaves experimental and supports resume.

## Part B — user-facing trigger skills

Bryce types a slash command from the Claude app on his phone. Facts that shape the design (from the [skills reference](https://code.claude.com/docs/en/skills)):

- `name` becomes the `/name` command; `disable-model-invocation: true` makes a skill user-only (so Claude never fires a costly one by itself — right for all three below; it also stops preloading into subagents and running from scheduled tasks).
- `context: fork` + `agent: <type>` runs the skill body as the task of a forked subagent, in the background by default; the subagent does not see the conversation, so the body must be self-contained. `model:` and `effort:` apply to that subagent.
- `$ARGUMENTS` / `arguments:` carry the PR number or task text; `argument-hint` helps the phone autocomplete.
- `description` + `when_to_use` are capped at 1,536 chars by Claude Code; this repo's own budget is stricter: `skillDescriptionCharsEach` 1024, total 11,000 chars / 1,500 words (`tests/data/agent-config-budgets.json`). Today's 37 skills use ~10.2k chars, so three more at ≤320 chars each (≈1k) fits only if the builder trims elsewhere or raises the budget with a reason.
- Only skills run in the main session can call `AskUserQuestion`; a forked subagent and every launched worker cannot (WORKERS.md item 7).

Existing neighbours: built-in `code-review` (finds correctness bugs in a diff; `--comment` posts inline) and `simplify` (cleanups, applies them); agents `finding-verifier` (re-reads each cited file:line, CONFIRMED/STALE/REFUTED), `agent-surface-reviewer` (one agent-surface unit), `ci-red-triage`; skills `check` (status), `ship` (open/ready/land), `steward` (drive a PR to green), `handoff`. None of them attacks a PR's *claims*: they find bugs or verify findings. Level 1 fills that hole.

### Level 1 — `challenge` (name TBD; "review" would collide with the built-in review commands)

| | |
|---|---|
| trigger | Bryce: `/challenge 4242`. User-only. |
| spawns | ONE subagent (`context: fork`, `agent: general-purpose`, `model: sonnet`, `effort: high`), plus at most 2 read-only `finding-verifier` calls inside it. No cloud session, no browser. Starts from the PR, never from the author's summary. |
| what it does | Reads the PR body's Goal/Plan/Verified/Not-run, the diff and CI state with `gh api`; lists every *claim* (a ticked Plan item, a verdict line, "no player-facing change", a not-run group); tries to refute each against the tree (reruns the cheap proof: a `node --test` file or a grep, never a browser group, AGENTS.md rule 10); checks the diff against AGENTS.md rules and the path-scoped `.claude/rules/`; asks "what would break on a phone at 844×390 / what did the change not touch". Output rows: CLAIM, VERDICT (holds / stale / refuted / unproven), EVIDENCE (file:line or command + exit), SEVERITY. |
| model / cost cap | Sonnet; soft cap ≈$1 and 150k context. One pass. |
| reports | (1) a PR review via `pull_request_review_write` (event COMMENT, never APPROVE/REQUEST_CHANGES: nothing here approves or merges) with the table and the attribution footer; (2) one line back in Bryce's chat: PR, counts by verdict, link. A `refuted` high-severity row also adds `needs-decision` only if it contradicts a Plan item the author ticked. |
| stops | One pass. Never edits, pushes, labels `land`/`hold`, or fixes — the author (or `steward`) acts on the review. Stops at 15 claims (finding-verifier's own cap) and says which it skipped. |
| maps to | Evaluator side of evaluator-optimizer. Pairs with `steward` §review comments (the PR's owner fixes). No dispatcher involvement; `dispatch.mjs` does not launch it. |

Frontmatter draft (description 419 chars):

```yaml
---
name: challenge
description: "Use only when the user types /challenge <PR number>: adversarially review ONE pull request. Reads the PR's claims (ticked Plan items, verdict lines, not-run list) and tries to refute each against the tree, then posts a COMMENT review with CLAIM / VERDICT / EVIDENCE rows. Read-only; never edits, labels, approves or lands. Not for: finding bugs in a diff → /code-review; driving a PR to green → steward; status → check."
disable-model-invocation: true
context: fork
agent: general-purpose
model: sonnet
effort: high
argument-hint: "<pr-number>"
---
```

### Level 2 — `orchestrate`

| | |
|---|---|
| trigger | `/orchestrate <task in one or two sentences, or #issue>`. User-only. |
| spawns | A **cloud session** for the orchestrator (`create_session`, `append_system_prompt` = the orchestrator role, `permission_mode: auto`, tags `role:orchestrator`, `no-archive` is NOT set so the dispatcher archives it after its PR closes). The orchestrator then plans (Plan agent, Sonnet) and fans out ≤3 `worker` subagents in worktrees on disjoint paths — or, for work that outlives its turn, a `create_session` per worker. Not a `Workflow` unless Bryce says so. |
| why a session, not a subagent | A subagent dies with the parent turn and Bryce's chat must stay free (phone). A session survives, owns one PR, and uses the existing worker contract, so nothing new is needed on GitHub. |
| model / cost cap | Orchestrator Sonnet (Opus only if Bryce says "hard"); workers Sonnet/Haiku. The orchestrator inherits the worker cap: stop at 300k context or $10 soft (WORKERS.md item 6), counting its workers. |
| reports | The PR is the report (Goal, live Plan, Verified/Not run, Hand-off). To Bryce: one chat line at launch (session id, link) and, at the end, the PR link with the verdict from `ready-gate`. A question becomes `needs-decision` + one comment — never a chat question (item 7), because the orchestrator is unattended. |
| stops | Ends at `land` like any worker (rule 5), or at the cap with `needs-owner` and the Hand-off refreshed. Stops fan-out if two workers' paths overlap (one owner per path), or a worker reports red twice. Never merges, arms, rebases, force-pushes. |
| maps to | Equals `dispatch.mjs`'s CREATE_SESSION for ONE target chosen by Bryce rather than by the hourly rules. It uses `ship` to open the draft PR and land, `steward` for red CI, `handoff` at 300k, `check` for status. Claim: comment `claims #<n>` if it started from an issue; the launch comment is the same RECORD_LAUNCH the dispatcher posts, so the next dispatcher cycle sees it as a live worker and does not double-launch. |

Frontmatter draft (description 411 chars):

```yaml
---
name: orchestrate
description: "Use only when the user types /orchestrate <task or #issue>: start ONE cloud orchestrator session for that task. It plans, fans out up to 3 worker subagents on disjoint paths, opens the draft PR, verifies to the pre-push floor and ends at `land`. Questions go to a needs-decision label, never to the user. Not for: a single edit → just do it; reviewing a PR → /challenge; unattended multi-task runs → /autopilot."
disable-model-invocation: true
arguments: [task]
argument-hint: "<task text or #issue>"
---
```

### Level 3 — `autopilot` (Bryce's "full stop"; name TBD — I read "full stop" as full autonomy, not "halt" — PENDING Bryce's confirmation (the dispatcher is asking him); if he meant a hard stop switch, that is `dispatch:pause`, which exists)

| | |
|---|---|
| trigger | `/autopilot <goal>`. User-only. Runs in the **attended chat session** (the only place `AskUserQuestion` works), so it must be started from a session Bryce's app is following. |
| spawns | The chat session becomes the orchestrator. It launches workers with `create_session` (one per issue/PR), keeps them steered with `send_message`, reads them with `get_session`/`list_events`, and delegates read-only checks to Sonnet subagents. Workers are ordinary `lane:claude` workers; Cursor/Codex lanes are used only if the goal names them. |
| model / cost cap | Orchestrator on the chat's model, but it must hand off at 300k (efficiency review finding 1; skill `handoff`). Proposed budget for Bryce to set: a dollar cap and a worker count stated in the goal (default 3 live workers, $10 soft per worker, a day cap it asks about once). Idle wakes use `PAUSE_TRIGGER`; no timer shorter than the bounded check-in. |
| communicates with Bryce | **Only through `AskUserQuestion`**, one decision per question (≤4 per call), each with a recommended option first, the options' costs in the description, and in the same turn `needs-decision` on the PR/issue plus ONE comment listing options and the pick (efficiency review finding 3; the label is the queue; never re-ask). No status chatter: its final message is a table of PRs landed/blocked. It acts on a decision only from the answer or a quoted relay. |
| reports | PR bodies (workers) and the Board comment (#1780). When a question needs the answer to proceed it keeps working on everything independent. |
| stops | The goal's done condition; the day cap; `dispatch:pause`; two reds on the same PR; quota `rejected`/`allowed_warning` (launch nothing); 300k context (handoff with follow-up prompts already written into the Hand-off blocks); a classifier denial (final: put it to Bryce as a question). |
| maps to | It *is* a scoped dispatcher: same rules (one lock — the Board's `lock:`; two orchestrators labelled the same PRs on 10-29 07:41Z), same launch gate (`get_session` receipt before `create_session`), same RECORD_LAUNCH comments. It must either take the lock (`dispatch.mjs --take-lock`, clean handover) or run with the hourly dispatcher's scheduled task disabled for its scope; running both at once is the known failure. It reuses `ship`, `steward`, `check`, `handoff` rather than restating them. |

Frontmatter draft (description 430 chars):

```yaml
---
name: autopilot
description: "Use only when the user types /autopilot <goal>: become the orchestrator for a multi-task goal. Launch and steer workers with create_session/send_message, delegate checks to Sonnet subagents, drive each PR to `land`, and talk to the user ONLY through AskUserQuestion (one decision per question, with needs-decision + one comment). Takes the dispatcher lock. Not for: one task → /orchestrate; reviewing → /challenge; status → check."
disable-model-invocation: true
arguments: [goal]
argument-hint: "<goal, worker cap, $ cap>"
---
```

### Open choices (my picks)

| choice | pick | alternative |
|---|---|---|
| names | `challenge`, `orchestrate`, `autopilot` | `review` (collides with `/code-review`), `conductor`; Bryce's call |
| level 1 on a skill fork or an agent file | skill with `context: fork` using `general-purpose`; promote to `.claude/agents/pr-challenger.md` only if the body outgrows ~60 lines | an agent file now (adds to the agent roster the dispatcher template references) |
| level 2 host | cloud session | a subagent in the chat (dies with the turn) |
| level 3 host | the attended chat | a persistent cloud session (cannot use `AskUserQuestion` reliably: restarts wipe it) |
| Cursor/Codex inside levels 2–3 | only on request; PR is the report | auto-routing by issue shape |

### Build notes for the `.claude/skills/**` owner

- Each skill body should be short and link, not restate: `AGENTS.md` rules 4, 10, 12, 13; WORKERS.md items 6–7; `docs/notes/EFFICIENCY-REVIEW-2026-10-30.md` findings 1, 3, 7; `dispatch.mjs` header for the launch gate.
- Add the three names to `.claude/skills/README.md` and the user-invocable routing evals (`agent-config`).
- Trim ≥1,000 chars of existing descriptions or raise `skillDescriptionChars` with the reason, since these three add ≈1.26k.
- `challenge` needs a test that its frontmatter keeps `disable-model-invocation: true`; the other two likewise (a cost-bearing skill that Claude may fire on its own is the main risk).
- Level 3's lock handling and question rules are the part most likely to rot; put them in the skill once and have `dispatcher` (the role skill another worker is building) link to it.

## Text for WORKERS.md (to send to its owner)

Under contract item 7, add: "A parent's answer reaches a cloud worker as a message, which carries no authority on its own: it counts only as a quoted relay of Bryce's words (with when and where) or as a change to the label/Plan it points at. A cloud child can `send_message` its parent by explicit session_id (the `@parent` alias is unverified), but its question goes in the PR (`needs-decision` + one comment), a `send_message` by session_id is a ping."

Under §Per vendor, Cursor: "To change what a running Cursor agent is doing, `followup` needs `delivery: steer` (Cursor API); a plain follow-up returns `BUSY` while a run is active." (Only once recommendation 1 lands.)

## Not done / unconfirmed

- Codex cloud tasks and any Codex-to-Codex messaging: not found in the pages read; only subagents and hooks confirmed.
- xAI consumer-app "custom connector" setup: only the API remote-MCP doc was found.
- Claude `Channels` (pushing CI/chat events into a session), `routines`, and `remote-control` pages were linked from the pages read but not read; they may offer a better push channel for gap 4.
- No channel was exercised: per the brief, nothing was sent to other vendors' agents and no session was launched.

## Sources

Read 2026-10-30.

- Claude Code sub-agents: https://code.claude.com/docs/en/sub-agents
- Claude Code skills reference: https://code.claude.com/docs/en/skills
- Claude Code in the cloud (sessions, `claude -p … --cloud <id>`, auto-fix, environment expiry): https://code.claude.com/docs/en/claude-code-on-the-web
- Claude Code cross-session messaging: https://code.claude.com/docs/en/cross-session-messaging
- Claude Code agent teams: https://code.claude.com/docs/en/agent-teams
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Cursor Cloud Agents API endpoints: https://cursor.com/docs/cloud-agent/api/endpoints (OpenAPI: https://cursor.com/docs-static/cloud-agents-openapi.yaml, cited by `tools/ci/cursor-agents.mjs`, not re-read)
- Codex subagents: https://learn.chatgpt.com/docs/agent-configuration/subagents (redirected from developers.openai.com/codex/subagents)
- Codex hooks: https://learn.chatgpt.com/docs/hooks (redirected from developers.openai.com/codex/hooks)
- xAI remote MCP tools (search result, page not fetched in full): https://docs.x.ai/developers/tools/remote-mcp
- Anthropic, How we built our multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
- Anthropic, Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- OpenAI Agents SDK handoffs: https://openai.github.io/openai-agents-python/handoffs/
- LangGraph supervisor (search result only): https://pypi.org/project/langgraph-supervisor/

Repo: `docs/WORKERS.md`, `docs/AGENT-SURFACE.md`, `docs/notes/ORCHESTRATION-REVIEW-2026-10-29.md`, `docs/notes/EFFICIENCY-REVIEW-2026-10-30.md`, `tools/ci/dispatch.mjs` (header), `tools/ci/cursor-agents.mjs`, `tests/data/agent-config-budgets.json`, `.claude/agents/worker.md`, `.codex/hooks.json`, `.claude/skills/phone-browser/SKILL.md`.
