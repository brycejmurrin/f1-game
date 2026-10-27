# Review fix plan, 2026-10-27

Status: OPEN. Built from the second, from-scratch Opus pass (R2):
[notes/review-2026-10-27/r2/](../notes/review-2026-10-27/r2/) — 36 skill reviews, 9 code hunts, 6 domain reviews
(workflows, relay/fleet leftovers, agents + hooks, docs, dead tools, landing design). The first pass
([skills/](../notes/review-2026-10-27/skills/), [hunts/](../notes/review-2026-10-27/hunts/),
[rulebook.md](../notes/review-2026-10-27/rulebook.md)) is kept as corroboration: a row both passes found
independently is marked **2×**.

Bryce, 2026-10-27: "make sure we are saving a plan doc with all these review subagents to create a plan to fix all",
then "fully re launch all of our subagents for skills and opus ones from scratch".

## 1. How this plan runs

- Each work package (WP) is one PR: a draft with `run-ci`, the template's Plan and ```handoff block, then ready-gate,
  ready and `land` (docs/WORKERS.md). Independent WPs go to `worker` subagents in their own worktrees.
- A finding is a claim to re-check first: the reviewers read code, they did not run the game. Re-read the cited lines
  on the current tip; a row that no longer holds is struck in the PR's Plan with why.
- Game-code WPs name their tests; a browser group a WP needs but did not run is listed as not-run (AGENTS.md rule 9).
- This file's checklists are the state: tick an item with its PR number, strike one with why. Never delete an item.
- Items marked **Bryce** wait on his yes (workflow trust, hooks, settings, deleting workflows or scheduled tasks).

## 2. P0 — landing, gates and dispatch (before more workers land)

Sources: [r2/landing-design.md](../notes/review-2026-10-27/r2/landing-design.md),
[r2/hunt-ci-tools-workflows.md](../notes/review-2026-10-27/r2/hunt-ci-tools-workflows.md),
[r2/agents-hooks.md](../notes/review-2026-10-27/r2/agents-hooks.md), [r2/workflows.md](../notes/review-2026-10-27/r2/workflows.md).

- [ ] **WP-L1 land.yml trust (CRITICAL, 2×, Bryce).** `land.yml` triggers on plain `pull_request` (checked at the
  deploy tip, line 54), so GitHub runs the PR's OWN copy: a same-repo PR that edits it gets `statuses: write`,
  `contents: write` and `LAND_TOKEN`, can post `gate` = success and merge itself. Any other workflow with
  `statuses: write` can post a `gate` status too. Fix: label/draft/push triggers move to `pull_request_target`
  (resolve/post/arm check out nothing); `LAND_TOKEN` into an Environment limited to the deploy branch; post `gate`
  from a dedicated App and pin the ruleset to it; restrict pushes to `.github/workflows/**`; drop the `check_suite`
  trigger (0 runs in 14 days). Test: a workflow lint that no job with a write permission runs under `pull_request`.
  (The agents-hooks reviewer's "a PR cannot weaken its own gate" is wrong for this trigger.)
- [ ] **WP-L2 verdict integrity (HIGH, 2×).** `verdict/<n>.json` is written in the job that ran the PR's gen:check and
  ratchet scripts; a detached process can rewrite it before upload. `post` re-checks only head/draft/labels/CI. Fix:
  `post` recomputes the Plan and distance rows itself; PR scripts run in their own process group, killed before the
  verdict is written. Also: `setup-node cache: npm` in that leg can poison the deploy branch's cache — no cache there.
- [ ] **WP-L3 land.yml correctness (HIGH/MED).** (a) workflow-level `cancel-in-progress` lets any label event (e.g.
  `needs-owner`) cancel the CI re-gate, leaving `gate` pending on a green PR — scope concurrency to the jobs;
  (b) `write_gate` compares `created_at` (whole s) to `AT` (ns) as strings — compare epoch seconds (:301);
  (c) the `land-tip` group fallback lets one PR's pending re-gate replace another's; (d) the 4-PR train slice is held
  by perpetually refused PRs — skip PRs whose current-head gate already failed; (e) merge-gate's `ci` row accepts any
  check run named `CI` from the Actions app — pin it to ci.yml's run.
- [ ] **WP-L4 hook doors (HIGH, Bryce).** (a) `github-mcp-guard.sh:83-95` lets MCP `merge_pull_request` /
  `enable_pr_auto_merge` through when an `artifacts/merge-gate/<pr>.json` receipt exists, and merge-gate writes none:
  only a hand-written file opens it — deny both outright (the shell door already does); (b) protect-files lets Write
  and Bash reach `artifacts/{merge,ready,launch}-gate/` — block them; (c) the ready receipt is checked with no head,
  so a receipt for head A lets a flip through after an unverified head B (shellparse.py:1650) — pass the live head;
  (d) the launch receipt is never bound to the call or consumed; `launch-gate.py:59` only checks the sha is 64 hex —
  bind to `artifacts/launch/self.json` and make it single-use; (e) removing `hold` is unguarded on every route
  (`gh pr edit`, `gh api -X DELETE`, `gh label delete`, MCP `issue_write`) — classify as ask.
- [x] WP-L5 `gate` as a commit status (#3917, merged).
- [ ] **WP-L6 dispatcher children-only** (#3921): CI green; gate refused on distance (3 behind), synced (fb2c516b);
  then land and tell the dispatcher.
- [ ] **WP-L7 dispatch follow-ups (MED/LOW).** `landProblem` (dispatch.mjs:186) reads check runs only, so a land PR
  whose `gate` status failed parks forever — read `commits/<sha>/status` (2×); stale rule ignores a live worker
  session naming the PR (:282); `--apply` without `--sessions` bypasses `maxLiveWorkers` (:391); two accounts can both
  launch for one issue (claim posted after launch); `mergePause` / `baseBehindMax` do nothing.
  **Label clobber (reported by the dispatcher, 2026-10-27):** the worker prompt's "add `claimed`" leads workers to
  MCP `issue_write` with `labels`, which REPLACES the list — #3263–#3267 lost `bug` / `area:ui` (restored by hand). The
  dispatch.mjs brief and docs/WORKERS.md say add it with `gh api POST issues/<n>/labels`, never `issue_write` labels.
- [ ] **WP-L9 workers stall waiting for the user** (Bryce, 2026-10-27: "they are sometimes getting stuck waiting for
  user instead of asking you or dispatcher message them and set this up"; evidence
  [r2/worker-stalls.md](../notes/review-2026-10-27/r2/worker-stalls.md)). Bryce unblocked 5 of 8 children by typing
  into them. Causes: STOP AT 150k leaves ~57k of work after a ~93k first request; last turns addressed to "you";
  ending on CI without a working subscription; no "already fixed" exit; the dispatcher never messages a child.
  Fix (in the WP-L7 dispatch PR): brief rules (never ask the user, decide or `needs-decision` or `@parent`; subscribe
  before ending; `@parent` at the cap; close-as-fixed exit), cap 300k, `NUDGE_SESSION` lines for BLOCKED / idle
  children with open work, immediate takeover when a worker adds its own `needs-owner`; AGENTS rule 13 wording (in
  the WP-R1 PR). Interim: the dispatcher was asked to nudge children by hand each cycle.
- [ ] WP-L8 small gate fixes: ready-gate's shard fallback accepts A+B of four (:68); archive-sessions checks only
  `session_status` (reuse dispatch's `archiveGuard`) — or delete it, see WP-D2.

## 3. Game bugs (from the hunts; nothing measured unless noted)

Medium — one PR each:
- [ ] **WP-G1 track editor** — `designer.js:262` start-line stamp shifts banking/hills/props ~190 m (R1, CONFIRMED in
  a VM); `validate.js:217-231` pit-opening check runs over every close pair on the lap, so parallel hairpin straights
  anywhere get a RED that blocks SAVE/RACE/SHARE — gate it on the pit window and side; `validate.js:228-233` the first
  matching pair masks a farther red.
- [x] ~~**WP-G2 Mercedes setup defaults (2×)** — `setup-tune.js:30` arbF/arbR 7/7 vs `garage-defaults.js:71` 6/5: a fresh
  install shows TUNED and reset cannot clear it.~~ Intended, no change: the 6/5 is Bryce's deliberate tune (d0721f0530),
  pinned by `garage-defaults.test.mjs:389` (asserts `isDefault("mercedes") === false`); `setup-tune.test.mjs:131` pins
  reset() to the shipped sheet (#1289).
- [ ] **WP-G3 career import with no undo** — `career-backup.js:610` the before-import restore point is not awaited;
  with IndexedDB down the import overwrites the slot anyway (the restore path refuses in that case).
- [ ] **WP-G4 weekend marked started too early** — `game.js:2487` `Career.markWeekendStarted()` runs before
  `ensureRaceSession`, the conflict and `canRace` checks; a failed load + BACK locks the brief and escrows planning.
- [ ] WP-G5 spun-car collision feedback — `collide.js:355` a car yawed > 20° gets floor FX + 0.15 damage for any hit (R1).
- [ ] WP-G6 title-edit drag on iPhone — `title-layout.js:505` localStorage + every CSS var per pointermove (R1);
  `#tl-handle` 22 px hit area, no pinch (2×).

Low — batched by area:
- [ ] WP-G7 core/i18n/storage: `dom-apply.js:44` set("en") never restores; `i18n.js:218` no generation token;
  `i18n.js:260` double apply; dead exports (`parkedWarm`, `applyNode`, `shouldApply`, `I18n.dir`, game.js:5796 guard);
  `save-schema-registry.js:38` setupPresets warning (R1); restore-points `v` / "import" reason / re-validate cost;
  `setup-presets.js` drops presets; share link mangled by `text()`.
- [ ] WP-G8 perf/runtime: `thermal-drift.js` cooldown ~130 s vs documented 60 s (2×); `wheel-state.js:192` closures
  per tick; `player-forces.js:190` flatSpot/rumble use the heuristic lock under WheelState; `sheet-shape.js:650`
  rotation re-measures ~13×; `xr-session.js:258` late attach from a cancelled session.
- [ ] WP-G9 render: `compatibility-recovery.js:52` DETAILS re-raises the popover; `tlx.js:4475` `_sizeOwned` drops a
  resize; `tlx.js:1070` / `wgx.js:845` reload listener never removed; `glx.js:740` reload while hidden (R1).
- [ ] WP-G10 dead shell loads: `js/render/shared/puddles.js` and `js/overlay/render.js` load every boot with no game
  caller — move out of the shell list in `tools/manifest.cjs`, `npm run gen`.

## 4. Skills — all 36 returned FIX in both passes

One line per skill: the first step an agent following it today gets wrong (full rows in
[r2/](../notes/review-2026-10-27/r2/)). About six skills per PR. Cross-cutting rules for every skill PR:
- a browser spec runs as `test-bg.mjs --spec` (or `remote-group.mjs` for a group), never foreground `npm test --` or a
  whole local group (seen in data-hub, game-feel, race-weekend, race-incidents, garage, survey-track, check-changes);
- a JS symbol goes to apex-lsp, not `grep -n`/`rg` (slim-bloat, f1-animation-cameras, physics-contract-auditor);
- hard-coded numbers become pointers; no `/tmp` evidence paths; no hand-rolled `until` waiters (`wait-for.mjs`).

- [ ] **WP-S1 landing skills** (ship, steward, check, check-changes, handoff, slim-bloat) — after WP-R1:
  ship: `run-ci` is mandatory (ready-gate has nothing to read without it), add the CI watch, the session does not end
  at `land` (rule 13), `gate` is a status. steward: run `needs-sync` before fixing a red; the `distance` row and
  `sync-pr --force-clean-behind`. check: green = `CI` + `gate` success on the head; liveness via `deploy-research`;
  a merged PR. check-changes: lead with `verify-change --fast` + one `test-bg --spec` (bare verify-change starts a
  30–45 min group). handoff: `needs-owner` does not skip the 2 h wait (the label bumps `updated_at`); add the adopt
  step. slim-bloat: an over-ceiling branch (20/40-line absorb in `ratchet-reason.mjs`, `--lower-only` skips a carve
  still over), `lsp_outline` for ranges; do-not.md's garage example is stale.
- [ ] **WP-S2 debugging skills** (js-debugger, mcp-probe, code-nav, playwright-probe, renderer-debug, agent-view):
  a condition runs in the paused frame and a throwing one never pauses (`c.human && c.speed > …`, m/s); `await
  __apex.race()` then `jump()`/`step()` before `physState()`, heap paths under `artifacts/`; an IIFE-local route for
  `updateCar` (not on GameCtx) and the façade-miss hint in lsp-mcp.mjs:936; Monaco tunnel is `0.47 eye`, delete the
  stray fence at recipes.md:182; `?gfxdebug=1` first on the iPhone, the census is Chromium/Dawn not Safari, link the
  WGSL rules from TLX; `corners()` peaks are not the official corner list.
- [ ] **WP-S3 race/AI/physics skills** (ai-racecraft, tune-physics, race-weekend, race-incidents-control, game-feel,
  input-controls): the T1 lunge gate, not `otFireRate`; measure the phone car (`carWeight: 10`) and pick rows by vStd,
  defaults live in `drive-tune.js`; `G.pits.twoCompoundApplies()` and its `enabled()` / `cmpOn` gates; `hazards()`
  counts only resting on-road debris, shards despawn 4 s after settling; kerb audio is the continuous kerb loop
  (`rumble()` returns while `kerbLive`) and shake is zeroed by touch comfort mode; touch release nets live in
  `input.js:2237-2299`, `__apex.inputState()`, DRAG AT SPEED defaults OFF.
- [ ] **WP-S4 content skills** (new-track, scenery-dress, survey-track, asset-pack, lighting-tuner, garage-parts-livery):
  a new circuit needs `js/circuits/scenery/<id>.js` and a `def-factory-golden.json` row, append last; forestEdge
  footing and `dressingExclusions` (spa.js:650), `recordBarrier` not `markBarrier`; build the evidence packet in the
  short loop and pass absolute paths to the surveyor's worktree; texture path is `matTexLayer`, not `lgRoad`;
  measure `lightState()` first, Singapore inherits `nightAmbLift` 1.45 from the shared stamp; front-wing looks are
  `STYLES` rows + `VISUAL_FIELD_REGISTRY`, gate with `npm run test:garage-unit`. js/circuits/AGENTS.md still talks
  about script-tag order and a "lockstep".
- [ ] **WP-S5 modes/UI skills** (career-mode, season-mode, data-hub, ui-menu-a11y, css-play, survey-ui-matrix):
  a classified late DNF can score; APPLY + the frozen `activeCfg`; LAST SEASON mid-season is a bug, not a fallback;
  Escape-does-nothing causes in modal.js:144-178 (a missing/disabled door swallows it); pause chips live in
  `experience.css` / `overlays.css`, a later layer wins; `apex_ui_mission_plan` is not a matrix planner, the 844 cell
  needs `--shots --dom`, setup at 844×390 not 852×393.
- [ ] **WP-S6 platform skills** (audio-debug, pwa-cache-service-worker, multiplayer-debug, phone-browser,
  f1-animation-cameras, agent-config): `audioGestureUnlock` / `AUDIO_GESTURES`; compare the phone's booted build,
  not live vs live, and `UpdateCheck` is the path an installed PWA uses; the default is STUN-only (no TURN), so
  relay-only e2e needs `--turn`; token rotation does not restart the server and the tunnel cannot leave this proxy;
  HIGHLIGHTS seek is a designed cut (`seekTo` → `snapGameCam`), the probe needs a reel mode; agent-config byte vs line
  caps.

## 5. Rulebook, docs, tools and workflows

Sources: [r2/docs.md](../notes/review-2026-10-27/r2/docs.md), [r2/relay-fleet.md](../notes/review-2026-10-27/r2/relay-fleet.md),
[r2/dead-tools.md](../notes/review-2026-10-27/r2/dead-tools.md), [r2/workflows.md](../notes/review-2026-10-27/r2/workflows.md),
[rulebook.md](../notes/review-2026-10-27/rulebook.md).

- [ ] **WP-R1 one pre-push floor (Bryce picks).** Four sources disagree (2×, three reviewers): AGENTS step 6
  (`deploy --gate-only`), AGENTS rule 3 (full `tooling-fast` + pick), VERIFICATION.md:38 / ARCHITECTURE-MAP
  ("`--gate-only` is authoritative"), WORKERS.md:17 (`tooling-fast --changed` + one spec, "do not run `--gate-only`").
  State it once, point everything else at it.
- [ ] WP-R2 what a worker does after `land`: it stays subscribed until the dispatcher archives it (10 min after merge).
- [ ] WP-R3 rulebook drift: Codex hooks (AGENTS.md:147 says none; `.codex/hooks.json` wires two); TESTING.md §Merge
  train and §CI aggregator describe the retired flow; BUGS.md "sibling sessions"; ARCHITECTURE-MAP "every ratchet
  saturated" (7 of 14); `game-code.md:18` absorb wording (20 silent, 40 with a trailer); AGENTS.md:187 says the
  dispatcher uses archive-sessions.
- [ ] WP-R4 docs index: 97 of 204 notes and 22 of 42 plans are unindexed (incl. AGENT-MEMORY.md, SURVEY-ASSETS-BRANCH.md
  that AGENTS.md cites); archive ~15 shipped/superseded plans and the 7 redirect stubs; merge CAPTURE-REVIEW +
  UI-EXPLORER into DESIGN-TOOLS; UI-MAP is historical.
- [ ] **WP-D1 fleet leftovers.** The f1-dev-tools plugin skill still teaches the `claude/fleet-bus` branch and
  `github-fleet.cjs`; widen `rulebook-guards.test.mjs` to scan plugin-sources, cursor-plugins, `.cursor`, `.codex`;
  stale hook text ("ask your orchestrator", `QUEUE_BRANCH`, `fleet-bus` in the poll regex, `APEX_MERGE_DESK`) —
  hook edits need Bryce; `APEX-TOOLS-MCP.md` `apex_who_is_on_it`; `policies.json:747`; `ci-watch.mjs:323`.
- [ ] **WP-D2 dead tools** (each with its `tests/groups.json` row + `npm run gen`): `tools/mcp/check-doctor-catalog.mjs`;
  `archive-sessions.mjs` (+ AGENTS.md:187, settings.json:74 — Bryce); `pr-body.mjs` + `fleet-block.mjs` (move the 3
  `planVerdict` cases to ready-gate's test first); `lane-preamble.mjs`; `measure-pr-ci-after-close.mjs`;
  `publish-shots.mjs`; `lsp-navigation-bench.mjs`; `readyClaimVerdict` in gate-receipt.mjs. Fix headers:
  `queue-depth.mjs` (not a hold), `launch-gate.mjs` (orchestrator.md). Bryce decides: the workflow-harness trio,
  `visor-lab-export.mjs`.
- [ ] **WP-W1 workflows (Bryce for deletes).** Delete never-run `hud-survey.yml` and `webkit-leg.yml` (+ their rows in
  pick-tests / select-specs / nightly-group); gpu-census and capture-gallery become dispatch-only (agents dispatch
  fine; renderer-debug SKILL.md:18 still teaches the push relay); car-shot into capture-gallery; import-models gets a
  read-only bake job (it downloads an arbitrary URL with `contents: write`); process-dashboard dispatch-only or
  delete; ratchets-fold + changelog-fold → one `folds.yml`; spec-timings needs a conclusion filter (77 s on each of
  371 cancelled Pages runs); `ci.yml`'s `edited` trigger makes every Plan update a "CI ignored" run (41 % of sampled
  PR runs). Bryce runs `gh workflow disable` on the ghost registrations docs-guards, iphone-census, wire-select-specs.
- [ ] WP-A1 agents: `agent-surface-reviewer` maxTurns 30 → 45 with a "write by turn 25" rule; `worker.md:143` (`hold`
  is a land veto, not a push block); `deploy-research` mentions TinyFish it lacks; code-hunter / finding-verifier /
  bloat-auditor lack `lsp_symbols`; bash-guard does not stop a subagent running fit-audit / menu-fit / explorer.

## 6. Outside the repo (Bryce)

- [ ] Scheduled task "Backlog check-in #1518" (`trig_01LVTyhcecvVX9deFigKWDEt`) fires 2026-10-28 16:00Z with a fleet-era
  prompt (fleet.yml, Fleet board) — delete or rewrite from its own conversation.
- [ ] The disabled cross-account "Fleet B inbox → B·R1" task still holds an API token — delete it or revoke the token.
- [ ] Remote branches `claude/fleet-bus` and 26 `cursor/orcha*-queue-*` can go; old orchestrator / merge-desk sessions
  need a manual archive (archive-sessions never matched their roles).

## 7. Decisions (Bryce delegated them, 2026-10-27: "You consider the options and make the best decisions")

1. WP-L1: YES — land.yml moves to `pull_request_target` in code. Left for Bryce in repo settings (not code): an
   Environment holding `LAND_TOKEN` limited to the deploy branch, and a push restriction on `.github/workflows/**`.
2. WP-L4 / WP-D1: YES — the hook edits (merge and arm deny, receipt directories, ready head, single-use launch receipt,
   `hold` removal as ask, stale orchestrator text). This sentence is the grant `.claude/rules/claude-config.md` asks for.
3. WP-R1: the pre-push floor is `tooling-fast --changed` plus the one spec `pick-tests` names, as a background
   `test-bg --spec`. The full `tooling-fast` runs on the PR (Structural guards A–D); `deploy --gate-only` is optional,
   for reproducing a gate-only red. One home: AGENTS.md rule 3.
4. WP-W1 / WP-D2: YES — delete the never-run workflows and the dead tools; gpu-census and capture-gallery become
   dispatch-only. `archive-sessions.mjs` waits for the dispatch PRs (it touches `.claude/settings.json`).
5. §6: "Backlog check-in #1518" was rewritten for the current flow (fires 2026-10-28 16:00Z). Deleting the
   "Fleet B inbox" relay task was refused by the session's auto-mode classifier; it is disabled — Bryce deletes it.
