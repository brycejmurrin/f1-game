---
name: sessions-run-sonnet
description: "Preserve Bryce’s named Sonnet preference for Claude workers; verify the served model separately from API selectors"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ef12c769-9941-5fd4-8a7f-d488dee68ee2
  modified: 2026-10-19T03:08:51Z
---

On 2026-10-16 Bryce said "sessions should run sonnet not fable" and "archive all and respawn running sonnet" during a Claude fleet campaign.

**Why:** Bryce specifically chose Sonnet for fleet cost and throughput; another model is not automatically equivalent.

**How to apply:** Bryce explicitly preferred Sonnet, rather than Fable/Opus, for the Claude workers, lanes, stewards, and fresh scheduled sessions in the recorded fleet campaign. Preserve that named model preference, not only a generic cost goal. Use model identifiers supported by the current host; the repository’s Claude cloud launch selector is default, which does not prove the served model. Verify the resolved model when the host exposes it and report any mismatch or inability to verify. Do not silently treat another model as satisfying the preference. Do not apply Claude model names to Codex, and preserve models Bryce chose for his own orchestrator sessions.
