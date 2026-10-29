# A `cancelled` run, and syncing with the base

Read when `ci-watch` says `cancelled`, `needs-sync` says `conflict` or `stale-red`, or the `gate` status fails on
`distance`.

## `cancelled`: read the jobs, not the conclusion

Which `cancelled` is benign (the draft/ready dedupe on one `head_sha`) and which is a timeout is AGENTS.md rule 8.
Deploy-branch pushes queue in pages.yml's `pages-train-*` group (`ci-watch.mjs --sha` says `superseded`). A job at
its `timeout-minutes` cap with zero failures is a real red. List the run's jobs before deciding; agent
`ci-red-triage` does that and returns the status line.

A PR that ends `cancelled` twice with zero failures:

1. `node tools/ci/ci-watch.mjs --sha <head sha> --once` (exit 2 / `= ci cancelled` = newest run per workflow, no
   failed job, no live sibling).
2. Same head SHA both times → the dedupe or a push over a live run: wait for the newest run, do not re-run.
3. The newest run itself `cancelled` → `ci-red-triage` for a job at its cap (a real red); check `/proc/loadavg`.
4. Neither → re-run once via `node tools/ci/ci-rerun.mjs <run_id>` (a `ci.yml` `group:` dispatch runs a browser
   group, not the PR's tier); never sync to "refresh" it.

## When to sync

When to sync is AGENTS.md §Git branch & deploy. `node tools/ci/needs-sync.mjs <branch>` answers it
(`= sync needed: conflict | stale-red | no`) and `sync-pr` refuses `no` (exit 4).

The third reason, which needs-sync cannot see, is the `gate` status's `distance` row (the merge-base is too many
game merges behind the tip; `tools/ci/merge-gate.mjs` holds the limit; `needs-sync` still prints `no` there). On a
`distance` failure run `node tools/ci/sync-pr.mjs <branch> --force-clean-behind --push`, unless the PR is a ready
`land` PR: `land.yml`'s AUTO-SYNC update-branches those on the next train (at most `SYNC_MAX` waiting on CI), so
fetch first and sync by hand only when it has not.

## Running `sync-pr.mjs`

A base merge is `sync-pr.mjs`, never a hand merge. Run it as ONE background Bash task with `timeout: 7200000`: its
stage ceilings (`STAGE_TIMEOUT_MS`) add up past the 30-min default, and a killed run resumes with
`--resume --from=<stage>`.

    node tools/ci/sync-pr.mjs <branch> --plan   # cached refs only; no conflict proof
    node tools/ci/sync-pr.mjs <branch>          # real merge, pushes nothing, leaves you ON sync-pr-<branch>
    node tools/ci/sync-pr.mjs <branch> --push   # fresh verified sync, when publication is intended

- **Red AND conflicting:** a `stale-red` syncs first; any other red is fixed on the branch first; then sync once and
  ONE push.
- **Verify by diff size:** a clean merge where gen rewrote nothing and the PR diff is prose or generated files only →
  `--verify=none --push` (CI re-gates the head); else the default `--verify=fast` plus `tooling-fast --changed`.
- **Conflicts:** generated-file conflicts `sync-pr` cures; hand-written ones it aborts and hands back. The temp-branch
  trap and the hand-resolve recipe are in skill `check-changes` (SKILL.md links them). After a cure: `npm run gen`
  then `gen:check`. Record the files and resolution as a ticked Plan item with the merge sha.
