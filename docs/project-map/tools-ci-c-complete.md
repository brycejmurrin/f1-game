# tools/ci complete source map — C (positions 55–82)

Snapshot: working-tree source read on 2026-10-27; checkout HEAD `212adc24b985b120a63507c988abea69e7740e74`. Exact scope: positions **55–82 inclusive** of `git ls-files 'tools/ci/*' | sort` (**82 tracked paths total; 28 scoped files; 8,818 newline-terminated source lines**). No workflow, test suite, browser, dispatch, fetch, runtime script, or commit was executed for this map. Only this documentation file is authored by this lane.

## Evidence and navigation method

Read root `AGENTS.md` and `.claude/skills/code-nav/SKILL.md`. The code-nav rule explicitly permits source-text navigation for files outside `js/`; all scoped sources are CI Node/shell code. Attached apex-lsp tools exist, but their JS-game reference index is not used as evidence for these outside-js modules. Imports, entry guards, function bodies, process calls and workflow call sites were read directly. No semantic LSP caller result is claimed.

Every scoped byte range was read as bounded source (generally <=260 lines per request). An initial oversized combined view was truncated and was superseded by bounded complete reads; it is not counted as complete evidence. SHA-256 below hashes exact working-tree bytes. Ranges are inclusive and contiguous; hashes distinguish this snapshot from later changes. Dependency/caller references below are textual evidence, not an assertion that every mention executes. Helpers outside scope were traced by import/path edges and relevant call-site excerpts only; they are not marked fully read.

## Full-file read ledger

| Position | File | Lines read | SHA-256 |
|---|---|---|---|
| 55 | `tools/ci/remote-group.mjs` | 1–260, 261–426 | `6a0623f4d8a0691b3b50f7a50c0db59573f95a515c9fd0054c2e767c3abf4644` |
| 56 | `tools/ci/repo-size.mjs` | 1–99 | `262f1a34bd033e133fa735fed23ed07c311e238906ab937cd92b545c4f4bb55c` |
| 57 | `tools/ci/reuse-draft-fast.sh` | 1–90 | `2c89d0f08592528476e7679406a81021591704555db2a63c8f6dce5af1330103` |
| 58 | `tools/ci/run-group.mjs` | 1–58 | `c9a1c6da5f66f07cf0b8e729fd4223309f045304135671b1d07ac87b61fca96f` |
| 59 | `tools/ci/run-node-group.mjs` | 1–68 | `c5cc686a0880bfe2ac4510388e9d0fecd9788150eb5fd3b3586adb741c9f18f1` |
| 60 | `tools/ci/run-playwright.mjs` | 1–260, 261–285 | `4fbb69dbc8a8aaa76046511ba1da3acfa105084dea826d97da40ef68e2bbc164` |
| 61 | `tools/ci/select-budget.mjs` | 1–260, 261–413 | `afedd02ebe93be26ba5b2b5fda37aff9dfcb00b32d04af7adc3c5179d9b74d2f` |
| 62 | `tools/ci/select-recall.mjs` | 1–192 | `e137a873e8b0b86ee23a79ce8d100c9abb422202c74ea03e3fab68be259811b0` |
| 63 | `tools/ci/select-specs.mjs` | 1–260, 261–520, 521–780, 781–1040, 1041–1300, 1301–1560, 1561–1573 | `9484cda6a9a781373b6356c75075c7ccd3d46417a41b10717742cd9b9cca2cfd` |
| 64 | `tools/ci/selected-gate-verdict.mjs` | 1–222 | `d5923aaefc609e9864d062d1570ecd1c1c6ac7a4bbec18faa9e4f4bb3ba90ba4` |
| 65 | `tools/ci/session-status.mjs` | 1–252 | `df5cdebf93007773eb1c8ab2e86c6515e97472682921f12770c8555865bba423` |
| 66 | `tools/ci/session-transcript.mjs` | 1–260, 261–487 | `6c49d5d21147c19a5aea0b448ad8812af60634fc404a1af37bd8ce2021593edc` |
| 67 | `tools/ci/spec-staleness.mjs` | 1–152 | `0ee0834ac614f1979efba7995f21896a5b3ff119a60d723ee978f943df1dbad2` |
| 68 | `tools/ci/spec-timings.mjs` | 1–260, 261–482 | `ed008e5b36ff1adc997b7f98b2558906555719b2e8d08f4941857e1615e917ae` |
| 69 | `tools/ci/sweep-shards.mjs` | 1–94 | `493b99c3509cc9e94e80035b6dca665c53f8f4a99f4cc17df854c164348ec0ed` |
| 70 | `tools/ci/sync-pr.mjs` | 1–260, 261–290 | `83ea3f54226f9e59b6e9e0943711ce29683ecb6544a873dfee9b538dca8ef524` |
| 71 | `tools/ci/test-bg.mjs` | 1–260, 261–520, 521–774 | `0ae5cd541938e9b049b78e3175ee3b0b68c2dd45ff88042d3f05722a058098b8` |
| 72 | `tools/ci/test-coverage-audit.mjs` | 1–70 | `8fdd8ff48b79f8f212a2f0831e3cf7e956054a1327cda6ac98d3fe62910a5ea4` |
| 73 | `tools/ci/test-honesty.mjs` | 1–96 | `aac50d20a167520d488d94ea0fa1ce4f10ff5a8961522baed0640d41e2e01c45` |
| 74 | `tools/ci/test-observed.mjs` | 1–245 | `42b93056d19895bd13e295749b2d25b4e79a3588932c3375a03547ce119ac16c` |
| 75 | `tools/ci/test-solo.mjs` | 1–123 | `632cb607c7dcd675c8db74191e8e80cbe43e768895f50add88f2caa867420cef` |
| 76 | `tools/ci/tooling-fast.mjs` | 1–260, 261–520, 521–780, 781–1031 | `3f75f801a27c17e30ee8e1c12647966a138c671dfcfd3035d3de01eeda4fbbb7` |
| 77 | `tools/ci/tooling-timings.mjs` | 1–141 | `24b31b1813d03710eb014be32d0079fba6dc7634956d00ed9e2690d50583563f` |
| 78 | `tools/ci/twinned-specs.mjs` | 1–260, 261–441 | `53bc3a96fc6988a8e35ff009242e15e07ee34fbc353f143529e2b130e41d034b` |
| 79 | `tools/ci/verify-change.mjs` | 1–260, 261–362 | `d75a3fdf83c4d76785038ad1b8eb482fe63b3135664260e383459550ae5f8d42` |
| 80 | `tools/ci/verify-live.mjs` | 1–173 | `470536a89834f77aeb37ffcd218a8d698b6a8f0adfbb5e68fac60bdc3749fc19` |
| 81 | `tools/ci/wait-for.mjs` | 1–146 | `f7cbfbd93c074dc87167935f738d3b2214ffa7b6141a49597d9c91a971db3f1a` |
| 82 | `tools/ci/webkit-leg-summary.mjs` | 1–33 | `3d0efdcfdc1dd16caa46660749215b6a3b889ec0f9daf19336a48976c3fa1da3` |

## Command and CI contracts

These contracts describe source behavior and its visible limits. Historical measurements in comments remain dated assertions by their authors; they were not remeasured here.

### 55. `tools/ci/remote-group.mjs`

CLI <group> dispatches browser-group.yml for a pushed branch; --ref selects another remote ref; --force bypasses same-SHA live/green reuse; --no-wait returns after dispatch; --watch watches an existing run. --plan consumes GROUP/SHARDS; --run-shard consumes GROUP/PLAN/SHARD/TOTAL/WORKERS/GL and validates every packed unit against the package group. LPT plan uses committed timing history, can split a fat spec into at most eight pieces (minimum expected 120 seconds). It fetches origin before comparing SHA, refuses unpushed default HEAD and refs without the workflow. Watch returns 0 success, 1 red, 2 cancelled, 3 API/usage failure, 124 deadline; strict unknown flags exit 2. Side effects include git fetch, workflow dispatch, and child runs in shard mode. Workflow explicitly sets APEX_WITH_TWINNED=1, so dispatched browser copies actually run.

Source anchors: `tools/ci/remote-group.mjs:60` export const REPO = "brycejmurrin/f1-game";; `tools/ci/remote-group.mjs:61` export const WORKFLOW = "browser-group.yml";; `tools/ci/remote-group.mjs:62` export const SHARD_CHOICES = [1, 2, 4, 6, 8];   // browser-group.yml's `shards` options; `tools/ci/remote-group.mjs:66` export function resolveWorkers(group, gl, requested, scripts) {; `tools/ci/remote-group.mjs:73` export function browserGroups(scripts) {; `tools/ci/remote-group.mjs:80` export function parseWorkers(w) {; `tools/ci/remote-group.mjs:85` export function planMatrix(group, shards, scripts) {; `tools/ci/remote-group.mjs:96` export const SPEC_RE = /^tests\/specs\/[A-Za-z0-9._-]+\.spec\.js$/;; `tools/ci/remote-group.mjs:103` export const MAX_PIECES = 8;; `tools/ci/remote-group.mjs:104` export const MIN_PIECE_SEC = 120;; `tools/ci/remote-group.mjs:109` export function groupFiles(group, scripts) {; `tools/ci/remote-group.mjs:124` export function expectedSec(file, db) {; `tools/ci/remote-group.mjs:144` export function shardPlan(group, shards, scripts, db = loadDb(path.join(ROOT, TIMINGS_FILE))) {; `tools/ci/remote-group.mjs:185` export function runShardArgs({ group, plan, shard, total, workers, timeoutMs = 900000 }, scripts) {; `tools/ci/remote-group.mjs:223` export function liveRun(runs, { branch, group, sha }) {; `tools/ci/remote-group.mjs:236` export function pickRun(runs, { branch, group, sinceMs }) {; `tools/ci/remote-group.mjs:246` export function failLines(log, max = 8) {; `tools/ci/remote-group.mjs:257` export function groupVerdict(run, jobs) {; `tools/ci/remote-group.mjs:282` export function fetchOrigin(branch, spawn = spawnSync, cwd = ROOT) {; `tools/ci/remote-group.mjs:320` export const USAGE = `usage: node tools/ci/remote-group.mjs <group> [--shards N] [--gl llvmpipe|swiftshader] [--workers N] [--ref <branch>] ; `tools/ci/remote-group.mjs:326` export const KNOWN_FLAGS = ["--shards", "--gl", "--workers", "--ref", "--no-wait", "--force", "--timeout", "--interval", "--plan", "--run-sh.

Import/dependency edges (literal source sites):
- `tools/ci/remote-group.mjs:47` — `import fs from "node:fs";`
- `tools/ci/remote-group.mjs:48` — `import path from "node:path";`
- `tools/ci/remote-group.mjs:49` — `import { spawnSync } from "node:child_process";`
- `tools/ci/remote-group.mjs:50` — `import { fileURLToPath } from "node:url";`
- `tools/ci/remote-group.mjs:51` — `import { request } from "./github-api.mjs";`
- `tools/ci/remote-group.mjs:52` — `import { strictFlags } from "../lib/cli-args.mjs";`
- `tools/ci/remote-group.mjs:53` — `import { gitTry } from "../lib/git-run.mjs";`
- `tools/ci/remote-group.mjs:54` — `import { defaultRemoteWorkers } from "../lib/browser-workers.mjs";`
- `tools/ci/remote-group.mjs:55` — `import { CI_BUCKETS, MIN_SAMPLES, declaredTests, specSecPerTest } from "./select-budget.mjs";`
- `tools/ci/remote-group.mjs:56` — `import { specsOf } from "./select-specs.mjs";`
- `tools/ci/remote-group.mjs:57` — `import { inBuckets, loadDb, median, TIMINGS_FILE } from "./spec-timings.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/browser-group.yml` lines 4, 16, 44, 68, 96, 112, 124.
- `.github/workflows/ci.yml` lines 2882.
- `tests/groups.json` lines 813.
- `tests/unit/remote-group.test.mjs` lines 1, 14, 39, 262.
- `tools/ci/ci-select-specs-step.sh` lines 82.
- `tools/ci/selected-gate-verdict.mjs` lines 165.

### 56. `tools/ci/repo-size.mjs`

Reads git reachable objects across all refs and HEAD tree; refuses shallow clones (2). summarize deduplicates objects by SHA and ranks packed/raw blob sizes by first-seen path, top-level directory, extension, and history-only status. --top controls ranking; --out writes Markdown as well as stdout. repo-size.yml invokes it on the workflow checkout. This measures Git object accounting, not physical filesystem directory sizes or the exact transfer bytes of a fresh clone.

Source anchors: `tools/ci/repo-size.mjs:28` export function summarize(text, { top = 40, current = null } = {}) {; `tools/ci/repo-size.mjs:58` export const mb = (n) => (n / 1048576).toFixed(1) + " MB";; `tools/ci/repo-size.mjs:61` export function render(s, { refs = 0 } = {}) {; `tools/ci/repo-size.mjs:78` export function main(argv = process.argv.slice(2)) {.

Import/dependency edges (literal source sites):
- `tools/ci/repo-size.mjs:22` — `import { execFileSync, spawnSync } from "node:child_process";`
- `tools/ci/repo-size.mjs:23` — `import fs from "node:fs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/repo-size.yml` lines 5, 39.
- `tests/unit/repo-size.test.mjs` lines 16.

### 57. `tools/ci/reuse-draft-fast.sh`

CI shell helper emits reuse=false on non-ready_for_review, missing head/token tooling/API evidence, moved/unknown base, missing successful tooling A, or no prior green ci.yml PR run. PR_HEAD_SHA filters the runs API; GITHUB_RUN_ID excludes itself; ignored-title runs are excluded. For an eligible successful run, compares base tip committer date against prior run start and requires Structural guards (tooling A) success. Outputs reuse=true and run=<id>. CI appends stdout to GITHUB_OUTPUT. Date comparison approximates base stability; it does not compare historical base SHAs.

Source anchors: .

Import/dependency edges (literal source sites):
- No non-builtin import edge in this file.

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/ci.yml` lines 414, 486, 606, 678, 1118, 1697.
- `tests/unit/ci-pr-base.test.mjs` lines 125.
- `tests/unit/ci-ship-filter-geometry.test.mjs` lines 128, 130.

### 58. `tools/ci/run-group.mjs`

runGroup resolves a nonempty tests/groups.json group, optionally removes TOOLING_FAST_FILES with --skip-tf, preserves generated flags/isolation through nodeGroupPhases, runs phases sequentially with compile cache and NODE_TEST_CONTEXT removed. An empty filtered group reports SKIPPED and succeeds; unknown group throws; missing test:<group> CLI argument exits 2. ci.yml uses it under NODE_PLAN_SKIP_TF in node matrix arms.

Source anchors: `tools/ci/run-group.mjs:24` export function filesFor(script, { skipTf = false, doc = loadGroups() } = {}) {; `tools/ci/run-group.mjs:35` export function runGroup(script, { skipTf = false, doc = loadGroups(), execute = spawnSync,.

Import/dependency edges (literal source sites):
- `tools/ci/run-group.mjs:11` — `import { spawnSync } from "node:child_process";`
- `tools/ci/run-group.mjs:12` — `import { createRequire } from "node:module";`
- `tools/ci/run-group.mjs:13` — `import path from "node:path";`
- `tools/ci/run-group.mjs:14` — `import { fileURLToPath } from "node:url";`
- `tools/ci/run-group.mjs:15` — `import { TOOLING_FAST_FILES } from "./tooling-fast.mjs";`
- `tools/ci/run-group.mjs:16` — `import { loadGroups } from "../gen/gen-test-groups.mjs";`
- `tools/ci/run-group.mjs:17` — `import { nodeGroupPhases } from "./run-node-group.mjs";`
- `tools/ci/run-group.mjs:20` — `const { augmentNodeCompileCache } = require("../lib/node-compile-cache.cjs");`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/ci.yml` lines 978, 981, 984, 987, 1005, 1027, 1033, 1036, 1039, 1042, 1058, 1065.
- `tests/unit/node-plan.test.mjs` lines 15.
- `tools/ci/node-plan.mjs` lines 69.

### 59. `tools/ci/run-node-group.mjs`

Generated npm command supplies group name, the exact current roster, a -- delimiter, then optional Node flags. main rejects stale/missing roster. nodeGroupPhases validates Node kind and nonempty files, runs each isolated file separately before ordinary files, and forwards only --flag or --flag=value tokens to every phase. Extra paths, separate option values, and second delimiter are rejected. Async phases use detached process groups on POSIX; SIGINT/SIGTERM forward to the active group and the CLI re-signals itself.

Source anchors: `tools/ci/run-node-group.mjs:12` export function nodeGroupPhases(def, isolatedFiles = [], extraArgs = []) {; `tools/ci/run-node-group.mjs:24` export async function runNodeGroup(name, extraArgs = [], { doc = loadGroups() } = {}) {.

Import/dependency edges (literal source sites):
- `tools/ci/run-node-group.mjs:7` — `import { spawn } from "node:child_process";`
- `tools/ci/run-node-group.mjs:8` — `import path from "node:path";`
- `tools/ci/run-node-group.mjs:9` — `import { fileURLToPath } from "node:url";`
- `tools/ci/run-node-group.mjs:10` — `import { loadGroups, nodeFlags } from "../gen/gen-test-groups.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `package.json` lines 25, 53, 55, 57, 59.
- `tests/unit/node-plan.test.mjs` lines 16.
- `tests/unit/test-groups-generated.test.mjs` lines 16, 83, 92, 114.
- `tools/ci/run-group.mjs` lines 17.
- `tools/gen/gen-test-groups.mjs` lines 53.

### 60. `tools/ci/run-playwright.mjs`

Top-level executable under npm test/browser groups. Partitions twins, runs dropped twins first in node TAP with APEX_VM_PAGE=1 for adaptations, and requires nonzero passed tests with a readable summary. Fully twinned requests emit a real VM verdict without browser; --list does not discover the whole suite when all requested specs are substituted. Binds an ephemeral loopback static server unless APEX_PORT supplied; MIME includes mjs/wasm; suffix paths are delegated to config through APEX_PORT. Copies APEX_LAST_RUN_FILE when --last-failed. Peels mega specs for fresh processes, except native-sharded megas-only requests, forwards signals, closes managed server, and returns child failure. It launches runtime/browser code if executed.

Source anchors: .

Import/dependency edges (literal source sites):
- `tools/ci/run-playwright.mjs:7` — `import { spawn, spawnSync } from "node:child_process";`
- `tools/ci/run-playwright.mjs:8` — `import { copyFileSync, createReadStream, mkdirSync, statSync } from "node:fs";`
- `tools/ci/run-playwright.mjs:9` — `import { createServer } from "node:http";`
- `tools/ci/run-playwright.mjs:10` — `import { fileURLToPath } from "node:url";`
- `tools/ci/run-playwright.mjs:11` — `import { extname, join, resolve as resolvePath, sep } from "node:path";`
- `tools/ci/run-playwright.mjs:12` — `import { partitionArgs } from "./twinned-specs.mjs";`
- `tools/ci/run-playwright.mjs:18` — `} from "./select-specs.mjs";`
- `tools/ci/run-playwright.mjs:26` — `// rejected outright, so .mjs must be mapped or dynamic import() fails.`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.claude/hooks/live-run.py` lines 5.
- `.claude/hooks/protect-files.py` lines 244, 263.
- `.claude/hooks/shellparse.py` lines 1314.
- `.claude/hooks/stop-guard.sh` lines 8, 29.
- `.github/workflows/ci.yml` lines 1570, 1852.
- `package.json` lines 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 29, 30, 31, 33, 35, 63, 64, 76, 82, 83.
- `tests/groups.json` lines 2077.
- `tests/unit/adapted-specs.test.mjs` lines 18, 49.
- `tests/unit/browser-workers.test.mjs` lines 100, 103, 105, 108.
- `tests/unit/flaky-quarantine.test.mjs` lines 108.
- `tests/unit/remote-group.test.mjs` lines 24, 73, 74, 75, 126, 148.
- `tests/unit/select-specs.test.mjs` lines 47, 48, 49, 448, 1057, 1303, 1351.
- `tests/unit/test-bg-waste.test.mjs` lines 13, 14.
- `tests/unit/test-groups-generated.test.mjs` lines 95.
- `tests/unit/tools-runnable.test.mjs` lines 330.
- `tests/unit/twinned-specs.test.mjs` lines 105, 141, 152, 163.
- `tools/ci/remote-group.mjs` lines 33, 72, 112, 214, 215.
- `tools/ci/select-specs.mjs` lines 395.
- `tools/ci/test-bg.mjs` lines 36.
- `tools/ci/test-solo.mjs` lines 11, 97.
- `tools/ci/twinned-specs.mjs` lines 233.
- `tools/gen/gen-test-groups.mjs` lines 55.
- `tools/manifest.cjs` lines 1537.

### 61. `tools/ci/select-budget.mjs`

Importable budget/counter library plus table/--json CLI, optional --budget. Uses espree to count recognized test calls, expands supported static for-of array/roster forms, returns null on missing/unparseable source, and does not enter a recognized test body. Timing estimate uses the most-sampled qualifying single CI bucket (at least three), else 7.5 seconds/test. timings optionally unions APEX_SPEC_TIMINGS overlay. capacity subtracts timeout*(1+retries) per modeled failure; estimates are planning inputs, not run evidence. Import time enumerates specs and parses declared counts.

Source anchors: `tools/ci/select-budget.mjs:30` export const MEASURED = {; `tools/ci/select-budget.mjs:41` export const CI_BUCKETS = ["swiftshader", "llvmpipe"];; `tools/ci/select-budget.mjs:45` export const MIN_SAMPLES = 3;; `tools/ci/select-budget.mjs:58` export function timings(reload = false) {; `tools/ci/select-budget.mjs:78` export function specSecPerTest(file, db = timings()) {; `tools/ci/select-budget.mjs:99` export function billing(file, m = MEASURED) {; `tools/ci/select-budget.mjs:108` export const VARIANTS = [; `tools/ci/select-budget.mjs:285` export function declaredTests(file) {; `tools/ci/select-budget.mjs:338` export function capacity(budgetMin, failures = 1, m = MEASURED) {; `tools/ci/select-budget.mjs:351` export const SPEC_COUNTS = counts;.

Import/dependency edges (literal source sites):
- `tools/ci/select-budget.mjs:6` — `import fs from "node:fs";`
- `tools/ci/select-budget.mjs:7` — `import path from "node:path";`
- `tools/ci/select-budget.mjs:8` — `import { createRequire } from "node:module";`
- `tools/ci/select-budget.mjs:9` — `import { fileURLToPath } from "node:url";`
- `tools/ci/select-budget.mjs:10` — `import * as espree from "espree";`
- `tools/ci/select-budget.mjs:11` — `import { loadDb, unionDb, median, inBuckets, TIMINGS_FILE } from "./spec-timings.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/ci.yml` lines 1631, 1748, 2593, 2731.
- `.github/workflows/spec-timings.yml` lines 5, 98, 187.
- `tests/unit/ci-ship-smoke-renderer.test.mjs` lines 20.
- `tests/unit/circuit-scope.test.mjs` lines 47.
- `tests/unit/elevation-tracks-vm.test.mjs` lines 74.
- `tests/unit/select-budget.test.mjs` lines 14.
- `tests/unit/select-specs.test.mjs` lines 26, 448, 1057.
- `tests/unit/spec-timings.test.mjs` lines 30.
- `tests/unit/twinned-specs.test.mjs` lines 74.
- `tools/ci/ci-select-specs-step.sh` lines 33.
- `tools/ci/remote-group.mjs` lines 55.
- `tools/ci/select-specs.mjs` lines 8, 30, 240.
- `tools/ci/spec-timings.mjs` lines 6, 50.
- `tools/ci/twinned-specs.mjs` lines 71.
- `tools/lib/circuit-scope.cjs` lines 39.
- `tools/manifest.cjs` lines 1545.

### 62. `tools/ci/select-recall.mjs`

Replays five pinned faulty-change cases through pick, specsImporting, fit, and prioritise; classifies selected/oversize/overflow/spill/over-budget runs as hits and named misses separately. Non-JSON CLI fails below RECALL_FLOOR=5 or for silent misses. --json prints rows and exits 0 before floor enforcement. replay short-circuits tracked paths as infra while select-specs.select now keeps infra candidates, so the harness is a bounded reproduction model rather than an exact duplicate of all selector behavior.

Source anchors: `tools/ci/select-recall.mjs:36` export const CASES = [; `tools/ci/select-recall.mjs:71` export function replay(changed, budgetMin = 15) {; `tools/ci/select-recall.mjs:111` export function recall(cases = CASES) {.

Import/dependency edges (literal source sites):
- `tools/ci/select-recall.mjs:26` — `import path from "node:path";`
- `tools/ci/select-recall.mjs:27` — `import { fileURLToPath } from "node:url";`
- `tools/ci/select-recall.mjs:28` — `import { pick } from "./pick-tests.mjs";`
- `tools/ci/select-recall.mjs:29` — `import { specsOf, fit, specsImporting, prioritise, TRACKED } from "./select-specs.mjs";`
- `tools/ci/select-recall.mjs:30` — `import fs from "node:fs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `tests/helpers/touch-input.js` lines 10.
- `tests/specs/touch-steer.spec.js` lines 24.
- `tests/unit/docs-integrity.test.mjs` lines 849.
- `tests/unit/select-specs.test.mjs` lines 25, 581.
- `tools/ci/pick-tests.mjs` lines 91.
- `tools/ci/select-specs.mjs` lines 630.
- `tools/manifest.cjs` lines 1546.

### 63. `tools/ci/select-specs.mjs`

CLI requires --since; supports --budget-min, --overflow-shards, --failed-from, --stale-first, --json. select composes path rules, changed spec priority, scoped carry-forward, helper reverse imports, source/impact pins, CSS coverage, and circuits raced. fit reports every unreadable/fixed/manual/twinned/drop bucket; default main budget 10 minutes, 180-second no-retry gate, 4 oversize entries, 11 overflow allowances, 7 spill allowances, 8 declared-slow allowances (each target 360 seconds). shards packs separate pools and isolates native pieces, high-timeout/golden/quarantine/fat-UI specs; quarantine alone gets a retry. Fat UI uses one worker, at least two pieces (HUD four), 45 seconds/test floor and 50-minute cap; ordinary cap 18 minutes plus formula-derived setup/wrap accounting. 24 rotating lanes assign matrix concurrency. Circuit-only plans scope APEX_CIRCUITS and own foundations; definition edits additionally route specs naming the circuit. Infra remains a warning with candidates retained, unmatched remains untrustworthy, docs plans are empty. Output is a plan, not proof tests ran.

Source anchors: `tools/ci/select-specs.mjs:63` export const SELECTED_GATE = { retries: 0, perTestTimeoutSec: 180 };; `tools/ci/select-specs.mjs:75` export const LANES = 24;; `tools/ci/select-specs.mjs:81` export function laneBase(env = process.env) {; `tools/ci/select-specs.mjs:93` export const FIXED_GATE_SPECS = new Set([; `tools/ci/select-specs.mjs:104` export const MANUAL_OPT_IN_SPECS = new Set([; `tools/ci/select-specs.mjs:177` export function maxDeclaredTimeout(file) {; `tools/ci/select-specs.mjs:219` export function specsOf(scriptNames, scripts) {; `tools/ci/select-specs.mjs:245` export const MAX_OVERSIZE_SHARDS = 4;; `tools/ci/select-specs.mjs:272` export const MAX_OVERFLOW_SHARDS = 11;; `tools/ci/select-specs.mjs:291` export const MAX_SPILL_SHARDS = 7;; `tools/ci/select-specs.mjs:304` export const MAX_OVER_BUDGET_SHARDS = 8;; `tools/ci/select-specs.mjs:317` export const MAX_FAILURES = 3;; `tools/ci/select-specs.mjs:321` export const TARGET_SHARD_SEC = 360;; `tools/ci/select-specs.mjs:331` export const MAX_SELECTED_JOB_MIN = 18;; `tools/ci/select-specs.mjs:339` export const FAT_UI_SEC_PER_TEST = 45;; `tools/ci/select-specs.mjs:344` export const FAT_UI_SELECTED_JOB_MIN = 50;; `tools/ci/select-specs.mjs:349` export const FAT_UI_MIN_PIECES = 2;; `tools/ci/select-specs.mjs:358` export const HUD_LAYOUT_MIN_PIECES = 4;; `tools/ci/select-specs.mjs:365` export const MAX_TESTS_PER_JOB = 8;; `tools/ci/select-specs.mjs:375` export const SOLO_OWN_TIMEOUT_SEC = 3 * SELECTED_GATE.perTestTimeoutSec;; `tools/ci/select-specs.mjs:380` export function isMegaSweepSpec(file) {; `tools/ci/select-specs.mjs:397` export function partitionMegaSweepArgs(args) {; `tools/ci/select-specs.mjs:418` export function playwrightShard(args) {; `tools/ci/select-specs.mjs:438` export function megaShardPlan(mega, total, db = loadDb(path.join(ROOT, TIMINGS_FILE))) {; `tools/ci/select-specs.mjs:455` export function megasForThisShard(args, mega, db) {; `tools/ci/select-specs.mjs:482` export function megaSoloFlags(args) {; `tools/ci/select-specs.mjs:514` export const SELECTED_SETUP_MIN = 3;; `tools/ci/select-specs.mjs:519` export const SELECTED_WRAP_MIN = 2; // selected wrap-up headroom (PR #1109/#1113/#1114); `tools/ci/select-specs.mjs:520` export const shardCapMin = (expectedSec, perTestSec = SELECTED_GATE.perTestTimeoutSec, maxMin = MAX_SELECTED_JOB_MIN, retries = 0) => {; `tools/ci/select-specs.mjs:538` export function piecesToFitCap(sec, tests = Infinity, maxMin = MAX_SELECTED_JOB_MIN) {; `tools/ci/select-specs.mjs:548` export const expectedSec = (r, db = timings()) => r.tests * specSecPerTest(r.file, db).sec;; `tools/ci/select-specs.mjs:556` export function measuredCheap(file, db = timings()) {; `tools/ci/select-specs.mjs:577` export function fit(specs, budgetMin, { rank = () => 3, db = timings(), overflowShards = MAX_OVERFLOW_SHARDS,; `tools/ci/select-specs.mjs:839` export function shards(r, db = timings(), quarantine = loadQuarantine(), base = laneBase()) {; `tools/ci/select-specs.mjs:970` export const TRACKED = [; `tools/ci/select-specs.mjs:997` export const CIRCUIT_FILE = /^js\/circuits\/(?:scenery\/)?([a-z0-9_]+)\.js$/;; `tools/ci/select-specs.mjs:1004` export const CIRCUIT_DEF = /^js\/circuits\/([a-z0-9_]+)\.js$/;; `tools/ci/select-specs.mjs:1010` export const CIRCUIT_LANDMARK = /^tests\/data\/landmarks\/([a-z0-9_]+)\.json$/;; `tools/ci/select-specs.mjs:1011` export const CIRCUIT_FOUNDATION = /^tests\/specs\/([a-z0-9-]+)-foundation\.spec\.js$/;; `tools/ci/select-specs.mjs:1024` export const CIRCUIT_FILTERED_TESTS = new Set([; `tools/ci/select-specs.mjs:1062` export const foundationSpec = (id) => `tests/specs/${id.replace(/_/g, "-")}-foundation.spec.js`;; `tools/ci/select-specs.mjs:1083` export function circuitsOf(file, seen = new Set()) {; `tools/ci/select-specs.mjs:1125` export function specsRacing(ids, root = ROOT) {; `tools/ci/select-specs.mjs:1139` export function dataCircuits(file, ref, root = ROOT) {; `tools/ci/select-specs.mjs:1173` export function circuitsTouched(changed, ref, root = ROOT) {; `tools/ci/select-specs.mjs:1206` export function racingCircuitIds(changed) {; `tools/ci/select-specs.mjs:1222` export const DOCS_ONLY = [/^docs\//, /\.md$/, /^\.claude\//, /^\.cursor\//];; `tools/ci/select-specs.mjs:1223` export const isDocsOnly = (changed) =>; `tools/ci/select-specs.mjs:1231` export const SOURCE_AFFECTED = [; `tools/ci/select-specs.mjs:1255` export const GENERIC_BOOT_SPECS = new Set([; `tools/ci/select-specs.mjs:1264` export function nodeTestsNaming(file, root = ROOT) {; `tools/ci/select-specs.mjs:1279` export function jsCoverageGaps(changed, { root = ROOT, routeOf = null } = {}) {; `tools/ci/select-specs.mjs:1299` export function specsAffectedBySource(changed, root = ROOT) {; `tools/ci/select-specs.mjs:1319` export function specsImporting(changed, root = ROOT) {; `tools/ci/select-specs.mjs:1365` export function prioritise(specs, { changedSpecs = [], failed = [], imported = [] } = {}) {; `tools/ci/select-specs.mjs:1379` export function scopeCarryForward(failed, routed) {; `tools/ci/select-specs.mjs:1396` export const BOOT_FALLBACK_REASONS = new Set([; `tools/ci/select-specs.mjs:1400` export function dropBootFallback(groups) {; `tools/ci/select-specs.mjs:1413` export const DEFAULT_BUDGET_MIN = 10;; `tools/ci/select-specs.mjs:1417` export function cssSpecs(changed) {; `tools/ci/select-specs.mjs:1434` export function select(changedRef, budgetMin = DEFAULT_BUDGET_MIN, opts = {}) {.

Import/dependency edges (literal source sites):
- `tools/ci/select-specs.mjs:24` — `import fs from "node:fs";`
- `tools/ci/select-specs.mjs:25` — `import path from "node:path";`
- `tools/ci/select-specs.mjs:26` — `import { execFileSync } from "node:child_process";`
- `tools/ci/select-specs.mjs:27` — `import { fileURLToPath } from "node:url";`
- `tools/ci/select-specs.mjs:28` — `import { createRequire } from "node:module";`
- `tools/ci/select-specs.mjs:29` — `import { pick, stripSpecOwner } from "./pick-tests.mjs";`
- `tools/ci/select-specs.mjs:30` — `import { MEASURED, capacity, declaredTests, specSecPerTest, timings } from "./select-budget.mjs";`
- `tools/ci/select-specs.mjs:31` — `import { loadDb, TIMINGS_FILE } from "./spec-timings.mjs";`
- `tools/ci/select-specs.mjs:32` — `import { ADAPTED, ADAPTED_RUNNER, isTwinned, twinOf } from "./twinned-specs.mjs";`
- `tools/ci/select-specs.mjs:33` — `import { changedPaths } from "../lib/changed-files.mjs";`
- `tools/ci/select-specs.mjs:34` — `import { specsAffectedByImpact } from "../lib/impact-map.mjs";`
- `tools/ci/select-specs.mjs:35` — `import { changeKind } from "./change-kind.mjs";`
- `tools/ci/select-specs.mjs:36` — `import { referencesIn } from "../check/cross-file-paths.mjs";`
- `tools/ci/select-specs.mjs:37` — `import { loadQuarantine } from "../../tests/helpers/flaky-policy.mjs";`
- `tools/ci/select-specs.mjs:38` — `import * as espree from "espree";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/ci.yml` lines 1970, 2042, 2145, 2249, 2620, 2622, 2703, 2879, 2886, 2896.
- `tests/helpers/ci-workflow.mjs` lines 6.
- `tests/helpers/touch-input.js` lines 6.
- `tests/specs/albert-park-foundation.spec.js` lines 4.
- `tests/specs/hud-layout.spec.js` lines 513.
- `tests/specs/map-hooks.spec.js` lines 11.
- `tests/specs/menu-keyboard.spec.js` lines 83.
- `tests/specs/multiplayer-scan-cancel.spec.js` lines 65.
- `tests/specs/multiplayer-scan.spec.js` lines 65.
- `tests/specs/parts-ers.spec.js` lines 70.
- `tests/specs/parts-factory-presets.spec.js` lines 19.
- `tests/specs/physics-fixes.spec.js` lines 20.
- `tests/specs/physics-hotpath.spec.js` lines 19.
- `tests/specs/render-boot.spec.js` lines 16.
- `tests/specs/rotation-recovery.spec.js` lines 35.
- `tests/unit/ci-ship-smoke-renderer.test.mjs` lines 12, 171.
- `tests/unit/circuit-scope.test.mjs` lines 16.
- `tests/unit/docs-integrity.test.mjs` lines 848.
- `tests/unit/flaky-quarantine.test.mjs` lines 13.
- `tests/unit/props-over-road.test.mjs` lines 22.
- `tests/unit/select-budget.test.mjs` lines 8.
- `tests/unit/select-specs.test.mjs` lines 21, 447, 702, 704, 945, 1056, 1593, 1645, 1666, 1820, 1826, 1840.
- `tests/unit/twinned-specs.test.mjs` lines 18.
- `tools/ci/ci-select-specs-step.sh` lines 2, 45.
- `tools/ci/node-plan.mjs` lines 35, 141.
- `tools/ci/pick-tests.mjs` lines 33.
- `tools/ci/pick-unit-slices.mjs` lines 29.
- `tools/ci/remote-group.mjs` lines 56.
- `tools/ci/run-playwright.mjs` lines 18.
- `tools/ci/select-recall.mjs` lines 29, 84, 161, 173.
- `tools/ci/spec-staleness.mjs` lines 58.
- `tools/ci/test-bg.mjs` lines 57.
- `tools/ci/tooling-fast.mjs` lines 65.
- `tools/lib/circuit-scope.cjs` lines 12.
- `tools/lib/stale-rows.mjs` lines 15.
- `tools/manifest.cjs` lines 1544.
- `tools/mcp/apex-tools-mcp.mjs` lines 1942.

### 64. `tools/ci/selected-gate-verdict.mjs`

Reads SELECT/SELECTED/GUARDS/DROPPED/CALLED/DRAFT/DOWNLOAD_FAILED and optional JUnit/started roots. Failed selection reds; failure/cancelled matrix always reds even with clean sibling JUnit; missing started-shard JUnit and download failure get explicit diagnostics. Successful/empty selected plans pass only with dropped=0 on PRs; called train warns for dropped specs; draft skipped legs pass with a warning for drops. Guards failure adds context but is owned by its separate check. CLI emits workflow annotations and exits 0/1. infraRetry remains false on every current branch.

Source anchors: `tools/ci/selected-gate-verdict.mjs:26` export function shardEvidence(junitIn, startedIn) {; `tools/ci/selected-gate-verdict.mjs:62` export function selectedGateVerdict(input) {.

Import/dependency edges (literal source sites):
- `tools/ci/selected-gate-verdict.mjs:15` — `import fs from "node:fs";`
- `tools/ci/selected-gate-verdict.mjs:16` — `import path from "node:path";`
- `tools/ci/selected-gate-verdict.mjs:17` — `import { fileURLToPath } from "node:url";`
- `tools/ci/selected-gate-verdict.mjs:18` — `import { failedSpecsUnder, unattributedFailuresFrom, testcaseCount } from "./junit-failed.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/ci.yml` lines 2580, 2911.
- `tests/unit/ci-gate-selection.test.mjs` lines 252.
- `tests/unit/ci-workflow-triggers.test.mjs` lines 13.
- `tests/unit/select-specs.test.mjs` lines 1294.
- `tests/unit/selected-gate-verdict.test.mjs` lines 9, 104, 131, 201.

### 65. `tools/ci/session-status.mjs`

Local collect reads cached git branch/base/ahead/behind/upstream/session trailers, dirty paths, artifacts/logs verdicts and live-run.py. No fetch. --summary bounds Markdown inventories; --json returns full data; --pr [N] uses cached API snapshot for live head/draft/mergeability/newest-workflow conclusions, tolerating lookup errors. parseVerdict gives nonzero bg exit precedence and treats deploy logs specially so inner passed summaries cannot prove a deploy pass. Status is timestamped historical evidence, not ready-gate validation. Header says always exit 0, but strict unknown flags still have the shared usage failure path.

Source anchors: `tools/ci/session-status.mjs:36` export const DEPLOY = "claude/f1-game-project-26h3ng";; `tools/ci/session-status.mjs:44` export function parseVerdict(text) {; `tools/ci/session-status.mjs:97` export function collect() {; `tools/ci/session-status.mjs:126` export function toMarkdown(s) {; `tools/ci/session-status.mjs:154` export function toSummary(s) {; `tools/ci/session-status.mjs:186` export function ciSummary(runs) {; `tools/ci/session-status.mjs:202` export function fetchLivePr({ prArg, branch, request }) {; `tools/ci/session-status.mjs:218` export function livePrLines({ at, pr, ci, localHead, error }) {.

Import/dependency edges (literal source sites):
- `tools/ci/session-status.mjs:29` — `import { spawnSync } from "node:child_process";`
- `tools/ci/session-status.mjs:30` — `import fs from "node:fs";`
- `tools/ci/session-status.mjs:31` — `import path from "node:path";`
- `tools/ci/session-status.mjs:32` — `import { fileURLToPath } from "node:url";`
- `tools/ci/session-status.mjs:33` — `import { gitTry } from "../lib/git-run.mjs";`
- `tools/ci/session-status.mjs:231` — `const { strictFlags } = await import("../lib/cli-args.mjs");`
- `tools/ci/session-status.mjs:243` — `const { createSnapshot } = await import("../lib/pr-snapshot.mjs");`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `tests/unit/session-status.test.mjs` lines 16, 215.
- `tools/ci/pr-body.mjs` lines 192.
- `tools/mcp/apex-tools-mcp.mjs` lines 867.

### 66. `tools/ci/session-transcript.mjs`

Reads saved list_events envelopes/raw JSON or local JSONL; deduplicates events, orders time, folds tool results and quota noise, separates injected turns, and exposes normalized JSON, timeline, --summary, --ctx, --digest, --tally skills,cache-breaks. Digest caps lines/characters and excerpts. --session requires --session-json; attribution compares normalized ID when supplied, cumulative cost tolerance, and event time window, exits 3 on mismatch. Usage 2; read/parse failures 1; printed 0. Transcript contents are explicitly data, not instructions. Attribution cannot independently recover a missing session ID from events.

Source anchors: `tools/ci/session-transcript.mjs:48` export const ONLY = ["tools", "errors", "chat", "turns"];; `tools/ci/session-transcript.mjs:52` export function extractPage(text) {; `tools/ci/session-transcript.mjs:78` export function describeCall(name, input = {}) {; `tools/ci/session-transcript.mjs:93` export function normalize(rawEvents) {; `tools/ci/session-transcript.mjs:185` export function foldQuota(rows) {; `tools/ci/session-transcript.mjs:212` export function quotaState(rows) {; `tools/ci/session-transcript.mjs:238` export function summarize(rows, opts = {}) {; `tools/ci/session-transcript.mjs:253` export const summaryLine = (s) => {; `tools/ci/session-transcript.mjs:270` export function render(rows, page, opts = {}) {; `tools/ci/session-transcript.mjs:298` export function contextRows(rawEvents) {; `tools/ci/session-transcript.mjs:315` export function renderCtx(rows, cap) {; `tools/ci/session-transcript.mjs:329` export const DIGEST_MAX_LINES = 40;; `tools/ci/session-transcript.mjs:330` export const DIGEST_MAX_CHARS = 4000;; `tools/ci/session-transcript.mjs:331` export function digest(rows, ctx, page = {}, opts = {}) {; `tools/ci/session-transcript.mjs:361` export function tallySkills(rows) {; `tools/ci/session-transcript.mjs:370` export const CACHE_BREAK_FALL = 0.5;; `tools/ci/session-transcript.mjs:371` export function cacheBreaks(ctx) {; `tools/ci/session-transcript.mjs:379` export function renderCacheBreaks(ctx) {; `tools/ci/session-transcript.mjs:387` export function attribution(rawEvents, session, requested = "") {; `tools/ci/session-transcript.mjs:405` export function eventsFromJsonl(text) {; `tools/ci/session-transcript.mjs:411` export const TALLY = ["skills", "cache-breaks"];; `tools/ci/session-transcript.mjs:415` export function parseArgs(argv) {.

Import/dependency edges (literal source sites):
- `tools/ci/session-transcript.mjs:41` — `import fs from "node:fs";`
- `tools/ci/session-transcript.mjs:42` — `import path from "node:path";`
- `tools/ci/session-transcript.mjs:43` — `import { fileURLToPath } from "node:url";`
- `tools/ci/session-transcript.mjs:44` — `import { makeFlags } from "../lib/cli-args.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.claude/hooks/context-cap.py` lines 9.
- `tests/unit/session-transcript.test.mjs` lines 8, 101, 213, 236.
- `tools/ci/archive-sessions.mjs` lines 30.

### 67. `tools/ci/spec-staleness.mjs`

CLI --days (30 default), --top (25 default), --json walks nonmerge git commits and invokes current select for each parent range at budget 15. Records newest planned run across selected/oversize/overflow/spill/over-budget buckets and current on-disk specs; ranks never/oldest first. Reports unreplayable commits and shallow truncation in human output. This is counterfactual routing replay using current source/timings, not proof historical CI ran or passed; it does not checkout each historical tree.

Source anchors: .

Import/dependency edges (literal source sites):
- `tools/ci/spec-staleness.mjs:54` — `import fs from "node:fs";`
- `tools/ci/spec-staleness.mjs:55` — `import path from "node:path";`
- `tools/ci/spec-staleness.mjs:56` — `import { gitOut } from "../lib/git-run.mjs";`
- `tools/ci/spec-staleness.mjs:57` — `import { fileURLToPath } from "node:url";`
- `tools/ci/spec-staleness.mjs:58` — `import { select } from "./select-specs.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `tests/unit/tools-runnable.test.mjs` lines 329.

### 68. `tools/ci/spec-timings.mjs`

Parses successful final JUnit attempts or final live-reporter lines into per-title/per-spec timing samples; failed final attempts clear rows instead of recording timeout cost. Merge deduplicates run-second/bucket identity, keeps ten samples per series globally, and serializes sorted deterministic JSON. Buckets swiftshader/llvmpipe/local stay attached; CI/APEX_GL chooses bucket. Default command finds immediate artifacts test-results*/report*/junit.xml, merges and writes tests/data/spec-timings.json; explicit paths supported. --dry-run avoids save; --into/--env/--keep configure destination; --check growth and --steps [--md] are advisory exit 0. Whole-spec seconds sum successful testcase durations, not directly measured process wall.

Source anchors: `tools/ci/spec-timings.mjs:40` export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");; `tools/ci/spec-timings.mjs:41` export const TIMINGS_FILE = "tests/data/spec-timings.json";; `tools/ci/spec-timings.mjs:46` export const KEEP = 10;; `tools/ci/spec-timings.mjs:51` export const BUCKETS = ["swiftshader", "llvmpipe", "local"];; `tools/ci/spec-timings.mjs:53` export const SCHEMA =; `tools/ci/spec-timings.mjs:62` export function envBucket(env = process.env) {; `tools/ci/spec-timings.mjs:69` export function isoSecond(value) {; `tools/ci/spec-timings.mjs:74` export function median(xs) {; `tools/ci/spec-timings.mjs:88` export function normaliseSpec(name) {; `tools/ci/spec-timings.mjs:110` export function parseJunit(xml) {; `tools/ci/spec-timings.mjs:144` export function parseLiveLog(text, endISO) {; `tools/ci/spec-timings.mjs:171` export function emptyDb() {; `tools/ci/spec-timings.mjs:175` export function loadDb(file = path.join(ROOT, TIMINGS_FILE)) {; `tools/ci/spec-timings.mjs:198` export function mergeRows(db, rows, { env = "local", keep = KEEP } = {}) {; `tools/ci/spec-timings.mjs:246` export function unionDb(a, b, { keep = KEEP } = {}) {; `tools/ci/spec-timings.mjs:269` export function serialise(db) {; `tools/ci/spec-timings.mjs:285` export function saveDb(db, file = path.join(ROOT, TIMINGS_FILE)) {; `tools/ci/spec-timings.mjs:291` export const inBuckets = (samples, buckets) => (samples || []).filter((s) => buckets.includes(s[1]));; `tools/ci/spec-timings.mjs:300` export function growth(db, { factor = 2, minSamples = 3 } = {}) {; `tools/ci/spec-timings.mjs:324` export function mad(xs) {; `tools/ci/spec-timings.mjs:334` export function bestSplit(xs, { minBefore = 2, minAfter = 1 } = {}) {; `tools/ci/spec-timings.mjs:357` export function steps(db, { buckets = ["llvmpipe"], minPrior = 4, floor = 3 } = {}) {; `tools/ci/spec-timings.mjs:382` export function defaultSources(root = ROOT) {.

Import/dependency edges (literal source sites):
- `tools/ci/spec-timings.mjs:36` — `import fs from "node:fs";`
- `tools/ci/spec-timings.mjs:37` — `import path from "node:path";`
- `tools/ci/spec-timings.mjs:38` — `import { fileURLToPath } from "node:url";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/ci.yml` lines 1629, 1746, 2729.
- `.github/workflows/spec-timings.yml` lines 8, 137, 153, 154, 158, 159, 186.
- `tests/helpers/live-reporter.js` lines 44, 296.
- `tests/unit/ci-ship-smoke-renderer.test.mjs` lines 17, 72.
- `tests/unit/spec-timings.test.mjs` lines 28, 496, 517.
- `tools/ci/remote-group.mjs` lines 57.
- `tools/ci/select-budget.mjs` lines 11, 386.
- `tools/ci/select-specs.mjs` lines 31.

### 69. `tools/ci/sweep-shards.mjs`

planSweepShards validates positive integer shard count, nonempty unique suite list, assigns longest weighted suites to least-loaded bins, preserving original order inside each. Weights are a static measured table; missing/zero timing gets 27.821 seconds. CLI reads test:sweeps paths from --package (package.json default), --shards default four, requires valid --shard, emits names or --json. CI consumes JSON then rewrites its runner-local package script; planner itself only reads files and prints.

Source anchors: `tools/ci/sweep-shards.mjs:48` export function planSweepShards(files, { shards = 4, timings = SWEEP_TIMINGS_SEC } = {}) {.

Import/dependency edges (literal source sites):
- `tools/ci/sweep-shards.mjs:12` — `import fs from "node:fs";`
- `tools/ci/sweep-shards.mjs:13` — `import path from "node:path";`
- `tools/ci/sweep-shards.mjs:14` — `import { pathToFileURL } from "node:url";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/ci.yml` lines 1268.
- `tests/unit/sweep-shards.test.mjs` lines 5, 38, 50.
- `tests/unit/tooling-fast-runner.test.mjs` lines 329.

### 70. `tools/ci/sync-pr.mjs`

CLI <branch> --plan reads cached refs without fetch/checkout; normal operation registers run, optionally waits for load, fetches PR/deploy, checks needsSync, preflight, checks out sync-pr-<sanitized branch>, merges deploy via deploy helpers, regenerates, and verifies staged commands. --verify fast default narrows tooling/node suites to own diff; full runs all; none only clean merge with no regenerated content. --resume/--from reuse kept branch; --stop uses registered process-tree stop. Stages time out with SIGTERM (20-minute tooling, 15 node, five track). --push re-fetches remote and rejects new commits not in local result; no force/rebase. Failure returns to initial checkout after aborting merge; no-push success leaves result branch for review.

Source anchors: `tools/ci/sync-pr.mjs:81` export function runStage(st, cwd = ROOT) {; `tools/ci/sync-pr.mjs:88` export const VERIFY_MODES = ["none", "fast", "full"];; `tools/ci/sync-pr.mjs:97` export function verifyStages({ verify, changed, circuits, suites, planFor = nodePlan }) {; `tools/ci/sync-pr.mjs:112` export function runStages(stages, { from = null, run = runStage } = {}) {; `tools/ci/sync-pr.mjs:122` export const KNOWN_FLAGS = ["--plan", "--push", "--resume", "--force-clean-behind", "--stop", "--verify", "--from", "--wait-load"];; `tools/ci/sync-pr.mjs:124` export const USAGE = [; `tools/ci/sync-pr.mjs:139` export function cachedPlan(prBranch, readGit = git) {; `tools/ci/sync-pr.mjs:150` export function staleSyncBranch(localBranch, prBranch, readGit = git) {; `tools/ci/sync-pr.mjs:157` export function remoteMoved(localBranch, prBranch, readGit = git) {; `tools/ci/sync-pr.mjs:167` export function returnTo(startedOn, keptBranch, readGit = git) {; `tools/ci/sync-pr.mjs:176` export async function main() {.

Import/dependency edges (literal source sites):
- `tools/ci/sync-pr.mjs:53` — `import { spawnSync } from "node:child_process";`
- `tools/ci/sync-pr.mjs:54` — `import os from "node:os";`
- `tools/ci/sync-pr.mjs:55` — `import path from "node:path";`
- `tools/ci/sync-pr.mjs:56` — `import { fileURLToPath } from "node:url";`
- `tools/ci/sync-pr.mjs:57` — `import { DEPLOY_BRANCH, plan, preflight, mergeDeployTip, gateNodeSuites, touchedCircuits, changedPaths } from "./deploy.mjs";`
- `tools/ci/sync-pr.mjs:58` — `import { plan as nodePlan } from "./node-plan.mjs";`
- `tools/ci/sync-pr.mjs:59` — `import { needsSync, verdictLine } from "./needs-sync.mjs";`
- `tools/ci/sync-pr.mjs:60` — `import { strictFlags } from "../lib/cli-args.mjs";`
- `tools/ci/sync-pr.mjs:61` — `import { gitRun, gitMust } from "../lib/git-run.mjs";`
- `tools/ci/sync-pr.mjs:62` — `import { register, release, stop as stopRun } from "../lib/run-pid.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.claude/hooks/bash-guard.sh` lines 206, 214.
- `.claude/hooks/merge_policy.py` lines 68.
- `.claude/hooks/protect-files.py` lines 352.
- `.claude/hooks/shellparse.py` lines 1572.
- `tests/unit/conflict-cure.test.mjs` lines 1.
- `tests/unit/cursor-agents.test.mjs` lines 87.
- `tests/unit/dispatch.test.mjs` lines 95.
- `tests/unit/needs-sync.test.mjs` lines 1.
- `tests/unit/run-pid.test.mjs` lines 18, 19, 20.
- `tests/unit/safety-bans-hook.test.mjs` lines 141.
- `tests/unit/sync-pr-robust.test.mjs` lines 8.
- `tests/unit/validation-cli.test.mjs` lines 12, 111.
- `tools/ci/behind-ship.mjs` lines 71.
- `tools/ci/ci-watch.mjs` lines 516.
- `tools/ci/dispatch.mjs` lines 147.
- `tools/ci/merge-gate.mjs` lines 116, 227, 233.
- `tools/ci/needs-sync.mjs` lines 13.
- `tools/ci/queue-depth.mjs` lines 49.
- `tools/ci/ready-gate.mjs` lines 140.
- `tools/ci/remote-group.mjs` lines 388.
- `tools/lib/conflict-cure.mjs` lines 3.
- `tools/lib/run-pid.mjs` lines 2.

### 71. `tools/ci/test-bg.mjs`

Detached group/spec supervisor with artifacts/logs/<group>.log and test-bg.json registry. Sequential default starts only first requested group; --wait groups chains; --parallel core-caps; --force bypasses caps/load/Chrome refusal. Workers default one on <=4 CPUs else two. Refuses unknown groups/flags (2), load >=3 or browser Chrome overlap/cap (3); waiter returns 1 for red, 124 deadline while leaving runs alive. Registry checks PID plus starttime/boot ID, ignores zombies, atomically rewrites merged state. Superseding a group terminates its process group before truncating log. --stop TERM/KILLs recorded groups; --sweep additionally hunts known process shapes excluding MCPs. Outcome parser gives nonzero bg exit priority and requires a browser terminal summary after latest phase start. --last-failed stages old result metadata when previous port can be found.

Source anchors: `tools/ci/test-bg.mjs:115` export function procStart(pid) {; `tools/ci/test-bg.mjs:128` export function aliveRun(run, { kill = (p) => process.kill(p, 0), start = procStart, boot = BOOT_ID, state = procState } = {}) {; `tools/ci/test-bg.mjs:170` export function outcome(run) {; `tools/ci/test-bg.mjs:183` export function outcomeOf(text) {; `tools/ci/test-bg.mjs:239` export const KNOWN_FLAGS = ["--timeout", "--workers", "--spec", "--force", "--last-failed", "--parallel", "--keep-going",; `tools/ci/test-bg.mjs:242` export const specGroupName = (file) => "spec-" + path.basename(String(file)).replace(/\.spec\.[cm]?js$/, "").replace(/[^a-z0-9._-]/gi, "_");; `tools/ci/test-bg.mjs:245` export function parseTestBgArgv(argv) {; `tools/ci/test-bg.mjs:502` export function probeChromeSessions(list = () => spawnSync("tmux", ["ls", "-F", "#S"], { encoding: "utf8", timeout: 3000 }).stdout || "") {; `tools/ci/test-bg.mjs:509` export function chromeRefusal({ browser, force, sessions }) {; `tools/ci/test-bg.mjs:521` export function docsOnlyWasteWarning({ groups, scripts = {}, changed = [], force = false } = {}) {; `tools/ci/test-bg.mjs:531` export function changedForWaste({ root = ROOT } = {}) {; `tools/ci/test-bg.mjs:742` export const USAGE = `usage: node tools/ci/test-bg.mjs <group> [group...] [--parallel] [--force] [--last-failed] [--workers <n>].

Import/dependency edges (literal source sites):
- `tools/ci/test-bg.mjs:45` — `import { spawn, execSync, spawnSync } from "node:child_process";`
- `tools/ci/test-bg.mjs:46` — `import fs from "node:fs";`
- `tools/ci/test-bg.mjs:47` — `import os from "node:os";`
- `tools/ci/test-bg.mjs:48` — `import path from "node:path";`
- `tools/ci/test-bg.mjs:49` — `import { fileURLToPath } from "node:url";`
- `tools/ci/test-bg.mjs:50` — `import { changedPaths } from "../lib/changed-files.mjs";`
- `tools/ci/test-bg.mjs:51` — `import { strictFlags } from "../lib/cli-args.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.claude/hooks/bash-guard.sh` lines 17, 246, 260, 273, 274, 286.
- `.claude/hooks/protect-files.py` lines 332.
- `.claude/hooks/shellparse.py` lines 1305, 1312, 1313, 1390, 1611.
- `.claude/hooks/stop-guard.sh` lines 11, 48.
- `.github/workflows/ci.yml` lines 127, 1499.
- `tests/fixtures/session-ledger/transcript.jsonl` lines 4.
- `tests/helpers/js-coverage.js` lines 4.
- `tests/unit/agent-config.test.mjs` lines 314, 325, 326, 332, 333, 349, 969.
- `tests/unit/agent-surface.test.mjs` lines 102.
- `tests/unit/bash-guard-hardening.test.mjs` lines 611, 616, 790, 799, 967, 1405, 1406, 1408.
- `tests/unit/change-driver-tools.test.mjs` lines 104, 120.
- `tests/unit/skill-progressive.test.mjs` lines 241, 257.
- `tests/unit/test-bg-outcome.test.mjs` lines 4, 18, 134.
- `tests/unit/test-bg-waste.test.mjs` lines 3, 10.
- `tests/unit/tooling-fast-runner.test.mjs` lines 259, 260.
- `tests/unit/twinned-specs.test.mjs` lines 133.
- `tools/ci/coverage-merge.mjs` lines 7.
- `tools/ci/pick-tests.mjs` lines 22, 53, 507, 564, 571, 580.
- `tools/ci/run-playwright.mjs` lines 83.
- `tools/ci/tooling-fast.mjs` lines 72.
- `tools/ci/verify-change.mjs` lines 8, 26, 310, 315, 316, 338, 345.
- `tools/lib/deploy-status.mjs` lines 8.
- `tools/manifest.cjs` lines 1538.
- `tools/mcp/apex-tools-mcp.mjs` lines 32, 320.
- `tools/mcp/cdmcp-bg.mjs` lines 3, 7.
- `tools/mcp/debug-chrome.mjs` lines 38.
- `tools/mcp/probe-mcp.py` lines 35, 40, 526, 729, 755.

### 72. `tools/ci/test-coverage-audit.mjs`

npm test:audit discovers root/specs/unit .spec.js/.test.mjs/.test.cjs basenames and checks topical test:* command path/glob coverage, with toolingFast roster special handling. Excludes project-only test:render. Orphans exit 1; no orphans succeed. Basename matching is intentionally layout-agnostic and does not prove test execution, semantic assertion quality, or distinguish duplicate basenames in different directories.

Source anchors: `tools/ci/test-coverage-audit.mjs:24` export function auditCoverage(testFiles, scripts) {.

Import/dependency edges (literal source sites):
- `tools/ci/test-coverage-audit.mjs:11` — `import fs from "node:fs";`
- `tools/ci/test-coverage-audit.mjs:12` — `import path from "node:path";`
- `tools/ci/test-coverage-audit.mjs:13` — `import { fileURLToPath } from "node:url";`
- `tools/ci/test-coverage-audit.mjs:14` — `import { TOOLING_FAST_FILES } from "./tooling-fast.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.claude/hooks/post-edit.sh` lines 67.
- `package.json` lines 68.
- `tests/groups.json` lines 1339.
- `tests/unit/test-coverage-audit.test.mjs` lines 31.
- `tools/ci/test-bg.mjs` lines 211.
- `tools/manifest.cjs` lines 1553.

### 73. `tools/ci/test-honesty.mjs`

Top-level recursive source scan for skip/fixme/todo and simple empty bodies; --json returns unexplained findings; default reports/advisory success; --strict exits 1 on unexplained. SKIP-OK in previous three lines or current line explains a site. Implementation also treats any nonempty first skip argument as explained, broader than header reason-string claim. Backtick/quote heuristics avoid fixture-source false positives; this is lexical, not a full AST or semantic assertion checker.

Source anchors: .

Import/dependency edges (literal source sites):
- `tools/ci/test-honesty.mjs:22` — `import fs from "node:fs";`
- `tools/ci/test-honesty.mjs:23` — `import path from "node:path";`
- `tools/ci/test-honesty.mjs:24` — `import { fileURLToPath } from "node:url";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `tests/unit/change-driver-tools.test.mjs` lines 3, 299.
- `tools/manifest.cjs` lines 1555.

### 74. `tools/ci/test-observed.mjs`

AST titlesIn recognizes test/sharedTest/it modifiers and describes, builds reporter tail-two-segment keys and template-title regex patterns. observedTitles scans local artifacts/logs .log final + pass/x FAIL lines only. audit reports declared/dynamic/emitted/skipped/never and parse errors; CLI summary, --by-file or --json. A dynamic declaration matching any emitted title is observed without proving all loop instances ran; emitted is a separate count. Logs local to this box cannot establish global CI history or current-tree correctness.

Source anchors: `tools/ci/test-observed.mjs:53` export function reporterTitle(file, titleParts) {; `tools/ci/test-observed.mjs:59` export function parseLiveReporterLine(raw) {; `tools/ci/test-observed.mjs:71` export function titlesIn(source, file) {; `tools/ci/test-observed.mjs:168` export function observedTitles() {; `tools/ci/test-observed.mjs:187` export function audit() {.

Import/dependency edges (literal source sites):
- `tools/ci/test-observed.mjs:37` — `import fs from "node:fs";`
- `tools/ci/test-observed.mjs:38` — `import path from "node:path";`
- `tools/ci/test-observed.mjs:39` — `import { fileURLToPath } from "node:url";`
- `tools/ci/test-observed.mjs:40` — `import * as espree from "espree";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `tests/unit/assert-audit.test.mjs` lines 3.
- `tests/unit/test-observed.test.mjs` lines 19, 21.
- `tools/check/cross-file-paths.mjs` lines 24.
- `tools/ci/assert-audit.mjs` lines 6.
- `tools/ci/select-budget.mjs` lines 283.
- `tools/manifest.cjs` lines 1554.

### 75. `tools/ci/test-solo.mjs`

Foreground wrapper forwards residual args to run-playwright with APEX_WORKERS=1, reports initial/end load and duration. --max-load defaults max(2, CPU count/2), --force bypasses load gate; missing args 2; busy refuses 3; child status/signal propagates. Actual busy comparison is load > threshold, whereas prose says at or above. It does not enforce exactly one supplied spec or prohibit a forwarded workers override; no own log is created.

Source anchors: .

Import/dependency edges (literal source sites):
- `tools/ci/test-solo.mjs:41` — `import { spawn } from "node:child_process";`
- `tools/ci/test-solo.mjs:42` — `import { readFileSync } from "node:fs";`
- `tools/ci/test-solo.mjs:43` — `import os from "node:os";`
- `tools/ci/test-solo.mjs:44` — `import path from "node:path";`
- `tools/ci/test-solo.mjs:45` — `import { fileURLToPath } from "node:url";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.claude/hooks/shellparse.py` lines 1314.
- `tests/specs/smoke.spec.js` lines 404.
- `tests/unit/agent-config.test.mjs` lines 318.
- `tests/unit/game-tools-help.test.mjs` lines 36.
- `tools/ci/verify-change.mjs` lines 9, 30, 352, 353.
- `tools/manifest.cjs` lines 1539.

### 76. `tools/ci/tooling-fast.mjs`

Imports floor roster from tests/groups.json; explicit subset or --changed picks path-pinned floor plus always-on topical pool, with docs selection and conservative full fallbacks. Benign scripts-only index, scripts/version-only package, version-only SW diffs seed narrow checks; unreadable classification widens. Empty --changed exits 3 without claiming verification. Runner buffers each Node TAP file, runs isolated files first then a pool, schedules unknown/longest first, rejects empty/all-skip/missing-footer green, bounds test/file timers (540/600 seconds default), reaps process groups, --bail stops future starts and --quiet keeps START/PASS in log. Full green unchanged worktree stamps ready-gate tree/head. Local timings update on passing files; --record writes committed table. CI shard membership uses committed LPT table only, four shards; CLI auto width two on browser-free load<2, otherwise one, explicit --jobs=N wins. Programmatic default remains one.

Source anchors: `tools/ci/tooling-fast.mjs:87` export const TOOLING_FAST_FILES = Object.freeze(filesOnly(loadGroups().toolingFast));; `tools/ci/tooling-fast.mjs:114` export const TIMINGS_FILE = path.join(ROOT, "tests/data/tooling-fast-timings.json");; `tools/ci/tooling-fast.mjs:118` export function loadTimings(files = [TIMINGS_FILE, LOCAL_TIMINGS_FILE]) {; `tools/ci/tooling-fast.mjs:128` export function scheduleLongestFirst(files, timings = {}) {; `tools/ci/tooling-fast.mjs:139` export function estimateToolingFast(files, timings = loadTimings(), jobs = 1) {; `tools/ci/tooling-fast.mjs:162` export function tapSummary(text) {; `tools/ci/tooling-fast.mjs:174` export const ALL_SKIP_OK = Object.freeze({});; `tools/ci/tooling-fast.mjs:183` export function emptyRunReason(text, file = "") {; `tools/ci/tooling-fast.mjs:208` export function tapFailureDetail(text) {; `tools/ci/tooling-fast.mjs:256` export async function runToolingFast(files = [...TOOLING_FAST_FILES], opts = {}) {; `tools/ci/tooling-fast.mjs:473` export const DEFAULT_JOBS = 1;; `tools/ci/tooling-fast.mjs:484` export const AUTO_JOBS = 2;; `tools/ci/tooling-fast.mjs:485` export const AUTO_JOBS_MAX_LOAD = 2;; `tools/ci/tooling-fast.mjs:488` export function autoJobs({ busy, load1 } = {}) {; `tools/ci/tooling-fast.mjs:560` export const CI_SHARDS = 4;; `tools/ci/tooling-fast.mjs:563` export function shardsCoveringFiles(files, allFiles = TOOLING_FAST_FILES, shardCount = CI_SHARDS) {; `tools/ci/tooling-fast.mjs:589` export const NARROWABLE_INFRA = Object.freeze(["index.html", "package.json", "sw.js"]);; `tools/ci/tooling-fast.mjs:592` export const NARROW_INFRA_TESTS = Object.freeze({; `tools/ci/tooling-fast.mjs:612` export const LONG_RUN_MS = 120_000;; `tools/ci/tooling-fast.mjs:613` export const LONG_RUN_HINT =; `tools/ci/tooling-fast.mjs:617` export function unifiedDiffContentLines(diffText) {; `tools/ci/tooling-fast.mjs:629` export function isScriptTagOnlyIndexHtmlDiff(diffText) {; `tools/ci/tooling-fast.mjs:644` export function isScriptsOnlyPackageJsonDiff(beforeText, afterText) {; `tools/ci/tooling-fast.mjs:664` export function isVersionOnlySwJsDiff(diffText) {; `tools/ci/tooling-fast.mjs:719` export function classifyNarrowableInfra(file, opts = {}) {; `tools/ci/tooling-fast.mjs:747` export function topicalPool(groups = loadGroups().groups, floor = TOOLING_FAST_FILES) {; `tools/ci/tooling-fast.mjs:755` export function selectToolingFastChanged(changed, opts = {}) {; `tools/ci/tooling-fast.mjs:874` export function widenedLine(meta, fileCount) {; `tools/ci/tooling-fast.mjs:880` export function changedHeader(meta, fileCount) {; `tools/ci/tooling-fast.mjs:884` export const EMPTY_DIFF_MESSAGE = `[tooling-fast] --changed: EMPTY diff against origin/${DEPLOY_BRANCH} — nothing was selected, nothing veri; `tools/ci/tooling-fast.mjs:893` export const TOOLING_FAST_USAGE = `usage: node tools/ci/tooling-fast.mjs [--stop] [--jobs=N] [--changed] [--bail] [--quiet] [--shard=i/n] [-; `tools/ci/tooling-fast.mjs:908` export function applyFileShard(files, spec, timings) {; `tools/ci/tooling-fast.mjs:929` export function ciShardFiles(files, spec) {; `tools/ci/tooling-fast.mjs:934` export function parseToolingFastArgv(argv) {.

Import/dependency edges (literal source sites):
- `tools/ci/tooling-fast.mjs:52` — `import { execFileSync, spawn, spawnSync } from "node:child_process";`
- `tools/ci/tooling-fast.mjs:53` — `import { createRequire } from "node:module";`
- `tools/ci/tooling-fast.mjs:54` — `import fs from "node:fs";`
- `tools/ci/tooling-fast.mjs:55` — `import os from "node:os";`
- `tools/ci/tooling-fast.mjs:56` — `import path from "node:path";`
- `tools/ci/tooling-fast.mjs:57` — `import { fileURLToPath } from "node:url";`
- `tools/ci/tooling-fast.mjs:60` — `const { augmentNodeCompileCache } = require("../lib/node-compile-cache.cjs");`
- `tools/ci/tooling-fast.mjs:61` — `import { changedPaths } from "../lib/changed-files.mjs";`
- `tools/ci/tooling-fast.mjs:62` — `import { loadGroups, filesOnly } from "../gen/gen-test-groups.mjs";`
- `tools/ci/tooling-fast.mjs:63` — `import { workTreeId } from "../lib/work-tree-id.mjs";`
- `tools/ci/tooling-fast.mjs:64` — `import { DEPLOY_BRANCH, selectionReceipt } from "./pick-tests.mjs";`
- `tools/ci/tooling-fast.mjs:65` — `import { TRACKED, circuitsTouched, isDocsOnly } from "./select-specs.mjs";`
- `tools/ci/tooling-fast.mjs:68` — `import { ALWAYS_ON_TOPICAL } from "./node-plan.mjs";`
- `tools/ci/tooling-fast.mjs:447` — `const { stampReadySha } = await import("./ready-gate.mjs");`
- `tools/ci/tooling-fast.mjs:497` — `const { scanPlaywrightLines } = await import("./playwright-occupancy.mjs");`
- `tools/ci/tooling-fast.mjs:983` — `const { stop } = await import("../lib/run-pid.mjs");`
- `tools/ci/tooling-fast.mjs:990` — `const { register, release } = await import("../lib/run-pid.mjs");`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/ci.yml` lines 442, 505, 634, 697.
- `package.json` lines 44.
- `tests/groups.json` lines 4, 2253.
- `tests/unit/bash-guard-hardening.test.mjs` lines 802, 1212, 1216.
- `tests/unit/change-driver-tools.test.mjs` lines 39, 80, 115, 116.
- `tests/unit/docs-integrity.test.mjs` lines 433, 469.
- `tests/unit/lane-preamble.test.mjs` lines 15.
- `tests/unit/nightly-group.test.mjs` lines 52.
- `tests/unit/node-plan.test.mjs` lines 17.
- `tests/unit/prepush-gate-coverage.test.mjs` lines 28.
- `tests/unit/run-pid.test.mjs` lines 33, 37, 45, 53, 56.
- `tests/unit/session-status.test.mjs` lines 143.
- `tests/unit/sync-pr-robust.test.mjs` lines 9, 50, 57.
- `tests/unit/test-bg-waste.test.mjs` lines 15.
- `tests/unit/test-groups-generated.test.mjs` lines 4, 18, 27.
- `tests/unit/test-groups.test.mjs` lines 47, 48, 49.
- `tests/unit/tooling-fast-runner.test.mjs` lines 1, 20, 261, 282, 289, 295, 329, 599.
- `tests/unit/tooling-timings.test.mjs` lines 11.
- `tests/unit/validation-cli.test.mjs` lines 398, 404.
- `tools/check/merge-hygiene.mjs` lines 26.
- `tools/ci/deploy.mjs` lines 219, 647, 704, 710, 831, 1004.
- `tools/ci/lane-preamble.mjs` lines 96.
- `tools/ci/nightly-group.mjs` lines 55.
- `tools/ci/node-plan.mjs` lines 38.
- `tools/ci/ready-gate.mjs` lines 34.
- `tools/ci/run-group.mjs` lines 15.
- `tools/ci/sync-pr.mjs` lines 105.
- `tools/ci/test-coverage-audit.mjs` lines 14, 31.
- `tools/ci/tooling-timings.mjs` lines 31, 37.
- `tools/ci/verify-change.mjs` lines 43, 221.
- `tools/gen/gen-test-groups.mjs` lines 17.
- `tools/lib/run-pid.mjs` lines 2.
- `tools/manifest.cjs` lines 1540.

### 77. `tools/ci/tooling-timings.mjs`

Read-only Actions harvesting of up to newest --runs green guard runs (six default) or --log files parses PASS durations only. Accepts at least three present guard jobs, all successful; current roster has A/B/C/D. Median per-file samples replace old hints; unsampled floor files retain old values; removed floor files disappear. Prints before/after predicted shard walls, not measured completion wall. --write rewrites committed timing table; --branch filters API runs. Fetches curl logs using token through stdin, errors exit 1.

Source anchors: `tools/ci/tooling-timings.mjs:36` export const GUARD_JOBS = ["Structural guards (tooling A)", "Structural guards (tooling B)", "Structural guards (tooling C)", "Structural gu; `tools/ci/tooling-timings.mjs:37` export const CI_JOBS = 4;   // ci.yml: tooling-fast.mjs --jobs=4 on a 4-vCPU ubuntu-latest; `tools/ci/tooling-timings.mjs:42` export function parseDurations(logText, into = {}) {; `tools/ci/tooling-timings.mjs:50` export function median(values) {; `tools/ci/tooling-timings.mjs:57` export function foldTable(samples, oldMs = {}, files = TOOLING_FAST_FILES) {; `tools/ci/tooling-timings.mjs:67` export function predictShards(table, truth, { files = TOOLING_FAST_FILES, shards = CI_SHARDS, jobs = CI_JOBS, fallbackMs = 1000 } = {}) {; `tools/ci/tooling-timings.mjs:87` export function harvestFromActions(runs, { log = () => {}, branch = null } = {}) {.

Import/dependency edges (literal source sites):
- `tools/ci/tooling-timings.mjs:25` — `import fs from "node:fs";`
- `tools/ci/tooling-timings.mjs:26` — `import { spawnSync } from "node:child_process";`
- `tools/ci/tooling-timings.mjs:27` — `import path from "node:path";`
- `tools/ci/tooling-timings.mjs:28` — `import { pathToFileURL } from "node:url";`
- `tools/ci/tooling-timings.mjs:29` — `import { api, REPO } from "./github-api.mjs";`
- `tools/ci/tooling-timings.mjs:30` — `import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";`
- `tools/ci/tooling-timings.mjs:31` — `import { TOOLING_FAST_FILES, TIMINGS_FILE, CI_SHARDS, applyFileShard, scheduleLongestFirst } from "./tooling-fast.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `tests/groups.json` lines 1061.
- `tests/unit/tooling-timings.test.mjs` lines 1, 10.

### 78. `tools/ci/twinned-specs.mjs`

TWINNED maps browser specs to hand VM twins; ADAPTED maps specs run themselves under vmPage; BROWSER_ONLY records known limits. partitionArgs removes concrete twin spec paths unless --with-twinned/APEX_WITH_TWINNED=1, signals nothingToRun rather than discovering suite. verify checks existence, counts, topical gate membership derived from workflow step, adapted import/mutant catcher evidence, and trainCoverage workflow structure. Counts are a drift alarm, not semantic equivalence proof; VM skips renderer/rAF. --train-plan <sel.json> names exactly dropped twins/adaptations and optionally writes GITHUB_OUTPUT scope. Normal report adds static twinDebt and exits 0/1; --json verification avoids debt enumeration.

Source anchors: `tools/ci/twinned-specs.mjs:77` export const TWINNED = {; `tools/ci/twinned-specs.mjs:115` export const ADAPTED_PAGE_GROUPS = Object.freeze({; `tools/ci/twinned-specs.mjs:132` export const adaptedPageGroupFor = (spec) =>; `tools/ci/twinned-specs.mjs:135` export const ADAPTED = {; `tools/ci/twinned-specs.mjs:161` export const BROWSER_ONLY = {; `tools/ci/twinned-specs.mjs:198` export const isTwinned = (file) => Object.hasOwn(TWINNED, file) || Object.hasOwn(ADAPTED, file);; `tools/ci/twinned-specs.mjs:200` export const twinOf = (file) => TWINNED[file] || (Object.hasOwn(ADAPTED, file) ? file : undefined);; `tools/ci/twinned-specs.mjs:201` export const isAdapted = (file) => Object.hasOwn(ADAPTED, file);; `tools/ci/twinned-specs.mjs:203` export const ADAPTED_RUNNER = "tests/unit/adapted-specs.test.mjs";; `tools/ci/twinned-specs.mjs:211` export async function twinDebt() {; `tools/ci/twinned-specs.mjs:239` export function partitionArgs(argv, env = process.env) {; `tools/ci/twinned-specs.mjs:258` export function gatedNodeFiles() {; `tools/ci/twinned-specs.mjs:292` export function deployGateGroups() {; `tools/ci/twinned-specs.mjs:313` export function ungatedNodeFiles() {; `tools/ci/twinned-specs.mjs:325` export function jobBlock(yml, id) {; `tools/ci/twinned-specs.mjs:333` export function jobIf(yml, id) {; `tools/ci/twinned-specs.mjs:336` export const TRAIN_TWIN_JOB = "train-twins";; `tools/ci/twinned-specs.mjs:341` export function trainCoverage(yml = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8")) {; `tools/ci/twinned-specs.mjs:356` export function trainTwinPlan(sel) {; `tools/ci/twinned-specs.mjs:368` export function verify() {.

Import/dependency edges (literal source sites):
- `tools/ci/twinned-specs.mjs:68` — `import fs from "node:fs";`
- `tools/ci/twinned-specs.mjs:69` — `import path from "node:path";`
- `tools/ci/twinned-specs.mjs:70` — `import { fileURLToPath } from "node:url";`
- `tools/ci/twinned-specs.mjs:71` — `import { declaredTests } from "./select-budget.mjs";`
- `tools/ci/twinned-specs.mjs:212` — `const { auditAll } = await import("../check/vm-portable.mjs");`
- `tools/ci/twinned-specs.mjs:375` — `if (/from "@playwright\/test"/.test(src)) problems.push(`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/ci.yml` lines 821, 833, 942, 1929, 2037, 2282.
- `tests/helpers/vm-page.js` lines 34.
- `tests/specs/agent-view.spec.js` lines 1891.
- `tests/unit/adapted-specs.test.mjs` lines 3, 30, 43.
- `tests/unit/agent-config.test.mjs` lines 1015.
- `tests/unit/agent-hooks-vm.test.mjs` lines 2.
- `tests/unit/dev-tools-vm.test.mjs` lines 5.
- `tests/unit/docs-integrity.test.mjs` lines 414.
- `tests/unit/node-plan.test.mjs` lines 7, 19, 179.
- `tests/unit/physics-feel-vm.test.mjs` lines 4.
- `tests/unit/select-specs.test.mjs` lines 68, 1059, 1744.
- `tests/unit/twinned-specs.test.mjs` lines 17, 39, 109, 279.
- `tools/check/ratchets.mjs` lines 106.
- `tools/check/twin-fidelity.mjs` lines 5.
- `tools/check/vm-portable.mjs` lines 73.
- `tools/ci/fixture-consumer-audit.mjs` lines 32.
- `tools/ci/node-plan.mjs` lines 36, 51.
- `tools/ci/pick-unit-slices.mjs` lines 30.
- `tools/ci/run-playwright.mjs` lines 12, 74.
- `tools/ci/select-specs.mjs` lines 32, 605.
- `tools/docs/gen-agent-index.mjs` lines 25.
- `tools/lib/game-vm-pool.cjs` lines 20.

### 79. `tools/ci/verify-change.mjs`

Orchestrates explicit paths/--since/--staged/default dirty+branch+untracked selection, --plan prints JSON; phase one runs per-circuit verify, graph parity, selected toolingFast and advisory cache check. Batches are browser then node, exactly one group each via test-bg. Default starts first then returns partial (2); --fast stops after fast phase (partial if batches remain); --wait runs batches serially and --keep-going passes failures. Unclaimed routing refuses green; fast failures exit 1. Advisory liveCiRuns warns before finish. Detailed group parser is separate from test-bg; wait status stops chain but does not itself set allOk, so do not equate this orchestration source with the stricter test-bg terminal parser.

Source anchors: .

Import/dependency edges (literal source sites):
- `tools/ci/verify-change.mjs:37` — `import { spawnSync } from "node:child_process";`
- `tools/ci/verify-change.mjs:38` — `import fs from "node:fs";`
- `tools/ci/verify-change.mjs:39` — `import os from "node:os";`
- `tools/ci/verify-change.mjs:40` — `import path from "node:path";`
- `tools/ci/verify-change.mjs:41` — `import { fileURLToPath } from "node:url";`
- `tools/ci/verify-change.mjs:42` — `import { pick, DEPLOY_BRANCH, validateSelectionArgs, selectionReceipt } from "./pick-tests.mjs";`
- `tools/ci/verify-change.mjs:43` — `import { estimateToolingFast, loadTimings, selectToolingFastChanged, TOOLING_FAST_FILES } from "./tooling-fast.mjs";`
- `tools/ci/verify-change.mjs:44` — `import { liveCiRuns } from "./live-run-check.mjs";`
- `tools/ci/verify-change.mjs:45` — `import { gitOut } from "../lib/git-run.mjs";`
- `tools/ci/verify-change.mjs:46` — `import { changedPaths } from "../lib/changed-files.mjs";`
- `tools/ci/verify-change.mjs:107` — `// `!batches.length` cannot tell "nothing needs testing" from "I do not know`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.claude/hooks/mcp-browser-guard.sh` lines 62.
- `.claude/hooks/shellparse.py` lines 1304, 1316, 1593.
- `tests/unit/agent-config.test.mjs` lines 317, 329, 334, 335.
- `tests/unit/agent-surface.test.mjs` lines 103.
- `tests/unit/apex-tools-mcp.test.mjs` lines 1929, 1951.
- `tests/unit/bash-guard-hardening.test.mjs` lines 611, 797, 800, 1406, 1408.
- `tests/unit/change-driver-tools.test.mjs` lines 3, 48, 61, 68, 70, 82, 92, 104, 129, 140, 141, 165, 176, 193, 208.
- `tests/unit/nightly-group.test.mjs` lines 52.
- `tests/unit/validation-cli.test.mjs` lines 54.
- `tools/check/quick-validate.mjs` lines 4.
- `tools/ci/live-run-check.mjs` lines 6.
- `tools/ci/nightly-group.mjs` lines 77, 79.
- `tools/ci/test-bg.mjs` lines 669.
- `tools/manifest.cjs` lines 1541.
- `tools/mcp/apex-extras.mjs` lines 468.
- `tools/mcp/apex-tools-mcp.mjs` lines 1834.

### 80. `tools/ci/verify-live.mjs`

Pages post-deploy fetches index/version/SW/controller/cockpit bytes and every path in live apex-lazy-integrity JSON; compares checkout bytes and SHA-256 SRI with shell claims. Cache-busting shared timestamp; 15-second request timeout; default four retries beyond initial attempt on 502/503/504/429 or classified transport errors with capped exponential delay; 404 is not retried. Errors aggregate into JSON; mismatch exits 1, usage 2. Workflow calls only after poll-live outcome match against stamped _site. This checks publication consistency, not execution/rendering correctness, and lazy set comes from fetched shell.

Source anchors: `tools/ci/verify-live.mjs:64` export async function fetchBytes(url, opts = {}) {; `tools/ci/verify-live.mjs:113` export async function verifyLive({.

Import/dependency edges (literal source sites):
- `tools/ci/verify-live.mjs:6` — `import fs from "node:fs/promises";`
- `tools/ci/verify-live.mjs:7` — `import path from "node:path";`
- `tools/ci/verify-live.mjs:8` — `import { fileURLToPath } from "node:url";`
- `tools/ci/verify-live.mjs:9` — `import { createHash } from "node:crypto";`
- `tools/ci/verify-live.mjs:10` — `import { strictFlags } from "../lib/cli-args.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/pages.yml` lines 394, 417, 431.
- `tests/unit/deploy-stamp.test.mjs` lines 36.
- `tests/unit/verify-live.test.mjs` lines 8.
- `tools/ci/poll-live-shell.mjs` lines 29.

### 81. `tools/ci/wait-for.mjs`

Generic AND waiter for --load-below, --file-nonempty, --log-matches, --pid-gone and --merged SHA. Numeric/path/regex validation and unknown flags fail 2. Default 30-minute timeout/poll three seconds; foreground capped 590 seconds unless --background/APEX_WAIT_BACKGROUND=1; merged polls fetch deploy no faster than 30 seconds and test ancestry. Returns = wait held (0) or timeout pending list (124), kills nothing; deadline bounds sleep. --merged mutates cached refs through fetch; other conditions read host/files.

Source anchors: `tools/ci/wait-for.mjs:22` export const DEPLOY_BRANCH = "claude/f1-game-project-26h3ng";; `tools/ci/wait-for.mjs:23` export const MERGED_POLL_MIN_SEC = 30;; `tools/ci/wait-for.mjs:26` export const FOREGROUND_CAP_SEC = 590;; `tools/ci/wait-for.mjs:28` export const FLAGS = ["--load-below", "--file-nonempty", "--log-matches", "--pid-gone", "--merged", "--timeout", "--poll", "--background", "; `tools/ci/wait-for.mjs:29` export const USAGE = `usage: node tools/ci/wait-for.mjs <condition>... [--timeout <min>] [--poll <sec>]; `tools/ci/wait-for.mjs:41` export function capForeground(timeoutMin, background) {; `tools/ci/wait-for.mjs:50` export class UsageError extends Error {}; `tools/ci/wait-for.mjs:52` export function parseArgs(argv) {; `tools/ci/wait-for.mjs:99` export function mergedOnDeploy(sha, { cwd = process.cwd(), run = spawnSync } = {}) {; `tools/ci/wait-for.mjs:104` export const load1 = () => {; `tools/ci/wait-for.mjs:109` export function check(conds, deps = {}) {; `tools/ci/wait-for.mjs:122` export async function waitFor(conds, { timeoutMin, pollSec = 3, deps, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now .

Import/dependency edges (literal source sites):
- `tools/ci/wait-for.mjs:15` — `import fs from "node:fs";`
- `tools/ci/wait-for.mjs:16` — `import os from "node:os";`
- `tools/ci/wait-for.mjs:17` — `import { fileURLToPath } from "node:url";`
- `tools/ci/wait-for.mjs:18` — `import { spawnSync } from "node:child_process";`
- `tools/ci/wait-for.mjs:19` — `import { pidAlive } from "../lib/deploy-status.mjs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.claude/hooks/shellparse.py` lines 1630.
- `tests/unit/lane-preamble.test.mjs` lines 75.
- `tests/unit/wait-for.test.mjs` lines 1, 8, 52.
- `tools/ci/lane-preamble.mjs` lines 96.
- `tools/ci/sync-pr.mjs` lines 200.

### 82. `tools/ci/webkit-leg-summary.mjs`

CLI optional report path defaults artifacts/webkit-leg/report.json; missing report emits explanatory Markdown and succeeds. Parsed JSON yields table of browser version/track/backend/bound/first presented canvas/frame p50/heap, with explicit Chromium-only pass-census block. Workflow runs always and appends to GITHUB_STEP_SUMMARY. Report JSON parse errors throw; this summary does not decide boot quality or assert a verdict.

Source anchors: .

Import/dependency edges (literal source sites):
- `tools/ci/webkit-leg-summary.mjs:4` — `import fs from "node:fs";`

Inbound filename-reference trace (all matching tracked source/config files in tools, .github, tests, package.json, .claude, .codex and .agents; docs excluded; grouped line numbers):
- `.github/workflows/webkit-leg.yml` lines 93.

## Cross-file execution chains and limits

- `package.json` browser commands → `run-playwright` → twin partition/Node twins → shared Playwright and fresh mega processes. `test-bg` wraps npm with process-group identity/log registry; `test-solo` supplies the quiet-box environment. These are execution commands, so none were invoked here.
- `pick-tests`/helper imports/source pins/impact map → `select-specs.select` → `fit` buckets → `shards` matrix → CI selected jobs → started/JUnit artifacts → `selected-gate-verdict`. CI additionally fails PR coverage gaps separately (`ci.yml:2888–2898`); selectedGateVerdict itself has no coverage-gap input.
- `spec-timings` samples → `select-budget` per-test estimates → selected/remote LPT plans. `remote-group` deliberately passes committed history directly to planning so separate shards agree; selected budgeting can union the side-branch overlay.
- `tests/groups.json` → generated package groups and `TOOLING_FAST_FILES` → `tooling-fast`, overlap-filtered `run-group`, and isolated `run-node-group`. Committed tooling timings assign CI shard membership; local hints affect local execution order only.
- CI `train-twins` (`ci.yml:1931–1961`) executes the exact hand/adapted outputs emitted by `twinned-specs --train-plan` (`ci.yml:2282`), with circuit scope. Textual workflow parsing in `trainCoverage`/`gatedNodeFiles` is deliberately narrow and is not a general YAML semantics interpreter.
- `sync-pr` composes deploy merge/generation helpers, node-plan filtering and finite verify stages; `verify-change` composes cheaper local planning and test-bg batches. These modify refs/run tests in normal mode and were inspected only.
- `pages.yml:431` performs `verify-live` only when `poll-live` says the current publication matches this train. Byte/SRI consistency cannot prove rendering, player behavior or all assets absent from the lazy-integrity list.

## Proven comment/implementation mismatches and bounded conclusions

- `test-bg.lastRunFile` searches `/\[playwright\] port=(\d+)/`, while current `run-playwright.runOnce` emits `[playwright] <label> port=N pid=N`; current logs therefore do not satisfy that legacy port pattern unless another matching line is present. This is source-level evidence of a potential --last-failed metadata miss; no runtime reproduction was performed.
- `test-solo` prose says refusal at or above threshold; code uses `load > maxLoad`. Prose promises one spec; code forwards all residual arguments and does not validate count. The APEX_WORKERS environment is set, but forwarded Playwright worker flags are not rejected here.
- `test-honesty` reason-string prose is stronger than implementation: a nonempty skip/fixme/todo argument is enough to mark explained. The scanner is heuristic and cannot prove a body asserts anything.
- `spec-staleness` means newest commit that current selector would plan; neither historical code checkout nor Actions run evidence is consulted. The header’s older selected/oversize-only description is narrower than the current loop, which also counts overflow/spill/over-budget.
- `spec-timings` calls its spec sample whole-run wall in schema/comments, but mergeRows sums successful testcase seconds. Parallel execution and omitted failed/skipped attempts mean that sum need not equal wall-clock file duration. KEEP=10 applies to the combined series, not ten samples per bucket.
- Several `select-specs` comments describe superseded constants/policies (old retry/timeout, two-worker fat UI, no-boot routing, old pool sizes). The actual exports, branches and emitted plan fields above govern this snapshot. Twenty-four lanes use modulo assignment; a run with more than 24 matrix legs can reuse lanes despite prose saying own legs never queue behind each other.
- `verify-change` has a local groupOutcome parser that checks reporter/TAP before bg exit, unlike `test-bg.outcomeOf` (nonzero bg exit first). It also uses waited.status only for chain-breaking, while allOk follows parsed outcomes. This establishes a source-level disagreement for compound logs; no failing run was launched.
- `select-recall --json` returns before recall-floor checks, so JSON mode is a report rather than the CLI ratchet. Its replay infra short-circuit differs from select() retaining infra candidates.
- `reuse-draft-fast` base stability uses committer timestamp ordering rather than comparing the exact historical base SHA. `tooling-timings` accepts three successful present guard jobs for compatibility; it does not require every current four-job name to exist.
- Full read means source coverage only. Referenced helper implementations, API behavior, actual GitHub permissions/protection, real renderer fidelity, performance claims, test passes and deployment health are outside this read-only map’s proof.
