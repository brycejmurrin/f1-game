# Fleet B queue — OrchB 26 (session_01WeajNossivepp1z8e1mgCq)

Live state, refreshed and pushed every tick (branch `cursor/orchb26-queue-o26q`, never merged).
A successor reads this first. Times UTC (Pacific = UTC−7).

Updated: 2026-10-21 05:14Z

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

04:47Z: Pages c6535c78 SUCCESS (#3390 confirmed). MERGED #3382 → eda39fd5 (game). Pages 2fc7a8fe running; eda39fd5 next. Game queue: #3385, #3377, #3238, #3230 (all READY+green). Non-game: #3359 (full tier running), #3403 (R4 deflake, W13), #3301→#3401, #3391. Decisions: H16 owns tlx.js startProgramWarm fix (hidden-frame 3.8 s stall); W11 item 5 (physics catch-up cap) parked as Bryce's feel call. Roll call 04:42Z: 8/10 replied (H17, H18 pending).

05:00Z: MERGED #3359 → e44df10d (hold lifted by Bryce 04:37Z); #3401 → 9d560b86 (merged by someone else). Pages: 2fc7a8fe SUCCESS, eda39fd5 (#3382) running. H16 → B·H21 session_01TWn85zRhZXGUL3FqTvdgno (Opus): #3386 (READY), #3408 (tlx startProgramWarm stall fix, draft). TLX heap lead (+59 MB ArrayBuffers: 27 MB BufferAttribute copies, pack bytes) → B·H19. H17 over context (231k) → HANDOFF pending; H18 ~170k → HANDOFF after #3406. Game queue: #3385, #3377, #3386, #3238, #3230. Non-game: #3403, #3391, #3301.

05:14Z: MERGED #3403 → 7b6a3a75 (non-game), #3385 → 50cc71dd (GAME). Pages: eda39fd5 SUCCESS; 7b6a3a75 running; 50cc71dd next. Game queue: #3377, #3386, #3238, #3230; then #3406 (H18, F6+F9), #3408 (H21, startProgramWarm + ctxLost regex), #3402 train, #3395 (H22, incl. far body — Bryce 'Ship on the numbers' 05:04Z), #3396, #3388, #3399. Non-game: #3391, #3301. Lanes: H17→B·H22 session_01Pn6fvwxngydHg9299ED2TQ; new B·H23 session_01NEB1N6hdJnAAFNPZC23NNu (phone TLX vs GLX side-by-side gallery; Bryce 05:12Z 'Keep both but test side by side first'). H19: pack-bytes + audio copies (mirror-release lever stays parked).

05:17Z: OrchB 26 live (replaces OrchB 25). Pages: 7b6a3a75 running, 50cc71dd (#3385 game) pending. Next game: #3377 after green Pages on 50cc71dd.

05:22Z (OrchB 26): Pages 7b6a3a75 SUCCESS; 50cc71dd (#3385) running. OrchB 25 archived. Lanes messaged (11).
Game order now: #3386 (H21, only Plan tick missing) → #3377 (H19, CONFLICTING, syncing) → #3238, #3230 (W13, CONFLICTING, syncing) → #3406, #3408, #3402, #3395, #3396, #3388, #3399.
Non-game: #3391 draft (gen conflict), #3301 draft (Structural guards pending). #3392 orchestrator sync running in OrchB 26 container (artifacts/logs/sync-3392.log).

05:31Z: Bryce "have a new session and existing one get 3230 across the line" → launched B·H24 session_01NPqh5hrzzRJ4mnETEiWNwK (Sonnet, PR owner #3230: sync/CI/ready-gate); B·W13 hands notes + reviews, keeps #3238. #3420 memory PR: Bryce granted .claude edit; run-ci label added. Branch deletes (4) refused by bash-guard → Bryce deletes on GitHub.

05:27Z: READY #3386 0a8e3803 (Plan ticked) = NEXT GAME after green Pages 50cc71dd. READY #3406 f53038dd (H18 HANDOFF/FINAL — no owner now; a red needs a new owner; F4/F5 → H22). #3377 9ce052aa: H19 says ready, gate says conflicting → H19 re-checks. #3301 O-T READY, full tier running. #3402 O-G remote-group ui running. #3396 H15 tooling-fast + gpu-census next. #3408 H21 A/B next. #3388 H20 pushing 8441ed54. H19 new: pack-bytes (tlx.js createTextureArray) draft coming; H15/H21 warned. H23 gpu-census run 39549012663 (approved by OrchB 25). Inherited tip red perf-frametime.spec.js frametimeBench → W13.
Game order: #3386, #3377, #3406, #3238, #3230, #3399, #3408, #3402, #3395, #3396, #3388. Non-game: #3301, #3420, #3391, #3392.

05:28Z: W13 HANDOFF (~145k) → launched B·W14 session_0144ZhHaiYCj81KpXwWcoeoh (Sonnet): #3238 @38ebaddf (full tier running) + tip red perf-frametime. #3230 already synced by W13 → 62bdd71e (full tier running); B·H24 watches → READY. #3388 H20 pushed 8441ed54 (fast tier). H15: #3396 clear of createTextureArray.

05:38Z: MERGED #3301 → c0cf1bb8 (non-game). O-T done. #3422 H19 pack-bytes (game, draft). #3377 H19 syncing. Pages 50cc71dd still running (several workflow_dispatch runs on it).

05:45Z: LESSON: Pages "running" on 50cc71dd was only the schedule/dispatch check; my #3301 push superseded the real gated deploy. #3385 verdict = Pages on c0cf1bb8 (push run 39550713769, running green so far). Extra workflow_dispatch runs were Fleet board (fleet.yml), not Pages. #3399 GREEN (W11 handing off after DONE). #3392 sync: tooling-fast timed out at 450/811 (0 fails, box load 6) → resumed --from=test:game-vm-a --push. #3420 ready, full tier running.

05:48Z: Bryce phone renderer: "Keep TLX default" (H23 recommended GLX; gallery claude.ai/artifact/5UpT6gsdr4QyHcy3WxqFCr). H23 records it on #3419 (docs) → READY → stop. Open TLX phone gaps: missing clouds/stars, +30-50 MB, 19.1 s race entry. #3406 GREEN (H18 done). #3408: decision (C) ship ctxLost regex only; noEnv warm → follow-up PR with same-base 2x census (H21). Train #3402: decision (1) drop #3357 one-step BACK, follow-up. W14: perf-frametime = local box speed, not a tip red; standing down.

05:53Z: Pages c0cf1bb8 SUCCESS (deploy + live shell) → #3385 confirmed. MERGED #3386 → b2457484 (GAME). Next game #3377 after green Pages on b2457484. Non-game #3420 when b2457484 Pages push run is in_progress. #3388 H20 pushed 75ba1a2c.

05:57Z: Game order (Bryce wants #3230 soon): #3230 (H24, head e33054a9, full tier running) → #3377 → #3406 → #3238 (W14) → #3399 (W11 archived on Bryce OK; red → fresh worker) → #3408 (C) → #3422 → #3402 → #3396 → #3395 → #3388. W13 archived itself. #3408 follow-up (noEnv warm) parked in body (H21 FINAL after READY). H15 OK for renderer-picker one-liner. W11 follow-ups: PERF-FRESH-HUNT-2026-10-21.md items 6-8 → H15, 9-11 → H20.

05:59Z: MERGED #3420 → 91098189 (non-game, in b2457484 Pages gap). Pages b2457484 push run 39552066410 in_progress.

06:06Z: READY #3230 e33054a9 (H24, full 47/0, ready-gate ok) = NEXT GAME on green Pages b2457484 (watcher armed). Also READY/green game: #3406 f53038dd, #3238 38ebaddf (W14), #3399 e105abe5; READY full-running: #3388 75ba1a2c (H20), #3408 985ac0f4 (H21 FINAL), #3422 acb2d060 (H19). #3377 H19 resyncing. W11 archived (Bryce OK).

06:1xZ: Pages b2457484 GREEN (#3386 confirmed). MERGED #3230 → 3d13be81 (GAME, Bryce priority). Next game #3406 after green Pages on 3d13be81; then #3238, #3377, #3399, #3408, #3422, #3388.

06:22Z: GREEN game waiting: #3406 #3238 #3399 #3388 (H20 full 40/0) #3408 (H21 full 24/0). #3230 H24 FINAL. #3429 H20 input hunt draft. Pages 3d13be81 push run in_progress; watcher bbw0ad7dr armed → #3406 next.

06:33Z: Pages 3d13be81 GREEN (#3230 live). MERGED #3406 → a013cbc6 (GAME). Next game #3238 after green Pages a013cbc6. #3396 READY (H15, full tier running). #3395 full tier red 1/516 vm-b2 (H22 triaging).

06:43Z: Bryce: title fit at 844x390 wins over bigger landscape taps ("Fit wins, drop bigger taps") → O-G drops #3309 CSS floors from train #3402, follow-up must fit. #3429 H20 READY (full running), H20 FINAL after. #3396 READY (H15).

06:47Z: #3392 sync pushed 6545eee7 → H19 (run-ci). #3422 READY full 24/0. #3377 H19 verifying merge via --changed (box overload). Pages a013cbc6 running → #3238 next.

06:53Z: Game next = #3399 (then #3388 #3408 #3422 #3396; #3238 re-CI 60f0e020 after #3230 dirtied it). #3396 full 40/0. H15 new draft #3431 (flare depth only when sun on screen); H15 FINAL after. Train #3402 abc37eae (fit wins applied) ui re-running.

07:00Z: Pages a013cbc6 GREEN (#3406 live). MERGED #3399 → cedf3811 (GAME). Next game #3388 after green Pages cedf3811. #3419 READY (H23 stopped), CI running → non-game gap.
07:01Z: #3408 merged → cd8b4297 by someone else (no bus line; likely Bryce) just before #3399. Pages cedf3811 covers both. Next game #3388 → #3422 → #3396 → #3238 → #3377 → #3429.

07:17Z: Pages cd8b4297 (#3408) in_progress; cedf3811 (#3399) pending behind it. #3419 READY+gate ok → merge once cedf3811 run starts. H20 FINAL: #3388 then #3429 (both input.js; #3429 may need sync). H23 stopped.

07:23Z: Pages cd8b4297 GREEN (#3408 live). MERGED #3419 → 4929f6fb (non-game, in cedf3811 gap). Next game #3388 on green cedf3811.

07:28Z: #3238 READY again 60f0e020 (full 56/0). #3377 ddecc85f pushed (811/811 local), full tier running. Game order: #3388 → #3429 → #3422 → #3396 → #3238 → #3377.

07:35Z: #3395 READY 28ad016b (H22 FINAL; F5 parked: needs game.js race-start hook). #3402 READY (O-G, full running). #3431 READY a6557422 (H15 FINAL, full running, no watcher). H15 flagged TLX spec "shipped unset backend boots TLX" failing alone on tip locally → W14 checking CI-red vs local-only. Open render follow-ups: #7 #8 #12 need measurements; GLX flareMaybe glx/post.js:536 same over-keep.

07:45Z: Pages cedf3811 GREEN (#3399 live). MERGED #3388 → cadeca7f (GAME). Next: #3429 (may need sync vs #3388 input.js) on green Pages cadeca7f, then #3422 #3396 #3238 #3395 #3402 #3377 #3431.

07:50Z: #3377 READY ddecc85f (full 58/0). Dispatched ci.yml on #3391/#3392 branches (no CI had started); H19 readies after green. #3429 next on green Pages cadeca7f.

08:08Z: Pages cadeca7f GREEN (#3388 live). #3429 → 19d6592e and #3377 → a2644006 merged outside the bus (likely Bryce). Next game #3422 on green Pages a2644006; then #3396 #3238 #3395 #3402 #3431. #3402 GREEN (O-G).

08:45Z: Pages a2644006 still running (62 jobs 0 failed). #3392 db582ea2 ready, full tier running (non-game). #3391 resyncing (gen-only).

08:47Z: Pages a2644006 GREEN (#3429 #3377 live). MERGED #3422 → 7bcaca5c (GAME). Next game #3396 on green Pages 7bcaca5c; then #3238 #3395 #3402 #3431.

08:55Z: #3396 → 6c631c57 merged outside the bus (likely Bryce), on top of #3422. Next game #3238 on green Pages 6c631c57; then #3395 #3402 #3431 (H15 GREEN 24/0).

09:14Z: Pages 7bcaca5c GREEN (#3422 live). Pages 6c631c57 (#3396) running → #3238 next. #3392 red fixed by H19 (3c64369b, data-lifecycle probe), re-running. #3391 fa80203b synced, CI running.

09:18Z: INCIDENT: Pages RED on 6c631c57 (#3396): macOS Metal renderer specs (test:gfx). Game merges frozen; ci-red-triage running.
09:24Z: Triage: image-grade-visual "blacks visibly change deepest detail" flaked on Metal (0.746 vs >1, retry pass) → FAIL_ON_FLAKY red. W14 owns quarantine PR + follow-up A/B tlxRoadSplit. Game merges frozen.

09:55Z: #3433 (quarantine) READY 50a13bc4, full tier running → merge when gate passes, then Pages green before #3238.
09:57Z: MERGED #3433 → 34827018 (quarantine). Game merges resume on green Pages 34827018: #3238 → #3392 → #3395 → #3402 → #3431.
10:01Z: Pages 34827018 GREEN → INCIDENT lifted. #3238 → c79b7826 merged outside the bus (likely Bryce). Next game #3392 (3c64369b) on green Pages c79b7826; then #3395 #3402 #3431.
OPEN follow-up: image-grade pass-on-retry cause unestablished → gpu-census macOS A/B apex26.tlxRoadSplit=0 vs 1 (#3396 suspect); quarantine row expires 2026-11-04. W14 FINAL.
10:07Z: INCIDENT 2: Pages RED c79b7826, VF6 vm-filename-lint 600>599 from #3238. H19 owns fix PR. Game frozen.

10:38Z: MERGED #3434 → 5b036201 (VF6 fix). #3391 next in the gap once 5b036201 Pages is in_progress. Game resumes on green Pages: #3392 #3395 #3402 #3431.
10:43Z: H19 FINAL (audio voices: zero findings, by design). Open: TLX +60 MB vs GLX at menu; mirror-release lever (−20.6 MB iPhone, default-off) needs macOS census A/B + Bryce product call. Flakes seen: agent-output #28 (pids.json race), workflow-harness #6 under load. sync-pr tooling-fast 20-min cap times out on loaded box.
10:45Z: MERGED #3391 → d067d17b (non-game). Game resumes on green Pages d067d17b: #3392 → #3395 → #3402 → #3431.
11:03Z: Pages d067d17b GREEN → INCIDENT 2 lifted. #3392 → 9ab83802 merged outside the bus (likely Bryce). Next game #3395 on green Pages 9ab83802; then #3402, #3431.

11:24Z: Pages 9ab83802 GREEN (#3392 live). INCIDENT lifted line posted. MERGED #3402 → 141be4bb (GAME, UI train). Next: #3431 on green Pages 141be4bb. #3395 CONFLICTING, owner H22 gone → needs a sync owner.
11:32Z: #3395 sync STOPPED on real conflict js/car/car-draw.js → launched B·H25 session_01MjgeR2rfQBC3baMa2L7eCc (Sonnet, replaces H22) to resolve + CI + READY.
11:33Z: O-G FINAL. #3402 follow-ups: one-step title BACK (+8 spec updates), landscape tap floor fitting 343px @844x390, menu-traversal 5 s wait flake (not quarantined). Not run on #3402: camera/hud-layout/time-trial groups → Pages 141be4bb is the check.
11:42Z: INCIDENT 3: Pages RED 141be4bb HARD: photo-studio-conditions lighting + menu-traversal pause/DISPLAY timeout, from #3402 train (suspect layers.js anyOpen gateMemo). O-G fix-forward or targeted revert. Live stays 9ab83802.
11:50Z: OrchB 26 near 200k context → SUCCESSOR-BRIEF.md written; asking Bryce to approve OrchB 27.
12:21Z: #3395 READY 47a7a5d7 (H25). #3435 READY, full tier running.

12:58Z: #3395 → 12ff726a and #3435 (fix) merged by Bryce. Watch Pages on tip 5bffc901: green → post `INCIDENT lifted` line → #3431 (last game PR). OrchB 26 at context cap → handoff.
