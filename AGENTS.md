# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks: pure IIFE modules
loaded via `<script>` tags, static files on GitHub Pages.

**This file is the RULES.** The evidence behind them — measurements, war
stories, defect registers — lives in `docs/`; start at `docs/README.md`, which
is a reading order, and load one area doc when the task touches its area. This
is the ONE canonical agent reference; CLAUDE.md is a stub that imports it
(guard-asserted). Edit rules here, evidence there.

## Key commands

```sh
npx serve -l 3456 .                 # run locally (or: python3 -m http.server 3456)
npm run test:tooling-fast           # the no-browser guard suite (~3 min)
node tools/verify-change.mjs        # ONE command: fast gate + batched groups (background; --wait/--plan/--fast)
node tools/verify-track.cjs <id>    # 2 s headless build check for track edits
node tools/pick-tests.mjs           # which test GROUPS does this change need?
node tools/select-specs.mjs --since <ref>   # finer: per-SPEC selection, budgeted
node tools/test-bg.mjs <groups>     # run browser groups in the background
node tools/assets.mjs verify        # asset-pack licence + md5 + budget check
tools/README.md                     # test-asserted index of all 160+ tools
docs/AGENT-SURFACE.md               # skills / MCP / tools / wrap map
```

## Verification — scale it to the change

One browser GROUP costs 10–40 minutes of serialized SwiftShader wall time here
and the whole suite ~40 even batched, so running more than the change needs is
not extra safety — it is slower feedback and an idle agent. Groups, fixtures
and philosophy: `docs/TESTING.md`; the timing measurements behind every number
in this section: `docs/notes/TESTING-FIELD-NOTES.md`.

| change touches | run |
|---|---|
| docs, tools, tests only | `npm run test:tooling-fast` |
| one circuit (`js/circuits/<id>.js`) | `node tools/verify-track.cjs <id>`, then that circuit's foundation spec ALONE |
| one subsystem with its own spec | that spec — `npm test -- tests/specs/<file>.spec.js`; prefer single specs over their whole group |
| WGX / `js/render/webgpu/` | `node tools/wgx-validate.mjs` (~5 s, REAL Dawn WGSL+pipeline validation in-container — never ship "read-verified" WGSL) + the `webgpu-lifecycle` unit suite; pixel truth needs a real GPU |
| TLX / `js/render/three/`, WGX / `js/render/webgpu/` | `gfx-probe --backend three --tlx-webgpu --lavapipe montreal`, then the same with `--ls apex26.tlxForceHw=env` (and `sky`/`batches`/`chunked`/`shadow` when touched) — `gpuErrors` 0 in every run. **THEN DISPATCH THE REAL GPU**: `gpu-census.yml` on `macos-latest`, read its Verdict step. A software probe is NOT evidence about a player's machine (two shipped defects were invisible to every software test). `ci.yml`'s renderer-macos job is nightly; dispatch it with `renderer_macos: true` when a gfx spec or its launch config changed |
| engine / physics / `js/game.js` | the groups `pick-tests` names, CAPPED at two browser groups: run the two most specific, name the rest as not-run in the PR |
| geometry pushed to the deploy branch | the above + `npm run test:sweeps` |
| a desktop-viewport browser group this box cannot time | dispatch `ci.yml` with `group: <name>` — read the four Smoke jobs. ONE group per change, the most specific one: a dispatch is four runners plus the macOS minutes. Pushes touching only `docs/**`, `*.md`, `.claude/**`, `.cursor/**` start no CI at all |

Session shape — this is what controls both wall time and waiting:

1. `npm install` FIRST on a fresh container (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`
   keeps it to seconds), **then `npx playwright install chromium-headless-shell`**
   — the skip flag leaves the BROWSER absent, and either missing reads as a
   total-red run that looks like a boot regression. Read the FIRST failure's
   message before believing any red run.
2. Make ALL source edits first, then verify ONCE — tests serve `js/` and `css/`
   from the working tree, so a run in flight FORBIDS source edits.
   `test:tooling-fast` is the edit-loop check; track or scenery edits run
   `verify-track.cjs <id>` (2 s), not a browser group.
3. **NEVER BLOCK THE FOREGROUND ON A TEST RUN** — flat, and it covers node
   suites, sweeps and audits, not just browser groups. Anything over ~30 s goes
   to the background with its output in an `artifacts/` log while the session
   does other work or ends the turn; poll with a bounded read, never idle-watch.
4. ONE Playwright process, ONE browser group per batch, via `test-bg.mjs`.
   Anchor on the reporter's terminal line with
   `grep -E '= run (passed|failed|timedout|interrupted)'` (ERE alternation; a
   fixed-string or BRE grep never matches) — never a looser pattern, never the
   process table, never `| tail` on a live log.
5. A timeout on a busy box measures the machine, not the code: check
   `/proc/loadavg` (< 3) and for a live `playwright test` process before
   starting anything, look for a load inversion in the log first, and re-run
   the spec ALONE only when the verdict matters.
6. **STOPPING IS ALLOWED** — a pushed change that names its unverified groups
   beats an hour of serialized SwiftShader. **Never widen a tolerance to make a
   spec pass**; write against `__apex` hooks, relative assertions over absolute
   thresholds; any `waitForFunction` on a rendering page needs
   `{ polling: 100 }` or its declared timeout never fires.
7. Never hand a subagent a browser run — give a flat prohibition ("report it
   unverified"). Subagent worktrees default to a STALE base: first step in any
   worktree is `git checkout -B <branch> <the session branch or its SHA>`.
8. Never hand-edit a `@gen-shell` block, `version.json` or the `apex-build`
   meta — the shell is generated and the deploy stamps it.

## Seeing the game (cheapest first)

1. `__apex` JSON hooks (`info/probe/physState/world/scene/field`) —
   assertable, deterministic, always the first choice.
2. `render({what:"view"|"map"|"circuit"|"car"})` — the character raster of the
   3D scene. Stale under `headless(true)`; `snapCam()` REQUIRED after
   `park()`/`jump()`.
3. DOM/a11y snapshot (Playwright MCP `browser_snapshot` / `browser_resize` /
   `browser_evaluate`, or chrome-devtools) — menu/HUD work only; hide `#game`.
4. Pixel screenshot — visual sign-off only, never an assertion source. Live
   poking is the `mcp-probe` skill; the suite itself always runs script-driven.

This container has **no real GPU** (llvmpipe) and the native WebGPU swapchain
never composites on software, so WGX blits the visible `#game` and a probe
waits on `awaitSoftPresent()`. Which command probes which backend, the measured
colours, and the Cursor Cloud bootstrap (`tools/cloud-agent-install.sh`, what
survives a cold boot): `docs/notes/CI-RENDERING-PERFORMANCE.md`. Keep
`apex-tools` in root `.mcp.json`; never run Chrome MCP while Playwright runs;
never attach `mcp-probe` for a `version.json` check.

**A UNIT TEST OF A RENDERER BACKEND IS NOT EVIDENCE THAT IT RUNS** — a mock
device stayed green while four defects made the real backend refuse to boot.
Boot it live (`npx serve -l 3456 .`, a SECURE CONTEXT, then `node
tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --console 'WGX|error'`)
and confirm with one POSITIVE signal: a clean WGX boot writes nothing, so
assert `canvas.getContext("webgl2") === null`. Defects and traps:
`docs/ARCHITECTURE.md` §Boot evidence,
`.claude/skills/mcp-probe/references/recipes.md`.

## Layout

**`js/track/` is the ENGINE, `js/circuits/` is the DATA** (one data file per
circuit; script-tag order == `Tracks.LIST` == picker order). The module roster
and load order live in `tools/manifest.cjs` — read that, not this file, to
enumerate what exists; `index.html` script order is guard-asserted against it.
Per-directory module tables: `docs/ARCHITECTURE.md`.

- `js/core/log.js` loads FIRST; `js/core/mat4.js` is M4/V3 + shared clamps.
- `js/game.js` is the entry (loop, physics, AI, race flow); it hands the `G`
  façade to the extracted modules — one `Module.create(G)` per file, and a
  module NEVER reaches into game.js. `js/agent/apex.js` is the `__apex` dev API.
- `js/render/` — `gfx.js` façade → GLX (WebGL2 default) in `glx/` with its
  passes and GLSL-as-data; `shared/` is what every backend uses. DEFERRED
  backends, no script tag, injected at boot: `webgpu/` WGX, `three/` TLX
  (`apex26.gfxBackend`).
- `js/track/` — `core/`, `scenery/`, `tracks.js`. Only GENERIC tables live
  here; the 111-member `scenery(api)` contract is frozen by
  `tests/unit/scenery-api-contract.test.mjs`.
- `js/car/`, `js/data/`, `js/net/` (2-4 player WebRTC, no backend), `js/ui/`.
- `css/` tokens + component files; `docs/COMPONENTS.md` is test-asserted, and
  class-count + body-node ratchets apply.
- `index.html` is the shell — script tags and ALL static DOM; `sw.js`'s
  precache derives from it. `types/game-ctx.d.ts` is the `G` contract, held by
  `tools/check-gctx.mjs`.
- `.claude/skills/` workflow references, `.claude/agents/` scoped subagents
  (each with a README index) — they encode the flat prohibitions above so a
  subagent cannot un-know them.

## Critical conventions

- **Cache busting is the deploy's job**: every asset tag in the committed shell
  reads `?v=dev`; `pages.yml` rewrites them to content hashes and stamps the
  generation while staging. There is NO bump after a js/css edit, and
  `bump-cache --apply` refuses on the repo. After a `tools/manifest.cjs` change
  run `node tools/gen-shell.mjs`.
- **No ES modules** — every file is a `"use strict"` IIFE assigning one global
  (sole exception: the vendored three.js island).
  `tests/unit/global-registry.test.mjs` enforces the registry.
- **New file**: IIFE file + `tools/manifest.cjs` entry (+ HARD_EDGES pair if
  eval-time destructured) + `node tools/gen-shell.mjs`, which writes the
  `index.html` tag block, `tools/carview.html`, sw.js's precache seed and
  `js/roster.js`. No cache bump. Never hand-edit a `@gen-shell` block;
  `load-order.test.mjs` fails on drift.
- **Circuit edits go in `js/circuits/<id>.js`; engine changes in `js/track/`.**
- `tests/data/ratchets.json` ratchets game.js and the other big modules AT
  their current values — pay for every added line; `node tools/ratchets.mjs
  --update` lowers them after an extraction or on a merged tree.
- **localStorage keys** are prefixed `apex26.`.
- **Coordinates**: +Y up, metres, radians, arc `s` in metres, lateral `x`
  +right. **+k = LEFT-hand turn** (measured). Never flip a curvature sign
  without a rendered lap.
- Frac-keyed def tables must respect `def._sceneryShift`: consume via the
  compensated idiom (`bankingProfile`, `buildCenterline`) — a raw `frac` read
  places things 2/3 of a lap away.
- Logging goes through `Log` (`js/core/log.js`), never bare `console.*`:
  namespace first arg, console threshold `warn`, ring buffer `info`
  (`__apex.logs()`). Guard hot-path debug lines with `Log.enabled(ns, level)`;
  set via `__apex.logLevel("ns:debug")`, `?log=`, or `APEX_LOG=` for tests.
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
live in `js/physics/consts.js`; tunables stay `let`s in game.js.
`tests/specs/physics-characterization.spec.js` is the master gate for anything
near game.js.

## Baked asset pack

`assets/pack/`: PBR material arrays — one `TEXTURE_2D_ARRAY` whose layer index
IS the `MAT` id; blended (`albedo * tex.rgb * 2.0`) so tint and wear survive.
**Ships ON.** (`matTexMix` def 1.0; `__apex.matTex(0)` is the A/B off-switch.)
Every failure degrades to the procedural look; boot never awaits assets. GLX,
TLX, and WGX implement it. `tools/assets.mjs verify` gates licences.

## `window.__apex` dev API

~185 hooks; `docs/DEBUG-HOOKS.md` is the reference and `__apex.agentHelp()`
the machine-readable manifest — call it once per session instead of loading
the list here. Sharp edges: `obs()`/`physState()` need `player.px` initialised
(`jump()` or `step()` after `race()`+`go()`); agentview failures are
`{ok:false, error, message, fix}`, never null; `render({what:"view"})` reuses
the LAST frame and is stale under `headless(true)`; `snapCam()` after
`park()`/`jump()` before any shot. `node tools/agent.mjs <track> <cmd>` is the
same surface from a shell.

## Agent extensions (skills / subagents)

Skills are on-demand workflows in `.claude/skills/` (index
`.claude/skills/README.md`); subagents are isolated contexts in
`.claude/agents/`. Which CLIs are wrapped as `apex_*`, and which stay
CLI-only: `docs/AGENT-SURFACE.md`. Live canvas → `mcp-probe`. Deploy /
merge → `check-changes` (or just `node tools/deploy.mjs`). Pre-push →
`check-changes`, which spawns the `verify-agent` subagent (`--base <ref>` is
the "was it already red on the tip?" check). Live `version.json` goes to the
`deploy-research` SUBAGENT — never attach `mcp-probe` for that. Fat skill /
extract / dead code → `slim-bloat` in `check-changes`, or the `bloat-auditor`
subagent.

**Cursor** loads the same Claude paths; the thin always-on pointer is
`.cursor/rules/apex-shared.mdc`. Do not duplicate skills under
`.cursor/skills/` or agents under `.cursor/agents/`.

WGSL has FIVE rules a mock device cannot enforce, and three of them shipped a
defect on the owner's iPhone this week: `sampleCount` is 1 or 4 ONLY;
`dpdx`/`dpdy`/`fwidth` only under uniform control flow (WebKit ERRORS where
Dawn only warns); a TSL placeholder texture must carry the sampling state of
the texture that will replace it; `device.onuncapturederror = fn` is DEAF on
iOS/Safari 26.0–26.5 (register `addEventListener("uncapturederror")` first);
and WebKit caps module-scope `var<private>` at 8,192 bytes per module (three
r185 declares every node variable that way — see the vendor patch). Breaking
any of them makes the backend refuse SILENTLY and fall back:
`docs/research/WEBGPU-PARITY.md` §5a.

## Git branch & deploy

Work happens on a `claude/<topic>` branch — `git branch --show-current` is the
truth. **The deploy branch is `claude/f1-game-project-26h3ng`**: never push
there without review; `pages.yml` fires only there and ships to
https://brycejmurrin.github.io/f1-game/. Other sessions develop directly on the
deploy branch, so a deploy is a merge of THEIR new work — both-side changes are
real conflicts: re-measure baselines on the merged tree, never force-push.

**`node tools/deploy.mjs`** is the whole protocol (fetch → merge →
`test:tooling-fast` → `verify-track` for touched circuits → push; `--pr` opens
a reviewable PR instead, `--plan` prints the union first). `test:sweeps` is
CI's on the same diff — do not duplicate it locally. The live check is
`pages.yml`'s `verify-live` job; this container cannot reach `github.io`, so
read the run in the Actions tab or fetch `version.json` through the host's
fetch tool, never curl.
