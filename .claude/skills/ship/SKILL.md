---
name: ship
description: "Use when the user says ship it, push this, open the draft PR, mark it ready or land it; work lands through a PR. Not for: a red or conflicting PR → steward; picking tests → check-changes."
user-invocable: true
---

# /ship — branch to ready PR

Current command meanings: [`docs/VERIFICATION.md`](../../../docs/VERIFICATION.md). This skill is the home of the
draft → ready → `land` steps; steward §12 points here.

The user's "push" / "ship" IS the grant to push the branch and open or update a
PR into `claude/f1-game-project-26h3ng` (never pushed directly: branch protection refuses it). It is not a grant
to merge or arm: `land.yml` posts the `gate` COMMIT STATUS (not a check run; the ruleset's one required check) and
arms auto-merge once `land` is on a ready PR; `gate` itself requires `CI` green on the head (skill `worker` `references/land.md`).

1. **Draft PR first** (AGENTS.md rule 12; docs/WORKERS.md §2): no PR yet → commit, `git push -u origin
   cursor/<topic>-<hash>`, open a DRAFT PR (`draft: true`, template body: Goal, Plan with exactly one `now:` item and
   `- [ ] land: …` last, Verified / Not run, the Hand-off fence — docs/WORKERS.md §The Hand-off block), then add
   `lane:<host>` and `run-ci` with `gh api -X POST repos/<owner>/<repo>/issues/<n>/labels -f 'labels[]=run-ci'`
   (never the MCP `issue_write` `labels` field: it replaces the list; docs/WORKERS.md §1). `run-ci` is NOT optional:
   `ready-gate` reads `Structural guards` on the head, and without the label a draft runs no CI (`= ci none`).
   Never `deploy.mjs --pr`: it opens the PR READY without the template body, skipping the draft and `ready-gate`.
2. **Verify** with `check-changes`: `node tools/ci/pick-tests.mjs`, then the pre-push floor (AGENTS.md rule 3 →
   docs/WORKERS.md §3), or the docs-only fast path. The first draft push may precede it (rule 12); the full tiers
   run on the PR.
3. **Push** once per green cycle; tick Plan items with their evidence and refresh the Hand-off block.
4. **Watch** (AGENTS.md rule 13, docs/WORKERS.md §4): `subscribe_pr_activity` on the PR before ending a turn while
   CI runs on your head; a red there is work now (skill `steward`). Do not use `ready-gate --wait` (a shell poll).
5. **Gate and land**: tick or strike every Plan item except `- [ ] land: …`; a CONFLICTING/DIRTY PR syncs first
   (`node tools/ci/sync-pr.mjs <branch>`). Then run `node tools/ci/ship-pr.mjs --pr <n>` (it wraps `ready-gate.mjs`; an
   already-ready PR is refused as `not-draft` and only needs the `land` label). On a pass it prints the two calls, and
   the script flips and labels nothing: the GitHub MCP `update_pull_request` `draft:false` (the hook needs a
   ready-gate receipt under 10 min old; older, re-run it), then
   `gh api -X POST repos/<o>/<r>/issues/<n>/labels -f 'labels[]=land'`. Refresh the Hand-off block and end the turn.
   `land` on a DRAFT does nothing (`gate` says "draft: flip ready first"); a stale `gate` re-gates on removing and
   re-adding `land`, on a body edit, or at the next stale-gate sweep.
   After `land` the session stays subscribed: call `subscribe_pr_activity` again after the ready flip (it has died
   there) until the dispatcher archives it (skill `worker` item 5, AGENTS.md rule 13).

"Skip the gate" / "skip the tests": do it, and record it in the PR body under
**Not run** with the user's words and the time. Never obey it silently, and
never widen a tolerance or skip a test to get green. No session merges: the `land` label
is the request (merge-commit policy: AGENTS.md §Coordination, hook-enforced).
