#!/bin/bash
# PreToolUse table for the GitHub MCP tools — ONE script behind three doors: .claude/settings.json (matcher below),
# .cursor/hooks/mcp-guard.sh and .codex/hooks/mcp-guard.sh (Cursor sends the bare tool name and tool_input as a JSON
# string; Codex normalises its hosted spelling first). GUARDED must stay identical to the two doors' matchers.
#
#   DENY  merge_pull_request, enable_pr_auto_merge, disable_pr_auto_merge
#         (no session merges or arms: land.yml lands — AGENTS.md §Coordination)
#   DENY  push_files, create_or_update_file, delete_file, create_branch
#         (a file write on the admin token lands on any branch with no PR, no CI)
#   DENY  update_pull_request_branch (sync through tools/ci/sync-pr.mjs)
#   DENY  actions_run_trigger: any *cancel* / *rerun* method, run_workflow of
#         pages.yml / ci.yml; the ORCHESTRATOR (steward §CI; the hook's OWN env; as a child session it also needs APEX_ORCH_ENV=env_…, Bryce-set; never from a settings `env`, #5819) passes cancels, rerun_failed_jobs, ci.yml, deploy-branch pages.yml
#   ASK   update_pull_request with state "closed"
#   DENY  issue_write whose `labels` (it REPLACES the list) differs from the live labels by anything but ONE name
#         (live from `gh api`; unknown → ask), removes `config-ok` or adds it on a PROTECTED path (D-042), or removes a `hold` Bryce set
#   ALLOW the rest, draft→ready included: the Plan gate and CI check a flip.
# Output is the documented PreToolUse JSON; an unreadable payload or a guarded call with a non-object input is a
# deny (fail closed).
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
    m, wf, ref = str(ti.get("method") or "").strip().lower(), os.path.basename(str(ti.get("workflow_id") or "").strip().lower()), re.sub(r"^refs/heads/", "", str(ti.get("ref") or "").strip())
    def planted(fs=[os.path.join(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd(), ".claude", n) for n in ("settings.json", "settings.local.json")] + [os.path.expanduser("~/.claude/settings.json")]):   # a settings `env` reaches this process and any session can write one (#5819)
        try: return any(k in (json.load(open(f)).get("env") or {}) for f in fs if os.path.exists(f) for k in ("APEX_ROLE", "APEX_ORCH_ENV"))
        except Exception: return True   # unreadable: fail closed
    orch = os.environ.get("APEX_ROLE") == "orchestrator" and not d.get("agent_id") and not planted() and (os.environ.get("CLAUDE_CODE_CHILD_SESSION") != "1" or re.fullmatch(r"env_[A-Za-z0-9]{6,}", os.environ.get("APEX_ORCH_ENV") or "") is not None)
    if orch and (m in ("cancel_workflow_run", "force_cancel_workflow_run", "rerun_failed_jobs") or (m == "run_workflow" and not wf.isdigit() and (wf in ("ci.yml", "ci.yaml") or ref == "claude/f1-game-project-26h3ng"))):
        sys.exit(0)
    if "cancel" in m:
        emit("deny", "WORKERS NEVER CANCEL AN ACTIONS RUN (AGENTS.md §Coordination): a queued run holds no slot; your superseded run is replaced by your next push. Only the orchestrator cancels (skill `steward` §CI).")
    if "rerun" in m: emit("deny", "The orchestrator re-runs FAILED jobs only (rerun_failed_jobs), for a verdict on an infra failure (skill `steward` §CI); a worker never re-runs from a session (`node tools/ci/ci-rerun.mjs`: a run cancelled with zero failures, once).")
    if m == "run_workflow" and (wf in ("pages.yml", "pages.yaml", "ci.yml", "ci.yaml") or wf.isdigit()):
        emit("deny", "pages.yml is the release train and ci.yml runs on the PR: only the orchestrator dispatches them, by file name, pages.yml on the deploy branch only (" + wf + " @ " + ref + "; skill `steward` §CI).")
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
            r = subprocess.run(["gh", "api", "--paginate", "repos/%s/issues/%d%s" % (s, int(number), path), "--jq", jq], capture_output=True, text=True, timeout=12)
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
    if add + gone == ["config-ok"]:    # D-042 (Bryce 2026-11-20 "Routine both"): an agent ADDS it where the PR's files hold no PROTECTED path (D-034); an unreadable list or gate raises (fail closed)
        prot = [] if gone else [x for x in subprocess.run(["node", "--input-type=module", "-e", "const {isProtectedConfigPath:f}=await import(process.argv[2]);let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(s.split('\\n').filter(x=>x&&f(x)).join('\\n')))", "gate", os.path.join(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd(), "tools/ci/merge-gate.mjs")], input=subprocess.run(["gh", "api", "--paginate", "repos/%s/pulls/%d/files?per_page=100" % (s, int(number)), "--jq", ".[] | .filename, (.previous_filename // empty)"], capture_output=True, text=True, timeout=20, check=True).stdout, capture_output=True, text=True, timeout=20, check=True).stdout.splitlines() if x.strip()]; (gone or prot) and emit("deny", "`config-ok` removal is Bryce's own click: an agent never removes it." if gone else "`config-ok` on a PROTECTED config path is Bryce's own tap (D-034): " + ", ".join(prot[:4]) + ". Ask with `needs-decision` and one comment.")
    if gone == ["hold"]:    # an agent's hold: any removal; Bryce's: his own click. The LAST `labeled hold` event's app marker tells (every page, oldest first).
        by = live("/events?per_page=100", '.[] | select(.event == "labeled" and .label.name == "hold") | (.performed_via_github_app.slug // "owner")')
        if not by or by[-1] == "owner":
            emit("deny", "`hold` is the only veto: Bryce set this one (or who set it could not be read), so only his own click lifts it (AGENTS.md §Coordination).")
sys.exit(0)
PY
rc=$?
case "$rc" in 0|2) exit "$rc" ;; *) echo "BLOCKED: github-mcp-guard failed with exit $rc, so this GitHub call is refused (fail closed)." >&2; exit 2 ;; esac
