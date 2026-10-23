# [Orchestrator] A·O27 — successor brief from OrchA 26

Predecessor: OrchA 26, session_01U3vLXM6rhtKz56TCJV9Bff (2026-10-23 00:17Z – ). Older briefs: cursor/orcha25-queue-a25q, cursor/orcha23-queue-a23q (DAD webhook, Merlin).
Standing authority: AGENTS.md §Concurrent PRs. Pacific = UTC−7. Bryce plays on iPhone (home-screen app, Safari 27, three.js WebGPU pinned).

## FIRST
1. Bus HANDOFF "ORCH A LIVE <you> (replaces OrchA 26)"; DAD: `node tools/ci/agent-msg.mjs send --to D --type INFO --no-bus --as claude:<you> "..."` (needs a deploy-tip checkout: run it from a detached worktree of origin/claude/f1-game-project-26h3ng with node_modules symlinked — the queue branch is old).
2. Timers: send_later tick chain (~12 min) + hourly create_trigger safety net; delete OrchA 26's net trig_01SXkAApUvezSCoNZJ3StKuP.
3. Bus line every <25 min.

## MERGE RECIPE
GAME-SLOT on bus → lift MERGE-HOLD (update_pull_request, Plan line "MERGE-HOLD lifted by OrchA 2x at merge") → merge-gate --pr N --sha HEAD --as … --fleet A --role orchestrator → merge_pull_request (merge, expectedHeadSha, gate's commit_message) → `git log -1 --format=%p` 2 parents → DONE.
Do the slot→lift→gate→merge back to back: an UNKNOWN MERGER takes unheld PRs ~1 min after each green train (#3589 #3590 #3597 #3607 tonight, no trailer). Re-add the hold if you can't merge at once.
merge-gate pacing refuses a game fix while the tip is red; the hook blocks override → ask Bryce to hand-merge (as #3593).
Non-game merges also start a Pages run: wait for green before the next merge.

## MERGED BY OrchA 26 (+ others)
#3593 (Bryce hand) · #3524 · #3491 · #3600 · #3566 · #3574 · #3594 · #3598 · #3602 · #3605 (last tip fd4fecca, Pages running at 04:55Z). Unattributed: #3597 (-44e5), #3607 (scroll-fade). Bryce asked to find the unknown merger.

## QUEUE (as of brief time — check live)
GAME: #3604 (A·W14 mirror MRT; synced ab64a66c, ready-tier CI pending) → #3603 (A·W13 AUTO→WebGPU on iPhone; Bryce: "After #3604, skip iPhone 14") → #3581 (A·W5 visor, synced c315d579, full tier running) → #3580 #3573 (A·O4) → #3458 #3475 #3479 #3482 (A·O5) → #3489 (A·O2; needs Bryce APEX_RATCHET_RAISE_OK typed in A·O2 for stale ratchets.d lowering).
NON-GAME: #3530 #3545 (A·O6). DRAFTS: #3592 (A·I1 notes), #3579, #3586, #3568.
Issues filed: #3606 ui-scale flake, #3609 LIVERY EDIT +26.7 MB texture.

## LANES
A·O2 session_01KHXxtCPC4RbmgxkGkRPvh3 (#3489) · A·O4 session_016dYSHaau1KTSbmKGRVarpE · A·O5 session_015G8byk3tLy6W6GGKNBM4oF · A·O6 session_01NpE3oFrsSuFajXS4WrP1Lw · A·W5 session_01LbyfrAbJw1GJttfbEixYnv (Fable, visor) · A·I1 session_01HbNLitLPBf1XPZxn5Qrvt7 (idle until Bryce's WEBGPU vs WEBGL2 file) · A·W10 session_013WF6pBharQgeYycmNhXewg (done, #3594 merged) · A·D1 session_01Wj2vjHSTC5X7jPwXkJEuJD (done, #3598 merged) · A·W11 session_01KsB4D8g7yxLPjV2THcDSAo · A·W12 session_01C3oqKkaLJ3nNfK7iYkFULU · A·W13 session_01GFV2D8Ui5rt7xoXYbFPLxL · A·W14 session_01GCovo9sNCsQDm2At4sZXA9. OrchA 25 told to stand down (archive after Bryce is done).

## DEVICE FARM
AWS keys in env (IAM apex-devicefarm-agent, project apex-profiler, us-west-2). Split (Bryce via DAD 7:36 PM PT): Fleet A = iPhone 18 Pro Max only; D = iPhone 14/14 Pro. Trial ~845/1000 min left at 03:14Z. Tool: tools/perf/devicefarm-iphone.mjs.
Key data: iPhone 14 WebGPU 60 fps vs WebGL2 42 fps full res; first WebGPU race entry ~30–43 s (pipeline build); with #3604 ~10.5 s first / 3.8 s second on 18 Pro Max.

## BRYCE DECISIONS (this shift)
#3593 hand-merge yes · AUTO→WebGPU with visual check yes; merge after #3604, iPhone 14 waived · fix mirrorPrepare yes · more bench tests, profiling capture, wake lock yes · #3489 ratchet grant pending (type in A·O2).

## UPDATE 06:03Z
Merged since: #3580 cf31b458 · #3604 6931fdf7 (live; A·W14 Device Farm AFTER A/B queued, 18 Pro Max busy with another AWS customer) · #3603 9f0ce9c6 (AUTO→WebGPU on iPhone).
Unattributed again: #3601 (re-land of #3589 + soft-present fixes) as e2abba1f at ~05:58Z — watch its Pages (garage-livery-churn / parts-livery-*).
#3581 visor: 3rd gen sync running (A·W5, ~1 h). Then #3573 (A·O4), then A·O5's #3458 #3475 #3479 #3482.
A·W13, A·W10, A·D1, A·W11, A·W12 done → archive per rule once idle 1 h (and after Bryce is done).
IDEA (A·W5): every merge onto a moved tip re-drifts docs/agent-index.json "order" → game PRs waiting a slot fail merge-gate gen. Proposal: merge-gate or the deploy branch regenerates it, or agent-index drops positional order. Needs a tools PR + Bryce/DAD discussion (shared tooling).
