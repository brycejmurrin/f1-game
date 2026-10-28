# Skill review — all 36 skills, one Haiku reviewer each (2026-10-28)

Bryce asked for Haiku subagents to invoke and review every skill in batches, with attention to frontmatter and to
what should be improved or removed. Each skill got one reviewer, in three batches of 12. Batches 1–2 used
`general-purpose` with Skill invocation; batch 3 used `agent-surface-reviewer`, which has no MCP tools. Criteria:
- F1 frontmatter: use case first, triggers, ≤ 1,536 chars, "Not X → skill" routing.
- F2 body: under 500 lines, no restated AGENTS.md rules, no dated history.
- F3 references: linked one level deep with a read-when cue, no orphans, cross-skill links carry the skill path.
- F4 commands: the commands named in the body exist.
- F5 overlap with other skills.

The per-skill reports were written to the gitignored `scratch/skill-review/<skill>.md` and were not committed. The
research behind the criteria is in [skills](AGENT-RESEARCH-2026-10-28-SKILLS.md),
[orchestration](AGENT-RESEARCH-2026-10-28-ORCHESTRATION.md) and [CI/CD](AGENT-RESEARCH-2026-10-28-CICD.md)
(subagent reports, copied verbatim).

**Verdicts: 0 REMOVE, 0 MERGE, 3 KEEP, 33 IMPROVE.** Every skill has a distinct job; no reviewer found a skill
whose triggers another skill fully covers. Nothing in this note is applied: each row is a PROPOSAL.

## Cross-cutting patterns (fix once, everywhere)

| pattern | skills | proposed fix |
|---|---|---|
| Routing tail in arrow form ("X → skill") rather than "Not X → skill" (agent-config's own rule) | agent-config, new-track, playwright-probe, race-incidents-control, race-weekend, season-mode, scenery-dress, slim-bloat, steward, survey-track, survey-ui-matrix, tune-physics, ui-menu-a11y, renderer-debug, handoff, ship, multiplayer-debug, pwa-cache-service-worker, game-feel | One sweep PR. Pin the form in `tests/unit/agent-config.test.mjs` so it cannot drift back. |
| Restated AGENTS.md rules ("a subagent reports it unverified" = rule 10; rules 4/5/7; §Physics; §Layout; §Coordination) | code-nav, ai-racecraft, input-controls, game-feel, new-track, playwright-probe, race-weekend, season-mode, scenery-dress, ship, steward, tune-physics, renderer-debug, css-play, handoff | Replace each with a one-line pointer. |
| A link into another skill's `references/` without that skill's path (broken relative link) | f1-animation-cameras (`cameras.md`), garage-parts-livery (`car-studio.md`), data-hub (`state.md`, `replay.md`), lighting-tuner | Use the full `../<skill>/references/<file>.md` path. A guard can check that every relative link in a SKILL.md resolves. |
| Dated history or "folded from the X skill" provenance in references | agent-view (`state.md:1`), check-changes (`triage.md`, `bump.md`, `deploy.md`, `guards.md`, `sync-pr.md`), css-play, input-controls, playwright-probe (`motion-capture.md:28`), scenery-dress (`rules.md:21,88`), slim-bloat, survey-ui-matrix, renderer-debug, season-mode, multiplayer-debug | Delete the provenance; move measurements to `docs/notes/`. |
| Placeholder or missing read-when cues | mcp-probe (4 refs say "this recipe family is the narrowest match"), data-hub, ai-racecraft (`pace.md`), asset-pack, lighting-tuner (scripts: run vs read) | Write a specific "Read when …" line for each. |

## Per-skill table

desc = description chars (cap 1,536); body = SKILL.md body lines (target < 500); refs = files in `references/`.

| skill | desc | body | refs | verdict | top proposal |
|---|---|---|---|---|---|
| agent-config | 229 | 86 | 0 | IMPROVE | "Code or docs bloat → slim-bloat" → "Not code or docs bloat → slim-bloat"; side finding: `.claude/agents/agent-surface-reviewer.md:6` sets `is_background`, which the skill calls Cursor-only |
| agent-view | 402 | 58 | 4 | IMPROVE | TL;DR paragraph → numbered loop checklist; drop the stale "(folded from the debug-state skill)" |
| ai-racecraft | 395 | 122 | 3 | IMPROVE | read-when cue for `references/pace.md`; link the curvature rule |
| asset-pack | 324 | 66 | 1 | IMPROVE | move glTF/procedural-room authoring out of the description and body (out of scope) |
| audio-debug | 386 | 67 | 1 | KEEP | optional: a 3-step first-check order |
| career-mode | 336 | 81 | 2 | IMPROVE | route quali/results sheets outside a career save to race-weekend |
| check | 172 | 47 | 0 | KEEP | "Green" wording: `= ci` passed AND `gate` success (SKILL.md:21 vs :15) |
| check-changes | 222 | 94 | 7 | IMPROVE | strip dated provenance from 5 references; route PR status to `check` |
| code-nav | 217 | 86 | 1 | IMPROVE | drop the duplicated output-gateway paragraph; add "instead of grep" and "rename" triggers |
| css-play | 246 | 96 | 3 | IMPROVE | cache-bump paragraph → a link to check-changes `bump.md` |
| data-hub | 374 | 72 | 2 | IMPROVE | `state.md` / `replay.md` live in other skills: full paths |
| f1-animation-cameras | 365 | 22 | 5 | IMPROVE | broken `references/cameras.md` → `../playwright-probe/references/cameras.md`; seek-snap text repeated in 3 places |
| game-feel | 305 | 62 | 2 | IMPROVE | add "not silent/broken audio → audio-debug" |
| garage-parts-livery | 282 | 100 | 7 | IMPROVE | broken `car-studio.md` link → playwright-probe path |
| handoff | 193 | 47 | 0 | IMPROVE | add routing; Hand-off and compact lists → links to WORKERS.md / AGENTS.md |
| input-controls | 441 | 121 | 2 | IMPROVE | link rule 10; delete "Moved out of SKILL.md on 2026-10-26" |
| js-debugger | 290 | 117 | 2 | IMPROVE | collapse the paragraph that repeats the description; evidence path `artifacts/` vs `scratch/debug-incidents` |
| lighting-tuner | 356 | 126 | 3 | IMPROVE | drop the hard-coded `nightAmbLift: 1.45` (goes stale); run-vs-read cues for `scripts/*.mjs` |
| mcp-probe | 365 | 116 | 12 | IMPROVE | description promises "private chat MCP startup … catalog contracts" that the body does not deliver; 4 placeholder cues |
| multiplayer-debug | 207 | 106 | 2 | IMPROVE | add routing; one copy of the "measured dead" note |
| new-track | 300 | 44 | 3 | IMPROVE | link AGENTS.md §Layout instead of restating it |
| phone-browser | 252 | 68 | 1 | KEEP | rule numbers 5, 7, 10; "deploy-research agent" |
| playwright-probe | 316 | 126 | 7 | IMPROVE | name each routing target; move "Measured 2026-09-30" to notes |
| pwa-cache-service-worker | 222 | 88 | 2 | IMPROVE | add the literal "service worker" trigger and a 4-step workflow |
| race-incidents-control | 435 | 97 | 2 | IMPROVE | routing form. (Its claim that `__apex.net()` does not exist is REFUTED: `js/agent/apex-net.js:15`) |
| race-weekend | 318 | 84 | 0 | IMPROVE | route career quali/DNF money → career-mode; link §Verification |
| renderer-debug | 318 | 137 | 7 | IMPROVE | routing form; add "blank"/"iPhone black screen"; dated lines in `wgx*.md`; off-topic `chrome-devtools-perf.md` link |
| scenery-dress | 316 | 79 | 3 | IMPROVE | "floodlights" collides with lighting-tuner → "floodlight masts" |
| season-mode | 288 | 123 | 1 | IMPROVE | routing form; drop the dated "venues were still pending" |
| ship | 128 | 36 | 0 | IMPROVE | add routing (steward / check-changes / handoff); keep it model-invocable (workers call it) |
| slim-bloat | 277 | 72 | 2 | IMPROVE | "too much context" collides with handoff's trigger |
| steward | 186 | 170 | 1 | IMPROVE | §12 duplicates skill ship → one pointer; add routing and user-typed triggers |
| survey-track | 326 | 129 | 5 | IMPROVE | replace the restated track-surveyor steps with a pointer |
| survey-ui-matrix | 319 | 132 | 4 | IMPROVE | `menu-fit.mjs` is deprecated except `--safe=` (its own header) → recommend `tools/ui/layout-audit.mjs`; description fights css-play on "restructure" |
| tune-physics | 397 | 91 | 2 | IMPROVE | routing form; link §Physics |
| ui-menu-a11y | 330 | 63 | 1 | IMPROVE | routing form; add "a11y". (Its claim that `pick-tests` ignores file args is REFUTED: `tools/ci/pick-tests.mjs:470-471` returns explicit args) |

## Spot-checks (by the parent session)
- REFUTED: `__apex.net()` missing (it exists: `js/agent/apex-net.js:15`, `docs/DEBUG-HOOKS.md:2419`).
- REFUTED: `pick-tests.mjs` ignores file arguments.
- PARTLY RIGHT: `menu-fit.mjs` is deprecated, but the replacement it names is `layout-audit.mjs`, not `fit-audit.mjs`.
- CONFIRMED (CI/CD report): land.yml's AUTO-SYNC budget counts every `land` PR with any ci.yml run queued or
  running (`inflight`, then `budget=$((SYNC_MAX - inflight))`), so with dozens of `land` PRs the budget is usually 0.
- CONFIRMED (CI/CD report): `dispatch.mjs` `landProblem` treats any `gate` failure, a distance-only one included,
  as a problem, so the dispatcher spends takeover sessions on syncs.
- Process: two batch-1/2 reviewers called remote-session MCP tools despite the brief. One `send_message` call had
  empty arguments, so nothing was sent; one `list_sessions` call was read-only. Batch 3 ran on a tool-restricted
  agent type. Lesson: a brief's "do not" does not restrict tools; the agent type does.

## Suggested order
1. One sweep PR: routing form, broken cross-skill links, provenance lines, plus guards for the first two.
2. Per-skill PRs for content changes: mcp-probe description scope, asset-pack scope, steward §12 → ship,
   survey-ui-matrix tool swap, lighting-tuner constant.
3. The description budget: the research found 10,835 of 11,000 chars in use; the sweep must not grow it.
