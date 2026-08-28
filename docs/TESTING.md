# Testing reference

115 root Playwright spec files (`tests/specs/*.spec.js`) + 130 `node --test` unit suites
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
node tools/test-bg.mjs smoke api collision   # SEQUENTIAL: one group, then the next
node tools/test-bg.mjs --parallel smoke api  # old concurrent start (core-capped)
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
is the sweet spot", which contradicted AGENTS.md's "one heavy group is its full
capacity" — and AGENTS.md is the one the measurement supports. Running `tiny` +
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
narrow is a missed regression, one that is too wide costs 10-40 minutes of
serialized SwiftShader per extra browser group. The cap lives at the RUN, not
the rule: AGENTS.md's verification policy is two browser groups per change,
the rest named as not-run in the PR.
`tests/unit/test-groups.test.mjs` asserts every group they name exists.

When the named group is much bigger than the change, select SPECS instead of
groups — `tools/select-specs.mjs` decomposes the picked groups into spec files
under a time budget and names everything it skipped:

```sh
node tools/select-specs.mjs --since <ref>              # spec list, one per line
node tools/select-specs.mjs --since <ref> --budget-min 15
```

It powers the blocking change-aware CI gate and is just as useful interactively; a
single spec (`npm test -- tests/specs/<file>.spec.js`) is always preferable to
its whole group when the change touches that spec's subject and nothing else.

### The edit loop is Node-only; browser specs run ONCE, at the end

Tests serve `js/` and `css/` from the working tree, so a browser run in
flight forbids source edits — which means the efficient session shape is not
"edit, run browsers, edit, run browsers" but: make ALL the source edits,
verify once, bump the cache, commit. Re-running browser specs after every
edit buys no additional safety over running them once at the end; it just
serializes the agent behind SwiftShader several times over.

| When | Run |
|---|---|
| in the edit loop | `npm run test:tooling-fast` (~30 s, structural, no browser) |
| track/scenery edit | `node tools/verify-track.cjs <id>` (2 s, headless) FIRST |
| once, when the edits are done | `node tools/test-bg.mjs tiny` — page loads, `__apex` responds; if red, nothing else is worth running — then the groups `pick-tests` named (capped at two) |
| before pushing | + `npm run test:sweeps` if you touched geometry |
| single spec | `npm test -- tests/<file>.spec.js` |
| single unit suite | `node --test tests/<file>.test.mjs` |

While a browser batch runs in the background, do work that does not touch
`js/`/`css/` (docs, tools, unit tests) or end the turn — idle-watching the
log converts the whole batch cost into agent wall time. Shipping with a
named, deliberate gap ("group X not run, here is why") is an allowed
outcome; silently skipping is not.

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

**382 `waitForFunction` calls across 123 files still carry a timeout without
`polling`**, so those bounds are decoration — 312 of them under `tests/` (96
files) and 70 under `tools/` (27 files, `layout-audit.mjs` alone holding 24).
The count is a RATCHET, not a target — `tests/unit/wait-polling.test.mjs` fails
if the population grows, and lowering the ceiling as sites are fixed is the
intended direction. (Count by AST via `tools/wait-polling-lint.mjs`. A grep
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
| `physics` | the driving model itself: physics-characterization, physics-fixes, physics-hotpath, longitudinal, projection, understeer-cue. world-physics and active-aero bill to `behaviour`, elevation-tracks to `circuit`. The 16 per-circuit foundation specs LEFT this group — they contain no driving-model physics, and the `physics-` filename prefix existed only to be caught by this glob, so every driving-model edit paid ~16 circuit builds it could not break while `js/circuits/` edits never ran them. Misgrouped in both directions |
| `foundation` | the 16 per-circuit foundation specs (`tests/specs/*-foundation.spec.js`) — required models present, props clear of the racing surface, terrain grounded, water safe, walls sane. Routed from `js/circuits/` and the track engine, which is what actually breaks them |
| `collision` | car-to-car and wall collision, drift, off-track |
| `behaviour` | world-physics, active-aero, aero-zones. The collision/drift/offtrack members and physics-fixes LEFT in the double-billing dedupe — each spec was running twice whenever two of its groups co-ran, which `pick-tests` makes routine. Coverage is unchanged: the dedupe shipped WITH new `pick-tests` routing (game.js and physics-consts.js now select `collision` and `hooks` too), verified by comparing the SPEC-FILE union before and after, not the group names |
| `debris` | the Rapier debris side-world |
| `steering` | presets, sliders, steering modes, gamepad |
| `steering-unit` | braking CUE math in Node — slider 1 is OFF, urgency is 0..1 never a brake command |

### Track & scenery

| Group | What it runs |
|---|---|
| `circuit` | walls + autopilot + elevation + the codebase-audit edge cases |
| `scenery` | props/terrain over road, F1 track accuracy, scenery kits |
| `sweeps` | the full-fleet geometry audits — prop-clipping, scenery-grounding, road-under-floor, coplanar-faces, debris-hazard-hint, spline-project-height, and the shared-foundation characterization. Each rebuilds circuits through `tools/track-build-vm.cjs`; `coplanar-faces` is the z-fighting ratchet that `clip-audit` structurally cannot see. Runs `--test-concurrency=1` **on purpose** — see below |
| `map` | minimap polyline + orientation |

### Render

| Group | What it runs |
|---|---|
| `webgl` | instanced draw, GL capability probes, lighting A/B, image grade |
| `ab` | the lighting A/B pixel comparison alone |
| `baseline` | six blessed pixel baselines for menu IDENTITY — colour, type, spacing (fast) |
| `shimmer` | does baked tarmac crawl under motion |
| `tlx` | the three.js/TSL backend probes |
| `webgpu-lifecycle` | WGX/TLX resource and software-present lifecycle, as a pure unit suite |

### Car & UI

| Group | What it runs |
|---|---|
| `parts` | catalog, budget, persistence, recipes, factory presets, mesh caches, liveries, ERS, the car viewer, garage aero |
| `ui` | UI behaviour and layout: button/touch, UI scale, HUD layout + audit, menu survey + keyboard (slow) |
| `gallery` | `ui-audit.spec.js` alone — a CAPTURE HARNESS whose product is a PNG gallery, run **on demand**. It asserts nothing beyond "the screen appeared", so its 39 green ticks were being counted as `ui` coverage while dominating that group's wall time (13-108 s per shot). No `pick-tests` rule routes to it: galleries are run on purpose, like `tests/manual/`. `test:audit` still sees it, so it cannot go orphan |
| `camera` | the 13 camera modes, camera + driving hooks, the camera tuner |
| `audio` | WebAudio engine/sfx smoke + the music library |
| `audio-unit` | Spotify token refresh ownership, rotation races, and retryable failures in a Node VM |

### Modes, data & multiplayer

| Group | What it runs |
|---|---|
| `modes` | season, time trial, career, qualifying |
| `net` | multiplayer in a browser: car roles, the per-car input seam, the session, the lobby, the waiting room, and the camera SCAN (a real `getUserMedia` against a Y4M of a real QR that Chromium plays as a webcam) |
| `net-unit` | the `js/net` wire as pure logic, no browser: loopback transport, invite codec, snapshot quantisation, clock sync. Under a second |
| `service-worker` | the SW's install/fetch/version behaviour |
| `lifecycle-unit` | deferred scanner, data fetch and IndexedDB ownership races in Node VMs |
| `state-unit` | season, storage and career state machines, including cross-tab conflicts |

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
| `tooling-fast` | the structural half in ~30 s — **one file at a time** via `tools/tooling-fast.mjs` (`--test-concurrency=1`) with START/PASS/FAIL + `not ok` names on stdout and `artifacts/logs/tooling-fast.log`. Load order, docs integrity, test groups, api contracts, css layer discipline, graph, validators. The full-fleet sweeps dominate `tooling`; this is everything else, for the edit loop |
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
| `racePage` | navigates to `/` and waits for `window.__apex` (10 s) |
| `loadTrack` | `loadTrack(id, tod, wx)` — the goto → wait → `race()` → wait built → `go()` block, with unified timeouts. **Adoption is partial**: 61 of 113 specs import `tests/helpers/fixtures.js`; the rest still hand-roll a near-identical helper (`load`, `waitReady`, `startRace`, `boot`) and therefore get NO failure attachments. `tools/fixture-consumer-audit.mjs` ratchets the count so it cannot go backwards — migrate a spec, then raise its `FLOOR` |

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
| `aero-zones-turns.test.mjs` | `AERO_ZONE_TURNS` (`js/game/aerozones.js`) reproduces exactly the length-only `ZONE_COUNT` selection in turn-keyed form for every named circuit; bahrain/jeddah never get a turn-pair entry |
| `debris.spec.js` | the Rapier debris side-world — and that it never moves a game car |
| `race-control.spec.js` | the CAUTION layer in a real page: defaults ON, and the setting survives a reload (which is the guard on its storage format). The machine itself is `race-control.test.mjs` |
| `autopilot.spec.js` | a closed-loop driver that actually completes laps (monza, suzuka) |
| `presets.spec.js` | RELAX / STANDARD / PRO each push the sliders somewhere distinct |
| `sliders.spec.js` | every pause-menu slider is wired and persists |
| `touch-steer.spec.js` | canvas touch steering as an anchored DRAG (proportional, relative, ramped on release, most-recently-MOVED finger wins), the on-screen arrows ramping like a key, and pedal TRAVEL on the touch pedals reaching the physics |
| `tilt-pipeline.spec.js` | the tilt chain end to end — dead zone (subtracted, so no step at its edge), the `MAX_TILT` map and its `steerToTilt` inverse, the 1.6x release/tighten slew asymmetry, calibrating out a held grip offset, One-Euro smoothing as lag rather than gain, and the LIVE `deviceorientation` path pinned to the harness |
| `understeer-cue.spec.js` | the front-axle saturation haptic: it fires when the front stops answering the steering, stays quiet under gentle input, below the 1.5 m/s floor and off-track, repeats no faster than its cooldown allows, tightens with saturation depth, and at the same DEPTH in the grip envelope responds identically at any PACE |
| `brake-cue.test.mjs` | braking CUE math in `js/game/brake-cue.js`: slider 1 is OFF, urgency is 0 when the apex is already made, braking already done cuts the pulse, and the function returns 0..1 never a brake command |
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
| `scenery-grounding.test.mjs` | ratchet: FLOATING scenery must not grow — the vertical axis, gating `tools/float-audit.cjs` against `tools/float-baseline.json`. Same semantics as prop-clipping: absent circuit must read 0, listed circuit fails on growth, a cap above the measured count fails as slack. `npm run test:float` existed for a while but was in no CI job and behind no test, and could not have been wired up as-is — it exits 1 on any floater and 37 of 40 circuits have some |
| `lamp-fixture-anchor.test.mjs` | all-circuit, STRICT ZERO on both axes of the night-lighting anchor: (a) no light record with `glareW > 0` may sit off a registered fixture — `drawGlow` paints a halo billboard for those, and the three start-gantry downlights shipped at `glareW 0.3` unparented (three orbs over every start line; Jeddah's whole tunnel was 311 of them, its poles having registered no lights at all); (b) no registered fixture's radius may stop short of the road — the `(1-(d/r)^4)^2` window is exactly 0 past `r`, and Bahrain's 39 m masts inherited a radius sized for a 13 m verge lamp, so the circuit rendered unlit (2 of 135 centreline samples). No baseline and no ALLOW hatch: both read 0 fleet-wide |
| `component-inventory.test.mjs` | docs/COMPONENTS.md must name every class family in `css/`, name none that has left, and keep the dead-class list accurate — a map that silently rots is worse than none, because it is trusted |
| `sheet-per-screen.test.mjs` | one `.sheet` per parent element in the shell — `sheetshape.js` writes `--sheet-eff-scale` on the PARENT, so two co-hosted sheets would clobber each other's fit cap; the failure message names the fix (scope the property to the sheet) |
| `road-under-floor.test.mjs` | no visible road surface may sit below the flat floor plane |
| `coplanar-faces.test.mjs` | ratchet: SAME-FACING coplanar faces — the pairs that z-fight at every distance, which `clip-audit` structurally cannot see |
| `debris-step-skip.test.mjs` | source contract for DebrisWorld's two-tier idle: skip `world.step(_events)` when live bodies are asleep and no car is in `FURN_WAKE_M`, but keep `_ageAndCullPool` + panel `force = 0` so `marbleGrip()` and `PANEL_IDLE_DESPAWN_S` stay honest |
| `debris-hazard-hint.test.mjs` | `projectHazard` in `js/game/debrisworld.js`: the hazard query seeds `Tracks.project` with each body's own placed arc (33 segments instead of all ~1500) and must fall back to the full scan whenever that seed cannot be trusted. Sweeps monza/monaco/spa/miami at every staleness up to a 2 km wrong hint for a single changed accept/reject verdict, and pins suzuka — a figure-of-eight whose legs cross 1.43 m apart in XZ and 8.07 m apart in Y, where the height half of the trust test is the only thing that stops a hint on one deck being trusted for a body on the other. The subject is extracted from the real source, and two deliberately-broken variants keep the assertions honest |
| `spline-project-height.test.mjs` | `Tracks.project` in `js/track/spline.js` searches in XZ only, so on a circuit that crosses ITSELF it cannot tell the two legs apart even in principle — the information was absent, not mis-weighted. Pins the optional `wy` argument that adds a height term: on suzuka's crossover (~2.6 m apart in XZ, ~8.3 m in Y) a body on the upper deck displaced toward the road beneath projects onto the WRONG leg at every offset tried without it, ~2368 m away in arc, and onto the right one at all of them with it. Carries an anti-vacuity assertion that the flat search must still be wrong somewhere, and checks that away from the crossover the two forms agree exactly, so existing callers are unaffected |
| `f1-track-accuracy.spec.js` | `CircuitPaths` OSM traces vs a pinned subset of real GeoJSON outlines (direction, shape) |
| `track-foundation.test.mjs` | Node contracts for TrackSpace, TrackSurface, TrackModels, atomic diagnostics, terrain grounding, mesh validation |
| `track-maps-corners.test.mjs` | turn class = radius + heading-sweep (not raw \|k\|); Monza includes Curva Grande; Spa La Source HAIRPIN / Eau Rouge FAST |
| `track-preview-plan.test.mjs` | `TrackMaps.planPreview` — stacked vs beside, and the slot it sizes, over measured card geometry x circuit aspect. Holds shut the tall-circuit sliver, the caption charged to the wrong shape's budget, `beside` on a wide circuit, the 175% collapse, and two-column on a phone |
| `circuit-axis.test.mjs` | `tools/circuit-axis.mjs` — the spread still spans tall to wide (and names circuits that exist), the axis stays off unless flagged, and a tagged cell id parses back to screen + circuit |
| `track-graph.test.mjs` | the scenery model library + node graph, and `batches()` |
| `godray-keep-nearest.test.mjs` | the god-ray nearest-k selection, cloned in all three backends: eviction must SWAP so the pooled objects stay a permutation (an overwrite aliased one object at two slots — a lamp beamed twice, another dropped); also pins the three clones in lockstep |
| `scenery-kits.test.mjs` | Node contracts for deterministic themes, every LandmarkKit form and CircuitKit facility, bounded counts, budgets, fail-closed behaviour |
| `scenery-kits.spec.js` | the browser binding of those kits into Silverstone's `scenery(api)` |
| `scenery-api-contract.test.mjs` | freezes the 111-member `scenery(api)` surface across the `js/track/scenery-*.js` split |
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
| `rotation-recovery.spec.js` | portrait-phone race blocker guidance, focus, controls escape and exit-race recovery |
| `ui-button-touch.spec.js` | button/touch steer mode: auto-throttle, disabled calibrate, race-settings layout; the lighting tuner's FREE CAMERA touch sticks (drag registers, no latch when the overlay is pulled away mid-hold, a cancelled scene drag releases) and its layout clearing the docked panel at every UI SIZE |
| `ui-resize.spec.js` | live resize: `data-shape`/`data-pair`/`data-density` (`js/game/sheetshape.js`) converge correctly after the viewport, UI SIZE, or `zoom` changes mid-session, not just at first paint |
| `ui-scale.spec.js` | UI SIZE / HUD SIZE — every main screen still fits at 80/100/130/150 %, the two scales stay independent, and the HUD clusters stay on screen. Containment only, never absolute sizes; the exhaustive matrix is `--scale=` on the three fit tools |
| `ui-redesign.spec.js` | the redesign foundation in one renderer-light journey: searchable circuits, the Garage's roving tab contract, Settings at 200% on a short landscape phone, Advanced steering `--fit-at`, compact lighting tuner (one scroller, help off), How to Play and Career guide contents rails, standings leftover height, compact HUD density, and fixed-layout Last Race columns at phone portrait width |
| `hud-layout.spec.js` | touch control + HUD layout across every steering and gearbox mode |
| `hud-audit.spec.js` | HUD screenshots + mode-dependent elements |
| `pause-hud-layout.test.mjs` | the pause dialog hides bottom HUD chrome mid-race, and the compact pause stack tightens without changing type tokens |
| `title-menu-even.test.mjs` | title 2-up doors share equal flex cells and overlay columns use `--vwz`, not a pixel cap |
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
| `boot-guard.spec.js` | the shell's recovery when a js/ module fails to LOAD (not to run). A one-off 404 — the shape a brand-new module's first deploy takes while a CDN edge catches up — is repaired by a single reload with caches swept; a permanent 404 pins an overlay naming the file instead of looping. Both halves are the contract: repair enough to fix the transient, bounded enough that an absent file cannot storm the page. Written after build 1238 shipped season-cal.js and a cached 404 left the live game dead on `Can't find variable: SeasonCal` |
| `season-format.spec.js` | season mode CUSTOMISED — a shortened/reordered calendar (classics included) crowning its champion at ITS last round, qualifying switched off, the classic points table, the lap chips being PRESELECTED rather than overridden, and sprint weekends: a sprint pays 8-7-6… without closing the round, the Grand Prix follows on the same circuit without a second qualifying session, and the stage survives a quit because it is written with the points |
| `time-trial.spec.js` | ghost recording, ghost delta HUD, sector-split announces |
| `ghost.test.mjs` | ghost lap recording, forward-progress filtering, pose lookup at(t) and inverse lookup timeAt(s) with boundary clamps |
| `career.spec.js` | the save and its six slots, the mode axes, the hub, a settled round, ratings, the R&D garage, MY TEAM, objectives/contracts/rollover, reliability, EXTRA FUNDS never raising the fitted cap, the facility, the hire's contract, sponsors — and that career development never reaches a Grand Prix |
| `quali.spec.js` | one-lap qualifying: the simulated field and its spread, the sheet's two states, the grid being the qualifying order car-for-car, every round qualifying, and no classification leaking into the race |
| `quali-persist.test.mjs` | driven `qualiOrder` survives sheet reopen (`clear()` is memory-only, `begin()` restores names/gaps, all-AI and NetPlay do not persist) |
| `data-lifecycle.spec.js` | data hub session plumbing — meeting/year/session/driver responses own their option lists |
| `telemetry-compare.spec.js` | TELEMETRY multi-lane compare and cross-session (one driver's race vs quali) |
| `telemetry-trace.test.mjs` | GPS-trace sanity and the playback dot's motion |
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
| `net-rendezvous.test.mjs` | the room-code client against a real relay |
| `net-trystero-api.test.mjs` | the vendored Trystero surface actually used |
| `net-lobby-lifecycle.test.mjs` | canceled lobby operations, overlapping scanners and late wake-lock grants over deferred promises |
| `rendezvous-worker.test.mjs` | the actual Durable Object request boundary, including declared and streamed oversized bodies |

### Tooling & repo contracts

| Spec | What it covers |
|---|---|
| `load-order.test.mjs` | `index.html` and `tools/carview.html` `<script>` order matches `tools/manifest.cjs` exactly, including `HARD_EDGES` eval-time dependencies |
| `global-registry.test.mjs` | a LINKER for the globals architecture (Bedrock Phase 0): scans every manifest file with `tools/scan-globals.mjs` (espree/eslint-scope, live — no artifacts/ state) and asserts one-global-per-file, single-writer-per-global (accumulators frozen), eval-time reads resolve in load order, call-time reads resolve somewhere, and the dynamic `window[expr]` class stays extinct — known violations frozen as ratchet baselines |
| `game-ctx-surface.test.mjs` | a TYPE CHECK for the `G` ctx façade (Bedrock Phase 1) via `tools/check-gctx.mjs`: `types/game-ctx.d.ts` must declare exactly the members of `const G = {…}` in `js/game.js`, with matching writability (`readonly` ⇔ getter-with-no-setter), and the `GameModuleFactory` roster must match the real `X.create(ctx)` call sites. Second leg, skipped when no `tsc` is resolvable: every `G.member` read/write and `const {…} = ctx` destructure in `js/game|net` is emitted as a typed shadow and compiled — reading a member that does not exist, or writing one with no setter, is an error reported at the real `js/` file:line. Third leg: a member **no module reads** (the `countT` defect reversed) is baselined, so a new one fails |
| `vstd-invariant.test.mjs` | the PACE invariant as a lint (`tools/vstd-lint.mjs`): no speed in `js/game.js` is divided by `VMAX` or compared against a bare literal outside the reviewed allow-list, so the OVERALL SPEED slider cannot silently shrink the player's envelope again |
| `module-size.test.mjs` | RATCHET on the big modules' line counts — lower a ceiling when you extract; raising one is a deliberate edit with a reason in the commit |
| `car-wing-foil.test.mjs` | Shared `Car3D` wing section: knife-TE `FOIL_T` sample, five-span planform, beveled endplates, 100-triangle flap (not a 48-triangle plank), default body/cockpit under the 2400/1500 ceilings, single-option recipes within 1.6× the default budget |
| `car-presentation-canary.test.mjs` | Field cars share the player's presentation path: `renderPosOf` / `playerAnchor` interpolate world `px`/`pz` for every car (not only `c.human`), `xVis` is dump-only (no 16/s or 30/s damp, shadows use the same `cX`), AI mirrors `px`/`pz` *after* the `(s, x)` advance, visible procedural cars draw `teamBodyMesh`/`playerBodyMesh` + planted factory-signature wheels on `_groundMat` (not a generic `field:1:1:1` pair, not baked wheels on the chassis matrix), and `carOrbit` / agent-view `carWorld` read the mirrored pose. Locks the two leftover bugs that made the pack feel delayed and "a different car" |
| `gfx-backend-canary.test.mjs` | RENDERER pick survives the title menu: `#pm-renderer` is not `hidden`, the boot canary disarms after bind (not only after `present()`), first world present re-arms for jetsam, the picker names WEBGPU both ways, a `<select>` + ‹ › jumps without cycling through THREE, and RESET RENDERER drops backend crash flags plus context-loss latches without touching GRAPHICS quality. Also **TLX's canvas must be OPAQUE**: the lit fragment writes the SSR car-paint tag (0.35) into ALPHA, and `present()`'s post-only-death path keeps those materials while painting straight to the canvas — on an alpha-composited canvas the browser reads that tag as opacity and every car's painted bodywork goes 35% see-through for the rest of the session (reported from an iPhone). three needs telling twice: its WebGPU backend honours `alpha:false`, its WebGL backend hardcodes `alpha:true` and only honours a caller-supplied `context`. **Both vendor behaviours are asserted against the bundled three**, so the upgrade that makes half the workaround unnecessary — or the other half insufficient — fails here, next to the reason, rather than becoming another bug report from a phone. Source can prove TLX ASKS for an opaque canvas but never that it GOT one, so the live half is in `tlx-probes.spec.js` |
| `ui-improve-pass.test.mjs` | CssZoom load order + API surface; data-hub UI SIZE zoom; garage livery grid wiring; select track filter persistence |
| `menu-nav-spatial.test.mjs` | spatial menu arrows: after an in-band miss, ArrowLeft/Right pick the closest-Y item really to that side (`across * 0.25`); vertical moves stay in-band (no out-of-band dy pass) |
| `ui-journey-career.test.mjs` | leftover Career overlay `--fit-at`, wrap-not-ellipsis compact rows, and guide/history contents rail keyed on `data-shape=wide` |
| `ui-journey-session.test.mjs` | Results / Standings / Race settings / Audio / Pause `--fit-at`, and `#standings-body` leftover height with no `55svh` cap |
| `ui-journey-race.test.mjs` | HUD `--hud-z` (never `--ui-scale`), compact HUD on `body[data-density]`, pause-hidden `#campicker`, `#pc-restore` |
| `css-comments.test.mjs` | a CSS comment that ends early (or never opens) turns prose into a selector and DROPS the rule after it, silently — caught by measuring prelude length (real max 173, the two live failures were 275 and 759) |
| `css-tokens.test.mjs` | every custom property in `css/tokens.css` must have a consumer — an unread token is an invitation to use a value nobody has been maintaining |
| `css-class-ratchet.test.mjs` | RATCHET on the distinct CSS class count across `css/` and on `index.html`'s DOM node count, both measured by the restructure-screens-css skill's own grep so the numbers line up with the 543 / 1,133 written into the decision records. Lower a ceiling when you consolidate onto a `--property` context; raising one is a deliberate edit with a reason in the commit |
| `css-token-adoption.test.mjs` | the converse of `css-tokens`: a rule needing a size must READ a token, not write a literal. Ratchets two counts that may only fall — font-sizes below the `--fs-micro` floor (126) and raw px padding/gap/margin (529) — plus the list of sheets that read no spacing token at all and so cannot respond to the density ladder |
| `light-presets.test.mjs` | the 1,921 shipped lighting values must name real `TUNE_DEFS` ids — a renamed knob does not throw, the lookup just misses and the shipped look silently stops applying |
| `light-store-copy.test.mjs` | the tuner's COPY ALL fan-out (`LightStore.copyToTracks`): which profiles a copy writes, what each target then resolves to in either mode, that storage stays sparse, and that undo is exact |
| `light-grid.test.mjs` | every shipped `TUNE_DEFS` preset value lands exactly on its own slider's min+k*step grid — an off-grid value reads as a false player override |
| `lighting-reapply.test.mjs` | every tuner knob consumed only inside `applyRaceSettings()` is listed in `APPLY_RACE_IDS`, or its slider silently does nothing until an unrelated TIME/WEATHER change |
| `lighting-rebuild.test.mjs` | every tuner knob consumed only inside `buildTrackLights()` carries `rebuild:true`, or its slider is invisible until the next track load |
| `silent-catch.test.mjs` | a RATCHET on bare `catch (e) {}` — silent failure is this repo's most-repeated defect shape; the escape hatch is a COMMENT saying why, which is the sentence that was always missing |
| `hooks-documented.test.mjs` | every `__apex` hook must have a section in `docs/DEBUG-HOOKS.md` — a RATCHET over the 28 that already had none, so nothing NEW joins them |
| `race-control.test.mjs` | the caution state machine in a VM — thresholds, the raise-fast/lower-slow hysteresis, the hard time caps, drop-on-disable, host vs guest, and the leader's-lap rule behind OVERTAKE |
| `season-cal.test.mjs` | the SEASON calendar/format model in a VM — config normalisation, the calendar presets, and the TWO-GATE rule the whole design rests on: the calendar follows the player outside a career, but the FORMAT (distance, sprint, points table, qualifying) follows it ONLY in a season, so a one-off Grand Prix cannot inherit a season's sprint distance. Also the weekend stage machine: a sprint scores 8-7-6… without advancing the round, the Grand Prix closes it, and the two legs draw retirements on different keys |
| `career-settle.test.mjs` | `settleRound()`'s sponsor "double" fact in a VM — a team-mate CLASSIFIED in the points but retired scores nothing (a retiree can be classified top-ten when enough of the field DNFs), so it is not half of a "double"; the retired flag is the only discriminator between otherwise-identical rounds |
| `career-cross-tab.test.mjs` | an active career refuses to overwrite a newer foreign save, while an idle career refreshes to the winning tab |
| `async-lifecycle.test.mjs` | late QR streams/video playback, decoder retries, IndexedDB late success and a hung fetch releasing the shared queue |
| `ai-drive.test.mjs` | Pure AI racecraft helpers in `js/game/ai-drive.js` — rating→behaviour maps, situation OT fire rate, ERS want/bank, wantX, aeroLoad corner limit, racing-line hold mix, multi-sample soft brake, adaptive lane, street pack seating, team houseStyle, seat/#2 let-by orders, consistency brake band — in a VM with no browser |
| `factory-ai-setup.test.mjs` | Works-car aeroLoad / ERS deploy must differ across FACTORY_PRESETS (McLaren flex vs Williams low-drag), and `makeCars()` must assign those values plus `houseStats` to AI cars instead of the old 0.5 midpoint `null` |
| `shared-math.test.mjs` | the shared scalar helpers on `M4` (js/mat4.js) — clamp/lerp/`wrapDelta` semantics including the two edges that made the one DIVERGENT clamp copy different (inverted range, non-number argument), `wrapDelta` proved equal to the single-fold ladder every migrated site hand-wrote across four periods, plus a RATCHET: no js/ file may declare a private clamp/lerp again (the sanctioned spelling is the alias `const clamp = M4.clamp;`), with an anti-vacuity case pinning that the regex fires on the shapes it is meant to catch |
| `store-cross-tab.test.mjs` | `GameStore`'s `storage` listener in a VM over a fake localStorage — two tabs used to silently overwrite each other's saves because `_cache` is filled on first read and never invalidated. Asserts the module ARMS ITS OWN listener, that a foreign apex26. write drops exactly that key (an unrelated key stays cached — invalidating everything would put getItem/JSON.parse back in the render loop), that `rev` bumps, that a foreign `clear()` empties the cache, and that another origin-key's write is inert |
| `incident-gate.test.mjs` | IncidentSim's notifyCar entry gate vs preStep's per-kind authority in a VM — an r2-only config still queues+promotes a launch at `>= R2_CAR_V`, an r3-band contact under that config promotes nothing (enabling one kind never widens the others), sub-threshold bumps never queue, all-off is inert, and the shipped defaults still resolve a relV=30 pair as r2 |
| `camera-ride.test.mjs` | `GameCams.vantage` in a VM over a synthetic hill: the chase rig must not turn the road's fine undulation into camera bob on a gradient (measured against a raw two-point rig on the same profile), while still framing flat road and constant slopes exactly as before, still climbing the hill, and still honouring the ground clamp. The elevation profile is an argument here, so the threshold pins the CAMERA rather than whatever terrain a circuit happens to ship |
| `terrain-normals.test.mjs` | the terrain ribbon must be shaded by its own shape: `TrackMesh.buildTerrain` normals are unit length, point up, and carry real tilt spread on both a street and an open circuit. `buildTerrain` shipped `nrm.push(0, 1, 0)` for every vertex — an embankment, a banked verge and a flat runoff all took identical sun — and nothing caught it, because a constant normal throws nothing and changes no vertex count |
| `comment-citations.test.mjs` | a `other-file.js:412` comment citation must point at a line that EXISTS, plus a RATCHET on how many there are — a line number in another file cannot be kept true, so cite the symbol |
| `docs-integrity.test.mjs` | live docs, skills AND source comments reference only files that exist; AGENTS.md's suite counts, the scenery-api member count, the renderer-backend list, and the skills/tools/docs indexes all match the repo |
| `skill-progressive.test.mjs` | mcp-probe SKILL.md stays a thin index (≤120 lines) with traps/recipes in `references/`; previously-fat skills stay split (index ≤180 + the named reference file) |
| `css-play.test.mjs` | `tools/css-play.mjs` parse/list/hot-swap contract and the Playwright wrapper's `play`/`dom` commands — screen ids are a subset of layout-audit, `--css` stays inside `css/`, `--help`/`--list` do not launch Chromium, the tool never calls bump-cache mid-loop |
| `menu-capture.test.mjs` | `layout-audit.mjs` / `menu-capture.mjs` CLI contracts — `--gallery`, `--list`, `--help`, `--survey` argv parsing, cell resume paths, and screen catalog coverage (no browser) |
| `lighting-tuner-sweep.test.mjs` | `lighting-tuner-sweep.mjs` gate/push/verdict helpers — night-only knobs gated on day-dry, sunElev push direction, PCSS software skip, report verdict buckets (no browser) |
| `slider-effect.test.mjs` | LIGHTING TUNER classifier + visual A/B: `--help`, knob catalog, gates/risk/tags, `--live --dry-run` recipe, `slider-effect-view.py` changed-pixel filter |
| `test-groups.test.mjs` | the taxonomy: pick-tests rules name real groups and route every source dir; this document lists every group and every test file; `RENDER_SPECS` partitions cleanly; the manual suites stay out of default discovery |
| `circuit-def-fields.test.mjs` | every field authored in `js/circuits/<id>.js` survives the field-by-field copy into `Tracks.LIST`, or is named engine-only with a reason — an uncopied field reads as `undefined` at every consumer, silently, and the circuit renders as though it was never written |
| `backend-surface-parity.test.mjs` | every name GLX publishes is an own property of WGX and TLX (`undefined` allowed, absent not) — game.js installs a backend by descriptor-copy, so an absent name keeps GLX's own function running against a null `gl`/`CHK`, and every feature test for it passes before throwing |
| `test-coverage-audit.test.mjs` | the coverage auditor itself |
| `pick-tests.test.mjs` | the SELECTOR's own contract, upstream of the taxonomy: `--since <ref>` reads a ref and not a path (it swallowed the ref as a filename and answered "nothing to run" for every diff, for as long as the flag had existed), `--json` reports a `reason` CI can branch on rather than prose that happens to contain a `test:` token, and the default diff base is the DEPLOY branch — `main` is a stale fork here, so merge-basing against it balloons the changed set to most of the repo and the tool gives up silently, dressed as an answer |
| `test-observed.test.mjs` | the never-run detector's title extraction matches the reporter's EXACTLY. A title derived differently reads as "never observed" forever, and a tool that cries wolf on every spec gets ignored — the same outcome as not having it. Its first version missed Playwright's implicit suite title (a top-level test prints as `file › basename › title`, one inside a describe does not) and reported every describe-less spec as 100% never-run, including one verified green minutes earlier |
| `evaluate-scope-lint.test.mjs` | no `page.evaluate()` callback closes over a Node-side binding — the callback runs in the BROWSER, so a module `const` read inside it is a `ReferenceError` there, not a closure. Anti-vacuity: one case asserts the lint still finds both real sites in `58614db2`, the commit whose two launch constants killed every elevation track, so the analysis cannot silently stop resolving bindings while the synthetic cases keep passing |
| `change-driver-tools.test.mjs` | the verification DRIVERS' contracts (`verify-change.mjs`, `bump-cache.mjs`, `test-honesty.mjs`): a driver that drifts from the rules it encodes gets trusted INSTEAD of the prose, so the rules are asserted against the real CLIs — batches carry at most ONE browser group, `tooling-fast` is never batched twice, circuit edits route to `verify-track`, `--apply` lands max+1 on a fixture shell (never the real one), and the silent-skip scan stays at zero unexplained sites |
| `cache-bump-only.test.mjs` | the one exemption change-aware CI may make to the infra gate: an `index.html` diff that is PURELY a `?v=N` rewrite is not a load-order change. Line counts are not enough to decide it — `af05fa98` is +156/-156 and smuggles a real markup edit through, so the check pairs lines POSITIONALLY and a reordered script block cannot pass as a bump |
| `wait-polling.test.mjs` | the ratchet on waits whose declared timeout cannot fire. `waitForFunction` polls on `requestAnimationFrame` by default and the game's render loop starves it — measured at 109,665 ms against a declared 3,000 ms — so 382 call sites carry a bound that is decoration (353 was the 2026-08-07 freeze; the population fell to 312 as specs were fixed, then the lint's file filter was corrected and 70 pre-existing `tools/` sites became visible). Frozen rather than swept: rewriting 300 sites in one commit would be a behavioural change with no run behind it. `tests/manual/timeout-probe.spec.js` is exempt and must stay so, because it exists to measure the default |
| `tests-split.test.mjs` | the `tests/` split's PLAN, pinned before the move runs: every spec/suite/helper lands in exactly one bucket, `data/` and `manual/` stay, a snapshot dir follows its spec (Playwright resolves those spec-relative, and a missed move reads as "baseline missing" — which `--update-snapshots` would then re-bless), and the derived rewrites cover the ⚠ swallowed `f1-api-mock` imports nobody has to remember. Two cases guard the tool against itself: **history is never rewritten** (archived docs, dated research records and stored workflow scripts describe the tree as it WAS — the first plan would have falsified 700+ lines of it), and it does not rewrite its own header, which documents the move. A scratch-tree case caught a real bug: `rel()` ignored its `root` argument, so every check against the real repo passed while a foreign tree found zero references |
| `select-budget.test.mjs` | guards `tools/select-budget.mjs`, the arithmetic behind the change-aware CI decision. Pins the MODEL and not the constants: the measured 79.7 s/test is expected to move when CI is re-measured, but the shape must not — a failure costs `timeout x (1 + retries)`, capacity falls as survivable failures rise, and a budget smaller than one failure must report **0** rather than a positive number for a job that dies on the first red test. One case pins the design conclusion itself (cutting the failure cost buys more than doubling the budget) so it cannot quietly stop being true |
| `select-specs.test.mjs` | guards `tools/select-specs.mjs` AND `tools/select-recall.mjs`. Glob expansion, dedupe, the budget cut, the own-`setTimeout` exclusion, the TRACKED infra list (both directions), the import-graph helper→spec walk, fail-fast ordering, and the FAULTY-CHANGE RECALL ratchet — no spec that caught a real regression may be dropped in silence. **Why not coverage-derived TIA:** Fowler's survey is explicit that building a per-test coverage map requires running tests ONE AT A TIME, which against a ~40-minute SwiftShader suite is a non-starter, and the map then needs constant refresh. The path RULES plus the import graph buy most of the signal for none of that cost. The same suite guards the per-spec selector behind ci.yml's blocking `selected` job: every unaffordable spec lands in a named skip/exclusion list, and the selected-gate settings (retries 0, 120 s/test) provably fit more tests than smoke's retrying settings. |
| `ci-coverage.test.mjs` | guards `tools/ci-coverage.mjs`, which answers what the deploy gate actually executes — today **2 of 115 Playwright specs**, with 112 gated by nothing. Pins the MECHANISM and never the number: the count is meant to move as the gate grows, and a test that froze it would just be a chore. Anti-vacuity is the load-bearing case — a broken `ci.yml` parse would report "CI executes 0 specs", which reads as an alarming finding rather than as a broken tool. One case deliberately names a spec that MUST NOT exist, so the resolver is shown to reject it |
| `cross-file-paths.test.mjs` | every relative reference in `tests/` and `tools/` — static import, dynamic `import()`, `require()`, `new URL(rel, import.meta.url)` — resolves to a file that exists. Landed BEFORE the `tests/` split, because a guard that arrives after the commit it was meant to protect has protected nothing. The silent class it exists for: `fit-audit.mjs`/`menu-fit.mjs` wrap their `../tests/helpers/f1-api-mock.js` import in a `catch` that is correct at runtime and fatal to a move — afterwards both tools quietly audit an empty data hub with nothing red anywhere. Anti-vacuity: one case builds a moved-file-with-stale-`../` in a temp dir and requires a complaint |
| `assert-audit.test.mjs` | no test in the default suite is VACUOUS — a body with no assertion passes as long as the page does not throw, so it is a green tick that means nothing. The ratchet exempts an allow-list of capture harnesses (`ui-audit`, whose product is a PNG gallery) and asserts they still are ones. Two cases pin the tool's own failure mode: an assertion reached only through a same-file helper still counts, because a body-only scan calls hud-audit's eight steer-mode tests vacuous and a report that is 20% false gets ignored |
| `fixture-consumer-audit.test.mjs` | the specs that must import `tests/helpers/fixtures.js` do |
| `component-inventory.test.mjs` | the class families in `css/` match `docs/COMPONENTS.md` — a class defined in one file and used from another is the drift this catches |
| `span-kinds.test.mjs` | the agent view's span vocabulary matches the `ctx.noteSpan(...)` emitters — the list had fallen four kinds behind, so any circuit placing a tiered bowl failed `agent-view.spec.js` with a message that pointed nowhere near the cause |
| `css-layers.test.mjs` | every rule in a `@layer`-wrapped stylesheet stays inside its declared layer — an unlayered rule (a stray brace closing the layer early) silently outranks every layered rule regardless of specificity, with no parse error and no console warning |
| `scroll-strips.test.mjs` | every sideways-scrolling strip (garage category rail, data-hub tab strip, lighting-tuner chip tiers) declares the full `overflow-x`/`touch-action`/`scrollbar-gutter` pattern, not a partial hand-rolled copy |
| `source-integrity.test.mjs` | three cheap syntax/structure checks (an unopened comment block, an early-closed `@layer`, …) that the ~350 behavioural guards don't catch because a `SyntaxError` or a silently reordered layer fails nothing loud — each is a real 2026-08 incident that every other green guard sailed through |
| `deploy-staging.test.mjs` | the Pages workflow uploads an allow-list of directories — every path the shipped code can fetch must be inside it, or it 404s in production while passing every local run |
| `service-worker.test.mjs` | the SW's install/fetch/version-guard behaviour |
| `perf-sentinel.test.mjs` | the crash sentinel's memory must not outlive the crash |
| `perf-governor.test.mjs` | the adaptive-resolution governor: the budget derives from the observed floor of frame intervals rather than a hardcoded 60 fps, so a device capped externally (iOS Low Power Mode's 30 fps throttle) settles at full quality instead of the resolution floor with every feature shed; a genuinely GPU-bound device still downscales and holds; a reverted step does not repeat forever |
| `metrics.test.mjs` | GameMetrics SETTINGS toggle: default off, persists `apex26.metrics`, `?metrics=1` is session-only (set() does not write storage), snapshot() never throws without `__apex`, ON raises the log buffer to debug while leaving the console at warn, pages persist (`gov`/`car`/`phys`/`log`), GOV skips `probe`/`physState`, HUD digit and probe ground speed are both kept on CAR, and PHYS reads `physState()` without calling `obs()` |
| `perf-try.test.mjs` | Baked renderer gates: no `perf-try.js` / no PERF tab, late sky is unconditional, env-probe cull is 300 m without a toggle, and GLSL/WGSL/TSL keep only the gated ON path (not lighting-tuner knobs) |
| `output-paths.spec.js` | gallery paths are port-scoped and create their parents |
| `cdmcp-measure.test.mjs` | the Chromium MCP background measure harness — CLI surface, log terminal-marker contract, bg launcher existence, without launching Chromium |
| `tinyfish-mcp.test.mjs` | TinyFish + Chrome + Playwright MCP wrappers — `.mcp.json` has apex-tools + playwright + tinyfish + chrome-devtools + probe, help surfaces (`setup`/`deploy-js`), fixture unwrap/deploy-summary/live-build (search rows render title+url+snippet), every `mcp_post` body must parse as JSON once shell splices are stubbed (the guard that catches the stray-quote class), tracked source has no reusable key and `ensure` names its setup prerequisite, a transient upstream timeout is exit 3 (retried) while a genuine parse failure stays exit 2, `mcp-cli.mjs` uses `chrome-devtools-mcp.sh` with an exact fallback version (no live API), `playwright-mcp.sh` pins `@playwright/mcp@0.0.79` |
| `tools-runnable.test.mjs` | every tool in `tools/` PARSES (`node --check` / `bash -n` / python compile / JSON) and the MCP-facing entry points answer their help path. The README index guards names in both directions but never says the file runs — a tool with a syntax error is indexed, documented and completely inaccessible, and you find out mid-task. Parse-only for the sweep: these tools launch browsers and hit networks |
| `trim-comments.test.mjs` | smoke test for `tools/trim-comments.mjs`: `--help` exits 0 and prints `--dry-run`, and the tool removes dividers and location-pointer comments from a fixture file without touching code lines |
| `report-server.test.mjs` | the LAN report collector requires its per-run capability for every read and write, rejects unsafe paths and payloads, and enforces per-request/session storage bounds |
| `probe-mcp.test.mjs` | Unified probe MCP bridge — prefixes `chrome_*`/`tinyfish_*`, help/route, mock stdio handshake advertises full catalogs, `.mcp.json` `probe` entry, mock chrome daemon (healthz//tools//call + CLI auto-routing to a live daemon) (no Chromium / no TinyFish network). Also `mcp-cli.mjs probe --dry-run`: the pick is written BEFORE the reload in one batch, `--backend three` carries the WebGL2 pin (and only three does), unknown flags exit non-zero rather than probing the default, and the wrapper keeps `--enable-unsafe-webgpu` |
| `apex-tools-mcp.test.mjs` | `apex-tools` MCP — `serverInfo.name === apex-tools-mcp`, tools are all `apex_*` (zero chrome/tinyfish; no test-bg wrap), `apex_graph_parity` requires `base`, catalog `tools/apex-tools-mcp.json` locksteps `.mcp.json` stdio + `serve-http` on `127.0.0.1:3713`, week-1–4 pins, lock/occupancy including host `@playwright/mcp` vs `--mcp-config` JSON, `path_escaped` / `port_not_supported`, refuses deploy/github.io, `isError` preserved, stdout JSON-RPC only (mock/`dryRun`, no Chromium) |
| `mcp-smoke.test.mjs` | five-wrapper shell probe — `--dry-run` lists apex-tools / probe / chrome-devtools / playwright / tinyfish, never `verify` / `deploy-check` / `test-bg` / `playwright-mcp.sh run`, `apex-tools-mcp.sh smoke` delegates, no Chromium |
| `agent-surface.test.mjs` | wrap map lockstep — `docs/AGENT-SURFACE.md` names every `apex_*` in `tools/apex-tools-mcp.json`, each CLI/skill exists, never-wrap lists `test-bg` / `--apply` / github.io, indexes point at the map, catalog descriptions start Tree / Browser (lock first), `.mcp.json` has the seven repo servers including playwright + pinned official npx |

---

## See also

- [`tests/manual/README.md`](../tests/manual/README.md) — the human-run suites
- `docs/DEBUG-HOOKS.md` — the full `__apex` reference
- `js/log.js` — the logging facility the fixtures capture
- `playwright.config.js`, `tests/helpers/fixtures.js`, `tests/helpers/global-setup.js`,
  `tests/helpers/live-reporter.js` — the infrastructure sources
- `tools/pick-tests.mjs`, `tools/test-bg.mjs`, `tools/test-shards.sh` — the runners

---

## Operational field notes (moved from CLAUDE.md, 2026-08-13)

The measured history behind the testing gates. AGENTS.md carries the rules;
this section carries the evidence so the rules survive re-litigation.

**`child exited on SIGTERM` is a WORKER line, not the run (2026-08-17).** A
`test:tiny` log showed `[playwright] child exited on SIGTERM` at 28/73 while
`test-bg.mjs --status` still said `running`. The log line won the argument and a
replacement run was started in tmux — so TWO `playwright test` processes then
shared four cores, load average reached 15.7 against the < 3 guidance, and both
were writing progress the whole time. `ps -o pid,ppid,lstart -p …` attributed
them in one command; killing the older tree left the queue clean. Two lessons,
both already rules that a plausible-looking log line talked me out of: only the
terminal `= run …` line ends a run, and `pgrep -fa 'playwright test'` BEFORE
starting anything is the check that makes duplication impossible. (Also: a
`test-bg` run launched from an ephemeral shell can lose its parent — start long
queues inside tmux, where the queue survives the shell that spawned it.)

**A total-red run is almost never the code (2026-08-17).** `test:tiny` reported
`73/73 failed` and the first line of the log said
`browserType.launch: Executable doesn't exist … chromium_headless_shell-1228`.
`npm install` had run with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` — which is the
right flag for the install step and leaves the browser absent. The specs launch
Playwright's headless SHELL, not the `/opt/google/chrome` this box also ships,
so nothing browser-driven can pass until
`npx playwright install chromium-headless-shell` runs (2.3 MB, seconds). Read the
FIRST failure's message before forming any hypothesis about a red run: when EVERY
test in a group fails, the cause is upstream of the code under test — a missing
browser, a missing `node_modules`, a dead dev server, a syntax error in a file
every page loads. Bisecting the diff for a fault the harness is reporting
verbatim is pure waste.

**Watcher anchoring.** Anchor on the reporter's terminal line
`= run (passed|failed|timedout|interrupted)` and NOTHING looser: the 30 s
heartbeat lines contain `N/M done, K failed`, so a pattern like
`[0-9]+ (passed|failed)` fires on the FIRST heartbeat — AGENTS.md recommended
exactly that for weeks and every watcher built from it misfired. Match every
terminal status, not just `passed`: a success-only watcher is silent through a
crash, and silence looks like "still running". Watch the LOG, never the
process table — a watcher whose command line contains its own grep pattern
matches itself (`pgrep -cf "python3 -m http.server"` returned 1 on a box with
no server; that 1 was the grep). Never `| tail` a live background run — tail
buffers to EOF and the file stays empty. Adding `|Error:` to the UNTIL pattern
gives early warning on the first stack trace, but re-arm for the terminal line.

**Long queues (2026-08-07 measurements, seven groups, container-killed at
80 min).** (1) `Monitor` caps at 30 minutes and `persistent: true` DOES NOT
lift it — tried twice, both lapsed silently; pair every Monitor with a
`Bash run_in_background` waiter on the queue's own completion marker. (2) Seed
the seen-file when arming a de-duplicating watcher, or the first event is the
entire backlog. (3) Make the driver resumable via terminal-marker files the
driver writes AFTER a run returns — a fixed-list driver re-ran 86 minutes of
banked groups after a restart. A group that started and died has no marker and
correctly re-runs whole: a killed Playwright run banks nothing.
(2026-08-13 addendum: name the driver's group list anything but `GROUPS` —
that is a readonly bash builtin array and the assignment fails silently.)

**One process, one browser group.** Local runs set `reuseExistingServer`, so
a second Playwright process attaches to the first's HTTP server; killing
either strands the survivor's specs with `net::ERR_CONNECTION_REFUSED`
(measured: 33 false failures in a row reading like product bugs). Pairing two
BROWSER groups in one batch runs 2 processes x 2 workers on 4 cores —
measured on 2026-08-13 as the source of every over-budget timeout in a
five-batch run (projection at 144-176 s vs a 120 s budget, props-over-road at
1518 s vs its own comment predicting exactly this). Browser+node pairs are
fine. To cover more at once, hand every spec to ONE process and raise
`APEX_WORKERS`.

**Orphans vs a second run.** Orphans from a killed run keep eating the box
invisibly (`node tools/test-bg.mjs --stop`, then `pkill -9 -f
'tools/run-playwright'; pkill -9 -f pw-browsers`). But before concluding
"orphans", check `ps -eo pid,etimes,args` for a LIVE `playwright test` — a
second run you forgot is indistinguishable from orphans by process count.
One specific orphan bites the NEXT run: a superseded/killed batch can strand
its `python3 -m http.server 3456`, and the following direct `npx playwright
test` then dies instantly with "Process from config.webServer was not able to
start. Exit code: 1" (measured 2026-08-17). `pgrep -af http.server`, kill it,
re-run — that error is the port, not the code.

**A waiter is not a work slot.** Starting a browser run and then sitting in a
blocking wait wastes the whole run's wall time (measured 2026-08-17: 17 idle
minutes on one `--wait`). Start the run in the BACKGROUND and spend the run
doing what it permits: docs edits, test/tools edits, log analysis, commit
prep, subagent audits — everything except `js/`/`css/` edits and the
`?v=N`/`version.json` bump, which stay queued until the terminal line. Check
the log for `= run (passed|failed|timedout|interrupted)` when you come back;
never re-enter a foreground wait just to "keep an eye on it".

**`waitForFunction` on a rendering page.** Playwright polls the predicate on
`requestAnimationFrame`; a SwiftShader page running the game loop starves the
poll so the declared timeout never fires. MEASURED: `{ timeout: 3000 }`
against a never-true predicate ran 109,665 ms on a parked Monza — 36x its
bound — and overran on a menu page too. Only a THROWING predicate terminates
promptly (11 ms). Pass `{ polling: 100, timeout: N }` on any rendering page.
And once polling is fixed, a wait that still overruns means the CONDITION is
unreachable, not that the page is slow — `tlx-probes`' M6 skid took four
wrong mechanisms before anyone checked whether `skidVerts` could move
(`skids.stamp()` runs in `render()`; the stint drove through `act()`, which
never presents a frame). The habit that settled it: reach for an instrument
(a wrapper logging call counts) instead of a fifth theory.

**Subagent worktrees.** Worktree isolation bases new worktrees on the
default-branch ref, and this repo's `origin/main` is a stale unrelated
lineage (measured 2026-08-13: eight fix agents landed on a pre-restructure
tree with an 8,409-line game.js). Every worktree brief starts with
`git checkout -B <branch> <session SHA>` plus a fingerprint check of a
session-known file.

**WebGPU IS validatable in-container — stop shipping "read-verified" WGSL
(2026-08-17).** For months every `js/render/webgpu/` change carried a "WGSL is
not compilable in this container" disclaimer and shipped on read-review alone.
That belief was FALSE, and it shipped a phone-visible defect: a
`derivative_uniformity` violation (derivatives called behind `roadMarkings`'s
`hw > 0.5` early return — the road surface itself) that enforcing Dawn builds
reject (WGX silently fell back to GLX) and warning-mode phone builds executed
as undefined values — the entire road + shoulders rendered NaN-white while
grass, walls and cars looked fine. Two more spec violations sat alongside it:
MSAA count 2 (WebGPU permits only 1 and 4 — invalid on EVERY device) and
rg11b10ufloat render targets without the `rg11b10ufloat-renderable` feature.
All three were one-line Dawn errors the moment the code ran on a real device.
`node tools/wgx-validate.mjs` (~5 s) is that device: the FULL Playwright
Chromium (the headless shell has no `navigator.gpu`) with `--headless=new
--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader
--use-webgpu-adapter=swiftshader` exposes a real Dawn adapter that parses
every WGSL module and validates every pipeline. The ceiling, corrected
2026-08-17: Dawn here EXECUTES shader work — `node tools/wgx-capture.mjs`
returns real rendered pixels (offscreen mode; see
`docs/research/WEBGPU-PARITY.md` §1a for the four bugs the first capture
found). **Software compositor (2026-08-17, cache 1342+):** WGX soft-presents
the final pass into a `COPY_SRC` texture and 2D-blits onto visible `#game` —
play with this in SETTINGS ▸ SCREENSHOTS (AUTO / 2D BLIT / NATIVE) and the
three.js counterpart SETTINGS ▸ THREE PATH (AUTO / WEBGL2 / WEBGPU).
`node tools/gfx-probe.mjs --backend webgpu` is the primary visible-canvas
gate; native swapchain screenshots stay black. `GLX.capturePixels()` readback
(`wgx-capture.mjs` → `frame.png`) is a secondary oracle and can still flake on
SwiftShader when concurrent with display readback. Still environmental: the
first `getCurrentTexture()` call breaks `mapAsync` device-wide (why WGX never
touches the swapchain on software adapters), software adapters force MSAA 1,
and the full desktop stack can LOSE the device seconds in. Validation evidence
here is exact; visible-canvas evidence exists in-container via soft-present;
PERFORMANCE truth still needs a real GPU.

**TLX M4/M5/M9 on SwiftShader is fill-bound after the compile-storm fix
(2026-08-17).** The 595-program TSL storm is gone (17 links / 6.1 s Monza
load). The remaining group timeouts were GPU fill: M4 left the loop
presenting, Playwright tore the page down, and M5's first frame sat behind a
387% GPU process. `setTimeOfDay("night")` / a second `race()` on a live TLX
page does not return (530 s+ hung `evaluate`, measured four times). Product
cuts: software-GL shadow maps 512/256/256, clear-only 64px env faces, one
cube face per frozen frame. Test cuts: M5 is day-sky only (night `uStars`
lives on M6), M4/M5/M9 `waitForFunction` with `{ polling: 100 }`, and
`stopRendering` at the end of M4 so the next spec is not starved. Solo
verdict after those cuts, M4 still presenting: M4 10.0 s, M5 313.1 s,
M9 278.9 s. After M4 calls `stopRendering`: M4 10.1 s, M5 **63.5 s**,
M9 261.4 s, `= run passed (3/3)` in 336.4 s. M9 stays near the
`test.slow()` 360 s budget because the env-probe wait is fill-bound on
SwiftShader even with a quiet GPU; do not widen assertion tolerances.

**Software pixels + Lavapipe on Cursor Cloud (2026-08-17).** Native WebGPU
swapchain present stays black on SwiftShader/Lavapipe; WGX soft-presents to
visible `#game` via a 2D blit (auto on software adapters +
`sessionStorage apex26.wgxCapture=1`). Primary probe:
`node tools/gfx-probe.mjs --backend webgpu|three` (checks `#game` after
`awaitSoftPresent`). Readback oracle: `node tools/wgx-capture.mjs`. Lavapipe
needs `mesa-vulkan-drivers` (`lvp_icd.json`); stock Cloud images lacked
`/usr/share/vulkan/icd.d/` until that package was installed and the env
snapshot Saved. TLX CI stays on WebGL2 (`--backend three` / `tlxForceGL`);
THREE PATH: WEBGPU 2D-blits the LDR target (`readRenderTargetPixelsAsync`).
`mappedAtCreation` uploads are shimmed to `queue.writeBuffer` so SwiftShader
does not exhaust Dawn's mappable pool. SETTINGS ▸ WEBGPU / THREE.JS stay on
those backends (phones and Safari included — lite stack, 8-bit swapchain);
they must not silently bind GLX. THREE PATH AUTO may land on three
WebGL2 (`--tlx-auto-gl` / `apex26.tlxAutoGL`) after WebGPU dies in this
tab — still TLX, not game WEBGL2. THREE PATH: WEBGL2 remains the CI pin.
`--backend three --tlx-webgpu --lavapipe` waits on `GLX.awaitSoftPresent`.

**TLX WebGPU `configure` null was a self-poison (2026-08-18).**
`detectSoftwareGL()` called `#game.getContext("webgl2")` after
`renderer.init()`. three r185.1 does not claim the canvas in `init()` —
`getContext("webgpu")+configure()` is lazy on first present(). MDN: one
context type per canvas for life. Fix: sniff GL only when `forceWebGL`;
the WebGPU path uses `_softAdapter`. Instanced prop colour is a geometry
`InstancedBufferAttribute` named `color` (not `imesh.instanceColor`).
The 2D overlay must be opaque and force blit alpha to 255 — the SSR
car-paint tag (0.35) in HDR alpha is not compositor opacity.
Index: `AGENTS.md` §Seeing the game / §Cursor Cloud;
`docs/research/CI-RENDERING-PERFORMANCE.md` §Measured.

**TLX software-GL washout was fog-as-clear + a broken TSL sky (2026-08-18).**
Dusk `fogColor` is beige `~[0.68,0.64,0.54]`. `begin()` used that as
`scene.background`; when the TSL `backgroundNode` missed the whole frame
was that beige. When the node *did* compile against the HDR target on
SwiftShader, `screenUV`/`invViewProj` reconstruction collapsed the dome
to horizon beige (`~[0.76,0.68,0.52]`) — kill-fog did not help because
density was never the path. World frames now clear to `skyZenith`, and
software GL arms `tsl-sky.js`'s zenith-only `fallbackNode` (M5
`skyState().on` stays true). Real GPUs keep the full SKY_FS node. Same
box, GLX was never this washed: it draws the sky as a real fullscreen
mesh. Real-GPU TLX (user device) already looked correct; this is not a
color-management change.

**Cloud-agent `npm install` "Exit handler never called!" (2026-08-17).**
`bld-20260817-e70b375f` failed `INSTALL` after `npm install --ignore-scripts`
spent ~70 s hitting `https://registry.npmjs.org` with `ECONNRESET` (audit
endpoint included), then npm 10.9.7 crashed instead of exiting on the fetch
errors. The leftover debug log still had "http cache … cache hit" followed by
"tarball no local data … Extracting by manifest" — metadata in `~/.npm` but
no tarball bytes, so every package re-fetched in parallel. The same VM's
`npm ping` still ECONNRESETs; `archive.ubuntu.com` Release files 404 through
Envoy, so `apt-get update` cannot repair a snapshot that is missing
`mesa-vulkan-drivers`. Cure: dashboard install → `tools/cloud-agent-install.sh`
(skip npm only when `node_modules/<pkg>/package.json` exists — hollow
directories from a crashed reify are not usable — `--no-audit
--prefer-offline`, retries; do not fail the build on apt 404 when
packages are already present).
Allowlist `registry.npmjs.org`, `archive.ubuntu.com`, `security.ubuntu.com`,
and `cdn.playwright.dev` if a cold snapshot must actually download.

**A view transition can hide a fix for seconds (2026-08-28).** Round 13
moved `#track-detail`'s ScrollFade registration and the probe read the panel
900 ms after opening the screen: no `sf-scroll` class, no thumb — a fix that
looked dead. It was not. `menus.js`'s `vt()` skips `startViewTransition`
under reduced motion precisely because the transition SNAPSHOTS the page
either way, and on a software rasteriser that capture holds the main thread
(~3.2 s measured, and the wrapper's own 60 ms direct-apply net cannot fire
while it is held). Under the probe daemon motion is NOT reduced, so the
screen was still mid-snapshot when the read landed. Same read at 5 s:
`sf-b sf-scroll`, thumb 207 px. Give any probe-after-open on this box at
least 4 s before believing an absence — and prefer a positive assertion over
one, since "the class is missing" is exactly what a stalled thread looks
like.

**The unbumped-URL cache trap (2026-08-28).** A CSS edit verified through
the chrome daemon on the same probe URL read the OLD value back (chip
`font-size` reported 9.5 px after the file said 8 px) — heuristic caching on
an asset whose `?v=` hash had not moved, and the cache bump is deliberately
the LAST edit before commit, so mid-round probes always run against stale
tags. Do not bump early to work around it. Re-point the one sheet instead:
`link.href = link.href.split("?")[0] + "?v=probe-fresh-N"`, wait a beat, then
re-read. A same-file second edit needs a new N.

**`boot-guard`'s PERMANENT-404 case is load-sensitive (2026-08-28).** It
failed once inside a 687 s `test:tiny` batch at loadavg 7.6 (`overlayText`
null — the overlay had not been written yet within the 45 s poll), then
passed 2/2 in 26 s when re-run alone on an idle box. Same class as the
dev-tools / menu-keyboard timeouts above: a timeout on a busy box measures
the machine. The confirmation is one solo re-run, not a widened timeout.

**TinyFish egress blocked, and the deploy oracle that replaced it
(2026-08-28).** `tools/tinyfish-mcp.sh deploy-check` returned HTTP 403 `Host
not in allowlist: agent.tinyfish.ai` on every retry — an environment change,
not a key problem. With `github.io` also proxy-blocked, the live check has no
fetch path at all from inside the container. What still works, and is
authoritative for "the build published": the Pages workflow-run conclusion
for the exact head SHA via the GitHub API. Note `actions_list` returns one
~62 KB line that overruns the tool cap — it is saved to a file, and
`python3 -c "import json; ..."` on that file gets `head_sha`/`status`/
`conclusion` in one command. Allowlist `agent.tinyfish.ai` to restore the
`version.json` check itself.
