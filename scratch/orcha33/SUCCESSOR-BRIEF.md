# [Orchestrator] A·O34 — successor brief from OrchA 33

Predecessor: OrchA 33, claude:session_014ehnzVXXXbXpmaNrA6VWSP (10-25 22:58Z → 10-26 ~04:05Z, handed off at Bryce's "Also handoff", ~21:03 PT).
Standing authority: AGENTS.md §Concurrent PRs. Recipe: cursor/orcha31-queue-a31q scratch/orcha31/SUCCESSOR-BRIEF.md (MERGE RECIPE). lift.sh: `git show origin/cursor/orcha31-queue-a31q:scratch/orcha31/lift.sh > $SCRATCH/lift.sh; sed -i 's/OrchA 3[0-9]/OrchA 34/' $SCRATCH/lift.sh` (needs SCRATCH env).
QUOTA: 7-day at allowed_warning (resets Wed Oct 28 10 PM PT). Bryce said "Launch new sessions ignore quota" (10-25 ~16:05 PT); the D7 launch-gate hook may land soon (#A·W58) — it then needs his typed override.

## FIRST
1. Worktree: `git worktree add --detach scratch/orcha34-tip origin/claude/f1-game-project-26h3ng` + `ln -s /home/user/f1-game/node_modules scratch/orcha34-tip/node_modules`.
2. Bus, CANONICAL form (fleet-bus `who` parses it; free text breaks it): `node tools/ci/fleet-bus.mjs send HANDOFF --to '*' "ORCH A LIVE claude:session_<you> (OrchA 34; replaces session_014ehnzVXXXbXpmaNrA6VWSP)"`. Check `node tools/ci/fleet-bus.mjs who A` prints your id. DAD: `agent-msg.mjs send --to D --type INFO`.
3. Arm a 60 s bus Monitor (re-arm every 30 min): `while true; do node tools/ci/fleet-bus.mjs read --to A --to C --to claude:session_<you> --to '*' --as claude:session_<you> | grep -E '^[0-9]{2}:[0-9]{2}Z ' | grep -v 'from:claude:session_<you>' | grep -E 'from:(grok|claude:session_01TUs|claude:session_012x87|claude:session_01WYAj|claude:session_017qTc|claude:fleet-a-inbox|B·|cursor|codex)'; sleep 60; done` — MUST include `claude:fleet-a-inbox` (Fleet B's cross-account inbox lands there). Plus a tick (send_later ~20 min) and a Pages Monitor on the latest game merge.
4. send_message each live A lane (table) your id. Keep queue state on your own pushed branch (cursor/orcha34-queue-<hash>).

## Cross-account inbox (works both ways; docs/notes/CROSS-ACCOUNT-INBOX-2026-10-25.md, merged #3767)
Fleet B POSTs to routine trig_01Vn7kMxEUVCYYBwKKmKdzVh (repo attached); its fresh session posts `from:claude:fleet-a-inbox [FROM FLEET B via inbox] …` on the bus to:A. A → B: a NEW session (env APEX_B_RELAY_URL/TOKEN only load at session start) POSTs B's URL; it lands as from:claude:fleet-b-inbox on B's side. No relay session. The routine wakes twice per fire (first without payload → may post one empty line; Bryce can add the "post nothing without a payload" guard in the web UI).

## Game queue (one per green Pages, alternating with D; Fleet B also takes slots)
Tip df89a10d. Last game merge D #3645 8359871b (Pages in_progress at 04:00Z). Slot agreed next: Fleet B's phone-resolution restore (bus ebf5e8e, Bryce "merge asap" in OrchB), then A:
1. #3704 a082363e (O3 boot WebGPU adapter) — full tier + macOS census green; trial on 83b8b6d6 passed; owner archived. Re-trial on tip, GAME-SLOT, lift.sh (old MERGE-HOLD work-state line: lift with evidence), merge-gate, merge.
2. #3745 fc666ffe (voice Opus twins, 4 default packs, Bryce chose A) — green, clean, owner archived.
3. #3757 (title warm, now 9a977ce1) and #3751 (pack URLs, DIRTY) — A sync lane session_011eKSAUfi58o6oKPi3LoufQ resyncs; wait for its READY.
4. #3761 + #3766 (first-frame pre-mint, rig warm; stack on #3757) — owner session_018TxG428heVrfDa89WSiT7s (Opus).
5. #3693 + #3696 (net TURN cache, audio resume; old MERGE-HOLD work-state lines, lift at merge with evidence) — owner session_01SoT9qynqBvf9yyaWk52LtF.
Non-game: #3770 MERGED 06ac5e84. Next: A·W58 / A·W59 PRs (audit fixes) — review diffs carefully (hooks must fail open), gate, merge.

## Live Fleet A lanes
| slot | session | PRs / job |
|---|---|---|
| Sync | session_011eKSAUfi58o6oKPi3LoufQ (Sonnet) | resync #3757 #3751 |
| Owner | session_01SoT9qynqBvf9yyaWk52LtF (Sonnet) | #3693 #3696 |
| Owner | session_018TxG428heVrfDa89WSiT7s (Opus) | #3761 #3766 (iPhone WebGPU freeze; device runs need Bryce's Go via A·D2 — archived; relaunch if he wants one) |
| Owner (D-lent) | session_01LSsK2pE8uiPTU5gbMtpNdz | #3700 #3702 → D (#3702 red VF6 600>599: told to add a vm filename, no ceiling raise) |
| Owner (D-lent) | session_01LESs6Lsd4TUcsoiG7HSiNK | #3725 #3731 → D |
| Owner (D-lent) | session_01RH2u5AT3dnvftgSMAp9tCp | #3709 READY (#3712 merged) → D |
| Owner (D-lent) | session_01X9AfrVwmivJyz5F2my23xZ | #3721 READY, #3737 → D |
| Review (done) | session_016jTZC5nB2TPhJvvbLjnkyx | #3770 merged — archive after 1 h idle |
| Worker W58 | session_01QmafPRVR8CKCYzBrN8h1M6 (Opus) | audit D1–D7 + Q1: .claude rules, context-cap + launch-gate hooks |
| Worker W59 | session_01L2JfUG9S2LF6yGzvssmSJX (Sonnet) | audit Q2–Q11 tools |
Done, archive after 1 h idle (fleet-archive rule): A·W57 session_017S4fYMhEPQgVZHizeFJHpL, A·T1 session_016wPTxszmxyxxXKN8Y5Qsvn, A·T2 session_01BSSzUj5tzNK8ykJk433Z9W.

## Other fleets
- D: DAD (grok:DAD; agent-msg --to D). D keeps #3634 #3636 #3641 #3646 on its own train (#3645 merged). D merges all D-lent PRs (MERGE-HOLD kept on them).
- B: OrchB (latest seen session_017qTcNESpx3eDPEaeafcLHW / 01WYAj… / 012x87…; `fleet-bus who B`). Reach: bus to:B, or the inbox (A→B). B owns D-lent #3648 #3736 #3684 #3724 #3689(merged) #3691(merged) #3723 #3730, plus #3759 and a sync lane on #3764 (warned to coordinate with Fleets C/E).
- C (codex): live; A does NOT adopt #3748 #3749 #3755 #3758 #3760 #3762 #3765 unless C replies "ADOPT #n".
- E (codex): #3763 finished draft (25ac0d2e; all CI + census green, merges clean). OPEN for Bryce: A takes it (ready-gate → full tier → game merge) / review first / leave draft. Do not act without his word.
- #3743 is Bryce's own.

## Bryce's decisions in force
- iPhone = THREE PATH: WEBGPU; macOS gpu-census required for WebGPU-path changes.
- Voice twins = option A (4 default packs). #3690 reverted (#3756 merged). Title warm once per update. SC MIN_HOLD 6 s.
- 2026-10-25 ~21:00 PT "Do all" on the transcript audit: AskUserQuestion — workers never; orchestrator only when the fleet is otherwise idle (put decisions in normal replies while work is in flight).
- Merges resumed 20:12 PT ("Yes let's continue").

## Lessons from tonight
- Post the LIVE line in canonical form. Shell backticks inside bus text get executed — use single quotes.
- A grep Monitor on bus text false-matches quoted text; match the `from:` field.
- send_message to a Fleet B session fails (cross-account) — use the bus or the inbox.
