# CI clog survey, 2026-10-15 (00:00 to 05:30 UTC)

Measured from the Actions REST API through the repo's own `tools/ci/ready-full-cap.mjs` `api()` helper
(300 newest ci.yml runs, the jobs of 30 of them, per-day `created=` counts for 8 days, the last 100 runs of
every other workflow, check-run annotations on three cancelled runs), plus `.github/workflows/*.yml`,
`tools/ci/`, `docs/notes/ACTIONS-AUDIT-2026-10-14.md`, `CI-CAPACITY-2026-09-29.md`,
`CI-MERGE-BURST-2026-10-03.md`, `CI-PAGES-SINGLE-FLIGHT-2026-10-06.md`, and the open CI PRs
#1758, #1947, #1959, #1974, #1938. GitHub docs read today: Actions limits
(https://docs.github.com/en/actions/reference/limits), workflow syntax `concurrency`
(https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), merge queue availability
(https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request-with-a-merge-queue).

## 1. The pipeline as built

| workflow | trigger | what it runs | concurrency | note |
|---|---|---|---|---|
| `ci.yml` (2,687 lines, ~54 % comments) | PR (opened/sync/reopened/ready), push to the deploy branch, nightly 04:17, dispatch, `workflow_call` from pages.yml | FAST tier (draft PR, deploy push): reuse-draft, unit-plan, guards A/B + aggregator, 6 node slices, parts census, driving-model, select, selected-verdict, CI. FULL tier (ready PR, train): adds ship-filter, smoke, 4 sweeps shards + roll-up, renderer-filter/macos, xr-filter/xr, selected browser legs | `ci-<head.ref>` cancel-in-progress on PRs; `ship-fast` no-cancel on deploy pushes; unique key for train/nightly/dispatch | 12 required checks pin job NAMES: Structural guards, Parts census, Driving model, Select specs, Selected specs (verdict), Docs guards, the six `Pure-node unit suites (<slice>)` |
| `docs-guards.yml` | every PR event | one job, 13 s when any code path changed, ~1 min on prose-only | per PR branch, cancel | required check; redundant since 2026-10-14 (audit finding 5); waits on Bryce removing the context |
| `pages.yml` | cron 41 * * * *, dispatch (poke-train) | verdict → reusable ci.yml full gate → publishable → deploy → verify-live → rearm | `pages-train-<ref>` no-cancel, job groups `pages-gate`, `pages` | 14 runs/day, gated publish p50 18 min, p90 31 |
| `browser-group.yml` | dispatch (`remote-group.mjs`) | one browser group, time-packed shards | per branch+group, cancel | 22 runs/day, p50 14 min |
| `fleet.yml` | cron :23 hourly, dispatch from `who-is-on-it --claim/--release` | board/labels | `fleet-board` no-cancel | 80 runs today by 05:30, 62 % cancelled (pending replaced); debounce landed in 979b9728 |
| `gpu-census.yml` | nightly 05:47, dispatch, push to cursor/claude branches with a request file | macOS census | per request | 11 runs/day, 5 macOS slots |
| `desktop.yml` | PR + push, path-filtered | pack smoke (3 OS) | per PR | 11 runs/day, healthy |
| `spec-timings.yml` | workflow_run of the train | merges junit timings to `bot/spec-timings` | single | 8 runs/day |
| `garage-before`, `car-shot`, `hud-survey`, `import-models`, `prune-branches`, `repo-size` | dispatch / daily | tooling | own groups | not on the PR path |

Composite actions: `setup-apex` (Node 22 + `npm ci`, cache hit ~30 s), `playwright-chromium` (cached, 100 % hits),
`mesa-xvfb` (apt, 11 s median). Pins are all SHA pins.

The account is GitHub Pro: 40 concurrent standard jobs, 5 macOS. The repo is public, so minutes are free. The only
scarce resource is a concurrent job SLOT, and the thing that burns a slot is a JOB START, not a test minute.

## 2. What today measured

Runs per day (all workflows / ci.yml / ci.yml PR / ci.yml cancelled):

| day | all | ci.yml | PR runs | cancelled |
|---|---|---|---|---|
| 10-08 | 89 | 39 | 24 | 1 |
| 10-09 | 232 | 110 | 81 | 16 |
| 10-10 | 1,050 | 496 | 413 | 195 |
| 10-11 | 472 | 244 | 197 | 83 |
| 10-12 | 56 | 22 | 14 | 8 |
| 10-13 | 89 | 24 | 21 | 7 |
| 10-14 | 1,564 | 770 | 615 | 225 |
| 10-15 (to 05:30) | 916 | 419 | 401 | 306 |

Today, 00:25 to 05:26 UTC, 300 PR runs ≈ 60 per hour. Open PRs at 05:20: 62, of which 56 drafts and 6 ready, almost all
Cursor or Claude agents. Deploy-branch merges: 97 yesterday. Live queue at 05:22 (`queue-depth.mjs`): 53 Linux jobs in
flight from 8 runs, 12 queued, verdict `hold`.

Green PR runs sampled today (13): wall 16 to 105 min, p50 ~54 min. Per-job queue wait (job created → first step), p50 in
minutes, across those runs:

| job | runner-min p50 | queue wait p50 |
|---|---|---|
| Reuse draft fast-tier? | 0.1 | 13.3 |
| Plan node unit slices | 0.7 | 11.7 |
| Select specs for this change | 0.4 | 12.3 |
| Structural guards (tooling A / B) | 6.3 | 9.9 |
| Structural guards (aggregator) | 0.7 | 2.1 |
| node slice row | 2.3 (0.1 when unneeded) | 10.8 |
| Parts option-resolution census | 0.3 | 10.4 |
| ship / renderer / xr filter | 0.2 to 0.6 | 7 to 9 |
| sweeps shard | 0.3 (filtered) | 9.0 |
| Selected browser leg | 5.5 | 13.7 |
| Smoke | 2.8 | 7.7 |
| Selected specs (verdict), CI | 0.1 to 0.2 | 0.5 to 1 |

Read: the fast tier does ~20 runner-minutes of real work per draft push and ~140 per ready push, but it is spread over
16 (draft) to 37 (ready) job starts with a serial chain of 5 queue hops (reuse-draft → guards A/B → guards →
selected-verdict → CI; unit-plan → node rows in parallel). At today's load each early hop costs 10 to 14 minutes of
waiting, so a draft run with 7 minutes of work on its critical path takes 40 to 80 minutes of wall time.

Cancellations (206 cancelled PR runs in the 300 sample):

- 0 were superseded by a newer run on their own branch. All 206 were cancelled from outside.
- 142 of 206 fell in 17 one-minute bursts (13 at 03:23, 27 at 04:08, 17 at 04:50 and 17 at 04:51 …).
- Check-run annotations read `The run was canceled by @brycejmurrin` (manual sweeps under the owner's account, by a person
  or by a session holding that token). The one same-branch cancel seen read `higher priority waiting request`, the normal
  per-PR replacement.
- Cancelled runs had lived p50 39 min, p90 105 min; most had 0 jobs started, so cancelling them freed no slot, it only
  threw away their queue position.
- Agents then push `ci: retrigger fast tier after cancelled run` commits (6 in the sample, all after a sweep), which buys
  a brand-new run at the back of the queue plus another docs-guards run.

What starts PR runs (300 sample, by head commit):

| kind | runs | cancelled |
|---|---|---|
| base-branch merge into the topic (sync) | 146 (49 %) | 110 |
| real work commit | 148 | 104 |
| retrigger commit | 6 | 1 |

102 of the 300 head commits have committer `GitHub`, i.e. GitHub's update-branch button or API (PR #1959 measured 107 of
312 at 03:25 and denies the MCP tool; the button and Cursor's own sync remain).

## 3. Where the clog comes from, ranked

1. **Demand is about twice the slot capacity.** ~60 PR runs/h × ~16 to 37 job starts, each job holding a runner for
   ~0.5 to 6 min plus ~30 s of provisioning and `npm ci`. 40 slots deliver roughly 500 to 700 job completions an hour at
   this mix. Everything else below is a multiplier on this ratio.
2. **Half the pushes are syncs, not work.** 49 % of PR runs test a base merge the policy already says not to make
   (SYNC ONLY WHEN YOU MUST). A third of all runs come from GitHub's update-branch path specifically.
3. **Manual cancel sweeps plus retrigger pushes.** A queued run costs nothing; cancelling it and re-pushing costs a second
   run, a second docs-guards run, and resets the queue position. 73 % of today's PR runs ended cancelled.
4. **Plumbing job starts.** Per draft run: reuse-draft (does nothing except on `ready_for_review`, yet every job on the
   critical path `needs` it), unit-plan, select, guards aggregator, selected-verdict, CI, and up to 5 unneeded node rows
   that exist only so six required check NAMES report. That is 6 to 11 job starts of ~0.1 to 0.7 runner-min each, but each
   one is a full queue wait (7 to 14 min today). Ready runs add 3 filter jobs and the sweeps roll-up.
5. **The 12 required-check names freeze the job shape.** Matrix rows cannot be dropped, slices cannot be renamed or
   rebalanced (`vm-b1` 12.3 min vs `slow` 3.3 per #1758's measurement), docs-guards cannot be deleted, and
   selected-verdict cannot fold into CI, all because branch protection names them.
6. **docs-guards: one extra run per PR event** (615 yesterday, 404 today), 0.2 to 0.4 runner-min each, 13 s of
   `git diff` then exit. Cheap per run, but it is a job start on every push and a required context that queues alone.
7. **fleet.yml dispatch bursts** (80 runs today, 50 cancelled pending): now debounced (979b9728) and #1974 halves the cron.
   Small.

Not a cause today: macOS (0 in flight), Pages (3 trains today, train p50 18 min), browser-group dispatches (0 today),
Chromium/Mesa setup (cached), per-test cost of the fast tier (~20 runner-min).

## 4. Options, with what each buys

### A. Behaviour, no code (biggest, free)

- No sweeps of queued runs. A pending run holds no slot. Cancel only runs of closed PRs; #1947's
  `ci-cancel-on-close.yml` automates that. Every sweep today produced a retrigger push.
- No update-branch syncs. #1959 denies the MCP tool; the remaining sources are the GitHub button and Cursor's sync.
  Sync only on CONFLICTING or a red tip, through `sync-pr.mjs`, and push once.
- Enforce the queue hold at push time: `bash-guard.sh` refusing `git push` while `queue-depth.mjs` says hold (named as a
  "larger lever" in #1959 and #1938, not done). Agents commit locally and push when the gauge clears.

### B. ci.yml reshaping, no settings change (lands as one PR; overlaps #1758's "deferred" list)

1. **One plan job** replacing reuse-draft + unit-plan + select (+ the three filters on ready runs). reuse-draft is
   skipped unless `github.event.action == 'ready_for_review'`; its output defaults to false. Removes 2 to 5 job starts and
   one 12-minute hop from the head of every run. Dependents switch to `!cancelled() &&` conditions.
2. **Draft runs emit only the needed node rows.** Required names matter at merge time, and a draft cannot merge; the
   `ready_for_review` run (which reuses a green draft head) emits all six. Saves up to 5 job starts on docs/tooling PRs.
3. **Guards aggregator becomes a no-checkout job**; ratchets + audit + coverage run at the end of shard B (or whichever
   shard the timings say is shorter). Keeps the required name, drops an `npm ci`.
4. **Admission control with `queue: max`** (new GitHub feature, verified today in the syntax reference): job-level
   `concurrency: { group: <lane>, queue: max }` queues up to 100 jobs FIFO per group instead of cancel-replace. Put it on
   the ready-tier browser legs and smoke (lanes `browser-1..N`) so at most N browser legs run fleet-wide and the rest wait
   without holding a slot or being cancelled. This replaces the Merge Desk's manual `ready-full-cap` rule with a GitHub
   enforced one. It cannot be combined with `cancel-in-progress: true` in the same block, so it goes on jobs, with the
   workflow-level per-PR cancel kept.
5. Keep `fail-fast: false` and the existing per-PR cancel; nothing in the test content changes.

Expected draft shape after B1 to B3: ~9 job starts (plan, guards A, guards B, guards, 1 to 6 node rows, parts,
driving when routed, CI/verdict) and 3 hops instead of 5.

### C. Settings and plan (Bryce)

1. **One required check instead of twelve.** Make the aggregator `CI` (or a new fast-tier aggregator that always reports)
   the only required context. Then matrix rows can vanish, slices can be renamed and rebalanced, docs-guards can be
   deleted, and selected-verdict can fold into CI. This is the single change that makes every later job split or merge
   free. `ci-verdict.mjs` already treats skipped siblings as pass and fails on any failed or cancelled needed job.
2. Remove `Docs guards (prose-tree unit files)` from the required list, then delete the workflow (audit Lane B1).
3. **Ask GitHub Support to raise the job concurrency limit.** The limits page says Support can increase it on request.
   Cheapest capacity lever; worth a ticket before any larger move.
4. Alternative capacity: Team plan is 60 jobs, and an organisation-owned public repo gets the merge queue (which would
   also end the sync loop: it tests the merged result once). Moving the repo to an org changes the Pages URL and every
   `brycejmurrin/f1-game` literal in the tools, so it is a real migration, not a toggle.

### D. Splitting the workflow file itself

Splitting `ci.yml` into a fast-tier workflow and a full-tier workflow does not by itself reduce the clog: the slot cost
is job starts per push, and the split keeps every job. It would buy readability (2,687 lines), independent concurrency
groups, and the option to chain the full tier `workflow_run` after a green fast tier so a red draft never spends browser
legs. The costs are real: pages.yml's reusable call, `pages-reuse-verdict.sh`, `ci-coverage.test.mjs`, `deploy.mjs`'s
text-derived node half and `ready-gate.mjs` all name ci.yml's job set. Do it after C1, when names are free to change,
not before.

Splitting JOBS finer is the wrong direction under slot contention: every extra job is another queue wait and another
`npm ci`. The right split is already there for the heavy work (node slices, selected legs, sweeps shards); the fix is to
merge the plumbing.

## 5. Recommendation

Order: A (today, zero code) → C1 + C2 + C3 (Bryce, minutes) → B1 to B4 in one ci.yml PR (overlapping #1758's deferred
list; coordinate with its owner) → D only if the file is still too large to review.

Re-measure after each step with the same three numbers: PR runs per hour, cancelled share, and the p50 queue wait of
the first job in a run (`actions/runs/<id>/jobs`, first step start minus job `created_at`).

## 6. What changed (2026-10-15, the fix PR)

Landed in the same change as this note (stacked on #1758, which carried the audit's lane C):

- **ci.yml**: `reuse-draft`, `unit-plan`, `ship-filter`, `renderer-filter` and `xr-filter` are no longer jobs.
  The ready_for_review reuse question is a first step of every job that used to wait on it; the node-slice plan and
  the three path filters are steps of `Select specs for this change` (the one plumbing job left, and a required
  name). The `Structural guards` aggregator checks out nothing: ratchets, `test:audit`, `ci-coverage` and
  behind-ship run at the end of tooling B. A draft PR's plan lists only the needed node rows (`--needed-only`),
  and node-suites skips at the job level when none is; every other event keeps the six required names reporting.
  Per draft push: 16 job starts and 5 hops before, about 9 and 3 after; per ready push, 5 job starts fewer.
  `renderer-macos` and `xr` carry the `!inputs.concurrency_key` deploy-gate opt-out on their own `if:` now.
- **Hooks**: `bash-guard.sh` refuses `git push` while `queue-depth.mjs` says hold (rule 4, enforced; `APEX_PUSH_HOLD=0`
  overrides when the user asked for the push now) and refuses any Actions run cancel (`gh run cancel`,
  `…/actions/runs/<id>/cancel`); `github-mcp-guard.sh` denies `actions_run_trigger cancel_workflow_run` and asks on
  a re-run (`APEX_RUN_CANCEL_OK=1` when the user asks). AGENTS.md rule 4 and §Concurrent PRs say so.
- **Not in this change** (needs the owner): one required check instead of twelve, Docs guards off the required list
  (then the workflow deletion), the Support ticket for the 40-job limit, and the merge-settings flips. The
  `queue: max` admission control for ready-tier browser legs is a follow-up once the required-check change frees
  the job names.

Later the same day Bryce moved the deploy branch's protection to the single `CI` check, dropped `Docs guards` from it and turned off squash merging (rebase merging was still allowed when the repository settings were read at 07:58 UTC — §8); `.github/workflows/docs-guards.yml` was then deleted (one job start per PR event, 615 runs on 2026-10-14; `test:docs-guards` stays as the local alias). The job names are free to change now, so the `queue: max` browser lanes and a node-slice rebalance need no further settings round.

Then (same day, once `CI` was the one required check): every pull request's node plan lists only the needed slices (`--needed-only` on ready PRs too; a deploy push and the train keep all six rows for the train's reuse check), and the ready tier's browser legs queue per lane in GitHub — `selected` legs on 12 `concurrency: { group: selected-lane-<n>, queue: max }` groups (the lane is a field of every matrix row, `select-specs.mjs` LANES) and smoke on one lane per shard index — so at most 12 selected legs and 1 smoke run fleet-wide at once and the rest wait FIFO without a runner; the train, the nightly and a dispatch get a group of their own per leg. `ready-full-cap.mjs` still bounds ready RUNS at the desk; the lanes bound LEGS in GitHub.

The first train on the folded workflow (773bb047) went red on one `selected` leg, `oversize-career`: a 45 s boot timeout
with the Bahrain menu backdrop not even started until 44.6 s, while the leg's second Playwright worker ran three track builds
on the same 2-vCPU llvmpipe runner; 36 of 37 tests and both sibling career legs passed, and a per-change cost audit of the
diff since the last green (the save-schema registry: 0.11 µs per store write, no validator or new gate before `__apex`)
found no boot regression. The fat-UI specs (career, career-season, career-hub, hud-layout) now plan as at least two native
`--shard` pieces of ONE worker each (`select-specs.mjs` FAT_UI_MIN_PIECES) instead of one two-worker leg: same wall time,
every test owns its runner, one more job start per fat spec, bounded by the lanes.

Re-measure with the same three numbers as §5 after a day of agent traffic.

## 7. The node-suites wall, measured per script (2026-10-15, follow-up PR)

The six `Pure-node unit suites (<slice>)` rows run on every deploy push and every train, so their slowest row is a
floor under both. Per-script wall times from the job logs (start-to-next-start, which agrees with node's own
`duration_ms` within 0.2 s) of the three newest green ship pushes on the deploy branch (runs 38688888761,
38687112915, 38686034818; every script ran in full in all 18 jobs; ubuntu-24.04 hosted, 4 vCPU; setup ~15 s a row):

| row | job median | its scripts (median s) |
|---|---|---|
| vm-a1 | 133 s | game-vm-a shard 1/2 112 |
| vm-a2 | 130 s | game-vm-a shard 2/2 110 |
| vm-b1 | 638 s | game-vm-b1 437 (498 over six runs) + the ten riders 180: garage-unit 94, net-unit 33, audio-unit 33, steering-unit 6, mcp 5, state-unit 5, service-worker 4, desktop-unit 0.5, lifecycle-unit 0.2, agent-contract 0.1 |
| vm-b2 | 241 s | game-vm-b2 220 |
| page | 525 s | vm-page 506 (one TAP test, no per-spec breakdown in the log) |
| slow | 201 s | node-slow 168 |

Two things the "time-balanced halves" story missed: `game-vm-b1` alone is twice `game-vm-b2` on a runner (the 367 s
each in §5 of TESTING.md was a local `--jobs=4` number), and the "seconds each" riders had grown to three minutes.
Per-file durations for the 59 `game-vm-b` files came from the same logs: TAP reports files in command-line order with
a `duration_ms` per top-level test, attributed to files by test name (exact match, forward-fill for dynamic names;
±10 s between adjacent files, totals exact). The big ones: race-flow-fixes-vm 208, car-fields-vm 190, ai-racecraft-vm
~100, real-replay-vm 98, mechanics-integration-vm 72, game-round2-vm 68, agent-view-vm 64, quali-pace-parity-vm 62,
race-settings-vm 52; the old b1 summed to 1087 s of serial test time, b2 to 626.

What changed (this PR):

- The ten riders moved off `vm-b1` onto the three light rows, greedy by median: `vm-a1` += net-unit, audio-unit,
  state-unit, desktop-unit (~183 s of work); `vm-a2` += garage-unit (~204 s); `slow` += steering-unit, mcp,
  service-worker, lifecycle-unit, agent-contract (~183 s). ci.yml case arms only; `pick-unit-slices.mjs`
  `SLICE_SCRIPTS` now mirrors the arms (it listed the riders under `vm-b2` while ci.yml ran them on `vm-b1`, so a
  `js/audio/` diff selected the wrong runner) and its test pins the two together.
- `game-vm-b1` / `game-vm-b2` re-cut in `tests/groups.json` by the per-file medians (longest-processing-time, 29 + 30
  files, ~850 s a side; `phone-pad-netplay-vm` stays on b2 so the 2026-09-29 replay test keeps its anchor). Projected
  row wall ≈ 1.06 × max(sum/3, longest file): ~300 s each, ±15 %.
- Projected job walls: page ~520 s (the floor now), vm-b1 ~320, vm-b2 ~320, vm-a2 ~220, vm-a1 ~200, slow ~200 — the
  node gate's wall drops from vm-b1's 10.6 min (12.3 over twelve runs) to vm-page's 8.7, with the same runner-minutes.
  The only lever below 8.7 min is splitting `adapted-specs.test.mjs` across two rows.

Re-measure the six job medians after a day of deploy pushes; `SLICE_COST_P50_SEC` carries the projection until then.

First measurement (the ship push on the merge, caf37bd6, run 38700490935, 07:42 UTC, every row in full; job seconds
with setup): vm-a1 236, vm-a2 278, vm-b1 286, vm-b2 361, page 422, slow 220. Wall 422 s (7.0 min) against 638 s
before; vm-b2 came in ~40 s over its projection (car-fields-vm's 190 s single file is that row's floor, and the
±10 s per adjacent pair adds up), vm-b1 under. `SLICE_COST_P50_SEC` carries these six until a day of runs gives a
median. The run itself was cancelled at its last two jobs by the owner-account sweeper once 5bc46eb6 became the tip
(0 failed), so the train for the rebalance rides the next tip's run.

## 8. Repository settings record (read 2026-10-15 07:58 UTC)

The settings are owner-set and live outside git, so this is the committed record agents read; re-read the API before
trusting it a week on. Repository (`GET /repos/brycejmurrin/f1-game`, 200): `allow_merge_commit` **true**,
`allow_squash_merge` **false**, `allow_rebase_merge` **true** (still on — AGENTS.md §Concurrent PRs says merge commits
only, and both MCP/`gh` doors refuse a rebase merge, so the hooks cover the gap until the owner unticks "Allow rebase
merging" under Settings → General → Pull Requests), `allow_auto_merge` true, `delete_branch_on_merge` **true** (GitHub
retargets a stacked PR to the deploy branch when its base branch is deleted on merge; the 2026-10-02 hand-retarget note
predates this), `merge_commit_title` MERGE_MESSAGE / `merge_commit_message` PR_TITLE, default branch
`claude/f1-game-project-26h3ng`. Ruleset `Deploy Ruleset` (id 22828280, active, no bypass actors) on
`refs/heads/claude/f1-game-project-26h3ng`: `non_fast_forward` and `deletion` — no required checks live there.
Classic branch protection on the deploy branch holds the required status check; its endpoint answers 403 to the
agents' token (admin scope), so the required-check list is the owner's statement plus the PR UI: **`CI`** alone since
2026-10-15 (twelve names before: the six `Pure-node unit suites (<slice>)`, `Structural guards`, `Selected specs
(verdict)`, `Docs guards (prose-tree unit files)` and three more; `Docs guards` was removed first, then its workflow
deleted). What the repo derives from this: `tests/unit/ci-coverage.test.mjs` pins that every job feeds `CI` and that
`pull_request` is unfiltered; `tools/ci/ready-gate.mjs` still reads `Structural guards` by name for the draft→ready
gate; the six slice names stay stable for `pages-train.mjs` and the tests, not for protection.
