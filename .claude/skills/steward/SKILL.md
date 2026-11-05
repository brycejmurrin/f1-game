---
name: steward
description: "Use when you own a PR at any stage: a user task or manual CONTINUE PR handoff, opening it, pushing, a red/cancelled/conflicting PR, ready, land, after land. Not for: status only → check; picking tests → check-changes."
---

# Steward — one implementation scope, one PR

Read `AGENTS.md` and `docs/ACTIONS.md`. The latter owns the two-label PR/test, command and rollout contract.
Default shadow mode does not launch or merge. A notification or comment is not approval or authorization to launch a coding agent.
Failed CI → agent `ci-red-triage`; pre-push checks → skill `check-changes`; liveness → agent `deploy-research`;
review findings → agent `finding-verifier` before changing code.

## Lane — user-authorized implementation

1. Read the user's task or explicit parent brief, OWNED/FORBIDDEN paths, current PR head, Plan and Hand-off.
   Coordinate edits with the actual implementation owner. The Actions ledger does not assign coding tasks or
   grant an implementation lease; issue labels and claim comments do not authorize an agent launch.
2. Work one scope on an isolated `cursor/<topic>-<hash>` branch. Open a draft PR at the first verified checkpoint.
   The PR body carries implementation progress and `Closes #<n>` when appropriate. No queue label is needed.
3. Already fixed: report the deploy commit and reproduction evidence on the issue. Close only when authorized;
   a denied close remains denied. No replacement PR merely to claim completion.
4. Near the brief's context/cost cap, push verified work and refresh Plan/Hand-off. Use the native host's handoff
   to the user or explicitly authorized parent. `/apex recover` repairs PR test infrastructure, never coding work.
5. A decision needed: one comment with options, recommendation and independent work to continue. Never fabricate
   owner approval or route around a hook denial using another tool.
6. Subscribe to PR activity when supported, then end the turn. On a red or conflict for your current head, resume
   the user-authorized task. On merge/close, unsubscribe and report the final commit. No timer or shell polling.

## Open and push

- Branch from the deploy tip and use `.github/pull_request_template.md`. Keep Goal, a living Plan, Verified / Not
  run and the Hand-off block. Add no host, ownership, taxonomy or merge labels.
- Follow AGENTS rules 3 and 12: finish the edits, verify the affected slice once, stage then commit in separate
  calls, and push with no output pipe. A generated reader comes from its source and generator.
- Refresh the PR body at every push: record exact head, owner identity, request/attempt ids when known, next step,
  check evidence and every needed group not run. The coordinator controls admission; a push is not proof tests ran.
- Use the host's activity subscription. A host without it follows [`references/host-watch.md`](references/host-watch.md).

## Red and conflicts

Read the current head rather than the notification SHA. Use `ci-watch.mjs --sha <head> --once` and failed-job
metadata/logs. Running with zero failures, skipped and cancelled do not prove a pass. Name the exact failing test,
assertion and lane; compare the same lane/tier with base evidence before calling it newly introduced.

Use `needs-sync.mjs <branch>` then `sync-pr.mjs` only for a proven conflict or stale-red; never for
clean-behind. Never force-push, widen a tolerance, skip a required test, merge locally into the protected branch,
or cancel a run from the session. Trusted coordinator cleanup may cancel a proven obsolete attempt.
Deployment incidents record the failing release attempt; repairs require a user-authorized implementation task. Diagnose actual Pages failures;
a green PR does not prove publication. References: [`references/cancelled-and-sync.md`](references/cancelled-and-sync.md)
and [`references/ci-verdicts.md`](references/ci-verdicts.md).

## Land

Finish the implementation Plan with evidence. A draft's bounded feedback cannot prove full readiness. Ready PRs queue comprehensive validation automatically. Run the
available readiness check for the current head and mark ready only when the work is complete; the MCP flip itself
provides no receipt guarantee. Re-read head and results, then comment `/apex merge` on the PR to request merge.

The trusted path requires comprehensive affected validation and a current-head `gate`; owner approval is
`/apex approve <sha>` when required. `queue:paused` prevents new expensive work and merge. Never remove an owner's
pause or add priority on their behalf. Commands do not bypass validation or protection. Shadow mode records no
new merge authority: report that cutover is pending rather than falling back to retired controls.

Keep the activity subscription until merged/closed; call `subscribe_pr_activity` again if the host's subscription
ends at a ready transition. An absent capability stays unarmed. Never merge, arm/disarm auto-merge or edit rulesets.

## References

- [`references/labels.md`](references/labels.md) — intent label contract.
- [`references/issues.md`](references/issues.md) — issue context and implementation prerequisites outside the test coordinator.
- [`references/land.md`](references/land.md) — trusted merge evidence.
- [`references/vendors.md`](references/vendors.md) — hosts, credentials and protected branch.
- [`references/cancelled-and-sync.md`](references/cancelled-and-sync.md) — cancellation evidence and sync.
- [`references/ci-verdicts.md`](references/ci-verdicts.md) — check and publication evidence.
- [`../check-changes/references/sync-pr.md`](../check-changes/references/sync-pr.md) — conflict resolution.
