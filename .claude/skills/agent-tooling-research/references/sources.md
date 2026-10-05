# Source registry — agent tooling

Fetched **2026-10-05** by four read-only research subagents using `WebFetch`.
**How read:** `raw` = page text came back near-verbatim; `sum` = a small-model
summary of the page; `idx` = listed in an index and not opened (treat as a
lead). Re-fetch any row older than ~90 days (before 2027-01-03) before relying
on it. Every host publishes an `llms.txt`; start there.

## Claude Code / Agent SDK / Claude API
| What | URL | Read |
|---|---|---|
| Docs map (220+ pages) | https://code.claude.com/docs/en/claude_code_docs_map.md | sum |
| Machine-readable index | https://code.claude.com/docs/llms.txt | sum |
| API docs index | https://platform.claude.com/llms.txt | sum |
| Claude Tag (Slack) index | https://claude.com/docs/llms.txt | sum |
| Skills, SKILL.md frontmatter | https://code.claude.com/docs/en/skills.md | sum |
| Subagents | https://code.claude.com/docs/en/sub-agents.md | sum |
| Hooks | https://code.claude.com/docs/en/hooks-guide.md | sum |
| Memory, CLAUDE.md | https://code.claude.com/docs/en/memory.md | sum |
| Settings reference (limits, defaults) | https://code.claude.com/docs/en/settings-reference.md | sum |
| MCP in Claude Code | https://code.claude.com/docs/en/mcp.md | sum |
| Agent teams | https://code.claude.com/docs/en/agent-teams.md | sum |
| Cross-session messaging | https://code.claude.com/docs/en/cross-session-messaging.md | sum |
| Agent SDK overview | https://code.claude.com/docs/en/agent-sdk/overview.md | sum |
| Headless / `-p` | https://code.claude.com/docs/en/headless.md | sum |
| Changelog | https://code.claude.com/docs/en/changelog.md | sum |
| Plugins overview, marketplaces | .../plugins/overview.md, .../plugins/anthropic-marketplaces.md | idx |
| SDK changelogs | github.com/anthropics/claude-agent-sdk-{typescript,python}/blob/main/CHANGELOG.md | idx |

404 on 2026-10-05: `.../plugins/plugin-evals.md`, `platform.claude.com/docs/en/models/model-list.md`.
Current version: `claude --version` (docs do not state it).

## OpenAI Codex
Docs moved: `developers.openai.com/codex/*` answers **308** to `learn.chatgpt.com/docs/*`.
| What | URL | Read |
|---|---|---|
| Index | https://learn.chatgpt.com/docs/llms.txt | sum |
| AGENTS.md discovery, 32 KiB cap | https://learn.chatgpt.com/docs/agent-configuration/agents-md | sum |
| Skills (scan order, symlinks) | https://learn.chatgpt.com/docs/build-skills.md | sum |
| MCP in config.toml | https://learn.chatgpt.com/docs/extend/mcp.md | sum |
| Config precedence, project trust | https://learn.chatgpt.com/docs/config-file/config-basic.md | sum |
| Approvals, sandbox | https://learn.chatgpt.com/docs/agent-approvals-security.md | sum |
| Subagents (`.codex/agents/*.toml`) | https://learn.chatgpt.com/docs/agent-configuration/subagents.md | sum |
| Hooks | https://learn.chatgpt.com/docs/hooks.md | sum |
| Cloud environments | https://learn.chatgpt.com/docs/environments/cloud-environments.md | sum |
| Repo / releases | https://github.com/openai/codex , .../releases | sum |
Latest release seen: 0.162.0-alpha.14 (2026-10-05); no stable identified. Check `codex --version` (UNVERIFIED: not in the docs).

## Cursor
| What | URL | Read |
|---|---|---|
| Index (docs pages as `.md`) | https://cursor.com/llms.txt | sum |
| Rules (`.mdc`, 3 frontmatter fields) | https://cursor.com/docs/context/rules | sum |
| Skills (discovery paths) | https://cursor.com/docs/skills | sum |
| Subagents | https://cursor.com/docs/subagents | sum |
| MCP | https://cursor.com/docs/mcp | sum |
| Cloud agents, environment.json | https://cursor.com/docs/cloud-agent , .../cloud-agent/setup | sum |
| Hooks | https://cursor.com/docs/hooks | sum |
| CLI | https://cursor.com/docs/cli/overview | sum |
| Changelog (newest seen 2026-09-23) | https://cursor.com/changelog | sum |
`https://cursor.com/sitemap.xml` is NOT a docs sitemap; use llms.txt.

## Protocols and standards
| What | URL | Read |
|---|---|---|
| MCP spec, revision **2026-07-28** | https://modelcontextprotocol.io/specification/latest | raw |
| MCP changelog | .../specification/2026-07-28/changelog | raw |
| MCP docs index, SDK tiers | https://modelcontextprotocol.io/llms.txt , /docs/sdk | idx / sum |
| MCP registry | https://registry.modelcontextprotocol.io | sum |
| Agent Skills spec (SKILL.md) | https://agentskills.io/specification | raw |
| AGENTS.md | https://agents.md | sum |
| A2A | https://a2a-protocol.org/latest/ | sum |
| Agent Client Protocol | https://agentclientprotocol.com | sum |
`a2a-protocol.org/latest/whats_new_v1/` returned 404.

## Facts worth knowing (each from the pages above; re-fetch before depending)
- **MCP 2026-07-28** is stateless: no `initialize` handshake or `Mcp-Session-Id`;
  servers implement `server/discover`; HTTP+SSE, roots, sampling, logging and
  Dynamic Client Registration are deprecated. Prior revision: 2025-11-25.
- **Agent Skills:** `name` ≤ 64 chars, lowercase + single hyphens, must match
  the directory; `description` ≤ 1024; body under ~500 lines; `allowed-tools`
  still experimental. All 30 Apex skills pass (checked 2026-10-05).
- **Codex:** project `AGENTS.md` content stops at 32 KiB; `.codex/` config loads
  only in trusted projects; `.git`, `.agents`, `.codex` are read-only under
  workspace-write; symlinked skills are followed.
- **Cursor:** skill discovery paths documented as `.agents/skills`,
  `.cursor/skills` and the `~/` forms; subagents read `.cursor/`, `.claude/`
  and `.codex/` agents; cloud agents do not get `~/.agents/skills`.

## Lead outcomes (resolved 2026-10-05; quotes are relayed through a summarising fetcher, so diff against raw text with curl before relying on them)
1. **Cursor reads `.claude/skills`: YES.** https://cursor.com/docs/skills: "For compatibility, Cursor also loads skills from Claude and Codex directories: `.claude/skills/`, `.codex/skills/`, `~/.claude/skills/`, and `~/.codex/skills/`." The first pass's summary table omitted this sentence and wrongly said it was not listed. `docs/AGENT-SURFACE.md` was right; do not "fix" it.
2. **Codex custom subagents exist: YES.** https://learn.chatgpt.com/docs/agent-configuration/subagents.md: "add standalone TOML files under `~/.codex/agents/` ... or `.codex/agents/` for project-scoped agents"; required fields `name`, `description`, `developer_instructions`. `.claude/agents/*.md` is NOT STATED. No experimental label seen. `docs/AGENT-SURFACE.md` line "Codex has no parallel path" is STALE: fix it (our `.claude/agents/*.md` are not Codex format; a Codex port would be TOML).
3. **AGENTS.md headroom:** root file 22,589 bytes = 69 % of Codex's 32,768-byte cap (nested files add 1.2 KB and 2.4 KB). Nothing guards it: a size test is the fix.
4. **Our MCP server targets protocol 2025-06-18** (`tools/mcp/apex-tools-mcp.mjs:38`, handles `initialize`). Latest revision is 2026-07-28, previous 2025-11-25. Clients negotiate down, so not a bug today; which client versions still do is UNVERIFIED. Record, do not change.
5. **Cursor hooks:** documented sources are `.cursor/hooks.json` (project), `~/.cursor/hooks.json` (user) and enterprise paths. `.claude/settings.json` as a hook source is NOT STATED (could be a missed sentence; grep the raw page). **Cursor CLI** (https://cursor.com/docs/cli/using): reads `AGENTS.md` and `CLAUDE.md` at the project root, `.cursor/rules`, and respects `mcp.json`.
6. **Codex retired approval value:** the repo is clean (no `approval_policy`, no `untrusted`, no `developers.openai.com/codex` links in `.codex`, `.cursor`, `AGENTS.md`, `docs/AGENT-SURFACE.md`). Docs: "Codex and ChatGPT Work no longer support `approval_policy = \"untrusted\"`" and the retired setting "can prevent either client from starting"; `[projects."/path"] trust_level = "untrusted"` is a different setting. `developers.openai.com/codex/` returns 308 to `https://learn.chatgpt.com/docs`. Valid `approval_policy` values seen: `on-request`, `never`, granular (list may be incomplete).

Cursor `.md` page URLs (`/docs/skills.md`, `/docs/hooks.md`, `/docs/cli/*.md`) returned **404** on 2026-10-05 although `llms.txt` lists them that way; the non-`.md` URLs work. Do not assume the `.md` trick works on every host.
