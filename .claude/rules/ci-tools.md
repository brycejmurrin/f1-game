---
paths:
  - "tools/ci/**"
  - ".github/workflows/**"
---

# CI tools / workflows

- `docs/ACTIONS.md` owns label intent, capacity, durable requests and shadow/cutover semantics. Control jobs consume
  runner slots too; queued work is not evidence of validation. Only trusted coordinator cleanup cancels work proven
  obsolete. Sessions do not cancel, merge, arm or publish gate success.
- Bounded draft feedback does not satisfy comprehensive affected validation before merge. Required work cannot be
  silently dropped to fit a budget. Cancelled/skipped/missing results do not count as successful tasks. Labels and
  body edits update intent without duplicating validation. Read the ledger/current SHA before reporting results.
- Test workers are read-only; finalization, merge and release have separate trust boundaries. Unknown API or
  artifact state fails closed. Never expose publication or merge credentials to PR code.
- Use `sync-pr.mjs` for proven conflicts/stale-red, not to refresh CI. No force push or direct deploy-branch push.
- New runtime defaults to shadow; no live migration or capacity claim follows merely from committing policy.
