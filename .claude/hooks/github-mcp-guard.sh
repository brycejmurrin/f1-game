#!/bin/bash
# PreToolUse guard for the GitHub MCP tools that change a PR's merge state.
#
# AGENTS.md §Concurrent PRs (MERGE-COMMIT-ONLY, #1458): every PR lands as a
# merge commit; Merge Desk arms auto-merge (method MERGE) and Grok Bot may merge
# a green non-draft PR; other agents never arm or merge, and a draft goes ready
# only after `node tools/ci/ready-gate.mjs --pr <n>` exits 0 and
# `node tools/ci/ready-full-cap.mjs` finds a free full-tier slot. Until
# 2026-10-14 that was prose only. This hook:
#
#   merge_pull_request / enable_pr_auto_merge with a squash or rebase method
#                                                  -> "deny" (merge commits only)
#   merge_pull_request / enable_pr_auto_merge       -> "ask" (a person confirms)
#   update_pull_request draft:false (draft->ready)  -> "ask" (run the gates first)
#   any other update_pull_request (title/body/base) -> silent pass
#
# APEX_MERGE_DESK=1 in the environment (the designated Merge Desk / Grok Bot
# role) skips the "ask" prompts; the squash/rebase deny still applies. Output is
# the documented PreToolUse JSON (hookSpecificOutput.permissionDecision,
# https://code.claude.com/docs/en/hooks). Exit 0 always; settings.json sets
# onFailure "block" so a crash refuses the call instead of letting it through.
exec python3 -c '
import json, os, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.stderr.write("github-mcp-guard: could not read the hook payload; asking instead of passing.\n")
    d = {"tool_name": "unknown", "tool_input": {}}
name = d.get("tool_name") or ""
ti = d.get("tool_input") or {}
desk = os.environ.get("APEX_MERGE_DESK") == "1"
GATE = ("run `node tools/ci/ready-gate.mjs --pr <n>` (must exit 0 on the tip) and `node tools/ci/ready-full-cap.mjs` "
        "(must find a free full-tier slot) first")
decision, reason = None, None
merging = name.endswith("__merge_pull_request") or name.endswith("__enable_pr_auto_merge")
if name == "unknown":
    decision, reason = "ask", "github-mcp-guard could not parse this call; confirm it by hand."
elif merging:
    method = str(ti.get("merge_method") or ti.get("mergeMethod") or "").strip().lower()
    if method in ("squash", "rebase"):
        decision, reason = "deny", ("MERGE-COMMIT-ONLY (AGENTS.md §Concurrent PRs): every PR lands as a merge commit; "
                                    "use the merge method, never squash or rebase.")
    elif not desk:
        decision, reason = "ask", ("Only Merge Desk arms auto-merge and only Merge Desk / Grok Bot merge (AGENTS.md "
                                   "§Concurrent PRs), unless the user asked for this merge. Before confirming, " + GATE +
                                   "; never a draft, DIRTY/CONFLICTING or MERGE-HOLD PR.")
elif name.endswith("__update_pull_request"):
    draft = ti.get("draft")
    if (draft is False or (isinstance(draft, str) and draft.strip().lower() == "false")) and not desk:
        decision, reason = "ask", ("Marking a draft ready starts the full CI tier. Before the flip, " + GATE + ".")
if decision:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                      "permissionDecision": decision, "permissionDecisionReason": reason}}))
sys.exit(0)
'
