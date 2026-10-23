# [Orchestrator] A·O28 — successor brief from OrchA 27 (handoff 07:55Z / 00:55 PT)

Predecessor: OrchA 27 session_01L96YZtochpma2u1GjQAz1x (06:20Z–07:55Z, context cap). Base recipe/lanes/device farm: cursor/orcha26-queue-a26q scratch/orcha26/SUCCESSOR-BRIEF.md (MERGE RECIPE section). Comms: DAD via `node tools/ci/agent-msg.mjs send --to D ...` run from a detached deploy-tip worktree (git worktree add --detach <dir> origin/claude/f1-game-project-26h3ng; ln -s node_modules). Merlin = bus only. Never @cursor.
Standing authority: AGENTS.md §Concurrent PRs. Pacific = UTC−7. Bus line every <25 min. Hard handoff at ~250k context (check get_session context_usage).

## FIRST
1. Bus HANDOFF "ORCH A LIVE <you> (replaces OrchA 27)"; DAD INFO via agent-msg.
2. Timers: send_later tick (~10 min) + hourly create_trigger net. Delete OrchA 27's net trig_018VCt86poiARBscTTimyopw (and its tick if pending).
3. Message live lanes (table below) with your id.

## MERGE RECIPE (unchanged)
GAME-SLOT on bus (--as claude:session_<you>) → lift MERGE-HOLD (PATCH body, remove the line, add "- [x] MERGE-HOLD lifted by OrchA 28 at merge") → `node tools/ci/merge-gate.mjs --pr N --sha HEAD --as claude:session_<you> --fleet A --role orchestrator` → mcp merge_pull_request merge + expectedHeadSha + the gate's commit_title/commit_message verbatim → `git log -1 --format=%p` 2 parents → bus DONE. Back to back (unknown merger takes unheld PRs). No merge while a pages.yml run is queued/running; one game PR per green Pages train.

## STATE at handoff
Tip ad7d7434 (#3489). Its push Pages run = startup_failure (infra, no workflow diff); OrchA 27 re-dispatched pages.yml once: run 39918566155, in progress (55 jobs/0 failed at 07:48Z). Another Pages run on ad7d7434 showed queued. Wait for green.
Merged this shift by OrchA 27: #3545 f67b2034, #3489 ad7d7434.

## GAME QUEUE (all green full tier, ready-gate 0, MERGE-HOLD on)
1. #3458 head 89a8cef5 (A·O5) — FIRST: re-conflicts on tools/shot/scenery-locations.json sourceDigest every tip move; if dirty, ask A·O5 to re-sync (~10 min).
2. #3530 head c6d935ac (A·O6; index.html boot overlay).
3. #3581 visor (A·W5, Fable) — A·W5 is HOLDING for a "tip settled" message: after #3530 merges, tell A·W5 the tip; it does ONE sync-pr, full tier, READY.
4. #3475 54b8fa8f, #3479 31f2b236, #3482 5887630b (A·O5).
Then: #3611 (A·W15), #3612 (A·D1), A·W14's pre-warm PR when READY.

## LANES (live)
| lane | session | state |
|---|---|---|
| A·W15 Opus | session_01AhiowZLuQxUq1eLzZb7BZw | #3611 draft, Bryce bug: BUTTONS steering, lift GAS → tap BOOST lags. First BOOST tap = 737–742 ms frame on 18PM; PerfSpans max 24 ms → stall OUTSIDE game tick (WebKit style/paint/compositing). Granted ≤6 Device Farm runs total (18PM only), same udid BEFORE/AFTER. |
| A·W14 Opus | session_01GCovo9sNCsQDm2At4sZXA9 | Bryce YES (AskUserQuestion 07:37Z): night/rain pre-warm. Approved scope (1) decal glow as uniform (fewer variants) + (2) race entry warm covers sync-at-draw post/decal/particle variants; (3) menu-idle speculative warm REJECTED. ≤4 DF runs, known-cold unit. Branch cursor/night-rain-prewarm-5b1e. Also asked to soften "fresh device" wording in #3604 addendum. |
| A·D1 | session_01Wj2vjHSTC5X7jPwXkJEuJD | #3612 draft (DF deeper: cache survives Safari kill; night/rain first-race 14.1/5.1 s on WebGPU). READY after ready-gate. No more 18PM runs tonight. |
| A·O5 | session_015G8byk3tLy6W6GGKNBM4oF | owns #3458 #3475 #3479 #3482 |
| A·O6 | session_01NpE3oFrsSuFajXS4WrP1Lw | owns #3530; #3579 draft blocked (sandbox denies git rm of ratchets.d delta + golden re-bless) |
| A·W5 Fable | session_01LbyfrAbJw1GJttfbEixYnv | #3581, waiting "tip settled" |
| A·I1 | session_01HbNLitLPBf1XPZxn5Qrvt7 | blocked: waits Bryce's WEBGPU vs WEBGL2 file; #3592 draft |
| A·W9 | session_01P4T3QVegydddFRrUCg4Eqe | blocked since 10-22 18:04Z; #3586 draft — asked Bryce whether to close |
| A·X1 | session_01Jxz6BMpucD8Gm23RmWTptJ | #3568 audit draft (stays draft; Bryce decides) |
ARCHIVED by OrchA 27 on Bryce's "archive old ones" (07:52Z): A·O4, A·W13, A·W12, A·W11, A·W10 (013WF), A·P1, A·O2, A·O26. Everything else old was already archived.

## DEVICE FARM (read-only analysis by OrchA 27's subagent; artifacts were on its box, gone)
~780 of 1000 trial min left (07:35Z). Findings: iPhone 14 mirrorPrepare hits 30 s safety timer (mirror-pass.js:511; real first entry 55–61 s); iPhone 14 'createBuffer: Unable to create buffer' once → sent to DAD as REQUEST per Bryce ("Ask D to investigate"; no default change tonight). #3604 gain: mirror stage confirmed 3–25× (A·W14 A/B); total first-entry gain bounded (28.8 → 16.1 s cold), not pinned. Safari pipeline cache persists across Safari kills → measure on known-cold units.

## OPEN QUESTIONS TO BRYCE (asked 07:45Z, unanswered)
1. #3608 (cursor/quit-menu-stall-088e) and #3610 (cursor/cockpit-sw-bloom-44e5): opened as brycejmurrin, commits by "Cursor Agent", no hold, no fleet; -44e5 suffix matches unattributed #3597 → likely the unknown merger = Bryce's own Cursor Cloud agents off-bus. DAD confirmed not Fleet D. Ask Bryce to stop them merging/pushing to A branches.
2. Close A·W9 / A·X1?
3. agent-index "order" churn fix proposal (bus a2eb670) still open.
Fleet D: #3576 (D·W18h) ready but DIRTY — D's to sync.
