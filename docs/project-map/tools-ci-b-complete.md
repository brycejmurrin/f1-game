# tools/ci B — complete source map

Scope: sorted `git ls-files tools/ci/*`, positions 28–54 inclusive: exactly 27 files, 6,484 source lines. Read 2026-10-27 from the working tree; SHA256 below identifies the bytes read. No workflows, suites, browser or mapped CLI were executed; only source reads, inventory/hash analysis and this documentation write occurred.

Instructions read: AGENTS.md and .claude/skills/code-nav/SKILL.md. Code-nav explicitly permits source/text search outside js/. These Node ESM and shell tools are outside its js/ symbol graph; imports, executable command strings and workflow callers were traced by source instead of claiming LSP semantic coverage. Attached LSP tool metadata was discovered, but no unsupported tool-file symbol result is claimed.

## Full-read ledger

Initial oversized read responses were truncated and were not counted as complete. Repaired with a concatenated source snapshot, then bounded untruncated reads over snapshot lines 1–450, 451–900, 901–1400, 1401–1900, 1901–2450, 2451–3000, 3001–3500, 3501–4000, 4001–4500, 4501–5000, 5001–5500, 5501–6000 and 6001–6484. The 1401–1900 and 2451–3000 ranges were reissued with larger output budgets after truncation. Every source line, including comments, was read.

| Position | File | Complete range | SHA256 |
|---:|---|---|---|
| 28 | `tools/ci/guards-verdict.mjs` | 1–199 | `ef72098d86e2dda5577fac8b9c85259496f7dea215c555fb4430e8379c246adc` |
| 29 | `tools/ci/inputs-hash.mjs` | 1–202 | `777e2fd4cdd7b95f42eb2f37d9b644c48b1ed96e7f275c99ecfdef5fdeb67157` |
| 30 | `tools/ci/js-debugger-smoke.mjs` | 1–246 | `ef16c21cb784f9568fa0eb6fd125b1af306654c3b79c113f3d7432a86cfa4c6c` |
| 31 | `tools/ci/junit-failed.mjs` | 1–82 | `17152894a2dba6bde6ad12d6a6b12c9b2dce17a0325960903f06c2f12808b78c` |
| 32 | `tools/ci/lane-preamble.mjs` | 1–126 | `00a062e9fa6311ce3b47d5814c2acfb3bba17dea52c96c85ed13dfc118a68ad8` |
| 33 | `tools/ci/launch-gate.mjs` | 1–174 | `1913601a9a053152c996ccf751daffd5f19493b9c8cb518ec822274f9cac6600` |
| 34 | `tools/ci/live-run-check.mjs` | 1–105 | `8f9000801fe09f4d16041fe636e23476f5b0b6d3e8bb2f983e9a241233742b90` |
| 35 | `tools/ci/measure-pr-ci-after-close.mjs` | 1–164 | `3a369d0b1b95d81f884266572c119de07f7264f6e62481f9c3f6718d3a4c7c6f` |
| 36 | `tools/ci/merge-gate.mjs` | 1–325 | `be5080feb520784f8d579b35d5136c869c99896cb8f79197521dc3698199d19a` |
| 37 | `tools/ci/needs-sync.mjs` | 1–118 | `89ec470f7b7b3ce7ed80dadb95690c40f966e25c4b52677311c429ec34875729` |
| 38 | `tools/ci/nightly-group.mjs` | 1–105 | `59456bbedd168aeed6a357a26ed52f31d998d81e72b3f4221d3aa149497f93ee` |
| 39 | `tools/ci/node-plan.mjs` | 1–282 | `1fff220b9f273c08cf90285c04982eca0e7bb6c03d9157f678c03c260c7a4861` |
| 40 | `tools/ci/pages-live-sha.sh` | 1–16 | `2bd1e4fba78ed6824e61c7feb869b7cb3dad8dd443c091a46844de44ab99bf09` |
| 41 | `tools/ci/pages-publishable.sh` | 1–59 | `9013c00d3e55c747e1c6812d2d5e5b2a940446b970643f9a90e07ceb77c9b4fa` |
| 42 | `tools/ci/pages-reuse-verdict.sh` | 1–159 | `0576fba9b14d7e69500bd8a9ac5647673a95768d08bc7cb9253c7156486f3889` |
| 43 | `tools/ci/pick-tests.mjs` | 1–582 | `8c465488157f47355c45a8ac8c5f84a72538e4db186610a54ec441008c911e39` |
| 44 | `tools/ci/pick-unit-slices.mjs` | 1–431 | `594a5271da5bbbb78f11defb337b40c94a1e516f6d253cd6079adec0568409c8` |
| 45 | `tools/ci/playwright-occupancy.mjs` | 1–82 | `0261a9478d31178d8d8d8cb3cecb66f6a214f5a385db6f49929170dbe0851442` |
| 46 | `tools/ci/poll-live-shell.mjs` | 1–300 | `0801fd650f2ec589211e0fe14197ca933546269c7dcd88fb157cb418456328f5` |
| 47 | `tools/ci/pr-board.mjs` | 1–384 | `6a245ae2a3d29b4e67893b35d99ea09ac5d28790ae44781fa63b003b8d0e5631` |
| 48 | `tools/ci/pr-body.mjs` | 1–272 | `20fcc6fa83d6ca3da380c93ce34be6266f515feef0e33f66665df6716ed41f57` |
| 49 | `tools/ci/process-dashboard.mjs` | 1–599 | `3f1749f15a97ed519f0fc6980bedb2a205602b4d827915f19cb2484b69324b98` |
| 50 | `tools/ci/prune-branches.mjs` | 1–263 | `23031e25f043696ad93521054e4c3603eb90bfcd8342a7b147b94de6b844f0a4` |
| 51 | `tools/ci/publish-shots.mjs` | 1–284 | `719fc7c82bbb166e1ec0d114c82245b4b5a6331b1f009417ea0ab364ad8b0cac` |
| 52 | `tools/ci/queue-depth.mjs` | 1–414 | `b8733d427c2115dd945945ac250ad2a3eb8d846d0ebe80e966865243f905fd0e` |
| 53 | `tools/ci/ready-gate.mjs` | 1–377 | `1e5f097b44a397ce5d0b1c60d23489a67e51732cd5754352f506a3759c3031b9` |
| 54 | `tools/ci/release-provenance.mjs` | 1–134 | `01c2ec15897ab8dbbf91a4c39c311a293c47ecebd1499d1d234dbbf7a6e7f0e3` |

## Responsibilities, commands and limits

### guards-verdict.mjs

Commit guard cache. check compares staged git write-tree and a raw cache body with ten-minute mtime freshness; run removes the previous cache, runs node --test with NODE_TEST_CONTEXT removed, and writes only after a complete unique guards roster, clean tracked worktree at both ends and identical index trees. Untracked files are outside unstagedTracked.

### inputs-hash.mjs

CI input cache identity. guards inventories every tracked path; sweeps-parts declares narrower roots. SHA256 incorporates Node version, optional salt, missing paths, path/kind/executable bit/content length, symlink target or bytes. Directory inventories exclude node_modules/.git/artifacts. Coverage helpers are assertions over declared prefixes, not dynamic access tracing.

### js-debugger-smoke.mjs

Offline debugger smoke. Invokes the MCP bash wrapper list-tools with 15s timeout; demands six named tools and schemas, then writes a tiny CPU profile fixture and runs cpuprofile-summary with 10s timeout. Finally removes fixture directory. Self-test injects fake subprocesses; this is not native debugger/CDP or browser evidence.

### junit-failed.mjs

JUnit failure extraction. Walks full testcase bodies so preceding system-out does not hide failure/error children. Normalizes classname to tests/*.spec.js; exposes unattributed failures and testcase counts separately. Directory collector reads immediate test-results-* folders; this is a tailored regex parser, not general XML parsing.

### lane-preamble.mjs

Launch-prompt generator. Reads layout-audit --list through a subprocess, validates exact/prefix-wildcard screen and viewport names, validates scale syntax, prints audit and bounded-read instructions; --core bypasses catalog lookup. Generated text recommends commands but executes no audit.

### launch-gate.mjs

Quota launch receipt. Parses saved get_session envelopes or hook wrappers, validates timestamp/file age (120s), mtime skew (5s), and future timestamps; allowed status or a nonempty typed override can authorize quota, but stale page still refuses. Writes artifacts/launch-gate/receipt.json with page SHA256 and optional lane/PR. It does not launch a session.

### live-run-check.mjs

Push advisory. Reads branch and origin, GETs at most five in-progress runs, filters ci.yml, uses proxyFetch with 3s timeout and degrades to null. CLI always exits zero. bash-guard currently calls it, so its header claim that hook wiring is future work is stale.

### measure-pr-ci-after-close.mjs

Post-close CI metrics. GET-only API sampling, up to twenty run pages and ten job pages, default eighty PR runs over 24h. Sums completed positive job durations; post-close means job start after PR closure, not overlapping time after closure. Peak hour is UTC hour with most qualifying completed run walls; targets are reported booleans, not a failing gate.

### merge-gate.mjs

Landing gate. Requires open ready PR, no hold label, closed Plan, newest CI check success, clean prospective merge with gen:check and ratchets, and <=2 first-parent game merges behind base. Fetches refs and creates/removes artifacts/merge-gate/wt-<pr>; runs merge-result scripts with token/secret and runner command-path variables removed. No merge commit or remote merge is made by this CLI; land.yml owns checks and auto-merge.

### needs-sync.mjs

Sync decision. Fetches remote branch/deploy by default, checks ancestry and merge-tree conflict without changing checkout, then reads newest CI state through snapshot. conflict or a red run predating new deploy commits means sync; clean-behind means no. Offline only detects conflict. Exit 0 means sync needed, 1 no, 3 unknown; stale-red is explicitly heuristic.

### nightly-group.mjs

Nightly rotation. Loads browser groups and filters explicit exclusions, sorts deterministically, chooses UTC epoch-day modulo rotation length (negative day supported). UNSCHEDULED records aliases/manual homes. Actual CLI emits GROUP=<bare group>, matching GITHUB_OUTPUT workflow caller; prose claiming bare-only output is imprecise.

### node-plan.mjs

Within-run node planner. Uses pick-tests, select-specs circuit resolution, adapted spec partitions, groups.json and generated scripts. Unknown infra/harness/unowned unit/no route falls back to every scoped script. Matched PR plans skip tooling-fast overlap, remove blanket boot reasons and spec-owner-only groups, scope circuits, and force edited adapted specs to their VM partition. Shell output defines planned() and exports NODE_PLAN_SKIP_TF/APEX_CIRCUITS.

### pages-live-sha.sh

Live SHA shell reader. curl index.html with 20s cap and cache bust; exact lowercase forty-hex apex-sha extraction; empty on unreadable site and explicit exit zero. Missing required argument can still fail shell expansion. Caller interprets empty as unknown.

### pages-publishable.sh

Pages monotonic publication guard. Prints boolean; equal live SHA refuses redundant publication, known live ancestor permits, otherwise refuses. Unreadable live SHA permits unlocked probe but --strict refuses under Pages lock. Uses local Git objects, so insufficient history cannot establish ancestry.

### pages-reuse-verdict.sh

Pages gate reuse. Considers exact SHA and at most two tree-equal parents, invalidates parent reuse when intervening history touched workflow/action/CI/staging/selection inputs. gh API success alone is insufficient: CI, geometry, selected verdict and all present Smoke shards must have succeeded. Failures fall back to reuse=false. Runs query is capped thirty; jobs query paginates. This conservative optimization can miss reuse.

### pick-tests.mjs

Group selector. Every matching regex contributes groups and reasons. Browser-spec ownership comes from groups.json; stripSpecOwner removes owner-only reasons for finer CI selection. Changed-path helper retains rename sources, plus default working tree/untracked paths. JSON receipt distinguishes none/matched/partial/unmatched; prose no-match merely recommends tiny. It prints commands; it does not run verification.

### pick-unit-slices.mjs

Runner selector. Selects guards/seven node matrix rows/driving-model via rule union, group-derived unit ownership, adapted source rules and geometry input rules. Unknown paths/errors choose all; new unit files choose guards. Produces any_node/driving/slices GITHUB_OUTPUT, with --needed-only pruning rows. Cost p50 table is advisory historical data and never controls routing.

### playwright-occupancy.mjs

Occupancy oracle. Classifies process table suite, host MCP server and host Chromium separately; excludes shell command strings and --mcp-config mentions. busy is suite or host browser, while live can include idle server. --scan only runs ps and prints JSON; no kill or lock mutation.

### poll-live-shell.mjs

Post-deploy live poll. Parses coherent version JSON and unique shell metas, accepts exact build/SHA or a confirmed descendant with sufficient build. Polls two cache-busted URLs sequentially with 8s fetch caps, 24 attempts and 5-to-12s backoff. Writes outcome match/superseded/timeout; last values explain failure. pages.yml skips byte comparison for superseded train.

### pr-board.mjs

PR advisory board. ETag-cached snapshot assembles head CI, guards, plans, hold, lane and handoff owner. Decision precedence FOREIGN-ARM/SYNC/FIX then ARM/READY/WAIT/NONE remains legacy advisory logic with MAX_ARMED=2 and MERGE-HOLD support; it does not arm or merge. Default CLI additionally fetches needs-sync for SYNC/FIX rows; alarm measures CI-run age rather than real push age.

### pr-body.mjs

Live PR body editor. Reads latest PR body immediately before PATCH; targeted Plan transforms tick with evidence, strike with reason, defer, move now, append; Status and legacy fleet keys supported; labels POST separately. Dry-run prints only. Fresh read minimizes stale overwrite but provides no conditional write/CAS, so simultaneous GET/PATCH edits still can race.

### process-dashboard.mjs

Nightly dashboard reducer and fetch CLI. Computes nearest-rank job/family percentiles, slowest matrix cells, full/fast tier walls, same-SHA regates, cancelled percentage and Pages proxies for deployment/DORA. API transient retries bounded, jobs 30/page max12. Fixture mode avoids API. --check time ceilings skips undersampled rows; workflow publishes metrics separately from deploy.

### prune-branches.mjs

Branch pruning. Default lists; --apply needs known open-PR input, protects base/default/gh-pages/claims-board/keep patterns, retains open heads and recent branches. Merged/absorbed/expired claim lossless cases can delete; opted-in lossy verdicts require archive refs first with tag fallback and per-ref porcelain tracking. Batches fifty refs; report writes can happen even in dry run. Remote deletion is an explicit mutation mode.

### publish-shots.mjs

Legacy screenshot branch publisher. Validates plain topic, PNG signature/name/400KiB cap, unique filenames and notes. Fetches deploy or existing append branch, builds temporary shots worktree, links node_modules, stages, commits via hooks and plain-pushes shots/<topic> only. Dry-run still fetches/worktrees/stages but omits commit/push; finally cleans worktree/local branch. New evidence routes to publish-evidence.

### queue-depth.mjs

Informational queue gauge. Counts queued/running Linux/macOS jobs separately from concurrency pending, models forty/five slots, signals count/starvation thresholds but exits zero on hold. Up to three pages/status, thirty detailed runs, sixty further queued total-count samples. Approximations and unpaged first100 jobs/run can undercount. --push parses destination and skips if no CI; --wait adds two-minute settling and bounded errors.

### ready-gate.mjs

Pre-ready gate. Prefers conclusive Structural guards over local stamp; local stamp must match commit tree (or legacy SHA) and same-run terminal suite log. PR mode requires open draft, computed clean mergeability, closed Plan and explicit memory-edit intent, with paginated changed files checked for completeness. Writes ready receipt even refusal. Wait polls pending guards with head-move detection. A+B fallback is mandatory; C/D are checked when present.

### release-provenance.mjs

Release provenance report. Reads current source/deploy refs and their merge-base, fetches live shell metadata; emits JSON/Markdown and optional strict failure. It does not fetch fresh remote refs. Classifier mostly uses equality rather than proving live ancestry; duplicated mergeBase===liveSha condition makes source-and-deploy-diverged-from-live unreachable. strict fails dirty, unknown live or generic newer verdict, not every non-exact state.

## Proven orchestration edges

- `package.json:45` runs guards-verdict run; `.claude/hooks/bash-guard.sh:704` consumes its check cache.
- `.github/workflows/ci.yml:425,492,617,684` computes guards A–D input keys. The hash is about source inputs, distinct from the staged-index guards cache.
- CI unit-plan invokes pick-unit-slices (`ci.yml:2193–2228`), then each selected node runner sources node-plan (`ci.yml:933–950`). vm-a1 carries net/audio/state/desktop, vm-a2 garage; slow carries steering/MCP/SW/lifecycle/agent-contract (`ci.yml:976` onward). Runner selection and within-run script selection are distinct.
- `pick-tests` imports are consumed by node-plan, select-specs, select-recall and tooling-fast; `select-specs` and `twinned-specs` feed both node planners. node-plan/tooling-fast have reciprocal module imports, so initialization order matters when moving top-level work.
- `junit-failed` is imported by selected-gate-verdict and called by `ci.yml:2928` to carry prior failing specs into selection. Unattributed failures remain red through the separate verdict reader.
- `nightly-group` appends GROUP output at `ci.yml:1596`. Its rotation membership depends on groups.json and explicit exclusions, not a fixed count.
- `ready-gate.planVerdict` is reused by merge-gate and pr-board. `pr-board` and needs-sync import each other; calls are deferred to runtime. sync-pr also imports needs-sync and node-plan.
- `.github/workflows/land.yml:170` runs merge-gate --pr --sha --check, interprets exit, posts gate check where needed; this source map did not execute landing.
- `.github/workflows/pages.yml:149,168,252,310` reads live SHA, evaluates reuse, checks publishability unlocked and again strict under lock. `pages.yml:423` polls live shell; `:428` checks runtime bytes only for outcome=match.
- `.github/workflows/process-dashboard.yml:55,66` generates and checks metrics; `.github/workflows/prune-branches.yml:97` invokes pruning.
- `tools/mcp/apex-tools-mcp.mjs:31` and tooling-fast dynamically import occupancy; idle MCP alone is not busy.
- `live-run-check` is actually invoked by `.claude/hooks/bash-guard.sh:452–455` and imported by verify-change. Its TODO hook comments are stale.

## Direct dependency ledger

Relative module imports/requires below are explicit source edges, not inferred transitive ownership. Node built-ins omitted. Workflow/caller rows above establish operational entrypoints; a filename mentioned only in generated tools/README is not treated as a caller.

- `tools/ci/guards-verdict.mjs` → `../lib/cli-args.mjs`
- `tools/ci/inputs-hash.mjs` → `./geometry-paths.mjs`
- `tools/ci/js-debugger-smoke.mjs` → no relative module import (shell/standalone; command and data dependencies described above).
- `tools/ci/junit-failed.mjs` → `../lib/cli-args.mjs`
- `tools/ci/lane-preamble.mjs` → no relative module import (shell/standalone; command and data dependencies described above).
- `tools/ci/launch-gate.mjs` → `../lib/cli-args.mjs`
- `tools/ci/live-run-check.mjs` → `../lib/proxy-fetch.mjs`
- `tools/ci/measure-pr-ci-after-close.mjs` → `../lib/cli-args.mjs`, `./github-api.mjs`
- `tools/ci/merge-gate.mjs` → `../lib/cli-args.mjs`, `./github-api.mjs`, `./ready-gate.mjs`
- `tools/ci/needs-sync.mjs` → `../lib/git-run.mjs`, `../lib/pr-snapshot.mjs`, `./github-api.mjs`, `./pr-board.mjs`
- `tools/ci/nightly-group.mjs` → no relative module import (shell/standalone; command and data dependencies described above).
- `tools/ci/node-plan.mjs` → `../lib/changed-files.mjs`, `./pick-tests.mjs`, `./select-specs.mjs`, `./tooling-fast.mjs`, `./twinned-specs.mjs`
- `tools/ci/pages-live-sha.sh` → no relative module import (shell/standalone; command and data dependencies described above).
- `tools/ci/pages-publishable.sh` → no relative module import (shell/standalone; command and data dependencies described above).
- `tools/ci/pages-reuse-verdict.sh` → no relative module import (shell/standalone; command and data dependencies described above).
- `tools/ci/pick-tests.mjs` → `../lib/changed-files.mjs`
- `tools/ci/pick-unit-slices.mjs` → `../lib/changed-files.mjs`, `./geometry-paths.mjs`, `./pick-tests.mjs`, `./select-specs.mjs`, `./twinned-specs.mjs`
- `tools/ci/playwright-occupancy.mjs` → no relative module import (shell/standalone; command and data dependencies described above).
- `tools/ci/poll-live-shell.mjs` → no relative module import (shell/standalone; command and data dependencies described above).
- `tools/ci/pr-board.mjs` → `../lib/cli-args.mjs`, `../lib/pr-snapshot.mjs`, `./github-api.mjs`, `./needs-sync.mjs`, `./ready-gate.mjs`
- `tools/ci/pr-body.mjs` → `../lib/cli-args.mjs`, `../lib/fleet-block.mjs`, `./github-api.mjs`, `./github-token.mjs`
- `tools/ci/process-dashboard.mjs` → `../lib/proxy-fetch.mjs`, `./github-token.mjs`
- `tools/ci/prune-branches.mjs` → `./branch-audit.mjs`
- `tools/ci/publish-shots.mjs` → no relative module import (shell/standalone; command and data dependencies described above).
- `tools/ci/queue-depth.mjs` → `../lib/cli-args.mjs`, `../lib/pr-snapshot.mjs`, `./github-api.mjs`
- `tools/ci/ready-gate.mjs` → `../lib/cli-args.mjs`, `../lib/gate-receipt.mjs`, `../lib/work-tree-id.mjs`, `./github-api.mjs`
- `tools/ci/release-provenance.mjs` → no relative module import (shell/standalone; command and data dependencies described above).

## Comment evidence and verification boundary

Source establishes guards complete-roster/index provenance, fail-safe selector branches, receipt paths, gate exit semantics, mutation modes, and exact workflow invocation strings. Historical runtimes, incident counts and slot capacities embedded in comments are dated rationale, not re-measured facts. The nightly bare-output claim, live-run future-hook claim, queue header push-hold wording and pr-board legacy arm protocol must be read against current branches/callers described above. No claim is made that the external APIs, current CI checks, receipts, live deployment, debugger wrapper, tests or pruning actually succeeded in this session.
