# CI merge burst, 2026-10-02/03: 30 merges held off the site

## What happened

- The live site sat at `5ed4c66` (#759) while 30 PRs merged on top of it,
  most in about 90 minutes (≈22:23–23:48 UTC), mainly Cursor agents' tooling
  and test-fix PRs. The last successful Pages publish before the burst was
  21:02 UTC.
- Every deploy-branch push ran its own fast tier (`ci.yml` keyed each push on
  `github.sha`, so no merge cancelled another): ~25 jobs per merge, about 750
  jobs queued against the 40-job account limit. PR runs of the same PRs
  competed for the same slots.
- `poke-train` only pokes the Pages train from the TIP (2026-09-29, after a
  burst dispatched 57 trains in 41 h — `CI-CAPACITY-2026-09-29.md`). In a
  burst each run finished after the next merge had landed, so every run
  printed `NOT POKING: the tip moved` and nothing deployed until the burst
  ended. The `pages.yml` cron backstop runs hours late on GitHub.
- Measured: 42 jobs running at once against the 40-job limit while the
  deploy waited for runners (`gh api .../actions/runs?status=…`, 2026-10-02
  23:5x UTC).

## What changed (2026-10-03)

1. **One fast tier at a time on the deploy branch.** Pushes to
   `claude/f1-game-project-26h3ng` share one concurrency group, `ship-fast`,
   with `cancel-in-progress` false. GitHub keeps at most one pending run per
   group and replaces it with the newest
   (https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency),
   so a burst costs one running fast tier plus the newest waiting push. A
   running fast tier is never cancelled (the reason the old `ship-push` +
   cancel group was retired). Commits skipped in the middle of a burst are
   tested by the next run, which contains them.
2. **A superseded green run pokes when no train is moving.** `poke-train` still
   pokes from the tip; it now also pokes from a commit that is no longer the
   tip when no `pages.yml` run on the branch is queued or running. A
   dispatched train gates the branch tip, so that poke ships everything merged
   so far, and the "no train moving" condition keeps it to one train at a
   time.
3. **Merge pacing** (AGENTS.md §Concurrent PRs): batch small tooling/doc fixes
   into one PR, and do not arm auto-merge on more than two PRs at once per
   session. GitHub's merge queue would batch merges automatically, but it is
   offered only to organization-owned public repositories and Enterprise Cloud,
   not to a personal account's repository
   (https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/).

## What did not change

- PR runs: newest-wins cancel per PR branch, as before.
- The train itself: `pages.yml` gates one commit and publishes that commit,
  one gate at a time, never cancelled.
- Cancelling other sessions' runs by hand is not a fix: they re-run them
  (2026-10-03, a session re-ran a PR's ready-state CI and two browser groups
  that a queue sweep had cancelled).

## How to re-measure

- `gh api "repos/brycejmurrin/f1-game/actions/runs?status=in_progress&per_page=100"`
  and `status=queued`: count runs and their jobs during the next burst.
- Live lag: the site's `apex-sha` meta vs the branch tip
  (`git log --merges --first-parent <live>..<tip> | wc -l`).
- In a burst, `poke-train` summaries should read `POKING from a superseded
  commit` about once per train, not `NOT POKING` on every run.
