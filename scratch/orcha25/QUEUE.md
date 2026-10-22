# Fleet A queue — OrchA 25 (session_01PxJbmePQVZF2h7fR6zSXDN)
Branch cursor/orcha25-queue-a25q (never merged). Times UTC (Pacific = UTC-7). Predecessor brief: cursor/orcha24-queue-a24q.

## Timers
- tick: send_later chain; hourly safety net trig_016pVy4EWNRxa6v6aueKqJ11 (:11); bus watch v2 trig_01BQoC6MiB3rsp8S6pVxqwo6 (keep).

## Bryce decisions (to OrchA 25, AskUserQuestion)
- 16:2xZ: OrchA 25 merges as orchestrator (yes); #3575 keep both overrides; phantom merges #3551/#3552/#3481/#3583 NOT Bryce; A+D combined plan ADOPTED.
- 18:3xZ: "Check all open prs and drafts and make sure we spawn workers and owners for them".
- 19:2xZ: takeover "Yes, adopt all" (D idle PRs, B #3475, Merlin drafts).
- 19:3xZ: #3491 one foreign push (unused; head had moved). 19:5xZ: "Yes, and all adopted syncs": owners may push SYNC merges on adopted branches with APEX_FOREIGN_PUSH_OK=1 after telling OrchA 25 + ls-remote head unchanged; <=40 ratchet absorb ok for a sync only.
- #3586 doc edits: Bryce "Review it first" (no grant). #3581: awaits Bryce phone verdict.

## Merged by OrchA 25 (merge-gate, 2 parents, DONE)
#3540 76ab6575 · #3585 13b604d6 · #3575 9d7e4561 · #3536 77fd22a4 · #3532 e405325f · #3537 3d158d32 · #3518 fada98ce · #3539 70f6e7fb. Closed #3490 (obsolete).
INCIDENT freeze lifted f8ee453 (investigation open).
PHANTOM: #3584 6cadb77d 18:59Z unattributed, during a train (INCIDENT 5f4652a).

## Merge order (19:55Z) — game: one per green Pages train (GAME-SLOT + fresh gate); non-game batch
- Train 70f6e7fb Pages running.
- Game READY: #3563 #3564 #3565 #3567 (A·O1) · #3572 (A·O3) · #3487 #3489 #3524 (A·O2) · #3566 #3574 #3580 #3573 (A·O4; lift old DAD hold lines too)
- Non-game READY: #3577 (A·O3)
- Pending: #3491 (CI on a8ec4735), #3458 #3475 (full tier), #3482 (ratchet sync), #3479 then #3529 (combine latches).

## Lanes
| slot | session | PRs |
|---|---|---|
| A·W5 | session_01LbyfrAbJw1GJttfbEixYnv (Fable) | #3581 visor draft, awaits Bryce phone verdict; running 5 remote groups |
| A·W9 | session_01P4T3QVegydddFRrUCg4Eqe | #3586 draft hook follow-ups; AGENTS.md/skill edits await Bryce review |
| A·W10 | session_019Vc6rz21pbo8q3E37o5bft | done (#3537 #3539 READY) |
| A·O1 | session_019uci549rZhw5YDqWWowaUo | D #3563 #3564 #3565 #3567 |
| A·O2 | session_01KHXxtCPC4RbmgxkGkRPvh3 | D #3487 #3489 #3491 #3524 |
| A·O3 | session_019ce5jA81s3u3QF9z6wd5J6 | D #3490 #3518 #3572 #3577 |
| A·O4 | session_016dYSHaau1KTSbmKGRVarpE | D #3566 #3574 #3580 #3573 |
| A·O5 | session_015G8byk3tLy6W6GGKNBM4oF | D #3458 #3479 #3482 + B #3475 |
| A·O6 | session_01NpE3oFrsSuFajXS4WrP1Lw | Merlin #3528 #3529 #3530 #3543 #3545 #3579 |
| A·X1 | session_01Jxz6BMpucD8Gm23RmWTptJ | #3568 audit draft (never ready) |
FINAL (archive only after Bryce is done): A·W1 A·W2 A·W3 A·W7 A·T1 A·F3 A·H2 A·W4 A·W6 A·W8.
D keeps #3576 only.
