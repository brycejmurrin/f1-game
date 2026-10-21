# [Orchestrator] B·O27 · fleet · Opus — successor brief from OrchB 26

TITLE: [Orchestrator] B·O27 · fleet · Opus — Fleet B gated merges, lanes, roll calls
TAGS: f1-game-fleet fleet:b role:orchestrator scope:fleet
MODEL: claude-opus-5-5 — orchestrator (merges, routing, look calls).
Standing authority: AGENTS.md §Concurrent PRs.

FIRST: read AGENTS.md, .claude/rules/fleet-core.md, skill agent-fleet (orchestrator.md, running.md,
role-merge-holder.md, comms.md). Then the live queue:
`git fetch origin cursor/orchb26-queue-o26q && git show origin/cursor/orchb26-queue-o26q:scratch/orchb26/QUEUE.md`
(tail is newest). Keep your own pushed state branch cursor/orchb27-queue-* and refresh it every tick and after
every merge/launch (Bryce 2026-10-21: "save our current tasks constantly and merge orders"; also TaskCreate list).

Then: post `ORCH B LIVE claude:<you> (replaces session_01WeajNossivepp1z8e1mgCq)` on the bus, arm a send_later
tick every ~5 min (one at a time; report changes only), message the live lanes once, archive OrchB 26.

## State at handoff (~11:50Z 2026-10-21)
- INCIDENT 3 OPEN: Pages RED on 141be4bb (#3402 UI train). HARD: photo-studio-conditions.spec.js lighting
  mismatch + menu-traversal.spec.js pause/DISPLAY 5 s timeout. Cause (B·O-G, reproduced in a VM test):
  js/ui/layers.js anyOpen() memo calls navDirty(), which clears the navStale flag shared with navOpen().
  FIX = PR #3435 (B·O-G, cursor/train-b-fix-o7g1, READY at handoff, full tier running; local repro of the two specs not done, CI is the first real test). It's a game PR but it fixes the red:
  when READY + merge-gate passes, post GAME-SLOT, merge (merge_method merge, expectedHeadSha), 2-parent check,
  DONE. On green Pages post a bus line `INCIDENT lifted: …` (merge-gate only un-freezes on an INCIDENT line
  containing "lifted").
- Live site is on 9ab83802 (last green Pages) until the fix lands.
- Game queue after the fix: #3431 (a6557422, flare depth only when sun on screen, green 24/0, owner H15 gone)
  → #3395 (car draw; READY 47a7a5d7, full 57/0, B·H25 session_01MjgeR2rfQBC3baMa2L7eCc resolved car-draw.js).
- Non-game queue: empty.

## Merged this shift (OrchB 26)
#3301 #3420 #3386 #3230 #3406 #3399 #3388 #3419 #3422 #3433 #3434 #3391 #3402; by Bryce outside the bus:
#3408 #3429 #3377 #3396 #3238 #3392 (merges with no bus line are usually Bryce's: do not chase, note them).

## Lessons
- Pages "running" can be only the schedule/dispatch check: confirm the PUSH run of the sha is in_progress
  before a non-game gap merge; a push while it is pending supersedes it.
- A Pages run may skip the nested ci when the tree was already gated: the next real gate can surface reds
  from earlier merges (VF6 #3238 case).
- sync-pr's 20-min tooling-fast cap times out on loaded boxes; resume `--from=test:game-vm-a`.
- Keep tool output small (one list_workflow_runs page dumped ~20k chars).

## Bryce decisions in force (2026-10-21)
Keep TLX default on phone (GLX opt-in); title must fit at 844x390 (landscape tap floor dropped, follow-up must
fit 343 px); #3420 .claude/memory merged on his grant; far-car silhouette "Ship on the numbers" (#3395);
W11 item 5 physics catch-up cap parked as his feel call; Android WebGPU A/B "skip for now".
Asks still open: 4 throwaway branches (cursor/live-memory-h12a-hold, cursor/probe-tip-w12a,
cursor/probe-3356-w12a, cursor/revert-prep-yield-h8r1): bash-guard refuses remote deletes; Bryce deletes on GitHub.

## Open follow-ups (no owner; quota at allowed_warning → launch only replacements or on Bryce's ask)
- image-grade-visual "blacks visibly change the deepest image detail" quarantined (#3433, expires 2026-11-04):
  cause unestablished; A/B apex26.tlxRoadSplit 0 vs 1 on gpu-census macOS.
- TLX phone: missing clouds/stars, +30–60 MB vs GLX, 19.1 s race entry, garage edge aliasing (#3419 note);
  mirror-release lever (−20.6 MB iPhone, default-off) needs census A/B + Bryce call.
- #3408 noEnv warm draw (deferred, notes in #3408 body); GLX flareMaybe glx/post.js:536 over-keeps depth.
- W11 PERF-FRESH-HUNT items 7 (mirror span share), 8 (Android early-Z A/B), 12 (mesh-census) need measurement.
- #3402 follow-ups: one-step title BACK (+~8 spec updates); menu-traversal 5 s wait flake.
- #3395 F5 (needs a game.js race-start hook).
- B·H20: HUD clipping at 844x390 + real-iPhone pass not done.

## Lanes live at handoff
B·O-G session_01WpNcoEk9bXpGLimvzhLSV4 (fix #3435), B·H25 session_01MjgeR2rfQBC3baMa2L7eCc (#3395).
FINAL/idle (archive by rule after an hour idle; never Bryce's own): B·H15 013RkCK…, B·H19 016TYNh…, B·H20 01G7Wwq…,
B·H21 01TWn85…, B·H22 01Pn6fv…, B·H23 01NEB1N…, B·H24 01NPqh5…, B·W14 0144ZhH…, B·H18 014V2r1…, B·O-T 0154i4a….
Archived: B·W13, B·W11 (Bryce OK), OrchB 25.
STOP AT: 200k context — hand off the same way (this file as template).
