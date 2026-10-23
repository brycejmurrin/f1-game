# [Orchestrator] A·O30 — successor brief from OrchA 29

Predecessor: OrchA 29 session_01BxsoWgWZZ5KnibFU4va9ba (08:50Z–11:20Z, context 277k). Base recipe: cursor/orcha28-queue-a28q scratch/orcha28/SUCCESSOR-BRIEF.md (still valid).
Standing authority: AGENTS.md §Concurrent PRs. If auto mode refuses a merge step on relayed authority, ask Bryce via AskUserQuestion; don't work around it.
LINEAGE: OrchA 29 was depth 7 of limit 8, so you are depth 8 and cannot launch a successor session. At your cap, write the brief and ask Bryce (AskUserQuestion) to start OrchA 31 fresh from it.

## FIRST
1. `git worktree add --detach scratch/orcha30-tip origin/claude/f1-game-project-26h3ng` + `ln -s /home/user/f1-game/node_modules scratch/orcha30-tip/node_modules`; run the tools from there.
2. Bus HANDOFF "ORCH A LIVE OrchA 30 claude:session_<you> (replaces OrchA 29)"; DAD INFO via `agent-msg.mjs send --to D --type INFO --no-bus`.
3. Delete OrchA 29's timers: hourly net trig_01URmT11bFYVZCu4N5bAi19T, and the pending tick (list_triggers: "OrchA 29 tick"). Arm your own ~10 min send_later tick + hourly net.
4. Lanes still send READY to OrchA 28/29; OrchA 28 forwards them. A bus HANDOFF to A naming you is enough; message the next 3 in the queue directly.

## MERGE RECIPE (as used by OrchA 29)
1. Check Pages (pages.yml newest run) is completed/success on the CURRENT tip and nothing is queued or running.
2. Trial-merge the PR head onto the tip in the worktree: `node --test tests/unit/source-pin-hygiene.test.mjs`, `npm run -s test:guards` (~1 min), `npm run -s gen:check`.
3. `fleet-bus.mjs send GAME-SLOT ...` as its OWN command and confirm the `= sent` line. A chained command failed silently once, and merge-gate then refused with pacing=FAIL.
4. Lift the hold: `scratch/orcha29/lift.sh <pr>` (in this branch; copy it to your scratchpad). It uses `gh api` REST (GraphQL is 403 here), drops every `MERGE-HOLD:` line and adds a Plan tick. It's needed for long bodies.
5. `merge-gate.mjs --pr N --sha <explicit 40-char head> --as claude:session_<you> --fleet A --role orchestrator`. A `mergeable_state unknown` refusal means wait ~20 s and retry.
6. mcp merge_pull_request (merge, expectedHeadSha, gate's commit_title/message verbatim: `Merged-by: ...` + `Gate: merge-gate <head[0:12]>`).
7. `git log -1 --format=%p` shows 2 parents; run source-pin-hygiene on the new tip; bus DONE.
Non-game PRs batch: merge them right after a game merge, before its train settles. The newer push replaces the pending train, so one train covers them all.
If a refusal shows a conflict, put the MERGE-HOLD line back (prepend via gh api PATCH) and ask the owner to run sync-pr.

## STATE at handoff (11:20Z / 04:20 PT)
Tip 70ba34c6. Merged by OrchA 29: #3479 e64e4259, #3581 visor 0c2eea6c, #3612 678e3239, #3620 23724027, #3616 70ba34c6. Bryce merged without bus lines: #3615 bf95b3ca (02:42 PT), #3639 25f7e0fb (03:33 PT). Each replaced the pending train, and runners were saturated (152/40 at 09:42Z). Last green Pages: 25f7e0fb (10:58Z). The Pages run for 70ba34c6 starts on push; wait for green.

## GAME QUEUE (one per green Pages; all READY, holds on, head sha at READY time; re-read the head before gating)
1. #3482 5887630b (A·O5 session_015G8byk3tLy6W6GGKNBM4oF)
2. #3614 67310e25 (A·W16 session_014WbDdmXsZLiGKwLRyX5ULF): CAUTIONS-off storm SC, Bryce's bug
3. #3621 4914526c (A·W23 session_01EpKJFTTbt6sEgpaQbbD9aB): closes #3294, governor crash floor
4. #3618 319a8efa (A·W14 session_01GCovo9sNCsQDm2At4sZXA9): night/rain pre-warm
5. #3640 (A·W14): BOOST first-tap stall fix (double-sided `_rigFxA` ERS bar missing from `_LATE_LIT`). Wait for its READY; A·W14 does #3618 → #3631 → #3640
6. #3625 6bd7cf2f (A·W19 session_01TqBaFYk2yQp6kDXkieKpUf): photo mode Space
7. #3624 fd8d5d24 (A·W21 session_01JSWD3jDyoc69QPVpJ26NSm): aero zones
8. #3630 7dca892d (A·W26 session_01NVWCfQK87cwVkfQrcWRUHn): dead KIT_DEF/DevFlags
9. #3629 4cc99316 (A·W22 session_01BE1zQKg1HNBkkY27pj5fTA): ICE restart
10. #3626 18c8bbfd (A·W18 session_01DPvddTBeSVdGZrYb9EcpgK): stepped build ≠ context loss
11. #3619 0585facb (A·W20 session_018xiZcGDPQiqj2KinrTPU4q): audio rebuild deferred
12. #3622 e1ae7796 (A·W17 session_018657mB6hb4RbfbwADnGxxG): bare-world scenery retry
13. #3627 2d90fe62 (A·W24 session_01A5Z3VH3L8fftrRnWKzfqcy): #3606/#3591 (Log.warn in game.js)
Also expected: #3631 (A·W14, mirror-prep diagnostic). Is it game? Check its paths.
NON-GAME: #3611 (A·W15 session_01AhiowZLuQxUq1eLzZb7BZw) conflicts with #3612 on tools/perf/devicefarm-iphone.mjs. A·W15 is syncing; I re-set its MERGE-HOLD. Batch it with the next game merge once it's green.
Fleet D (#3599 #3595 #3596 #3613, #3279 GPU profiler, which may carry one gen-shell index.html line, OK'd by OrchA 29) merges its own, behind A.

## LANES / NOTES
- A·O6 session_01NpE3oFrsSuFajXS4WrP1Lw: device lane done (grant spent). #3579 is BLOCKED on Bryce: the sandbox denies `git rm` of its ratchets.d delta.
- A·D1 session_01Wj2vjHSTC5X7jPwXkJEuJD: #3612 merged. Ledger now says each DF session bills ~13 device-min minimum (incl. STOPPING).
- A·O5: perf pass closed (night circuits run ~60 fps on iPhone 14, no skyline cull). Holds #3482.
- A·W15: BOOST root cause found (first-use WebGPU pipeline for the ERS bar); fix is #3640.
- A·W14: worktree note: `tests/unit/safety-bans-hook.test.mjs` test 5 fails in any scratch/ worktree (env artifact).
- A·X1 #3568: row #10 marked "measured, no change". A·W9 #3586 idle. Open Bryce question: close #3586 / #3568?
- Device farm: 18 Pro Max free since 10:14Z; iPhone 14 back with D.
- Runner jam 10:10Z: asked D (bus 0d64cd8 + webhook) and A lanes to hold load until ~10:35Z; no DAD reply seen. Lifted by time.
