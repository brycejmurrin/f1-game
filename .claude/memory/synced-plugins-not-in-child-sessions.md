---
name: synced-plugins-not-in-child-sessions
description: "claude.ai-synced plugin skills load in Bryce's own session but not in sibling sessions spawned with create_session"
metadata:
  node_type: memory
  type: reference
  originSessionId: 1138139f-97b0-56ad-a9a9-703e995795c1
  modified: 2026-10-18T08:01:17.065Z
---

Synced claude.ai plugins (`claude plugin list` → `<name>@synced`) load in the session Bryce starts, but a sibling spawned via `create_session` reported on 2026-10-18 that "plugin skills don't load in my session" (harness-audit sibling, PR #2873).

Measured: the parent (started by Bryce from iOS, `CLAUDE_CODE_ENTRYPOINT=remote_mobile`) had 28 `@synced` plugins. The child (`create_session`, origin `claude_code_mcp_seed`, `ENTRYPOINT=remote`) had "No plugins installed" and an empty synced folder. Both were in the same `cloud_default` environment, so the sync appears tied to a user-started session.

**How to apply:** run work that must invoke a plugin skill (`agent-protocols:*`, `claude-perfectionist:*`, `cco-*` …) in the parent session or its in-session subagents, which do load them. Hand only the findings to a sibling to apply. Related: [[orchestrator-may-spawn-sessions]].
