# Agent guards and tooling — 2026-10-14

Prose-only safety rules from the 2026-10-14 agent-config survey, turned into
hooks, settings and tests. Docs read this session:
https://code.claude.com/docs/en/hooks (PreToolUse output, MCP matchers,
`onFailure`, `agent_id`/`agent_type`), https://learn.chatgpt.com/docs/agent-configuration/agents-md
(Codex `project_doc_max_bytes`, 32 KiB default), https://docs.github.com/en/actions/reference/limits
(Pro: 40 concurrent jobs, 5 macOS).

## What the hooks docs say (and what that decided)
- PreToolUse decides through `hookSpecificOutput.permissionDecision`
  (`allow`/`deny`/`ask`/`defer`) plus `permissionDecisionReason`; exit 2 is a deny.
  `"ask"` forces a prompt even in auto mode. Deny/ask RULES still apply whatever
  a hook returns.
- A matcher with characters other than letters, digits, `_ - , |` is an
  unanchored JS regex, so MCP matchers are written `^mcp__github__(a|b)$`.
- `onFailure: "block"` exists (Claude Code >= 2.1.295; this box runs 2.1.299).
  Without it a hook that crashes, exits non-0/2, or times out lets the call
  through. Every PreToolUse guard now sets it.
- Hook input carries `agent_id` and `agent_type` when the call comes from a
  subagent, so the track-surveyor scope (below) is enforceable.

## Changes
1. *(Correction 2026-10-14, later the same day: `.claude/settings.json` does
   NOT deny `merge_pull_request`; it routes it through `github-mcp-guard.sh`,
   which asks — see the matcher on `enable_pr_auto_merge|merge_pull_request|update_pull_request`.)*
   `settings.json`: `deny` merge_pull_request, delete_file, create_repository,
   fork_repository; `ask` push_files, create_or_update_file (an MCP commit skips
   the commit hook). `github-mcp-guard.sh` asks before enable_pr_auto_merge and
   before update_pull_request with `draft: false`, naming ready-gate.mjs and
   ready-full-cap.mjs; other PR edits pass silently. The merge METHOD is not
   checked (PR #1458 owns that policy).
2. `bash-guard.sh`: docs-integrity and test:guards run under
   `timeout $APEX_GUARD_TIMEOUT` (default 160 s, hook timeout 180 s); rc 124/137
   exits 2 with a reason. A ratchet step plus a 160 s run that still outlives the
   hook is now blocked by `onFailure` instead of passing.
3. Subagent browser ban: every `tools/shot/*.mjs` except the node-VM
   frame-report / cam-corners / cam-motion, `tools/ui/{layout-audit,menu-mock,css-play}.mjs`
   and `tools/gfx/gfx-probe.mjs` (each imports a Chromium launcher; checked by
   grep). `--help` / `--plan` stay open.
4. Fail-open paths print a WARNING on stderr (protect-files payload and
   shellparse failures, mcp-browser-guard payload failure) before exit 0.
5. Push guard: `shellparse.py push` reads every `git … push` shape (`-C`,
   `--no-pager`, `-c k=v`, `bash -c`, env prefixes, compound commands) and
   refuses force (`-f`, `--force`, `--force-with-lease`, `+refspec`), `--mirror`,
   `--delete`/`-d`/`:dst`, `--all`, and any push whose destination is
   `claude/f1-game-project-26h3ng` — named, `HEAD:` on it, or a bare push from
   it. Untokenisable text that looks like a push is refused. The settings deny
   globs stay as a second layer.
6. track-surveyor (`agent_type`) writes only `js/circuits/<id>.js`,
   `js/circuits/scenery/<id>.js`, `scratch/`, `artifacts/`; any id, because the
   assigned circuit lives in the parent's brief, which a hook cannot read.
7. Agents: ci-red-triage gets the GitHub MCP read tools its body names (test:
   every `mcp__` name in a body is in `tools:`, except a paragraph of "calls for
   the PARENT"); bloat-auditor loses WebFetch/WebSearch and moves to sonnet.
8. Budgets in agent-config.test.mjs. MEASURED TODAY: AGENTS.md is 30,114 B and
   root + js/track is 32,552 B (with joiners), so the planned 30,000 / 32,256 caps
   would be red. Caps sit at 30,200 and 32,768 (Codex's own cap); lower them
   when the AGENTS.md trim lands. Skill descriptions: 11,986 chars, cap 12,000,
   each <= 1,024. Five new routing-query files (5 should-fire + 3 near-miss).
9. pick-tests routes css/{carsetup,tokens,select}.css to `baseline`;
   cloudflared downloads to scratch/browser-http/; capacity comments say 40/5.

## Not done
- Hook tests for stop-guard / post-edit / session-start (survey A10).
- No Cursor/Codex hook adapter: these guards are Claude Code only.
