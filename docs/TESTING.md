# Testing reference

Root Playwright spec files (`tests/specs/*.spec.js`) and `node --test` unit suites
(`tests/unit/*.test.{mjs,cjs}`); the sizes are measured, not quoted
(`node tools/gen/gen-ladder-figures.mjs --table`). Everything under `tests/manual/` is
**excluded from default discovery** (`testIgnore: ["**/manual/**"]` in
`playwright.config.js`) and is run by explicit path — see
[`tests/manual/README.md`](../tests/manual/README.md).

The suite covers physics, behaviour, geometry, cameras, UI, parts, steering,
lighting, scenery, gamepad, timing/field hooks, multiplayer, career, the agent
world view, headless RL, and the tooling contracts that keep the load order and
the docs honest.

**RUN `npm install` FIRST — an empty `node_modules` does not fail loudly.** It
fails as ~18 scattered `ERR_MODULE_NOT_FOUND` suites inside an otherwise green
run (`espree`, `eslint-scope`, `playwright`, `jsqr`), which reads exactly like
a set of pre-existing breakages someone else left behind. Measured 2026-08-13:
`test:tooling-fast` reported 344 pass / 18 fail on a fresh container and
439 pass / 0 fail after `npm install`, with no source change between them —
and two sessions in a row had by then written those 18 off as an environment
quirk and baselined against them. If a suite fails with "Cannot find module",
install before believing it. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` keeps the
install to seconds; the browsers are already at `/opt/pw-browsers`.

---

## 1. How to run tests

### Browser specs run on CI, not on this box

Agents never run a browser test locally (AGENTS.md rule 5; the local-run
machinery went on 2026-11-03, docs/plans/2026-11-03-agent-surface-reset.md §4.2).
Every PR push runs `ci.yml`'s change-aware `selected` legs: a draft push gets
the fast tier plus a selected browser shard (the `select` step's `BUDGET_MIN`),
a ready PR the full budget (`DEFAULT_BUDGET_MIN` in `tools/ci/select-specs.mjs`).
A whole group runs on the pushed branch with
`node tools/ci/remote-group.mjs <group>` (`browser-group.yml`; the shard plan is
`shardPlan` in that tool). The local loop is Node-only, AGENTS.md §The loop:
`node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet` (and
`verify-track.cjs <id>` for a circuit). The one exception is Bryce's: a session
he attends may run ONE spec by his explicit grant, detached, under the one-run
lock and loadavg gate in `tools/ci/test-bg.mjs`. Never an agent's own route:

```sh
node tools/ci/test-bg.mjs --spec tests/specs/<file>.spec.js   # one spec, log artifacts/logs/spec-<name>.log
node tools/ci/test-bg.mjs --status                            # running / how it ended
node tools/ci/test-bg.mjs --wait --timeout 45                 # the waiter (a background task): exit 1 red, 124 still running
node tools/ci/test-bg.mjs --stop                              # end it (never a PID kill: that orphans the browsers)
```

The reporter is `tests/helpers/live-reporter.js`: one timestamped, flushed line
per test start and end plus a 30-second heartbeat, so the log is tail-able and
a hung test is the one with a `> start` line and no end line. The verdict is
the log's `= run …` line, then the `= bg exit N` trailer.

### Run the groups your change needs, not all of them

The whole suite is roughly 40 minutes of software rendering. Which groups a
change needs is mechanical, so ask `pick-tests` (the command forms are
[VERIFICATION.md](VERIFICATION.md) §1, their one home).

The routing rules live in `RULES` at the top of `tools/ci/pick-tests.mjs` and are
deliberately coarse and biased toward running too much — a rule that is too
narrow is a missed regression, one that is too wide costs 10-40 minutes of
CI runner time per extra browser group. The groups it names run on the PR, not
here (AGENTS.md §Verification): the `selected` legs on every push, a whole group
by `node tools/ci/remote-group.mjs <group>`; a group left unverified is named in
the PR (AGENTS.md rule 9).
`tests/unit/test-groups.test.mjs` asserts every group they name exists.

When the named group is much bigger than the change, select SPECS instead of
groups — `tools/ci/select-specs.mjs` decomposes the picked groups into spec files
under a time budget and names everything it skipped (`--since <ref>`,
`--budget-min N`; [VERIFICATION.md](VERIFICATION.md) §1).

It powers the blocking change-aware CI gate and is just as useful interactively
(`node tools/ci/select-specs.mjs --since <ref>` prints the plan CI will run). An
edited spec runs first, alone, in the PR's `selected` legs; there is no local
single-spec route for an agent.

Two routes go past the group RULES (2026-10-05). A circuit edit
(`js/circuits/<id>.js`) also routes every spec that RACES that circuit
(`specsRacing`, read from each spec's string literals and helper imports by
`circuitsOf`): most specs race monza, a score race bahrain, and #878's Bahrain
`startFrac` move turned steering.spec red on six unrelated PRs because no
ship run had selected it. They are budgeted candidates like a group's specs.
And `pick-tests` names an edited spec's own browser group(s) as advice, which
both CI selectors strip (`stripSpecOwner`): select-specs already runs the
edited spec first, alone; an edited ADAPTED spec schedules the `page` slice
instead, since that is the only place it runs on a pull request.

A routed spec that loses the budget to smaller ones rides as **overflow** —
up to `MAX_OVERFLOW_SHARDS` more `TARGET_SHARD_SEC` jobs' worth (`tools/ci/select-specs.mjs`;
a draft run sets `OVERFLOW_SHARDS` to 0 on the `select` step), packed with everything else —
instead of being skipped. A routed spec that declares a per-test timeout at or
over the gate's `SELECTED_GATE.perTestTimeoutSec` runs in the **over-budget pool** (`overbudget-<k>` jobs,
up to `MAX_OVER_BUDGET_SHARDS` jobs' worth, each capped from its own declaration). When the
overflow is full, leftovers ride a bounded **spill** leg (`spill-<k>` jobs,
up to `MAX_SPILL_SHARDS` jobs' worth, logged as `SPILL`). What is still
left is dropped by name as an error, and a dropped spec turns `Selected specs (verdict)`
red on a pull request (2026-10-04). The
**nightly** runs the same selector over the last day of deploy-branch merges
(`ci-resolve-before.sh`'s `schedule` base) with its own `BUDGET_MIN` and
`OVERFLOW_SHARDS` (the `select` step's env in `ci.yml`) and `--stale-first` ordering — so a routed spec no
per-change budget can afford runs within a day rather than on its group's
night in the rota (`ROTATION` in `tools/ci/nightly-group.mjs`; `--list` prints it) (2026-09-29: `menu-traversal`, `ui-redesign` and
`time-trial` sat red that way). A PR also restores the deploy branch's last
failing specs, so it ranks a spec that just failed there the way the train
does.

### What a spec costs is recorded, not re-measured

`tests/data/spec-timings.json` is a rolling per-spec and per-test duration
history: the last ten samples for each key, each carrying a run-start timestamp,
its env bucket (`swiftshader` / `llvmpipe` / `local`) and its wall time in
seconds. `tools/ci/spec-timings.mjs` merges into it from the two sources a run
already produces — the junit XML at `artifacts/test-results-*/junit.xml` and
`tests/helpers/live-reporter.js`'s own per-test durations, which it writes at
`onEnd` only under `APEX_SPEC_TIMINGS=1` (off by default, so an ordinary local
run neither loads the tool nor dirties the tree). A sample is keyed by (bucket,
run-start second), so merging the same junit twice, or a run's junit alongside
its log, adds nothing; buckets are never averaged together, because a move
between GPU stacks would otherwise read as a regression.
`tools/ci/select-budget.mjs` bills a spec at the median of its own CI-bucket
samples once it has three of them and falls back to the measured 7.5 s/test constant
otherwise — `--json` reports `source: "measured" | "constant"` per spec, so a
default can never be mistaken for a measurement. `select-specs.mjs`' cut spends
that rate: a spec costs `tests x its own rate` against the budget in seconds, so
an unmeasured selection cuts exactly where the old 10-test cap did and a measured
one fits what it actually costs (2026-09-24; before, the cut counted tests and the
medians moved nothing). CI merges into `bot/spec-timings`, never the deploy
branch; adopt it with `git show origin/bot/spec-timings:tests/data/spec-timings.json`
in a reviewed PR. `node tools/ci/spec-timings.mjs
--check` prints every spec or test whose latest sample is more than twice its own
median and **exits 0 either way**: a busy box and a slow test look identical from
here, so the flag is advisory until it has a few weeks of history behind it.

### Coverage is opt-in, and measured across both halves of the suite

`APEX_JS_COVERAGE=1` makes a browser run collect raw V8 script coverage —
`tests/helpers/js-coverage.js` starts `page.coverage` on every page the fixtures
open (once per worker under `sharedTest`) and writes one JSON list per test to
`artifacts/coverage-<port>/`. The node half uses Node's own dump:
`NODE_V8_COVERAGE=artifacts/coverage-node npm run test:game-vm-b`. The two are
the same format, so `tools/ci/coverage-merge.mjs` folds both into one lcov +
html report under `artifacts/coverage-report/` (the live reporter calls it at
`onEnd` of a flagged run; it is also a standalone command). Both flags are off
by default and the helper is inert without them — an ordinary run makes no CDP
call and writes nothing under `artifacts/coverage*`.

Two things the numbers depend on. The VM harnesses (`tools/lib/game-vm.cjs`,
`tools/track/verify-track.cjs`) name every script by ABSOLUTE path, because V8
silently drops a relative one: before 2026-09-22 every twin reported 0 % for
the game sources it ran. And the same harnesses rewrite `^const` → `var`, so a
node entry's offsets index the rewritten text; the merge attaches whichever
text V8's top-level range length fits and drops an entry that fits neither.
The html shows `var` where the file says `const` on those lines.

First measurement (2026-09-22, this box): one twin, `active-aero-vm.test.mjs`,
alone reaches 230 sources, 49.1 % of lines / 29.1 % of functions / 21.2 % of
branches under `js/` — a boot plus one race on one circuit. That is the
floor a browser group adds to, not a suite figure; there is no CI job for it
yet (SwiftShader cost), so a number worth quoting is one you measured with the
group named beside it.

### The edit loop is Node-only; browser specs run ONCE, at the end

Tests serve `js/` and `css/` from the working tree, so a browser run in
flight forbids source edits — which means the efficient session shape is not
"edit, run browsers, edit, run browsers" but: make ALL the source edits,
verify once, commit — there is no cache bump (`?v=dev`; the deploy stamps the hashes). Re-running browser specs after every
edit buys no additional safety over running them once at the end; it just
serializes the agent behind SwiftShader several times over.

| When | Run |
|---|---|
| in the edit loop | `node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet` (or `node tools/ci/verify-change.mjs --fast`, which wraps it) selects only the structural files owned by the diff and reports an estimated critical path; it is the local floor before a push (AGENTS.md rule 3). The full `npm run test:tooling-fast` is optional locally (a green run writes the stamp `ready-gate` accepts); in CI the same full suite is **Structural guards**: the parallel tooling-fast shards `Structural guards (tooling A)` … `(tooling D)` (jobs `guards-a` … `guards-d`, each `tooling-fast.mjs --jobs=4 --shard=<i>/<n> --bail`: a shard stops STARTING files after its first failure, the files in flight finish, and the log says how many it skipped; the local full command has no `--bail`). The ratchet, `test:audit`, `ci-coverage` and `behind-ship` steps run at the end of tooling B; the aggregator job `guards`, still named `Structural guards`, only joins the shards (#1075). `ready-gate.mjs` reads that aggregator name (`GUARDS_JOB`) |
| generated files in the diff | `--changed` does not widen on generator output (`index.html`/`sw.js` `@gen-shell` blocks, `js/roster.js`, `impact-map.json`, `ratchets.json`, `agent-index.json`, `version.json`, …): it runs `npm run gen:check` plus the tests that pin the file. A HEAD that is a pure deploy-tip merge selects `gen:check` plus docs-integrity. `--quiet` ends a red run with `failing files:` and `log:` lines |
| before the ready flip | `node tools/ci/preflip-probe.mjs --pr <n>` merges the current deploy tip into the PR head in a temp worktree and runs the ratchets, `fixture-consumer-audit`, the assert-pin ratchet and the diff's unit files: the reds GitHub's merge ref shows and the branch alone cannot (#4108, #4190). `ready-gate --pr` prints its receipt as an `advisory:` line, never a block |
| track/scenery edit | `node tools/track/verify-track.cjs <id>` (2 s, headless) FIRST |
| once, when the edits are done | nothing local: the groups `pick-tests` names run on the PR — a draft push gets the fast tier plus a selected browser shard, a ready PR the full `selected` budget, and `node tools/ci/remote-group.mjs <group>` runs a whole group on the pushed branch; name any left unrun in the PR (AGENTS.md rule 9). Only Bryce, attending, grants a local single spec (`tools/ci/test-bg.mjs`) |
| a geometry edit ([VERIFICATION.md](VERIFICATION.md) §By change) | + `npm run test:sweeps` if you touched the fleet build's inputs (`node tools/ci/geometry-paths.mjs --ere` prints them: `js/track/`, `js/circuits/`, `tools/track|lib`, the `TRACK_VM` modules); a lighting, car, debris-world or driving-line edit needs only the suite that reads it (`--targeted <list>` names it) — `deploy.mjs` and ci.yml's sweeps job make both calls for you |
| single spec | not local: the PR's `selected` legs run an edited spec first, alone (`select-specs.mjs`); its whole group is `node tools/ci/remote-group.mjs <group>` |
| single unit suite | `node --test tests/unit/<file>.test.mjs` |

**Known container-only reds.** `tests/unit/agent-config.test.mjs` "claude plugin validate …" used to fail in every cloud
container: the container's `claude` CLI (2.1.314, 2026-10-30) accepts malformed skill frontmatter, so it cannot validate.
It now SKIPS with that reason (an environment precondition, not a quarantine); where the CLI rejects the malformed control
the assertion still runs. A skipped plugin-validate case is not a red. The eager-shell budget (`boot-load-budget.test.mjs`) is not
container-only: a new module goes in a lazy list (`.claude/rules/game-code.md` §New module checklist).

While a browser batch runs in the background, do work that does not touch
`js/`/`css/` (docs, tools, unit tests) or end the turn — idle-watching the
log converts the whole batch cost into agent wall time. Shipping with a
named, deliberate gap ("group X not run, here is why") is an allowed
outcome; silently skipping is not.

### Reaching the GARAGE: use the door, not the race flow

Measured on this container, one worker, per test:

```
goto                   3.4 s
boot (__apex.race)    18.8-22.6 s
mb-race -> select     15.9 s     |  mb-garage -> #carsetup   11.1 s
sel-go  -> #carsetup  11.7 s     |
                      ------                                 ------
race flow total       27.6 s        garage door total        11.1 s
```

`#mb-garage` calls `openGarage("menu")` -> `openSetup()` (js/game.js), which
shows `#carsetup` directly. The race flow builds the circuit picker and then the
TRACK before it gets to the same screen. Any spec whose subject is the garage —
budget, parts rows, liveries, the preview — should take the door and save 16 s a
test. Only take the race flow when the flow itself is the subject (where DONE
returns to, the select screen), because `openGarage` sets `garageReturn`.

`parts-budget.spec.js` did this and got its five timeouts back under budget.

A SHARED page across a describe is the obvious next step and is NOT worth it:
measured, one boot plus a leave-and-re-enter is ~25 s against ~30 s for a fresh
page through the door, because re-entering rebuilds the car and the bay anyway.
Five seconds does not buy making a file serial, where one failure skips the rest.

### A `waitForFunction` timeout does not bound the wait

Playwright polls a `waitForFunction` predicate on `requestAnimationFrame` by
default. A page running the game loop under SwiftShader starves that poll badly
enough that the **declared timeout never fires**, and the wait runs until the
TEST budget kills it.

Measured (`tests/manual/timeout-probe.spec.js`), all with `{ timeout: 3000 }`
against a predicate that can never be true:

| page state | actual |
|---|---|
| parked Monza, rendering | **109,665 ms** — 36x the declared bound |
| menu page | also overran |
| predicate that THROWS | **11 ms** — terminates promptly |

The throwing case is the tell: an exception propagates without polling, so an
absent global fails fast while a plain `false` does not. That is why a wait on
`GLX.__tlx.fxState().skidVerts > 0` behaves completely differently depending on
whether the TLX backend happens to be installed.

**Pass `{ polling: 100, timeout: N }` for any wait on a rendering page.**

**Every `waitForFunction` under `tests/` now carries `{ polling: 100 }`**
(2026-08-27 sweep — the rAF-starved timeouts were the recurring red class in
every loaded run). Sites under `tools/` that still carry a timeout without
polling are counted by the lint (run `node tools/check/wait-polling-lint.mjs` for the live census; the
ones that used to live in `layout-audit.mjs` are now in `tools/ui/menu-screens.mjs`) —
fix those as they are touched.
The count is a RATCHET, not a target — `tests/unit/wait-polling.test.mjs` fails
if the population grows, and lowering the ceiling as sites are fixed is the
intended direction. (Count by AST via `tools/check/wait-polling-lint.mjs`. A grep
undercounts the multi-line calls.)

The visible symptom is a test reporting `Test timeout of Nms exceeded` while
pointing at a line that claims to wait 30 s. `tlx-probes`' M6 skid spent 344 s
inside a 30 s wait that way.

The corollary matters as much as the fix: **"this test's explicit waits total N
seconds, so the missing time must be elsewhere" is not a valid deduction here**
until the call sites carry `polling`.

### And when a wait still overruns after `polling` — read it as unreachable

The two tests that produced this finding both failed with `Test timeout` and
had nothing else in common, which is the whole lesson: **a timeout tells you the
budget ran out, never why.**

| | fault | fix | now |
|---|---|---|---|
| `tlx-probes` M9 env | a real wait on a real condition, starved by rAF polling | `{ polling: 100 }` | 72 s |
| `tlx-probes` M6 skid | waiting on a value that could never move | rewritten | 49 s |

M6 cost four wrong mechanisms — a hanging `act()`, a slow prediction,
arithmetic in an un-timeouted `evaluate`, rAF starvation — and every one was a
theory about the WAIT. The answer was in the code being waited on:
`skids.stamp()` is called from `render()` in js/game.js, the stint was
driven through `act()` which never presents a frame, and 120 steps of full lock
crashed the car below both stamp gates before the wait even began.

What ended it was an instrument: a script that wraps
`GLX.drawSkidBatch` before driving and records call count and max `vertCount`,
because from outside "called with 0" and "never called" are indistinguishable
and have opposite fixes. **37 seconds, against 360 s of timeouts that said
nothing.** When a wait overruns and the call site already carries `polling`,
stop theorising about the wait and go measure whether its condition is reachable
at all.

### Turning diagnostics up

Levels come from `js/core/log.js`. `APEX_LOG` is written to `localStorage` before any
game script evaluates, so a spec needs no change to become verbose:

```sh
APEX_LOG=scenery:debug node tools/ci/test-bg.mjs --spec tests/specs/<file>.spec.js   # Bryce-attended only (AGENTS.md rule 5)
```

Every failure automatically attaches three things (see `tests/helpers/fixtures.js`), and
`live-reporter.js` echoes the tail of each inline:

| Attachment | What it holds |
|---|---|
| `apex-state` | `physState` + `probe` + `timing` + `lightState` + `info` — why the car was where it was |
| `apex-logs` | the `Log` ring buffer: retained diagnostics down to `info`, **including ones never printed** |
| `page-console` | what the page actually said, in order, favicon noise stripped |

### Debug a Node test

Measured on Node v22 in `docs/notes/NODE-DEBUGGING-2026-10-19.md`; skill `js-debugger` drives the tools.

1. **Default: one MCP call.** `debugger_node_test {files:[…], probes:[{file:"js/physics/brake-cue.js", line, expression, captureLocals}]}`
   runs up to 8 files under the inspector, no attach, and returns hit counts, values and locals. Probe a body line,
   not the `function` header. Add `runner:"test"` for the real `node --test`.
2. **Interactive:** `node --inspect-brk=0 tests/unit/<f>.test.mjs` (no `--test`: one process, one ws URL, the runner
   still reports), then `debugger_targets targetType:"node"` and attach. `--test` with several files hangs a single
   client, because each file's child waits on its own port.
3. **Which filename form is debuggable.** V8 reports a vm script under exactly the `filename` it was given:
   an absolute path is a `file://` URL that url breakpoints and `--experimental-test-coverage` reach (the game-vm
   family); a relative (`js/…`), bare or missing filename is not (coverage drops it, url breakpoints match 0). The MCP
   still binds those by source inside an instrumentation pause, capped at `vmPauseBudget` executions, so a probe on
   an unnamed vm script works but a vm-heavy suite pays for it (`cam-avoid-vm` 121 s uncapped). Issues #2960 (opt-in
   preload) and #2961 (absolute filenames) track the permanent fix.
4. **Breakpoint cost.** A logpoint is a condition that logs and returns `false`; a pause-then-resume on every hit
   costs ~44 ms per round trip (`game-vm.test` 26 s → 84 s).
5. **Columns shift by 2** on top-level `const` lines (the harness rewrites them to `var`); set line breakpoints.
6. **Never leave a client attached at exit:** Node prints "Waiting for the debugger to disconnect…" and hangs.

---

## 2. Test groups

Run with `npm run test:<group>`. Every group below names an intentional set of
specs; `npm run test:audit` fails if any test file belongs to none of them, and
`tests/unit/test-groups.test.mjs` fails if this table and `package.json` disagree
— or if a spec lands in two topical browser groups (the 2026-09 regroup folded
the browser groups into a DISJOINT partition, so `pick-tests` can never
run a spec twice; the spec union was compared file for file before and after; `tests/groups.json` holds the current groups).

A browser group runs on CI (`node tools/ci/remote-group.mjs <group>` on the
pushed branch, llvmpipe shards packed by `shardPlan`); `tools/ci/select-specs.mjs` is the finer
per-spec cut `ci.yml`'s `selected` job makes on every PR push.

**A group is defined once, in `tests/groups.json`.** `package.json`'s `test:*`
scripts and `tools/ci/tooling-fast.mjs`'s file list are GENERATED from it by
`node tools/gen/gen-test-groups.mjs`; `--check` runs on the fast gate, so a
hand-edit to either generated copy fails at once. Adding a group used to mean
three coordinated edits — a script, the `TOOLING_FAST_FILES` array, a row in
this document — with nothing failing at the time if one was missed; the
coverage audit noticed later, or nobody did. It is one edit now. The gate-ladder
SIZES are not written into any doc: `node tools/gen/gen-ladder-figures.mjs`
(`--table`, `--json`) measures them from the same source, because committed
digits made every two PRs that added a test file conflict on the same lines.

**Adding a test file — the checklist.** A new `tests/specs/*.spec.js` or
`tests/unit/*.test.{mjs,cjs}` is registered in four places, and `test:guards`
(the commit hook) fails until all of them hold — group membership moved into it on
2026-09-24 (`test-coverage-audit`, `prepush-gate-coverage`); before that a test
nothing ran could be committed and fail only at tooling-fast or the deploy gate.
`.claude/hooks/post-edit.sh` names whichever are missing the moment the file is written.

1. **A group in `tests/groups.json`**, then `node tools/gen/gen-test-groups.mjs`.
   A spec joins exactly ONE topical browser group (unless a glob such as
   `physics-*` already covers it); a unit file joins `toolingFast` or a node group
   ci.yml's "Pure-node unit suites" step runs. This is what makes CI, `pick-tests`,
   `select-specs` and the nightly rota see it — none of them has a per-file list.
2. **A row in the §5 coverage table** below: what it covers.
3. **Nothing to regenerate for the counts** — no doc quotes the ladder sizes or an exact spec count (floors like "120+" only; `gen-ladder-figures.mjs` measures).
4. **A spec only:** add it to `RENDER_SPECS` in `playwright.config.js` if it is
   GL-heavy, and declare the `test.setTimeout` it really needs if it boots a
   race. A declaration at or over the selected gate's 180 s no longer opts a
   spec out of CI (2026-10-04): a routed one runs in the selector's over-budget
   pool, in a job whose kill timer derives from that declaration.

A new GROUP is the same plus its `package.json` key, a §2 row here, and a
`tools/ci/nightly-group.mjs` ROTATION / EXCLUDED / UNSCHEDULED entry.

In that file's `toolingFast` list an entry beginning `//` is a note emitted
verbatim into the generated block: the reasons a given file earns a place in
the edit loop live beside the file they explain, and regenerating must never
eat them.

### Boot (run first, and first to fix)

**Why `driving` was split (2026-09-09).** It was 16 spec files and ~149 tests,
and the imbalance was the problem, not the size: its four SLOWEST files held
57 % of the tests. Playwright's `--shard` divides by FILE IN DECLARED ORDER,
not by cost, so one runner could draw `collision-ai-fixes` (28 tests at ~30 s)
plus `aero-zones` (18 at ~48 s) — 46 slow tests — while another drew the
physics files (7 fast ones). Adding shards cannot fix that; it only idles the
lucky runners sooner. Measured on the dev box: 42 of the group's tests took
15.6 minutes, i.e. ~40 minutes for the whole group on one worker.

Compounding it, the dispatched-group step passes `--timeout=900000`, so ONE
hung test burned 15 of a shard's then-50 minutes. Three of those kill the shard
whatever the split. Splitting does not fix a hang — it LOCALISES one, which is
the point.

The three groups below are cost-balanced and subject-coherent, so each fits a
runner comfortably and `pick-tests` can name the narrow one: an AI change needs
`collisions`, not `aero`.

| Group | What it runs |
|---|---|
| `tiny` | boot-guard, smoke, dev-tools, logging — page loads, `__apex` present, dev hooks respond. The CI push gate runs `smoke` alone; `tiny` is the wide smoke job's fallback group (`GROUP:-tiny` in `ci.yml`, when `nightly-group.mjs` names none) |
| `smoke` | page load + `__apex` available — the one spec the CI push gate runs |
| `audit` | coverage guard — every test file must belong to ≥1 topical group (`tools/ci/test-coverage-audit.mjs`) |

(`test:pick` and `test:bg` were aliases for `node tools/ci/pick-tests.mjs` and
`node tools/ci/test-bg.mjs` that nothing invoked; dropped 2026-09-10 — call the
tools directly.)

### Topical browser groups (disjoint)

| Group | What it runs |
|---|---|
| `physics-core` | the driving model proper: physics-boot (the cheap selected-gate pin), physics-characterization, physics-fixes, physics-hotpath, longitudinal, world-physics, off-track, the Rapier debris side-world and race control. Nearly all FAST. `physics-characterization` also runs in Node as `game-vm` in seconds — run that first |
| `collisions` | car-to-car and wall contact: `collision*.spec.js` (collisions, collisions-deep, collision-ai-fixes). The SLOWEST set in the suite (26–34 s each) — the multi-car pack separation runs a whole race |
| `aero` | the aero and handling model: aero-zones (the slowest single spec at ~48 s/test), active-aero, drift, understeer-cue |
| `hooks` | the `__apex` contract end to end: dev-tools, headless, obs/act, data lifecycle, telemetry compare, assets, logging, persistence, the race wake lock, output paths, the map + new hook contracts, and the agent world view (world, trackInfo, scene, rollout, determinism, the drive bench). Union of the old `api` + `hooks` + `agent` + `map` + `paths` |
| `circuits` | walls + autopilot + elevation + the codebase-audit edge cases; the per-circuit foundation specs (`tests/specs/*-foundation.spec.js` — required models present, props clear of the racing surface, terrain grounded, water safe, walls sane); props/terrain over road, F1 track accuracy, scenery kits. Union of the old `circuit` + `foundation` + `scenery`. Routed from `js/circuits/` and the track engine; a one-circuit edit runs `verify-track.cjs <id>` then THAT circuit's foundation spec alone, not this group |
| `car` | catalog, budget, persistence, recipes (inside `parts-physics`), factory presets, mesh caches, liveries, ERS, car effects, the custom team, the car viewer, garage aero (the old `parts`) |
| `input` | presets, sliders, steering modes, gamepad, touch steer, the tilt pipeline, the steer-schema migration; the camera modes, camera + driving hooks, the camera tuner. Union of the old `steering` + `camera` |
| `ui` | UI behaviour and layout: button/touch, resize, UI scale, the redesign, HUD layout + audit, menu survey + keyboard (slow), rotation recovery; WebAudio engine/sfx smoke + the music library (the old `ui` + `audio`) |
| `modes` | season, time trial, career, qualifying |
| `net` | multiplayer in a browser: car roles, the per-car input seam, the session, the lobby, the waiting room, seats, N-peer, and the camera SCAN plus its cancel path (a real `getUserMedia` against a Y4M of a real QR that Chromium plays as a webcam) |
| `gfx` | instanced draw, GL capability probes, the lighting A/B pixel comparison, image grade, the lighting-tuner grade, the three.js/TSL backend probes. Union of the old `webgl` + `ab` + `tlx`. The one browser group CI runs on a REAL GPU: `ci.yml`'s `renderer-macos` job (`macos-latest`, Metal) runs `test:gfx` when a ready PR's or a Pages call's diff touches `js/render/**` or the lighting modules, nightly, and on dispatch — see §Renderer specs on a real GPU below |
| `baseline` | the blessed pixel baselines (`tests/specs/menu-baseline.spec.js-snapshots/`) for menu IDENTITY — colour, type, spacing (fast) |
| `phone-recorder` | the PHONE TEST recorder: RECORD at 844x390 touch, rAF frames advance, SHARE hands `navigator.share` one valid `apex26.phone-soak/1` JSON file (menu-only, seconds) |
| `perf-frametime` | SwiftShader frame-time regression: fixed Monza night race, ~5 s warm + ~20 s rAF sample, p50/p95/p99 + long-task count + `performance.memory` heap; compares to `tests/data/perf-frametime-baseline.json`. Soft by default (`APEX_PERF_FRAMETIME_STRICT=1` fails only on large deltas). Intended as a separate non-blocking CI job (continue-on-error, off the Pages verdict gate) |
| `shimmer` | does baked tarmac crawl under motion |
| `perf-idle-churn` | `perf-idle-pipeline-churn.spec.js` — after warm-up, equal idle race windows on TLX WebGPU build zero render pipelines (#3713 background re-mint; counts, not ms) |
| `scratch-rcmz` | `tests/specs/scratch-rcmz-r1.spec.js` (… r8) — SCRATCH copies of the fixed race-cycle-memory (#5288), never merged |
| `perf-budget` | `perf-boost-press-pipelines.spec.js` (TLX WebGPU) and `perf-boost-press-pipelines-gl.spec.js` (TLX WebGL2, its own file: a second TLX boot in one Chromium stalls), driven by `tools/perf/boost-press-census.mjs` (A·H17) — BOOST presses 2..N re-mint zero BOOST pipelines, and add no fx-stream re-mints beyond the matched no-BOOST windows; every press must deploy ERS (#3677, #3703; counts, not ms); `perf-sw-cache-hit.spec.js` — the service-worker install already holds every script and stylesheet a first race loads (cache snapshot read inside the worker; dev-only LAZY_AGENT excluded). Count-based perf gates, docs/notes/PERFTEST-HUNT-2026-10-24.md |
| `perf-race-entry` | `perf-race-entry.spec.js` — race vs practice PREPARING stage spans (`RaceEntryProfile` / `__apex.raceEntryStages`), writes `artifacts/perf-race-entry/*.json` for regression diffs (issue #1881) |
| `results-flow` | `results-flow.spec.js` — post-flag path at 844×390: default `finishRace` → `#results`, TT ineligible for ceremony, and (once `#1584` slices 1–4 land) cooldown → parc fermé → podium → results plus SKIP / `data-ceremony-phase` pins. Plan `docs/plans/2026-10-27-cooldown-podium.md` |
| `perf-session` | `perf-session-budgets.spec.js` — one software-GL session (three.js forced to WebGL2): garage first-draw `tapMs`, `race()` to the grid, worst and steady rAF time across the first 30 s, CDP heap across Quit to Menu. Hang ceilings fail; phone lines are recorded unless `APEX_PERF_SESSION_STRICT=1`. Artifact `artifacts/perf-session/perf-session.json`. How to run and what the numbers mean: `docs/notes/PERF-SESSION-BUDGETS.md` |
| `stall-reload-sw` | `stall-reload-sw.spec.js` — software GL (three + `tlxForceGL`, `?stallwatch=1`): cold `__apex.race("bahrain")` must reach the grid with `apex26.stallReloads` still 0 and no stall `reload` act. Artifact `artifacts/stall-reload-sw/after-fix.json`. |
| `gallery` | `ui-audit.spec.js` alone — a CAPTURE HARNESS whose product is a PNG gallery, run **on demand**. It asserts nothing beyond "the screen appeared", so its 39 green ticks were being counted as `ui` coverage while dominating that group's wall time (13-108 s per shot). No `pick-tests` rule routes to it: galleries are run on purpose, like `tests/manual/`. `test:audit` still sees it, so it cannot go orphan |
| `xr` | Immersive Web Emulation Runtime (IWER) emulated-VR suite — Playwright project `xr-emulated`, pinned `tests/vendor/iwer-2.5.0.min.js`, `forceInstall` metaQuest3. Spec-level only (not Quest GPU). Run `npm run test:xr`. Path-gated CI job `xr` (the `select` job's "Does this diff touch WebXR?" step) when the diff touches `js/xr/`, IWER, or `vr-emulated.spec.js`. On-device checklist: `docs/notes/XR-QUEST-ON-DEVICE.md` |
| `webkit` | WebKit iPhone-path proxy — Playwright project `webkit` (`Desktop Safari`), `tests/specs/webkit-boot.spec.js` only. Opt-in via `APEX_WEBKIT=1` or `--project=webkit` (so bare `npm test` never needs a WebKit binary). Pins `apex26.gfxBackend=three` + `apex26.tlxForceGL=1`. Run `npm run test:webkit` on a macOS host. See §WebKit leg below |

### Node groups (`node --test`, no browser)

| Group | What it runs |
|---|---|
| `agent-output` | Shared compact/diagnostic/full presentation, GitHub/SQLite inbox and actual MCP transport contracts (Node 22.13+, offline fixtures), CLI process handling, MCP routing and saved evidence, experimental recorder safeguards and accounting, launch pins and generated catalog; every file also runs in `tooling-fast`. |
| `guards` | the 45 CROSS-FILE guards (the count is pinned to `tests/groups.json` by `test-groups.test.mjs`), seconds in all — every one asserts a relationship BETWEEN files (or, for `no-bare-console`, `log-namespaces`, `html-sink-lint` and `lexical-window-guard`, a rule across all of `js/`; `test-coverage-audit` and `prepush-gate-coverage` put every test file in a group the gate runs) (a registry against the tree, a generated file against its source, a ceiling against what it measures — the pin counters `assert-match-ratchet` and `source-pin-hygiene` judge only the growth this change adds), and `global-registry` parses every manifest file so a syntax error cannot reach a commit. The commit hook runs it (AGENTS.md §The loop, step 5): four failures in one session — a suite registered in none of its registries, `tools/README.md` and `package.json` hand-edited when both are generated, and a missing comma that would have broken the game's boot — were all inside this group and all found instead by a ~10-minute deploy. `deploy.mjs` reads the same group for its post-rejection re-verify, so the two cannot drift apart. |
| `garage-entrance-motion.test.mjs` (tooling-fast) | Blender entrance curve continuity, mirrored route, parked contact envelope and corrupt-export fallback. |
| `tooling-fast` | Includes offline Codex Cloud history fixtures (Python 3.11+ standard library; pagination, descendant scope, resume and credential redaction; no account/network). The structural half — most unit files, ~5 min one at a time (317 s measured 2026-09-16), ~2 min at `--jobs=3` — via `tools/ci/tooling-fast.mjs` (`--changed` selects diff-owned files for the edit loop, including the always-on topical groups' files; the full command is the pre-push floor and, since audit4 E1, leaves out every file of node-plan's ALWAYS_ON_TOPICAL groups, whose own CI jobs run them on every run; `--test-concurrency=1` inside each file; `--jobs=N` files at once, LONGEST FIRST by `tests/data/tooling-fast-timings.json` — refresh it with `--record` — each child under `--test-timeout` plus a per-file wall that fails a hung file by name) with START/PASS/FAIL + `not ok` names on stdout and `artifacts/logs/tooling-fast-suite.log`. Load order, docs integrity, test groups, api contracts, css layer discipline, graph, validators; actual Three binding/index update contracts and mirror/Smith shader-generation checks. The full-fleet sweeps dominate `tooling`. **CI (#1075):** the full suite is split across the parallel jobs `Structural guards (tooling A)` … `(tooling D)` (`guards-a` … `guards-d`, packed by `tests/data/tooling-fast-timings.json`; ratchet/audit run at the end of tooling B), joined by the aggregator `Structural guards`; that aggregator name is what `ready-gate.mjs` requires green before draft→ready; `design-matrix.test.mjs` pins the design-review matrix core (`tools/shot/design-matrix.mjs`: expansion, framing, < 0.5 % diff label, batch, resume) |
| `tooling` | every Node contract suite — chains `test:tooling-fast` then `test:sweeps` (the sweeps run `--test-concurrency=1`, see below) |
| `game-vm` | the Node VM game harness (`game-vm.test.mjs`), the friend-race quali handoff (`quali-handoff-vm`), physics parity (`physics-characterization-vm`) the `*-vm.test.mjs` TWINS of the JSON-only browser specs (every `TWINNED` pair in `tools/ci/twinned-specs.mjs` is the list; it is not copied here because the copy drifted) and `new-hooks-vm` — same assertions and thresholds, one boot per file, ~1 s a circuit build. ~3 min for the set (elevation-tracks builds every circuit in the roster, `js/track/circuit-meta.js`, and is the bulk of it, ~3 min through the worker pool; the rest are 2–30 s each), plus `game-vm-pool` — the pool's own parity suite; in CI's node suites (ready PRs, the nightly, a dispatch — drafts and the Pages train skip that job; the train runs the twins its plan dropped in `train-twins`). **The twinned browser specs no longer run on the blocking gate** — `tools/ci/twinned-specs.mjs` lists the pairs (`TWINNED`, plus the `ADAPTED` specs the VM adapter replays) and holds the drift check that keeps the substitution honest (equal declared test counts, and the twin's group must still be gated, derived from ci.yml). The browser copies still run in their own group on the nightly. `new-hooks` has a VM file but is NOT twinned: its Madrid foundation test is deliberately unported |
| `game-vm-a` | `elevation-tracks-vm.test.mjs` ALONE, on its own CI runner (`node-suites` matrix slice `vm-a`, 2026-09-16; since 2026-09-30 TWO runners, `vm-a1` / `vm-a2`, each building every other circuit through `APEX_CIRCUIT_SHARD=i/2` — `tools/lib/circuit-scope.cjs` `shard`, a partition of the roster, so the pair is exactly this file): it builds every roster circuit and was 399-400 s on this box (2026-09-16), the floor of any split of `game-vm` — until the same day's `tools/lib/game-vm-pool.cjs` put the per-circuit races in worker VMs: 191-210 s, green every run (`APEX_VM_POOL=0`, the serial path, still measures 400 s; this box was shared with other agents' suites throughout, the 210 s run at mean load 5.1 of four cores). As one slice the whole group measured 9.2-9.4 min and set the job's wall; with this file alone the slice was ~6.5 min on a runner and the pool should take it to ~2. Partition — `game-vm` is still the full list locally |
| `game-vm-b` | every other `game-vm` file: agent-view 27 s, ai-racecraft 33 s, mechanics-integration (split 2026-10-19 into `mechanics-integration-vm`, `mechanics-drills-vm`, `mechanics-race-vm`, one boot each) 15 s, the rest seconds each — ~2 min on a runner. Partition of `game-vm`; the whole list locally, while CI runs its two halves below |
| `game-vm-b1` | the first of two time-balanced halves of `game-vm-b` (CI slice `vm-b1`). The 2026-09-30 cut measured 367 s each locally at `--jobs=4` but 437 s vs 220 s on a runner (three green ship pushes, 2026-10-15), so it was re-cut from per-file runner medians (LPT over the group's files, ~850 s of serial test time a side; `docs/notes/CI-CLOG-SURVEY-2026-10-15.md` §7): race-flow-fixes 208 s, real-replay 98 s, game-round2, quali-pace-parity and the rest of `test:game-vm-b1`. `node-plan.test.mjs` pins that `b1` + `b2` is exactly `game-vm-b` and disjoint |
| `game-vm-b2` | the second half (CI slice `vm-b2`): car-fields 190 s, ai-racecraft ~100 s, mechanics-integration (and its `mechanics-drills-vm` / `mechanics-race-vm` halves), agent-view, race-settings and the rest of `test:game-vm-b2`. The seconds-to-a-minute scripts that rode `vm-b1` (net-unit, audio-unit, garage-unit, state-unit, steering-unit, mcp, service-worker, lifecycle-unit, agent-contract, desktop-unit; 180 s together by 2026-10-15) now ride the light rows — `vm-a1`, `vm-a2`, `slow` — per `pick-unit-slices.mjs` `SLICE_SCRIPTS`, which its test pins to ci.yml's case arms |
| `vm-page` | local compatibility alias: runs both vm-page partitions serially through `tests/unit/adapted-specs.test.mjs` |
| `vm-page-a` | adapted specs, partition `a` of `ADAPTED_PAGE_GROUPS` in `tools/ci/twinned-specs.mjs`, each as its own `APEX_VM_PAGE=1 node --test` child; CI slice `page-a` |
| `vm-page-b` | partition `b` of `ADAPTED_PAGE_GROUPS`, each as its own child; CI slice `page-b` |
| `mcp` | The bounded workflow harness (`workflow-harness`) covers frozen source, tool conditions, schemas, probes, budgets and transcripts. The listing-cost meter and the per-tool bound on what the output-level gateway adds to `tools/list` (`mcp-listing-cost`, docs/notes/MCP-SINGLE-TOOL-REDESIGN-2026-10-20.md). Server defect regressions (`lsp-mcp` real-tree MCP client, `lsp-mcp-fixture` scratch workspaces (helper `tests/helpers/lsp-fixture.mjs`), `lsp-reference-fixes`, `lsp-config-freshness`, `lsp-caller-fixes`, `lsp-navigation-efficiency`, `lsp-workflow-fixes`, `apex-server-fixes`, `js-debugger-lifecycle-fixes`, `chrome-server-fixes`); the debugger session, transport and T-series suites (`js-debugger-mcp`, `js-debugger-transport`, `js-debugger-tracks`; fixtures `tests/helpers/js-debugger-rig.mjs`); debugger primitive exceptions, reserved-name counts and trace regressions (`js-debugger-trace`); Node targets, `debugger_node_test` (probes, captures, parallel files, child auto-attach, `node --test` runner, timeout) and the `debugger_break`/`debugger_collect` workflows against live Node inspectors (`js-debugger-node`, ~6 s, no browser); [UI explorer](UI-MAP.md) replay, navigation graph, reduction, fault adapters and offline evidence contracts; plus the `.cursor/environment.json` bootstrap pins (`environment-json`) — CI's node suites always, locally when touching `tools/*-mcp.*` or `.cursor/environment.json`. Runs with `--test-concurrency=1` so parallel `tsc --lsp` cold starts cannot starve the MCP client case (docs/notes/LSP-MCP-TIMEOUT-2026-10-19.md). The two CLI-only MCP wrapper suites (`tinyfish-mcp`, `probe-mcp`: spawn-heavy, not MCP-attached) moved to `tests/manual/` on 2026-09-10 and are run by path; their fast-gate half is `mcp-cli.test.mjs` |
| `docs-guards` | the unit files that READ the prose trees ci.yml's `paths-ignore` skips (`docs/**`, `**/*.md`, `.claude/**`, `.cursor/**`, `.codex/**`): docs-integrity, generated-docs, agent-config, skill-progressive, hooks-documented, F1 Dev Tools scene/preset/replay helper contracts and the rest of `tests/groups.json`'s list. `.github/workflows/docs-guards.yml` ran this group on every pull request from 2026-09-25 until 2026-10-15, when its required context was removed and the workflow retired (every file is in `tooling-fast`, so ci.yml's guards job already covered a prose PR; the second workflow was one job start per PR event — `docs/notes/CI-CLOG-SURVEY-2026-10-15.md`). The group remains the local alias the docs-only fast path and the agent-config skill call. |
| `node-slow` | the raster/spawn-heavy car files (`cockpit-pale-surfaces`, `crest-marks`, `slider-effect`; 152 s of the old 315 s loop) plus `cover-legibility` (every pickable cover design on every car, ~160 s locally, moved here from `garage-unit` 2026-10-19) plus `flyby-fleet` (the flyby's multi-circuit audit, ~1 min), `foundation-core-vm` (~26 s, builds every foundation circuit) and the car-mesh sweeps `car-mesh-anchors` / `cockpit-crest-stripe` (moved out of `tooling-fast`, audit4 E1) — CI's `slow` node slice (ready PRs, nightly, dispatch), locally when pick-tests names it |
| `sweeps` | the full-fleet geometry audits (`package.json` `test:sweeps` IS the list; the enumeration that used to stand here had drifted four files behind it, so read the script). Most rebuild every circuit through `tools/lib/track-build-vm.cjs`; a few build no circuit at all (driving-line's synthetic stadium, driving-line-opts' store round-trip, track-build-vm-release.test.mjs's two-circuit harness check) and ride here beside the geometry they serve. `coplanar-faces` is the z-fighting ratchet that `clip-audit` structurally cannot see. Runs `--test-concurrency=1` **on purpose** — see below |
| `sweeps-parts` | the parts option-resolution census (`parts-visual-distinctness`) alone — every catalogue option built and compared across worker threads, ~70 s on four cores (559 s single-threaded before the integer grid, the bounding-sphere prefilter and the per-category workers); split out of `sweeps` so the geometry sweeps finish in ~7 min; its own CI job |
| `garage-unit` | the garage and livery files in Node (39 s): the bay's per-vertex material column, sign occlusion, fin design, the front-wing decal, livery decal surfaces + contrast, team livery, setup tune, body split, the option mesh census, helmets. In CI's node step since 2026-09-10 — five of these files had been in NO gate. Out of `tooling-fast` since audit4 E1: CI's node suites run it (a ready PR, the nightly, a dispatch; slice per `SLICE_SCRIPTS`) |
| `desktop-unit` | Electron desktop packaging in Node: stage/version (`1.0.<build>`), `app://` protocol helpers, native SW/Spotify gates, unpacked-bin paths, electron-builder 26 config (NSIS save-data, extraResources `site`, entitlements), third-party notices sources. Not in `tooling-fast` (CI's node suites run it; slice per `SLICE_SCRIPTS`) |
| `steering-unit` | braking CUE math, assist-gated AUDIO DRIVING CUES, the DIGITAL steer ramp, per-scheme touch-dock REPOSITION (`dock-layout`), the PHONE AS CONTROLLER wire, key binds (`key-binds`, `key-binds-ui`, `key-binds-pad-menu`, `key-binds-hunt`, `key-binds-calibration`; VM rig `tests/helpers/key-binds-rig.mjs`), onboard and settings export in Node (0.5 s) — slider 1 is OFF, urgency is 0..1 never a brake command; counter-steering unwinds as fast as letting go. Gated by CI's node step since 2026-09-10 |
| `mobile-unit` | Capacitor Android sideload: frozen `appId`/`androidScheme`, config shape (no `server.url`, minWebView ≥ 100), manifest permissions, Gradle `APEX_VERSION_*` wiring, `sync-web` stamp gate, `Native`/`NativeDownload` against a fake `Capacitor.Plugins` proxy, `SpotifyMusic` under Capacitor (`spotify-native`). In `tooling-fast`. **Not device evidence.** |
| `audio-unit` | Spotify token refresh, announcer pause-silence, radio/voice-pack, rival audio, and sample/tune recovery in a Node VM |
| `agent-contract` | freezes the shape of the agent-view API |
| `net-unit` | the `js/net` wire as pure logic, no browser: loopback transport, invite codec, snapshot quantisation, clock sync. Under a second |
| `lifecycle-unit` | deferred scanner, data fetch and IndexedDB ownership races in Node VMs |
| `state-unit` | season, storage and career state machines, including cross-tab conflicts |
| `service-worker` | the SW's install/fetch/version behaviour; `pack-content-address.test.mjs` — `assets/pack/` files are requested as `?h=<md5>` and answered cache-first, the manifest stays network-first (L3) |
| `graph-parity` | builds each track from a baseline ref AND the working tree and diffs prop geometry vertex for vertex (`tools/track/graph-parity.cjs`) |
| `float` | floating-prop audit (`tools/track/float-audit.cjs`) |
| `clip` | prop-clipping gate (`tools/track/clip-audit.cjs`) |

The `tooling-fast` renderer contracts also include `three-shared-binding-update`
(shared group invalidation and side effects), `webgpu-uint16-index` (mapped bytes
and aligned partial writes), `tlx-mirror-inset` (WGSL/GLSL derivative safety), and
`tlx-smith-root` (generated lamp-root control-flow nesting), `tlx-webgpu-perf` (merged-chunk index
uploads on WebGPU, merged shadow casts and skipped uniform writes, by count), and
`tlx-glow-instancing` (packed light records, instance layout, growth and isolated
warm-probe ownership). `tlx-viewport` covers texture rebinds and post-chain reader
retirement; `tlx-post-orient-cover-webgpu` keeps the phone orientation cover
(#3311) off on three's WebGPU backend, whose target viewport is dropped when it equals the
canvas rect (the stretched-frame iPhone regression); `car-presentation-vm` covers shared/far cache generation and disposal.
These Node checks do not measure device speed or replace rendered validation.

### Partitions (not topical — they do not count for coverage)

| Group | What it runs |
|---|---|
| `render` | the `render` project only (screenshots/pixel/GL) at `--workers=4` |

`test:headless` (`--project=headless`) and `test:update` (`--update-snapshots`)
were dropped on 2026-09-10 — nothing invoked them; pass the flag to `npm test --`
instead. Four node groups whose every file already ran in `tooling-fast` went
the same day: `data-unit`, `parts-unit`, `webgpu-lifecycle`, `generated-docs`.

### Where the old names went (2026-09-01)

`physics`/`collision`/`behaviour`/`debris` → `driving`, split again on 2026-09-09 into `physics-core`/`collisions`/`aero` (below); `api`/`hooks`/`agent`/`map`/`paths`
→ `hooks`; `circuit`/`foundation`/`scenery` → `circuits`; `parts` → `car`;
`steering`/`camera` → `input`; `audio` → `ui`; `webgl`/`ab`/`tlx` → `gfx`;
`fast` (a curated cross-group subset that double-ran nine specs) is gone —
`pick-tests` names the group, `select-specs` names the spec.

---

## 3. Infrastructure

### Two projects, not one

`playwright.config.js` splits the suite into a **`headless`** project
(physics/geometry/hook/data specs — no GPU, scales wide) and a **`render`**
project (screenshot/pixel-diff/GL/DOM-visibility specs, listed in
`RENDER_SPECS`, capped at `--workers=4` because SwiftShader renders on the CPU
and thrashes past ~4-6 concurrent renderers). The old single `chromium` project
is gone — filter with `--project=headless` or `--project=render`.

`RENDER_SPECS` is the partition: the headless project is "everything NOT in that
list", so a name in it that matches no file silently drops a GL spec into the
wide pool. `tests/unit/test-groups.test.mjs` catches that.

### Server lifecycle

The npm wrapper (`tools/ci/run-playwright.mjs`) starts an in-process static server
on a free ephemeral port, passes that port to Playwright, and closes it when the
child exits. Independent npm test commands therefore share neither a server nor
an output directory.

Direct `npx playwright test` defaults to port 3456 and lets Playwright start its
configured Python server. A direct local run may reuse an already-running
server; explicit `APEX_PORT` runs own their server unless `APEX_REUSE_SERVER=1`.
`tests/helpers/global-setup.js` pings the port before any spec begins, so a dead server
aborts the run with one clear message instead of dozens of
`net::ERR_CONNECTION_REFUSED`.

**Tests serve `js/` and `css/` straight from the working tree** — do not edit
source while a run is in flight, or its later specs load mixed versions.

### Why the sweeps run serially

`node --test` defaults to a concurrency of CPU-count, and every suite in
`test:sweeps` rebuilds every circuit in the roster (`js/track/circuit-meta.js`) and holds their meshes. Four of those at
once reached 5.4 GB RSS and the kernel OOM-killed the run — which surfaces as a
`SIGKILL` with `exitCode: ~` and no assertion, i.e. it does not look like a test
failure at all. `--test-concurrency=1` on `test:sweeps` is deliberate — and
`test:tooling` inherits it, since its body is now `npm run test:tooling-fast &&
npm run test:sweeps`: the sweep suites already saturate the machine one at a
time, so overlapping them buys nothing and costs the whole run.

A browser GROUP runs on CI instead (`node tools/ci/remote-group.mjs <group>`,
time-packed shards on separate runners).

### Output

| Path | Contents |
|---|---|
| `artifacts/report-<port>/` | HTML report |
| `artifacts/test-results-<port>/` | failures, traces, attachments, JUnit |
| `artifacts/galleries-<port>/<suite>/` | screenshots and suite-emitted reports |
| `artifacts/logs/` | background-run and shard logs |

All gitignored. Tracked golden baselines live in `tests/specs/*-snapshots/` and stay
outside these roots — but only ONE suite has any: `menu-baseline.spec.js`
(title/select/garage × desktop/phone-landscape), so `npm run test:baseline`
is a real gate. `tests/manual/tracks-visual.spec.js` has none, so it is PARKED
under `tests/manual/` (playwright `testIgnore`) rather than exposed as a
`test:visual` npm group — a green run of that suite today would assert nothing.
Generating baselines on Linux/SwiftShader is still outstanding; move it back
under `tests/specs/` and add a group only once the snapshot directory exists.

### Fixtures (`tests/helpers/fixtures.js`)

Import `test` and `expect` from `./fixtures.js` instead of `@playwright/test`:

| Fixture | What it provides |
|---|---|
| `context` (auto) | injects `window.__TEST_MODE = true` and the `APEX_LOG` level; mocks all Jolpica + OpenF1 calls with stub JSON so runs are offline and deterministic; starts console capture on every page |
| `pageErrors` | `string[]` of uncaught JS exceptions — assert `toHaveLength(0)` after exercising game logic |
| `consoleLines` | `string[]` of every console line and page error, type-prefixed, favicon noise stripped. Prefer this to a hand-rolled `page.on("console", …)` — the hand-rolled ones drifted into a dozen slightly different filters |
| `racePage` | navigates to `/` and waits for `window.__apex` (`BOOT_MS`, 45 s — see §A boot is 45 s now) |
| `loadTrack` | `loadTrack(id, tod, wx, { headless })` — the goto → wait → `race()` → wait built → `go()` block, with unified timeouts. `headless: true` stops `render()` BEFORE the build and the countdown: a spec that reads hooks and never a pixel otherwise pays a SwiftShader frame per evaluate round trip (projection 145 → 25 s, physics-hotpath 86 → 23 s, both boot timeouts on the deploy gate until then). **Adoption is broad**: most specs import `tests/helpers/fixtures.js` (`node tools/ci/fixture-consumer-audit.mjs` prints the current ratio); the rest still hand-roll a near-identical helper (`load`, `waitReady`, `startRace`, `boot`) and therefore get NO failure attachments. `tools/ci/fixture-consumer-audit.mjs` ratchets the count so it cannot go backwards — migrate a spec, then raise its `FLOOR` |

`tools/ci/fixture-consumer-audit.mjs` enforces the import for the specs that depend
on those guarantees (`audio-smoke`, `smoke`, `f1-track-accuracy`, `ui-audit`).
Other specs may use the base Playwright fixture.

### Node harnesses for unit tests (no browser)

Behaviour beats source text: a unit test that quotes a statement breaks on a
one-token refactor and still passes when the behaviour goes. These load the
REAL module and let a test assert what it does (2026-09 conversion of
`gfx-backend-canary`, `ui-improve-pass`, `perf-try`):

| Harness | What it runs | Use it for |
|---|---|---|
| `tools/lib/game-vm.cjs` `createGame()` | js/game.js + `__apex` on an inert DOM with a recording GLX stub; `pumpFrame()` renders one frame | draw ORDER, cull maths, anything read off `G.frame` / `__apex` |
| `tests/helpers/glx-mock.mjs` `bootGlx()` | js/render/glx/glx.js (+ shaders, glx/ passes) on a Proxy WebGL2 whose every call is recorded (`h.calls`, `h.count(name, pred)`); `h.loseContext()`, `h.answers.getError = …`, `bootGlx({ aniso: true })` | uniform caches, fail-closed guards, cull bookkeeping, light-lane packing, context attributes |
| `tests/helpers/mini-dom.mjs` `makeDom()` | the smallest DOM a js/game UI module needs: attributes, dataset, classList, `focus()` → `activeElement`, a selector matcher for `#id .class tag [attr] :not() :scope >` | MenuNav, SheetShape, CamModes, SettingsNav, Photomode, UiLayers, CssZoom in a VM |
| `tests/helpers/css-rules.mjs` `cssRules()` / `decl()` | a stylesheet as flat rules `{ selector, decls, context }` (at-rules flattened into `context`) | "selector S declares P as V" — order-, whitespace- and comment-proof |
| `tests/helpers/seed-log.mjs` | the real `Log` IIFE into any VM context | every harness above |

Shader text (GLSL/WGSL/TSL), the vendored three bundle, TLX (three.js cannot
load in Node) and the tool scripts stay source pins — matched on
comment-stripped code by identifier and shape, never on whitespace, argument
order or a comment.

#### `vmPage` — the same SPEC file, no browser (spike, 2026-09-16)

`tests/helpers/vm-page.js` is a `page`-shaped adapter over `createGame()`, so
`APEX_VM_PAGE=1 node --test tests/specs/<file>.spec.js` runs an **unmodified**
browser spec. It works because Playwright already forbids closures in
`page.evaluate`: the body is portable as source into the VM's realm. Playwright's
own `expect` imports standalone under `node --test`, so there is one matcher
semantics, not two. `fixtures.js` picks the backend off the env var; with it
unset every spec collects and runs under Playwright exactly as before.

Measured here: `physics-fixes` 2/2 in 22 s against the 110.1 s its own header
records for the browser copy. **A spec leaves the browser gate only through
`ADAPTED`** in `tools/ci/twinned-specs.mjs`, and only with a fidelity mutant:
since 2026-09-22 `twinned-specs.verify()` refuses an `ADAPTED` entry that no row
of `tests/data/mutants.json` names with a test it reddens, because equal test
counts are vacuous when the twin IS the spec. An adapted spec runs in
`test:vm-page` (`tests/unit/adapted-specs.test.mjs`, one child per spec, in CI's
`page-a` / `page-b` slices, on the node-suites schedule above; the train replays the ones its plan dropped in `train-twins`); `partitionArgs` drops its
browser copy locally and `select-specs` skips it on the blocking gate, exactly as
for a hand-written twin. `BROWSER_ONLY` names the specs that are portable by
every static measure and must stay in a browser anyway, with the reason, and
the `twinDebt` ratchet counts what is left. A spec that imports `test` from
`@playwright/test` is invisible to the switch, and moving that import onto the
fixtures changes its browser run too (GLX, tyre wear off): do it only with a
green re-run of the browser copy, in the change that adapts the spec.
A ten-spec cohort put a third of its tests red for three reasons no static scan
sees: in-page DOM driving against an inert DOM, `requestAnimationFrame` in an
evaluate body (no renderer — `render()` throws on the first pump), and
`createGame` settling the boot circuit before it returns, which reddens every
"returns null before a track is loaded" assertion. `understeer-cue` is portable
by every static measure and still goes 0/7: that is the standing proof that a
green eligibility verdict and a green adapter run are different facts.

`node tools/check/vm-portable.mjs` is the eligibility lint (`--json`,
`--portable`, `--blocked`; it prints today's portable / one-line-import / needs-a-browser
split, which is not copied here because the copy drifted). Eligibility, not a recommendation —
an adapted spec is blind to the renderer. Every DOM API the adapter does not
serve throws a NAMED refusal rather than `undefined is not a function`.

### `sharedTest` — one booted page per worker

`tests/helpers/fixtures.js` also exports `sharedTest`, a drop-in replacement for `test`
that boots the page **once per worker** and hands the same page to every test in
the file:

```js
import { sharedTest as test, expect } from "./fixtures.js";
```

Everything `test` gives you, `sharedTest` gives you — the mocks, the console
capture, the failure attachments, `racePage` and `loadTrack` — so switching a
spec over is a one-line import change.

**Why.** Measured on the camera group: 45 tests, 1985 s of test time, and the
*fastest* test took 21.7 s. That floor is not assertion work, it is
`page.goto("/")` plus every boot `<script src>` tag plus WebGL context creation, paid again
for every single test. (When this was measured the suite had 294 `goto("/")` calls in 98 spec
files and none used `beforeAll`.)

**Why it is safe.** `__apex.race(id)` is re-entrant against a live page —
`tests/specs/tracks-walls.spec.js` has always raced through many circuits in ONE page
— so the reload was never required by the app. It was the default `page`
fixture's scope, nothing more.

**What it resets between tests** is deliberately shallow: held input, headless
mode, log level, the frozen flag, the camera, and any open `<dialog>`. It does
**not** rewind settings or `localStorage`, because `GameStore` caches those in
memory and a truthful reset there means a reload — which is the cost being
removed. A spec needing a specific setting must set it.

**WHICH SPECS CAN SHARE — the one question that decides it.** Does the spec
drive MENU SCREENS? Screen state is exactly what the shallow reset cannot
restore: a spec whose helper clicks its way from the main menu starts each test
wherever the previous one left the app, and the element it wants to click is not
there. That failure looks like a 120 s timeout, not an assertion, so it reads as
a hung box rather than a broken precondition.

Count `locator()` calls, **not** `goto()` calls. The tranche below was first
chosen on "zero `localStorage` coupling and a single boot helper", and two specs
that satisfy that criterion had to be reverted — the criterion measures the wrong
thing. Hook, physics and raster specs that reach the app through `__apex` share
happily; UI-flow specs do not — **unless the spec's opener puts the screen
state back itself.** `tests/helpers/shared-page.js` is that opener's toolkit
(2026-09, the parts-*/garage/multiplayer tranche, UNVERIFIED in a browser at
conversion time): `toMenu(page)` walks back to the title through each screen's
own back control (quitToMenu for a race, cs-back, rs-cancel, sel-back,
lobby.cancel), `forgetStored(page, keys)` removes a key from localStorage AND
GameStore's cache (`store.onForeignWrite`), and `pinFreePlay(page, {team,
driver, parts})` re-establishes the boot-default car — the team/driver/FREE
BUILD `let`s in game.js are read from the store ONCE at boot, so a store write
only reaches the game through the handlers that re-read it (`#mb-race`,
`#mb-vs`, the garage TEAM picker — `garageTeam`; `#cs-unlimited` — `freeBuildOff`).
What still cannot share: a test whose subject is a COLD cache (parts-mesh-cache's
eviction counts), one that installs fake GL hooks or a car model it never takes
back (`CarMesh.init`, `__apex.loadCarModel`), and a different document
(carview-parts). Those use `test as freshTest` alongside `sharedTest as test`
in the same file, as tracks-walls.spec.js does. One leak the toolkit cannot
close: `netRoom` (js/game.js) is cleared only by a race start, so a room spec
leaves `#sel-back` routing to the hidden room for the next spec on that worker —
toMenu recovers (cancel, then un-hide the title), `#rs-go` would not.

| Spec | Tests | Verdict |
|---|---|---|
| `agent-view` | 117 | shared — **117/117**, 43 min → 11 min |
| `new-hooks` | 56 | shared — 56/56 |
| `dev-tools` | 56 | shared |
| `camera-driving-hooks` | 26 | shared |
| `headless-api` | 24 | shared — 24/24 |
| `logging` | 6 | shared — 6/6 |
| `career` | 101 | **reverted** — hub/garage flows click through menus |
| `quali` | 20 | **reverted** — `toQuali()` clicks from `#mb-season` |

Three edges that bite when converting a spec:

- **`page.addInitScript()` only applies on the NEXT navigation.** On a shared
  page there is no next navigation, so the injected code never runs. A test that
  needs it must reload explicitly, via a local `bootFresh()` that does
  `goto("/")` and re-waits. Note the second half of that trap: an init script
  seeding `localStorage` establishes a *precondition*, and a shared page carries
  the previous test's keys into it — so the seed must clear what it depends on,
  not merely add to it. `career.spec.js`'s migration test read a stale-but-valid
  save this way and asserted against the wrong object.
- **Camera state is the one that leaked.** `park()` sets `G.frozen`, and
  `view()`/`orbit()`/`cinematic()` install a `G.dbgCam` free-camera that
  outranks the game camera. A raster test after one of those measured 0.5 where
  it wanted >0.7. The reset now calls `freeze(false)` and `camera("chase")`,
  which clears `dbgCam` and restores the default mode in one call.
- **Physics keeps running between round-trips.** `headless(true)` only skips
  RENDERING (`js/agent/apex.js` `headless()`), so a test that sets a value in one
  `evaluate` and reads it in the next is racing the game loop. `setSpeed(55)`
  then `probe()` measured 54.498 against a `toBeCloseTo(…, 1)` tolerance of
  0.05 — latent until the box was loaded enough to stretch the gap. Sample both
  in ONE `evaluate`.

**When NOT to use it.** UI-flow specs, per the rule above; and anything
asserting FIRST-LOAD behaviour — the boot sequence, the service worker, the
shell version guard, PWA install, `localStorage` migrations. Those want a virgin
page, so keep importing `test`. The opt-in is deliberate: this is not a silent
change of meaning for the specs already on the base fixture.

**Telling a real failure from a busy box.** Both present as a 120 s timeout, and
AGENTS.md's standing rule is that a timeout on four cores measures the machine.
The discriminator is a load INVERSION: `career`'s "the garage returns to the hub"
passed in 18.2 s while two Playwright processes fought for the box, then timed
out at 123.9 s when one process had it to itself. Load cannot invert like that,
so the cause is test-order-dependent state. Look for that comparison in the logs
before either blaming or absolving the machine.

### A guard must run where CI runs it

Three guards added in one day passed locally and could not execute in CI at all.
They asserted real things; they just assumed this machine. The guards job checked
out with plain `actions/checkout` — **depth 1** — until 2026-09-22 (it is
`fetch-depth: 0` now, for the ratchet-vs-base step, but every OTHER job is still
shallow and a guard must not assume the history is there), and `artifacts/` is
**gitignored**, so in CI:

- `HEAD~1` does not resolve on a shallow job, nor does any older sha (`git show
  <sha>:file` fails outright, it does not return empty)
- `artifacts/logs/` does not exist, so anything derived from run logs is
  legitimately empty rather than wrong

Both turned the guards job red for an environment fact. The fix is not to delete
the assertion but to pin the same property against something that exists
everywhere — `HEAD` instead of `HEAD~1`, an inline copy of the shape a historical
commit had — and to skip only the half that genuinely needs the missing input,
keeping the rest unconditional.

**Verify it the way CI will run it, before landing:**

```sh
git clone --depth 1 file://$(pwd) /tmp/cisim   # no history, no artifacts/
cd /tmp/cisim && node --test tests/<your-guard>.test.mjs
```

If a guard needs history, the job needs `fetch-depth: 0` — grep `fetch-depth` in `ci.yml` for today's list (the guards
shards, the sweeps jobs, `node-suites` and `select` have it); smoke is depth 1,
so a unit file that reads history skips there.

### Workflow and shader lints (the `lints` job, 2026-10-18)

`node tools/check/workflow-lint.mjs` runs actionlint (with shellcheck) and zizmor over `.github/workflows`;
`node tools/check/shader-validate.mjs` runs glslangValidator over every GLX GLSL ES 3.00 program and naga (advisory) over the WGX
WGSL modules. Both are offline. The binaries come from `bash tools/env/install-lint-bins.sh` (pinned and checksummed: zizmor by
`pip --require-hashes`, actionlint by `go install`, naga by `cargo --locked`, glslang and shellcheck by apt); `--plan` prints
what it would do. **An absent binary SKIPS LOUDLY** (a `SKIP … NOT CHECKED` line naming the install command, exit 0) and fails
under `--require` / `APEX_REQUIRE_LINT_BINS=1`, which the `lints` job in `ci.yml` sets. The unit tests
(`workflow-lint.test.mjs`, `shader-validate.test.mjs`) fail a planted bad workflow/shader (`tests/fixtures/`) and pass the tree;
they are in `tooling-fast`, where they skip loudly because the shards install nothing, and run with the binaries in `lints`.
Suppressions live in `.github/actionlint.yaml`, `.github/zizmor.yml` and inline `# zizmor: ignore[audit] reason` comments; the test
rejects a blanket ignore or a reasonless one. TLX is not checked (TSL node graphs have no static shader stage), and WGSL
authority stays `tools/gfx/wgx-validate.mjs`. Evidence: `docs/notes/SKILL-MCP-SCOUT-2026-10-18.md` §Adopted.

### WebKit leg (iPhone-path proxy) — #2705

Every ordinary browser job and `npm test` project runs Chromium. The phone's
shipped path is three.js WebGL2 on WebKit (JavaScriptCore + ANGLE-Metal), so a
change that only looks green under Chromium/SwiftShader can still break on
Bryce's iPhone. The opt-in `webkit` project is the nearest proxy (its dispatch-only
workflow `webkit-leg.yml` never ran and was deleted 2026-10-27; it proxied TLX WebGL2,
not his TLX WebGPU path):

| piece | what |
|---|---|
| trigger | `npm run test:webkit` by hand — not on any PR or schedule |
| host | macOS (ANGLE-Metal like iOS, no extra packages); Linux needs `npx playwright install --with-deps webkit` |
| project | Playwright `webkit` (`devices["Desktop Safari"]`), gated by `APEX_WEBKIT=1`; `WEBKIT_SPECS` are ignored by `headless` / `render` / `xr-emulated` |
| pins | `apex26.gfxBackend=three`, `apex26.tlxForceGL=1` |
| report | `artifacts/webkit-leg/report.json`: `browser.version()`, boot (`__apex.info().track` + backend), first race frame, short rAF frame-time sample, heap after two race cycles |

**It is a proxy, not the phone.** The WebKit build is whatever the pinned
`@playwright/test` (`package.json`) names in `playwright-core/browsers.json` —
a desktop WebKit, not whatever Safari ships on the phone, and it does not
reproduce iOS thermal or jetsam behaviour. The run prints
`browser.version()` so nobody reads a green tick as "the phone is fine".

**Local install.** On this agent container, `npx playwright install webkit`
downloads but host-library validation fails. Prove Chromium projects are
unchanged locally (`npx playwright test --list` still shows only headless /
render / xr-emulated collecting ordinary specs). A real WebKit run needs a macOS
host: `npm run test:webkit`.

**pass-census under WebKit.** `tools/gfx/pass-census.mjs` launches Chromium via
`tools/lib/harness.mjs` (`launchChromium`) and is not WebKit-capable. The
Playwright WebKit boot above is the proxy leg; extending the harness is out of
scope for #2705.

### Renderer specs on a real GPU (`macos-latest`) — first run 2026-09-03

Every browser job in `ci.yml` ran on `ubuntu-latest`, whose only adapter is
SwiftShader, and the `gfx` group had never been in CI at all. `macos-latest`
reports a hardware Metal adapter on stock flags
(`notes/CI-RENDERING-PERFORMANCE.md` §There IS a real GPU), so the
group has its own job, fed by a path step of `select`:

| job | runner | does |
|---|---|---|
| `select` step "Does this diff touch the renderer?" | ubuntu | (the `renderer-filter` job until 2026-10-15) diffs the PR or the Pages call's `before_sha` against its base; `renderer=true` when the diff touches `js/render/**`, the lighting modules, either playwright config, `tests/helpers/`, or a `test:gfx` spec (list DERIVED from `package.json`). Fail-safe: any unresolvable diff, and every schedule / dispatch run, answers `true`; a draft PR skips the step |
| `renderer-macos` | `macos-latest` | `needs: select`; runs on a Pages call, the nightly, a dispatch with `renderer_macos`, or a ready PR — each only when `renderer` is true (its `if:`); installs the FULL Chromium (`npx playwright install chromium`); runs `tools/gfx/gpu-census.mjs` and FAILS unless `anyHardware === true`; then `npm run test:gfx -- --config=playwright.gpu.config.js --timeout=600000` (the step's `APEX_WORKERS`, `APEX_FAIL_ON_FLAKY`); failure artifacts; `timeout-minutes` a guess until re-timed (the job's comment) |

Two rules the job encodes, both measured by the census:

- **Never `--use-angle=vulkan` on macOS** — it forces ANGLE onto SwiftShader
  and `requestAdapter()` returns null. `playwright.gpu.config.js` is
  `playwright.config.js` minus the `--use-angle=swiftshader` pin plus
  `channel: "chromium"` (the headless shell has no `navigator.gpu`), and it
  throws if any `--use-angle` survives. The shared config is untouched.
- **A software run on a Mac is not a real-GPU run.** The census step gates the
  specs, so a runner-image change that loses the adapter goes red instead of
  quietly becoming a slower ubuntu job.

**It is in the deploy gate when a release changes renderer bytes.** `pages.yml` calls `ci.yml` as a
reusable workflow and `publishable: needs: [verdict, ci]` consumes the AGGREGATE
of every job in it, and `ci-verdict` lists `renderer-macos` in its `needs:`. (The
`verdict` job in front of the call is not a gate: it skips the call when the
commit's tree equals a parent's that already passed ci.yml or pages.yml, so a
PR merge whose base did not move publishes on its PR run's verdict instead of
paying the gate twice — `tools/ci/pages-reuse-verdict.sh`.) A Pages call is
recognised by `inputs.concurrency_key` (a reusable workflow reports the
CALLER's `event_name`, so the key is the reliable signal): the renderer step
diffs against the live commit, and a release whose diff misses the renderer
skips the job, which does not fail the aggregate. The other jobs a Pages call
runs are whatever their own `if:` admits; read them in `ci.yml`, not here. `gpu-census.yml` now
also runs on a staggered nightly cron (`47 5 * * *`, after ci.yml's `17 4 * * *`),
full check, dispatch defaults restated inline because a scheduled run has empty
`inputs`; the nightly skips itself when nothing under `js/render`, `js/lighting`,
`tools/gfx` or `vendor` changed since the last green nightly (unknown → run).
It runs on dispatch (the default route), on the nightly, and on a push of
`.github/gpu-census-request.json` — kept only for the request-only legs (`leg`,
`lf_*`, `lrm_*`; the form is at the 25-input cap), each push request in its own
concurrency group; `macos-latest` by default, a second dispatch on a branch queues
instead of cancelling, each game-check leg
is capped at 6 min, and its Verdict is `tools/gfx/census-verdict.mjs`.
`tests/unit/ci-coverage.test.mjs` pins all of the above.

### Local browser timing lore (retired 2026-11-03)

This file used to carry ~200 lines of measurements from running browser groups
on the 4-core container: the ~1.9× second-worker cost, 80–113 s Playwright
clicks while the game rendered under SwiftShader, 45 s boots, "re-run a timeout
alone before you touch a number", "count the navigations first". Browser tests
run on CI now — `selected` on every PR push, `remote-group.mjs <group>`, the
nightly — on llvmpipe runners whose per-spec timings are measured into
`tests/data/spec-timings.json` (`spec-timings.yml`), and
`tools/ci/select-budget.mjs` sizes every shard from that record. A timeout
there is read against that record, not against this box. The two rules that
outlived the lore: a boot or a click under software rendering costs seconds,
so drive a sequence inside the page (`page.evaluate`) and count `goto`/`reload`
calls before touching a per-test bound; and a bound changes only to fit a
measurement recorded at the line, never to make a run green.

---

### Release train (2026-09-10; on push since 2026-10-16)

`pages.yml` runs on every code push to the deploy branch (prose paths
ignored), on the 6-hourly cron `41 */6 * * *` as a backstop (GitHub's scheduler
runs this repository's crons HOURS late) and on a manual `workflow_dispatch`
= "deploy now". The train takes the tip, gates it once and publishes exactly
that commit; the workflow-level `pages-train-<ref>` group keeps one running
and ONE pending run, and a newer push replaces the pending one, so a merge
burst costs one gate per gate length and the train always takes the newest
tip (GitHub's default `queue: single`; the 2026-10-16 CI/CD review, #2333,
finding 3). From 2026-09-10 to 2026-10-16 a deploy-branch push ran a FAST
tier in `ci.yml` (guards, node suites, census, driving-model, selection in a
no-cancel `ship-fast` group) whose green poked the train, and the train
re-armed itself for a tip that went green mid-run; measured on 2026-10-15/16
that tier reached 38 % of merges (184 pushes, 112 replaced while pending)
and cost 5,587 job-minutes a day for verdicts the train repeated, so the
push starts the train directly and the merge's verdict is the train's
`ci / …` rows (`node tools/ci/ci-watch.mjs --sha <merge sha>` follows them,
or says `superseded` when a newer push replaced the pending train).

`verdict` refuses any branch but `DEPLOY_BRANCH`, reads the live shell's
`apex-sha` (`tools/ci/pages-live-sha.sh`), stops in one slot when the tip is
already live, otherwise hands the live commit to `ci.yml` as `before_sha` (so
the sweeps, smoke and selection filters diff against exactly what is live;
never the push's previous tip, which may be unpublished) and skips the gate
when the tip's tree already has a green run (`tools/ci/pages-reuse-verdict.sh`).
The gate group never cancels: a running gate finishes, the next push waits, a
later push replaces the waiting one. Then `publishable`, `deploy` (exact
artifact, monotonic) and `verify-live` as before. Measured 2026-10-14: the
gate's median is 20.5 min and a gated publish (dispatch to live) 23 min
median, 73 min p90 — queue waits in the 03-08 UTC bursts, not the tests, made
the tail. Re-measured 2026-10-26 (last 40 `pages.yml` runs, system audit): p50
11.9 min, p90 20.4. Re-measured later on 2026-10-26 over 23 trains (CI review, sysaudit 2):
median 19.6 min, p90 26.6; the macOS Metal leg adds a median 9.2 min.

Inside `ci.yml` a Pages call is recognised by its `concurrency_key` (the
caller's event is `push`, `schedule` or `workflow_dispatch` there): the
sweeps and smoke ship filters accept it as a gate with a base, the smoke job
takes the smoke cap (its `timeout-minutes`, not the wide run's) and runs `smoke.spec.js` rather than the nightly's wide
group, and `select` plans against the live commit. `tests/unit/ci-coverage.test.mjs`
pins all of it. "Is my commit live?" is `git merge-base --is-ancestor <sha>
<apex-sha>` against `<meta name="apex-sha">` in the live `index.html`
(deploy-research); `version.json`'s build number says how far behind, not which commit.

### Merge train (concurrent PRs)

No agent merges, and there is no merge queue or one-PR-at-a-time rule: the
flow is skill `steward` §Land ([land.md](../.claude/skills/steward/references/land.md)). A worker flips its PR ready and adds the
`land` label; `land.yml` posts the `gate` commit status (`merge-gate.mjs`) and arms auto-merge. `gate` is the
deploy branch's ONLY ruleset-required check; it requires `CI` green on the
head. `pages.yml`'s concurrency group paces the trains. Before marking
ready, the PR's owner runs `node tools/ci/ready-gate.mjs` (green tooling-fast evidence on the tip: the
CI check-run named `Structural guards` — the aggregator after the
`Structural guards (tooling A)` … `(tooling D)` shards — or a local
full-suite stamp). There is no cap on ready PRs. GitHub bounds the LEGS
(2026-10-15): a PR's `selected` legs each join one of LANES fleet-wide
`concurrency: { group: selected-lane-<n>, queue: max }` groups (the lane is a
field of every matrix row, `tools/ci/select-specs.mjs` LANES, its start
rotated by run number), so at most LANES selected legs run across every
PR at once and the rest wait FIFO without holding a runner or being
cancelled; the train, the nightly and a dispatch get a group of their own
per leg and never wait behind PR work. Smoke has no lane (2026-10-16: one
2.6-min job per run that never failed waited p90 17.5 min behind other PRs'
smoke, the 2026-10-16 CI/CD review note (#2333) finding 6). Sync only as skill `steward` says (CONFLICTING/DIRTY, via `node tools/ci/sync-pr.mjs <branch>`);
never enable auto-update-branch bots or a require-up-to-date protection rule
(`land.yml`'s AUTO-SYNC went with merge-gate's `distance` row on 2026-11-03). `tools/ci/behind-ship.mjs` (at the end of
Structural guards tooling B since 2026-10-15, PR only) prints how far the head is behind
ship and emits a `::warning::` past `WARN_BEHIND` commits; it never fails the job.
Deploy / Pages runs keep their own concurrency groups with
`cancel-in-progress: false` so a publish is never cancelled by a later tick.

### CI aggregator and Selected specs (verdict) (#480 / #507)

The ruleset requires one check, the `gate` commit status from `land.yml`
(§Merge train); `gate`'s ci row then reads the check named exactly `CI`. Any
check read by name must keep a **fixed name**, and matrix job names change per
run. A job skipped by its own `if:` reports **Success** to a required check;
only a workflow skipped by a path/branch filter stays Pending
([GitHub docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)).
Two always-judged checks give the PR verdict fixed names:

- **`CI`** (`ci-verdict` job, #480): aggregates every sibling job via
  `tools/ci/ci-verdict.mjs`, including `selected-verdict` (2026-10-04 — it
  needed only `selected`, so an all-dropped plan passed `CI` while the verdict
  failed). Since 2026-10-10 (R3-CI-HEALTH-2) `selected` itself needs only
  `select`, so the browser legs start as soon as the plan exists instead of
  queueing behind the ~6 min guards shards; `selected-verdict`, `ci-verdict`
  still need `guards`, so a guards red still fails the gate. A needed job skipped by its `if:` is a pass; a needed failure or
  cancel fails the aggregator. `baseline-trial` is advisory (`continue-on-error`) and never fails it.
  It carries the FAILURES of smoke, the sweeps, renderer-macos and xr, not their
  execution: only the `REQUIRE_SUCCESS` set (full-tier PR runs) must have run, and
  the job summary lists which jobs executed vs were skipped (#3507). From 2026-10-15 it was the deploy branch's one required check; since
  2026-10-27 the ruleset requires only `gate` (land.yml), whose ci row requires `CI` green (an owner setting); the twelve-name list before it is in
  `docs/notes/CI-CLOG-SURVEY-2026-10-15.md` §4 C, the settings record in its §8).
- **`Selected specs (verdict)`** (`selected-verdict` job, #507): one fixed
  name for the change-aware gate. `select` must succeed and `selected` must
  pass or skip; a `cancelled`/`failure` rollup with **clean shard junit** is
  **infra-retry** (not a hard fail — PR #1109 run 37493213168: job-cap kill
  after `= run passed`); junit `<failure>`/`<error>` rows still fail
  (`tools/ci/selected-gate-verdict.mjs`). `ci-verdict` defers `selected` to
  this job when it is green. **Any dropped routed spec is a red** on a push
  or PR (2026-10-04; before, `dropped` was read only when `selected` was
  skipped). A Pages call with dropped specs warns rather than fails. A red
  `Structural guards` is no longer repeated here (2026-10-16, CI jobs review:
  9 of 9 guards reds painted four red rows for one cause): this check judges the
  specs and notes the guards state in its reason; `CI` stays red through
  `guards`, and a spec failure is still red whatever guards did. It also
  writes the failing-spec carry-forward once, from every shard's junit. Uses
  `!cancelled()` so a draft→ready cancel does not red the superseded run.

### What runs on PRs versus nightly

| Lane | When | What |
|---|---|---|
| **Draft PR** | `pull_request` + draft (`opened` / `synchronize` / `reopened`) | Fast tier on EVERY push, no opt-in (2026-11-03: the `run-ci` label, the `CI: run` body line, the `labeled`/`edited` triggers, their noise groups and the `Draft push (CI skipped)` notice are retired): Structural guards A–D (ratchets, test:audit, ci-coverage and behind-ship at the end of tooling B) + `Select specs for this change` (node-slice plan, spec selection, ship / renderer / xr path filters in one job since 2026-10-15) + parts census + driving-model (when `select` routes it) + the `selected` browser legs on the draft budget (`BUDGET_MIN` on the select step: ONE budgeted shard plus whatever oversize rows the selector derives, overflow off — `OVERFLOW_SHARDS` 0; `Selected specs (verdict)` WARNS, never reds, on a spec that budget dropped — the ready run's full plan or `remote-group.mjs` runs it). NOT the node slices (decision D1, PR #2560 §6: 0 unique catches on drafts in 40 h). Heavy jobs skipped: geometry sweeps, smoke, staged-boot, real-GPU `renderer-macos`, emulated XR, desktop pack-smoke. The verdict job is named `CI (draft fast tier)`, so its success can never satisfy the required `CI` while the ready-for-review full tier is still running (#2664); on a non-draft PR run `ci-verdict.mjs` also requires `guards-a`…`guards-d`, `guards`, `select`, `smoke` and `staged-boot` to be `success`, not skipped (`REQUIRE_SUCCESS`). |
| **Ready PR** | `pull_request` + not draft / `ready_for_review` | Full tier on the same head: smoke + sweeps (ship filter is a step of `select`), every node-slice name when planned, plus path-gated renderer-macos / xr when the diff reaches them. Desktop pack-smoke is packaging-path-gated (`desktop/**`, `tools/desktop/**`, `desktop.yml` only — not `js/**` / `css/**`). Shares the PR concurrency group with the draft run (`cancel-in-progress: true`) so marking ready cancels the fast run. |

**Check names (GitHub UI)** — fast tier on a **draft** PR or a **deploy-branch push** (`ci.yml` jobs unless noted):

- `Structural guards (tooling A)` … `(tooling D)` (jobs `guards-a` … `guards-d`), `Structural guards` (the ready_for_review reuse question is a step of each job since 2026-10-15, not a `Reuse draft fast-tier?` job)
- `Pure-node unit suites (<slice>)` (the needed legs on a READY PR only — planned by `Select specs for this change`, which replaced `Plan node unit slices` on 2026-10-15; drafts and the Pages train skip them since 2026-10-16, the nightly and a dispatch run every leg)
- `Parts option-resolution census` (job `sweeps-parts`), `Driving model (characterization traces)` (job `driving-model`, when planned). Names as of 2026-10-26: `name:` lines in `ci.yml`
- `Select specs for this change`, `Selected specs (…)` matrix legs when routed, `Selected specs (verdict)`
- `CI` (aggregator `ci-verdict`; skipped jobs count as pass)
- (`Docs guards (prose-tree unit files)` — `docs-guards.yml` — ran on every PR until 2026-10-15; retired, see the `docs-guards` group row)

**Full tier** adds (ready/non-draft PR, Pages train / `workflow_dispatch` with `concurrency_key`, nightly `schedule` where noted):

- `Smoke (page boots, __apex responds)`, `Per-circuit geometry sweeps` (+ four shard legs and roll-up); the ship / renderer / WebXR path questions are steps of `Select specs for this change` (2026-10-15; they were the `Does this diff …?` jobs)
- `Renderer specs on a real GPU (macos-latest, Metal)` when the diff reaches `js/render/**`
- `Emulated VR (IWER / xr-emulated)` when the diff reaches XR paths
- `Pack smoke (ubuntu-latest)` (`desktop.yml`, packaging paths only)
- `Golden menus on a runner (nightly)` (nightly/dispatch only; blocks those runs: ci-verdict needs it)

Heavy jobs use one shared skip expression on deploy pushes and draft PRs (`github.event.pull_request.draft` inside `ci.yml`; `desktop.yml` uses `draft == false`). `ready_for_review` is listed on every `pull_request` trigger so marking ready starts the full tier on the same `head_sha` (draft fast runs may cancel — AGENTS.md rule 8 dedupe).
| **Ship push** | push to deploy branch | Starts `pages.yml` directly (2026-10-16): no ci.yml run of its own. |
| **Pages train** | push / dispatch / cron | Full gate against live `before_sha` (ci.yml called with `concurrency_key`); one running + one pending, the newest push replaces the pending one; never cancelled mid-run. |
| **Nightly** | `ci.yml` schedule `17 4 * * *` (04:17 UTC) | Rotating browser group (`nightly-group.mjs`) instead of smoke-only; renderer / gfx on real GPU; coverage for the specs `select-specs` never picks. `gpu-census.yml` runs on its own staggered cron (`47 5 * * *`, 05:47 UTC) for adapter identity. |

Every `pull_request` workflow uses a per-PR concurrency group with
`cancel-in-progress: true`. Deploy / Pages / import-models / spec-timings do
**not** cancel in-progress runs.

### Flaky tests

The flake procedure — retries, `APEX_FAIL_ON_FLAKY=1`, the quarantine ledger
`tests/data/flaky-quarantine.json`, the daily `flake-tally.yml` detector and the
`base-red` issue — lives in [VERIFICATION.md](VERIFICATION.md) §5 (its one home
since 2026-11-03). CSS-only changes select a one-boot title/touch/pause
reachability smoke and relevant menu goldens; they do not discard the browser plan.

## 4. Philosophy — debug-hooks first

Prefer assertions driven by the `window.__apex` API and geometric/mesh probes
over rendering- or timing-based heuristics.

**Assert behaviour and geometry, not brittle magnitudes.** A threshold like
"speed > 10 after 2 s" goes stale the moment physics is retuned. Prefer
relative/directional checks — "faster on tarmac than on grass", "heading barely
changes off-track with zero steer", "reverses then recovers to forward". The
off-track specs were tightened this way after several thresholds drifted stale.

**Use the deterministic hooks:**

- `obs()` / `act()` / `reset()` — headless control loop
- `seed()` — same seed + same inputs ⇒ same result
- `step()` + `physState()` / `probe()` — physics
- `groundY()` / `Tracks.terrainY()` — rendered-terrain raycast, exact geometry
- `modelDiagnostics()` / `geometryDiagnostics()` — required-model outcomes and finite mesh manifests
- `eyeAt()` / `orbit()` / `view()` — deterministic camera framing for screenshots

**Freeze the render loop before a screenshot, not just the physics.** `park()`/
`freeze()` stop physics; `frame()` in `js/game.js` keeps redrawing every rAF tick
regardless (sky/cloud animation continues on purpose). Under SwiftShader that
redraw never idles, so a `.screenshot()` issued while it is still running queues
behind an endless render loop instead of a quiet compositor — measured on
`tests/specs/smoke.spec.js`'s rendering checks, `headless(true)` after the pose settles
cut solo wall time from 88-96s to 29-32s. `tests/helpers/track-helpers.js`'s visual-regression
capture already does this (`snapCam()` → settle → `headless(true)`); reach for the
same shape rather than raising a test's timeout budget.

**Read the log ring, not the console.** `__apex.logs({ns: "scenery"})` returns
structured records; scraping console text ties a spec to a message's exact
wording and misses anything below the print threshold.

**Legacy specs are coarser heuristics** and are inherently flakier:
`tests/manual/blank-scan.spec.js` (PNG byte-size thresholds — the geometric
`terrain-over-road.spec.js` is the modern successor for the terrain subclass)
and `tracks-visual.spec.js` (per-circuit pixel diff). Keep them; write new
checks against hooks and geometry.

**When a spec fails**, first check whether it is a stale expectation rather than
a regression — confirm by reading the actual hook values.

**A tolerance can be hiding a second measurement.** If a spec settles the sim
before reading (`step()` to let a gearbox pick a gear, a frame or two for a
filter), it is reading the thing it named PLUS whatever those frames did — and
a loose tolerance will absorb the difference silently until something widens the
range being swept.

Measured instance. `sliders.spec.js` › *OVERALL SPEED leaves the dial→gear
mapping identical* jumps to the speed that puts the dial at a target km/h, steps
two frames so the automatic box can choose a gear, and reads gear AND `dashKph`
out of the same `obs()`. Those frames coast, so the car sheds
`COAST_DRAG * 2/60 = 0.2 m/s` first — and `COAST_DRAG` is an absolute force
(deliberately: it is part of what makes low pace forgiving) while `dashKph`
divides by pace. The dial therefore loses `0.2 / pace * 3.6` km/h, which is
1.54 at pace 0.47 and 0.54 at 1.34. Under the old 1..10 pace grid the spread was
0.886 km/h against a `< 1` tolerance; widening the grid to 1..19 took it to
0.998 and the spec went red — for a defect it had been carrying all along.

The fix is never to widen the tolerance. Read the value the test is about at the
moment it is true (here: the dial at the jump) and read the value that needs
settling after the settle (the gear). Two reads from two `obs()` calls, with a
comment saying why they are not one.

### Viewport rules

- Tests that touch `#pm-steer` / `#pm-calib` must use `hasTouch: true` — desktop
  mode adds `body.desktop`, which hides those elements.
- In-race tests must use LANDSCAPE `{width: 844, height: 390}` to avoid the
  `#rotate-device` overlay blocking interaction.

---

## 5. Coverage table


`knowledge-retention.test.mjs` (`test:guards`, ~1 s): `docs/notes/` retention and the
`D-NNN` ledger, per `tools/docs/knowledge-gc.mjs`'s header.

`pit-think-cache.test.mjs` covers lazy per-step AI pit weather/caution reads,
live reads outside the car-loop bracket, tick invalidation and real strategy
decision parity. It runs in the `tooling-fast` Node group without a browser.

The `agent-output` group covers shared presentation levels, literal CLI execution
and retention, MCP protocol/level routing and retrieval, configured launch pins,
and the generated surface catalog. It runs without browsers and is included in
the structural floor; its files are listed in `tests/groups.json`.

The per-file table is generated, so this how-to stays short. What each spec and unit file covers is [`TESTING-COVERAGE.md`](TESTING-COVERAGE.md) (`node tools/docs/gen-coverage-table.mjs`; `--check` is on `npm run gen:check`). A new suite is described by its header comment, or by the note above its path in `tests/groups.json`. Recent unit pins include `layout-tokens.test.mjs` (width-tier tokens, media-query copies and UiScale.layoutOf stay one list), `track-zones.test.mjs` (TrackZones: arc-fraction zones follow a control-polygon edit), `pause-taps.test.mjs` (#3274 painted pause-door floor at UI SIZE 75%), `lighting-sun-scratch.test.mjs` (a weather-blend tick reuses the sun-colour arrays; dawn and sunElev share one scratch direction), `transcripts-cli.test.mjs` (Grok ReadTranscript JSONL streamer: search / export / digest), `shanghai-pudong-horizon.test.mjs` (#3360 multi-km Pudong haze cue), `ui-flows.test.mjs` (the pure half of `tools/ui/flows.mjs`: interaction-flow rows, `--diff` regressions), `sheetshape-orientation.test.mjs` (#5167: the orientation media query, screen.orientation and a visible-again app re-ask body shape with no window resize — the Home Screen landscape launch's missing signal), and `tlx-lite-lab.test.mjs` (B8: `?lab=tlxLite` gives three's WebGL2 leg on a phone the LITE DPR cap, sun map and post opts; without the lab, on WebGPU or a desktop, today's values).

One hook, without loading `docs/DEBUG-HOOKS.md`:

```sh
node tools/shot/agent.mjs help physState
```

The `agent-contract` and `tooling-fast` groups include `free-design-tools.test.mjs`: offline capture containment, gateway routing/ownership, local glTF resource validation, and procedural-room approval gates. These are Node/Python contracts, not rendered UI evidence.
