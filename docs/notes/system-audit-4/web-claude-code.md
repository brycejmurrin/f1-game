# web-claude-code (pass 4) — claude-code-guide agent, read-only; saved by main

slice: harness-docs (web research on the Claude Code harness), pass 4. I checked each of pass 3's eight harness claims against the current official docs and quote the docs below.
inputs: code.claude.com/docs pages fetched today (permission-modes, auto-mode-config, sub-agents, hooks, prompt-caching, headless, cli-reference, skills, memory, worktrees, tools-reference, scheduled-tasks, routines, claude-code-on-the-web), plus a Cursor docs and forum search. Repo files read: .claude/settings.json, the agent cards, hooks, docs/notes/HARNESS-SETTINGS-2026-10-26.md, docs/notes/system-audit-3/agents-hooks.md.
ran: WebFetch, WebSearch, Read and Grep only. I ran no commands and edited no tracked file.

## Pass 3's claims, checked against the docs
1. **Auto mode: QUALIFIED.** https://code.claude.com/docs/en/permission-modes says: "On entering auto mode, broad allow rules that grant arbitrary code execution are dropped: Blanket `Bash(*)` … Wildcarded interpreters like `Bash(python*)` … Package-manager run commands … `Agent` allow rules … `Monitor` allow rules". It also says "Narrow rules like `Bash(npm test)` stay in effect."
   - The page does not name `node -e *` or say outright that dropped rules go to the classifier. "Everything else goes to the classifier" implies it.
   - `autoMode.allow` is not a permission pattern. https://code.claude.com/docs/en/auto-mode-config says: "Each is an array of prose descriptions, read as natural-language rules". Allow entries are exceptions to `soft_deny`. Without `"$defaults"` an entry replaces the built-in list.
   - The same page says: "The classifier doesn't read `autoMode` from project settings in `.claude/settings.json` or `.claude/settings.local.json`." It reads only `~/.claude/settings.json`, managed settings, or `--settings`.
   - Also on that page: "The classifier reads the same CLAUDE.md content Claude itself loads". So AGENTS.md, which CLAUDE.md imports, steers the classifier too.
2. **Subagent frontmatter: CONFIRMED with corrections.** https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields
   - Fields that exist: name, description, tools, disallowedTools, model, permissionMode, maxTurns, autoCompactWindow, skills, mcpServers, hooks, memory, background, omitClaudeMd (v2.1.271+), effort, isolation (`worktree`), color, initialPrompt, experimental.cacheTtl.
   - Not fields: `readonly`, `skillOverrides`, `deniedMcpServers`, `worktree`. There is no time limit field (`maxTurns` counts turns).
   - The doc says "Claude Code ignores unrecognized fields without reporting an error."
   - `readonly` and `is_background` are Cursor fields (https://cursor.com/docs/context/subagents, and a forum thread at https://forum.cursor.com/t/readonly-true-is-not-applied-to-plugin-shipped-subagents-works-in-cursor-agents/173787).
3. **Hooks: CONFIRMED.** https://code.claude.com/docs/en/hooks
   - Subagent tool calls carry `agent_id` and `agent_type`. `agent_type` is also "Present when the session uses `--agent`".
   - There are 33 events, including SubagentStart/SubagentStop, PostToolBatch, PreCompact/PostCompact and PermissionDenied.
   - SessionStart sources are `startup`, `resume`, `clear`, `compact` and `fork`.
   - Exit codes: exit 2 blocks; any other non-zero exit is a "non-blocking error… The action goes ahead". JSON uses `permissionDecision` allow/deny/ask/defer, with precedence deny > defer > ask > allow. Stop and SubagentStop use `decision:"block"`.
   - Failure fails open: "On most events, when a hook fails or times out, Claude Code still carries out the action". `"onFailure":"block"` (v2.1.295+) flips that, but it "has no effect on Stop, SubagentStop…".
   - `async:true` exists: "Async hooks can't block". `asyncRewake` "wakes Claude on exit code 2". Default timeout is 600 s for command hooks.
4. **Prompt cache: CONFIRMED.** https://code.claude.com/docs/en/prompt-caching
   - TTL: the main conversation gets 1 h "only on a Claude subscription within your plan's included usage"; once usage credits apply it drops to 5 m. Subagents, forks' bucket and compaction get 5 m.
   - A 20-minute gap therefore costs nothing for the main thread within plan, and a full re-write for subagents or once on credits.
   - Cache breakers: model switch, effort change (not on Opus/Sonnet 5.5), fast mode, a tool-definition change, compaction, an upgrade, and denying a whole tool.
   - What does not break it: with tool search, an MCP connect, disconnect or reconnect ("keeps the tool list from the conversation's first request"). A reconnect can add `WaitForMcpServers` once. CLAUDE.md edits and skills also leave it intact.
5. **`claude -p` flags: CONFIRMED.** https://code.claude.com/docs/en/cli-reference and https://code.claude.com/docs/en/headless
   - `--strict-mcp-config` means "Only use MCP servers from `--mcp-config`, ignoring all other MCP configurations".
   - `--bare` skips hooks, skills, agents, plugins, MCP, CLAUDE.md and memory. It needs `ANTHROPIC_API_KEY` ("never reads OAuth credentials").
   - `stream-json`: "The last line of the stream is a `result` message with the final response text, cost". `json` output has `total_cost_usd`.
6. **Cloud sessions: PARTLY UNDOCUMENTED.**
   - `send_later` and `list_sessions` are tools of the claude-code-remote server, and I found no public doc for them.
   - Documented minimum intervals: cloud scheduled tasks reject cron "more often than once per hour" (https://code.claude.com/docs/en/routines). `/loop` and CronCreate go down to 1 min, with up to 50 tasks and 7-day expiry. One-shot tasks set for :00 or :30 fire up to 90 s early (https://code.claude.com/docs/en/scheduled-tasks).
   - When a cloud environment expires, "Session-scoped scheduled tasks … don't carry over" (https://code.claude.com/docs/en/claude-code-on-the-web).
   - Whether a cloud session's result events carry cost: undocumented. Only `-p` documents it.
7. **Fork and nesting: CONFIRMED.**
   - "A fork … sees the same system prompt, tools, model, and message history … A fork can't spawn further forks."
   - Fork mode is on by default (v2.1.302); `Agent(fork)` in deny turns it off.
   - Nesting: "a subagent can spawn subagents of its own, up to three layers below the main conversation" (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`).
   - At most 20 subagents run at once.
   - Source: https://code.claude.com/docs/en/sub-agents
8. **Skills and rules: CONFIRMED.**
   - Skills: "combined `description` and `when_to_use` text is truncated at 1,536 characters". The listing budget is 1 % of the context window, and the least-used descriptions are dropped first. Skills also accept `paths:`. The body loads only on use. https://code.claude.com/docs/en/skills
   - Rules: "A path-scoped rule loads when Claude uses the Read, Write, or Edit tool on a matching file … or `cat`/`head` on a single file". Grep, Glob and `sed -i` don't trigger it. https://code.claude.com/docs/en/memory

## Clean (checked against the docs, fine)
- Every PreToolUse guard has `onFailure:"block"` (settings.json:240-291). This fixes the fail-open that HARNESS-SETTINGS:113 still describes.
- launch-gate.py fails open on purpose and documents it (launch-gate.py:15-17). The SubagentStop matcher filters on `agent_type`, as the doc specifies.
- `permissions.deny` for pushes to the deploy branch holds in auto mode ("Blocks before the classifier is consulted"). This matters because auto mode allows pushes "to any branch … including the default branch".
- AGENTS.md rule 4 says a Monitor runs 5 min by default, 30 max. The doc says the same: "5 minutes by default, at most 30 minutes" (tools-reference).
- Rule 13's 50–55 min timer stays inside the 1 h main TTL. The rules frontmatter uses `paths:`, not Cursor's `globs:`.
- protect-files.py resolves the target's git toplevel and common-dir (protect-files.py:272,393), so the doc's warning that "`${CLAUDE_PROJECT_DIR}` stays put" in worktrees does not bite.
- agent-config's 1,024-character description cap (SKILL.md:26) is stricter than Claude Code's 1,536. That is safe.
- The 5 cards marked omitClaudeMd agents still get path-scoped rules when they read files. The doc confirms this.

| id | finding | evidence | cost to Bryce | one-line fix | conf | status |
|---|---|---|---|---|---|---|
| D1 | `readonly: true` on 9 cards does nothing in Claude Code. It is silently ignored, as are `is_background` (code-hunter.md:7) and similar keys. Pass 3 already said "Cursor-only"; the docs now prove it. | sub-agents doc: "ignores unrecognized fields without reporting an error"; Cursor forum. Cards: code-hunter.md:6, deploy-research.md:7, finding-verifier.md:7, verify-agent.md:7, bloat-auditor.md:8, prior-art-scout.md:7, physics-contract-auditor.md:6, ci-red-triage.md:6 | Reporter agents can write, as in H1 | Add `disallowedTools: Write, Edit, NotebookEdit`. Bash writes still need H1's hook. | high | STILL OPEN (pass3 H1), adds evidence |
| D2 | Pass 3's fix for H2 ("move the needed npm/Monitor rules to `autoMode.allow`") cannot work. `autoMode` is ignored in project settings. Allow entries are prose exceptions to soft_deny, not patterns. Cloud sessions don't read `~/.claude/settings.json`. `/auto-mode-setup` "isn't available in this environment". | auto-mode-config: "doesn't read `autoMode` from project settings"; "Entries are prose, not regex or tool patterns"; claude-code-on-the-web | Classifier latency on every `npm run …`, `node -e` and Monitor call, with no repo-side lever | Call node scripts directly (`node tools/gen/…`), as pass 3 also offered. Ask Bryce about managed settings. Drop the dead `"Bash"`, `"Agent"`, `"Monitor"` and `node -e *` allows (settings.json:38,47,49,78). | high | REFUTES (pass3 H2 fix) |
| D3 | Narrow allow rules skip the classifier in auto mode, and several are wide in practice: `Bash(find *)` allows -delete/-exec, `Bash(git checkout *)` allows `-- .`, plus `Bash(node tools/shot/*)` and `Bash(git merge *)`. | auto-mode-config: "a narrow rule can still let a destructive argument through"; `classifyAllShell` lives at user scope only. settings.json:130,141,151 | One unreviewed destructive command | Narrow those rules (`find * -name *`, `git checkout -b *`) or remove them. | med | NEW |
| D4 | `agent_type` also appears in a main session started with `--agent` or the `agent` setting. bash-guard.sh:317 and mcp-browser-guard.sh:50 would then treat the main thread as a subagent and refuse its browser runs. bash-guard also matches any `/subagents/` text in the payload. | hooks doc, agent_type row; bash-guard.sh:317 | Latent: a lane launched with `--agent` loses browser runs. Not used today (grep shows no `--agent` in tools/ci). | Test `agent_id` only; it is tied to a subagent or teammate. Drop the `/subagents/` text match. | med | NEW |
| D5 | Stale doc quotes in hook comments. mcp-browser-guard.sh:11 quotes `agent_id` as "Present only when the hook fires inside a subagent call", which is not current wording. Line 21 says "the hooks docs promise no fail-open for a PreToolUse hook", but the docs say the opposite. | hooks doc §exit codes and §onFailure | Misleads the next editor | Re-quote the comments with today's date. | high | NEW |
| D6 | HARNESS-SETTINGS is stale. Line 113 says the guards fail open in the committed tree; the onFailure fix has landed. Line 168 sources `send_later` from a tool description, not a doc. The note never mentions D2 (autoMode is ignored from the project). | settings.json:240-291; auto-mode-config | Wrong guidance carried into the next pass | Update §Hooks, add an auto-mode §, mark `send_later` "tool schema, undocumented". | high | NEW |
| D7 | skill-routing-eval.py:110 runs one `claude -p` per query with every `.mcp.json` server and every hook. `--strict-mcp-config` would start none of the six. `--bare` is not an option: it drops skills and needs an API key. | cli-reference `--strict-mcp-config`; headless "-p … connects the servers in its `.mcp.json`" | 6 MCP server boots plus hook runs for each of N queries × runs × sides | Add `--strict-mcp-config` (without `--mcp-config`, which adds a 30-s wait). | med | NEW |
| D8 | AGENTS.md rule 10 says "Worktrees start at the session SHA (`worktree.baseRef: "head"`)". The doc says `"head"` = "your current local `HEAD`" at the moment of creation, not the session SHA. EnterWorktree and subagents share this base. | worktrees doc §Choose the base branch | A worker spawned after a local commit starts on the new commit. Usually that is wanted, but the rule text is wrong. | Say "the parent's current HEAD". | high | NEW |
| D9 | Fork mode is on by default. A fork inherits the parent's whole tool pool, including browser MCP tools and Agent, and skips subagent tool filters ("Forks skip both filters"). Agent cards and context-cap only reason about named subagents. | sub-agents §How forks differ | Forks bypass card scoping. The browser guard still fires because `agent_id` is present (unverified for forks). | Verify that `agent_id` appears in a fork's hook payload, or add `Agent(fork)` to deny. | low | NEW |
| D10 | SessionStart has no matcher (settings.json:221), so session-start.sh also runs on `compact`, `clear` and `fork`. That is harmless, since it is idempotent with a one-line stdout. HARNESS's suggested `compact` re-read of the live-state file was never wired. | hooks doc, SessionStart sources | Orchestrator state lost after compaction (PR / Plan) | Add a `"matcher":"compact"` entry that prints the live-state path. | low | NEW |

## What the repo says that the docs contradict
- docs/notes/system-audit-3/agents-hooks.md H2 fix ("move … to `autoMode.allow`"): see D2.
- HARNESS-SETTINGS:113 (fail-open), now fixed; see D6.
- mcp-browser-guard.sh:11 and :21: see D5.
- AGENTS.md rule 10 "session SHA": see D8.
- `readonly: true` / `is_background: true` on the cards: see D1.

## Not done
- `send_later` minimum interval, `list_sessions` paging, and whether cloud-session `result` events carry cost: no public doc exists. The claude-code-remote tool schemas are not visible to this subagent, so I could not test them.
- I did not exercise a fork's hook payload (D9) or `onFailure` in a cloud session. I ran no commands.
- Hooks doc characters 140k–200k (the full SessionStart section) were only partly read. The `fork` matcher row was cut off in the fetch.

