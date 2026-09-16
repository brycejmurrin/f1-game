# Faster testing for agents — research beyond the 15 plans (2026-09-16)

Read-only pass. Nothing was run; every number below is either quoted from an
existing measurement in the tree, computed by static census of the tree, or
marked **UNVERIFIED**. Deduped against `docs/plans/2026-09-16-process-speedup-next.md`
(items 1-15) and `docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md` §2/§5.

## Census taken for this pass (static, this tree)

| fact | value | how |
|---|---|---|
| specs with **zero** DOM/locator/screenshot API use (pure `page.evaluate` / `waitForFunction` / `goto`) | **67 of 119** | grep census over `tests/specs/*.spec.js` |
| `page.evaluate` call sites vs `page.locator` | 2068 vs 1095 | same |
| specs importing `test`/`expect` from `tests/helpers/fixtures.js` | 113 of 119 | grep |
| distinct `expect` matchers in the DOM-free set | ~15 (`toBe`, `toBeGreaterThan`, `toEqual`, `toBeLessThan`, `toContain`, `toBeCloseTo`, `toBeNull`, `toBeTruthy`, +bounds/`not`) | grep |
| JS bytes the VM harness compiles per `createGame()` | **4.80 MB across 193 files** (`MANIFEST.FULL` minus GLX), each via `vm.runInContext` | `tools/manifest.cjs` + `fs.statSync` |
| twins today | 12 spec→twin pairs (`tools/ci/twinned-specs.mjs`) | file |

Two of those change the shape of the argument. **67 specs, not 12, are
mechanically portable** — the twin programme is 18 % done and the existing plan
(#8) still proposes porting them by hand, one to two days at a time. And the VM
boot compiles 4.8 MB of source *per test file*, which is a cost nobody has
attributed yet.

## Ranking

| # | idea | saving | effort | risk |
|---|---|---|---|---|
| 1 | `vmPage` adapter: run unmodified specs inside game-vm | very high | 2-3 d | med |
| 2 | Twin-fidelity mutation gate (makes #1 safe to trust) | enabling | 1 d | low |
| 3 | V8 code cache for the VM boot + `NODE_COMPILE_CACHE` for node suites | high | 2-4 h | low |
| 4 | Per-spec measured timings file → shard planner + real budget | high | 1 d | low |
| 5 | Track-geometry fixture cache + `scenery:false` + one boot per worker | med-high | 1 d | med |
| 6 | Playwright 1.63 `lock:` + `retryStrategy:'isolated'` | med | 2 h | low |
| 7 | Per-spec time ratchet enforced in CI | med (prevents regrowth) | half d | med |
| 8 | Coverage-derived impact map, feeding `select-specs` only | med | 1-2 d | med |
| 9 | Flake ledger on llvmpipe (`--repeat-each`, `--fail-on-flaky-tests`) | med | half d | low |

---

## 1. `vmPage`: run the unmodified spec file inside the VM

**What.** Not an AST transform (fragile, and the twin then drifts from the
spec). Instead give `tests/helpers/fixtures.js` a second backend. Under
`APEX_VM_PAGE=1` it exports a `test`/`expect`/`page`/`loadTrack` quadruple
backed by `tools/lib/game-vm.cjs` instead of Playwright, and the *same* spec
file runs under `node --test tests/specs/foo.spec.js`.

**Why it works here.** Playwright forbids closures in `page.evaluate` — the
function is serialised to source and compiled in the page. That constraint is
what makes the body portable: the shim runs
`vm.runInContext("(" + fn.toString() + ")", handle.ctx)(arg)`. The 67 DOM-free
specs need nothing else (https://playwright.dev/docs/evaluating;
https://nodejs.org/docs/latest-v22.x/api/vm.html).

**Plan.**
1. `tests/helpers/vm-page.mjs` — `makeVmPage(handle)` implementing `goto`
   (no-op after boot), `evaluate(fn, arg)`, `evaluateHandle` (throw: unsupported),
   `waitForFunction(fn, arg, opts)` (poll via `handle.settle`, stepping timers),
   `addInitScript` (seeds `localStorage` before `createGame`), `reload`
   (`createGame` again), `on("pageerror")` from `record.rejections`.
2. `tests/helpers/vm-expect.mjs` — ~15 matchers over `node:assert/strict`,
   plus `.not`, `.toBeCloseTo(v, digits)` with Playwright's own semantics.
3. `fixtures.js`: `export const test = process.env.APEX_VM_PAGE ? vmTest : pwTest`
   (same for `sharedTest`, `loadTrack`). No spec edits at all.
4. `tools/ci/vm-portable.mjs` — the eligibility lint: a spec is portable iff it
   uses no locator/screenshot/keyboard/mouse/viewport API and imports `expect`
   from `fixtures.js` (38 specs import it from `@playwright/test`; a codemod
   changes the import line only). Emits the portable list as JSON.
5. `tools/ci/twinned-specs.mjs` grows a second class: `ADAPTED` specs, whose
   "twin" is the spec itself run under the adapter, so the existing equal-test-count
   anti-rot check is automatically satisfied.
6. `tests/groups.json` gets a node group `vm-specs` running the adapted list;
   `run-playwright.mjs`'s existing twin-skip then drops them from local browser runs.

**Verify.** Run the adapter over the 12 specs that already have hand twins and
diff assertion-for-assertion against the hand twin — they should agree
test-for-test. Then idea #2 before any spec leaves a blocking browser gate.

**Saving.** Each adapted spec moves from ~80 s/test of SwiftShader to ~1-3 s.
If even 40 of the 67 adapt, the local `hooks`/`physics-core`/`aero`/`circuits`
groups largely evaporate and a `js/game.js` edit stops routing to 30+ minutes of
browser. **UNVERIFIED** until one spec is measured end to end.

**Risks.** (a) The twin blindness already recorded in `twinned-specs.mjs` —
no GLX, no rAF — now applies to 5× more specs; #2 is the mitigation and should
land first. (b) `waitForFunction` semantics differ (the VM never starves rAF,
so a spec that passes only because of a 100 s overrun would change behaviour —
that is a *feature*, but it will surface latent bugs). (c) Specs that assert on
real network timing or `page.route` mocks need the fixture's stubs mirrored in
the VM. (d) Do not adapt `smoke.spec.js` or `physics-characterization.spec.js`:
they are the parity anchors and must stay in a real browser.

### BUILT AND MEASURED, 2026-09-16 (`tests/helpers/vm-page.js`)

The adapter exists and the core claim held: an **unmodified** spec runs under
`node --test` against `tools/lib/game-vm.cjs`, because Playwright already
forbids closures in `page.evaluate`, so the body is portable as source into the
VM context. Playwright's own `expect` imports standalone and works under
`node --test`, so there is no matcher shim and no second semantics.
`APEX_VM_PAGE=1` chooses the backend in `tests/helpers/fixtures.js`; all 118
specs still collect under Playwright (1467 tests, 3 s).

| spec | adapter | node wall | browser cost on record |
|---|---|---|---|
| physics-fixes | 2/2 | 22.0 s | 110.1 s, and it blocked four Pages deploys |
| logging (sharedTest) | 6/6 | 4.0 s | one boot for six tests |
| headless-api | 23/24 | 5 s | |
| new-hooks | 50/56 | 22 s | |
| agent-determinism | 4/5 | 21.2 s | |

Ten specs, 140 tests: **107 pass in 7.5 min** of node against ~3.1 h billed by
the repo's own cost model. **The third that fails is the result that matters.**
Running them found blocker classes no static census can see: in-page DOM
driving against an inert DOM, `requestAnimationFrame` in an evaluate body (no
renderer, `render()` throws on the first pump), and a semantic divergence —
`createGame` settles the boot circuit before returning, so every "returns null
before a track is loaded" assertion goes red. And `understeer-cue` is portable
by every static measure and still **0/7**.

So the census figure of 67 was eligibility, not readiness. `tools/check/vm-portable.mjs`
now reports the honest number — **35 portable today, 53 after a one-line import
change, 65 need a browser** — and it predicted agent-determinism's only failure
before the run.

**Therefore: a fast local pre-check that runs ALONGSIDE the browser gate, never
instead of it.** Nothing moves off a blocking gate until item 2 exists;
`understeer-cue` is the standing proof that a green static verdict and a green
adapter run are two different facts. Next, cheapest first: `createGame({
noBootCircuit: true })` to close the boot-state class, the 18-spec import
codemod, the fidelity gate, then a `test:vm-page` group and an `ADAPTED` map
in `tools/ci/twinned-specs.mjs` (whose equal-test-count check is meaningless
for these — the twin IS the spec, so the counts are trivially equal).

## 2. Twin-fidelity mutation gate

**What.** The whole twin strategy assumes "the twin catches what the spec
catches". Nothing checks that. Borrow mutation testing, but scoped: a fixed
list of ~20 *seeded* mutations (flip a sign in `js/physics/consts.js`, scale a
grip coefficient, off-by-one a lap counter, disable a collision branch), applied
to a scratch copy of the tree; a twin (or adapted spec) must go red for every
mutation its browser spec goes red for. General mutation testing (Stryker) is
the wrong tool here — it re-runs the suite per mutant and the browser side is
10-40 min. Seeded mutants against node-only twins are seconds each.

**Plan.** `tools/check/twin-fidelity.mjs`: for each mutant, copy the tree to
`scratch/`, patch, run the twin, record red/green; a `tests/data/mutants.json`
holds the mutation list and the expected-catchers matrix; `tests/unit/twin-fidelity.test.mjs`
asserts the matrix matches. Run it in the nightly, not per-commit.

**Verify.** A deliberately weakened twin (delete one assert) must fail the gate.

**Saving.** No minutes; it is the licence to delete browser runs in #1.
**Risk.** Mutant list rots; keep it small and reviewed, and pin it to consts,
not to line numbers.

## 3. Code caches (two different ones, both cheap)

**3a. V8 code cache for the VM boot.** `game-vm.cjs` calls
`vm.runInContext(src)` for 193 files (4.80 MB) on every `createGame`, and every
twin file pays it at least once. Switch to `new vm.Script(src, { filename, cachedData })`
+ `script.runInContext(ctx)`, with the cache persisted to
`artifacts/.vmcache/<sha256-of-source>.cache`. Node's docs say the cache "is
safe to be saved alongside the script source" and "can be used to construct new
`Script` instances multiple times"; `cachedDataRejected` tells you when it was
refused, so the fallback is automatic
(https://nodejs.org/docs/latest-v22.x/api/vm.html).

**3b. `NODE_COMPILE_CACHE`** for the ~262 `node --test` files — each is a fresh
process importing espree/eslint-scope/the helpers. `NODE_COMPILE_CACHE=dir`
(Node ≥22.1; `module.enableCompileCache()` ≥22.8) persists the V8 code cache for
CJS/ESM across processes: "subsequent loads of the same module graph may get a
significant speedup"
(https://nodejs.org/docs/latest-v22.x/api/module.html). Set it in
`tools/ci/tooling-fast.mjs` and the `node-suites` job (and in the CI cache key,
keyed on Node version — the docs say a cache from one Node version cannot be
reused by another).

**Caveat to respect:** the same doc warns coverage "may be less precise in
functions that are deserialized from the code cache" — so idea #8's coverage
collection run must set `NODE_DISABLE_COMPILE_CACHE=1`.

**Verify.** `hyperfine`-style: three runs of `node tools/lib/game-vm.cjs monza`
before/after (it already prints `bootMs`); three runs of `tooling-fast --jobs=3`.
**Saving. UNVERIFIED** — compile is only part of the 4 s boot; execution and
the track build are the rest. A 4.8 MB compile is plausibly 0.3-0.8 s of it, so
call it 10-20 % of boot and a few seconds per unit file. Cheap enough to try
before believing.

**Not recommended: V8 startup snapshots.** `--build-snapshot` supports "only
one single file" and "only a subset of the built-in modules"
(https://nodejs.org/docs/latest-v22.x/api/cli.html); the game boot is async and
injects scripts through a DOM stub, so a pre-booted snapshot is out of reach
without a bundler — and this repo's whole premise is no build step. Close it.

## 4. Per-spec measured timings (replace the 79.7 s scalar)

**What.** `select-budget.mjs` bills every test at a single mean from a
2026-08-07 CI run, and its own header records that the mean cost three deploys
when used as a timeout. Playwright shards **by count, not duration** — confirmed
in the docs ("Tests are split at the individual test level"; nothing reads prior
timings, https://playwright.dev/docs/test-sharding) — which is exactly why smoke
shard 4 was 2-4× its siblings.

**Plan.** `tests/data/spec-timings.json` (`{spec: {tests, p50Sec, p90Sec, gl}}`),
regenerated by `tools/ci/ingest-timings.mjs` from the junit XML each CI job
already writes, committed by the nightly. Then:
- `select-budget.capacity()` takes per-spec p90 instead of `MEASURED.secPerTest`;
  `select-specs` packs to real seconds (first-fit-decreasing) instead of test counts.
- `tools/ci/shard-plan.mjs <group> <n>` emits n explicit file lists balanced by
  p90 (LPT scheduling), used in place of `--shard` for the smoke/sweeps matrices.
- Timings are keyed by `gl` so the llvmpipe move does not invalidate them
  (plan #1 asks for exactly this re-measurement; this generalises it).

**Verify.** Replay a past junit through the planner and compare predicted vs
actual shard walls; `tests/unit/shard-plan.test.mjs` on the packer.
**Saving.** Removes the shard-tail class permanently (B6 fixed one instance by
hand) and lets the 15-min budget admit the specs it can actually afford.

## 5. Make a VM boot cheap enough not to matter

Beyond plan #3's profiling of `elevation-tracks-vm`:
- **`createGame({ scenery: false })`** — as plan #3 says; add the inverse guard
  so a twin that asserts scenery cannot silently opt out (a flag on the handle,
  asserted by the prop/foundation twins).
- **Track-geometry fixture cache.** Key = sha256 of `js/circuits/<id>.js` +
  every file under `js/track/` + `js/physics/consts.js`. Value = the built
  centreline/profile arrays, `v8.serialize`d to `artifacts/.trackcache/`.
  `game-vm` restores instead of rebuilding when the key matches. **Only legal
  for tests where the build is a precondition, not the subject** — so the cache
  is opt-in per test (`createGame({ trackCache: true })`) and forbidden in
  `*-foundation`, `elevation-tracks`, and any sweep. Guard: a lint asserting
  those files never pass `trackCache`.
- **One boot per worker.** `node --test` gives a process per file, so a
  module-level singleton in `tests/helpers/vm-fixture.mjs` already shares a boot
  within a file (the `wake-lock-vm` pattern). Cross-file sharing needs
  `--test-isolation=none`, and the docs are explicit that then "the top level
  tests are executed with a concurrency of one"
  (https://nodejs.org/docs/latest-v22.x/api/test.html) — so it is a trade, not a
  win, and only pays if boot dominates. Measure before adopting; the note
  already closed it once.

## 6. Playwright 1.63 features this repo pins but does not use

The repo is on `@playwright/test` **1.63.0**, so these are available today:
- **`lock`** (new in 1.63): "Tests that share a lock name never run
  concurrently, across files, workers and projects, while everything else keeps
  running in parallel." This is the first real answer to "one worker on four
  cores": put `{ lock: 'gl' }` on the render-heavy tests and raise
  `LOCAL_WORKERS` to 2-3, so JSON-only specs fill the idle cores while at most
  one SwiftShader rasteriser runs. The measured hazard in `docs/TESTING.md` §3
  is *concurrent renderers*, not concurrent tests — the lock targets exactly
  that. **UNVERIFIED for this box**; try it on one group, watch `/proc/loadavg`
  and the false-timeout count.
- **`retryStrategy: 'isolated'`** (1.62): "runs all retries at the end, one by
  one in a single worker, to minimize interference". CI keeps `retries: 1`; today
  a retry competes with the rest of the shard on a 2-vCPU-ish runner, which is
  how a contention failure becomes two. Set it in `playwright.config.js` under
  `process.env.CI`.
- **`--add-reporter`** (1.63): "keeps the configured reporters instead of
  replacing them" — how #4 collects timings without disturbing the live reporter.
- **`--fail-on-flaky-tests`** (1.45): the switch that makes #9 a gate.
Sources: https://playwright.dev/docs/release-notes and
https://playwright.dev/docs/test-cli.

## 7. A per-spec time budget in CI (the cost model, concretely)

Using #4's timings file as a **ratchet**, in the shape this repo already trusts
(`tests/data/ratchets.json`): each spec has a `ceilingSec` = round-up of
1.5 × its llvmpipe p90. `tools/check/time-ratchet.mjs` reads the junit after the
gate and fails when a spec exceeds its ceiling **in two consecutive runs on the
same GL backend** (one breach is a noisy runner — AGENTS.md rule 8). A new spec
with no row fails closed until `--update` writes one, so the cost of a test is a
reviewed number in the diff. Deliberately *not* a per-test timeout: the repo has
already been burned by billing a timeout at a mean (`select-budget.mjs` header).
**Risk:** another churn-prone data file; mitigate with the same auto-raise hook
treatment `ratchets.json` got (B1) and by ratcheting only on the llvmpipe gate.

## 8. Coverage-derived impact map — with its limits stated

**Be skeptical.** `index.html` loads all 193 scripts on every page, so
file-loaded coverage maps everything to everything and is worthless here. What
is not worthless is **function-range** coverage: Playwright's
`page.coverage.startJSCoverage()` returns per-function counts and byte ranges,
Chromium-only (https://playwright.dev/docs/api/class-coverage). A spec that
never races Monza executes none of `monza.js`'s emitters; a spec that never
opens the garage executes none of `parts.js`.

**Plan.** A nightly `coverage` job (llvmpipe) runs the wide suite with a
fixture wrapper collecting JS coverage per spec, reduces to
`{file: {fn: [specs]}}`, and commits `tests/data/impact-map.json`. Node twins
contribute the same via `NODE_V8_COVERAGE`. Consumption is deliberately
asymmetric: the map **narrows only inside a group** `pick-tests` already picked
(feeding `select-specs`' ordering and its named-skip report), and **widens**
freely — a spec that touches a changed file but no rule names is reported as a
rule gap. Hand rules stay the floor. Precedent: Martin Fowler, "The Rise of
Test Impact Analysis"
(https://martinfowler.com/articles/rise-test-impact-analysis.html).
**Risks:** map staleness (stamp it with a tree SHA and ignore it when older than
N days); coverage changes timing (collect on a nightly, never on a gate); and
#3b's compile cache must be disabled during collection.

## 9. Flake ledger, now that llvmpipe made repetition affordable

Smoke rendering tests went 8-12× faster on llvmpipe (research note §5, C2), so a
weekly `workflow_dispatch` running the change-aware spec set with
`--repeat-each 3 --fail-on-flaky-tests` is now minutes, not hours. Output:
`tests/data/flake-ledger.json` (spec, test, failures/runs, first seen). Policy
in AGENTS.md: a test over 1-in-10 is either root-caused or twinned within a
week — the `wake-lock` path, made routine instead of reactive. This is the
budget the prompt asks about for flake; it costs runner minutes only.

## Explicitly closed (do not re-propose)

- **V8 startup snapshot of a booted game** — single-file + subset-of-builtins
  limits, async boot, no bundler. (§3)
- **`worker_threads` pool for twins** — no shared VM context, no boot saved. (§5)
- **`--test-isolation=none` as a speed-up** — documented concurrency of one. (§5)
- **AST-transforming specs into twins** — the adapter (§1) keeps one source of
  truth; a generated twin drifts.
- **File-level coverage TIA** — every page loads every file. (§8)
- **Stryker-style full mutation testing** — too slow here; seeded mutants only. (§2)
