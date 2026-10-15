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
#   update_pull_request draft falsy (false/0/"no"/"off", any case: draft->ready)
#                                                  -> "ask" (run the gates first)
#   any other update_pull_request (title/body/base) -> silent pass
#   actions_run_trigger cancel_workflow_run          -> "deny" (a queued run holds no slot; a sweep
#                                                     only buys a retrigger push — 2026-10-15), unless
#                                                     APEX_RUN_CANCEL_OK=1 (the user asked for it)
#   actions_run_trigger rerun_*                      -> "ask" (at most once, infra only; never a superseded run)
#
# APEX_MERGE_DESK=1 in the environment (the designated Merge Desk / Grok Bot
# role) skips the "ask" prompts; the squash/rebase deny still applies, and an
# enable_pr_auto_merge that does not name MERGE still asks (an omitted method is
# the repo default, which may be squash — red-team round 2, 2026-10-14). The
# reason texts live in merge_policy.py, shared with bash-guard.sh's `gh` rule. Output is
# the documented PreToolUse JSON (hookSpecificOutput.permissionDecision,
# https://code.claude.com/docs/en/hooks). Exit 0 always; settings.json sets
# onFailure "block" so a crash refuses the call instead of letting it through.
exec python3 -c '
import json, os, sys
sys.path.insert(0, sys.argv[1])
import merge_policy as P
try:
    d = json.load(sys.stdin)
except Exception:
    sys.stderr.write("github-mcp-guard: could not read the hook payload; asking instead of passing.\n")
    d = {"tool_name": "unknown", "tool_input": {}}
name = d.get("tool_name") or ""
ti = d.get("tool_input") or {}
desk = os.environ.get("APEX_MERGE_DESK") == "1"
decision, reason = None, None
merging = name.endswith("__merge_pull_request") or name.endswith("__enable_pr_auto_merge")
if name == "unknown":
    decision, reason = "ask", "github-mcp-guard could not parse this call; confirm it by hand."
elif merging:
    raw = ti.get("merge_method") if ti.get("merge_method") is not None else ti.get("mergeMethod")
    method = str(raw or "").strip().lower()
    if P.squash_or_rebase(raw):
        decision, reason = "deny", P.DENY_METHOD
    elif not desk:
        decision, reason = "ask", P.ASK_MERGE
    elif name.endswith("__enable_pr_auto_merge") and method != "merge":
        decision, reason = "ask", P.ASK_DESK_METHOD
elif name.endswith("__update_pull_request"):
    draft = ti.get("draft")
    falsy = draft is not None and draft is not True and str(draft).strip().lower() in ("false", "0", "no", "off", "")
    if falsy and not desk:
        decision, reason = "ask", P.ASK_READY
elif name.endswith("__actions_run_trigger"):
    method = str(ti.get("method") or "").strip().lower()
    if method == "cancel_workflow_run" and os.environ.get("APEX_RUN_CANCEL_OK") != "1":
        decision, reason = "deny", P.DENY_CANCEL
    elif method in ("rerun_workflow_run", "rerun_failed_jobs"):
        decision, reason = "ask", P.ASK_RERUN
if decision:
    P.emit(decision, reason)
sys.exit(0)
' "$(dirname "$0")"
