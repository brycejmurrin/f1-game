# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks: pure IIFE modules
loaded via `<script>` tags, static files on GitHub Pages. This file is the
rules; the evidence and deep references live in `docs/` — start at
`docs/README.md` and load a reference only when the task touches its area.

This is the ONE canonical agent reference. CLAUDE.md is a stub that imports
it (guard-asserted). Edit rules here; put measurements and war stories in the
area doc — testing evidence goes in `docs/TESTING.md` §Field notes.

## Key commands

```sh
npx serve -l 3456 .                 # run locally (or: python3 -m http.server 3456)
npm run test:tooling-fast           # the no-browser guard suite (~30 s)
node tools/verify-change.mjs        # ONE command: fast gate + batched groups (start in background; --wait/--plan/--fast)
node tools/verify-track.cjs <id>    # 2 s headless build check for track edits
node tools/pick-tests.mjs           # which test GROUPS does this change need?
node tools/select-specs.mjs --since <ref>   # finer: per-SPEC selection, budgeted
node tools/test-bg.mjs <groups>     # run browser groups in the background
node tools/assets.mjs verify        # asset-pack licence + md5 + budget check
tools/README.md                     # test-asserted index of all 110+ tools
docs/AGENT-SURFACE.md               # skills / MCP / tools / wrap map
```

## Verification — scale it to the change

The browser half of the suite runs on SwiftShader: one browser GROUP costs
10–40 minutes of serialized wall time on a 4-core box, and the full suite is
~40 minutes even batched. Match verification to the blast radius — running
more than the change needs is not extra safety, it is slower feedback and an
idle agent. Reference (groups, fixtures, field notes): `docs/TESTING.md`.

| change touches | run |
|---|---|
| docs, tools, tests only | `npm run test:tooling-fast` |
| one circuit (`js/circuits/<id>.js`) | `node tools/verify-track.cjs <id>`, then that circuit's foundation spec ALONE |
| one subsystem with its own spec | that spec — `npm test -- tests/specs/<file>.spec.js`; prefer single specs over their whole group |
| WGX / `js/render/webgpu/` | `node tools/wgx-validate.mjs` (~5 s, REAL Dawn WGSL+pipeline validation in-container — never ship "read-verified" WGSL) + the `webgpu-lifecycle` unit suite; pixel truth needs a real GPU (`docs/TESTING.md` §Field notes) |
| TLX / `js/render/three/`, WGX / `js/render/webgpu/` | `gfx-probe --backend three --tlx-webgpu --lavapipe montreal`, then the SAME command with `--ls apex26.tlxForceHw=env` (and `sky`/`batches`/`chunked`/`shadow` when touched) — `gpuErrors` 0 in every run. **THEN DISPATCH THE REAL GPU**: `gpu-census.yml` on `macos-latest` (Apple/Metal, ~3 min) and read its Verdict step, which FAILS on GPU errors, failed env-probe faces, or `softAdapter` true on hardware. A software probe run is not evidence about a player's machine — that mistake cost this project two shipped defects (the `_softAdapter` misclassification and an env probe that threw on every face), both invisible to every software test and both found the hour a real GPU was first used |
| engine / physics / `js/game.js` | the groups `pick-tests` names, CAPPED at two browser groups: run the two most specific, name the rest as not-run in the PR |
| geometry pushed to the deploy branch | the above + `npm run test:sweeps` |

Session shape — this is what controls both wall time and waiting:

1. `npm install` FIRST on a fresh container (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`
   keeps it to seconds), **then `npx playwright install
   chromium-headless-shell`** — that skip flag leaves the BROWSER absent, and
   the specs launch the headless shell, not the `/opt/google/chrome` this box
   ships. "Cannot find module" means a missing `npm install`;
   `browserType.launch: Executable doesn't exist …chromium_headless_shell`
   means a missing browser. Either reads as a total-red run that looks like a
   boot regression (measured 2026-08-17: every `test:tiny` test red — 73 of
   them, re-confirmed live 2026-08-27), and the cure is
   seconds. Read the FIRST failure's message before believing any red run.
2. Make ALL source edits first, then verify ONCE. Tests serve `js/` and `css/`
   from the working tree, so a run in flight forbids source edits — run the
   browser tests a single time, at the end, just before the cache bump. Do not
   re-run browser specs after every edit; `test:tooling-fast` is the edit-loop
   check, and `test:tiny` runs once before the bump. Track or scenery edits
   run `verify-track.cjs <id>` first (2 s), not a browser group.
3. NEVER BLOCK THE FOREGROUND ON A TEST RUN — this is a flat prohibition and
   it covers node suites, sweeps, and audits, not just browser groups. Every
   command expected to take more than ~30 s starts in the background with its
   output to an `artifacts/` log, and the session does other work (docs,
   analysis, the next investigation) or ends the turn while it runs. Poll a
   log with a bounded read when a decision needs it; a session sitting in a
   foreground `npm test` is the failure mode this rule exists to kill.
4. ONE Playwright process, ONE browser group per batch, started in the
   background with `test-bg.mjs`. Anchor on the log's terminal line — the
   reporter emits `= run <status>  (N/M done, K failed)`, so match it with
   `grep -E '= run (passed|failed|timedout|interrupted)'` (ERE alternation;
   a fixed-string or BRE grep never matches) — never a looser pattern,
   never the process table, never `| tail` on a live log. While it runs, do
   non-`js/`/`css/` work or end the turn; do not idle-watch the log.
5. A timeout on a busy box measures the machine, not the code — budgets mean
   roughly half what they say at two workers. Check `/proc/loadavg` (< 3) and
   for a live `playwright test` process before starting anything. On a
   timeout, look for a load inversion in the log first; re-run the spec ALONE
   only when the verdict matters.
6. STOPPING IS ALLOWED: a pushed change that names its unverified groups in
   the PR beats an hour of serialized SwiftShader. Never widen a tolerance to
   make a spec pass; write tests against `__apex` hooks, relative assertions
   over absolute thresholds; any `waitForFunction` on a rendering page needs
   `{ polling: 100 }` or its declared timeout never fires.
7. Never hand a subagent a browser run — give a flat prohibition ("report it
   unverified"). Subagent worktrees default to a STALE base: first step in any
   worktree is `git checkout -B <branch> <the session branch or its SHA>`.
8. Never bump content hashes / `version.json` mid-run — the bump is the LAST
   edit before commit.

## Seeing the game (cheapest first)

1. `__apex` JSON hooks (`info/probe/physState/world/scene/field`) —
   assertable, deterministic, always the first choice.
2. `render({what:"view"|"map"|"circuit"|"car"})` — the character raster of the
   3D scene. Stale under `headless(true)`; `snapCam()` REQUIRED after
   `park()`/`jump()`.
3. DOM/a11y snapshot (Playwright MCP `browser_snapshot` / `browser_resize` /
   `browser_evaluate`, or chrome-devtools) — menu/HUD work only; hide `#game`.
4. Pixel screenshot — visual sign-off only, never an assertion source. For
   live poking use the `mcp-probe` skill; the Playwright suite itself always
   runs script-driven, never through an MCP.

### A real GPU IS reachable — `macos-latest`

Measured 2026-08-28 (`docs/research/CI-RENDERING-PERFORMANCE.md` §There IS a
real GPU): GitHub's Apple-silicon image reports a HARDWARE adapter (`apple`,
`ANGLE Metal Renderer`, 2 GiB maxBufferSize, `shader-f16`/`subgroups`) on stock
flags. ubuntu-latest is SwiftShader, windows-latest is WARP, this container is
llvmpipe. Dispatch `.github/workflows/gpu-census.yml` — `census_only: true` for
the adapter answer in seconds, without it to run `tools/gpu-game-check.mjs`
(the portable `gfx-probe`: `gpuErrors()`, env-probe state, `?gfxdebug=1` text).
**Never pass `--use-angle=vulkan` on macOS** — it drops WebGPU to SwiftShader
and `requestAdapter()` returns null, silently turning a real-GPU run software.

### Software pixels in this container (no real GPU)

On SwiftShader/Lavapipe the **native WebGPU swapchain never composites** to the
screen — that path stays black. WGX routes the visible `#game` through a **2D
soft-present blit** (final pass → `COPY_SRC` texture → `putImageData` on
`#game`; never `getCurrentTexture()`, which breaks `mapAsync` device-wide).
Cache **1342+** uses ephemeral per-frame staging buffers +
`onSubmittedWorkDone` before readback; `awaitSoftPresent()` resolves only after
a non-blank visible blit.

| Backend | Command / path | Checks |
|---------|----------------|--------|
| **WGX visible canvas** | `node tools/gfx-probe.mjs --backend webgpu [--lite] <track>` | `#game` screenshot + `getImageData` (primary gate) |
| **WGX readback** | `node tools/wgx-capture.mjs <track>` → `frame.png` | `GLX.capturePixels()` — optional; can flake after soft-present on SwiftShader |
| **WGX A/B** | `node tools/wgx-lavapipe-probe.mjs <track> [--lite]` | `mesa-vulkan-drivers` + `VK_ICD_FILENAMES=…/lvp_icd.json` |
| **TLX / three** | `node tools/gfx-probe.mjs --backend three [--lite] <track>` | CI pin WebGL2 (`tlxForceGL=1`). AUTO is WebGPU (lite stack). `mappedAtCreation` → `queue.writeBuffer`. |
| **TLX WebGPU** | `node tools/gfx-probe.mjs --backend three --tlx-webgpu --lavapipe [--lite] <track>` | Soft-present 2D blit (Lavapipe). Never `getCurrentTexture()` on software. |

Deep notes + measured canvas colours: `docs/research/CI-RENDERING-PERFORMANCE.md`
§Measured. Env packages + install: §Cursor Cloud below.

**A UNIT TEST OF A RENDERER BACKEND IS NOT EVIDENCE THAT IT RUNS.** WGX's mock
device passed every assertion while FOUR separate defects made the real backend
refuse to boot (MSAA 2 is illegal in WebGPU; a derivative behind a branch is a
WGSL compile error; `mappedAtCreation` for a 35 MB mesh exhausts the mappable
pool; `rg11b10ufloat` is not a render target without its optional feature). Each
hid the one after it, so they came out one boot at a time — and none was
findable without a live device:

```sh
npx serve -l 3456 .   # a SECURE CONTEXT: navigator.gpu is absent on about:blank
node tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --console 'WGX|error'
```

`probe` writes the backend pick and RELOADS in one batch (`--backend
webgl2|three|webgpu`; `three` gets the specs' WebGL2 pin), `--eval` runs a body,
`--console RE` greps the dump, `--dry-run` shows the batch. In page code use
BARE globals — `GLX`, not `window.GLX`: script-level `const` is a lexical
binding, not a window property. A clean WGX boot writes NO console line and
leaves `sessionStorage["apex26.gfxBound"]` absent (that key means it refused) —
both ABSENCE signals, so confirm with one positive: drive a race and assert
`canvas.getContext("webgl2") === null`, which only holds once WebGPU has claimed
the canvas. SwiftShader is a validation oracle; for WGX **visible** pixels use
`gfx-probe.mjs` (`#game` after `awaitSoftPresent`); for readback oracle use
`wgx-capture.mjs` → `frame.png`. Full trap list:
`.claude/skills/mcp-probe/references/recipes.md` §Probing a specific renderer.

## Cursor Cloud specific instructions

Personal/dashboard env for this repo (not `.cursor/environment.json`). Persist
system packages via snapshot + Save on the environment dashboard — an `apt-get`
in a live agent does **not** survive the next cold boot unless the snapshot is
saved.

**Packages for software WebGPU / headed probes** (idempotent in `install`):

- `mesa-vulkan-drivers` — Lavapipe ICD at `/usr/share/vulkan/icd.d/lvp_icd.json`
- `vulkan-tools` — `vulkaninfo` sanity
- `xvfb` — headed Lavapipe / X11 display (`DISPLAY=:1` already common here)

**Fresh-agent bootstrap** (after packages; matches Verification §1):

```sh
bash tools/cloud-agent-install.sh
# equivalent manual steps when the script is not the dashboard install:
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --ignore-scripts --no-audit --prefer-offline
npx playwright install chromium-headless-shell
npx playwright install chromium
```

The dashboard `install` should call `bash tools/cloud-agent-install.sh`. A bare
`npm install` can die on `registry.npmjs.org` ECONNRESET with npm's "Exit
handler never called!" (measured 2026-08-17, `bld-20260817-e70b375f`) even
when `node_modules` is already usable. (`wgx-validate` / `wgx-capture` need
full Chromium — the headless shell has no `navigator.gpu`.) Missing Lavapipe:
`test -f /usr/share/vulkan/icd.d/lvp_icd.json` fails → reinstall
`mesa-vulkan-drivers` or re-Save the env snapshot. Measurement table and MCP
flag overrides: `docs/research/CI-RENDERING-PERFORMANCE.md`.

**MCP.** Seven-server map: [`docs/AGENT-SURFACE.md`](docs/AGENT-SURFACE.md).
Keep **`apex-tools` in repo-root `.mcp.json`** (and `.cursor/mcp.json`). Cloud
host catalog is often empty — then `./tools/apex-tools-mcp.sh call`,
`./tools/playwright-mcp.sh`, `./tools/tinyfish-mcp.sh`,
`python3 tools/probe-mcp.py`. Do not attach `mcp-probe` for a `version.json`
check. Never run Chrome MCP while Playwright is running.

## Layout

**`js/track/` is the ENGINE, `js/circuits/` is the DATA** (one data file per
circuit; script-tag order == `Tracks.LIST` == picker order). The module roster
and load order live in `tools/manifest.cjs` — read that, not this file, to
enumerate what exists; `index.html` script order is guard-asserted against it.

- `js/log.js`, `js/mat4.js` — Log loads FIRST; M4/V3 math + shared
  clamp/lerp/wrapDelta
- `js/game.js` — entry: game loop, physics, AI, race flow; hands the `G` ctx
  façade to `js/game/*` modules (one `Module.create(G)` per file; modules
  never reach into game.js; `js/game/apex.js` is the `__apex` dev API)
- `js/render/` — Gfx façade → GLX (WebGL2 default: core + `glx/` passes +
  `shaders/` GLSL-as-data), `gltf.js`, `assets.js` (baked pack loader).
  DEFERRED backends, no script tag, injected at boot: `webgpu/` WGX and
  `three/` TLX (opt-in `apex26.gfxBackend="three"`)
- `js/track/` — spline mesh geom graph space surface markings models themes
  kits geo-paths maps + the scenery split; the 111-member scenery(api)
  contract is frozen by `tests/unit/scenery-api-contract.test.mjs`
- `js/car/` — car3d, liveries, liverytex, the parts catalog (600 cr budget),
  ghost, teams, driver-ratings
- `js/data/` — F1API + DataHub tabs; `js/net/` — 2-4 player WebRTC, no backend
- `css/` — tokens + component files; `docs/COMPONENTS.md` is test-asserted;
  class-count + body-node ratchets apply
- `index.html` — shell: script tags, all static DOM, per-file `?v=<sha256>`
  plus `<meta name="apex-build">`; `sw.js` precache derives from the shell's tags
- `types/game-ctx.d.ts` — the `G` façade contract, held by `tools/check-gctx.mjs`
- `.claude/skills/` — the workflow references (`.claude/skills/README.md`);
  `.claude/agents/` — scoped subagent definitions (verify-agent, track-surveyor,
  bloat-auditor, deploy-research, doc-drift-auditor, physics-contract-auditor,
  worktree-regression-check) that encode the flat prohibitions above so a
  subagent cannot un-know them

## Critical conventions

- **Cache busting**: after ANY js/css change, run
  `node tools/bump-cache.mjs --apply` (`.claude/skills/bump-cache`). Each
  asset URL carries a 12-char content hash; `version.json` and
  `<meta name="apex-build">` advance together as the shell/SW generation.
  Last edit before commit, never mid-run. Docs/tools-only deltas need no bump.
- **No ES modules** — every file is a `"use strict"` IIFE assigning one global
  (sole exception: the vendored three.js island).
  `tests/unit/global-registry.test.mjs` enforces the registry.
- **New-file lockstep**: IIFE file + `<script>` tag position +
  `tools/manifest.cjs` entry (+ HARD_EDGES pair if eval-time destructured) +
  cache bump. DEFERRED backends have no tag; `DEFERRED`/`BACKEND_FILES`/sw.js
  precache must agree (guard-asserted).
- **Circuit edits go in `js/circuits/<id>.js`; engine changes in `js/track/`.**
- `module-size.test.mjs` ratchets game.js and apex.js AT their current
  ceilings — pay for every added line. New `js/game/` files are hyphenated;
  the older squashed names are grandfathered (settled, final).
- **localStorage keys** are prefixed `apex26.`.
- **Coordinates**: +Y up, metres, radians, arc `s` in metres, lateral `x`
  +right. **+k = LEFT-hand turn** (measured). Never flip a curvature sign
  without a rendered lap.
- Frac-keyed def tables must respect `def._sceneryShift`: consume via the
  compensated idiom (`bankingProfile`, `buildCenterline`) — a raw `frac` read
  places things 2/3 of a lap away.
- Logging goes through `Log` (`js/log.js`), never bare `console.*`: namespace
  first arg, console threshold `warn`, ring buffer `info` (`__apex.logs()`).
  Guard hot-path debug lines with `Log.enabled(ns, level)`; set via
  `__apex.logLevel("ns:debug")`, `?log=`, or `APEX_LOG=` for test runs.
- Regenerable output goes in the gitignored roots only: `artifacts/` and
  `scratch/`. Never `/tmp`, never the repo root.

## Physics

Full reference `docs/PHYSICS.md`. Two rules bind everywhere:
- **`PACE` is a ground-speed scale, not a cap.** Anything comparing a speed to
  a literal or VMAX must use `vTop()`/`vStd()`/`aStd()` — enforced by
  `tools/vstd-lint.mjs`; a bare literal needs a written reason.
- **The arc must not reach the driver.** Nothing derived from track curvature
  or the racing line may affect the player with assists off; a new
  `Tracks.curvature()` read goes in a legitimate column (AI-only,
  assist-gated, broadcast-only, surface — table in docs/PHYSICS.md).

Read `c.aeroX` (or `aeroDfMult(c)`), never `c.xOn`. Immutable model numbers
live in `js/game/physics-consts.js`; tunables stay `let`s in game.js.
`tests/specs/physics-characterization.spec.js` is the master gate for anything
near game.js.

## Baked asset pack

`assets/pack/`: PBR material arrays — one `TEXTURE_2D_ARRAY` whose layer index
IS the `MAT` id; blended (`albedo * tex.rgb * 2.0`) so tint and wear survive.
**Ships ON.** (`matTexMix` def 1.0; `__apex.matTex(0)` is the A/B off-switch.)
Every failure degrades to the procedural look; boot never awaits assets. GLX,
TLX, and WGX implement it. `tools/assets.mjs verify` gates licences.

## `window.__apex` dev API

~180 hooks; `docs/DEBUG-HOOKS.md` is the reference and `__apex.agentHelp()`
the machine-readable manifest — call it once per session instead of loading
the list here. Sharp edges: `obs()`/`physState()` need `player.px` initialised
(`jump()` or `step()` after `race()`+`go()`); agentview failures are
`{ok:false, error, message, fix}`, never null; `render({what:"view"})` reuses
the LAST frame and is stale under `headless(true)`; `snapCam()` after
`park()`/`jump()` before any shot. `node tools/agent.mjs <track> <cmd>` is the
same surface from a shell.

## Agent extensions (skills / subagents)

- **Skills** (on-demand workflows): `.claude/skills/` — index in
  `.claude/skills/README.md`. Which CLIs are wrapped as `apex_*`:
  `docs/AGENT-SURFACE.md`. Live canvas: `mcp-probe`. Deploy/`version.json`:
  `deploy-research` (do not attach `mcp-probe` for a version.json check).
  Pre-push: `verify-agent`. Fat skill / extract / dead code / agent bloat:
  `slim-bloat` / `bloat-auditor`.
- **Subagents** (isolated context): `.claude/agents/` — index in
  `.claude/agents/README.md`. `deploy-research` is the tinyfish-only
  post-deploy / public-web worker (no Chrome, no Playwright).
- **Cursor** loads the same Claude paths; thin always-on pointer:
  `.cursor/rules/apex-shared.mdc`. Do not duplicate skills under
  `.cursor/skills/` or agents under `.cursor/agents/`. Keep `apex-tools` in
  root `.mcp.json` so a host that loads the repo catalog can call it; if the
  session catalog is empty, use the shell wrappers (see §MCP).

## Area references (load on demand)

Skills / MCP / wrap: `docs/AGENT-SURFACE.md`. Lighting/sky:
`docs/LIGHTING-REF.md`, `-KNOBS.md`, `-PRESETS.md`
(`.claude/skills/bake-lighting` lands a COPY VALUES export). Renderers
(GLX/WGX/TLX): `docs/RENDERERS.md`. Career: `docs/CAREER.md`. Multiplayer:
`docs/MULTIPLAYER.md`. Scenery: `docs/SCENERY-API.md`. Testing:
`docs/TESTING.md`. WGX/WGSL (`js/render/webgpu/`):
`docs/research/WEBGPU-PARITY.md`.

Two WGSL rules the language enforces and a mock device cannot: `sampleCount` is
1 or 4 ONLY, and `dpdx`/`dpdy`/`fwidth` may appear ONLY where control flow is
uniform — in practice the first statements of `fs_main`, passed down as a
parameter, because a callee that returns early non-uniformly poisons its caller
too. Breaking either does not throw: WGX refuses and the game falls back to GLX
with one console warning.

## Git branch & deploy

Work happens on a `claude/<topic>` branch — `git branch --show-current` is the
truth. **The deploy branch is `claude/f1-game-project-26h3ng`**: never push
there without review; `pages.yml` fires only there and ships to
https://brycejmurrin.github.io/f1-game/. Other sessions develop directly on
the deploy branch, so a deploy is `git fetch` plus an ordinary merge of THEIR
new work — both-side changes are real conflicts: re-measure baselines on the
merged tree, take max+1 of both lineages' cache versions, never force-push.
Before pushing, re-run `test:tooling-fast` AND — when either side touched
`js/track/`, `js/circuits/` or `tools/` — `test:sweeps`: the per-circuit
baselines are exact in BOTH directions, and a geometry change green on each
lineage alone can be red on their union. The container proxy blocks
`github.io` — verify a live deploy through an MCP fetch, not curl
(`./tools/tinyfish-mcp.sh deploy-check --tip`).
