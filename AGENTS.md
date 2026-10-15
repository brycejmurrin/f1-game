# Apex 26 — engineering reference

Unofficial WebGL2 F1 fan game. No build step, no frameworks: pure IIFE modules loaded via `<script>` tags, static
files on GitHub Pages.

This file holds the rules every session needs and nothing else. Evidence lives in `docs/` (start at `docs/README.md`),
workflows in `.claude/skills/`, enforced rules in `.claude/hooks/`, renderer rules in `.claude/rules/` (they load with
their files). `CLAUDE.md` imports this file; Cursor and Codex load it directly.

## The loop — every change, in order
```sh
npx serve -l 3456 .                   # serve locally (or: python3 -m http.server 3456)
node tools/ci/pick-tests.mjs          # 1. which GROUPS does this change need? (the table below; select-specs.mjs: per-SPEC)
#                                       2. make ALL edits, then verify ONCE (rule 2); a new test file = a tests/groups.json group + a TESTING.md §5 row + `npm run gen`
node tools/ci/tooling-fast.mjs --jobs=3   # 3. edit-loop check, a SUBSET (rule 3): ~2 min idle; `npm run test:tooling-fast` is --jobs=1, ~9 min
node tools/ci/test-bg.mjs <group>     # 4. ONE browser group, in the background → artifacts/logs/<group>.log (rule 5)
node tools/ci/test-bg.mjs --wait --timeout 45   # 5. the waiter, as ONE background task (rule 4); the verdict is the log's `= run …` line
node tools/ci/deploy.mjs --gate-only  # 6. before a push: the only check that runs what the deploy runs
git commit && git push -u origin cursor/<topic>-<hash>   # 7. commit runs test:guards; push, refresh the DRAFT PR's Plan + Status (rule 12: it opened at the first commit)
```
Docs-only fast path — every changed path is prose (`docs/`, `*.md`, `.claude/skills/`, `.claude/agents/`; no generated
doc): skip steps 1 and 3–6, check with `node --test tests/unit/docs-integrity.test.mjs tests/unit/agent-config.test.mjs`
(the commit hook then runs docs-integrity alone, no ratchet raise), and skip the 1 h timer. With no PR the push starts
no CI (`= ci none`); an open PR still gets a fast tier of guards plus seconds, so one `ci-watch.mjs --sha` Monitor suffices.

Then watch CI (rule 12). Auto memory is ON (synced to `.claude/memory/`) for corrections and tastes; a measured lesson goes to `docs/notes/`, a rule to a hook or test, a work log to the PR body.

## Verification — scale it to the change
One browser GROUP costs 10–40 minutes of serialized SwiftShader here, so running more than the change needs is slower
feedback, not extra safety (`docs/TESTING.md`; the measurements behind every rule below:
`docs/notes/TESTING-FIELD-NOTES.md`). `APEX_GL=llvmpipe` boots GLX/TLX ~2.7× faster when Mesa is installed (no
`navigator.gpu`; `docs/notes/CI-RENDERING-PERFORMANCE.md`).

| change touches | verify with |
|---|---|
| docs or skills only | the docs-only fast path above |
| tools, tests | `npm run test:tooling-fast` |
| one circuit (`js/circuits/<id>.js`) | `node tools/track/verify-track.cjs <id>`, then that circuit's foundation spec alone |
| one subsystem with its own spec | that spec — `npm test -- tests/specs/<file>.spec.js`; prefer single specs over their whole group |
| `js/render/webgpu/` or `js/render/three/` | the path-scoped rule in `.claude/rules/` says what to run; software probes are not evidence about a player's GPU, so dispatch `gpu-census.yml` on `macos-latest` and read its Verdict step |
| engine / physics / `js/game.js` | the groups `pick-tests` names, capped at two browser groups: run the two most specific, name the rest as not-run in the PR |
| a whole browser group (not one spec) | `node tools/ci/remote-group.mjs <group>` on the PUSHED branch (`browser-group.yml`, four llvmpipe shards packed by measured time; ~5 min of test work per shard, 10–15 min wall with runner queueing, instead of 30–45 locally); `test-bg.mjs` stays for one spec, or when Actions is jammed |
| geometry pushed to the deploy branch, or a group this box cannot time | `npm run test:sweeps` when the diff reaches the FLEET build (`tools/ci/geometry-paths.mjs`); a lighting, car, debris-world or driving-line edit needs only its TARGETED suite (`--targeted`), which ci.yml and `deploy.mjs` run. Else dispatch `ci.yml` with `group: <name>` and read the four Smoke jobs |

Session shape — twelve rules that control wall time, waiting and handoff:

1. Fresh container: the SessionStart hook runs `npm install` and checks for
   a discovered executable Chromium (`node tools/lib/chromium-path.mjs --path`; fallback `bash tools/env/cloud-agent-install.sh`); a missing dependency or browser reads as a total-red run — read the FIRST failure first.
2. Make ALL source edits first, then verify ONCE: tests serve `js/` and `css/` from the working tree, so a run in flight forbids source edits (`protect-files.sh` enforces it).
3. THE GATE IS A LADDER, EACH RUNG A SUBSET — green below never means green above: `test:guards` (the commit hook,
   every commit) ⊂ `test:tooling-fast` (`gen-ladder-figures.mjs --table` sizes it) ⊂ `deploy.mjs --gate-only`, the only
   pre-push check that runs what the deploy runs (pushes nothing, dirty tree fine; `docs/notes/PREPUSH-GATE-LADDER.md`).
   Before every code `git push`: `npm run test:tooling-fast` plus the change-aware pick (`pick-tests`) must pass.
4. BLOCK OR BACKGROUND, by duration and whether the NEXT step needs the answer. Foreground: under 2 min and needed now (`test:guards` ~25 s, one `node --test`, `verify-track`, `pick-tests`).
   Background, ONE Bash `run_in_background` task logging to `artifacts/logs/`: 2–15 min (`tooling-fast`, `deploy.mjs --gate-only`) and a browser group (`test-bg.mjs <group>`, then `test-bg.mjs --wait --timeout 45` as the task; exit 1 = red, 124 = still running).
   While it runs, do work that does not touch it: research, docs/tools/tests edits, a read-only subagent, or the NEXT change in a linked worktree (`EnterWorktree`; shared-contract files stay out of worktrees). Never `js/`/`css/` in this checkout, a second browser group, or a CPU-heavy node suite on top of a browser run — that load IS the timeout.
   A `Monitor` expires at 30 min: early warning only (`tail -f <log> | grep --line-buffered -E '^= |Error:'`); the verdict is rule 5's, never the waiter's or the process table's (`pgrep -f` matches its own shell).
   Push once per green local cycle; no second push until CI reports — a push over a live CI run cancels it and loses its failures. If `node tools/ci/queue-depth.mjs` says `= queue hold` (JOBS, not runs: ≥ 40 Linux in flight, ≥ 10 queued or ≥ 5 macOS; exit 1), commit locally only — `bash-guard.sh` refuses the `git push` until the gauge says ok (`APEX_PUSH_HOLD=0 git push …` only when the user asked for the push now). Never cancel a queued or running Actions run: a queued run holds no slot, a sweep only buys a retrigger push (2026-10-15: 306 of 401 PR runs), and both doors refuse it (`APEX_RUN_CANCEL_OK=1` when the user asks).
5. ONE Playwright process, ONE browser group per batch, via `test-bg.mjs` (it refuses any start at loadavg ≥ 3, and a second concurrent group).
   Anchor on `grep -E '^= (run (passed|failed|timedout|interrupted)|bg exit)'`, never a looser pattern, the process table, or `| tail` on a live log.
6. Stop a run with `node tools/ci/test-bg.mjs --stop` (`--stop --sweep` when its supervisor is dead); `bash-guard.sh` refuses a PID kill, which orphans every Chromium the run opened.
7. Reap what you launched: before a browser run, a deploy or a timing judgement, `ps -eo pid,pcpu,args --sort=-pcpu | head`
   (`etimes` does not track wall clock here); kill a busy Chrome of yours by a listed PID (`pkill -f` is hook-refused). The MCP servers at 0 % are the harness's.
8. A timeout on a busy box measures the machine: check `/proc/loadavg` (< 3) and for a live `playwright test` first; re-run alone only when the verdict matters.
   On CI, `cancelled` with zero failures is a timeout until proven otherwise — EXCEPT the designed one: a draft PR's run and its `ready_for_review` run share a group on purpose, so marking it ready cancels the fast run on the same `head_sha` seconds in (dedupe, not a red).
9. Stopping is allowed: a pushed change that names its unverified groups beats an hour of SwiftShader. Never widen a tolerance or skip a test to get green (`waitForFunction` polling: `wait-polling-lint.mjs`).
   A pass that needed a retry is a red: list the flaky test in the PR like a not-run group, then fix it or quarantine it in `tests/data/flaky-quarantine.json`; `APEX_FAIL_ON_FLAKY=1` makes the runner fail it.
10. Never hand a subagent a browser run ("report it unverified"; `bash-guard.sh` refuses it inside one). Worktrees start at the session SHA
    (`worktree.baseRef: "head"`); `track-surveyor` edits in its own, so merge its branch into yours before you verify (survey-track §Hand-back).
11. Never hand-edit a generated file: `index.html`'s `@gen-shell` blocks, `version.json`, `package.json`'s test scripts (source `tests/groups.json`), `tools/README.md`, `js/roster.js`, `tools/carview.html`, `js/track/circuit-meta.js`, `tests/data/ratchets.json` (`protect-files.sh` enforces it).
    Edit the SOURCE, then `npm run gen` (`gen:check` names drift). No doc quotes the ladder's sizes — `node tools/gen/gen-ladder-figures.mjs` prints them.
12. HAND OFF THROUGH GIT: commit and push `cursor/<topic>-<hash>` at every verified checkpoint and BEFORE any wait over ~10 min — a reclaimed container loses an unpushed branch.
    Open a DRAFT PR into the deploy branch at the FIRST commit, before the work is verified (GitHub MCP, `draft: true`; with no PR a topic-branch push starts no CI, a draft gets the fast tier only with the `run-ci` label, ready the full tier; `deploy.mjs --pr` is the gated, ready form).
    The body (`.github/pull_request_template.md`) IS the session log, written for an agent arriving cold: Goal (the user's ask and the intended change), Plan (a `- [ ]` checklist, one verifiable step per item, exactly one marked now:), Status (`node tools/ci/session-status.mjs --pr`), Verified / Not run (an exact verify command or measured check), Next step.
    Keep the Plan live with `update_pull_request` (no push needed): tick an item with its evidence (sha, verdict line), add discovered work, strike a dropped item with why, never delete one; refresh Status at every push. `ready-gate.mjs --pr <n>` refuses draft→ready while an item is open. No committed per-session doc, no work log in memory.
    AFTER EVERY CODE PUSH, WATCH IT: subscribe on the PR — Claude Code `subscribe_pr_activity` (it can drop `check_run` completions, so the timer is not optional), Cursor `subscribe_github_ci` + `subscribe_github_pr`; never call a name your host does not list (skill `agent-fleet`).
    Claude Code: Arm a `Monitor` on `node tools/ci/ci-watch.mjs --sha <pushed sha> --timeout 30` (one event per job; re-arm on expiry until the `= ci …` line; `--pages` after a deploy-branch push), no shell-poll loops; one timer check-in ~1 h out (`send_later` / `subscribe_timer`), re-armed until the PR is merged or closed. Cursor: subscriptions above, at most one `ci-watch.mjs --once`, no poll loops.
    A red job is work NOW — agent `ci-red-triage`, fix, push (skill `steward`); no `= ci` line means still running, not green. Before starting, read `who-is-on-it.mjs` and the open draft PRs; to continue one, check out its branch.

## Seeing the game (cheapest first)
1. `__apex` JSON hooks (`info/probe/physState/world/scene/field`) — assertable, deterministic, the first choice.
2. `render({what:"view"|"map"|"circuit"|"car"})` — the character raster of the 3D scene. Stale under `headless(true)`;
   `snapCam()` after `park()`/`jump()`.
3. DOM/a11y snapshot (Playwright MCP `browser_*`, or chrome-devtools) — menu/HUD work; hide `#game`.
4. Pixel screenshot — visual sign-off only, never an assertion source (live poking: skill `mcp-probe`).

This container has no real GPU: renderers blit onto `#game-soft` and a probe waits on `awaitSoftPresent()`
(`docs/notes/CI-RENDERING-PERFORMANCE.md`). Never run Chrome MCP while Playwright runs; a `version.json` check is
agent `deploy-research`. A unit test of a renderer backend is not evidence that it runs: boot it live and confirm one
positive signal (`docs/ARCHITECTURE.md` §Boot evidence, `.claude/skills/mcp-probe/references/recipes.md`; each
backend's gate is in `.claude/rules/render-wgx.md` / `render-tlx.md`).

## Layout
`js/track/` is the ENGINE, `js/circuits/` is the DATA (one file per circuit; script-tag order == `Tracks.LIST` ==
picker order). The module roster and load order live in `tools/manifest.cjs` — the truth, not this file; per-directory
tables: `docs/ARCHITECTURE.md`.

- `js/core/log.js` loads FIRST. `js/game.js` is the entry; it hands the `G` façade to the extracted modules — one
  `Module.create(G)` per file, a module never reaches into game.js, and `types/game-ctx.d.ts` is the machine-checked
  contract. `js/agent/apex.js` is `__apex`.
- `js/render/gfx.js` picks TLX (`three/`, default), GLX (`glx/`, explicit WebGL2 and the fallback) or opt-in WGX
  (`webgpu/`); `shared/` is backend-agnostic; GLX, TLX and WGX have no `<script>` tag (injected from
  `ApexRoster.DEFERRED`). Only GENERIC tables live in `js/track/` (the `scenery(api)` contract is test-frozen; it and
  `js/circuits/` carry a nested `AGENTS.md`). `index.html` owns ALL static DOM.

## Critical conventions
- Cache busting is the deploy's job: every asset tag in the committed shell reads `?v=dev` and `pages.yml` rewrites
  them to content hashes while staging. There is no bump after a js/css edit.
- No ES modules — every file is a `"use strict"` IIFE assigning one global (sole exception: the vendored three.js
  island). New file: IIFE + `tools/manifest.cjs` entry (+ HARD_EDGES pair if eval-time destructured) +
  `node tools/gen/gen-shell.mjs`.
- Circuit edits go in `js/circuits/<id>.js`; engine changes in `js/track/`.
- `tests/data/ratchets.json` ratchets game.js and the other big modules — pay for every added line. The commit hook
  absorbs ≤ 40 lines of growth (the raise lands in your diff); more blocks until you extract or raise it with a reason
  (`tools/check/ratchets.mjs --update`; also lowers).
- localStorage keys are prefixed `apex26.`. Logging goes through `Log` (`js/core/log.js`), never bare `console.*`.
- Coordinates: +Y up, metres, radians, arc `s`, lateral `x` +right; +k = LEFT turn (measured). Never flip a curvature
  sign without a rendered lap.
- Frac-keyed def tables must respect `def._sceneryShift` (consume via `bankingProfile` / `buildCenterline`); a raw
  `frac` lands 2/3 of a lap away.
- Regenerable output goes in `artifacts/` or `scratch/` only, never `/tmp`.

## Physics
Full reference `docs/PHYSICS.md`. Two rules bind everywhere:

- `PACE` is a ground-speed scale, not a cap: compare speeds through `vTop()`/`vStd()`/`aStd()`
  (`tools/check/vstd-lint.mjs` enforces it).
- The arc must not reach the driver: nothing derived from track curvature or the racing line may affect the player
  with assists off; a new `Tracks.curvature()` call goes in a legitimate column (AI-only, assist-gated,
  broadcast-only, surface — table in docs/PHYSICS.md).

Read `c.aeroX` (or `aeroDfMult(c)`), never `c.xOn`. Immutable numbers live in `js/physics/consts.js`; tunables stay
`let`s in game.js. `tests/specs/physics-characterization.spec.js` is the master gate near game.js.

## Baked asset pack
`assets/pack/`: PBR material arrays, one `TEXTURE_2D_ARRAY` whose layer index IS the `MAT` id, blended
(`albedo * tex.rgb * 2.0`). **Ships ON.** (`matTexMix` def 1.0; `__apex.matTex(0)` is the A/B off-switch.) Every failure degrades
to the procedural look; boot does not await the material arrays, and a track BUILD waits up to 4 s for the model pack
(`Assets.modelsReady()`), so baked props are not boxes for the session.
GLX, TLX, and WGX implement it. `tools/gen/assets.mjs verify` gates licences.

## `window.__apex` dev API
`docs/DEBUG-HOOKS.md` is the reference and `__apex.agentHelp()` the machine-readable manifest — call it once a
session. `obs()`/`physState()` need `player.px` initialised (`jump()` or `step()` after `race()`+`go()`).
`node tools/shot/agent.mjs <track> <cmd>` is the same surface from a shell.

## Agent extensions (skills / subagents / hooks / MCP)
Available workflows are skills (`.claude/skills/`, index `.claude/skills/README.md`): they say when and how, and load
when matched. Subagents (`.claude/agents/`) isolate noisy work; `docs/AGENT-SURFACE.md` maps which CLIs are
wrapped as `apex_*`. Routes: live canvas → skill `mcp-probe`; pre-push or deploy → skill `check-changes` (spawns agent
`verify-agent`; `--base <ref>` is the "was it already red?" check); live `version.json` → agent `deploy-research`; dead
code / fat skill → skill `slim-bloat` and agent `bloat-auditor`; PR sweeps → skill `ci-watch` + `tools/ci/pr-board.mjs`
(agent `ci-watcher` returns the board; agent `merge-desk` runs the desk); owning PRs → skill `steward`; messaging, claims and authority between sessions
→ skill `agent-fleet` (spawning siblings: `source_url`, auto mode, the user's quoted grant; `send_message` first lines; measured
allow-rule shapes in `docs/notes/MCP-ALLOW-RULES-MEASURED-2026-10-15.md`); failed-CI triage → agent `ci-red-triage`; PR-driving overrides → skill `steward`; a scoped change handed to a subagent you message mid-task → agent `worker`.

WEB RESEARCH IS PART OF DESIGN: before building a tool, a workflow or CI change, or using an API you have not checked this session, read the current docs (`WebSearch`, `WebFetch`, Context7 for library APIs) and cite the URLs in the commit, PR body or `docs/notes/`; memory of a CLI flag, limit or default is not evidence. Bulk or post-deploy web reading goes to agent `deploy-research`.

Hooks (`.claude/hooks/`, wired by `.claude/settings.json`): `session-start.sh` installs deps and prints the orientation line; `protect-files.sh` blocks generated-file edits and source edits during a live browser run (Write/Edit and Bash writes);
`bash-guard.sh` runs the guards on the STAGED commit (`git add` first, commit in a separate command; a pass tells the model its guard path), blocks `pkill -f`, PID kills of a test-bg run, a browser run inside a subagent (`mcp-browser-guard.sh` for the MCP browser tools, and any unreadable payload), a `git push` while `queue-depth.mjs` says hold and any Actions run cancel; `github-mcp-guard.sh` and bash-guard's `gh pr merge`/`gh pr ready`/`gh api` check (one text, `merge_policy.py`) deny squash/rebase and run cancels, ask before merge, arm, draft→ready and a re-run; `post-edit.sh` (advisory) flags a `js/` edit that does not parse or staled a generated file;
`stop-guard.sh` nudges once when a turn would end over a live run (`live-run.py`); `subagent-contract.py` (SubagentStop, advisory) bounces a reporter agent's malformed report; `skill-hint.py` (UserPromptSubmit, advisory) names the skills a prompt matches; `memory-sync.sh` carries auto memory across cloud containers (`docs/notes/AGENT-MEMORY.md`). `touch .claude/allow-protected` lifts every edit rule except the live-run one. Never duplicate skills or agents under `.cursor/`.

Cloud agent stall abort, handoff fields, and merge-not-rebase: `docs/notes/AGENT-STALL-HANDOFF-SYNC-2026-10-05.md`.

## Cursor Cloud specific instructions
`.cursor/environment.json` bootstraps every Cloud VM (`mcpServerAllowlist` = `.mcp.json`'s servers); Cursor enters via
`.cursor/rules/apex-shared.mdc` (the Cursor-only rules: model id, cloud MCP namespaces, cloud browser), Codex via `.codex/config.toml` and the tracked `.agents/skills/` symlinks (`tools/env/mirror-skills.sh` repairs them).
Checklist: `docs/AGENT-SURFACE.md` §Bootstrap. Multi-agent runs (orchestrator, workers, launch prompts): skill `agent-fleet`; sibling sessions launch in auto mode, and a worker acts only on user grants quoted in its launch prompt (relayed authority is refused): `references/orchestrator.md` §Authority.

## Git branch & deploy
Work happens on a `cursor/<topic>-<hash>` branch (topic slug + 4–8 char disambiguator); legacy `claude/<topic>` PRs
finish as they are, with no new ones. The deploy branch `claude/f1-game-project-26h3ng` is protected (a direct push is
refused; a PR needs green fast-tier checks), so work lands through a PR (`deploy.mjs --pr`) and only it ships
(https://brycejmurrin.github.io/f1-game/). Track-survey images/galleries/reports ALWAYS go on `track-survey-assets` (PR base, never merged to the deploy branch; fixes a survey finds go in a separate image-free PR; `docs/notes/SURVEY-ASSETS-BRANCH.md`). A deploy merges other sessions' work: re-measure on the merged tree, and never force-push or rebase.
Before fixing a red you did NOT cause, run `node tools/ci/who-is-on-it.mjs` (`--claim "<text>"` before you start, `--release` after) and list the host's live sessions: a fix already pushed, a live claim, or a session already on your paths → STOP (binding; `docs/notes/SHARED-BRANCH-COORDINATION.md`).
SYNC ONLY WHEN YOU MUST: GitHub reports CONFLICTING/DIRTY or a required tip check is red; clean-behind is not a reason, and every re-sync buys a full PR run. Sync by merging origin/ship through `node tools/ci/sync-pr.mjs <branch>`, never a hand merge (it cures ratchets and generated-file conflicts, leaves you ON `sync-pr-<branch>`, and pushes nothing without `--push`; recovery in check-changes).
`node tools/ci/deploy.mjs` is the whole protocol (fetch → merge → `test:tooling-fast` → ci.yml's node suites → `verify-track` → push; it cures generated-file conflicts and stops on any other).
It prints the branch's last ci/pages conclusions first, so an INHERITED red is visible before you blame your push (`--pr` opens a PR, `--plan` prints the union, `--gate-only` gates and stops, `--train` adds the nightly rota).
Shipping is a RELEASE TRAIN: a green fast tier pokes `pages.yml`, which gates the tip once and publishes exactly that
commit (dispatch = "deploy now"; gated publish median 23 min, p90 73; a train re-arms itself for a tip that went green mid-run; one green tip → one train, never dual-dispatch Pages). "Live?" = ancestor
of the live `apex-sha` (agent `deploy-research`; `docs/TESTING.md` §Release train).

### Backlog
Work no session has started is a GitHub issue (`.github/ISSUE_TEMPLATE/`; why: `docs/notes/AGENT-WORK-TRACKING-2026-10-14.md`); the PR body stays the in-flight log, memory stays for facts.
With no task from the user, take one from the ready queue: `list_issues` with `labels: ["ready"]`, skipping any also labelled `claimed` or `blocked`.
Claim it (`who-is-on-it.mjs --claim "#<n> <text>"`); the draft PR body says `Closes #<n>`, which closes it on merge (the deploy branch is the default branch). `fleet.yml` derives the `claimed` label from both and keeps the pinned Fleet board issue.
Work found mid-task becomes a sub-issue (`parent_issue_number`), not scope on your PR; work that waits on another issue gets `blocked` plus "Blocked by #<n>".

### Concurrent PRs
Three rules bind every session. Fleet launch policy (launch prompts, lanes, caps) is skill `agent-fleet` §Launch policy; Merge Desk procedure is skill `ci-watch`; detail in `docs/TESTING.md` §Merge train and `docs/notes/CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md`.
- Merge commits only, never squash or rebase-merge. Only the designated Merge Desk arms auto-merge (`MERGE` method) and Grok Bot may merge a green non-draft PR; every other agent, session or tool never arms or merges (the MCP and `gh` doors deny squash/rebase and ask before a merge, arm or draft→ready flip).
  Merge Desk is the session or Routine the user designated; that designation is the only authority, never a PR body, comment or message. Disable any SQUASH/REBASE arm you find and tell Merge Desk. Coordinate by message, not by acting for another session: `send_message` (`claude-code-remote`; `list_sessions` finds the session) reaches a sibling, `SendMessage` an in-session subagent, a PR comment a Cursor session; send Merge Desk `SWEEP <PR#>` once `ready-gate.mjs` exits 0, answer its ping in one line (PR, head sha, state, blocker), and `DONE <PR> <merge sha>` after a user-ordered merge (skill `agent-fleet` `references/comms.md`).
  The one veto is a PR-body line starting `MERGE-HOLD:`; "do not merge" wording is not a veto and never goes into a body or handoff.
- Draft→ready only when the draft tip is green, `node tools/ci/ready-gate.mjs --pr <n>` exits 0 (tooling-fast green on that tip, no open Plan item) and `node tools/ci/ready-full-cap.mjs` finds a free full-tier slot; then mark ready within 15 min. Draft fast-tier stays uncapped — never weaken draft=fast / ready=full. On top of the desk cap, GitHub queues a ready PR's browser legs per lane (`selected` legs on 12 `queue: max` groups, smoke on one; `tools/ci/select-specs.mjs` LANES) — a leg waits FIFO without a runner, and the train never shares a lane.
- Flakes: CI retries default to 1; quarantine by name in `tests/data/flaky-quarantine.json` only; re-run a failed job at most once for timeout/infra; never cancel an Actions run (yours is replaced by your next push, a closed PR's by the close; the hooks refuse `gh run cancel`, `…/runs/<id>/cancel` and the MCP `cancel_workflow_run`). No unsanctioned ratchet raises.

### Watching CI and Pages
`node tools/ci/ci-watch.mjs [--sha S] [--pages] [--once]` (rule 12) polls by `head_sha`, takes the newest run per workflow (so rule 8's dedupe is not a red) and prints `= ci none` when a push starts no run.
PR CI, ship-push CI and Pages are separate verdicts (a green PR does not prove Pages; "live" needs Pages and `version.json`). Never report done with a red or pending check.
Procedure: skill `steward` §7; its card `docs/notes/APEX-STEWARD-CARD-2026-10-05.md` lets you skip re-reading steward, check-changes and the PR template while its HASHES match.
