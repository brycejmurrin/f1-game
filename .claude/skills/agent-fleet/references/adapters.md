# Per-vendor adapters

How an orchestrator spawns, messages, reads and stops a worker on each host (sources in `docs/notes/MULTI-AGENT-ORCHESTRATION-2026-10-10.md`).

**Cross-host talk (bus / webhook / D→A direct / Cursor reply):**
[`communication.md`](communication.md). Env and authority: `communication.md`, `.claude/rules/fleet-core.md`.

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
- A Grok agent is a coordinator host (role 8 in FLEET-ROLES-2026-10-19.md §4), not a worker: it
  launches and reads its own fleet's workers, merges its own PRs at
  role-merge-holder.md's level and watches ship/Pages. A cloud
  worker reaches it only through its PR (`fleet-status:` line and comments).
- Cursor sessions do not appear in Claude's session list, and `send_message`
  to one fails ("target session could not be verified"): reach them through
  their PR.
- Claude Code's `subscribe_pr_activity` has open bugs: it can drop
  `check_run` completions and bot-authored reviews, so a worker that only
  waits on it sits idle through a red. Read CI with `ci-watch.mjs --once` on
  every timer wake.

## Codex (desktop / CLI thread)

A top-level Codex thread Bryce starts can be fleet C's coordinator (`C·O1`, `multi-host.md` §Fleets and letters) or
a stand-alone PR owner: it pushes, opens and owns PRs, and merges only by `merge-gate.mjs` like any host. Its
collaboration CHILDREN are in-session tasks, not sibling sessions (rows below; `multi-host.md` §Codex children).

| need | Codex |
|---|---|
| spawn | a collaboration child in this thread; repeat the persona's OWNED/FORBIDDEN paths, read-only limits, tools and hand-back in the prompt (Claude frontmatter is not enforced there) |
| message a running worker | none mid-run: brief it fully up front; a user turn interrupts every running child |
| worker → orchestrator | the child's final message; mid-run only the PR |
| status / stop | `wait` on ONE named child with a timeout (never an untargeted `wait`); the host's close/stop on that child |
| PR events | none: no subscription tool |
| timer | ONE Codex automation 50–55 min out, scoped to one PR; its prompt carries no grant (AGENTS.md §Concurrent PRs) |
| CI | ONE foreground `node tools/ci/ci-watch.mjs --sha <sha> --failures-only` (AGENTS.md rule 13); never poll `actions/*` or `check-runs` through the GitHub connector |

Children suit bounded evidence work (`deploy-research`) or one disjoint OWNED slice; merge authority stays with the
thread that owns the PR or the fleet's orchestrator (`.claude/rules/fleet-core.md`). Do not claim sibling-session
subscriptions, PR ownership or merge authority for a child.
