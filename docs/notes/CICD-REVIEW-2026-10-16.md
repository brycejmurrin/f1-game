# CI/CD and dev-process review — 2026-10-16

A whole-system review of how a change reaches https://brycejmurrin.github.io/f1-game/: `ci.yml`,
`pages.yml`, the tools under `tools/ci/`, the hooks, the skills and `AGENTS.md`. Every number below
was measured from the GitHub REST API on 2026-10-16 02:10–02:40 UTC; §9 says how to re-measure.
The review's fixes land as separate draft PRs (§2); this note is the evidence, not the work log.

## 1. Plan (the checklist this review worked through)

- [x] Read the agent surface (AGENTS.md, hooks, agents, the four CI skills, docs/TESTING.md, the CI notes).
- [x] Read every workflow (triggers, concurrency, `if:` gating, matrices, runners, caches, timeouts, permissions).
- [x] Read `tools/ci/*` (selector, lanes, gauge, cap, gate, watch, board, sync, deploy, claims, runners).
- [x] Pull Actions history: 1,200 `ci.yml` runs + their 30,400 jobs, 100 `pages.yml` runs + jobs, 300 closed PRs, 32 open PRs.
- [x] Compute per-job p50/p90/p99 duration and queue wait, runner-minutes, failure/cancel rates, the ready-PR and Pages critical paths, the cancel causes, runs per PR.
- [x] Read the GitHub docs for concurrency `queue`, merge queue, rulesets and plan limits (§8).
- [x] Rank findings by minutes saved per effort (§3) and answer the six questions (§6).
- [x] Land the top changes as one-theme draft PRs (§2), each with before/after numbers in its body.
- [ ] After one day on the new configuration: re-measure (§9) and fill the "after" column of each PR.

## 2. What this review changes (one draft PR per theme)

| PR | branch | theme | measured basis |
|---|---|---|---|
| A | `cursor/cicd-review-dac4` | this note + the pipeline table (§4) | — |
| B | `cursor/smoke-lane-*` | drop the fleet-wide `smoke-lane-1` mutex on PR smoke | smoke waits p50 4.7 / p90 17.5 min behind one group; 0 failures in 452 jobs; ends the critical path in 40 of 210 green ready runs |
| C | `cursor/hold-cap-retire-*` | retire the push hold, the paced-push rule and `ready-full-cap.mjs`; `queue-depth.mjs` stays a gauge | runners at 39/40 all day, so a held push only moves its wait; cap 3 vs 12 ready PRs open |
| D | `cursor/voice-pack-flake-*` | fix the 20-tick waits in `tests/unit/voice-pack.test.mjs` (#2319) | 1 in 3 runs red under load |
| E | `cursor/flake-tally-daily-*` | daily flake tally over every run → one pinned issue; `--propose` quarantine rows | today the tally is a by-hand tool over 14 nightly runs |
| F | `cursor/train-on-push-*` | `pages.yml` runs on push; `ci.yml` drops its `push` trigger, `poke-train`, the fast-tier reuse and `rearm` | 184 ship runs/day, 62 % cancelled while pending, 5,587 job-min/day; ~15 trains/day |
| G | `cursor/agents-md-slim-*` | AGENTS.md shorter; 16 contradictions fixed; stale skill/doc/memory lines deleted | §7 |

## 3. Findings, ranked by minutes saved per effort

Runner-minutes are free on this public repo (`actions/runs/{id}/timing` bills 0); the scarce
resource is the 40 concurrent Linux slots and the 5 macOS slots (GitHub Pro, §8). "min/day" below
is Linux job-minutes per day, against a capacity of 57,600.

| # | finding | evidence | min/day | effort | change |
|---|---|---|---|---|---|
| 1 | **The pool is saturated, not mis-laned.** Median 39 of 40 Linux slots busy; ≥ 36 busy in 878 of 1,271 minutes; 2,125 job-min/h = 88 % utilisation across the whole 21.7 h window, ~100 % in every busy hour | §5.1 | — | — | every change below is a slot change; the lane count (24) is already tuned to the slots and cannot be raised |
| 2 | **26 % of all runner-minutes went to runs that were cancelled** (11,900 of 46,041): ready 8,811, draft 2,524, ship 556 | §5.4 | 11,900 | people | 160 of the 281 cancelled PR runs had NO newer run on their branch; every sampled annotation reads "The run was canceled by @brycejmurrin", in bursts (46 in 3 min at 15:25–15:27Z). A queued run holds no slot; cancelling a running one wastes what it ran. Decision 2 in §7 |
| 3 | **The deploy-branch fast tier is 12 % of capacity and reaches 38 % of merges.** 184 ship pushes; 112 replaced while pending (one pending per `ship-fast` group); 70 completed; 5,587 job-min; the train reuses its tree-only jobs only when it completed | §5.2 | ~3,000 net | M | PR F: the train starts on push (one running + one pending, newest replaces pending); the fast tier, `poke-train`, `rearm` and the reuse logic go; each merge publishes within one train length |
| 4 | **Syncs restart the full tier.** 239 of 1,015 PR runs ran on a base-sync merge commit; 110 of 366 ready runs (30 %) | §5.6 | ~8,000 before #2295 | done | #2295 (ratchet/CHANGELOG fragments, merged 00:45Z today) removes the two files behind most conflicts; re-measure in a day, then delete "sync once before the final run" (TESTING.md:1099) which contradicts AGENTS.md:176 |
| 5 | **Selected legs are the ready PR's critical path, and the wait is the cost.** They end last in 121 of 210 green ready runs at +72 min: 63 min waiting, 6.5 running. Lane wait p50 13 / p90 59 / p99 106 min | §5.3 | — | — | no lane change helps while #1 holds; #2, #3 and #4 are the cure. Not deferred to the train: the oversize pool (52 % of leg minutes) is the spec the diff touches, and the train caught 13 leg reds in 5.5 days |
| 6 | **One smoke lane fleet-wide.** `smoke-lane-1` serialises every ready PR's 2.6-min smoke job; wait p50 4.7 / p90 17.5 min; 0 failures in 452 jobs; last job in 40 of 210 green ready runs (+19 min, 13 of it waiting) | §5.3 | 0 (latency) | S | PR B: per-run group, no `queue: max` |
| 7 | **The push hold and the ready cap throttle without freeing a slot.** `queue-depth.mjs` held pushes for hours on 10-15 and then released ~30 sessions in one minute (launch-policy.md:40-50); `ready-full-cap.mjs` caps live ready runs at 3 while 12 ready PRs are open and #2314's own Status reads "13/3"; with `queue: max` lanes (fe16ca24, #2299) GitHub already bounds the legs | §5.5 | 0 (attention) | S | PR C |
| 8 | **Node suites are a third of capacity and red 0.24 % of the time** (8 of 3,390 jobs; 14,761 min). Both reds sampled were real assertions on the PR's own change | §5.2 | 0 | — | keep: it is the author's fastest signal; `--needed-only` already trims rows on PRs |
| 9 | **Structural guards earn their 20 %** (9,346 min; ~68 real shard reds across 58 branches = 2.6 %) | §5.2 | 0 | — | keep |
| 10 | **Sweeps red = one test.** 29 shard reds, every sampled one `baseline has no stale entries — a cap above/below the measured count is a lie` on circuit-fix PRs; 23 of 29 on shard 3of4 | §5.2 | 0 | S | keep (it forces the baseline to follow the geometry); PR body template for circuit PRs should name `node tools/track/...` baseline update as a step |
| 11 | **Smoke, driving-model and renderer-macos caught nothing in the window** (0 of 452, 0 of 465, 0 of 80); renderer-macos held a macOS slot 15 min per run and 46 of 80 were cancelled | §5.2 | 1,100 + 473 macOS | S | smoke stays (cheapest boot proof); driving-model and renderer-macos are already path-filtered; not moved — a day is too short to call a 0 |
| 12 | **35 % of ready runs select nothing yet still cost 50 job-min** (128 of 366: node 21, guards 12, smoke ran in 119) | §5.3 | ~2,000 | M | expected: code changed with no routed spec; a coverage gap for `select-specs`, not a tier change. Logged, not fixed here |
| 13 | **Pages runs fail 29 %** (29 of 100): 19 at `Selected specs (verdict)`, 9 at `Structural guards`; sampled leg reds: `hud-layout` `waitForFunction` 45 s timeouts ×3, `track-switch-memory` "this spec measures the shipped TLX backend" ×2 (a selection bug on the train), the rest assertion reds on merged trees | §5.7 | — | M | PR E detects the repeat offenders; the `track-switch-memory` routing belongs to `select-specs` (issue) |
| 14 | **The agent surface restates every rule 5–12 times** and 16 statements contradict a hook or tool | §7 | 0 (attention) | M | PR G |

## 4. How the pipeline works now (read this in five minutes)

Deploy branch `claude/f1-game-project-26h3ng` (protected; the one required check is `CI`).
Fleet: ~25 agent sessions opening draft PRs. After PR F lands, the "Merge → ship push" row changes
as noted.

| event | workflow / group | tier | what runs | gate / verdict | then |
|---|---|---|---|---|---|
| push to a draft PR, no `run-ci` label | `ci.yml`, `ci-<head.ref>` (cancel-in-progress) | none | `Draft push (CI skipped — add run-ci label)` echo | `CI draft (opted out)` (not the required name) | nothing |
| push to a draft PR with `run-ci` | same group | FAST | guards A/B (tooling-fast halves) → `Structural guards`; `Select specs for this change` (node-slice plan, spec selection, ship/renderer/xr filters); needed `Pure-node unit suites (<slice>)` rows; parts census; driving-model if routed; `Selected specs (verdict)` | `CI` | author iterates; `ready-gate.mjs --pr` exits 0 when guards are green and the Plan is closed |
| `ready_for_review` / push to a ready PR | same group (the ready run cancels the draft run on the same sha: dedupe, not a red) | FULL | FAST tier (tree-only jobs reused only on `ready_for_review` with an unmoved base) + `Smoke` (1 shard) + `Per-circuit geometry sweeps` (4 shards when geometry moved) + `Selected specs (change-aware gate)` legs, each in one of 24 `selected-lane-<n>` groups (`queue: max`, FIFO, no runner held while pending) + renderer-macos / xr when the diff reaches them | `CI` | Merge Desk arms MERGE-commit auto-merge (≤ 2 armed, never DIRTY, no `MERGE-HOLD:`); only Merge Desk / Grok Bot merge |
| merge → push to the deploy branch | `ci.yml`, `ship-fast` (no cancel; one running + one pending, newest replaces pending) | FAST | guards, all node rows, parts, driving, select + selected (per-run groups) | `CI`; green → `poke-train` dispatches `pages.yml` unless a train is moving | **PR F: this row goes; the push starts `pages.yml` directly** |
| train tick: poke, `rearm`, hourly cron `41 * * * *`, or dispatch ("deploy now") | `pages.yml`, `pages-train-<ref>` (no cancel) | GATE | `verdict` (refuses other refs; reads live `apex-sha`; tree-equal reuse; red tip stops it) → `ci` = `ci.yml` called with `before_sha` = live sha (smoke + sweeps + selected legs vs live..tip; fast-tier jobs reused when the ship run was green) → `publishable` → `deploy` (stage, hash-stamp, `apex-sha` meta) → `verify-live` → `rearm` | each `ci / …` row | the exact gated commit is live; `version.json.build` = 2000 + commit count |
| nightly `17 4 * * *` | `ci.yml`, own group | WIDE | rotating browser group (`nightly-group.mjs`), 4 smoke shards, budget 60 min selection, renderer-macos | advisory | `flake-tally.mjs` reads it |
| `remote-group.mjs <group>` | `browser-group.yml` | one browser group, time-packed shards | run log | the only way to run a browser group from a cloud container |

Where things wait: a ready PR's legs wait in lanes and for a runner (p50 13 min, p90 59); the
train's legs wait only for a runner (p50 3.8, p90 26). A green ready PR merges in p50 37 min
(p90 3.7 h) after its first ready run; PR open→merge is p50 3.9 h.

## 5. Evidence

Window: `ci.yml` runs created 2026-10-15 04:29:11Z … 10-16 02:08:57Z (21.7 h, 1,200 runs, 30,417
jobs); `pages.yml` runs 10-10 10:32Z … 10-16 01:39Z (100 runs); closed PRs updated 10-15 09:17Z …
10-16 02:08Z (300, 279 merged); open PRs at 02:10Z (32: 20 draft, 12 ready).

### 5.1 Runner occupancy (per minute, Linux jobs with a success/failure conclusion and ≥ 30 s)

| | p10 | p50 | p90 | max |
|---|---|---|---|---|
| jobs RUNNING | 19 | **39** | 44 | 49 |
| PR lane legs WAITING (created, not started) | — | 31 | 73 | 107 |
| other jobs WAITING | — | 11 | 47 | 127 |

Minutes with ≥ 36 running: 878 of 1,271. Minutes with ≥ 5 lane legs waiting: 1,133; in those
minutes the running count was p10 20 / p50 39, and only 220 of them had fewer than 30 running.
Hourly p50 running: 21, 40, 38, 39, 42, 39, 40, 42, 39, 40, 33, 40, 42, 41, 38, 22, 39, 25, 38, 40,
40, 41 (04:29Z onward). Linux job-minutes: 46,041 (2,125/h); macOS: 473.

### 5.2 Runs and jobs

Runs by tier (tier read from the jobs that ran, not the event):

| tier | runs | success / failure / cancelled | wall p50 / p90 / p99 (min, completed runs) | job-min | job-min inside cancelled runs |
|---|---|---|---|---|---|
| ship-push (deploy branch) | 184 | 68 / 2 / 112 | 16.9 / 27.2 / 39.2 | 5,587 | 556 |
| draft-fast (`run-ci`) | 409 | 279 / 25 / 100 | 11.2 / 18.3 / 29.9 | 11,868 | 2,524 |
| ready-full | 366 | 210 / 28 / 120 | **37.6 / 110.1 / 124.9** | 27,079 | 8,811 |
| draft-skip (no label) | 180 | 169 / 0 / 11 | 0.5 / 2.4 / 3.8 | 64 | 6 |
| workflow_dispatch | 20 | 14 / 6 / 0 | 16.4 / 27.6 / 28.4 | 1,597 | 0 |
| cancelled before any job | 35 | — | — | 11 | 11 |

Jobs (skipped rows excluded; "sum" = job-minutes in the window; failures are job conclusions):

| job | n | duration p50 / p90 / p99 (min) | queue+lane wait p50 / p90 / p99 (min) | sum | success / failure / cancelled |
|---|---|---|---|---|---|
| Pure-node unit suites (6 slices) | 3,390 | 3.8 / 8.8 / 13.8 | 1.0 / 7.5 / 15.6 | 14,761 | 2,814 / **8** / 568 |
| Selected specs legs + verdict | 3,390 | 4.0 / 7.7 / 24.1 | 4.1 / 43.5 / 99.3 | 14,589 | 2,891 / 51 (50 are the verdict job red on a guards red; **1 leg**) / 448 |
| Structural guards A/B + aggregator | 2,620 | 4.4 / 7.0 / 8.7 | 0.4 / 4.6 / 12.7 | 9,346 | 2,010 / 129 (60 aggregator + 68 shards + 1 ratchet) / 481 |
| Per-circuit geometry sweeps | 1,648 | 0.4 / 5.1 / 10.4 | 1.7 / 13.0 / 17.0 | 2,675 | 1,500 / 52 (29 shards + 23 roll-ups) / 96 |
| Smoke | 452 | 2.6 / 3.7 / 15.4 | 4.5 / 16.9 / 24.8 | 1,294 | 359 / **0** / 93 |
| Driving model | 465 | 2.2 / 3.3 / 13.5 | 0.4 / 7.1 / 15.5 | 1,119 | 321 / **0** / 144 |
| Parts option-resolution census | 1,020 | 0.3 / 2.1 / 9.3 | 0.4 / 4.4 / 12.2 | 800 | 860 / 0 / 160 |
| Select specs for this change | 871 | 0.4 / 0.6 / 5.9 | 0.7 / 7.5 / 16.0 | 543 | 795 / 0 / 76 |
| Renderer specs on a real GPU (macOS) | 80 | 0.0 / 15.3 / 16.4 | 0.0 / 0.8 / 2.4 | 473 | 34 / **0** / 46 |
| Emulated VR | 90 | 1.6 / 2.6 / 4.9 | 0.0 / 6.2 / 10.3 | 106 | 42 / 0 / 48 |
| CI (aggregator) | 884 | 0.2 / 0.3 / 0.9 | 0.1 / 1.3 / 5.3 | 150 | 571 / 61 / 252 |

Per ready run (366): selected legs 32.4 min over 6.4 jobs, node suites 16.2 over 3.5, guards 10.8
over 3.0, sweeps 6.2 over 4.1, smoke 3.0, driving 1.3, renderer-macos 1.3, parts 1.2 — 74 job-min
and 20 job starts. Per draft-fast run (409): node 15.4, guards 10.3, driving 1.1 — 29 job-min.

Failure samples (job logs): node `vm-b2` "the car is not held at the pit limiter after the standing
restart", `vm-b1` "a correction of numerical dust does not count as contact" (both the PR's own
change); sweeps: `baseline has no stale entries — a cap above the measured count is a lie` (five of
five sampled); the one PR leg red: `menu-baseline` `toHaveScreenshot` on #2280 (its own golden).

### 5.3 The ready PR's critical path

Last job to finish in the 210 green ready runs (aggregators excluded):

| last job | runs | ends at (avg, min) | of which waiting | running |
|---|---|---|---|---|
| Selected specs leg | 121 | +72.0 | 63.4 | 6.5 |
| Smoke | 40 | +19.2 | 13.3 | 2.5 |
| Pure-node unit suites | 26 | +21.2 | 5.4 | 10.6 |
| Structural guards | 18 | +8.8 | 1.5 | 6.7 |
| Sweeps | 3 | +17.2 | 10.3 | 0.0 |
| Renderer macOS | 2 | +16.1 | 0.2 | 14.7 |

Lane wait on ready runs: selected legs p50 13.0 / p90 59.0 / p99 105.8 min (n 2,001); smoke
p50 4.7 / p90 17.5 / p99 24.8 (n 366). Selected legs per ready run: p50 2, p90 16, max 44; 128
runs had none. Leg minutes by selector pool on ready PRs: oversize 6,154 (1,131 jobs, 1 red),
selected 4,211 (612, 0), packed 1,263 (167, 0), spill 123 (23, 0), overbudget 50 (24, 0). On the
train (5.5 days): oversize 4,107 (6 reds), selected 1,969 (1), packed 1,353 (3), spill 312 (1),
overbudget 79 (2).

### 5.4 Why PR runs were cancelled (281 cancelled PR runs)

| cause | ready | draft-fast | draft-skip / early | job-min lost |
|---|---|---|---|---|
| no newer run on the branch (external cancel) | 87 | 73 | — | most of the 11,300 |
| a newer push on the branch (superseded) | 25 | 20 | 1 | by design |
| same sha sibling (draft → ready dedupe) | 8 | 7 | 45 | ~0 |

Annotations on 60 sampled "no newer run" jobs: 60 × "The run was canceled by @brycejmurrin"
(13 also carried "The operation was canceled"); 46 fell in 15:25–15:27Z. 65 of the 160 were on PRs
still open at the cancel; 4 on PRs merged just before; 91 on PRs outside the 300-PR sample.

### 5.5 Policy throttles

- `queue-depth.mjs` (hold at ≥ 60 Linux jobs in flight, ≥ 10 queued, ≥ 5 macOS, or a 10-min-old
  queued job while < 20 run) changed five times on 10-15 (95f1ae28, 1d846879, b3a057c8, de65fee8,
  4974b441); `bash-guard.sh:315-343` refuses a `git push` on exit 1; the paced-push rule
  (`launch-policy.md:40-50`) exists because every session read the gauge flip at once.
- `ready-full-cap.mjs` `MAX_LIVE = 3`; the board has no `--cap` flag; 12 ready PRs open; #2314
  Status: "ready-full-cap exit 1: 13/3 live ready full-tier PRs".
- Branch protection JSON is 403 to the session token; the repo has one ruleset, "Deploy Ruleset"
  (id 22828280, 2026-09-10); TESTING.md:1123 says `CI` is the single required check.

### 5.6 Pull requests (279 merged; 138 opened inside the run window)

| metric | p50 | p90 | mean |
|---|---|---|---|
| open → merge (all 279) | 3.9 h | 17.6 h | 6.5 h |
| open → merge (138 in window) | 3.9 h | 10.1 h | 4.9 h |
| first ready run → merge | 37 min | 3.7 h | 87 min |
| ci.yml runs per PR | 4 | 6 | 3.8 |
| distinct head shas per PR | 2 | 4 | 2.1 |
| ready runs per PR | 1 | 2 | 1.36 (99 PRs 1, 31 PRs 2, 6 PRs 3, 2 PRs 4) |

Merges per hour on 10-15/16 (UTC): 6, 12, 20, 8, 2, 12, 8, 5, 9, 5, 11, 13, 10, 4, 8, 13, 11. 129
of 138 merged PRs carried `run-ci`. 239 PR runs (110 ready) had a base-sync merge as head commit.

### 5.7 Pages (100 runs, 10-10 → 10-16)

55 deployed (wall p50 21.9 / p90 33.7 / max 146 min), 16 no-op (p50 0.3 min), 29 failed
(p50 29 min, p90 145). Failed jobs: `ci / Selected specs (verdict)` 19, `ci / CI` 23 (the
aggregator), `ci / Structural guards` 9 (+5 B, +6 A), sweeps 9, selected legs 13 (hud-layout ×3,
track-switch-memory ×2, tlx-probes, career, season-format, time-trial, track-designer, scenery-kits,
menu-baseline ×2), `Anything new …` 2. Train legs: 1,735 selected jobs, wait p50 3.8 / p90 26 /
max 62 min, duration p50 4.3 / p90 7.7 / max 19.3; fast-tier reuse worked on the newest deployed
run (38836256508: verdict +3.0 → legs +3.7 → verdict +20.4 → deploy +24.3 → live +24.5).

## 6. The six questions

**Five biggest latency sources (a ready PR).** (1) Selected legs waiting for a slot or a lane,
63 min on average when they end the run; (2) the single smoke lane, 13 min; (3) the `select` hop
before any leg can exist (0.7 min p50 wait, 7.5 p90, plus the job); (4) syncs that restart the
full tier (30 % of ready runs); (5) manual cancels that force a re-push (160/day). For a Pages
deploy: the hourly cron when no poke fires (the ship fast tier reaches 38 % of merges), the
runner queue for ~13 legs (p90 26 min), and a red tip that stops the train at the verdict.

**Five biggest sources of wasted runner-minutes.** (1) Cancelled runs, 11,900/day, mostly manual;
(2) the ship-push fast tier, 5,587/day for 70 verdicts; (3) sync re-runs, ~8,000/day before #2295;
(4) ready runs that select nothing, ~2,000/day; (5) node suites on draft pushes that the ready
push repeats, 6,300/day — kept, because it is the author's signal.

**What can move to a cheaper tier, and what did each catch.** Nothing browser-side can move
on this window's evidence without losing a real catch: node suites caught 8 (two sampled were
real), guards ~68, sweeps 29 (one test, all real), the train's legs 13 in 5.5 days. Smoke (0/452),
driving-model (0/465) and renderer-macos (0/80) caught nothing in 21.7 h, but one day is too short
to retire a boot check; renderer-macos is already PR-ready-only and path-gated. The one change
with no coverage cost is PR F: the fast tier's checks move into the train, which runs them on the
same tree the push would have.

**Is draft=fast / ready=full right? Merge queue?** The split is right: 28 ready runs went red
on checks the draft tier skips. What is wrong is running the full tier *again* on the deploy
branch and *again* on the train. A merge queue (`merge_group`) would run the full tier once per
batch on the merged tip and is the real fix, but GitHub offers it only to organisation-owned
public repositories and Enterprise Cloud (§8); this is a personal-account repo. "Required checks
only at merge" is what the ruleset already does (`CI`); "full tier only on the train tip" is
PR F. `queue: max` lanes bound legs correctly (100 pending per group, FIFO) and cannot be combined
with cancel-in-progress; the per-PR workflow-level cancel still drops a superseded run's pending
legs.

**What in AGENTS.md, hooks and skills is stale or contradictory.** §7 lists the 16; the rules
that exist only because of a now-fixed bug: the push hold and paced push (gauge bugs #2297/#2309
fixed; the hold itself caused the burst), `ready-full-cap` (lanes replaced it, #2299), "every base
merge conflicts on `ratchets.json`" (#2295), "commit in a separate command" (bash-guard.sh:378-395),
"docs-guards" mentions (retired 10-15), "twelve required checks" (one since 10-15).

**Where agents block on human or classifier authority, and which blocks protect something.**
Protects something real: merge/arm/draft→ready need a designation (keeps 25 sessions from racing
the deploy branch); never-cancel (a cancel loses the queue position); never squash/rebase/force;
the subagent browser ban (one Playwright per box); generated-file edits. Protects nothing:
`APEX_PUSH_HOLD=0` (the classifier rejects it as a "Safety Bypass Flag", so a held worker simply
waits); the relayed-authority refusal for *non-destructive* steps (six lane workers stood idle on
10-15 until the user retyped a grant the brief already quoted — `orchestrator.md:73-81`); the
ready cap (ignored at 13/3). PR C removes the first and third; the second is a prompt-wording
rule (`USER GRANTS:` in the brief) and stays, with the note that a quoted grant is the user's.

**How to detect and quarantine flakes automatically.** The data already exists: every browser
job uploads junit and the reporter prints `= FLAKY`; `flake-tally.mjs` parses both but only for
14 nightly runs by hand. PR E runs it daily over every `ci.yml` and `pages.yml` run of the last
7 days, groups by spec + title, and calls a test flaky when it failed first-try on one run and
passed on another run of the same head sha (or passed on retry); it upserts one pinned issue
and prints `--propose` rows in the quarantine file's current schema (#2280 changes that schema
to exact-title rows with `expires`; the writer stays a human/agent commit so the ledger keeps an
owner and evidence). A row that stays red on every run is a regression, not a flake, and is
listed separately.

## 7. The agent surface: contradictions and dead rules (for PR G)

| # | statement | contradicted by |
|---|---|---|
| 1 | AGENTS.md:160 "ask before merge, arm, draft→ready and a re-run" | `.claude/settings.json:164` `APEX_MERGE_DESK=1` in every session; only an arm without `MERGE` still asks (github-mcp-guard.sh:67-68) |
| 2 | AGENTS.md:160 re-runs checked by bash-guard's `gh` check | shellparse.py:651-726 has no re-run detection |
| 3 | AGENTS.md:160 "commit in a separate command" | bash-guard.sh:378-395 accepts `git add X && git commit` |
| 4 | AGENTS.md:161 `.claude/allow-protected` "lifts every edit rule except the live-run one" | protect-files.py:164-168, 184-187 (surveyor/reviewer rules, `hatch=False`) |
| 5 | AGENTS.md:70 rule 11 generated-file list | protect-files.py:54, 204-206, 211 also block CHANGELOG.md, `ratchets.d/*.json`, sw.js `@gen-shell` |
| 6 | AGENTS.md:49, 56 live-run ban names js/ and css/ | protect-files.py:189 also blocks index.html |
| 7 | AGENTS.md:54 `test:guards` ~25 s | bash-guard.sh:5-7 says ~5 s |
| 8 | AGENTS.md:58 starvation rule | queue-depth.mjs:155 adds "while < 20 run" (moot after PR C) |
| 9 | AGENTS.md:194 "mark ready within 15 min" by any session | comms.md:13-14, ownership.md:50-51 (flips need a designation) |
| 10 | AGENTS.md:172-173 "green fast-tier checks" | TESTING.md:1123-1125 one required check `CI`; check-changes deploy.md:38 "twelve" |
| 11 | AGENTS.md:176 "clean-behind is not a reason" | TESTING.md:1099-1100, CONCURRENT-PRS note:13-14 "sync once before the final CI run" |
| 12 | AGENTS.md:180 publish median 23 / p90 73 | steward:140 "≤ ~25 min", deploy.md:80 |
| 13 | AGENTS.md:58 `APEX_PUSH_HOLD=0` as the override | orchestrator.md:100-101: the auto-mode classifier rejects it |
| 14 | AGENTS.md:163 stall thresholds (5–10 min / 15 calls) | launch-policy.md:27 (~400 messages / ~90 min) |
| 15 | docs/README.md:14 "every flat prohibition lives in AGENTS.md and nowhere else" | ci-watch:46, launch-policy.md:1 ("moved from AGENTS.md") |
| 16 | docs/README.md index | no rows for PREPUSH-GATE-LADDER, SHARED-BRANCH-COORDINATION, CONCURRENT-PRS-CI-HYGIENE |

Stale by a fixed bug: steward SKILL.md:66-67 (ratchets.json conflicts, #2295), :96 ("other
sessions develop directly on the deploy branch"; protected since 09-30); memory
`stacked-prs-land-bottom-up.md:3,12`, `pr-auto-merge.md:16` (ratchets.json syncs),
`merge-fast-verify-on-ci.md:18` (`APEX_PUSH_HOLD=0`); TESTING.md:1033 ("20 job slots"), :1047
("03:17 nightly" vs `17 4 * * *`); merge_policy.py:27-28 (`ci-rerun.mjs` "when it exists" — #1947
is landing it); TESTING-FIELD-NOTES.md:129-131 (`pkill -9 -f`, hook-blocked);
bash-guard.sh:454 (PREPUSH-GATE-LADDER.md listed as generated; it is not).

Duplication (the same rule in ≥ 5 places): push hold (8), never-cancel (7), merge-commit-only
(10), `MERGE-HOLD:` (12), draft→ready gate (11), subagent browser ban (8), subscribe + timer (8),
who-is-on-it claims (7), sync-only-when-you-must (7). The fix is one canonical line in AGENTS.md
and a pointer elsewhere, which PR G applies only where the duplicate is also wrong; wholesale
de-duplication of the skills is a follow-up issue.

## 8. Decisions that are Bryce's

1. **An organisation for a merge queue.** GitHub's merge queue is available "on private and
   public repos on the GitHub Enterprise Cloud plan and all public repos owned by organizations"
   ([changelog, 2023-07-12](https://github.blog/changelog/2023-07-12-pull-request-merge-queue-is-now-generally-available/));
   a personal account cannot turn it on. Transferring the repo to an organisation: Free gives the
   queue but 20 concurrent Linux jobs (vs Pro's 40); Team is $4 per user per month (one user) and
   gives 60 Linux / 5 macOS jobs plus the queue
   ([limits](https://docs.github.com/en/actions/reference/limits)). The Pages URL moves to
   `<org>.github.io/f1-game` unless a custom domain is set (the game links and the PWA scope
   change). Recommendation: yes, Team, with a custom domain, once PR F has run for a week: the
   queue runs the full tier once per merged batch on the merged tip, which removes the ready
   full tier *and* the train's gate for all but the batch tip. Not done here: it is a billing and
   URL decision.
2. **Manual cancel sweeps.** 160 PR runs in 21.7 h were cancelled under the owner token with no
   newer run on the branch, 65 of them on still-open PRs, in bursts. The hooks refuse agents a
   cancel, so these came from a person or an unguarded session. Recommendation: stop; a queued
   run holds no slot, a running one re-runs after the cancel, and PR F removes the ship-fast
   pressure.
3. **PR F (train on push).** It changes which event starts a deploy and removes the per-merge
   fast tier. No new permission or secret: `deploy` keeps `pages: write` + `id-token: write`; the
   call into ci.yml drops `actions: write`. Recommendation: merge after PR B and C and re-measure
   in a day (§9).

## 9. How to re-measure

Read-only, authenticated with the session token through curl (the proxy adds auth; `gh` is not
logged in):

```sh
API=https://api.github.com/repos/brycejmurrin/f1-game; H="Authorization: Bearer $GITHUB_TOKEN"
for p in 1 2 3 4; do curl -sS -H "$H" "$API/actions/workflows/ci.yml/runs?per_page=100&page=$p" > ci-runs-$p.json; done
curl -sS -H "$H" "$API/actions/workflows/pages.yml/runs?per_page=100" > pages-runs-1.json
mkdir -p jobs; node -e 'let r=[];for(let p=1;p<=4;p++)r.push(...require(`./ci-runs-${p}.json`).workflow_runs);console.log(r.map(x=>x.id).join("\n"))' \
  | xargs -P 12 -I{} sh -c 'curl -sS -H "'"$H"'" "'"$API"'/actions/runs/{}/jobs?per_page=100" > jobs/{}.json'
```

Then, per run: tier = `Draft push … success` → draft-skip; `Smoke (` not skipped → ready-full;
`Structural guards` not skipped → draft-fast; `event=push` on the deploy branch → ship-push. Per
job: duration = `completed_at − started_at`, wait = `started_at − created_at`, skipped rows
excluded; occupancy = count of jobs whose [started, completed) covers each minute. Cancel cause:
a newer run on the same `head_branch` created before the cancelled run's `updated_at` →
superseded; same `head_sha` → dedupe; none → external (read
`/check-runs/<job>/annotations`). The GitHub docs read for this review: concurrency and `queue`
(https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/control-the-concurrency-of-workflows-and-jobs),
limits (https://docs.github.com/en/actions/reference/limits), merge queue
(https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue),
rulesets (https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets),
plans (https://docs.github.com/en/get-started/learning-about-github/githubs-plans).
