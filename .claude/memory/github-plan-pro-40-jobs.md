---
name: github-plan-pro-40-jobs
description: "The brycejmurrin account is on GitHub Pro since 2026-09-30, so Actions allows 40 concurrent standard jobs (was 20 on Free); macOS stays at 5"
metadata:
  node_type: memory
  type: project
  originSessionId: 6badff43-e599-56e5-9f28-9dce5331b039
  modified: 2026-09-30T00:16:15.228Z
---

On 2026-09-30 the user upgraded the GitHub account to Pro to relieve the Actions queue (docs/notes/CI-CAPACITY-2026-09-29.md measured 200–290 jobs waiting behind 20 slots).

**Why:** the per-plan concurrent-job cap is the hard ceiling every CI sizing decision (shard counts, jobs per PR run) is measured against; the capacity note and select-specs comments still say 20.
**How to apply:** size against 40 standard / 5 macOS concurrent jobs (https://docs.github.com/en/actions/reference/limits); update the 20-slot figures in docs/notes when next editing them. Merge queue is still unavailable — it needs an organisation-owned repo, not a plan.
