# Apex 26 custom subagents

Markdown agents with YAML frontmatter under `.claude/agents/`. Claude Code and
Cursor both load this path (Cursor also accepts `.cursor/agents/`; we keep the
single Claude tree to avoid drift).

| Agent | Use when |
|---|---|
| **deploy-research** | Post-deploy liveness, shipped-JS marker checks, public-web / track reference research via tinyfish. Read-only; no Chrome or Playwright. |
| **verify-agent** | Run `tools/verify-change.mjs` against the current tree and report the JSON verdict. Read-only; never edits source, never starts a second Playwright process, one `test-solo` re-run per timeout. |
| **track-surveyor** | Survey + improve ONE circuit: writes only that `js/circuits/<id>.js`, verifies with `verify-track.cjs`, reports baseline deltas instead of moving them. No browser runs. |

**Token routing:** prefer these over attaching fat skills. Deploy/version →
`deploy-research` (not full `mcp-probe`). Pre-push verify → `verify-agent`.
One circuit → `track-surveyor`. Parent keeps edits, cache bump, and deploy FF.

Skills (workflows) live in `.claude/skills/`. Canonical rules live in
`AGENTS.md`. New agents must be listed here and remain trackable
(`.gitignore` allowlists `!.claude/agents/`).
