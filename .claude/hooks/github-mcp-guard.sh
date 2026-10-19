#!/bin/bash
# PreToolUse guard for the GitHub MCP tools that change a PR's merge state.
#
# AGENTS.md §Concurrent PRs (MERGE-COMMIT-ONLY, #1458; standing authority,
# 2026-10-19): every PR lands as a merge commit, a merge or an arm needs a fresh
# merge-gate receipt pinned to the head it merges, and a draft goes ready only
# with a fresh ready-gate receipt. Until 2026-10-14 that was prose only; until
# 2026-10-19 the receipt was a human word per session (docs/plans/
# 2026-10-19-fleet-redesign.md §1). This hook:
#
#   merge_pull_request / enable_pr_auto_merge with a squash or rebase method
#                                                  -> "deny" (merge commits only)
#   enable_pr_auto_merge without mergeMethod MERGE  -> "ask" (the repo default may be squash)
#   merge_pull_request / enable_pr_auto_merge       -> "deny" unless artifacts/merge-gate/<pr>.json
#                                                     is ok, < 30 min old and its head is the call's
#                                                     expectedHeadSha (merge_policy.receipt_check)
#   update_pull_request draft falsy (false/0/"no"/"off", any case: draft->ready)
#                                                  -> "deny" unless artifacts/ready-gate/<pr>.json
#                                                     is ok and < 30 min old
#   any other update_pull_request (title/body/base) -> silent pass
#   actions_run_trigger *cancel* (cancel_workflow_run, force_cancel_…)
#                                                  -> "deny" (a queued run holds no slot; a sweep
#                                                     only buys a retrigger push — 2026-10-15), unless
#                                                     APEX_RUN_CANCEL_OK=1 (the user asked for it)
#   actions_run_trigger rerun_*                      -> "ask" (at most once, infra only; never a superseded run);
#                                                     silent under APEX_MERGE_DESK=1 (Bryce 2026-10-15:
#                                                     "all tools and mcps enabled", "Fix for me")
#
# APEX_MERGE_DESK=1 (set for EVERY session by .claude/settings.json `env` since
# 2026-10-15) no longer decides merges or ready flips: the receipt does, whoever
# asks. It still skips the re-run prompt. The reason texts and the receipt check
# live in merge_policy.py, shared with bash-guard.sh's `gh` rule. Output is
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
# Cursor beforeMCPExecution (.cursor/hooks/mcp-guard.sh) names the bare tool and
# sends tool_input as a JSON string: https://cursor.com/docs/agent/hooks
if name and "__" not in name and name != "unknown":
    name = "mcp__github__" + name
if isinstance(d.get("tool_input"), str):
    try:
        d["tool_input"] = json.loads(d["tool_input"] or "{}")
    except Exception:
        name = "unknown"
ti = d.get("tool_input") or {}
desk = os.environ.get("APEX_MERGE_DESK") == "1"
root = d.get("cwd") if not os.environ.get("CLAUDE_PROJECT_DIR") and d.get("cwd") else P.project_root()
def first(*keys):
    for k in keys:
        v = ti.get(k)
        if v is not None and str(v).strip() != "":
            return v
    return None
pr = first("pullNumber", "pull_number", "number", "pr")
decision, reason = None, None
merging = name.endswith("__merge_pull_request") or name.endswith("__enable_pr_auto_merge")
if name == "unknown":
    decision, reason = "ask", "github-mcp-guard could not parse this call; confirm it by hand."
elif merging:
    raw = ti.get("merge_method") if ti.get("merge_method") is not None else ti.get("mergeMethod")
    method = str(raw or "").strip().lower()
    if P.squash_or_rebase(raw):
        decision, reason = "deny", P.DENY_METHOD
    elif name.endswith("__enable_pr_auto_merge") and method != "merge":
        decision, reason = "ask", P.ASK_DESK_METHOD
    else:
        head = first("expectedHeadSha", "expected_head_sha", "headSha", "head_sha", "sha")
        ok, why = P.receipt_check(root, "merge", pr, head)
        if not ok:
            decision, reason = "deny", P.DENY_GATE_MERGE + " (" + why + ")"
elif name.endswith("__update_pull_request"):
    draft = ti.get("draft")
    falsy = draft is not None and draft is not True and str(draft).strip().lower() in ("false", "0", "no", "off", "")
    if falsy:
        ok, why = P.receipt_check(root, "ready", pr)
        if not ok:
            decision, reason = "deny", P.DENY_GATE_READY + " (" + why + ")"
elif name.endswith("__actions_run_trigger"):
    method = str(ti.get("method") or "").strip().lower()
    if "cancel" in method and os.environ.get("APEX_RUN_CANCEL_OK") != "1":
        decision, reason = "deny", P.DENY_CANCEL
    elif method in ("rerun_workflow_run", "rerun_failed_jobs") and not desk:
        decision, reason = "ask", P.ASK_RERUN
if decision:
    P.emit(decision, reason)
sys.exit(0)
' "$(dirname "$0")"
