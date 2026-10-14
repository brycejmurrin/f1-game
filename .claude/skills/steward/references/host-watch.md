# Watching without subscriptions or timers

Use when the host lists no PR-subscription tool, no `Monitor`, or no timer.

1. Run the watcher as ONE owned background command with a log under `artifacts/logs/`:
   `node tools/ci/ci-watch.mjs --sha <sha> --timeout 30 > artifacts/logs/ci-watch.log 2>&1`.
2. Read its events while doing independent work (AGENTS.md rule 4).
3. At a checkpoint run at most one `node tools/ci/ci-watch.mjs --sha <sha> --once`; no shell-poll loops.
4. Record the missing subscription / reminder capability as unverified in the PR body; never claim an automation was armed.
5. Check the active tool catalog with `node tools/check/doctor.mjs --catalog <file>`; a missing connector cannot be
   fixed by inventing tool results.
