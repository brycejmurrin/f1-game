# Process speed-up: the next fifteen — plans

Base: the `claude/agent-dev-process-optimization-t7bqz8` branch after the
2026-09-16 landing (`docs/notes/AGENT-PROCESS-RESEARCH-2026-09-16.md` §5 is
what already shipped; this file is what comes after it). Every plan below
names the evidence it rests on, the files it touches, how it is verified and
what it is expected to save, so any session can pick one up cold. Ordered by
saving ÷ risk inside each group; the "do next" order is at the bottom. Five
deeper research plans written the same day sit in `research-2026-09-16/`
(its README ranks them across each other).

Baseline after the landing (measured on the branch's own CI runs and this
box): commit guard ~5 s; pre-push node gate ~2 min at `--jobs=3`; the train's
smoke on llvmpipe 1.1–1.7 min a shard; fast-tier floor = `node-suites` `vm-a`
(`elevation-tracks-vm` alone, ~6.5 min); a local browser group still 10–40
min of SwiftShader.

## CI

### 1. `selected` shards and the wide run on llvmpipe

**Evidence.** The smoke gate moved to Mesa llvmpipe on 2026-09-16: rendering
tests 8–12x faster (corner approach 17.8 s vs 214, grid start 21.4 vs 138),
every frame assertion held. The `selected` job (change-aware gate) and the
dispatched wide run still launch SwiftShader; `selected`'s oversize shards
were the wall clock of the gate (agent-view 22–40 min before its twin,
wake-lock 18.6 min, pit-signs / race-control 1–12 min).

**Plan.**
- `.github/workflows/ci.yml` `selected` job: copy the smoke job's
  `Mesa llvmpipe + Xvfb` step (apt install, `Xvfb :99 &`, `DISPLAY` via
  `$GITHUB_ENV`) before the `npm test -- …` step; add `APEX_GL: llvmpipe`
  and `LIBGL_ALWAYS_SOFTWARE: 1` to that step's `env`.
- Same for the `Boot group (nightly) / dispatched group` step: make
  llvmpipe the default there too and keep the `gl` input as the opt-out
  (`gl: swiftshader`) so a spec can still be measured on both.
- `driving-model` (physics-characterization in a browser) stays on
  SwiftShader for one more cycle: it is the parity anchor for the VM twins,
  and a renderer swap under it should be a deliberate, separately measured
  change.
- `tools/ci/select-budget.mjs` `MEASURED` (79.7 s/test, the budget's basis)
  is a SwiftShader number: re-measure after two green runs and lower it, so
  the 15-minute budget admits more specs per shard.

**Verify.** One push (branch full tier) with a diff that selects a
render-heavy spec (touch `tests/specs/pit-signs.spec.js`), read the shard
times against the note's table. `tests/unit/ci-coverage.test.mjs` pins the
`test:smoke` line only, not `selected`'s.

**Saves.** The gate's pole: oversize shards from 10–40 min to 2–5. Effort ~1 h.

### 2. Structural guards at `--jobs=3`

**Evidence.** The guards job runs `npm run test:tooling-fast` = one file at
a time; measured 3.1–4.9 min on the branch runs. The same 194 files take
122 s at `--jobs=3` on this 4-core box and public runners are 4 vCPU.

**Plan.** `ci.yml` guards step → `node tools/ci/tooling-fast.mjs --jobs=3`
(the script prints the same START/PASS/FAIL lines). Leave the `npm run`
script itself at `--jobs=1` for `deploy.mjs`'s "one file at a time" reading?
No — `deploy.mjs` already calls the tool with `GATE_JOBS`; the npm script
is the interactive form and can stay serial for a loaded box.

**Verify.** The next push's guards job time; `tests/unit/ci-coverage.test.mjs`
does not pin the guards command.

**Saves.** ~2 min per run on a job that runs on every push and every train.
Effort 10 min.

### 3. `elevation-tracks-vm` — the fast tier's floor

**Evidence (measured later the same day — see
`research-2026-09-16/vm-harness.md`, which overturns this item's first
draft).** 399 s on this box for 47 tests over 40 circuits. The share is
NOT the build: ~70 % is physics stepping (`A.step(1/60,1)` costs 3.13 ms
with a 22-car field and the spec runs ~2,200 steps a circuit ≈ 6.9 s),
~13 % `Tracks.build` (0.8–1.2 s a race), LAZY_SCENERY 0.4 %, car meshes
built once per FILE (~1 s, memoised in `js/car/car-draw.js`), the 193-file
manifest eval 178 ms. The `vm-a` slice is that file alone and ~6.5 min on a
runner; nothing else in `node-suites` is above 2 min.

**Plan (revised).**
1. A `worker_threads` pool for the harness (a `game-vm-pool` sibling of
   `tools/lib/game-vm.cjs`): four VM contexts, one circuit's probe body per
   worker, every `assert` in the parent. No physics change, and the 1↔1
   spec↔twin mapping `tools/ci/twinned-specs.mjs` checks stays intact
   (a 4-way file split would break it). Cap the pool: RSS grows ~40 MB a
   circuit. Expected 399 s → ~110–130 s; `vm-a` 6.5 min → ~2.
2. `createGame({ carMeshes: false })` stubbing `Car3D.build` for files that
   never read a car mesh: ~1 s per VM process, ~25–30 s per CI node run.
   Opt-in; `physics-characterization-vm` never sets it (it is the parity
   anchor against `tests/data/physics-baseline.json`).
3. Replace the spec's 300 × (jump + step) steepest-grade SEARCH with
   `trackProfile(300)` (1 ms vs 1,029 ms) narrowed to ~12 candidates — the
   same edit on the browser spec, plus a 40-circuit A/B that the chosen
   fracs match, before the twin count check accepts it.
4. Closed by measurement: `scenery:false` (30 ms a circuit), a disk cache of
   track geometry (the physics-bearing half of the build is 130–240 ms and
   the collider list is produced inside the `createMesh` gate a cache would
   skip), V8 `--build-snapshot` (snapshots the main context, not a
   `vm.createContext` sandbox), a one-car field (a physics change in a
   parity twin).

**Verify.** `node --test tests/unit/elevation-tracks-vm.test.mjs` wall time;
`node tools/ci/twinned-specs.mjs` still equal counts; `physics-characterization-vm`
green on the unmodified path; one push for the slice time.

**Saves.** ~4.5 min on every deploy push's fast tier (the floor moves to the
next slice, ~2 min). Effort half a day.

### 4. Shard the geometry sweeps

**Evidence.** `sweeps` measured 7.8 min median, 9.8 p90 when a circuit
changes (`--test-concurrency=1` for memory: the fleet audits build every
circuit), and it is the train's pole whenever smoke is fast.

**Plan.** `ci.yml` `sweeps` job → a 3-way matrix over `tests/groups.json`'s
sweep files (the sweeps group is a node group with a file list; add
`test:sweeps-{a,b,c}` partitions exactly as `game-vm-a/-b` were added, keep
`test:sweeps` as the full list). The geometry path filter and `before_sha`
handling stay on the job. The parts census already has its own job.

**Verify.** A push touching `js/circuits/monza.js`; `tests/unit/test-groups.test.mjs`
(group docs rows), `deploy-tool.test.mjs` (the deploy's local sweep hint
reads the group name, unchanged).

**Saves.** ~5 min on geometry pushes and every train after one. Effort 1 h.

### 5. A ruleset on the deploy branch

**Evidence.** AGENTS.md says "never force-push" and "the fast tier is your
verdict" as prose; a red push still starts a train tick (the train's
`verdict` finds no green gate and runs the full tier, ~14 min, to say no).
Rulesets are free on public repos; merge queues are not available on a
user-owned repo (research note §1).

**Plan.** Repository settings → Rules → new ruleset on
`claude/f1-game-project-26h3ng`: block force pushes, block deletion,
require the status check `CI / Structural guards` (and `Pure-node unit
suites`) to pass. NOT "require a pull request" — several sessions push
directly through `deploy.mjs`, and the tool's fetch → merge → gate → push
is the review. Record the ruleset in `docs/TESTING.md` §Release train.
This is a GitHub-settings change the repository owner makes; nothing in the
tree can do it.

**Verify.** A deliberate `git push --force` from a scratch clone is refused.

**Saves.** No minutes; removes the one class of deploy-branch damage a tool
cannot undo. Effort 15 min.

## Local (the 4-core, no-GPU container)

### 6. A `ci-dispatch` tool: run browser groups on a runner, not on this box

**Evidence.** A local browser group is 10–40 min of SwiftShader and forbids
source edits while it runs; the same smoke group is 1.1–1.7 min a shard on
llvmpipe runners, and `ci.yml` already accepts `group` and `gl` dispatch
inputs. The GitHub API is reachable from the container (verify-change's
live-run lookup uses it unauthenticated); dispatching needs a token with
`actions:write`, which the session's `git push` credential helper may or
may not carry — the tool must say which.

**Plan.** A new tool under `tools/ci/`, `ci-dispatch` (`<group> [--gl llvmpipe|swiftshader] [--wait]`):
1. Resolve the branch and confirm it is pushed (`git status -sb`, refuse on
   "ahead"); refuse if `pick-tests` says the group does not exist.
2. `POST /repos/{owner}/{repo}/actions/workflows/ci.yml/dispatches` with
   `{ ref, inputs: { group, gl } }` using `GH_TOKEN` / `GITHUB_TOKEN`, else
   `gh workflow run`, else print the exact `gh` command and exit 3.
3. Find the run (poll `runs?event=workflow_dispatch&branch=` for one created
   after the dispatch), print its URL, and with `--wait` poll every 60 s
   until completed; print per-shard conclusion and the `= run` line from
   each smoke shard's log (`GET jobs/{id}/logs` needs the token too), exit
   0/1 on the conclusion.
4. `verify-change.mjs`: when the plan's browser batches would exceed one
   group and the tool can dispatch, offer the dispatch line in the verdict
   ("2 browser groups queued locally — or `ci-dispatch input` runs it on a
   runner in ~3 min").
5. AGENTS.md §Verification table: "a browser group this box cannot time in
   under 10 min → `ci-dispatch <group> --wait`"; the check-changes skill
   gets the line.

**Verify.** A `ci-dispatch` unit test under `tests/unit/` on the request
builder and the run matcher with a fake fetch; one real dispatch from a session.

**Saves.** The single largest change to a session's shape: a 30-minute
serialized wait becomes a 3–5 minute one that leaves the box free for the
node loop. Effort half a day.

### 7. A container with a DRI render node

**Evidence.** `docs/notes/CI-RENDERING-PERFORMANCE.md` §llvmpipe (2026-09-16):
Mesa is installed here but `/dev/dri` does not exist in the Firecracker
microVM, so ANGLE cannot bind llvmpipe through EGL; the same swap gives
~10x on GitHub's runners.

**Plan.** An environment question, not a repo change: ask whether the Claude
Code web environment can expose a software render node (or run Chromium
with `--use-angle=gl` against Mesa's surfaceless EGL platform — worth one
more measured attempt with `EGL_PLATFORM=surfaceless` and
`MESA_LOADER_DRIVER_OVERRIDE=llvmpipe`, which the 2026-09-16 note did not
try). If either works: `playwright.config.js` picks llvmpipe when
`ls /dev/dri` or the surfaceless probe succeeds, and `tools/env/cloud-agent-install.sh`
installs `libegl-mesa0`. Record the probe in the note either way.

**Verify.** `node tools/gfx/gfx-probe.mjs montreal --lite` reports
`ANGLE (Mesa, llvmpipe …)` in the renderer string and a non-blank frame.

**Saves.** 10x on every local browser test if it works; otherwise one
paragraph that stops the next session re-trying it. Effort 1 h to probe.

### 8. More VM twins: `dev-tools`, `new-hooks`, `persistence`, `agent-determinism`

**Evidence.** `hooks` is the largest browser group without full twin cover
(dev-tools 56 tests, ~50 JSON-only; new-hooks 55/56 ported but excluded by
its 300 s Madrid test; persistence 6; agent-determinism 5). The plan's
2026-09-01 estimate for dev-tools (32 min) predates `sharedTest`; measure
first.

**Plan.**
- `new-hooks`: move the Madrid foundation test into a new
  `madrid-foundation` spec under `tests/specs/` (the `circuits` group's
  `*-foundation` glob picks it up) and add `new-hooks` to `TWINNED` (55/55).
- `dev-tools`: port the JSON tests to `dev-tools-vm.test.mjs`; leave the six
  DOM/gallery tests in a `dev-tools-dom.spec.js` (results panel visible,
  HUD hidden/visible, two screenshots) in the `ui` group; `dev-tools` leaves
  `tiny` and `hooks`.
- `persistence`, `agent-determinism`: check overlap with
  `determinism-replay-vm` first; port what is not covered.
- Pattern: `tests/unit/wake-lock-vm.test.mjs` (one boot, `fresh()` between
  tests, mocks installed on `g.sandbox`).

**Verify.** `node tools/ci/twinned-specs.mjs` equal counts; each twin's wall
time in its header; the browser specs stay for the nightly.

**Saves.** The `hooks` group drops from 324 declared tests to ~150; a
`js/agent/` edit stops routing to a 70-minute local group. Effort 1–2 days.

### 9. No commit guard for docs-only commits

**Evidence.** The guard is ~5 s now; the deploy branch takes many note-only
commits (this session made four).

**Plan.** `.claude/hooks/bash-guard.sh`: before running `test:guards`, list
the staged paths (`git diff --cached --name-only`); if every one matches
`^(docs/|.*\.md$|\.claude/skills/|\.claude/agents/)` and none is a generated
target (`tools/README.md`, `docs/DEBUG-HOOKS.md`, `docs/ARCHITECTURE.md`,
`docs/LIGHTING-TUNER-SLIDERS.md`), run only `tests/unit/docs-integrity.test.mjs`
(links, index rows) and skip the rest. `AGENTS.md` rule 3 gets the clause.

**Verify.** `tests/unit/agent-config.test.mjs` (hook exists, escape hatch);
one docs-only commit measured.

**Saves.** ~5 s per docs commit; more importantly the auto-raise step never
touches `ratchets.json` for a prose change. Effort 30 min.

## Agent surface

### 10. `.claude/settings.json`: allow list, deny list, `worktree.baseRef`

**Evidence.** Every un-allowlisted routine command (`grep`, `cat`, `git
add|commit|fetch|checkout`, `node tools/gen/*`, `npx serve`, …) is a
permission stall in an autonomous run; subagent worktrees branch from the
remote default unless `worktree.baseRef` is `"head"` (AGENTS.md rule 10's
whole reason). The 2026-09-16 session could not write the file: the
permission classifier refused it as self-modification.

**Plan.** Paste the block from the research note §5 into
`.claude/settings.json` by hand (a person, in the repo). Keep plain
`git push` un-allowlisted (the deploy-branch rule depends on the prompt).
Then delete the conditional wording from AGENTS.md rule 10 and the two agent
recipes.

**Verify.** `node --test tests/unit/agent-config.test.mjs` (the allow list
must still pre-approve `test:*`); a subagent worktree lands on the session
SHA.

**Saves.** 10–30 prompts per autonomous session; the stale-base incident
class. Effort 5 min (a person).

### 11. MCP servers on demand

**Evidence.** Three servers attach every session (`enabledMcpjsonServers`);
their 85 tool schemas cost ~8–12k tokens per session on hosts that do not
defer schemas, and only the canvas-probing skills use two of them.

**Plan.** `.claude/settings.json` `enabledMcpjsonServers` → `["apex-tools"]`;
`.claude/skills/mcp-probe`, `css-play`, `survey-ui-matrix`, `playwright-probe`
open with one line: "enable `playwright-official` / `chrome-devtools` for
this session (`/mcp`), they are off by default". `tests/unit/environment-json.test.mjs`
and `apex-tools-mcp.test.mjs` lockstep `.mcp.json` with `.cursor/mcp.json` and
`.codex/config.toml` — `.mcp.json` keeps all three entries; only the
enabled set changes. Same settings.json write as item 10.

**Verify.** The lockstep tests; a session that never probes the canvas
lists 11 MCP tools, not 85.

**Saves.** ~10k tokens per session on non-deferring hosts, two server
starts. Effort 30 min after item 10.

### 12. Smaller routine reads: `TESTING.md` and `DEBUG-HOOKS.md`

**Evidence.** `TESTING.md` is 1,407 lines and `DEBUG-HOOKS.md` 4,719; both
are named as "the reference" in AGENTS.md, and a session that follows the
pointer loads 40–50k tokens for a two-line answer.

**Plan.**
- `TESTING.md`: keep §1–2 (how to run, the groups) as the file; move §3
  Infrastructure and the field-note sections into
  `docs/notes/TESTING-FIELD-NOTES.md` (already the ledger for most of it)
  and §5 Coverage table into a new generated `TESTING-COVERAGE` page under
  `docs/` (generated from
  `tests/groups.json` + each file's header line — `gen-test-groups.mjs`
  already parses the groups; a `gen-coverage-table.mjs` sibling emits the
  rows; `tests/unit/test-groups.test.mjs`'s "every file has a row" check
  reads the new file).
- `DEBUG-HOOKS.md`: the hook table is already generated; add
  `node tools/shot/agent.mjs help <hook>` (reads `agentHelp()` for one
  hook) and point AGENTS.md there first, the doc second.

**Verify.** `docs-integrity` (links, redirect stubs for moved anchors),
`test-groups` (rows), `generated-docs` (new generator's `--check`).

**Saves.** Tens of thousands of tokens on the sessions that follow the
pointers; the docs stop drifting where they are generated. Effort half a day.

### 13. Source-text pins → behaviour

**Evidence.** 2,513 `assert.match` calls quote one file's source (up from
2,184 on 09-01; `gfx-backend-canary` 516 alone); two broke on a one-token
refactor with no behaviour change on 09-01.

**Plan.** Per file, in the order of pin count (`gfx-backend-canary`,
`ui-improve-pass`, `perf-try`, …): keep the lint-class invariants that scan
every file (no-bare-console, vstd, storage-key-prefix, global-registry,
silent-catch, css-*, load-order); replace single-file quotes with a VM- or
track-VM-loaded assertion of the behaviour the quote was standing in for
(the `ai-drive.test.mjs` style). Where a pin guards a rule with no
behaviour (a comment must exist), delete it. Budget one file per session;
`tools/check/bloat-scan.mjs` can count the remaining pins.

**Verify.** Each converted file green on `node --test`; the pin count in
the note's §1 table goes down, not up.

**Saves.** A whole false-red class; hard to put minutes on, but each one
costs a diagnosis. Effort ongoing, ~1 h per file.

## Process

### 14. `selected` on llvmpipe closes the deploy-push loop

**Evidence.** After B4 the train reuses the fast tier's tree-only jobs; the
fast tier itself waits on `select → selected`. With item 1 the typical
deploy push should be guards ~2 min ∥ node-suites ~6.5 (item 3 → ~2) ∥
selected ~2–5, then a 3–4 min train.

**Plan.** Nothing beyond items 1–3; re-measure with the CI agent's method
(60 runs, per-job medians) two weeks after they land and add the column to
the research note's §0 table.

**Saves.** A deploy push from ≈ 14 min median push-to-live to ≈ 8. Effort
the measurement only.

### 15. Push once per verified batch

**Evidence.** 9 of 59 sampled runs were cancelled by a newer push on the
same branch, and two of three inspected cancellations hid a real failure
(a killed job runs no `if: always()` step, so nothing is carried forward).

**Plan.** `verify-change`'s live-CI warning now says so at verdict time;
add the same line to `.claude/skills/check-changes/SKILL.md` and AGENTS.md
rule 4 ("push once per verified batch; a push over a live run cancels it
and loses its failures"). Optionally a `Stop` hook (Claude Code) that
prints the live-run count for the branch when a session ends with
unpushed commits — advisory, never blocking.

**Verify.** Prose; the cancelled-run rate in the next 60-run sample.

**Saves.** The hidden-red incidents; a few runner-minutes per cancelled run.
Effort 20 min.

## Order

| when | items | why first |
|---|---|---|
| next session, one sitting | 2 (guards jobs), 1 (`selected` on llvmpipe), 9 (docs-only guard), 15 (push cadence line) | all small, all measured, no browser run to land |
| a person, 5 min | 10 (settings.json), then 11 (MCP on demand), 5 (ruleset) | the only items a session cannot write |
| half a day each | 6 (`ci-dispatch`), 3 (elevation-tracks worker pool), 12 (smaller reads) | the shape-of-session changes |
| as they come up | 8 (twins), 13 (pins), 4 (sweeps shards), 7 (DRI probe) | per-file or environment work |
| two weeks on | 14 (re-measure) | the note's §0 table gets a third column |
