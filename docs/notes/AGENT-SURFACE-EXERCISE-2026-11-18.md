# Agent-surface exercise — 2026-11-18

Kind: measurement
Re-measure-by: 2026-12-18 (or the next skill/card fold, whichever is first)

Bryce, orchestrator chat 2026-11-18 ~09:05Z: "Launch a session that will first list and deeply analyze our project
skills and subagents, then launch each type of subagent and for each skill launch a subagent to invoke and use it".
Measured on deploy tip `9bde6e79` (branch `claude/agent-surface-exercise-2026-11-18`). Prior art, not re-reported
(rows marked KNOWN): issue #5674 (the 29 game skills walked through earlier today; a worker is fixing it) and PR #5628
(the card/hook mismatch tune-up, open with `land`). Older prior art: `docs/notes/TOOLING-HUNT-2026-11-09.md`,
`docs/notes/SKILL-REVIEW-2026-10-28.md`, `docs/plans/2026-11-03-agent-surface-reset.md` (prior-art-scout, 28 rows).

Contents: §1 Inventory · §2 Per-unit analysis · §3 Subagent runs · §4 Skill runs · §5 Confirmed findings (ranked) ·
§6 Not run

## 1. Inventory

| Unit | Count | Where | Checks run |
|---|---|---|---|
| Skills | 39 (37 model-visible + `challenge`, `ship` user-only) | `.claude/skills/<name>/SKILL.md` + `references/` (2,919 SKILL.md lines; 145 reference files) | every backticked path and every relative link resolved on the tip |
| Codex mirror | 39 symlinks | `.agents/skills/<name>` | `bash tools/env/mirror-skills.sh --check` = `mirror up to date (39 skills)` |
| Index | 1 | `.claude/skills/README.md` | 39 table rows = 39 directories |
| Subagent cards | 11 | `.claude/agents/*.md` (+ `README.md`) | frontmatter `tools:`/`hooks:`/`model:`; prescribed commands piped through `tools/hooks/readonly-bash.sh` |

Description budget (`tests/data/agent-config-budgets.json`, read by `tests/unit/agent-config.test.mjs`): 37 visible
descriptions = 1,456 words / 9,672 chars against 1,500 / 11,000, so **44 words of headroom** — a new skill must
trim another. Longest one: `survey-track` 316 chars (cap 1,024 each).

Static path check: no skill or card names a missing file. Every flagged path was a deliberate "this does not exist"
note (`docs/DEFECT-LEDGER.md`, `js/game/`), a built path (`tools/shot/scenery-locations.json`, in `BUILT_PATHS`), a
bare basename resolved next to its full path, or a URL with a query string.

## 2. Per-unit analysis

Columns: **desc** = description words (routing cost, always on); **refs** = reference files; **CLIs** = `tools/` scripts
named; **browser** = some step needs a browser (a subagent stops there: AGENTS.md rule 10); **real use** = what a
realistic invocation does. Hook interactions: every skill runs under the project hooks (`bash-guard.sh`,
`protect-files.sh`, `mcp-browser-guard.sh`, `lsp-hint.py`); only reporter subagents add `readonly-bash.sh`, which refuses
`bash <script>` and any bare `tools/*.sh` (probe below, §5 F1).

### Meta and workflow skills

| Skill | Purpose | desc | refs | CLIs | browser | Overlaps / one-home | Real use |
|---|---|---|---|---|---|---|---|
| agent-config | edit skills, cards, hooks, rules, budgets | 30 | 0 | mirror-skills, skill-routing-eval | no | budgets' one home is the JSON; history comments in the test duplicate it (F3) | add a skill: phone.json rows, mirror, budgets test |
| challenge | `/challenge <pr>` adversarial review (user-only, forked general-purpose, sonnet) | 64 | 0 | — | no | step 3 says a forked skill cannot spawn finding-verifier (host fact) | read one PR's claims, post ONE COMMENT review |
| check | `/check` ≤ 6-line status | 31 | 0 | session-status, ci-watch, pr-board | no | liveness → deploy-research | status of one PR |
| check-changes | which tests, local floor, background runs, timeouts | 51 | 7 | pick-tests, select-specs, tooling-fast, test-bg, verify-track | no | ladder's one home is `docs/VERIFICATION.md` | pick-tests + floor on a diff |
| code-nav | apex-lsp instead of grep | 43 | 1 | lsp-mcp | no | shell fallback refused for reporter cards that route here (F1) | def/refs/callers of one symbol |
| dispatcher | how workers launch; `dispatch.mjs --plan` | 38 | 1 | dispatch.mjs | no | rules' one home is the `dispatch.mjs` header | "why was #n not picked up" |
| handoff | `/handoff` cold-start prompt; the cap | 45 | 0 | session-status | no | Hand-off block format: PR template | write the successor prompt |
| ship | `/ship` pointer at steward §Open/§Push/§Land (user-only) | 30 | 0 | — | no | pure pointer; README still says `ship` was folded into steward | — |
| slim-bloat | size ratchets, dead code, unused CSS | 42 | 2 | bloat-scan, ratchets | no | dead-code hunt shared with code-hunter `focus: dead-code` (by design) | bloat-scan one fat file |
| steward | own one PR end to end | 37 | 7 | sync-pr, ready-gate, ci-watch, path-overlap | no | the lane rules' one home | open/push/land this PR |

### Game skills (29)

All 29 were walked through by issue #5674 this morning; this pass re-ran each with a fresh subagent (§4) and reports
only rows #5674 does not hold.

| Skill | desc | refs | CLIs | MCP tools named | browser | Real use |
|---|---|---|---|---|---|---|
| agent-view | 41 | 4 | agent.mjs, apex-eval.mjs | 2 | partly | headless lap, `world()`, corner table via `--vm` |
| ai-racecraft | 40 | 6 | ai-race.mjs | 0 | no | `ai-race.mjs` overtakes/brake targets on one circuit |
| asset-pack | 40 | 1 | gen/assets.mjs | 1 | no | MAT layer count check, room validate |
| audio-debug | 41 | 1 | 1 | 1 | no | `GameAudio` rate/pitch probe (VM lacks it: #5674) |
| career-mode | 41 | 3 | 1 | 0 | no | `careerSim` round settle |
| css-play | 41 | 3 | css-play.mjs + 2 | 0 | yes | one element's padding with shots |
| data-hub | 40 | 2 | 2 | 0 | no | feed parser on a fixture |
| f1-animation-cameras | 44 | 5 | 1 | 2 | partly | replay-camera-probe `--plan` |
| game-feel | 36 | 2 | 1 | 0 | no | kerb/shake tuning read-out |
| garage-parts-livery | 30 | 8 | 3 | 4 | partly | parts-ladder, garage-angles `--plan` |
| input-controls | 44 | 4 | 0 | 0 | partly | touch steering trace |
| js-debugger | 28 | 3 | 0 | 2 | yes (attach) | `debugger_node_test` on a unit file |
| lighting-tuner | 42 | 5 | 6 | 0 | partly | preset bake `merge-proposals --check` |
| mcp-probe | 35 | 12 | 11 | 2 | yes | live `__apex` over DevTools |
| multiplayer-debug | 37 | 2 | 1 | 0 | no | signalling unit tests |
| new-track | 38 | 3 | 5 | 0 | no | verify-track on one circuit |
| phone-bridge | 38 | 1 | 0 | 0 | no (issue bridge) | apex-cmd issue round trip (writes GitHub: exercised to the write) |
| phone-browser | 42 | 1 | 2 | 0 | yes | tunnel + Grok connector |
| playwright-probe | 43 | 8 | 14 | 8 | yes | batch shots / profiles |
| pwa-cache-service-worker | 39 | 2 | 4 | 0 | no | precache list vs manifest |
| race-incidents-control | 41 | 2 | 1 | 0 | no | `caution()` sampling in VM |
| race-weekend | 39 | 0 | 0 | 0 | no | tyre-model unit read-out |
| renderer-debug | 33 | 10 | 2 | 0 | yes | wgx-validate `--static` |
| scenery-dress | 37 | 3 | 2 | 1 | no | audit-circuit float/props |
| season-mode | 40 | 3 | 0 | 0 | no | calendar/points in VM |
| survey-track | 48 | 6 | 2 | 3 | partly | audit + survey loop on one circuit |
| survey-ui-matrix | 39 | 6 | 13 | 6 | yes | layout-audit `--list` / mission plan |
| tune-physics | 40 | 2 | 3 | 0 | partly | player-dyn skidpad A/B |
| ui-menu-a11y | 42 | 1 | 2 | 2 | yes | explorer focus walk |

### Subagent cards (11)

| Card | Model | Tools (write?) | Bash hook | Isolation | desc | Overlaps | Real use |
|---|---|---|---|---|---|---|---|
| Explore | haiku, effort medium | read + lsp_* (no write) | readonly-bash | — | 54 | overrides built-in Explore | "where is X" with path:line |
| ci-red-triage | sonnet | read + Actions MCP | readonly-bash | — | 58 | check's red-job route | a red/cancelled run |
| code-hunter | sonnet | read + lsp_* | readonly-bash | — | 65 | slim-bloat (dead code) | ≤ 12 FINDING rows in one slice |
| deploy-research | haiku | read + WebFetch/Search | readonly-bash | — | 76 | check §5 liveness | live apex-sha vs tip |
| finding-verifier | sonnet | read + lsp_* | readonly-bash | — | 48 | challenge (does its own refutation) | CONFIRMED/STALE/REFUTED per row |
| physics-contract-auditor | sonnet | read | readonly-bash | — | 47 | tune-physics | curvature-channel classification |
| prior-art-scout | haiku | read | readonly-bash | — | 45 | — | ≤ 30 KNOWN rows |
| surface-reviewer | sonnet | read + Write (scratch md) | readonly-bash + scratch-md-only | — | 99 | agent-config step 1 | claim-by-claim cross-file report |
| track-surveyor | inherit | read + Edit (circuit pair) | surveyor-scope | worktree | 39 | survey-track, new-track | one circuit pass |
| verify-agent | haiku | read | readonly-bash + worktree exception | — | 55 | check-changes floor | `verify-change --fast` verdict |
| worker | inherit | full write + GitHub + remote MCP | project hooks only | worktree | 46 | steward (parent keeps the PR) | one scoped change, local commit |

## 3. Subagent runs (Phase 2)

One real task per card, 2026-11-18 09:05–09:30Z. "Hook refusals" counts BLOCKED messages the agent hit.

PHASE2_TABLE

## 4. Skill runs (Phase 3)

One general-purpose subagent per skill, ≤ 6 at a time, brief `scratch/ase/brief.md` (invoke with the Skill tool, run
the CLIs and tree-kind MCP tools read-only, stop before any browser step). PASS/ISSUES per skill:

PHASE3_TABLE

## 5. Confirmed findings (ranked)

Every row was re-read by agent `finding-verifier` on the tip; only CONFIRMED rows are here.

FINDINGS

## 6. Not run

NOTRUN
