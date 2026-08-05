# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks. Pure IIFE modules
loaded via `<script>` tags. Static files — runs on GitHub Pages.

---

## Key commands

```sh
npx serve -l 3456 .               # run locally (or: python3 -m http.server 3456)
node tools/assets.mjs bake-synthetic  # rebuild assets/pack (no network, no deps)
node tools/assets.mjs verify          # licence allow-list + md5 + size budget
node tools/verify-track.cjs <id>  # headless build check (no browser) — catches a
                                  #   scenery/buildRoad/buildProps THROW that would
                                  #   strand the game on the menu (e.g. a bad ref).
                                  #   Fast pre-push guard for track scenery edits.
```

---

## Testing workflow

Three rules, in order. The reference — every group, every spec, the fixtures and
the philosophy — is **`docs/TESTING.md`**, and `tests/test-groups.test.mjs`
fails if it and `package.json` disagree. Do not maintain a second copy of that
table here.

### 1. Run tests in the BACKGROUND, and tail the log

A foreground run blocks for minutes and prints nothing you can act on. Backgrounding
is the default, not the exception:

```sh
node tools/test-bg.mjs smoke api collision   # start; returns immediately
tail -f artifacts/logs/smoke.log             # watch one
node tools/test-bg.mjs --status              # running / how each ended
node tools/test-bg.mjs --wait                # block until all groups finish
node tools/test-bg.mjs --stop                # kill everything still running
```

Each group gets its own free port, report dir and log, so groups cannot tear
down each other's web server and a stall is attributable to ONE log rather than
to "the run". The reporter (`tests/live-reporter.js`) writes a timestamped line
per test start and end plus a 30 s heartbeat naming everything in flight — a
hung test is the one with a `> start` line and no end line
(`APEX_HEARTBEAT=<s>`, `0` disables).

`tools/test-shards.sh` is the BLOCKING counterpart, for CI. Raw `npm test -- <spec>`
is fine for one spec; anything larger goes in the background.

**DO NOT SIT AND WAIT FOR A RUN.** A SwiftShader group is minutes to tens of
minutes; an agent that polls `--status` in a loop, or blocks on `--wait`, burns
the entire run doing nothing. Repeatedly checking progress is the same waste
spelled differently — the tally moving from 39/77 to 41/77 is not information.

**Arm a monitor, then go and work.** The `Monitor` tool turns the log into
events so the result comes to you:

```
Monitor({ command: 'tail -f artifacts/logs/<group>.log | grep -E --line-buffered "x FAIL|= run (passed|failed)"',
          description: 'failures or completion in <group>' })
```

Filter for **both** outcomes — a monitor that greps only for success is silent
through a crash, and silence looks exactly like "still running". A background
`Bash` command that exits on completion (`until … done`) works too, and gives
one notification instead of several. `--wait` is for CI and for the one case
where the next edit genuinely cannot be chosen until the result lands.

The one hard constraint while a run is in flight: **the test servers read `js/`
and `css/` straight from the working tree**, so editing those mid-run makes
later specs load a mix of versions. Everything else — `tools/`, `docs/`,
`tests/` (new files), commit messages, `CLAUDE.md` — is fair game.

#### What to actually DO with those minutes

Roughly in priority order. The first two are work on the run itself; the rest is
work you would otherwise do after it.

1. **Triage failures as they land, not at the end.** `live-reporter.js` writes a
   line per test the moment it finishes, so a failure is readable minutes before
   the run is. `grep -n "x FAIL" artifacts/logs/<group>.log` and start
   diagnosing immediately — by the time the run ends you can already have the
   fix written (staged, not applied, if the run is still going).
2. **Predict the blast radius and check the prediction.** Before the result
   arrives, write down which specs SHOULD fail given the diff and why. A spec
   that fails and is not on your list is the interesting one; a spec on your list
   that passes means you did not understand your own change. This turns a wait
   into a comprehension check.
3. **Reproduce a suspected failure in isolation** — a single spec on a free port
   is cheap and does not disturb the group (`npx playwright test <spec>
   -g "<name>" --reporter=line`). This is also how you tell a real failure from a
   contention timeout (see the ceiling note below).
4. **Write the NEXT spec.** `tests/` is safe to add to mid-run — Playwright
   globbed its list at start. New coverage for the change you just made is the
   single most useful thing to produce while its existing coverage runs.
5. **Hunt for bugs in the code you have just been reading.** You are never
   better placed to find one than immediately after loading a module into
   context for another reason. Look for the shapes this codebase actually
   produces: a helper with **no consumer** (`Input.throttleLevel()` sat dead for
   months — analog trigger travel computed and thrown away), a comment that no
   longer matches its code, duplicated logic that can drift (`simTilt` restates
   `tiltSteering`'s body), a constant compared against a raw speed where
   `vStd()` was meant. `grep` for the invariant, not for the symptom.
6. **Plan the next phase concretely** — compute the actual numbers, not the
   intent. Tabulating what a slider currently does is what turned "feels wrong"
   into "the step below the default is 25 % and above it is 5 %", which is a
   different and far more fixable statement.
7. **Read the code you are about to touch next**, and draft the commit message
   for the change in flight while the reasoning is still fresh.
8. **Research.** See below.
9. **Docs** — `docs/`, `CLAUDE.md`, `tools/README.md`. Note that
   `tests/docs-integrity.test.mjs` gates several of these (spec counts, the tools
   index, `docs/README.md` links), so doc work often has to happen anyway.

#### Research tools, and which to reach for

**TinyFish** (`mcp__tinyfish__*`) is the default web toolkit — prefer it over
`WebFetch`/`curl`:

| Tool | Use it for |
|---|---|
| `search` | find pages. `domain_type: "research_paper"` for academic sources, `"news"` for current events; `include_domains` to pin to a known-good site; `after_date`/`before_date` or `recency_minutes` for freshness |
| `fetch_content` | read up to 10 URLs in parallel, rendered in a real browser, returned as clean markdown. `include_selectors`/`exclude_selectors` to cut boilerplate on a noisy page |
| `run_web_automation` | when reading is not enough — clicking, forms, login, anything behind interaction. Slow (minutes) and credit-metered; needs a fresh `session_id` UUID per call. If it times out the run may still be live: use `list_runs`/`get_run`, never a blind retry |
| `create_browser_session` | a remote CDP endpoint for direct Playwright/Puppeteer control. Close it when done |

**Context7** (`mcp__Context7__*`) for library documentation, and it is two calls,
always in this order: `resolve-library-id` (name → `/org/project`) then
`query-docs` (one concept per call, specific). Use it for anything versioned —
three.js, Rapier, Playwright APIs — rather than trusting recall.

What is worth researching here, from experience: how shipped racing games name
and scope a feature before we invent our own vocabulary; accessibility
documentation, which is unusually specific about mechanics because it has to be;
and the physical meaning of anything we are about to map onto a physics
constant, so the sign is right the first time. Findings that outlive the task go
in `docs/research/` — including the NEGATIVE ones, because a decision not to
build something gets re-litigated every few months unless it is written down.
See `docs/research/DRIVING-CONTROLS-RESEARCH.md` for the shape.

#### Worktrees: the way to keep editing while a run is in flight

**Use a worktree whenever a test run is in flight and you have `js/` or `css/`
work to do.** This is a standing project instruction, so `EnterWorktree` is
sanctioned here without asking — that tool is otherwise gated on the user or
this file saying so.

The "don't edit `js/` or `css/`" constraint is a property of the DIRECTORY the
test server was started in, not of the repo. A `git worktree` is a second
working directory on the same object store, so an edit there cannot disturb a
run in this one. **Measured:** changing a constant in a worktree's
`js/game/input.js` left the main tree's copy untouched, and the in-flight run
kept serving the original.

`.claude/settings.json` sets `worktree.baseRef: "head"`. **Do not remove it** —
the default is `fresh`, which branches from `origin/<default-branch>` and would
silently strand a worktree on a base with none of the current branch's work.

Either the tool or the raw commands work:

```sh
git worktree add .worktrees/<task> -b <branch>        # .worktrees/ is gitignored
cp --reflink=auto -r node_modules .worktrees/<task>/  # REQUIRED — see below
git worktree remove --force .worktrees/<task>         # and `git branch -D` if throwaway
```

Two measured costs, both easy to trip over:

- **A worktree has no `node_modules`** — it is gitignored, so it is not checked
  out, and `require.resolve("@playwright/test")` fails outright. Nothing can run
  tests there until you copy it (19 MB here; `--reflink=auto` makes it nearly
  free on a CoW filesystem). Do NOT symlink it — concurrent installs corrupt a
  shared directory.
- **~35 MB of checkout per worktree**, plus that `node_modules`.

**A worktree buys EDITING freedom, not free test parallelism.** Two agents in
two worktrees each running a test group is exactly the CPU oversubscription
described below — the group ceiling is a property of the box, not of the
directory. Parallelise the *writing*; serialise the *running*.

#### Deciding what a plan can fan out

Worth asking of every plan, not just large ones. The decomposition question is
always the same: **which files does each task own?** Two tasks that touch the
same file must be sequential; the planning cost of getting this wrong is paid
back at merge time with interest.

In THIS repo the answer is usually dictated by one file. `js/game.js` is ~8 000
lines and holds the loop, the physics, the AI and the race logic, so most
gameplay work touches it and most gameplay work is therefore *serial*. What
does fan out cleanly:

| Fan out | Because |
|---|---|
| Read-only investigation (`Explore` agents, 2-3 at once) | no writes at all; this is the plan-mode default for a reason |
| Research + docs alongside implementation | `docs/`, `tools/README.md` and `js/` never collide |
| A `tools/` script beside a `js/` change | different trees entirely |
| Per-circuit work (`js/circuits/<id>.js`) | one file per circuit, 40 of them, genuinely independent |
| A new spec beside the change it covers | `tests/` is additive |
| Independent `js/game/*` modules | each is its own `Module.create(G)` file — but check whether both also need a `G` façade entry in `js/game.js`, which serialises them |

The `Agent` tool takes `isolation: "worktree"` to do the setup itself. Use it
when subagents genuinely write in parallel; skip it when they only read, since
it costs setup time and disk for nothing.

Two conventions that make a fan-out reviewable: give each agent a **non-
overlapping file list in its prompt**, and have it report **what it changed and
why** rather than leaving you to diff. If two agents must touch `js/game.js`,
that is the signal to sequence them instead.

**Parallelism has a real ceiling, and exceeding it manufactures failures.**
Count **WORKERS against CORES, not groups against cores** — each group is a
server plus `WORKERS=2` Chromium+SwiftShader processes, so N groups is 2N
browsers. But a SwiftShader browser does not take *a* core, it takes several:
**measured, ONE group at the default `WORKERS=2` holds this 4-core box at load
8.9-11.0**, with every chrome tree traced back to that single `test-bg` pid and
no orphans. `LOCAL_WORKERS` floors at 2, so the default group is *already*
~2.5x cores and there is no lighter setting short of `--workers=1`.

Which means the practical rule is stronger than "don't run two groups": **one
heavy group is the box's full capacity**, and a second one is not a 2x slowdown
but the difference between passing and timing out. `physics`, `behaviour`,
`circuit` and anything rebuilding circuits want the machine alone — and a
subagent told to "just run `test:tiny` to check" is a third and fourth worker,
so give it `--workers=1` or have it verify without a browser.

Past the ceiling, tests fail on the CLOCK rather than on an assertion. The
signature is `Tearing down "context" exceeded the test timeout`, a bare
`Test timeout of 120000ms exceeded`, or a spec whose duration is several times
its usual. Measured here, same commit each time:

| Spec | Under load | Alone |
|---|---|---|
| `elevation-tracks › albert_park` | 219 s, **FAILED** (3 groups) | 30 s, passed |
| `aero-zones › a bigger wing trades HARDER` | 133 s, **FAILED** (2 groups) | passed, 10/10 file |
| `aero-zones › a bigger wing trades HARDER` | 133 s, **FAILED** (1 group!) | — |

That last row is the one that taught the lesson. The same spec failed a third
time with **nothing else running**, which is what forced the reading above and
then the real diagnosis: it does three localStorage writes, three page reloads
and three full Monza builds, where every other test in its file does one. Its
own logs show the single-build tests at 30-64 s and this one at 133 s. It is
not a flaky test and it was never a physics regression — it is **3x the work
against a shared 120 s default**, and it now carries `test.slow()` and a comment
saying so.

The general lesson: a timing-shaped failure that survives the load check is
usually a spec whose COST nobody costed. Before reaching for a retry or a
bigger box, compare that test's duration against its siblings in the same file
— an outlier of 2-4x is a structural difference you can name.

**Before believing a timing-shaped failure:**

1. `cat /proc/loadavg` — anything past ~2x cores means the result is suspect.
2. **Check for ORPHANED workers.** `test-bg --stop` and killing the run's pid do
   NOT reap worker trees whose ancestor has already reparented to init, and a
   stale tree will quietly eat the box under every later run:
   `ps -eo pid,ppid,comm | awk '$3=="chrome"{print $2}' | sort -u` and trace each
   parent back — anything whose chain hits `1` before it hits a live `test-bg`
   pid is a leak. Kill those first.
3. Re-run that ONE spec alone: `npx playwright test <spec> -g "<name>"`.

**Never amputate one group to rescue another mid-run.** Killing a group takes
its server down, so every remaining test in it fails in ~1 s against a dead
port, and the final tally ("31 failed") is almost entirely artifact. If the box
is oversubscribed, stop EVERYTHING and restart serially — the results you keep
are worth more than the minutes you save.

### 2. Run the groups the change needs — not all of them

The whole suite is ~40 minutes of SwiftShader. Which groups a change needs is
mechanical, so ask instead of guessing:

```sh
node tools/pick-tests.mjs                 # branch point + working tree
node tools/pick-tests.mjs --staged
node tools/pick-tests.mjs js/car/parts.js # explicit paths
node tools/pick-tests.mjs --bg            # ready-to-paste background command
```

Rules live in `RULES` at the top of `tools/pick-tests.mjs`, deliberately coarse
and biased toward running too much. **A new source directory or a new group means
a new rule** — `tests/test-groups.test.mjs` fails if a rule names a group that
does not exist, or if a source directory routes to nothing.

Order to escalate in:

| When | Run |
|---|---|
| after any edit | `npm run test:tiny` — page loads, `__apex` responds. If this is red nothing else is worth running |
| edit loop | `npm run test:tooling-fast` (~4 s: load order, docs integrity, test groups, api contracts) then the groups `pick-tests` named |
| track/scenery edit | `node tools/verify-track.cjs <id>` first — 2 s, no browser, catches a build THROW |
| before pushing | those groups, plus `npm run test:sweeps` if geometry moved |

`test:sweeps` and `test:tooling` pass `--test-concurrency=1` **deliberately**:
every suite in them rebuilds all 40 circuits, and four at once reached 5.4 GB and
was OOM-killed — which shows up as a `SIGKILL` with no assertion, so it does not
read as a test failure. Run several GROUPS in parallel instead; those are
separate processes.

### 3. Make failures explain themselves

Specs that import `tests/fixtures.js` attach three things on failure, and
`live-reporter.js` echoes the tail of each into the log:

| Attachment | What it holds |
|---|---|
| `apex-state` | `physState` + `probe` + `timing` + `lightState` + `info` |
| `apex-logs` | the `Log` ring buffer — retained diagnostics **including ones never printed** |
| `page-console` | what the page said, in order, favicon noise stripped |

Turn diagnostics up for a run without editing the spec:

```sh
APEX_LOG=scenery:debug npm test -- tests/props-over-road.spec.js
```

Take the `consoleLines` fixture instead of hand-rolling `page.on("console", …)`,
and read `__apex.logs({ns})` rather than scraping console text — a scraped
message ties the spec to its exact wording and misses anything below the print
threshold.

IMPORTANT: tests serve `js/`/`css/` straight from the working tree — don't edit
source files while a run is in flight, or its later specs load mixed versions.

**Two projects, not one.** `playwright.config.js` splits the suite into a
`headless` project (physics/geometry/hook specs — the default, no GPU) and a
`render` project (screenshot/pixel-diff/GL specs, listed in `RENDER_SPECS`).
Target `--project=headless` or `--project=render` when filtering, never
`--project=chromium` (gone). `RENDER_SPECS` is the partition — the headless
project is "everything NOT in it", so a name there that matches no file silently
drops a GL spec into the wide pool.

`tests/manual/` is excluded from discovery: the per-circuit blank scan and
contact sheets, and the gallery emitters. They gate nothing and are run by path
(see `tests/manual/README.md`).

---

## Logging (`js/log.js`, global `Log`)

Every diagnostic goes through `Log`, never a bare `console.*`. Loads FIRST, so
any module can call it at evaluation time.

```js
Log.warn("scenery", `pine SUPPRESSED at k=${k}: dist=${dist}`);
Log.info("track", `built ${id} in ${ms}ms`);
if (Log.enabled("gfx", Log.DEBUG)) Log.debug("gfx", expensiveDump());
```

First argument is always a NAMESPACE (`Log.NAMESPACES`: scenery, track, gfx,
game, data, net, audio, assets, apex). It is prefixed automatically — do not
repeat it in the message.

**Two independent thresholds**, which is the whole point:

- the **console** level decides what a human sees (default `warn`)
- the **buffer** level decides what is RETAINED in a 500-entry ring (default
  `info`), readable afterwards via `__apex.logs()`. A failure that has already
  happened still has a record.

```js
__apex.logLevel()                  // resolved thresholds
__apex.logLevel("scenery:debug")   // one namespace up
__apex.logLevel("buffer:debug")    // retain more without printing more
__apex.logLevel("debug", true)     // …and remember it across reloads
__apex.logs({ ns: "scenery", limit: 40 })
```

Also settable by `?log=scenery:debug` on the URL and by `apex26.logLevel` in
localStorage; `APEX_LOG=<spec>` does it for a whole test run.

**HOT PATHS**: arguments are evaluated whether or not they print, so guard a
per-frame or per-primitive debug line with `Log.enabled(ns, level)`.

Two things stay bare `console` on purpose: `__apex.diag()`'s object dump (DevTools
renders an inspectable tree, which `Log` flattens to text), and anything in a
tool that is not part of the game.

---

## Output dirs (standard)

All regenerable output lives in **two** top-level gitignored dirs — never `/tmp`,
never scattered at the repo root:

- **`artifacts/test-results-<port>/`** — test failures, traces, attachments, JUnit
- **`artifacts/report-<port>/`** — HTML report
- **`artifacts/logs/`** — background-run (`test-bg.mjs`) and shard logs
- **`artifacts/galleries-<port>/`** — test-emitted screenshots/reports
- **`artifacts/tmp/`** — one-off batch probes
- **`scratch/captures/`** — interactive tool captures
- **`scratch/renders/`** — car/parts/aero review sheets
- **`scratch/profiles/`** — CPU/GPU profiles

Both roots are created on demand. `assets/` and committed generated sources stay
outside them. There are currently **no** tracked golden baselines — no
`tests/*-snapshots/` directory exists — so `npm run test:visual` is not a
regression gate yet; regenerating the baselines on Linux/SwiftShader is a
separate, still-outstanding operation.

---

## File layout

Modules are grouped by domain. **`js/track/` is the ENGINE** (spline, mesh,
scenery placement — shared code); **`js/circuits/` is the DATA** (one def file
per circuit). Don't mix them up: a circuit edit goes in `js/circuits/<id>.js`,
an engine/placement change goes in `js/track/`. `tools/manifest.cjs` is the
single source of truth for load order (see Critical conventions).

```
js/log.js        Log            levelled, namespaced logging + a retained ring
                                  buffer (see Logging). Loads FIRST — everything
                                  below may log at evaluation time
js/mat4.js       M4, V3         matrix math
js/game.js       (main)         entry — game loop, physics, AI, race logic; owns the
                                  closure state and hands the G ctx façade to js/game/*

js/render/       — renderers —
  gfx.js         Gfx            renderer façade — selects GLX (WebGL2) or WGX (WebGPU),
                                  both expose the same surface to game.js
  glx.js         GLX            WebGL2 renderer core
  glx/           GLXPost, GLXShadow, GLXChunked   post chain (post.js) / shadow
                                  passes (shadow.js) / chunked-mesh path
                                  (chunked.js), wired via the GLXCore ctx
  shaders/       GLXChunks, GLXShaders   chunks.js = shared GLSL leaves;
                                  lit.js / sky.js / fx.js / post.js assemble GLXShaders
                                  (pure data; loads before glx.js)
  gltf.js        GLTF           binary .glb loader → plain {pos,nrm,col,idx}
  assets.js      Assets         baked asset-pack loader (assets/pack) — PBR material
                                  ARRAYS indexed by MAT id, baked models, HDRI ambient.
                                  Every failure (no pack, bad pack, backend without
                                  createTextureArray) falls back to the procedural look
  webgpu/        WGX            WebGPU backend (wgx.js) + WGSL sources
                                  (wgsl-chunks/-post/-fx.js); feature-detected, GLX fallback
  three/         TLX            three.js r184 / TSL backend — the THIRD renderer behind
                                  the Gfx seam (tlx.js core, tlx-chunked/-post/-shadow.js;
                                  tsl-lit/-sky/-fx/-post/-chunks.js are the TSL shader
                                  graphs). Opt-in via localStorage apex26.gfxBackend =
                                  "three"; installed by descriptor-copy onto GLX so every
                                  GLX.* call site keeps working. Vendored three lives in
                                  vendor/three-0.184.0 (the only ES-module island)

js/track/        — track ENGINE (shared code) —
  tracks.js      Tracks         engine shell: spline resolve, build orchestration
  spline.js      TrackSpline    Catmull-Rom sampling / curvature
  mesh.js        TrackMesh      road/terrain mesh extrusion
  geom.js        TrackGeom      pure geometry emitters (addBox/emit/addCyl/…) + MAT ids
  graph.js       TrackGraph     scenery MODEL LIBRARY + NODE GRAPH. A model is a list
                                  of primitive OPS in canonical space (origin, identity
                                  basis); each placement is a node {model, o, r,u,t, s?}.
                                  Migrated emitters call ctx.instance(key, place, build,
                                  meta) instead of emitting inline — replay runs through
                                  the same GUARDED emitters, so geometry and on-track
                                  suppression are unchanged. Gate any migration with
                                  `node tools/graph-parity.cjs --all` (builds each track
                                  from a baseline ref AND the working tree and diffs the
                                  prop geometry vertex for vertex). `graph.stats().byKind`
                                  reports per-emitter instancing reuse;
                                  `graph.batches()` is the backend-neutral
                                  instanced-draw handoff (canonical mesh +
                                  column-major mat4 per instance + optional
                                  per-instance colour), returning the nodes that
                                  CANNOT be instanced as `bakeOnly`.
                                  See docs/research/SCENE-GRAPH-PLAN.md.
  space.js       TrackSpace     world↔track (Frenet) projection
  surface.js     TrackSurface   road surface build / tarmac-verge tinting
  markings.js    CircuitMarkings  curated FIA sector splits + turn apexes
  models.js      TrackModels    composite prop models
  themes.js      SceneryThemes  theme tables for the city generator
  landmark-kit.js, circuit-kit.js   landmark/circuit composite kits
  geo-paths.js   CircuitPaths   OSM circuit centrelines (was circuits.js)
  maps.js        TrackMaps      offline 2D picker outlines (was trackmaps.js)
  scenery-data.js  TrackSceneryData  static buildProps tables (BARRIER, FURN,
                                  city palettes/styles) — data only, no placement logic
  scenery-nature.js / scenery-city.js / scenery-structures.js / scenery-identity.js
                 Scenery*.create(ctx)   the buildProps split; together they serve the
                                  107-member scenery(api) contract frozen by
                                  tests/scenery-api-contract.test.mjs

js/circuits/     — circuit DATA —
  <id>.js        TrackDefs      40 circuits (one file each, registers on Tracks.LIST):
                                  24 season rounds then 16 retired `classic: true`;
                                  script-tag order == Tracks.LIST == picker/season order

js/car/          — car —
  car3d.js       Car3D          procedural F1 car geometry
  liveries.js    Liveries       custom paint jobs — colours plus an optional
                                  `finish` ("gloss" default | "satin" | "chrome"),
                                  applied by remapping the body-paint surface id
                                  (Car3D.FINISH_SURFACE); no shader change.
                                  The SHARK FIN is its own two paint slots:
                                  `fin` (the plate, defaults to c2) and `finArt`
                                  (the tail graphic on it, defaults to a colour
                                  picked to contrast the fin) — the fin is one
                                  flat colour, so art equal to it is invisible
  liverytex.js   LiveryTex      canvas-2D livery texture atlas (crests/sponsors/number)
  parts.js       Parts          upgrade catalog (12 categories, getMods, getCost, statMult)
  ghost.js       Ghost          time-trial ghost record/replay data layer
  teams.js       Teams          2026 grid (11 teams, 22 drivers, engine supplier per team)
  driver-ratings.js  DriverRatings  the five-axis skill table (pace/craft/awareness/
                                  consistency/experience), keyed by driver CODE.
                                  Deliberately NOT in teams.js: that file is the
                                  verified real-world grid, these are balance
                                  values that get tuned. Career layers its
                                  per-driver development deltas on top

js/data/         — data hub —
  api.js         F1API          Jolpica + OpenF1 clients, localStorage cache
  hub.js         DataHub        data hub DOM overlay shell + shared session plumbing
                                  (was data.js)
  telemetry.js   DataTelemetry  TELEMETRY tab (trace viewer/map/playback), created by
                                  hub.js via DataTelemetry.create(ctx). N-lane
                                  compare (up to 4) via a module-scoped tray that
                                  survives a SESSION switch → same driver's race
                                  vs quali lap side by side; laps[0] is the delta
                                  reference. Pure playback/GPS-sanity helpers are
                                  exported (_locAt/_dropStrays/…) for the tests.
  export.js      DataExport     EXPORT dev tool (GPS traces → ZIP)
  schedule.js / standings.js / lastrace.js / live.js   the other tabs, same
                                  Data*.create(ctx) pattern

js/net/          — multiplayer wire (2-player, WebRTC, NO backend) —
  transport.js   NetTransport   two channels — "state" (unreliable/unordered:
                                  snapshots + inputs; a late packet is
                                  worthless) and "event" (reliable/ordered:
                                  lobby, start tick, lap times, results).
                                  loopback() wires two endpoints IN ONE PAGE
                                  with injectable latency/jitter/loss so the
                                  netcode is testable with no network at all;
                                  rtc() is the real RTCPeerConnection. Both
                                  deliver only on pump(), so latency and loss
                                  are reproducible rather than wall-clock.
                                  A TURN RELAY SHIPS BY DEFAULT (a Metered
                                  free-tier credentials URL) because without
                                  one two devices ON THE SAME WI-FI often
                                  cannot connect: the only host candidate a
                                  browser offers is mDNS-obfuscated, and when
                                  that name will not resolve the sole
                                  remaining pair is srflx-to-srflx, which
                                  needs router hairpinning many do not do. The
                                  key is readable in devtools — inherent to
                                  client-side TURN, which is why the operator
                                  documents this exact fetch from a browser —
                                  and apex26.turnApi overrides it outright.
                                  prefetchIce() must be AWAITED BEFORE a
                                  connection is built (lobby's readyIce()):
                                  iceServers are fixed at construction, so a
                                  fetch that lands 200 ms later gathers
                                  STUN-only and every wire dump reads relay:0
                                  while the relay is demonstrably alive
  sdp.js         NetSdp         the invite code's payload as BYTES. A gathered
                                  data-channel SDP is ~700 B of text and almost
                                  none of it is information — we only ever
                                  negotiate one m-line, so every line is either
                                  a template constant or one of five facts
                                  (fingerprint, ufrag, pwd, setup role,
                                  candidates). Packing those is ~90 B, which
                                  takes the code from ~670 chars to ~240 and is
                                  what makes it SCANNABLE rather than merely
                                  pasteable. It never EDITS an SDP — it extracts
                                  and rebuilds — and packChecked() hands the
                                  rebuild to a throwaway RTCPeerConnection
                                  BEFORE a human sees it, falling back to the
                                  deflated full text if this browser refuses
                                  our own reconstruction. TCP candidates are
                                  dropped on purpose. Candidates are capped at
                                  MAX_CANDS and selected ROUND-ROBIN BY KIND
                                  (RETAIN, relay first) — never the first N,
                                  because SDP lists them in GATHERING order and
                                  relay is always last, so a plain truncation
                                  drops the relay on exactly the machines with
                                  enough interfaces to need one
  nostr.js       NetNostr       the room-code rendezvous, over PUBLIC NOSTR
                                  RELAYS via a vendored Trystero
                                  (vendor/trystero-0.25.3, MIT, dynamic
                                  import()). Nostr and not a public MQTT
                                  broker because accepting arbitrary events
                                  from anonymous clients is what a relay is
                                  FOR — HiveMQ's and EMQX's free brokers say
                                  outright they must NOT be used by real
                                  applications, and an earlier build did
                                  exactly that. SIGNALLING ONLY: Trystero opens
                                  its channel with createDataChannel("data")
                                  and no options, i.e. reliable+ordered, which
                                  is precisely wrong for snapshots — so it
                                  carries the two invite/answer STRINGS and the
                                  race then runs over our own PC. The host
                                  posts and waits; the guest passes a `reply`
                                  because it cannot answer until it has seen
                                  the invite.
                                  ROOM CODES ARE BEST-EFFORT AND THE INVITE
                                  LINK IS NOT: public relays increasingly
                                  refuse anonymous ephemeral events, and a
                                  refusal is a NIP-01 OK=false that the vendor
                                  turns into a console.warn — no retry, the
                                  relay stays in the pool, nothing reaches us,
                                  and getRelaySockets() still reports it OPEN
                                  because the WebSocket is. So exchange()
                                  intercepts that warning, and reports
                                  `all_rejected` when every live relay has
                                  refused. Measured on hardware: all six
                                  shipped relays healthy, wellorder answering
                                  "blocked: spam not permitted", both players
                                  on spinners. Pick relays with
                                  tools/nostr-probe.mjs — which tests the only
                                  criterion that decides this, whether a relay
                                  accepts an ephemeral event from an UNKNOWN
                                  pubkey — never by reputation or uptime
  rendezvous.js  NetRendezvous  room codes — the BACKUP way in, and the
                                  only part of the game leaning on someone
                                  else's server. NOTHING TO DEPLOY: a public
                                  Nostr relay network is the default meeting
                                  place (js/net/nostr.js), and
                                  worker/rendezvous.js (one Cloudflare Durable
                                  Object per code) is an optional upgrade when
                                  its URL is set. The broker is public, so the
                                  payload is AES-GCM sealed under a key derived
                                  from the code and the topic is a HASH of it —
                                  the operator relays bytes it cannot read, and
                                  the code is the only secret. A code is
                                  DISPOSABLE, not an account: nothing stored,
                                  claimed, squattable or personal, so it avoids
                                  everything a username system drags in. It
                                  carries the SAME invite/answer strings the
                                  manual flow uses, so the relay is a courier
                                  and never a participant. Every call resolves
                                  to a typed error, never throws — when the
                                  relay is down the lobby must fall back to the
                                  link/QR, which need nothing. Shown even when
                                  unconfigured: a feature that hides itself on
                                  an unset URL guarantees nobody discovers it
  qr.js          NetQr          byte-mode, level-L QR ENCODER (versions 1-20,
                                  standard mask selection). The invite QR holds
                                  the invite LINK, so the guest scans it with
                                  their ORDINARY CAMERA APP and lands in the
                                  lobby with the code already filled in — no
                                  in-page scanner, and none possible:
                                  BarcodeDetector is absent on desktop Linux
                                  Chrome and iOS Safari (measured). Encoder
                                  only; decoding is an order more code for a
                                  job the OS already does. Verified by jsQR (a
                                  devDependency) in tests/net-qr.test.mjs —
                                  self-consistency proves nothing here, since a
                                  wrong mask or a transposed format field
                                  produces a picture that looks exactly right
                                  and cannot be read
  scan.js        NetScan        reading a QR with the device CAMERA, so the
                                  answer stops being a copy/paste. Two transfers
                                  are unavoidable — each side must learn the
                                  other's DTLS fingerprint, and
                                  generateCertificate() takes no seed — so the
                                  second one is scanned instead of typed.
                                  Carries a VENDORED jsQR (Apache-2.0,
                                  vendor/jsqr-1.4.0, injected ON DEMAND and
                                  never in the boot path) because
                                  BarcodeDetector exists on neither iOS Safari
                                  nor desktop Linux Chrome, which is exactly the
                                  iOS-to-desktop pairing this is for. stop()
                                  kills every track and is wired to decode,
                                  cancel, lobby close and page-hide: a camera
                                  outliving its screen is a privacy bug nothing
                                  on screen would reveal
  handshake.js   NetHandshake   signalling with no server: vanilla ICE (gather
                                  fully, so one static string suffices) →
                                  slimmed SDP → deflate → base64url invite
                                  code, pasted between players. Embeds
                                  version.json's build and REFUSES a mismatched
                                  peer — different builds mean different
                                  splines, barriers and constants. Scenery is
                                  deliberately not checked (props never affect
                                  physics)
  snapshot.js    NetSnapshot    the wire format (13 B/car: s/x/head/speed/gear/
                                  lap, quantised to 1 cm and 1 cm/s) + the
                                  interpolation buffer. Remote cars draw ~100 ms
                                  in the past between two packets; a late packet
                                  EXTRAPOLATES ALONG s, which follows the road
                                  by construction and so cannot dead-reckon a
                                  rival into a barrier. s and head both wrap the
                                  short way — getting that wrong sends a car
                                  backwards down the lap once per lap.
                                  predict() leads sample(): contact must not be
                                  resolved against the delayed DRAWN pose
  session.js     NetSession     clock sync (NTP-style; keeps the LOWEST-RTT
                                  sample, since a slow reply is a queued reply
                                  and queuing is pure error), packet routing,
                                  typed JSON events, and a heartbeat, so
                                  an abandoned car can be handed back to the AI
                                  instead of standing still on track
  netplay.js     NetPlay        the game side (NetPlay.create(G)). AUTHORITY:
                                  each peer fully owns its own car; the host
                                  additionally owns the AI and race control. So
                                  your own car is NEVER corrected — no rollback,
                                  no reconciliation, no host advantage — at the
                                  cost of the two screens disagreeing by ~1 m
                                  under heavy contact. A rival is POSED from
                                  replicated state, so updateCar() early-outs on
                                  netPlay.owns(c), exactly as it already does
                                  for an incident-sim takeover. tick() also runs
                                  through the paused gate: one player opening a
                                  menu cannot stop a shared world.
                                  UP TO FOUR PLAYERS, in a STAR: the host holds
                                  one session per guest and each guest holds one,
                                  to the host. Rivals are a Map keyed by
                                  G.wireId(c) = teamIndex*2 + seat — a byte both
                                  peers compute identically, which is what lets a
                                  snapshot say WHICH car it describes. cars[]
                                  index cannot: makeCars() drops the custom team
                                  unless the local player picked it, so the grids
                                  differ in length and order. The host RELAYS —
                                  guests have no connection to each other, so it
                                  forwards every rival in one multi-entry
                                  snapshot, unaltered and under that guest's own
                                  id. Authority does not move; it is a courier.
                                  A packet with an unknown id is DROPPED, never
                                  guessed at — which is also how a guest ignores
                                  its own car coming back round the relay
  lobby.js       NetLobby       the VS FRIEND screen. INVITES ARE SEQUENTIAL —
                                  one negotiation in flight, INVITE ANOTHER once
                                  a guest lands. Not a limit of the wire
                                  (createInvite and rtc() are per-transport) but
                                  of people: with several offers outstanding a
                                  pasted answer must be matched to the offer that
                                  produced it, and that is the one thing the
                                  person pasting cannot tell you. A guest's
                                  profile is filed under the CONNECTION it
                                  arrived on, never a `from` in the payload — a
                                  peer that can name itself can name somebody
                                  else. The exception is a guest receiving a
                                  RELAYED roster: there a `from` means the host
                                  is speaking for another guest, and trusting the
                                  host is not new trust. Without that relay a
                                  guest never learns the other guests exist, has
                                  no slot for them, and drops their packets.
                                  The two code pastes ARE
                                  the signalling server — the one thing WebRTC
                                  cannot start without, and the one thing two
                                  people already have between them. Opens the
                                  session ITSELF (the guest learns which race to
                                  load from the host, so the session must exist
                                  before a track does) and hands it to NetPlay
                                  once the race is up. The profile it sends is
                                  part IDS, never resolved multipliers — a peer
                                  declaring {cornering: 9} would simply be
                                  faster. Its transport factory is injectable:
                                  an RTCPeerConnection whose ICE never completes
                                  spins forever, so a test that builds one HANGS
                                  rather than fails (__apex.lobbyFake)

js/game/         — game modules (each created with the G ctx façade from game.js) —
  tables.js      GameTables     static game data (CAM_MODES, DIFF, gears, paints)
  lighting.js    LightTune      TUNE_DEFS registry, live LT values, floodColor,
                                  LAMP_KINDS, buildTrackLights, setFrameLights,
                                  appendCarTailLights (profile store stays in game.js —
                                  it reads live track/tod/weather state)
  light-presets.js  LightPresets  shipped lighting-tuner values, keyed "track|tod|weather"
                                  (baked from the LIGHTING TUNER panel's COPY VALUES export)
  carmesh.js     CarMesh        car decal/effect/cockpit-instrument geometry
                                  (renderer handle injected via CarMesh.init(gfx))
  particles.js   Particles      transient particle pool (smoke/sparks/spray) + the
                                  rain overlay (Particles.rain*)
  bodyattitude.js  BodyAttitude the chassis pitch/squat/roll/bob read — visual only,
                                  never feeds the driving model
  debrisworld.js   DebrisWorld  Rapier side-world (vendor/rapier-0.19.3): debris and
                                  kinematic car mirrors. NEVER moves a game car
  incidentsim.js   IncidentSim  bounded incident window that MAY move a car — the
                                  high-risk layer; safety contract in its header
  agentview-raster.js  AgentRaster  the character-grid rasters behind
                                  __apex.render({what}) (view/map/circuit/car)
  ariastate.js   AriaState      mirrors each option group's visual selection onto
                                  aria-pressed for screen readers
  music-lib.js   MusicLib       bring-your-own-music library (IndexedDB), fed to GameAudio
  spotify.js     SpotifyMusic   optional personal-use Spotify Premium soundtrack
  input.js       Input          keyboard / gamepad / touch / tilt
  audio.js       GameAudio      WebAudio synth: engine, sfx, music
  store.js       GameStore      localStorage persistence
  perf.js        PerfGov        adaptive performance governor
  cameras.js     GameCams       the 13 player camera modes + debug free-cam
  cam-tune.js    CamTune        CAMERA TUNER data: per-mode framing offsets
                                  (height/dist/side/pitch/yaw/fov), store + apply();
                                  plus cornerLead (chase/far-only knob read by
                                  cameras.js to swing the chase INTO corners)
  hud.js         GameHud        in-race DOM HUD
  results.js     GameResults    results / season-end screens
  apex.js        ApexApi        the whole window.__apex dev API
  agentview.js   AgentView      the agent-facing JSON world view — world()/
                                  field()/trackInfo()/scene()/describe()/query()/
                                  atmosphere()/objective()/carView()/render()/
                                  survey()/rollout()/terminal()/corners()/
                                  agentHelp(); composes the __apex hooks
                                  into one egocentric snapshot with typed errors.
                                  render({what}) is the ONE raster (view|map|
                                  circuit|car); visible()/worldModel()/frame()/
                                  plan() still exist as DEPRECATED aliases —
                                  prefer render({what}) and scene({visible})
                                  (docs/AGENT-WORLD-API.md)
  atmosphere.js  Atmosphere     applyRaceSettings — time-of-day/weather scene state
  setup-ui.js    SetupUI        GARAGE screen (#carsetup) — WHO you are and WHAT
                                  you drive: TEAM & DRIVER, the 12 part categories
                                  + budget, LIVERY. The select screen owns WHERE
                                  you race and links here; race settings own HOW
  career.js      Career         CAREER core: the apex26.career.<flavour>.0..2
                                  saves (THREE DRIVER SLOTS + THREE MY TEAM,
                                  one live) + migration, sponsors (MY TEAM's
                                  multi-round briefs), the research FACILITY
                                  (the late-game money sink), the hire's
                                  contract, EXTRA FUNDS,
                                  the credits economy, contracts, driver/team
                                  development, R&D ownership, round settlement.
                                  Pure rules — no DOM. A plain global (like
                                  CamTune), because game.js calls it from
                                  makeCars()/recomputePlayerMods()/endRace().
                                  Every GAMEPLAY accessor is gated on
                                  inCareer(), NOT on "a save exists" — the save
                                  is read at boot so the title button can offer
                                  CONTINUE, but its rules must not reach a
                                  Grand Prix
  career-ui.js   CareerUI       the CAREER screen (#career): new-career setup
                                  and the season hub. Replaces #select in
                                  career — the calendar owns WHERE you race
  quali.js       Quali          ONE-LAP QUALIFYING (#quali). A `session`, not a
                                  game state: the player's flying lap reuses the
                                  time-trial path, and the rest of the field is
                                  MODELLED — a quasi-steady forward/backward lap
                                  simulation off the same LAT_MAX/ACCEL/BRAKE the
                                  driving model uses, so a simulated time and a
                                  driven one are on one scale. Feeds gridUp()
  reliability.js Reliability    RELIABILITY / DNFs: whether a car reaches the
                                  flag. Risk is DERIVED (team tier, relieved by
                                  career team development and by what the player
                                  spent on the ENGINE + GEARBOX), never a table.
                                  The whole field's retirements are drawn ONCE at
                                  the green light from a stateless hash of (seed,
                                  round, driver) via Career.hash — makeCars()'s
                                  simRnd() budget is a hard contract, so this
                                  consumes NOTHING from the sim stream. Ships OFF
                                  behind the RELIABILITY race setting
  menus.js       Menus          menu/select/pause DOM flows
  scrollfade.js  ScrollFade     "there is more below" edge fade + position indicator
                                  for every menu scroll region (self-initialising)
  menunav.js     MenuNav        desktop menu input (self-initialising): redirects a
                                  wheel/trackpad gesture that lands outside a pane
                                  into the open menu's nearest pane, and moves focus
                                  with the arrow keys / Home / End / PageUp / PageDown
  photomode.js   Photomode      photo mode
  tuner.js       TunerPanel     LIGHTING TUNER pause-menu panel
  cam-tuner.js   CamTunerPanel  CAMERA TUNER pause-menu panel
  steer-tuning.js  SteerTuning  ADVANCED STEERING panel

css/                            tokens.css (design tokens) + components/menus/hud/
                                  overlays/carsetup/data/tuner/track-detail/responsive
index.html                      shell — script tags, DOM structure, cache-bust version
tools/manifest.cjs              load-order single source of truth (script tags must match)
tests/*.spec.js                 Playwright specs (105) + tests/*.test.mjs unit suites (39)
docs/            developer docs (ARCHITECTURE.md, DEBUG-HOOKS.md, SCENERY-API.md, …)
                 ARCHITECTURE-REVIEW.md is the standing assessment + defect
                   register: what the no-build-step bet costs, why asserted
                   invariants hold and prose ones drift, and what is deferred
```

---

## Critical conventions

- **Cache busting**: `index.html` uses `?v=N` on every asset URL (check `index.html` for the current N).
  **Always increment N when changing any JS or CSS file** — search `?v=` and replace
  all instances (`sed -i -E 's/\?v=[0-9]+/?v=N/g' index.html`). **Also bump
  `version.json` `{ "build": N }` to the SAME N** — the shell version guard in
  `index.html` fetches it (no-store) and force-reloads a stale installed PWA when
  the deployed build is newer than the cached shell (index.html itself has no
  `?v=`, so this is the only thing that refreshes the HTML markup — e.g. a new
  pause-menu button).
- **No ES modules** — everything is `"use strict"` IIFE, assigns one global. No
  `import`/`export`.
- **Load order lives in `tools/manifest.cjs`** — the single source of truth,
  asserted against `index.html` by `tests/load-order.test.mjs` (run via
  `npm run test:tooling`). **New-file checklist:** (1) create the IIFE file in the
  right `js/<domain>/` dir; (2) add its `<script>` tag to `index.html` at the
  correct position; (3) add the matching entry to `tools/manifest.cjs` — the test
  catches any divergence; (4) bump `?v=N` + `version.json`. `HARD_EDGES` in the
  manifest records eval-time load dependencies (A must load before B because B
  reads A's global at eval time). `tools/verify-track.cjs` and the VM-based tests
  read the manifest's `TRACK_VM` list instead of hardcoding paths.
  `tools/extract-module.mjs` assists further game.js extractions.
- **DEFERRED modules have no `<script>` tag.** `js/render/three/*` (TLX) and
  `js/render/webgpu/*` (WGX) are the two opt-in renderer backends — ~532 KB that
  every visitor used to parse for something almost nobody runs — so they are
  listed in the manifest's `DEFERRED` map instead of `FULL`, and `js/game.js`
  injects them at boot only when `apex26.gfxBackend` selects one. Three things
  must agree and `tests/load-order.test.mjs` asserts all three: `DEFERRED`,
  `BACKEND_FILES` in game.js, and the OPTIONAL precache seed in `sw.js` (the
  service worker finds every other asset by parsing the shell's own tags, so a
  tagless file is invisible to it). A failed injection is not an error path —
  `Gfx.create` already reads a missing `TLX`/`WGX` global as "unavailable" and
  falls back to GLX.
- **`js/track/` = engine, `js/circuits/` = data.** Circuit defs (one per track)
  live in `js/circuits/<id>.js`; all shared spline/mesh/scenery code lives in
  `js/track/`. Circuit script-tag order == `Tracks.LIST` == picker/season order.
- **The `G` ctx façade**: extracted `js/game/*` modules never reach into game.js —
  game.js builds one `G` object of live getters/setters over its closure state
  plus stable helpers, and instantiates each module via `Module.create(G)`.
- **localStorage keys** are all prefixed `apex26.` (e.g. `apex26.team`,
  `apex26.parts.mercedes`).
- **Coordinates**: +Y up, distances in metres, angles in radians, arc position `s`
  in metres (0 → track.total), lateral `x` in metres (+right of centreline).

---

## Parts system (`js/car/parts.js`)

**THE ERS PART RUNS THE BATTERY.** Every category moves the four stats
(`speed`→`vmax`, `accel`→`ACCEL`, `cornering`→`LAT_MAX`, `braking`→`BRAKE`), and
all twelve have real spread — but ERS's options *describe* battery behaviour
("harvests extra energy under braking", "maximum recovery window", "immediate
deployment") and for a long time did none of it. `Parts.ersProfile(setup, team)`
returns two 0..1 axes read from the bias the catalog already encodes
(`deploy` ← the option's `accel`, `regen` ← its `speed`), and they drive
`drainFor`/`regenFor`/`otTimeFor`/`otCoolFor` in game.js. Deriving rather than
authoring new fields keeps the SIGNATURE clones consistent for free, since they
copy those stats. Measured:

| ERS part | deploy / regen | boost lasts | recharge | OT push / cooldown |
|---|---|---|---|---|
| `harvest` | 0.00 / 0.43 | 3.8 s | 5.4 s | 3.2 s / 14.0 s |
| `standard` | 0.22 / 0.29 | 4.3 s | 5.9 s | 3.6 s / 12.9 s |
| `overcharge` | 1.00 / 1.00 | 7.1 s | 4.0 s | 5.2 s / 9.0 s |

A car with no parts — every AI — sits at the midpoint of both axes.
`physState()` reports `ersDeploy`, `ersRegen`, `drain`, `regen`, `otTime`,
`otCool`.

`Parts.CATALOG` — an **array** of 12 category objects (ordered, not keyed by id):
`engine`, `aero`, `suspension`, `brakes`, `tyres`, `ers`, `gearbox`, `fuel`,
`exhaust`, `floor`, `cockpit`, `wheels`. Each
category is `{ id, label, options:[…] }`; each option has
`{ id, label, cost, desc, speed?, accel?, cornering?, braking?, supplier? }`.
Budget = 600 cr. `Parts.getMods(setup, teamEngine)` returns
`{speed, accel, cornering, braking}` multipliers. Supplier-exclusive options
(e.g. `manu_mercedes`) are only shown when `team.engine` matches.
`unlimitedBudget` (localStorage `apex26.unlimitedBudget`) removes the 600 cr cap.

Every option also carries a parametric `visual` **recipe** consumed by `Car3D`
(`getVisualTiers().._visual`); `VISUAL_FIELD_REGISTRY` names the one consumer of
each recipe field, and `tests/parts-physics.spec.js` fails on an unregistered or
stale field, a duplicate recipe within a category, or an engine that repeats
another's six-field bodywork shape. The newer STRUCTURE knobs are
`aero.plate/casc/swan/tvane` (endplate profile, cascade count, swan-neck mount,
T-wing), `engine.chimney`, `brakes.scoop`, `ers.conduit`, `fuel.filler`,
`exhaust.pipes/bore/flare/wastegate/wrap` and `floor.fences/fenceH/skid/edgeLip`
— each defaults to the shipped geometry, so an option written before them is
unchanged. EXHAUST and FLOOR took over geometry that used to be hardcoded (the
tailpipe derived from `engine.twin`, and a fixed five-fence floor edge); both
still derive exactly that when their recipe leaves the field at its default.

Prefer knobs that change WHAT EXISTS over knobs that scale what is already
there. A category whose recipe is all scalars gives every team the same part at
a different size — `tyres.shoulder`, `brakes.discFace` and `suspension.rocker`
exist because those three read as near-identical across the grid without them.

**SIGNATURE options** (`tag: "SIGNATURE"`, `teams: [id]`) are cost- and
physics-identical clones of the universal option named in `equivalent` — they buy
a distinct mesh, never an advantage, and the test suite enforces that. Every team
fields one in every category via `FACTORY_PRESETS`, except the four on a
manufacturer-exclusive FACTORY power unit (that unit is already team-unique).
`FACTORY_PRESETS` drives AI car MESHES only — never AI physics or player saves.

---

## Physics

Per-axle bicycle model. Key tuning variables in `game.js`: `WHEELBASE`,
`STEER_EXPO`, `STEER_MAX_SLIP`, `STEER_SPEED_REF`, `DRIFT`, `ROAD_FOLLOW`,
`PLAYER_GRIP`, `FRONT_GRIP`, `YAW_DAMP`, `YAW_INERTIA`, `PACE`. Modify via
`__apex.setPhysics(o)` for A/B tests.

**`PACE` is a ground-speed scale, not a speed cap.** The OVERALL SPEED slider
scales the car's real m/s (and the accel curve) — nothing else. Everything else
measured in speed is pace-normalised through two helpers next to `VMAX`:
`vTop()` (where the envelope tops out in m/s — divide by it to normalise) and
`vStd(v)` (that speed on the standard, pace-5 scale — compare hard-coded
thresholds against it). So `VMAX`, `GEAR_TOP`, `TAPER_LO/HI`, `GRASS_V` and
`STEER_SPEED_REF` all keep their literal values, while the gearbox still sweeps
1→8, the tach its whole band, and the dial 0 → ~259 km/h at *every* setting.
Only lap times move. **Adding anything that divides a speed by `VMAX`, or
compares one against a literal, means picking `vTop()` or `vStd()`** — a bare
`VMAX` there silently makes the slider shrink the player's envelope again.
`__apex` hooks stay raw m/s; `obs().dashKph` is what the dial reads. True force
constants (`LAT_MAX`, `BRAKE`, `LONG_GRIP`, `ACCEL`) are deliberately absolute —
that is what makes low pace more forgiving.

**Combined-slip (friction ellipse)**: `LONG_GRIP = 34 m/s²` is the longitudinal
axis of the traction circle. Braking or accelerating consumes longitudinal grip;
`slipFactor = sqrt(1 − (axEstSm/LONG_GRIP)²)` scales lateral grip. Trail-braking
rotates the car; hard braking mid-corner understeers. Exposed via `physState()`
fields `axEstSm`, `axFrac`, `slipFactor`.

**ACTIVE AERO (X-mode / Z-mode)** is the THIRD straight-line lever, next to
BOOST (spends the battery) and OVERTAKE (a free, proximity-gated push). It adds
NO thrust and spends NO energy — it trades **downforce for drag**, the 2026
moveable-wing rules. Z-mode (the default) is flaps shut and full downforce;
X-mode is flaps open, `xVmaxGain(c)` on top speed and `xCoastCut(c)` off the
coast drag, paid for with `xDfLoss(c)` of the `DOWNFORCE` aero-load term.
Nothing else in the grip model changes.

**THE SIZE OF THE TRADE IS THE AERO PART'S.** All three were single constants,
which gave a Monza-spec sliver and a maximum-downforce floor exactly the same
deal — backwards, because a big wing has more drag to shed AND more downforce to
lose. `Parts.aeroLoad(setup, team)` reads the resolved aero option's own
`cornering` and normalises it against the catalog's span (0 = `minimal`,
1 = `ground_effect`; derived from the catalog, so a new option re-scales the axis
rather than clipping). The car carries it as `c.aeroLoad`, and each constant
became a `_LO`/`_HI` pair interpolated by it. **A car with no parts — every AI —
sits at the midpoint**, so the grid is one well-defined thing rather than
whatever the catalog default is this month. Measured end to end:

| aero part | load | top speed | downforce given up | net grip at 70 m/s |
|---|---|---|---|---|
| `minimal` | 0.00 | +5.5 % | 42 % | −16.0 % |
| `medium` | 0.41 | +9.6 % | 57 % | −21.4 % |
| `ground_effect` | 1.00 | +15.5 % | 78 % | −27.3 % |

The big-wing car has the LOWEST base top speed and the biggest gain from opening,
so X-mode partly buys back the straight-line speed the wing costs — which is the
real trade, and the reason the two ends are worth choosing between.
`physState()` reports `aeroLoad`, `xVmaxGain`, `xDfLoss`, `vmaxNow`, `aeroGrip`
and `aeroDf`, so none of this has to be read out of `updateCar` again.

`c.aeroX` is the FLAP TRAVEL (0..1) and is what every consumer reads — physics,
HUD and the wings' own moveable ELEMENTS. Per the 2026 rules every element
except each mainplane rotates, and both wings actuate together: at the default
downforce level that is the front cascade's top two flaps plus the rear wing's
top two planes — four elements, all driven by the one `aeroX`. They are NOT
baked into the car mesh; `Car3D.aeroFlaps()` hands them out as canonical hinged
specs (leading edge at the origin) and `drawAeroFlaps` places them, so the car
at rest is geometrically identical to the old fixed wing. `Car3D.buildFlapGeom`
runs the SAME `addWingPlanform` emitter the baked wing uses and both read one
table, so they cannot drift apart. Closed = the element's own incidence plus
`Z_BITE`, CLAMPED per element against the measured nose underside (`NOSE_UNDER`)
so nothing ever swings into the bodywork; open = flat. `X_OPEN_RATE` is set by
the FIA's 400 ms transition cap, not by feel. The GARAGE turntable shares the
same draw, so its ACTIVE AERO button shows the real geometry at real angles.

`c.xOn` is the switch and `c.xArmed` whether the car is allowed the mode here at
all. Allowed means **inside an ACTIVATION ZONE**: the FIA approves fixed zones
per circuit and the standard ECU refuses to rotate the wings outside one, so
`buildAeroZones()` scans each built track for contiguous runs under `X_ZONE_K`
and keeps those longer than `X_STRAIGHT_T × X_ZONE_VREF` (210 m — the rule's
three seconds at racing speed). Zones are measured against a FIXED reference
speed, never the car's, because they are a property of the circuit and the
OVERALL SPEED slider must not redraw them. A circuit whose longest straight
misses the minimum gets **no zones and no active aero** — that is MONACO, and
`tests/aero-zones.spec.js` pins it. Zones can WRAP the start line, so
`aeroZones()` exposes `midFrac` and every consumer should use it rather than
averaging `startFrac`/`endFrac`.

Braking or leaving the zone shuts the flap AND drops the switch, and
`X_CLOSE_RATE` is ~4× `X_OPEN_RATE` — the downforce comes back faster than it
left. The HUD chip counts the next zone down in metres like a DRS board, and
reads `NO AERO ZONE` (struck through, button faded) on a circuit that has none.

**MANUAL or AUTO** is a pause-menu setting (SETTINGS ▸ DRIVING, next to GEARS —
it is a control preference, not a property of the event, which is why it is not
in RACE SETTINGS). On AUTO the wing takes every zone by itself and the AERO
button is **removed from the dock**, not greyed: the survivors close ranks,
which the flex dock can do and the old absolutely-positioned stack could not.
`store.get("aeroMode")`, `__apex.aeroMode()`, `raceAeroMode` in game.js.

Adding a consumer? Read `c.aeroX` (or `aeroDfMult(c)` for the downforce
multiplier) — **never `c.xOn`**. The switch is not the wing.

**OVERTAKE IS NOT ACTIVE AERO, and the two sets of rules must not be crossed.**
Overtake mode is 2026's successor to DRS as the *proximity-gated* overtaking aid,
so it inherits DRS's safety restrictions; active aero inherits none of them.

| | ACTIVE AERO (X-mode) | OVERTAKE |
|---|---|---|
| proximity to the car ahead | **none** — leader and backmarker alike | within `OT_GAP` (1 s) |
| where | inside an ACTIVATION ZONE only | anywhere |
| opening lap | **available** | disabled until the LEADER completes lap 1 |
| under a caution | available | disabled |
| circuit with no zones | unavailable (Monaco) | available |

`otEnabled()` in game.js is the race-wide gate — it reads `ranked[0].lap` (the
LEADER's, because a field-wide switch is what race control throws, and it is
O(1) since `ranked` is already sorted) and `caution.level`. `c.otArmed` folds
that together with the car's own gap and cooldown. The HUD says `NO OVERTAKE`
and fades the button while the gate is shut, because "not armed yet" (keep
closing) and "switched off" (nothing you do will arm it) are different messages.
`tests/aero-zones.spec.js` pins both halves, driving a REAL opening lap —
`setLap()` moves only the player's counter, so a teleport cannot exercise a
leader-based gate.

**The player is a world-space rigid body.** `px`/`pz`/`head` are the authority:
the car integrates its own position in world metres from tyre forces alone and
owes the road nothing. `(s, x)` is READ BACK off that position each frame by
`trackFrom()` — a predictor (distance along the road ÷ the Frenet stretch `h`,
see `frenetH`) plus two local Newton steps onto the perpendicular foot — purely
so the rest of the game can ask "where on the track is that?" (lap timing, walls,
kerbs, race position, HUD). The refinement is deliberately **local**: it never
leaves a few metres of last frame's `s`, so it cannot snap onto the wrong leg of
a hairpin the way a global `Tracks.project()` search does. That was the original
reason this code integrated in the road frame instead — keeping the search local
buys the road frame's robustness without surrendering the car's independence.

Only two things may move the player in road coordinates, because both are hard
constraints rather than suggestions: the **barrier clamp** (`xPinned`) and
**car-to-car collisions** (resolved in the `(prog, x)` plane). Both write back
into `px`/`pz`. Everything else flows world → `(s, x)`. Rebuilding the world
position from `(s, x)` unconditionally — as the code did when `(s, x)` was the
authority — silently puts the car back on the road's rails.

**Road-follow assist is OPT-IN and ships at 0.** `ROAD_FOLLOW` used to default to
0.7 with a DRIVING HELP slider that bottomed out at 0.25, so a quarter to a half
of every corner was steered for you and it could not be switched off (~20 % of
available lock at 50 m/s, ~40 % in a slow corner). Nothing steers the car by
default now except the driver; `helpFromSlider` runs `0 .. 0.70` with v1 = OFF,
and RELAX is the preset that opts back in. When enabled it steers toward the
curvature of the arc the car is actually on (`kPath = k/h`, not the centreline's),
**fades to zero off-track** (`offAssistFade`, over ~3 m of grass past the edge) so
the driver keeps full manual authority to recover, and fades under hard braking
(`brakeFade`) to kill the turn-in snap.

**Changing an assist DEFAULT does not reach existing players.** `store.get(k, d)`
returns the stored value whenever the key exists, so a new default only lands on a
fresh install — anyone who ever opened the settings keeps the old behaviour
forever. `drivingHelp` and `raceLine` are migrated once via `STEER_SCHEMA` in
`js/game/steer-tuning.js`; bump it if a slider's *meaning* changes again (an old
stored number does not carry over when the scale it was written against moves).

### The arc must not reach the driver

With the assists off, **nothing derived from the track's curvature or its racing
line may affect the player** — not just the forces. Auditing forces alone missed
several channels, each of which read as "the car is being pulled":

| channel | must come from |
|---|---|
| steering | driver input + tyre forces (assist only when opted in) |
| lap progress | the car's own world motion, via `trackFrom()` |
| rendered position | `px`/`pz` interpolated in **world** space, never lerped/damped `(s, x)` |
| drawn nose angle | the real heading `psi`, unclamped and unlagged |
| tyre squeal / marks / smoke | body **slip angle**, never `|k| * speed` |
| barrier alignment | the **barrier's** tangent (`wallAt` slope), not the centreline's |
| chase / cockpit / hood cameras | the car's world pose + heading |

Legitimate track reads are *surface* properties — grip, kerbs, banking, slope
gravity, crest/dip vertical load, road width, barrier position — plus AI-only
logic (racing line, corner braking, ERS) and the broadcast cameras.

When adding anything that reads `Tracks.curvature()`, ask which column it belongs
in. `grep -rn "Tracks.curvature\|kCur" js/game.js js/game/*.js` is the sweep;
every hit should be AI-only, assist-gated, broadcast-only, or surface.

---

## Lighting & sky (`js/render/glx.js` + `applyRaceSettings` in `js/game/atmosphere.js`)

Lit shader = directional sun (shadow map) + hemisphere ambient (`uAmbSky`/`uAmbGround`)
+ up to 32 point lights (uniform arrays, 15 floats per light). Composite: ACES tone-map + `colourGrade` + bloom +
lens flare + vignette. Night: ambient floored+capped, sun dimmed to moonlight,
floodlights on. Day: `_trackAtmoBias` per circuit. `buildTrackLights()` (in
`js/game/lighting.js`) places floodlights every ~22 m; `setFrameLights()` culls
to nearest CAP per frame (`LT.lampCull` def 28 with traffic, else 32 solo; shader max 32).

```js
__apex.lightState()           // { ambientSky, ambientGround, sunColor, numLights, … }
__apex.setTimeOfDay('night')  // 'dawn'|'day'|'dusk'|'night'|'default'
```

See `docs/LIGHTING-REF.md` for the light-record layout, shader uniforms, time-of-day branches, masts.

### Lighting tuner (`TUNE_DEFS` / `LT` in `js/game/lighting.js`)

The in-game **LIGHTING TUNER** (pause-menu page) exposes every hand-tuned
lighting/rendering value as a live slider. `TUNE_DEFS` is the registry and `LT`
the live values (both in `js/game/lighting.js`, global `LightTune`; the profile
store/resolution lives in game.js because it reads live track/tod/weather); the
driver reads `LT.<id>` each frame instead of a literal (shader-side ones upload
via `frame.tune`/`opts.tune` — `u:` field names the uniform). Values are stored
**per (track, time-of-day, weather) profile**. Resolution, lowest→highest
precedence: `TUNE_DEFS.def` → `LightPresets["*"]` → `LightPresets["track|tod|wx"]`
→ localStorage `"*"` → localStorage `"track|tod|wx"`. So `js/game/light-presets.js` is
the shipped baseline and a player's live edits (localStorage `apex26.lightTune`)
always win. Panel COPY VALUES exports the merged store as the paste-ready
`window.LightPresets = {…}` body to bake in. `__apex.lightTune(obj?)` gets/sets
the current profile. Add a knob: append to `TUNE_DEFS` (+ a shader uniform &
`frame.tune` upload if not a driver literal); the A/B harness catalog
(`tools/ab-lighting.mjs`) must point at its new home.

---

## City & scenery dressing (`buildProps` / `buildRoad` in the `js/track/` engine)

Procedural per-circuit dressing on top of each track's `scenery(api)` callback.
Session-time-aware (rebuilt on day↔night flip). Street/modern themes get the city
generator (`STYLES[def.id]`): building silhouettes, neon palettes, reflective glass
mesh (`track.meshes.glass`). All 24 tracks get furniture (`FURN`): trees and street
lamps (glow HDR at night). Street circuits get armco barrier liveries (`BARRIER`).
`buildRoad` tints tarmac/verge via a stable per-track hash.

See `docs/SCENERY-API.md` for the `scenery(api)` reference, building kinds, tables.

---

## Baked asset pack (`assets/pack/` + `js/render/assets.js` + `tools/assets.mjs`)

Optional PBR **material arrays**: one `TEXTURE_2D_ARRAY` whose **layer index is
the `MAT` id**, so any surface can be textured from the per-vertex material id it
already carries — **no UV channel** (the sample reuses the procedural materials'
own triplanar convention in `lit.js`) and no new vertex attribute.

- **Blended, not replaced.** `albedo * tex.rgb * 2.0`, so per-track tarmac tint,
  racing-line wear and per-vertex grain all survive.
- **Ships ON.** `matTexMix` is a `TUNE_DEFS` knob and its `def` is `1.0`, so the
  pack is fetched at boot and blended by default; `__apex.matTex(0)` is the A/B
  knob that turns it back off. (It shipped at 0 once, behind a lazy "only fetch
  when matTexMix > 0" load — that guard was removed because with the knob on by
  default nobody can turn it off BEFORE their first load, so it saved nobody
  anything. See the comment at the Assets.load() call in js/game.js.)
- **Every failure degrades to procedural** — no pack, malformed pack, or a
  backend with no `createTextureArray` (WGX/WebGPU, which has not ported the
  procedural material system either). Boot never awaits or fails on assets.
- **GLX and TLX implement it; WGX does not.** Feature-detected, never assumed.
- The committed pack is generated by our own tool from our own noise
  (`Apex26-Procedural`) — no third-party licence obligation. Real CC0 scans drop
  in through the same manifest. `tools/assets.mjs verify` enforces a licence
  allow-list, per-asset source traceability and an 8 MB budget.

See `docs/research/ASSET-API-RESEARCH.md`.

## `window.__apex` dev API  — see `docs/DEBUG-HOOKS.md` for the full reference.

```js
__apex.race("monza")          // load track, skip menus
__apex.park(0.1)              // stationary at 10% lap, frozen for screenshot
__apex.snapCam()              // REQUIRED after park()/jump() before a shot: the camera
                              //   eases toward its rig target, so without this you
                              //   photograph a camera still flying to the car
__apex.jump(0.5, 60, 0)       // teleport to 50% lap at 60 m/s
__apex.go()                   // start race, grid intact
__apex.finishRace()           // trigger results screen
__apex.freeze(bool?)          // get/set physics-frozen state
__apex.hud(show?)             // toggle HUD visibility
__apex.weather("wet"|"dry")   // live weather change
__apex.setTimeOfDay("night")  // live dawn|day|dusk|night|default — no asset reload (rebuilds only on day↔dark flip)
__apex.resetPlayer()          // force immediate rescue
__apex.carAt(idx?)            // detailed telemetry for one car
__apex.tracks()               // list all circuit ids
__apex.teams()                // list all teams + engine suppliers
__apex.camera("cockpit")      // switch camera mode (clears any view() free-cam)
__apex.camTune("chase", {height:0.6, dist:2})  // CAMERA TUNER: per-mode framing offsets
                              //   (height/dist/side/pitch/yaw/fov, 0 = shipped framing);
                              //   no args lists them, null resets that mode
__apex.view({ s:0.3, side:"L" }) // free debug camera (camera()/snapCam() clear it)
__apex.eyeAt(0.116, 0, 2.5)   // track-relative free-cam: eye at frac/lat/height, look ahead
__apex.orbit(0.116, 45, 15, 35) // orbit a track point (az,el,dist) — inspect from all sides
__apex.carOrbit(0, 40, 10, 4)  // orbit a CAR (idx, az, el, dist) — az 0 = behind, 180 = head-on
__apex.studio({intensity:3})  // studio light rig around the player car (false = off)
__apex.groundY(0.11, 12)      // rendered terrain height + road height + gap at frac/lat (gap finder)
__apex.viewState()            // combined scene/camera snapshot
__apex.camState()             // active camera {eye,tgt,fov,debug} (debug=true under a view() override)
__apex.lightState()           // lighting snapshot: ambientSky/Ground, sunColor, exposure, numLights
__apex.gpuTimer(on?)          // GPU frame timer {supported,on,ms} — Chrome/Android only (no iOS Safari/SwiftShader); GPU-side counterpart to perf-profile
__apex.assets()               // baked-pack state {supported,pack,uploaded,tier,layers,scales,…}
__apex.assetLoad(tier?)       // (re)load the material arrays ("low"|"high"); false = unload
__apex.matTex(0..1)           // BAKED MATERIALS blend — the A/B knob for the pack (ships at 0)
__apex.credits()              // attribution roll for every baked asset
__apex.aero(true)             // ACTIVE AERO: request/drop X-mode (2026 moveable
                              //   wing). No arg reads {xOn,xArmed,aeroX,mode,
                              //   inZone,zoneAhead,zones,auto}; aeroX is the
                              //   FLAP TRAVEL the physics reads — asking for X
                              //   outside a zone leaves it at 0
__apex.aeroZones()            // the circuit's fixed ACTIVATION ZONES; use
                              //   midFrac, not the average of start/endFrac —
                              //   a zone may WRAP the start line. Empty on a
                              //   circuit with no qualifying straight (Monaco)
__apex.aeroMode("auto")       // MANUAL | AUTO — the same door as pause >
                              //   SETTINGS > DRIVING. AUTO takes every zone
                              //   itself and REMOVES the AERO button
__apex.caution()              // race control's flags {level 0-3, label, sector,
                              //   frac, total, sectors[3], sinceT, cause,
                              //   enabled}; caution(true|false) switches the
                              //   whole layer (the CAUTIONS race setting's door)
                              //   and switching it off drops any flag flying
__apex.setPhysics({pace:0.8}) // override physics params
__apex.probe()                // player telemetry (x, angle, k, hw, speed, s)
__apex.physState()            // full state (slip, wrongWay, lap, rescueT)
__apex.cars()                 // all car telemetry sorted by prog
__apex.scan([10,30,60])       // look-ahead curvature/width at distances
__apex.corners()              // apex fractions for the loaded track
__apex.trackGraph()           // the built scenery SCENE GRAPH (js/track/graph.js):
                              //   models + nodes, stats(), and batches() — the
                              //   backend-neutral instanced-draw handoff
__apex.wallStats()            // barrier geometry audit
__apex.setInput({steer:1,throttle:true}) // override input
__apex.step(1/60, 10)         // pump physics deterministically
__apex.clearInput()
__apex.tiltSim.step(deg, dt)  // tilt pipeline emulation (for autopilot harness)
// ── Timing & field ──
__apex.timing()               // compact race clock: raceT, lapTime, best, lap, pos, energy, gear, sector
__apex.sectorState()          // live S1/S2/S3 splits: {idx, elapsed, bests[3], last[3]}
__apex.lapHistory()           // completed lap times — full array in TT, best/lastLap in race
__apex.fieldState()           // full grid sorted by race position with gap (m)
__apex.aiPlace(idx,frac,v?,x?) // teleport any AI car (by cars[] index) to a track position
__apex.setEnergy(v)           // set player ERS charge 0–1 (clamped)
__apex.setLap(n)              // override player lap counter (for results-screen tests)
__apex.trackProfile(n?)       // [{frac,y,k,hw,slope}] — elevation/curvature profile (default 100 pts)
// ── Career & qualifying (js/game/career.js, js/game/quali.js) ──
//    A career SAVE existing is not a career being PLAYED: the save loads at boot
//    so the title button can offer CONTINUE, but its rules only apply while
//    flow === "career". A career IS a championship, so seasonMode stays true.
__apex.info()                 // + flow ("gp"|"season"|"career"), session
                              //   ("race"|"tt"|"quali"), career (a save exists)
__apex.career()               // the whole live career save, or null
__apex.career({teamId:"haas", seat:1, seed:42})   // start one, skipping the setup
                              //   screen; flavour:"myteam" + hire:"<code>" for MY TEAM
__apex.careerState()          // compact snapshot — prefer this to reading the save
__apex.careerMoney(n?)        // get/set the balance
__apex.careerSim(n)           // settle n rounds with nobody driving, through the
                              //   SAME settleRound() the driven path uses. Needs a
                              //   track staged; reuses THAT circuit for every round
__apex.careerRollover()       // force the season rollover -> {champion, offers, history}
__apex.careerReset()          // wipe the LIVE slot
__apex.careerSlots()          // all SIX slots (3 driver + 3 my team); a flavour
                              //   narrows to one set; (flavour, i) SWITCHES to it,
                              //   saving the career being left first
__apex.careerSlotDelete("myteam", 0)   // wipe ONE slot, leaving the other five
__apex.careerFreeMoney(true)  // EXTRA FUNDS cheat — money stops being scarce, but
                              //   the FITTED CAP does not move
__apex.careerGrant(5000)      // hand the live career credits
__apex.careerFacility(true)   // the open-ended research facility (the late-game
                              //   sink): each level cuts research cost for good
__apex.careerHire("renew")    // MY TEAM's second seat — no arg reports a pending
                              //   decision, a free-agent CODE signs somebody else
__apex.ratings(code?)         // five-axis driver table + overall; no args = the grid.
                              //   Applies in EVERY mode, not just career
__apex.qualiSim(playerTime?)  // the qualifying model for the loaded track WITHOUT
                              //   running a session (a real weekend is left alone)
__apex.carAt(i)               // + code, seat, tierV, skill, ratings — the two
                              //   multipliers that decide AI pace, now observable;
                              //   + retired/dnf/dnfAt/finPos
// ── Reliability & retirements (js/game/reliability.js) — ships OFF ──
__apex.reliability("real")    // the RELIABILITY race setting: off | low | real
__apex.retirements()          // the armed plan — who stops, why (engine|gearbox|
                              //   accident) and at what fraction of race distance.
                              //   Drawn ONCE at the green light; consumes nothing
                              //   from the sim RNG stream
__apex.retire(1, "gearbox")   // retire a car NOW (no arg = the player)
// ── Headless / RL control loop ──
__apex.headless(true)         // skip render() — physics runs uncapped
__apex.obs()                  // full debug observation (pos, slip, clearances, scan, reward, gear)
__apex.act({steer,throttle,brake}, dt, n) // set input + step n ticks → obs (1 round-trip)
__apex.reset(frac, speed, x)  // fast episode reset without reloading assets → obs
// ── Agent world view (js/game/agentview.js) — never returns null; failures are
//    {ok:false, error, message, fix}. Two exceptions to know: scene() on a
//    street circuit whose props are still building returns a SUCCESSFUL empty
//    list (not an error), and visible()/render({what:"view"}) reuse the last
//    RENDERED frame — stage and let frames draw before trusting either.
//    seed() below lives in apex.js, not agentview.js, and just returns a
//    number. See docs/AGENT-WORLD-API.md ──
__apex.agentHelp()            // manifest of this surface (~5.5 KB, ~1.4k tokens —
                              //   read it ONCE per session, never per tick)
__apex.objective()            // what the GAME is: win condition, trade-offs,
                              //   constraints. Static; does NOT describe car
                              //   dynamics (learn those from rollout()/act())
__apex.seed(42)               // get/set the SIM seed; same seed + same inputs
                              //   => same result. reset(f,v,x,seed) does both.
                              //   Cosmetic randomness stays unseeded by design.
__apex.world({detail:"brief"})// egocentric snapshot; brief|drive|full; since= → delta
__apex.trackInfo({what:"corners"}) // STATIC per-track: corners/sectors/profile
__apex.scene({radius:120})    // NAMED scenery nearby (trees, buildings, stands…)
__apex.field({detail:"brief"})// THE GRID — race order, gap-to-leader, interval
__apex.atmosphere()           // the light as text — day/night, sun/moon, fog, wet
__apex.describe("prop:12")    // EVERYTHING about one entity — also corner:T3,
                              //   car:4, span:2; ids come back from scene()/
                              //   query()/trackInfo()/field()
__apex.query({kind:"pine", near:150})  // a BOUNDED slice; returns prototype +
                              //   instances so repeated dressing costs one shape
                              //   plus a position each. Narrow, don't raise limit
__apex.render({what:"view"})  // the ONE raster — view|map|circuit|car. APPROXIMATE,
                              //   for intuition, not measurement. {cols,ss,camera}
                              //   (replaces frame()/plan()/worldModel()/visible(),
                              //   which remain as deprecated aliases)
__apex.carView({team:"ferrari", detail:"render"}) // the car as JSON + edge+shade
                              //   text elevations (side/top/front) from the real
                              //   mesh; detail:"parts" = per-part measured boxes
__apex.survey({stations:24})  // geometry DEFECTS: floating/buried props, props
                              //   over the racing line, terrain through the road,
                              //   holes and cliffs in the ground ribbon. ALWAYS
                              //   scans the whole lap — `stations` is a sample
                              //   COUNT, not a position; it cannot be aimed
__apex.rollout({seconds:5, policy})  // drive an interval → digest, not frames
__apex.terminal()             // {done, reason} — retired|finished|wrong_way|rescued
```

Corner data in `world().nextCorner` / `trackInfo({what:"corners"})` is smoothed
over a 30 m window with radius taken from heading swept across the corner —
`Tracks.curvature`'s 12 m window is right for physics but reads centreline zigzag
as a hairpin. Curated `CircuitMarkings` apexes are snapped onto the real
curvature peak and overlapping results merged (`T9-T10`).

`node tools/agent.mjs <track> <world|track|scene|visible|rollout|help> [flags]`
is the same surface from a shell, with the staging (race/go/jump + let frames
render) done correctly.

// ── Logging (js/log.js) ──
__apex.logs({ns:"scenery"})   // the retained log ring — filter {ns, level,
                              //   since, limit}. Diagnostics down to `info` are
                              //   kept whether or not they printed, so a failure
                              //   that already happened still has a record
__apex.logLevel("scenery:debug")  // move a threshold; "buffer:debug" retains
                              //   more without printing more; second arg true
                              //   persists it across reloads

**Note:** `obs()` / `physState()` require `player.px` initialised (`jump()` or one
tick). After `race()` + `go()`, call `jump(frac, speed)` or `step(1/60, 1)` first.

---

## Writing tests

105 Playwright specs + 39 `node --test` unit suites. **How to RUN them is under
Testing workflow above; `docs/TESTING.md` is the full reference.** This is what
to do when writing one.

Assert behaviour and geometry via `__apex` hooks — not brittle rendering
magnitudes. A threshold like "speed > 10 after 2 s" goes stale the moment
physics is retuned; prefer relative checks ("faster on tarmac than on grass").
Use `obs()`/`act()`/`reset()` for physics, `seed()` for reproducibility,
`groundY()` for terrain geometry, `eyeAt()`/`orbit()` for camera framing, and
`__apex.logs({ns})` rather than scraping console text.

Viewport: `hasTouch: true` for `#pm-steer`/`#pm-calib` tests; landscape
`{width:844, height:390}` for in-race.

**New test checklist:** (1) put it in `tests/` — `tests/manual/` is only for
suites a human runs on purpose; (2) import `test`/`expect` from
`tests/fixtures.js` unless you have a reason not to; (3) name it in a topical
`test:<group>` script — `npm run test:audit` fails on an orphan; (4) give it a
row in the `docs/TESTING.md` coverage table — `tests/test-groups.test.mjs` fails
without one; (5) if it renders or pixel-diffs, add it to `RENDER_SPECS` in
`playwright.config.js`.

---

## Steering modes

`steerMode`: `"tilt"` | `"buttons"` | `"touch"`. Set via `#pm-steer` in pause
menu. `autoThrottle()` returns true **only** in `"touch"` mode (hides the gas
pedal); `"buttons"` mode gets an explicit GAS control. Calibrate button
(`#pm-calib`) and the GEARS toggle (`#pm-gears`) are **disabled, not hidden**,
when unavailable — hiding them reflowed the settings grid so the next tap hit
the wrong button.

---

## Git branch

Active development branch: `claude/project-cleanup-tests-k7mqb6`. Never push to main
without review.

**The deploy branch is a DIFFERENT branch.** `.github/workflows/pages.yml` fires
only on a push to `claude/f1-game-project-26h3ng`, so work on any other branch
builds and tests but does not reach https://brycejmurrin.github.io/f1-game/
until it is merged there.
