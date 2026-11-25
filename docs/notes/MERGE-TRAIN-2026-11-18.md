# Merge train, 2026-11-18

Kind: design · Re-measure-by: 2026-12-18

Decision: Bryce, orchestrator chat 2026-11-18 ~10:15Z (relayed in its brief with the time), asked "How do we still have so many open PRs can we somehow merge them" and then picked "Merge train (Recommended)". He tapped `config-ok` on #5731 in person at 11:18:45Z. Its docs/DECISIONS.md row is D-035 (#5742).

Summary: 91 open PRs and 23 at `land` (10:12Z) drained at 4–6 merges an hour: each merge moves the tip and every other `land` PR re-gates or retests. A merge train lands up to 12 (10 until #6528) green `land` PRs with one CI run and one `gate`. Native merge queue: not available here. Custom train: `tools/ci/merge-train.mjs` and land.yml's `train` job. It needs no ruleset or settings change. Re-measure: merges per hour and train red rate after a week of trains.

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

- Candidates: open, ready, `land`, no `hold`, not a fork, not a train. `priority` goes first, then oldest. Only a PR
  that is landing alone is skipped: auto-merge armed, or its own `gate` reads success while a land run for it is still
  queued or running (`soloLane`, `landRunsInFlight`; #6528). Until #6528 every car whose `gate` read success was
  skipped as "it arms alone", which orphaned a PR whose arms all lost to the tip (§Orphans). Each candidate's trusted rows must pass. `base` is
  the train's row, and gen, ratchets and retest are measured on the train.
- Screen (#5864): trains #5840 and #5862 closed red on the gate because cars that were each red alone on the tip
  boarded on their trusted rows. land.yml's `train-screen` job (read-only token, no secret) runs
  `merge-train.mjs --screen`. It makes the same fold and runs merge-gate's `ratchetsOnMerge` on each cumulative
  fold, so a car that turns the fold red is left out and the fold stays where it was. The build (`--screen-file`)
  takes only the cars the screen measured green at their head. A missing verdict opens no train, and while a train
  is open the screen skips. #5862 measured alone: #5668 hud.js codeLines and eagerBytes +147, #5679 eagerBytes
  +2057, #5730 assertPins +1. The sum, +2204, is the train's eagerBytes overage.
- Fold onto the tip in order; a conflicting car is left out ("conflicts in … (sync-pr.mjs)") and the next is tried.
  At least 2 cars, unless the bisect cap is 1 or the one car is an orphan (§Orphans).
- One train is open at a time. The builder closes a train when a car moved (`stale`: rebuilt from the current state)
  or when its CI or `gate` failed (`red`).
  With no completed `CI` check-run, it reads the head's newest CI workflow run: cancelled closes the train `stale`,
  failure / timed_out / startup_failure close it `red` (PR #5809; train #5814 waited an hour on a cancelled run).
- A train's browser legs skip the shared PR lanes: select-specs `trainHead` gives every leg of a `train/*` head
  lane -1, a group of its own per leg (PR #5809; train #5804's 42 legs waited 2.7 h in the lanes).
- Bisect: a red train of n cars caps the next at floor(n/2). A car alone in a red train is left out until its head
  changes. A merged train resets the cap to `TRAIN_MAX`, 10 (5 until Bryce's 2026-11-18 ~19:50Z "Bigger trains 5→10"): a red
  train of 10 bisects to 5, 2, then 1. The window is 24 h of closed trains. `TRAIN_MAX` is 12 since #6528 (§Cap).

## Orphans and the default lane (#6528, 2026-11-25)

Bryce, orchestrator chat ~07:00Z: "1 + 2 + 4 now" and "Train re-counts budgets". Evidence: #6444 (head `215eba44`)
read `gate` success at 05:20Z; each of its 3 arms lost to a moving tip; land.yml run 45552131968 logged "retry budget
spent (3 of 3) … the next train re-gates"; train #6524 (06:44Z) then listed it under "Not in this train" as "its own
gate already passed (it arms alone)". It sat about 1h20m; #6451 the same (issue #6528).

- A green `land` PR with `auto_merge` null and no land run of its own in flight is an orphan: it boards. Armed, or a
  run still queued/running for it (a `pull_request_target` run naming it, or a `Land retry pr=<n>` dispatch), it is
  left out as landing alone. Deploy-branch runs (sweep, Pages, schedule) name no PR and are not counted, nor the run
  building the train (`GITHUB_RUN_ID`).
- With that, every green `land` PR that is not mid-arm rides: 2 or more of them make a train at the next train run
  (the :17/:47 schedule or a Pages success), and a lone orphan rides a 1-car train.
- Not changed: land.yml's own arm still takes a PR whose gate passes first (one arm per run); a train still holds its
  cars (`resolveLandable`, `queue_blocker` "car of open train"). The arms that lose the race no longer strand.

## Cap (#6528)

The cap had never bound (docs/notes/PROCESS-REVIEW-2026-11-24.md §3.2: trains averaged 2.5 cars), because green PRs
that armed alone were not candidates. Closed trains from the API, 2026-11-25 07:30Z:

| window | trains | merged / red / stale | per-car red rate (MLE, independent cars) | best single-shot size |
|---|---|---|---|---|
| since 2026-11-18 | 67 | 27 / 21 / rest | 0.185 | ~5 |
| since 2026-11-20 (the screen) | 41 | 20 / 6 / rest | 0.105 | ~9 |

The six reds since the screen: #6061 (gen+ratchets), #6229 and #6346 (retest), #6241 and #6510 (CI), #6473
(ratchets, the stale-fragment shape §Re-snap now cures). Taking one ratchet red out puts the rate near 0.085, whose
single-shot optimum is ~11–12 cars; the bisect recovers part of a red train, which favours the larger side. So
`TRAIN_MAX` = 12 (10 by Bryce's 2026-11-18 "Bigger trains 5→10"). Every 10-car train of 2026-11-19 (before the
screen) closed red; the largest since, 9 cars (#6462), merged. The screen costs about 70 s a car (653 s for 9 cars,
2026-11-25 01:37Z), so `SCREEN_BUDGET_MS` is 16 min (was 12) and train-screen's job timeout 25 min (was 20);
tests/unit/merge-train.test.mjs pins both against `TRAIN_MAX`. Re-measure the red rate by size on the Re-measure-by date.

## Re-snap: the train re-counts line-count fragments (#6528)

#6522 and #6421 went red after another PR merged: a `tests/data/ratchets.d` fragment snapped against the old base
left the merge result over by 1–2 on js/game.js codeLines/lines. A topic branch's `--update` sets a touched file's
ceiling to its value, so a LOOSE base ceiling (slack s) is folded into its delta; a sibling that spends s leaves the
merge over by s although neither grew past its own budget (#6522's fragment: game.js codeLines −2, lines −1).

`resnapTree` re-snaps the car's own fragment on each fold step, with `ratchets.mjs`'s own functions
(`applyFragments`, `mergeFragment`: delta += value − ceiling, as `--update` writes it), never a hand edit. A row is
re-snapped only when all hold (`resnapVerdict`):

- a line-count row (`lines`, `codeLines`) of a file the car changed since its merge base with the train base;
- the fold was not already over on it before this car (someone else's overage is never the car's to raise);
- the commit hook would absorb it (`autoRaiseBlockReason`: at most 40, not a slack-0 entry);
- the overage is at most min(own growth − its fragment's delta, the slack at its merge base): the car gets back exactly
  the slack its own snap counted on. A car over its own ceiling at its head, or growing past it on the merge, is not
  re-snapped; the screen and the gate's ratchets row then red it as before, and `ratchet-raise` stays Bryce's.

It is pure git + JSON (blobs, a private index, `write-tree`): no PR code, so the build job runs it, and `verifyTrain`
re-derives it, so the train head is still a proof: a tree that is the plain merge where a re-snap was due, or a
re-snap that was not due, refuses. The car's commit message and the train body name each re-snap. Tree-wide metrics
are out of scope: the boot wall needs PR code, and the pin counters are already judged diff-relative on the merge.

## Two trains in flight (#6584, 2026-11-25)

Bryce picked "Two trains in flight" at about 10:15Z (relayed by the orchestrator). The next train is built while the
open one runs CI. The change lives in `merge-train.mjs` alone; land.yml is unchanged.
- **Stack.** While train N runs and nothing is stacked, the screen folds the next candidates (none of N's cars) onto
  N's HEAD, in a worktree whose HEAD is that head. The build pushes the fold as a bare ref
  `train-next/<N's head>-<cars>`. There is no PR, and ci.yml has no push trigger, so N+1 runs no CI and holds no
  runner. land.yml still sees one open train. The fold itself is the manifest (`readStack`).
- **Promote.** Once N's head is on the deploy branch (N merged), the build opens N+1's `train/*` PR from that very
  fold. Its manifest base is N's head, which is now on the deploy branch, so `verifyTrain` and every gate row run as
  for any train. Merges stay in order.
- **Restack.** If an N+1 car moves, loses `land` or gets `hold` while N runs, the rest is refolded on N's head.
- **Rebase.** If N closes unmerged (red, stale, or by hand), N+1's cars, without N's, are refolded on the tip and
  opened at once. That train is marked `rebased`, so when it merges it does not end N's bisect: the train after it
  still takes half of N's cars.
- A screen skips while a train is stacked; the build acts on the stack. A screen stacked on a train that closed
  before the build ran opens nothing, and the next run screens onto the tip.
- **Measured** (23 trains opened in the 48 h to 2026-11-25 12:00Z): a merged train takes a median 24 min from open to
  merge, the next train opened a median 23 min later, and a merged train carried 2.6 cars. The stack takes the
  screen (~70 s a candidate) out of that gap, and a red base no longer costs a full screen cycle. The gap is left
  waiting for the next trigger (the :17/:47 sweep or the Pages success, a median 28 min after a merge). The
  land.yml follow-up below closes most of it.
- **Push trigger (land.yml, #6584 follow-up).** `train-screen` and `train` also run on a push to the deploy branch,
  the event `on.push` already carried for the sweep. A merged train N moves the deploy branch, so that push's run
  promotes the stacked N+1 at once (or screens onto the new tip when nothing was stacked). It also cures #6652 nit 4:
  when N merges between one run's screen and its build, the merge push's run queues behind that build in the
  `land-train` job group and re-reads N's state, so no sweep cycle idles. Push runs share the `land-stale-sweep` run
  group: the newest pending push replaces an older one, which re-reads the same state. Not on `train/**` or
  `train-next/**`: a push event runs the pushed ref's own land.yml, which there is the fold of PR code, with
  LAND_TOKEN. Cost: one screen (npm ci, then a skip while a train is open) per deploy-branch merge.

## Speculative CI, stale cars, cleanup and the pause (#6667, 2026-11-25)

Bryce's "Yes, one PR" (about 17:45Z, relayed by the orchestrator) for four changes in `merge-train.mjs`,
`merge-gate.mjs` and land.yml's `train` job.
- **Speculative CI.** When the build pushes the stacked ref, it also opens that same fold commit as a PR of its own
  (`train/<stamp>-<cars>-on<N>`, manifest `onto: N`, label `train`, no `land`). It gets the full `pull_request` tier
  while N runs. Without `land`, land.yml, the builder (`isStackPr`) and the bisect history all ignore it. On promote,
  the build adds `land` to that PR and drops `onto`. No new PR opens and no new run starts: the gate's ci row reads
  that PR's own CI on the same head, and verifyTrain and every car's rows run as before. Its retest row re-tests the
  tip merges since that run (N's merge commit among them) unless every one is already in the head AND the run's
  recorded merge tree (`apex-guards tree=`) is byte for byte the gate's own merge (`sameMergeTree`). Restack, rebase
  and drop close the speculative PR and delete its branch.
- **Cost bound.** At most one run per stacked ref: a PR is opened only at the push that makes the ref, never while
  waiting, and the build never pushes to it. No run starts while N is red (its CI check or run failed, a job failed,
  or a read failed). On the merged path the run costs nothing extra: it is the run the promoted PR used to start. A
  stack closed after its run started wastes that one run (a full tier is ~117 runner-min; trains went red or stale in
  9 of 22 cases over 49 h, so about 45 runner-min per stack on average). The gain is N+1's CI time (median ~16 min)
  taken off every two-train cycle.
- **#6667.** A car that merged outside an open train closes the train `stale` (train #6580 sat ~6 h). A `gate` that
  refuses only its retest row for breadth closes it `stale` too, not red: merge-gate's summary line carries
  `retest-broad`, and `broadRetest` reads it.
- **Cleanup.** Each build deletes `train/*` branches that no open PR has as its head, and `train-next/*` refs whose
  name does not parse. The build already owns train refs, and prune-branches.yml stays dispatch-only ("nothing may
  delete branches on its own").
- **Pause.** The `train` job honours `dispatch:merge-pause` only on Bryce's own click, as resolve, arm and the sweep
  do. An unreadable read still pauses.

## Residual risks (accepted)

- A `hold` added to a car after the train's `gate` success and before GitHub merges the train is not re-read. This is
  the same seconds-wide window as the tip moving after post's read (land.yml header STALE TIP).
- "GitHub marks each car merged" is GitHub's own behaviour when a PR's head commit reaches its base branch. The first
  live train is the proof, and this PR's Plan records it.
- The dispatcher may see a train PR as an unowned PR. It closes within one CI run, and `train` marks it.
