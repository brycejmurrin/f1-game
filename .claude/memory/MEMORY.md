# Memory index

Claude Code auto memory for this repo, synced by `.claude/hooks/memory-sync.sh`
(cloud sessions): one line per memory linking its topic file, detail in the
topic file. User preferences and corrections only — a measured lesson belongs in
`docs/notes/`, a rule in a hook or test. An entry that contradicts the current
code or AGENTS.md is stale: fix or delete it, do not follow it.
- [PR auto-merge](pr-auto-merge.md) — never arm or merge on my own; Merge Desk arms MERGE-commit only (squash retired 2026-10-13); `MERGE-HOLD:` is the only veto line, never paste "do not merge"
- [Small steps for API analysis](small-steps-for-api-analysis.md) — prefer small incremental queries over bulk fetch scripts
- [Merge fast, verify on CI](merge-fast-verify-on-ci.md) — default never merge (mark ready at tip-green when asked to expedite); only on Bryce's explicit in-session "merge it asap" / "push and merge asap override": MERGE-commit via MCP, never squash, 1 h gate (and the push hold, `APEX_PUSH_HOLD=0`) skipped and said so
- [One subagent per skill](one-subagent-per-skill.md) — skill reviews: one Sonnet subagent per skill, never grouped
- [GitHub Pro: 40 concurrent jobs](github-plan-pro-40-jobs.md) — account upgraded 2026-09-30; size CI against 40 standard / 5 macOS slots, not 20
- [Stacked PRs land bottom-up](stacked-prs-land-bottom-up.md) — since 2026-10-15 branches auto-delete on merge and GitHub retargets the stack (verify the base, no hand retarget); sync-pr on ratchets conflicts, ready one at a time (never arm)
- [PR push with no CI run → dispatch ci.yml](pr-push-no-run-dispatch-ci.md) — a head pushed while the previous run is live may start no run; dispatch by hand, watch by sha
- [Killed background task: no marker, child gate dies](background-task-kill-no-marker.md) — 2 h ceiling; chain ≤ 3 gates, wait only on process liveness, never on a dead task's output file
- [Foreground browser run killed (137)](foreground-browser-run-killed.md) — launch Chromium/long node suites in the background only; a foreground one restarts the worker
- [Survey then fix](survey-then-fix.md) — after an audit, land the ranked gap list the same session; the user asks "fix all of those"
- [User plays on a phone](user-plays-on-phone.md) — reproduce HUD/UI reports at phone-landscape-844x390 with touch first, not desktop
- [User timezone: Pacific](user-timezone-pacific.md) — schedule Routines as CRON_TZ=America/Los_Angeles; quote times in Pacific
- [Parallel survey and review](parallel-survey-and-review.md) — UI/HUD reports: background apex survey job + ≤2 read-only review agents in parallel; plan as a docs/notes file on the PR branch
- [Foreground wait loop killed (137)](foreground-wait-loop-killed.md) — never block a foreground Bash on a multi-minute background run; end the turn and take the notification
- [gpu-census: one run per branch](gpu-census-one-run-per-branch.md) — a second dispatch queues, a third replaces it; dispatch A/B arms sequentially, pair ≥2 runs per arm, read counts not fps
- [Orchestrator may spawn sessions](orchestrator-may-spawn-sessions.md) — fleet work: launch sibling sessions without asking, tell Bryce each time; respect a single denied launch
- [Merge method: verify parents](merge-method-verify-parents.md) — a "merge" merge_pull_request landed as a squash (#1743); check two parents after every merge
- [Merge Desk session](merge-desk-session.md) — the Sonnet desk session_01WQY3pk… no longer exists (not found 2026-10-16); find the live `[Merge Desk]` via list_sessions or ask Bryce before sending SWEEP
- [MCP allow rules, measured](mcp-allow-rules-measured.md) — read `permission_decision` in list_events; a repo can't approve its own .mcp.json servers (auto mode's classifier does); auto siblings need an auto parent + `source_url`; MDN/BrowserStack prompt regardless (claude.ai connector setting)
- [Survey PRs merge to assets; cap 5](survey-prs-merge-to-assets-cap5.md) — 2026-10-15: green survey PRs merge into track-survey-assets; full-tier cap 5 while queue ok, 3 on hold
- [Standing Merge Desk](standing-merge-desk.md) — since 2026-10-15 a Sonnet `[Merge Desk]` sibling (agent merge-desk.md) runs sweeps and spawns Sonnet lane workers, woken hourly; send SWEEP there
- [Sessions run Sonnet](sessions-run-sonnet.md) — 2026-10-16: lanes/workers/fresh-session scheduled tasks use claude-sonnet-5-5, never Fable
- [Merge Desk session](merge-desk-session.md) — persistent Claude Merge Desk session_01WQY3pk…; workers send `SWEEP <PR#>`; it never merges
- [Fixers may screenshot](fixers-may-screenshot.md) — UI sessions: screenshots and screenshot loops allowed (Bryce 06:37Z 10-17); keep the ~15-min per-defect cap
- [Merge level 3](merge-level-3.md) — since 2026-10-17 04:19Z the orchestrator arms/merges fleet PRs when ready + full-tier green + no conflict + no MERGE-HOLD; never Bryce's Cursor PRs
- [Rejected design: hold immediately](rejected-design-hold-immediately.md) — on an in-session rejection or "wait", MERGE-HOLD the PR and tell the orchestrator first; "wait" pauses me, not the fleet (#2611 merged under a 2 h-late hold)
- [Fixers may screenshot](fixers-may-screenshot.md) — stuck UI fixer: allow screenshots (no loops), 15-min cap then push with a named known-red, or the orchestrator finishes it
- [Lanes keep working](lanes-keep-working.md) — 2026-10-17: lanes pull deploy and take the next item in their area after a dry round; no FINAL unless the area is empty
