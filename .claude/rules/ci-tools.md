---
paths:
  - "tools/ci/**"
  - ".github/workflows/**"
---

# CI tools / workflows

- Run cancels and merge methods: AGENTS.md §Coordination and `docs/WORKERS.md`
  (the hooks and `merge_policy.py` enforce both). A queued run holds no slot.
- `= ci none` after a push means no run started — dispatch `ci.yml` by hand and
  watch by head sha. Sync via `node tools/ci/sync-pr.mjs <branch>` (merge
  origin, no force); never `update_pull_request_branch`.
