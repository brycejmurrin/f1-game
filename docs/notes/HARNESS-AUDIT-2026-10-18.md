# Harness audit — 2026-10-18

Scope: Bryce's grant to run the config/context/protocol plugin skills against `.claude/**` and AGENTS.md, apply only
safe findings. Companion to `PLUGIN-SKILL-POLICY-2026-10-18.md` (branch
`cursor/plugin-policy-fixes-9c4d`).

## The plugin skills could not be run

This session's skill list holds only the project skills and the built-in ones. `Skill` returned `Unknown skill` for
`claude-perfectionist:perfectionist` and `claude-context-optimizer:cco-overhead`; the other plugin skills in the brief
(agent-smith, claude-md-optimizer, cco-tools/doctor/claudemd, agent-context-kit, agent-protocols,
claude-code-setup, cc-bootstrapper) are in the same state: not loaded in a sibling session. So **no plugin finding was
produced and no cco-overhead first-turn token figure was measured** (before or after). The earlier policy note's
98.0 K figure (2026-10-18, read from a transcript) is the only number on record; this PR changes no skill
description, AGENTS.md line or MCP server, so it does not move.

Instead the same lenses were run by hand with the repo's own checks:

| Lens | Check | Result |
|---|---|---|
| budgets, hook names, routing text | `node --test tests/unit/agent-config.test.mjs agent-surface.test.mjs docs-integrity.test.mjs skill-hint-hook.test.mjs` | 95/95 pass; AGENTS.md 27,331 B / 199 lines |
| broken cross-references | every backticked `tools/ tests/ docs/ js/ .claude/` path in skills, agents, rules, hooks | 0 missing |
| Codex mirror, generated drift | `mirror-skills.sh --check`, `npm run gen:check` | up to date (39 skills) |
| dead or duplicate `permissions.allow` | 137 rules, duplicates and `node/bash/python3 <path>` targets | 0 duplicates; 4 "missing path" hits are globs (`node --test *`, `node -e *`, `node --check *`, `gen-*.mjs`), false positives |
| duplicate or contradictory memory | `.claude/memory/MEMORY.md` | **3 real findings, applied** |

## Findings

| # | file | finding | status |
|---|---|---|---|
| 1 | `.claude/memory/MEMORY.md` (Merge Desk lines) | two index lines for `merge-desk-session`: one says the desk is gone, one says it is a live persistent session | applied: stale line removed |
| 2 | `.claude/memory/MEMORY.md` (Fixers lines) | two index lines for `fixers-may-screenshot`; the second ("allow screenshots (no loops)") contradicts the file (loops allowed, Bryce 06:37Z) | applied: stale line removed |
| 3 | `.claude/memory/MEMORY.md`, `standing-merge-desk.md` | index and description say a Sonnet desk "runs sweeps, woken hourly"; the file's own stale check says it is gone | applied: index line and description now say it no longer exists |

## Not applied

| Item | Reason |
|---|---|
| any plugin-raised finding | plugins not loaded in this session (above); rerun from a session that has them |
| cco-overhead before/after tokens | same |
| `enabledPlugins`, `Skill(...)` deny lines | owned by #2862 |
| AGENTS.md restructure, `.cco/`, `.contextignore`, `commands/`, `tasks/`, `SPEC.md` | forbidden by AGENTS.md and Bryce's earlier decline |
| cc-bootstrapper / create-agent scaffolds | would overlay the harness (policy note) |
