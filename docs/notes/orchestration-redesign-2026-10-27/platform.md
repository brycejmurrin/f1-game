# Platform research — what the platform now provides natively (read 2026-10-27)

Scope: current primary docs (code.claude.com, docs.github.com, cursor.com, learn.chatgpt.com) plus two first-hand
probes from this session (`get_session`, the GitHub proxy's own refusal text). Repo beliefs checked against:
`docs/plans/2026-10-19-fleet-redesign.md` §4A/§7, `docs/notes/HARNESS-SETTINGS-2026-10-26.md`,
`docs/archive/notes/MULTI-AGENT-ORCHESTRATION-2026-10-10.md`, `docs/archive/notes/AGENT-TOOLING-RESEARCH-2026-09-22.md`.
Legend for "replaces": ROT = orchestrator rotation + hand-off; BUS = bus branch; WATCH = fleet-watch cron;
NET = safety-net send_later; CLAIMS = claims board; GATE = merge-gate/GAME-SLOT pacing; BRIEF = launch briefs.

## 1. Claude Code Projects — https://code.claude.com/docs/en/claude-projects
- Status: public beta, Pro and Max only, "rolling out gradually"; not Team/Enterprise; web, desktop and mobile only
  (not CLI/VS Code/JetBrains). One project belongs to one user; cannot be shared; no org controls.
- Shape: one coordinator conversation; each task becomes a thread = a cloud session on its own branch, opens a PR,
  then "watches the pull request with auto-fix turned on, whether or not auto-fix is on for your other cloud
  sessions" and "replies in the thread when checks pass". Thread cards: Resolve conflicts / Fix CI / Address
  comments / Merge it / Create PR. Overview groups: Ready for review, Waiting on you, Working, Landing, Idle,
  Resolved (auto after a week idle). Tabs: Library, Pull requests, Scheduled tasks.
- Context: "Threads compact automatically, and the conversation works from recent messages, recent threads, and
  project memory rather than its full history, so it keeps going for as long as the project runs." Project memory =
  files, `MEMORY.md` index read by every cloud thread; project instructions ≤ 16,000 characters.
- Limits: "The enforced limit is 200 new threads per day across your projects." No cap on concurrent threads
  ("Claude starts as many as the work calls for"); a thread limit you ask for "isn't a hard cap". A thread at the
  plan limit waits and resumes itself; one started by a scheduled task does NOT wait. New projects run threads on
  Opus/high by default (settable). Follow-up to a thread idle past the cache lifetime "re-reads that thread's whole
  conversation" (1 h on Pro/Max within plan).
- Repo config in cloud threads: loads `CLAUDE.md`, `.claude/CLAUDE.md` and `.claude/rules/` at the repo ROOT only;
  subdirectory CLAUDE.md and `paths:` rules are NOT loaded; `.claude/skills/`, agents, commands, `.mcp.json`,
  plugins in settings, permission rules and HOOKS are NOT loaded/run; `env` not applied. Threads run in auto mode;
  "Cloud threads don't read permission rules from a repository's `.claude/settings.json`". Hooks/skills apply only
  when the thread runs on your own machine via Remote Control.
- Replaces: ROT (coordinator never rotates), WATCH (Overview), per-PR owner + subscription (thread auto-fix), BRIEF
  (project instructions + memory). CONTRADICTS the plan §4A line "a one-repository project applies the repo's
  `.claude/settings.json` hooks and permission rules" — the current page says the opposite; `protect-files.sh`,
  `bash-guard.sh`, `github-mcp-guard.sh`, merge-gate receipts and the skills tree would all be inert in cloud threads.

## 2. In-session multi-agent — workflows, teams, subagents
- Workflows: https://code.claude.com/docs/en/workflows — all paid plans (Pro: enable in `/config`). JS script with
  `agent()`, `parallel()`, `pipeline()`, `phase()`, `log()`, `args`; runs in the background; resumable in the same
  session and in a reopened cloud session (results saved with the conversation). Limits: 16 concurrent agents by
  default (fewer with fewer CPUs; `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` 1–256, v2.1.269+); 4,096 items per
  `parallel()`/`pipeline()`; 1,000 agents per run; `Large workflow` warning at > 25 agents or > 1.5 M projected
  tokens; size guideline default `medium` (< 10 agents), `small` on Pro. Pauses (not fails) at a usage limit, up to
  twice, within 24 h. `ultracode` keyword works only on human-typed input — NOT in a scheduled-task prompt, a `-p`
  prompt, or "a webhook payload or pull request comment relayed into the conversation". A script-computed `agent()`
  prompt "doesn't count as a request from you" to the auto-mode classifier. Fan-out agents share the prefix cache
  (held ≤ 5 s); workflow agents get the 5-min TTL unless `subagentPromptCacheTtl: 1h`.
- Agent teams: https://code.claude.com/docs/en/agent-teams — experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`,
  interactive sessions only (not `-p`/SDK; the cloud page says it can be enabled via environment variables). One team
  per session, no nested teams, lead fixed, no resume of in-process teammates, no background subagents from
  teammates. Token cost "scales linearly"; guidance 3–5 teammates. Mailbox files under `~/.claude/teams/`.
- Subagents: https://code.claude.com/docs/en/sub-agents — 20 concurrent by default
  (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, v2.1.217+), background by default, `isolation: worktree`, named subagents
  addressable via `SendMessage` (no teams flag needed), resumable by id/name, `memory: project`, 5-min cache TTL.
- Replaces: `fan-out-with-subagents`, `/survey-track` fan-outs, `total-audit`/`code-survey` loops → a saved
  `.claude/workflows/*.js` (committed, rerunnable, resumable). Teams stay a non-fit for cloud fleet work.

## 3. Scheduled tasks / triggers / webhooks — https://code.claude.com/docs/en/routines
- Renamed "scheduled tasks" (research preview); Pro/Max/Team/Enterprise; `claude.ai/code/routines`, `/schedule` in
  the CLI (not inside a cloud session). Triggers: schedule, API (`POST …/routines/{trig}/fire`, bearer, beta header
  `experimental-cc-routine-2026-04-01`, `text` arrives wrapped in `<routine-fire-payload>` as untrusted data), GitHub
  events (pull_request / release / issue, filters on author/title/body/base/head/labels/draft/merged; needs the Claude
  GitHub App; "per-task and per-account hourly caps", dropped beyond). Cron "more often than once per hour are
  rejected"; on-the-hour runs start minutes late. Each fire = fresh session in auto mode; a project can route a run
  into an existing thread instead. The saved prompt "can't act as approval or consent".
- Hourly limits (no overage): scheduled runs 100/h per account; Run now + API fires + re-arm one-off 30/h per task;
  Run now 100/h per account; API fires 100/h per account. GitHub reconnect grace 72 h.
- In-session: https://code.claude.com/docs/en/scheduled-tasks — `/loop`, `CronCreate` 1-min granularity, ≤ 50 tasks
  per session, recurring tasks expire after 7 days, jitter: recurring runs up to 30 min late (hourly: 0–30 min),
  one-shots on :00/:30 up to 90 s early. Session-scoped tasks do NOT survive a reclaimed cloud VM
  (claude-code-on-the-web §Environment expired). `/goal` exists for "keep working toward a condition".
- Live tool schemas in this session (primary): `create_trigger` — modes self / `persistent_session_id` /
  `create_new_session_on_fire`; "Minimum interval is normally hourly (some projects allow shorter)"; `send_later`
  = one-shot trigger bound to this session, minute granularity, "Delivery survives container restarts";
  `watch_url` = inbound webhook URL + sealed secret, dies with the session; `subscribe_pr_activity` = one session per
  PR, "A PR's events go to one session at a time", events as `<wake reason="external-event">`.
- Replaces: WATCH → one cloud scheduled task (hourly floor is unchanged from the 10-10 note); NET → `send_later`
  stays the only sub-hour wake (unchanged); BUS → GitHub-event triggers + PR comments (a labelled PR fires a task;
  bus `to:#PR` lines become PR comments the owner's subscription already wakes on); `fire_trigger`/API trigger =
  "SPAWN" without a seed session.

## 4. Remote sessions API (claude-code-remote MCP)
- No public reference page documents `create_session`/`send_message`/`list_events`/lineage; the cloud page
  (https://code.claude.com/docs/en/claude-code-on-the-web) documents `claude -p "<msg>" --cloud <session-id>` from
  ANY logged-in machine as the sanctioned way to queue a message into a cloud session (JSON `{ok, session_id, url}`),
  plus `--teleport`, auto-fix, and "Environment expired": history restored; shell commands, subagents and
  session-scoped scheduled tasks NOT restored.
- Lineage: `get_session` on this session returns `"lineage":{"depth":0,"limit":8}` (first-hand, 2026-10-27) — the
  limit stands; an issue titled "[FEATURE] Raise, configure or document the lineage depth limit (8)" exists
  (claudeissues.com/issue/97749; 503 at read time; the GitHub proxy refuses `search/issues`, so unverified).
- Context window: this session reports `context_usage.max_tokens: 1000000` on Fable 5.1 (`used_tokens: 201182`
  at the time); cloud sessions set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` themselves (your env value is ignored);
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW` can be set. CONTRADICTS the 200k soft / 250k hard rotation caps in
  `agent-fleet` launch policy and plan §4B.5: the harness compacts, the window is 1 M, and no doc ties rotation to
  chat length.
- Cross-session messaging: https://code.claude.com/docs/en/cross-session-messaging — a message "never counts as
  your consent"; "a cloud session … can't use `SendMessage` to answer a message from another machine"; inbound
  default: a prompting receiver delivers, a bypass receiver holds; ≤ 100 held, ≤ 50 queued, loops throttled;
  `crossSessionInbound` accept/hold/refuse. This session reports `cross_session_inbound: "available"`.
- Auto mode: https://code.claude.com/docs/en/permission-modes — classifier "sees user messages, tool calls other than
  read-only lookups … and your CLAUDE.md content. Tool results are stripped"; 3 blocks in a row or 20 total pause
  auto mode (not configurable); default classifier model Sonnet 5; blocked by default: "Merging a pull request no
  human has approved, approving Claude's own pull request, or disabling CI checks", force push, discard commands;
  allowed: "Pushing to any branch of the repository you're working in, including the default branch" (deploy-named
  branches "judged on their own terms"); SendMessage reviewed before delivery (v2.1.222+); in-conversation
  boundaries can be dropped by compaction ("For a hard guarantee, use a deny rule"); `autoMode.allow` /
  `autoMode.environment` for standing patterns. Confirms the plan's §1 reading; adds the hard "no unapproved PR
  merge" default the fleet's standing-authority block runs against.
- Prompt cache: https://code.claude.com/docs/en/prompt-caching — main conversation 1 h on a subscription within
  plan usage, 5 min once on usage credits/API; `promptCacheTtl`/`CLAUDE_CODE_PROMPT_CACHE_TTL` 5m|1h (v2.1.242+);
  "everything else" (subagents, workflows, teammates, compaction) 5 min unless `subagentPromptCacheTtl`; idle long
  conversations on the 1-h TTL may be auto-compacted (`idleCompaction`, v2.1.290+). The 50–55-min check-in cadence
  still matches the 1-h bucket; the 2026-10-26 harness note is current (this session: cache_read 12.4 M vs input 0.32 M).

## 5. GitHub-native coordination
- Auto-merge: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request
  — needs the repo setting plus a protection rule with required checks/reviews; merges "after all required reviews and
  status checks pass"; write permission to arm. The GitHub proxy in Claude Code sessions refuses GraphQL and routes
  auto-merge/ready/draft through `PUT|DELETE /repos/{o}/{r}/pulls/{n}/ccr/auto_merge`, `…/ccr/ready_for_review`,
  `…/ccr/convert_to_draft` (proxy refusal text, 2026-10-27; matches `deploy-pr-rest.test.mjs`). The 2026-09-22 note's
  "deploy branch has no protection" is stale: HARNESS-SETTINGS-2026-10-26 records a ruleset (id 22828280) on the
  deploy branch, so auto-merge can arm now → replaces the orchestrator's merge call for non-game PRs (GATE stays
  only as a pre-arm check).
- Merge queue: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
  — FIFO, CI must run on `merge_group`, group size 1–100, build concurrency 1–100, status-check timeout, "Merge when
  ready" works without the auto-merge setting. Availability: GA post says "all public repos owned by organizations"
  and Enterprise Cloud for private (https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/);
  neither page mentions USER-owned repos — `brycejmurrin/f1-game` is user-owned, so verify in the branch-protection
  UI before designing GAME-SLOT around it.
- Actions concurrency: https://docs.github.com/en/actions/using-jobs/using-concurrency — `concurrency.group` (any
  expression), `cancel-in-progress`, default `queue: single` (one running + one pending, newer pending replaces
  older), `queue: max` up to 100 pending (incompatible with cancel-in-progress). A `pages` group with `queue: single`
  is GAME-SLOT pacing for free; the "never dual-dispatch Pages" rule becomes a workflow key.
- Copilot coding agent: https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent — 59-min
  max run, one branch, one repo; MCP `assign_copilot_to_issue` is in this session. Labels: the scheduled-task
  GitHub trigger filters on labels, so a `claimed`/`ready` label can fire work (CLAIMS).

## 6. Cross-vendor
- Cursor Cloud Agents API v1 (https://cursor.com/docs/cloud-agent/api/endpoints): `POST /v1/agents`, follow-ups
  `POST /v1/agents/{id}/runs` and NEW mid-run steer `delivery: "steer"` (202 `steered`|`queued`; 403 if not enabled;
  409 `agent_busy` otherwise), SSE `…/runs/{runId}/stream`, cancel, archive, usage, artifacts (15-min presigned URL).
  "Webhooks are coming soon" in v1 (v0 `statusChange` only, HMAC `X-Webhook-Signature`:
  https://cursor.com/docs/cloud-agent/api/webhooks). Automations (https://cursor.com/docs/cloud-agent/automations):
  schedule, GitHub events incl. PR commented / label changes / CI completed / workflow run completed, Slack, Linear,
  Sentry, PagerDuty and a private Webhook endpoint; follow-ups from GitHub/Slack reach the run. CHANGE vs 10-10 note:
  a Cursor agent can now be steered mid-run and triggered by a PR comment/label — the bus can reach it via GitHub.
- Codex cloud (https://learn.chatgpt.com/docs/cloud; developers.openai.com redirects there): tasks from ChatGPT
  web/mobile/desktop/CLI; no public API or webhook to trigger or message a running task; `@codex review` / `@codex
  fix it` PR comments start cloud tasks (https://developers.openai.com/codex/integrations/github); scheduled tasks
  (https://learn.chatgpt.com/docs/automations) support time or Gmail/Slack/GitHub-PR event triggers (not both),
  no webhooks, no stated limits; CLI 0.164.0 (2026-10-23) adds "session lifecycle APIs" and "a channel-backed cloud
  app-server client" (https://learn.chatgpt.com/docs/changelog) — not yet a documented inbound surface. Unchanged:
  Codex is reachable only through GitHub.

## Contradictions with the repo's notes (summary)
1. Projects threads do NOT run repo hooks/skills/settings/`.mcp.json` (plan §4A says they do).
2. Rotation at 200k is a fleet rule with no platform basis; the window is 1 M and compaction is automatic.
3. `merge_pull_request` of an unapproved PR is an auto-mode DEFAULT block, not just a classifier mood.
4. Cursor agents accept mid-run steering and PR-comment/label triggers (10-10 note: no message in).
5. Auto-merge can arm now that the deploy branch has a ruleset (09-22 note recorded the opposite).
6. Lineage limit 8 confirmed first-hand; no public doc or setting raises it.
