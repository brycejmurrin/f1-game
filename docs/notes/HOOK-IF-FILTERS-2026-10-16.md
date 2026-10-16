# PreToolUse `if:` filters (#1711)

Source: https://code.claude.com/docs/en/hooks (field `if`) and https://code.claude.com/docs/en/permissions (Bash rule matching), read 2026-10-16.

- `if` holds ONE permission rule per handler (no `||`), so bash-guard.sh is registered once per pattern in `.claude/settings.json`.
- Each subcommand of a compound is matched on its own (`foo && git commit` reaches `*git*`); a command Claude Code cannot parse runs the hook regardless — the compound-catcher.
- Patterns are substring globs over the verbs bash-guard polices (git, gh, kill/pgrep, curl, node/npm/npx, playwright, chrome, python, shells, eval, xargs). Read-only `ls`/`cat`/`grep`/`head`/`sed -n` no longer spawn it.
- protect-files.sh on Bash is deliberately unfiltered: it polices writes (redirects, any interpreter), which no verb list covers.
- Not verified: whether identical handlers in one group are deduplicated by the harness. If not, a command matching several patterns spawns the guard once per match (typically 1–2).
- Tested in `tests/unit/agent-config.test.mjs` (patterns parse, policed shapes reach, read-only skip).
