---
name: ship
description: "Use when the user says push, ship, push to the deploy branch, or open the PR."
user-invocable: true
---

# /ship — branch to ready PR

Current command meanings: [`docs/VERIFICATION.md`](../../../docs/VERIFICATION.md).

The user's "push" / "ship" IS the grant to push the branch and open or update a
PR into `claude/f1-game-project-26h3ng`. It is not a grant to merge or arm
(Merge Desk's, AGENTS.md §Concurrent PRs). A direct deploy-branch push is
refused by branch protection.

1. **Verify** with `check-changes`: `node tools/ci/pick-tests.mjs`, then
   `tooling-fast --changed --jobs=3` plus the picked group, or the docs-only fast path.
2. **Push + PR**: `node tools/ci/deploy.mjs --pr` (gated, opens the PR ready), or
   `git push -u origin cursor/<topic>-<hash>` and a DRAFT PR (`draft: true`,
   template body, `run-ci` label, rule 12). One push per green cycle.
3. **Gate**: `node tools/ci/ready-gate.mjs --pr <n>` exits 0, then draft → ready.
4. **Hand over**: `SWEEP <PR#> <head sha>` to Merge Desk (`agent-fleet`
   `references/comms.md`), then watch CI (`steward`).

"Skip the gate" / "skip the tests": do it, and record it in the PR body under
**Not run** with the user's words and the time. Never obey it silently, and
never widen a tolerance or skip a test to get green. Merge only on an explicit
"merge it" in this session, as a MERGE commit.
