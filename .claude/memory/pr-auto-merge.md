---
name: pr-auto-merge
description: "User wants finished PRs marked ready with auto-merge enabled, and CI watched until merge"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cad46118-e9a8-51ea-bba9-8753c2445b4c
  modified: 2026-09-30T11:39:33.140Z
---

When work is ready, open the PR (ready, not draft) and enable auto-merge (MERGE method); keep watching CI with `ci-watch.mjs` and fix reds before it fires.

**Why:** 2026-09-30 the user asked "Auto merge" on PR #523 and then "Open PRs and auto merge" for the follow-up; they chose to keep auto-merge on and grant a `ci-watch.mjs` permission rule rather than review manually.

**How to apply:** after the verified push, create the PR, set draft false, enable auto-merge, arm ci-watch; re-sync with `sync-pr.mjs` when the deploy branch creates a ratchets.json conflict.
