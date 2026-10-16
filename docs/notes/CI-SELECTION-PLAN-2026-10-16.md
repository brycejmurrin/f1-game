# CI test selection and tiering — plan (2026-10-16)

Third pass after [CICD-REVIEW-2026-10-16](CICD-REVIEW-2026-10-16.md) and
[CICD-JOBS-REVIEW-2026-10-16](CICD-JOBS-REVIEW-2026-10-16.md). The ask (Bryce, 2026-10-16): dive into runs, how jobs
and tests are selected and their history; research how diff-based selection is best set up; draft a plan.
Every proposal is built later in its own small PR; nothing here changes a workflow or tool. M = measured,
E = estimated. Per-day figures scale 40 h of history by 0.6, or one day of merges (~170) by its rates.

## Plan
- [x] 0a — Runner load and the train since train-on-push (§1)
- [x] 0b — Selection audit: 160 merges replayed through today's selectors (§3)
- [x] 0c — Catch history: 40 h, 2,097 runs, 284 failed jobs classified (§2)
- [x] 0d — Literature and tool-doc research (§5)
- [x] Bryce's decisions (2026-10-16): D1 drop now, D2 both parts, D3 required check (§6)
- [ ] P1 — Node tier: drop fail-safes no node script reads; thin the tooling-fast overlap on every run (§4 P1)
- [ ] P2 — Base reds: mark inherited reds, regenerate global-consistency artifacts on the train (§4 P2)
- [x] P3 — Draft tier: no Pure-node unit suites (D1) + P6 train trims (D2), one PR — #2575, merged e8e63be0; draft run 38970130088 skipped the node slices; trains 38976643629 and 38979081338 skipped `Pure-node unit suites` and `Driving model`
- [ ] P4 — Browser routing: `hud` group, `js/editor/`, CSS + unit pin (§4 P4)
- [ ] P5 — Local tooling-fast receipt checked before CI spends a run (§4 P5)
- [x] P6 — Train: zero-catch legs (node suites, driving model) leave the train (D2; legs-wait-for-guards declined) — landed with P3 in #2575
- [ ] **now:** D3 — `CI` as a required check in "Deploy Ruleset" (Bryce's setting); then P1 (node fail-safes + overlap)
- [ ] P7 — Merge only on a completed full tier (D3)
- [ ] P8 — Sweeps: manifest edits that change no fleet-read key do not trigger the fleet (§4 P8)
- [ ] P9 — Recall sampling from the nightly rotation; per-spec coverage map after it (§4 P9)
- [ ] P10 — Flakes the tally found go to the quarantine or get fixed (§4 P10)
- [ ] P11 — Train spacing, decided by the 24 h re-measure due 2026-10-17 07:55Z

## 1. Load and the train (M)
Pool: 31–42 of 40 slots busy in every 10-minute sample (17:40–20:20Z); 40 h total 91,690 job-min ≈ 55,000/day
against 57,600 slot-min/day. Queue wait, not test time, makes runs slow: train legs p50 14.8 min waiting vs
4.2 min running at 20:00Z.

| tier (17:40–20:20Z) | runs | job-min/run | biggest jobs (job-min/run, failures/jobs) |
|---|---|---|---|
| draft (`run-ci`) | 98 | 21.7 | Structural guards 10.0 (42/271), Pure-node unit suites 8.6 (0/239) |
| ready | 32 | 88.2 | Selected specs 49.6 (5/359), node suites 14.0 (0/134), guards 11.0, sweeps 7.0 |

Train since train-on-push (12.7 h): 33 completed (27 green), 9,132 job-min/day vs ≈ 7,600 for the old fast tier +
trains; merge → live p50 42 / p90 114 min (48 / 107 before). Wall 10–21 min idle, 34–48 min when the pool is full.

## 2. What each job catches (40 h, 2026-10-15 04:29Z → 10-16 20:30Z; M)
Failed leaf jobs by class: BASE (inherited from a red tip) 166 (58 %), REAL 81, unresolved 22, train-first 5,
FLAKE 7 + 2 pass-on-retry, INFRA 3. REAL failures form 52 episodes (one fix each); the train caught 0 of them first.

| group × tier | job-min | REAL episodes | note |
|---|---|---|---|
| Structural guards, draft / ready | 6,410 / 6,737 | 14 / 14 | 27 of 28 failed in a file the author's required local `test:tooling-fast` runs |
| Pure-node unit suites, draft | 9,432 | 5 | all 5 also run on the PR's first ready run; 0 unique; 0.4–4.9 h earlier |
| Pure-node unit suites, ready / train+nightly | 10,276 / 5,297 | 4 / 0 | |
| Selected specs, ready / train | 25,527 / 7,545 | 10 / 0 (3 of 4 train-first incidents) | never runs on drafts (`ci.yml:2210`) |
| Geometry sweeps, ready / train | 3,458 / 1,537 | 3 / 1 | |
| Smoke, Driving model, Parts census (all tiers) | 2,130 / 1,789 / 1,208 | 0 / 0 / 0 | |

Base reds: 128 runs were red ONLY because the tip was red — 12,188 job-min (≈ 7,300/day). Ten spells of
0.2–6.2 h (median ≈ 1.5 h); 7 of 10 were global-consistency tests (hash cards, counts, ratchet caps, baselines) that
two individually green PRs broke together. Worst: source-pin-hygiene, 24 branches, 3,149 job-min.
Merges: of 356, 284 (80 %) had a green full tier on the head, 42 a green fast tier only, 30 no completed gate;
3 of the 4 train-first incidents followed such a merge. One draft branch pushed 44 times in 3 h (40 cancelled by its
own next push), using CI as its edit loop. Top flake: capture-tools-regressions (8 first-try fails on 8 branches,
unit file, not quarantinable today — the quarantine ledger is spec-only).

## 3. How selection works, and where it is too broad (M, 160 merges replayed)
Browser breadth comes from GROUP ROUTING, not fallbacks (select-specs reasons: matched 82, infra 65 — infra no
longer widens — docs 13, unmatched 0); legs per merge: code PRs 14.4, tests/tools PRs 1.0. Node breadth comes from
FALLBACKS: `node-plan.mjs:197` runs every script on any TRACKED path, `pick-unit-slices.mjs:120,285` starts all 9
slices on any workflow file or unmatched path — 72 of 160 merges ran every node script. `NODE_PLAN_SKIP_TF` thins the
150 files that guards also runs only on a matched plan (`node-plan.mjs:244`); `all()` keeps them (`:193`), so every
train and every fallback PR plan runs them twice. Already efficient: unmatched fails closed; docs-only plans 0 legs;
VM-twinned specs run once; smoke and physics-characterization never enter `selected`; circuit diffs are scoped; train
tree-equal reuse fired on 2 of ~104 trains and reusing a PR's merge-ref verdict would cover ≤ 6 of 60 merges.

## 4. Proposals, ranked by runner-minutes saved against signal lost
| # | change | saves /day | signal lost | owner |
|---|---|---|---|---|
| P1 | node fail-safes + overlap | 2,000–2,700 E | none found | me |
| P2 | base reds | up to ≈ 7,300 M red-only cost; ≥ 50 % E | none (the tip stays red) | me |
| P3 | no Pure-node on drafts | ≈ 5,660 M (less after P1) | 5 catches move to ready, 0 unique | D1 |
| P4 | browser routing | ≈ 2,200 E | a non-HUD module breaking the HUD reaches the train | me |
| P5 | local tooling-fast receipt | ≈ 2,000 M + 45 red push cycles | none | me |
| P6 | train guards-first + zero-catch legs | ≈ 1,100 E + ≈ 1,800 M | node/driving/census interaction reds move to the nightly | D2 |
| P7 | merge only on a full tier | 0 runner-min; ≈ 3,300 job-min of train-first reds | merge latency = one ready run | D3 |
| P8 | manifest fleet trigger | ≈ 250 E | none | me |
| P9 | recall sampling, coverage map | quality | none (additive) | me |
| P10 | flake fixes / quarantine | ≈ 1,500 M of flake-red runs | none | me |

**P1.** A guards-only path list (`tests/data/ratchets.d/*` — the commit hook writes it — `ratchets.json`,
`skill-routing/*`, `tolerance-exceptions.json`, `.github/{labels,gpu-census-request}.json`, non-ci workflows,
templates) is dropped before the TRACKED test: every reader of those files is a tooling-fast file guards runs in the
same run. `package.json` routes by the changed script names (all 18 of 18 diffs touched only `scripts`); any other
key stays fail-safe. Slice rules for `js/editor/`, `js/roster.js`, `.agents/`, `plugins/`. `all()` sets `skipTf: true`
— guards and node suites share the `fast_tier_run == ''` gate, so the overlap always runs once in guards. Modelled
node job-min per PR run 14.4 → 10.7.
**P2.** `ci-verdict` reports a failure as INHERITED when it is exactly a test named by `flake-tally --base-red` or
the train's last red verdict, and the PR still shows it; a PR that also changes that test's files is never marked
inherited. Prevention: a train-side bot regenerates the global-consistency artifacts the way `ratchets.d/` handles
ratchets, so two green PRs no longer leave the tip red for 1.5 h.
**P4.** A `hud` browser group (hud-layout, ui-button-touch, ui-scale) routed by HUD paths instead of all of
`js/ui/`, `css/` and the `js/audio/` fallback (hud-layout: 22 % of selected minutes; the replay drops it from 23 of 58
selections, −794 of 2,001 planner-min; its only reds were one timing-out test). `js/editor/` routes track-designer
only (`pick-tests.mjs:114` names it, yet routes all of `modes`: the career trio, 77 planner-min). A CSS change shipped
with its `tests/unit` pin stays a CSS change (`change-kind.mjs:20`; 4 of 160 merges planned 9–10 legs where
`cssSpecs()` picks 1–2).
**P5.** `test:tooling-fast` writes a receipt keyed on the tree hash; the pre-push hook refuses a code push whose tree
has none, so CI stops being the edit loop (27 of 28 guards catches, 3,265 job-min in 45 runs).
**P6.** In the `workflow_call` tier only: `selected` needs `guards` (3 guard-red trains in 12.7 h each ran every leg,
≈ 200 job-min); Pure-node, Driving model and Parts census leave the train for the nightly (0 catches in 5,297 + the
others' job-min). Smoke stays on the train.
**P8.** `tools/manifest.cjs` triggers the fleet sweep only when a fleet-read export changes (keys derived by grep;
9 of 11 manifest-only fleet runs changed none).
**P9.** Each nightly failure that is not a flake and was green the last time that group ran: replay `select-specs`
over the PRs merged between the two runs; a spec no PR selected is a MISSED case → an issue and a `select-recall`
CASE (Meta's learning runs, sampled by group, no extra runner cost). After two weeks of recall data, a per-spec
Chromium `page.coverage` map (functions executed below each IIFE body) ADDS specs to the rule-based selection.
**P10.** capture-tools-regressions (8 branches), test-bg-outcome zombie, voice-pack ensureStaged, tlx-probes boot,
track-switch-memory: fix, or extend the quarantine ledger to unit files.

Checked and not proposed: reusing the draft verdict at ready already exists (`ci.yml:502`, same head SHA) and fired
on 4 of 69 ready runs — ready runs follow a new push or sync; the catch-history figure of ≈ 4,400/day for "same-head
reuse" needs re-deriving before anything is built on it.

## 5. What the literature says
- Judge a selector by faulty-CHANGE recall: Meta's deployed selector reports > 99.9 % of faulty changes while catching
  > 95 % of individual failures, selecting under a third of dependency-based tests, at half the cost; it measures
  recall on off-peak "learning runs" of every dependent test (≈ a quarter of changes) and retrains weekly behind an
  assertion; flaky failures are filtered by retry first ([arXiv:1810.05286](https://arxiv.org/abs/1810.05286)).
- Almost nothing fails, and what fails is close to the change: of 5.5 M affected Google targets 91.3 % never failed,
  1.23 % ever caught a breakage or fix, pass:fail 99:1, targets > 10 dependency edges away hardly ever break; run
  never-failing tests less often, batched after submission ([Memon et al. 2017](https://research.google/pubs/pub45861/)).
- Presubmit selects; a batched full run backstops (Meta "stabilization", Google TAP postsubmit milestones; Microsoft
  TIA falls back to all tests when it cannot analyse a commit —
  [docs](https://learn.microsoft.com/en-ie/previous-versions/azure/devops/pipelines/test/test-impact-analysis?view=tfs-2017)).
- Dynamic per-test file dependencies are cheap and near-safe: Ekstazi saved 32 % mean (54 % on long suites) over 615
  revisions ([abstract](https://users.ece.utexas.edu/~gligoric/papers/abstracts/GligoricETAL15Ekstazi.txt)).
- Playwright `--only-changed` (1.46) follows test-file imports ([release notes](https://playwright.dev/docs/release-notes));
  these specs boot the whole game through `<script>` tags, so it would select everything. Chromium's
  [`page.coverage`](https://playwright.dev/docs/api/class-coverage) returns V8 function ranges per script URL instead.
- Never path-filter a required workflow; gate jobs with `if:` and require one `always()` aggregator
  ([GitHub](https://docs.github.com/en/enterprise-server@3.19/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks),
  [Mergify](https://mergify.com/blog/path-filters-are-not-a-ci-gate)). ci.yml's `CI` verdict job already is this.

## 6. Decisions for Bryce
- **D1 — Pure-node unit suites off draft runs.** ≈ 5,660 job-min/day (≈ 10 % of the pool) for 5 catches in 40 h, all
  also caught by the PR's first ready run, 0.4–4.9 h later. Recommendation: do P1 first, re-measure two days, then
  drop them from drafts unless the diff reaches files outside the tooling-fast set.
- **D2 — The train runs only what can catch a merge interaction.** Spec legs wait for guards; Pure-node, Driving
  model and Parts census move to the nightly (0 train catches in 40 h). ≈ 2,900 job-min/day; train wall +≈ 5 min when
  idle. Recommendation: yes.
- **D3 — Merge only on a completed full tier.** 20 % of merges landed without one; 3 of 4 train-first reds followed
  such a merge. Cost: no runner-minutes; a merge waits for one ready run. Mechanism: `ready-gate`/Merge Desk refuses,
  or `CI` becomes a required check in the ruleset (Bryce's setting). Recommendation: yes, through the ruleset.

Answers (Bryce, 2026-10-16): **D1** — drop now (not after P1). **D2** — both parts. **D3** — required check.
Implementation notes:
- D1 + D2 land together (both edit the node-suites gate): node-suites skips every draft and the Pages call;
  driving-model skips the Pages call. node-suites stops asking the ready_for_review reuse question (no draft run to reuse).
- The Parts census stays on the train: its filter diffs live..tip (the PR runs see only their own diff, the
  documented hole in ci.yml's `sweeps-parts` comment), it costs ≈ 1 job-min per train, and the geometry sweeps
  share its step-level gating. Dropping it saves ≈ 60 job-min/day for that hole.
- "Spec legs wait for guards" — DECLINED (Bryce, 2026-10-16, after a correction). It cannot be train-only (`needs:`
  is static, so ready PRs would wait too), and the legs would queue only AFTER guards instead of alongside them:
  +≈ 6–8 min idle, +≈ 15–20 min with the pool full, on every green ready run and train. ci.yml took exactly this
  edge out on 2026-10-10 (R3-CI-HEALTH-2: the 30 s aggregator alone queued 26–37 min in a burst). P2 (base reds)
  attacks most guard-red runs at the source instead.
- D3 is a ruleset setting (the token here cannot read or write branch protection): add `CI` as a required status
  check in "Deploy Ruleset". ci.yml has no `pull_request` path filter, so `CI` always reports; a draft without run-ci
  reports `CI draft (opted out)` instead, and drafts cannot merge anyway.

## 7. Not changing, with the reason
- Ready-tier selected legs (10 REAL episodes in 40 h; each miss becomes a ≈ 1,600 job-min train-first incident).
- Selected specs on the train: the only catcher of 3 of the 4 train-first incidents.
- Draft-tier guards: 14 REAL episodes, and docs or `.claude/` pushes skip the train, so the PR is their only guards run.
- Geometry sweeps (4 catches), Emulated VR (1), smoke on the train.
