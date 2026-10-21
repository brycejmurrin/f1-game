# [Orchestrator] B·O26 · fleet · Opus — successor brief from OrchB 25

TITLE: [Orchestrator] B·O26 · fleet · Opus — Fleet B gated merges, lanes, roll calls
TAGS: f1-game-fleet fleet:b role:orchestrator scope:fleet
MODEL: claude-opus-5-5 — orchestrator (merges, routing, look calls).
Standing authority: AGENTS.md §Concurrent PRs.

FIRST: read AGENTS.md, .claude/rules/fleet-core.md, skill agent-fleet (orchestrator.md, running.md,
launch-policy.md, role-merge-holder.md, comms.md). Then read the live queue:
`git fetch origin cursor/orchb25-queue-o25q && git show origin/cursor/orchb25-queue-o25q:scratch/orchb25/QUEUE.md`
— it is the source of truth (merge order, lanes + session ids, Bryce decisions). Keep it on a pushed state
branch of your own (cursor/orchb26-queue-*) and refresh it every tick and after every merge/launch/routing
change (Bryce 2026-10-21: "Make sure we save our current tasks constantly and merge orders"; also keep the
in-session TaskCreate list current — "And tasks in session").

Then: post `ORCH B LIVE claude:<you> (replaces session_01SoGgREcrd12Mx6CsVHiDDs)` on the bus, arm a
send_later tick every 3 min (one at a time; report changes only): fleet-tick, one bus read, Pages check, merges.

MERGE RULES (Bryce, carried): GAME-SLOT on the bus for game PRs (js/ css/ assets/ index.html sw.js), wait for
green Pages on the previous game merge's sha, merge_method "merge" + expectedHeadSha, two-parent check, DONE
on the bus. Merge-gate receipts now expire in 10 min (#3400 D2/D3). Non-game PRs merge in the gap AFTER the
last game merge's Pages run has STARTED (a push while it is only pending supersedes it). Never merge onto a
red Pages tip; triage reds with ci-red-triage; INCIDENT on the bus if real.

BRYCE DECISIONS IN FORCE (2026-10-21): phone res LOW default; phone mirror short draw (done); phone livery
cap garage only (done); #3230 look signed off ("Looks good, ship"); #3238 "Take it over" (W13 owns);
#3359 hold lifted (merged); far-car silhouette body "Ship on the numbers" (into #3395); Android WebGPU A/B
"skip for now"; phone renderer: "Keep both but let's test and side by side first" → B·H23 gallery, then ask
Bryce; W11 item 5 (physics catch-up cap) parked as his feel call; D2/D3 done (#3400).
Asks still open for Bryce: delete throwaway branches cursor/live-memory-h12a-hold, cursor/probe-tip-w12a,
cursor/probe-3356-w12a, cursor/revert-prep-yield-h8r1.

UNFINISHED BY ORCHB 25:
- #3392 sync (orchestrator-only --force-clean-behind) was running in OrchB 25's container as
  `sync-pr.mjs cursor/screen-leaks-h12d --resume --from=test:vm-page-a --push` — check
  `git ls-remote origin cursor/screen-leaks-h12d`: still ca70032f = not pushed → re-run
  `node tools/ci/sync-pr.mjs cursor/screen-leaks-h12d --force-clean-behind --push` (long; run in background with
  a 90-min timeout), then tell B·H19.
- Memory branch cursor/orchb25-memory-o25m @24af5d72 (.claude/memory orchestrator-saves-queue) needs to ride
  an orchestrator PR (W13 refused .claude/**): open a small draft PR from it and merge in a non-game gap.
QUOTA: 7-day at allowed_warning — launch nothing beyond replacing a lane that hands off, unless Bryce asks.
STOP AT: 200k context — hand off the same way (this file as template).
