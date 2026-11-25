# A `cancelled` run, and syncing with the base

Read when `ci-watch` says `cancelled`, or `needs-sync` says `conflict`, `union-conflict`, `stale-red`, `retest-refused`, `gate-refused` or `tip-crossed`.

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
(`= sync needed: conflict | union-conflict | stale-red | retest-refused | gate-refused | tip-crossed | tip-red | no`) and `sync-pr` refuses `no` (exit 4) and `tip-red` (exit 5:
the deploy tip is red on code, so a sync would import the red; the gate's `base` row holds merges until the fix lands,
#5425). Only the `deploy:red` fixer's own branch syncs onto a red tip, with `--onto-red-tip`. A newest run that ended `cancelled`
after at least one job concluded `failure`, or green only on `run_attempt` > 1 after an earlier attempt had a red job
(merge-gate refuses that green), counts as red for `stale-red`; zero failed jobs (a cancel, a cancel-only re-run) stays `no` (rule 8). A red is stale
when the tip gained a commit after the run started OR when the run's recorded merge base (the tooling A `apex-guards`
annotation) is not the current tip: a `pull/<n>/merge` ref can sit on an older tip than the clock suggests (#5832).

`union-conflict` (#5922): `merge-tree` is clean only because git's union driver joined a `merge=union` path both
sides appended to (`docs/notes/CEILING-HISTORY.md`). GitHub runs no merge driver, so it calls the PR dirty and never
merges it. `sync-pr` runs it as a normal sync, with no force flag: its local merge applies the union.

`retest-refused` (#5554): the head is green, its newest `gate` status is a refusal with `ci=ok gen=ok retest=FAIL`,
and merge-gate's own retest window still names a tip merge the head lacks. The row's evidence says "sync-pr.mjs and
push", and `sync-pr` now runs for it without `--force-clean-behind`. It stays `no` when that status sits on an older
head, or when a newer re-gate replaced it (a `plan` or `hold` refusal from the trusted rows hides the retest row: fix
that row first). A head still behind the tip is a sync even when this clone's window counts no tip merge (#5832).

`gate-refused` (#5832): the head is green and its newest `gate` status (open and ci ok) failed `gen` or `ratchets`:
the merge onto the tip does not regenerate cleanly or breaks a tree-wide ceiling. Sync, then fix what the new CI
run shows.

`tip-crossed`: the head is green and behind with no conflict, and needs-sync's own throw-away merge onto the tip
(merge-gate's `localMergeGenCheck`, the same `gen` and `ratchets` rows) fails one: the tip moved a tree-wide number
under the head (an exact `eagerCodeBytes` re-seed, #5975). It needs no `gate` status, so a draft reaches it.
`sync-pr` runs for it, no force flag; then fix what the new CI run shows. An unreadable merge stays `no` and says
so; `pr-board` skips the merge (it runs `gen:check`), so ask `needs-sync` itself. `--no-merge-check` skips it.

The `retest` row re-runs only the unit
files BOTH the newer tip merges and the PR select, plus the touched `tests/unit` files (#5597), so "too broad to re-test
at merge" now means the two sides really share that much; one PR's own wide selection no longer refuses it.

The fixer is never held, and needs no click from Bryce: branch from the red tip (or `sync-pr --onto-red-tip`) so the
head CONTAINS the red commit, add `deploy:red` to the PR, then flip ready and add `land` in that order. `base` passes
on the label plus that ancestry, and the PR's own green CI on top of the red is the proof. An infrastructure red (a
runner, mirror or setup failure) holds the same way and clears on a re-run of the train, on the daily `pages.yml`
cron, or through that same route with any PR whose CI is green on the tip.

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
