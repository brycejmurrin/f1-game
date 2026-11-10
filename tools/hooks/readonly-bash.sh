#!/usr/bin/env bash
# @doc PreToolUse Bash hook for read-only subagents: an allowlist of read commands; `READONLY_BASH_ALLOW` is the one exception.
# @skill agent-config
#
# readonly-bash.sh — wired from the `hooks:` frontmatter of every reporter agent (.claude/agents/README.md
# §Enforcement). The rules live in .claude/hooks/readonly_bash.py: every simple command of the call (as .claude/hooks/shellparse.py
# reads it) must be on the read list, and a redirection may only reach /dev/null, scratch/ or artifacts/. ONE
# exception per agent, as a regex in READONLY_BASH_ALLOW (env) or as $1, matched against the whole command
# (verify-agent's `git worktree add --detach|remove scratch/verify-base-*`).
# A seatbelt against accidents, not a boundary: the parent's diff review is the backstop. Exit 2 refuses with the
# reason on stderr; a missing python3, an unreadable payload or a crash is a refusal (fail closed).
command -v python3 >/dev/null 2>&1 || { echo "BLOCKED: readonly-bash needs python3 (fail closed)." >&2; exit 2; }
python3 "$(cd "$(dirname "$0")/../.." && pwd)/.claude/hooks/readonly_bash.py" "$@"
rc=$?
case "$rc" in 0|2) exit "$rc" ;; *) echo "BLOCKED: readonly_bash.py failed with exit $rc (fail closed)." >&2; exit 2 ;; esac
