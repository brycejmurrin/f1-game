# Session context budget — measured baseline, 2026-10-27

What a fresh cloud session carries before the first prompt, where it comes from, and
which levers are already pulled. Measured with `/context`, `/skill-doctor`, `/mcp` and
`/usage` in one Bryce-attended session; re-measure before acting on these figures.

## Baseline (fresh session, before any work)

| Item | Tokens | Lever |
|---|---|---|
| System tools | 18.5k | none (harness) |
| MCP tools loaded upfront | 20.2k | none: it is the cloud harness's `claude-code-remote` server (28 schemas ≈ 20.3k) |
| System prompt | 11.7k | none (harness) |
| `AGENTS.md` | 9.7k | already under the 200-line budget (`tests/data/agent-config-budgets.json`) |
| Skill listings | 9.9k | plugin skills (below); project skills route and stay |
| MCP server instructions | 4.9k | per-server |
| Deferred MCP / system tools | ~158k | not charged until loaded: tool search is on (`ENABLE_TOOL_SEARCH` unset) |

## Already in place

All `.claude/rules/*.md` carry `paths:`; nested `CLAUDE.md` in `js/track/` and
`js/circuits/` load on demand; every agent sets `model` and `maxTurns`, five set
`omitClaudeMd`; `CLAUDE.md` has compact instructions; `context-cap.py` caps live
context; `apex-lsp` replaces grep-and-read for symbols.

## Decisions

- Disabled the `desktop-commander` and `cowork-plugin-management` synced plugins
  (`.claude/settings.json` `enabledPlugins`, Bryce's yes 2026-10-27): ~1.7k tokens of
  skill listings per turn, and desktop-commander's MCP timed out (30 s) at every start.
- Kept BrowserStack: lockstepped across the MCP configs and used for real-iPhone
  checks; its 53 tools are deferred, so it costs names only.
- Kept `modern-web-guidance`: it targets CSS/JS work this repo does.
- Skipped `effort` on the Haiku scouts: small gain, and the levels depend on the model.

## Habits that cost the most in practice

- Multi-source web research in the MAIN thread: this session's research rounds took
  context from ~94k to ~226k. Delegate it to a subagent and take back a summary.
- Fetch a page with a selector (`include_selectors: ["main"]`); an unscoped fetch of
  three docs pages came back as 54 KB. Search a persisted result; do not read it whole.
- Mid-session `/mcp` disables break the prompt cache; change servers at session start.

## Sources

- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/mcp (tool search, `alwaysLoad`, output limits)
- https://www.anthropic.com/research/effective-context-engineering-for-ai-agents
