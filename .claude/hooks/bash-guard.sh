#!/bin/bash
# PreToolUse guard for Bash (Claude Code; Cursor and Codex reach it through their shell-guard adapters). The rules
# live in bash-guard.py, which reads the simple commands of the call through shellparse.py (pipelines, lists,
# subshells, substitutions, `bash -c`, wrappers and env prefixes stripped; quoted strings and heredoc data are
# never commands):
#  1. kills by name (pkill, killall, pgrep/pidof into kill) and a kill of a Chromium pid without APEX_KILL_OK=1;
#  2. inside a subagent (agent_id): a browser run, and a write to the .claude/allow-* hatches or the guard files;
#  3. git commit --no-verify / -n, and a write or override of the git hooks path;
#  4. gh run cancel / pr merge / pr ready, and their REST and GraphQL forms through gh api.
# A seatbelt against accidents, not a security boundary: a verb built at run time (`$x`, a script file, a
# `bash -c "$var"`) passes; the backstops are .githooks/pre-push, the Deploy-reset ruleset and CI.
# FAIL CLOSED: a missing python3, an unparsable command or a crash is a refusal (settings.json also sets
# onFailure "block"). Exit 2 refuses with the reason on stderr.
command -v python3 >/dev/null 2>&1 || { echo "BLOCKED: bash-guard needs python3 to read the call; none of its rules ran, so it is refused (fail closed)." >&2; exit 2; }
python3 "$(dirname "$0")/bash-guard.py"
rc=$?
case "$rc" in
  0|2) exit "$rc" ;;
  *) echo "BLOCKED: bash-guard.py failed with exit $rc, so its rules did not finish and this command is refused (fail closed). Report the hook error; do not work around it." >&2
     exit 2 ;;
esac
