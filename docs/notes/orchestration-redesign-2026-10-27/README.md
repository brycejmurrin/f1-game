# Orchestration redesign evidence (2026-10-27)

Read-only reviews that feed [`docs/plans/2026-10-27-orchestration-redesign.md`](../../plans/2026-10-27-orchestration-redesign.md).
Each was produced by one reviewer agent from primary sources (the bus branch, the tools, the prose, GitHub, the session
API, the vendor docs); numbers are theirs, dated 2026-10-27 unless the file says otherwise.

| file | source | what it measures |
|---|---|---|
| [bus.md](bus.md) | `origin/claude/fleet-bus` commit log, 3,735 lines 10-19 → 10-27 | message types, orchestrator churn, reply rates, READY→DONE, noise, incidents, cross-host traffic |
| [tooling.md](tooling.md) | `tools/ci/`, `.claude/hooks/`, `.github/workflows/`, `tests/unit/` | every coordination tool and hook, callers, state stores, gates, dead code, line counts |
| [rulebook.md](rulebook.md) | AGENTS.md, `.claude/rules`, skill `agent-fleet`, `steward`, 16 design notes | roles, message tokens, channels, cadences, contradictions, incident-derived rules, Bryce touchpoints |
| [outcomes.md](outcomes.md) | deploy-branch git log, GitHub PRs, `list_sessions`, `list_triggers`, cost notes | merges/day, PR funnel and lifetimes, open backlog, sessions by role, rotations, triggers, cost baselines |
| [platform.md](platform.md) | code.claude.com, docs.github.com, cursor.com, learn.chatgpt.com (read 2026-10-27) | what the platform provides natively now, with limits and URLs; contradictions with earlier notes |
| [claude-sessions.md](claude-sessions.md) | `list_events` pages of 24 Claude cloud sessions (8 orchestrators, 2 seeds, 2 relays, 12 workers), digested with `session-transcript.mjs` | orchestrator turn anatomy, why they ended, what Bryce typed, worker timelines, messaging reach, failure modes |
| [cursor-agents.md](cursor-agents.md) | Cursor Cloud Agents API: 870 agents listed, 93 run/usage records, 17 full conversations, 61 run streams; DAD's bus lines | run anatomy, DAD's brief vs the repo rules, reporting channels, the merge path, Bryce's role in Fleet D |
