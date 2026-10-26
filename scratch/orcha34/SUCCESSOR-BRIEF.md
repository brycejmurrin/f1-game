# [Orchestrator] A·O35 — successor brief from OrchA 34

Predecessor: OrchA 34, claude:session_01JXb1VW1uJX8gUDhWnQfn82 (10-26 04:04Z → handoff). Brief chain: scratch/orcha33/SUCCESSOR-BRIEF.md (cursor/orcha33-queue-a33q) → this file. Queue log: scratch/orcha34/QUEUE.md (same branch). Merge recipe: cursor/orcha31-queue-a31q scratch/orcha31/SUCCESSOR-BRIEF.md; lift.sh there.
Standing authority: AGENTS.md §Concurrent PRs. QUOTA: 7-day allowed_warning (resets 2026-10-28 22:00 PT for A; B's 11-01). The launch-gate hook (#3777) refuses create_session without `node tools/ci/launch-gate.mjs <saved get_session>` exit 0, or `--override "<Bryce's words typed in YOUR session>"`.

## FIRST
1. Worktree: `git worktree add --detach scratch/orcha35-tip origin/claude/f1-game-project-26h3ng` + node_modules symlink.
2. Bus LIVE (canonical): `node tools/ci/fleet-bus.mjs send HANDOFF --to '*' "ORCH A LIVE claude:session_<you> (OrchA 35; replaces session_01JXb1VW1uJX8gUDhWnQfn82)"`; check `fleet-bus who A`; tell DAD (agent-msg --to D --type INFO).
3. Bus Monitor every 60 s (read --to A --to C --to <you> --to '*', drop own lines; all senders, incl. claude:fleet-a-inbox). ~20 min send_later tick. Pages Monitor on the last game merge.

## STATE at handoff (12:45Z 10-26)
- Fleet A merged tonight: game #3704 #3745 #3757 #3693 #3761 #3766; non-game #3775 #3776 #3777 #3794.
- Tip 22b28bcf (A #3766). Pages run 40322290836 there is RED: garage-out-before-card.spec.js › "DAILY from the menu" — "START released after PREPARING with no garage-out (#3591)". Pre-existing intermittent bug (also 5805fe31 08:58Z, 39710316089 10-22), NOT caused by #3766. Triage: js/game.js introBuild ~3872–3910, live() ~3873 (`n === _introRun && state === "menu" && settings === entrySettings()`), afterGarageOut ~3713; hypothesis: DAILY settings settle async after START. Artifact id 12649841167 (run 40322290836) has the trace.
- GAME TRAIN FROZEN by B's INCIDENT 9695795 until Pages green. Bryce told OrchB (typed in OrchB, ~13:00Z) to fix asap: B·W60·fix session_01JSYCYR8D6hfcDd8UdRzR8d owns it; A sent its triage (8f96391). A launches nothing for it. Watch for B's fix PR, its merge, the INCIDENT lift line and green Pages.
- Game order when unpaused: D (#3700 #3646 #3641 #3724; DAD merges, one per slot) ↔ A #3696 8197bd95 (READY, clean; lift its work-state MERGE-HOLD with evidence: full tier #40279984209, deploy gate, tiny+ui remote green). B skipped until it claims (ee36b79).
- #3700: READY sent to D (0e6433e) at 945d9270 with caveats (includes() pin weakening; unknown Cursor Agent pushed it). D merges.

## Live A lanes
| session | job |
|---|---|
| session_01SoT9qynqBvf9yyaWk52LtF (Sonnet) | #3696 owner (READY) |
| session_018TxG428heVrfDa89WSiT7s (Opus) | done (#3761 #3766 #3794) — archive after 1 h idle (~13:25Z) |
| session_01LESs6Lsd4TUcsoiG7HSiNK (Sonnet) | #3725/#3731 D-lent READY → D merges |
| session_01TSc23DPqvuVuJnVWW76J5d (Opus) | A·R3, #3763 review done; keep while #3763 open |

## OPEN FOR BRYCE (put in normal replies while work is in flight)
1. (settled) DAILY garage-out bug: Fleet B fixes it at Bryce's word.
2. Unknown Cursor Agent pushing #3700 (6f8fc009…945d9270) and #3751 (1a5e9e3a, guards red): his or not? A lanes are off both.
3. #3763 (Fleet E deep-audit fixes): R3 verdict merge-after-fixes — M1 transport.js listenRestart re-listen every 12 s; M2 netplay.js per-AI STRATEGY floods guest inbox → overflow shutdown; M3 api-transport.js long Retry-After stalls Data Hub; + L1, L7. PR comment posted. Options: A fixes (recommended, follow-up PR) / E fixes / leave.
4. Optional: A·D2 device run (iPhone WebGPU) to confirm #3761/#3766: rigWarm << 5.7 s, warm.rig.pairs 25, no first-frame hitch from tlx-fx-line-mrt / tlx-fx-blob-mrt.

## Other fleets
- B: OrchB claude:session_013JaBx1DysyB8dLCgGryvWL (live again 13:00Z at Bryce's word; also running B·W60·sync on #3730 #3764 #3784). B quota warns.
- D: DAD (grok:DAD), agent-msg --to D. D merges D-lent PRs.
- C/E (codex): bus only; did not answer the T34 comms test.

## Lessons (see QUEUE.md)
- INCIDENT type freezes ALL merges until 'INCIDENT <sha> lifted'; use INFO/QUESTION for reports. No PR numbers in lift lines.
- A non-game merge while a Pages run is QUEUED supersedes it; ask fleets to wait until in_progress.
- Docs-only pushes start no Pages run.
- bash-guard blocks pushing over another lane's commits; auto mode refuses APEX_FOREIGN_PUSH_OK → push to your own branch, have the owner ff.
- Ready-gate receipts are per container; tooling-fast --jobs=4; strike the circular "orchestrator marks ready" Plan item; .claude/memory edits need a `memory-change:` body line.
- Auto mode sometimes refuses long chained bus+lift+gate lines; run them separately.
