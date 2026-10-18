---
paths:
  - "tools/ci/**"
  - ".github/workflows/**"
---

# CI tools / workflows

- Never cancel an Actions run (yours is replaced by the next push; hooks refuse
  `gh run cancel` and the MCP cancel). A queued run holds no slot.
- Merge method is MERGE only (`merge_policy.py`); never squash or rebase-merge.
- `= ci none` after a push means no run started — dispatch `ci.yml` by hand and
  watch by head sha. Sync via `node tools/ci/sync-pr.mjs <branch>` (merge
  origin, no force); never `update_pull_request_branch`.
