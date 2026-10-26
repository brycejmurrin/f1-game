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
- [Worker model by task](worker-model-by-task.md) — 2026-10-19: orchestrator picks Opus or Sonnet per worker; Fable only when Bryce names it (2026-10-22 visor)
- [Ask via AskUserQuestion](ask-via-askuserquestion.md) — Bryce-attended sessions only; unattended fleet sessions post BLOCKED to their orchestrator
- [Preview must look different](preview-must-look-different.md) — design sheets must differ in the picture (pixel-diff, close-up framing), not just in mm metrics; Bryce: "they all look the same"
- [Synced plugins in child sessions](synced-plugins-not-in-child-sessions.md) — 2026-10-18 limitation; re-verified 2026-10-26 that child sessions list plugin skills
- [Orchestrator dispatches Pages](orchestrator-dispatches-pages.md) — dispatch pages.yml after merges instead of waiting for the cron; never dual-dispatch
- [Design lanes: one living artifact](design-lanes-living-artifact.md) — each design session republishes ONE gallery to the same URL per round; Bryce iterates on it
- [Short PR check-ins](short-pr-check-ins.md) — check-ins short, never hours (Bryce 2026-10-19); the number is pending Bryce
- [Orchestrator saves queue](orchestrator-saves-queue.md) — persist tasks + merge order to a pushed state branch every wake (Bryce 2026-10-21)
- [Idle lanes do parallel work](idle-lanes-parallel-work.md) — 2026-10-22: idle hunters/workers use worktrees, MCPs, subagents, web research while waiting
- [Discuss decisions with fleets](discuss-decisions-with-fleets.md) — 2026-10-22: cross-fleet decisions go to bus + webhook (DAD, Merlin) before acting
- [Bryce iPhone uses TLX WebGPU](bryce-iphone-tlx-webgpu.md) — plays THREE PATH: WEBGPU on iPhone and it works; measure that path first
- [Rules are agent-written drafts](rules-are-agent-written-drafts.md) — Bryce 2026-10-26: reconsider AGENTS.md/CLAUDE.md/memory; audit improvements in one PR
- [Fan out with subagents](fan-out-with-subagents.md) — 2026-10-26: multi-part fleet tasks go to worker subagents in worktrees
- [Train ratchet standing OK](train-ratchet-standing-ok.md) — Bryce 2026-10-26: tree-ratchet +1..+3 from train combinations may be raised with a stated reason, no per-case ask
