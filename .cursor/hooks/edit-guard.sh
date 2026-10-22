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
# file_text; old_string/new_string or old_str/new_str (or edits) make it an
# Edit. With no readable content only the path rules run (a ratchet file is
# refused: bans 1-2 need the content); no readable path is allowed with a
# warning; an unreadable payload is denied, as hooks.json registers failClosed.
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
old = next((k for k in ("old_string", "old_str") if k in ti), None)
new = next((k for k in ("new_string", "new_str") if k in ti), None)
body = next((k for k in ("content", "contents", "file_text") if isinstance(ti.get(k), str)), None)
out = {"tool_input": {"file_path": path}, "cwd": d.get("cwd") or ""}
if ti.get("edits"):
    out["tool_name"] = "MultiEdit"; out["tool_input"]["edits"] = ti["edits"]
elif old or new:
    out["tool_name"] = "Edit"
    out["tool_input"].update({"old_string": ti.get(old) or "", "new_string": ti.get(new) or "", "replace_all": bool(ti.get("replace_all"))})
elif body:
    out["tool_name"] = "Write"; out["tool_input"]["content"] = ti[body]
else:
    out["tool_name"] = "Unknown"   # a shape this adapter does not read (code_edit, a diff): never judged as an empty Write
print(json.dumps(out))') || NORM=""
answer() { python3 -c 'import json,sys; m=sys.argv[2]; print(json.dumps({"permission": sys.argv[1], **({"user_message": m, "agent_message": m} if m else {})}))' "$1" "${2:-}"; }
if [ -z "$NORM" ]; then   # registered failClosed: an unreadable payload must not pass as an allow
  answer deny "edit-guard: could not read this Write payload, so the edit guard could not run."; exit 2
fi
FILE=$(printf '%s' "$NORM" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tool_input"]["file_path"])')
if [ -z "$FILE" ]; then
  answer allow "edit-guard: no file path in this Write payload; the generated-file and ratchet rules did NOT run."; exit 0
fi
if printf '%s' "$NORM" | grep -q '"tool_name": "Unknown"'; then
  # Only the content-free rules can be judged. A ratchet file needs the content (bans 1 and 2), so it is refused.
  case "$FILE" in
    *tests/data/ratchets.json|*tests/data/ratchets.d/*)
      answer deny "edit-guard: this Write payload carries no content the guard can read, and $FILE is a ratchet file (shared safety bans 1-2). Write it with a full-content Write instead."; exit 2 ;;
  esac
  # An empty Edit runs the path-only rules (an outright generated file, the live-run freeze)
  # and matches no content rule, so a gen-block or test:* check cannot misfire on a missing body.
  NORM=$(printf '%s' "$NORM" | python3 -c 'import json,sys; d=json.load(sys.stdin); d["tool_name"]="Edit"; d["tool_input"].update(old_string="", new_string=""); print(json.dumps(d))')
fi
ERR=$(printf '%s' "$NORM" | CLAUDE_PROJECT_DIR="$DIR" bash "$DIR/.claude/hooks/protect-files.sh" 2>&1 >/dev/null); RC=$?
if [ "$RC" = 2 ]; then answer deny "$ERR"; exit 2; fi
answer allow
