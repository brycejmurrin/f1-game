# Rulebook slice: third-pass audit (tip b07a5ac6f, 2026-10-26 ~16:45Z)

Scope: AGENTS.md, CLAUDE.md, .claude/rules/*.md, .cursor/rules/*.mdc, PR template, docs/VERIFICATION.md, TESTING.md
§Release/§Merge train, read against bus-800 (lines 122-800 = 10-26), pr-board.txt, the REST PR bodies and list_triggers.
This pass worked read-only. It edited no tracked files and sent no messages.

## Checks
- **Q4 tests:** `node --test rulebook-guards docs-integrity agent-config` gives **85 pass / 0 fail** (38 s).
  - Codex cap (agent-config.test.mjs:777): AGENTS.md is 22,804 / 28,500 B. The chain AGENTS.md + js/track/AGENTS.md is 25,231 / 31,000 B, under Codex's 32,768 B, so nothing is truncated.
  - Saturated caps: **AGENTS.md is 200 / 200 lines** (`agentsMdLines`). 29 of its lines are over 160 chars; the longest is line 80 at 608 chars. fleet-core is 1,921 / 2,048 B. Skill descriptions are 1,383 / 1,500 words.
  - The tests pin each rule sentence to its home. They do not check meaning, so they stay green with every contradiction below.
- **Q2 names:** every `tools/**` file and flag named in scope exists on the tip and appears in its tool's source/usage.
  - Checked: ci-watch --sha/--once/--pages/--failures-only, ready-gate --wait, wait-for --merged, session-status --pr [N], test-bg --stop --sweep, deploy --pr/--plan/--train/--gate-only, fleet-bus who/watch, pr-board --alarm, ratchets --update --fragment --lower-only, plus the rest of the 55 extracted invocations.
  - Every docs path, skill, agent and hook named exists. Every hook in claude-config.md is wired in settings.json.
  - `gen-cursor-rules.mjs --check`: all 8 `.mdc` twins are up to date.
  - The stale Merge Desk scheduled task is gone (list_triggers).
- **Q5 always-on prose:** 42,267 B ≈ **10.6k tokens** per boot and per compaction. Breakdown:

  | Source | Bytes |
  |---|---|
  | AGENTS.md | 22,804 |
  | CLAUDE.md | 259 |
  | fleet-core | 1,921 |
  | 37 skill descriptions | 10,389 |
  | 11 agent descriptions | 3,428 |
  | memory index | 3,466 |

  Read but unused by most sessions:
  - AGENTS.md:85-131 (Seeing the game / Layout / conventions / Physics / asset pack / `__apex`, 3,778 B). Only game-code sessions need it; Physics is restated in game-code.md:27.
  - AGENTS.md:148-152 (Cursor Cloud, 517 B). It is useless to Claude Code.
  - About 1 KB of the memory index restates rules (R9).

## Findings
| id | what is wrong | evidence | cost to Bryce | one-line fix | conf | status |
|---|---|---|---|---|---|---|
| R1 | **Two wake rules contradict each other, and the one home still prescribes a poll loop.** Rule 13 says "these four [wake signals], nothing else" (PR sub, send_later, ci-watch Monitor, wait-for --merged). fleet-core and orchestrator.md require a bus Monitor plus an hourly FLEET BUS WATCH cron. orchestrator.md item 2 still says a Monitor over `fleet-bus.mjs read` lines, but `fleet-bus.mjs watch` now exists and no rule file names it. | AGENTS.md:81 vs fleet-core.md:18-19 and orchestrator.md:35-36, 46-51. fleet-bus.mjs:36 (`watch`, "the orchestrator's Monitor"). grep `fleet-bus.mjs watch` in .claude/AGENTS.md finds 0. trig_01ANsLrv "48 * * * *" is live. | Each orchestrator boot either hand-writes a `while…sleep` (banned by shellparse) or wakes on bad filters. That is the ~$5.8/h wake cost from pass 2. | Rule 13 should say "PR owners: these four; orchestrators: orchestrator.md". Item 2 should become `fleet-bus.mjs watch --to <X> --to '*'`. | high | STILL OPEN (pass-2 F3: tool added, doc not pointed) |
| R2 | **The MERGE-HOLD shape is unenforced, and every hold on the board is malformed.** All 18 WAIT(HOLD) PRs break the `lift:`/`until:` rule. 13 read "MERGE-HOLD: DAD merges (do not remove)", which is an ownership tag. 5 are waits ("deploy gate remains pending"), which fleet-core says belong in the Plan. Only #3800 has `lift:`/`until:`, and it is also an owner tag. | REST bodies: #3802-#3810, #3813, #3815, #3818 (DAD tag); #3748, #3755, #3758, #3760, #3762 (waits). fleet-core.md:6-8; template:27-30. `lift` appears 0 times in merge-gate/ready-gate/pr-board/agent-msg. | 18 PRs are unmergeable by anyone but the hold's writer. Five B PRs wait on authors who are often gone. | merge-gate/pr-board print `MALFORMED HOLD` for a line without `lift:`+`until:`. A `merger:` fleet-block field replaces the owner tags. | high | STILL OPEN (pass-2 F7, CI#6) |
| R3 | **An off-repo "RULE 7.3" overrides fleet-core.** D lanes refuse draft→ready and `run-ci` while any Pages train is in progress for 10 min or more, even with `ready-gate 0` and the tip green. No repo file contains it; it comes from DAD's (Grok) brief. | Bus 3209fb0 16:13Z, be179f3 16:19Z, 12b7916 16:27Z, 7c56233 16:28Z (#3817, #3819, #3820), and 452a702, 716aecb, 12a53cf, e3139b7 (#3778, #3781, #3648): 8 BLOCKED lines. `git grep "batch window"` finds only an archive note. It contradicts fleet-core.md:12 and AGENTS.md:60 ("nothing holds a push on it"). | The train runs ~20 min median and nearly back-to-back, so lanes idle for a train's length on every cycle. In the last 15 min alone, 3 PRs were green and gated but not ready. | Add to fleet-core: "Pages state never holds draft→ready or run-ci; only merge-gate sequences game merges". DAD's brief must import fleet-core, not restate it. | high | NEW |
| R4 | **The sync rule and the ratchet rule deadlock.** fleet-core requires a sync on DIRTY. The tree ceiling rises only on Bryce's typed word in the acting session, and relays carry no authority. A union-only overflow (neither side over the ceiling) therefore cannot be committed by anyone but Bryce in that one session. | Bus 0f3bf7c 16:23Z (#3763: 8437 > 8420, PR side 8413, deploy side under) and a204c60 16:25Z (relayed "Raise limit" correctly refused). trig_01Pr8g58 keeps re-checking a staged, uncommitted merge, which breaks rule 12 (push before a wait over 10 min). fleet-core.md:13,15 vs game-code.md:17-21. | #3763 is blocked indefinitely, and Bryce is pinged to type into one specific session. | On a merge commit (MERGE_HEAD present), the ratchet passes when each parent is at or under its ceiling, and writes a fold fragment for Bryce's review. | high | NEW |
| R5 | **The typed-bus refuser misses the dominant shape.** Since #3785 there are 127 HANDOFF lines out of 290, and 109 of them are LIVE/INFO/HB/SEED chatter. The largest class is worker `LIVE D·Wxx …` (≥24), which fleet-bus.mjs:150-152 does not match. DAD tells workers to `send LIVE`, which is not a type. Senders also validate from their own (unsynced) checkout. | Bus 01b8f8f 16:27Z ("send LIVE\|READY\|BLOCKED"). af67761 16:28Z, a HANDOFF "LIVE D·W32c", was accepted 8 min after #3811 merged. TYPES at fleet-bus.mjs:76. | Every orchestrator's HANDOFF filter still wakes on worker heartbeats. | Accept `LIVE` as an alias of INFO, or refuse `^LIVE\b` inside HANDOFF. Validate on read as well as send. | high | STILL OPEN (pass-2 #6, partial) |
| R6 | **The CI and timer sentences contradict each other.** (a) fleet-core says to set a timer "after every push"; AGENTS says only after a CODE push, and the docs-only path says to skip it. (b) ci-tools says to dispatch ci.yml by hand on `= ci none`; AGENTS says none is by design with no PR, and never to weaken draft=fast. (c) AGENTS:25 and TESTING:1222 say a ready PR gets "a fast tier"; AGENTS:76 and :190 say a ready PR gets the full tier. (d) ci-watch.mjs:510 prints "draft = fast tier", but a draft gets no CI without `run-ci`. | fleet-core.md:22 vs AGENTS.md:24, 79. ci-tools.md:11-12 vs AGENTS.md:24-25, 190. AGENTS.md:25 vs 76, 190. TESTING.md:1221-1223. | Unneeded full-tier dispatches on no-PR pushes, and stray timers on docs pushes. | Edit one word in each line to match AGENTS rule 13 and §Concurrent PRs. | high | NEW |
| R7 | **The scope of a ".claude/** grant" contradicts itself.** AGENTS.md requires a per-event grant from Bryce for "a `.claude/**` edit". claude-config.md requires it only for hooks and settings. The docs-only path treats `.claude/skills` and `.claude/agents` as routine prose. | AGENTS.md:188-189 vs claude-config.md:8-9 and AGENTS.md:22, VERIFICATION.md:43. | Skill PRs either stall waiting for a grant or proceed against AGENTS. | AGENTS.md:189 should say "a `.claude/hooks/**` or `settings*.json` edit". | high | NEW |
| R8 | **The loop block chains commit and push, which rule 12 forbids.** The release-train figures also disagree on the same date. | AGENTS.md:20 `git commit && git push -u origin …` vs AGENTS.md:75 ("push … alone", two-call commit). TESTING.md:1141-1143: p50 11.9 min and median 19.6 min, both "2026-10-26". | Copy-paste agents chain the calls; readers get two different train figures. | Split step 7 into two lines. Strike the 11.9 sample. | high | NEW |
| R9 | **The memory index restates fleet-core, against claude-config.** claude-config.md:11-12 says "Index lines must not restate fleet-core topics". The index restates them (see evidence). No test checks it. | MEMORY.md: user-timezone-pacific and user-plays-on-phone (= fleet-core.md:24-25); short-pr-check-ins (= rule 13); orchestrator-dispatches-pages and orchestrator-may-spawn-sessions (= AGENTS.md:186-187). | About 1 KB always-on, and copies that can drift. | Retire or point the 5 lines (`apex-memory.mjs retire`). agent-config should grep the index for fleet-core keywords. | med | NEW |
| R10 | **Always-on prose spends tokens where they are not used.** AGENTS.md is at its 200-line cap, so new rules land in 400-600-char lines (rules 12 and 13). Game-only sections load in every orchestrator, CI and docs session. agent-fleet still routes on "Merge Desk approvals". | AGENTS.md:85-131 (3.8 KB) and 148-152 (0.5 KB). agent-fleet/SKILL.md:3. About 20 orchestrator boots a day (pass 2). | About 1.1k tokens × every boot and compaction. Lower rule adherence (IFScale, cited in the rewrite note). | Move :85-131 into game-code.md (`paths:`). Move :148-152 into apex-shared.mdc. Drop "Merge Desk approvals". | med | STILL OPEN (pass-2 F10, description part) |

## Prose-only rules seen violated today (Q3)
| Rule | Enforcement | Seen today |
|---|---|---|
| MERGE-HOLD shape / "waiting is a Plan item" | presence only | R2: 18 / 18 |
| "do not merge" is no veto | none | 9 bus lines, the last READY f54caf5 / 2b68cbe at 10:19Z |
| never sync clean-behind | refused only inside sync-pr | DAD 0365a37 14:26Z relays "Bryce: tip-sync D agents" to A/B; 39 tip-sync mentions since #3785 |
| messages carry no authority | prose | 0365a37 and 94ef80f act on "Bryce … via DAD"; #3763 shows the one correct refusal |
| times in Pacific | prose | every bus line, and the FLEET BUS WATCH prompt, use Z. The rule is unenforceable as written: restrict it to messages addressed to Bryce |
