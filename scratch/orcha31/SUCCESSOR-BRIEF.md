# [Orchestrator] A·O32 — successor brief from OrchA 31

Predecessor: OrchA 31, session_01HSfCWDrTnZEjnSMscphs89 (19:04Z 10-23 → 01:05Z 10-24). Handed off at Bryce's ask: "Have them all handoff including yourself".
QUOTA: the 7-day limit is at `allowed_warning` and resets **Wed Oct 28 10:00 PM PT (Oct 29 05:00Z)**. Launch nothing until Bryce says so or the limit resets. Check `get_session` rate_limit_info first.
Standing authority: AGENTS.md §Concurrent PRs. Base recipe: cursor/orcha30-queue-a30q scratch/orcha30/SUCCESSOR-BRIEF.md (still valid).

## FIRST
1. `git worktree add --detach scratch/orcha32-tip origin/claude/f1-game-project-26h3ng` and `ln -s /home/user/f1-game/node_modules scratch/orcha32-tip/node_modules`.
2. Bus: `HANDOFF --to A "ORCH A LIVE OrchA 32 claude:session_<you> (replaces OrchA 31)"`. DAD INFO: `agent-msg.mjs send --to D --type INFO --no-bus`.
3. `git show origin/cursor/orcha31-queue-a31q:scratch/orcha31/lift.sh > $SCRATCH/lift.sh` (it ticks "lifted by OrchA 32"), then run `SCRATCH=... $SCRATCH/lift.sh <pr>`.
4. Read every A HANDOFF line on the bus since 01:00Z 10-24: each worker posted its PR, head and next step.

## MERGE RECIPE (OrchA 31 used it 10×, zero misses)
1. The newest Pages run is completed/success on the CURRENT tip; re-fetch the tip right before merging, since Bryce and DAD merge too.
2. Trial-merge the head onto the tip in the worktree. Run source-pin-hygiene, `npm run -s test:guards; echo exit=$?` and `gen:check`. For docs-only PRs, run docs-integrity instead of guards.
3. Game PRs only: `fleet-bus.mjs send GAME-SLOT` first.
4. Run `lift.sh <pr>`, then `merge-gate.mjs --pr N --sha <40> --as claude:session_<you> --fleet A --role orchestrator`.
5. mcp merge_pull_request with method merge, expectedHeadSha, and the gate's title and message verbatim.
6. Confirm `git log -1 --format=%p` shows 2 parents, then post bus DONE.
Gotchas: a READY can arrive while the PR is still a draft. Run ready-gate yourself, mark it ready (`gh api -X POST .../pulls/N/ccr/ready_for_review`), then wait for the full tier. GraphQL is blocked (use REST), and so is creating releases.
SLOTS (agreed with DAD): D takes consecutive game slots until an A game PR posts READY, then the fleets alternate. If D has no claim within ~5 min of green Pages, A may take the slot. tlx.js: D posts on the bus before touching chunk/mirror code; whoever merges second syncs.

## STATE at 01:05Z 10-24
Tip f8c55110 (D #3643); its Pages run was in progress.
Merged by OrchA 31: #3652, #3586, #3568, #3654, #3653, #3579, #3663, #3662, #3655, #3664, #3671. Bryce hand-merged #3649, #3658, #3659, #3660 (#3661 is his too).
Issue #3674 should be closed as a measurement artifact by A·W43; verify.

### Fleet A open PRs (all handed off; read each body's "Next step for a successor")
| PR | slot / session | what | type | state / next |
|---|---|---|---|---|
| #3669 | A·W42 015ULzaDCT8cUQQ6wbmA5feg | joint A+D batch-9 guards (gh api ref writes, no-gpg-sign, closed-PR push, READY receipt, held-file advisory 20 s) | non-game | Bryce answered "Approve all" for the hooks diff (00:23Z, in A·W42's session). Needs DAD's re-review, CI, and ready-gate. |
| #3679 | A·H10 012GHn3wz5viqzGibR47ZZ46 | TLX: drop unread ssrTag/shadow-colour/mirror stores (WebGL2 gain); PP-2 changes the LOW look | game | First in line for A's game slot. |
| (stacked on #3679) | A·W47 01XdBTxDAyVk2nZfvkq8DC89 | three r186 patch 17: WebGPU single-sample storeOp discard (#3681). No r187 exists. | game | Bryce: "Patch now!!". Merges after #3679, in its own slot. |
| #3668 | A·W40 01MEd52cQxvH1T7PXPsR3FGQ | governor vsync-quantum scale step (+ #3657, thermal drift) | game | |
| #3677 | A·W45 0142jEDWuu4rWGUB15jEoNgP | BOOST hitch on every press (helmet cam). Hypothesis: tlx.js prunePool drops deploy meshes after 20 s idle | game | Bryce's top complaint. Needs an A·D1 run with spaced, deploy-ON presses. |
| (glare PR, find via the bus) | A·W46 01HB9jce6bnQTDWAhsR9S1nr | helmet-cam sun-behind glare floods the screen (Bryce screenshot, COTA dusk) | game | Bryce shared the screenshot with that session. |
| #3667 | A·W41 01WmKPraJqVPFsGv8BeuxwgC | TLX per-pass triangle/draw census (#2631) → LOD #2657 if justified | non-game | |
| #3682 | A·W43 01N1qUXMqUbNXRqk1WRBntVh | race-entry stages report selfMs; #3674 was an artifact (the __apex.race cold path) | js/perf → game | |
| #3678 | A·W44 01Km9wfNVfmYSAVCMfZTUwY6 | lit-WGSL hash census + PR advisory (#3672) | non-game | |
| #3683 | A·Y2 01ESG58toY55P3RtVbsMTDST | first iPhone memory numbers (#3675) | docs/tools | Was blocked on the syslogs; A·D1 has AWS access. |
| #3666 | A·D1 01Wj2vjHSTC5X7jPwXkJEuJD | Device Farm harness fixes (#3676), crash-sentinel reload fix, ledger rows 21–22 | non-game | |
| #3680, #3670 | check the authors | (#3680 may be A·H11's; #3670 phone clarity, likely Bryce's Cursor) | ? | Identify owners. |
| #3592 | A·I1 01HbNLitLPBf1XPZxn5Qrvt7 | iPhone TLX/WebGPU survey | docs | Waiting on Bryce's BENCHMARK file. |
A·H11 (01JKD3dJUji4edJToFC9tgkg) is the race/physics bug hunt; see docs/notes/LIVE-DEBUGGER-RACE-2026-10-24.md on its branch.

### Device Farm queue (each run needs Bryce's own "Go" typed in A·D1's session)
(a) BOOST presses on the 18 Pro Max, helmet cam, WebGPU, ≥ 5 presses spaced 25–30 s (`--touch-gap`, deploy-ON pairing): before/after for #3677.
(b) iPhone 14 WebGL2 flag A/B (off / fixed-targets / SGSR / both, at 0.5 and 0.75, governor pinned).
(c) The syslog fetch for #3675.
(d) The player-path entry mode (menu → race setup → START).
(e) Before/after runs for #3679, patch 17, #3668 and the glare fix.
Key facts: visor governor trips in ledger rows 18–22 were a harness artifact (crash sentinel). The #3653+#3662 cold race warm went 16.9 → 14.0 s, and menu+race 27.4 → 21.5 s. #3658's photo capture is confirmed at 869×489.

### Open decisions for Bryce
- Quota: pause A·H11 and A·W44 to save budget? (He hasn't answered.)
- #3657: does the visor governor work need more device runs, now that the trips are known to be a harness artifact?
- Later lanes he passed on: share cards, racing depth, I18n.

## LATE ADDS (01:08Z)
- Bryce hand-merged #3667 (A·W41 census) at 00:53Z, as 82e4ad4b. A·W41's next step is LOD #2657, only if the census justifies it.
- Pages on f8c55110 (D #3643) went RED on garage-pick-cost.spec.js. Bryce approved one rerun; D fixes forward if it's red again. D merges are paused until it's green. Take no A game slot until Pages is green on the tip.
- DAD: the only D PR touching TLX is #3647 (GPU profiler, tlx.js; draft, run-ci held). No D PR touches vendor/three, so A·W47's patch 17 can go first, and whoever merges second syncs.

## WORKER HANDOFFS RECEIVED (00:52–00:56Z)
- #3669 A·W42, head 36801324: Bryce's hooks yes is recorded. TODO: full tooling-fast (stopped at 495/853, 0 fail), run-ci, DAD re-review, ready-gate (unpiped), READY.
- #3678 A·W44, head cc683269: the census is PRELIMINARY (saw only 11/46 modules; the complete rerun stopped at 2/30). Only 2 re-keys so far, both deliberate. TODO: rerun the census, tooling-fast, CI, ready-gate.
- #3667 A·W41: MERGED by Bryce. Verdict: index-only LOD (#2657) is NOT worth building; WebGPU on iPhone 14 holds 60 fps at every scale. The reopen trigger is in docs/notes/TLX-PHONE-PASS-CENSUS-2026-10-23.md.
- #3668 A·W40, head 9f4022bc (game): the floor quantum probe (replay shows 30→60 fps for 24–30 ms phones), a stall-trimmed degrade (partial fix for #3657), thermal drift stays opt-in. tooling-fast 852/0. TODO: green CI → ready-gate → ready → READY. Then a device A/B on #3666's clean harness.
- #3682 A·W43, head 29c23d32 (game via js/perf): selfMs plus a test; #3674 closed as an artifact. TODO: tooling-fast (stopped at 230/854), the perf-race-entry spec, CI, ready-gate.
- #3677 A·W45, head 467db719 (tools only so far): prunePool drops ~85–92 RenderObjects per 20 s idle, and a press 25 s later rebuilt 10 pipelines (three destroys a pipeline with its last RenderObject). NO FIX YET. Next: `ers-deploy-census.mjs --backend tlx-gl --cam helmet --presses 3 --gap 25` to name the pipelines, then pin the deploy-only wrappers (ERS bar/OT lamp/ERS strip) against prunePool. This is Bryce's #1 complaint, so re-staff it first when quota allows.
- #3679 A·H10, head cc78008d (code ed53162a): fast tier 24/0 and the gfx remote group are green. ready-gate was pending on Structural guards. TODO: ready-gate → ready → READY → merge first in A's slot. Round-2 angles are in docs/notes/LIVE-DEBUGGER-PHONEPERF-2026-10-24.md §Handoff.
- #3683 A·Y2, head eed3db98d: first iPhone memory numbers. iPhone 14 peak 465 MB of a 1536 MB soft limit; 18 Pro Max 698 MB of 2048 MB; no jetsam. KNOWN-WINS row 9 ranks low. TODO: ci-watch, ready-gate, READY (docs/tools).
- A·W47 (patch 17): extra research. three r186 already ships `BundleGroup` (WebGPU render bundles), which TLX never uses; it's a no-upgrade lever for submit/bind cost on static batches. PlayCanvas 2.23 has single-sample storeOp; Babylon doesn't. Recommendation: patch 17 plus a BundleGroup trial; no engine switch. NOTE: PERF-IPHONE-AUDIT line 81 calls webgl2 the iPhone path, which conflicts with memory "Bryce plays THREE PATH: WEBGPU". Confirm with Bryce.
- Pending handoff lines: A·W46 (glare), A·W47, A·H11, A·D1, A·I1. Check the bus.
