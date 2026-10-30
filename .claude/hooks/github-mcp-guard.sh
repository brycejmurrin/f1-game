#!/bin/bash
# PreToolUse guard for the GitHub MCP tools that change a PR's merge state.
#
# AGENTS.md §Coordination (MERGE-COMMIT-ONLY, #1458): every PR lands as a merge
# commit; since 2026-10-27 no session merges or arms (land.yml does, and
# merge-gate.mjs writes no receipt, so the merge door stays shut); a draft goes
# ready only with a fresh ready-gate receipt. Until 2026-10-14 that was prose only; until
# 2026-10-19 the receipt was a human word per session (docs/plans/
# 2026-10-19-fleet-redesign.md §1). This hook:
#
#   merge_pull_request / enable_pr_auto_merge with a squash or rebase method
#                                                  -> "deny" (merge commits only)
#   merge_pull_request / enable_pr_auto_merge       -> "deny", always (WP-L4, 2026-10-27: no session merges or
#                                                     arms; land.yml does. The old receipt path opened only to a
#                                                     hand-written artifacts/merge-gate/<pr>.json.)
#   update_pull_request draft falsy (false/0/"no"/"off", any case: draft->ready)
#                                                  -> "deny" unless artifacts/ready-gate/<pr>.json
#                                                     is ok, < 10 min old and its head is the PR's LIVE head
#                                                     (merge_policy.live_head: gh api …/pulls/<n>); an
#                                                     unknown live head denies
#   update_pull_request state "closed"            -> "ask" (2026-10-26: closing a PR was neither denied nor hooked)
#   issue_write whose `labels` drop `hold` (the list REPLACES the labels; the live labels come from gh api)
#                                                  -> "ask" (WP-L4: `hold` is the only veto; unknown labels ask)
#   any other update_pull_request (title/body/base) -> silent pass
#   push_files / create_or_update_file / create_branch / delete_file
#                                                  -> "deny" (settings.json denies them too; this is the
#                                                     Cursor/Codex door: on the admin App token a file write
#                                                     lands on any branch with no PR and no CI)
#   actions_run_trigger run_workflow of pages.yml / ci.yml (or a numeric id)
#                                                  -> "ask" (the release train: never dual-dispatch Pages)
#   actions_run_trigger delete_workflow_run_logs     -> "ask" (evidence other sessions read)
#   actions_run_trigger *cancel* (cancel_workflow_run, force_cancel_…)
#                                                  -> "deny" (a queued run holds no slot; a sweep
#                                                     only buys a retrigger push — 2026-10-15), unless
#                                                     APEX_RUN_CANCEL_OK=1 (the user asked for it)
#   actions_run_trigger rerun_*                      -> "ask" (at most once, infra only; never a superseded run)
#
# Receipts: merge_policy.receipt_check(..., verify_files=True) also refuses a
# receipt whose gate files (merge-gate.mjs, ready-gate.mjs, gate-receipt.mjs)
# differ from this checkout's committed tree (the 2026-10-20 O23 incident).
#
# No environment variable silences any of these (the merge desk's re-run pass
# went with the merge desk, WP-D1 2026-10-27). The reason texts and the receipt check
# live in merge_policy.py, shared with bash-guard.sh's `gh` rule. Output is
# the documented PreToolUse JSON (hookSpecificOutput.permissionDecision,
# https://code.claude.com/docs/en/hooks), exit 0.
#
# FAIL CLOSED (2026-10-28): an unreadable payload or tool_input is a deny (it
# was an ask), and the hook turns its own failures — no python3, a
# merge_policy.py that will not load, any exception (sys.excepthook), any exit
# but 0/2 — into exit 2, whatever the host does with a failed hook (Claude
# Code's onFailure "block" in settings.json is the second layer).
if ! command -v python3 >/dev/null 2>&1; then
  echo "BLOCKED: github-mcp-guard needs python3 to judge this GitHub call; it is refused (fail closed)." >&2
  exit 2
fi
python3 -c '
import json, os, re, sys
def _crash(kind, err, tb):
    sys.stderr.write("BLOCKED: github-mcp-guard failed (" + kind.__name__ + ": " + str(err)[:160] + "), so this GitHub "
                     "call is refused (fail closed). Report the hook error; do not work around it.\n")
    sys.stderr.flush()
    os._exit(2)
sys.excepthook = _crash
sys.path.insert(0, sys.argv[1])
import merge_policy as P
try:
    d = json.load(sys.stdin)
    if not isinstance(d, dict):
        raise ValueError("payload is not an object")
except Exception:
    sys.stderr.write("BLOCKED: github-mcp-guard could not read the hook payload, so this GitHub call is refused (fail closed).\n")
    sys.exit(2)
name = d.get("tool_name") or ""
# Cursor beforeMCPExecution (.cursor/hooks/mcp-guard.sh) names the bare tool and
# sends tool_input as a JSON string: https://cursor.com/docs/agent/hooks
if name and "__" not in name:
    name = "mcp__github__" + name
# A tool_input that is not an object (or a JSON string of one) cannot be judged: a guarded operation, or a call with
# no tool name, is refused; any other tool passes (Cursor sends EVERY MCP call through this script).
bad_input = False
if isinstance(d.get("tool_input"), str):
    try:
        d["tool_input"] = json.loads(d["tool_input"] or "{}")
    except Exception:
        bad_input = True
ti = d.get("tool_input")
if ti is None:
    ti = {}
if not isinstance(ti, dict):
    bad_input, ti = True, {}
GUARDED = re.compile(r"__(merge_pull_request|enable_pr_auto_merge|update_pull_request|issue_write|actions_run_trigger|push_files|create_or_update_file|create_branch|delete_file)$")
if not name or (bad_input and GUARDED.search(name)):
    name = "unknown"
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
    decision, reason = "deny", "github-mcp-guard could not read this call (no tool name, or a tool_input that is not an object), so it is refused (fail closed)."
elif merging:
    raw = ti.get("merge_method") if ti.get("merge_method") is not None else ti.get("mergeMethod")
    method = str(raw or "").strip().lower()
    if P.squash_or_rebase(raw):
        decision, reason = "deny", P.DENY_METHOD
    else:
        decision, reason = "deny", P.DENY_GATE_MERGE
elif re.search(r"__(push_files|create_or_update_file|create_branch|delete_file)$", name):
    decision, reason = "deny", "github-mcp-guard: " + name.rsplit("__", 1)[-1] + " " + P.DENY_WRITE
elif name.endswith("__update_pull_request"):
    draft = ti.get("draft")
    falsy = draft is not None and draft is not True and str(draft).strip().lower() in ("false", "0", "no", "off", "")
    if falsy:
        live, plan = P.live_state(root, pr, ti.get("owner"), ti.get("repo"))
        ok, why = P.receipt_check(root, "ready", pr, live, verify_files=True, require_head=True, plan=plan)
        if not ok:
            decision, reason = "deny", P.DENY_GATE_READY + " (" + why + ")"
    if decision is None and str(ti.get("state") or "").strip().lower() == "closed":
        decision, reason = "ask", P.ASK_CLOSE
elif name.endswith("__issue_write"):
    # `labels` REPLACES the list (the 2026-10-27 clobber of #3263-#3267), so a list without `hold` removes it
    # when the issue or PR carries it now; labels the hook cannot read ask too.
    labels = ti.get("labels")
    number = first("issue_number", "issueNumber", "number")
    if labels is not None and number is not None and str(ti.get("method") or "update").strip().lower() != "create":
        names = [str(x).strip().lower() for x in (labels if isinstance(labels, (list, tuple)) else [labels])]
        if "hold" not in names:
            cur = P.live_labels(root, number, ti.get("owner"), ti.get("repo"))
            if cur is None:
                decision, reason = "ask", P.ASK_HOLD + " (the current labels could not be read)"
            elif "hold" in cur:
                decision, reason = "ask", P.ASK_HOLD
elif name.endswith("__actions_run_trigger"):
    method = str(ti.get("method") or "").strip().lower()
    if "cancel" in method and os.environ.get("APEX_RUN_CANCEL_OK") != "1":
        decision, reason = "deny", P.DENY_CANCEL
    elif method in ("rerun_workflow_run", "rerun_failed_jobs"):
        decision, reason = "ask", P.ASK_RERUN
    elif method == "run_workflow" and P.gated_workflow(ti.get("workflow_id")):
        decision, reason = "ask", P.ASK_DISPATCH + " (" + str(ti.get("workflow_id")) + " on " + str(ti.get("ref") or "?") + ")"
    elif method == "delete_workflow_run_logs":
        decision, reason = "ask", "Deleting the logs of a run destroys evidence other sessions triage from. Confirm by hand."
if decision:
    P.emit(decision, reason)
sys.exit(0)
' "$(dirname "$0")"
rc=$?
case "$rc" in
  0|2) exit "$rc" ;;
  *) echo "BLOCKED: github-mcp-guard failed with exit $rc, so this GitHub call is refused (fail closed)." >&2
     exit 2 ;;
esac
