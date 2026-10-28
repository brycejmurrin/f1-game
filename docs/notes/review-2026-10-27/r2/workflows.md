# GitHub Actions workflow audit — brycejmurrin/f1-game (2026-10-27, read-only)

Method: trigger/permission blocks of all 22 files; GitHub runs API, window `created>=2026-10-13` (14 d; per-event and
per-conclusion `total_count` for busy files, which the API caps at 2500); `triggering_actor` on dispatches; every
`tools/|tests/|*.sh|npm run` path a workflow names checked on disk (desktop.yml's scripts resolve in desktop/package.json:
**no missing run: paths**). Git history is shallow (every file "created" 2026-10-20), so file age comes from runs, not git.
"Fail%" = (failure+cancelled)/total. Dispatches this window were ALL by `brycejmurrin` (the agents' gh token), so the
"agent tokens cannot workflow_dispatch (403)" premise behind the push-request relays is stale.

| workflow | triggers | 14 d runs (by event) · last · fail/cancel | consumers | verdict |
|---|---|---|---|---|
| ci.yml | PR (6 types) to deploy, nightly 04:17, dispatch, workflow_call | ≥2500 PR, 14 sched, 92 disp, 375 push (old trigger, ended 10-16) · 10-27 · ~26% fail / large cancel share (re-push concurrency) | pages.yml, land.yml, flake-tally, ci-watch, AGENTS.md | KEEP; CHANGE-TRIGGER: 123/300 PR runs are `CI ignored` no-ops (label 36, edit 22 of 100) — drop `edited` |
| pages.yml | push deploy (prose ignored), cron 6 h, dispatch | 904 push, 78 sched, 73 disp · 10-27 · 8% fail, 35% cancelled (pending-replaced, by design) | Pages, land.yml, spec-timings, deploy-research | KEEP. 57 `github-actions[bot]` dispatches ended 10-16 (relay era) |
| land.yml | pull_request, check_suite, workflow_run(CI, Pages) | 71 PR, 118 wf_run, **0 check_suite** · 10-27 · 4% fail, 19% cancel | ruleset `gate` status | KEEP; CHANGE-TRIGGER (see Flags 1-2) |
| browser-group.yml | dispatch | 369 · 10-27 · 3% | remote-group.mjs, AGENTS.md table | KEEP |
| gpu-census.yml | cron 05:47, dispatch, **push of .github/gpu-census-request.json on cursor/** + claude/** ** | 315 push, 213 disp, 14 sched · 10-27 · 5% | census-verdict, renderer rules, 19 tests | KEEP; CHANGE-TRIGGER: drop push relay (163 macOS-backed push runs since 10-20, 4 on the deploy branch) |
| spec-timings.yml | workflow_run(Pages, deploy br), dispatch | 1015 · 10-27 · 4.5% | select-budget.mjs / ci-select-specs-step.sh read bot/spec-timings (fresh 10-27) | KEEP; CHANGE: job `if` lacks a conclusion filter → a 77 s full-history (fetch-depth 0) runner per cancelled Pages run too |
| ci-cancel-on-close.yml | PR closed | 1227 · 10-27 · 0% | ci.yml concurrency | KEEP (the sanctioned cancel route) |
| desktop.yml | PR (desktop paths), dispatch, tag desktop-v* | 155 (117 skipped) · 10-26 · 3% | desktop/ tests | KEEP |
| lit-wgsl-advisory.yml | PR (js/render/**, vendor/three-*) | 256 · 10-27 · 2% cancel | job summary only; docs note | KEEP (advisory, cheap); review again if CHANGED rate stays ~4% |
| flake-tally.yml | cron daily 06:19 + every 2 h, dispatch | 62 (60 sched) · 10-27 · 0% | `flaky` issues #3505/#3885 (updated today); base-red issues last 10-22 | KEEP; fix input text "3 h base-red" vs `*/2` cron; 62 runs ≈ half the 2-h slots fired |
| garage-before.yml | cron 10:23, dispatch | 12 sched + 15 old wf_run (ended 10-14) · 10-26 · 44% (all old wf_run cancels) | garage-angles-fetch.mjs, garage-parts-livery skill | KEEP (plan job skips when paths unchanged) |
| capture-gallery.yml | dispatch, **push of .github/capture-gallery-request.json on cursor/** ** | 9 push · 10-21 · 11% | run-capture-request.mjs, docs/CAPTURE-REVIEW.md | CHANGE-TRIGGER: dispatch only; then MERGE car-shot into it |
| car-shot.yml | dispatch | 0 (27 ever) · 10-03 | render-car.mjs | MERGE-INTO capture-gallery (both: macOS, boot a page, upload frames) |
| archive-evidence.yml | dispatch | 22 (one batch) · 10-19 · 0% | docs/EVIDENCE-STORAGE.md | KEEP (dormant, contents:write needed for releases) |
| prune-branches.yml | dispatch | 6 · 10-26 · 0% | prune-branches.mjs, branch audit | KEEP (containers cannot delete refs) |
| changelog-fold.yml | cron Mon 06:37, dispatch | 0 ever (added 10-26; first fire 11-02) | gen-changelog --fold, dispatch.mjs | KEEP; MERGE with ratchets-fold (same shape: fold→bot branch→PR→`gh workflow run ci.yml`) |
| ratchets-fold.yml | cron daily 06:17, dispatch | 4 (3 disp, 1 sched) · 10-26 · **50% fail** | ratchets.mjs, dispatch.mjs | MERGE-INTO one `folds.yml` with changelog-fold (two jobs, job-level perms) |
| process-dashboard.yml | cron 04:47, dispatch | 8 · 10-26 · **38% fail** | writes `metrics` branch; read by nobody (only its own `--check`, a 09-16 plan and a 10-24 note) | CHANGE-TRIGGER → dispatch-only, or DELETE |
| import-models.yml | dispatch | 0 (4 ever) · 10-02 | none in tools/; bot/kenney-racing-kit-2 left on remote | KEEP dormant but split perms (see Flags 5) — or DELETE if no pack import is planned |
| repo-size.yml | dispatch | 0 (2 ever) · 10-02 | repo-size.mjs (tests test the tool) | KEEP dormant (41 lines, read-only, needs full history) |
| hud-survey.yml | dispatch | **0 ever** | apex_hud_survey runs the tool LOCALLY; skill ref only | DELETE (162 lines; browser-group pattern covers a remote run) |
| webkit-leg.yml | dispatch | **0 ever** | pick-tests/select-specs/nightly-group rows | DELETE (+ the three rows) — it proxies TLX WebGL on WebKit 26.6, not Bryce's TLX WebGPU iPhone path; header's 403 claim is stale |

## Flags
1. **land.yml `pull_request` runs the PR's OWN copy of land.yml with secrets.** For a same-repo branch the event uses the
   head's workflow file, so a PR that edits land.yml gets `statuses: write` + `secrets.LAND_TOKEN` (contents/PR/workflows
   write) and can post `gate=success` on its own head — the ruleset's only required check. Fix: `pull_request_target`
   (base copy; the design already never checks out the PR), keep `workflow_run`. Until then a CODEOWNERS/ruleset rule
   on `.github/workflows/**` is the stopgap.
2. **land.yml `check_suite` is dead**: 0 runs in 14 d; its own header quotes the docs saying Actions-made suites never
   fire it. Delete the trigger and its `if:` branch.
3. **Push-request relays are leftovers** (gpu-census, capture-gallery): built because "agent tokens 403 on dispatch",
   but 213 gpu-census + 369 browser-group dispatches this window prove the agent token dispatches. The relay also
   re-fires on merges (4 deploy-branch census runs). renderer-debug SKILL.md:18 still teaches the request file.
4. **Ghost registrations**: `docs-guards.yml`, `iphone-census.yml`, `wire-select-specs.yml` are still `active` in the
   Actions API with no file on the deploy branch; a stale branch carrying them can still run them. `gh workflow disable`
   each (Bryce; a read-only lane must not).
5. **Write tokens next to untrusted input**: import-models downloads an arbitrary URL and runs the importer with
   `contents: write` in the same job; changelog-fold / ratchets-fold grant contents+PR+issues+actions write at
   WORKFLOW level (move to job level). spec-timings/process-dashboard hold contents:write only to push bot/metrics
   branches (acceptable; no PR code checked out).
6. **Schedules nobody reads**: process-dashboard (metrics branch, red 3/8, advisory since 10-26); flake-tally's 2-h
   base-red mode (last issue 10-22) — keep the daily tally, consider folding base-red into it.
7. **Duplicated work**: changelog-fold ≈ ratchets-fold; car-shot ≈ capture-gallery ≈ garage-before (three macOS
   capture workflows); hud-survey copies browser-group's runner setup.
8. **No-op churn**: 41% of sampled ci.yml PR runs are `CI ignored` (label/edit), each its own concurrency group; every
   `update_pull_request` Plan tick (AGENTS.md rule 12) spawns one via `edited`.

## Top 10 actions
1. land.yml: `pull_request` → `pull_request_target` (Flag 1); add CODEOWNERS on `.github/workflows/` meanwhile.
2. land.yml: delete the `check_suite` trigger and its `resolve` condition branch.
3. gpu-census.yml + capture-gallery.yml: drop the push-request trigger; update renderer-debug SKILL.md and CAPTURE-REVIEW.md to `gh workflow run`.
4. spec-timings.yml: job `if` adds `workflow_run.conclusion == 'success'` (saves ~370 runner starts / 14 d).
5. ci.yml: drop `edited` from PR types (keep the `CI: run` body marker only if a label-free path is still needed).
6. DELETE hud-survey.yml and webkit-leg.yml (+ pick-tests/select-specs/nightly-group rows, docs refs).
7. MERGE ratchets-fold + changelog-fold into one `folds.yml` with job-level permissions; fix ratchets-fold's 50% red.
8. process-dashboard.yml → dispatch-only (or delete with the `metrics` branch); nobody consumes it.
9. Bryce: `gh workflow disable` the three ghost workflows; delete `bot/kenney-racing-kit-2`.
10. MERGE car-shot into capture-gallery (one macOS capture workflow, `mode` input); split import-models into a read-only bake job + a push job.

COVERED: archive-evidence, browser-group, capture-gallery, car-shot, changelog-fold, ci-cancel-on-close, ci, desktop,
flake-tally, garage-before, gpu-census, hud-survey, import-models, land, lit-wgsl-advisory, pages, process-dashboard,
prune-branches, ratchets-fold, repo-size, spec-timings, webkit-leg (22/22) + 3 ghost registrations. Not checked:
secrets list (API returns nothing to this token), per-job billing minutes, artifact download counts.
