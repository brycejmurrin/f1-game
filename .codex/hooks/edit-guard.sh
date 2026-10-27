#!/usr/bin/env bash
# File-edit guard for Codex → the repo's edit guard (.claude/hooks/protect-files.sh):
# generated files, the live-run source freeze, the linked-worktree contract files and
# the ratchet bans. Codex edits files only through `apply_patch`; its PreToolUse hook
# sends {"tool_name": "apply_patch", "tool_input": {"command": "<patch>"}, "cwd", ...}
# (a matcher of Edit or Write also fires, but tool_name stays apply_patch) and reads
# hookSpecificOutput.permissionDecision "deny" (no "ask")
# (https://learn.chatgpt.com/docs/hooks, read 2026-10-26; redirected from
# https://developers.openai.com/codex/hooks). The page does not show the patch text,
# so this parses Codex's published apply_patch envelope:
#   *** Begin Patch / *** Add File: p (+lines) / *** Update File: p [*** Move to: q]
#   (@@ hunks of " " context, "-" old, "+" new) / *** Delete File: p / *** End Patch
# Each file becomes the Claude-shaped call protect-files.sh already judges: Add → Write
# with the added text, Update → MultiEdit (one old/new pair per hunk), Delete or a
# move's source → `rm <path>` via Bash, a move's target → the same MultiEdit. A patch
# it cannot read, a crashed guard, or a ratchet-file hunk with no old text (an insert
# the ratchet bans cannot evaluate) is denied — fail closed.
# W0 of docs/plans/2026-10-26-codex-parity.md; no live Codex payload has been captured.
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
deny() {
  python3 -c 'import json,sys; print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": sys.argv[1]}}))' "$1"
  exit 0
}
cd "$DIR" || deny "edit-guard: cannot enter the project directory."
CALLS=$(python3 -c '
import json, os, shlex, sys
d = json.load(sys.stdin)
ti = d.get("tool_input") or {}
if isinstance(ti, str):
    try: ti = json.loads(ti)
    except Exception: ti = {"command": ti}
patch = ti.get("command") if isinstance(ti, dict) else None
if isinstance(patch, list):    # an argv form ["apply_patch", "<patch>"]
    patch = next((p for p in reversed(patch) if isinstance(p, str) and "*** Begin Patch" in p), None)
if not isinstance(patch, str) or "*** Begin Patch" not in patch:
    sys.exit("no apply_patch envelope (*** Begin Patch) in tool_input.command")
cwd = d.get("cwd") or os.getcwd()
absp = lambda p: os.path.normpath(os.path.join(cwd, p.strip()))
ratchet = lambda p: p.endswith("tests/data/ratchets.json") or "/tests/data/ratchets.d/" in p
files, cur, hunk = [], None, None
def flush():
    global hunk
    if cur is not None and hunk is not None and (hunk[0] or hunk[1]):
        cur["edits"].append({"old_string": "\n".join(hunk[0]), "new_string": "\n".join(hunk[1])})
    hunk = None
for line in patch.splitlines():
    if line.startswith("*** "):
        flush()
        head = line[4:]
        for kind in ("Add File: ", "Update File: ", "Delete File: "):
            if head.startswith(kind):
                cur = {"kind": kind.split()[0], "path": absp(head[len(kind):]), "add": [], "edits": [], "to": None}
                files.append(cur)
                break
        else:
            if head.startswith("Move to: ") and cur is not None:
                cur["to"] = absp(head[len("Move to: "):])
            elif head.strip() not in ("Begin Patch", "End Patch", "End of File"):
                sys.exit("unknown patch line: " + line[:80])
        continue
    if cur is None:
        continue
    if cur["kind"] == "Add":
        if line.startswith("+"): cur["add"].append(line[1:])
        continue
    if cur["kind"] != "Update":
        continue
    if line.startswith("@@"):
        flush(); hunk = ([], []); continue
    if hunk is None: hunk = ([], [])
    tag, text = (line[:1], line[1:]) if line[:1] in (" ", "-", "+") else (" ", line)
    if tag in (" ", "-"): hunk[0].append(text)
    if tag in (" ", "+"): hunk[1].append(text)
flush()
if not files:
    sys.exit("the patch names no file")
out = []
for f in files:
    if f["kind"] == "Add":
        out.append({"tool_name": "Write", "tool_input": {"file_path": f["path"], "content": "\n".join(f["add"]) + "\n"}})
        continue
    if f["kind"] == "Delete" or f["to"]:
        out.append({"tool_name": "Bash", "tool_input": {"command": "rm -- " + shlex.quote(f["path"])}})
    if f["kind"] == "Update":
        for target in ([f["path"]] if not f["to"] else [f["to"]]):
            if ratchet(target) and (f["to"] or not f["edits"] or any(not e["old_string"] for e in f["edits"])):
                sys.exit("DENY:" + target + " is a ratchet file and this patch carries no old text the ratchet bans can "
                         "evaluate (shared safety bans 1-2); patch it with context lines")
            out.append({"tool_name": "MultiEdit", "tool_input": {"file_path": target, "edits": f["edits"]}})
for c in out:
    c["cwd"] = cwd
    print(json.dumps(c))
' 2>&1) || {
  case "$CALLS" in
    DENY:*) deny "edit-guard: ${CALLS#DENY:}" ;;
    *) deny "edit-guard: could not read this apply_patch payload, so the edit guard could not run (${CALLS:-no output})." ;;
  esac
}
while IFS= read -r CALL; do
  [ -n "$CALL" ] || continue
  ERR=$(printf '%s' "$CALL" | CLAUDE_PROJECT_DIR="$DIR" bash "$DIR/.claude/hooks/protect-files.sh" 2>&1 >/dev/null); RC=$?
  [ "$RC" = 0 ] && continue
  [ "$RC" = 2 ] && deny "$ERR"
  deny "edit-guard: the edit guard failed (exit $RC): ${ERR:-no output}"
done <<< "$CALLS"
exit 0
