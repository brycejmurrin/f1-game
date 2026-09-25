# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks: pure IIFE modules
loaded via `<script>` tags, static files on GitHub Pages.

This file holds the rules every session needs and nothing else. Evidence lives
in `docs/` (start at `docs/README.md`); workflows live in `.claude/skills/`; rules
that must hold every time are hooks in `.claude/hooks/`; renderer rules load with
their files from `.claude/rules/`. `CLAUDE.md` imports this; Cursor and Codex read it.

## The loop — every change, in order
```sh
npx serve -l 3456 .                   # run locally (or: python3 -m http.server 3456)
node tools/ci/pick-tests.mjs          # 1. which GROUPS does this change need? (the table below; select-specs.mjs: per-SPEC)
#                                       2. make ALL edits, then verify ONCE (rule 2); a new test file = a tests/groups.json group + a TESTING.md §5 row + `npm run gen`
node tools/ci/tooling-fast.mjs --jobs=3   # 3. edit-loop check, a SUBSET (rule 3): ~2 min idle; `npm run test:tooling-fast` is --jobs=1, ~9 min
node tools/ci/test-bg.mjs <group>     # 4. ONE browser group, in the background → artifacts/logs/<group>.log (rule 5)
node tools/ci/test-bg.mjs --wait --timeout 45   # 5. the waiter, as ONE background task (rule 4); the verdict is the log's `= run …` line
node tools/ci/deploy.mjs --gate-only  # 6. before a push: the only check that runs what the deploy runs
git commit && git push -u origin claude/<topic>   # 7. commit runs test:guards; push, then open/refresh the DRAFT PR (rule 12)
```
Then watch CI (§Watching CI and Pages). Memory: auto memory is ON and synced to `.claude/memory/` — it holds
preferences and corrections; a measured lesson goes to `docs/notes/`, a rule to a hook or test, a work log to the PR body.

## Verification — scale it to the change
One browser GROUP costs 10–40 minutes of serialized SwiftShader here, so
running more than the change needs is slower feedback, not extra safety
(`docs/TESTING.md`; the measurements behind every rule below:
`docs/notes/TESTING-FIELD-NOTES.md`). `APEX_GL=llvmpipe` boots GLX/TLX ~2.7×
faster when Mesa is installed (no `navigator.gpu`; `docs/notes/CI-RENDERING-PERFORMANCE.md`).

| change touches | run |
|---|---|
| docs, tools, tests only | `npm run test:tooling-fast` |
| one circuit (`js/circuits/<id>.js`) | `node tools/track/verify-track.cjs <id>`, then that circuit's foundation spec alone |
| one subsystem with its own spec | that spec — `npm test -- tests/specs/<file>.spec.js`; prefer single specs over their whole group |
| `js/render/webgpu/` or `js/render/three/` | the path-scoped rule in `.claude/rules/` says what to run; software probes are not evidence about a player's GPU, so dispatch `gpu-census.yml` on `macos-latest` and read its Verdict step |
| engine / physics / `js/game.js` | the groups `pick-tests` names, capped at two browser groups: run the two most specific, name the rest as not-run in the PR |
| geometry pushed to the deploy branch, or a group this box cannot time | `npm run test:sweeps` when the diff reaches the FLEET build (`tools/ci/geometry-paths.mjs` derives that from `tools/manifest.cjs`'s `TRACK_VM`); a lighting, car, debris-world or driving-line edit needs only its TARGETED suite, which that module names (`--targeted`) and ci.yml and `deploy.mjs` both run for you. Dispatch `ci.yml` with `group: <name>` (one per change) and read the four Smoke jobs. Docs-only pushes start no CI |

Session shape — twelve rules that control wall time, waiting and handoff:

1. Fresh container: the SessionStart hook runs `npm install` and checks for
   `chromium-headless-shell` (fallback `bash tools/env/cloud-agent-install.sh`); either missing reads as a total-red run — read the FIRST failure first.
2. Make ALL source edits first, then verify ONCE: tests serve `js/` and `css/`
   from the working tree, so a run in flight forbids source edits (the edit
   hook blocks them). `test:tooling-fast` is the edit-loop check.
3. THE GATE IS A LADDER, EACH RUNG A SUBSET — green below never means green above:
   `test:guards` (hook-enforced, every commit) ⊂ `test:tooling-fast` (264 of 347 unit files)
   ⊂ `deploy.mjs --gate-only`, the only pre-push check that runs what the deploy runs (pushes nothing, dirty tree fine). The other 83 have taken deploys red three times — `docs/notes/PREPUSH-GATE-LADDER.md`. A commit whose every staged path is prose (`docs/`, `*.md`, skills, agents — no generated doc) runs only `docs-integrity`, and no ratchet raise.
4. BLOCK OR BACKGROUND, by duration and whether the NEXT step needs the answer. Foreground: under 2 min and needed now (`test:guards` ~25 s, one `node --test`, `verify-track`, `pick-tests`). Background, ONE Bash `run_in_background` task with its log in `artifacts/logs/` (one notification when it exits): 2–15 min (`tooling-fast`, `deploy.mjs --gate-only > artifacts/logs/gate.log 2>&1`), and a browser group — `test-bg.mjs <group>`, then `test-bg.mjs --wait --timeout 45` as the task (exit 1 = red, 124 = still running). CI and Pages (minutes to hours): rule 12's active watch — never idle on it, never a sleep loop.
   While it runs, do the next thing that does not touch it: research, docs/tools/tests edits, a read-only subagent, or the NEXT change in a linked worktree (`EnterWorktree`; the edit hook scopes a live run to its own checkout, and shared-contract files stay out of worktrees). Never `js/`/`css/` in this checkout, a second browser group, or a CPU-heavy node suite on top of a browser run — that load IS the timeout. A `Monitor` expires at 30 min: early warning only (`tail -f <log> | grep --line-buffered -E '^= |Error:'`). Never wait on the process table (`pgrep -f` matches its own shell; `docs/notes/TESTING-FIELD-NOTES.md` 2026-09-22); the verdict is rule 5's, never the waiter's. Push once per VERIFIED batch: a push over a live CI run cancels it and its failures are lost (9 of 59 sampled runs).
5. ONE Playwright process, ONE browser group per batch, via `test-bg.mjs`
   (it refuses ANY start at loadavg ≥ 3, and a second concurrent group — tool-enforced).
   Anchor on `grep -E '^= (run (passed|failed|timedout|interrupted)|bg exit)'`, never a
   looser pattern, the process table, or `| tail` on a live log.
6. Stop a run with `node tools/ci/test-bg.mjs --stop`, never by PID (the Bash
   hook blocks it): a bare `kill` orphans every Chromium the run opened.
   `--stop --sweep` recovers a run whose supervisor is already dead.
7. Reap what you launched: before a browser run, a deploy or a timing
   judgement, `ps -eo pid,pcpu,args --sort=-pcpu | head` (`etimes` does not track
   wall clock here); kill a busy Chrome of yours by a listed PID, never `pkill -f`
   (it matches your own shell; blocked). The MCP servers at 0 % are the harness's.
8. A timeout on a busy box measures the machine: check `/proc/loadavg` (< 3) and for a live `playwright test` first; re-run alone only when the verdict matters. On CI, `cancelled` with zero failures is a timeout until proven otherwise — EXCEPT the designed one: a draft PR's run and its `ready_for_review` run share a group on purpose, so marking it ready cancels the fast run on the same `head_sha` seconds in (before 2026-09-24 a branch push and its PR run did). A live sibling on that SHA means dedupe, not a red.
9. Stopping is allowed: a pushed change that names its unverified groups beats an hour of SwiftShader. Never widen a tolerance to make a spec pass; a `waitForFunction` on a rendering page needs `{ polling: 100 }` (`tools/check/wait-polling-lint.mjs`). A pass that needed a retry is a red: name the flaky test in the PR like a not-run group and fix or quarantine it by name; `APEX_FAIL_ON_FLAKY=1` makes the runner fail it.
10. Never hand a subagent a browser run ("report it unverified"; the Bash hook
    blocks it inside one). A worktree starts STALE unless `.claude/settings.json`
    sets `worktree.baseRef: "head"`: `git checkout -B <branch> <session SHA>` first.
11. Never hand-edit a generated file (the edit hook blocks it): `index.html`'s `@gen-shell` blocks, `version.json`, `package.json`'s test scripts (source `tests/groups.json`), `tools/README.md` (source: `@doc` headers), `js/roster.js`, `tools/carview.html`, and the ladder figures in rule 3 / `docs/notes/PREPUSH-GATE-LADDER.md` / `docs/TESTING.md` (source: the same `groups.json`, via `tools/gen/gen-ladder-figures.mjs`). Edit the SOURCE, then `npm run gen` (`gen:check` names drift).
12. HAND OFF THROUGH GIT: commit and push `claude/<topic>` at every verified checkpoint and BEFORE any wait over ~10 min — a reclaimed container loses an unpushed branch, and another agent cannot see it. After the first push open a DRAFT PR into the deploy branch (GitHub MCP, `draft: true`; a topic-branch push starts no CI, a draft gets the fast tier, marking it ready the full tier; `deploy.mjs --pr` is the gated, ready form) and refresh its body at every push from `.github/pull_request_template.md`: Goal, `node tools/ci/session-status.mjs` output, Verified / Not run, Next step. That body IS the session log — no committed per-session doc (it conflicts on a shared branch), no work log in memory. AFTER EVERY PUSH, WATCH IT: arm a `Monitor` on `node tools/ci/ci-watch.mjs --sha <pushed sha> --timeout 30` (one event per job, the failing step and its annotations on a red; re-arm on expiry until the `= ci …` line; add `--pages` after a deploy-branch push), `subscribe_pr_activity` on the PR, and a `send_later` check-in ~1 h out, re-armed until the PR is merged or closed. A red job is work NOW — `ci-red-triage`, fix, push (`steward` skill) — not at the end of the turn, and silence is not green: no `= ci` line means still running. Before starting, read `who-is-on-it.mjs` and the open draft PRs; to continue one, check out its branch and catch it up with `sync-pr.mjs`, never a force-push.

## Seeing the game (cheapest first)
1. `__apex` JSON hooks (`info/probe/physState/world/scene/field`) —
   assertable, deterministic, always the first choice.
2. `render({what:"view"|"map"|"circuit"|"car"})` — the character raster of the
   3D scene. Stale under `headless(true)`; `snapCam()` after `park()`/`jump()`.
3. DOM/a11y snapshot (Playwright MCP `browser_*`, or chrome-devtools) —
   menu/HUD work only; hide `#game`.
4. Pixel screenshot — visual sign-off only, never an assertion source (live
   poking: `mcp-probe`; the suite always runs script-driven).

This container has no real GPU: renderers blit onto `#game-soft` and a probe
waits on `awaitSoftPresent()` (`docs/notes/CI-RENDERING-PERFORMANCE.md`). Never
run Chrome MCP while Playwright runs; a `version.json` check is `deploy-research`.
A unit test of a renderer backend is not evidence that it runs: boot it live and
confirm one positive signal (`docs/ARCHITECTURE.md` §Boot evidence, `.claude/skills/mcp-probe/references/recipes.md`;
each backend's gate is in `.claude/rules/render-wgx.md` / `render-tlx.md`).

## Layout
`js/track/` is the ENGINE, `js/circuits/` is the DATA (one file per circuit;
script-tag order == `Tracks.LIST` == picker order). The module roster and load
order live in `tools/manifest.cjs` — read that, not this file; per-directory tables: `docs/ARCHITECTURE.md`.

- `js/core/log.js` loads FIRST. `js/game.js` is the entry; it hands the `G` façade to
  the extracted modules — one `Module.create(G)` per file, a module never reaches into
  game.js, and `types/game-ctx.d.ts` is the machine-checked contract. `js/agent/apex.js` is `__apex`.
- `js/render/gfx.js` picks TLX (`three/`, default), GLX (`glx/`, explicit WebGL2 and the
  fallback) or opt-in WGX (`webgpu/`); `shared/` is backend-agnostic; TLX and WGX have no
  `<script>` tag (injected from `ApexRoster.DEFERRED`). Only GENERIC tables live in
  `js/track/` (the `scenery(api)` contract is test-frozen; it and `js/circuits/` carry a nested `AGENTS.md`). `index.html` owns ALL static DOM.

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
  their current values — pay for every added line. The commit hook absorbs ≤ 40
  lines of growth (raises, stages, prints — the raise is in your diff); more blocks
  until you extract or raise it with a reason (`tools/check/ratchets.mjs --update`; also
  lowers). The edit hook blocks a hand edit of the file.
- localStorage keys are prefixed `apex26.`. Logging goes through `Log`
  (`js/core/log.js`), never bare `console.*`.
- Coordinates: +Y up, metres, radians, arc `s`, lateral `x` +right; +k = LEFT
  turn (measured). Never flip a curvature sign without a rendered lap.
- Frac-keyed def tables must respect `def._sceneryShift` (consume via
  `bankingProfile` / `buildCenterline`); a raw `frac` read lands 2/3 of a lap away.
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
`assets/pack/`: PBR material arrays, one `TEXTURE_2D_ARRAY` whose layer index
IS the `MAT` id, blended (`albedo * tex.rgb * 2.0`). **Ships ON.** (`matTexMix` def 1.0;
`__apex.matTex(0)` is the A/B off-switch.) Every failure degrades to the procedural
look; boot never awaits assets. GLX, TLX, and WGX implement it. `tools/gen/assets.mjs verify` gates licences.

## `window.__apex` dev API
`docs/DEBUG-HOOKS.md` is the reference and `__apex.agentHelp()` the machine-readable
manifest — call it once a session. `obs()`/`physState()` need `player.px` initialised
(`jump()` or `step()` after `race()`+`go()`). `node tools/shot/agent.mjs <track> <cmd>` is the same surface from a shell.

## Agent extensions (skills / subagents / hooks / MCP)
Available workflows are skills (`.claude/skills/`, index
`.claude/skills/README.md`): they say when and how, and load only when
matched. Subagents (`.claude/agents/`) isolate noisy work; `docs/AGENT-SURFACE.md`
maps which CLIs are wrapped as `apex_*`. Routes: live canvas → `mcp-probe`;
pre-push or deploy → `check-changes` (spawns `verify-agent`; `--base <ref>` is
the "was it already red?" check); live `version.json` → `deploy-research`;
dead code / fat skill → `slim-bloat` and `bloat-auditor`.

WEB RESEARCH IS PART OF DESIGN: before building a tool, a workflow or CI change, or using an API you have not checked this session, read the current docs — `WebSearch` to find them, `WebFetch` to read them (Context7 for library APIs) — and cite the URLs in the commit message, PR body or `docs/notes/`. Training-data memory of a CLI flag, a limit or a default is not evidence. It is the default work while a run is live (rule 4); bulk or post-deploy web reading goes to the `deploy-research` subagent.

Hooks (`.claude/hooks/`, wired by `.claude/settings.json`): `session-start.sh` installs deps and prints the orientation line (also after a compaction); `protect-files.sh` blocks generated-file edits and source edits during a live browser run; `bash-guard.sh` runs the guards before `git commit`, blocks `pkill -f` and PID kills of a test-bg run, and blocks a browser run inside a subagent; `post-edit.sh` (PostToolUse, advisory) says at once when a `js/` edit does not parse, staled a generated file or broke a circuit build;
`stop-guard.sh` nudges once when a turn would end over a live run (`live-run.py` is the one "live in this checkout?" test); `memory-sync.sh` carries auto memory across cloud containers (`docs/notes/AGENT-MEMORY.md`). `touch .claude/allow-protected` lifts every edit rule except the live-run one. Never duplicate skills or agents under `.cursor/`.

## Cursor Cloud specific instructions
`.cursor/environment.json` bootstraps every Cloud VM (`mcpServerAllowlist` = `.mcp.json`'s
servers); Cursor enters via `.cursor/rules/apex-shared.mdc`, Codex via `.codex/config.toml` and
the tracked `.agents/skills/` symlinks (`tools/env/mirror-skills.sh` repairs them). Checklist: `docs/AGENT-SURFACE.md` §Bootstrap.

## Git branch & deploy
Work happens on a `claude/<topic>` branch. The deploy branch is
`claude/f1-game-project-26h3ng`: never push there without review; only it ships
(https://brycejmurrin.github.io/f1-game/). Other sessions develop directly on
it, so a deploy is a merge of THEIR work — re-measure on the merged tree, never
force-push; they also all see one red at once, so before fixing a red you did NOT cause, run `node tools/ci/who-is-on-it.mjs` (recent pushes per branch, who touched the failing paths, live claims; `--claim "<text>"` before you start, `--release` after) and list the host's live sessions when it can: a fix already pushed, a claim, or a session already on it means stand down (`docs/notes/SHARED-BRANCH-COORDINATION.md` — three sessions fixed one bug on 2026-09-18, one revert). Catch a branch up with `node tools/ci/sync-pr.mjs <branch>`, never a hand
merge (ratchets + generated files conflict; it cures both, but leaves you ON `sync-pr-<branch>` and pushes nothing without `--push` — recovery in check-changes). `node tools/ci/deploy.mjs` is the whole protocol (fetch → merge →
`test:tooling-fast` → ci.yml's node suites → `verify-track` → push; it prints the branch's last ci/pages conclusions first, so an INHERITED red is visible before you blame your push; `--pr` opens a PR, `--plan` prints the union, `--gate-only` gates and stops); it cures GENERATED-file conflicts, stops on any
other. Shipping is a RELEASE TRAIN: your push gets `ci.yml`'s FAST tier in
minutes (your verdict) and, if green, pokes `pages.yml`, which gates the tip
once and publishes exactly that commit (dispatch = "deploy now"; ≤ ~25 min).
"Live?" = ancestor of the live `apex-sha` (deploy-research; `docs/TESTING.md` §Release train).

### Watching CI and Pages
`node tools/ci/ci-watch.mjs [--sha S] [--pages] [--once]` is the watcher (rule 12): it polls by `head_sha`, reads the newest run per workflow (so rule 8's dedupe is not a red), and says `= ci none` for a push that starts no run — docs-only, or a topic branch with no PR yet (ci.yml runs on push for the deploy branch only; a DRAFT PR gets the fast tier, a ready one the full tier). Do not conflate PR CI, ship-push CI, and Pages (`pages.yml` `295002043`). Poll by `head_sha`; a green PR does not prove Pages. On red, name the exact test, assertion and lane. Procedure and diagnosis notes: `docs/notes/` (SHARED-BRANCH-COORDINATION, deploy-research). Claim live only after Pages and `version.json` confirm. `deploy.mjs --train` prints the branch's last ci/pages conclusions AND the nightly rota BY JOB (a `cancelled` run hides a FAILED one — that is how a red sat unread for five days); the rota is the only scheduled coverage for the 61 specs `select-specs` never picks.
