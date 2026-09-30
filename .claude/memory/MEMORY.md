# Memory index

Claude Code auto memory for this repo, synced by `.claude/hooks/memory-sync.sh`
(cloud sessions): one line per memory linking its topic file, detail in the
topic file. User preferences and corrections only — a measured lesson belongs in
`docs/notes/`, a rule in a hook or test. An entry that contradicts the current
code or AGENTS.md is stale: fix or delete it, do not follow it.
- [PR auto-merge](pr-auto-merge.md) — open finished PRs ready + auto-merge, keep watching CI
- [Small steps for API analysis](small-steps-for-api-analysis.md) — prefer small incremental queries over bulk fetch scripts
- [Merge fast, verify on CI](merge-fast-verify-on-ci.md) — CI/tooling PRs: open ready, merge on request, watch the fast tier; never for js/ without the gate
- [One subagent per skill](one-subagent-per-skill.md) — skill reviews: one Sonnet subagent per skill, never grouped
- [GitHub Pro: 40 concurrent jobs](github-plan-pro-40-jobs.md) — account upgraded 2026-09-30; size CI against 40 standard / 5 macOS slots, not 20
