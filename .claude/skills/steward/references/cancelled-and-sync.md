# A `cancelled` run, and syncing with the base

Read when `ci-watch` says `cancelled`, or `needs-sync` says `conflict` or `stale-red`.

## `cancelled`: read the jobs, not the conclusion

A cancellation alone proves neither success nor a timeout. Read the current request/attempt, expected SHA, job
failures and coordinator replacement reason. A job reaching its timeout is a real failure; a superseded attempt
cannot supply current-head evidence. Follow the replacement rather than dispatching another copy.

Sessions do not cancel or rerun independently. Trusted coordinator cleanup may cancel proven obsolete work while
preserving attempt history. Recovery/retry stays bounded and cannot silently replace required failed evidence.
Read `docs/ACTIONS.md` for shadow mode and the current admission path.

## When to sync

When to sync is AGENTS.md §Git branch & deploy. `node tools/ci/needs-sync.mjs <branch>` answers it
(`= sync needed: conflict | stale-red | no`) and `sync-pr` refuses `no` (exit 4).

Merely behind is never a reason: merge-gate's `distance` row and `land.yml`'s AUTO-SYNC left on 2026-11-03 (gen and
ratchets run on the real merge result).

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
