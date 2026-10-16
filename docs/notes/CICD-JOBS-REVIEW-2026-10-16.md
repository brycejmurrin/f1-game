# CI jobs review — structure, failures vs diffs (2026-10-16)

Follow-up to [CICD-REVIEW-2026-10-16.md](CICD-REVIEW-2026-10-16.md) (21.7 h, 1,200 runs). Question: which
`ci.yml` / `pages.yml` jobs run on which diffs, where do they wait, what do they catch, and what would a
different shape change? Analysis only: no workflow, tool or hook is edited here; every change below is a
proposal with its diff sketch. Data: GitHub REST API, 2026-10-16 ~09:00–10:00Z, cached under `scratch/cijobs/`
(not committed).

## 0. Sample, and what it can and cannot say

| set | window | n |
|---|---|---|
| `ci.yml` runs listed | 10-15 17:52Z → 10-16 08:46Z (15 h) | 600 |
| `ci.yml` runs with full job + step data | 10-16 00:00Z → 08:46Z (**8.8 h**) | 323 runs, 4,263 jobs |
| of which on the NEW configuration (after #2375 merged 07:51Z) | 07:51Z → 08:46Z | 54 runs (20 ready, 15 draft-fast); **5 green ready runs** |
| `pages.yml` runs, jobs read | 10-13 → 10-16 08:45Z | 69 (13 since the cutover: 9 cancelled while pending, 3 completed, 1 live) |
| PR file lists | every PR with a ready/draft-fast run in the window | 96 PRs (`pulls/N/files`) |
| merge-tree check | `git` on the deploy branch, 10-15 09:00Z → now | 218 merge commits |

"Min/day" scales the 8.8 h window ×2.73 and is **job-minutes of `ci.yml`** (the Pages train is counted
separately). The new configuration has too few runs for percentiles; each such number is marked `n=`.
Occupancy for the window (ci.yml jobs only, Pages excluded): running p50 29 / p90 39 (00:30–04:30Z: 35 / 40;
04:30–08:40Z: 22 / 39), against 39 / 44 over the previous 21.7 h.

## 1. Top proposals, ranked by minutes saved per effort

| # | change | effort | measured saving | risk |
|---|---|---|---|---|
| 1 | Put `tests/unit/changelog-fragments.test.mjs` in `test:guards` (the commit hook) | S (one line in `tests/groups.json` + `npm run gen`) | 4 of 11 guards shard reds in 8.8 h (36 %); the 4 runs burned 172 job-min and four push→red→fix round trips; ≈ **470 job-min/day**, ~11 round trips/day | none: it is a ~1 s read-only test already in tooling-fast |
| 2 | `--bail` for the two CI tooling-fast shards | S (`tools/ci/tooling-fast.mjs` flag + 2 `ci.yml` lines) | 11 shard reds ran a mean 5.9 min after a single failure; ≈ 40 job-min/8.8 h = **110 job-min/day** and a red 3.5 min sooner on average | hides a 2nd failure in the same shard until the next push; the verdict line still names the first |
| 3 | Base-red detector: run `flake-tally` every 2 h and label a spec `base-red` when it fails on ≥ 3 branches (or ≥ 2 PRs + a train) within 2 h | S–M | one incident in 15 h: `menu-keyboard` red on unrelated diffs 06:58–≥ 08:10Z = 7 PR runs + 3 consecutive trains ≈ **1,000 job-min** and the same triage 10 times; the daily tally (08:06Z) read it hours late | a false label; labels are advisory, nothing is skipped |
| 4 | `selected-verdict` goes neutral when `guards` is red (the cause is already red twice) | S | 0 min; 9 of 9 guards-red runs paint `Structural guards (A/B)`, `Structural guards`, `Selected specs (verdict)` and `CI` red for one cause | none if `CI` still needs `guards` |
| 5 | Merge `Parts option-resolution census` into `Select specs` (both are ~60 % setup) | S | ~170 job-min/day, 570 fewer job starts/day, one less queue hop (parts waits p50 0.4 / p90 1.7 min) | one job's red hides the other's name; keep two steps |
| — | Watch, do not change yet: train cadence (§6) | — | trains rose from ~15/day to a back-to-back chain: est. 65 × 152 = 9,900 job-min/day vs ~7,600 before (n=3 completed trains) | re-measure at 24 h |
| — | Evidence that nothing else is worth moving | §3, §4, §7 | setup is 7.9 % of job-minutes; caps are 2–6× p99; merge-aware reuse has a 4 % hit rate | — |

## 2. Failures vs diffs

### 2.1 Every failed run, 8.8 h (20 runs: 18 on PRs, 2 ship pushes)

| failing job | runs | what actually failed | diff class | verdict |
|---|---|---|---|---|
| Structural guards (tooling A/B) | 9 | one `tests/unit/*.test.mjs` each: `changelog-fragments` ×4 (fails 0.6–2.5 s in, test #15 of ~300), `test-bg-outcome` ×2 (257/294, 258/295; unrelated PRs, both under loadavg 6), `ratchets` ×2 (PR's own growth), `deploy-tool` ×2 (stale base after #2375), `voice-pack` ×1 (known #2319 flake) | js/, tools, css, assets: all classes | #1, #2; `test-bg-outcome` is a flake suspect (2 reds on 2 diffs, no passes-on-retry data) |
| Selected legs | 12 leg reds in 9 runs | `menu-keyboard` ×6 runs on **unrelated** diffs (PR 2340 garage, 2341 replay, 2346 platform tooling, 2378 audio/input, plus the 07:41 ship push); `menu-traversal` ×2 (PR 2352, own css); `menu-baseline` ×2 (PR 2280, own golden); `ui-redesign` ×1 (PR 2303, own css) | css/html + js | menu-keyboard = base red (#3); the others are the PR's own, caught on the tier meant to catch them |
| Pure-node unit suites | 0 of 771 | — | — | see §4 |
| Smoke / Driving / Sweeps / macOS / XR | 0 of 109 / 114 / 306 / 34 / 27 | — | — | combined with the previous note's 21.7 h: smoke 0/561, driving 0/579, macOS 0/114 |

Pages (train) reds, 69 runs read: 9 failed; since 10-16 06:00Z all three are `menu-keyboard` on `packed-1`
(07:01, 07:31, 07:51), i.e. the same base red, three full trains (~150 job-min each) before it cleared.

### 2.2 Path class × job (96 PRs; class from the PR's final file list, so a PR is classed by its end state)

| tier \| class | runs | red | job-min/run | where the minutes went (job-min; F = failures) |
|---|---|---|---|---|
| draft-fast \| docs-only | 5 | 0 | 11 | guards 52 |
| draft-fast \| tools/tests-only | 14 | 0 | 17 | guards 164, node 69 |
| draft-fast \| js/ui/css | 26 | 2 | 28 | guards 300 (5 F), node 403 |
| draft-fast \| engine/render | 32 | 3 | 41 | guards 375 (6 F), node 861, driving 61 |
| ready \| docs-only | 4 | 0 | 14 | guards 19, **selected 21, macOS 13**, smoke 2 |
| ready \| tools/tests-only | 19 | 0 | 12 | guards 136, sweeps 16, smoke 26 |
| ready \| js/ui/css | 33 | 7 | 82 | selected 1,662 (4 F), guards 329 (7 F), node 449, sweeps 105 |
| ready \| engine/render | 37 | 5 | 135 | selected 3,146 (8 F), node 890, guards 396, sweeps 265, macOS 138 |
| ready \| circuits | 2 | 0 | 66 | selected 67, sweeps 25 |

Reading it:

* (a) **Runs on diffs they cannot fail on.** Four "docs-only" ready runs still ran selected legs (21 job-min)
  and a macOS job (13): probably an earlier sha of the PR that touched code, since the class uses the final
  file list; not enough to propose a filter (n=4). `tools/tests-only` ready PRs (19 runs, 0 reds, 12 job-min) are
  already cheap. The expensive ready classes are exactly the ones that fail.
* (b) **Late failures.** 4 of 11 guards reds were `changelog-fragments`, which the commit hook does not run
  (`package.json` `test:guards` omits it; it is in tooling-fast, `tools/ci/tooling-fast.mjs:208`). That is #1.
  Every browser red is found only on the ready tier (draft-fast ran 3 selected-leg job-min in the window): by
  design, and 9 of the 18 PR reds were selected legs (6 of them the unrelated base red, 3 the PR's own change).
* (c) **Duplicate signal.** All 9 guards-red runs also turn `Selected specs (verdict)` and `CI` red
  ("Structural guards failure — selected legs skipped"): four red rows per cause (#4). `menu-keyboard` and
  `menu-traversal` fail together on 2352.
* (d) **Routing misses.** No train red this window was a spec the PR tier failed to route: the three
  `menu-keyboard` train reds were already red on the ready tier of six PRs. The earlier `track-switch-memory`
  routing bug (previous note, finding 13) did not recur (n too small to say it is fixed).

## 3. Critical path and splitting

Green ready runs, last non-aggregator job to finish (minutes from run creation):

| | runs | end-to-end p50 / p90 | last job | its wait | its run |
|---|---|---|---|---|---|
| before the cutover (00:00–07:51Z) | 58 | 22.2 / 59.8 | selected leg (39 runs): 35.5 | 27.7 | 6.5 |
| | | | smoke (10): 20.5 | 15.9 | 2.7 |
| after (`n=5`) | 5 | 14.0 / 27.8 | selected leg (5): 18.2 | 9.7 | 6.8 |

Smoke wait (`#2335`, shared lane gone): p50 4.5 / p90 17.0 min (n=77) → **0.0 / 5.2 (n=20)**: confirmed.
Select finishes at p50 0.5 min after run creation (was 1.1); select → first leg start p50 0.0 / p90 8.7. The
remaining critical path is the leg queue, as before. Selected legs, 999 ready legs in the window: run-step
p50 / p90 / p99 4.0 / 7.3 / 11.1 min, wait p50 6.3 / p90 21.7 (previous 21.7 h: 13.0 / 59.0). In ready runs
with ≥ 6 legs (n=53) the longest leg is **2.2× the median leg** (p90 2.6×; 10.8 vs 4.9 min): a long-pole
single-spec leg, which the selector already isolates ("oversize"); no merge or re-pack of legs would help,
only splitting the slow spec itself. Job-count shape: legs are 47 % of job-minutes (6,442 of 13,699) and
`Run the selection` is 40 % of all job-min.

## 4. Setup and cache cost (4,263 jobs, 13,699 job-min)

| step | n | sum min | per job |
|---|---|---|---|
| checkout | 3,328 | 371 | 0.11 |
| Mesa llvmpipe + Xvfb | 1,395 | 284 | 0.20 |
| setup-apex (Node + `npm ci`) | 3,123 | 272 | 0.09 |
| Playwright Chromium (cached) | 1,518 | 104 | 0.07 |
| Set up job | 3,957 | 50 | 0.01 |
| **setup total** | | **1,081 = 7.9 %** | |

Setup is not a lever: the composite actions and caches are already in place (`.github/actions/setup-apex`,
`playwright-chromium`, `mesa-xvfb`; blob-less clone). Micro-jobs are the exception: `Select specs` is 58 %
setup and `Parts census` 40 % (#5), worth little. Nothing else is repeated per job that an artifact would remove.

## 5. Timeouts, retries, cancels

| job | cap (min) | observed p99 / max | killed by cap |
|---|---|---|---|
| guards A/B | 12 | 8.4 / 8.4 | 0 |
| node suites | 25 | 8.9 / 8.7 | 0 |
| sweeps | 35 | 8.7 / 8.6 | 0 |
| smoke | 20 | 3.2 | 0 |
| driving-model | 20 | 3.3 | 0 |
| xr | 25 | 2.5 | 0 |
| renderer-macos | 30 | 18.3 / 17.4 | 0 |
| select | 10 | 0.6 | 0 |

Caps are 1.4–16× p99. Tightening them would only shorten a hang, and no hang appears in 4,263 jobs, so no
change is proposed (0 measured minutes). Retries: selected legs run with retries 0 and `APEX_FAIL_ON_FLAKY=1`,
so a flake appears as a first-try red, never a retry pass (the daily tally's "flaky-passes" column is all 0).
PR cancels, 39 runs: superseded by a newer push 6 runs / **806 job-min** (the whole cost; mostly ready runs),
same-sha dedupe 13 / 21, no newer run on the branch (external) 20 / **51**. Last note: external cancels burned
~11,300 job-min/day; now 51 in 8.8 h (~140/day), consistent with the cancel sweeps having stopped. Superseded
ready runs (~2,200 job-min/day) are authors pushing during a running ready tier; no workflow change reaches
that (a policy question for Bryce: a ready run is now cheap to supersede but not free).

## 6. Pages train (pages.yml)

* **Tree-equal reuse, 218 merges since 10-15 09:00Z:** 9 are tree-equal to the PR head (4 %); 209 are not,
  with **median 87 files (p90 356) different between the PR head and the merge tree**, almost all runtime
  files. A merge-commit-aware reuse (reuse a job when the merge adds only paths it does not read) would have
  almost nothing to reuse: no proposal. The train is the merged-tree gate; its fast tier (guards ×3, 6 node
  slices, parts, driving, select = ~47 of 152 job-min) catches merge interactions (ratchets, generated files,
  `deploy-tool` on a stale base).
* **Per train** (completed): old config 134 job-min mean (53 runs, wall p50 21.1 / p90 37.2); new 152 (n=3, wall
  21.5): the fast tier moved in. Legs: 16 p50 → 27 (the three trains each covered more merges); leg wait p50
  4.1 → 4.7 min.
* **Cadence** is the open question. In 55 min after #2375: 13 push-started runs, 9 cancelled while pending
  (0 jobs, free), 3 completed, 1 running. At ~9 merges/h the pool of one running + one pending means trains
  run back to back (~22 min each), up to ~65/day. Estimated 9,900 job-min/day vs ~7,600 (old: ~15 trains ×
  134 + 5,587 ship fast tier). That is ~17 % of the 57,600 capacity but at the train's priority (no lane
  wait). Re-measure at 24 h before deciding; if the cost matters, the lever is a minimum spacing between train
  starts (e.g. 30 min), not job reuse.

## 7. Triggers and concurrency

`draft-skip` runs (74 in the window, 0.3 min wall, 6 job-min) are one run each for an unlabelled draft push;
they exist to give an unlabelled draft a visible status. Cost is negligible (~16 job-min/day) and removing
them saves clutter only: not proposed. No concurrency group starts a run nobody reads beyond that.

## 8. Proposals with diffs

Every change keeps the `pull_request` / `pull_request_target` split as is and touches no permission, trigger
or secret unless stated.

**#1 changelog-fragments in the commit hook** — `tests/groups.json`: add `"tests/unit/changelog-fragments.test.mjs"`
to the group that `test:guards` is generated from (the 32-file guards list), then `npm run gen`
(`gen:check` confirms). Cheaper-equivalent: the identical test, one rung lower on the ladder (guards ⊂
tooling-fast). Nothing is removed; tooling-fast keeps it.

**#2 bail** — `tools/ci/tooling-fast.mjs`: accept `--bail` (stop launching tests after the first failure,
let in-flight ones finish, print `= run failed (…)` as today); `ci.yml` guards-a / guards-b:
`run: node tools/ci/tooling-fast.mjs --jobs=4 --shard=1/2 --bail`. The local `npm run test:tooling-fast` stays
without `--bail`, so an author still sees every failure in one run. Tests that must run to completion for
their verdict (ratchets) are single tests, unaffected.

**#3 base-red detector** — `.github/workflows/flake-tally.yml`: `cron: '17 */2 * * *'` and a step that, for
any spec failing on ≥ 3 branches or on ≥ 2 PRs plus a train within 2 h, comments once on the pinned issue
(`issues: write` is already needed by the daily write) and adds label `base-red`; `Merge Desk` and
`ci-watch` read the label. No runner time beyond ~1 min/2 h. Risk: noise; the tally already separates a
branch's own regression from a repeating red (`branches` column).

**#4 neutral verdict on a red guards** — `ci.yml` `selected-verdict`: when `needs.guards.result == 'failure'`,
exit 0 with the existing message; `ci-verdict` still lists `guards`, so `CI` is red once, not four times.

**#5 parts census into select** — move the census into a step of `select`; drop the `sweeps-parts` job
entry's `needs` plumbing. Gain is small; do it only with #3 or another `ci.yml` touch.

## 9. Not proposed, with the evidence

* Moving node suites from draft-fast to ready-only (1,374 job-min/8.8 h = 3,750/day): 0 of 771 reds in this window,
  8 of 3,390 in the last, but I could not tell whether those 8 were draft or ready runs, and the cheaper-equivalent
  (the author's local `test:tooling-fast`) is a rule, not a gate. Needs one more day of data split by tier.
* Retiring smoke, driving-model, macOS or sweeps: 0 catches in 30 h combined is not a year of evidence.
* Tighter caps (§5), merging legs (§3), setup caching (§4), merge-aware reuse (§6): measured, no gain.

## 10. Re-measure

`scratch/cijobs/` (not committed) holds the scripts: `fetch.sh` (run lists), `getjobs.sh` (jobs per run),
`an1…an8.mjs` (tier, per-job, failures, PR file classes, steps, critical path). The recipe is §9 of the
earlier note plus `pulls/N/files` and `check-runs/<job>/annotations` for the failure tables. About 740 API
requests were used (runs 7, jobs 392, PR lookups/files 192, annotations/logs ~60, pages 70).
