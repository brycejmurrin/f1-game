# [Orchestrator] A·O36 — successor brief from OrchA 35
Predecessor: OrchA 35 claude:session_01GzwfSX1Zmtjk4eBd6cXnBs (13:40Z→16:55Z 10-26). Chain: cursor/orcha34-queue-a34q scratch/orcha34/SUCCESSOR-BRIEF.md (merge recipe pointer, lift.sh, lessons). Standing authority: AGENTS.md §Concurrent PRs. Quota 7-day allowed_warning (A resets 10-28 22:00 PT); launches need Bryce's words typed in YOUR session (`launch-gate.mjs <fresh get_session, <120 s old> --override "<quote>"`).
## FIRST
1. `git worktree add --detach scratch/orcha36-tip origin/claude/f1-game-project-26h3ng` and symlink node_modules. Fetch lift.sh: `git show origin/cursor/orcha31-queue-a31q:scratch/orcha31/lift.sh`. Edit its tick text to your name.
2. Bus `HANDOFF --to '*' "ORCH A LIVE claude:session_<you> (OrchA 36; replaces session_01GzwfSX1Zmtjk4eBd6cXnBs)"`; then `fleet-bus who A`; tell DAD (agent-msg --to D --type INFO); send_message your id to every lane below.
3. A bus Monitor every 60 s (read --to A --to C --to <you> --to '*', drop own and GAME-SLOT lines), a send_later tick (20–50 min), and a Pages Monitor after each game merge (`ci-watch.mjs --sha <merge> --pages`).
## MERGED by OrchA 35
#3796 98b4d178 (docs), #3696 aea233de (game; Pages green via 4638aa52 run 40342995987). Since then D merged #3641 #3646 #3724 #3648; B merged #3795 (the INCIDENT fix, lifted), #3801, #3771, #3811; Bryce merged #3784.
## LIVE A LANES (launched 16:50Z on Bryce's "Let's spawn way more sessions", typed in OrchA 35)
| slot | session | job | merge path |
|---|---|---|---|
| W64 Sonnet | session_011ha8v8GH2GuB6PNFvdJXiq | #3700: +4 assertPins (title-mode-grid-scale.test.mjs includes() pins) → fix, READY | D-lent → forward READY to D |
| W65 Opus | session_018cVFV9rYr7ptvonbJgyhc5 | #3797 garage-churn flake (#3505, deadline 11-10) | A game |
| W66 Opus | session_01NEUas8oBy2hzRtDFyHbgT6 | #3110 F2+F5 (assets.js, game.js boot block) | A game |
| W67 Opus | session_018daL2q2pK6UiCL2ZbsCGFo | #3109 rows 7/9/12, bit-identical VM hash | A game |
| W68 Sonnet | session_01QHEvCXVwJYeDC214RSTmmT | #3108 S rows 7/9/11/15 | A game |
| W69 Sonnet | session_019fdhv1hN3QLxChg9PQaknF | #1682 pin conversion (lowers ceiling) + issue hygiene | non-game |
| W70 Opus | session_01Jz4qYw4RdG98zovRTZDuCJ | #3115 render perf S rows (gpu-census on render edits) | A game |
| W71 Opus | session_016D2JLSoeQ2dGxzrLMzLkp8 | #2572 render live-debug __apex hooks + spec | A game |
| W72 Sonnet | session_01HP8TxzdFXEshWDRXDSHkDD | #3117 CI wall-time rows except F3/F5/F9 | non-game |
| owner Sonnet | session_01LESs6Lsd4TUcsoiG7HSiNK | #3725/#3731 D-lent READY (5ef7c14c / 084edb42) | D merges |
W66 and W67 both touch js/game.js (boot block vs Wind.sync), so whoever merges second syncs. Merge non-game PRs any time with no Pages run queued. Game PRs alternate slots with D (and B when it claims): GAME-SLOT → lift.sh if a MERGE-HOLD → merge-gate → merge → DONE → Pages Monitor.
## OPEN FOR BRYCE
1. Tip-sync of clean-behind #3725/#3731 (and #3700 before W64): his relayed 7:22 PT ask. sync-pr needs --force-clean-behind, which auto mode denies, and the owner declined a relayed grant. Rec: skip.
2. Is the unknown "Cursor Agent" pushing #3700/#3751 his? (W64 opens a replacement PR if the foreign-push guard blocks it.)
3. Optional A·D2 iPhone WebGPU device run for #3681/#3761/#3766 (#3681 labelled blocked pending it).
4. W61 sweep calls: #1565 (build or close), #3117 F3/F5/F9, #3110 F6/F7, #1628 default-ON, #2631 stop?, #2994 (.claude grant).
## Other fleets
B: OrchB claude:session_01AQHQjeACArsMMMtkCajR1H (B·O2, 16:35Z); B owns C/E/H orphans incl. #3763 (A·R3 review sent, bus e10f0c3). D: DAD grok:DAD, many Cursor lanes W30–W34, LEND of tools/shot/scenery-locations.json to D scenery drafts.
## Lessons (new)
- launch-gate wants the saved get_session page < 120 s old: call get_session, save it, gate, then launch ≤ 3 per gate run.
- A non-game merge between the gate and the merge just changes the first parent. Fine, but re-run the gate if the tip moved by a game PR.
- fleet-bus mirror pushes can 500 (agent-msg still delivers by webhook); resend to the bus if it matters.
## BRYCE ANSWERED (typed in OrchA 35, ~16:58Z): "Yes to all" (to the four OPEN items above)
1. Tip-sync of #3725/#3731: OrchA 35 ran `sync-pr.mjs <branch> --push --verify=fast --force-clean-behind` on both; check the result on the bus or in the PR heads, then the owner 01LESs6 re-gates and sends READY to D.
2. The "Cursor Agent" on #3700/#3751 is Bryce's. W64 may treat #3700 as its own branch (it has been told).
3. A·D2 iPhone WebGPU device run: wanted. It needs a launch, and the launch needs Bryce's words typed in YOUR session (quote this line when you ask him).
4. W61 calls, read as "yes": build #1565 ai-band catchup; do #3117 F3/F5/F9 (W72 skipped them; extend W72 or a new lane); do #3110 F6/F7; #1628 default-ON; #2631 stop (close the draft plan); #2994 .claude grant for the track-surveyor `memory: local` trial. Items 1565/2631/1628 are ambiguous yes/no forms: confirm with Bryce in one line before acting.
