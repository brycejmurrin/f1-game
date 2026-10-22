# [Orchestrator] A·O25 — successor brief from OrchA 24

Predecessor: OrchA 24, session_01CAsKi9uz44vNYPZfMpFYVd (2026-10-22 09:37Z–13:45Z). Its queue log: scratch/orcha24/QUEUE.md on this branch.
Before that: OrchA 23 brief, cursor/orcha23-queue-a23q:scratch/orcha23/SUCCESSOR-BRIEF.md (read it for fleet comms: DAD webhook, Merlin, rules).
Standing authority: AGENTS.md §Concurrent PRs. Times: Pacific = UTC−7. Bryce plays on an iPhone (844x390). Report changes only; decisions via AskUserQuestion.
WHY HANDOFF: context over the 300k orchestrator cap (Bryce 09:50Z) and 5 worker restarts that each lost 20-60 min. Keep turns short.

## FIRST
1. Bus: `node tools/ci/fleet-bus.mjs send HANDOFF --to '*' --as claude:<you> "ORCH A LIVE claude:<you> (replaces session_01CAsKi9uz44vNYPZfMpFYVd, OrchA 24)"`. Send DAD a webhook INFO with the same line (curl recipe is in the OrchA 23 brief). send_message OrchA 24 "ORCH A LIVE <id>".
2. Timers: a 3-min send_later tick chain, plus an hourly create_trigger safety net bound to you. After each tick, DELETE OrchA 24's safety net trig_01PLYTV1Pcp4tMfm8j6upA4t (OrchA 24 deletes it itself once it sees you LIVE).
   The account BUS WATCH v2 is trig_01BQoC6MiB3rsp8S6pVxqwo6: hourly at :50, disables itself after 3 h of no bus activity, owned by the A orchestrator. Keep it and post a bus line every <25 min.
3. Your own queue branch: cursor/orcha25-queue-<hash>.

## STATE at 13:45Z
- Tip 0ca59bcb (#3538). Its Pages run is pending/running. All earlier trains are green (latest green 14841574).
- I merged #3533 423c721e, #3578 60bf4b4a, #3554 14841574 and #3538 0ca59bcb, each through merge-gate with 2 parents and a DONE line.
- MERGE QUEUE (Fleet A), held with a MERGE-HOLD line that only the orchestrator lifts:
  - #3540 (A·W2 LoopHealth watchdog, game, green): merge after green Pages on 0ca59bcb. Recipe: strip the first body line (`MERGE-HOLD: OrchA 24 …`) with a PATCH, then GAME-SLOT `#<n> <head>`, `merge-gate.mjs --pr <n> --sha <head>`, merge_pull_request (merge, expectedHeadSha, commit_message carrying `Merged-by:` + `Gate:` trailers), `git log -1 --format=%p` shows 2 parents, then DONE.
  - #3575 (A·W7 shared safety bans, .claude+.cursor): DAD APPROVED f69958fc and CI is green. Waiting on BRYCE: keep or remove the overrides APEX_RATCHET_RAISE_OK and APEX_FOREIGN_PUSH_OK (my AskUserQuestion was interrupted by a restart, so ask again). After his answer, A·W7 lifts its MERGE-HOLD with a body edit (no push). Any push voids DAD's approval. DAD's optional follow-ups (a)/(b) go in a separate PR afterwards.
  - #3536 (A·W1 boot): draft, blocked on #3582 (logging.spec order-dependent stall, pre-existing). A·T1 session_01Pb3wA556REW4atdU1tT5Ct (Sonnet) has draft #3585 for it. When #3585 merges, A·W1 (or its successor) syncs #3536 and re-runs hooks.
  - #3581 (A·W5 visor, Fable): draft. Bryce typed directly in W5 that he wants more captures and measurements, references, beams/god rays/bloom. Not ready yet.
- PHANTOM MERGER (unsolved). 12+ merges as brycejmurrin with no DONE: #3504 #3517 #3519 #3550 #3526 #3548 #3531 #3551 #3552 #3553 #3541 #3542, and probably #3481 #3583 (12:06/12:13Z).
  - Pattern: an UNHELD ready Fleet A PR merges within ~1 min of its READY bus line, ignores rule 7 and merge-gate, and NEVER touches a PR with a MERGE-HOLD line.
  - Ruled out: auto-merge (none armed), workflows, every readable Claude transcript, Cursor agents on DAD's key, Merlin and D (both deny). A Cursor "steward" agent (cursoragent@cursor.com, not on DAD's key) pushed onto #3533 and #3536.
  - Bryce says he did NOT merge the first batch by hand; his answer on #3551/#3552 is still pending. Only his GitHub security log (pull_request.merge) or his own Cursor dashboard can settle it.
  - Defence in force: every Fleet A lane puts a MERGE-HOLD line on its PR body BEFORE sending READY (bus c163a6f). The merge-attribution detector (#3578, merged) now comments on any merge with no `Merged-by:` trailer.
  - INCIDENT merge freeze lifted 60bd66b (investigation open). DAD keeps Fleet D merges paused on its own call.
- BRYCE DECISIONS 09:50Z (audit #3568, recorded by A·X1): 1b merge queue HOLD; caps workers ~250k / orchestrators 300k with a hard hand-off; bus watch v2 as above; OQ5 every fleet claims before a launch or PR; 15 Cursor hooks yes. Open: OQ2 "deploy now".
- A+D combined plan for claims, caps and waste (DAD's version: action caps for Cursor, orchestrator claims once at launch, takeover >2 h + owner gone + TAKEOVER HANDOFF + 10 min + no owner commits for 2 h). Not yet put to Bryce as one AskUserQuestion. Do that.

## LANES
| slot | session | state |
|---|---|---|
| A·W1 | session_01Fsqv6M8vKK4dPQ4feEXz4P | #3536 draft, blocked on #3582; near its cost cap |
| A·W2 | session_01JiMURvzGUNueuJd6GB5Qj2 | FINAL; #3538 merged, #3540 held |
| A·W5 | session_01LbyfrAbJw1GJttfbEixYnv (Fable) | #3581 draft |
| A·W7 | session_01XK6UZ9VmijmeXdYUymqWGJ | #3575, waiting on Bryce's overrides |
| A·X1 | session_01Jxz6BMpucD8Gm23RmWTptJ | #3568 audit draft (never ready); only OQ2 open |
| A·T1 | session_01Pb3wA556REW4atdU1tT5Ct (Sonnet) | #3585 draft (closes #3582) |
| FINAL, archive only after Bryce is done | A·F3 session_01N6GgoLRuwh8KPKCZQzyfb1, A·H2 session_017pqnJgpqQpVF7g6ovncKse, A·W4 session_01JW6FonSaKB24Dmua4vxcEy, A·W6 session_01L67YcMZy5zTpG7MA8Rtnyp, A·W8 session_01Byxj7sVEAtPuSYDiSLx7Gf | done |
OrchA 23 session_01LCwqz3kpiVuXkjy8YyJprp still relays occasionally. It has stopped its timers.

## Open asks for Bryce
1. Did you merge #3551/#3552 (10:18Z) or #3481/#3583? Check the security log (pull_request.merge) and your Cursor dashboard.
2. #3575 overrides: keep or remove APEX_RATCHET_RAISE_OK and APEX_FOREIGN_PUSH_OK.
3. Audit OQ2 "deploy now", plus the A+D combined plan (one yes).
4. Follow-ups needing owners:
   - multiplayer-room.spec.js:238 flake (from A·W6).
   - A·W7 finding 8: docs still say `ratchets.mjs --update`; they should say `--update --lower-only`.
   - A·F3 leftovers: #2906, #2501, #3296, #3014, and the .claude skill-doc issues #3355 #3353 #3329 #3328 #3325 #3321.
   - A·H2: CLOSE GARAGE silently discards an edited livery (game.js garageBack).
   - The landscape 1 px QR modules follow-up named in #3542.
