#!/usr/bin/env bash
# MCP-call guard for Codex → the repo's GitHub MCP guard
# (.claude/hooks/github-mcp-guard.sh): merge commits only, no session merge or
# arm (land.yml lands), a ready-gate receipt before draft→ready, no Actions
# run cancel. Bryce approved this hook in his session (2026-10-19 ~22:10Z,
# AskUserQuestion "Yes, add the Codex MCP hook"): Codex ran only a Bash hook, so
# a Codex merge through an MCP GitHub tool skipped the gate
# (docs/plans/2026-10-19-fleet-redesign.md §8).
#
# On a supported, trusted local host, Codex PreToolUse sends tool_name and
# tool_input and reads Claude-style hookSpecificOutput JSON, or exit 2 to deny
# (https://learn.chatgpt.com/docs/hooks, read 2026-10-26). Cloud orchestration
# does not run local command hooks; adapter tests do not certify host delivery.
# Normalize the hosted connector spelling here, before the shared Claude policy.
# Codex does NOT support "ask": it "marks the hook run as failed, reports the
# error, and continues the tool call" — so every ask is turned into a deny here
# (a person can still run the call by hand). Codex runs a project hook only
# after `/hooks` trusts it.
set -u
DIR=$(cd "$(dirname "$0")/../.." && pwd)
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$DIR}"
python3 -c '
import json, re, subprocess, sys
try:
    data = json.load(sys.stdin)
    if not isinstance(data, dict) or not isinstance(data.get("tool_name"), str):
        raise ValueError("invalid hook payload")
    operation = re.fullmatch(r"mcp__(?:.*__|codex_apps__github_)(merge_pull_request|enable_pr_auto_merge|update_pull_request|actions_run_trigger|push_files|create_or_update_file|create_branch|delete_file)", data["tool_name"])
    if not operation:
        sys.exit(0)
    data["tool_name"] = "mcp__github__" + operation.group(1)
    ti = data.get("tool_input")
    if isinstance(ti, str):
        ti = json.loads(ti)
    if not isinstance(ti, dict):
        raise ValueError("invalid GitHub tool input")
    # the hosted connector names the PR `pr_number`, a key the shared guard does not read
    if ti.get("pullNumber") is None and ti.get("pr_number") is not None:
        ti["pullNumber"] = ti["pr_number"]
    data["tool_input"] = ti
    result = subprocess.run(["bash", sys.argv[1]], input=json.dumps(data), stdout=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise ValueError("delegated guard failed (exit " + str(result.returncode) + ")")
    raw = result.stdout.strip()
    if not raw:
        sys.exit(0)
    h = json.loads(raw)["hookSpecificOutput"]
    if not isinstance(h, dict):
        raise ValueError("invalid hook output")
    p = h["permissionDecision"]
    if p not in ("allow", "deny", "ask"):
        raise ValueError("invalid permission decision")
    r = h.get("permissionDecisionReason") or ""
    if not isinstance(r, str):
        raise ValueError("invalid permission reason")
except (ValueError, TypeError, KeyError, OSError) as e:
    p, r = "deny", "Codex MCP guard did not complete: " + str(e)
if p == "ask":
    p, r = "deny", "Codex cannot ask, so this hook denies instead: " + r
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": p, "permissionDecisionReason": r}}))
sys.exit(0)' "$DIR/.claude/hooks/github-mcp-guard.sh" || exit 2
