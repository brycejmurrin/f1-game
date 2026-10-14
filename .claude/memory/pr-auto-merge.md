---
name: pr-auto-merge
description: "Merge commits only (never squash); agents never arm or merge — Merge Desk / Grok Bot do; re-read AGENTS.md on the deploy tip before any merge"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cad46118-e9a8-51ea-bba9-8753c2445b4c
  modified: 2026-10-14T07:15:00.000Z
---

The rule FLIPPED on 2026-10-14 05:10 UTC (`007219315`, deploy-branch AGENTS.md): merge commits only, never squash or rebase-merge. Only the designated Merge Desk arms auto-merge (MERGE method) and Grok Bot may merge a green non-draft PR; every other agent never arms or merges (`github-mcp-guard.sh` denies squash/rebase and asks before a merge / arm / draft→ready). Before 2026-10-14 the rule was the opposite (CI Watch, SQUASH only).

**Why:** the session that wrote this squash-merged #1460 at 06:08 UTC on the owner's "merge all asap", an hour after the flip, because its feature branch still carried the old AGENTS.md and this memory said SQUASH.

**How to apply:** before any merge or arm, read AGENTS.md from `origin/claude/f1-game-project-26h3ng`, not the branch checkout. When the owner explicitly asks an agent to merge, use the MERGE method and let the guard's prompt be the owner's confirmation; never squash. Otherwise mark ready at tip-green and leave merging to Merge Desk / Grok Bot. See [[merge-fast-verify-on-ci]].
