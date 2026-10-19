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
- [One subagent per skill](one-subagent-per-skill.md) — skill reviews, tests and walkthroughs: one reviewer per skill
- [Survey then fix](survey-then-fix.md) — after an audit, land the ranked gap list the same session; the user asks "fix all of those"
- [User plays on a phone](user-plays-on-phone.md) — phone landscape and touch are the owner’s actual play setup
- [User timezone: Pacific](user-timezone-pacific.md) — the owner’s time zone is America/Los_Angeles
- [Parallel survey and review](parallel-survey-and-review.md) — UI/HUD reports: background apex survey job + ≤2 read-only review agents in parallel; plan as a docs/notes file on the PR branch
- [Orchestrator may spawn sessions](orchestrator-may-spawn-sessions.md) — fleet work: launch sibling sessions without asking, tell Bryce each time; respect a single denied launch
- [Sessions run Sonnet](sessions-run-sonnet.md) — 2026-10-16: Sonnet preference for Claude workers; API selector alone does not prove served model
- [Fixers may screenshot](fixers-may-screenshot.md) — recorded UI campaign permits screenshot loops without count cap; keep time and host limits
- [Lanes keep working](lanes-keep-working.md) — 2026-10-17 campaign: continue scoped work after dry rounds; preserve resource and ownership limits
- [Ask via AskUserQuestion](ask-via-askuserquestion.md) — decisions/asks for Bryce go through AskUserQuestion with what/why/options explained
- [Preview must look different](preview-must-look-different.md) — design sheets must differ in the picture (pixel-diff, close-up framing), not just in mm metrics; Bryce: "they all look the same"
- [Synced plugins not in child sessions](synced-plugins-not-in-child-sessions.md) — dated Claude sibling-session limitation; verify availability on each host
