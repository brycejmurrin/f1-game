---
name: one-subagent-per-skill
description: "For skill reviews the user wants one reviewer per skill, within current host limits"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2123b268-a868-5e07-a534-c8d79e348a20
  modified: 2026-10-05T04:21:20.186Z
---

When asked to review the project's skills with subagents, Bryce wants one reviewer per skill, rather than grouping several skills by domain. He interrupted a grouped review on 2026-09-30 with "One subagent per skill".

**Why:** each skill needs its own walkthrough and report; grouped reviews skim.

**How to apply:** give each reviewer one skill and a concrete task, collect its findings, and batch launches within the current host's concurrency limits. Use the current [launch policy](../skills/agent-fleet/references/launch-policy.md) for model and resource limits, and keep browser execution with the parent. Related: [small API queries](small-steps-for-api-analysis.md).
