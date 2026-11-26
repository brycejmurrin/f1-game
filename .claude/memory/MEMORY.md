# Memory index

Claude Code auto memory for this repo: one line per memory linking its topic file, detail in the topic file. User
preferences and corrections only — a measured fact belongs in the doc that uses it or a `docs/notes/` note with a
`Re-measure-by:` line, a rule in a hook or test, a decision in `docs/DECISIONS.md` (`D-NNN`). Coordination rules live
in AGENTS.md §Coordination. The tracked copy is the only store: `session-start.sh` restores it into the live memory
dir one way (repo wins); an edit is committed like any doc edit (docs/notes/AGENT-MEMORY.md). An entry that
contradicts the current code or AGENTS.md is stale: fix or delete it. Hosts: `npm run memory:list` / `memory:show` / `memory:retire`.
- [Small steps for API analysis](small-steps-for-api-analysis.md) — prefer small incremental queries over bulk fetch scripts
- [One subagent per skill](one-subagent-per-skill.md) — skill reviews, tests and walkthroughs: one reviewer per skill
- [Survey then fix](survey-then-fix.md) — after an audit, land the ranked gap list the same session; the user asks "fix all of those"
- [User plays on a phone](user-plays-on-phone.md) — iPhone 15: 852×393 CSS px landscape @3x, touch first; 844×390 is not his phone
- [Bryce's desktop: 16-inch MacBook Pro](bryce-desktop-macbook.md) — 1728×1117 CSS px @2x full display (3456×2234 panel); UI SIZE defaults to 115% there
- [User timezone: Pacific](user-timezone-pacific.md) — the owner’s time zone is America/Los_Angeles
- [Parallel survey and review](parallel-survey-and-review.md) — UI/HUD reports: background apex survey job + ≤2 read-only review agents in parallel; plan as a docs/notes file on the PR branch
- [Preview must look different](preview-must-look-different.md) — design sheets must differ in the picture (pixel-diff, close-up framing), not just in mm metrics; Bryce: "they all look the same"
- [Design lanes: one living artifact](design-lanes-living-artifact.md) — each design session republishes ONE gallery to the same URL per round; Bryce iterates on it (D-006)
- [Bryce iPhone uses TLX WebGPU](bryce-iphone-tlx-webgpu.md) — plays THREE PATH: WEBGPU on iPhone and it works; measure that path first (D-013)
- [Rules are agent-written drafts](rules-are-agent-written-drafts.md) — reconsider AGENTS.md/CLAUDE.md/memory; audit improvements in one PR (D-017)
- [Bryce's settings profile](bryce-settings-profile.md) — tests/data/settings-live-export-2026-11-26.json is his CURRENT Home Screen app export (landscape at top level, live:"wide"; UI SIZE shipped, BUTTON 130; check appearanceShapes.live); 11-25 is the previous snapshot
- [Orchestrator: check in and keep the task list](orchestrator-checkin-and-task-list.md) — at start build the FULL PLAN as tasks; each cycle read every live worker (archive, nudge or relaunch) unprompted and refresh the list
- [Phone checks via Claude Link](phone-checks-via-claude-link.md) — run every device check over the phone bridge, batched into ONE hands-off `drive` window per wave; the orchestrator drives, reads state and posts the results
- [Ask Bryce with AskUserQuestion](orchestrator-questions-via-tool.md) — orchestrator: anything you need from him goes through the AskUserQuestion tool, not a question buried in prose
- [Launch independent of the merge queue](launch-independent-of-merge-queue.md) — hunters/reviewers/research launch any time; workers wait only on a real code dependency, fix workers also while 10+ PRs are ready+land
- [Orchestrator standing routines](orchestrator-routines.md) — FULL cycle hourly at :19, LIGHT PR follow-up at :49, self-bound scheduled tasks; a successor re-creates them and disables the old ones
