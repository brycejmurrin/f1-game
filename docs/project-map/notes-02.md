# Notes batch 02 — historical evidence map

Read on 2026-10-27. Scope: all 100,000 assigned bytes of group `02` in [notes-batches.json](notes-batches.json), five text parts. Half-open byte intervals below are UTF-8 byte offsets. Whole SHA values identify the complete source files; part SHA values identify only this assignment. Chunk SHA values document the actual untruncated reads, each at most 10,000 bytes. The first file begins mid-section; its earlier sections belong to batch 01.

These notes are historical provenance, not operational authority. No historical command was executed, and no runtime, browser, network, source or test verification was performed. Current-use statements below describe documentary navigation only; they do not assert present implementation. Current instructions remain in [AGENTS.md](../../AGENTS.md), and current engineering references should be consulted before acting on old findings.

## Byte and hash ledger

### P1: [AGENT-SURFACE-SURVEY-2026-10-05.md](../notes/AGENT-SURFACE-SURVEY-2026-10-05.md)

- Whole file: 24724 bytes; SHA-256 `944ebd77752eb49dea3cb610e056fa75e3179bbe9dbf1726c58ddba25bed84c5`.
- Assigned part: `[8652,24724)`, 16072 bytes; SHA-256 `e2d1207e71c00834ac9d36ab10a0d694f381ebd34acd6f69bbb5a066a279266f`.
- Read chunk `[8652,16688)`: 8036 bytes; SHA-256 `c6476f5d0488a6dbe1ad412211300a44ea76816cd426766c60aafe8306f2e181`.
- Read chunk `[16688,24724)`: 8036 bytes; SHA-256 `43b5faba0584761b9b3b8b9aad9e0ad5fe0b836e770ecd4e34e43f762a931144`.

### P2: [AGENT-TOKEN-USE-2026-10-20.md](../notes/AGENT-TOKEN-USE-2026-10-20.md)

- Whole file: 8471 bytes; SHA-256 `5765b87bc2400c512b2f2555a31adae7fe23d720fa126b00f2ba436f15c448bf`.
- Assigned part: `[0,8471)`, 8471 bytes; SHA-256 `5765b87bc2400c512b2f2555a31adae7fe23d720fa126b00f2ba436f15c448bf`.
- Read chunk `[0,8471)`: 8471 bytes; SHA-256 `5765b87bc2400c512b2f2555a31adae7fe23d720fa126b00f2ba436f15c448bf`.

### P3: [AGENT-TOOLING-MARKETPLACE-2026-10-16.md](../notes/AGENT-TOOLING-MARKETPLACE-2026-10-16.md)

- Whole file: 8466 bytes; SHA-256 `4b7a690ff61a8b948bd1bdf269cdabe90005570cbd6c845051d1bb935ba555af`.
- Assigned part: `[0,8466)`, 8466 bytes; SHA-256 `4b7a690ff61a8b948bd1bdf269cdabe90005570cbd6c845051d1bb935ba555af`.
- Read chunk `[0,8466)`: 8466 bytes; SHA-256 `4b7a690ff61a8b948bd1bdf269cdabe90005570cbd6c845051d1bb935ba555af`.

### P4: [AGENT-WORKFLOW-EXPERIMENTS-2026-10-19.json](../notes/AGENT-WORKFLOW-EXPERIMENTS-2026-10-19.json)

- Whole file: 12070 bytes; SHA-256 `31aaca49337b0e1beb20b508b1e5591bcbe3e6cc3a273f39526aa7d4ed83eb4a`.
- Assigned part: `[0,12070)`, 12070 bytes; SHA-256 `31aaca49337b0e1beb20b508b1e5591bcbe3e6cc3a273f39526aa7d4ed83eb4a`.
- Read chunk `[0,8000)`: 8000 bytes; SHA-256 `3670a737d4396344957893c89329196deddecbfa01a5e78c8dd6a9a7810df521`.
- Read chunk `[8000,12070)`: 4070 bytes; SHA-256 `6f401401005c969191f272ae267e07c9d616ea17d91b47c5737f1f10c75575ee`.

### P5: [AI-FIELD-RESEARCH.md](../notes/AI-FIELD-RESEARCH.md)

- Whole file: 59655 bytes; SHA-256 `ae37cba043792abce23b993c5528f2608ef0adc07bbaf1ce57719ec874b9a0e3`.
- Assigned part: `[0,54921)`, 54921 bytes; SHA-256 `c70774a37bdcb0e1fd189e42c3ddd8bd1c031fb280b69232be54fb361ead599a`.
- Read chunk `[0,9500)`: 9500 bytes; SHA-256 `21b33b85e85f2a53afb43276f0e66a0ba8391d3dce7acf012218858cc73e8808`.
- Read chunk `[9500,19000)`: 9500 bytes; SHA-256 `f4fdabb9dcb32ed98eae6d1b46ea15004e887b98487e9599704a50c4ce2a78e5`.
- Read chunk `[19000,28500)`: 9500 bytes; SHA-256 `f2e981a0cbd67a69c988dc30a1f5bf6af8048a6077e1702f374ff86a20a71625`.
- Read chunk `[28500,38000)`: 9500 bytes; SHA-256 `dccddc1a20a3d6024360d028ae1d1ccb8ccd785577d351772c284edb599613fb`.
- Read chunk `[38000,47500)`: 9500 bytes; SHA-256 `4eb3e478108c11dda878aceffd1476bb6bed454630495099236c725834d8c6b8`.
- Read chunk `[47500,54921)`: 7421 bytes; SHA-256 `078d60f02dab6849e93471b1adc66142d6cfb0ea995045576c89fe18a1898599`.

## Semantic map

### P1 — agent surface survey, October 5

Producer: an unnamed repository survey author, with named read-only bloat and physics-contract audit agents in the follow-up narrative. The assigned opening is the continuation of §4's MCP conformance table, not its introduction.

| Section in assigned part | Meaning and evidence | Current documentary use / limits |
|---|---|---|
| §4 continuation | Tool-search deferral, descriptions, missing annotations/schema, structured-content mirror, bounded output, initialize capabilities; flags stale CLI-count wording. | Explains the original MCP metadata motivation; initial gap statements are superseded within this same note by §8/8b. |
| §5 AGENTS/rules/memory | Surveys instruction budgets, imports, nested instructions, memory and local diagnostics. | History of instruction-budget decisions; version-specific host behavior and line counts are dated. |
| §6 eval loop | Compares routing evaluation with body-quality evaluation and plugin baseline tools. | Distinguishes routing accuracy from task quality; proposed plugin evaluation was not run in that pass. |
| §7 ranked work | Eight proposed PR-sized fixes/experiments and explicit rejected options. | Design rationale only; do not treat its to-do list as open work without §8/8b. |
| §8 landed | PR #922 / branch provenance: tool metadata, routing queries, README repair, count removal, reference TOCs, cache-rule links and arguments. | Reports 22/24 routing on one run, identifies meta-request misses and budget pressure; a point estimate, not a success rate. |
| §8b follow-ups | Rewrap/headroom, 56-query routing, measured injection, schemas, surveyor worktrees, nested instruction docs, skill-doctor costs, bloat and physics sweeps. | Claimed follow-up outcomes remain historical; `/doctor prompt-audit` stayed local-only. Records permission refusal for branch deletion rather than authorizing it. |
| Sources | Claude Code docs, Agent Skills spec, MCP spec/schema, skill-creator. | Citation inventory for rechecking host/spec changes; no web source was revisited here. |

Backlinks: [NOTES-INDEX.md](../NOTES-INDEX.md) lists the survey. Later historical docs-survey and fleet-research notes cite it, including a warning that its `survey-track` fork claim became stale. This partial assignment does not cover that earlier claim itself.

### P2 — Cursor token-use survey, October 20–21

Producer: unnamed author analyzing Cursor replay with `cursor-agents.mjs`; October 21 follow-up used three read-only role-group digest agents and author recounts. Backlinks: [NOTES-INDEX.md](../NOTES-INDEX.md), [orchestration outcomes](../notes/orchestration-redesign-2026-10-27/outcomes.md), and the project-map tools UI/GFX inventory.

| Section | Meaning | Current use / limits |
|---|---|---|
| Method / nine runs | 533 calls and approximately 1.804M stored result characters; reads/grep dominate; ranged reads seldom repeat, outline use low. | Evidence for output/context friction; result characters are a token proxy and runs were still in progress. |
| Recommendations revised | Keeps exact-command preambles/handback, rejects hidden LSP alias and redundant digest; shifts output bounding toward one-off readers. | Records why proposals changed after measurement. |
| Built | Reports audit-summary, lane-preamble validation/parser correction and bounded handback. | Leads to tool names and rationale; reported runs are dated evidence only. |
| Last 200 agents | Only 34 agents / 101 runs available inside stream window; role patterns include edit echoes, symbol grep, one-offs, discovery, process output, rereads and waits. | Broadens the sample while exposing survivorship/window limits; LSP arms have one run each. |
| Built / not built / not verified | Core preamble, quiet output and capped process rows reported built; issue digest and inventory not built. | Explicitly leaves prompt-effect, actual model-visible echo, and cloud subagent blocking unverified. |

### P3 — tooling marketplace, October 16

Producer: unnamed researcher responding to Bryce's plugin/skill discovery request. Primary backlink: [agent friction fix plan WS10](../plans/2026-10-16-agent-friction-fix-plan.md). Outgoing sources are official Claude Code/MCP/GitHub material plus labeled third-party listings.

| Section | Meaning | Current use / limits |
|---|---|---|
| Built-ins | Maps subagent/skill settings, usage/context, insights, statusline, usage limits, Monitor/hooks, deferred MCP, permissions, image limits and telemetry to plan themes. | Discovery checklist; host/version fields and cloud availability require fresh confirmation. |
| Plugins | Ranks hookify, plugin-dev, code review, security, catalog names, CI optimizer, Three.js and responsive tooling. | Candidate assessment, not approval or installation record; several contents explicitly unverified. |
| MCP servers | Tighten GitHub/Playwright, try Three.js tooling, retain Context7, defer Sentry. | Historical fit assessment; no present connectivity implied. |
| GitHub / next steps | Lists Anthropic repositories and six scoped trials/adoptions linked to WS10. | Research/experiment proposals; catalog presence does not establish installed capabilities. |

### P4 — workflow experiment JSON, October 19

Producer recorded as model `gpt-6.1-sol`, no requested effort override, source revision `3368dd5b985e52cf33814e787312aab0cad6745f`. A historical workflow-experiment narrative links this machine summary; a later host-efficiency note links that narrative. No external evidence archive was opened.

| JSON section | Meaning and limits |
|---|---|
| schema/study/source/model/design | Twenty agents, ten brief/guided pairs, five waves of four; command, wall and child-CPU admission budgets; actual local stdio JSON-RPC, native IDE attachment explicitly false. |
| totals / byInstruction | 333 commands, 19 failures, 188 MCP calls, 13 MCP errors, 131 substantive successful calls, 32 successful retrievals, zero repeated identical producer calls and 56 terminal truncations. Guided arm has more commands/calls but fewer command failures; unequal branches forbid a causal winner. |
| lanes 1–20 | Paired families: PWA, garage, navigation, UI plan, watch data, race-control, input, multiplayer, career, audio. Each reports pass plus commands, failures, emitted/RPC bytes, MCP calls/errors, retrievals, repetition and truncation. Self-reported pass is not current test evidence. |
| discovery / startup | 104 initializations and listings; listing payload dominates RPC bytes. Separates startup instruction output from call response bytes. |
| null billing / limits / archive hash | Model-visible bytes, billed tokens and dollars are null. Expected negative controls included; refused preflights excluded; audio follow-ups outside frozen primary ledger; lane20 trace recovered; cold CLI discovery cannot prove IDE behavior. Archive SHA is a provenance identifier only. |

### P5 — AI field research, September 8–October 1

Producer: unnamed first-person measurement author responding to owner reports, using VM instruments and cited F1/racing-AI research. No browser evidence is claimed by this map. Documentary backlinks include [PHYSICS.md](../PHYSICS.md) AI field/tactics/dirty-air sections, [AI contact research](../research/AI-CONTACT-RESEARCH-2026-09.md), [feature roadmap](../plans/2026-10-04-feature-roadmap.md), [AI personality plan](../plans/2026-09-30-ai-personality.md), the earlier personality note and ceiling-history ledger. Some older backlinks repeat findings later withdrawn in this note; read corrections before reuse.

| Section / date | Semantic evidence and correction | Current use / limits |
|---|---|---|
| Baselines / real F1 calibration | Initial spread/stringing/passing tables and real-field references; distinguishes stringing from pair oscillation. | Opening hypotheses, subsequently qualified by sampling and launch-phase corrections. |
| Dirty air / prior art | Tow without wake penalty, CFD magnitudes; banding dead zones/skill, biorhythm, scripted groups, overtake hysteresis and persona axes; excludes training pipelines. | Design bibliography; single-run stringing effects become anecdotes later. Default-scripted update is dated October 1. |
| Open audit rows | Brake-look fixed September 16 and ladder recut; downforce asymmetry corrected; straight defence already fixed; band cap/corner authority. | Preserves struck-out claims and why they closed; old line numbers explicitly stale. |
| Planner vs actuator, September 9–14 | Aero-planner experiment reverted; shared grip envelope reported resolved at `bf1979d`; apex-depth comparison and misleading faster-lap table retained. | Strong methodological lesson: line geometry before lap-time improvement claims. Historical model description changes again September 24. |
| Pace spread / n=5 | Two compressions preserve field mean; nose-to-tail rises; predicted flip increase fails; Monaco stringing inconclusive. | Compare matched samples/ranges; every un-ranged stringing number is anecdotal. |
| Instrument resolution | AI line apex depth tight; field pass counts noisy; threshold headroom/context RNG difference explained. | Measurement selection rationale; not permission to widen thresholds. |
| Completed-pass lockout | Experience-scaled counterattack lockout; original Monaco/Monza narrative corrected by multi-seed measurement. | Mechanism motivated, effect below single-run resolution; seeding requires field reconstruction, reproducibility differs from variance. |
| Straight defence, September 14 | Real missing straight-side branch; sham perturbation establishes chaos floor; paired staged duel 1260 cells, 17 held vs 11 lost, p=.172 fails preregistered benefit bar. | Correctness fix without demonstrated resistance gain; stopped after one pair to avoid fishing. |
| Human aim/contact, September 16 | Repairs scripted-player follower/self-check; aim-intrusion concession human-only plus follow brake; rejects every-neighbor concession after AI-only cost. | Three-seed contacts/field tables; player controller, offsets and yield classification bound interpretation. |
| Pass latch, September 14 | Engagement now shares 16 m release window; six-seed latch churn falls, completions fall 18%, per-engagement success flat. | Explicit cost and reversal of flattering n=3 reading; no claim of better passing. |
| Merged-tree withdrawals, September 16 | Pace rebaseline; oscillation counts level pairs; launch reshuffle is not race overtake rate; yield role deterministic and timer label misleading. | Withdraws “overtaking too easy” and “coin-flip yield” findings; crucial correction to older linked research. |
| Wings/queue/cancelled pass, September 24 | Shared aero grip with separate yaw taper; queue patience/X-mode pace normalization; arrival-side/reach gates. | Solo pace, line, queue and contact samples; field metrics cannot distinguish queueing from close racing. |
| Mirrors/cover/blue flags, September 29 | Time-based rear reach/window and same-lap let-through correction; ten-run covers increase, conversion/contact unresolved; duel worktree-root bug fixed. | Awareness/correctness gains; no measured pass-resistance gain, earlier five-run conversion result fails at ten. |
| Tactical package, October 1 | Repairs parked-human contamination via AI-only bench; time headway, next-corner side, lane corridor, per-zone roll, lockout, defence, start calm and human pace/yield rules. | Ablations expose headway passing cost; n=2 ranking is directional, final n=5 eight-lap comparisons are bounded VM evidence. |
| Permanent circuits / human results | Fewer swap-backs/contact, faster side-by-side resolution, conversion gains; stuck metric does not improve, faster-scripted-player contact rises. | “Stuck” often means parallel drift rather than blocked passing; no browser collision/characterization coverage. |
| Street restoration / final four circuits | Restores metre-gap/old reach/side bonus and removes selected tactical gates on streets; Monaco passing restored while giving back some contact gains, Baku largely base-like. | Final table supersedes initial all-gates Monaco outcome. Permanent-path byte comparison is reported historical evidence, not checked here. |

## Reading boundary

All five assigned parts were fully read in the chunks listed above; hashes match the manifest whole-file SHA values. This map intentionally makes no present runtime claim and therefore performs no LSP/runtime corroboration. Follow the current references and inspect current code through the approved symbol-navigation workflow before converting a historical mechanism or proposal into implementation work.
