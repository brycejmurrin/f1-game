---
name: synced-plugins-not-in-child-sessions
description: "claude.ai-synced plugin skills load in Bryce's own session but not in sibling sessions spawned with create_session"
metadata:
  node_type: memory
  type: reference
  originSessionId: 1138139f-97b0-56ad-a9a9-703e995795c1
  modified: 2026-10-18T07:59:18.419Z
---

Synced claude.ai plugins (`claude plugin list` → `<name>@synced`) load in the session Bryce starts, but a sibling spawned via `create_session` reported on 2026-10-18 that "plugin skills don't load in my session" (harness-audit sibling, PR #2873).

**How to apply:** run work that must invoke a plugin skill (`agent-protocols:*`, `claude-perfectionist:*`, `cco-*` …) in the parent session or its in-session subagents, which do load them. Hand only the findings to a sibling to apply. Related: [[orchestrator-may-spawn-sessions]].
