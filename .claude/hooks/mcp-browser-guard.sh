#!/bin/bash
# PreToolUse guard for the MCP tools that launch or drive a browser
# (playwright-official, chrome-devtools, js-debugger, the browser apex_* tools,
# apex_debug_chrome start, browser-use, browserstack live sessions):
#   * a SUBAGENT never starts one (AGENTS.md §Verification 10; the payload
#     carries agent_id / agent_type or a subagents/ transcript);
#   * the MAIN session does not open one while a `playwright test` /
#     run-playwright.mjs process is live in THIS checkout (one browser is the
#     box's whole capacity; AGENTS.md §Seeing the game). Scoped by
#     /proc/<pid>/cwd, so another worktree's run does not count.
# Exit 2 refuses; an unreadable payload is a refusal (fail closed).
command -v python3 >/dev/null 2>&1 || { echo "BLOCKED: mcp-browser-guard needs python3 (fail closed)." >&2; exit 2; }
python3 /dev/fd/3 "$(cd "$(dirname "$0")/../.." && pwd)" 3<<'PY'
import json, os, re, sys
try:
    d = json.load(sys.stdin)
    if not isinstance(d, dict): raise ValueError
except Exception:
    sys.stderr.write("BLOCKED: mcp-browser-guard could not read the hook payload, so it cannot tell a subagent from the main session; a browser tool is refused rather than risk a second Chromium.\n"); sys.exit(2)
name = str(d.get("tool_name") or "")
ti = d.get("tool_input") if isinstance(d.get("tool_input"), dict) else {}
BROWSER = re.compile(r"^mcp__(playwright-official__.+|chrome-devtools__.+|js-debugger__.+|plugin_browser-use.*|browserstack__(run\w*Session|run\w*Tests\w*|take\w*Screenshot|startAccessibilityScan|runPercyScan)|apex-tools__apex_(eval|shot|shot_survey|agent|garage|hud_shot|hud_survey|hud_mock|track|ui_fit|ui_shot|ui_inspect|diagnostics|profile|job_start))$")
debug_start = name == "mcp__apex-tools__apex_debug_chrome" and str(ti.get("action") or "start").strip().lower() not in ("status", "stop", "list", "help")
if not (BROWSER.match(name) or debug_start):
    sys.exit(0)
if d.get("agent_id") or d.get("agent_type") or "/subagents/" in str(d.get("transcript_path") or ""):
    sys.stderr.write("BLOCKED: " + name + " drives a browser, and a subagent never starts one (AGENTS.md §Verification 10). Use the node-only checks and report what needs a browser as NOT RUN.\n"); sys.exit(2)
root = os.path.realpath(sys.argv[1])
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
