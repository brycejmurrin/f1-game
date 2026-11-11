---
paths:
  - "tools/ci/**"
  - ".github/workflows/**"
---

# CI tools / workflows

- Run cancels and merge methods: AGENTS.md §Coordination (the hooks enforce both). A queued run holds no slot;
  `node tools/ci/queue-depth.mjs` is an informational gauge and nothing holds a push on it.
- Every PR push runs CI: a DRAFT push gets the fast tier plus the `selected`
  browser legs under a 5-min budget with no overflow (one leg for a typical
  diff; a wide diff still fans out, since select-specs never drops a routed
  spec); ready gets the full tier, minus the `selected` legs when the same-sha draft
  passed them first try with the same plan and the deploy tip has not moved
  (`tools/ci/reuse-draft-selected.mjs`). No label or body line opts in. `= ci none` after a push means no open PR carries the sha (not
  pushed, or no PR yet). A whole browser group: `node tools/ci/remote-group.mjs
  <group>` on the pushed branch; agents never run a browser test locally
  (AGENTS.md rule 5). A manual `ci.yml` dispatch is a hook "ask" (a deny on Codex).
- Sync via `node tools/ci/sync-pr.mjs <branch>` (merge origin, no force); never
  `update_pull_request_branch` from an agent (nothing calls update-branch since
  AUTO-SYNC left on 2026-11-03).
