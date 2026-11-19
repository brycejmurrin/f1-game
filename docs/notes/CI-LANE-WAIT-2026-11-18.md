# CI lane wait, 2026-11-16/17 (#5536, #5519)

Kind: measurement · Re-measure-by: 2027-01-15

Summary: Over 48 h, a PR's selected browser legs waited 6 to 12 times as long as they ran. The 24 `selected-lane-<n>` groups made the wait, not the runner pool. Wide runs (11+ legs) put 2–3 legs into every lane, and one-leg fixes queued behind them: 1–2-leg runs had a wall p90 of 67.6 min while using 0.7 % of leg-minutes. What changed: a plan of at most two legs skips the lanes (`tools/ci/select-specs.mjs` `SMALL_RUN_LEGS`). What did not: superseded heads are already cancelled (0 jobs started after the newer head's run was created). #5519's mirror-independent apt install held: 0 set-up failures in 2,106 Mesa steps.

Measured read-only from the Actions REST API on 2026-11-18 (`gh api`): every `ci.yml` and `pages.yml` run created
since 2026-11-16 04:00Z, then every job of each run with `filter=all` (all attempts), steps included. The source
table is the #5536 comment of 2026-11-18. Method: queue = job `started_at − created_at`; wall = run `created_at` to the
last job's `completed_at`. A leg's lane cannot be read from the API: it is in the matrix row, which a job name
truncates.


**Window.** Every `ci.yml` and `pages.yml` run created since 2026-11-16 04:00Z: 102 PR runs (51 draft, 51 ready), 1 nightly, 28 Pages trains; 131 of 132 runs' jobs read (all attempts), about 3,600 jobs. There are no PR runs between 11-16 04:00Z and 12:43Z, and none after 11-17 16:26Z. The busy stretch is 11-16 19Z to 11-17 05Z. Queue time is `started_at − created_at`. For a selected leg that includes its wait in the lane group, since the API does not give the two apart.

### 1. Where a PR run's time goes (minutes, p50 / p90)

| tier | job class | jobs | queue p50 | queue p90 | queue max | run p50 | run p90 |
|---|---|---|---|---|---|---|---|
| draft | selected leg | 740 | **15.4** | **54.3** | 80.1 | 5.0 | 10.2 |
| ready | selected leg | 774 | **31.6** | **58.1** | 83.9 | 4.9 | 8.9 |
| ready | node-suites | 257 | 1.3 | 9.0 | 17.2 | 2.4 | 6.4 |
| ready | smoke (no lane) | 51 | 0.6 | 5.7 | 20.5 | 3.2 | 4.8 |
| ready | guards shard | 204 | 0.1 | 4.1 | 9.9 | 2.8 | 5.3 |
| ready | staged-boot | 51 | 0.1 | 5.7 | 11.1 | 3.8 | 5.2 |
| draft | guards shard | 208 | 0.3 | 6.5 | 12.9 | 3.9 | 5.5 |
| nightly | selected leg (own groups) | 58 | 2.4 | 5.0 | 6.2 | 4.7 | 8.3 |
| pages | train jobs | 877 | 0.0 | 12.7 | 26.2 | 3.4 | 7.7 |

A selected leg runs for about 5 min and waits 6 to 12 times that long. Jobs outside the lanes, in the same runs and the same hours, wait 0.1 to 1.3 min (p50). The wait is the lanes, not the runner pool.

### 2. Fan-out per run, and time to verdict

| tier | runs | success / failure / cancelled | jobs that ran, p50 | selected legs, p50 / max | job-min p50 | wall p50 | wall p90 | wall max |
|---|---|---|---|---|---|---|---|---|
| draft push | 51 | 25 / 17 / 9 | 24 | **15 / 53** | 105 | 38.7 | 73.6 | 94.2 |
| ready flip | 51 | 36 / 14 / 1 | 29 | 11 / 68 | 109 | 23.3 | 85.3 | 95.8 |
| Pages train | 28 | 19 / 6 / 3 | 24 | 0 | 56 | 15.5 | 40.0 | 55.3 |

| run width (selected legs) | PR runs | draft / ready | leg queue p50 | leg queue p90 | wall p50 | wall p90 | share of all leg job-min |
|---|---|---|---|---|---|---|---|
| 1–2 | 39 | 21 / 18 | 6.8 | **62.6** | 13.4 | **67.6** | **0.7 %** |
| 3–10 | 4 | 2 / 2 | 17.4 | 60.3 | 54.8 | 75.0 | 2.5 % |
| 11–30 | 37 | 18 / 19 | 6.8 | 54.9 | 43.0 | 88.3 | 56.5 % |
| 31+ | 15 | 8 / 7 | 33.2 | 57.1 | 63.6 | 85.3 | 40.3 % |

### 3. What the data says about each question in the brief

- **FIFO (#5536).** GitHub's docs (workflow-syntax, `concurrency`, read 2026-11-18) say a `queue: max` group serves jobs "in first-in-first-out (FIFO) order according to the time each one started waiting on the concurrency group", and also that "ordering is not guaranteed". A group holds at most 100 pending jobs. I could not check the per-lane order. The issue's lane mapping (`(run_number + i) % 24`, `i` = the job-id order) puts two running legs in one lane in 605 of 1,472 consecutive pairs, and one lane can run only one job at a time, so that mapping is wrong for about 40 % of legs. The API does not expose the group. **Starvation does not need a FIFO break to explain it:** wide runs (11+ legs: 52 runs, 97 % of leg-minutes, up to 68 legs) put 2 to 3 legs into every one of the 24 lanes at once. A one-leg fix that arrives next waits behind all of them in whichever lane it gets. The data shows exactly that: 1–2-leg runs had 1-minute legs queued 35 to 64 min, and that leg was the last job in every small run over 30 min.
- **Superseded heads.** The workflow-level group `ci-pr-<n>` with `cancel-in-progress` on `pull_request` already cancels a superseded head's run. **No job of a superseded head started after the newer head's run was created (0 jobs).** 13 runs ended cancelled; before they were cancelled they had used 2,091 job-min and started 148 legs. Nothing to add here.
- **Ready flips re-run the draft's legs.** Of 19 ready flips whose same-head draft had finished, 18 drafts were green. 4 reused the legs; **15 re-ran them (910 leg-min, up to 63 legs and 301 leg-min for one flip).** All 14 select logs I read refuse with rule 4 of `reuse-draft-selected.mjs`: "the deploy tip moved: this merge ref sits on X, the tip is Y". That rule is deliberate (#5426, guarding against #5407), and changing it would change what a ready verdict proves. **Not in this lane: a question for Bryce** (below).
- **Drafts fan out widely.** The draft budget is 5 min, but oversize and spill legs run outside it: p50 15 legs, up to 53. Drafts made 740 of 1,514 PR legs (49 %). Most common draft legs: spill (144), oversize-hud-layout (96), selected (50), oversize-ui-scale (48), oversize-terrain-over-road (44). Changing this changes what runs, so it is out of scope. Recorded here as the second-largest load.
- **Set-up cost per browser leg (#5519).** 2,106 `Mesa llvmpipe + Xvfb` steps: p50 4 s, p90 16 s, max 38 s, **0 failures**. 127 `Install lint binaries` steps: none over 60 s, 0 failures. Playwright Chromium (cached): p50 4 s. setup-apex: p50 5 s. **The mirror-independent install (#5519 commits 1ebdabdc to c9942343) is on the tip and has held for 48 h.** Set-up is about 20 s of a 5-min leg. The one remaining set-up hazard is **checkout**: 20 of 3,601 checkouts took over 60 s, up to 1,079 s, and 3 legs were killed by their job cap while still in checkout (11-16 22:33Z to 11-17 00:07Z). Measured only: no change proposed in this batch.
- **Peaks.** At most 224 selected legs were waiting at once (11-17 02Z), while other jobs in the same runs were not queueing.


## The change and its estimate

A plan of at most two legs gets lane -1, and `ci.yml` gives each of its legs the per-run group the train uses. The
estimate takes the 39 small runs of the window and replaces each leg's queue with the largest runner queue that the
same run's lane-free jobs paid (node-suites, smoke, sweeps, driving-model). Wall p50 13.4 → 7.2 min, p90 67.6 → 20.7,
max 73.4 → 30.1. Re-measure: the 1–2-leg row of the width table after a busy day.
