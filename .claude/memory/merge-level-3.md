---
name: merge-level-3
description: Since 2026-10-17 ~04:19Z Bryce set fleet merge level 3 - orchestrator arms/merges every fleet PR once ready, full tier green, no conflict, no MERGE-HOLD
metadata:
  type: feedback
---
Bryce, 2026-10-17 ~04:19Z, answering "want level 3, or keep approving code PRs yourself?": "Merge them".

**Why:** He was the bottleneck merging every green code PR by hand all night.

**How to apply:** In the orchestrator session only (relayed grants don't count): arm auto-merge MERGE, or merge directly with merge_method "merge" + expectedHeadSha when already clean, on a fleet PR (one the orchestrator staffed or opened) once it's ready, `= ci passed` on the full tier, not conflicting, and the body has no `MERGE-HOLD:` line. Never squash or rebase; check 2 parents after. Not Bryce's own Cursor PRs. Owners and workers still never arm or merge. Supersedes the level-2 default in [[pr-auto-merge]] for fleet PRs; see [[merge-method-verify-parents]].
