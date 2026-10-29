# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks: pure IIFE modules loaded via `<script>` tags, static
files on GitHub Pages.

The rules every session needs, each with ONE home that other files link to (`tests/unit/rulebook-guards.test.mjs`;
map: `docs/notes/RULEBOOK-REWRITE-2026-10-26.md`). Evidence: `docs/` (start at `docs/VERIFICATION.md`); workflows:
`.claude/skills/`; enforced rules: `.claude/hooks/`; area rules: `.claude/rules/` (by `paths:`). Coordination between
sessions and hosts: `docs/WORKERS.md` (its one home). `CLAUDE.md` imports this file; Cursor and Codex load it directly.
Agent-written drafts: Bryce's word wins.

## The loop — every change, in order
```sh
npx serve -l 3456 .                   # serve locally (or: python3 -m http.server 3456)
node tools/ci/pick-tests.mjs          # 1. which GROUPS does this change need? (the table below; select-specs.mjs: per-SPEC)
#                                       2. make ALL edits, then verify ONCE (rule 2); a new test file = a tests/groups.json group + a TESTING.md §5 row + `npm run gen`
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet   # 3. diff-aware check; with ONE spec it is the pre-push floor (rule 3)
node tools/ci/test-bg.mjs <group>     # 4. optional, Bryce-attended: ONE browser group in the background → artifacts/logs/<group>.log (rule 5)
node tools/ci/test-bg.mjs --wait --timeout 45   # 5. its waiter, as ONE background task (rule 4); the verdict is the log's `= run …` line
node tools/ci/deploy.mjs --gate-only  # 6. optional: the deploy's node suites, to reproduce a gate-only red (rule 3)
git commit && git push -u origin cursor/<topic>-<hash>   # 7. commit runs test:guards; push, refresh the DRAFT PR's Plan + Hand-off (rule 12)
```
Docs-only fast path — every changed path is prose (`docs/`, `*.md`, `.claude/skills/`, `.claude/agents/`; no generated
doc): skip steps 1 and 3–6, check with `node --test tests/unit/docs-integrity.test.mjs tests/unit/agent-config.test.mjs`
(the commit hook then runs docs-integrity alone). With no PR, or a draft without `run-ci`, the push starts no CI
(`= ci none`): add the `run-ci` label; a ready PR gets the full tier.

Then watch CI (rule 13). Memory: `.claude/memory/MEMORY.md`, edited via `node tools/env/apex-memory.mjs list|show|retire`
(docs/notes/AGENT-MEMORY.md). A measured lesson goes to `docs/notes/`, a rule to a hook or test, a work log to the PR body.

## Verification — scale it to the change
A local browser GROUP costs 30–45 minutes of serialized SwiftShader (one dated sample, 2026-09-16), so running more
than the change needs is slower feedback, not extra safety (`docs/TESTING.md`; measurements:
`docs/notes/TESTING-FIELD-NOTES.md`). `APEX_GL=llvmpipe` is a CI-runner speed-up (GLX/TLX ~2.7×, no `navigator.gpu`;
`docs/notes/CI-RENDERING-PERFORMANCE.md`); unproven for Chromium in this container.

| change touches | verify with |
|---|---|
| docs or skills only | the docs-only fast path above |
| tools, tests | `tooling-fast --changed` plus the touched test file; the full suite runs on the PR as `Structural guards` |
| one circuit (`js/circuits/<id>.js`) | `node tools/track/verify-track.cjs <id>`, then that circuit's foundation spec alone |
| one subsystem with its own spec | that spec — `npm test -- tests/specs/<file>.spec.js`, or in the background `node tools/ci/test-bg.mjs --spec tests/specs/<file>.spec.js`; prefer single specs over their whole group |
| `js/render/webgpu/` or `js/render/three/` | the path-scoped rule in `.claude/rules/` says what to run; software probes are not evidence about a player's GPU, so dispatch `gpu-census.yml` on `macos-latest` and read its Verdict step |
| engine / physics / `js/game.js` | the floor (ONE spec locally); the groups `pick-tests` names run on the pushed PR (`run-ci`, or `remote-group.mjs`); name any left unrun as not-run in the PR |
| a whole browser group (not one spec) | `node tools/ci/remote-group.mjs <group>` on the PUSHED branch (`browser-group.yml`, four llvmpipe shards, 10–15 min wall); `test-bg.mjs --spec <file>` stays for one spec, `test-bg.mjs <group>` for when Actions is jammed |
| geometry pushed to the deploy branch, or a group this box cannot time | `npm run test:sweeps` when the diff reaches the FLEET build (`tools/ci/geometry-paths.mjs`); a lighting, car, debris-world or driving-line edit needs only its TARGETED suite (`--targeted`). Else (Bryce-attended: the hooks ask first) dispatch `ci.yml` with `group: <name>` and read the four Smoke jobs |

Session shape — thirteen rules that control wall time, waiting and handoff:

1. Fresh container: the SessionStart hook runs `npm install` and checks for a discovered executable Chromium
   (`node tools/lib/chromium-path.mjs --path`; fallback `bash tools/env/cloud-agent-install.sh`); a missing dependency or browser reads as a total-red run — read the FIRST failure first.
2. Make ALL source edits first, then verify ONCE: tests serve `js/` and `css/` from the working tree, so a run in flight forbids source edits, `index.html` included (`protect-files.sh` enforces it).
3. THE GATE IS A LADDER, EACH RUNG A SUBSET — green below never means green above: `test:guards` (the commit hook) ⊂
   `test:tooling-fast` (`gen-ladder-figures.mjs --table` sizes it) ⊂ `deploy.mjs --gate-only` (the deploy's node half;
   pushes nothing, dirty tree fine; `docs/notes/PREPUSH-GATE-LADDER.md`). THE PRE-PUSH FLOOR (its one home) before a
   code push is `tooling-fast --changed --jobs=3 --quiet` plus the ONE spec `pick-tests`/`select-specs` names, run in
   the background as `test-bg.mjs --spec <file>` (`verify-track` for a circuit; prose: the docs-only fast path). The
   full `test:tooling-fast` runs as `Structural guards` A–D on the train and on a PR touching tools/, tests/, .github/
   or package.json (other PRs: `--changed`), beside the other tiers and the landing gate (`ci.yml`, `browser-group.yml`,
   `land.yml`); `--gate-only` is optional, to reproduce a gate-only red. Never run either in the foreground to prove what CI will prove.
4. BLOCK OR BACKGROUND, by duration and whether the NEXT step needs the answer. Foreground: under 2 min and needed now (`test:guards`, one `node --test`, `verify-track`, `pick-tests`).
   Background, ONE Bash `run_in_background` task logging to `artifacts/logs/`: ~20 min for a full `tooling-fast` (`gen-ladder-figures.mjs --table` sizes it; `--changed` is the edit loop), `deploy.mjs --gate-only`, and a browser group (`test-bg.mjs <group>`, then `test-bg.mjs --wait --timeout 45` as the task; exit 1 = red, 124 = still running).
   While it runs, do work that does not touch it: research, docs/tools/tests edits, a read-only subagent, or the NEXT change in a linked worktree (`EnterWorktree`). Never `js/`/`css/` in this checkout, a second browser group, or a CPU-heavy node suite on top of a browser run — that load IS the timeout.
   A `Monitor` defaults to 5 min and caps at 30 (pass the timeout): early warning only (`tail -f <log> | grep --line-buffered -E '^= |Error:'`); the verdict is rule 5's. A hand-rolled `until ! pgrep` waiter dies with its task: use `node tools/ci/wait-for.mjs --log-matches <log> '^= '`.
   Push once per green local cycle; on a PR a push over a live CI run cancels it and loses its failures. `node tools/ci/queue-depth.mjs` is an informational gauge; nothing holds a push on it. Never cancel an Actions run (§Coordination).
5. ONE Playwright process, ONE browser group per batch, via `test-bg.mjs` (it refuses any start at loadavg ≥ 3, and a second concurrent group).
   Anchor on `grep -E '^= (run (passed|failed|timedout|interrupted)|bg exit)'`, never a looser pattern, the process table, or `| tail` on a live log.
6. Stop a run with `node tools/ci/test-bg.mjs --stop` (`--stop --sweep` when its supervisor is dead); `bash-guard.sh` refuses a PID kill, which orphans every Chromium the run opened.
7. Reap what you launched: before a browser run, a deploy or a timing judgement, `ps -eo pid,pcpu,args --sort=-pcpu | head | cut -c1-160`;
   kill a busy Chrome of yours by a listed PID (`pkill -f` is hook-refused). The MCP servers at 0 % are the harness's.
8. A timeout on a busy box measures the machine: check `/proc/loadavg` (< 3) and for a live `playwright test` first; re-run alone only when the verdict matters.
   On CI, `cancelled` with zero failures is a timeout until proven otherwise — EXCEPT the designed one: a draft PR's run and its `ready_for_review` run share a group on purpose, so marking it ready cancels the fast run on the same `head_sha` seconds in (dedupe, not a red).
9. Stopping is allowed: a pushed change that names its unverified groups beats an hour of SwiftShader. Never widen a tolerance or skip a test to get green (`waitForFunction` polling: `wait-polling-lint.mjs`).
   A pass that needed a retry is a red: list the flaky test in the PR like a not-run group, then fix it or quarantine it in `tests/data/flaky-quarantine.json`; `APEX_FAIL_ON_FLAKY=1` makes the runner fail it.
10. Never hand a subagent a browser run ("report it unverified"; `bash-guard.sh` refuses it inside one). Worktrees start at the parent's CURRENT HEAD
    (`worktree.baseRef: "head"` is HEAD when the worktree is made, not the session's boot sha); `track-surveyor` edits in its own, so merge its branch into yours before you verify (survey-track §Hand-back).
11. Never hand-edit a generated file: the `@gen-shell` blocks of `index.html` and `sw.js`, `version.json`, `package.json`'s test scripts (source `tests/groups.json`), `tools/README.md`, `js/roster.js`, `tools/carview.html`, `js/track/circuit-meta.js`, `CHANGELOG.md` (fragments go in `docs/changelog.d/`), `tests/data/ratchets.json` and `ratchets.d/*.json` (`protect-files.sh` enforces it).
    Edit the SOURCE, then `npm run gen` (`gen:check` names drift). No doc quotes the ladder's sizes — `node tools/gen/gen-ladder-figures.mjs` prints them.
12. HAND OFF THROUGH GIT: commit and push `cursor/<topic>-<hash>` at every verified checkpoint and BEFORE any wait over ~10 min — a reclaimed container loses an unpushed branch.
    Commit in two calls: stage in its own command, then `git commit` in the next. The git pre-commit hook owns `test:guards` for every host and reads the working tree against the commit index; keep them identical. Give the commit call `timeout: 300000`, or run `npm run test:guards` first (a green verdict for that staged tree is reused for 10 min). Never chain an edit or `git add` into the commit call. Push with `git push -u origin <branch>` alone, no output pipe.
    Open a DRAFT PR into the deploy branch at the FIRST commit, before the work is verified (GitHub MCP, `draft: true`, labels and `Closes #<n>` per `docs/WORKERS.md` §2; a draft gets CI only with the `run-ci` label, ready the full tier). Not `deploy.mjs --pr`: it opens a NON-draft PR with no Plan or Hand-off.
    The body (`.github/pull_request_template.md`) IS the session log, written for an agent arriving cold: Goal, Plan (a `- [ ]` checklist, one verifiable step per item, exactly one marked now:), Verified / Not run, and the Hand-off block (`docs/WORKERS.md` §The Hand-off block).
    Keep the Plan live with `update_pull_request` (no push needed): tick an item with its evidence (sha, verdict line), add discovered work, strike a dropped item with why, never delete one; refresh the Hand-off block at every push. The Plan's last item is the template's gate-exempt `- [ ] land: …` line, never a "merge" step. A wait on something outside the PR is a Plan item, never a hold.
13. WATCH CI ONLY WHILE YOU OWN THE HEAD: after a code push, subscribe on the PR (Claude Code `subscribe_pr_activity`) while CI runs on your head. A worker ends its turn at `land` and does not wait out the full tier; its subscription wakes it on PR events until the dispatcher archives it (`docs/WORKERS.md` §5). A `lane:cursor` cloud agent skips this subscribe and the `land` ending (`docs/WORKERS.md` §Per vendor).
    A Bryce-attended session that keeps watching may add a `Monitor` on `node tools/ci/ci-watch.mjs --sha <pushed sha> --timeout 30 --failures-only` (`--pages` after a train) and should call `subscribe_pr_activity` again after a draft→ready flip (it has died at the flip).
    No timers, no shell-poll loops, no standby wakes: a lane ends its turn only once its PR is subscribed (`subscribe_pr_activity`) or handed to its parent, never with a question to the user (unattended: ask `@parent` or label `needs-decision`), and the dispatcher re-owns a PR that falls silent (`docs/WORKERS.md`).
    A ready flip on a dirty PR starts no CI: sync first (`needs-sync.mjs`, `sync-pr.mjs`). `ci-watch.mjs` takes the newest run per workflow (rule 8's dedupe is not a red); a red job on your own head while you still own it is work NOW (agent `ci-red-triage`, fix, push; skill `steward`); no `= ci` line means still running, not green.
    PR CI and Pages are separate verdicts ("live" needs Pages and `version.json`; skill `steward` §7). Never claim done on a red.

## Seeing the game (cheapest first)
1. `__apex` JSON hooks (`info/probe/physState/world/scene/field`) — assertable, deterministic, the first choice.
2. `render({what:"view"|"map"|"circuit"|"car"})` — the character raster of the 3D scene. Stale under `headless(true)`;
   `snapCam()` after `park()`/`jump()`.
3. DOM/a11y snapshot (Playwright MCP `browser_*`, or chrome-devtools) — menu/HUD work; hide `#game`.
4. Pixel screenshot — visual sign-off only, never an assertion source (live poking: skill `mcp-probe`). UI reviews use shipped settings and the touch/mouse profile; procedure in skills `ui-menu-a11y` and `survey-ui-matrix`.

This container has no real GPU: renderers blit onto `#game-soft` and a probe waits on `awaitSoftPresent()`. Never run
Chrome MCP while Playwright runs. A unit test of a renderer backend is not evidence that it runs: boot it live and
confirm one positive signal (`docs/ARCHITECTURE.md` §Boot evidence is the one home; skill `mcp-probe` drives the probe (`.claude/skills/mcp-probe/references/recipes.md`);
each backend's gate is in `.claude/rules/render-wgx.md` / `render-tlx.md`).

## Layout
`js/track/` is the ENGINE, `js/circuits/` is the DATA (one file per circuit). The title screen loads only the
generated picker roster `js/track/circuit-meta.js`; a circuit's full def hydrates when it is picked (`LAZY_CIRCUIT`
in `tools/manifest.cjs`, `ensureCircuit` in `js/core/lazy-bundles.js`). The module roster and load order live in
`tools/manifest.cjs` — the truth, not this file; per-directory tables: `docs/ARCHITECTURE.md`. A named symbol
(`Name`, `Head.member`, `G.x`) → MCP `apex-lsp`, not grep — skill `code-nav`; grep stays for text, comments, CSS.

- `js/core/log.js` loads FIRST. `js/game.js` is the entry; it hands the `G` façade to the extracted modules — one
  `Module.create(G)` per file, a module never reaches into game.js, and `types/game-ctx.d.ts` is the machine-checked
  contract. `js/agent/apex.js` is `__apex`.
- `js/render/gfx.js` picks TLX (`three/`, default), GLX (`glx/`, explicit WebGL2 and the fallback) or opt-in WGX
  (`webgpu/`); `shared/` is backend-agnostic; GLX, TLX and WGX have no `<script>` tag (injected from
  `ApexRoster.DEFERRED`). Only GENERIC tables live in `js/track/` (the `scenery(api)` contract is test-frozen; it and
  `js/circuits/` carry a nested `AGENTS.md`). `index.html` owns ALL static DOM.

## Critical conventions
Coding conventions for `js/`, `css/` and the shell (IIFE globals, cache busting, the size ratchets and the commit hook's
line absorb, coordinates, logging, `_sceneryShift`): `.claude/rules/game-code.md`. Regenerable output goes in `artifacts/` or `scratch/` only, never `/tmp`.

## Physics
Full reference `docs/PHYSICS.md`. `PACE` is a ground-speed scale, not a cap: compare speeds through
`vTop()`/`vStd()`/`aStd()`. The arc must not reach the driver: nothing derived from track curvature or the racing
line may affect the player with assists off (legitimate columns in docs/PHYSICS.md; detail in `game-code.md`).

## Baked asset pack
`assets/pack/`: PBR material arrays, one `TEXTURE_2D_ARRAY` whose layer index IS the `MAT` id, blended
(`albedo * tex.rgb * 2.0`). **Ships ON.** (`matTexMix` def 1.0; `__apex.matTex(0)` is the A/B off-switch.) Every failure degrades
to the procedural look; a track BUILD waits up to 4 s for the model pack (`Assets.modelsReady()`).
GLX, TLX, and WGX implement it. `tools/gen/assets.mjs verify` gates licences.
## `window.__apex` dev API
`docs/DEBUG-HOOKS.md` is the reference and `__apex.agentHelp()` the machine-readable manifest — call it once a
session. `obs()`/`physState()` need `player.px` initialised (`jump()` or `step()` after `race()`+`go()`).
`node tools/shot/agent.mjs <track> <cmd>` is the same surface from a shell.
## Agent extensions (skills / subagents / hooks / MCP)
Available workflows are skills (`.claude/skills/`, index `.claude/skills/README.md`): they say when and how, and load
when matched. Subagents (`.claude/agents/`) isolate noisy work; `docs/AGENT-SURFACE.md` maps which CLIs are
wrapped as `apex_*`. Routes: a JS symbol → skill `code-nav`; live canvas → skill `mcp-probe`; pre-push or deploy →
skill `check-changes` (spawns agent `verify-agent`); live `version.json` → agent `deploy-research`; dead code →
skill `slim-bloat`; fat skill → skill `agent-config`; owning or sweeping PRs → skill `steward` + `tools/ci/pr-board.mjs`; the lane contract,
labels and the dispatcher → `docs/WORKERS.md`; failed-CI triage → agent `ci-red-triage`; a scoped change handed to a
subagent you message mid-task → agent `worker`.

WEB RESEARCH IS PART OF DESIGN: before building a tool, a workflow or CI change, or using an API you have not checked this session, read the current docs (`WebSearch`, `WebFetch`, Context7 for library APIs) and cite the URLs in the commit, PR body or `docs/notes/`; memory of a CLI flag, limit or default is not evidence.

Hooks (full list: `.claude/rules/claude-config.md`): `session-start.sh` installs deps; `protect-files.sh` blocks generated-file
and live-run source edits (`touch .claude/allow-protected` lifts the generated-file rules only); `bash-guard.sh` keeps fast, fail-closed refusals; `.githooks/pre-commit` runs
`test:guards` inside a commit (rule 12) and refuses `pkill -f`, PID kills, run cancels, force pushes and deploy-branch
pushes. Codex runs `.codex/hooks.json` instead: `shell-guard.sh` on every shell call and `mcp-guard.sh` on merge, auto-merge,
PR-update and workflow-dispatch calls (an "ask" there is a deny), plus the git pre-commit guard (the sole `test:guards` owner); the rest is convention.

## Cursor Cloud specific instructions
`.cursor/environment.json` bootstraps every Cloud VM (`mcpServerAllowlist` = `.mcp.json`'s six servers; plugin MCPs use
`mcpPluginServerAllowlist` — `docs/AGENT-SURFACE.md` §Bootstrap); Cursor enters via `.cursor/rules/apex-shared.mdc`,
Codex via `.codex/config.toml` and the tracked `.agents/skills/` symlinks (`tools/env/mirror-skills.sh` repairs them).
Every cloud lane runs in auto mode (contract and labels: `docs/WORKERS.md`).

## Git branch & deploy
Work happens on a `cursor/<topic>-<hash>` branch (topic slug + 4–8 char disambiguator); legacy `claude/<topic>` PRs
finish as they are. The deploy branch `claude/f1-game-project-26h3ng` is protected (ruleset "Deploy-reset": a PR needs its one
required check, `gate`, green; `gate` requires `CI` green on the head), so work lands through a PR and only it ships (https://brycejmurrin.github.io/f1-game/). Never
push to it, force-push or rebase. NEW generated images/reports stay under ignored `artifacts/` or `scratch/`; publish
selected evidence with `node tools/shot/publish-evidence.mjs --dir artifacts/<capture> --label <slug> --publish`
(`docs/EVIDENCE-STORAGE.md`); never merge `track-survey-assets` into the deploy branch (`docs/notes/SURVEY-ASSETS-BRANCH.md`).
A RED YOU DID NOT CAUSE: read `node tools/ci/pr-board.mjs --json` and the Board issue first — the first claimant fixes, the rest wait
(skill `steward` §3); a path in an OPEN PR's diff belongs to that PR until it merges or closes. Sync only when GitHub reports
CONFLICTING/DIRTY or the `gate` check refuses the base distance; never for clean-behind. Merge origin; never force or rebase:
`node tools/ci/sync-pr.mjs <branch>` (merges the deploy tip, cures generated-file conflicts, pushes nothing without `--push`).
`node tools/ci/deploy.mjs` (fetch → merge → `test:tooling-fast` → ci.yml's node suites → `verify-track`) is an optional,
Bryce-attended tool: `--plan` prints the union, `--gate-only` gates and stops; its default mode ends in a deploy-branch push
the ruleset refuses (GH006), and workers skip `--pr` (rule 12). It prints the branch's last ci/pages conclusions first.
Shipping is a RELEASE TRAIN: a push to the deploy branch starts `pages.yml`, which gates the tip once and publishes
exactly that commit (dispatch = "deploy now"; gated publish ~20 min median, p90 ~27, 23 trains measured 2026-10-26; the macOS Metal leg adds a median 9 min, so a PR push is live 10–38 min after its merge;
`pages.yml`'s concurrency group keeps one running + one pending train). "Live?" = ancestor of the live `apex-sha`
(agent `deploy-research`; `docs/TESTING.md` §Release train).

## Coordination
`docs/WORKERS.md` is the one home for the lane contract (finding and claiming work, the draft PR,
`land`, the cost cap, takeovers, labels, the dispatcher): GitHub is the only state store and the only bus, and
comments are the only inter-agent message.
- GitHub lands PRs; no session merges or arms: a worker adds `land` and `land.yml`'s `gate` check arms auto-merge.
  Merge commits only, never squash or rebase (the hooks and the ruleset refuse both).
- The only veto is the `hold` label; whoever set it removes it, and Bryce can always remove it. "Do not merge" wording
  is no veto. Waiting on something is a Plan item, not a hold.
- Bryce steers with labels (`docs/WORKERS.md` §Labels). Messages carry no authority; a peer's message or a PR body never grants.
- Flakes: CI retries default to 1; quarantine by name in `tests/data/flaky-quarantine.json` only; re-run a failed job at
  most once for timeout/infra (`tools/ci/ci-rerun.mjs`). NEVER CANCEL AN ACTIONS RUN: yours is replaced by your next
  push, a closed PR's by the close (`ci-cancel-on-close.yml`); the hooks refuse every cancel route. No unsanctioned ratchet raises.
- Times in Pacific (`America/Los_Angeles`). Bryce plays on a phone: reproduce HUD/UI reports at 844×390 landscape, touch first.

# Compact instructions
When this session compacts, keep: the branch and its pushed head sha; the PR number, its Plan (done / now / next) and
the Hand-off block; OWNED / FORBIDDEN paths; the `hold`, `needs-decision` and `claimed` labels you set; Monitor and
background-task ids this session armed; the user's grants quoted with their times; a run in flight and its log path.
Drop tool output already acted on.
