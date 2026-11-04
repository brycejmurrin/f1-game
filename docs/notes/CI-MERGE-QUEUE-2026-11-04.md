# Merge queue for the deploy branch: blocked by repo ownership (#4836)

Re-measure-by: 2026-12-04

## The blocker

#4836 asks for GitHub's merge queue (`merge_group` in ci.yml, pages.yml trusting a green `merge_group` run, `land`
enqueueing). GitHub does not offer it to this repository:

- `gh api repos/brycejmurrin/f1-game --jq .owner.type` = `User` (read 2026-11-04 02:30 PST).
- "Pull request merge queues are available in any public repository owned by an organization, or in private
  repositories owned by organizations using GitHub Enterprise Cloud."
  (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue;
  quoted in [AGENT-RESEARCH-2026-10-28-CICD.md](AGENT-RESEARCH-2026-10-28-CICD.md) §2.)
- The "Require merge queue" rule cannot be turned on in the "Deploy-reset" ruleset, so a `merge_group` trigger never
  fires. ci.yml carried exactly that dead trigger until 2026-10-14
  ([ACTIONS-AUDIT-2026-10-14.md](ACTIONS-AUDIT-2026-10-14.md) finding 7). This PR does not add it back.

## Runner minutes, measured

All completed ci.yml and pages.yml runs created 2026-11-03 05:10 → 2026-11-04 02:14 PST (21 h): 422 runs. Job-minutes
are the sum of `completed_at − started_at` over the jobs that ran (`actions/runs/<id>/jobs`, skipped jobs excluded).
"Full" means the smoke job ran (the ready tier); "draft" means it did not.

| kind | runs | job-min | per run |
|---|---:|---:|---:|
| PR full tier (success / cancelled / failure) | 126 / 14 / 10 | 9,079 / 1,566 / 695 | 72 / 112 / 70 |
| PR draft tier (success / cancelled / failure) | 106 / 22 / 4 | 5,262 / 2,322 / 368 | 50 / 106 / 92 |
| Pages train gate (success / cancelled / failure) | 21 / 6 / 8 | 4,026 / 1,729 / 1,744 | 192 / 288 / 218 |
| **total** | 422 | **26,790** | |

The PR full tier is 11,340 job-min (42 %), the train 7,499 (28 %), drafts 7,952 (30 %). Every train run in the window
gated: the tree-reuse skip fired 0 times, as #4836 says.

## What each route would save

- **Merge queue (needs an organisation owner).** The queue's `merge_group` run would be the one full gate per batch,
  doing the train's job on the tree that lands, and the PR's ready tier could drop to draft + selected. Saving ≈ the
  PR full tier, ~11,300 job-min per 21 h (~42 %), with no loss of evidence. Cost: moving the repo to an organisation
  moves the Pages origin ("we don't redirect GitHub Pages associated with the repository",
  https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository), which
  strands the installed iPhone PWA and its localStorage saves, unless a custom domain keeps the origin.
- **No queue, no ready tier.** `ready_for_review` starts no new tier; `gate` reads the draft run already green on the
  same head, and the train stays the full gate after merge. Same ~42 % saving, but a red that only the full tier
  (node-suites, smoke, sweeps, staged-boot) catches lands on the deploy branch first and is fixed forward; 8 of 35
  trains failed in the window.
- **Keep today's tiers.** No saving; nothing changes.

Only Bryce can choose (an org transfer, or giving up the pre-merge full tier); the choice is recorded on the PR as a
`needs-decision` comment. No workflow changes until he answers.
