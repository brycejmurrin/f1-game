# MCP allow rules in cloud sessions, measured (2026-10-15)

What `.claude/settings.json` `permissions.allow` entries actually pre-approve
in a claude.ai cloud session, how to measure it, and what no repo setting can
change. Evidence for AGENTS.md §Agent extensions, skill `agent-fleet`
(`references/orchestrator.md` §Authority) and PRs #2119, #2122, #2124.

## How to measure (the only evidence that counts)

Every tool result in a session's transcript carries a permission verdict.
`mcp__claude-code-remote__list_events` on the session (kinds `user`,
`assistant`) returns user events whose `tool_result_meta[]` holds
`permission_decision`:

| `decision` | `reason_type` | `source` | meaning |
|---|---|---|---|
| accept | rule | config | an allow rule in a settings file matched |
| accept | rule | user_permanent / user_temporary | a rule the user added in-session ("don't ask again") matched |
| accept | classifier | config | no rule matched; the auto-mode classifier approved |
| accept | (none) | user_temporary | a human prompt was shown and approved |
| reject | hook / classifier | … | a PreToolUse hook or the classifier blocked it |

Map `tool_use` ids to names from the assistant events. A sibling session
launched for a "proof" proves nothing by "no prompt seen": it is usually in
auto mode (session_01SXxK5vqYug9CNUoy5gn5kK, 2026-10-15), where the classifier
hides every miss.

## What matched on the deploy tip (abb1acd, before #2124)

Probe session session_01QTnGarENnxSWFxr7iFjub6; one read-only call per server.

| tool called | allow entry present | verdict |
|---|---|---|
| `mcp__TinyFish__get_wallet` | `mcp__TinyFish` | rule / config |
| `mcp__Context7__resolve-library-id` | `mcp__Context7` | rule / config |
| `mcp__Claude_Docs__guide` | `mcp__Claude_Docs` | rule / config |
| `mcp__github__get_me`, `mcp__claude-code-remote__*` | `mcp__github`, `mcp__claude-code-remote` | rule / config |
| `mcp__apex-tools__apex_status` | `mcp__apex-tools` | classifier (no match) |
| `mcp__chrome-devtools__list_pages` | `mcp__chrome-devtools` | classifier (no match) |
| `mcp__playwright-official__browser_tabs` | `mcp__playwright-official` | prompt in the sibling (no match) |
| `mcp__MDN__search` | `mcp__MDN` | classifier (no match) |
| `mcp__mcp_browserstack_com__listProducts` | `mcp__mcp_browserstack_com` | classifier (no match) |

Round 2, the same calls with `mcp__apex-tools__*` and
`mcp__chrome-devtools__list_pages` added in an untracked
`.claude/settings.local.json` (the file reloads live): both became
rule / user_permanent. That is the fix #2124 shipped as `mcp__<server>__*`
for every live server (bare names kept).

Rounds 3 and 4, auto mode off so prompts were real: MDN and BrowserStack still
prompted with `mcp__MDN__search`, `mcp__mcp_browserstack_com__*`, the connector
UUIDs (`mcp__300390ff-…`, `mcp__b9469654-…`), `mcp__claude_ai_MDN`,
`mcp__mdn`, `mcp__BrowserStack`, `mcp__browserstack` and
`mcp__mcp.browserstack.com` all present, while TinyFish matched by rule in the
same turn. No repo rule shape pre-approves those two connectors.

## What no repo setting changes

- MDN and BrowserStack: the permissions doc says a claude.ai connector tool
  set to `ask` overrides allow rules; the fix is the per-connector tool
  permission at <https://claude.ai/customize/connectors>.
- Edits to `.claude/settings.json` itself: a protected path; `Edit` on it
  prompted in a default-mode session with `Edit` allowed.
- `create_session`, `update_trigger`, `delete_trigger`: prompted in default
  mode with `mcp__claude-code-remote` allowed (platform confirmation); the
  auto-mode classifier rejected a `delete_trigger` as well.
- Merge, draft→ready and `actions_run_trigger`: `github-mcp-guard.sh` asks by
  design.
- In auto mode the classifier drops broad rules on entry (`Bash(*)`, `Agent`,
  `Monitor`) and reviews every `SendMessage` / `send_message` body.

## Connector names

Fresh cloud sessions can expose the five claude.ai connectors under their
installed-server UUIDs (`mcp__813042a4-…` TinyFish, `e4d9838f-…` Context7,
`1a59c906-…` Claude_Docs, `300390ff-…` MDN, `b9469654-…` BrowserStack) for the
first minutes, then under their names; one sibling saw MDN under its UUID for
25 min. The UUIDs are the `installedServerId` values `ListConnectors` prints.
A UUID-prefixed TinyFish call matched the `mcp__TinyFish` name rule, so the
rule key is the connector, not the prefix string.

## Census on 3079670f (after #2124), two default-mode siblings

session_01PgViuYNygpmfLbD3B6nHWp and session_01ELD8NjQFkdHs3t2sxQkf2V, both
`permission_mode: default`, so every verdict below is a real prompt or a real
rule match. Neither session had the repository attached, so the `.mcp.json`
servers (apex-tools, chrome-devtools, playwright-official) and the github MCP
were absent and the `mcp__<server>__*` lines were not exercised there.

| tool | verdict |
|---|---|
| TinyFish, Context7, Claude_Docs, claude-code-remote reads, Bash git, Read, WebFetch, WebSearch, Agent, ToolSearch | rule / config |
| TaskCreate, TaskUpdate, TaskGet, TaskList, EnterWorktree, ExitWorktree, ListAgents, ReadNotifications | accept, no reason, source config: built-ins the harness allows without a rule |
| `mcp__MDN__search`, `mcp__mcp_browserstack_com__listProducts` | prompted (user_temporary), same as rounds 3–4 |
| `mcp__claude-code-remote__send_message`, `mcp__claude-code-remote__add_repo` | prompted (user_temporary) with `mcp__claude-code-remote` and `mcp__claude-code-remote__*` allowed: platform confirmations |
| `Skill agent-fleet` | "Unknown skill" in a session with no attached repo: skills load from the attached checkout only |

A throwaway worktree commit passed the commit hook there (the worktree had
no `node_modules` problem because the clone was fresh and whole).

## Spawning siblings (same day)

`create_session` without `source_url` makes an EMPTY session tagged
`config:no-git-repo`; the child reads its launch prompt as a task notification
and does only read-only work until the user types into it; a requested
`permission_mode` is not always the one granted. Details and the fix:
`.claude/skills/agent-fleet/references/orchestrator.md` §Authority.

Sources: <https://code.claude.com/docs/en/permissions>,
<https://code.claude.com/docs/en/permission-modes>; issue #2125 (bash-guard
`pkill -f` gap found by the same census).
