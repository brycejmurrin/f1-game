#!/usr/bin/env bash
# File-edit guard for Cursor → the repo's edit guard (.claude/hooks/protect-files.sh):
# generated files, the live-run source freeze, and the ratchet bans (a hand raise
# of tests/data/ratchets.json or a ratchets.d fragment, another branch's fragment).
# Cursor's preToolUse sends {"tool_name", "tool_input": {...}, "cwd", ...} and reads
# {"permission": "allow"|"deny", "user_message", "agent_message"}; exit 2 denies
# (https://cursor.com/docs/agent/hooks). Claude's Edit maps onto Cursor's Write
# (https://cursor.com/docs/reference/third-party-hooks), but which tool names a
# string-replace or multi-edit carries is not documented, so hooks.json registers
# this with NO matcher (DAD's review of #3575) and the filter is here:
#   - read-only tools (Read, Grep, Glob, LS, Task, Web*, MCP:*) and Shell
#     (beforeShellExecution → shell-guard.sh) pass untouched;
#   - Delete is a removal of its path;
#   - any other tool whose input carries a path or a body is a write. Its path is
#     read from file_path / path / target_file / filePath, its body from content /
#     contents / file_text; old_string/new_string, old_str/new_str or edits make it
#     an Edit. A write with no readable path is DENIED (failClosed, not a warning);
#     with no readable body only the path rules run, and a ratchet file is refused
#     (bans 1-2 need the content). An unreadable payload is denied.
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
cd "$DIR" || { echo '{"permission": "deny", "user_message": "edit-guard: cannot enter the project directory."}'; exit 2; }
NORM=$(python3 -c '
import json, sys
d = json.load(sys.stdin)
tool = str(d.get("tool_name") or "")
ti = d.get("tool_input") or {}
if isinstance(ti, str):
    try: ti = json.loads(ti)
    except Exception: ti = {}
if not isinstance(ti, dict): ti = {}
READ_ONLY = {"Read", "Grep", "Glob", "LS", "Task", "WebFetch", "WebSearch", "Shell", "TodoWrite", "ReadLints"}
if tool in READ_ONLY or tool.startswith("MCP:"):
    print(json.dumps({"skip": 1})); sys.exit()
path = next((ti.get(k) for k in ("file_path", "path", "target_file", "filePath") if isinstance(ti.get(k), str) and ti.get(k)), "")
old = next((k for k in ("old_string", "old_str") if k in ti), None)
new = next((k for k in ("new_string", "new_str") if k in ti), None)
body = next((k for k in ("content", "contents", "file_text") if isinstance(ti.get(k), str)), None)
writes = tool in ("Write", "Edit", "MultiEdit", "StrReplace", "Delete") or path or old or new or body or ti.get("edits")
if not writes:
    print(json.dumps({"skip": 1})); sys.exit()
out = {"tool_input": {"file_path": path}, "cwd": d.get("cwd") or "", "_tool": tool}
if tool == "Delete":
    out["tool_name"] = "Delete"
elif ti.get("edits"):
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
  answer deny "edit-guard: could not read this tool payload, so the edit guard could not run."; exit 2
fi
case "$NORM" in '{"skip": 1}') answer allow; exit 0 ;; esac
FILE=$(printf '%s' "$NORM" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tool_input"]["file_path"])')
TOOL=$(printf '%s' "$NORM" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tool_name"])')
if [ -z "$FILE" ]; then
  answer deny "edit-guard: this file write carries no path the guard can read (file_path / path / target_file), so the generated-file and ratchet rules cannot run. Retry the write with an explicit file path."; exit 2
fi
case "$TOOL" in
  Delete)
    # A delete is a removal: protect-files reads `rm <path>` exactly as it reads a Claude Bash removal.
    NORM=$(FILE="$FILE" python3 -c 'import json,os,shlex; print(json.dumps({"tool_name": "Bash", "tool_input": {"command": "rm -- " + shlex.quote(os.environ["FILE"])}}))') ;;
  Unknown)
    # Only the content-free rules can be judged. A ratchet file needs the content (bans 1 and 2), so it is refused.
    case "$FILE" in
      *tests/data/ratchets.json|*tests/data/ratchets.d/*)
        answer deny "edit-guard: this write carries no content the guard can read, and $FILE is a ratchet file (shared safety bans 1-2). Write it with a full-content Write instead."; exit 2 ;;
    esac
    # An empty Edit runs the path-only rules (an outright generated file, the live-run freeze)
    # and matches no content rule, so a gen-block or test:* check cannot misfire on a missing body.
    NORM=$(printf '%s' "$NORM" | python3 -c 'import json,sys; d=json.load(sys.stdin); d["tool_name"]="Edit"; d["tool_input"].update(old_string="", new_string=""); print(json.dumps(d))') ;;
esac
ERR=$(printf '%s' "$NORM" | CLAUDE_PROJECT_DIR="$DIR" bash "$DIR/.claude/hooks/protect-files.sh" 2>&1 >/dev/null); RC=$?
if [ "$RC" = 2 ]; then answer deny "$ERR"; exit 2; fi
if [ "$RC" != 0 ]; then   # a crashed guard is a deny, not a pass (failClosed)
  answer deny "edit-guard: the edit guard failed (exit $RC): ${ERR:-no output}"; exit 2
fi
answer allow
