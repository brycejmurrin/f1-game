# Memory index

Claude Code auto memory for this repo, synced by `.claude/hooks/memory-sync.sh`
(cloud sessions): one line per memory linking its topic file, detail in the
topic file. User preferences and corrections only — a measured lesson belongs in
`docs/notes/`, a rule in a hook or test. Coordination rules live in
`docs/WORKERS.md` and AGENTS.md §Coordination; do not restate them here. An entry that contradicts the current code or AGENTS.md is stale:
fix or delete it, do not follow it. Hosts: `npm run memory:list` /
`memory:show` / `memory:retire` (docs/notes/AGENT-MEMORY.md).
- [Small steps for API analysis](small-steps-for-api-analysis.md) — prefer small incremental queries over bulk fetch scripts
- [One subagent per skill](one-subagent-per-skill.md) — skill reviews, tests and walkthroughs: one reviewer per skill
- [Survey then fix](survey-then-fix.md) — after an audit, land the ranked gap list the same session; the user asks "fix all of those"
- [User plays on a phone](user-plays-on-phone.md) — phone landscape and touch are the owner’s actual play setup
- [User timezone: Pacific](user-timezone-pacific.md) — the owner’s time zone is America/Los_Angeles
- [Parallel survey and review](parallel-survey-and-review.md) — UI/HUD reports: background apex survey job + ≤2 read-only review agents in parallel; plan as a docs/notes file on the PR branch
- [Ask via AskUserQuestion](ask-via-askuserquestion.md) — Bryce-attended sessions only; unattended worker sessions use `needs-decision`
- [Preview must look different](preview-must-look-different.md) — design sheets must differ in the picture (pixel-diff, close-up framing), not just in mm metrics; Bryce: "they all look the same"
- [Synced plugins in child sessions](synced-plugins-not-in-child-sessions.md) — 2026-10-18 limitation; re-verified 2026-10-26 that child sessions list plugin skills
- [Design lanes: one living artifact](design-lanes-living-artifact.md) — each design session republishes ONE gallery to the same URL per round; Bryce iterates on it
- [Bryce iPhone uses TLX WebGPU](bryce-iphone-tlx-webgpu.md) — plays THREE PATH: WEBGPU on iPhone and it works; measure that path first
- [Rules are agent-written drafts](rules-are-agent-written-drafts.md) — Bryce 2026-10-26: reconsider AGENTS.md/CLAUDE.md/memory; audit improvements in one PR
- [Decide and act](decide-and-act.md) — 2026-10-27: Bryce delegates open decisions; pick, record, proceed; only refusals/settings go back to him
- [Workers never wait for user](workers-never-wait-for-user.md) — unattended sessions ask @parent/dispatcher, subscribe for CI; parents nudge stalled children
- [Fan out with subagents](fan-out-with-subagents.md) — 2026-10-26: multi-part tasks go to worker subagents in worktrees
- [Launch prompts route questions to dispatcher](launch-prompts-route-questions-to-dispatcher.md) — every launched session messages the dispatcher; only the dispatcher uses AskUserQuestion; triggers min 1 h so stagger
