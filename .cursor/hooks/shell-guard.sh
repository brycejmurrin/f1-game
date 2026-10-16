#!/usr/bin/env bash
# Shell-command guard for the non-Claude hosts → the repo's Bash guard
# (.claude/hooks/bash-guard.sh): the kill, push and subagent-browser rules
# every agent host must obey. Cursor's beforeShellExecution sends
# {"command", "cwd", ...} (cursor.com/docs/agent/hooks); Codex's PreToolUse
# sends Claude's shape {"tool_input": {"command"}}; both are normalised to the
# latter. Exit 2 blocks in every host. The commit gate is left to
# .githooks/pre-commit when core.hooksPath points there (no double 25 s run).
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
[ "$(git -C "$DIR" config core.hooksPath 2>/dev/null)" = ".githooks" ] && export APEX_COMMIT_GATE=githook
python3 -c '
import json,sys
d=json.load(sys.stdin)
if not isinstance(d.get("tool_input"), dict):
    d={"tool_name":"Bash","tool_input":{"command":d.get("command","")},"cwd":d.get("cwd","")}
print(json.dumps(d))' | CLAUDE_PROJECT_DIR="$DIR" bash "$DIR/.claude/hooks/bash-guard.sh"
