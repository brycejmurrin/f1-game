# CI test selection and tiering — plan (2026-10-16, DRAFT)

Third pass after [CICD-REVIEW-2026-10-16](CICD-REVIEW-2026-10-16.md) and
[CICD-JOBS-REVIEW-2026-10-16](CICD-JOBS-REVIEW-2026-10-16.md). The ask (Bryce, 2026-10-16): dive into runs, how jobs
and tests are selected and their history; research how diff-based selection is best set up; draft a plan.
Status: DRAFT. Steps 0b and 0c (selection audit, catch history) are still being measured; items that depend on them
say so, and nothing below is built until its evidence is in and its owner decision is made.

## Plan
- [x] 0a — Measure runner load and the train since train-on-push (§1)
- [x] 0d — Literature and tool-doc research (§2)
- [ ] **now:** 0b — Selection audit: overlap between guards and node suites, over-broad rules, tier fit, train reuse
- [ ] 0c — Catch history (~40 h): what each job × tier catches; base-inherited, flake, merge-interaction reds
- [ ] 1 — Train: spec legs wait for the guards (§3.1)
- [ ] 2 — Draft tier: run never-failing jobs less often (§3.2; Bryce's decision, needs 0c)
- [ ] 3 — Recall sampling from the nightly full run (§3.3)
- [ ] 4 — Per-spec coverage map, additive only (§3.4; needs 3)
- [ ] 5 — Budget and floor tests warn before they hit zero (§3.5)
- [ ] 6 — Train spacing, decided by the 24 h re-measure (§3.6)

## 1. Measured (2026-10-16)
Window 17:40–20:20Z unless stated; GitHub REST jobs of ~240 runs (runs over 90 s, newest 200 per workflow, so it
undercounts). The pool: 31–42 of 40 slots busy in every 10-minute sample; PR runs 85 % of runner time, trains 15 %.

| tier | runs | job-min/run | biggest jobs (job-min/run, failures/jobs) |
|---|---|---|---|
| draft (`run-ci`) | 98 | 21.7 | Structural guards 10.0 (42/271), Pure-node unit suites 8.6 (0/239), smoke 0.8, sweeps 0.8 |
| ready | 32 | 88.2 | Selected specs 49.6 (5/359), node suites 14.0 (0/134), guards 11.0 (2/96), sweeps 7.0 (2/77) |
| train (since 07:51Z, 12.7 h) | 33 completed | 134 green / 205 red p50 | 9,132 job-min/day; ≈ 7,600 before train-on-push |

Train: merge → live p50 42 / p90 114 min (48 / 107 before); wall 10–21 min idle, 34–48 min when the pool is full (all
leg queue wait). 6 of 33 trains red: 3 selected-spec reds, 3 Structural-guards reds that each PR had passed alone
(source-pin ceiling ×2, skill-hint routing floor) — each still ran every spec leg (205–266 job-min) after guards were
red at minute 6–30.

## 2. What the literature says
- Judge a selector by faulty-CHANGE recall: Meta's deployed selector reports > 99.9 % of faulty changes while catching
  > 95 % of individual failures, selecting under a third of dependency-based tests, at half the cost
  ([arXiv:1810.05286](https://arxiv.org/abs/1810.05286)). `select-recall.mjs` already holds this line.
- Keep measuring: Meta runs every dependent test on a sample (≈ a quarter of changes) off-peak and retrains weekly
  behind an assertion (e.g. selection rate < 0.3 at test recall 0.9); flaky failures are filtered by retry first.
- Almost nothing fails, and what fails is close to the change: of 5.5 M affected Google targets 91.3 % never failed,
  1.23 % ever caught a breakage or fix, pass:fail 99:1, targets > 10 dependency edges away hardly ever break; run
  never-failing tests less often, batched after submission ([Memon et al. 2017](https://research.google/pubs/pub45861/)).
- Presubmit selects; a batched full run backstops (Meta "stabilization" every few hours, Google TAP postsubmit
  milestones; Microsoft TIA falls back to all tests when it cannot analyse a commit and always adds previously failing
  and new tests — [docs](https://learn.microsoft.com/en-ie/previous-versions/azure/devops/pipelines/test/test-impact-analysis?view=tfs-2017)).
- Dynamic per-test file dependencies are cheap and near-safe: Ekstazi saved 32 % mean (54 % on long suites) over 615
  revisions ([abstract](https://users.ece.utexas.edu/~gligoric/papers/abstracts/GligoricETAL15Ekstazi.txt)).
- Playwright `--only-changed` (1.46) follows test-file imports ([release notes](https://playwright.dev/docs/release-notes));
  this repo's specs boot the whole game through `<script>` tags, so it would select everything. Chromium's
  [`page.coverage`](https://playwright.dev/docs/api/class-coverage) returns V8 function ranges per script URL instead.
- Never path-filter a required workflow; gate jobs with `if:` and require one `always()` aggregator
  ([GitHub](https://docs.github.com/en/enterprise-server@3.19/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks),
  [Mergify](https://mergify.com/blog/path-filters-are-not-a-ci-gate)). ci.yml's `CI` verdict job already is this.

## 3. Proposals
### 3.1 Train: spec legs wait for the guards
In the `workflow_call` tier only, `selected` gains `guards` in `needs:` and `needs.guards.result == 'success'` in its
`if:`; the `CI` verdict still fails on the red guards, so nothing is hidden. Saves ≈ 200 job-min per guard-red train
(3 in 12.7 h ≈ 1,100 job-min/day). Cost: green trains start legs after guards (5–9 min idle) instead of at once;
legs already wait 0–22 min for a runner, so the wall grows by less than the guards time. PR tiers unchanged.
Verify: ci-coverage pin on the `selected` needs/if; the next red-guards train shows legs `skipped`.

### 3.2 Draft tier: run never-failing jobs less often (Bryce's decision)
Pure-node unit suites: 8.6 job-min per draft run, 0 failures in 239 draft jobs here (8 of 3,390 in the first review's
21.7 h, all tiers), ≈ 13 % of the pool. They stay on ready runs and trains. Narrow form: run them on a
draft only when the diff reaches files outside the `test:tooling-fast` set the author must run before pushing.
Waits for 0c: how many of those 8 reds were first caught on a draft run, and how much later the ready tier saw them.

### 3.3 Recall sampling from the nightly rotation
The nightly runs ONE browser group a night on the tip (`tools/ci/nightly-group.mjs` rotates every rotatable group),
so each group is a full, unselected run of its specs every rotation cycle. For each nightly failure that is not a
flake (flake-tally) and was green the previous time that group ran, find the merged PRs between the two runs and
replay `select-specs` on each PR's diff; a failing spec that no PR selected is a MISSED case: open or update one
issue and add a `select-recall` CASE. That is Meta's "learning run" at no extra runner cost, sampled by group rather
than by change. Report change recall and selection rate weekly in the flake tally.

### 3.4 Per-spec coverage map (additive; after 3.3 gives a baseline)
In the nightly rotation (each group in turn), collect `page.coverage` JS coverage per spec (Chromium only, as CI is) and keep the functions with
count > 0 below each IIFE body (every file's top level runs at boot, so file-level coverage would select everything).
Store the map as a nightly artifact; `select-specs` reads the newest one and ADDS specs whose executed functions
intersect the diff's changed functions (hunks mapped to function ranges with espree, already a dependency), then
orders by history. It never removes a rule-selected spec until 3.3 shows its recall over ≥ 2 weeks.

### 3.5 Budget and floor tests warn before they hit zero
The guard-red trains came from aggregate budgets (source-pin raw-read ceiling, skill-hint routing floor) that two PRs
each passed alone. A PR whose change leaves less than N headroom prints a warning annotation naming the budget and
the open PRs touching the same files, so the second PR syncs first. Needs 0c's count of such reds.

### 3.6 Train spacing
A minimum gap between train starts (e.g. 30 min) would cut ≈ 62 → ≈ 40 trains/day (≈ −3,000 job-min/day) for
≈ +10–15 min merge → live p50. Decided by the 24 h re-measure due 2026-10-17 07:55Z.

## 4. Not changing, with the reason
- Ready-tier selected legs (49.6 job-min/run, the only place spec reds show before the train).
- The train re-running selected specs: merged trees differ from the trees the PRs tested.
- Draft-tier guards: 42 of 271 draft guard jobs failed; 0c says how many were base-inherited.
