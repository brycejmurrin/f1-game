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
rule / user_permanent. #2124 shipped `mcp__<server>__*` for every live server
in the PROJECT file on that evidence, and it did not hold: at 10:21Z, with
those lines in `.claude/settings.json` on disk since 10:00Z,
`mcp__chrome-devtools__list_pages` and `mcp__playwright-official__browser_tabs`
both prompted (accept, no reason, user_temporary) in the same session. The
`user_permanent` source marks the local settings file, which these servers
honour; the project file's rules for the `.mcp.json` stdio servers did not
match. Not yet known: whether a session that STARTS on a tip carrying the
wildcards behaves differently (this one switched branches mid-session).
Until that is measured, approve these three servers once per session with
"don't ask again".

Rounds 3 and 4, auto mode off so prompts were real: MDN and BrowserStack still
prompted with `mcp__MDN__search`, `mcp__mcp_browserstack_com__*`, the connector
UUIDs (`mcp__300390ff-…`, `mcp__b9469654-…`), `mcp__claude_ai_MDN`,
`mcp__mdn`, `mcp__BrowserStack`, `mcp__browserstack` and
`mcp__mcp.browserstack.com` all present, while TinyFish matched by rule in the
same turn. No repo rule shape pre-approves those two connectors.

## What no repo setting changes

- The repo's own `.mcp.json` servers (apex-tools, chrome-devtools,
  playwright-official): the repository cannot approve servers it defines.
  Run in auto mode, or approve once per session.
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

## Census on 76637056 (after #2127), two AUTO siblings with the repo attached

session_01XtWKWEvzEhT3Ua76VxDi22 (MCP servers and connectors, ~70 calls) and
session_01Xgk7GqMWpKmaXoWkYuC2j9 (worker loop, 27 calls), both launched with
`source_url` and `permission_mode: "auto"` from an auto parent. Totals: 0
prompted, 0 rejected.

| path | tools |
|---|---|
| rule / config | github (8 tools), claude-code-remote reads, Context7, Claude_Docs, TinyFish (4 of 5 tools), Read, Glob, Grep, WebSearch, WebFetch, ToolSearch, Skill |
| classifier | apex-tools (7 tools), chrome-devtools (3), playwright-official (3), MDN, BrowserStack, TinyFish `list_monitors`, `send_message`, Bash (incl. worktree add and commit), Agent (Explore, worker), SubagentHandback |
| built-in, no rule needed | TaskCreate/Update/List/Get, EnterWorktree, ExitWorktree, ListAgents, ReadNotifications, CronList, ListConnectors, ListSkills, ListPlugins |

- **The `.mcp.json` servers never match a repo rule**, bare or `__*`, in a
  session that starts on a tip carrying both. The permissions doc's trust
  table: for servers in `.mcp.json`, "the repository's own approvals don't
  count". So #2124's wildcard lines are inert for them; in auto mode the
  classifier approves their read calls, and in default mode they prompt.
- The `rule` matches split by TOOL inside one server (TinyFish 4 of 5,
  claude-code-remote reads vs `send_message`), so the matching list is not
  only the repo's server-level entries. Unverified where the rest comes from.
- #2127 holds: a `git worktree add` tree and a `worker` subagent's isolation
  worktree both committed (d267ce5, 94586b0, never pushed); the commit hook
  linked the main checkout's `node_modules` in.
- Messaging: sibling-to-sibling `send_message` delivered both ways in ~20 s.
  A worker refused the peer-ping step when the grant arrived relayed through
  the orchestrator, and sent it once the user said so in its own session.
- In auto mode `APEX_PUSH_HOLD=0 git push` is rejected by the classifier as
  `[Safety Bypass Flag]` (Merge Desk session_01KbZH5rhh9vEnwbU2w5DLUG, 10:31Z).
- A parent in `default` mode cannot create an auto child: `create_session`
  refuses with "permission_mode 'auto' requires the parent session to be in
  auto mode".

## Spawning siblings (same day)

`create_session` without `source_url` makes an EMPTY session tagged
`config:no-git-repo`; the child reads its launch prompt as a task notification
and does only read-only work until the user types into it; a requested
`permission_mode` is not always the one granted. Details and the fix:
`.claude/skills/agent-fleet/references/orchestrator.md` §Authority.

Sources: <https://code.claude.com/docs/en/permissions>,
<https://code.claude.com/docs/en/permission-modes>; issue #2125 (bash-guard
`pkill -f` gap found by the same census).

## Blocker census, 15:35Z (34 sessions, ~3,800 events)

Every `reject` and every human prompt in the orchestrator
(session_01QTnGarENnxSWFxr7iFjub6), the Merge Desks (…yAYoWr, …w5DLUG) and the
29 lanes and workers they launched, read from `list_events`
`tool_result_meta[].permission_decision` plus the hook texts in the results.
Long sessions were paged back about 30 minutes only, so blocks from earlier in
the day are missing (the classifier rows below come from the orchestrator's
own log).

| tool or command | what blocked it | count | verdict |
|---|---|---|---|
| `git add X && git commit` in ONE command | bash-guard unstaged rule: the hook runs before the `git add`, so X reads as unstaged | 7 | false positive: hook fix (diff 2) |
| `create_session` with `permission_mode: "auto"` | platform: "requires the parent session to be in auto mode" (parent in plan or default) | 9 | platform, Needs Bryce |
| `send_message` / `send_later` / `create_session` | human prompt (`user_temporary`) with `mcp__claude-code-remote` allowed | 16 | platform confirmation, Needs Bryce |
| `sleep N; cat log` | the built-in sleep guard | 3 | intended: use `run_in_background` or `Monitor` |
| `git commit` over a tree or topLets ratchet, or with red guards | bash-guard | 3 | intended: ratchets and guards are the gate |
| `git checkout --theirs … tests/data/ratchets.json` while resolving a conflict | protect-files generated-file rule (shellparse kind `git-checkout`) | 2 | false positive: hook fix (diff 1) |
| `git worktree add` | classifier gave no verdict | 1 | transient: retry once |
| Bash writes to `.claude/settings.local.json`, edits to `.claude/hooks/*` | classifier `[Self-Modification]` | orchestrator log | protected path, Needs Bryce |
| `APEX_PUSH_HOLD=0 git push` | classifier `[Safety Bypass Flag]` | orchestrator log | Needs Bryce, or wait for the gauge |
| `APEX_RUN_CANCEL_OK=1 gh run cancel` | classifier `[Interfere With Workloads]` | orchestrator log | intended (never cancel); Needs Bryce if wanted |
| `mcp__MDN__*`, `mcp__mcp_browserstack_com__*` | claude.ai connector set to `ask` | earlier rounds | Needs Bryce |

There were no `github-mcp-guard` or `mcp-browser-guard` hits:
`APEX_MERGE_DESK=1` in `.claude/settings.json` `env` lets merge, arm,
ready and re-run through.

### Why the repo cannot fix the classifier rows

- The auto-mode classifier reads `autoMode` (`allow`, `soft_deny`,
  `environment`) only from `~/.claude/settings.json`, managed settings or the
  `--settings` flag. It never reads it from `.claude/settings.json` or
  `.claude/settings.local.json`: "a checked-in repo or a build step could
  otherwise inject its own allow rules"
  (<https://code.claude.com/docs/en/auto-mode-config>).
- Writes to protected paths (`.claude/`, including the hooks and settings
  files) are "never auto-approved": in auto mode they go to the classifier, and
  `permissions.allow` rules do not pre-approve them
  (<https://code.claude.com/docs/en/permission-modes#protected-paths>). The
  classifier also refused a hook edit made on a scratchpad copy. A hook change
  therefore needs a session in default mode with a human approving the edit.
- A cloud session's permission mode is set by the surface that started it.
  Cloud sessions ignore `defaultMode` `bypassPermissions` and `dontAsk` in a
  settings file.

### The two hook fixes (applied in this session after Bryce switched it to default mode)

1. protect-files / shellparse: `git checkout|restore` with `--ours`,
   `--theirs`, `--merge` or `-m`, or a source of MERGE_HEAD or the deploy
   branch, is kind `git-resolve`. That kind skips the generated-file and
   shared-contract rules. The live-run and scoped-agent rules still apply.
   Any other ref, HEAD included, stays blocked: R4-SUPPLY-4 pins
   `git checkout HEAD js/roster.js`.
2. bash-guard: a `git add` earlier in the same command counts as staged for the
   unstaged rule and the docs-only set. `git add -A`, `-u` and `.` read like
   `commit -a`.
