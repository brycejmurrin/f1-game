# Testing reference

111 root Playwright spec files (`tests/specs/*.spec.js`) + 75 `node --test` unit suites
(`tests/unit/*.test.mjs`, plus one `.test.cjs`). Everything under `tests/manual/` is
**excluded from default discovery** (`testIgnore: ["**/manual/**"]` in
`playwright.config.js`) and is run by explicit path — see
[`tests/manual/README.md`](../tests/manual/README.md).

The suite covers physics, behaviour, geometry, cameras, UI, parts, steering,
lighting, scenery, gamepad, timing/field hooks, multiplayer, career, the agent
world view, headless RL, and the tooling contracts that keep the load order and
the docs honest.

---

## 1. How to run tests

### Run them in the background. Always.

A foreground Playwright run on this suite blocks the terminal for minutes and
prints nothing you can act on. The default reporter is `tests/helpers/live-reporter.js`:
one timestamped, immediately-flushed line per test start and end, plus a
30-second heartbeat naming everything still in flight — so a piped log is
genuinely tail-able and a hung test is the one with a `> start` line and no end
line.

```sh
node tools/test-bg.mjs smoke api collision   # start; returns immediately
tail -f artifacts/logs/smoke.log             # watch one
node tools/test-bg.mjs --status              # what is running / how it ended
node tools/test-bg.mjs --wait                # block until all groups finish
node tools/test-bg.mjs --stop                # kill everything still running
```

Each group gets its own free port, its own `artifacts/report-<port>/` and its
own log, so groups cannot tear down each other's web server and a stall is
attributable to one log rather than to "the run". `WORKERS=2` per group is the
default; every worker is a Chromium + SwiftShader process, so total browsers is
groups × workers.

**ONE GROUP AT A TIME on a four-core box.** This line used to read "2-3 groups
is the sweet spot", which contradicted CLAUDE.md's "one heavy group is its full
capacity" — and CLAUDE.md is the one the measurement supports. Running `tiny` +
`circuit` together is 2 groups × 2 workers = four SwiftShader browsers on four
cores; load reached 16.8 and the batch produced **five failures, four of which
were bare 120 s timeouts** (138 s, 148 s, 153 s, 163 s) with a single genuine
assertion failure among them. Four fabricated failures per real one is not a
sweet spot — and each one reads like a product bug until you check the clock.
`test-bg.mjs`'s cap ALLOWS two groups; that is a ceiling, not a recommendation.
Scale the group count to the cores you actually have.

`tools/test-shards.sh` does the same fan-out but WAITS for the result — use it
in CI or when you genuinely want to block.

### Run the groups your change needs, not all of them

The whole suite is roughly 40 minutes of software rendering. Which groups a
change needs is mechanical, so ask:

```sh
node tools/pick-tests.mjs                 # vs the branch point + working tree
node tools/pick-tests.mjs --staged
node tools/pick-tests.mjs js/car/parts.js # explicit paths
node tools/pick-tests.mjs --bg            # ready-to-paste background command
```

The routing rules live in `RULES` at the top of `tools/pick-tests.mjs` and are
deliberately coarse and biased toward running too much — a rule that is too
narrow is a missed regression, one that is too wide costs minutes.
`tests/unit/test-groups.test.mjs` asserts every group they name exists.

### Start here, then widen

| When | Run |
|---|---|
| after any edit | `npm run test:tiny` — page loads, `__apex` responds. If this is red nothing else is worth running |
| in the edit loop | `npm run test:tooling-fast` (~30 s, structural) then the groups `pick-tests` named |
| before pushing | those groups + `npm run test:sweeps` if you touched geometry |
| single spec | `npm test -- tests/<file>.spec.js` |
| single unit suite | `node --test tests/<file>.test.mjs` |

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

**319 `waitForFunction` calls across 97 specs still carry a timeout without
`polling`**, so those bounds are decoration. 43 sites now pass it. The count is
a RATCHET, not a target — `tests/unit/wait-polling.test.mjs` fails if the population
grows, and lowering the ceiling as sites are fixed is the intended direction.
(Count by AST via `tools/wait-polling-lint.mjs`. A grep undercounts the
multi-line calls; this file said 312 for exactly that reason.)

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

What ended it was an instrument. `tests/manual/skid-probe.spec.js` wraps
`GLX.drawSkidBatch` before driving and records call count and max `vertCount`,
because from outside "called with 0" and "never called" are indistinguishable
and have opposite fixes. **37 seconds, against 360 s of timeouts that said
nothing.** When a wait overruns and the call site already carries `polling`,
stop theorising about the wait and go measure whether its condition is reachable
at all.

### Turning diagnostics up

Levels come from `js/log.js`. `APEX_LOG` is written to `localStorage` before any
game script evaluates, so a spec needs no change to become verbose:

```sh
APEX_LOG=scenery:debug npm test -- tests/specs/props-over-road.spec.js
APEX_LOG=debug node tools/test-bg.mjs scenery
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
`tests/unit/test-groups.test.mjs` fails if this table and `package.json` disagree.

### Start-here / breadth

| Group | What it runs |
|---|---|
| `tiny` | page loads, `__apex` present, dev hooks respond. The first thing to run and the first thing to fix |
| `fast` | curated fast subset: smoke + api + collision + offtrack + parts-physics + steering |
| `audit` | coverage guard — every test file must belong to ≥1 topical group (`tools/test-coverage-audit.mjs`) |
| `pick` | print the groups a change needs (`tools/pick-tests.mjs`) — not a test run |
| `bg` | start groups in the background (`tools/test-bg.mjs`) — not a test run |

### Physics & behaviour

| Group | What it runs |
|---|---|
| `physics` | the driving model itself: physics-characterization, physics-fixes, longitudinal, projection, understeer-cue. world-physics and active-aero bill to `behaviour`, elevation-tracks to `circuit`. The 16 per-circuit foundation specs LEFT this group — they contain no driving-model physics, and the `physics-` filename prefix existed only to be caught by this glob, so every driving-model edit paid ~16 circuit builds it could not break while `js/circuits/` edits never ran them. Misgrouped in both directions |
| `foundation` | the 16 per-circuit foundation specs (`tests/specs/*-foundation.spec.js`) — required models present, props clear of the racing surface, terrain grounded, water safe, walls sane. Routed from `js/circuits/` and the track engine, which is what actually breaks them |
| `collision` | car-to-car and wall collision, drift, off-track |
| `behaviour` | world-physics, active-aero, aero-zones. The collision/drift/offtrack members and physics-fixes LEFT in the double-billing dedupe — each spec was running twice whenever two of its groups co-ran, which `pick-tests` makes routine. Coverage is unchanged: the dedupe shipped WITH new `pick-tests` routing (game.js and physics-consts.js now select `collision` and `hooks` too), verified by comparing the SPEC-FILE union before and after, not the group names |
| `barriers` | track wall geometry + the AI-fixes barrier regressions |
| `debris` | the Rapier debris side-world |
| `steering` | presets, sliders, steering modes, gamepad |

### Track & scenery

| Group | What it runs |
|---|---|
| `circuit` | walls + autopilot + elevation + the codebase-audit edge cases |
| `scenery` | props/terrain over road, F1 track accuracy, scenery kits |
| `sweeps` | the full-fleet geometry audits — prop-clipping, scenery-grounding, road-under-floor, coplanar-faces, and the shared-foundation characterization. Each rebuilds all 40 circuits; `coplanar-faces` is the z-fighting ratchet that `clip-audit` structurally cannot see. Runs `--test-concurrency=1` **on purpose** — see below |
| `map` | minimap polyline + orientation |

### Render

| Group | What it runs |
|---|---|
| `webgl` | instanced draw, GL capability probes, lighting A/B, image grade |
| `ab` | the lighting A/B pixel comparison alone |
| `visual` | per-circuit pixel-diff regression (slow) |
| `baseline` | six blessed pixel baselines for menu IDENTITY — colour, type, spacing (fast) |
| `shimmer` | does baked tarmac crawl under motion |
| `tlx` | the three.js/TSL backend probes |
| `webgpu-lifecycle` | WGX resource lifecycle, as a pure unit suite |

### Car & UI

| Group | What it runs |
|---|---|
| `parts` | catalog, budget, persistence, recipes, factory presets, mesh caches, liveries, ERS, the car viewer, garage aero |
| `ui` | UI behaviour and layout: button/touch, UI scale, HUD layout + audit, menu survey + keyboard (slow) |
| `gallery` | `ui-audit.spec.js` alone — a CAPTURE HARNESS whose product is a PNG gallery, run **on demand**. It asserts nothing beyond "the screen appeared", so its 39 green ticks were being counted as `ui` coverage while dominating that group's wall time (13-108 s per shot). No `pick-tests` rule routes to it: galleries are run on purpose, like `tests/manual/`. `test:audit` still sees it, so it cannot go orphan |
| `camera` | the 13 camera modes, camera + driving hooks, the camera tuner |
| `audio` | WebAudio engine/sfx smoke + the music library |

### Modes, data & multiplayer

| Group | What it runs |
|---|---|
| `modes` | season, time trial, career, qualifying |
| `career` | career + qualifying alone: the mode axes, the save, the hub, the grid |
| `net` | multiplayer in a browser: car roles, the per-car input seam, the session, the lobby, the waiting room, and the camera SCAN (a real `getUserMedia` against a Y4M of a real QR that Chromium plays as a webcam) |
| `net-unit` | the `js/net` wire as pure logic, no browser: loopback transport, invite codec, snapshot quantisation, clock sync. Under a second |
| `service-worker` | the SW's install/fetch/version behaviour |

### API & agent surfaces

| Group | What it runs |
|---|---|
| `api` | the `__apex` contract: dev-tools, headless, obs/act, new hooks, data lifecycle, telemetry compare, assets, logging, the race wake lock |
| `hooks` | camera / driving / map / new `__apex` hook contracts |
| `agent` | the agent world view: world, trackInfo, scene, rollout, determinism, the drive bench |
| `agent-contract` | freezes the shape of the agent-view API |
| `smoke` | page load + `__apex` available |

### Tooling contracts (`node --test`, no browser)

| Group | What it runs |
|---|---|
| `tooling` | every Node contract suite — chains `test:tooling-fast` then `test:sweeps` (the sweeps run `--test-concurrency=1`, see below) |
| `tooling-fast` | the structural half in ~30 s — load order, docs integrity, test groups, api contracts, css layer discipline, graph, validators. The full-fleet sweeps dominate `tooling`; this is everything else, for the edit loop |
| `paths` | output paths are port-scoped and self-creating |
| `graph-parity` | builds each track from a baseline ref AND the working tree and diffs prop geometry vertex for vertex (`tools/graph-parity.cjs`) |
| `float` | floating-prop audit (`tools/float-audit.cjs`) |
| `clip` | prop-clipping gate (`tools/clip-audit.cjs`) |

### Partitions (not topical — they do not count for coverage)

| Group | What it runs |
|---|---|
| `headless` | the whole `headless` project (all non-render specs, no GPU) |
| `render` | the `render` project only (screenshots/pixel/GL) at `--workers=4` |
| `update` | the whole suite with `--update-snapshots` |

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

The npm wrapper (`tools/run-playwright.mjs`) starts an in-process static server
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

Run several GROUPS concurrently instead (`tools/test-bg.mjs`) — those are
separate processes with separate ports, and the sizing guidance above applies.

### Output

| Path | Contents |
|---|---|
| `artifacts/report-<port>/` | HTML report |
| `artifacts/test-results-<port>/` | failures, traces, attachments, JUnit |
| `artifacts/galleries-<port>/<suite>/` | screenshots and suite-emitted reports |
| `artifacts/logs/` | background-run and shard logs |

All gitignored. Tracked golden baselines live in `tests/*-snapshots/` and stay
outside these roots — but only ONE suite has any: `menu-baseline.spec.js` has
six (title/select/garage × desktop/phone-landscape), so `npm run test:baseline`
is a real gate. `tracks-visual.spec.js` has none, so `npm run test:visual`
SKIPS itself rather than failing 40 circuits on missing snapshots; generating
them on Linux/SwiftShader is still outstanding, and the suite re-enables itself
automatically once the directory exists.

### Fixtures (`tests/helpers/fixtures.js`)

Import `test` and `expect` from `./fixtures.js` instead of `@playwright/test`:

| Fixture | What it provides |
|---|---|
| `context` (auto) | injects `window.__TEST_MODE = true` and the `APEX_LOG` level; mocks all Jolpica + OpenF1 calls with stub JSON so runs are offline and deterministic; starts console capture on every page |
| `pageErrors` | `string[]` of uncaught JS exceptions — assert `toHaveLength(0)` after exercising game logic |
| `consoleLines` | `string[]` of every console line and page error, type-prefixed, favicon noise stripped. Prefer this to a hand-rolled `page.on("console", …)` — the hand-rolled ones drifted into a dozen slightly different filters |
| `racePage` | navigates to `/` and waits for `window.__apex` (10 s) |
| `loadTrack` | `loadTrack(id, tod, wx)` — the goto → wait → `race()` → wait built → `go()` block, with unified timeouts. **Adoption is partial**: 58 of 111 specs import `tests/helpers/fixtures.js`; the rest still hand-roll a near-identical helper (`load`, `waitReady`, `startRace`, `boot`) and therefore get NO failure attachments. `tools/fixture-consumer-audit.mjs` ratchets the count so it cannot go backwards — migrate a spec, then raise its `FLOOR` |

`tools/fixture-consumer-audit.mjs` enforces the import for the specs that depend
on those guarantees (`audio-smoke`, `smoke`, `f1-track-accuracy`, `ui-audit`).
Other specs may use the base Playwright fixture.

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
happily; UI-flow specs do not.

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
  RENDERING (`js/game/apex.js` `headless()`), so a test that sets a value in one
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
CLAUDE.md's standing rule is that a timeout on four cores measures the machine.
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

If a guard needs history, the job needs `fetch-depth: 0` — today only the sweeps
job has it, which is also why `pick-tests`' merge-base default cannot work in
the guards job.

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
| `logging.spec.js` | `js/log.js` in a real page: `Log` live before any game module evaluates, retention never lagging the console level, single namespace prefix, records flattened rather than holding references, `logs()` filters, a bad spec ignored not thrown |
| `persistence.spec.js` | localStorage failing is REPORTED (Log + `persistState()`) and the session still reads back what it wrote — the silent-data-loss case: iOS Private Browsing sets the quota to 0 |
| `wake-lock.spec.js` | the screen wake lock held for the duration of a race: requested on start, released on finish and on a mid-race quit (no results screen), released on hide and re-acquired on return, and degrades silently when the API is missing or its request rejects |

### Physics & behaviour

| Spec | What it covers |
|---|---|
| `world-physics.spec.js` | the player integrates a bicycle model in WORLD space; `(s, x)` is read back, not authoritative |
| `physics-fixes.spec.js` | the physics/collision robustness pass |
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
| `debris.spec.js` | the Rapier debris side-world — and that it never moves a game car |
| `race-control.spec.js` | the CAUTION layer in a real page: defaults ON, and the setting survives a reload (which is the guard on its storage format). The machine itself is `race-control.test.mjs` |
| `autopilot.spec.js` | a closed-loop driver that actually completes laps (monza, suzuka) |
| `presets.spec.js` | RELAX / STANDARD / PRO each push the sliders somewhere distinct |
| `sliders.spec.js` | every pause-menu slider is wired and persists |
| `touch-steer.spec.js` | canvas touch steering as an anchored DRAG (proportional, relative, ramped on release, most-recently-MOVED finger wins), the on-screen arrows ramping like a key, and pedal TRAVEL on the touch pedals reaching the physics |
| `tilt-pipeline.spec.js` | the tilt chain end to end — dead zone (subtracted, so no step at its edge), the `MAX_TILT` map and its `steerToTilt` inverse, the 1.6x release/tighten slew asymmetry, calibrating out a held grip offset, One-Euro smoothing as lag rather than gain, and the LIVE `deviceorientation` path pinned to the harness |
| `understeer-cue.spec.js` | the front-axle saturation haptic: it fires when the front stops answering the steering, stays quiet under gentle input, below the 1.5 m/s floor and off-track, repeats no faster than its cooldown allows, tightens with saturation depth, and at the same DEPTH in the grip envelope responds identically at any PACE |
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
| `tracks-visual.spec.js` | per-circuit pixel-diff regression (all 40 circuits × 6 fractions) — **skipped: no baselines committed** |
| `terrain-over-road.spec.js` | all-circuit audit: no terrain or verge triangle renders above the racing line. Point-in-triangle vs the asphalt; large road-over-road is ignored as an intentional crossover (Suzuka's figure-8) |
| `props-over-road.spec.js` | all-circuit audit: no PROP triangle sits on/above the racing line, in 3D, 0.2–5 m above the road. Per-track `BASELINE` caps document justified overheads (Miami's beach canopy, Mexico's Foro Sol, gantries) |
| `prop-clipping.test.mjs` | ratchet: prop-vs-prop interpenetration must not grow |
| `scenery-grounding.test.mjs` | ratchet: FLOATING scenery must not grow — the vertical axis, gating `tools/float-audit.cjs` against `tools/float-baseline.json`. Same semantics as prop-clipping: absent circuit must read 0, listed circuit fails on growth, a cap above the measured count fails as slack. `npm run test:float` existed for a while but was in no CI job and behind no test, and could not have been wired up as-is — it exits 1 on any floater and 37 of 40 circuits have some |
| `component-inventory.test.mjs` | docs/COMPONENTS.md must name every class family in `css/`, name none that has left, and keep the dead-class list accurate — a map that silently rots is worse than none, because it is trusted |
| `road-under-floor.test.mjs` | no visible road surface may sit below the flat floor plane |
| `coplanar-faces.test.mjs` | ratchet: SAME-FACING coplanar faces — the pairs that z-fight at every distance, which `clip-audit` structurally cannot see |
| `f1-track-accuracy.spec.js` | `CircuitPaths` OSM traces vs a pinned subset of real GeoJSON outlines (direction, shape) |
| `track-foundation.test.mjs` | Node contracts for TrackSpace, TrackSurface, TrackModels, atomic diagnostics, terrain grounding, mesh validation |
| `track-maps-corners.test.mjs` | turn class = radius + heading-sweep (not raw \|k\|); Monza includes Curva Grande; Spa La Source HAIRPIN / Eau Rouge FAST |
| `track-graph.test.mjs` | the scenery model library + node graph, and `batches()` |
| `scenery-kits.test.mjs` | Node contracts for deterministic themes, every LandmarkKit form and CircuitKit facility, bounded counts, budgets, fail-closed behaviour |
| `scenery-kits.spec.js` | the browser binding of those kits into Silverstone's `scenery(api)` |
| `scenery-api-contract.test.mjs` | freezes the 109-member `scenery(api)` surface across the `js/track/scenery-*.js` split |
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
| `material-shimmer.spec.js` | does baked tarmac CRAWL when the car moves |
| `tlx-probes.spec.js` | the three.js/TSL backend behind `apex26.gfxBackend="three"` |
| `webgpu-lifecycle.test.mjs` | WGX resource lifecycle |
| `assets-pack.test.mjs` | the baked pack on disk: licence allow-list, md5, size budget |
| `import-models.test.mjs` | the AX26 model-import output and its determinism |

### Car & parts

| Spec | What it covers |
|---|---|
| `parts-physics.spec.js` | the unified resolver, visual-field ownership, consumed-mesh uniqueness, geometry/triangle budgets, surface/material semantics, static-emissive bounds, signatures, factory presets, physics/costs |
| `parts-catalog.spec.js` | the category setup UI, universal/supplier/signature/factory badges, access filtering, chip interaction |
| `parts-budget.spec.js` | the 600 cr budget UI and the unlimited toggle |
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
| `ui-button-touch.spec.js` | button/touch steer mode: auto-throttle, disabled calibrate, race-settings layout; the lighting tuner's FREE CAMERA touch sticks (drag registers, no latch when the overlay is pulled away mid-hold, a cancelled scene drag releases) and its layout clearing the docked panel at every UI SIZE |
| `ui-desktop.spec.js` | desktop layout (`body.desktop`), keyboard controls, non-touch UI |
| `ui-scale.spec.js` | UI SIZE / HUD SIZE — every main screen still fits at 80/100/130/150 %, the two scales stay independent, and the HUD clusters stay on screen. Containment only, never absolute sizes; the exhaustive matrix is `--scale=` on the three fit tools |
| `hud-layout.spec.js` | touch control + HUD layout across every steering and gearbox mode |
| `hud-audit.spec.js` | HUD screenshots + mode-dependent elements |
| `menu-survey.spec.js` | click every button, capture every state |
| `menu-keyboard.spec.js` | desktop menu input — wheel redirection and arrow/Home/End/PageUp/PageDown focus; an open modal outranks the screen behind it; ESCAPE IS BACK (every layer's `data-esc-close` resolves, picker/garage/title, and a sheet closes without resuming the race) |
| `menu-baseline.spec.js` | SIX blessed pixel baselines (title/select/garage x landscape-phone/desktop) — the IDENTITY half `tools/layout-audit.mjs` structurally cannot see: colour, type, weight, spacing. Deliberately six, not 380: a suite that asks a human to bless 380 images gets rubber-stamped |
| `camera.spec.js` | all 13 player camera modes, via the hook and the CAM button |
| `camera-hooks.spec.js` | `dolly()`, `roadside()`, `tourShots()` |
| `camera-driving-hooks.spec.js` | orbit fov, cinematic, `carOrbit()` |
| `camera-tuner.spec.js` | per-mode framing offsets, knob→vantage geometry, mode isolation, clamp/persist/reset |

### Modes, data, audio

| Spec | What it covers |
|---|---|
| `season.spec.js` | round progression, points, standings visibility |
| `time-trial.spec.js` | ghost recording, ghost delta HUD, sector-split announces |
| `career.spec.js` | the save and its six slots, the mode axes, the hub, a settled round, ratings, the R&D garage, MY TEAM, objectives/contracts/rollover, reliability, EXTRA FUNDS never raising the fitted cap, the facility, the hire's contract, sponsors — and that career development never reaches a Grand Prix |
| `quali.spec.js` | one-lap qualifying: the simulated field and its spread, the sheet's two states, the grid being the qualifying order car-for-car, every round qualifying, and no classification leaking into the race |
| `data-lifecycle.spec.js` | data hub session plumbing — meeting/year/session/driver responses own their option lists |
| `telemetry-compare.spec.js` | TELEMETRY multi-lane compare and cross-session (one driver's race vs quali) |
| `telemetry-trace.test.mjs` | GPS-trace sanity and the playback dot's motion |
| `audio-smoke.spec.js` | the WebAudio engine/sfx initialise and respond, objectively |
| `music-library.spec.js` | the bring-your-own-music library and the Spotify backend |

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
| `net-rendezvous.test.mjs` | the room-code client against a real relay |
| `net-trystero-api.test.mjs` | the vendored Trystero surface actually used |

### Tooling & repo contracts

| Spec | What it covers |
|---|---|
| `load-order.test.mjs` | `index.html` and `tools/carview.html` `<script>` order matches `tools/manifest.cjs` exactly, including `HARD_EDGES` eval-time dependencies |
| `vstd-invariant.test.mjs` | the PACE invariant as a lint (`tools/vstd-lint.mjs`): no speed in `js/game.js` is divided by `VMAX` or compared against a bare literal outside the reviewed allow-list, so the OVERALL SPEED slider cannot silently shrink the player's envelope again |
| `module-size.test.mjs` | RATCHET on the big modules' line counts — lower a ceiling when you extract; raising one is a deliberate edit with a reason in the commit |
| `ui-improve-pass.test.mjs` | CssZoom load order + API surface; data-hub UI SIZE zoom; garage livery grid wiring; select track filter persistence |
| `css-comments.test.mjs` | a CSS comment that ends early (or never opens) turns prose into a selector and DROPS the rule after it, silently — caught by measuring prelude length (real max 173, the two live failures were 275 and 759) |
| `css-tokens.test.mjs` | every custom property in `css/tokens.css` must have a consumer — an unread token is an invitation to use a value nobody has been maintaining |
| `light-presets.test.mjs` | the 1,921 shipped lighting values must name real `TUNE_DEFS` ids — a renamed knob does not throw, the lookup just misses and the shipped look silently stops applying |
| `light-store-copy.test.mjs` | the tuner's COPY ALL fan-out (`LightStore.copyToTracks`): which profiles a copy writes, what each target then resolves to in either mode, that storage stays sparse, and that undo is exact |
| `silent-catch.test.mjs` | a RATCHET on bare `catch (e) {}` — silent failure is this repo's most-repeated defect shape; the escape hatch is a COMMENT saying why, which is the sentence that was always missing |
| `hooks-documented.test.mjs` | every `__apex` hook must have a section in `docs/DEBUG-HOOKS.md` — a RATCHET over the 28 that already had none, so nothing NEW joins them |
| `race-control.test.mjs` | the caution state machine in a VM — thresholds, the raise-fast/lower-slow hysteresis, the hard time caps, drop-on-disable, host vs guest, and the leader's-lap rule behind OVERTAKE |
| `camera-ride.test.mjs` | `GameCams.vantage` in a VM over a synthetic hill: the chase rig must not turn the road's fine undulation into camera bob on a gradient (measured against a raw two-point rig on the same profile), while still framing flat road and constant slopes exactly as before, still climbing the hill, and still honouring the ground clamp. The elevation profile is an argument here, so the threshold pins the CAMERA rather than whatever terrain a circuit happens to ship |
| `terrain-normals.test.mjs` | the terrain ribbon must be shaded by its own shape: `TrackMesh.buildTerrain` normals are unit length, point up, and carry real tilt spread on both a street and an open circuit. `buildTerrain` shipped `nrm.push(0, 1, 0)` for every vertex — an embankment, a banked verge and a flat runoff all took identical sun — and nothing caught it, because a constant normal throws nothing and changes no vertex count |
| `comment-citations.test.mjs` | a `other-file.js:412` comment citation must point at a line that EXISTS, plus a RATCHET on how many there are — a line number in another file cannot be kept true, so cite the symbol |
| `docs-integrity.test.mjs` | live docs, skills AND source comments reference only files that exist; CLAUDE.md's suite counts, the scenery-api member count, the renderer-backend list, and the skills/tools/docs indexes all match the repo |
| `test-groups.test.mjs` | the taxonomy: pick-tests rules name real groups and route every source dir; this document lists every group and every test file; `RENDER_SPECS` partitions cleanly; the manual suites stay out of default discovery |
| `circuit-def-fields.test.mjs` | every field authored in `js/circuits/<id>.js` survives the field-by-field copy into `Tracks.LIST`, or is named engine-only with a reason — an uncopied field reads as `undefined` at every consumer, silently, and the circuit renders as though it was never written |
| `backend-surface-parity.test.mjs` | every name GLX publishes is an own property of WGX and TLX (`undefined` allowed, absent not) — game.js installs a backend by descriptor-copy, so an absent name keeps GLX's own function running against a null `gl`/`CHK`, and every feature test for it passes before throwing |
| `test-coverage-audit.test.mjs` | the coverage auditor itself |
| `pick-tests.test.mjs` | the SELECTOR's own contract, upstream of the taxonomy: `--since <ref>` reads a ref and not a path (it swallowed the ref as a filename and answered "nothing to run" for every diff, for as long as the flag had existed), `--json` reports a `reason` CI can branch on rather than prose that happens to contain a `test:` token, and the default diff base is the DEPLOY branch — `main` is a stale fork here, so merge-basing against it balloons the changed set to most of the repo and the tool gives up silently, dressed as an answer |
| `test-observed.test.mjs` | the never-run detector's title extraction matches the reporter's EXACTLY. A title derived differently reads as "never observed" forever, and a tool that cries wolf on every spec gets ignored — the same outcome as not having it. Its first version missed Playwright's implicit suite title (a top-level test prints as `file › basename › title`, one inside a describe does not) and reported every describe-less spec as 100% never-run, including one verified green minutes earlier |
| `evaluate-scope-lint.test.mjs` | no `page.evaluate()` callback closes over a Node-side binding — the callback runs in the BROWSER, so a module `const` read inside it is a `ReferenceError` there, not a closure. Anti-vacuity: one case asserts the lint still finds both real sites in `58614db2`, the commit whose two launch constants killed every elevation track, so the analysis cannot silently stop resolving bindings while the synthetic cases keep passing |
| `cache-bump-only.test.mjs` | the one exemption change-aware CI may make to the infra gate: an `index.html` diff that is PURELY a `?v=N` rewrite is not a load-order change. Line counts are not enough to decide it — `af05fa98` is +156/-156 and smuggles a real markup edit through, so the check pairs lines POSITIONALLY and a reordered script block cannot pass as a bump |
| `wait-polling.test.mjs` | the ratchet on waits whose declared timeout cannot fire. `waitForFunction` polls on `requestAnimationFrame` by default and the game's render loop starves it — measured at 109,665 ms against a declared 3,000 ms — so 353 call sites carry a bound that is decoration. Frozen rather than swept: rewriting 300 sites in one commit would be a behavioural change with no run behind it. `tests/manual/timeout-probe.spec.js` is exempt and must stay so, because it exists to measure the default |
| `tests-split.test.mjs` | the `tests/` split's PLAN, pinned before the move runs: every spec/suite/helper lands in exactly one bucket, `data/` and `manual/` stay, a snapshot dir follows its spec (Playwright resolves those spec-relative, and a missed move reads as "baseline missing" — which `--update-snapshots` would then re-bless), and the derived rewrites cover the ⚠ swallowed `f1-api-mock` imports nobody has to remember. Two cases guard the tool against itself: **history is never rewritten** (archived docs, dated research records and stored workflow scripts describe the tree as it WAS — the first plan would have falsified 700+ lines of it), and it does not rewrite its own header, which documents the move. A scratch-tree case caught a real bug: `rel()` ignored its `root` argument, so every check against the real repo passed while a foreign tree found zero references |
| `select-budget.test.mjs` | guards `tools/select-budget.mjs`, the arithmetic behind the change-aware CI decision. Pins the MODEL and not the constants: the measured 79.7 s/test is expected to move when CI is re-measured, but the shape must not — a failure costs `timeout x (1 + retries)`, capacity falls as survivable failures rise, and a budget smaller than one failure must report **0** rather than a positive number for a job that dies on the first red test. One case pins the design conclusion itself (cutting the failure cost buys more than doubling the budget) so it cannot quietly stop being true |
| `select-specs.test.mjs` | guards `tools/select-specs.mjs` AND `tools/select-recall.mjs`. Glob expansion, dedupe, the budget cut, the own-`setTimeout` exclusion, the TRACKED infra list (both directions), the import-graph helper→spec walk, fail-fast ordering, and the FAULTY-CHANGE RECALL ratchet — no spec that caught a real regression may be dropped in silence. **Why not coverage-derived TIA:** Fowler's survey is explicit that building a per-test coverage map requires running tests ONE AT A TIME, which against a ~40-minute SwiftShader suite is a non-starter, and the map then needs constant refresh. The path RULES plus the import graph buy most of the signal for none of that cost. | guards `tools/select-specs.mjs`, the per-spec selector behind ci.yml's advisory `selected` job. Glob expansion against the real tree, dedupe across groups, the budget cut (every spec lands in selected OR the named skip list — silent truncation would read as "covered"), and that the ADVISORY settings (retries 0, 120 s/test) provably fit more tests than smoke's gate settings — the whole reason the job exists |
| `ci-coverage.test.mjs` | guards `tools/ci-coverage.mjs`, which answers what the deploy gate actually executes — today **2 of 111 Playwright specs**, with 109 gated by nothing. Pins the MECHANISM and never the number: the count is meant to move as the gate grows, and a test that froze it would just be a chore. Anti-vacuity is the load-bearing case — a broken `ci.yml` parse would report "CI executes 0 specs", which reads as an alarming finding rather than as a broken tool. One case deliberately names a spec that MUST NOT exist, so the resolver is shown to reject it |
| `cross-file-paths.test.mjs` | every relative reference in `tests/` and `tools/` — static import, dynamic `import()`, `require()`, `new URL(rel, import.meta.url)` — resolves to a file that exists. Landed BEFORE the `tests/` split, because a guard that arrives after the commit it was meant to protect has protected nothing. The silent class it exists for: `fit-audit.mjs`/`menu-fit.mjs` wrap their `../tests/helpers/f1-api-mock.js` import in a `catch` that is correct at runtime and fatal to a move — afterwards both tools quietly audit an empty data hub with nothing red anywhere. Anti-vacuity: one case builds a moved-file-with-stale-`../` in a temp dir and requires a complaint |
| `assert-audit.test.mjs` | no test in the default suite is VACUOUS — a body with no assertion passes as long as the page does not throw, so it is a green tick that means nothing. The ratchet exempts an allow-list of capture harnesses (`ui-audit`, `ui-desktop`, whose product is a PNG gallery) and asserts they still are ones. Two cases pin the tool's own failure mode: an assertion reached only through a same-file helper still counts, because a body-only scan calls hud-audit's eight steer-mode tests vacuous and a report that is 20% false gets ignored |
| `fixture-consumer-audit.test.mjs` | the specs that must import `tests/helpers/fixtures.js` do |
| `component-inventory.test.mjs` | the class families in `css/` match `docs/COMPONENTS.md` — a class defined in one file and used from another is the drift this catches |
| `span-kinds.test.mjs` | the agent view's span vocabulary matches the `ctx.noteSpan(...)` emitters — the list had fallen four kinds behind, so any circuit placing a tiered bowl failed `agent-view.spec.js` with a message that pointed nowhere near the cause |
| `css-layers.test.mjs` | every rule in a `@layer`-wrapped stylesheet stays inside its declared layer — an unlayered rule (a stray brace closing the layer early) silently outranks every layered rule regardless of specificity, with no parse error and no console warning |
| `deploy-staging.test.mjs` | the Pages workflow uploads an allow-list of directories — every path the shipped code can fetch must be inside it, or it 404s in production while passing every local run |
| `service-worker.test.mjs` | the SW's install/fetch/version-guard behaviour |
| `perf-sentinel.test.mjs` | the crash sentinel's memory must not outlive the crash |
| `perf-governor.test.mjs` | the adaptive-resolution governor: the budget derives from the observed floor of frame intervals rather than a hardcoded 60 fps, so a device capped externally (iOS Low Power Mode's 30 fps throttle) settles at full quality instead of the resolution floor with every feature shed; a genuinely GPU-bound device still downscales and holds; a reverted step does not repeat forever |
| `output-paths.spec.js` | gallery paths are port-scoped and create their parents |

---

## See also

- [`tests/manual/README.md`](../tests/manual/README.md) — the human-run suites
- `docs/DEBUG-HOOKS.md` — the full `__apex` reference
- `js/log.js` — the logging facility the fixtures capture
- `playwright.config.js`, `tests/helpers/fixtures.js`, `tests/helpers/global-setup.js`,
  `tests/helpers/live-reporter.js` — the infrastructure sources
- `tools/pick-tests.mjs`, `tools/test-bg.mjs`, `tools/test-shards.sh` — the runners
