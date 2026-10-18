# Per-vendor adapters

How an orchestrator spawns, messages, reads and stops a worker on each host (sources in `docs/notes/MULTI-AGENT-ORCHESTRATION-2026-10-10.md`).

## Per-vendor adapters

Pick the column of the host YOU run on for the orchestrator's own tools; the
worker's column only matters for how you reach it. A Claude Code orchestrator
launching Cursor workers uses the Cursor API column (needs a key).

| need | Claude Code cloud | Cursor, from inside a Cursor cloud agent | Cursor Cloud Agents API v1 (any host with a key) | Grok Build |
|---|---|---|---|---|
| spawn | `create_session` with `prompt`, `source_url`, `source_revision` and `permission_mode: "auto"` (omit `source_url` and the child has no repo); or a routine `/fire` | `Task`, `environment: "cloud"`, `run_in_background: true`, `cloud_base_branch` = deploy branch | `POST /v1/agents` (`prompt.text`, `repos[].url`, `startingRef`/`prUrl`, `model.id`) | `grok --no-auto-update -p "<prompt>" -w --ref <deploy branch> --always-approve --output-format streaming-json` in a job you own (no cloud API) |
| message a running worker | `send_message` (wakes an idle session; a session that has gone inactive refuses it with `session_inactive`, so `get_session` first and put the message on the PR too) | `Task` `resume: <id>` once it has finished (fails while it runs); else a PR comment | `POST /v1/agents/{id}/runs` (one active run at a time) | `grok -r <session> -p "<msg>"` in the same job, or a PR comment |
| worker → orchestrator | `send_message` back | the subagent's final message returns to you; mid-run only the PR | none: PR comment + fleet block | none: PR comment + fleet block |
| status | `get_session` (`status_bucket`), `list_events` | `cursor-cloud` `list-cloud-agents` / `batch-fetch-details` | `GET /v1/agents/{id}`, `…/runs/{runId}`, `…/stream` | the job's log |
| stop | `interrupt_session`, then `archive_session` | none in-tool: ask via PR; the API column can cancel | `POST /v1/agents/{id}/runs/{runId}/cancel`, then `POST /v1/agents/{id}/archive` | cancel the job; `--max-turns` caps it up front |
| PR events | `subscribe_pr_activity` + a `send_later` poll | `subscribe_github_ci` + `subscribe_github_pr` | none (webhooks are v0-only) | none |
| timer | `send_later` | `subscribe_timer` (`once: true` + `delaySeconds`) | none | none |

- Grok Build reads this repo as-is: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`,
  `.cursor/rules/`, and Claude Code's skills, agents, hooks and MCP config
  (`grok inspect` lists what it found). The guard hooks therefore bind a Grok
  worker too. Give it `--deny "Bash(git push --force*)"`; deny always wins.
- Grok Bot is the orchestrator, not a worker: it launches and reads workers,
  holds merges at role-merge-holder.md's level and watches ship/Pages. A cloud
  worker reaches it only through its PR (`fleet-status:` line and comments).
- Cursor sessions do not appear in Claude's session list, and `send_message`
  to one fails ("target session could not be verified"): reach them through
  their PR.
- Claude Code's `subscribe_pr_activity` has open bugs: it can drop
  `check_run` completions and bot-authored reviews, so a worker that only
  waits on it sits idle through a red. Read CI with `ci-watch.mjs --once` on
  every timer wake.

## Codex in-session adapter

Codex collaboration agents are in-session tasks, not automatically equivalent
to Claude/Cursor sibling sessions. Reuse the named `.claude/agents/<persona>.md`
contract, but repeat its OWNED/FORBIDDEN paths, read-only limits, tools and
hand-back format in the Codex launch prompt because Claude frontmatter is not
enforcement there. Use Codex children for bounded evidence work such as
`release-auditor`; keep Merge Desk readiness/arming authority with the
explicitly designated parent session. Do not claim sibling-session
subscriptions, PR ownership or merge authority unless the host actually
provides those APIs and the user granted them.
