# Fleet B queue — OrchB 25 (session_01SoGgREcrd12Mx6CsVHiDDs)

Live state, refreshed and pushed every tick (branch `cursor/orchb25-queue-o25q`, never merged).
A successor reads this first. Times UTC (Pacific = UTC−7).

Updated: 2026-10-21 04:41Z

## Gate state
- Pages 39541119371 on a437375b SUCCESS → INCIDENT lifted 04:05Z.
- Last game merge: #3390 → 9416abb3 (04:06Z). Next game merge waits for green Pages on 9416abb3.
- Pages 142f52af (non-game) running.

## Merge order
Non-game first (batch, each gated on the tip the previous produced):
1. DONE #3397 → a437375b (03:54Z)
2. #3398 pick-cost spec invariants (tests) — owner B·H13 → B·H17 — READY-pending @3ea15567 (draft fast tier running; 3/3 local)
3. DONE #3394 → 54971095
4. DONE #3393 → 142f52af. Pages: a437375b running, 142f52af pending.
→ the merge of 1–4 triggers a new Pages run; INCIDENT lifted only when it is green.

Game, one per green Pages (GAME-SLOT on the bus first):
5. DONE #3390 → 9416abb3
6. #3377 memory pins + qualiField bug — B·H12 (wrapping up, handoff pending) — dirty, sync in progress
7. #3385 race-entry cover (−1 s to lights) — B·H18 — fix pushed 33ae2e355 (policies.json rows), CI running
8. #3238 parts-livery (Bryce/Cursor author) — B·W13 watches — full tier re-running @c7fdcdc57
9. #3382 boot/title — B·H16 — READY, full tier PASSED @d3531832 (move up: 2nd game after #3390)
10. #3386 garage-prebuild quiet gate (+ Car3D build slice) — B·H16 — draft, stacked on #3382
11. #3388 settings reload + hunt fixes — B·H20 — draft, needs tooling-fast + CI
12. #3391 CI leak gate — B·H12 — on #3377
13. #3392 two leak fixes — B·H12
14. #3395 editor atlas keep + helmet memo — B·H17 — waits for #3385
15. #3396 TLX road split — B·H15 — draft, needs pixel diff + gpu-census Verdict
Draft, docs: #3399 W11 perf fresh-hunt list (fold into W11 governor PR)
#3230 garage livery (Cursor) — Bryce signed off the look 03:51Z ("Looks good, ship") — game queue, green @0f52d3b96
Not ours: Fleet D #3301 #3309 #3310 #3357 #3358 #3359; Cursor #3387.

## Lanes
| slot | session | model | owns / next |
|---|---|---|---|
| B·W13 tools/CI | session_01PD38FDVNkjDJyJeAwfnqar | Sonnet | #3394 #3393 #3238 #3230; 3-shard tooling split; D2/D3 need Bryce's typed grant in W13 |
| B·H15 render | session_013RkCKRatdbAProsEheWyUB | Opus | #3390 #3396; then W11 items 6/7/8/12 |
| B·H16 boot | session_01TC31we79tZ7DYLFuS5N6P1 | Opus | #3382 #3386 (+Car3D slice); TLX warm split; TLX heap |
| B·H17 car | session_011JszNgNA2YdTFQLX5vYpqm | Sonnet | #3395; paint-only recolour round; takes #3398 if H13 hands it over |
| B·H18 race entry | session_014V2r1GZe6gNfZswk9ZFctB | Opus | #3385; PR B step gate; PR C F2–F9 |
| B·H20 input/HUD | session_01G7Wwq9dTUCBJFkS9XguCyw | Sonnet | #3397 #3388; then phone input/HUD hunt; W11 items 9–11 |
| B·H13 (retiring) | session_01B7KYWMrBF7UBzxnXns5Vqg | Opus | finishing #3398, then archive |
| B·H12 memory (retiring) | session_01DYKmSLS6Zs68QChmoZ4jLj | Opus | HANDOFF pending → launch B·H19 memory |
| B·W11 (KEEP, Bryce's task) | session_01GvgaEXjiHbDmx1spq3tgop | — | perf fresh hunt; measuring 1/2/5/12, governor PR |

Archived: W12, H8, H10, H11, H14, OrchB 24.

## Asks for Bryce
Answered 03:51Z: D2/D3 → he types the grant in W13; #3230 → ship; Android A/B → skip for now.
New draft: #3400 W13 tools/CI (test-timeout + notes; shard split after #3394).
H16: car-build slice PARKED (decision A); next = garage prebuild hidden-frame stall (4.5–5.8 s title task) on real GPU.
H17: worktree off #3385 for atlas-drop + car render-cost hunt.
Pending:
- W11 item 4: Android AUTO picks three-WebGPU — on-device A/B.
- D2/D3 grant: type it into B·W13's session when it asks.
- Delete throwaway branches: cursor/live-memory-h12a-hold, cursor/probe-tip-w12a, cursor/probe-3356-w12a, cursor/revert-prep-yield-h8r1.

Memory branch cursor/orchb25-memory-o25m @24af5d72: W13 refused (.claude/**); OrchB carries it in its own PR.

## Adopted unowned PRs (04:01Z, Bryce "pick up any prs not owned")
- B·O-T session_0154i4afT4VnyosoG3TD6N4Q (Sonnet): #3301 #3310 #3359 (D·W8 tools)
- B·O-G session_01WpNcoEk9bXpGLimvzhLSV4 (Sonnet): #3376 #3309 #3357 #3358 — proposes a train
- B·H19 memory session_016TYNhEamegWQ9c5jxQCqhg (Sonnet): #3377 #3391 #3392 (H12 archived)
- Left alone: #3387 (MERGE-HOLD by Bryce). New drafts: #3400 (W13, incl. D2/D3 receipt 30→10 min), #3401 (H18 step gate).

Decisions 04:05Z: O-G train = A+3376 (#3309+#3357+#3358+#3376 in one train PR; originals closed as superseded). O-T: #3301 before #3401. #3359 has MERGE-HOLD (Bryce review of commit gate) — ask Bryce.
Next game order: #3382, #3385, #3230, #3377, #3238, O-G train, #3386, #3388, #3391/#3392, #3395, #3396. Non-game gaps: #3398, #3301, #3310, #3400, #3401.

04:18Z: Pages 142f52af SUCCESS; 9416abb3 (#3390) running since 04:06. GREEN+READY game: #3382, #3385 (full 43/0), #3377 (full 58/0) → merge in that order, one per green Pages. Train #3402 open (originals #3309/#3357/#3358/#3376 CLOSED as superseded). Non-game waiting on CI/Plan: #3398, #3400 (incl. D2/D3), #3310 (ready, full running), #3301 + #3359 (fixes committed by O-T), #3401, #3391 (separate, non-game).

04:41Z: MERGED since 04:18 — #3400 153f4dae, #3310 c6535c78, #3398 2fc7a8fe (non-game). Pages 9416abb3 (#3390) RED = js-debugger-node R4 flake (not #3390; W13 deflaking); Pages c6535c78 running = verdict for #3390. Game queue (all READY+green): #3382, #3385, #3377, #3238, #3230. Non-game ready next: #3401 (after #3301), #3359 (hold lifted by Bryce 04:37Z; O-T readying). H13 archived; all old lanes archived.
