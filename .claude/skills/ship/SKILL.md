---
name: ship
description: "Use when the user says ship it, push this, push to the deploy branch, open the draft PR, mark it ready or land it. Lands via PR."
user-invocable: true
---

# /ship — branch to ready PR

Current command meanings: [`docs/VERIFICATION.md`](../../../docs/VERIFICATION.md).

The user's "push" / "ship" IS the grant to push the branch and open or update a
PR into `claude/f1-game-project-26h3ng`. It is not a grant to merge or arm:
GitHub lands PRs (`land.yml` runs the gate and arms auto-merge once the `land` label is on a ready PR;
docs/WORKERS.md). A direct deploy-branch push is refused by branch protection.

1. **Draft PR first** (rule 12): no PR yet → commit, `git push -u origin cursor/<topic>-<hash>`,
   and open a DRAFT PR (`draft: true`, template body) before verifying. Exception:
   the user wants the gated ready PR in one step → `node tools/ci/deploy.mjs --pr`
   (gates, pushes and opens it READY; continue at step 5).
2. **Verify** with `check-changes`: `node tools/ci/pick-tests.mjs`, then
   `tooling-fast --changed --jobs=3` plus the picked group, or the docs-only fast path;
   `node tools/ci/deploy.mjs --gate-only` before a code push.
3. **Push** once per green cycle; refresh the Plan and Hand-off block (`run-ci` label, or a body line starting `CI: run`, for draft CI).
4. **Gate**: `node tools/ci/ready-gate.mjs --pr <n>` exit 0 on the head you are about to flip.
5. **Land**: flip the PR ready, add the `land` label, refresh the body's Hand-off block (docs/WORKERS.md).
   `land.yml` runs the `gate` check and arms auto-merge; the session's work ends here. A red on your head
   before it lands is still yours (`steward`).

"Skip the gate" / "skip the tests": do it, and record it in the PR body under
**Not run** with the user's words and the time. Never obey it silently, and
never widen a tolerance or skip a test to get green. No session merges: the `land` label
is the request, and the branch ruleset admits merge commits only.
