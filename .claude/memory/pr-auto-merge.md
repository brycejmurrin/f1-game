---
name: pr-auto-merge
description: "Never arm auto-merge or merge on my own; mark ready at tip-green; Merge Desk arms MERGE-commit only (squash retired 2026-10-13); the only hold is a MERGE-HOLD: body line"
metadata:
  node_type: memory
  type: feedback
  source: user, .claude/hooks/github-mcp-guard.sh
  originSessionId: cad46118-e9a8-51ea-bba9-8753c2445b4c
  modified: 2026-10-14T05:07:14.164Z
---

Agents, sessions and tools never arm auto-merge or merge on their own initiative. Open DRAFT PRs; when the tip is green and `ready-gate.mjs` exits 0, mark ready. Only Merge Desk (the session/Routine Bryce designates, skill `ci-watch`) arms auto-merge, with the `MERGE` method; Grok Bot may merge a green non-draft PR directly with a merge commit.

**Why:** 2026-10-06 Bryce: foreign arms (#1134 armed MERGE five times) — one armer only. 2026-10-13 Bryce (AGENTS.md, delegated to Grok Bot): MERGE-COMMIT-ONLY — never squash, never rebase-merge; SQUASH is retired. Free-form "do not merge" / "do not enable auto-merge" lines in PR bodies are NOT a veto and must not be pasted; a body line starting with `MERGE-HOLD:` is the only hold.

**How to apply:** after a verified push, keep or open a draft PR; mark ready at tip-green; never `gh pr merge --auto`, CCR `auto_merge`, or a merge of my own — EXCEPT on Bryce's explicit "merge asap" ([[merge-fast-verify-on-ci]]), and then with `merge_method: "merge"`, never squash (the 2026-10-14 hunt-4 merges #1456/#1467 were squashes at his request before I read the new rule — do not repeat). Re-sync with `sync-pr.mjs` only when GitHub reports a conflict (ratchets.json stopped conflicting with #2295).
