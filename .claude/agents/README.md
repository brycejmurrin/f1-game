# Apex 26 custom subagents

Markdown agents with YAML frontmatter under `.claude/agents/`. Claude Code and
Cursor both load this path (Cursor also accepts `.cursor/agents/`; we keep the
single Claude tree to avoid drift).

| Agent | Use when |
|---|---|
| **deploy-research** | Post-deploy liveness, shipped-JS marker checks, public-web / track reference research via tinyfish. Read-only; no Chrome or Playwright. |

Skills (workflows) live in `.claude/skills/`. Canonical rules live in
`AGENTS.md`. New agents must be listed here and remain trackable
(`.gitignore` allowlists `!.claude/agents/`).
