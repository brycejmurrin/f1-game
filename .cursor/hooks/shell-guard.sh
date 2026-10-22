#!/usr/bin/env bash
# Shell-command guard for the non-Claude hosts → the repo's Bash guards
# (.claude/hooks/bash-guard.sh, then protect-files.sh for the files a command
# writes): the kill, push, ratchet and subagent-browser rules every agent host
# must obey. Cursor's beforeShellExecution sends {"command", "cwd", ...} and
# reads {"permission": "allow"|"deny"|"ask", "user_message", "agent_message"};
# Codex's PreToolUse sends Claude's shape {"tool_input": {"command"}} and reads
# Claude's hookSpecificOutput (https://cursor.com/docs/agent/hooks). Exit 2
# blocks in every host. For Cursor the guard's answer is mapped onto Cursor's
# flat JSON, so the agent reads WHY (stderr alone reaches only the hook log)
# and a gh ask stays an ask. The commit gate is left to .githooks/pre-commit
# when core.hooksPath points there (no double 25 s run).
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
[ "$(git -C "$DIR" config core.hooksPath 2>/dev/null)" = ".githooks" ] && export APEX_COMMIT_GATE=githook
RAW=$(cat)
NORM=$(printf '%s' "$RAW" | python3 -c '
import json,sys
d=json.load(sys.stdin)
if not isinstance(d.get("tool_input"), dict):
    d={"tool_name":"Bash","tool_input":{"command":d.get("command","")},"cwd":d.get("cwd",""),"_cursor":1}
print(json.dumps(d))')
CURSOR=$(printf '%s' "$NORM" | grep -q '"_cursor": 1' && echo 1)
# The command runs in the payload's cwd; git reads (the push and commit rules) must too.
CWD=$(printf '%s' "$NORM" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("cwd") or "")')
[ -n "$CWD" ] && [ -d "$CWD" ] && cd "$CWD"
ERR=$(mktemp); trap 'rm -f "$ERR"' EXIT
OUT=$(printf '%s' "$NORM" | CLAUDE_PROJECT_DIR="$DIR" bash "$DIR/.claude/hooks/bash-guard.sh" 2>"$ERR"); RC=$?
[ "$RC" = 2 ] || { printf '%s' "$NORM" | CLAUDE_PROJECT_DIR="$DIR" bash "$DIR/.claude/hooks/protect-files.sh" 2>>"$ERR"; RC2=$?; [ "$RC2" = 2 ] && RC=2; }
if [ "$CURSOR" != 1 ]; then
  cat "$ERR" >&2
  [ -n "$OUT" ] && printf '%s\n' "$OUT"
  exit "$RC"
fi
python3 -c '
import json, sys
rc, out, err = int(sys.argv[1]), sys.argv[2].strip(), open(sys.argv[3]).read().strip()
h = {}
try:
    h = (json.loads(out).get("hookSpecificOutput") or {}) if out else {}
except Exception:
    h = {}
p = "deny" if rc == 2 else (h.get("permissionDecision") or "allow")
msg = (err if rc == 2 else "") or h.get("permissionDecisionReason") or h.get("additionalContext") or ""
print(json.dumps({"permission": p, "user_message": msg, "agent_message": msg} if msg else {"permission": p}))
sys.exit(2 if p == "deny" else 0)' "$RC" "$OUT" "$ERR"
