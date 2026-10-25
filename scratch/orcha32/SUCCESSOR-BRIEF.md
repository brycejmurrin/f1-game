# [Orchestrator] A·O33 — successor brief from OrchA 32

Predecessor: OrchA 32, session_015RjYfV7nHwhiepaqQbUuAk (10-24 01:00Z → 10-25 ~23:00Z). Handed off at Bryce's ask, 10-25 ~22:58Z: "Let's handoff to a new Orch session you start it and message dad, bus and sessions".
Standing authority: AGENTS.md §Concurrent PRs. Base recipe (still valid): cursor/orcha31-queue-a31q scratch/orcha31/SUCCESSOR-BRIEF.md (MERGE RECIPE). lift.sh: `git show origin/cursor/orcha31-queue-a31q:scratch/orcha31/lift.sh > $SCRATCH/lift.sh; sed -i 's/OrchA 31/OrchA 33/' $SCRATCH/lift.sh`.
QUOTA: 7-day at allowed_warning (resets Wed Oct 28 10 PM PT). Bryce has been launching anyway; launch only on his word.

## FIRST
1. `git worktree add --detach scratch/orcha33-tip origin/claude/f1-game-project-26h3ng` + `ln -s /home/user/f1-game/node_modules scratch/orcha33-tip/node_modules`.
2. Bus: `fleet-bus.mjs send HANDOFF --to '*' "ORCH A LIVE OrchA 33 claude:session_<you> (replaces OrchA 32)"`; DAD: `agent-msg.mjs send --to D --type INFO`.
3. `send_message` the live A sessions below with your id. Arm a ~10–20 min tick (send_later) + a Pages Monitor.
4. Keep queue state on your own pushed branch (cursor/orcha33-queue-<hash>), as OrchA 32 did on cursor/orcha32-queue-a32q.

## MERGE RECIPE (short)
Re-fetch the tip and check the PR is still open (Bryce hand-merges a lot) → trial-merge in the worktree: `npm run -s test:guards`, `gen:check`, `node --test tests/unit/source-pin-hygiene.test.mjs` → game PR: `fleet-bus.mjs send GAME-SLOT` first, wait for green Pages on the LAST GAME merge → `lift.sh <pr>` → `merge-gate.mjs --pr N --sha <40> --as claude:session_<you> --fleet A --role orchestrator` → mcp merge_pull_request (method merge, expectedHeadSha, gate's title/message verbatim) → `git log -1 --format=%p` shows 2 parents → bus DONE.
Gotchas learned: (a) any INCIDENT line without the word "lifted" freezes merge-gate pacing; workers mis-type LIVE/FIXED notes as INCIDENT, so post `INCIDENT lifted — <why>` when the condition is gone. (b) A non-game merge cancels a QUEUED/PENDING Pages run (a superset replaces it), never the running one, so it's fine. (c) Pages "superseded" in ci-watch = re-arm on the newer sha. (d) Old MERGE-HOLD lines like "OrchA 31 merges" or "gate pending" are routing/work-state holds: lift at merge with evidence. A Bryce-typed veto is never lifted without him.

## STATE at ~23:00Z 10-25
Tip ~0b1bc59c (#3713 merged by OrchA 32); Pages on it was running.
Merged since 10-24 (Bryce + OrchA): #3679 #3668 #3680 #3683 #3666 #3669 #3687 #3701 #3698 #3707 #3690 #3686 #3682 #3708 #3697 #3670 #3678 #3694 #3695 #3716 #3705 #3710 #3722 #3714 #3715 #3699 #3677 #3720 #3728 #3740 #3685 #3735 #3739 #3608 #3711 #3742 #3713.

### A game queue (one per green Pages, alternating with D)
1. #3729 44b8ea4a: A·H18 Opus voice twin pick (no change until packs carry twins). READY, full tier green. A·H18 archived.
2. #3741 5b14c671: A·H13 camera store-read memo. READY, clean, full tier green.
3. #3718: A·H13 alloc-free field ranking. Re-syncing (generated package.json conflict); A·H13 re-sends READY.
4. Then whatever A·O3/A·O4/A·W49/A·W50 post READY.

### Live Fleet A sessions
| slot | session | doing |
|---|---|---|
| A·O3 (Sonnet) | session_01ELQk4QJzRyBREZxyMrvP7b | owns #3693 (net TURN cache), #3696 (audio resume), #3704 (boot WebGPU adapter). #3693/#3696 carry an old "MERGE-HOLD: full pre-push gate and browser verification remain pending" work-state hold: lift at merge once O3 ticks gate + remote group with run ids. |
| A·O4 (Opus) | session_011uRMn29iFsyJLCBq2JZxTE | #3692 re-PR from origin/handoff/a-o-c2-3692-c75441c7 (old branch has a foreign Cursor push the hook blocks; new PR, close #3692), #3719 render-bundle prototype (flag off), #3647 GPU profiler (Fleet A owns it, Bryce confirmed 10-24; land or recommend close) |
| A·W50 (Opus) | session_012FhNfs9XvpJUo6FvCgvKkc | iPhone WebGPU cold first-race freeze. Part 1 (#3713) merged. Part 2: title-idle prep + program warm; Bryce chose "Once per update" (phones warm on title only in the first session after a deploy, localStorage apex26.titleWarm = build id; desktop always). Then A·D2 S5-style dose run. |
| A·W49 (Opus) | session_01QGxJ2kociCLUhUAqyFpbBN | #3706 Blender crew garage variants (+ in-race pit-stop crew later). Re-run OK given 22:56Z. |
| A·H13 (Opus) | session_01TcuHBHRjWo1arKJHxV8PB7 | #3741, #3718; then FINAL. C10 (AI far-car 30 Hz) stays unbuilt (low value, behaviour change). |
| A·D2 (Sonnet) | session_01H9GPhunvdGcdKETmeViofb | Device Farm. Blocked on Bryce's Go typed in its session (AskUserQuestion pending). Runs queued: patch 17 A/B, BOOST every-press before/after (#3677 merged), #3670/#3690 checks, Opus decode probe for #3729, W50 dose run. ~15 device-min each; Bryce approved the minutes in principle. |

### Fleet D
DAD (grok:DAD; agent-msg --to D). At 22:56Z OrchA 32 asked DAD to resume D's merge train: ~12 D PRs green+clean for 1.5 days (#3634 #3636 #3638 #3641 #3645 #3646 #3576 + drafts). OrchA 32 said: if DAD is silent ~30 min, Fleet A merges D's READY+green PRs via merge-gate, one per green Pages, alternating, honouring any MERGE-HOLD. Bryce's 22:55Z words ("get all open drafts and prs merged") are the basis. Check for DAD's reply first.

### Bryce's decisions in force (quotes in OrchA 32's session)
- iPhone = THREE PATH: WEBGPU. Measure that first; the macOS gpu-census.yml is required for any WebGPU-path change (fake-GL/llvmpipe miss WebGPU validation).
- SC MIN_HOLD 6 s: keep. Music 128 kbps: yes (merged). Device minutes: yes, with the Go typed in A·D2. Title warm: once per update. #3647 → Fleet A.
- Open, unanswered: A·H18's voice twins A (4 default packs, +9.4 MB) vs B (all 24, +58 MB). A·H18 defaulted to A; WIP on cursor/voice-twins-2d6f (george + fable twins; emma/heart lost with its container). Needs a new owner after #3729 merges and A·D2's Opus probe.

### Follow-ups (unstaffed)
- Voice twins PR (above). L3 content-addressed pack URLs, plus pine W() allocation/GC (docs/notes/LOAD-HUNT-2026-10-24.md on #3704). A·H16 condition 4: ≥10-run re-measure of the 4-shard guards (`tools/ci/tooling-timings.mjs --runs 10`) into docs/notes/BUILD-HUNT-2026-10-24.md. HUD tick (1.4 ms) is D·W27e's. Remote branches to delete (guard refuses): cursor/gpumem-census-req-b7e1, cursor/gpumem-phone-req-c3d9, cursor/gpumem-leak-1-a12h.
