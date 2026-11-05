# Actions test executors and native implementation agents

The Actions coordinator schedules PR validation, diagnostics, releases and requested merges. It never launches
coding agents, assigns issue work or manages coding-session leases. Ready PRs queue validation automatically;
merging still requires explicit `/apex merge` and complete trusted evidence. See `docs/ACTIONS.md`.

GitHub Actions test executors claim persisted attempt reservations and run with read-only repository permissions.
Only trusted finalization may publish gate success; merge and release credentials remain separate. Missing or
cancelled tasks do not satisfy required coverage. `tools/ci/worker-prompt.md` documents this execution boundary.

Native implementation subagents are permitted for a user-authorized task and explicit parent brief. They follow
`.claude/agents/worker.md`, skill `steward` and `.github/pull_request_template.md`; their coding scope is independent
of test reservations. `/apex recover` repairs PR test infrastructure and cannot launch a coding successor.
