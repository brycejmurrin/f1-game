# Infrastructure evidence audit — 2026-11-11

This is a bounded adversarial audit, not a certification of the repository. The
reviewable patch concentrates on evidence reuse and release provenance. No
gameplay changes, tolerance increases, quarantines, or gate bypasses were made.

## Source and ownership

- Initial checkout: clean `work`, `ae73c67669bbb7fe4b54f58f78bcfb9c8b00aebb`.
- Fetched deploy comparison base: `d6986f112dea12048f1870209e91de6a10269c7a`.
- Audit branch: `cursor/infra-adversarial-ae73`, created from that base; `work`
  preserved. One local worktree, no initial uncommitted changes.
- GitHub search returned 33 open PRs. Changed paths were examined for the
  overlapping audits #5304, #5339, #5296, #5340, #5302 and #5348. Their authored
  files are outside this patch. Generated indexes are shared generator outputs.
- #5341 was **open, draft, unmerged**, head
  `b67dc07133f1e739456c3e9b497dc5f79663ce98`. Its actual 17-file patch was read,
  including VM realm invalidation and primitive-string memoization evidence.
  Those fixes were not copied or counted as this patch's verification.
- GitHub MCP reports CI run 42943644436 successful on that head. Its jobs endpoint
  returned only the first 30 jobs (23 success, 7 skipped); this is not an
  exhaustive job census. The artifact listing returned 98 records, all naming
  that head SHA. Artifact contents and the claimed native GPU run were not
  independently validated here. Neither proves deployed bytes.

## Findings, ordered by practical impact

### 1. Failed API reads could authorize skipping verification

**High — fixed.** `tools/ci/pages-reuse-verdict.sh` (`gate_ran`, `guards_full`)
and `tools/ci/reuse-draft-fast.sh` (jobs and annotation lookups) piped `gh api`
directly into Node parsers. Bash observed the parser's exit, not the producer's.
The Pages header promises that *every* lookup failure runs the full gate.

Trigger: GitHub CLI writes a valid response and then exits nonzero; a failed
later pagination request can leave complete earlier JSON on stdout. The parser
could find the required successful jobs or annotation in that partial output.
The outer shell returned exit 0 and `reuse=true`, which `pages.yml` uses to skip
the reusable CI gate, or `ci.yml` uses to skip fast-tier steps.

The scripts now capture the API response only after a successful producer exit,
then parse it. Failure still exits 0 **with `reuse=false`**: that is an explicit
instruction to execute the gate, not a passing verification result.

Evidence: the real shell script under a fake `gh` emitted `reuse=true` for
`FAKE_JOBS_EXIT=1`. `artifacts/infra-audit/reuse-partial-before.log` retains the
failing assertion. Regression cases cover both jobs and annotations returning
valid stdout plus exit 1, alongside valid pass cases. These execute the actual
entrypoints, not copied parser logic.

### 2. Missing attempt metadata became first-attempt evidence

**Medium — fixed.** Both reuse scripts evaluated `Number(run_attempt) || 1`.
Missing, null, zero and malformed attempt values therefore became 1. Their
advertised first-attempt-only contract was not enforced on incomplete evidence.
The Pages fixture itself omitted `run_attempt`, hiding the defect in its happy
path.

Only a positive integer is now accepted as an attempt; only 1 is reusable.
Fixtures explicitly provide the valid field and exercise unknown values.
`reuse-before.log` records `undefined` producing `true` where `false` was
required; `draft-before.log` records the draft guard's corresponding failure.
Neither finding claims GitHub routinely omits this documented field: the
defect is failure to reject missing evidence at the trust boundary.

### 3. Strict provenance passed incomplete or mismatched references

**Medium — fixed.** `tools/ci/release-provenance.mjs` accepted `--strict` when
the live SHA matched just source or just deploy, including an unresolved deploy
ref. Git failures collapsed to null; a failed status read became `clean`.
The fallback verdict asserted source/deploy were newer than live without
checking their ancestry to live, and a duplicate merge-base branch was dead.

Strict now requires a known clean working tree and all three resolved commit
SHAs equal. Ref resolution verifies commit objects. Unknown working-tree state
is retained as unknown. Unequal third-party SHAs report an unproven relationship,
not invented ancestry. This is equality of shell metadata, **not** a hash proof
of the deployed asset set; the command comment now says so.

Evidence: an isolated Git repository and local HTTP server run the production
CLI as a subprocess. `provenance-before.log` records exit 0 for a nonexistent
deploy ref. Regression cases require exit 1 for missing ref, dirty source,
source/deploy disagreement, unrelated live SHA and absent stamp; the matching
clean case requires exit 0. Children have a five-second timeout, the HTTP server
is closed, and fixtures are removed through test cleanup even on assertion failure.

## Evidence chain and trust boundaries

`pick-tests` maps this diff to `test:audit` and `test:tooling-fast`;
`tooling-fast --changed` selected 66 files from the initial six-file code diff.
The targeted tests invoke production shell/Node commands, observe stdout and
exit status, and deliberately make inner commands fail. The shell reuse output
is consumed by workflow conditions: Pages verdict → reusable CI or reuse →
publishable check → stage → attempt-scoped Pages artifact → locked strict
publishability recheck → deploy → live verification.

Static inspection confirmed `pages.yml` stages/stamps its selected GITHUB_SHA,
uses attempt-scoped artifact names, and repeats the monotonic check under the
Pages lock. `stage.mjs` validates its destination and required input inventory,
copies an allow-list, builds generated runtime files, minifies, stamps, and
checks the staged result. This audit did not deploy that result or prove CDN,
service-worker, package, or native-device behavior. A green metadata report
cannot substitute for those checks.

Selection populations and tolerances are unchanged. The tightened boundary is
acceptance of API evidence for reuse, plus the standalone provenance CLI's
strict exit status. No workflow permissions or publishing actions changed.

## Infrastructure coverage map

Inventory counts below are tracked files at the comparison base, not executed
cases or claims of complete review.

| Area | Inventory / inspected entrypoints | Coverage and omissions |
|---|---|---|
| Unit, VM, browser tests | 1,130 files under tests/unit; 188 under tests/specs; 82 helpers | Read group runner and file-event reporter; checked open VM/mutation PR diffs. No exhaustive assertion or mock-fidelity review; no browser suite executed locally. |
| Selection, sharding, skips, budgets | 85 tools/ci files; pick-tests, tooling-fast, run-node-group, ci-verdict | Executed selector and changed tooling floor. Selection changes owned by #5304 untouched. Performance/visual populations and quarantine validity not exhaustively exercised. |
| Test-evidence checkers | test-honesty, fixture-consumer-audit, assert-audit | Source-sampled scanning/counting contracts; static recognition is not behavioral assertion proof. No global mutation score claimed. |
| CLI/subprocesses | Two reuse shell entrypoints, provenance CLI | Negative controls prove producer failures and missing fields reach outer decisions. Broader cancellation/process-tree behavior omitted. |
| MCP | 53 tools/mcp files; gateway dispatch, status, help, doctor, apex-lsp | Live read calls verified; source identity mismatch documented below. Persistent job teardown/browser execution not verified; #5339/#5296 paths untouched. |
| Hooks, skills, policy | 15 hook files, 169 skill files; AGENTS, current check-changes/steward, pre-commit, gate-receipt | Read current contracts and receipt binding. No historical message treated as authority. Did not prove every host adapter or permission boundary. |
| CI/reuse/cache/merge | 24 workflows; pages.yml, ci.yml consumers, inputs-hash, gate-receipt | Reuse behavior fixed/tested. GitHub current PR/job/artifact metadata read. No new merge result, ruleset administration, or cache-poisoning certification. |
| Staging/update/offline | stage.mjs, stage-files, Pages flow | Source trace only; no failure-injection campaign for staged partial writes or service-worker cache recovery. |
| Native packaging | 31 desktop and 58 mobile files; desktop.yml | Trigger, permissions, and stage route inspected. No installers, signing, auto-update, storage-origin migration, Android/iOS or real-device execution. |
| Generators/docs | 44 tools/gen files; generated-paths, ensure-built | Canonical regeneration/check required for this patch. No claim all generators are deterministic for every input. |

## MCP and environment evidence

Managed executor identity matched the selected environment; Node 24.19.0.
Locked dependencies were initially missing (`yaml` import failure), so `npm ci`
was run successfully. That setup failure is not a failed product assertion.

Hosted status first failed with HTTP 429. On the user's recovery request,
status, doctor, help, and apex-lsp succeeded without replacing the app, profile,
credentials, tunnel, or trust configuration. Status reported server 1.17.0,
no stale files, free lock and no busy browser. Doctor reported its checkout as
`/workspace/f1-game`. **That path does not prove executor identity:** hosted LSP
returned the original provenance function after this executor had the edited
one. Local LSP diagnostics were therefore used for the patch (zero new errors;
three pre-existing diagnostics hidden by its delta mode).

The cloud recovery skill names `tools/environment/ENVIRONMENT.md` and `f1-env`.
They are absent from this base, and retained `/workspace/f1-toolchain` links
point to those missing paths. Hosted transport recovered, so no local launcher
was reconstructed from an old backup. Closing the identity gap requires a
hosted checkout/head/content fingerprint matching the edited executor, not a
green doctor or a matching path string.

## Reproduction and verification

```sh
node --test tests/unit/ci-pr-base.test.mjs tests/unit/ci-pages-train.test.mjs tests/unit/release-provenance.test.mjs
bash tools/mcp/lsp-mcp.sh diag tools/ci/release-provenance.mjs
node tools/ci/pick-tests.mjs
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet
```

Initial negative controls: **Fail as expected**, retained in
`artifacts/infra-audit/{reuse-before,reuse-partial-before,draft-before,provenance-before}.log`.
After fixes: **Pass**, 20 targeted tests, zero failed/skipped/cancelled
(`targeted-after.log`). Local LSP: **Pass**, zero new diagnostics (`lsp-local.log`).
The first changed floor failed: 65/66 files passed, while `git-fixture-env`
correctly rejected the new Git fixture's missing environment-scrubbing import.
The fixture now imports the shared scrubber first; no guard was weakened.
Final changed floor: **Pass**, 68 files, zero failed (`tooling-fast-final.log`,
165.8 seconds). Fixture/provenance/documentation follow-up: **Pass**, 47 tests.
`npm run gen` and `npm run gen:check`: **Pass**, no tracked generated drift.
`npm run test:audit`: **Pass**, 1,307 test files covered by topical groups.
`bash -n` for both changed shell scripts and `git diff --check`: **Pass**.
The first commit hook rejected this report as an uncited active note; the report
is preserved in the canonical research archive, not deleted or renamed to evade
active-note classification. Commit-hook and CI outcomes are in the PR hand-off.

CI on this patch, merge-result checks, native-device checks and deployed-byte
verification remain separate from these local results. To close them: run CI
on the pushed head, inspect its full job and artifact populations, gate the
actual merge result, build native packages on their target OSes, then compare
published assets and update/offline behavior with the exact staged manifest.

API behavior reference consulted during this audit:
https://cli.github.com/manual/gh_api (pagination processes multiple responses;
partial stdout must not override a failed CLI exit).
