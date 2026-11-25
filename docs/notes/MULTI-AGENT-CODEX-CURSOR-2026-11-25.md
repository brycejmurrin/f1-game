# Multi-agent work on Codex and Cursor: what each can do, our gaps, a ranked plan (2026-11-25)

Kind: research · Re-measure-by: 2027-01-25

Bryce, 2026-11-25 ~01:45Z (Nov 24, 5:45 PM PT): "sometimes like this I run out of Claude tokens so I switch to codex
which its sessions can't directly communicate but they have subagents they can work with and grok with cursor cloud
agents, can we research how to make those better". Deploy tip read: `749dec6e`. Vendor facts come from two web
research subagents (official docs, read 2026-11-25). Repo facts were measured in this session with the command shown.
A vendor fact marked *unverified* was not found on an official page. The playbook that came out of this note is skill
`dispatcher` [`references/other-hosts.md`](../../.claude/skills/dispatcher/references/other-hosts.md).

## 1. What each host can do today

| Capability | Claude Code cloud (today's flow) | OpenAI Codex (CLI, app, cloud) | Cursor (IDE agent, cloud agents) |
|---|---|---|---|
| Subagents | `.claude/agents/*.md`, Agent tool, parallel, hooks see `agent_id` | custom agents `.codex/agents/<name>.toml` (`name`, `description`, `developer_instructions`, optional `model`); built-ins `default`/`worker`/`explorer`; `[agents] max_concurrent_threads_per_session`; spawned when asked in prose or by AGENTS.md/skill text; they inherit sandbox, approvals and MCP [C1] | reads `.cursor/agents/`, **`.claude/agents/`** and `.grok/agents/` (`.cursor` wins a name clash); keys `name`, `description`, `model`, `readonly`, `is_background`; parallel Task calls; one level of nesting; cloud subagents get the team MCP servers [U1] |
| Parallel tasks | `create_session` siblings | cloud tasks, each in its own workspace, several from one environment [C2]; no best-of-N found | `/best-of-n <models> <task>` across worktrees (IDE); many cloud agents [U1] |
| Start or message another session | `create_session`, `send_message` | **no cross-session messaging**; `codex exec resume <id>`, SDK `run()` on a thread, app-server JSON-RPC drive threads on the same machine [C3]; `codex mcp-server` was removed [C3]; an `@codex <task>` PR comment starts a cloud task (from search snippets, *unverified* in full) [C4] | REST `POST /v1/agents` (launch), `POST /v1/agents/{id}/runs` (follow-up, no `model` field), cancel, archive, delete [U2]; `@cursor` on a PR or issue starts an agent [U3]; nothing documented for one agent to call another (only by holding an API key) |
| GitHub writes | GitHub MCP as the Claude App (`performed_via_github_app.slug = claude`) | the ChatGPT connector: on #6334 Codex's `lane:codex` label reads `chatgpt-codex-connector` (measured: `gh api repos/…/issues/6334/events`) | pushes its own branch, `autoCreatePR` [U3]; labels and comments: none (`references/vendors.md`: the Cursor token does not label or comment) |
| Wait for CI | `subscribe_pr_activity` wakes the session | no PR subscription; **scheduled tasks**: a thread task returns to the same chat at minute intervals (local ones need the desktop app running) [C5] | `subscribe_github_ci` / `subscribe_github_pr` inside a cloud agent (`references/vendors.md`); **Automations** on cron, Slack or webhook triggers [U4] |
| Hooks | every tool call, with `agent_id` for a subagent | `PreToolUse`/`PostToolUse` (matcher on tool name; `apply_patch` also matches `Edit`/`Write`), `SessionStart`, `SubagentStart`/`SubagentStop` (matcher on `agent_type`), `Stop`, `PreCompact`; project hooks must be trusted with `/hooks`, a changed hash is skipped until re-trusted; repo hooks in Codex **cloud**: not documented, treat as absent [C6] | `beforeShellExecution`, `preToolUse`, `subagentStart`/`subagentStop`, `stop`, `afterFileEdit` run in cloud agents; `sessionStart` and the MCP hooks (`beforeMCPExecution`) do **not** run in cloud agents; user-level hooks do not load there [U5] |
| Instructions | `CLAUDE.md` imports AGENTS.md | AGENTS.md root→cwd, 32 KiB `project_doc_max_bytes`, `AGENTS.override.md` first [C7] | `.cursor/rules/*.mdc` (`apex-shared.mdc` points at AGENTS.md) |
| Skills | `.claude/skills` | `.agents/skills` (symlinks followed); the skill list gets ~2% of context, 8,000 characters when the window is unknown [C8] | `.cursor/skills`, `.agents/skills`, **`.claude/skills`**, `.codex/skills` [U6] |
| Models and context | per session | GPT-6.x family, 272k–500k default, 1M via `model_context_window` [C9] (one source, *not cross-checked*) | Composer 2.5, Grok 4.5–4.7 (a 500k variant, input above 256k at 2x); exact slugs only from `GET /v1/models`; `grok_` keys get 403 on the agents API [U7] |

## 2. Gaps against our Claude flow

1. **No orchestrator playbook off Claude.** `references/orchestrator-brief.md` assumes `create_session`,
   `send_message` and `list_sessions`. Codex and Cursor have none of the three, so a Codex orchestrator has nothing to
   follow once Bryce runs out of Claude tokens. The bus has to be GitHub: the issue or PR comment as the brief, the
   Hand-off block as the state, labels as the signals. PR #6334 already showed the hand-back works: a Codex lane
   wrote the Hand-off block, then a Claude session adopted the PR and landed it.
2. **No copy-paste worker brief for a host that cannot be addressed.** The worker brief carries a "message me when"
   line that no Codex or Cursor worker can act on.
3. **Watching CI on Codex is undocumented.** `references/host-watch.md` covers a refused subscription. It does not
   cover Codex's thread scheduled task, which is the closest equivalent.
4. **Subagent rules hold in Claude Code only** (`.claude/rules/claude-config.md`). Codex and Cursor now both fire
   `SubagentStart`/`SubagentStop`, but our adapters register neither. The per-call payloads still carry no subagent
   id. So nothing stops a Codex or Cursor subagent from starting a browser (rules 5, 10).
5. **Read-only reviewer cards are not read-only in Cursor.** Cursor reads `.claude/agents/` but enforces read-only
   only through its own `readonly: true`. `tests/unit/agent-surface.test.mjs:277` refuses that key as "undocumented
   or retired". cursor.com/docs/subagents (read today) documents it as current.
6. **No Codex custom agents.** `.codex/agents/*.toml` does not exist. A Codex orchestrator gets only the generic
   `worker`/`explorer` and none of `finding-verifier`, `ci-red-triage` or `pr-reviewer`.
7. **Codex and Cursor writes have no provenance class.** `byAgent` (`tools/ci/lib/provenance.mjs:48`) knows only the
   `claude` app slug. A `config-ok` or `ratchet-raise` that a Codex lane adds through `chatgpt-codex-connector` is
   neither Bryce's nor an agent's, so the gate ignores it. That is the safe direction, but no doc says so.
8. **`ready_for_review` events carry no app (measured).** On #6420, #6377 and #6335 the flip event shows
   `performed_via_github_app: null`, even where an agent flipped. On #6420 the `claude`-app labels `lane:claude`
   (01:19:13Z) and `land` (01:19:21Z) bracket the flip at 01:19:15Z. Skill `steward` §Land 1 treated a no-app
   `ready_for_review` as "Bryce's own flip", which would let an agent's flip skip the reviewer. **Fixed in the PR that added this note**:
   only a `labeled land` event counts. That rule is prose only: no gate reads it, and no test pins it.
9. **Skill-list size on Codex.** The 39 descriptions plus names come to about 10.8k characters. That exceeds Codex's
   8,000-character fallback for an unknown context window. Known windows (2% of 272k) fit.
10. **Launching across hosts is decided "no".** The agent-surface reset (`docs/plans/2026-11-03-agent-surface-reset.md`
    §4.8, `docs/AGENT-SURFACE.md` §Per vendor) says no agent session starts, messages, steers or deletes another
    agent through Bryce's personal Cursor, Codex or Claude login. `@codex` and `@cursor` comments posted through his
    GitHub login fall under the same rule. So a Claude orchestrator cannot hand overflow work to Codex or Cursor by
    itself today. That choice is Bryce's (§4).

## 3. Ranked plan

| # | Item | Risk / path | State |
|---|---|---|---|
| 1 | Playbook for a Codex or Cursor orchestrator: GitHub as the bus, one brief per issue comment, Bryce launches, Hand-off adoption | docs only | **done** (`dispatcher/references/other-hosts.md`) |
| 2 | Copy-paste worker brief with no "message me" line: ask by `needs-decision`, report by the Hand-off block | docs only | **done** (same file) |
| 3 | Fix the `ready_for_review` provenance hole in steward §Land 1 | skill text | **done** |
| 4 | Codex and Cursor rows in `host-watch.md`: Codex thread scheduled task as the one ≤ 50 min check-in, else `ci-watch.mjs`; Cursor `subscribe_github_ci` / Automations | docs only | **done** |
| 5 | Refresh `steward/references/vendors.md` with today's Codex and Cursor facts: subagents, hooks, the `chatgpt-codex-connector` writer, `config-ok` that does not count | docs only | **done** |
| 6 | Bryce: may the Claude orchestrator start overflow work on Codex or Cursor by an `@codex` / `@cursor` PR comment, or by `cursor-agents.mjs launch`? This reverses §4.8 | decision | **asked** (`needs-decision` on the PR that added this note) |
| 7 | Subagent marker hooks: register `SubagentStart`/`SubagentStop` in `.codex/hooks.json` and `.cursor/hooks.json` to set and clear a per-session marker that `shell-guard.sh` reads, so the browser and guard-file bans hold for subagents there. Parallel or background subagents make the marker racy, so it is a seatbelt | PROTECTED (`\.codex/hooks`, `\.cursor/hooks`) | proposal: Bryce's `config-ok` |
| 8 | Allow `readonly: true` on the read-only cards (`finding-verifier`, `surface-reviewer`, `pr-reviewer`, `ci-red-triage`, `prior-art-scout`, `code-hunter`, `verify-agent`), and drop the key from the refusal at `agent-surface.test.mjs:277` | routine CONFIG (agent cards) plus a test | proposal: next PR, orchestrator `config-ok` |
| 9 | Generate `.codex/agents/<name>.toml` from `.claude/agents/*.md` (`developer_instructions` = the card body, `model` mapped) with a lockstep test, the same way `npm run gen` makes `.cursor/rules` | generated plus a test | proposal |
| 10 | Teach `provenance.mjs` the `chatgpt-codex-connector` slug (and Cursor's, once measured) as `byAgent`, so a Codex orchestrator may add routine `config-ok` the way a Claude one does | PROTECTED (`tools/ci/lib/provenance.mjs`) | proposal: Bryce |
| 11 | Trim skill descriptions under 8,000 characters in total, or set `skills.max_context_tokens` in `.codex/config.toml` | budget test | proposal; low value while the window is known |

## 4. The decision (item 6)

Options, for one `decision:` comment on the PR:
- **A: keep §4.8** (my pick). Bryce starts every Codex or Cursor session himself, with the brief from
  `other-hosts.md` pasted in or posted as an issue comment. Agents hand off only through the Hand-off block. Zero
  new risk.
- **B: `@codex` / `@cursor` comments only.** The Claude orchestrator may post one launch comment per issue, carrying
  the brief. This needs a `bash-guard`/`github-mcp-guard` row that limits it to the orchestrator role.
- **C: B plus `cursor-agents.mjs launch` from the orchestrator.** This uses the launched-id allow-list that already
  exists. It needs `CURSOR_API_KEY` on the orchestrator environment, and it reopens the write verbs that §4.8 closed.

## Sources (read 2026-11-25)

- [C1] https://learn.chatgpt.com/docs/agent-configuration/subagents (developers.openai.com/codex/* 308-redirects here)
- [C2] https://learn.chatgpt.com/docs/cloud
- [C3] https://learn.chatgpt.com/docs/non-interactive-mode · https://learn.chatgpt.com/docs/codex-sdk · https://learn.chatgpt.com/docs/app-server
- [C4] https://developers.openai.com/codex/integrations/github.md (search snippet) · https://learn.chatgpt.com/docs/third-party/github
- [C5] https://learn.chatgpt.com/docs/automations.md?surface=app
- [C6] https://learn.chatgpt.com/docs/hooks
- [C7] https://learn.chatgpt.com/docs/agent-configuration/agents-md
- [C8] https://learn.chatgpt.com/docs/build-skills
- [C9] https://learn.chatgpt.com/docs/models
- [U1] https://cursor.com/docs/subagents · https://cursor.com/docs/configuration/worktrees
- [U2] https://cursor.com/docs/cloud-agent/api/endpoints · https://cursor.com/docs/cloud-agent/api/webhooks (v1 webhooks "coming soon"; v0 `statusChange`)
- [U3] https://cursor.com/docs/cloud-agent
- [U4] https://cursor.com/docs/cloud-agent/automations (search result, not read in full)
- [U5] https://cursor.com/docs/hooks
- [U6] https://cursor.com/docs/skills
- [U7] https://cursor.com/docs/models · https://cursor.com/docs/cloud-agent/api/overview
- Repo, measured here: `gh api repos/brycejmurrin/f1-game/issues/{6334,6335,6377,6420}/events` (actor, app slug,
  times); the 10.8k-character description total from the 39 `SKILL.md` frontmatters.
