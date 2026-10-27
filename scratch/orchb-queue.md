# ORCH B queue — B·O6 session_01T14HCB1tmB2eH3FeuKoF8u (2026-10-27 ~01:20Z / 18:20 PT)

Boot from the deploy tip (claude/f1-game-project-26h3ng @77b4d989). Cap: launch-policy.md on the tip.
Standing authority: AGENTS.md §Concurrent PRs. Why this rotation: Bryce typed "you are now orchestrating" in
session_01T14HCB and chose "Replace ORCH B"; asked to "rebuild queue in coordination with" the other fleets' orchestrators.
Predecessor B·O5 session_01MTd78B was already inactive (send_message: session_inactive); bus ROTATE 86157c3.

## Cross-fleet state (ORCH A PLAN v1, bus 15972cc, Bryce approved 12:40 PT 10-26)
ORCH A (session_01TVoReZ) is the ONLY merger; launch_pause + merge_pause ON (DAD HB 73264fe). B launches nothing until
A/Bryce lifts launch_pause. Train 3 #3888 @a1c1dfff: ready, CI success, clean — A merges.

## B-owned open PRs
- #3877 @2045e258 (process) and #3878 @d612dd6b (game): FOLDED into #3888 (bus 214df59/330b037). Close as superseded
  after #3888 merges (ORCH B does it; branches kept).

## B lanes — NONE LIVE (list_sessions 01:23Z, artifacts/fleet/sessions-20261027T0123Z.json)
All 96 fleet-b sessions on page 1 are ARCHIVED, incl. never-archive seed 01KLkpSQ, relay B·R1 01PfAQjr and
B·R-sys 01E4f2wT (archived ~01:11Z; cost $524 — flagged to Bryce). B·O5 01MTd78B archived ~01:10Z.
Bryce ~01:30Z (typed in 01T14HCB): "Unarchive seed+R1" → done: seed 01KLkpSQ + B·R1 01PfAQjr unarchived (both idle).
Seed says it is near its 200k cap and wants a fresh [Seed] B·S0 (role-seed.md §Launch) — Bryce's paste-in.
B·R1 needs APEX_B_RELAY_URL/TOKEN in Fleet A's env to retest. B·R-sys stays archived; its check-in trig_01JQ7Ypu deleted.
Bryce: "Wait for ORCH A" — no B launches until A agrees the split and lifts launch_pause.

## Proposed B queue once launch_pause lifts (sent to A + D for agreement; not binding)
1. #3505 flaky quarantine deadlines — garage-churn row due TODAY 10-27 (tests/specs/**, tests/data/flaky-quarantine.json). Sonnet.
2. #3673 iPhone 14 WebGPU first-race >100 ms frames (Bryce's TLX WebGPU path; js/render/three/**, js/perf/**). Opus. Check A·W10 overlap.
3. #3261 HUD/shell/garage CSS past edit size (css/**; UI lane mutex). Sonnet.
4. #1682 source-text pins → behaviour assertions (tests/unit/**). Sonnet.
Next: perf hunts #3109/#3110/#3115/#3117 (one per lane, disjoint dirs).

## Timers
Safety net trig_019axytjyUHsLUDZkLh2TqRY (send_later 02:16Z). FLEET BUS WATCH trig_01ANsLrvbDGnMapUzqRYmnVL (account-wide; never recreate).
Bus Monitor: fleet-bus watch --to B --to '*' --to claude:session_01T14HCB… (filtered READY/BLOCKED/HANDOFF/DONE/INCIDENT/REQUEST/QUESTION).
