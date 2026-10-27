# Review fix plan, 2026-10-27

Status: OPEN. Evidence: [notes/review-2026-10-27/](../notes/review-2026-10-27/README.md) (36 Opus skill passes,
8 Opus code hunts, the rulebook review). Six domain reviews (workflows, relay leftovers, agents and hooks, docs, dead
tools, landing design) are still running and add work packages to §5 when they land.

Bryce, 2026-10-27: "make sure we are saving a plan doc with all these review subagents to create a plan to fix all".

## 1. How this plan runs

- Each work package (WP) below is one PR: a draft with `run-ci`, the template's Plan and ```handoff block, then
  ready-gate, ready and `land` (docs/WORKERS.md). Independent WPs go to worker subagents in their own worktrees.
- A finding is a claim to re-check before the fix: the reviewers read code, they did not run the game. Re-read the
  cited lines on the current tip first; a row that no longer holds is struck in the PR's Plan with why.
- Game-code WPs name their tests; a browser group a WP needs but did not run is listed as not-run (AGENTS.md rule 9).
- This file's checklists are the state: tick an item with its PR number, strike one with why. Never delete an item.

## 2. P0 — landing and dispatch safety (before more workers land)

Source: [hunts/hunt-ci-tools-workflows.md](../notes/review-2026-10-27/hunts/hunt-ci-tools-workflows.md).

- [ ] **WP-L1 land.yml trust (HIGH).** On `pull_request` GitHub runs the PR's own copy of `land.yml`; `post` and `arm`
  hold write tokens and `LAND_TOKEN`, so a PR that edits `land.yml` could post `gate` and merge itself. Fix: the gate
  runs from the base branch's workflow (a no-permission `pull_request` relay plus the writes in a `workflow_run`
  job, or `pull_request_target` with no PR checkout), and `.github/workflows/**` gets a CODEOWNERS / ruleset path
  rule. **Needs Bryce's yes** (workflow trust model + a ruleset change). Test: a workflow lint that no job holding a
  write permission runs under `pull_request`.
- [ ] **WP-L2 verdict integrity (MED).** Scripts from the merge result (gen:check, ratchet tests) can leave a detached
  process that rewrites `verdict/<n>.json` before upload. Fix: run them in their own process group and kill it
  before the verdict is written; `post` recomputes the Plan and distance rows itself.
- [ ] **WP-L3 hook doors (MED).** (a) A hand-written merge receipt still passes `merge_policy.py` /
  `github-mcp-guard.sh`: deny every session merge unconditionally (and fix `merge-gate.test.mjs:236`, which asserts
  acceptance). (b) Removing `hold` or `dispatch:merge-pause` is unguarded: classify as ask in `shellparse.py` and the
  MCP guard. (c) The launch receipt is never consumed: bind it to the call or delete it after `create_session`.
  (d) `protect-files` does not cover `.github/workflows/`. **Hook edits need Bryce's yes** (.claude/rules/claude-config.md).
- [x] WP-L4 `gate` as a commit status (#3917, merged): an API-made check run joined an old CI suite and was hidden.
- [ ] **WP-L5 dispatcher children-only** (#3921, open): count and archive only sessions GitHub names; launch comment
  carries the session id; archive 10 min after merge; hunt F5 (open PR read as closed). Then tell the dispatcher.
- [ ] WP-L6 dispatcher leftovers (LOW): rule 4 lacks `archive-sessions.mjs`'s idle / push / in-flight guards (F6);
  `dispatch.json` `mergePause` and `baseBehindMax` do nothing (F7).

## 3. Game bugs (from the hunts)

Medium — one PR each:
- [ ] **WP-G1 track editor start-line stamp** — `js/editor/designer.js:262` `remapZones`: a stamp over a span that wraps
  the start line makes old `pts[j]` the new start, and banking, hills, bridges and props slide about 190 m (a bridge can
  become a red at-grade crossing). Rotate the old loop to the new start before the anchor walk. CONFIRMED (VM).
- [ ] **WP-G2 Mercedes setup defaults** — `js/garage/setup-tune.js:29` (arbF/arbR 7/7) vs the shipped
  `js/data/garage-defaults.js:71` (6/5): an untouched Mercedes is not neutral. Make them agree from one source; test
  every `setup.<team>` default against `SetupTune.defaults(team)`.
- [ ] **WP-G3 spun-car collision feedback** — `js/physics/collide.js:355` `orientedResponse`: a car yawed > 20° gets
  floor-level FX and a 0.15 damage booking for any hit. Gate FX on the pass's real closing via `firstPairFx`.
- [ ] **WP-G4 title-edit drag on iPhone** — `js/ui/title-layout.js:505`: each pointermove writes localStorage and
  re-sets every CSS var on `<html>`. Batch per frame, persist on pointerup (as `hud-arrange.js` does).

Low — batched by area into a few PRs:
- [ ] WP-G5 core/storage: `save-schema-registry.js:38` misses `setupPresets.<team>` (CONFIRMED warning on every save);
  `validateKey` / lane never used at runtime; `restore-points.js:61` rejects a missing or string `v`;
  `setup-presets.js:11` drops a whole preset on any field drift; `career-planning.js:66` copies career constants.
- [ ] WP-G6 perf/runtime: `thermal-drift.js` cooldown 160–200 s vs a documented 60 s (MEASURED); `grip-steer.js`
  per-tick allocation; `visor-optics.js` per-light allocation; `bitmap-decode` dead `decode` path + idle worker;
  `glx.js:740` reload while the tab is hidden; `menu-sheet-gate.js:108` warm never resumes after a door-focused close.
- [ ] WP-G7 UI/CSS: `#tl-handle` 22 px hit area; `#cs-arrival` raw safe-area inset; `hud.js:1029` aero nudge re-fit
  loop; `photo-studio.js:723` upscales small photos; `i18n.js:47` navigator detection and boot race (latent: only en ships).

## 4. Skills — every skill returned FIX

One line per skill: the first step an agent following it today gets wrong (full rows in
[skills/](../notes/review-2026-10-27/skills/)). Batch about six skills per PR, by area.

- [ ] **WP-S1 workflow skills** (ship, steward, check, check-changes, handoff, slim-bloat) — these carry the landing
  contract, so they go first, after WP-R1 settles the wording:
  ship: the `run-ci` opt-in is mandatory (ready-gate has nothing to read without it); a worker stays subscribed after
  `land` until archived. steward: run `needs-sync` before fixing a stale red; the distance row needs
  `sync-pr --force-clean-behind`. check: "green" means `gate` success on the head, not `= ci passed`.
  check-changes: one pre-push floor (AGENTS rule 3), and `verify-change` alone starts a 30–45 min group.
  handoff: point at the PR's handoff block instead of retyping it; no `needs-owner` when the user asked.
  slim-bloat: an over-ceiling branch (the ≤ 40-line absorb, `ratchet-reason.mjs`), and `lsp_outline`, not grep.
- [ ] **WP-S2 debugging skills** (js-debugger, mcp-probe, code-nav, playwright-probe, renderer-debug, agent-view):
  a worked `debugger_break` example (`c.speed`, no `captureLocals`); heap `filePath` per client, never `/tmp`, and
  `await __apex.race()`; the `lsp_symbols` fallback for a `G.x` not on GameCtx; the Monaco tunnel compare is
  `0.47 eye` with `--backend`; on iPhone TLX WebGPU use `?gfxdebug=1` and `backendState().api`; agent-view's one-line
  `agent.mjs <id> track --what all --vm`.
- [ ] **WP-S3 race/AI/physics skills** (ai-racecraft, tune-physics, race-weekend, race-incidents-control, game-feel,
  input-controls): the T1 lunge gate, not `otFireRate`; measure the phone car (`carWeight: 10`); `twoCompoundApplies()`
  and its gates; what `hazards()` counts and when shards drop out; the kerb shake lives in `vantage.js` and
  `rumble()` is muted on kerbs; `hold-buttons.js` also carries the steer arrows.
- [ ] **WP-S4 content skills** (new-track, scenery-dress, survey-track, asset-pack, lighting-tuner, garage-parts-livery):
  append a new circuit LAST, never above an existing id (saved-pick indexes); Spa density uses `forestEdge` and
  exclusions; build the dated evidence packet before a satellite survey; the asphalt bake source is `matHeight`/
  `matSurface`; night lift is `nightAmbLift` (probe `lightState()` without `setTimeOfDay`); new wing looks go in
  `STYLES` and `flapSig`, and say where garage defaults live.
- [ ] **WP-S5 modes/UI skills** (career-mode, season-mode, data-hub, ui-menu-a11y, css-play, survey-ui-matrix):
  `careerSim()` does report sponsor pay and a classified DNF keeps points; the sprint toggle needs APPLY and the
  saved config; a LAST SEASON tag mid-season is a fault, and the cache key includes the year; a disabled door still
  swallows Escape; the pause chips live in `experience.css` / `overlays.css`; the 844 run needs `--shots --dom`.
- [ ] **WP-S6 platform skills** (audio-debug, pwa-cache-service-worker, multiplayer-debug, phone-browser,
  f1-animation-cameras, agent-config): check `GameAudio._stub` before `enabled()`; compare the phone's loaded build,
  not live vs live; a QR pairing is two transfers (the answer must come back); token rotation must stop the old server;
  a seek snap is a designed cut; free routing checks before the paid A/B.

Cross-cutting rules for every skill PR: hard-coded numbers become pointers to their source; `rg` for a JS symbol
becomes apex-lsp; browser runs say `test-bg --spec` or `remote-group`, never a whole local group.

## 5. Rulebook and docs

Source: [rulebook.md](../notes/review-2026-10-27/rulebook.md) (rows already fixed by #3914 are skipped).
- [ ] **WP-R1 one pre-push floor** — AGENTS rule 3 (full `tooling-fast`) vs WORKERS (`--changed` + one spec) vs loop
  step 6 (`deploy.mjs --gate-only`) vs WORKERS ("do not run it"). Pick one, state it once, point the skills at it.
- [ ] **WP-R2 what a worker does after `land`** — WORKERS says the session ends; in practice it stays subscribed and
  wakes on every PR event until the dispatcher archives it (10 min after merge, #3921). Write down what is true.
- [ ] WP-R3 Codex hooks (AGENTS says none run; `.codex/hooks.json` wires two); "a red you did not cause" (AGENTS
  claims-and-fixes vs WORKERS "not yours"); undefined terms (Board/Dispatch issue numbers, "game merges", "FLEET
  build", "OWNED/FORBIDDEN paths"); rules repeated between AGENTS rule 12 / §Coordination and WORKERS.
- [ ] WP-R4…: workflow, relay-leftover, agents/hooks, docs and dead-tool rows — added here when those reports land.

## 6. Decisions for Bryce

1. WP-L1: move the gate to the base branch's workflow (and protect `.github/workflows/**`) — yes / no.
2. WP-L3: hook edits for the merge, hold-label and launch-receipt doors — yes / no.
3. WP-R1: which pre-push floor is the rule.
