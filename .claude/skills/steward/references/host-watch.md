# Watching without a subscription

Use when the host lists no PR-subscription tool, no `Monitor`, or no timer.

1. Run the watcher as ONE owned background command with a log under `artifacts/logs/`:
   `node tools/ci/ci-watch.mjs --sha <sha> --timeout 30 > artifacts/logs/ci-watch-pr<N>-<sha>.log 2>&1`.
   Substitute the actual PR/SHA, use a new run suffix for another watcher on
   that same head, and record its owned process handle; never overwrite a
   different PR's evidence or claim an unattached subscription was armed.
2. Read its events while doing independent work (AGENTS.md rule 4).
3. At a checkpoint run at most one `node tools/ci/ci-watch.mjs --sha <sha> --once`; no shell-poll loops.
4. Record the missing subscription / reminder capability as unverified in the PR body; never claim an automation was armed.
5. Check the active tool catalog with `node tools/check/doctor.mjs --catalog <file>`; a missing connector cannot be
   fixed by inventing tool results.

## A refused subscription

`subscribe_pr_activity` answering "Could not subscribe to this PR" is not transient on a PR another account's session
opened (every `claude/audit-*` PR, 45 of 45 calls on 2026-11-09/10; no other PR failed): do not retry, and do not
unsubscribe other PRs to "free" it. Use step 1 above and say so in the Hand-off block. Then at most one timed check-in of 50 minutes or less, re-armed
only after a state change (AGENTS.md rule 13), and none while a subscription works: a wake after an hour
of idle re-reads the whole context (measured $3–10 a wake, against $0.25–0.60 inside the hour;
`docs/notes/ORCHESTRATION-REVIEW-2026-11-11.md` rank 9).
