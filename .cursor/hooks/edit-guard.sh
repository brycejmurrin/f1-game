#!/usr/bin/env bash
# File-edit guard for Cursor → the repo's edit guard (.claude/hooks/protect-files.sh):
# generated files, the live-run source freeze, and the ratchet bans (a hand raise
# of tests/data/ratchets.json or a ratchets.d fragment, another branch's fragment).
# Cursor's preToolUse sends {"tool_name": "Write", "tool_input": {...}, "cwd", ...}
# for every file write, Claude's Edit included (https://cursor.com/docs/agent/hooks;
# tool map: https://cursor.com/docs/reference/third-party-hooks), and reads
# {"permission": "allow"|"deny", "user_message", "agent_message"}; exit 2 denies.
# The Write payload's field names are not documented, so the path is read from
# file_path / path / target_file and the content from content / contents /
# file_text; old_string/new_string (or edits) make it an Edit. A payload with
# no readable path is allowed with a warning, never guessed at.
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
cd "$DIR" || exit 0
NORM=$(python3 -c '
import json, sys
d = json.load(sys.stdin)
ti = d.get("tool_input") or {}
if isinstance(ti, str):
    try: ti = json.loads(ti)
    except Exception: ti = {}
path = next((ti.get(k) for k in ("file_path", "path", "target_file", "filePath") if ti.get(k)), "")
out = {"tool_input": {"file_path": path}, "cwd": d.get("cwd") or ""}
if ti.get("edits"):
    out["tool_name"] = "MultiEdit"; out["tool_input"]["edits"] = ti["edits"]
elif "old_string" in ti or "new_string" in ti:
    out["tool_name"] = "Edit"
    for k in ("old_string", "new_string", "replace_all"):
        if k in ti: out["tool_input"][k] = ti[k]
else:
    out["tool_name"] = "Write"
    out["tool_input"]["content"] = next((ti[k] for k in ("content", "contents", "file_text") if isinstance(ti.get(k), str)), "")
print(json.dumps(out))')
if [ -z "$(printf '%s' "$NORM" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tool_input"]["file_path"])' 2>/dev/null)" ]; then
  echo '{"permission": "allow", "agent_message": "edit-guard: no file path in this Write payload; the generated-file and ratchet rules did NOT run."}'
  exit 0
fi
ERR=$(printf '%s' "$NORM" | CLAUDE_PROJECT_DIR="$DIR" bash "$DIR/.claude/hooks/protect-files.sh" 2>&1 >/dev/null); RC=$?
python3 -c '
import json, sys
rc, err = int(sys.argv[1]), sys.argv[2].strip()
print(json.dumps({"permission": "deny", "user_message": err, "agent_message": err} if rc == 2 else {"permission": "allow"}))
sys.exit(2 if rc == 2 else 0)' "$RC" "$ERR"
