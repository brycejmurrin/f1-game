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

One real task per card, 2026-11-18 ~09:05–09:35Z (01:05–01:35 PT). "Hook refusals" counts BLOCKED messages the agent hit.

| Card | Task | Followed card | Hook refusals | Tools enough | Cost (tokens / tool calls / s) | Notes |
| agent | task | followed card | hook refusals | tools enough | cost (tokens / tool calls / s) | notes |
|---|---|---|---|---|---|---|
| verify-agent | verify-change --fast on clean tip | yes (NO-OP path matched) | none | yes | 21.5k/5/24 | wasted a `sleep 1` turn; card names no log path for verify-change --fast background output |
| Explore | budget enforcement + lsp callers | yes | none | yes (lsp worked on tools/ file) | 31k/8/29 | found stale budget comments agent-config.test.mjs:586-587,647-648 |
| deploy-research | live apex-sha vs tip | yes | none | yes | 27k/11/34 | BEHIND (STALE-IN-TRAIN) live 00b8474c, tip 11ebea8a; used `git -C`/a `cd && ;` chain against card's one-call rule; card vocab OK/STALE-IN-TRAIN vs parent's ask |
| ci-red-triage | run 44267961227 | yes | none | yes | 41k/11/37 | not a timeout: 2 sweep shards failed 08:52Z, then superseded by 44272472227; get_job_logs tail_lines=60 shows only summary — `not ok` grep needed; 68KB job list overflowed MCP |
| physics-contract-auditor | assists curvature sweep | yes | none (contract hook refused first handback format) | yes | 33.5k/5/39 | 0 reach; SITE row format (2-space fields, one-token symbol) only stated by hook message |
| prior-art-scout | agent-surface KNOWN list | yes | none | yes | 61k/21/83 | 28 KNOWN rows (TOOLING-HUNT-2026-11-09, SKILL-REVIEW-2026-10-28, the 11-03 reset plan); its own glob missed AGENT-SURFACE-SURVEY-2026-10-05.md (the card's `*SURVEY*` pattern does match it) |
| finding-verifier | 5 phase-1 leads | yes | none | yes | 32k/18/30 | 5/5 CONFIRMED; Grep tool over .claude/ returned "No matches" (hidden path?) → fell back to bash grep; 81KB result from .claude/worktrees; OOS: .claude/rules/js-nav.md:13, .claude/hooks/lsp-hint.py:144 also advertise lsp-mcp.sh |
| code-hunter | slice readonly-bash hook | yes (improvised probe loop via node -e) | none | yes (no Write → inline node -e) | 39k/10/82 | 8 FINDINGs in .claude/hooks/readonly_bash.py (sed w/e, yq -i/uniq/tree -o/xxd -r/date -s, awk > FILENAME / pipe, curl -sSo/-XPOST/--request=, gh api -XPOST, git symbolic-ref/notes add/reflog expire, false refusals wget -qO-, gh -R, git config <key>, node --check); test 7/7 pins none |
| track-surveyor | zandvoort read-only | yes | none | yes | 32k/12/97 | all gates clean; would raise :446 boxes 0.65 m, hedge offsets; frame-report in fresh worktree → ENOENT js/track/circuit-meta.js (BUILT); card never says `node tools/gen/ensure-built.mjs` first |
| surface-reviewer | code-nav set (8 units) | yes | none (contract hook bounced first handback shape) | yes | 65k/46/127 | VERDICT FIX: lsp-mcp.sh fallback refused (3 units); code-hunter/finding-verifier tools: lack lsp_symbols, lsp_hover that code-nav's miss step needs (its output_read part was refuted); 13 claims hold; report scratch/ase/surface-review-code-nav.md |
| worker | stale budget comments, own worktree, no push | yes | none | yes | 81k/12/165 | commit 3b4dbf2e on worktree-agent-a7dd693533baaf333; agent-config 32/32, docs-integrity 38/38 after ensure-built; card says fresh worktree lacks node_modules but not that it lacks BUILT_PATHS (docs-integrity 3 fails until `node tools/gen/ensure-built.mjs`) |

Reading: every card did its job with its own tools and no hook refused a command it prescribes on the tip (#5628's
rewrites are still open, so the cards' `bash tools/*.sh` lines remain; agents routed round them). The gaps are in what
the cards leave out: built files in a fresh worktree (track-surveyor, worker), `lsp_symbols`/`lsp_hover` on the two
cards that follow code-nav, and report shapes that only `subagent-contract.py`'s refusal states (physics-contract-auditor,
surface-reviewer each needed a second handback). deploy-research and finding-verifier broke their cards' one-plain-command
rule (`git -C`, `cd … &&`) without a refusal. Cost: 21–81k tokens per card, 5–46 tool calls.

## 4. Skill runs (Phase 3)

One general-purpose subagent per skill, ≤ 6 at a time, brief `scratch/ase/brief.md` (invoke with the Skill tool, run
the CLIs and tree-kind MCP tools read-only, stop before any browser step). PASS/ISSUES per skill:

| Skill | Verdict | New findings | The one that matters |
|---|---|---|---|
| agent-config | ISSUES | 3 (1 med) | card PRs need `config-ok` unstated; no tool prints budget headroom |
| agent-view | ISSUES | 3 (1 med) | CAP lap 'completes' but track-limit cuts delete the time; Monza T1 frac 0.008 (is 0.096) |
| ai-racecraft | ISSUES | 2 med | new `solo` subcommand undocumented; byLap cannot tell a dive from start bunching |
| asset-pack | ISSUES | 2 low | no GLB checker named; stale 'unpinned literals' pointer |
| audio-debug | ISSUES | 1 med | synth per-gear gIdle/gSpan removed from the code |
| career-mode | PASS | 1 low | DEBUG-HOOKS careerSim row omits matePrize/stake |
| challenge | USER-ONLY | 3 (1 med) | Skill tool refused (correct); `gh api pulls/<n>` gives no diff or CI |
| check | ISSUES | 4 (1 med) | liveness never fetches a PR head; pr-board GATE is not the gate status |
| check-changes | ISSUES | 6 (1 HIGH, 2 med) | its wait-for recipe is refused (no `--background`); floor text says 'ONE spec' |
| code-nav | ISSUES | 2 low (+F1) | `path` only on def/refs/callers; outline omits FIXED_DT |
| css-play | ISSUES | 2 (1 med) | id grep misses the class rule that sizes a HUD readout |
| data-hub | ISSUES | 3 (1 med) | `schedule(year)` last-season fallback undocumented |
| dispatcher | ISSUES | 4 (1 HIGH, 1 med) | §Why assumes the dispatch Action runs: disabled_manually since 11-05 |
| f1-animation-cameras | ISSUES | 1 low | FOLLOW LOCK matters on HIGHLIGHTS seeks only |
| game-feel | ISSUES | 3 (1 med) | wall shake is street-only; no hook reads shake/hitStop |
| garage-parts-livery | ISSUES | 4 (1 HIGH, 2 med) | McLaren wordmark 24 % hidden where placement.md says 0 % |
| handoff | ISSUES | 1 low | §Caps anchor does not exist |
| input-controls | ISSUES | 2 low | pad fields not in DEBUG-HOOKS; gamepad spec often in overflow |
| js-debugger | PASS | 1 low | debugger_collect dry-run needs an attached page |
| lighting-tuner | ISSUES | 5 (2 med) | `lightState().exposure` never shows exposureMul; step 8 omits the floor |
| mcp-probe | ISSUES | 4 (1 HIGH*, 2 med) | no `pageId` anywhere; `mcp-cli.mjs probe` sends none (*static, needs a live run) |
| multiplayer-debug | ISSUES | 2 low | net-unit called 'the local floor'; 3/7 relays fail via the proxy (lead) |
| new-track | ISSUES | 3 (2 med) | bare require path; circuit-def-fields is the Raidillon gate |
| phone-bridge | ISSUES | 4 (1 med) | race recipe's wait and `ok:false` check never fire |
| phone-browser | ISSUES | 3 (1 med) | 'no hook catches browser-http-up' is false; rule 7 → 6 |
| playwright-probe | ISSUES | 3 (1 med) | garage-before pack lookup reaches 20 commits only |
| pwa-cache-service-worker | ISSUES | 1 low | REQUIRED_LAZY has 3 career files, generated block unnamed |
| race-incidents-control | ISSUES | 2 (1 med) | DebrisWorld can never load in the VM |
| race-weekend | PASS | 1 low | LADDER ends at storm |
| renderer-debug | ISSUES | 3 (1 med) | renderer-boot.js, not game.js, injects WGX and binds GLX |
| scenery-dress | ISSUES | 4 (1 med) | footprint advisory is the only lead for a cantilevered floater |
| season-mode | ISSUES | 2 (1 med) | resetWeekend does not touch the stage |
| ship | PASS | 0 | user-only pointer; anchors hold |
| slim-bloat | ISSUES | 7 (4 med) | bloat-scan hides unratcheted giants; dead-class guard unnamed |
| steward | ISSUES | 6 (2 med) | §Open 1 says `cursor/*` unconditionally; path-overlap can never pass with >50 PRs |
| survey-track | ISSUES | 4 (2 med) | corner `bankingDeg` misses the zone peak; no banking readout in §Layout |
| survey-ui-matrix | ISSUES | 3 (2 med) | baseline taken on the edited tree proves nothing; HUD has no diff path |
| tune-physics | ISSUES | 4 (1 med) | recipe baseline is the bare pin seat, not the car a player drives |
| ui-menu-a11y | ISSUES | 5 (2 med) | SettingsNav.back pops to parent / showDirect; focus return not routed |

Subagents cost 87–149k tokens each (≈ 4.4M for the 39). No subagent started a browser and no hook refused one; every
browser step is recorded as NEEDS-BROWSER in `scratch/ase/phase3.md` (local to this container). Re-confirmed KNOWN
rows from #5674: 30; two of its rows look STALE (`apex_eval {vm:true}` did not lock in four runs; asset-pack's
room-validate writes nothing to `artifacts/unused`), and one correction: the subagent-ban wording in agent-view,
f1-animation-cameras, survey-ui-matrix is still false (the VM routes ran).

## 5. Confirmed findings (ranked)

Every row was re-read by agent `finding-verifier` on the tip; only CONFIRMED rows are here.

Verified by agent `finding-verifier` in seven batches of ≤ 15: **102 CONFIRMED, 0 REFUTED, 0 STALE**, 3 not decidable
by the verifier (C8 `mcp-cli` pageId, since confirmed live; G2 nostr relays, network; B8 timing, re-measured 6 s per 120 s).
Fix home: **#5690** (this PR: skill text, cards, docs), **PR 2** (protected hooks, needs Bryce's `config-ok`), **ISSUE**
(code in `js/` or `tools/`).

### High
1. `check-changes/SKILL.md` waiting recipe `wait-for.mjs --log-matches` is refused (30-min default > 590 s cap without
   `--background`) — #5690.
2. `dispatcher/SKILL.md` §Why assumes the Action runs; `dispatch.yml` is `disabled_manually`, the Board 13 days stale —
   #5690 (adds step 0).
3. `garage-parts-livery/references/placement.md` "content measures 0 % hidden"; McLaren's shipped `wordmark` spine is
   24 % hidden (`duo` 36 %), the FLANK_SEEN clamp only applies under `wrap` (`js/car/liverytex.js:2075`) — doc #5690;
   the game fix and `spine-station.mjs` labelling 24–36 % "clear" — ISSUE.
4. `.claude/hooks/readonly_bash.py` lets write shapes through (sed `w`/`e`, `yq -i`, `uniq a b`, `tree -o`, `xxd -r`,
   awk `> FILENAME` / `| "sh"`, `curl -sSo` / `-XPOST` / `--request=POST`, `gh api -XPOST`, `git symbolic-ref` /
   `notes add` / `reflog expire`) and refuses reads (`wget -qO-`, `gh -R`, `git config <key>`, `node --check`) — PR 2.
5. `mcp-probe`: no recipe passes `pageId`; `tools/mcp/mcp-cli.mjs probe` sends none to chrome-devtools-mcp 1.11.0, whose
   `pageIdRouting` defaults on. **Confirmed live** (the session's one interactive browser, 2026-11-18 ~10:30Z):
   `mcp-cli.mjs probe` → `new_page` ok, then `evaluate_script` → `Input validation error: … pageId: Invalid input:
   expected number, received undefined`; every renderer probe the skills route through it fails — doc #5690, tool ISSUE.

### Medium (skill and card text, all fixed in #5690)
code-nav / js-debugger / `.claude/rules/js-nav.md` shell fallback `lsp-mcp.sh` refused under readonly-bash (→ `node
tools/mcp/lsp-mcp.mjs`); code-hunter + finding-verifier cards lack `lsp_symbols`/`lsp_hover`; track-surveyor + worker
cards omit `ensure-built` in a fresh worktree; agent-config Subagents row omits `config-ok`; check liveness for an open or
off-branch PR; steward §Open branch name; challenge diff/CI endpoints; multiplayer "local floor"; agent-view cut-deleted
laps; ai-racecraft `solo` and byLap; audio synth pitch; data-hub `schedule(year)`; css-play class rules; game-feel
street-only wall shake; lighting exposure field and step 8 floor; mcp-probe frame hooks; new-track require path and
the def-fields gate; phone-bridge race recipe; phone-browser hook claim; race-incidents VM debris; renderer-boot.js
owns the fallback; scenery-dress footprint advisory; season-mode resetWeekend; slim-bloat carves (render/three recipe,
dead-class guard, cohesion); survey-track banking readout; survey-ui-matrix pre-edit baseline and HUD diff path;
tune-physics seat; ui-menu-a11y SettingsNav.back and focus return.

### Low (text, fixed in #5690)
check-changes anchor and `--since`; check pr-board GATE; dispatcher SKIP/IGNORED shapes; steward/handoff `§Caps`;
code-nav `path`; asset-pack GLB checker and literals pointer; agent-view T1 frac and VM timing; css-play aliases;
f1-animation-cameras WATCH seek; game-feel trauma scale; input-controls pad fields and spec overflow; js-debugger
node_test dry-run; lighting floodEmit and the VM caveat; mcp-probe `await race`; phone-bridge pins and
`facts.render.engine`; phone-browser rule 6; playwright-probe REFLECT_X mirror; pwa REQUIRED_LAZY; race-weekend storm;
renderer soft-present home; scenery-dress WARN verdict and BASE; season-mode rulesConfig fallback; survey-ui-matrix
`--list`; tune-physics GRIP STEER pair; `docs/DEBUG-HOOKS.md` careerSim row; `docs/PHYSICS.md` PACE 1;
`docs/tracks/zandvoort.md` Hugenholtz fraction and the banked pair; `.claude/skills/README.md` subagent list;
`tests/unit/agent-config.test.mjs` stale budget comments (worker, `a869de16`).

### Code (ISSUE)
`tools/ci/path-overlap.mjs` `maxPrs = 50` (62 open PRs → always exit 2); `tools/shot/garage-before.mjs` 20-commit pack
reach; `tools/ci/tooling-fast.mjs` LONG_RUN_HINT drops `--jobs=3 --quiet`; `tools/ci/pick-tests.mjs` net-unit "(1 s)"
and "ONE pre-push spec" (protected: PR 2 territory), same text in `tools/mcp/apex-tools-mcp.mjs`; `tools/check/bloat-scan.mjs`
bare run; `tools/check/ratchets.mjs` `--auto-raise` 40 vs 20; `tools/car/spine-station.mjs` "clear" at 24–36 %;
`tools/mcp/lsp-mcp.mjs` outline drops `window.X.Y =` assignments; `tools/mcp/mcp-cli.mjs` pageId; `tools/net/rtc-e2e-3p.mjs`
no `--help`, server before guard; `tools/ui/explorer.mjs` exit 1 vs 2; `tools/track/graph-parity.cjs` header vs usage;
`tools/README.md` lists library `footprint-support.cjs` (generated); `.claude/skills/lighting-tuner/scripts/merge-proposals.mjs`
help; `js/agent/agentview-corners.js` `bankingDeg` single sample; `js/car/liverytex.js` wordmark/duo flank clamp;
`js/physics/debris-world.js` cannot load in the VM; no `__apex` read for shake/hitStop or pit `lossS`; `js/ui/modal.js`
stale comment; `js/circuits/zandvoort.js:27` stale comment; `js/net/nostr.js` relays (lead, re-probe off-sandbox).

## 6. Not run

- The browser steps of every skill (listed per skill as NEEDS-BROWSER in `scratch/ase/phase3.md`), except the one
  interactive `mcp-cli.mjs probe` run above (log `artifacts/logs/ase-mcp-cli-probe.log`, local). No browser test ran locally (AGENTS.md rule 5).
- `/challenge` itself: user-only by design (`disable-model-invocation`), and its refusal forbids an agent replay.
- Skill-routing A/B (`skill-routing-eval.py`): no description changed, so there is nothing to compare.
- Network: the nostr relay probe ran through the sandbox proxy only.
- #5628's open card rewrites were not duplicated; where this PR touches the same cards (code-hunter, finding-verifier),
  the hunks are disjoint (`tools:` lines) and resolve at sync.
