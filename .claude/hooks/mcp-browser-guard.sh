#!/bin/bash
# PreToolUse guard for the MCP tools that launch or drive a browser (the settings.json matcher selects the
# candidates; .claude/hooks/mcp_browser_rules.py judges each call on its name AND tool_input, so a tree-mode call
# such as apex_eval {vm:true}, debugger_node_test, output_read or a tree-kind apex_job_start passes):
#   * a SUBAGENT (the payload's agent_id) never starts or drives one (AGENTS.md §Verification 10);
#   * the MAIN session does not open one while a `playwright test` / run-playwright.mjs process is live in THIS
#     checkout (one browser is the box's whole capacity). Scoped by /proc/<pid>/cwd, so another worktree's run
#     does not count.
# Exit 2 refuses; an unreadable payload is a refusal (fail closed). A seatbelt against accidents, not a boundary.
command -v python3 >/dev/null 2>&1 || { echo "BLOCKED: mcp-browser-guard needs python3 (fail closed)." >&2; exit 2; }
python3 /dev/fd/3 "$(cd "$(dirname "$0")/../.." && pwd)" 3<<'PY'
import json, os, sys
root = os.path.realpath(sys.argv[1])
sys.path.insert(0, os.path.join(root, ".claude", "hooks"))
from mcp_browser_rules import is_browser_call
try:
    d = json.load(sys.stdin)
    if not isinstance(d, dict): raise ValueError
except Exception:
    sys.stderr.write("BLOCKED: mcp-browser-guard could not read the hook payload, so it cannot tell a subagent from the main session; a browser tool is refused rather than risk a second Chromium.\n"); sys.exit(2)
name = str(d.get("tool_name") or "")
ti = d.get("tool_input", {})
if isinstance(ti, str):
    try: ti = json.loads(ti)
    except ValueError: ti = None
if not is_browser_call(name, ti if isinstance(ti, dict) else None, root):
    sys.exit(0)
aid = d.get("agent_id")
if isinstance(aid, str) and aid.strip():
    sys.stderr.write("BLOCKED: " + name + " drives a browser, and a subagent never starts one (AGENTS.md §Verification 10). Use the node-only routes (apex_eval {vm:true}, debugger_node_test, a tree-kind apex_job_start) and report what needs a browser as NOT RUN.\n"); sys.exit(2)
for pid in (p for p in os.listdir("/proc") if p.isdigit()):
    try:
        argv = [a.decode("utf8", "replace") for a in open(f"/proc/{pid}/cmdline", "rb").read().split(b"\0") if a]
        if not argv or os.path.basename(argv[0]) in ("bash", "sh", "dash", "zsh"): continue   # a shell that merely mentions the runner
        names = [os.path.basename(a) for a in argv]
        live = "run-playwright.mjs" in names or any(b in ("playwright", "playwright.js", "cli.js") and "test" in argv[i + 1:i + 3] for i, b in enumerate(names))
        if not live or "--list" in argv: continue
        cwd = os.path.realpath(os.readlink(f"/proc/{pid}/cwd"))
    except OSError:
        continue
    if cwd == root or cwd.startswith(root + os.sep):
        sys.stderr.write("BLOCKED: " + name + " would open a second browser while a Playwright run (pid " + pid + ") is live in this checkout. Wait for its '= run …' line or stop it (node tools/ci/test-bg.mjs --stop), then retry.\n"); sys.exit(2)
PY
rc=$?
case "$rc" in 0|2) exit "$rc" ;; *) echo "BLOCKED: mcp-browser-guard failed with exit $rc, so this browser tool is refused (fail closed)." >&2; exit 2 ;; esac
