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
#                                                     is ok, < 10 min old and its head is the call's
#                                                     expectedHeadSha (merge_policy.receipt_check)
#   update_pull_request draft falsy (false/0/"no"/"off", any case: draft->ready)
#                                                  -> "deny" unless artifacts/ready-gate/<pr>.json
#                                                     is ok and < 10 min old
#   update_pull_request state "closed"            -> "ask" (2026-10-26: closing a PR was neither denied nor hooked)
#   any other update_pull_request (title/body/base) -> silent pass
#   push_files / create_or_update_file / create_branch / delete_file
#                                                  -> "deny" (settings.json denies them too; this is the
#                                                     Cursor/Codex door: on the admin App token a file write
#                                                     lands on any branch with no PR and no CI)
#   mark_pull_request_ready_for_review (Codex connector) -> as a draft->ready update_pull_request
#   update_ref with force truthy, or a ref write (update_ref / create_ref / delete_ref / delete_branch)
#   naming the deploy branch                       -> "deny" (`git push` only; never forced, never the deploy branch)
#   create_blob / create_tree / create_commit / update_file
#                                                  -> "deny" (a Git Data API file push skips .githooks/pre-push;
#                                                     docs/notes/CODEX-ARCHIVE-MINING-2026-10-26.md R2-2)
#   actions_run_trigger run_workflow of pages.yml / ci.yml (or a numeric id)
#                                                  -> "ask" (the release train: never dual-dispatch Pages)
#   actions_run_trigger delete_workflow_run_logs     -> "ask" (evidence other sessions read)
#   actions_run_trigger *cancel* (cancel_workflow_run, force_cancel_…)
#                                                  -> "deny" (a queued run holds no slot; a sweep
#                                                     only buys a retrigger push — 2026-10-15), unless
#                                                     APEX_RUN_CANCEL_OK=1 (the user asked for it)
#   actions_run_trigger rerun_*                      -> "ask" (at most once, infra only; never a superseded run);
#                                                     silent under APEX_MERGE_DESK=1 (Bryce 2026-10-15:
#                                                     "all tools and mcps enabled", "Fix for me")
#
# Tool names: Claude Code sends mcp__<server>__<tool>, Cursor the bare <tool>, Codex its connector as
# mcp__codex_apps__github_<tool> (shape: tests/unit/session-contracts.test.mjs). The tool is the last "__"
# segment when that is a known name, else the longest known name the call ends with after "_" or "."
# (2026-10-26, W0 of docs/plans/2026-10-26-codex-parity.md; no live Codex connector payload captured yet).
#
# Receipts: merge_policy.receipt_check(..., verify_files=True) also refuses a
# receipt whose gate files (merge-gate.mjs, ready-gate.mjs, gate-receipt.mjs)
# differ from this checkout's committed tree (the 2026-10-20 O23 incident).
#
# APEX_MERGE_DESK=1 no longer decides merges or ready flips: the receipt does,
# whoever asks. It only skips the re-run prompt, and since 2026-10-26 it is no
# longer in the shared settings.json `env` — the orchestrator's environment sets
# it (user grant, Bryce 2026-10-26 ~23:00 PT: "Fix hook or guard or perm";
# docs/notes/HOOKS-SECURITY-2026-10-26.md). The reason texts and the receipt check
# live in merge_policy.py, shared with bash-guard.sh's `gh` rule. Output is
# the documented PreToolUse JSON (hookSpecificOutput.permissionDecision,
# https://code.claude.com/docs/en/hooks). Exit 0 always; settings.json sets
# onFailure "block" so a crash refuses the call instead of letting it through.
exec python3 -c '
import json, os, re, sys
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
pr = first("pullNumber", "pull_number", "pr_number", "number", "pr")
TOOLS = ("merge_pull_request", "enable_pr_auto_merge", "update_pull_request", "actions_run_trigger",
         "mark_pull_request_ready_for_review", "update_ref", "create_ref", "delete_ref", "create_branch",
         "delete_branch", "delete_file", "create_blob", "create_tree", "create_commit", "update_file",
         "create_or_update_file", "push_files")
tool = name.rsplit("__", 1)[-1]
if tool not in TOOLS:
    tool = max((t for t in TOOLS if name.endswith("_" + t) or name.endswith("." + t)), key=len, default=tool)
DEPLOY = "claude/f1-game-project-26h3ng"
def deploy_ref():
    for k in ("ref", "branch", "branch_name", "branchName", "new_branch", "name"):
        if re.sub(r"^(refs/)?heads/", "", str(ti.get(k) or "").strip()) == DEPLOY:
            return True
    return False
def truthy(v):
    return v is True or str(v).strip().lower() in ("true", "1", "yes", "on")
DENY_GITDATA = ("writes files through the GitHub Git Data / contents API, which skips .githooks/pre-push: files reach "
                "GitHub by `git push` (AGENTS.md); see docs/notes/CODEX-ARCHIVE-MINING-2026-10-26.md R2-2.")
decision, reason = None, None
merging = tool in ("merge_pull_request", "enable_pr_auto_merge")
if name == "unknown":
    decision, reason = "ask", "github-mcp-guard could not parse this call; confirm it by hand."
elif merging:
    raw = ti.get("merge_method") if ti.get("merge_method") is not None else ti.get("mergeMethod")
    method = str(raw or "").strip().lower()
    if P.squash_or_rebase(raw):
        decision, reason = "deny", P.DENY_METHOD
    elif tool == "enable_pr_auto_merge" and method != "merge":
        decision, reason = "ask", P.ASK_DESK_METHOD
    else:
        head = first("expectedHeadSha", "expected_head_sha", "headSha", "head_sha", "sha")
        ok, why = P.receipt_check(root, "merge", pr, head, verify_files=True)
        if not ok:
            decision, reason = "deny", P.DENY_GATE_MERGE + " (" + why + ")"
elif tool in ("update_ref", "create_ref", "delete_ref", "delete_branch") and deploy_ref():
    decision, reason = "deny", "github-mcp-guard: " + tool + " names the deploy branch " + DEPLOY + ": it " + P.DENY_REF
elif tool == "update_ref" and truthy(ti.get("force")):
    decision, reason = "deny", "github-mcp-guard: a forced update_ref " + P.DENY_REF
elif tool in ("push_files", "create_or_update_file", "create_branch", "delete_file"):
    decision, reason = "deny", "github-mcp-guard: " + tool + " " + P.DENY_WRITE
elif tool in ("create_blob", "create_tree", "create_commit", "update_file"):
    decision, reason = "deny", "github-mcp-guard: " + tool + " " + DENY_GITDATA
elif tool == "mark_pull_request_ready_for_review":
    ok, why = P.receipt_check(root, "ready", pr, verify_files=True)
    if not ok:
        decision, reason = "deny", P.DENY_GATE_READY + " (" + why + ")"
elif tool == "update_pull_request":
    draft = ti.get("draft")
    falsy = draft is not None and draft is not True and str(draft).strip().lower() in ("false", "0", "no", "off", "")
    if falsy:
        ok, why = P.receipt_check(root, "ready", pr, verify_files=True)
        if not ok:
            decision, reason = "deny", P.DENY_GATE_READY + " (" + why + ")"
    if decision is None and str(ti.get("state") or "").strip().lower() == "closed":
        decision, reason = "ask", P.ASK_CLOSE
elif tool == "actions_run_trigger":
    method = str(ti.get("method") or "").strip().lower()
    if "cancel" in method and os.environ.get("APEX_RUN_CANCEL_OK") != "1":
        decision, reason = "deny", P.DENY_CANCEL
    elif method in ("rerun_workflow_run", "rerun_failed_jobs") and not desk:
        decision, reason = "ask", P.ASK_RERUN
    elif method == "run_workflow" and P.gated_workflow(ti.get("workflow_id")):
        decision, reason = "ask", P.ASK_DISPATCH + " (" + str(ti.get("workflow_id")) + " on " + str(ti.get("ref") or "?") + ")"
    elif method == "delete_workflow_run_logs":
        decision, reason = "ask", "Deleting the logs of a run destroys evidence other sessions triage from. Confirm by hand."
if decision:
    P.emit(decision, reason)
sys.exit(0)
' "$(dirname "$0")"
