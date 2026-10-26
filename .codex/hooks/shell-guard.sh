#!/usr/bin/env bash
# Keep the shared Bash/file guards and Cursor behavior unchanged. Apply the
# same Codex ask-to-deny contract as .codex/hooks/mcp-guard.sh to shell calls.
# Deterministic adapter tests establish translation, not host hook invocation.
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$(bash "$DIR/.cursor/hooks/shell-guard.sh"); RC=$?
python3 -c '
import json, sys
raw = sys.argv[1].strip()
try:
    if int(sys.argv[2]) != 0:
        raise ValueError("shared shell guard refused or failed (exit " + sys.argv[2] + ")")
    if not raw:
        sys.exit(0)
    data = json.loads(raw)
    h = data["hookSpecificOutput"]
    if not isinstance(h, dict):
        raise ValueError("invalid hook output")
    p = h.get("permissionDecision")
    if p is None:
        if not isinstance(h.get("additionalContext"), str):
            raise ValueError("missing permission decision or advice")
        print(json.dumps(data))
        sys.exit(0)
    if p not in ("allow", "ask", "deny"):
        raise ValueError("invalid permission decision")
    r = h.get("permissionDecisionReason") or ""
    if not isinstance(r, str):
        raise ValueError("invalid permission reason")
    if p == "ask":
        p, r = "deny", "Codex cannot ask, so this hook denies instead: " + r
except (ValueError, TypeError, KeyError) as e:
    p, r = "deny", "Codex shell guard did not complete: " + str(e)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": p, "permissionDecisionReason": r}}))
' "$OUT" "$RC" || exit 2
