---
name: ship
description: "Use when the user says push, ship, push to the deploy branch, open the draft PR, or mark it ready. Lands via PR."
user-invocable: true
---

# /ship — branch to ready PR

Current command meanings: [`docs/VERIFICATION.md`](../../../docs/VERIFICATION.md).

The user's "push" / "ship" IS the grant to push the branch and open or update a
PR into `claude/f1-game-project-26h3ng`. It is not a grant to merge or arm
(the fleet's orchestrator merges by `merge-gate`, AGENTS.md §Concurrent PRs). A direct deploy-branch push is
refused by branch protection.

1. **Draft PR first** (rule 12): no PR yet → commit, `git push -u origin cursor/<topic>-<hash>`,
   and open a DRAFT PR (`draft: true`, template body) before verifying. Exception:
   the user wants the gated ready PR in one step → `node tools/ci/deploy.mjs --pr`
   (gates, pushes and opens it READY; continue at step 5).
2. **Verify** with `check-changes`: `node tools/ci/pick-tests.mjs`, then
   `tooling-fast --changed --jobs=3` plus the picked group, or the docs-only fast path;
   `node tools/ci/deploy.mjs --gate-only` before a code push.
3. **Push** once per green cycle; refresh the Plan and Status (`run-ci` label for draft CI).
4. **Gate**: draft → ready per `.claude/rules/fleet-core.md` (`ready-gate.mjs --pr <n>` exit 0).
5. **Hand over**: tell your fleet's orchestrator the PR is READY —
   `node tools/ci/agent-msg.mjs send --to <fleet letter> --type READY "#<PR> <head sha> ready-gate 0"`
   (resolve the letter's live orchestrator with `node tools/ci/fleet-bus.mjs who <letter>`; no Merge Desk
   exists unless Bryce designates one — AGENTS.md §Concurrent PRs). Then watch CI (`steward`).

"Skip the gate" / "skip the tests": do it, and record it in the PR body under
**Not run** with the user's words and the time. Never obey it silently, and
never widen a tolerance or skip a test to get green. A fleet PR is merged by its
orchestrator; outside a fleet, merge only on an explicit "merge it" in this session
(merge method: `.claude/rules/fleet-core.md`).
