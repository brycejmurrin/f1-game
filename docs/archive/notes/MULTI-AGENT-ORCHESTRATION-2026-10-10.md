# Multi-agent orchestration across Claude Code, Cursor and Grok (2026-10-10)

Why the `agent-fleet` skill looks the way it does: what each vendor can do
today, what this repo already had, and what is still missing. Workflow lives in
`.claude/skills/agent-fleet/`; this note is the evidence.

## What each platform supports (read 2026-10-10)

**Claude Code.**
- Sessions message each other with `ListAgents` / `SendMessage`. An idle receiver
  starts a new turn; text only; the receiver is told the sender is a session,
  not the user. Cloud sessions are reachable only from a session connected
  through Remote Control. In a cloud session the same surface is the
  claude-code-remote MCP: `create_session`, `send_message`, `get_session`,
  `list_events`, `interrupt_session`, `archive_session`, `send_later`.
  `SendMessage`'s `notify_when_idle` wakes you when a session goes idle, but
  only for sessions on the same machine.
  <https://code.claude.com/docs/en/cross-session-messaging>
- **PR watching** (re-read 2026-10-11): the bug reports name it
  `mcp__github__subscribe_pr_activity` (GitHub MCP), while `session-comms`
  (#1369) lists it on the claude-code-remote MCP; the surface may differ by
  session type, so the docs name the tool, not its server. Auto-fix (CI status bar toggle, or
  `/autofix-pr` from a terminal) drives it. Open issues report it dropping
  `check_run` completions (anthropics/claude-code#62561), bot-authored reviews
  (#62096, #62977) and commit-status events (#62928); the reporters' fallback
  is a timed poll. Hence the skill's "subscription plus timer, read CI on
  every wake". <https://code.claude.com/docs/en/claude-code-on-the-web>
- **Projects** (public beta, Pro/Max): a coordinator conversation starts one
  cloud "thread" per task. Each thread works on its own branch, opens a PR,
  watches it with auto-fix (CI, review comments) and reports back; the Overview
  shows which thread waits on you. This is the orchestrator/worker model built
  in, Claude-only. <https://code.claude.com/docs/en/claude-projects>
- **Routines**: a saved prompt + repos fired by a schedule (≥ 1 h), an API
  call (`POST https://api.anthropic.com/v1/claude_code/routines/{trig}/fire`,
  bearer token, optional `text` that arrives labelled untrusted; returns the new
  `claude_code_session_id`) or a GitHub event (`pull_request.*`, `release.*`).
  Each fire is a fresh session. <https://code.claude.com/docs/en/routines>
- **Agent teams**: experimental, in-process, interactive sessions only
  (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Not a cross-session tool.
  <https://code.claude.com/docs/en/agent-teams>

**Cursor Cloud Agents API v1** (public beta).
<https://cursor.com/docs/cloud-agent/api/endpoints>
- Spawn: `POST /v1/agents` (`prompt.text`, `repos[].url` / `startingRef` /
  `prUrl`, `model.id`, `envVars`, `autoCreatePR`, `workOnCurrentBranch`;
  branches are `cursor/…`).
- Message in: `POST /v1/agents/{id}/runs` (a follow-up on the same workspace;
  one active run at a time). Status: `GET /v1/agents/{id}`, `…/runs/{runId}`
  and `…/stream`. Stop: `POST …/runs/{runId}/cancel`, then
  `POST /v1/agents/{id}/archive` (agent-level). Artifacts:
  `GET /v1/agents/{id}/artifacts`; cost: `GET /v1/agents/{id}/usage`.
- Webhooks: "coming soon" in v1 (legacy v0 has them). Re-read 2026-10-11.
- No message OUT: an API-launched Cursor agent cannot call its orchestrator; it
  can only push, comment on GitHub, or end its run. A Claude session's
  `send_message` to a Cursor session fails ("target session could not be
  verified", observed 2026-10-10).

**Cursor, inside a cloud agent** (tool schemas read first-hand in a Cursor
cloud VM, 2026-10-11; no public page documents them yet):
- `Task` with `environment: "cloud"` launches a worker on its own VM and
  branch (`cloud_base_branch`, default the parent's pushed branch);
  `run_in_background: true` delivers its final message back to the parent.
  That return is the one worker → orchestrator channel Cursor has.
  `resume: <id>` sends a follow-up only after the worker finishes.
- `cursor-cloud` MCP: `list-cloud-agents` and `batch-fetch-details` read
  sibling runs (status, transcripts, diffs) in the same environment.
- `cursor-subscriptions` MCP: `subscribe_github_ci` (one commit-wide verdict,
  delivered only while that commit is still the branch head),
  `subscribe_github_pr` (skips the agent's own pushes and auto-merge toggles),
  and `subscribe_timer` (cron or `delaySeconds`, `once: true`), Cursor's
  `send_later`.

**Grok / xAI.**
- **Grok Build** is a coding-agent CLI (`grok`, headless `grok -p … --output-format
  streaming-json`) with skills, plugins, hooks, MCP and an ACP editor protocol;
  open source. No cloud/remote mode is documented. As a worker it runs headless
  inside a job you own. <https://docs.x.ai/build/overview>,
  <https://github.com/xai-org/grok-build>
- Instruction files (re-read 2026-10-11, was UNVERIFIED): every directory from
  the repo root down loads `AGENTS.md`, `CLAUDE.md` and friends plus
  `.grok/rules/*.md`, `.claude/rules/` and `.cursor/rules/`; Claude Code
  skills, plugins, agents, hooks and MCP config are read "with no extra
  setup". So this repo's `.claude/skills/` and guard hooks already reach a
  Grok worker; `grok inspect` confirms per checkout. Both rule dirs load, so
  `render-wgx` / `render-tlx` arrive twice there (harmless; same bodies).
  <https://docs.x.ai/build/features/project-rules>,
  <https://docs.x.ai/build/features/skills-plugins-marketplaces>
- Headless flags: `-w/--worktree` + `--ref <branch>`, `-s/--session-id`,
  `-r/--resume`, `--max-turns`, `--always-approve`, `--allow` / `--deny`
  (deny wins), `--no-auto-update` for CI.
  <https://docs.x.ai/build/cli/headless-scripting>,
  <https://docs.x.ai/build/cli/reference>,
  <https://docs.x.ai/build/features/permissions>
- **Grok Bot**: persistent bots on a shared cloud computer (run in Cursor's
  cloud, included with paid Cursor plans) that message each other, share group
  chats and pass task ownership. GitHub clone/push/PR, an API and webhooks are
  still not documented (re-read 2026-10-11). <https://docs.x.ai/grok-bot/overview>

**Cross-vendor.** AGENTS.md is read by Cursor, and by Claude Code only when no
CLAUDE.md exists (this repo's CLAUDE.md imports it, the right pattern)
<https://agents.md/>. A2A is a Linux Foundation agent-to-agent standard
<https://github.com/a2aproject/a2a>; none of the three coding agents exposes it.
The one bus all three can read and write is GitHub.

| capability | Claude Code | Cursor | Grok |
|---|---|---|---|
| spawn a worker | yes | yes (API, or `Task` cloud in-agent) | partial (headless in your CI/VM) |
| message a running worker | yes (wakes it) | API follow-up run; `Task resume` only once finished | no API (`-r` resume in your job) |
| worker → orchestrator | yes | `Task` final message; else GitHub only | no (GitHub only) |
| wake on PR/CI event | yes, lossy (see PR watching) | in-agent subscriptions; API: v0 webhooks only | no |
| open a PR | yes | yes | via `gh` in your job |
| schedule | yes (routines, `send_later`) | `subscribe_timer` in-agent | bot routines, no repo |
| reads this repo's skills/hooks | yes | skills yes (`.claude/skills`) | yes (Claude Code compat) |

## Design

- **GitHub is the protocol; vendor messaging is the fast path.** Each worker PR
  carries a fenced `fleet` block (worker id, orchestrator id, owned, state,
  blocker, needs-orchestrator) and escalates with an `@orchestrator BLOCKED:`
  comment. A Claude worker also `send_message`s the orchestrator.
- **One launch template** for every vendor: the fields AGENTS.md §Concurrent
  PRs already requires, plus the orchestrator id and the escalation rule.
- **One skill, two references**: the skill-description budget
  (`tests/unit/agent-config.test.mjs`, 1600 always-on words) had 52 words left,
  so orchestrator and worker share `agent-fleet`.
- For a Claude-only batch, Claude **Projects** already does spawn → PR →
  auto-fix → report back; point its project instructions at this skill.

## What the surveys found in this repo (and what this change fixed)

Fixed here:
- AGENTS.md and `steward` told every agent to call the Cursor-only
  `subscribe_github_ci` / `subscribe_github_pr` and called Claude Code's real
  `subscribe_pr_activity` "a fake name". Both now name the tool per host.
- The steward card's hash was stale (`7af43ce7`), so sessions trusting it
  skipped a changed steward skill. Refreshed.
- No `.claude/` skill covered coordinating sessions; the only coordination
  skills lived in `cursor-plugins/apex-f1-game/skills/`, which Claude Code does
  not load.

Still open (separate PRs, each needs its own verification):
1. Claims board (`tools/ci/who-is-on-it.mjs`): stores a 24-char hash, not the
   real session/agent id, so an orchestrator cannot message a claimant; no
   heartbeat or TTL, so a dead worker's claim sits for up to 24 h.
2. `apex-tools` MCP likely exits at start when `sharp` is not yet installed
   (`apex-extras.mjs` imports it; SessionStart's `npm install` finished after
   the server launched in this container).
3. `deploy.mjs --pr` opens a ready PR, against the draft-first flow.
4. No tool publishes screenshots to a PR: sessions commit PNGs to `shots/*`
   branches by hand.
5. `hud-survey.mjs` has a fixed device list (667x375 and 360x740 needed a local
   edit today).
6. A shallow clone fails `physics-baseline-provenance` locally when the
   blessing commit is fetched but its ancestry is cut: `git fetch --unshallow`.
7. No `workflow_dispatch` job hosts a Grok Build worker yet (needs an
   `XAI_API_KEY` secret and a `contents: write` / `pull-requests: write`
   token); until one exists, a Grok worker runs on a machine the user owns.
