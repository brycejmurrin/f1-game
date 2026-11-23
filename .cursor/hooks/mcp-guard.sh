#!/usr/bin/env bash
# MCP-call guard for Cursor → the repo's GitHub MCP guard
# (.claude/hooks/github-mcp-guard.sh, the one table behind all three doors): no
# merge, arm, API file write, run cancel or re-run; a PR close or a `hold` drop asks.
# Cursor's beforeMCPExecution sends {"tool_name", "tool_input": "<JSON string>",
# "mcp_server_name", ...} and reads {"permission": "allow"|"deny"|"ask",
# "user_message", "agent_message"}; exit 2 also denies
# (https://cursor.com/docs/agent/hooks). Cloud agents do not run beforeMCPExecution: there
# an MCP call reaches preToolUse as `MCP:<tool>`, and .cursor/hooks/edit-guard.sh hands it
# here. The guard normalises the payload; this
# adapter maps its PreToolUse decision onto Cursor's answer. 2026-10-15: run
# cancels under the owner's account kept landing after both Claude doors refused
# them, and Cursor's MCP door was the one left open.
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$(bash "$DIR/.claude/hooks/github-mcp-guard.sh"); RC=$?
python3 -c '
import json, sys
raw = sys.argv[1].strip()
try:
    if int(sys.argv[2]) != 0:
        raise ValueError("delegated guard failed (exit " + sys.argv[2] + ")")
    if raw:
        h = json.loads(raw)["hookSpecificOutput"]
        p = h["permissionDecision"]
        r = h.get("permissionDecisionReason") or ""
        if p not in ("allow", "deny", "ask") or not isinstance(r, str):
            raise ValueError("invalid permission decision")
    else:
        p, r = "allow", ""
except (ValueError, TypeError, KeyError) as e:
    p, r = "deny", "Cursor MCP guard did not complete: " + str(e)
print(json.dumps({"permission": p, "user_message": r, "agent_message": r} if r else {"permission": p}))
sys.exit(2 if p == "deny" else 0)' "$OUT" "$RC"
