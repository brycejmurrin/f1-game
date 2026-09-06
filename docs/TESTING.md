# Testing reference

115 root Playwright spec files (`tests/specs/*.spec.js`) + 204 `node --test` unit suites
(`tests/unit/*.test.mjs`, plus one `.test.cjs`). Everything under `tests/manual/` is
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

### Run them in the background. Always.

A foreground Playwright run on this suite blocks the terminal for minutes and
prints nothing you can act on. The default reporter is `tests/helpers/live-reporter.js`:
one timestamped, immediately-flushed line per test start and end, plus a
30-second heartbeat naming everything still in flight — so a piped log is
genuinely tail-able and a hung test is the one with a `> start` line and no end
line. Never let foreground test runs block autonomous workflows; invoke test
suites in the background, inspect logs asynchronously, and continue productive
tasks without waiting.

```sh
node tools/ci/test-bg.mjs smoke api collision   # SEQUENTIAL: one group, then the next
node tools/ci/test-bg.mjs --parallel smoke api  # old concurrent start (core-capped)
tail -f artifacts/logs/smoke.log             # watch one
node tools/ci/test-bg.mjs --status              # what is running / how it ended
node tools/ci/test-bg.mjs --wait                # block until all groups finish
node tools/ci/test-bg.mjs --stop                # kill everything still running
```

Each group gets its own free port, its own `artifacts/report-<port>/` and its
own log, so groups cannot tear down each other's web server and a stall is
attributable to one log rather than to "the run". `WORKERS=1` on a 4-core box (2 above that; `test-bg` picks by core count and refuses to start above loadavg 3) per group is the
default; every worker is a Chromium + SwiftShader process, so total browsers is
groups × workers.

**ONE GROUP AT A TIME on a four-core box.** This line used to read "2-3 groups
is the sweet spot", which contradicted AGENTS.md's "one heavy group is its full
capacity" — and AGENTS.md is the one the measurement supports. Running `tiny` +
`circuit` together is 2 groups × 2 workers = four SwiftShader browsers on four
cores; load reached 16.8 and the batch produced **five failures, four of which
were bare 120 s timeouts** (138 s, 148 s, 153 s, 163 s) with a single genuine
assertion failure among them. Four fabricated failures per real one is not a
sweet spot — and each one reads like a product bug until you check the clock.
`test-bg.mjs`'s cap ALLOWS two groups; that is a ceiling, not a recommendation.
Scale the group count to the cores you actually have.

`tools/ci/test-shards.sh` does the same fan-out but WAITS for the result — use it
in CI or when you genuinely want to block.

### Run the groups your change needs, not all of them

The whole suite is roughly 40 minutes of software rendering. Which groups a
change needs is mechanical, so ask:

```sh
node tools/ci/pick-tests.mjs                 # vs the branch point + working tree
node tools/ci/pick-tests.mjs --staged
node tools/ci/pick-tests.mjs js/car/parts.js # explicit paths
node tools/ci/pick-tests.mjs --bg            # ready-to-paste background command
```

The routing rules live in `RULES` at the top of `tools/ci/pick-tests.mjs` and are
deliberately coarse and biased toward running too much — a rule that is too
narrow is a missed regression, one that is too wide costs 10-40 minutes of
serialized SwiftShader per extra browser group. The cap lives at the RUN, not
the rule: AGENTS.md's verification policy is two browser groups per change,
the rest named as not-run in the PR.
`tests/unit/test-groups.test.mjs` asserts every group they name exists.

When the named group is much bigger than the change, select SPECS instead of
groups — `tools/ci/select-specs.mjs` decomposes the picked groups into spec files
under a time budget and names everything it skipped:

```sh
node tools/ci/select-specs.mjs --since <ref>              # spec list, one per line
node tools/ci/select-specs.mjs --since <ref> --budget-min 15
```

It powers the blocking change-aware CI gate and is just as useful interactively; a
single spec (`npm test -- tests/specs/<file>.spec.js`) is always preferable to
its whole group when the change touches that spec's subject and nothing else.

### The edit loop is Node-only; browser specs run ONCE, at the end

Tests serve `js/` and `css/` from the working tree, so a browser run in
flight forbids source edits — which means the efficient session shape is not
"edit, run browsers, edit, run browsers" but: make ALL the source edits,
verify once, commit — there is no cache bump (`?v=dev`; the deploy stamps the hashes). Re-running browser specs after every
edit buys no additional safety over running them once at the end; it just
serializes the agent behind SwiftShader several times over.

| When | Run |
|---|---|
| in the edit loop | `npm run test:tooling-fast` (~30 s, structural, no browser) |
| track/scenery edit | `node tools/track/verify-track.cjs <id>` (2 s, headless) FIRST |
| once, when the edits are done | `node tools/ci/test-bg.mjs tiny` — page loads, `__apex` responds; if red, nothing else is worth running — then the groups `pick-tests` named (capped at two) |
| before pushing | + `npm run test:sweeps` if you touched geometry |
| single spec | `npm test -- tests/specs/<file>.spec.js` |
| single unit suite | `node --test tests/unit/<file>.test.mjs` |

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
every loaded run). 57 sites under `tools/` still carry a timeout without
polling (run `node tools/check/wait-polling-lint.mjs` for the live census; the 24
that used to live in `layout-audit.mjs` are now in `tools/ui/menu-screens.mjs`) —
fix those as they are touched.
The count is a RATCHET, not a target — `tests/unit/wait-polling.test.mjs` fails
if the population grows, and lowering the ceiling as sites are fixed is the
intended direction. (Count by AST via `tools/check/wait-polling-lint.mjs`. A grep
undercounts the multi-line calls.) The jump from the 319 this file used to
quote is SCOPE, not new debt: the lint walked `tools/` but admitted only
`*.js`, and every tool is `.mjs`/`.cjs`, so its own scan list contributed
nothing until the filter was fixed on 2026-08-13.

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
APEX_LOG=scenery:debug npm test -- tests/specs/props-over-road.spec.js
APEX_LOG=debug node tools/ci/test-bg.mjs circuits
```

Every failure automatically attaches three things (see `tests/helpers/fixtures.js`), and
`live-reporter.js` echoes the tail of each inline:

| Attachment | What it holds |
|---|---|
| `apex-state` | `physState` + `probe` + `timing` + `lightState` + `info` — why the car was where it was |
| `apex-logs` | the `Log` ring buffer: retained diagnostics down to `info`, **including ones never printed** |
| `page-console` | what the page actually said, in order, favicon noise stripped |

---

## 2. Test groups

Run with `npm run test:<group>`. Every group below names an intentional set of
specs; `npm run test:audit` fails if any test file belongs to none of them, and
`tests/unit/test-groups.test.mjs` fails if this table and `package.json` disagree
— or if a spec lands in two topical browser groups (the 2026-09 regroup folded
30 browser groups into 12 with a DISJOINT partition, so `pick-tests` can never
run a spec twice; the 115-spec union was compared file for file before and after).

A browser group is 10-40 minutes of SwiftShader; run ONE at a time through
`tools/ci/test-bg.mjs`, and `tools/ci/select-specs.mjs` for a finer per-spec cut when
the group is much bigger than the change.

**A group is defined once, in `tests/groups.json`.** `package.json`'s `test:*`
scripts and `tools/ci/tooling-fast.mjs`'s file list are GENERATED from it by
`node tools/gen/gen-test-groups.mjs`; `--check` runs on the fast gate, so a
hand-edit to either generated copy fails at once. Adding a group used to mean
three coordinated edits — a script, the `TOOLING_FAST_FILES` array, a row in
this document — with nothing failing at the time if one was missed; the
coverage audit noticed later, or nobody did. It is one edit now.

In that file's `toolingFast` list an entry beginning `//` is a note emitted
verbatim into the generated block: the reasons a given file earns a place in
the edit loop live beside the file they explain, and regenerating must never
eat them.

### Boot (run first, and first to fix)

| Group | What it runs |
|---|---|
| `tiny` | boot-guard, smoke, dev-tools, logging — page loads, `__apex` present, dev hooks respond. The CI push gate runs `smoke` alone; `tiny` is the nightly 4-shard boot group |
| `smoke` | page load + `__apex` available — the one spec the CI push gate runs |
| `audit` | coverage guard — every test file must belong to ≥1 topical group (`tools/ci/test-coverage-audit.mjs`) |
| `pick` | print the groups a change needs (`tools/ci/pick-tests.mjs`) — not a test run |
| `bg` | start groups in the background (`tools/ci/test-bg.mjs`) — not a test run |

### Topical browser groups (disjoint)

| Group | What it runs |
|---|---|
| `driving` | the driving model and everything it hits: physics-characterization, physics-fixes, physics-hotpath, longitudinal, projection, understeer-cue; car-to-car + wall collision, drift, off-track; world-physics, active-aero, aero-zones; the Rapier debris side-world and race control. Union of the old `physics` + `collision` + `behaviour` + `debris`. `physics-characterization` also runs in Node as `game-vm` in seconds — run that first |
| `hooks` | the `__apex` contract end to end: dev-tools, headless, obs/act, data lifecycle, telemetry compare, assets, logging, persistence, the race wake lock, output paths, the map + new hook contracts, and the agent world view (world, trackInfo, scene, rollout, determinism, the drive bench). Union of the old `api` + `hooks` + `agent` + `map` + `paths` |
| `circuits` | walls + autopilot + elevation + the codebase-audit edge cases; the 16 per-circuit foundation specs (`tests/specs/*-foundation.spec.js` — required models present, props clear of the racing surface, terrain grounded, water safe, walls sane); props/terrain over road, F1 track accuracy, scenery kits. Union of the old `circuit` + `foundation` + `scenery`. Routed from `js/circuits/` and the track engine; a one-circuit edit runs `verify-track.cjs <id>` then THAT circuit's foundation spec alone, not this group |
| `car` | catalog, budget, persistence, recipes (inside `parts-physics`), factory presets, mesh caches, liveries, ERS, car effects, the custom team, the car viewer, garage aero (the old `parts`) |
| `input` | presets, sliders, steering modes, gamepad, touch steer, the tilt pipeline, the steer-schema migration; the 13 camera modes, camera + driving hooks, the camera tuner. Union of the old `steering` + `camera` |
| `ui` | UI behaviour and layout: button/touch, resize, UI scale, the redesign, HUD layout + audit, menu survey + keyboard (slow), rotation recovery; WebAudio engine/sfx smoke + the music library (the old `ui` + `audio`) |
| `modes` | season, time trial, career, qualifying |
| `net` | multiplayer in a browser: car roles, the per-car input seam, the session, the lobby, the waiting room, seats, N-peer, and the camera SCAN plus its cancel path (a real `getUserMedia` against a Y4M of a real QR that Chromium plays as a webcam) |
| `gfx` | instanced draw, GL capability probes, the lighting A/B pixel comparison, image grade, the lighting-tuner grade, the three.js/TSL backend probes. Union of the old `webgl` + `ab` + `tlx`. The one browser group CI runs on a REAL GPU: `ci.yml`'s `renderer-macos` job (`macos-latest`, Metal) runs `test:gfx` when a diff touches `js/render/**` or the lighting modules, nightly, and on dispatch — outside the deploy gate, see §Renderer specs on a real GPU below |
| `webgpu-lifecycle` | WGX/TLX resource and software-present lifecycle, as a pure unit suite |
| `baseline` | six blessed pixel baselines for menu IDENTITY — colour, type, spacing (fast) |
| `shimmer` | does baked tarmac crawl under motion |
| `gallery` | `ui-audit.spec.js` alone — a CAPTURE HARNESS whose product is a PNG gallery, run **on demand**. It asserts nothing beyond "the screen appeared", so its 39 green ticks were being counted as `ui` coverage while dominating that group's wall time (13-108 s per shot). No `pick-tests` rule routes to it: galleries are run on purpose, like `tests/manual/`. `test:audit` still sees it, so it cannot go orphan |

### Node groups (`node --test`, no browser)

| Group | What it runs |
|---|---|
| `tooling-fast` | the structural half in ~30 s — **one file at a time** via `tools/ci/tooling-fast.mjs` (`--test-concurrency=1`) with START/PASS/FAIL + `not ok` names on stdout and `artifacts/logs/tooling-fast-suite.log`. Load order, docs integrity, test groups, api contracts, css layer discipline, graph, validators. The full-fleet sweeps dominate `tooling`; this is everything else, for the edit loop |
| `tooling` | every Node contract suite — chains `test:tooling-fast` then `test:sweeps` (the sweeps run `--test-concurrency=1`, see below) |
| `game-vm` | the Node VM game harness (`game-vm.test.mjs`), the friend-race quali handoff (`quali-handoff-vm`), physics parity (`physics-characterization-vm`) and the thirteen `*-vm.test.mjs` TWINS of the JSON-only browser specs — `headless-api`, `obs-act-edge`, `longitudinal`, `world-physics`, `drift`, `active-aero`, `aero-zones`, `offtrack`, `elevation-tracks`, `collisions`, `collisions-deep`, `collision-ai-fixes`, `new-hooks` — same assertions and thresholds, one boot per file, ~1 s a circuit build. ~3 min for the set (elevation-tracks builds 40 circuits and is ~2 min of it alone; the rest are 2–30 s each); in CI's node suites, which the Pages gate runs unconditionally. **Twelve of those browser specs no longer run on the blocking gate** — `tools/ci/twinned-specs.mjs` lists the pairs and holds the drift check that keeps the substitution honest (equal declared test counts, and the twin's group must still be gated, derived from ci.yml). They still run in their own group on the nightly. `new-hooks` is NOT among them: its Madrid foundation test is deliberately unported |
| `mcp` | the CLI-only MCP wrappers (`tinyfish-mcp`, `probe-mcp`) plus `.cursor/environment.json` bootstrap pins: spawn-heavy, off the edit loop; their fast-gate half is `mcp-cli.test.mjs` — CI's node suites always, locally when touching `tools/*-mcp.*` or `.cursor/environment.json` |
| `node-slow` | the three raster/spawn-heavy car files (`cockpit-pale-surfaces`, `crest-marks`, `slider-effect`; 152 s of the old 315 s loop) — CI guards always, locally when pick-tests names it |
| `sweeps` | the full-fleet geometry audits — prop-clipping, lamp-fixture-anchor, scenery-grounding, road-under-floor, coplanar-faces, debris-hazard-hint, spline-project-height, the shared-foundation characterization, car-front-wing-width and grid-boxes (10 files — `package.json` `test:sweeps` is the list). Each rebuilds circuits through `tools/lib/track-build-vm.cjs`; `coplanar-faces` is the z-fighting ratchet that `clip-audit` structurally cannot see. Runs `--test-concurrency=1` **on purpose** — see below |
| `sweeps-parts` | the 559 s parts option-resolution census (`parts-visual-distinctness`) alone — split out of `sweeps` so the geometry sweeps finish in ~7 min; its own CI job |
| `generated-docs` | freshness of the generated tools index, slider table and hook index (`npm run gen:docs` regenerates) |
| `parts-unit` | the catalog LADDER in Node — no paid option dominated by a cheaper one, no row that is never optimal at any price (bar the two wet compounds), no flat category stat, and a career budget cap that clears the dearest works car without reaching the top shelf |
| `garage-unit` | the garage bay's per-vertex material column — present, right length, and not uniformly FLAT |
| `steering-unit` | braking CUE math and the DIGITAL steer ramp in Node — slider 1 is OFF, urgency is 0..1 never a brake command; counter-steering unwinds as fast as letting go |
| `audio-unit` | Spotify token refresh ownership, rotation races, and retryable failures in a Node VM |
| `data-unit` | the data hub's RESULTS tab over OpenF1's `session_result` — one endpoint whose `duration`/`gap_to_leader` are scalars for practice, sprint and race and `[Q1,Q2,Q3]` arrays for qualifying |
| `agent-contract` | freezes the shape of the agent-view API |
| `net-unit` | the `js/net` wire as pure logic, no browser: loopback transport, invite codec, snapshot quantisation, clock sync. Under a second |
| `lifecycle-unit` | deferred scanner, data fetch and IndexedDB ownership races in Node VMs |
| `state-unit` | season, storage and career state machines, including cross-tab conflicts |
| `service-worker` | the SW's install/fetch/version behaviour |
| `graph-parity` | builds each track from a baseline ref AND the working tree and diffs prop geometry vertex for vertex (`tools/track/graph-parity.cjs`) |
| `float` | floating-prop audit (`tools/track/float-audit.cjs`) |
| `clip` | prop-clipping gate (`tools/track/clip-audit.cjs`) |

### Partitions (not topical — they do not count for coverage)

| Group | What it runs |
|---|---|
| `headless` | the whole `headless` project (all non-render specs, no GPU) |
| `render` | the `render` project only (screenshots/pixel/GL) at `--workers=4` |
| `update` | the whole suite with `--update-snapshots` |

### Where the old names went (2026-09-01)

`physics`/`collision`/`behaviour`/`debris` → `driving`; `api`/`hooks`/`agent`/`map`/`paths`
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
`test:sweeps` rebuilds all 40 circuits and holds their meshes. Four of those at
once reached 5.4 GB RSS and the kernel OOM-killed the run — which surfaces as a
`SIGKILL` with `exitCode: ~` and no assertion, i.e. it does not look like a test
failure at all. `--test-concurrency=1` on `test:sweeps` is deliberate — and
`test:tooling` inherits it, since its body is now `npm run test:tooling-fast &&
npm run test:sweeps`: the sweep suites already saturate the machine one at a
time, so overlapping them buys nothing and costs the whole run.

Run several GROUPS concurrently instead (`tools/ci/test-bg.mjs`) — those are
separate processes with separate ports, and the sizing guidance above applies.

### Output

| Path | Contents |
|---|---|
| `artifacts/report-<port>/` | HTML report |
| `artifacts/test-results-<port>/` | failures, traces, attachments, JUnit |
| `artifacts/galleries-<port>/<suite>/` | screenshots and suite-emitted reports |
| `artifacts/logs/` | background-run and shard logs |

All gitignored. Tracked golden baselines live in `tests/specs/*-snapshots/` and stay
outside these roots — but only ONE suite has any: `menu-baseline.spec.js` has
six (title/select/garage × desktop/phone-landscape), so `npm run test:baseline`
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
| `loadTrack` | `loadTrack(id, tod, wx, { headless })` — the goto → wait → `race()` → wait built → `go()` block, with unified timeouts. `headless: true` stops `render()` BEFORE the build and the countdown: a spec that reads hooks and never a pixel otherwise pays a SwiftShader frame per evaluate round trip (projection 145 → 25 s, physics-hotpath 86 → 23 s, both boot timeouts on the deploy gate until then). **Adoption is broad**: 110 of 115 specs import `tests/helpers/fixtures.js`; the rest still hand-roll a near-identical helper (`load`, `waitReady`, `startRace`, `boot`) and therefore get NO failure attachments. `tools/ci/fixture-consumer-audit.mjs` ratchets the count so it cannot go backwards — migrate a spec, then raise its `FLOOR` |

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
`page.goto("/")` plus ~155 script tags plus WebGL context creation, paid again
for every single test. Across the suite that is 294 `goto("/")` calls in 98 spec
files, and not one of them used `beforeAll`.

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
| `camera-driving-hooks` | 25 | shared |
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
They asserted real things; they just assumed this machine. The guards job checks
out with plain `actions/checkout@v4` — **depth 1** — and `artifacts/` is
**gitignored**, so in CI:

- `HEAD~1` does not resolve, nor does any older sha (`git show <sha>:file` fails
  outright, it does not return empty)
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

If a guard needs history, the job needs `fetch-depth: 0` — today the sweeps,
smoke and selected jobs have it; guards does not, which is also why
`pick-tests`' merge-base default cannot work in the guards job.

### Renderer specs on a real GPU (`macos-latest`) — first run 2026-09-03 (see §Field notes 2026-09-03, `image-grade-visual`)

Every browser job in `ci.yml` ran on `ubuntu-latest`, whose only adapter is
SwiftShader, and the `gfx` group had never been in CI at all. `macos-latest`
reports a hardware Metal adapter on stock flags
(`notes/CI-RENDERING-PERFORMANCE.md` §There IS a real GPU), so the
group has its own job pair:

| job | runner | does |
|---|---|---|
| `renderer-filter` | ubuntu | fetch-depth 0; diffs the push/PR against its base; `renderer=true` when the diff touches `js/render/**`, `js/game/lighting*.js`, `track-lights.js`, `frame-lights.js`, `light-presets.js`, `atmosphere.js`, `tuner.js`, either playwright config, `tests/helpers/`, `ci.yml`, or a `test:gfx` spec (list DERIVED from `package.json`). Fail-safe: any unresolvable diff, and every schedule / dispatch run, answers `true` |
| `renderer-macos` | `macos-latest` | `needs: renderer-filter`; installs the FULL Chromium (`npx playwright install chromium`, cached at `~/Library/Caches/ms-playwright`); runs `tools/gfx/gpu-census.mjs` and FAILS unless `anyHardware === true`; then `npm run test:gfx -- --config=playwright.gpu.config.js --timeout=600000` at `APEX_WORKERS=2`; failure artifacts; `timeout-minutes: 30` (a guess — re-time on the first green run) |

Two rules the job encodes, both measured by the census:

- **Never `--use-angle=vulkan` on macOS** — it forces ANGLE onto SwiftShader
  and `requestAdapter()` returns null. `playwright.gpu.config.js` is
  `playwright.config.js` minus the `--use-angle=swiftshader` pin plus
  `channel: "chromium"` (the headless shell has no `navigator.gpu`), and it
  throws if any `--use-angle` survives. The shared config is untouched.
- **A software run on a Mac is not a real-GPU run.** The census step gates the
  specs, so a runner-image change that loses the adapter goes red instead of
  quietly becoming a slower ubuntu job.

**It is NOT in the deploy gate, on purpose.** `pages.yml` calls `ci.yml` as a
reusable workflow and `current-tip: needs: ci` consumes the AGGREGATE of every
job in it — there is no `needs:` list to leave a job out of. So the filter job
carries `if: !inputs.concurrency_key && github.event_name != 'workflow_call'`
(pages.yml always forwards `concurrency_key`; a reusable workflow reports the
CALLER's `event_name`, so the key is the reliable signal) and both jobs are
skipped on a Pages call, which does not fail the aggregate. The gate stays
guards + conditional sweeps + smoke.spec.js in four shards + driving-model
(`notes/PROCESS-SPEEDUP-2026-09.md` §4.5); promoting the renderer job into it once it
has a measured green history is deleting that one `if:`. `gpu-census.yml` now
also runs on the same nightly cron (`17 3 * * *`), full check, dispatch
defaults restated inline because a scheduled run has empty `inputs`.
`tests/unit/ci-coverage.test.mjs` pins all of the above.

### Never run two Playwright processes at once

`playwright.config.js` sets `reuseExistingServer` for local runs, so a second
`playwright test` process does **not** start its own `python3 -m http.server` —
it attaches to the one the first process owns. Kill the first run and the second
loses its server mid-flight: every remaining test dies with
`net::ERR_CONNECTION_REFUSED`, which reads like a product failure and is not one.
(Measured: 33 consecutive false failures in `career.spec.js` from exactly this.)

It is also pointless on a 4-core box — two processes with 3 workers each is five
renderers fighting for four cores, and load went past 20. If you want more specs
covered at once, pass them all to **one** process and raise `APEX_WORKERS`:

```sh
APEX_WORKERS=3 npx playwright test tests/a.spec.js tests/b.spec.js
```

### The second worker costs ~1.9x per test — so a 120 s budget is ~65 s of work

Not an estimate. Two tests ran SOLO and again inside their group on the same box
and the same commit, 2026-08-07:

| test | solo (1 worker) | in group (2 workers) | ratio |
|---|---|---|---|
| `tlx-probes` M6 skid | 49.0 s | 80.9 s | **1.65x** |
| `tlx-probes` M9 env | 72 s | 149.9 s | **2.08x** |

`ci.yml` had already measured the same effect from the other direction — `speed
readout updates after jump()` timed out at 125.2 s with a second worker busy and
passed at 110.6 s once alone — and that is why the CI smoke job pins
`APEX_WORKERS: 1`.

**The consequence is that every declared budget means roughly half what it
says.** The default 120 s timeout admits about 65 s of solo work at two workers.
A test written and timed alone will time out in its own group without anything
being wrong with it.

So: **a timeout from a group run is a measurement of the box, not a verdict on
the test.** Re-run it alone before you touch a number.

### The factor predicts the VERDICT, not the duration

That was put to the test. Six tests timed out across the 2026-08-07 burndown,
every one a bare `Test timeout` with no assertion reached. The prediction — all
six pass solo, unchanged — was written down before the runs. It held 6/6. The
*durations* did not:

| test | contended | predicted | solo | ratio |
|---|---|---|---|---|
| wheel mesh cache | 371 s | 195 s | **198 s** | 1.87 |
| budget persists on reload | 155 s | 82 s | **72 s** | 2.15 |
| ERS deploy/recovery | 137 s | 72 s | **108 s** | 1.27 |
| carview effect API | 130 s | 68 s | **12.7 s** | **10.2** |
| career determinism | 157 s | 83 s | **56.4 s** | 2.78 |
| lighting-tuner grading | >120 s | 63 s | **120 s** | ~1.0 |

**Do not quote 1.9x as if it forecast a runtime.** The spread is 1.0x to 10.2x.
`carview` at 12.7 s solo against 130 s contended is not proportional slowdown at
all — a test waiting on a synchronized frame plausibly waits on something that
never arrives when the box is saturated, rather than running ten times slower.
Use the factor to decide whether a timeout is worth investigating; use a
measurement to set a budget.

**And read the other end of the table.** `lighting-tuner-grade` passed at 120 s
against a 120 s budget on a QUIET box at load 2.72 — no headroom alone, let
alone in a group. Six timeouts, five of them pure contention and one a genuinely
undersized budget. "Re-run it alone" is what tells them apart; without it the
right answer for five of them would have been indistinguishable from the right
answer for the sixth.

### When a timeout survives the solo run, count the navigations

The rule above tells you a group-run timeout is not a verdict. The corollary is
what to do when the solo run agrees with the group: the cost is the test's own,
and a bigger budget is almost never the fix. Measured on the parts group,
2026-08-30, going from 11 failures to 0:

| test | before | after | what changed |
|---|---|---|---|
| `parts-budget` (5 tests over) | 125-169 s | 13-116 s | `#mb-garage` instead of `mb-race` -> `select` -> `sel-go`; `addInitScript` instead of a boot-and-reload for clean storage |
| `parts-mesh-cache` eviction | 366 s (own 360 s budget) | passes | stopped building nine tracks it then threw away |
| `parts-physics` ERS deploy/recovery | 126.0 s solo | **90.0 s** | one boot to learn the team id instead of one per loop pass — six navigations for three measurements became four |
| whole `test:parts` group (now `test:car`) | ~2.5 h | **1 h 55 m** | the above |

Every one of those was a navigation the assertion did not need. **A boot on this
box is 11-22 s, so counting `goto`/`reload` calls is the highest-yield thing you
can do to a slow spec** — start there before you look at the work the test
actually does, and long before you touch a budget.

The exception proves it. `parts-budget`'s "budget label gets 'over' class" still
carries `test.setTimeout(240_000)`, because its four part swaps are the
ARITHMETIC minimum against the 780 cap (230 + 210 + 210 = 650, so only the
fourth crosses) and each swap rebuilds the car mesh. Raise a budget when you can
show the work is irreducible, and write the arithmetic down where the next
reader will look for the waste.

One trap on the way: the ERS test's per-pass `reload` looks like the same
redundancy and is not. `store` (`js/core/store.js`) caches every key it has
read, so seeding `localStorage` without a reload leaves the game answering from
`_cache` — all three passes would measure the same setup and every assertion
would still pass.

**These two notes agree, and the order matters.** Count the navigations FIRST:
a boot is 11-22 s and most slow specs are paying for work no assertion needs.
Only once the work is irreducible is a budget the honest answer — and then it
has to come from a measurement, which is what the note below is.

### A Playwright click costs 80-113 s while the game renders, and 0.3-0.6 s while it does not (2026-08-30)

The `webgl` group was 15 red of 32. Twelve of those were undersized budgets. The
last three were all `lighting-tuner-grade`, and they were not slow tests — they
were tests paying a toll nobody had priced. Measured with ONE browser and
nothing else on the box (`scratch/tuner/cost-probe.mjs`), clicking real ids in
the order the spec clicked them:

| click | game state | cost |
|---|---|---|
| `#pausebtn` | racing | **85031 ms** |
| `#pm-settings` | paused, tuner shut | **469 ms** |
| settings index door (was `#pm-tab-more`) | paused, tuner shut | 585 ms |
| `#pm-lighting` | paused, tuner shut | 281 ms |
| `IMAGE & COLOUR` tab | tuner open | **82928 ms** |
| `#lt-tod-dusk` | tuner open | 113385 ms |
| `#lt-wx-wet` | tuner open | 106181 ms |
| `#lt-spread-edits` (Playwright) | tuner open | **82344 ms** |
| `#lt-spread-edits` (dispatched) | tuner open | **7162 ms** |

**A click is expensive exactly while the game is rendering, and only then.**
`js/game.js` returns early from the paused frame unless the lighting or camera
tuner is open (the live-preview branch), which is why the middle of that walk is
three orders of magnitude cheaper than either end. **It is not the rAF rate** —
the obvious explanation, and wrong: rAF stayed 0.12-0.27/s throughout and was
*lowest* (0.13) on the cheap clicks. It is main-thread occupancy. A SwiftShader
frame holds the thread for seconds and Playwright's stability and hit-target
checks run on that same thread, so `element.click()` returns in 7 s where
`locator.click()` takes 82 s — an 11.5x difference on the same button in the
same state.

**The second-order consequence is worse than the slowness: it makes assertions
vacuous.** `#lt-spread-edits` arms on the first click and holds that state on a
wall-clock `setTimeout(ltDisarm, 20000)`. A single `locator.textContent()` round
trip measured 9655 ms, so a click-then-read pair spends ~19 s of a 20 s window
before the answer comes back — which is why the spec asserted `/^COPY TO \d+\?$/`
and read `"MY EDITS"`, and read it as a functional bug in the chip. It was a
chip that had already timed out. And the neighbouring test asserted that
switching the previewed condition DISARMS the chip by clicking `#lt-tod-night`
between the two reads — a click that costs 113 s, so the arm timer cleared the
chip on its own and the assertion would have held with the disarm-on-switch
behaviour deleted.

The cure is to drive the sequence inside the page (`page.evaluate`), which is
atomic with respect to that timer and runs the real handler on the real DOM,
and to leave clickability to the specs whose subject it is (`ui-button-touch`,
`menu-survey`, `ui-redesign` — all three already use the dispatched idiom for
this exact walk). Raising the timeout is the move that does NOT work here: the
state being asserted is gone by the time any longer wait expires.

**Two things that dispatching then exposed, both worth keeping.**

`waitForSelector` and `expect(locator).toBeVisible()` are NOT the cheap
alternatives they look like. `page.waitForSelector("#pausebtn:not([hidden])")`
timed out after 45 s having already logged *"locator resolved to visible"* —
its visibility check polls the same held main thread a click does. A
`waitForFunction` reading `el.hidden` at `{ polling: 100 }` is the cheap form,
and it is what `ui-redesign` already uses.

**And a slow walk can pay a dependency by accident.** `js/game.js`
`syncSettingsAvailability()` disables `#pm-lighting` unless `state === "race"`,
while `__apex.race()` starts in the COUNTDOWN state. The old walk never called
`go()`; it simply spent 85 s inside its first click, and the countdown ran out
while Playwright waited. Dispatching made the walk instant, the countdown was
still running, `#pm-lighting` was disabled — and **a disabled button's
`.click()` fires no handler and throws nothing**, so the panel silently never
opened and five tests failed on a hidden `#lighting` with no other clue. When a
test is made faster, look for the setup it was buying with its own slowness.

### A boot is 45 s now, not 11-22 s — A/B the tree before blaming the change (2026-09-01)

`parts-physics.spec.js` went from green to **70 of 70 red**, every one of them
`waitForFunction: Timeout 8000ms exceeded` inside the spec's own `load()`, each
burning 42-57 s to report it. The tree had just taken two large deploy merges
plus a car-geometry pass, so the obvious reading was a boot regression from one
of them. It was neither.

What the measurement said, on an idle 4-core box (loadavg ~1.0):

| probe | result |
|---|---|
| `python3 -m http.server`, 20 sequential GETs | 139 ms total — **7 ms/request**, not the bottleneck |
| HEAD: `goto("/")` → `Parts` defined | 24.5 s → **47.2 s** |
| worktree at the pre-merge SHA, same box, same minute | 18.7 s → **48.8 s** |

The pre-merge lineage was *slower*. Nothing regressed: 156 deferred script tags
and 3.5 MiB of JS simply cost Chromium ~45 s to parse and execute here, and the
8 s bound had always been riding on a faster box. `tooling-fast` was 121/121
green throughout, which is the tell that the tree is structurally fine and the
bound is the problem.

**Two rules from this.** First: when a whole spec file dies at the same helper,
that is a bound, not a verdict — check the FIRST failure's message before
believing a diagnosis. Second: the cheap A/B is a `git worktree` at the
pre-change SHA measured *in the same minute on the same box*, because the
alternative — comparing against a number someone recorded on a different day —
is what makes a machine slowdown look like a code regression. A boot bound is
not an assertion tolerance: raising it only ever permits a slower page, never a
looser measurement, so raise it to fit the measurement and record the numbers at
the line.

---

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

Every file below is asserted present in this table by
`tests/unit/test-groups.test.mjs` — a new spec fails the tooling suite until it says
what it covers.

### Boot, API & agent surface

| Spec | What it covers |
|---|---|
| `smoke.spec.js` | page loads, `__apex` available, race starts, no WebGL error |
| `dev-tools.spec.js` | the `__apex` API contract (60+ tests) |
| `headless-api.spec.js` | the headless control loop: `headless()`, `obs()`, `act()`, `reset()` |
| `obs-act-edge.spec.js` | edge cases: `act(n=0)`, `reset(0.999)` lap seam, scan wrap-around, `done` semantics, numeric stability |
| `new-hooks.spec.js` | timing/field/energy hooks plus `modelDiagnostics()` / `geometryDiagnostics()` and day/night model manifests |
| `agent-view.spec.js` | the agent world view: `world`, `trackInfo`, `scene`, `describe`, `query`, typed errors |
| `agent-drive-bench.spec.js` | task-success benchmark — can a policy driven off the world view actually drive |
| `agent-determinism.spec.js` | same seed + same inputs ⇒ same result |
| `agentview-api-contract.test.mjs` | freezes the shape of the agent-view API |
| `assets-api.spec.js` | the baked asset pack's runtime path, and that every failure degrades to procedural |
| `logging.spec.js` | `js/core/log.js` in a real page: `Log` live before any game module evaluates, retention never lagging the console level, single namespace prefix, records flattened rather than holding references, `logs()` filters, a bad spec ignored not thrown |
| `persistence.spec.js` | localStorage failing is REPORTED (Log + `persistState()`) and the session still reads back what it wrote — the silent-data-loss case: iOS Private Browsing sets the quota to 0 |
| `wake-lock.spec.js` | the screen wake lock held for the duration of a race: requested on start, released on finish and on a mid-race quit (no results screen), released on hide and re-acquired on return, and degrades silently when the API is missing or its request rejects |

### Physics & behaviour

| Spec | What it covers |
|---|---|
| `world-physics.spec.js` | the player integrates a bicycle model in WORLD space; `(s, x)` is read back, not authoritative |
| `physics-fixes.spec.js` | the physics/collision robustness pass |
| `physics-hotpath.spec.js` | leftover AiDrive ctx literals in `updateCar` stay pooled — wraps the eight helpers and asserts the same scratch object is reused across steps |
| `longitudinal.spec.js` | longitudinal + grip physics and full-lap progress |
| `physics-characterization.spec.js` | CHARACTERIZATION of the driving model against a committed baseline — asserts the numbers did not move, not that they are right. Live gate against `tests/data/physics-baseline.json`; regenerate with `APEX_UPDATE_BASELINE=1` and read the diff |
| `projection.spec.js` | world↔track (Frenet) projection continuity — no lap-distance teleport near hairpins |
| `elevation-tracks.spec.js` | slope gravity, banking grip, road-follow on graded circuits |
| `steering.spec.js` | the player heading model in `updateCar` |
| `drift.spec.js` | the dynamic single-track tyre model — per-axle slip-angle forces |
| `collisions.spec.js`, `collisions-deep.spec.js` | car-to-car in Frenet space; driver↔AI, driver↔wall, kerbs |
| `collision-ai-fixes.spec.js` | the June 2026 audit: wrong-way hysteresis, `wallT` on open circuits, rear-end `contactT`, 10-car pack separation, AI banking grip, Jeddah barriers |
| `offtrack.spec.js` | off-track, reversing, wrong-way, auto-rescue, and the prog↔s seam |
| `audit.spec.js` | edge cases from the codebase audit the other suites missed |
| `active-aero.spec.js` | X-mode / Z-mode: flap travel, the downforce/drag trade, the 400 ms transition cap |
| `aero-zones.spec.js` | fixed ACTIVATION ZONES per circuit, Monaco having none, and the overtake gate on lap 1 / under caution driven through a REAL opening lap |
| `aero-zones-turns.test.mjs` | `AERO_ZONE_TURNS` (`js/physics/aero-zones.js`) reproduces exactly the length-only `ZONE_COUNT` selection in turn-keyed form for every named circuit; bahrain/jeddah never get a turn-pair entry |
| `debris.spec.js` | the Rapier debris side-world — and that it never moves a game car |
| `race-control.spec.js` | the CAUTION layer in a real page: defaults ON, and the setting survives a reload (which is the guard on its storage format). The machine itself is `race-control.test.mjs` |
| `autopilot.spec.js` | a closed-loop driver that actually completes laps (monza, suzuka) |
| `presets.spec.js` | RELAX / STANDARD / PRO each push the sliders somewhere distinct |
| `sliders.spec.js` | every pause-menu slider is wired and persists |
| `touch-steer.spec.js` | canvas touch steering as an anchored DRAG (proportional, relative, ramped on release, most-recently-MOVED finger wins), the on-screen arrows ramping like a key, and pedal TRAVEL on the touch pedals reaching the physics |
| `tilt-pipeline.spec.js` | the tilt chain end to end — dead zone (subtracted, so no step at its edge), the `MAX_TILT` map and its `steerToTilt` inverse, the 1.6x release/tighten slew asymmetry, calibrating out a held grip offset, One-Euro smoothing as lag rather than gain, and the LIVE `deviceorientation` path pinned to the harness |
| `understeer-cue.spec.js` | the front-axle saturation haptic: it fires when the front stops answering the steering, stays quiet under gentle input, below the 1.5 m/s floor and off-track, repeats no faster than its cooldown allows, tightens with saturation depth, and at the same DEPTH in the grip envelope responds identically at any PACE |
| `brake-cue.test.mjs` | braking CUE math in `js/physics/brake-cue.js`: slider 1 is OFF, urgency is 0 when the apex is already made, braking already done cuts the pulse, and the function returns 0..1 never a brake command |
| `digital-steer.test.mjs` | the ramp behind ARROW KEYS and the on-screen turn buttons, driven through the real `js/input/input.js` in a VM with a hand-stepped clock: pressing the OPPOSITE arrow unwinds at the RELEASE rate rather than the slow build rate (it was 350 ms against 133 ms at 41.7 m/s, so release-wait-press beat counter-steering), a frame that crosses centre spends its leftover time building the new lock, and ADAPTIVE BUTTONS still slows how fast lock BUILDS at speed |
| `steer-migration.spec.js` | the `STEER_SCHEMA` store migration LADDER — v2's one-time `drivingHelp`/`raceLine` reset runs for a stale store; v3's RACE PACE regrid maps all ten old notches onto the 19-notch geometric grid and leaves a store that never set one alone; every step is a NO-OP at or above its own version (so a schema bump cannot re-apply an earlier step and discard a choice the player made after it), and no step touches `steerRate`/`steerSmooth` |
| `gamepad.spec.js` | gamepad mapping — driving (steer/throttle/brake/boost/overtake/camera) and, once a menu is open, the UWP-parity menu-nav mapping (D-pad+stick→arrows with hold-repeat, A→click, B→Escape including the native-`<dialog>` `cancel`-event seam, triggers→PageUp/PageDown, bumpers→horizontal paging) with a regression guard that driving is unaffected |

### Per-circuit foundations

| Spec | What it covers |
|---|---|
| `*-foundation.spec.js` (16 circuits: abudhabi, albert-park, bahrain, cota, hungaroring, imola, interlagos, monaco, montreal, monza, qatar, redbull, spa, suzuka, vegas, zandvoort) | per-circuit runtime build: required models present, props clear of the racing surface, terrain grounded, water safe, walls sane |
| `interlagos-foundation.spec.js` | Interlagos' migration to the track-owned foundation (renamed from `physics-interlagos-migration` with the rest of the family) |
| `albert-park-foundation.test.mjs`, `baku-migration.test.mjs` | the same, as pure Node VM builds — no browser |
| `shared-track-foundation-characterization.test.cjs` | pins the shared-foundation compatibility behaviour: `startFrac`/`reverse` transforms, open vs street grounding, `recordBarrier` wrap, whole-model road suppression, finite mesh buffers |

### Track geometry & scenery

| Spec | What it covers |
|---|---|
| `tracks-walls.spec.js` | barrier geometry on all 40 circuits — the car stays inside a sane corridor |
| `tracks-visual.spec.js` (under `tests/manual/`) | per-circuit pixel-diff regression (all 40 circuits × 6 fractions) — **PARKED**: no baselines committed; not an npm gate |
| `terrain-over-road.spec.js` | all-circuit audit: no terrain or verge triangle renders above the racing line. Point-in-triangle vs the asphalt; large road-over-road is ignored as an intentional crossover (Suzuka's figure-8) |
| `props-over-road.spec.js` | all-circuit audit: no PROP triangle sits on/above the racing line, in 3D, 0.2–5 m above the road. Per-track `BASELINE` caps document justified overheads (Miami's beach canopy, Mexico's Foro Sol, gantries) |
| `prop-clipping.test.mjs` | ratchet: prop-vs-prop interpenetration must not grow |
| `scenery-grounding.test.mjs` | ratchet: FLOATING scenery must not grow — the vertical axis, gating `tools/track/float-audit.cjs` against `tools/track/float-baseline.json`. Same semantics as prop-clipping: absent circuit must read 0, listed circuit fails on growth, a cap above the measured count fails as slack. `npm run test:float` existed for a while but was in no CI job and behind no test, and could not have been wired up as-is — it exits 1 on any floater and 37 of 40 circuits have some |
| `lamp-fixture-anchor.test.mjs` | all-circuit, STRICT ZERO on both axes of the night-lighting anchor: (a) no light record with `glareW > 0` may sit off a registered fixture — `drawGlow` paints a halo billboard for those, and the three start-gantry downlights shipped at `glareW 0.3` unparented (three orbs over every start line; Jeddah's whole tunnel was 311 of them, its poles having registered no lights at all); (b) no registered fixture's radius may stop short of the road — the `(1-(d/r)^4)^2` window is exactly 0 past `r`, and Bahrain's 39 m masts inherited a radius sized for a 13 m verge lamp, so the circuit rendered unlit (2 of 135 centreline samples). No baseline and no ALLOW hatch: both read 0 fleet-wide |
| `component-inventory.test.mjs` | docs/COMPONENTS.md must name every class family in `css/`, name none that has left, and keep the dead-class list accurate — a map that silently rots is worse than none, because it is trusted |
| `sheet-per-screen.test.mjs` | one `.sheet` per parent element in the shell — `sheetshape.js` writes `--sheet-eff-scale` on the PARENT, so two co-hosted sheets would clobber each other's fit cap; the failure message names the fix (scope the property to the sheet) |
| `sheetshape-registry.test.mjs` | SheetShape's `seen` Set and its ResizeObserver must FORGET a detached element — both hold strong refs and had no removal path, so every closed telemetry popup (a fresh `.fit-managed` card owning the trace canvases, ~2–3.6 MB at dpr 2) was retained for the life of the page. Behavioural, in a VM on `mini-dom`: a regex would pass on a prune that never runs |
| `road-under-floor.test.mjs` | no visible road surface may sit below the flat floor plane |
| `coplanar-faces.test.mjs` | ratchet: SAME-FACING coplanar faces — the pairs that z-fight at every distance, which `clip-audit` structurally cannot see |
| `debris-step-skip.test.mjs` | source contract for DebrisWorld's two-tier idle: skip `world.step(_events)` when live bodies are asleep and no car is in `FURN_WAKE_M`, but keep `_ageAndCullPool` + panel `force = 0` so `marbleGrip()` and `PANEL_IDLE_DESPAWN_S` stay honest |
| `debris-hazard-hint.test.mjs` | `projectHazard` in `js/physics/debris-world.js`: the hazard query seeds `Tracks.project` with each body's own placed arc (33 segments instead of all ~1500) and must fall back to the full scan whenever that seed cannot be trusted. Sweeps monza/monaco/spa/miami at every staleness up to a 2 km wrong hint for a single changed accept/reject verdict, and pins suzuka — a figure-of-eight whose legs cross 1.43 m apart in XZ and 8.07 m apart in Y, where the height half of the trust test is the only thing that stops a hint on one deck being trusted for a body on the other. The subject is extracted from the real source, and two deliberately-broken variants keep the assertions honest |
| `spline-project-height.test.mjs` | `Tracks.project` in `js/track/core/spline.js` searches in XZ only, so on a circuit that crosses ITSELF it cannot tell the two legs apart even in principle — the information was absent, not mis-weighted. Pins the optional `wy` argument that adds a height term: on suzuka's crossover (~2.6 m apart in XZ, ~8.3 m in Y) a body on the upper deck displaced toward the road beneath projects onto the WRONG leg at every offset tried without it, ~2368 m away in arc, and onto the right one at all of them with it. Carries an anti-vacuity assertion that the flat search must still be wrong somewhere, and checks that away from the crossover the two forms agree exactly, so existing callers are unaffected |
| `f1-track-accuracy.spec.js` | each def's `path` OSM trace vs a pinned subset of real GeoJSON outlines (direction, shape) |
| `track-foundation.test.mjs` | Node contracts for TrackSpace, TrackSurface, TrackModels, atomic diagnostics, terrain grounding, mesh validation |
| `track-maps-corners.test.mjs` | turn class = radius + heading-sweep (not raw \|k\|); Monza includes Curva Grande; Spa La Source HAIRPIN / Eau Rouge FAST |
| `track-preview-plan.test.mjs` | `TrackMaps.planPreview` — stacked vs beside, and the slot it sizes, over measured card geometry x circuit aspect. Holds shut the tall-circuit sliver, the caption charged to the wrong shape's budget, `beside` on a wide circuit, the 175% collapse, and two-column on a phone |
| `circuit-axis.test.mjs` | `tools/ui/circuit-axis.mjs` — the spread still spans tall to wide (and names circuits that exist), the axis stays off unless flagged, and a tagged cell id parses back to screen + circuit |
| `track-graph.test.mjs` | the scenery model library + node graph, and `batches()` |
| `godray-keep-nearest.test.mjs` | the god-ray nearest-k selection, cloned in all three backends: eviction must SWAP so the pooled objects stay a permutation (an overwrite aliased one object at two slots — a lamp beamed twice, another dropped); also pins the three clones in lockstep |
| `light-store-cond-layer.test.mjs` | the conditional shipped lighting layer ("*|tod" in LightPresets): resolves only on ULTRA + a per-chunk-capable backend off mobile; player edits (incl. explicit 0) always win; dedup against base() includes the layer |
| `curvature-channels.test.mjs` | the arc-must-not-reach-the-driver table: every Tracks.curvature consumer file appears in docs/PHYSICS.md §Curvature channels (and no ghost rows) — a new consumer must be classified before it lands |
| `storage-key-prefix.test.mjs` | every literal localStorage/sessionStorage key is apex26.-prefixed (GameStore-routed keys exempt by construction; allowlist entries need a written reason) |
| `no-bare-console.test.mjs` | logging goes through Log — no bare console.* in js/ outside log.js (the nostr interception seam allowlisted with its reason) |
| `lamp-chunks.test.mjs` | the shared per-chunk lamp bake (LampChunks): nearest-first reach-filtered selection, the knob→cap formula (floor 8, CAP 24), concat/offsets/counts ≡ the per-chunk lists, and the bake-once invalidation contract (lights array identity + knob value) |
| `all-lights-fill.test.mjs` | `_fillAllLights` writes the same bytes a full rewrite would: only rgb can move per frame, so the twelve static lanes are copied once per source array — asserted across a flicker sequence AND a source swap, plus the `_allLightsGen` contract LampChunks and WGX both cache on (including a new set whose colours match but whose positions moved, the case that hides) |
| `cockpit-pale-surfaces.test.mjs` | nothing in the COCKPIT build reads as a blank pale slab: ray-casts every team's cockpit mesh from the driver's eye and fails on a pale ACCENT (the car's own body colour is exempt — racingbulls really is a white car). Proven to fail on ferrari + williams with the `_ckAcc` dimming disabled |
| `cockpit-crest-stripe.test.mjs` | the livery CREST STRIPE does not run through the driver's steering wheel: locates the stripe by a DIFFERENTIAL build (with and without `liv.stripe` — colour matching is useless, `hazard` ships the stripe as car3d's `CARBON` byte-for-byte) and fails on any stripe geometry inside the wheel's angular window within 1.5 m of the cockpit eye. A second test asserts the CHASE build still carries it, so the gate cannot be satisfied by deleting the stripe. Proven to fail on all 178 striped liveries with the `!ckpt` gate removed |
| `crest-marks.test.mjs` | every team mark is READABLE, measured rather than eyeballed: extent inside the fit box and filling it, no limb under `STROKE_MIN` (1.9 px at the 34 px the mobile-AI fin badge gets), lettering floored and absent when `bare`, a colour census that fails on any paint outside `markPalette`, no alpha or `destination-out`, ink coverage in band and stable between 430 px and 40 px, and the 4.2:1 contrast floor over every team x livery x the four surfaces a mark lands on. Also holds the editor's mark rows: every row `markSlots` offers reaches PIXELS on both surfaces, no two rows share a key or a label, the OUTLINE row is opt-in on every mark, and Red Bull's SUN DISC is round (every sampled point one radius from the bbox centre) and backmost — the trace's union silhouette failed that by 6:1 and was what made SUN DISC move an outline. Every team's lockup paints the same colours on the cover and the fin (shared `markPalette`, same construction: Ferrari shield, Red Bull disc, Haas ring, Audi weave). Dropping a second shape on the tail is what made the editor rows look like two different logos. Measures through `tools/car/crest-sweep.mjs`. Would have failed on the traced logo PNGs this replaced |
| `car-front-wing-width.test.mjs` | the front wing is NARROWER than the car it is bolted to — a regulation invariant, not a style call. F1 caps the wing ~100 mm inboard of the front tyre's outer face on each side (1700/1900 for 2026), and that gap is what the endplate uses to push the wake around the tyre. Ours stood 95 mm PROUD: the widest vertex in the whole car was the endplate footplate at ±1.045 against a 0.950 tyre face, so the car measured 2.09 m at the wing and 1.90 m at the wheels. Sweeps EVERY aero option, because calibrating on the default alone is what left `outwash_max` and `reg26_concept` 5 mm proud; a lower bound guards the other direction. Builds offline through `tools/car/parts-sweep.mjs` |
| `grid-boxes.test.mjs` | the painted starting-grid boxes, measured on a real track build. The grid's geometry — pole 14 m before the line, 8 m between slots, the lateral stagger — lived only inside `gridUp()` in js/game.js, pinned by nothing at all; the boxes are built in js/track/core/mesh.js, a different layer, so the two would have drifted in silence and the paint would still LOOK like a grid, just not the one the cars stand on. `TrackMesh.gridSlot()` is now the single definition and this is what holds the paint to it — falsified by moving the front line 4 m, which reddens the drift guard and nothing else. Also pins the real regulation: a 2.7 m box (the FIA widened it 20 cm in 2023), open at the rear because legality is judged on the front tyres, and the yellow guide line placed CLEAR of the front line rather than z-fighting it. Builds offline through `tools/lib/track-build-vm.cjs`; monaco is in the set because it is the narrowest tarmac a box has to fit on |
| `parts-visual-distinctness.test.mjs` | every catalog option is VISIBLY different from the one it replaces, measured rather than hashed: builds all 297 options offline and gates on surface distance, moved area, palette transport and a 14-view visibility mask. INVISIBLE / BROKEN / SLIDE / INTERNAL must be empty, COLOUR-ONLY is an exact allow-list, WEAK is a downward-only ratchet; plus the census (12/297/121) and the SIGNATURE invariant that a reskin keeps its equivalent's cost and all four stat multipliers. Measures through `tools/car/parts-sweep.mjs`. ~4 min, so it runs in `test:sweeps`, never in the edit loop |
| `parts-ladder.test.mjs` | every catalog option is one a rational player could ever want to BUY — the other half of the promise `parts-visual-distinctness` makes. An option is LIVE when it maximises `sum w_i*log(stat_i) - lambda*cost` for some positive taste and some price (the upper convex hull of the (cost, log-stat) set, solved exactly per weight vector, no lambda grid). Gates: no PAID option strictly dominated by a cheaper one; the never-optimal list is exact in BOTH directions against a named exemption list (the two wet compounds, which the four DRY stats cannot score); no category flat on a stat; SIGNATURE cost/stat parity; and the career budget cap clears the dearest works car while staying under the whole top shelf. Measured 2026-08-29: 67 of 169 rows never optimal before the re-space, 2 after. Measures through `tools/car/parts-ladder.mjs`. ~0.3 s, node-only — cheap enough for the edit loop |
| `garage-mesh.test.mjs` | the bay's meshes carry a per-vertex MATERIAL column of exactly one float per vertex, and the big surfaces are not all left on `MAT.FLAT`. A silent-failure guard: GLX wires the attribute only when `data.mat.length === vCount` (`glx.js:741`) and drops a wrong-length column with no warning, which is how the whole garage shipped untextured while the car standing in it sampled the baked PBR arrays. Runs the real module in a `node:vm` against a recording Gfx — no browser, ~0.15 s |
| `setup-preview-hull.test.mjs` | the garage turntable's framing hull is cached across colour-only rebuilds, which is only correct while `SP_HULL_GEOM_FIELDS` (js/game.js) names every livery field whose PRESENCE moves a vertex. Does not PIN the list — it re-derives it from the real `Car3D.build` and compares, so a future edit that gates geometry on a new colour goes red here instead of silently re-centring the car against a stale silhouette. Also asserts the premise the cache rests on: a hue change never moves a vertex. `loadParts()` in a `node:vm`, no browser, ~0.8 s |
| `garage-interior-gate.test.mjs` | the garage capture gate rejects flat team-tint wall frames (uniform teal when WGX off-axis view decomposition drifts) and accepts a varied car+floor+ceiling gap sample — pure node, no browser |
| `scenery-kits.test.mjs` | Node contracts for deterministic themes, every LandmarkKit form and CircuitKit facility, bounded counts, budgets, fail-closed behaviour |
| `scenery-kits.spec.js` | the browser binding of those kits into Silverstone's `scenery(api)` |
| `scenery-api-contract.test.mjs` | freezes the 111-member `scenery(api)` surface across the `js/track/scenery-*.js` split |
| `scenery-guards.test.mjs` | the on-track guards drop what is ON the road, not everything with a normal gap: Monaco's armco keeps its posts (guardrail margin below the gap), Qatar/Monaco billboards build (panel ENDS guarded, not the along-track length as a radius), and `bakedModel` rides the scenery transform like the fallback it replaces — counts from `modelDiagnostics.suppressedCounts` on the real build |
| `lamp-density.test.mjs` | `LAMP DENSITY` thins/densifies baked lights; lamps dressing aliases |
| `floodmast-lamp-register.test.mjs` | `floodMast`/`floodMastRing` register lens posts into `track.lampPosts` (Singapore/Bahrain on; Qatar `light:false` opt-out) |
| `track-accuracy-validator.test.mjs` | the accuracy validator tool itself |
| `quick-validate.test.mjs` | the quick-probe validator tool itself |
| `map-hooks.spec.js` | minimap polyline (`mapPts()`) + orientation + `trackBounds()` |

### Render

| Spec | What it covers |
|---|---|
| `webgl-probes.spec.js` | renderer / GL capability contract |
| `instanced-draw.spec.js` | the GLX consumer of `TrackGraph.batches()` |
| `lighting-ab.spec.js` | lighting A/B invariants — the always-on companion to the offline campaign |
| `lighting-campaign.test.mjs` | the offline A/B campaign's own tables (tracks, TODs, weathers, shards, slider groups) |
| `lighting-tuner-grade.spec.js` | the LIGHTING TUNER's image-grade panel |
| `image-grade-visual.spec.js` | image-grade output, pixel-side |
| `image-grade-shaders.test.mjs` | image-grade shader maths, unit-side |
| `chunked-index-ranges.test.mjs` | the equivalence proof behind the concatenated chunk index buffer: `createChunkedMesh` gives each spatial chunk a `(byteOffset, count)` RANGE into one shared IBO instead of a buffer of its own, so `drawChunked`/`castShadowChunked` can merge adjacent visible chunks into a single `drawElements` (measured ~76-87% fewer scenery draws). "Same triangles, same order, fewer calls" is an equivalence claim, so it is tested as one — against a stub GL context that records the real uploads: the ranges tile the buffer with no gap, overlap or misaligned offset, the buffer holds exactly the source indices with the same multiplicities, and merging ANY run of consecutive chunks reproduces the per-chunk index sequence byte for byte. Carries its own anti-vacuity assertions, because a single-chunk fixture — or one under the 2000-triangle chunking floor — would satisfy every other assertion while proving nothing |
| `material-shimmer.spec.js` | does baked tarmac CRAWL when the car moves |
| `tlx-probes.spec.js` | the three.js/TSL backend behind `apex26.gfxBackend="three"` |
| `webgpu-lifecycle.test.mjs` | WGX resource lifecycle — plus the two invariants a MOCK device cannot enforce: every `sampleCount` is 1 or 4 (WebGPU allows nothing else; WGX shipped 2 and no real device accepted it) and no WGSL derivative sits where control flow may be non-uniform (`dpdx` behind a material branch is a COMPILE error, and WGX then silently falls back to GLX) |
| `renderer-soft-lifecycle.test.mjs` | TLX/WGX software-present backpressure, resize freshness, timed-out waiter cleanup, and TLX post-chain teardown on fallback or partial construction failure |
| `assets-pack.test.mjs` | the baked pack on disk: licence allow-list, md5, size budget |
| `import-models.test.mjs` | the AX26 model-import output and its determinism |
| `import-models-workflow.test.mjs` | workflow-dispatch inputs stay out of executable shell text; HTTPS URL and non-deploy branch validation |

### Car & parts

| Spec | What it covers |
|---|---|
| `parts-physics.spec.js` | the unified resolver, visual-field ownership, consumed-mesh uniqueness, geometry/triangle budgets, surface/material semantics, static-emissive bounds, signatures, factory presets, physics/costs |
| `parts-catalog.spec.js` | the category setup UI, universal/supplier/signature/factory badges, access filtering, chip interaction |
| `parts-budget.spec.js` | the 780 cr budget UI and the unlimited toggle |
| `parts-persistence.spec.js` | localStorage persistence across reloads |
| `parts-setup-ids.spec.js` | stable `data-cs-cat` / `data-cs-opt` selectors |
| `parts-mesh-cache.spec.js` | bounded body/cockpit/decal/wheel caches with GPU eviction |
| `parts-factory-presets.spec.js` | AI meshes use deterministic team factory setups, never player saves |
| `parts-ers.spec.js` | ERS deploy economics — BOOST must both push and cost, at any speed |
| `parts-liveries.spec.js` | livery catalog shape and the gloss/satin/chrome finish axis |
| `parts-livery-contrast.spec.js` | the auto-picked sponsor/crest ink actually contrasts its background |
| `carview-parts.spec.js` | the isolated car viewer exposes every category, synchronised frames, grounded-effect controls |
| `car-effects.spec.js` | brake heat, ERS deployment, throttle-lift after-fire |
| `garage-aero.spec.js` | the GARAGE active-aero demo shows the real geometry at real angles |
| `custom-team.spec.js` | the MY TEAM livery editor in the GARAGE's TEAM tab |

### UI & cameras

| Spec | What it covers |
|---|---|
| `ui-audit.spec.js` | portrait + landscape screenshots of every screen |
| `rotation-recovery.spec.js` | portrait-phone race blocker guidance, focus, controls escape and exit-race recovery |
| `ui-button-touch.spec.js` | button/touch steer mode: auto-throttle, disabled calibrate, race-settings layout; the lighting tuner's FREE CAMERA touch sticks (drag registers, no latch when the overlay is pulled away mid-hold, a cancelled scene drag releases) and its layout clearing the docked panel at every UI SIZE |
| `ui-resize.spec.js` | live resize: `data-shape`/`data-pair`/`data-density` (`js/ui/sheet-shape.js`) converge correctly after the viewport, UI SIZE, or `zoom` changes mid-session, not just at first paint |
| `ui-scale.spec.js` | UI SIZE / HUD SIZE — every main screen still fits at 80/100/130/150 %, the two scales stay independent, and the HUD clusters stay on screen. Containment only, never absolute sizes; the exhaustive matrix is `--scale=` on the three fit tools |
| `ui-redesign.spec.js` | the redesign foundation in one renderer-light journey: searchable circuits, the Garage's roving tab contract, Settings at 200% on a short landscape phone, Advanced steering `--fit-at`, compact lighting tuner (one scroller, help off), How to Play and Career guide contents rails, standings leftover height, compact HUD density, and fixed-layout Last Race columns at phone portrait width |
| `hud-layout.spec.js` | touch control + HUD layout across every steering and gearbox mode |
| `hud-audit.spec.js` | HUD screenshots + mode-dependent elements |
| `hud-feel.test.mjs` | the in-race HUD's glance-ability, `js/ui/hud.js` in a VM on `mini-dom` plus `css/hud.css` as rules: the tach redline latches with hysteresis (on above 92 % of `MAX_RPM`, off below 89 %) instead of flickering on the line; the OVERTAKE chip spells its lockout (`COOLDOWN n`) rather than reusing `OVERTAKE` at half opacity; sector splits carry the announce banner's ▼/▲ against `sectorBests` and lime for a personal best; `#hud-speed-n` holds a 3ch right-aligned slot so 99→100 km/h cannot shift the figure; the energy bar has a plate and a light-ink label; no HUD text uses the brand red (#e10600) below 4.5:1 |
| `hud-metrics-layout.test.mjs` | HUD metrics layout modes (`auto`/`full`/`timing`/`driver`/`compact`) plus per-widget visibility (`hudMapVis`/`hudGapsVis`: `auto`/`on`/`off`, default **on**): `resolveMetricsLayout()` AUTO is always `full` (fitHud scales / stacks / drops gaps — it does not hide a cluster from profile or band caps); `syncHudVisClasses()` hides minimap on onboard cameras only when MAP is `auto` (GAPS AUTO never hides); `hud-met-*` body classes are labels only (`css/hud.css` has no cluster-hide rules for them); `hud-hide-map`/`hud-hide-gaps` still hide; pause menu `LAYOUT:` / `MAP:` / `GAPS:` cycle the stored choices |
| `pause-hud-layout.test.mjs` | the pause dialog hides bottom HUD chrome mid-race, and the compact pause stack tightens without changing type tokens |
| `phone-touch-surface.test.mjs` | the phone DRIVING surface as rules (`tests/helpers/css-rules.mjs`) plus `Input` in a VM: the portrait blocker's pills sit on `--tap` (52px on touch), never the 24px `--tap-min` floor; the dock's tap/hold rungs clear 44px at both width tiers and keep the 24px painted floor under HUD SIZE < 100 %; the tallest dock column (3 x 54 + gaps) fits a 390px landscape phone at 200 % and `fitHud`'s `--hud-z-dock` cap is wired as the net; every anchor inside a `--hud-z` zoom divides its `--sa*` inset; every `:hover` in `css/` is gated on `(hover: hover)`; every scroll container declares `overscroll-behavior`; double-tap zoom is refused on every layer (viewport meta, `touch-action: manipulation` reset, `#game` none, root `overscroll-behavior: none`); in-race chrome and the blocker are anchored inside the safe area. `Input.requestGyro()` in a VM: a transient rejection (no user gesture) is recorded, a later grant CLEARS `gyroDenied` and attaches once, `setSteerMode("buttons")` detaches the sensor (2026-09-01), and `gamepaddisconnected` re-reads the live pad list. The device-only cells it cannot see are in §Field notes, 2026-09-02 |
| `audio-sample-upgrade.test.mjs` | fake-AudioContext harness for `GameAudio`: an engine started on the synth voice (samples not yet decoded) upgrades to the samples at the next `setEngine` once they are ready, exactly once |
| `audio-tune.test.mjs` | the player ENGINE TONE layer keeps the engine's timbre contract: pitch stays monotonic in rev and gear 1 below gear 4 at redline under EVERY profile and at both ends of every slider, a non-finite stored value cannot reach `playbackRate`, a profile replaces rather than merges, muted layers go silent — plus the static seam between `js/audio/panel.js`'s id/key tables and the shell |
| `rival-audio.test.mjs` | the field around you in the player's TRACK frame: left/right lateral sign, ahead/behind arc sign ACROSS the start-finish wrap, closing-vs-opening for a car ahead and behind, nearest-four selection, retired/self exclusion, and the reused-row contract that keeps it allocation-free in the hot path |
| `data-results.test.mjs` | the data hub's RESULTS tab against OpenF1's `session_result`, whose `duration`/`gap_to_leader` change SHAPE with the session: scalars for practice, sprint and race, `[Q1,Q2,Q3]` arrays for qualifying. Drives the real render path for each shape and reads the cells back — column set per session kind, a sprint keeping its points column while "Sprint Qualifying" takes the SQ1/SQ2/SQ3 branch, unclassified rows sorting last with their status in the TIME cell, an unpublished session reading as empty rather than as an error, and a failed `/drivers` costing names but not the classification. Then the PER-ROUND views on the real Zandvoort 2026 numbers: each round re-sorted on its own time (the pole-sitter was only third in Q1), the gap read against THAT round's leader, only the cars that ran a round listed in it, and the elimination band placed from who set a time in the NEXT round rather than from any assumed cutoff |
| `fin-design.test.mjs` | the tail DESIGN picks a livery can make. Geometry: `Car3D.FIN_SHAPES` — an absent `finShape` builds byte-identically to before, `sharkFinBadge()` with no arguments still lands on z −1.235/−1.465, every shape's badge and panel sit inside that shape's own blade, and `none` removes the blade AND its decal quads so no graphic hangs in the air. Atlas: `finStyle: none` paints nothing into the fin or cover regions, `spineLogo: none` leaves the crest off the spine while the fin badge keeps it, `finBadge: number` puts the race number on the fin, and `check` is a real motif |
| `photomode-hold.test.mjs` | mini-DOM + VM over the real `input.js` and `photomode.js`: a boundary `pointerleave` and a WebKit capture steal keep a photo-mode hold; a hidden button and a plain lift release it |
| `ui-sheets-audit.test.mjs` | the PAUSE / SETTINGS / RESULTS sheet audit (2026-09-02) as behaviour on `mini-dom`: RESULTS top-10 and the WORLD CHAMPION panel rank by `SeasonCal.rank` countback like STANDINGS (a points tie used to crown the field-order driver), STANDINGS titles a sprint weekend by the round it is in and calls the race being driven IN PROGRESS from the pause menu; `js/perf/renderer-picker.js`'s in-race two-tap reload confirm EXPIRES (`ARM_MS`) back to the real label, never carries an armed flag into the next race, clears a stale one outside a race, and puts the question on the `<select>`'s option instead of wiping the options; MUSIC & SOUND blames the master SOUND gate when that is what is shut and captions DEFAULT as "Default"; the pause → settings → sub-sheet Escape ladder, the pause button order, and the `.sheet` / `.pane` scroll rules every sheet relies on at a short viewport |
| `title-menu-even.test.mjs` | title 2-up doors share equal flex cells and overlay columns use `--vwz`, not a pixel cap |
| `menu-survey.spec.js` | click every button, capture every state |
| `menu-keyboard.spec.js` | desktop menu input — wheel redirection and arrow/Home/End/PageUp/PageDown focus; an open modal outranks the screen behind it; ESCAPE IS BACK (every layer's `data-esc-close` resolves, picker/garage/title, and a sheet closes without resuming the race) |
| `menu-baseline.spec.js` | SIX blessed pixel baselines (title/select/garage x landscape-phone/desktop) — the IDENTITY half `tools/ui/layout-audit.mjs` structurally cannot see: colour, type, weight, spacing. Deliberately six, not 380: a suite that asks a human to bless 380 images gets rubber-stamped |
| `camera.spec.js` | all 13 player camera modes, via the hook and the CAM button |
| `camera-hooks.spec.js` | `dolly()`, `roadside()`, `tourShots()` |
| `camera-driving-hooks.spec.js` | orbit fov, cinematic, `carOrbit()` |
| `camera-tuner.spec.js` | per-mode framing offsets, knob→vantage geometry, mode isolation, clamp/persist/reset |

### Modes, data, audio

| Spec | What it covers |
|---|---|
| `season.spec.js` | round progression, points, standings visibility |
| `boot-guard.spec.js` | the shell's recovery when a js/ module fails to LOAD (not to run). A one-off 404 — the shape a brand-new module's first deploy takes while a CDN edge catches up — is repaired by a single reload with caches swept; a permanent 404 pins an overlay naming the file instead of looping. Both halves are the contract: repair enough to fix the transient, bounded enough that an absent file cannot storm the page. Written after build 1238 shipped season-cal.js and a cached 404 left the live game dead on `Can't find variable: SeasonCal` |
| `season-format.spec.js` | season mode CUSTOMISED — a shortened/reordered calendar (classics included) crowning its champion at ITS last round, qualifying switched off, the classic points table, the lap chips being PRESELECTED rather than overridden, and sprint weekends: a sprint pays 8-7-6… without closing the round, the Grand Prix follows on the same circuit without a second qualifying session, and the stage survives a quit because it is written with the points |
| `time-trial.spec.js` | ghost recording, ghost delta HUD, sector-split announces |
| `ghost.test.mjs` | ghost lap recording, forward-progress filtering, pose lookup at(t) and inverse lookup timeAt(s) with boundary clamps, and the meta (medal, pole, pace) that rides with the ghost lap |
| `onboard.test.mjs` | the first-run COACH MARKS in a VM — each mark fires once on its own signal and is remembered across a reload, the 8 s gap keeps two apart, a mark never stomps a race message or speaks outside a race, the wording names the control the player actually has (touch / keys), the two-race cap, and a source assertion that the module reads reports only (no `Tracks`, no curvature, no writes to the car) |
| `setup-tune.test.mjs` | the SETUP sheet's contract in a VM — the works sheet is identity for every team (mods 1.0, rake 0, brake-bias split 1/1, factory path untouched), bars move the four channels inside the ±5 % clamp, rake adds aero load on top of the wing and clamps, brake bias snaps to the wheel's 0.5 steps and range, a damaged sheet falls back per field |
| `daily-challenge.test.mjs` | the DAILY CHALLENGE in a VM — the plan is a pure function of the UTC day (same day same plan, a week is not one plan), open() stages the time trial by circuit id with the day's seed, record() keeps the day's best and a streak of consecutive UTC days, the share line's one shape, a damaged save normalises |
| `career.spec.js` | the save and its six slots, the mode axes, the hub, a settled round, ratings, the R&D garage, MY TEAM, objectives/contracts/rollover, reliability, EXTRA FUNDS never raising the fitted cap, the facility, the hire's contract, sponsors — and that career development never reaches a Grand Prix |
| `quali.spec.js` | one-lap qualifying: the simulated field and its spread, the sheet's two states, the grid being the qualifying order car-for-car, every round qualifying, and no classification leaking into the race |
| `quali-persist.test.mjs` | driven `qualiOrder` survives sheet reopen (`clear()` is memory-only, `begin()` restores names/gaps, all-AI and NetPlay do not persist) |
| `data-lifecycle.spec.js` | data hub session plumbing — meeting/year/session/driver responses own their option lists |
| `telemetry-compare.spec.js` | TELEMETRY multi-lane compare and cross-session (one driver's race vs quali) |
| `telemetry-trace.test.mjs` | GPS-trace sanity and the playback dot's motion |
| `data-api-status.test.mjs` | a `"null"` error body still throws with `.status` attached, so a 401/403 lockout can never serve stale cache |
| `audio-smoke.spec.js` | the WebAudio engine/sfx initialise and respond, objectively |
| `music-library.spec.js` | the bring-your-own-music library and the Spotify backend |
| `spotify-refresh.test.mjs` | Spotify refresh single-flight, retry preservation, rotated-token ownership, and terminal revocation |

### Multiplayer

| Spec | What it covers |
|---|---|
| `multiplayer-roles.spec.js` | the car role split, with no networking anywhere |
| `multiplayer-session.spec.js` | what a session does to the grid: rival posing, extrapolation, loss, hand-back to AI — on a virtual clock, never rAF |
| `multiplayer-lobby.spec.js` | the VS FRIEND screen — the part a person touches |
| `multiplayer-room.spec.js` | the waiting room both players share before the lights go out |
| `multiplayer-seats.spec.js` | seat exclusivity — a seat somebody else is already in cannot be picked, and the clash is reported rather than silently resolved |
| `multiplayer-npeer.spec.js` | the star room with more than two: one session per peer, a car per joiner, and one peer leaving handing only ITS rival back to the AI |
| `multiplayer-scan.spec.js` | reading a code with the camera, against a Y4M of a real QR played as a webcam |
| `multiplayer-scan-cancel.spec.js` | getting OUT of a scan and taking the camera down — a camera outliving its screen is a privacy bug nothing on screen reveals |
| `net-transport.test.mjs` | the wire with no wire: loopback latency/jitter/loss, deterministic via a seeded rnd |
| `net-sdp.test.mjs` | the compact invite codec |
| `net-qr.test.mjs` | the QR encoder, checked by jsQR — a decoder that is not ours |
| `net-snapshot.test.mjs` | the 13 B/car wire format and the interpolation buffer, including the short-way wraps |
| `net-session.test.mjs` | clock sync, routing and liveness over a fake wire |
| `net-authority.test.mjs` | who may declare what: START/CAUTION/RESULT are the host's, over a stub-`G` NetPlay |
| `net-roster.test.mjs` | who is still in the race, over the same stub-`G` NetPlay: the host broadcasts `LEFT` for a closed session's wire id and the other guests hand that rival back (AI again, `dnfAt` cleared); a guest's `LEFT` is ignored; a local `stop()` says `BYE` before closing |
| `net-rendezvous.test.mjs` | the room-code client against a real relay |
| `net-trystero-api.test.mjs` | the vendored Trystero surface actually used |
| `net-lobby-lifecycle.test.mjs` | canceled lobby operations, overlapping scanners and late wake-lock grants over deferred promises |
| `rendezvous-worker.test.mjs` | the actual Durable Object request boundary, including declared and streamed oversized bodies |

### Tooling & repo contracts

| Spec | What it covers |
|---|---|
| `net-stub-surface.test.mjs` | js/net is LAZY_NET, so `js/game.js` holds an INERT netPlay/netLobby from boot. Derives the required stub surface from the real CALL SITES (every `netPlay.<m>` / `netLobby.<m>` outside `js/net/` and the already-lazy `apex.js`) rather than a hand-written roster, so a new call site the stub cannot answer turns red instead of becoming a TypeError in the frame loop. Also pins the two VALUES that no crash would announce: `ownsRaceControl` / `ownsClassification` must be TRUE while inert (a solo game owns everything), checked against the shape in `js/net/netplay.js` so the guard cannot pin a fossil |
| `load-order.test.mjs` | `index.html` and `tools/carview.html` `<script>` order matches `tools/manifest.cjs` exactly, including `HARD_EDGES` eval-time dependencies |
| `global-registry.test.mjs` | a LINKER for the globals architecture (Bedrock Phase 0): scans every manifest file with `tools/check/scan-globals.mjs` (espree/eslint-scope, live — no artifacts/ state) and asserts one-global-per-file, single-writer-per-global (accumulators frozen), eval-time reads resolve in load order, call-time reads resolve somewhere, and the dynamic `window[expr]` class stays extinct — known violations frozen as ratchet baselines. **This, not `node --check`, is what says a `js/` edit is valid.** An IIFE that reads a `const` whose declaration was deleted parses perfectly and throws `ReferenceError` on the first frame; `node --check` is green on it. Measured 2026-09-02: a half-finished removal in `tlx.js` left four such reads, `node --check` passed, and this suite named `_mirrorRelease` in one line |
| `game-ctx-surface.test.mjs` | a TYPE CHECK for the `G` ctx façade (Bedrock Phase 1) via `tools/check/check-gctx.mjs`: `types/game-ctx.d.ts` must declare exactly the members of `const G = {…}` in `js/game.js`, with matching writability (`readonly` ⇔ getter-with-no-setter), and the `GameModuleFactory` roster must match the real `X.create(ctx)` call sites. Second leg, skipped when no `tsc` is resolvable: every `G.member` read/write and `const {…} = ctx` destructure in every manifest module whose `create()` takes the ctx (found transitively from `const G`, not by directory) is emitted as a typed shadow and compiled — reading a member that does not exist, or writing one with no setter, is an error reported at the real `js/` file:line. Third leg: a member **no module reads** (the `countT` defect reversed) is baselined, so a new one fails |
| `vstd-invariant.test.mjs` | the PACE invariant as a lint (`tools/check/vstd-lint.mjs`): no speed in `js/game.js` — or in any manifest module whose code reads a `.speed`, wherever it sits — is divided by `VMAX` or compared against a bare literal outside the reviewed allow-list, so the OVERALL SPEED slider cannot silently shrink the player's envelope again |
| `move-tree.test.mjs` | `tools/gen/move-tree.mjs` (the Phase 2b mover) on a scratch tree: the file moves, every EXACT path citation follows (manifest entry, tests, docs), bare basenames and the docs archive are left alone and reported, the manifest gains a `MOVED` entry, `--plan` changes nothing, a missing source or occupied target refuses before touching anything |
| `ratchets.test.mjs` | the size RATCHETS in `tests/data/ratchets.json` (`tools/check/ratchets.mjs`): game.js on lines / non-comment lines / `G` members / column-0 lets, the other big modules on lines; lower with `--update` after an extraction or on a merged tree, raise deliberately with a reason in the commit; one slack rule (max(60, 4 %)). History in `docs/notes/CEILING-HISTORY.md` |
| `car-mesh-anchors.test.mjs` | The NODE gate for the car-graphic anchor assertions that `parts-physics.spec.js` also makes in a browser. It exists because the browser parts group is NOT in the deploy gate — `pages.yml` calls `ci.yml`, which runs `guards`, the conditional `sweeps`, the 9-spec `smoke` shards and the `driving-model` job (`physics-characterization.spec.js`) — so a red parts assertion ships silently, and one did: the front-wing flap check sat red on the deploy tip through five consecutive green Pages runs. Ported rather than adding ~20 min of SwiftShader to every deploy, because these read MESH ARRAYS and `loadParts()` runs `car3d.js` in a node vm; the node context reproduces the browser numbers exactly (144 accent flank vertices both ways). Covers sidepod/nose decal gaps, the accent flank band, the nose running lights, the front-wing flap tips against `FW_SPAN`, and `functionalEmissive` staying reserved for the rain light. Every selector asserts a COUNT first — a sibling DRL assertion once passed for months on `Math.max([]) === -Infinity` |
| `track-night-override.test.mjs` | no module in `js/track/` reads `def.night`, except the two sites in `tracks.js` that RESOLVE it. `def.night` is the circuit's AUTHORED default; `track._night` / the destructured `NIGHT` is what THIS build was asked for, and game.js's TIME OF DAY overrides the default — so an emitter reading the def ignores the player's choice and dresses a prop for the wrong sky. Fixed twice now (a bankZones note in `tracks.js`, then `ferrisWheel`), which is what makes it a class rather than an incident. Strips comments before matching, because both fixes explain the trap in prose. Static source scan, no build, instant |
| `road-lut-frame.test.mjs` | WGX's road-marking LUT must never hand the shader a track frame rotated toward 90°. GLX reads the per-vertex `trk` and interpolates it; WGX cannot (a location-3 interpolator shards dashes on Dawn, and `drawIndexed` leaves `vertex_index` at 0 on that adapter), so it reconstructs (s, lateral x, half-width) per fragment from world XZ against a baked LUT — and `trkFromWorld` builds the frame from the two NEAREST samples. Two bake defects made that pair the wrong two: the table kept a BAND rather than a centreline (one cross-section contributing points metres apart across the ribbon), and a full cell dropped every later pass over the same ground. Either way the tangent ran ACROSS the road, lateral x started measuring distance along the lap, and a LUT miss on a road draw zeroes trk so the centre line was painted down the LENGTH of the road — reported from a phone, correct on WebGL2. Replays the search over the REAL baked table (`WGX.__roadLutTable`, never a copy). Bar is the 90° class: hairpins genuinely disagree with a 4 m chord by up to ~60°, and the two populations are well separated. Three circuits in the fast suite (~3 s); `node tools/gfx/road-lut-census.mjs --all` sweeps all 40 in ~34 s |
| `track-build-wait.test.mjs` | the loadTrack fixture waits for a track build on PROGRESS, not a 45 s deadline: it keeps waiting while the Log ring grows, fails with a STALL message when it stops, and a hard cap ends the wait even if the stall check is broken — the fake page is bounded so a never-ending wait reads as a red test rather than a hung worker |
| `deploy-stamp.test.mjs` | the deploy-stamped shell generation: pages.yml stamps `2000 + commit count` on a full-depth checkout, `verify-live` polls the CDN for it, ci.yml no longer demands a committed generation newer than live, and `node tools/ci/bump-cache.mjs --apply` --at N --root` stamps a staged copy without touching the repo |
| `deploy-tool.test.mjs` | `tools/ci/deploy.mjs` offline: same deploy branch as pick-tests, `--help`, the circuit-touch detector, preflight refusals |
| `game-vm.test.mjs` | `tools/lib/game-vm.cjs` boots js/game.js in a Node VM (~300 ms, DOM/GLX/audio stubbed, feature-detected GLX optionals ABSENT so every subsystem takes its degrade path): race, go, step, a finite physState under throttle, a lap-line crossing |
| `physics-characterization-vm.test.mjs` | the driving-model gate in Node: the four baseline scenarios of `physics-characterization.spec.js` against `tests/data/physics-baseline.json`, EXACT equality at the spec's 1e-4 rounding (measured 2026-09-01) — the browser spec stays as the cross-check |
| `quali-handoff-vm.test.mjs` | the friend-race qualifying handoff as BEHAVIOUR on `tools/lib/game-vm.cjs`: `openQualiForNet()` arms the gate, `openQuali`'s await resolves, `#q-go` is pressed, and the lobby's callback must have run exactly once — `netPlay.start()` has no other caller. Replaces what `multiplayer-room.spec.js` cannot answer in a container with no STUN/TURN route. Verified to FAIL at `48cc011` (pre-fix) |
| `headless-api-vm.test.mjs` | Node twin of `headless-api.spec.js` on `tools/lib/game-vm.cjs` (one boot, ~2 s): all 24 tests — the `headless()`/`obs()`/`act()`/`reset()` contract, same assertions; the two "before track load" tests run first against the virgin boot. Nothing left in the browser |
| `obs-act-edge-vm.test.mjs` | Node twin of `obs-act-edge.spec.js` (~4 s): all 16 tests — `act(n=0)`, the `reset(0.999)` lap seam, scan wrap-around on monza/monaco/suzuka/spa, `done` semantics, NaN sweeps. Nothing left in the browser |
| `longitudinal-vm.test.mjs` | Node twin of `longitudinal.spec.js` (~6 s): all 6 tests — throttle/coast/brake, grass drag, speed-sensitive steering, spa slope gravity, the start/finish wrap, PACE pinned as the spec pins it. Nothing left in the browser |
| `world-physics-vm.test.mjs` | Node twin of `world-physics.spec.js` (~4 s): 5 of 6 — progress with speed, steer sign, running wide with the assist off, the AI getting away, the no-errors run (VM console/rejection record in place of `pageerror`). Left in the browser: the RESPONSE slider test, which drives the `#pm-rate` DOM input |
| `drift-vm.test.mjs` | Node twin of `drift.spec.js` (~3 s): all 6 tests — stable at the limit, SLIDE loosens the rear, self-aligning, grip-limited yaw, no NaN under abuse, SPEED STEER. Nothing left in the browser |
| `active-aero-vm.test.mjs` | Node twin of `active-aero.spec.js` (~3 s): all 13 tests — state surface, arming from the game's own zone list, flap travel, braking shut, the top-speed/grip trade, the AI and the world-view affordance; the virgin `aero() === null` first. Nothing left in the browser |
| `aero-zones-vm.test.mjs` | Node twin of `aero-zones.spec.js` (~30 s): all 10 tests — authored zone counts (monza/baku/qatar/albert_park), Monaco's zero, inZone/zoneAhead, the opening-lap overtake rule (220 s of sim, the slow one), the X_VMAX_GAIN/X_DF_LOSS trade, and the aero-part sweep as three extra `createGame({ storage })` boots where the browser reloads. Nothing left in the browser |
| `offtrack-vm.test.mjs` | Node twin of `offtrack.spec.js` (~4 s): all 8 tests — prog↔s coupling, reverse crawl, wrong-way, the controlled grass pair, both auto-rescues, bahrain stopped-on-track. Nothing left in the browser |
| `elevation-tracks-vm.test.mjs` | Node twin of `elevation-tracks.spec.js` (~2 min — it BUILDS all 40 circuits): all 47 tests — the four banking-geometry audits on `Tracks.buildCenterline`, the chase-camera bank roll via `camState()`, the per-circuit slope-gravity / climb / road-following probe and the two banked bowls, same launches and bounds. Nothing left in the browser |
| `collisions-vm.test.mjs` | Node twin of `collisions.spec.js` (~3 s): all 3 tests — `pair()` separation window, `jam(5)` dig-out liveness, a full pack for 10 s. Nothing left in the browser |
| `speed-cap-vm.test.mjs` | the speed cap is an acceleration ceiling, not a teleport (a cap that drops under the car bleeds at coast drag, never in one step), and `__apex.setPhysics` floors its knobs so a negative pace/expo cannot NaN the car |
| `physics-rows-vm.test.mjs` | five game-vm pins from the 2026-09-02 physics hunt: the parked-phone rescue gates on the driver's pedal; OT proximity is the nearest live car on the ROAD (a finished coaster does not arm it); reverse-crawl slip is measured against \|vx\|; AI brake look-ahead takes \|bank\|; a lap counted under an incident takeover resets the sector clock. Plus the 2026-09-04 drive-feel rows: shipped `FRONT_GRIP` 0.94 / `YAW_INERTIA` 0.58 yaw more than 0.89/0.7; throttle demand (`THR_ELLIPSE`) spends the friction circle when speed-limited; a descent does not confiscate overspeed and flat throttle bleeds it. Plus the 2026-09-05 TLX M6 skid-stint premise: park(0.1)/jump(70)/55-frame lock-up still clears Monza hw with incidents off (`|x|>8`, speed>10) — do not lower that gate to match an R2 takeover pose |
| `collisions-deep-vm.test.mjs` | Node twin of `collisions-deep.spec.js` (~8 s): all 15 tests — pushes that stick, no interpenetration, open-circuit and monaco street walls under `incident({flags})`, kerb flag, sandwiches, pileups, the seam, the side-rub speed-death regression. Nothing left in the browser |
| `ai-stuck-vm.test.mjs` | The AI-behind-a-stopped-player weld (~10 s, one boot): an AI that catches a parked player gets past it, is moving and moving sideways well before it is clear (the queue-cap and lateral floors), `contactT` clears once the cars are apart, and the resolver's contact arms stay behind a real-distance guard rather than `corr > 0`. Not a twin of any browser spec |
| `ai-racecraft-vm.test.mjs` | The complaints that outlived the weld fix (~25 s, one boot): an AI with more pace gets past a slower MOVING AI-driven car within 20 s and stays past (the pace-based `otWant` + the pass latch); two AI cars dropped side by side resolve within 10 s with neither stalling below 25 m/s and no contact afterwards (the one-yielder rule); and a standing start is a launch — speeds span ≥ 6 m/s at t=4 and the order changes ≥ 6 times in ten seconds (the per-car launch plan; before it: 4 m/s and 3). Not a twin of any browser spec |
| `collision-ai-fixes-vm.test.mjs` | Node twin of `collision-ai-fixes.spec.js` (~7 s): all 14 tests — wrong-way thresholds and hysteresis, the pushIn wall scrub with its control run, throttle-gated rescue and its cooldown reset, rear-end `contactT`, the 10-car separation window, zandvoort AI banking grip, the jeddah barrier face. Nothing left in the browser |
| `collision-contact-vm.test.mjs` | What a car-to-car contact COSTS the player (~20 s, one boot, monza start straight): boxed between two AI cars at 40 m/s the player keeps ≥ 38.5 m/s (before: 21.7); a wheel-to-wheel lean keeps ≥ 43 of 45 (before: 30.1); a rear-end bump leaves ≤ 15 % of the closing speed (before: 55 % per pass). The per-pass rub scrub, the ±0.5 m level band and the `0.5 · relV` impulse it replaces are in the header. Not a twin of any browser spec |
| `new-hooks-vm.test.mjs` | Node twin of `new-hooks.spec.js` (~12 s): 55 of 56 — `timing`/`sectorState`/`lapHistory` (TT via `tt()`)/`fieldState`/`aiPlace`/`setEnergy`/`setLap`/`trackProfile`/`obs().gear`, the eight virgin-boot nulls first, and the shared-foundation diagnostics (silverstone, cota, miami, jeddah, singapore day+night, shanghai day+night). Left in the browser: the hidden ~300 s Madrid foundation test (`test.setTimeout(300000)`) |
| `race-settings-vm.test.mjs` | RACE SETTINGS lap ladder as behaviour on the game-vm harness: FULL is `def.gpLaps` and differs per circuit; a VS FRIEND host's distance that is OFF the next circuit's ladder (above OR below FULL — 52 (FULL) at Silverstone is not on Monaco's 3/5/10/25/78) snaps to that circuit's FULL instead of leaving no chip lit; TT ladder untouched; the solo flow still resets to the default |
| `generated-docs.test.mjs` | the three doc generators (`gen-tools-readme`, `gen-slider-doc`, `gen-hooks-table`) run with `--check` against the committed output — drift is a red test, not a stale table — plus row-count / no-`undefined` sanity |
| `gen-arch-table.test.mjs` | the module index of `docs/ARCHITECTURE.md` (`tools/gen/gen-arch-table.mjs`, the `@gen-arch:modules` block) matches a fresh `--check`; every non-circuit manifest file has a row and the roster labels are the manifest's; the header-sentence extractor handles the three comment shapes js/ uses; the hand-written contract sections around the block survive. Manifest-derived so the Phase 2 tree move regenerates it rather than hand-editing a table |
| `car-wing-foil.test.mjs` | Shared `Car3D` wing section: knife-TE `FOIL_T` sample, five-span planform, beveled endplates, 100-triangle flap (not a 48-triangle plank), default body/cockpit under the 2505/1500 ceilings, single-option recipes within 1.6× the default budget |
| `car-presentation-canary.test.mjs` | Field cars share the player's presentation path: `renderPosOf` / `playerAnchor` interpolate world `px`/`pz` for every car (not only `c.human`), `xVis` is dump-only (no 16/s or 30/s damp, shadows use the same `cX`), AI mirrors `px`/`pz` *after* the `(s, x)` advance, visible procedural cars draw `teamBodyMesh`/`playerBodyMesh` + planted factory-signature wheels on `_groundMat` (not a generic `field:1:1:1` pair, not baked wheels on the chassis matrix), and `carOrbit` / agent-view `carWorld` read the mirrored pose. Locks the two leftover bugs that made the pack feel delayed and "a different car" |
| `gfx-backend-canary.test.mjs` | RENDERER pick survives the title menu: `#pm-renderer` is not `hidden`, the boot canary disarms after bind (not only after `present()`), first world present re-arms for jetsam, the picker is a `<select>` + ‹ › that names WEBGPU both ways, labels a GLX fallback `(WEBGPU (WEBGL2))`, resets the WGX loss ladder on a hand re-pick, and RESET RENDERER drops backend crash flags plus context-loss latches without touching GRAPHICS quality — all driven through `js/perf/renderer-picker.js` in a VM. **GLX is booted on `tests/helpers/glx-mock.mjs`** (a recording WebGL2 mock) and pinned by its gl call stream: create*/draw* fail closed after `webglcontextlost`, the uInstanced / uModel / uNumLights / vec3 (float64, copying) redundancy caches skip equal re-uploads, `updateInstances` clears the cull snapshots, the interleaved `uLight[]` lanes land where `shaders/lit.js` reads them, the env cube gets 4× anisotropy, `gpuErrors()` counts drained GL errors, and the context is asked for `alpha:false`. The gpu-census Verdict script is EXECUTED against fixtures (hardware-only vs unconditional checks, null census). Also **TLX's canvas must be OPAQUE**: the lit fragment writes the SSR car-paint tag (0.35) into ALPHA, and `present()`'s post-only-death path keeps those materials while painting straight to the canvas — on an alpha-composited canvas the browser reads that tag as opacity and every car's painted bodywork goes 35% see-through for the rest of the session (reported from an iPhone). three needs telling twice: its WebGPU backend honours `alpha:false`, its WebGL backend hardcodes `alpha:true` and only honours a caller-supplied `context`. **Both vendor behaviours are asserted against the bundled three**. TLX (three.js cannot load in Node), WGSL/GLSL/TSL and the vendored bundle stay source pins, matched on comment-stripped code by identifier and shape; WGX behaviour lives in `webgpu-lifecycle.test.mjs` and is not repeated as text. Source can prove TLX ASKS for an opaque canvas but never that it GOT one, so the live half is in `tlx-probes.spec.js` |
| `gfx-debug-overlay.test.mjs` | The `?gfxdebug=1` / `apex26.gfxDebug` overlay (`js/perf/gfx-debug-overlay.js`): opt-in only and installed from exactly one gated site, so a debug aid cannot paint for every player; it prints `gpuErrors()` + the first message, the env-probe state, `backendState()` and the REFUSED reason, because those are the facts a screenshot cannot carry; every read is guarded (`GLX` may not exist yet) and it never invents a number — a WebGPU-claimed canvas has no 2D readback, and an unpainted soft canvas is not a black frame. It exists because this container has no GPU and the reporter has no console. |
| `ui-improve-pass.test.mjs` | The menu/HUD improvement pass as BEHAVIOUR on `tests/helpers/mini-dom.mjs`: MenuNav's first arrow lands on `[data-menu-default]` and wraps in every direction, SheetShape's `--fit-at` cap (`--sheet-scale` / `--sheet-eff-scale`), `--wide-at` hysteresis, `--pair-compact: wide|off` and the tuner rail's three-rows rule, the gamepad menu nav (0.14 driving vs 0.22 menu deadzone, one seed per open layer, 450/130 ms repeat, right-stick fallback, A on a range does not click), the camera picker as a keyboard `menuitemradio` menu, SettingsNav's `showCurrent()`, COPY VALUES exporting a `window.LightEdits` delta with `execCommand("copy")` before the clipboard promise, and `bake.mjs` refusing that delta. CSS is read as RULES through `tests/helpers/css-rules.mjs` (selector + property, order/whitespace-free); CssZoom load order + API; garage livery grid; select track filter persistence |
| `menu-nav-spatial.test.mjs` | spatial menu arrows: after an in-band miss, ArrowLeft/Right pick the closest-Y item really to that side (`across * 0.25`); vertical moves stay in-band (no out-of-band dy pass) |
| `menu-a11y-audit.test.mjs` | the 2026-09 menu keyboard / gamepad / a11y audit as BEHAVIOUR on mini-dom: TopModal's per-layer focus memory for the non-dialog screens (land on open — autofocus / data-menu-default / selected / first non-text control; restore the opener on close; reopen where you left; nothing restored into a hidden screen), containment that skips hidden / zero-box / aria-hidden controls, MenuNav's per-axis ownership (text fields and sliders keep Left/Right/Home/End, Up/Down leave; a tab rail keeps its own axis, measured or `aria-orientation`, and the perpendicular arrow leaves it with propagation stopped); the shell contract (every layer a named region or dialog, `#announce` a live region, one `data-esc-close` door per layer that resolves), ScrollFade/AriaState lockstep with `UiLayers.LAYER_IDS`, AA contrast of menus.css text computed from the rules, and token-sized touch targets (`--tap` / `--chip-h` ≥ 44px on touch) |
| `ui-journey-career.test.mjs` | leftover Career overlay `--fit-at`, wrap-not-ellipsis compact rows, and guide/history contents rail keyed on `data-shape=wide` |
| `ui-journey-session.test.mjs` | Results / Standings / Race settings / Audio / Pause `--fit-at`, and `#standings-body` leftover height with no `55svh` cap |
| `ui-journey-race.test.mjs` | HUD `--hud-z` (never `--ui-scale`), compact HUD on `body[data-density]`, pause-hidden `#campicker`, `#pc-restore` |
| `css-comments.test.mjs` | a CSS comment that ends early (or never opens) turns prose into a selector and DROPS the rule after it, silently — caught by measuring prelude length (`MAX_PRELUDE` 230; measured max 218 in `css/tuner.css`, the two live failures were 275 and 759) |
| `css-tokens.test.mjs` | every custom property in `css/tokens.css` must have a consumer — an unread token is an invitation to use a value nobody has been maintaining |
| `css-token-adoption.test.mjs` | the converse of `css-tokens`: a rule needing a size must READ a token, not write a literal. The four COUNTS are `tree` entries in `tests/data/ratchets.json` (`subFloorFontSize`, `rawSpacing`, `rawColor`, `rawColorDistinct`, all at `slack: 0` — exact equality, so a migration lowers them rather than banking headroom); this file keeps the POLICY that says which literals legitimately stay, and the list of sheets that read no spacing token at all and so cannot respond to the density ladder. Breakdown behind a failure: `node tools/check/tree-counts.mjs --offenders` |
| `light-presets.test.mjs` | the 1,921 shipped lighting values must name real `TUNE_DEFS` ids — a renamed knob does not throw, the lookup just misses and the shipped look silently stops applying |
| `light-store-copy.test.mjs` | the tuner's COPY ALL fan-out (`LightStore.copyToTracks`): which profiles a copy writes, what each target then resolves to in either mode, that storage stays sparse, and that undo is exact |
| `light-grid.test.mjs` | every shipped `TUNE_DEFS` preset value lands exactly on its own slider's min+k*step grid — an off-grid value reads as a false player override |
| `lighting-reapply.test.mjs` | every tuner knob consumed only inside `applyRaceSettings()` is listed in `APPLY_RACE_IDS`, or its slider silently does nothing until an unrelated TIME/WEATHER change |
| `lighting-rebuild.test.mjs` | every tuner knob consumed only inside `buildTrackLights()` carries `rebuild:true`, or its slider is invisible until the next track load |
| `hooks-documented.test.mjs` | every `__apex` hook must have a section in `docs/DEBUG-HOOKS.md` — a RATCHET over the 28 that already had none, so nothing NEW joins them |
| `race-control.test.mjs` | the caution state machine in a VM — thresholds, the raise-fast/lower-slow hysteresis, the hard time caps, drop-on-disable, host vs guest, and the leader's-lap rule behind OVERTAKE |
| `season-cal.test.mjs` | the SEASON calendar/format model in a VM — config normalisation, the calendar presets, and the TWO-GATE rule the whole design rests on: the calendar follows the player outside a career, but the FORMAT (distance, sprint, points table, qualifying) follows it ONLY in a season, so a one-off Grand Prix cannot inherit a season's sprint distance. Also the weekend stage machine: a sprint scores 8-7-6… without advancing the round, the Grand Prix closes it, and the two legs draw retirements on different keys |
| `career-seat-rollover.test.mjs` | MY TEAM is always SEAT 0 in a VM — `driverOverride()` maps a custom team's seat 0 to you and seat 1 to the hire, but the NEW CAREER draft starts at seat 1 (right for a DRIVER career) and the MY TEAM path never put it back, so every such save raced the player's car under the HIRED driver's name, code and number while the AI ran the driver they had just named; the driver-career case still honours the seat the player picked |
| `career-settle.test.mjs` | `settleRound()`'s sponsor "double" fact in a VM — a team-mate CLASSIFIED in the points but retired scores nothing (a retiree can be classified top-ten when enough of the field DNFs), so it is not half of a "double"; the retired flag is the only discriminator between otherwise-identical rounds |
| `setup-screens-state.test.mjs` | the SETUP-family sheets (CAREER, SEASON SETUP, GARAGE) as BEHAVIOUR on `tests/helpers/mini-dom.mjs`, from the 2026-09-02 audit: `CareerUI.close()` drops the NEW CAREER draft and an armed DELETE? (siblings of the `draftFrom` leak fixed 2026-09-01), `SetupUI` discards the paint editor and `G.livDraftOverride` when `#carsetup` is hidden (BACK/DONE never cleared them and `resolveLivery()` painted the unsaved draft on the race car), the factory / fitted-cap upgrade cards print `SHORT N cr` when disabled, and the unit/precision pins — team tiles and the RE-SIGN card say `cr / round`, THE CAR Fitted row groups thousands like the garage, history Points carries `pts`, SEASON SETUP distance chips read `N LAPS` with no `(FULL)` (FULL is per-circuit on the race-settings sibling) and the sprint note says `pts`. CSS through `css-rules.mjs`: the extended lines wrap |
| `career-cross-tab.test.mjs` | an active career refuses to overwrite a newer foreign save, while an idle career refreshes to the winning tab |
| `async-lifecycle.test.mjs` | late QR streams/video playback, decoder retries, IndexedDB late success and a hung fetch releasing the shared queue |
| `ai-drive.test.mjs` | Pure AI racecraft helpers in `js/physics/ai-drive.js` — rating→behaviour maps, situation OT fire rate, ERS want/bank, wantX, aeroLoad corner limit, racing-line hold mix, multi-sample soft brake, adaptive lane, street pack seating, team houseStyle, seat/#2 let-by orders, consistency brake band — in a VM with no browser |
| `factory-ai-setup.test.mjs` | Works-car aeroLoad / ERS deploy must differ across FACTORY_PRESETS (McLaren flex vs Williams low-drag), and `makeCars()` must assign those values plus `houseStats` to AI cars instead of the old 0.5 midpoint `null` |
| `shared-math.test.mjs` | the shared scalar helpers on `M4` (js/core/mat4.js) — clamp/lerp/`wrapDelta` semantics including the two edges that made the one DIVERGENT clamp copy different (inverted range, non-number argument), `wrapDelta` proved equal to the single-fold ladder every migrated site hand-wrote across four periods, plus a RATCHET: no js/ file may declare a private clamp/lerp again (the sanctioned spelling is the alias `const clamp = M4.clamp;`), with an anti-vacuity case pinning that the regex fires on the shapes it is meant to catch |
| `store-cross-tab.test.mjs` | `GameStore`'s `storage` listener in a VM over a fake localStorage — two tabs used to silently overwrite each other's saves because `_cache` is filled on first read and never invalidated. Asserts the module ARMS ITS OWN listener, that a foreign apex26. write drops exactly that key (an unrelated key stays cached — invalidating everything would put getItem/JSON.parse back in the render loop), that `rev` bumps, that a foreign `clear()` empties the cache, and that another origin-key's write is inert |
| `incident-gate.test.mjs` | IncidentSim's notifyCar entry gate vs preStep's per-kind authority in a VM — an r2-only config still queues+promotes a launch at `>= R2_CAR_V`, an r3-band contact under that config promotes nothing (enabling one kind never widens the others), sub-threshold bumps never queue, all-off is inert, and the shipped defaults still resolve a relV=30 pair as r2 |
| `camera-ride.test.mjs` | `GameCams.vantage` in a VM over a synthetic hill: the chase rig must not turn the road's fine undulation into camera bob on a gradient (measured against a raw two-point rig on the same profile), while still framing flat road and constant slopes exactly as before, still climbing the hill, and still honouring the ground clamp. The elevation profile is an argument here, so the threshold pins the CAMERA rather than whatever terrain a circuit happens to ship |
| `camera-defaults.test.mjs` | Shipped camera/HUD defaults stay wired: chase corner lead baked into `vantage.js`, cockpit turn-chasing ON by default, per-mode cut ease, HUD camera/profile body classes, `window.CameraEdits` export, and broadcast-camera announce suppression |
| `terrain-normals.test.mjs` | the terrain ribbon must be shaded by its own shape: `TrackMesh.buildTerrain` normals are unit length, point up, and carry real tilt spread on both a street and an open circuit. `buildTerrain` shipped `nrm.push(0, 1, 0)` for every vertex — an embankment, a banked verge and a flat runoff all took identical sun — and nothing caught it, because a constant normal throws nothing and changes no vertex count |
| `comment-citations.test.mjs` | a `other-file.js:412` comment citation must point at a line that EXISTS, plus a RATCHET on how many there are — a line number in another file cannot be kept true, so cite the symbol |
| `docs-integrity.test.mjs` | live docs, skills AND source comments reference only files that exist; AGENTS.md's suite counts, the scenery-api member count, the renderer-backend list, and the skills/tools/docs indexes all match the repo |
| `skill-progressive.test.mjs` | mcp-probe SKILL.md stays a thin index (≤120 lines) with traps/recipes in `references/`; previously-fat skills stay split (index ≤180 + the named reference file) |
| `css-play.test.mjs` | `tools/ui/css-play.mjs` parse/list/hot-swap contract and the Playwright wrapper's `play`/`dom` commands — screen ids are a subset of layout-audit, `--css` stays inside `css/`, `--help`/`--list` do not launch Chromium, the tool never calls bump-cache mid-loop |
| `menu-capture.test.mjs` | `layout-audit.mjs` / `menu-capture.mjs` CLI contracts — `--gallery`, `--list`, `--help`, `--survey` argv parsing, cell resume paths, and screen catalog coverage (no browser) |
| `lighting-tuner-sweep.test.mjs` | `lighting-tuner-sweep.mjs` gate/push/verdict helpers — night-only knobs gated on day-dry, sunElev push direction, PCSS software skip, report verdict buckets (no browser) |
| `slider-effect.test.mjs` | LIGHTING TUNER classifier + visual A/B: `--help`, knob catalog, gates/risk/tags, `--live --dry-run` recipe, `slider-effect-view.py` changed-pixel filter |
| `test-groups.test.mjs` | the taxonomy: pick-tests rules name real groups and route every source dir; this document lists every group and every test file; `RENDER_SPECS` partitions cleanly; the manual suites stay out of default discovery |
| `shell-ids.test.mjs` | the shell&#8596;JS id contract: every element id the source looks up by name exists in `index.html`, is created at runtime, or is a documented `RUNTIME_IDS` exemption. `$` is `getElementById`, and nearly every call site dereferences immediately, so a renamed shell id is a TypeError inside an IIFE — `js/game.js` had already guarded exactly one such call against it. STATIC by necessity: `game-vm`'s `getElementById` manufactures an element for any id, so the 248 VM tests are blind to this class. Lookups built from a variable are counted, not checked (`dynamicIdReads` ratchet) |
| `test-groups-generated.test.mjs` | `tests/groups.json` is the single definition of a group: package.json's `test:*` scripts and tooling-fast's file list regenerate from it, every group names files that exist, and the tooling-fast notes stay comments rather than leaking into the runtime array |
| `circuit-def-fields.test.mjs` | every field authored in `js/circuits/<id>.js` survives the field-by-field copy into `Tracks.LIST`, or is named engine-only with a reason — an uncopied field reads as `undefined` at every consumer, silently, and the circuit renders as though it was never written |
| `backend-surface-parity.test.mjs` | every name GLX publishes is an own property of WGX and TLX (`undefined` allowed, absent not) — game.js installs a backend by descriptor-copy, so an absent name keeps GLX's own function running against a null `gl`/`CHK`, and every feature test for it passes before throwing |
| `test-coverage-audit.test.mjs` | the coverage auditor itself |
| `pick-tests.test.mjs` | the SELECTOR's own contract, upstream of the taxonomy: `--since <ref>` reads a ref and not a path (it swallowed the ref as a filename and answered "nothing to run" for every diff, for as long as the flag had existed), `--json` reports a `reason` CI can branch on rather than prose that happens to contain a `test:` token, and the default diff base is the DEPLOY branch — `main` is a stale fork here, so merge-basing against it balloons the changed set to most of the repo and the tool gives up silently, dressed as an answer |
| `test-observed.test.mjs` | the never-run detector's title extraction matches the reporter's EXACTLY. A title derived differently reads as "never observed" forever, and a tool that cries wolf on every spec gets ignored — the same outcome as not having it. Its first version missed Playwright's implicit suite title (a top-level test prints as `file › basename › title`, one inside a describe does not) and reported every describe-less spec as 100% never-run, including one verified green minutes earlier |
| `evaluate-scope-lint.test.mjs` | no `page.evaluate()` callback closes over a Node-side binding — the callback runs in the BROWSER, so a module `const` read inside it is a `ReferenceError` there, not a closure. Anti-vacuity: one case asserts the lint still finds both real sites in `58614db2`, the commit whose two launch constants killed every elevation track, so the analysis cannot silently stop resolving bindings while the synthetic cases keep passing |
| `change-driver-tools.test.mjs` | the verification DRIVERS' contracts (`verify-change.mjs`, `bump-cache.mjs`, `test-honesty.mjs`): a driver that drifts from the rules it encodes gets trusted INSTEAD of the prose, so the rules are asserted against the real CLIs — batches carry at most ONE browser group, `tooling-fast` is never batched twice, circuit edits route to `verify-track`, `--apply` lands max+1 on a fixture shell (never the real one), and the silent-skip scan stays at zero unexplained sites |
| `wait-polling.test.mjs` | the ratchet on waits whose declared timeout cannot fire. `waitForFunction` polls on `requestAnimationFrame` by default and the game's render loop starves it — measured at 109,665 ms against a declared 3,000 ms — so call sites carrying a bound that is decoration are ratcheted (`CEILING` 57 today, all under `tools/`, 24 of them in `tools/ui/menu-screens.mjs`; the 2026-08-07 freeze was 353, the population fell as specs were fixed, then the lint's file filter was corrected and the pre-existing `tools/` sites became visible). Frozen rather than swept: rewriting 300 sites in one commit would be a behavioural change with no run behind it. `tests/manual/timeout-probe.spec.js` is exempt and must stay so, because it exists to measure the default |
| `select-budget.test.mjs` | guards `tools/ci/select-budget.mjs`, the arithmetic behind the change-aware CI decision. Pins the MODEL and not the constants: the measured 79.7 s/test is expected to move when CI is re-measured, but the shape must not — a failure costs `timeout x (1 + retries)`, capacity falls as survivable failures rise, and a budget smaller than one failure must report **0** rather than a positive number for a job that dies on the first red test. One case pins the design conclusion itself (cutting the failure cost buys more than doubling the budget) so it cannot quietly stop being true |
| `select-specs.test.mjs` | guards `tools/ci/select-specs.mjs` AND `tools/ci/select-recall.mjs`. Glob expansion, dedupe, the budget cut, the own-`setTimeout` exclusion, the TRACKED infra list (both directions), the import-graph helper→spec walk, fail-fast ordering, and the FAULTY-CHANGE RECALL ratchet — no spec that caught a real regression may be dropped in silence. **Why not coverage-derived TIA:** Fowler's survey is explicit that building a per-test coverage map requires running tests ONE AT A TIME, which against a ~40-minute SwiftShader suite is a non-starter, and the map then needs constant refresh. The path RULES plus the import graph buy most of the signal for none of that cost. The same suite guards the per-spec selector behind ci.yml's blocking `selected` job: every unaffordable spec lands in a named skip/exclusion list, and the selected-gate settings (retries 0, 120 s/test) provably fit more tests than smoke's retrying settings. |
| `twinned-specs.test.mjs` | guards `tools/ci/twinned-specs.mjs`, the substitution the selected gate makes on 11 browser specs whose assertions a VM twin replays test-for-test in a node group the Pages gate runs unconditionally. That saving (123 browser tests of serialized SwiftShader) is only sound while the twin still covers the spec, and the way it stops being true is silent — a test added to one side, or the twin's group leaving the gate — so both are checked: the two files must declare the SAME test count (select-budget's AST walker, the counter the gate bills with), and the unconditional-gate set is DERIVED from ci.yml's pure-node job rather than named, so dropping `test:game-vm` from that job fails every entry instead of leaving 11 specs unchecked in both places. The check earned itself on the first spec it refused: `world-physics.spec.js` read as twinned 5-of-6 and would not take, because its sixth drove the `#pm-rate` DOM slider. Following the refusal found that test doing two jobs — slider WIRING and wheelbase PHYSICS — and that `sliders.spec.js` already covered the wiring better (mapped value, direction, label, storage key). Duplicate deleted, physics moved onto the hook, pair now 6-for-6 and listed: 12 specs, 129 tests |
| `ci-coverage.test.mjs` | guards `tools/ci/ci-coverage.mjs`, which answers what the deploy gate actually executes — the fixed gates run a handful of the 114 Playwright specs and the rest are gated by nothing or by the change-aware `selected` job. Pins the MECHANISM and never the number: the count is meant to move as the gate grows, and a test that froze it would just be a chore. Anti-vacuity is the load-bearing case — a broken `ci.yml` parse would report "CI executes 0 specs", which reads as an alarming finding rather than as a broken tool. One case deliberately names a spec that MUST NOT exist, so the resolver is shown to reject it. The tool parses `ci.yml` PER JOB and knows which jobs are skipped on the Pages call (`!inputs.concurrency_key`), so the `renderer-macos` job's five `test:gfx` specs are reported under their own heading and never counted as deploy-gate coverage; the same file pins that job — `macos-latest`, `test:gfx` through `playwright.gpu.config.js`, never `--use-angle=vulkan`, census-gated, out of the gate — and `gpu-census.yml`'s nightly cron with its dispatch defaults restated for a schedule run |
| `cross-file-paths.test.mjs` | every relative reference in `tests/` and `tools/` — static import, dynamic `import()`, `require()`, `new URL(rel, import.meta.url)` — resolves to a file that exists. Landed BEFORE the `tests/` split, because a guard that arrives after the commit it was meant to protect has protected nothing. The silent class it exists for: `fit-audit.mjs`/`menu-fit.mjs` wrap their `../tests/helpers/f1-api-mock.js` import in a `catch` that is correct at runtime and fatal to a move — afterwards both tools quietly audit an empty data hub with nothing red anywhere. Anti-vacuity: one case builds a moved-file-with-stale-`../` in a temp dir and requires a complaint |
| `assert-audit.test.mjs` | no test in the default suite is VACUOUS — a body with no assertion passes as long as the page does not throw, so it is a green tick that means nothing. The ratchet exempts an allow-list of capture harnesses (`ui-audit`, whose product is a PNG gallery) and asserts they still are ones. Two cases pin the tool's own failure mode: an assertion reached only through a same-file helper still counts, because a body-only scan calls hud-audit's eight steer-mode tests vacuous and a report that is 20% false gets ignored |
| `fixture-consumer-audit.test.mjs` | the specs that must import `tests/helpers/fixtures.js` do |
| `component-inventory.test.mjs` | the class families in `css/` match `docs/COMPONENTS.md` — a class defined in one file and used from another is the drift this catches |
| `span-kinds.test.mjs` | the agent view's span vocabulary matches the `ctx.noteSpan(...)` emitters — the list had fallen four kinds behind, so any circuit placing a tiered bowl failed `agent-view.spec.js` with a message that pointed nowhere near the cause |
| `css-layers.test.mjs` | every rule in a `@layer`-wrapped stylesheet stays inside its declared layer — an unlayered rule (a stray brace closing the layer early) silently outranks every layered rule regardless of specificity, with no parse error and no console warning |
| `uilayers-modal-order.test.mjs` | `UiLayers.top()` ranks open dialogs by TOP-LAYER order (`querySelectorAll(":modal")`), not DOM order, with a fake-DOM harness; plus the index.html guard that every markup opener precedes the dialog it opens (which is why the change is a no-op on today's tree), and the F9/F11 shape pins |
| `css-media-disjoint.test.mjs` | the media ladders stay disjoint: every row-layout branch in track-detail.css requires `(orientation: landscape)` (large portrait must keep the stack), and both large-screen menu blocks in responsive.css guard every selector with the compact-density `:where()` |
| `scroll-strips.test.mjs` | every sideways-scrolling strip (garage category rail, data-hub tab strip, lighting-tuner chip tiers) declares the full `overflow-x`/`touch-action`/`scrollbar-gutter` pattern, not a partial hand-rolled copy |
| `source-integrity.test.mjs` | three cheap syntax/structure checks (an unopened comment block, an early-closed `@layer`, …) that the ~350 behavioural guards don't catch because a `SyntaxError` or a silently reordered layer fails nothing loud — each is a real 2026-08 incident that every other green guard sailed through |
| `deploy-staging.test.mjs` | the Pages workflow uploads an allow-list of directories — every path the shipped code can fetch must be inside it, or it 404s in production while passing every local run |
| `service-worker.test.mjs` | the SW's install/fetch/version-guard behaviour |
| `perf-sentinel.test.mjs` | the crash sentinel's memory must not outlive the crash |
| `perf-governor.test.mjs` | the adaptive-resolution governor: the budget derives from the observed floor of frame intervals rather than a hardcoded 60 fps, so a device capped externally (iOS Low Power Mode's 30 fps throttle) settles at full quality instead of the resolution floor with every feature shed; a genuinely GPU-bound device still downscales and holds; a reverted step does not repeat forever |
| `metrics.test.mjs` | GameMetrics SETTINGS toggle: default off, persists `apex26.metrics`, `?metrics=1` is session-only (set() does not write storage), snapshot() never throws without `__apex`, ON raises the log buffer to debug while leaving the console at warn, pages persist (`gov`/`car`/`phys`/`log`), SIDE persists (`auto`/`left`/`right`; AUTO docks left on a short viewport), SIZE persists (`s`/`m`/`l`, default S), GOV skips `probe`/`physState`, HUD digit and probe ground speed are both kept on CAR, and PHYS reads `physState()` without calling `obs()` |
| `perf-try.test.mjs` | Baked renderer gates, pinned as behaviour where a harness reaches them: no `perf-try.js` / no PERF tab; late sky is the draw ORDER of a frame pumped in `tools/lib/game-vm.cjs` (world meshes → sky → glow → present, and the same on an env-probe face); the main-camera `cullDist` is a far-plane-corner sphere; AI cars outside the 8 m frustum sphere are not drawn while their shadows are still enqueued; GLX (on `glx-mock.mjs`) skips equal tuner-uniform re-uploads, caps the env probe at 300 m / keeps a tighter cull, and resolves MSAA depth only when something reads it (an omitted `carReflect` is the 0.05 default); the props fuse seals typed accumulators. GLSL/WGSL/TSL keep only the gated ON path — shader text, matched loosely on comment-stripped source (a Node test has no GPU) |
| `output-paths.spec.js` | gallery paths are port-scoped and create their parents |
| `cdmcp-measure.test.mjs` | the Chromium MCP background measure harness — CLI surface, log terminal-marker contract, bg launcher existence, without launching Chromium |
| `mcp-cli.test.mjs` | the MCP surface on the fast gate: `mcp-cli.mjs` probe-mode call plans (`--backend` order, TLX pins, `--console`/`--eval`, unknown-flag refusal, isError exit), `chrome-devtools-mcp.sh` clone/help/flags/release pin, `gfx-probe` backend flags, the Playwright MCP pin |
| `tinyfish-mcp.test.mjs` | TinyFish + Chrome + Playwright MCP wrappers — `.mcp.json` has apex-tools + playwright + tinyfish + chrome-devtools + probe, help surfaces (`setup`/`deploy-js`), fixture unwrap/deploy-summary/live-build (search rows render title+url+snippet), every `mcp_post` body must parse as JSON once shell splices are stubbed (the guard that catches the stray-quote class), tracked source has no reusable key and `ensure` names its setup prerequisite, a transient upstream timeout is exit 3 (retried) while a genuine parse failure stays exit 2, `mcp-cli.mjs` uses `chrome-devtools-mcp.sh` with an exact fallback version (no live API), `playwright-mcp.sh` pins `@playwright/mcp@0.0.79` |
| `tools-runnable.test.mjs` | every tool in `tools/` PARSES (`node --check` / `bash -n` / python compile / JSON) and the MCP-facing entry points answer their help path. The README index guards names in both directions but never says the file runs — a tool with a syntax error is indexed, documented and completely inaccessible, and you find out mid-task. Parse-only for the sweep: these tools launch browsers and hit networks |
| `trim-comments.test.mjs` | smoke test for `tools/check/trim-comments.mjs`: `--help` exits 0 and prints `--dry-run`, and the tool removes dividers and location-pointer comments from a fixture file without touching code lines |
| `report-server.test.mjs` | the LAN report collector requires its per-run capability for every read and write, rejects unsafe paths and payloads, and enforces per-request/session storage bounds |
| `probe-mcp.test.mjs` | Unified probe MCP bridge — prefixes `chrome_*`/`tinyfish_*`, help/route, mock stdio handshake advertises full catalogs, `.mcp.json` `probe` entry, mock chrome daemon (healthz//tools//call + CLI auto-routing to a live daemon) (no Chromium / no TinyFish network). Also `mcp-cli.mjs probe --dry-run`: the pick is written BEFORE the reload in one batch, `--backend three` carries the WebGL2 pin (and only three does), unknown flags exit non-zero rather than probing the default, and the wrapper keeps `--enable-unsafe-webgpu` |
| `environment-json.test.mjs` | `.cursor/environment.json` Cloud Agent bootstrap — install script, Chromium path, MCP allowlist names, and every stdio command in `.mcp.json` covered |
| `apex-tools-mcp.test.mjs` | `apex-tools` MCP — `serverInfo.name === apex-tools-mcp`, tools are all `apex_*` (zero chrome/tinyfish; no test-bg wrap), `apex_graph_parity` requires `base`, catalog `tools/mcp/apex-tools-mcp.json` locksteps `.mcp.json` stdio + `serve-http` on `127.0.0.1:3713`, week-1–4 pins, lock/occupancy including host `@playwright/mcp` vs `--mcp-config` JSON, `path_escaped` / `port_not_supported`, refuses deploy/github.io, `isError` preserved, stdout JSON-RPC only (mock/`dryRun`, no Chromium) |
| `mcp-smoke.test.mjs` | five-wrapper shell probe — `--dry-run` lists apex-tools / probe / chrome-devtools / playwright / tinyfish, never `verify` / `deploy-check` / `test-bg` / `playwright-mcp.sh run`, `apex-tools-mcp.sh smoke` delegates, no Chromium |
| `agent-surface.test.mjs` | wrap map lockstep — `docs/AGENT-SURFACE.md` names every `apex_*` in `tools/mcp/apex-tools-mcp.json`, each CLI/skill exists, never-wrap lists `test-bg` / `--apply` / github.io, indexes point at the map, catalog descriptions start Tree / Browser (lock first), `.mcp.json` has the seven repo servers including playwright + pinned official npx |

---

## See also

- [`tests/manual/README.md`](../tests/manual/README.md) — the human-run suites
- `docs/DEBUG-HOOKS.md` — the full `__apex` reference
- `js/core/log.js` — the logging facility the fixtures capture
- `playwright.config.js`, `tests/helpers/fixtures.js`, `tests/helpers/global-setup.js`,
  `tests/helpers/live-reporter.js` — the infrastructure sources
- `tools/ci/pick-tests.mjs`, `tools/ci/test-bg.mjs`, `tools/ci/test-shards.sh` — the runners

---

## Operational field notes

Dated measurements of this box and of CI — boot walls, the two-worker factor,
the instruments that lie here, the real-GPU runs — live in
[`notes/TESTING-FIELD-NOTES.md`](notes/TESTING-FIELD-NOTES.md). They churn with every
measurement; §1-§5 above do not.
