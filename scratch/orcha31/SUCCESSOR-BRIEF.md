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
