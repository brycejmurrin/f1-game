# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks: pure IIFE modules
loaded via `<script>` tags, static files on GitHub Pages. This file is the
gates and the map; the deep references live in `docs/` — start at
`docs/README.md`. Load a reference only when the task touches its area.

## Key commands

```sh
npx serve -l 3456 .                   # run locally (or: python3 -m http.server 3456)
node tools/pick-tests.mjs             # which test groups does this change need?
node tools/test-bg.mjs <groups>       # run them in the background (see Testing)
npm run test:tooling-fast             # the no-browser guard suite (~20 s)
node tools/verify-track.cjs <id>      # 2 s headless build check for track edits
node tools/assets.mjs verify          # asset-pack licence + md5 + budget check
tools/README.md                       # test-asserted index of all 60+ tools
```

## Testing — the gates

Reference: `docs/TESTING.md` (groups, specs, fixtures, philosophy, and the
operational field notes behind every rule below). The suite is 113 Playwright
specs plus 96 `node --test` unit suites; the browser half runs on SwiftShader
and is slow. The rules:

- **`npm install` FIRST on a fresh container** — a missing `node_modules`
  reads as ~18 scattered `Cannot find module` suites inside an otherwise
  green run (measured 344/18 -> 439/0, no source change).
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` keeps it to seconds.
- **…then `npx playwright install chromium-headless-shell`.** That skip flag
  leaves the BROWSER absent, and the specs launch the headless shell, not the
  `/opt/google/chrome` this box ships. Measured 2026-08-17: 73/73 of `test:tiny`
  failed `browserType.launch: Executable doesn't exist …chromium_headless_shell`
  — a total-red run that looks like a boot regression and is a 2.3 MB download
  (seconds). Read the FIRST failure's message before believing any red run.
- **ONE Playwright process at a time, ONE browser group per batch.** Two
  processes share one HTTP server and oversubscribe the 4 cores; killing
  either strands the other, and browser+browser pairing is the measured
  source of every 120 s timeout class. Pair a browser group only with a
  node-only group.
- **Browser groups run in the BACKGROUND.** Start with `test-bg.mjs`, watch
  the log for the terminal line `= run (passed|failed|timedout|interrupted)`
  — never a looser pattern, never the process table, never `| tail` on a live
  log. Long queues need a resumable driver + an uncapped waiter (`Monitor`
  caps at 30 min even with `persistent`); `docs/TESTING.md` §Field notes has
  the worked example.
- **Run what the change needs**: `test:tiny` after any edit →
  `test:tooling-fast` in the loop → the groups `pick-tests` names. Track or
  scenery edits run `verify-track.cjs <id>` FIRST.
- **A timeout on a busy box measures the machine, not the code** — re-run
  that spec ALONE before believing it. Check `/proc/loadavg` (< 3) and for a
  live `playwright test` process before starting anything.
- While a run is in flight: **don't edit `js/` or `css/`** (the server serves
  the working tree), **never bump `?v=N`/`version.json`** (bump is the LAST
  edit before commit), and **never hand a subagent a browser run** — give a
  flat prohibition ("report it unverified").
- Subagent worktrees default to a STALE base (`origin/main` is a diverged
  lineage). First step in any worktree: `git checkout -B <branch> <the
  session branch or its SHA>` and verify a session-known file.
- Any `waitForFunction` on a rendering page needs `{ polling: 100 }` — the
  default rAF polling starves under SwiftShader and the declared timeout
  never fires (measured 36x overruns; details and the live fixed-site count
  are in `docs/TESTING.md`).
- Write tests against `__apex` hooks, not rendering magnitudes; prefer
  relative assertions over absolute thresholds; never widen a tolerance to
  make a spec pass.

## Seeing the game (cheapest first)

1. `__apex` JSON hooks (`info/probe/physState/world/scene/field`) — pennies,
   assertable, deterministic. Always the first choice.
2. `render({what:"view"|"map"|"circuit"|"car"})` — the character raster of
   the 3D scene, structured text an agent can diff. Stale under
   `headless(true)`; `snapCam()` REQUIRED after `park()`/`jump()`.
3. DOM/a11y snapshot (chrome-devtools MCP `take_snapshot`) — menu/HUD work
   only; the canvas is invisible to it (~hundreds of tokens).
4. Pixel screenshot — thousands of tokens each; visual sign-off only, never
   an assertion source. For live poking use the `mcp-probe` skill; the
   Playwright suite itself always runs script-driven, never through an MCP.

**A UNIT TEST OF A RENDERER BACKEND IS NOT EVIDENCE THAT IT RUNS.** WGX's mock
device passed every assertion while three separate defects made the real backend
refuse to boot (MSAA 2 is illegal in WebGPU; `fwidth` behind a branch is a WGSL
compile error; `mappedAtCreation` for a 35 MB mesh exhausts the mappable pool).
All three surfaced in one command against a live device, and none was findable
without one:

```sh
npx serve -l 3456 .   # a SECURE CONTEXT: navigator.gpu is absent on about:blank
node tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --console 'WGX|error'
```

`probe` writes the backend pick and RELOADS in one batch (`--backend
webgl2|three|webgpu`; `three` gets the specs' WebGL2 pin), `--eval` runs a body,
`--console RE` greps the dump, `--dry-run` shows the batch. In page code use
BARE globals — `GLX`, not `window.GLX`: script-level `const` is a lexical
binding, not a window property. A clean WGX boot writes NO console line and
leaves `sessionStorage["apex26.gfxBound"]` absent (that key means it refused).
SwiftShader is a validation oracle, never a visual one. Full trap list:
`.claude/skills/mcp-probe/SKILL.md` §Probing a specific renderer.

## Agent output

Lead with the outcome; `file:line` first, then the claim. No preamble, no
restating the diff or the question. Tables/fragments for enumerations, prose
only where mechanism needs explaining. A finding without evidence you read
yourself is speculation — say so or drop it.

## Logging

Everything goes through `Log` (`js/log.js`), never bare `console.*`: first
arg is a namespace from `Log.NAMESPACES`, console threshold `warn`, ring
buffer `info` (500 entries, `__apex.logs()`). Guard hot-path debug lines
with `Log.enabled(ns, level)`. Set via `__apex.logLevel("ns:debug")`,
`?log=`, or `APEX_LOG=` for test runs.

## Output dirs

Regenerable output goes in the gitignored roots only: `artifacts/` (test
results/logs/tmp) and `scratch/` (captures, renders, profiles). Never `/tmp`,
never the repo root. Golden baselines exist for the MENUS only.

## Layout

**`js/track/` is the ENGINE, `js/circuits/` is the DATA** (40 circuit data
files; script-tag order == `Tracks.LIST` == picker order). Load order lives
in `tools/manifest.cjs` and is guard-asserted against `index.html`.

```
js/log.js .. mat4.js    Log (loads FIRST), M4/V3 math (+ shared clamp/lerp/wrapDelta)
js/game.js              entry: game loop, physics, AI, race flow; owns closure
                        state; hands the G ctx façade to js/game/* modules
js/render/              Gfx façade → GLX (WebGL2, default; core + glx/ passes) +
                        shaders/ (GLSL as data), gltf.js, assets.js (baked pack
                        loader, always falls back to procedural). DEFERRED (no
                        script tag, injected at boot): webgpu/ WGX (deferred
                        opt-in; API near GLX, look gaps remain), three/ TLX
                        (opt-in apex26.gfxBackend="three")
js/track/               tracks (shell) spline mesh geom graph space surface
                        markings models themes landmark-kit circuit-kit
                        geo-paths maps + scenery-{data,nature,city,structures,
                        identity} — the 110-member scenery(api) contract is
                        frozen by tests/unit/scenery-api-contract.test.mjs
js/car/                 car3d liveries liverytex parts (12 categories, 600 cr)
                        ghost teams driver-ratings
js/data/                F1API + DataHub tabs (docs: js/data/hub.js header)
js/net/                 2-4 player WebRTC, no backend — docs/MULTIPLAYER.md
js/game/                one Module.create(G) per file; modules never reach into
                        game.js. Look-alikes: cam-tune=data, cam-tuner=its
                        panel, tuner=LIGHTING panel; lighting=registry,
                        light-store=persistence, light-presets=shipped values;
                        season-cal=the SEASON calendar+format RULES (no DOM,
                        no create(G)), season-ui=its SETUP screen. Career is
                        NOT customisable and stays on Tracks.SEASON.
                        Self-init (no create(G)): scrollfade.js sheetshape.js
                        topmodal.js menunav.js ariastate.js uilayers.js (THE
                        layer stack) css-zoom.js gfx-quality.js (GRAPHICS
                        presets + the RENDERER cycle; the preset's tier floor
                        enters PerfGov.tier()'s max(), so the render path has
                        no per-preset branch)
                        perf-try.js (default-OFF renderer A/B switches +
                        the SETTINGS panel; GLSL ones are #defines injected
                        in GLX.compile) cockpit-opts.js (first-person view
                        options — today the opt-in HALO; its SETTINGS button is
                        injected at runtime, and game.js keys the cockpit body
                        cache on it so a toggle needs no reload).
                        apex.js = the __apex dev API.
                        The full module roster lives in tools/manifest.cjs —
                        the load-order truth; read it, not this file, to
                        enumerate what exists
css/                    tokens + 10 component files; docs/COMPONENTS.md is
                        test-asserted; class-count + body-node ratchets apply
index.html              shell: script tags, all static DOM, ?v=N cache busting
sw.js                   service worker; precache derives from the shell's tags
types/                  authored .d.ts contracts, NOT loaded at runtime.
                        game-ctx.d.ts = the 210-member G façade, held to
                        `const G` by tools/check-gctx.mjs (Bedrock Phase 1)
tests/ tools/ docs/     see docs/TESTING.md, tools/README.md, docs/README.md
.claude/ spike/ worker/ skills+workflows / concluded evaluations / optional relay
```

## Critical conventions

- **Cache busting**: after ANY js/css change, bump every `?v=N` in
  `index.html` to max+1 AND set `version.json` to the same N
  (`.claude/skills/bump-cache`). Last edit before commit, never mid-run.
- **No ES modules** — every file is a `"use strict"` IIFE assigning one
  global (sole exception: the vendored three.js island).
  `tests/unit/global-registry.test.mjs` enforces the registry.
- **New-file lockstep**: IIFE file + `<script>` tag position +
  `tools/manifest.cjs` entry (+ HARD_EDGES pair if eval-time destructured) +
  layout mention here + cache bump. DEFERRED backends have no tag;
  `DEFERRED`/`BACKEND_FILES`/sw.js precache must agree (guard-asserted).
- **Circuit edits go in `js/circuits/<id>.js`; engine changes in `js/track/`.**
- **The G ctx façade**: extracted modules receive `G` — live getters/setters
  built in game.js. `module-size.test.mjs` ratchets game.js (and apex.js) at
  their current size; both sit AT their ceilings — pay for every added line.
- **Naming in `js/game/`**: new multi-word files are hyphenated; the older
  squashed names are grandfathered — do not churn them (settled, final).
- **localStorage keys** are prefixed `apex26.`.
- **Coordinates**: +Y up, metres, radians, arc `s` in metres, lateral `x`
  +right. **+k = LEFT-hand turn** (measured; the opposite label shipped for
  months). Never flip a curvature sign without a rendered lap.
- Frac-keyed def tables must respect `def._sceneryShift` (the 7a173519
  rotation): consume via the compensated idiom (`bankingProfile`,
  `buildCenterline`) — a raw `frac` read places things 2/3 of a lap away.

## Physics

Full reference `docs/PHYSICS.md`. Two rules bind everywhere:
- **`PACE` is a ground-speed scale, not a cap.** Anything comparing a speed
  to a literal or VMAX must use `vTop()`/`vStd()`/`aStd()` — enforced by
  `tools/vstd-lint.mjs`; a bare literal needs a written reason.
- **The arc must not reach the driver.** Nothing derived from track curvature
  or the racing line may affect the player with assists off; when adding a
  `Tracks.curvature()` read, place it in a legitimate column (AI-only,
  assist-gated, broadcast-only, surface — table in docs/PHYSICS.md).

Read `c.aeroX` (or `aeroDfMult(c)`), never `c.xOn`. Immutable model numbers
live in `js/game/physics-consts.js`; tunables stay `let`s in game.js.
`tests/specs/physics-characterization.spec.js` is the master gate for
anything near game.js.

## Area references (load on demand)

- Lighting/sky: `docs/LIGHTING-REF.md`, `-KNOBS.md`, `-PRESETS.md`;
  `.claude/skills/bake-lighting` lands a COPY VALUES export.
- Baked asset pack: `docs/`+`tools/assets.mjs verify`; MAT id == texture
  layer; every failure degrades to procedural; boot never awaits assets.
- Career/multiplayer/scenery/testing deep dives: `docs/CAREER.md`,
  `docs/MULTIPLAYER.md`, `docs/SCENERY-API.md`, `docs/TESTING.md`.
- WGX/WGSL (`js/render/webgpu/`): `docs/research/WEBGPU-PARITY.md`. Two rules
  the language enforces and a mock device cannot: `sampleCount` is 1 or 4 ONLY,
  and `dpdx`/`dpdy`/`fwidth` may appear ONLY where control flow is uniform — in
  practice the first statements of `fs_main`, passed down as a parameter, because
  a callee that returns early non-uniformly poisons its caller too. Breaking
  either does not throw: WGX refuses and the game falls back to GLX with one
  console warning. Boot it live before believing a WGX change.

## Baked asset pack

`assets/pack/`: PBR material arrays — one `TEXTURE_2D_ARRAY` whose layer index
IS the `MAT` id; blended (`albedo * tex.rgb * 2.0`) so tint and wear survive.
**Ships ON.** (`matTexMix` def 1.0; `__apex.matTex(0)` is the A/B off-switch.)
Every failure degrades to the procedural look; boot never awaits assets. GLX,
TLX, and WGX implement it. `tools/assets.mjs verify` gates licences.

## `window.__apex` dev API

~180 hooks; `docs/DEBUG-HOOKS.md` is the reference and `__apex.agentHelp()`
the machine-readable manifest — call it once per session instead of loading
the list here. Sharp edges: `obs()`/`physState()` need `player.px`
initialised (`jump()` or `step()` after `race()`+`go()`); agentview calls
never return null (failures are `{ok:false, error, message, fix}`);
`render({what:"view"})` reuses the LAST frame and is stale under
`headless(true)`; `snapCam()` after `park()`/`jump()` before any shot.
`node tools/agent.mjs <track> <cmd>` is the same surface from a shell.

## Git branch & deploy

Work happens on a `claude/<topic>` branch — `git branch --show-current` is
the truth. **The deploy branch is `claude/f1-game-project-26h3ng`**: never
push there without review; `pages.yml` fires only there and ships to
https://brycejmurrin.github.io/f1-game/. Since the 2026-08-13 unification
merge (`a560de44`) the deploy branch and the working lineage share history —
a deploy is an ordinary `git merge`, but OTHER SESSIONS develop directly on
the deploy branch, so always `git fetch` and merge THEIR new work (both-side
changes are real conflicts: re-measure baselines on the merged tree, take
max+1 of both lineages' cache versions), never force-push, and re-run
`test:tooling-fast` AND — when either side touched `js/track/`,
`js/circuits/` or `tools/` — `test:sweeps` before pushing: the per-circuit
baselines (clip/float/coplanar) are exact in BOTH directions, and a
geometry change that is green on each lineage alone can be red on their
union (measured 2026-08-14: one engine fix moved clip counts on 8
circuits and broke CI on every branch that merged the trunk). The
container proxy blocks `github.io` — verify a live deploy through an MCP
fetch, not curl.
