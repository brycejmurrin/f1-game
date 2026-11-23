---
name: one-subagent-per-skill
description: "One subagent per skill when reviewing, testing or exercising skills, within host limits"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2123b268-a868-5e07-a534-c8d79e348a20
  modified: 2026-10-27T09:53:50.496Z
---

When asked to review, test, or exercise the project's skills with subagents, Bryce wants one reviewer per skill, rather than grouping several skills by domain. He interrupted a grouped review on 2026-09-30 with "One subagent per skill".

**Why:** each skill needs its own walkthrough and report; grouped reviews skim.

2026-10-27: he asked for skill reviews and code hunts to run on Opus ("Re launch subagent reviews and hunts running opus"), then "fully re launch all of our subagents for skills and opus ones from scratch" — a re-review is an independent pass told NOT to read earlier reports, and its findings feed a saved fix plan (docs/plans/2026-10-27-review-fix-plan.md).

**How to apply:** When asked to review, test, or exercise the project’s skills with subagents, assign one skill and one realistic walkthrough to each reviewer rather than grouping several skills by domain. Batch launches within the current host’s concurrency and delegation limits, keep browser execution with the parent, collect every skill’s findings, and preserve Bryce’s applicable model preference using supported host selectors.
