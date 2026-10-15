#!/usr/bin/env bash
# MCP-call guard for Cursor → the repo's GitHub MCP guard
# (.claude/hooks/github-mcp-guard.sh): no Actions run cancel, no squash/rebase,
# a person confirms a merge, an arm, a draft→ready flip and a re-run.
# Cursor's beforeMCPExecution sends {"tool_name", "tool_input": "<JSON string>",
# "mcp_server_name", ...} and reads {"permission": "allow"|"deny"|"ask",
# "user_message", "agent_message"}; exit 2 also denies
# (https://cursor.com/docs/agent/hooks). The guard normalises the payload; this
# adapter maps its PreToolUse decision onto Cursor's answer. 2026-10-15: run
# cancels under the owner's account kept landing after both Claude doors refused
# them, and Cursor's MCP door was the one left open.
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$(bash "$DIR/.claude/hooks/github-mcp-guard.sh")
python3 -c '
import json, sys
raw = sys.argv[1].strip()
h = (json.loads(raw).get("hookSpecificOutput") or {}) if raw else {}
p = h.get("permissionDecision") or "allow"
r = h.get("permissionDecisionReason") or ""
print(json.dumps({"permission": p, "user_message": r, "agent_message": r} if r else {"permission": p}))
sys.exit(2 if p == "deny" else 0)' "$OUT"
