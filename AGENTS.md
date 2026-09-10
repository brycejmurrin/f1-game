# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks: pure IIFE modules
loaded via `<script>` tags, static files on GitHub Pages.

This file holds the rules every session needs and nothing else. Evidence lives
in `docs/` (start at `docs/README.md`, a reading order); workflows live in
`.claude/skills/`; rules that must hold every time are hooks in `.claude/hooks/`;
renderer-specific rules load with their files from `.claude/rules/`.
`CLAUDE.md` is a stub that imports this file; Cursor and Codex read it directly.

## Key commands

```sh
npx serve -l 3456 .                 # run locally (or: python3 -m http.server 3456)
npm run test:tooling-fast           # the no-browser guard suite (~3 min)
npm run test:guards                 # the 14 cross-file guards (11 s; the commit hook runs it)
node tools/ci/verify-change.mjs     # ONE command: fast gate + batched groups (--wait/--plan/--fast)
node tools/track/verify-track.cjs <id>    # 2 s headless build check for track edits
node tools/ci/pick-tests.mjs        # which test GROUPS does this change need? (select-specs.mjs: per-SPEC)
node tools/ci/test-bg.mjs <groups>  # run browser groups in the background
```

## Verification — scale it to the change

One browser GROUP costs 10–40 minutes of serialized SwiftShader here, so
running more than the change needs is slower feedback, not extra safety
(`docs/TESTING.md`; the measurements behind every rule below:
`docs/notes/TESTING-FIELD-NOTES.md`).

| change touches | run |
|---|---|
| docs, tools, tests only | `npm run test:tooling-fast` |
| one circuit (`js/circuits/<id>.js`) | `node tools/track/verify-track.cjs <id>`, then that circuit's foundation spec alone |
| one subsystem with its own spec | that spec — `npm test -- tests/specs/<file>.spec.js`; prefer single specs over their whole group |
| `js/render/webgpu/` or `js/render/three/` | the path-scoped rule in `.claude/rules/` says what to run; software probes are not evidence about a player's GPU, so dispatch `gpu-census.yml` on `macos-latest` and read its Verdict step |
| engine / physics / `js/game.js` | the groups `pick-tests` names, capped at two browser groups: run the two most specific, name the rest as not-run in the PR |
| geometry pushed to the deploy branch, or a group this box cannot time | `npm run test:sweeps`; dispatch `ci.yml` with `group: <name>` (one per change) and read the four Smoke jobs. Docs-only pushes start no CI |

Session shape — eleven rules that control wall time and waiting:

1. Fresh container: the SessionStart hook runs `npm install` and checks for
   `chromium-headless-shell` (fallback `bash tools/env/cloud-agent-install.sh`).
   Either missing reads as a total-red run: read the FIRST failure first.
2. Make ALL source edits first, then verify ONCE: tests serve `js/` and `css/`
   from the working tree, so a run in flight forbids source edits (the edit
   hook blocks them). `test:tooling-fast` is the edit-loop check.
3. `npm run test:guards` before every commit; the commit hook runs it and
   blocks red. The 14 guards check registries, generated files and ceilings,
   and parse every manifest file.
4. Never block the foreground on a test run: background it (log in `artifacts/`).
5. ONE Playwright process, ONE browser group per batch, via `test-bg.mjs`.
   Anchor on `grep -E '= run (passed|failed|timedout|interrupted)'`, never a
   looser pattern, the process table, or `| tail` on a live log.
6. Stop a run with `node tools/ci/test-bg.mjs --stop`, never by PID (the Bash
   hook blocks it): a bare `kill` orphans every Chromium the run opened.
   `--stop --sweep` recovers a run whose supervisor is already dead.
7. Reap what you launched: before a browser run, a deploy or a timing
   judgement, `ps -eo pid,pcpu,etimes,args --sort=-pcpu | head`; kill a
   long-elapsed Chrome of yours by a listed PID, never `pkill -f` (it matches
   your own shell; blocked). The MCP servers at 0 % are the harness's.
8. A timeout on a busy box measures the machine: check `/proc/loadavg` (< 3)
   and for a live `playwright test` first; re-run alone only when the verdict
   matters. On CI, `cancelled` with zero failures is a timeout until proven
   otherwise.
9. Stopping is allowed: a pushed change that names its unverified groups
   beats an hour of SwiftShader. Never widen a tolerance to make a spec pass;
   a `waitForFunction` on a rendering page needs `{ polling: 100 }`.
10. Never hand a subagent a browser run ("report it unverified"). Worktrees
    default to a STALE base: first `git checkout -B <branch> <session SHA>`.
11. Never hand-edit a generated file (the edit hook blocks it): `index.html`'s
    `@gen-shell` blocks, `version.json`, `package.json`'s test scripts
    (source `tests/groups.json`), `tools/README.md` (source: `@doc` headers),
    `js/roster.js`, `tools/carview.html`. Edit the SOURCE, run its generator.

## Seeing the game (cheapest first)

1. `__apex` JSON hooks (`info/probe/physState/world/scene/field`) —
   assertable, deterministic, always the first choice.
2. `render({what:"view"|"map"|"circuit"|"car"})` — the character raster of the
   3D scene. Stale under `headless(true)`; `snapCam()` after `park()`/`jump()`.
3. DOM/a11y snapshot (Playwright MCP `browser_*`, or chrome-devtools) —
   menu/HUD work only; hide `#game`.
4. Pixel screenshot — visual sign-off only, never an assertion source. Live
   poking is the `mcp-probe` skill; the suite itself always runs script-driven.

This container has no real GPU: renderers blit onto `#game-soft` and a probe
waits on `awaitSoftPresent()` (`docs/notes/CI-RENDERING-PERFORMANCE.md`).
Never run Chrome MCP while Playwright runs; a `version.json` check is the
`deploy-research` subagent. A unit test of a renderer backend is not evidence
that it runs: boot it live and confirm one positive signal
(`docs/ARCHITECTURE.md` §Boot evidence,
`.claude/skills/mcp-probe/references/recipes.md`; `.claude/rules/render-wgx.md`
and `.claude/rules/render-tlx.md` hold each backend's gate).

## Layout

`js/track/` is the ENGINE, `js/circuits/` is the DATA (one file per circuit;
script-tag order == `Tracks.LIST` == picker order). The module roster and load
order live in `tools/manifest.cjs` — read that, not this file, to enumerate
what exists. Per-directory module tables: `docs/ARCHITECTURE.md`.

- `js/core/log.js` loads FIRST; `js/core/mat4.js` is M4/V3 + shared clamps.
- `js/game.js` is the entry (loop, physics, AI, race flow); it hands the `G`
  façade to the extracted modules — one `Module.create(G)` per file, and a
  module never reaches into game.js. `js/agent/apex.js` is the `__apex` dev API.
- `js/render/` — `gfx.js` façade → GLX (WebGL2, the default) in `glx/`;
  `shared/` is the backend-agnostic half; WGX (`webgpu/`) and TLX (`three/`)
  are opt-in alternates with no `<script>` tag, injected by `js/game.js` from
  `ApexRoster.DEFERRED` when `apex26.gfxBackend` names them.
- `js/track/` — `core/`, `scenery/`, `tracks.js`; only GENERIC tables live
  here (the 112-member `scenery(api)` contract is test-frozen).
- `js/car/`, `js/data/`, `js/net/` (2-4 player WebRTC, no backend), `js/ui/`,
  `css/`. `index.html` is the shell — script tags and ALL static DOM; `sw.js`'s
  precache derives from it. `types/game-ctx.d.ts` is the `G` contract.

## Critical conventions

- Cache busting is the deploy's job: every asset tag in the committed shell
  reads `?v=dev` and `pages.yml` rewrites them to content hashes while staging.
  There is no bump after a js/css edit.
- No ES modules — every file is a `"use strict"` IIFE assigning one global
  (sole exception: the vendored three.js island). New file: IIFE +
  `tools/manifest.cjs` entry (+ HARD_EDGES pair if eval-time destructured) +
  `node tools/gen/gen-shell.mjs`.
- Circuit edits go in `js/circuits/<id>.js`; engine changes in `js/track/`.
- `tests/data/ratchets.json` ratchets game.js and the other big modules at
  their current values — pay for every added line (`node
  tools/check/ratchets.mjs --update` lowers them after an extraction).
- localStorage keys are prefixed `apex26.`.
- Coordinates: +Y up, metres, radians, arc `s`, lateral `x` +right; +k = LEFT
  turn (measured). Never flip a curvature sign without a rendered lap.
- Frac-keyed def tables must respect `def._sceneryShift` (consume via
  `bankingProfile` / `buildCenterline`); a raw `frac` read lands 2/3 of a lap away.
- Logging goes through `Log` (`js/core/log.js`), never bare `console.*`.
- Regenerable output goes in `artifacts/` or `scratch/` only, never `/tmp`.

## Physics

Full reference `docs/PHYSICS.md`. Two rules bind everywhere:

- `PACE` is a ground-speed scale, not a cap: compare speeds through
  `vTop()`/`vStd()`/`aStd()` (`tools/check/vstd-lint.mjs` enforces it).
- The arc must not reach the driver: nothing derived from track curvature or
  the racing line may affect the player with assists off; a new
  `Tracks.curvature()` read goes in a legitimate column (AI-only,
  assist-gated, broadcast-only, surface — table in docs/PHYSICS.md).

Read `c.aeroX` (or `aeroDfMult(c)`), never `c.xOn`. Immutable numbers live in
`js/physics/consts.js`; tunables stay `let`s in game.js.
`tests/specs/physics-characterization.spec.js` is the master gate near game.js.

## Baked asset pack

`assets/pack/`: PBR material arrays — one `TEXTURE_2D_ARRAY` whose layer index
IS the `MAT` id; blended (`albedo * tex.rgb * 2.0`) so tint and wear survive.
**Ships ON.** (`matTexMix` def 1.0; `__apex.matTex(0)` is the A/B off-switch.)
Every failure degrades to the procedural look; boot never awaits assets. GLX,
TLX, and WGX implement it. `tools/gen/assets.mjs verify` gates licences.

## `window.__apex` dev API

~185 hooks; `docs/DEBUG-HOOKS.md` is the reference and `__apex.agentHelp()`
the machine-readable manifest — call it once per session. `obs()`/`physState()`
need `player.px` initialised (`jump()` or `step()` after `race()`+`go()`).
`node tools/shot/agent.mjs <track> <cmd>` is the same surface from a shell.

## Agent extensions (skills / subagents / hooks / MCP)

Skills (`.claude/skills/`, index `.claude/skills/README.md`) say when and
how; subagents (`.claude/agents/`) isolate noisy work; `docs/AGENT-SURFACE.md`
maps which CLIs are wrapped as `apex_*`. Routes: live canvas → `mcp-probe`;
pre-push or deploy → `check-changes` (spawns `verify-agent`; `--base <ref>` is
the "was it already red?" check); live `version.json` → `deploy-research`;
dead code / fat skill → `slim-bloat` and `bloat-auditor`.

Hooks (`.claude/hooks/`): `session-start.sh` installs deps; `protect-files.sh`
blocks generated-file edits and source edits during a live browser run;
`bash-guard.sh` runs the guards before `git commit` and blocks `pkill -f` and
PID kills of a test-bg run; `touch .claude/allow-protected` is the escape hatch
for an assigned edit. Cursor loads the same skills and agents
(`.cursor/rules/apex-shared.mdc` is its pointer); Codex reads this file and
`.codex/config.toml` (the same MCP servers as `.mcp.json`) and scans
`.agents/skills/`, which `bash tools/env/mirror-skills.sh` fills. Never
duplicate skills or agents under `.cursor/`.

## Git branch & deploy

Work happens on a `claude/<topic>` branch. The deploy branch is
`claude/f1-game-project-26h3ng`: never push there without review; `pages.yml`
fires only there and ships to https://brycejmurrin.github.io/f1-game/. Other
sessions develop directly on the deploy branch, so a deploy is a merge of THEIR
work — re-measure baselines on the merged tree, never force-push.

`node tools/ci/deploy.mjs` is the whole protocol (fetch → merge →
`test:tooling-fast` → `verify-track` for touched circuits → push; `--pr` opens
a reviewable PR, `--plan` prints the union first). It auto-cures a conflict in
a GENERATED file and stops on anything else. The live check is `pages.yml`'s
`verify-live` job; this container cannot reach `github.io`, so read the Actions
run or fetch `version.json` through the host's fetch tool, never curl.
