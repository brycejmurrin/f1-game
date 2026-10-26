# Base context of a fresh Claude cloud session — 2026-10-26

Supersedes: [Base-context audit — 2026-10-19](BASE-CONTEXT-AUDIT-2026-10-19.md) (its 50–60k base is now measured at ~98k).

Re-measures the "50-60k base" figure of [BASE-CONTEXT-AUDIT-2026-10-19](BASE-CONTEXT-AUDIT-2026-10-19.md) for
row 2 of `FLEET-B-TRANSCRIPT-AUDIT-2026-10-26.md` (PR #3769, not yet merged). The figure feeds
every role cap in `.claude/skills/agent-fleet/references/launch-policy.md` §Size stop.

## Figure

**98,260 tokens** at the first assistant turn of a fresh Fleet B worker (`session_01WV8qTS4T8A8zkxdpEi8BQK`,
created 2026-10-26 03:59:30Z, Claude Code 2.1.310, auto mode, Opus): `input_tokens` 2 + `cache_read_input_tokens`
58,764 + `cache_creation_input_tokens` 39,494. That turn holds the system prompt, tool schemas and deferred-tool
lists, MCP server instructions, CLAUDE.md → AGENTS.md, `fleet-core.md`, the memory index, the skill list and a
~1.5k-token launch brief — nothing the session read itself. It matches the audit's independent readings: five
near-idle test lanes at 100.6k–103.0k, and an orchestrator's first turn at 101,261.

So a fresh session starts at about **98k**, not 50-60k. An orchestrator then reads the agent-fleet skill and its
queue file before its first tick (queue5 on 10-26: 131k), which is the "measured boot" the orchestrator cap adds 100k
to.

## Method

1. `list_events` on the session itself with `kinds: ["assistant"]`, paging back with `before_id` to the first page.
2. Take the `usage` block of the first assistant message: input + cache read + cache write = context sent.
3. `get_session` `context_usage.used_tokens` read 0 at that point (it updates only at turn end), so it is not a
   usable boot measure. The same call showed `max_tokens` 1,000,000: the caps are a cost budget, since every wake
   re-sends the whole context, not a window limit.

Not done here: attributing the ~40k growth since 10-19 to its sources (AGENTS.md and rules, MCP instructions,
deferred-tool lists). That is the `bloat-auditor` pass the audit's row 2 also proposes.
