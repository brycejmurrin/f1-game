# CI pipeline analysis — 2026-09-29

Context: free-plan Actions (~20 concurrent jobs), **23 open PRs** (7 draft / 16
ready) at analysis time, **31 queued + 3 in-progress** workflow runs. Agents
re-trigger full-tier checks after mass-cancels, so the queue stays hot.

**This note is measurement + a prototype selector that is NOT wired into any
workflow.** No `.github/workflows/*` files were changed.

Regenerable evidence lives under `artifacts/ci-analysis/` (not committed):
`pr-runs-detailed.json`, `aggregate.json`, `pick-unit-slices-replay.json`,
failure-job counts, select-recall output.

---

## 1. Pipeline map

### Workflows

| Workflow | Triggers | Role |
|---|---|---|
| `ci.yml` | deploy-branch push; PR `opened/synchronize/reopened/ready_for_review`; nightly `17 3 * * *`; dispatch; `workflow_call` from pages | The test gate |
| `pages.yml` | schedule `7,27,47 * * * *`; dispatch | Release train: verdict → call ci (full) → stage/publish |
| `docs-guards.yml` | PR paths = ci.yml's `paths-ignore` (docs, `*.md`, `.claude/.cursor/.codex`) | Prose-only PR hole |
| `spec-timings.yml` | `workflow_run` on CI / Pages completed (deploy branch) | Merges junit → `bot/spec-timings` |
| `gpu-census.yml` | nightly; dispatch; push of `.github/gpu-census-request.json` | Real-GPU adapter + game check |
| `car-shot.yml` | dispatch only | macOS car studio frames |
| `assemble-pit-lane.yml` / `import-models.yml` | asset pipelines (not the PR gate) | Out of scope for selection |

`paths-ignore` on ci.yml (push + PR): `docs/**`, `**/*.md`, `.claude/**`,
`.cursor/**`, `.codex/**`. A mixed PR still runs ci.yml; prose-only runs
docs-guards only.

### Shared actions

- `.github/actions/setup-apex` — Node 22 + `npm ci` (no browsers)
- `playwright-chromium` — cached Chromium for browser jobs
- `mesa-xvfb` — llvmpipe for smoke/selected (default; SwiftShader opt-out)
- `select-specs` — wraps `tools/ci/select-specs.mjs`

### `ci.yml` jobs and tiers

Fast tier expression (smoke / ship-filter / sweeps **skipped** when true):

`inputs.concurrency_key == '' && (deploy-branch push || draft PR)`

| Job | Draft PR | Ready PR | Deploy push | Pages call | Nightly |
|---|---|---|---|---|---|
| Structural guards | yes | yes | yes* | yes* | yes |
| Pure-node (vm-a, vm-b, vm-page, slow, fast) | **always all 5** | always all 5 | always all 5* | always all 5* | yes |
| Parts census | filter | filter | filter | filter | yes |
| Driving model | yes | yes | yes* | yes* | yes |
| Select + Selected specs | yes | yes | yes* | yes* | no (push/PR/call only) |
| Ship-filter + Smoke×4 | **skip** | yes (if ships) | **skip** | yes | wide boot group |
| Sweeps | **skip** | yes (fleet/targeted) | **skip** | yes | yes |
| Renderer-filter / macos | skip | if render paths | skip | skip | yes |
| Golden menus (non-blocking) | yes | yes | no | no | no |
| Poke-train | no | no | if fast green | no | no |

\* skipped when Pages reuses a green fast tier (`inputs.fast_tier_run`).

### Diff → what actually runs today

| Diff kind | Node slices | Sweeps | Smoke | Selected | Notes |
|---|---|---|---|---|---|
| docs-only | *(no ci.yml)* | — | — | — | `docs-guards.yml` only |
| scenery / circuit | **all 5 + driving-model** | fleet if ready | if ready + ships | budgeted specs | Biggest waste vs need |
| `js/game.js` / physics | all 5 + driving-model | targeted/none | if ready | yes | Appropriate weight |
| `js/render` | all 5 + driving-model | targeted lamps | if ready | + renderer-macos if ready | macos bills ×10 |
| `js/ui` / css | all 5 + driving-model | no fleet | if ready | yes | |
| tests-only | all 5 + driving-model | no | yes if smoke.spec or ships | yes | ship-filter can skip smoke |
| tools-only | all 5 + driving-model | if tools/track\|lib | if ships | mostly tooling | |
| workflow-only | all 5 + driving-model | usually | usually | yes | fail-open correct |

### Selection tools (current)

- `tools/ci/pick-tests.mjs` `RULES` — groups for humans / local; coarse
- `tools/ci/select-specs.mjs` — browser specs under a time budget (CI selected job)
- `tools/ci/geometry-paths.mjs` — fleet vs targeted sweeps (already conditional)
- `tools/ci/select-recall.mjs` — faulty-change recall harness (5 cases)
- **Gap:** no path → node-slice selector (prototype in this PR)

### Node slice contents (`tests/groups.json` → `package.json`)

| Slice | Script(s) | What |
|---|---|---|
| vm-a | `test:game-vm-a` | `elevation-tracks-vm` only (~40 circuit builds) |
| vm-b | `test:game-vm-b` | rest of game-vm twins |
| vm-page | `test:vm-page` | adapted browser specs under `vm-page.js` |
| slow | `test:node-slow` | car raster / flyby / foundation-core-vm / slider-effect |
| fast | net, SW, lifecycle, state, agent, audio, garage, steering, mcp | mostly seconds each |
| guards | `test:guards` (+ tooling-fast locally) | structural |

---

## 2. Measured sample (last 50 completed PR CI runs)

**Source:** `gh api …/actions/workflows/ci.yml/runs?event=pull_request&status=completed`,
preferring `success`/`failure` over `cancelled`. Collected 2026-09-29.

**Run ids (50):** see `artifacts/ci-analysis/pr-runs-detailed.json` key `id`
(first five: `36551417325`, `36549814389`, `36549689360`, `36549012963`,
`36548779298`).

### Per-run totals

| Metric | Value | Notes |
|---|---|---|
| Conclusions | 39 success, 11 failure | cancelled excluded from preferred sample |
| Runner-minutes p50 / p90 / mean | **47.5 / 55.2 / 47.3** | sum of job durations, not wall clock |
| Queue wait (max job) p50 / p90 | **663 s / 1860 s** (~11 / ~31 min) | `started_at − created_at` |
| Draft vs ready runner-min p50 | 37.2 vs **50.0** | draft skips smoke+sweeps |
| Open PRs at analysis | 23 (7 draft) | |
| Queue depth at analysis | 31 queued, 3 in progress | snapshot |

User ballpark (~50 runner-min / ~22 jobs) matches: sample mean **47.3** min;
ready scenic PRs sit near **52–55** min with smoke+sweeps.

### Per-job duration and queue (executed jobs only)

| Job | n | dur p50/p90 (s) | queue p50/p90 (s) | outcomes in sample |
|---|---|---|---|---|
| Per-circuit geometry sweeps | 39 | 922 / 957 | 231 / 1623 | 36 ok, 3 fail |
| Renderer macos | 2 | 380 / 482 | 92 / 170 | 2 ok |
| node vm-a | 50 | 346 / 360 | 298 / 1500 | 50 ok |
| Structural guards | 50 | 279 / 289 | 295 / 1408 | 43 ok, 7 fail |
| node vm-b | 50 | 257 / 268 | 291 / 1525 | 49 ok, 1 fail |
| node vm-page | 50 | 168 / 176 | 334 / 1512 | 50 ok |
| node slow | 50 | 146 / 157 | 319 / 1535 | 50 ok |
| node fast | 50 | 112 / 124 | 328 / 1298 | 50 ok |
| Selected specs (each shard) | 285 | 101 / 134 | 482 / 1452 | (matrix) |
| Driving model | 50 | 100 / 107 | 277 / 1435 | 50 ok |
| Smoke shard | 156 | 68 / 87 | 448 / 1261 | (matrix) |
| Golden menus (trial) | 50 | 63 / 74 | 226 / 1364 | non-blocking |
| Parts census | 50 | 30 / 125 | 214 / 1403 | often filter-skip (~30s) |
| Ship-filter / renderer-filter | 39 | ~25 | high when queued | cheap |

**Every one of the 50 runs executed all five node slices + driving-model +
guards + golden menus**, including scenery-only and circuit-only PRs.

### Runner-minutes by diff category (primary path class)

| Category | n | runner-min p50/p90 | jobs ran p50 | queue-max p50 |
|---|---|---|---|---|
| game-js | 20 | 41 / 58.3 | 24 | 734 s |
| circuit | 17 | **52.9 / 55.2** | 21 | 1022 s |
| scenery | 5 | **51.7 / 53** | 22 | 313 s |
| track-engine | 2 | 47.5 / 52 | 21 | 372 s |
| ui | 2 | 34.1 / 54.1 | 21 | 1776 s |
| js-other | 2 | 35.3 / 35.8 | 21 | 337 s |
| workflow / car | 1 each | ~38 | 16–17 | ~1750 s (draft) |

Heuristic “irrelevant jobs” on scenery (driving-model, node slow/fast/vm-page/vm-b,
golden): ~**12.2 runner-min p50** and ~27% of jobs — understates waste because
vm-a is still billed even when useful.

### What each unit slice actually runs (from logs)

Representative ready circuit/scenery run **36551417325** (Hockenheim scenery,
success, 57.2 runner-min):

- **guards:** tooling-fast-style structural suite (278 files in edit loop; CI
  job runs `test:guards` + related steps — log shows tooling-fast progress)
- **vm-a:** `elevation-tracks-vm` only
- **vm-b:** full game-vm-b list (469 tests in a similar failure log)
- **vm-page:** adapted specs (`agent-drive-bench`, `logging`, …)
- **slow / fast:** as `package.json` scripts above
- **sweeps:** full fleet when geometry paths match (~15 min)
- **selected:** budgeted shard + oversize shards (`tracks-walls`,
  `parts-physics`, `dev-tools`, foundation specs, …)
- **smoke ×4:** `smoke.spec.js` shards when ship-filter says ships

### Spec timings (`origin/bot/spec-timings`)

Slowest measured specs (median wall, llvmpipe/swiftshader samples):

| Median | n | Spec |
|---|---|---|
| 194.6 s | 3 | `ui-audit.spec.js` |
| 172.1 s | 2 | `hud-layout.spec.js` |
| 163.7 s | 10 | `time-trial.spec.js` |
| 148.1 s | 6 | `sliders.spec.js` |
| 132.3 s | 10 | `ui-button-touch.spec.js` |
| 84.0 s | 10 | `camera-driving-hooks.spec.js` |
| 77.3 s | 10 | `physics-characterization.spec.js` |
| 67.5 s | 10 | `smoke.spec.js` |

Fast / always-cheap with n≥5: `output-paths` (0.0 s — vacuous),
`telemetry-compare` 2.8 s, foundation specs ~17–22 s, `parts-physics` 14.0 s.

**“Never fail”:** timings artifacts do not record pass/fail history — only
durations. Failure-job frequency (below) is the better never-fail proxy for
*jobs*. Several selected-gate specs are chronically over-budget rather than
failing assertions (`select-recall`).

---

## 3. Recall — which jobs catch real regressions

### `select-recall.mjs` (browser selector)

```
FAULTY-CHANGE RECALL: 1/5 caught outright
  ~ terrain-over-road / props-over-road / audio-smoke — MISSED but NAMED (over budget)
  ~ touch-steer — MISSED but NAMED (unreachable vs cap)
  + multiplayer-scan via import graph — CAUGHT
```

Sweeps + Pages still guard the props-over-road *class* on geometry diffs
(partial; see comment in `select-recall.mjs`).

### Failed jobs among recent PR failures (40 failure runs sampled)

Normalized job-name prefixes:

| Count | Job |
|---|---|
| 15 | Structural guards (+ historical “+ unit suites” name) |
| 11 | Selected specs |
| 10 | Per-circuit geometry sweeps |
| 5 | Smoke |
| 4 | Structural guards (current name alone) |
| 1 | Golden menus (non-blocking) |

In the **50-run preferred sample**, failed jobs were overwhelmingly **guards**
(7) and **sweeps** (3), plus one **vm-b**. Smoke/selected failures are more
visible in the wider 40-failure window (includes older combined job names).

### Scenery + vm-b “miss” that isn’t one

Run **36536539403** (`cursor/suzuka-scenery-float-d4cc`): failed
`phone-pad-netplay-vm` inside vm-b. Diff also changed
`tests/unit/phone-pad-netplay-vm.test.mjs` — a selector that keys off test
ownership still selects vm-b. Replay of the prototype: **0 missed failures**
across the 50 diffs (would not have skipped a slice that actually failed).

Sweeps failures on scenery/track PRs were real geometry ratchets (coplanar /
props-tris / stale baseline caps) — keep fleet sweeps on circuit/scenery paths.

### Jobs that almost never catch scenery/circuit faults

In this sample: **driving-model**, **node slow**, **node fast**, **vm-page**,
**golden menus**, and usually **vm-b** (except when a vm-b suite file is in the
diff). They still consume ~**13 runner-min** and five concurrent slots each run.

---

## 4. Ranked improvements (saved runner-min × safety)

Costs use measured p50s from §2. Safety proof = replay against
`pr-runs-detailed.json` + extend `select-recall` / failure digests.

### A. Node-slice selector (prototype shipped here) — **highest ROI**

- **Save:** mean **10.2 runner-min/run** on the 50-PR sample; sum **509.9 min**
  if applied to that sample (~**13.1 min** p50 on scenery/circuit).
- **Also frees slots** (each skipped slice is one less queued job) — queue
  wait dominates wall time more than runner-min in this account.
- **Files:** `tools/ci/pick-unit-slices.mjs` (new), unit tests, later wire into
  `ci.yml` matrix `if:` **only after** a required-check aggregator (D).
- **Risk:** medium until wired; fail-safe on unmatched non-unit paths; unit
  ownership from `groups.json`.
- **Prove:** `scratch/ci-analysis/replay-unit-slices.mjs` → 0 missed failures
  on sample; keep extending with new failure digests.

### B. Scenery / circuit PR fast path (policy + A)

- Ready scenery PRs today: ~52 runner-min, full smoke+sweeps+all slices.
- Keep: guards, vm-a, sweeps (fleet), select/selected, ship-filter/smoke.
- Skip via A: vm-b, vm-page, slow, fast, driving-model (~13 min) unless owned
  tests change.
- **Draft-first for agent scenery waves** already skips smoke+sweeps; making
  agents stay draft until green cuts ~13 min of smoke shards + 15 min sweeps
  from the shared queue (wall-time win larger than runner-min).

### C. Required-check aggregator — **blocks merging skipped jobs**

- GitHub treats skipped required checks as blocking. Without an aggregator,
  path-based `if:` skips turn red forever.
- Add a final `ci-verdict` job `needs: [*]` that succeeds when each needed job
  is success **or** explicitly skipped by filter; make **only** `ci-verdict`
  required on the deploy branch.
- **Files:** `ci.yml` (+ branch protection) — **do not do in this PR**.
- **Risk:** high if mis-expressed; prove on a draft with forced skips.

### D. Path-scoped guards / skip golden menus on non-UI

- Golden menus: **63 s × 50/50 runs**, non-blocking, still takes a slot.
  Skip unless `css/`, `index.html`, baseline PNGs, or menu specs change.
- **Save:** ~1 runner-min + 1 slot per non-UI PR.
- Guards job itself (~4.7 min) is the top failure catcher — **do not skip**
  wholesale; optionally split docs-integrity vs js structural later.

### E. Consolidate tiny jobs

- ship-filter (25 s) + renderer-filter (25 s) could be one “diff filters” job
  with two outputs (already the pattern after extracting ship-filter).
- **Save:** ~1 npm-less checkout slot; small runner-min, helps queue depth.

### F. Sweeps — already good; don’t widen

- Fleet vs targeted via `geometry-paths.mjs` is correct. Scenery failures in
  sample were sweeps catching real baselines — keep.

### G. Caching

- `setup-apex` already caches npm. Playwright Chromium action caches browsers.
- Further save is marginal vs slice skipping; measure before investing.

### H. Draft-first policy for agent PRs

- Already encoded for smoke/sweeps. Enforce socially / via bot: agents open
  **draft**, mark ready once, avoid re-trigger storms after mass-cancel.
- At analysis time many scenery PRs were **ready** while re-queued — each
  ready tip starts full tier (~22 jobs).

### Wiring order (safe)

1. Land prototype + report (this PR) — **no behavior change**
2. Add aggregator job (behavior-neutral if it only mirrors today)
3. Wire `pick-unit-slices` into matrix `if:` behind aggregator
4. Skip golden menus by path
5. Soft policy: agent PRs stay draft until slice-selected gate green

---

## 5. Prototype: `tools/ci/pick-unit-slices.mjs`

Not imported by any workflow. CLI:

```sh
node tools/ci/pick-unit-slices.mjs js/circuits/scenery/monaco.js --json
node scratch/ci-analysis/replay-unit-slices.mjs   # needs artifacts/ci-analysis/
```

### Replay on the 50 PR diffs

| | |
|---|---|
| Runs with any skip | **47 / 50** |
| Mean saved runner-min / run | **10.2** |
| Sum saved on sample | **509.9 min** |
| Missed failures (skipped a failed slice) | **0** |
| scenery / circuit saved_min p50 | **13.1** |
| game-js saved_min p50 | **8.2** |

### Tests

`tests/unit/pick-unit-slices.test.mjs` (in `toolingFast` via `groups.json`):
scenery skips physics slices; game.js keeps vm-b + driving-model; unknown path
fail-safes; phone-pad suite on a scenery PR still selects vm-b; new unit file
→ guards only.

---

## 6. Methodology / caveats

- Numbers are from GitHub Actions API timestamps on completed PR runs of
  `ci.yml` only — not Pages train, not docs-guards.
- Category is a coarse primary-path heuristic on PR file lists (includes sync
  noise: docs, baselines, groups.json).
- Runner-minutes ≠ billable macOS-weighted minutes (renderer macos ×10 when it
  runs).
- Queue wait is per-job; wall clock for a run is closer to
  `max(queue+dur)` across the critical path, often **30–60+ min** under backup.
- Cancelled runs (re-triggers) are under-represented in the preferred sample
  but dominate queue depth.

---

## 7. Next step after this PR

Do **not** edit `ci.yml` until a verdict aggregator exists. Use the prototype
locally / in verify-agent text to name which slices a scenery PR needs, and
keep agent scenery PRs **draft** while the Actions queue is backed up.
