#!/usr/bin/env bash
# MCP-call guard for Codex → the repo's GitHub MCP guard
# (.claude/hooks/github-mcp-guard.sh): merge commits only, a merge-gate receipt
# before a merge or an arm, a ready-gate receipt before draft→ready, no Actions
# run cancel. Bryce approved this hook in his session (2026-10-19 ~22:10Z,
# AskUserQuestion "Yes, add the Codex MCP hook"): Codex ran only a Bash hook, so
# a Codex merge through an MCP GitHub tool skipped the gate
# (docs/plans/2026-10-19-fleet-redesign.md §8).
#
# Codex PreToolUse sends {"tool_name": "mcp__<server>__<tool>", "tool_input":
# {...}, "cwd", ...} and reads the same hookSpecificOutput JSON as Claude Code,
# or exit 2 to deny (https://learn.chatgpt.com/docs/hooks, read 2026-10-19).
# Codex does NOT support "ask": it "marks the hook run as failed, reports the
# error, and continues the tool call" — so every ask is turned into a deny here
# (a person can still run the call by hand). Codex runs a project hook only
# after `/hooks` trusts it.
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$(CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$DIR}" bash "$DIR/.claude/hooks/github-mcp-guard.sh"); RC=$?
python3 -c '
import json, sys
raw = sys.argv[1].strip()
try:
    if int(sys.argv[2]) != 0:
        raise ValueError("delegated guard failed (exit " + sys.argv[2] + ")")
    if not raw:
        sys.exit(0)
    h = json.loads(raw)["hookSpecificOutput"]
    p = h["permissionDecision"]
    if p not in ("allow", "deny", "ask"):
        raise ValueError("invalid permission decision")
    r = h.get("permissionDecisionReason") or ""
    if not isinstance(r, str):
        raise ValueError("invalid permission reason")
except (ValueError, TypeError, KeyError) as e:
    p, r = "deny", "Codex MCP guard did not complete: " + str(e)
if p == "ask":
    p, r = "deny", "Codex cannot ask, so this hook denies instead: " + r
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": p, "permissionDecisionReason": r}}))
sys.exit(0)' "$OUT" "$RC" || exit 2
