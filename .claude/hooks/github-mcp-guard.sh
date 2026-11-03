#!/bin/bash
# PreToolUse table for the GitHub MCP tools — ONE script behind three doors:
# .claude/settings.json (matcher below), .cursor/hooks/mcp-guard.sh and
# .codex/hooks/mcp-guard.sh (Cursor sends the bare tool name and tool_input as
# a JSON string; Codex normalises its hosted spelling first). GUARDED must
# stay identical to the two doors' matchers (tests/unit/cross-tool-guards.test.mjs).
#
#   DENY  merge_pull_request, enable_pr_auto_merge, disable_pr_auto_merge
#         (no session merges or arms: land.yml lands — AGENTS.md §Coordination)
#   DENY  push_files, create_or_update_file, delete_file, create_branch
#         (a file write on the admin token lands on any branch with no PR, no CI)
#   DENY  update_pull_request_branch (sync through tools/ci/sync-pr.mjs)
#   DENY  actions_run_trigger: any *cancel* / *rerun* method, run_workflow of
#         pages.yml / ci.yml (the release train is never dual-dispatched)
#   ASK   update_pull_request with state "closed"
#   ASK   issue_write whose `labels` would drop `hold` (the list REPLACES the
#         labels; the live ones come from `gh api`; unknown → ask)
#   ALLOW the rest, draft→ready included: the Plan gate and CI check a flip.
# Output is the documented PreToolUse JSON; an unreadable payload or a guarded
# call with a non-object input is a deny (fail closed).
command -v python3 >/dev/null 2>&1 || { echo "BLOCKED: github-mcp-guard needs python3 (fail closed)." >&2; exit 2; }
python3 /dev/fd/3 3<<'PY'
import json, os, re, subprocess, sys
GUARDED = re.compile(r"__(merge_pull_request|enable_pr_auto_merge|disable_pr_auto_merge|update_pull_request|update_pull_request_branch|issue_write|actions_run_trigger|push_files|create_or_update_file|create_branch|delete_file)$")
def emit(decision, reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": decision, "permissionDecisionReason": reason}}))
    sys.exit(0)
try:
    d = json.load(sys.stdin)
    if not isinstance(d, dict): raise ValueError
except Exception:
    sys.stderr.write("BLOCKED: github-mcp-guard could not read the hook payload, so this GitHub call is refused (fail closed).\n"); sys.exit(2)
name = str(d.get("tool_name") or "")
if name and "__" not in name:
    name = "mcp__github__" + name                      # Cursor's bare name
ti = d.get("tool_input")
if isinstance(ti, str):
    try: ti = json.loads(ti or "{}")
    except Exception: ti = None
if ti is None: ti = {}
if not name or not GUARDED.search(name):
    sys.exit(0)
if not isinstance(ti, dict):
    emit("deny", "github-mcp-guard could not read this call's input (not an object), so it is refused (fail closed).")
op = name.rsplit("__", 1)[-1]
def slug():
    o, r = ti.get("owner"), ti.get("repo")
    if o and r: return "%s/%s" % (o, r)
    try:
        url = subprocess.run(["git", "config", "--get", "remote.origin.url"], capture_output=True, text=True, timeout=3).stdout.strip()
        m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", url)
        return "%s/%s" % (m.group(1), m.group(2)) if m else None
    except Exception:
        return None
if op in ("merge_pull_request", "enable_pr_auto_merge", "disable_pr_auto_merge"):
    emit("deny", "No session merges, arms or disarms (AGENTS.md §Coordination): add the `land` label; land.yml's gate arms auto-merge with the MERGE method. `hold` is the only veto.")
if op in ("push_files", "create_or_update_file", "create_branch", "delete_file"):
    emit("deny", op + " writes repository contents through the API: on the admin token it lands on any branch with no PR and no CI. Commit on a cursor/* branch and push.")
if op == "update_pull_request_branch":
    emit("deny", "update-branch merges the base on GitHub as the token's owner; sync through `node tools/ci/sync-pr.mjs <branch>` instead.")
if op == "actions_run_trigger":
    m = str(ti.get("method") or "").strip().lower()
    if "cancel" in m:
        emit("deny", "NEVER CANCEL AN ACTIONS RUN (AGENTS.md §Coordination): a queued run holds no slot; your superseded run is replaced by your next push. Bryce cancels in the UI.")
    if "rerun" in m:
        emit("deny", "No re-run dispatch from a session: `node tools/ci/ci-rerun.mjs` re-runs a failed job at most once for a timeout or infra error (AGENTS.md §Coordination).")
    wf = os.path.basename(str(ti.get("workflow_id") or "").strip().lower())
    if m == "run_workflow" and (wf in ("pages.yml", "pages.yaml", "ci.yml", "ci.yaml") or wf.isdigit()):
        emit("deny", "pages.yml is the release train (a push to the deploy branch starts it) and ci.yml runs on the PR: neither is dispatched by a session (" + wf + ").")
    sys.exit(0)
if op == "update_pull_request":
    if str(ti.get("state") or "").strip().lower() == "closed":
        emit("ask", "This call CLOSES a pull request. Closing someone else's PR loses its CI and its owner's work; confirm it is yours or abandoned.")
    sys.exit(0)
if op == "issue_write":
    labels = ti.get("labels")
    number = next((ti.get(k) for k in ("issue_number", "issueNumber", "number") if ti.get(k) is not None), None)
    if labels is None or number is None or str(ti.get("method") or "update").strip().lower() == "create":
        sys.exit(0)
    names = [str(x).strip().lower() for x in (labels if isinstance(labels, (list, tuple)) else [labels])]
    if "hold" in names:
        sys.exit(0)
    cur = None
    s = slug()
    if s:
        try:
            r = subprocess.run(["gh", "api", "repos/%s/issues/%d" % (s, int(number)), "--jq", '[.labels[].name] | join("\\n")'],
                               capture_output=True, text=True, timeout=6)
            if r.returncode == 0: cur = [x.strip().lower() for x in r.stdout.splitlines() if x.strip()]
        except Exception:
            cur = None
    if cur is None:
        emit("ask", "This `labels` list REPLACES the labels and omits `hold`; the current labels could not be read. `hold` is the only veto (whoever set it removes it; Bryce always can) — confirm by hand.")
    if "hold" in cur:
        emit("ask", "This `labels` list REPLACES the labels and would REMOVE `hold`, the only veto. Only whoever set it (or Bryce) removes it — confirm by hand.")
sys.exit(0)
PY
rc=$?
case "$rc" in 0|2) exit "$rc" ;; *) echo "BLOCKED: github-mcp-guard failed with exit $rc, so this GitHub call is refused (fail closed)." >&2; exit 2 ;; esac
