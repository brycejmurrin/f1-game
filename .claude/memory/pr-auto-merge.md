---
name: pr-auto-merge
description: "Never arm auto-merge or merge; mark ready at tip-green; CI Watch arms SQUASH only"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cad46118-e9a8-51ea-bba9-8753c2445b4c
  modified: 2026-10-06T22:35:00.000Z
---

Agents, sessions and tools never arm auto-merge or merge. Open DRAFT PRs; when the tip is green and `ready-gate.mjs` exits 0, mark ready. Only CI Watch arms auto-merge, and only SQUASH, on ready PRs.

**Why:** 2026-10-06 Bryce: foreign MERGE arms (#1134 armed MERGE five times; #1135 landed as a MERGE commit). Sole armer is CI Watch (Grok bot outside the repo), squash-only.

**How to apply:** after a verified push, keep or open a draft PR; mark ready at tip-green; do not run `gh pr merge --auto`, CCR `auto_merge`, or any merge. Re-sync with `sync-pr.mjs` when the deploy branch creates a ratchets.json conflict.
