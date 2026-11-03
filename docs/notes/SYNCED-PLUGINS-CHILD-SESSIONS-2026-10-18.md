# Synced claude.ai plugins in child sessions (measured 2026-10-18, re-measured 2026-10-26)

Kind: measurement · Re-measure-by: 2026-12-15

Moved out of `.claude/memory/` on 2026-11-03: a dated platform fact, not a
preference (docs/plans/2026-11-03-agent-surface-reset.md §4.9).

**2026-10-18.** Synced claude.ai plugins (`claude plugin list` → `<name>@synced`)
loaded in the session Bryce started, but a sibling spawned via `create_session`
reported "plugin skills don't load in my session" (harness-audit sibling, PR
#2873). The parent (started by Bryce from iOS, `CLAUDE_CODE_ENTRYPOINT=remote_mobile`)
had 28 `@synced` plugins; the child (`create_session`, origin
`claude_code_mcp_seed`, `ENTRYPOINT=remote`) had "No plugins installed" and an
empty synced folder, in the same `cloud_default` environment.

**2026-10-26.** A child session created by `create_session` (the system-audit
lane) listed `anthropic-skills:*` plugin skills, so the limitation no longer
reproduces as stated.

**How to apply.** Discover the installed skills and tools in each target
session before relying on a plugin; when the limitation reproduces, run work
that must invoke a plugin skill in the parent session or its in-session
subagents and hand only the findings to a sibling. Re-measure by the date
above: one `create_session` child, `claude plugin list`, record the count here.
