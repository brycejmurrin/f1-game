---
name: agent-tooling-research
description: "Use when designing or changing a skill, subagent, hook, MCP server, apex_* tool or CI step, or when a Claude Code, Codex, Cursor, MCP or AGENTS.md flag, limit, default or path is unverified: web research with cited, dated sources. Not live Pages (deploy-research)."
---

# Agent-tooling research

AGENTS.md's rule: training-data memory of a CLI flag, a limit or a default is
not evidence. This skill is how to get evidence, cheaply, and leave it where the
next session finds it. It is for the tooling around the game (skills, agents,
hooks, MCP, CI), never the game itself.

## When to use it
- Before building or changing a skill, subagent, hook, MCP server, `apex_*`
  wrap, `.cursor/` / `.codex/` / `.mcp.json` config, or a CI step.
- Before relying on a limit or default (AGENTS.md size cap, timeouts,
  discovery paths, frontmatter fields, trust gating).
- When a repo doc states how a host behaves and you cannot see where it was
  verified (`docs/AGENT-SURFACE.md` is the usual home of those claims).

## The ladder (cheapest first)
1. **The repo.** `docs/AGENT-SURFACE.md`, `docs/notes/AGENT-*-RESEARCH-*.md`,
   `references/sources.md` here. A dated note under 30 days old may answer it.
2. **The host's own index.** Every host below publishes an `llms.txt`; fetch it,
   then the exact `.md` page. Raw page text beats a summary.
3. **`claude-code-guide` subagent** for Claude Code / Agent SDK / Claude API
   questions: it has the docs map and reads read-only.
4. **`WebSearch` to find, `WebFetch` to read.** Context7 for library APIs.
5. **`deploy-research` subagent** for bulk reading or anything that would flood
   the main context. Never Chrome DevTools or Playwright for research.
6. **Release notes / changelog** last, to date a claim: a docs page without a
   date is not proof it is current.

## Rules of evidence
- Cite every claim with URL + fetch date. A fetch through a summarising reader
  is a summary: label it. Anything you could not open is **UNVERIFIED**; say so
  and do not build on it.
- Two sources for a limit or default that a rule will depend on (docs page
  plus changelog, or docs plus the tool's own `--help`).
- Prefer raw page text (a `.md` variant where the host serves it; Cursor's 404s) over a
  small-model summary: the first Cursor pass dropped a whole sentence this way.
- A redirect (308) means the page moved: record the new URL.
- A registry row older than ~90 days is a lead, not a fact: re-fetch.

## Output
Write findings to `docs/notes/<TOPIC>-RESEARCH-YYYY-MM-DD.md` from
`references/note-template.md` (it is dated on purpose; notes are not current
structure). Put the cited URLs in the commit message or PR body too. If a repo
doc turns out wrong, fix the doc in the same change and name the source.

## Findings from the first pass (2026-10-05)
See `references/sources.md` §Lead outcomes: one stale repo claim (Codex subagents) and
one unguarded limit (AGENTS.md vs Codex's 32 KiB cap) came out of that pass.

## Don't
- Don't state a version, flag or default from memory; fetch it.
- Don't paste long page text into a note: quote the field, link the page.
- Don't research game or track facts here (new-track, survey-track own those).
- Don't use the hosted TinyFish connector for anything the plain fetch tool
  can read; it is metered.
