---
name: synced-plugins-not-in-child-sessions
description: "Dated Claude-host plugin inheritance limitation; discover availability in each session"
metadata:
  node_type: memory
  type: reference
  originSessionId: 1138139f-97b0-56ad-a9a9-703e995795c1
  modified: 2026-10-19T03:08:51Z
---

Synced claude.ai plugins (`claude plugin list` → `<name>@synced`) load in the session Bryce starts, but a sibling spawned via `create_session` reported on 2026-10-18 that "plugin skills don't load in my session" (harness-audit sibling, PR #2873).

Measured: the parent (started by Bryce from iOS, `CLAUDE_CODE_ENTRYPOINT=remote_mobile`) had 28 `@synced` plugins. The child (`create_session`, origin `claude_code_mcp_seed`, `ENTRYPOINT=remote`) had "No plugins installed" and an empty synced folder. Both were in the same `cloud_default` environment, so the sync appears tied to a user-started session.

**How to apply:** this is a dated Claude-host observation, not a guarantee about current installations, Codex, or subagent inheritance. Discover installed skills/tools in each target session first. When this limitation reproduces, run work that must invoke a plugin skill (`agent-protocols:*`, `claude-perfectionist:*`, `cco-*` …) in the parent session or its in-session subagents, after verifying that they load there. Hand only the findings to a sibling to apply. Related: [orchestrator may spawn sessions](orchestrator-may-spawn-sessions.md).
