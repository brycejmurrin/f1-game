# Apex 26 dev tools

Headless Node scripts for verifying and inspecting the game without a browser
window. Most pair with a **skill** in `.claude/skills/` (which explains when/how
to use them) — this index is the quick map. Run from the repo root. Disposable
output never goes to `/tmp`: use `artifacts/tmp/` for batch logs/probes and
`scratch/` for human-reviewed captures, renders, and profiles.

**Layers:** skill = when; this folder = the CLI; `apex_*` MCP = a **pinned**
subset (safe flags only). Which rows are wrapped, and which must stay CLI-only:
[`docs/AGENT-SURFACE.md`](../docs/AGENT-SURFACE.md).

**This file is generated** by `node tools/gen-tools-readme.mjs` from the
`@doc` / `@skill` / `@section` tags in each tool's header comment (first 15
lines). Edit the tool's header, then regenerate; `--check` is the drift gate
(`tests/unit/generated-docs.test.mjs`). The long story behind a row stays in
the tool's own header.

| Tool | Does | Paired skill |
|---|---|---|
| **aero-zone-turns.cjs** | Pairs each geometry-detected straight with the `def.turns[]` indices bounding it, so an aero-zone claim can be checked. | debug-tracks |
| **agent.mjs** | Agent toolbelt CLI — boots headless and calls one agent-view surface (`world`/`track`/`scene`/`rollout`/`help`). | agent-view |
| **apex-eval.mjs** | Boot the game headless, evaluate one `__apex` expression, print JSON: `apex-eval.mjs monza '__apex.corners()'`. | playwright-probe |
| **apex-report.js** | Browser paste, not a node tool: one diagnostic JSON bundle from a live page (diag, GL identity, log ring, errors). | mcp-probe |
| **apex-tools-mcp.mjs** | Repo MCP server: wraps a pinned subset of these CLIs as `apex_*` tools; tree (no lock) vs browser (lock). | check-changes |
| **apex-tools-mcp.sh** | Cursor / Cloud stdio entry for the `apex_*` MCP (`.mcp.json` → `run`); `help`/`call`/`smoke` from a shell. | check-changes |
| **assets.mjs** | Author-time asset bake CLI: `bake-synthetic[-models]`, `bake-atlas`, `bake-model`, `verify` (licence + md5 + budget). | asset-pack |
| **audio-test.cjs** | Objective engine-audio pitch test — we cannot listen headless, so it measures the synthesised pitch instead. | audio-debug |
| **audit-aero.mjs** | Renders every aero option from three wing views into one comparison sheet → `scratch/renders/aero/`. | car-viewer |
| **audit-parts.mjs** | Renders every option of chosen part categories through `carview.html`; per-category contact sheets. | car-viewer |
| **bake-elevation.mjs** | Offline elevation baker — precomputes per-track elevation profiles into a `CircuitElevations` global. | new-track |
| **bloat-scan.mjs** | Size report for slim-bloat: ratchets.json line-ceiling slack, SKILL.md / agent line counts. `--json`; never edits. | slim-bloat |
| **bump-cache.mjs** | Deploy-time content hashing of a STAGED shell (`--apply --at N --root _site`); `--check` in the repo asserts `?v=dev`. | check-changes |
| **capture/apex-capture.mjs** | Parallel headless screenshot sweep across cameras/tracks/modes → `scratch/captures/apex-capture/<purpose>/`. | playwright-probe |
| **capture/backend-compare.mjs** | Same deterministic scene on GLX/TLX/WGX + numeric pixel diff (MAD, %px changed) and per-backend console errors. | playwright-probe |
| **capture/baked-scenery.mjs** | Curated free-cam gallery of `bakedModel` sites (Monza/Spa/Silverstone/Monaco/Vegas); PNGs + `manifest.json`. | playwright-probe / scenery-dress |
| **capture/motion-capture.mjs** | Records a driven clip via `recordVideo` (headless rAF is frozen), extracts frames, scores per-frame flicker. | playwright-probe |
| **capture/shot.mjs** | One deterministic framed screenshot via `__apex` camera hooks: `shot.mjs <trackId> <frac> [cam] [out.png]`. | playwright-probe |
| **car/carshot.mjs** | Cropped studio-orbit car JPEG, self-booting: `carshot.mjs [az] [tod] [teamIdx] [out]` → `artifacts/tmp/carshot.jpg`. | playwright-probe / car-viewer |
| **car/render-car.mjs** | Headless batch renderer for `carview.html` — preset orbit angles + HTML contact sheet; needs a server on :3456. | car-viewer |
| **career-economy.mjs** | Sims a career season per starting team through the real `Career.settleRound()`; reports what a year's income affords. | career-mode |
| **carview.html** | Standalone isolated car photo studio (no track, no game.js): Car3D + LiveryTex via GLX; headless API `window.CARVIEW`. | car-viewer |
| **cdmcp-bg.mjs** | Detach/status/wait/stop twin of `test-bg.mjs` for `cdmcp-measure.py`: `cdmcp-bg.mjs boot --port 3462`. | mcp-probe |
| **cdmcp-cli.py** | Stdio JSON-RPC client for chrome-devtools MCP: `list-tools`, `call`, `survey-title`, `apex-shot`, `slider-ab`. | mcp-probe |
| **cdmcp-lamps-tune.py** | Asserts the LAMPS tuner sliders via Chromium MCP using `lightState().meanLampRGB` / `bakedLights` / `lampPosts`. | mcp-probe |
| **cdmcp-lamps.py** | Night lamp screenshot suite via chrome-devtools MCP (Qatar, Singapore, Bahrain, Monza); `--port`, `--only`, `--limit`. | mcp-probe |
| **cdmcp-measure.py** | Background-friendly Chromium MCP measure suite: boot (network/console/LCP), ui floors, full(+heap); `= run` verdict. | mcp-probe |
| **check-gctx.mjs** | Holds `types/game-ctx.d.ts` to the real `G` façade and every module's use of `G` to the `.d.ts` (espree, optional tsc). | check-changes |
| **check-physics.mjs** | Physics stability probes: `check-physics.mjs <bank\|grip\|roadfollow\|steer>` — no-NaN, forward motion, steering authority. | tune-physics |
| **chrome-devtools-mcp.sh** | Wrapper for the local `scratch/chrome-devtools-mcp` clone: `clone`/`build`/`run`/`verify`/`status`/`help`. | mcp-probe |
| **chunk-reach.cjs** | How much chunked scenery a pass reaches, counted headlessly: re-bins triangles into 72 m cells like `createChunkedMesh`. | — |
| **chunk-share-census.mjs** | Do adjacent chunks share a lamp list? Per baked `LampChunks` table: empty chunks, adjacent-equal pairs, longest run. | webgl-debug / lighting-tuner |
| **circuit-axis.mjs** | The `--circuits` axis for the two menu screens that draw a circuit (#select preview, #track-detail) in the fit tools. | survey-ui-matrix |
| **clip-audit.cjs** | PROP-VS-PROP interpenetration detector (emission-order adjacency); `--gate` ratchets against `clip-baseline.json`. | scenery-dress |
| **cloud-agent-install.sh** | Cursor Cloud dashboard `install`: best-effort mesa/vulkan/xvfb, then `install-browsers.sh`, then the MCP clones. | check-changes |
| **cockpit-pale-sweep.mjs** | Does anything in the COCKPIT read as a blank pale slab? Ray-casts the real Car3D cockpit from the driver's eye. | debug-cameras / car-viewer |
| **coplanar-audit.cjs** | Z-fighting detector — same-facing coplanar faces (`dot ≥ 0.999`); `--gate` ratchets against `coplanar-baseline.json`. | scenery-dress |
| **crest-sweep.mjs** | Measures every team crest offline by replaying `LiveryTex.drawCrest` into a recording 2D context + scanline raster. | car-viewer |
| **css-play.mjs** | One-screen CSS edit loop: host the tree, open a menu, dump structured DOM, hot-swap a stylesheet, screenshot. | css-play |
| **deploy.mjs** | the ONE deploy: fetch → merge → tooling-fast → verify-track → push the deploy branch (or --pr); pages.yml stamps it | — |
| **extract-module.mjs** | Reorg helper for `game.js` extractions: free-reference analysis of a line range, rewritten against `G.<name>` (`--out`). | slim-bloat |
| **fit-audit.mjs** | The NUMBERS fit audit over viewports × interface scales: tap targets, legibility floor, clipped-without-scroll. | ui-menu-a11y |
| **float-audit.cjs** | Exhaustive FLOATING-scenery detector — wraps `TrackGeom` emitters and reports props above/under the ground; `--all`. | survey-track |
| **game-vm.cjs** | Boots js/game.js + `__apex` in a Node VM (renderer/DOM stubbed); `createGame({track})` drives physics, no browser. | — |
| **gen-arch-table.mjs** | Generates the module index block of `docs/ARCHITECTURE.md` from the manifest + each file's header; `--check` drift. | check-changes |
| **gen-hooks-table.mjs** | Regenerates the `__apex` hook index block in `docs/DEBUG-HOOKS.md` from `apex.js` + `agentHelp()`; `--check`. | agent-view |
| **gen-lib.mjs** | Shared writer for the `gen-*.mjs` generators: `--check` vs write, marker-block replacement. | check-changes |
| **gen-shell.mjs** | Generates the shell tag blocks, sw.js precache seed and js/roster.js from the manifest; `--check` fails on drift. | check-changes |
| **gen-slider-doc.mjs** | Regenerates the slider tables in `docs/LIGHTING-TUNER-SLIDERS.md` from `TUNE_DEFS`; `--check` fails on drift. | lighting-tuner |
| **gen-tools-readme.mjs** | Generates `tools/README.md` from each tool's `@doc` / `@skill` / `@section` header tags; `--check` fails on drift. | check-changes |
| **gfx-probe.mjs** | WEBGPU + THREE screenshot probe with the right Chromium flags: `--backend`, `--tlx-webgpu`, `--lavapipe`, `--lite`. | webgpu-debug / mcp-probe |
| **gltf-selftest.mjs** | Self-test for the `js/render/shared/gltf.js` GLB loader (Node ESM, no deps). | webgl-debug |
| **glx-call-census.mjs** | What does ONE GLX frame cost in GL calls? Wraps the live WebGL2 context mid-race; per-frame draw/bind/upload averages. | webgl-debug |
| **gpu-census.mjs** | Does this machine have a real GPU? Launches full Chromium per flag set and reports the adapter (`census_only` in CI). | — |
| **gpu-game-check.mjs** | Portable sibling of gfx-probe (no Lavapipe, no Linux paths): boots the game on the runner's real GPU and dumps errors. | — |
| **graph-parity.cjs** | Scene-graph migration gate: builds every circuit twice (baseline ref vs tree) and diffs prop geometry vertex for vertex. | scenery-dress |
| **harness.mjs** | Shared harness for the headless `__apex` tools: in-process static server + Chromium launch with teardown-safe shutdown. | playwright-probe |
| **import-circuit-path.mjs** | Projects a `bacinger/f1-circuits` GeoJSON feature into a circuit def's `path`; `--self-check` diffs committed traces. | new-track |
| **import-models.mjs** | Batch glTF → AX26 model importer for real CC0 model PACKS (directories of .gltf + .bin + textures). | asset-pack |
| **install-browsers.sh** | Idempotent Playwright Chromium install into `/opt/pw-browsers`; skips `npm install` when node_modules is usable. | — |
| **layout-audit.mjs** | ONE CLI for menu geometry + PNG/DOM capture: clip/tap/overflow matrix, `--gallery`, `--screen=ID`, `--survey`. | survey-ui-matrix |
| **lighting-campaign/capture.mjs** | lighting-campaign: the Playwright capture leg — static server, campaign page, configured views per condition. | lighting-tuner |
| **lighting-campaign/config.mjs** | lighting-campaign: the condition lattice (TODS × WEATHERS × TRACKS), shards, camera fractions, slider groups. | lighting-tuner |
| **lighting-campaign/io.mjs** | lighting-campaign: JSONL record store (schema `apex26.lighting-campaign/v1`) — validate, append, merge fragments. | lighting-tuner |
| **lighting-campaign/metrics.mjs** | lighting-campaign: per-region pixel metrics and the gate evaluation against `config.mjs` GATES. | lighting-tuner |
| **lighting-campaign/tune.mjs** | lighting-campaign: candidate values, sensitivity classification, and the minimal per-condition tune profile. | lighting-tuner |
| **lighting-tuner-sweep.mjs** | Does each LIGHTING TUNER slider change the image? Sharded, resumable, paired A→B→A' sampling per (condition, knob). | lighting-tuner |
| **lighting/ab-lighting.mjs** | A/B harness for every tunable lighting constant — each knob rendered committed vs swapped; out → `scratch/captures/`. | lighting-tuner |
| **logo-authored-sweep.mjs** | Does the colour picked in the TEAM LOGO row get painted? Scores `LiveryTex.markPalette` over team × livery × colours. | car-viewer |
| **look-survey-sheet.py** | 4×5 tod×weather contact sheet from `artifacts/lighting/shots/<id>/` → `docs/look-survey/<id>_grid.png`; `--ready`. | mcp-probe |
| **loop-fault-repro.mjs** | Does the frame loop survive a transient fault and stop on a deterministic one? Injects throws into `Input.poll` live. | webgl-debug |
| **manifest.cjs** | Load-order single source of truth: `FULL`, `DEFERRED`, `LAZY_AGENT`, `HARD_EDGES`, `TRACK_VM`; index.html must match. | check-changes |
| **mcp-cli.mjs** | chrome-devtools MCP over stdio against a running build: `probe --backend webgpu`, `--eval`, `--console RE`, `--dry-run`. | mcp-probe |
| **mcp-smoke.mjs** | Pokes the repo MCP wrappers (`apex_status`, probe help, chrome-devtools `status`, tinyfish `help`). No Chromium. | check-changes |
| **measure-props-over-road.mjs** | Prop geometry on/above the racing line for ONE track; JSON report, `--shots` writes PNGs to `artifacts/tmp/`. | scenery-dress |
| **menu-capture.mjs** | Library (not a CLI): `runMenuShot` / `runMenuGallery` behind `layout-audit --gallery` / `--screen=`. | survey-ui-matrix |
| **menu-fit.mjs** | Audits every menu screen for cramped/clipped layout at a viewport; `--safe=` simulates arbitrary notch insets. | ui-menu-a11y |
| **menu-screens.mjs** | Canonical `SCREENS` + `VIEWPORTS` + `OVERLAY_IDS` (library) for the layout tools. | survey-ui-matrix |
| **move-tree.mjs** | Tree mover: renames from a JSON old→new map, sweeps every citing path, records MOVED, regenerates the shell; `--plan`. | — |
| **net/nostr-local.cjs** | A Nostr relay on localhost so the ROOM CODE path can be tested without a public relay. | multiplayer-debug |
| **net/nostr-probe.mjs** | Which public relays will actually carry our signalling? Probes each and reports. | multiplayer-debug |
| **net/rtc-e2e-3p.mjs** | THREE peers over real WebRTC in one room, end to end. | multiplayer-debug |
| **net/rtc-e2e-room.mjs** | The ROOM CODE path end to end, against a relay we run (`nostr-local.cjs`). | multiplayer-debug |
| **net/rtc-e2e.mjs** | A REAL WebRTC handshake between two pages (`npm run rtc:e2e`) — the one path the loopback transport cannot cover. | multiplayer-debug |
| **net/turn-local.cjs** | A TURN server on localhost so the RELAY leg of ICE can be tested. | multiplayer-debug |
| **output-paths.mjs** | Path-containment helpers for the `artifacts/` vs `scratch/` output contract; gated by `output-paths.spec.js`. | — |
| **parts-ladder.mjs** | Would anyone ever PICK this catalog option? Proves no paid option is dominated by a cheaper one (offline, no browser). | garage-parts-livery |
| **parts-sweep.mjs** | How much does each catalog option change the car? Builds all options offline via `node:vm` against the right baseline. | garage-parts-livery |
| **physics-tune-sweep.mjs** | How DRIVEABLE is each notch of each handling slider? Drives the real DOM slider, then a curvature-fed closed-loop lap. | tune-physics |
| **playwright-mcp.sh** | Official `@playwright/mcp@0.0.79` wrapper (`help`/`status`/`run`); isolated headless Chromium, profile in `scratch/`. | survey-ui-matrix / css-play / mcp-probe |
| **playwright-occupancy.mjs** | Classifies process-table lines for Playwright occupancy (`playwright test` / `@playwright/mcp`) — the MCP lock's oracle. | check-changes |
| **probe-mcp.py** | Passthrough for every Chrome DevTools + TinyFish MCP tool (`chrome_*` / `tinyfish_*`): list-tools / call / serve. | mcp-probe |
| **profile-gameloop.mjs** | Headless V8 CPU profile of the game loop → a `.cpuprofile` for Chrome DevTools. | playwright-probe |
| **quick-validate.mjs** | Fast refactor gate: boots the game once and probes the critical paths (globals, race, physics, lighting) in ~30-60 s. | check-changes |
| **ratchets.mjs** | Size ratchets from `tests/data/ratchets.json`: `--check` (default), `--update` snaps every ceiling down, `--json`. | — |
| **refresh-f1-circuit-reference.mjs** | Explicit maintenance tool that refreshes the offline F1 circuit reference data; tests never call it or the network. | new-track |
| **report-server.mjs** | Localhost half of `apex-report.js`: serves the tree to a PHONE and collects the bundle it posts back. | mcp-probe |
| **repro-shot.mjs** | Render a player's exact frame from an `__apex.repro()` blob. Its COCKPIT output is WRONG — read the header. | playwright-probe |
| **road-lut-census.mjs** | Census: can WGX's road LUT hand the shader a track frame rotated 90 degrees? | webgpu-debug |
| **rotate-markings.cjs** | Rotates each circuit's `turns` onto a corrected start line by the scenery's arc shift, then re-sorts them; `--check`. | new-track |
| **scan-globals.mjs** | Derives the REAL global-reference graph of the IIFE build (espree/eslint-scope): assigns, eval-time reads, edges. | check-changes |
| **slider-effect-live.mjs** | The `--live` harness imported by `slider-effect.mjs`: chase+park recipes, restores the pre-push live value on exit. | lighting-tuner |
| **slider-effect-view.py** | Visual filter for a slider A/B: `filter.png`, `heat.png`, `sheet.png`, MAD/p99/max stats. | lighting-tuner |
| **slider-effect.mjs** | LIGHTING TUNER effectiveness: no-browser catalog (group/class/gate/risk/tag) plus `--live <id>` A/B ramp. | lighting-tuner |
| **ssr-probe.mjs** | Captures the wet-road screen-space reflection and reports why it looks as it does — the SSR lighting probe. | webgl-debug |
| **startline-probe.cjs** | The two checks that can FAIL a `startFrac`: mean curvature 120 m around s=0, and the first apex hand; `--calibrate`. | debug-tracks |
| **startline-snap.cjs** | Derives `startFrac` from a real start/finish coordinate: projects into the def's `path`, snaps to the nearest segment. | new-track |
| **survey-track.mjs** | One-command circuit survey: aerial/orbit/driver-eye shots per spot plus a flagged ground-profile probe; `--oblique`. | survey-track |
| **synth-models.mjs** | Procedural AX26 model catalog for `assets.mjs bake-synthetic-models` — buildings, grandstands, industrial; no network. | asset-pack |
| **tinyfish-mcp.sh** | Local TinyFish MCP proxy helper: `setup`/`start`/`stop`/`status`/`fetch`/`search`/`deploy-check`/`deploy-js` on :3711. | mcp-probe |
| **tinyfish-rpc.py** | Unwraps TinyFish `fetch_content`/`search` JSON-RPC results: `unwrap` / `deploy-summary` / `live-build` / `tool-names`. | mcp-probe |
| **tlx-pack-check.cjs** | Decodes packed TLX attributes and asserts no shader DECISION changed (material layer, flag branch, MAT id). No browser. | — |
| **trace-logo.mjs** | Author-time: regenerates `js/car/crest-paths.js` from a team logo bitmap in git history (k-means inks, contour walk). | car-viewer |
| **track-accuracy-validator.mjs** | Shape-error maths (`MAX_SHAPE_ERROR`, `signedArea`, …) shared by the circuit-accuracy tests. | new-track |
| **track-build-vm.cjs** | The shared "run the REAL track build headless in a Node VM" harness the audits and VM tests load the engine through. | debug-tracks |
| **track-verts.cjs** | Per-circuit vertex + model-diagnostics dump for exact before/after diffing (`--diff before.json`). | debug-tracks |
| **trim-comments.mjs** | Strips low-signal `//` comments (dividers, loc pointers, orphans); `--headers --narrative` compresses file headers. | slim-bloat |
| **ui-readable-survey-mcp.py** | Screens × viewports × UI scales readability matrix via chrome-devtools MCP → `scratch/ui-readable-survey.json`. | survey-ui-matrix / mcp-probe |
| **ui-scale-axis.mjs** | The `--scale=` axis (80–150 % interface size) shared by layout-audit, menu-fit and fit-audit. | survey-ui-matrix |
| **verify-track.cjs** | Headless build guard: runs `buildRoad/Terrain/Props/Gate` for one circuit (or `--all`) in a VM; any THROW fails. | debug-tracks |
| **vstd-lint.mjs** | The PACE invariant as a check: flags `.speed` compared to a literal without `vStd()` in a manifest-derived file set. | tune-physics |
| **webgpu-chrome-args.cjs** | Single source for WebGPU Chromium flags, shared by `harness.mjs`, `chrome-devtools-mcp.sh` and tests. | webgpu-debug / mcp-probe |
| **wgpu-flag-test.mjs** | Flag-matrix probe for WebGPU canvas pixels (SwiftShader / Lavapipe / headed) → `artifacts/tmp/wgpu-flag-test.json`. | webgpu-debug |
| **wgx-capture.mjs** | REAL WGX pixels in-container (~10 s): soft-present readback via `GLX.capturePixels()` → `frame.png`. | webgpu-debug |
| **wgx-lavapipe-probe.mjs** | WebGPU on Mesa Lavapipe + Xvfb — the second software backend beside SwiftShader; `[track] [--lite]`. | webgpu-debug / mcp-probe |
| **wgx-shot.mjs** | WebGPU screenshots, one track or `--gallery`: `canvas.png`, HUD, `view.txt`; polls until pixels are non-black. | webgpu-debug |
| **wgx-validate.mjs** | REAL Dawn validation of the WGX renderer in-container (~5 s): full Chromium, races a track, fails on any GPU error. | webgpu-debug |
| **wgx-vid-repro.mjs** | Raw-WebGPU `vertex_index` verdict matrix (draw shapes × N crossing 4095 × read path) on SwiftShader/Lavapipe. | webgpu-debug |

### Test runner & coverage

| Tool | Does |
|---|---|
| **assert-audit.mjs** | Does each declared test ASSERT anything? Grades `asserting` / `implicit` / `vacuous`; flags empty `.catch(() => {})`. |
| **ci-coverage.mjs** | What does the deploy gate execute? Resolves every `npm run test:*` / by-path invocation in `ci.yml` against the specs. |
| **ci-resolve-before.sh** | Resolves the base SHA for the selected-specs CI gate from `EVENT` / `PUSH_BEFORE` / `PR_BASE` (falls back to `HEAD~1`). |
| **ci-select-specs-step.sh** | The CI "select specs for this change" step body: base via `ci-resolve-before.sh`, then `select-specs.mjs --since`. |
| **cross-file-paths.mjs** | Every relative reference between files resolves to a file that exists (espree extraction; built for the tests/ split). |
| **evaluate-scope-lint.mjs** | A `page.evaluate()` callback may not close over Node — flags module-scope reads inside serialised callbacks. |
| **fixture-consumer-audit.mjs** | RATCHET on `tests/helpers/fixtures.js` adoption: `FLOOR` only rises, and fails when it lags adoption by > `FLOOR_SLACK`. |
| **junit-failed.mjs** | Spec files with a failed/errored testcase in `artifacts/test-results-*/junit.xml`, for `select-specs --failed-from`. |
| **offline-precache-check.cjs** | Does an installed PWA still work with the origin gone? The only check that sees a bare circuit after a missed precache. |
| **pick-tests.mjs** | What do I have to run for THIS change? Maps changed files to `test:<group>` scripts and prints the command (`--staged`). |
| **run-playwright.mjs** | The engine behind every `npm run test:*`: a free port + port-suffixed report paths so runs never share a server. |
| **select-budget.mjs** | Can a change-aware CI job run what it selects? Re-derives the budget from measured per-spec counts (79.7 s/test). |
| **select-recall.mjs** | Would the selector have caught it? Replays `select-specs` against real past regressions and asserts recall. |
| **select-specs.mjs** | Per-SPEC change-aware selection for the blocking CI job: cuts at `select-budget` capacity and names every skip. |
| **test-bg.mjs** | Starts test groups in the BACKGROUND and hands back a log to tail; sequential by default (`--parallel`, `--wait`). |
| **test-coverage-audit.mjs** | Coverage guard (`npm run test:audit`): every spec / unit file must be reachable from a topical `test:<group>` script. |
| **test-honesty.mjs** | Finds tests that pass by not testing: bare `test.skip`/`fixme`/`todo` without a `SKIP-OK:` reason, and empty bodies. |
| **test-observed.mjs** | Which tests have I never seen run? Declared spec titles (espree) vs every title any `artifacts/logs/` run reported. |
| **test-shards.sh** | Runs npm test groups concurrently, one port + log per group; `SPLIT=N` fans a group across N `--shard=k/N` runs. |
| **test-solo.mjs** | Re-runs ONE spec (or `-g` grep) alone at `APEX_WORKERS=1`, refusing to start until the box is quiet (`--max-load`). |
| **tooling-fast.mjs** | Sequential runner behind `npm run test:tooling-fast`: one unit file at a time, per-file timing; exports the list. |
| **verify-change.mjs** | ONE command: fast gate (verify-track, graph-parity, tooling-fast, shell check) + `test-bg` batches → one verdict. |
| **wait-polling-lint.mjs** | A declared `waitForFunction` timeout that cannot fire is not a bound — checks every call carries `{ polling }`. |

### Data files

No header comment in JSON, so the "read by" column is derived from which tools and unit tests name the file.

| File | Read by |
|---|---|
| **apex-tools-mcp.json** | `tests/unit/agent-surface.test.mjs`, `tests/unit/apex-tools-mcp.test.mjs` |
| **clip-baseline.json** | `clip-audit.cjs`, `tests/unit/comment-citations.test.mjs`, `tests/unit/docs-integrity.test.mjs`, `tests/unit/prop-clipping.test.mjs` |
| **coplanar-baseline.json** | `coplanar-audit.cjs`, `tests/unit/coplanar-faces.test.mjs` |
| **float-baseline.json** | `tests/unit/scenery-grounding.test.mjs` |
| **moves/batches/b1-foundation.json** | `move-tree.mjs` |
| **moves/batches/b2-presentation.json** | — |
| **moves/batches/b3-domain.json** | — |
| **moves/batches/b4-render-track.json** | — |
| **moves/phase2.json** | `move-tree.mjs` |
| **moves/spike-backends.json** | — |

## Subdirectories (R3 families)

Self-contained families live in subdirectories; everything else stays flat
(manifest.cjs, carview.html, the test infra and every baseline/audit are
deliberately NOT moved — their consumers hardcode the flat paths):

- `net/` — WebRTC/Nostr end-to-end harnesses and the local relay/TURN servers
- `car/` — car renders (carshot, render-car)
- `capture/` — frame capture (apex-capture, backend-compare, baked-scenery, motion-capture, shot)
- `lighting/` — ab-lighting; `lighting-campaign/` is the batch lighting-sweep package (`tests/unit/lighting-campaign.test.mjs`)

## Conventions

- **Capture tools are a family:** `apex-capture.mjs` is the parallel sweep,
  `carshot.mjs` the ~5 KB studio probe, `render-car.mjs` the contact sheet,
  `capture/shot.mjs` one framed shot, `survey-track.mjs <id>` the one-stop
  circuit pass (`--oblique` adds topdown + N/E/S/W). Redundant one-offs were
  deleted; recover from git history if a need returns. `menu-fit.mjs` survives
  `layout-audit.mjs` only for `--safe=` (arbitrary notch insets — headless
  Chromium reports every `env(safe-area-inset-*)` as 0).
- **Chromium:** `CHROME` / `PW_CHROMIUM`, then `/opt/pw-browsers/...`, else
  Playwright's bundled browser. Servers bind a free port (or `:3456`).
- **Two Playwright packages on purpose:** specs run on `@playwright/test`;
  ~10 tools import bare `playwright` for direct browser control.
- No cache bump after a `js/*` / `css/*` edit: tags read `?v=dev` and the deploy stamps hashes. A `tools/manifest.cjs` change needs `node tools/gen-shell.mjs`.
- `net/rtc-e2e.mjs` (`npm run rtc:e2e`) is outside every test group on
  purpose: minutes long, host-network dependent; the lobby spec fakes the
  transport because a sandboxed CI browser never finishes ICE.
