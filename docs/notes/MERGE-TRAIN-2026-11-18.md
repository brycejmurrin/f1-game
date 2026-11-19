# Merge train, 2026-11-18

Kind: design · Re-measure-by: 2026-12-18

Decision: Bryce, orchestrator chat 2026-11-18 ~10:15Z (relayed in its brief with the time), asked "How do we still have so many open PRs can we somehow merge them" and then picked "Merge train (Recommended)". He tapped `config-ok` on #5731 in person at 11:18:45Z. Its docs/DECISIONS.md row is D-035 (#5742).

Summary: 91 open PRs and 23 at `land` (10:12Z) drained at 4–6 merges an hour: each merge moves the tip and every other `land` PR re-gates or retests. A merge train lands up to 10 green `land` PRs with one CI run and one `gate`. Native merge queue: not available here. Custom train: `tools/ci/merge-train.mjs` and land.yml's `train` job. It needs no ruleset or settings change. Re-measure: merges per hour and train red rate after a week of trains.

## The two options

**GitHub merge queue (native).** Not available: "Pull request merge queues are available in any public repository
owned by an organization, or in private repositories owned by organizations using GitHub Enterprise Cloud"
(docs/notes/AGENT-RESEARCH-2026-10-28-CICD.md §merge queue, which quotes the docs page). `brycejmurrin/f1-game` is
owned by a user account. A move to an organization would also need every workflow to handle `merge_group` and `gate`
to be posted on merge-group refs. That is a repository move, not a config proposal, so it was not pursued.

**Custom train (built).** It uses the existing landing route without change. A train is an ordinary PR whose head
branch is `train/<stamp>-<cars>`, opened with `land` + `train` by LAND_TOKEN (so `pull_request` CI runs on it). It
lands through CI, then `gate`, then arm, with a merge commit. Every car's head is then in the deploy branch, so
GitHub marks each car merged. Nothing new merges, arms or pushes the deploy branch. The ruleset ("Deploy-reset",
one required check `gate`) is untouched.

## What the train is allowed to do

- Read GitHub state. Fetch car heads as git objects into the deploy-branch checkout. Write merge commits with
  `git merge-tree --write-tree` + `git commit-tree`: no worktree, no hooks, no npm, no PR code.
- Push ONE branch `train/*` (LAND_TOKEN), open ONE PR from it into the deploy branch, label it `land` and `train`.
- Close its own train PR (with a result marker and one comment) and delete its `train/*` branch.
- Nothing else: it never pushes a car's branch, the deploy branch or a label on a car. It never merges, arms,
  cancels or re-runs. `dispatch:merge-pause` stops it.

## How the train's gate keeps every per-PR row binding

`merge-gate.mjs` treats a `train/` head branch as a train. Its rows:

| row | measured on |
|---|---|
| open, hold, plan | the train PR (its body is a closed Plan with the gate-exempt `land:` item) |
| ci | the train head's own `CI` run (full tier: the train is never a draft) |
| base | the deploy tip, as for any PR |
| config, raise | **each car**: head = the fold of the manifest's car heads onto a deploy-branch commit (first-parent chain, second parents, each tree = the clean merge-tree of its parents), then per car: open at that head, `land`, and its own open, hold, plan, ci, config and raise rows (`evaluate --trusted`) |
| gen, ratchets, retest | the train head merged onto the current tip, as for any PR |

So Bryce's `config-ok` and `ratchet-raise` stay per PR, and a `hold` on any car refuses the train. A car that changes
its head, loses `land` or gets a red row refuses the train too. A forged `train/` branch fails the proof: any byte
that is not a clean merge of the named heads onto a deploy-branch commit refuses.

## Picking and bisecting

- Candidates: open, ready, `land`, no `hold`, not a fork, not a train. `priority` goes first, then oldest. A car whose
  own `gate` already reads success is skipped: it arms alone. Each candidate's trusted rows must pass. `base` is
  the train's row, and gen, ratchets and retest are measured on the train.
- Fold onto the tip in order; a conflicting car is left out ("conflicts in … (sync-pr.mjs)") and the next is tried.
  At least 2 cars, unless the bisect cap is 1.
- One train is open at a time. The builder closes a train when a car moved (`stale`: rebuilt from the current state)
  or when its CI or `gate` failed (`red`).
  With no completed `CI` check-run, it reads the head's newest CI workflow run: cancelled closes the train `stale`,
  failure / timed_out / startup_failure close it `red` (PR #5809; train #5814 waited an hour on a cancelled run).
- A train's browser legs skip the shared PR lanes: select-specs `trainHead` gives every leg of a `train/*` head
  lane -1, a group of its own per leg (PR #5809; train #5804's 42 legs waited 2.7 h in the lanes).
- Bisect: a red train of n cars caps the next at floor(n/2). A car alone in a red train is left out until its head
  changes. A merged train resets the cap to `TRAIN_MAX`, 10 (5 until Bryce's 2026-11-18 ~19:50Z "Bigger trains 5→10"): a red
  train of 10 bisects to 5, 2, then 1. The window is 24 h of closed trains.

## Residual risks (accepted)

- A `hold` added to a car after the train's `gate` success and before GitHub merges the train is not re-read. This is
  the same seconds-wide window as the tip moving after post's read (land.yml header STALE TIP).
- "GitHub marks each car merged" is GitHub's own behaviour when a PR's head commit reaches its base branch. The first
  live train is the proof, and this PR's Plan records it.
- The dispatcher may see a train PR as an unowned PR. It closes within one CI run, and `train` marks it.
