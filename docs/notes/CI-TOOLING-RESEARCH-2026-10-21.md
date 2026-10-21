# CI tooling research (2026-10-21)

Asked for by OrchB 24 (Bryce: "use subagents to come up with new ideas to test or holes, also a bunch of web research
on how to help profile, debug and test this stuff"). Two parts: web research on four CI topics, and a defect hunt in
`tools/ci`. Provenance matters here, so each part says who read what:

- The web pages were fetched by a research subagent on 2026-10-21 and reported with URLs; B·W12 did not re-fetch them.
  Anything the subagent did not find is marked NOT FOUND. Items called "hypothesis" are inferences, not documentation.
- The `tools/ci` defect hunt is a code-reading pass (no tests run). Each row below carries the verdict of a second
  agent that re-read the cited lines on the current tree (see "Defect hunt").

## 1. Merge queues and `merge_group`

- A workflow must list the `merge_group` trigger or the required check is never reported and the merge fails.
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- The only activity type is `checks_requested`; `GITHUB_SHA` and `GITHUB_REF` are the merge group's; `branches` filters
  work; the event is separate from `pull_request` and `push`.
  https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Each PR is tested on a temporary `gh-readonly-queue/{base}` branch holding the latest base, the PRs ahead of it in the
  queue, and itself; checks must pass on the combined changes. Settings: build concurrency 1-100, min and max group size
  1-100, a wait time to reach the minimum, a status-check timeout, "only merge non-failing PRs". Merge method is one of
  merge, rebase or squash, chosen per queue. Same managing-a-merge-queue page.
- NOT FOUND: any merge-commit-only limitation; any statement about an aggregate job named `CI` (required checks are
  matched by name, so a single `CI` job that also triggers on `merge_group` should satisfy it); the about-merge-queue
  page returned 404, so plan or availability limits were not read.

Hypothesis: a queue would run the ratchet tests on the true merge result (base plus queued PRs), which is what the new
`ratchets` row in `tools/ci/merge-gate.mjs` approximates locally for one PR at a time. A queue would also cover the
"two PRs under the ceiling alone, over it together" case (#3236 + #3237) for several PRs in flight at once, which the
local row cannot (it merges one head onto the current tip). It would need a `merge_group` trigger in `ci.yml` and would
not replace the local pre-push ladder.

## 2. Playwright sharding

- `--shard=x/y` is 1-based; the default split is by file; with `fullyParallel: true` it is by test; balance depends on
  file sizes; `test.skip` and `test.fixme` tests are not counted.
  https://playwright.dev/docs/test-sharding and https://playwright.dev/docs/test-cli
- Duration-aware balancing: NOT FOUND in the official docs. The repo's own time-packed shards (`remote-group.mjs`)
  go beyond the built-in split.
- Reporting: the `blob` reporter per shard plus `npx playwright merge-reports` in a `needs` job with `if: !cancelled()`.
  `--last-failed` reruns failures; `--only-changed [ref]` runs spec files changed against a ref.
- Workers: CLI default is 50 % of cores; the CI guide recommends `workers: 1` for stability and sharding for scale.
  https://playwright.dev/docs/ci

## 3. Flaky tests

- "Flaky" = failed first, passed on retry; reported separately. `--retries` defaults to none.
  https://playwright.dev/docs/test-retries
- `--fail-on-flaky-tests` exists on the CLI (default false). NOT FOUND: a `failOnFlakyTests` config key on the retries
  page. https://playwright.dev/docs/test-cli
- NOT FOUND in official docs: quarantine patterns, measuring flake rate from CI history. Hypothesis: the JSON reporter's
  per-attempt results could be aggregated across runs to propose quarantine candidates.

## 4. Caching on Actions

- Entries unused for 7 days are evicted; the default limit is 10 GB per repo, oldest-accessed first. Caches are
  immutable (change the key to update); `restore-keys` match by prefix, newest wins. A run reads its own branch, the
  default branch and, for PRs, the base branch; sibling branches are not readable. PR-run caches are scoped to the merge
  ref. https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
- `actions/setup-node` with `cache: npm` caches the global npm cache (not `node_modules`), keyed on OS, arch and the
  lockfile hash. https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md
- Playwright says caching browser binaries is not recommended (restore takes about as long as downloading; OS deps
  cannot be cached); if done anyway, key on the Playwright version. https://playwright.dev/docs/ci
- NOT FOUND: a verdict cache keyed on an inputs hash (feasible from the immutability and key rules; a PR-ref cache is
  invisible to other branches).

## Idea rows (hypotheses, each with a cheap test)

1. `merge_group` in `ci.yml` plus a merge queue on the deploy branch: ratchets on the true merge result for several PRs
   at once, fewer sync merges. Test on a throwaway repo or ruleset before touching the real branch.
2. `--last-failed` in a retry job after a red shard. Test: break one spec, compare time to verdict.
3. `--only-changed=origin/<base>` as a cheap pre-filter beside `pick-tests`. Test: compare its picks with
   `pick-tests` on five historical diffs.
4. Blob reporter plus `merge-reports` for `remote-group.mjs` shards: one merged report and verdict. Test: a 2-shard dry
   run.
5. `--fail-on-flaky-tests` on CI in place of `APEX_FAIL_ON_FLAKY`. Test: one run with a seeded flaky spec.
6. Store each run's per-test durations as an artifact readable from the default branch, to keep packing weights fresh
   (see F12 in `CI-WALL-TIME-HUNT-2026-10-21.md`: today's history is split across key formats).
7. A verdict cache written from the default branch (readable by every PR) keyed on the hash of a group's inputs. Test:
   hit rate over the last 20 merges.
8. Measure `workers` against the llvmpipe core count on one spec (1 vs 2). Do not cache the Chromium binary.

## Defect hunt in `tools/ci`

A code-reading pass over the merge and CI gating tools (no tests or benchmarks run), then a second agent re-read each
cited line on the current tree. Verdicts below are the second reader's. Nothing here is fixed by this PR; the rows are
leads, ordered by how likely they are to give a wrong verdict.

| # | Verdict | Where | What | Cheapest pin |
|---|---|---|---|---|
| 1 | CONFIRMED | `tools/ci/remote-group.mjs:382-403` | With `--ref <branch>` the only `git fetch` (383) is skipped, so `sha` (394) is the stale local `origin/<branch>`. `liveRun()` matches runs on that sha and can print `= group passed ... already green` for a tip that has newer untested commits. Reached only through an explicit `--ref` run. | Extract a `resolveSha(fetch)` helper from `main()`; test a stale ref plus a moved remote tip never returns the green short-circuit. |
| 2 | CONFIRMED | `tools/lib/gate-receipt.mjs:77-82`, `.claude/hooks/merge_policy.py:90` | `ready-gate.mjs:468` records `head`, but only `kind === "merge"` compares it. A ready receipt for head A is accepted when the PR is marked ready after a push of head B within the max age. A ready call carries no sha, and the hook's 10 s budget excludes an API call. | `receiptVerdict` with a ready receipt for A and current B returns `ok:true` today; a test pins that or a head-aware fix. |
| 3 | CONFIRMED | `tools/lib/gate-receipt.mjs:19`, `merge_policy.py:44` (`MAX_AGE_MIN = 30`) | A merge receipt stays valid 30 minutes. `MERGE-HOLD:` is read only when `merge-gate` runs (`merge-gate.mjs:276`); no `MERGE-HOLD` or `INCIDENT` read exists in `.claude/hooks` code. A hold added after the gate passed is ignored until the receipt ages out. | Only the age part is unit-testable (a receipt at +29 min is ok). A shorter merge-receipt age is the only hook-side lever. |
| 4 | REFUTED as stated; a narrow form holds | `tools/ci/ci-watch.mjs:582` | A failed compare call returns false and the newer containing run is skipped for that tick. The older containing run is an ancestor of the newer, so the only wrong output is one tick of `= pages failure` when the older containing run failed AND the newer run's compare 5xx'd. The watch lacks an "unknown compare, do not conclude" state. | `pagesVerdictRun([newer, older], h => h === older)` shows the skip; the fix needs a tri-state callback. |
| 5 | REFUTED (overstated) | `tools/ci/merge-gate.mjs` (`--skip-local-merge`, `isAncestor`) | With `--skip-local-merge` nothing fetches the deploy branch, so `merge-base --is-ancestor` on a Pages-run head missing from the clone exits 128 and reads as false. But the verdict is by ancestry across up to 20 runs and any one containing success wins, so the refusal needs every containing run to be newer than the last fetch (a stale clone), not "every game PR". Manual use only. | `pagesVerdict(sha, runs, () => false)` gives null. |
| 6 | CONFIRMED | `tools/ci/sync-pr.mjs:81` | `runStage` uses `killSignal: "SIGKILL"`. `tooling-fast` spawns each file `detached: true` (`tooling-fast.mjs:1704`) and reaps children only on SIGINT/SIGTERM (1673-1678), so a stage timeout orphans `node --test` processes and the `--resume` that follows overlaps with them. | Needs a child-spawning fixture (`runStage` is not exported); the narrow fix is `killSignal: "SIGTERM"`. |
| 7 | CONFIRMED | `tools/ci/deploy.mjs:106-110` | `run()` has no timeout; `package.json` has no `--test-timeout` on the gate's node suites. A hung file hangs `deploy.mjs --gate-only` until the 30-minute background ceiling, with no verdict line. | Weak as a unit test: testing it means adding the timeout option, which is the fix. |

Smaller things seen and not filed: merge-gate's ready row skips the fleet-block check that the `ready-gate` CLI applies;
merge-gate fetches `pulls/<n>` twice, so head and file list can come from different moments.

## Outcomes (B·W13, 2026-10-21)

Read against the tree, not the web; each row says what was checked.

- **Idea 5 / I5 (`--fail-on-flaky-tests`): not adopted.** `tests/helpers/flaky-policy.mjs` already implements
  `APEX_FAIL_ON_FLAKY=1` and says why: Playwright's flag is all-or-nothing, so it would red the dated, owned entries in
  `tests/data/flaky-quarantine.json` that the policy deliberately lets through. Swapping would delete the quarantine ledger's
  effect. Revisit only if Playwright adds a per-test allow-list.
- **I6 (durations artifact): already shipped.** `ci.yml` uploads `spec-timings-junit-*` artifacts per shard and the
  timings merge folds them into `tests/data/spec-timings.json` (`tools/ci/spec-timings.mjs`). The open gap is F12 in
  `CI-WALL-TIME-HUNT-2026-10-21.md` (mixed key formats), not a missing artifact.
- **(b) `--test-timeout` on node groups: done.** `tools/gen/gen-test-groups.mjs` now emits
  `--test-timeout=900000` (`NODE_TEST_TIMEOUT_MS`) for every `kind: node` group unless the group carries its own
  `--test-timeout=`; `run-node-group.mjs` and the targeted sweeps in `deploy.mjs` use the same value. tooling-fast keeps
  its own 540 s bound (`tooling-fast.mjs`). 15 min is under every node-group job's `timeout-minutes` (>= 20), so a hung
  test fails by name instead of the job reading `cancelled`.
- **I1 (merge queue): write-up only.** A queue needs `merge_group` in `ci.yml` and a ruleset on the deploy branch, which
  are repository settings outside this lane. The local `merge-gate.mjs` ratchets row covers one PR at a time; a queue
  would cover several in flight. Test on a throwaway repo first (idea 1 above).
