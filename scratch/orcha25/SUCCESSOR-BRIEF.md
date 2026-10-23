# [Orchestrator] A·O26 — successor brief from OrchA 25

Predecessor: OrchA 25, session_01PxJbmePQVZF2h7fR6zSXDN (2026-10-22 13:45Z – 2026-10-23 00:15Z). Older briefs: cursor/orcha24-queue-a24q, cursor/orcha23-queue-a23q (DAD webhook curl recipe, Merlin, comms).
Standing authority: AGENTS.md §Concurrent PRs. Pacific = UTC−7. Bryce plays on an iPhone (TLX + WebGPU, 844x390). Report changes only; decisions via AskUserQuestion. Cap 250k, then hand off the same way.

## FIRST
1. Bus: `node tools/ci/fleet-bus.mjs send HANDOFF --to '*' --as claude:<you> "ORCH A LIVE claude:<you> (replaces session_01PxJbmePQVZF2h7fR6zSXDN, OrchA 25)"`; DAD webhook INFO with the same line (env APEX_AGENT_WEBHOOK_URL/AUTH, JSON {from:"A",to:"D",type,pr,text}); send_message OrchA 25.
2. Timers: send_later tick chain (10–20 min) + an hourly create_trigger safety net bound to you. Then delete OrchA 25's safety net trig_016pVy4EWNRxa6v6aueKqJ11. Keep BUS WATCH v2 trig_01BQoC6MiB3rsp8S6pVxqwo6 and post a bus line every <25 min.
3. Your queue branch: cursor/orcha26-queue-<hash>.

## MERGE RECIPE (per PR)
- Game PR: one per green Pages train. Check `node -e 'import("./tools/ci/merge-gate.mjs").then(m=>console.log(m.pagesGreenFor("<last tip sha>")))'` = true and no pages.yml run in_progress/queued (actions_list).
- Lift the hold with update_pull_request: rewrite the body without the `MERGE-HOLD:` line(s) and add a Plan line "MERGE-HOLD lifted by OrchA 26 at merge". Old DAD hold lines on adopted PRs: lift them too (Bryce adopted all).
- `fleet-bus send GAME-SLOT "#<n> <head>"`, then `merge-gate.mjs --pr <n> --sha <head> --as claude:<you> --fleet A --role orchestrator`, then merge_pull_request (merge, expectedHeadSha, commit_message carrying the gate's Merged-by + Gate trailers), then `git log -1 --format=%p` shows 2 parents, then DONE.
- "mergeable_state unknown": wait ~1 min and re-gate (Monitor, not a sleep chain).
- A bus INCIDENT line freezes merge-gate: always follow it with an "INCIDENT … merge FREEZE lifted" line.

## STATE at 00:15Z
- Tip c698dd09 (#3487). Its Pages run is pending.
- Merged by OrchA 25: #3540 #3585 #3575 #3536 #3532 #3537 #3518 #3539 #3563 #3577 #3543 #3564 #3528 #3565 #3567 #3572 #3487. Closed #3490 (obsolete).
- GAME QUEUE (ready, green, held; in order): #3489 #3524 #3491 (A·O2) · #3566 #3574 #3580 #3573 (A·O4) · #3458 #3475 #3479 #3482 (A·O5). #3581 visor (A·W5) re-READYs after its VISOR BEAMS setting (~1–2 h).
- NON-GAME ready: #3530 #3545 (A·O6); the gate says whether each is game.
- Drafts: #3579 (A·O6, CSS-mask SOUND glyph; Bryce must allow `git rm` of its ratchets.d delta in A·O6's session, then goldens re-bless); #3586 (A·W9; Bryce: "Review it first" on the AGENTS.md/skill edits); #3568 (A·X1 audit, never ready); #3576 stays Fleet D's.
- PHANTOM MERGER: an unknown Cursor agent self-merges UNHELD PRs ~1 min after each green train, with no trailer (#3584 #3529 #3587 #3589 #3590; branch suffixes -28bb / -44e5). It is not A's or D's; Bryce was asked to stop it. Defence: a MERGE-HOLD line on EVERY Fleet A PR, drafts too. No held PR has ever been taken.
- SHARED QUEUE RULE (Bryce yes in DAD chat 16:55 PT; A+D adopted): a GAME-SLOT on the bus is the only claim on a green train, first come first served; every merge goes through merge-gate with a Merged-by trailer. Fleet D merges are paused until Bryce lifts.
- iPhone deep pass: A·I1 session_01HbNLitLPBf1XPZxn5Qrvt7 (Opus) is surveying. D's reports are on cursor/d-iphone-reports @595b6e84 (orphan, never merge). BrowserStack Automate minutes are spent; Bryce said "You use browser, chromium or playwright to tap through live", so A·I1 drives BrowserStack Live itself (no passwords). Its findings doc goes to a draft PR; bring it to Bryce before Phase 2 fixes.
- Live-UI findings artifact (D's file, published unchanged by A·P1): https://claude.ai/artifact/Wjyd8s4Qo7T5T61JjnEhxL (private; Bryce shares).

## BRYCE DECISIONS (this shift)
OrchA 25 merges as orchestrator · #3575 keep both overrides · #3551/#3552/#3481/#3583 not Bryce · A+D combined plan adopted · "adopt all" (D idle PRs, B #3475, Merlin drafts) · owners may push SYNC merges on adopted branches with APEX_FOREIGN_PUSH_OK=1 after telling the orchestrator + ls-remote unchanged (≤40 ratchet absorb for a sync only) · the "Merge Desk" is NOT his (ignore its conversions) · #3528 merge OK · #3579 CSS mask, no new nodes · #3491 merge + track flake (#3591) · #3482 inner hold lifted · archive old sessions (13 archived incl. OrchA 23/24).

## LANES
| slot | session | PRs/state |
|---|---|---|
| A·O2 | session_01KHXxtCPC4RbmgxkGkRPvh3 | #3489 #3524 #3491 ready |
| A·O4 | session_016dYSHaau1KTSbmKGRVarpE | #3566 #3574 #3580 #3573 ready |
| A·O5 | session_015G8byk3tLy6W6GGKNBM4oF | #3458 #3475 #3479 #3482 ready |
| A·O6 | session_01NpE3oFrsSuFajXS4WrP1Lw | #3530 #3545 ready; #3579 draft |
| A·W5 | session_01LbyfrAbJw1GJttfbEixYnv (Fable) | #3581 visor, adding VISOR BEAMS |
| A·W9 | session_01P4T3QVegydddFRrUCg4Eqe | #3586 draft |
| A·X1 | session_01Jxz6BMpucD8Gm23RmWTptJ | #3568 audit draft |
| A·I1 | session_01HbNLitLPBf1XPZxn5Qrvt7 (Opus) | iPhone TLX/WebGPU survey |
| FINAL, archive after Bryce is done | A·O1 session_019uci549rZhw5YDqWWowaUo, A·O3 session_019ce5jA81s3u3QF9z6wd5J6, A·P1 session_01J5EPP4kzMNeP45F71Ffdho | done |
