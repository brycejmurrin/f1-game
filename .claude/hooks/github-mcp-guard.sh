#!/bin/bash
# PreToolUse guard for the GitHub MCP tools that change a PR's merge state.
#
# AGENTS.md §Concurrent PRs: agents never arm auto-merge or merge, and a draft
# goes ready only after `node tools/ci/ready-gate.mjs` exits 0 and
# `node tools/ci/ready-full-cap.mjs` finds a free full-tier slot. Until
# 2026-10-14 that was prose only. settings.json DENIES merge_pull_request
# outright; this hook turns the two gated calls into a user prompt:
#
#   mcp__github__enable_pr_auto_merge          -> always "ask"
#   mcp__github__update_pull_request draft:false -> "ask" (the draft->ready flip)
#   any other update_pull_request (title/body/base edits) -> silent pass
#
# The merge METHOD is deliberately not checked (the squash/merge-commit policy
# is owned elsewhere). Output is the documented PreToolUse JSON
# (hookSpecificOutput.permissionDecision, https://code.claude.com/docs/en/hooks);
# "ask" also forces a prompt in auto mode. Exit 0 always; settings.json sets
# onFailure "block" so a crash refuses the call instead of letting it through.
exec python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.stderr.write("github-mcp-guard: could not read the hook payload; asking instead of passing.\n")
    d = {"tool_name": "unknown", "tool_input": {}}
name = d.get("tool_name") or ""
ti = d.get("tool_input") or {}
GATE = ("run `node tools/ci/ready-gate.mjs` (must exit 0 on the tip) and `node tools/ci/ready-full-cap.mjs` "
        "(must find a free full-tier slot) first")
reason = None
if name == "unknown":
    reason = "github-mcp-guard could not parse this call; confirm it by hand."
elif name.endswith("__enable_pr_auto_merge"):
    reason = ("Only CI Watch arms auto-merge (AGENTS.md §Concurrent PRs); agents and sessions never arm or merge. "
              "If you are CI Watch, " + GATE + ", then confirm.")
elif name.endswith("__update_pull_request"):
    draft = ti.get("draft")
    if draft is False or (isinstance(draft, str) and draft.strip().lower() == "false"):
        reason = ("Marking a draft ready starts the full CI tier. Before the flip, " + GATE +
                  ". Only CI Watch arms auto-merge afterwards.")
if reason:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                      "permissionDecision": "ask", "permissionDecisionReason": reason}}))
sys.exit(0)
'
