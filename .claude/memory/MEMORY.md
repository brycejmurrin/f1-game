# Memory index

Claude Code auto memory for this repo, synced by `.claude/hooks/memory-sync.sh`
(cloud sessions): one line per memory linking its topic file, detail in the
topic file. User preferences and corrections only — a measured lesson belongs in
`docs/notes/`, a rule in a hook or test. Fleet rules live in
`.claude/rules/fleet-core.md` (every host via `gen-cursor-rules`); do not restate
them here. An entry that contradicts the current code or AGENTS.md is stale:
fix or delete it, do not follow it. Hosts: `npm run memory:list` /
`memory:show` / `memory:retire` (docs/notes/AGENT-MEMORY.md).
- [Small steps for API analysis](small-steps-for-api-analysis.md) — prefer small incremental queries over bulk fetch scripts
- [One subagent per skill](one-subagent-per-skill.md) — skill reviews: one Sonnet subagent per skill, never grouped
- [Stacked PRs land bottom-up](stacked-prs-land-bottom-up.md) — since 2026-10-15 branches auto-delete on merge and GitHub retargets the stack (verify the base, no hand retarget); sync-pr on ratchets conflicts, ready one at a time
- [PR push with no CI run → dispatch ci.yml](pr-push-no-run-dispatch-ci.md) — a head pushed while the previous run is live may start no run; dispatch by hand, watch by sha
- [Killed background task: no marker, child gate dies](background-task-kill-no-marker.md) — 2 h ceiling; chain ≤ 3 gates, wait only on process liveness, never on a dead task's output file
- [Foreground browser run killed (137)](foreground-browser-run-killed.md) — launch Chromium/long node suites in the background only; a foreground one restarts the worker
- [Survey then fix](survey-then-fix.md) — after an audit, land the ranked gap list the same session; the user asks "fix all of those"
- [User plays on a phone](user-plays-on-phone.md) — HUD/UI: phone-landscape-844x390 with touch first (also fleet-core)
- [User timezone: Pacific](user-timezone-pacific.md) — quote times in Pacific; CRON_TZ=America/Los_Angeles (also fleet-core)
- [Parallel survey and review](parallel-survey-and-review.md) — UI/HUD reports: background apex survey job + ≤2 read-only review agents in parallel; plan as a docs/notes file on the PR branch
- [Foreground wait loop killed (137)](foreground-wait-loop-killed.md) — never block a foreground Bash on a multi-minute background run; end the turn and take the notification
- [gpu-census: one run per branch](gpu-census-one-run-per-branch.md) — a second dispatch queues, a third replaces it; dispatch A/B sequentially, pair ≥2 runs per variant, read counts not fps
- [Orchestrator may spawn sessions](orchestrator-may-spawn-sessions.md) — fleet work: launch sibling sessions without asking, tell Bryce each time; respect a single denied launch
- [MCP allow rules, measured](mcp-allow-rules-measured.md) — read `permission_decision` in list_events; a repo can't approve its own .mcp.json servers (auto mode's classifier does); auto siblings need an auto parent + `source_url`; MDN/BrowserStack prompt regardless (claude.ai connector setting)
- [Survey PRs merge to assets; cap 5](survey-prs-merge-to-assets-cap5.md) — 2026-10-15: green survey PRs merge into track-survey-assets; full-tier cap 5 while queue ok, 3 on hold
- [Worker model by task](worker-model-by-task.md) — 2026-10-19: orchestrator picks Opus or Sonnet per worker (launch-policy §Model by task); never Fable
- [Fixers may screenshot](fixers-may-screenshot.md) — UI sessions: screenshots and screenshot loops allowed (Bryce 06:37Z 10-17); keep the ~15-min per-defect cap
- [Lanes keep working](lanes-keep-working.md) — 2026-10-17: lanes pull deploy and take the next item in their area after a dry round; no FINAL unless the area is empty
- [Ask via AskUserQuestion](ask-via-askuserquestion.md) — decisions/asks for Bryce go through AskUserQuestion with what/why/options explained
- [Preview must look different](preview-must-look-different.md) — design sheets must differ in the picture (pixel-diff, close-up framing), not just in mm metrics; Bryce: "they all look the same"
- [Synced plugins not in child sessions](synced-plugins-not-in-child-sessions.md) — plugin skills load in the parent session and its subagents, not in create_session siblings; run plugin invocations here
