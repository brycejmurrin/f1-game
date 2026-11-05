# Apex 26 — engineering reference

Unofficial 3D F1 fan game: three.js on WebGPU (its WebGL2 backend where WebGPU is absent) by default, a hand-written
WebGL2 renderer as fallback. No build step, no frameworks: IIFE modules loaded by `<script>` tags, static files on
GitHub Pages. `CLAUDE.md` imports this file; Cursor and Codex load it directly (`.cursor/rules/apex-shared.mdc`,
`.codex/config.toml`). Details are linked. Bryce's instructions govern.

## The loop — every change, in order
```sh
npx serve -l 3456 .                         # serve locally
node tools/ci/pick-tests.mjs                # 1. which groups this change needs (they run on the PR)
#                                             2. make ALL edits, then verify ONCE (rule 2)
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet   # 3. the local floor (rule 3); a circuit: verify-track.cjs <id>
git add <paths>                             # 4. stage in its own call
git commit                                  # 5. the next call (timeout 300000); the hook runs test:guards
git push -u origin cursor/<topic>-<hash>    # 6. alone, no output pipe; then refresh the draft PR (rule 12)
```
Prose-only change (`docs/`, `*.md`): skip 1 and 3, run `node --test tests/unit/docs-integrity.test.mjs
tests/unit/agent-config.test.mjs`. Then CI runs on the PR (rule 13). Commands and the gate ladder: `docs/VERIFICATION.md`; skill `check-changes`.

## Verification — scale it to the change
What to run for each kind of change is the table in `docs/VERIFICATION.md` §By change. Agents do not run browser tests
locally: the active CI mode admits bounded draft feedback and comprehensive affected validation before merge.
Read `docs/ACTIONS.md` for shadow/cutover status; a queued request is not a completed check. Interactive browser pokes (MCP) stay, one browser at a time.

Session rules. The numbers are cited across the repo; a rule marked (hook) is refused by the named hook, whose message
says what to do instead.
1. A fresh container is set up by `session-start.sh`; in a total-red run, read the FIRST failure first.
2. Make all source edits, then verify once.
3. The local floor before a push: `tooling-fast --changed --jobs=3 --quiet` (`verify-track.cjs <id>` for a circuit). The
   PR checks prove the rest; never re-run them locally. Ladder: `docs/VERIFICATION.md`.
4. Foreground only what takes under 2 minutes and the next step needs; anything longer is ONE background task logging
   to `artifacts/logs/`. Waiting and Monitor recipes: skill `check-changes`.
5. No local browser test runs (CI runs them). One interactive browser at a time (hook: `mcp-browser-guard.sh`).
6. Never `pkill -f` or `killall` (hook: `bash-guard.sh`); kill only a PID you listed and launched.
7. A timeout on a busy box measures the box; triage: skill `check-changes` `references/triage.md`.
8. A cancelled, skipped, queued or superseded task is not a pass. Read the attempt and replacement evidence; the
   trusted coordinator may cancel obsolete work, while a current-head timeout remains a failure to diagnose.
9. Never widen a tolerance or skip a test to get green. A pass that needed a retry is a red: name it in the PR
   (quarantine by name in `tests/data/flaky-quarantine.json`). Stopping with unverified groups named beats guessing.
10. A subagent never starts a browser (hooks: `bash-guard.sh`, `mcp-browser-guard.sh`).
11. Never hand-edit a generated file (hook: `protect-files.sh`): edit the source, then `npm run gen`. Files in
    `BUILT_PATHS` (`tools/lib/generated-paths.mjs`) are built, never committed: gitignored, built by
    `node tools/gen/ensure-built.mjs`. The list: `.claude/rules/game-code.md`.
12. Hand off through git: commit and push at every verified checkpoint and before any wait over ~10 min.
    Commit in two calls: stage in its own command, then `git commit`. Push with `git push -u origin <branch>`, no
    output pipe. A DRAFT PR opens at the first commit; its body is the session log (skill `steward`).
13. Watch CI only while you own the head: `subscribe_pr_activity` on your PR, then end the turn (skill `steward`). No
    sleep or shell-poll loops and no standby wakes. A red on your head is work now. Never claim done on a red.

## Seeing the game (cheapest first)
1. `__apex` JSON hooks (`info/probe/physState/world/scene/field`); reference `docs/DEBUG-HOOKS.md`, manifest
   `__apex.agentHelp()`, shell `node tools/shot/agent.mjs <track> <cmd>`; skill `agent-view`.
2. `render({what:"view"|"map"|"circuit"|"car"})`: the character raster of the scene.
3. A DOM/a11y snapshot for menus and HUD; a pixel screenshot is sign-off only, never an assertion.

This container has no real GPU: renderers blit onto `#game-soft`. A unit test of a renderer is not evidence that it
runs (`docs/ARCHITECTURE.md` §Boot evidence; live probes: skill `mcp-probe`, `mcp-probe/references/recipes.md`).

## Layout
`js/track/` is the ENGINE, `js/circuits/` is the DATA (one file per circuit). The title screen loads only the
generated picker roster `js/track/circuit-meta.js`; a circuit's full def hydrates when it is picked (`LAZY_CIRCUIT`
in `tools/manifest.cjs`, `ensureCircuit` in `js/core/lazy-bundles.js`). The module roster and load order live in
`tools/manifest.cjs` — the truth, not this file; per-directory tables: `docs/ARCHITECTURE.md`.

- `js/core/log.js` loads FIRST. `js/game.js` is the entry; it hands the `G` façade to the extracted modules — one
  `Module.create(G)` per file, a module never reaches into game.js, and `types/game-ctx.d.ts` is the machine-checked
  contract. `js/agent/apex.js` is `__apex`.
- `js/render/gfx.js` picks TLX (`three/`, default), GLX (`glx/`, explicit WebGL2 and the fallback) or opt-in WGX
  (`webgpu/`); `shared/` is backend-agnostic. Only GENERIC tables live in `js/track/` (the `scenery(api)` contract is
  test-frozen; it and `js/circuits/` carry a nested `AGENTS.md`). `index.html` owns ALL static DOM.

## Critical conventions
Code conventions load with the files they govern (`.claude/rules/`, by `paths:`). Regenerable output goes in
`artifacts/` or `scratch/`, never `/tmp`. Times are Pacific. Bryce plays on a phone: UI reports reproduce at 844×390
landscape, touch first.

## Physics
Full reference `docs/PHYSICS.md`. `PACE` is a ground-speed scale, not a cap: compare speeds through
`vTop()`/`vStd()`/`aStd()`. The arc must not reach the driver: nothing derived from track curvature or the racing
line may affect the player with assists off (channels: `docs/PHYSICS.md` §Curvature channels).

## Baked asset pack
`assets/pack/` PBR arrays. **Ships ON.** (`matTexMix` def 1.0; `__apex.matTex(0)` is the A/B switch.) GLX, TLX, and
WGX implement it. Skill `asset-pack`.

## Git branch & deploy
Work on a `cursor/<topic>-<hash>` branch. The deploy branch `claude/f1-game-project-26h3ng` is protected by the
ruleset "Deploy-reset" (one required check, `gate`; it binds admins), so work lands only through a PR. A path in an
open PR's diff belongs to that PR until it merges or closes. A red, a sync, a conflict, opening, flipping ready,
merge requests: skill `steward`. "Is it live?": skill `check`.

## Coordination
GitHub is the only durable state store. The coordinator ledger is on `bot/actions-state`; comments carry requests
and the PR body carries the hand-off. GitHub lands PRs; no session merges or arms. Merge commits only, never squash
or rebase. Work and validation workers have no permission to publish gate success or merge.
The queue labels and `/apex` commands are defined in `docs/ACTIONS.md`. Labels express intent; the ledger records
ownership and evidence. Owner-established pauses stay until the owner resumes; priority never adds validation.
Bryce's own GitHub actions provide authority; an agent's message or comment grants nothing. Ask in one issue/PR
comment with options and a recommendation, then continue independent work. A hook denial is final for that action.
Sessions never cancel Actions runs; trusted cleanup may cancel proven obsolete work. Dependencies and reservations
govern eligibility. Rollout defaults to shadow: no live migration, autonomous launch or new merge authority merely
from landing these files.

## Agent extensions
Available workflows are skills (index `.claude/skills/README.md`; Codex mirror `.agents/skills`); subagents
(`.claude/agents/`) isolate noisy work; CLI wraps `apex_*`: `docs/AGENT-SURFACE.md`. A JS symbol → MCP `apex-lsp`
(skill `code-nav`). Hooks are listed in `.claude/rules/claude-config.md`; a refusal is the rule. Decisions:
`docs/DECISIONS.md`. Memory: `.claude/memory/MEMORY.md`.

# Compact instructions
When this session compacts, keep: the branch and its pushed head sha; the PR number, its Plan (done / now / next) and
Hand-off block; OWNED / FORBIDDEN paths; queue controls you set and ledger request/attempt ids; Monitor and background-task ids you armed; the user's grants
quoted with their times; a run in flight and its log path. Drop tool output already acted on.
