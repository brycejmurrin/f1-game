# [Orchestrator] A·O29 — successor brief from OrchA 28 (handoff ~08:52Z / 01:52 PT)

Predecessor: OrchA 28 session_01FLLy64s5qjHHCkjcXntV2s (07:55Z–08:52Z, context cap 264k). Base recipe: cursor/orcha26-queue-a26q scratch/orcha26/SUCCESSOR-BRIEF.md. Tools (fleet-bus, agent-msg, merge-gate) run from a detached deploy-tip worktree with node_modules symlinked.
Standing authority: AGENTS.md §Concurrent PRs. Bryce re-granted the merge loop typed in OrchA 28 (AskUserQuestion 00:58 PT) after auto mode refused relayed authority. If auto mode refuses again, ask Bryce via AskUserQuestion (that worked).

## FIRST
1. Bus HANDOFF "ORCH A LIVE <you> (replaces OrchA 28)"; DAD INFO via `agent-msg.mjs send --to D --type INFO --no-bus`.
2. Delete OrchA 28's timers: net trig_01Tw8YB7tSk1bEnQ4woKRDvL (hourly :23) and any pending tick. Arm your own send_later tick (~10 min) + hourly net.
3. Message live lanes with your id.

## MERGE RECIPE (gotcha)
GAME-SLOT on bus → lift MERGE-HOLD (PATCH body, drop the line, append "- [x] MERGE-HOLD lifted by OrchA 29 at merge") → `merge-gate.mjs --pr N --sha <PR HEAD SHA, explicit — "HEAD" resolves to the worktree> --as claude:session_<you> --fleet A --role orchestrator` → mcp merge_pull_request (merge, expectedHeadSha, gate's commit_title/message verbatim) → `git log -1 --format=%p` 2 parents → bus DONE. No merge while a pages.yml run is queued/running; one game PR per green Pages.
LESSON: merge-gate does not run the guards on the merged tree. #3530 merged clean and turned the tip red (source-pin-hygiene 309>308); fixed by #3617. After each merge, run `node --test tests/unit/source-pin-hygiene.test.mjs` (and the Pages verdict) on the new tip.

## STATE at handoff
Tip 9eb0393b (#3475). Pages for it starts on push; wait green. Merged this shift: #3458 9d15d0b7, #3530 f4ea4432 (Pages FAILED: base red), #3617 296c5257 (fix; Pages green), #3475 9eb0393b.

## GAME QUEUE (agreed with DAD, bus recap 01:46 PT)
1. #3581 visor (A·W5 Fable session_01LbyfrAbJw1GJttfbEixYnv) — syncing onto f4ea4432; READY ETA ~09:10Z. If it's behind 9eb0393b it's clean-behind; no re-sync unless DIRTY.
2. #3479 54b8fa8f? (check head) and #3482 — D-originated, adopted by A·O5 (session_015G8byk3tLy6W6GGKNBM4oF); bodies say "MERGE-HOLD: OrchA 25 merges this (adopted by A·O5)"; DAD agreed A merges. #3479 holds governor.js (lands before #3610 and A·W23).
3. #3611 BOOST lag (A·W15 session_01AhiowZLuQxUq1eLzZb7BZw) — run 8 on 18PM approved (dom@live first load).
4. #3614 CAUTIONS-off storm SC (A·W16 session_014WbDdmXsZLiGKwLRyX5ULF) — Bryce's bug from his phone screenshot.
5. #3618 night/rain pre-warm (A·W14 session_01GCovo9sNCsQDm2At4sZXA9) — caster-gate only (iPhone 14 A/B: warmPlus doesn't help; post gate stays). A·W14 also opening a mirrorPrepare diagnostic PR (approved): after it's live, ask DAD for a 2nd iPhone 14 window for the capture.
Non-game: #3612 (A·D1) batches when green. Then the wave PRs as they READY.
Fleet D queues behind A: #3599 #3595 #3596 then #3613 (D merges its own). #3576: nobody syncs until Bryce decides.

## LANES
| lane | session | state |
|---|---|---|
| A·D1 | session_01Wj2vjHSTC5X7jPwXkJEuJD | #3612 (ledger docs/notes/DEVICE-FARM-LEDGER-2026-10-23.md); holds the iPhone 14 window to 02:20 PT (Bryce via DAD); paths A/B running; RELEASE + share files with D after. Owns memory/GC scope (A·W9 declined relayed authority). |
| A·W14/W15/W16 | above | |
| A·O5 | session_015G8byk3tLy6W6GGKNBM4oF | owns #3479 #3482; per-circuit scenery perf from data |
| A·O6 | session_01NpE3oFrsSuFajXS4WrP1Lw | cold boot perf; DF CLAIM queued on 18PM behind W15/W14; #3579 blocked |
| A·W5 | session_01LbyfrAbJw1GJttfbEixYnv | #3581 |
| A·X1 | session_01Jxz6BMpucD8Gm23RmWTptJ | #3568 draft; pushed docs/notes/PERF-KNOWN-WINS-2026-10-23.md there |
| A·I1 | session_01HbNLitLPBf1XPZxn5Qrvt7 | at cap; left a cold-start brief for an in-race WebGPU steady-state lane (needs iPhone 14 → DAD); NOT launched |
| A·W9 | session_01P4T3QVegydddFRrUCg4Eqe | #3586, idle (refuses relayed authority) |
WAVE (Bryce 01:23 PT, 10 lanes; DAD cleared overlap): A·W17 #3570 session_018657mB6hb4RbfbwADnGxxG · A·W18 #3571 session_01DPvddTBeSVdGZrYb9EcpgK · A·W19 #3562 session_01TqBaFYk2yQp6kDXkieKpUf · A·W20 #3561 session_018xiZcGDPQiqj2KinrTPU4q · A·W21 #3557 session_01JSWD3jDyoc69QPVpJ26NSm · A·W22 #3556 session_01BE1zQKg1HNBkkY27pj5fTA · A·W23 #3294 session_01EpKJFTTbt6sEgpaQbbD9aB (syncs after #3479) · A·W24 #3606+#3591 session_01A5Z3VH3L8fftrRnWKzfqcy · A·W25 physics catch-up cap session_01DUGcemtqkKmnsYzfrRSc2s · A·W26 #3298+#3299 session_01NVWCfQK87cwVkfQrcWRUHn.

## DEVICE FARM
Only 3 iPhones: 18 Pro Max (Fleet A; order A·W15 run 8 → A·W14 BEFORE (PENDING_DEVICE) → A·O6 ≤80 min), 14 + 14 Pro (Fleet D; 14 lent to A·D1 to 02:20 PT). Claims: bus "DF CLAIM <device> <lane> <min>" + RELEASE. Safari kill and "Clear History" do NOT clear the WebGPU pipeline cache; only a new DF session's first load is cold.
Perf split with DAD: A = items 1 (A·W14), 2 (#3479), 3 (decided: no flip), 10 (A·W25), A/B legs 4/7/9; D = 5/8/11–16, 6 after #3479.

## OPEN QUESTIONS TO BRYCE
Close A·W9 (#3586) / A·X1 (#3568)? agent-index churn → D·W22a is fixing it (no longer a question). #3608/#3610: Bryce said "they're mine, leave them".
