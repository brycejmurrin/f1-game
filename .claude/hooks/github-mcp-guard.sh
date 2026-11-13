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
#   DENY  issue_write whose `labels` (it REPLACES the list) differs from the
#         live labels by anything but ONE name (live from `gh api`; unknown →
#         ask), touches `config-ok`, or removes a `hold` Bryce set
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
if name.startswith("MCP:"):
    name = name[4:]                                    # Cursor's preToolUse spelling in a cloud agent
if name and "__" not in name:
    name = "mcp__github__" + name                      # Cursor's bare name
ti = d.get("tool_input", {})
if isinstance(ti, str):
    try: ti = json.loads(ti or "{}")
    except Exception: ti = None                         # unparsable: refused below for a guarded tool
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
    names = sorted({str(x).strip().lower() for x in (labels if isinstance(labels, (list, tuple)) else [labels]) if str(x).strip()})
    s = slug()
    def live(path, jq):
        try:
            r = subprocess.run(["gh", "api", "repos/%s/issues/%d%s" % (s, int(number), path), "--jq", jq], capture_output=True, text=True, timeout=6)
            return [x.strip().lower() for x in r.stdout.splitlines() if x.strip()] if r.returncode == 0 else None
        except Exception:
            return None
    cur = live("", '[.labels[].name] | join("\\n")') if s else None
    how = "Read the live labels (`issue_read` method get_labels) and send them plus or minus ONE name (skill `steward` `references/labels.md`); never `gh`."
    if cur is None:
        emit("ask", "This `labels` list REPLACES the labels and the live ones could not be read, so the one-label rule cannot be checked. " + how)
    add, gone = [x for x in names if x not in cur], [x for x in sorted(set(cur)) if x not in names]
    if not add and not gone:
        sys.exit(0)
    if len(add) + len(gone) != 1:
        emit("deny", "issue_write labels REPLACES the list, so it may differ from the live labels by exactly ONE name. Live: [" + ", ".join(sorted(set(cur))) + "]; this list would add [" + ", ".join(add) + "] and remove [" + ", ".join(gone) + "]. " + how)
    if add + gone == ["config-ok"]:
        emit("deny", "`config-ok` is Bryce's own click (merge-gate reads the label event's actor): an agent never adds or removes it. Ask with `needs-decision` and one comment.")
    if gone == ["hold"]:    # an agent's hold: any removal; Bryce's: his own click. The last `labeled hold` event's app marker tells.
        by = live("/events?per_page=100", '[.[] | select(.event == "labeled" and .label.name == "hold")] | last | (.performed_via_github_app.slug // "owner")')
        if not by or len(by) != 1 or by[0] == "owner":
            emit("deny", "`hold` is the only veto: Bryce set this one (or who set it could not be read), so only his own click lifts it (AGENTS.md §Coordination).")
sys.exit(0)
PY
rc=$?
case "$rc" in 0|2) exit "$rc" ;; *) echo "BLOCKED: github-mcp-guard failed with exit $rc, so this GitHub call is refused (fail closed)." >&2; exit 2 ;; esac
