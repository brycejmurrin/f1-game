# Memory index

Claude Code auto memory for this repo: one line per memory linking its topic
file, detail in the topic file. User preferences and corrections only — a
measured lesson belongs in `docs/notes/` (with a `Re-measure-by:` line), a rule
in a hook or test, a decision in `docs/DECISIONS.md` (`D-NNN`). Coordination
rules live in AGENTS.md §Coordination; do not restate them here. The tracked
copy is the only store: `session-start.sh` restores it into the live memory dir
one way (repo wins), and an edit is committed like any doc edit (docs/notes/AGENT-MEMORY.md).
An entry that contradicts the current code or AGENTS.md is stale: fix or delete
it, do not follow it. Hosts: `npm run memory:list` / `memory:show` / `memory:retire`.
- [Small steps for API analysis](small-steps-for-api-analysis.md) — prefer small incremental queries over bulk fetch scripts
- [One subagent per skill](one-subagent-per-skill.md) — skill reviews, tests and walkthroughs: one reviewer per skill
- [Survey then fix](survey-then-fix.md) — after an audit, land the ranked gap list the same session; the user asks "fix all of those"
- [User plays on a phone](user-plays-on-phone.md) — phone landscape and touch are the owner’s actual play setup
- [User timezone: Pacific](user-timezone-pacific.md) — the owner’s time zone is America/Los_Angeles
- [Parallel survey and review](parallel-survey-and-review.md) — UI/HUD reports: background apex survey job + ≤2 read-only review agents in parallel; plan as a docs/notes file on the PR branch
- [Preview must look different](preview-must-look-different.md) — design sheets must differ in the picture (pixel-diff, close-up framing), not just in mm metrics; Bryce: "they all look the same"
- [Design lanes: one living artifact](design-lanes-living-artifact.md) — each design session republishes ONE gallery to the same URL per round; Bryce iterates on it (D-006)
- [Bryce iPhone uses TLX WebGPU](bryce-iphone-tlx-webgpu.md) — plays THREE PATH: WEBGPU on iPhone and it works; measure that path first (D-013)
- [Rules are agent-written drafts](rules-are-agent-written-drafts.md) — reconsider AGENTS.md/CLAUDE.md/memory; audit improvements in one PR (D-017)
- [Bryce's settings profile](bryce-settings-profile.md) — tests/data/settings-defaults-export.json is his real iPhone export (HELMET, buttons, BUTTON 245%); seed it for HUD/touch work
- [Track with tasks and messages](track-with-tasks-and-messages.md) — fleet work: a task list per stream; workers send_message the dispatcher one line at PR open/red/decision/owner/land
