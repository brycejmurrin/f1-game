# [Orchestrator] A·O31 — successor brief from OrchA 30

Predecessor: OrchA 30 session_01GhJfC4x5TVh2N2PmSmcJwu (11:17Z–17:25Z, handed off at 264k context). Base recipe: cursor/orcha29-queue-a29q scratch/orcha29/SUCCESSOR-BRIEF.md (still valid; summary below).
Standing authority: AGENTS.md §Concurrent PRs. If auto mode refuses a merge step on relayed authority, ask Bryce via AskUserQuestion; don't work around it.
LINEAGE: OrchA 30 was depth 8 (limit 8): it could not arm send_later/create_trigger or launch sessions. OrchA 31 is started fresh by Bryce, so check your own depth with get_session and arm timers if allowed.

## FIRST
1. `git worktree add --detach scratch/orcha31-tip origin/claude/f1-game-project-26h3ng` + `ln -s /home/user/f1-game/node_modules scratch/orcha31-tip/node_modules`; run tools from there.
2. Bus `HANDOFF --to A "ORCH A LIVE OrchA 31 claude:session_<you> (replaces OrchA 30)"`; DAD INFO via `agent-msg.mjs send --to D --type INFO --no-bus`.
3. `git show origin/cursor/orcha30-queue-a30q:scratch/orcha30/lift.sh > $SCRATCH/lift.sh`, chmod +x, run with `SCRATCH=<your scratchpad>`.
4. With no timers, the wake source is a background Bash `ci-watch.mjs --sha <tip> --pages --failures-only --timeout 110 --interval 90 > artifacts/logs/pages-<sha>.log` (run_in_background). Never `&` inside a foreground command (it won't wake you).

## MERGE RECIPE (used 17× by OrchA 30, zero misses)
1. Pages newest run completed/success on the CURRENT tip; nothing queued or running. Re-fetch the tip right before: Bryce and DAD merge too.
2. Trial-merge head onto tip in the worktree: `node --test tests/unit/source-pin-hygiene.test.mjs`; `npm run -s test:guards > log; echo exit=$?` (read the EXIT CODE: a ratchet failure once hid behind a `# duration_ms` tail); `npm run -s gen:check`.
3. `fleet-bus.mjs send GAME-SLOT ...` as its own command; confirm `= sent`.
4. `$SCRATCH/lift.sh <pr>` (drops MERGE-HOLD lines, adds Plan tick).
5. `merge-gate.mjs --pr N --sha <40-char head> --as claude:session_<you> --fleet A --role orchestrator`. On refusal: re-prepend a MERGE-HOLD line (gh api PATCH) and ask the owner (gen drift → `npm run gen` via sync-pr; ratchet → trim or sync).
6. mcp merge_pull_request (merge, expectedHeadSha, gate's commit_title/message verbatim).
7. `git log -1 --format=%p` shows 2 parents; source-pin-hygiene on new tip; bus DONE; start the Pages watcher.
Bus types are only READY GREEN BLOCKED HANDOFF DONE INCIDENT LEASE GAME-SLOT (no INFO). Pages red: INCIDENT, triage (agent ci-red-triage), one re-run via `ci-rerun.mjs <run>` for infra/flake, then "merge FREEZE lifted" INCIDENT line when green.

## STATE at handoff (17:25Z / 10:25 PT)
Tip 269f66a4 (#3627). Pages for it was running at handoff (watcher was on it); merge nothing until it is green.
Merged by OrchA 30 (all via merge-gate, 2 parents): #3482 f4680267, #3614 fddf4819, #3611 2ffca4ec (non-game), #3621 0cda329f, #3625 9202594d, #3640 e23c6377, #3624 5fa6eb6a, #3630 651f81b3, #3618 e8228c48, #3631 b2cca9a2, #3629 79a9102a, #3626 9be4a4e4, #3619 67b92fe7, #3622 598d4381, #3651 d6524771, #3627 269f66a4.
Others merged: DAD #3637 8cc56cac and #3599 d247ad49 (non-game); Bryce #3610 938447fc (hand-merge 15:50Z).
Incidents today: Pages 8cc56cac checkout git 408 / promisor fetch on guards-b (infra; green on attempt 3). Pages 938447fc hud-layout.spec.js:1033 "sector plate keeps its width" 30 s waitForFunction timeout (flake; green on Bryce's re-run). Triage suggested raising that 30_000 wait to BOOT_MS — nobody owns it yet.

## FLEET A GAME QUEUE: EMPTY. The OrchA 29 queue is fully merged. Told DAD that game slots are free.
Open Fleet A follow-ups (no PRs pending):
- A·W14 session_01GCovo9sNCsQDm2At4sZXA9: #3651 night-entry fix merged. Next is the 18 Pro Max AFTER device session once 269f66a4 or later is live (expect the 14.5 s Monza-night WebGPU entry to drop to ~4 s).
- A·D1 session_01Wj2vjHSTC5X7jPwXkJEuJD: iPhone 14 capture of `__apex.mirror().prep` (#3631), requested from DAD.
- Device follow-ups never run: #3581 visor A/B on iPhone 14 (`helmetvisor=clear&visorreflections=medium&visorrefraction=off` vs `helmetvisor=off`, then `visorrefraction=medium`; see #3581 Verified); phone re-soak for #3479; real-device pass for #3482.
- Still open from OrchA 29: #3579 BLOCKED on Bryce (sandbox denies `git rm` of a ratchets.d delta); question to Bryce: close #3586 / #3568?
Fleet D open PRs (#3595 #3596 #3613 #3628 #3632–#3636 #3641–#3646 …) are D's to merge.

## LATE ADDS (17:58Z)
- #3651 device AFTER (18 Pro Max, live 269f66a4): first Monza-night WebGPU entry 3.1 s (was 14.4–14.8); scene warm 0.68 s; day/rain unchanged.
- #3631 closed out: iPhone 14 mirror prep is not the cost (0 refused, 13 ms pass). Cold iPhone 14 first-race (Monza night, WebGPU) warm 16.9 s = scene 10.8 s, draw 3.85 s (rig 1.12 s), fx 2.2 s.
- LANE CANDIDATE for OrchA 31 to scope: cut cold first-race warm on mid-range phones (fewer lit variants/layouts, or defer rarely seen pipelines past the lights). A·W14 (session_01GCovo9sNCsQDm2At4sZXA9) is idle and owns the context.
