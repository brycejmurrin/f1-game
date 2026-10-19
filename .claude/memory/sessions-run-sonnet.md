---
name: sessions-run-sonnet
description: "Historical Claude preference for economical workers; current host policy selects model identifiers"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ef12c769-9941-5fd4-8a7f-d488dee68ee2
  modified: 2026-10-16T07:11:43.226Z
---

On 2026-10-16 Bryce said "sessions should run sonnet not fable" and "archive all and respawn running sonnet" during a Claude fleet campaign.

**Why:** cost and throughput; this is a preference against silently upgrading workers to expensive models.

**How to apply:** preserve that cost intent while using model identifiers supported by the current host. The current [launch policy](../skills/agent-fleet/references/launch-policy.md) requires `default` for Claude cloud launches; do not hardcode the historical `claude-sonnet-5-5` identifier into those calls or apply Claude model names to Codex. User-selected orchestrator models remain the user's choice. Related: [fleet spawning preference](orchestrator-may-spawn-sessions.md).
