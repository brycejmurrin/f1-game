# Apex 26 dev tools

Headless Node scripts for verifying and inspecting the game without a browser
window. Most pair with a **skill** in `.claude/skills/` (which explains when/how
to use them) — this index is the quick map. Run from the repo root. Disposable
output never goes to `/tmp`: use `artifacts/tmp/` for batch logs/probes and
`scratch/` for human-reviewed captures, renders, and profiles.

**Layers:** skill = when; this folder = the CLI; `apex_*` MCP = a **pinned**
subset (safe flags only). Which rows are wrapped, and which must stay CLI-only:
[`docs/AGENT-SURFACE.md`](../docs/AGENT-SURFACE.md).

**This file is generated** by `node tools/gen/gen-tools-readme.mjs` from the
`@doc` / `@skill` / `@section` tags in each tool's header comment (first 15
lines). Edit the tool's header, then regenerate; `--check` is the drift gate
(`tests/unit/generated-docs.test.mjs`). The long story behind a row stays in
the tool's own header.

## The tools, by what they do

### `tools/`

Root — the load-order truth and the car studio page; every consumer hardcodes these paths.

| Tool | Does | Paired skill |
|---|---|---|
| **carview.html** | Standalone isolated car photo studio (no track, no game.js): Car3D + LiveryTex via GLX; headless API `window.CARVIEW`. | playwright-probe |
| **manifest.cjs** | Load-order single source of truth: `FULL`, `DEFERRED`, `LAZY_AGENT`, `HARD_EDGES`, `TRACK_VM`; index.html must match. | check-changes |

### `tools/lib/`

Shared harnesses and helpers other tools load: the browser+server harness, the two Node-VM harnesses, the output-path contract, the WebGPU flag set.

| Tool | Does | Paired skill |
|---|---|---|
| **lib/game-vm.cjs** | Boots js/game.js + `__apex` in a Node VM (renderer/DOM stubbed); `createGame({track})` drives physics, no browser. | — |
| **lib/harness.mjs** | Shared harness for the headless `__apex` tools: in-process static server + Chromium launch with teardown-safe shutdown. | playwright-probe |
| **lib/output-paths.mjs** | Path-containment helpers for the `artifacts/` vs `scratch/` output contract; gated by `output-paths.spec.js`. | — |
| **lib/track-build-vm.cjs** | The shared "run the REAL track build headless in a Node VM" harness the audits and VM tests load the engine through. | agent-view |
| **lib/webgpu-chrome-args.cjs** | Single source for WebGPU Chromium flags, shared by `harness.mjs`, `chrome-devtools-mcp.sh` and tests. | mcp-probe |

### `tools/ci/`

The test runner and the release pipeline: what to run, how to run it in the background, what CI selected, and the deploy.

| Tool | Does | Paired skill |
|---|---|---|
| **ci/bump-cache.mjs** | Deploy-time content hashing of a STAGED shell (`--apply --at N --root _site`); `--check` in the repo asserts `?v=dev`. | check-changes |
| **ci/deploy.mjs** | the ONE deploy: fetch → merge → tooling-fast → verify-track → push the deploy branch (or --pr); pages.yml stamps it | — |
| **ci/playwright-occupancy.mjs** | Classifies process-table lines for Playwright occupancy (`playwright test` / `@playwright/mcp`) — the MCP lock's oracle. | check-changes |

### `tools/check/`

Static guards over the source — a red exit here is a defect, not a report.

| Tool | Does | Paired skill |
|---|---|---|
| **check/audio-test.cjs** | Objective engine-audio pitch test — we cannot listen headless, so it measures the synthesised pitch instead. | audio-debug |
| **check/bloat-scan.mjs** | Size report for slim-bloat: ratchets.json line-ceiling slack, SKILL.md / agent line counts. `--json`; never edits. | slim-bloat |
| **check/check-gctx.mjs** | Holds `types/game-ctx.d.ts` to the real `G` façade and every module's use of `G` to the `.d.ts` (espree, optional tsc). | check-changes |
| **check/check-physics.mjs** | Physics stability probes: `check-physics.mjs <bank\|grip\|roadfollow\|steer>` — no-NaN, forward motion, steering authority. | tune-physics |
| **check/extract-module.mjs** | Reorg helper for `game.js` extractions: free-reference analysis of a line range, rewritten against `G.<name>` (`--out`). | slim-bloat |
| **check/physics-tune-sweep.mjs** | How DRIVEABLE is each notch of each handling slider? Drives the real DOM slider, then a curvature-fed closed-loop lap. | tune-physics |
| **check/quick-validate.mjs** | Fast refactor gate: boots the game once and probes the critical paths (globals, race, physics, lighting) in ~30-60 s. | check-changes |
| **check/ratchets.mjs** | Size ratchets from `tests/data/ratchets.json`: `--check` (default), `--update` snaps every ceiling down, `--json`. | — |
| **check/scan-globals.mjs** | Derives the REAL global-reference graph of the IIFE build (espree/eslint-scope): assigns, eval-time reads, edges. | check-changes |
| **check/shell-ids.mjs** | Every element id the JS looks up must exist: shell, runtime-created, or reported as dynamic. `--json`. | check-changes |
| **check/tree-counts.mjs** | Tree-wide counts behind the `tree` ratchets: CSS class tokens, shell DOM nodes, bare catches, unpolled waits. | — |
| **check/trim-comments.mjs** | Strips low-signal `//` comments (dividers, loc pointers, orphans); `--headers --narrative` compresses file headers. | slim-bloat |
| **check/vstd-lint.mjs** | REPORT, not a gate: lists every `.speed`-vs-literal comparison, always exits 0. The gate is tests/unit/vstd-invariant. | tune-physics |

### `tools/gen/`

Author-time generation: the generated doc blocks, the shell, and the asset bakes.

| Tool | Does | Paired skill |
|---|---|---|
| **gen/assets.mjs** | Author-time asset bake CLI: `bake-synthetic[-models]`, `bake-atlas`, `bake-model`, `verify` (licence + md5 + budget). | asset-pack |
| **gen/bake-elevation.mjs** | Offline elevation baker — precomputes per-track elevation profiles into a `CircuitElevations` global. | new-track |
| **gen/gen-arch-table.mjs** | Generates the module index block of `docs/ARCHITECTURE.md` from the manifest + each file's header; `--check` drift. | check-changes |
| **gen/gen-hooks-table.mjs** | Regenerates the `__apex` hook index block in `docs/DEBUG-HOOKS.md` from `apex.js` + `agentHelp()`; `--check`. | agent-view |
| **gen/gen-lib.mjs** | Shared writer for the `gen-*.mjs` generators: `--check` vs write, marker-block replacement. | check-changes |
| **gen/gen-shell.mjs** | Generates the shell tag blocks, sw.js precache seed and js/roster.js from the manifest; `--check` fails on drift. | check-changes |
| **gen/gen-slider-doc.mjs** | Regenerates the slider tables in `docs/LIGHTING-TUNER-SLIDERS.md` from `TUNE_DEFS`; `--check` fails on drift. | lighting-tuner |
| **gen/gen-test-groups.mjs** | Regenerates package.json's `test:*` scripts and tooling-fast's file list from tests/groups.json; `--check`. | check-changes |
| **gen/gen-tools-readme.mjs** | Generates `tools/README.md` from each tool's `@doc` / `@skill` / `@section` header tags; `--check` fails on drift. | check-changes |
| **gen/import-models.mjs** | Batch glTF → AX26 model importer for real CC0 model PACKS (directories of .gltf + .bin + textures). | asset-pack |
| **gen/move-tree.mjs** | Tree mover: renames from a JSON old→new map, sweeps every citing path, records MOVED, regenerates the shell; `--plan`. | — |
| **gen/synth-models.mjs** | Procedural AX26 model catalog for `assets.mjs bake-synthetic-models` — buildings, grandstands, industrial; no network. | asset-pack |

### `tools/shot/`

Headless observation of the running game: framed screenshots, one-expression evals, the agent surface, a CPU profile.

| Tool | Does | Paired skill |
|---|---|---|
| **shot/agent.mjs** | Agent toolbelt CLI — boots headless and calls one agent-view surface (`world`/`track`/`scene`/`rollout`/`help`). | agent-view |
| **shot/apex-capture.mjs** | Parallel headless screenshot sweep across cameras/tracks/modes → `scratch/captures/apex-capture/<purpose>/`. | playwright-probe |
| **shot/apex-eval.mjs** | Boot the game headless, evaluate one `__apex` expression, print JSON: `apex-eval.mjs monza '__apex.corners()'`. | playwright-probe |
| **shot/backend-compare.mjs** | Same deterministic scene on GLX/TLX/WGX + numeric pixel diff (MAD, %px changed) and per-backend console errors. | playwright-probe |
| **shot/baked-scenery.mjs** | Curated free-cam gallery of `bakedModel` sites (Monza/Spa/Silverstone/Monaco/Vegas); PNGs + `manifest.json`. | playwright-probe / scenery-dress |
| **shot/garage-frame.mjs** | Garage turntable screenshot + garageCam() JSON for WebGPU/WebGL2 A/B. | — |
| **shot/motion-capture.mjs** | Records a driven clip via `recordVideo` (headless rAF is frozen), extracts frames, scores per-frame flicker. | playwright-probe |
| **shot/profile-gameloop.mjs** | Headless V8 CPU profile of the game loop → a `.cpuprofile` for Chrome DevTools. | playwright-probe |
| **shot/repro-shot.mjs** | Render a player's exact frame from an `__apex.repro()` blob. Its COCKPIT output is WRONG — read the header. | playwright-probe |
| **shot/shot.mjs** | One deterministic framed screenshot via `__apex` camera hooks: `shot.mjs <trackId> <frac> [cam] [out.png]`. | playwright-probe |

### `tools/capture/`

Shared Playwright probe helpers and garage/menu capture gates reused by shot tools.

| Tool | Does | Paired skill |
|---|---|---|
| **capture/garage-interior.mjs** | Used by garage-frame.mjs and garage-shot.mjs after canvas readback. | — |
| **capture/probe-page.mjs** | Probe helpers: reduced-motion init, backend pick, garage open/settle, #game canvas shot. | — |

### `tools/gfx/`

Renderer and GPU probes — GLX, WGX, TLX, and the adapter census.

| Tool | Does | Paired skill |
|---|---|---|
| **gfx/chunk-reach.cjs** | How much chunked scenery a pass reaches, counted headlessly: re-bins triangles into 72 m cells like `createChunkedMesh`. | — |
| **gfx/chunk-share-census.mjs** | Do adjacent chunks share a lamp list? Per baked `LampChunks` table: empty chunks, adjacent-equal pairs, longest run. | webgl-debug / lighting-tuner |
| **gfx/gltf-selftest.mjs** | Self-test for the `js/render/shared/gltf.js` GLB loader (Node ESM, no deps). | webgl-debug |
| **gfx/glx-call-census.mjs** | What does ONE GLX frame cost in GL calls? Wraps the live WebGL2 context mid-race; per-frame draw/bind/upload averages. | webgl-debug |
| **gfx/gpu-census.mjs** | Does this machine have a real GPU? Launches full Chromium per flag set and reports the adapter (`census_only` in CI). | — |
| **gfx/gpu-game-check.mjs** | Portable sibling of gfx-probe (no Lavapipe, no Linux paths): boots the game on the runner's real GPU and dumps errors. | — |
| **gfx/loop-fault-repro.mjs** | Does the frame loop survive a transient fault and stop on a deterministic one? Injects throws into `Input.poll` live. | webgl-debug |
| **gfx/ssr-probe.mjs** | Captures the wet-road screen-space reflection and reports why it looks as it does — the SSR lighting probe. | webgl-debug |

### `tools/track/`

Circuit geometry and scenery: the build guard, the baseline-gated audits, the survey and the start-line maths.

| Tool | Does | Paired skill |
|---|---|---|
| **track/aero-zone-turns.cjs** | Pairs each geometry-detected straight with the `def.turns[]` indices bounding it, so an aero-zone claim can be checked. | agent-view |
| **track/clip-audit.cjs** | PROP-VS-PROP interpenetration detector (emission-order adjacency); `--gate` ratchets against `clip-baseline.json`. | scenery-dress |
| **track/coplanar-audit.cjs** | Z-fighting detector — same-facing coplanar faces (`dot ≥ 0.999`); `--gate` ratchets against `coplanar-baseline.json`. | scenery-dress |
| **track/float-audit.cjs** | Exhaustive FLOATING-scenery detector — wraps `TrackGeom` emitters and reports props above/under the ground; `--all`. | survey-track |
| **track/graph-parity.cjs** | Scene-graph migration gate: builds every circuit twice (baseline ref vs tree) and diffs prop geometry vertex for vertex. | scenery-dress |
| **track/import-circuit-path.mjs** | Projects a `bacinger/f1-circuits` GeoJSON feature into a circuit def's `path`; `--self-check` diffs committed traces. | new-track |
| **track/measure-props-over-road.mjs** | Prop geometry on/above the racing line for ONE track; JSON report, `--shots` writes PNGs to `artifacts/tmp/`. | scenery-dress |
| **track/refresh-f1-circuit-reference.mjs** | Explicit maintenance tool that refreshes the offline F1 circuit reference data; tests never call it or the network. | new-track |
| **track/rotate-markings.cjs** | Rotates each circuit's `turns` onto a corrected start line by the scenery's arc shift, then re-sorts them; `--check`. | new-track |
| **track/startline-probe.cjs** | The two checks that can FAIL a `startFrac`: mean curvature 120 m around s=0, and the first apex hand; `--calibrate`. | agent-view |
| **track/startline-snap.cjs** | Derives `startFrac` from a real start/finish coordinate: projects into the def's `path`, snaps to the nearest segment. | new-track |
| **track/survey-track.mjs** | One-command circuit survey: aerial/orbit/driver-eye shots per spot plus a flagged ground-profile probe; `--oblique`. | survey-track |
| **track/track-accuracy-validator.mjs** | Shape-error maths (`MAX_SHAPE_ERROR`, `signedArea`, …) shared by the circuit-accuracy tests. | new-track |
| **track/track-verts.cjs** | Per-circuit vertex + model-diagnostics dump for exact before/after diffing (`--diff before.json`). | agent-view |
| **track/verify-track.cjs** | Headless build guard: runs `buildRoad/Terrain/Props/Gate` for one circuit (or `--all`) in a VM; any THROW fails. | agent-view |

### `tools/car/`

The car and the garage: option sweeps, livery and crest rendering, career economics.

| Tool | Does | Paired skill |
|---|---|---|
| **car/audit-aero.mjs** | Renders every aero option from three wing views into one comparison sheet → `scratch/renders/aero/`. | playwright-probe |
| **car/audit-parts.mjs** | Renders every option of chosen part categories through `carview.html`; per-category contact sheets. | playwright-probe |
| **car/career-economy.mjs** | Sims a career season per starting team through the real `Career.settleRound()`; reports what a year's income affords. | career-mode |
| **car/carshot.mjs** | Cropped studio-orbit car JPEG, self-booting: `carshot.mjs [az] [tod] [teamIdx] [out]` → `artifacts/tmp/carshot.jpg`. | playwright-probe |
| **car/cockpit-pale-sweep.mjs** | Does anything in the COCKPIT read as a blank pale slab? Ray-casts the real Car3D cockpit from the driver's eye. | playwright-probe |
| **car/crest-sweep.mjs** | Measures every team crest offline by replaying `LiveryTex.drawCrest` into a recording 2D context + scanline raster. | playwright-probe |
| **car/logo-authored-sweep.mjs** | Does the colour picked in the TEAM LOGO row get painted? Scores `LiveryTex.markPalette` over team × livery × colours. | playwright-probe |
| **car/parts-ladder.mjs** | Would anyone ever PICK this catalog option? Proves no paid option is dominated by a cheaper one (offline, no browser). | garage-parts-livery |
| **car/parts-sweep.mjs** | How much does each catalog option change the car? Builds all options offline via `node:vm` against the right baseline. | garage-parts-livery |
| **car/render-car.mjs** | Headless batch renderer for `carview.html` — preset orbit angles + HTML contact sheet; needs a server on :3456. | playwright-probe |
| **car/trace-logo.mjs** | Author-time: regenerates `js/car/crest-paths.js` from a team logo bitmap in git history (k-means inks, contour walk). | playwright-probe |

### `tools/ui/`

Menu geometry and the CSS edit loop, plus the axes (viewport, scale, circuit) they share.

| Tool | Does | Paired skill |
|---|---|---|
| **ui/circuit-axis.mjs** | The `--circuits` axis for the two menu screens that draw a circuit (#select preview, #track-detail) in the fit tools. | survey-ui-matrix |
| **ui/css-play.mjs** | One-screen CSS edit loop: host the tree, open a menu, dump structured DOM, hot-swap a stylesheet, screenshot. | css-play |
| **ui/fit-audit.mjs** | The NUMBERS fit audit over viewports × interface scales: tap targets, legibility floor, clipped-without-scroll. | ui-menu-a11y |
| **ui/layout-audit.mjs** | ONE CLI for menu geometry + PNG/DOM capture: clip/tap/overflow matrix, `--gallery`, `--screen=ID`, `--survey`. | survey-ui-matrix |
| **ui/menu-capture.mjs** | Library (not a CLI): `runMenuShot` / `runMenuGallery` behind `layout-audit --gallery` / `--screen=`. | survey-ui-matrix |
| **ui/menu-fit.mjs** | Audits every menu screen for cramped/clipped layout at a viewport; `--safe=` simulates arbitrary notch insets. | ui-menu-a11y |
| **ui/menu-screens.mjs** | Canonical `SCREENS` + `VIEWPORTS` + `OVERLAY_IDS` (library) for the layout tools. | survey-ui-matrix |
| **ui/ui-scale-axis.mjs** | The `--scale=` axis (80–150 % interface size) shared by layout-audit, menu-fit and fit-audit. | survey-ui-matrix |

### `tools/lighting/`

The lighting tuner: A/B harnesses, slider effectiveness, and the batch campaign package.

| Tool | Does | Paired skill |
|---|---|---|
| **lighting/ab-lighting.mjs** | A/B harness for every tunable lighting constant — each knob rendered committed vs swapped; out → `scratch/captures/`. | lighting-tuner |
| **lighting/campaign/capture.mjs** | lighting-campaign: the Playwright capture leg — static server, campaign page, configured views per condition. | lighting-tuner |
| **lighting/campaign/config.mjs** | lighting-campaign: the condition lattice (TODS × WEATHERS × TRACKS), shards, camera fractions, slider groups. | lighting-tuner |
| **lighting/campaign/io.mjs** | lighting-campaign: JSONL record store (schema `apex26.lighting-campaign/v1`) — validate, append, merge fragments. | lighting-tuner |
| **lighting/campaign/metrics.mjs** | lighting-campaign: per-region pixel metrics and the gate evaluation against `config.mjs` GATES. | lighting-tuner |
| **lighting/campaign/tune.mjs** | lighting-campaign: candidate values, sensitivity classification, and the minimal per-condition tune profile. | lighting-tuner |
| **lighting/lighting-tuner-sweep.mjs** | Does each LIGHTING TUNER slider change the image? Sharded, resumable, paired A→B→A' sampling per (condition, knob). | lighting-tuner |
| **lighting/look-survey-sheet.py** | 4×5 tod×weather contact sheet from `artifacts/lighting/shots/<id>/` → `docs/look-survey/<id>_grid.png`; `--ready`. | mcp-probe |
| **lighting/slider-effect-live.mjs** | The `--live` harness imported by `slider-effect.mjs`: chase+park recipes, restores the pre-push live value on exit. | lighting-tuner |
| **lighting/slider-effect-view.py** | Visual filter for a slider A/B: `filter.png`, `heat.png`, `sheet.png`, MAD/p99/max stats. | lighting-tuner |
| **lighting/slider-effect.mjs** | LIGHTING TUNER effectiveness: no-browser catalog (group/class/gate/risk/tag) plus `--live <id>` A/B ramp. | lighting-tuner |

### `tools/mcp/`

MCP wrappers and daemons — the repo's own apex_* server, the Chrome DevTools and TinyFish bridges, the phone report pair.

| Tool | Does | Paired skill |
|---|---|---|
| **mcp/apex-report.js** | Browser paste, not a node tool: one diagnostic JSON bundle from a live page (diag, GL identity, log ring, errors). | mcp-probe |
| **mcp/apex-tools-mcp.mjs** | Repo MCP server: wraps a pinned subset of these CLIs as `apex_*` tools; tree (no lock) vs browser (lock). | check-changes |
| **mcp/apex-tools-mcp.sh** | Cursor / Cloud stdio entry for the `apex_*` MCP (`.mcp.json` → `run`); `help`/`call`/`smoke` from a shell. | check-changes |
| **mcp/cdmcp-bg.mjs** | Detach/status/wait/stop twin of `test-bg.mjs` for `cdmcp-measure.py`: `cdmcp-bg.mjs boot --port 3462`. | mcp-probe |
| **mcp/cdmcp-cli.py** | Stdio JSON-RPC client for chrome-devtools MCP: `list-tools`, `call`, `survey-title`, `apex-shot`, `slider-ab`. | mcp-probe |
| **mcp/cdmcp-lamps-tune.py** | Asserts the LAMPS tuner sliders via Chromium MCP using `lightState().meanLampRGB` / `bakedLights` / `lampPosts`. | mcp-probe |
| **mcp/cdmcp-lamps.py** | Night lamp screenshot suite via chrome-devtools MCP (Qatar, Singapore, Bahrain, Monza); `--port`, `--only`, `--limit`. | mcp-probe |
| **mcp/cdmcp-measure.py** | Background-friendly Chromium MCP measure suite: boot (network/console/LCP), ui floors, full(+heap); `= run` verdict. | mcp-probe |
| **mcp/chrome-devtools-mcp.sh** | Wrapper for the local `scratch/chrome-devtools-mcp` clone: `clone`/`build`/`run`/`verify`/`status`/`help`. | mcp-probe |
| **mcp/mcp-cli.mjs** | chrome-devtools MCP over stdio against a running build: `probe --backend webgpu`, `--eval`, `--console RE`, `--dry-run`. | mcp-probe |
| **mcp/mcp-smoke.mjs** | Pokes the repo MCP wrappers (`apex_status`, probe help, chrome-devtools `status`, tinyfish `help`). No Chromium. | check-changes |
| **mcp/playwright-mcp.sh** | Official `@playwright/mcp@0.0.79` wrapper (`help`/`status`/`run`); isolated headless Chromium, profile in `scratch/`. | survey-ui-matrix / css-play / mcp-probe |
| **mcp/probe-mcp.py** | Passthrough for every Chrome DevTools + TinyFish MCP tool (`chrome_*` / `tinyfish_*`): list-tools / call / serve. | mcp-probe |
| **mcp/report-server.mjs** | Localhost half of `apex-report.js`: serves the tree to a PHONE and collects the bundle it posts back. | mcp-probe |
| **mcp/tinyfish-mcp.sh** | Local TinyFish MCP proxy helper: `setup`/`start`/`stop`/`status`/`fetch`/`search`/`deploy-check`/`deploy-js` on :3711. | mcp-probe |
| **mcp/tinyfish-rpc.py** | Unwraps TinyFish `fetch_content`/`search` JSON-RPC results: `unwrap` / `deploy-summary` / `live-build` / `tool-names`. | mcp-probe |
| **mcp/ui-readable-survey-mcp.py** | Screens × viewports × UI scales readability matrix via chrome-devtools MCP → `scratch/ui-readable-survey.json`. | survey-ui-matrix / mcp-probe |

### `tools/net/`

WebRTC and Nostr end-to-end harnesses plus the local relay and TURN servers.

| Tool | Does | Paired skill |
|---|---|---|
| **net/nostr-local.cjs** | A Nostr relay on localhost so the ROOM CODE path can be tested without a public relay. | multiplayer-debug |
| **net/nostr-probe.mjs** | Which public relays will actually carry our signalling? Probes each and reports. | multiplayer-debug |
| **net/rtc-e2e-3p.mjs** | THREE peers over real WebRTC in one room, end to end. | multiplayer-debug |
| **net/rtc-e2e-room.mjs** | The ROOM CODE path end to end, against a relay we run (`nostr-local.cjs`). | multiplayer-debug |
| **net/rtc-e2e.mjs** | A REAL WebRTC handshake between two pages (`npm run rtc:e2e`) — the one path the loopback transport cannot cover. | multiplayer-debug |
| **net/turn-local.cjs** | A TURN server on localhost so the RELAY leg of ICE can be tested. | multiplayer-debug |

### `tools/env/`

Container bootstrap: browsers and the Cursor Cloud install.

| Tool | Does | Paired skill |
|---|---|---|
| **env/cloud-agent-install.sh** | Cursor Cloud dashboard `install`: best-effort mesa/vulkan/xvfb, then `install-browsers.sh`, then the MCP clones. | check-changes |
| **env/install-browsers.sh** | Idempotent Playwright Chromium install into `/opt/pw-browsers`; skips `npm install` when node_modules is usable. | — |

## Test runner & coverage

| Tool | Does |
|---|---|
| **check/cross-file-paths.mjs** | Every relative reference between files resolves to a file that exists (espree extraction; built for the tests/ split). |
| **check/evaluate-scope-lint.mjs** | A `page.evaluate()` callback may not close over Node — flags module-scope reads inside serialised callbacks. |
| **check/offline-precache-check.cjs** | Does an installed PWA still work with the origin gone? The only check that sees a bare circuit after a missed precache. |
| **check/wait-polling-lint.mjs** | A declared `waitForFunction` timeout that cannot fire is not a bound — checks every call carries `{ polling }`. |
| **ci/assert-audit.mjs** | Does each declared test ASSERT anything? Grades `asserting` / `implicit` / `vacuous`; flags empty `.catch(() => {})`. |
| **ci/ci-coverage.mjs** | What does the deploy gate execute? Resolves every `npm run test:*` / by-path invocation in `ci.yml` against the specs. |
| **ci/ci-resolve-before.sh** | Resolves the base SHA for the selected-specs CI gate from `EVENT` / `PUSH_BEFORE` / `PR_BASE` (falls back to `HEAD~1`). |
| **ci/ci-select-specs-step.sh** | The CI "select specs for this change" step body: base via `ci-resolve-before.sh`, then `select-specs.mjs --since`. |
| **ci/fixture-consumer-audit.mjs** | RATCHET on `tests/helpers/fixtures.js` adoption: `FLOOR` only rises, and fails when it lags adoption by > `FLOOR_SLACK`. |
| **ci/junit-failed.mjs** | Spec files with a failed/errored testcase in `artifacts/test-results-*/junit.xml`, for `select-specs --failed-from`. |
| **ci/pick-tests.mjs** | What do I have to run for THIS change? Maps changed files to `test:<group>` scripts and prints the command (`--staged`). |
| **ci/run-playwright.mjs** | The engine behind every `npm run test:*`: a free port + port-suffixed report paths so runs never share a server. |
| **ci/select-budget.mjs** | Can a change-aware CI job run what it selects? Re-derives the budget from measured per-spec counts (79.7 s/test). |
| **ci/select-recall.mjs** | Would the selector have caught it? Replays `select-specs` against real past regressions and asserts recall. |
| **ci/select-specs.mjs** | Per-SPEC change-aware selection for the blocking CI job: cuts at `select-budget` capacity and names every skip. |
| **ci/test-bg.mjs** | Starts test groups in the BACKGROUND and hands back a log to tail; sequential by default (`--parallel`, `--wait`). |
| **ci/test-coverage-audit.mjs** | Coverage guard (`npm run test:audit`): every spec / unit file must be reachable from a topical `test:<group>` script. |
| **ci/test-honesty.mjs** | Finds tests that pass by not testing: bare `test.skip`/`fixme`/`todo` without a `SKIP-OK:` reason, and empty bodies. |
| **ci/test-observed.mjs** | Which tests have I never seen run? Declared spec titles (espree) vs every title any `artifacts/logs/` run reported. |
| **ci/test-shards.sh** | Runs npm test groups concurrently, one port + log per group; `SPLIT=N` fans a group across N `--shard=k/N` runs. |
| **ci/test-solo.mjs** | Re-runs ONE spec (or `-g` grep) alone at `APEX_WORKERS=1`, refusing to start until the box is quiet (`--max-load`). |
| **ci/tooling-fast.mjs** | Sequential runner behind `npm run test:tooling-fast`: one unit file at a time, per-file timing; exports the list. |
| **ci/verify-change.mjs** | ONE command: fast gate (verify-track, graph-parity, tooling-fast, shell check) + `test-bg` batches → one verdict. |

## Data files

No header comment in JSON, so the "read by" column is derived from which tools and unit tests name the file.

| File | Read by |
|---|---|
| **mcp/apex-tools-mcp.json** | `manifest.cjs`, `tests/unit/agent-surface.test.mjs`, `tests/unit/apex-tools-mcp.test.mjs` |
| **moves/batches/b1-foundation.json** | `gen/move-tree.mjs` |
| **moves/batches/b2-presentation.json** | — |
| **moves/batches/b3-domain.json** | — |
| **moves/batches/b4-render-track.json** | — |
| **moves/phase2.json** | `gen/move-tree.mjs` |
| **moves/phase4-tools-a.json** | — |
| **moves/phase4-tools-b.json** | — |
| **moves/phase4-tools-c.json** | — |
| **moves/phase4-tools.json** | — |
| **moves/spike-backends.json** | — |
| **track/clip-baseline.json** | `manifest.cjs`, `tests/unit/comment-citations.test.mjs`, `tests/unit/docs-integrity.test.mjs`, `tests/unit/prop-clipping.test.mjs`, `track/clip-audit.cjs` |
| **track/coplanar-baseline.json** | `manifest.cjs`, `tests/unit/coplanar-faces.test.mjs`, `track/coplanar-audit.cjs` |
| **track/float-baseline.json** | `manifest.cjs`, `tests/unit/scenery-grounding.test.mjs` |

## Conventions

- **Where a tool goes:** by what it DOES, not by what it is named. The
  directory headings above are the contract — `gen-tools-readme.mjs` fails on
  a tool in a group it does not know, so a new tool picks a group or the group
  gets documented. Only what every consumer hardcodes stays at `tools/` root.
- **Capture tools are a family:** `shot/apex-capture.mjs` is the parallel
  sweep, `car/carshot.mjs` the ~5 KB studio probe, `car/render-car.mjs` the
  contact sheet, `shot/shot.mjs` one framed shot, `track/survey-track.mjs
  <id>` the one-stop circuit pass (`--oblique` adds topdown + N/E/S/W).
  Redundant one-offs were deleted; recover from git history if a need returns.
  `ui/menu-fit.mjs` survives `ui/layout-audit.mjs` only for `--safe=`
  (arbitrary notch insets — headless Chromium reports every
  `env(safe-area-inset-*)` as 0).
- **Chromium:** `CHROME` / `PW_CHROMIUM`, then `/opt/pw-browsers/...`, else
  Playwright's bundled browser. Servers bind a free port (or `:3456`).
- **Two Playwright packages on purpose:** specs run on `@playwright/test`;
  ~10 tools import bare `playwright` for direct browser control.
- No cache bump after a `js/*` / `css/*` edit: tags read `?v=dev` and the deploy stamps hashes. A `tools/manifest.cjs` change needs `node tools/gen/gen-shell.mjs`.
- `net/rtc-e2e.mjs` (`npm run rtc:e2e`) is outside every test group on
  purpose: minutes long, host-network dependent; the lobby spec fakes the
  transport because a sandboxed CI browser never finishes ICE.
