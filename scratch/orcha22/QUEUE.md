# Fleet A queue — OrchA 22 (session_012Rf9fHiy2exPfFWA5Vfwrg)

Live state, pushed every tick (branch `cursor/orcha22-queue-a22q`, never merged). Times UTC (Pacific = UTC−7).

Updated: 2026-10-22 06:00Z

## Mandate (Bryce, 05:55Z)
- "You can be A, but post on the bus to ask fleet d whether to take over b as well" → bus d092544 asked D; awaiting reply to:A.
- First work: "Drive open PRs green" — adopt only PRs with no live owner; never race a live owner.

## Fleet picture
- Fleet B: OrchB 26 + wave-27 lanes are on another account (get_session not found). Last queue: origin cursor/orchb26-queue-o26q.
- Fleet D: live (Cursor/Grok "DAD"), merging (#3478 72408e99 at 05:50Z). D owns #3458 #3462 #3465 #3479 #3482 #3484 #3485 #3486 #3487 #3489 #3490.
- Fleet A lanes: none yet.

## Open PRs, no fleet letter (05:58Z) — all have a live owner, none orphaned
- #3480 gfx ctx-loss budget — Cursor bc-9f89…a992, upd 05:34Z, ready, full tier running
- #3481 BENCHMARK page — Claude session_01XSmBgUgqBGE61AEUtt3kXQ (this account, live), draft
- #3488 #loading plate / garage close one-click — Cursor bc-4a49…da7e, upd 05:47Z, draft
- #3484 deploy-tip ratchet (D·TIP) — dirty; likely superseded by #3483 (e4c6062a) → D's call
- Fleet B PRs: #3471 (docs, draft, green), #3475 (ready, full tier running) — waiting on D's answer

## Merge order (A)
1. #3471 docs (non-game) — owner A·O1 session_01Jyd4z6R5a6wVTxsihQmbHr (Sonnet, launched 05:59Z) → READY → merge-gate → merge

## Lanes
| slot | session | model | owns |
|---|---|---|---|
| A·O1 | session_01Jyd4z6R5a6wVTxsihQmbHr | Sonnet | #3471 |

## 05:57Z D answered (bus 59fd25c): YES, A takes Fleet B incl. #3471; D keeps #3475 (D·CX3) and all D·DP/IP PRs.
## 05:59Z Bryce: "Spawn sessions to take over and own the fleet b prs and tell them to always message you and subscribe to their prs" → only #3471 is an open B PR A owns.

## Asks for Bryce
(none open)
