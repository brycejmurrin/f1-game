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
- [Stacked PRs land bottom-up](stacked-prs-land-bottom-up.md) — retarget by hand after each merge (no branch auto-delete), sync-pr on ratchets conflicts, ready + auto-merge one at a time
- [PR push with no CI run → dispatch ci.yml](pr-push-no-run-dispatch-ci.md) — a head pushed while the previous run is live may start no run; dispatch by hand, watch by sha
- [Killed background task: no marker, child gate dies](background-task-kill-no-marker.md) — 2 h ceiling; chain ≤ 3 gates, wait only on process liveness, never on a dead task's output file
- [Foreground browser run killed (137)](foreground-browser-run-killed.md) — launch Chromium/long node suites in the background only; a foreground one restarts the worker
- [Survey then fix](survey-then-fix.md) — after an audit, land the ranked gap list the same session; the user asks "fix all of those"
