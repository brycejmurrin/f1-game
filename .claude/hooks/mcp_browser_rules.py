"""mcp_browser_rules.py — which MCP calls open or drive a browser (mcp-browser-guard.sh; bash-guard.py for an
apex-tools CLI `call`). Judged on the tool name AND its tool_input, so a tree-mode call of a mixed tool passes:

  * playwright-official, chrome-devtools, browser-use, a browserstack live/automate/screenshot/scan session: browser;
  * js-debugger: browser, except the node-only and read-back tools (debugger_node_test, output_read,
    debugger_logpoint_read, debugger_exception_log, debugger_instances, debugger_state);
  * apex-tools: apex_eval {vm:true} is the Node VM; apex_debug_chrome status/stop/list/help reads; apex_job_start of a
    kind whose plan in tools/mcp/apex-extras.mjs says `browser: false` is a tree job; output_read reads. The other
    browser wraps (shot, shot_survey, agent, garage, hud_*, track, ui_fit/ui_shot/ui_inspect, profile) are
    browser. A job kind the hook cannot place is browser (fail closed).
"""
import os
import re

BROWSER_SERVERS = re.compile(r"^mcp__(playwright-official__|chrome-devtools__|plugin_browser-use)")
BROWSERSTACK = re.compile(r"^mcp__browserstack__(run\w*Session|run\w*Tests\w*|take\w*Screenshot|startAccessibilityScan|runPercyScan)$")
JS_DEBUGGER_TREE = {"debugger_node_test", "output_read", "debugger_logpoint_read", "debugger_exception_log",
                    "debugger_instances", "debugger_state"}
APEX_BROWSER = {"apex_eval", "apex_shot", "apex_shot_survey", "apex_agent", "apex_garage", "apex_hud_shot", "apex_hud_survey",
                "apex_hud_mock", "apex_track", "apex_ui_fit", "apex_ui_shot", "apex_ui_inspect", "apex_profile",
                "apex_debug_chrome", "apex_job_start"}


def tree_job_kinds(root):
    """Job kinds whose apex-extras.mjs plan returns `browser: false` (read from source; empty on any error)."""
    try:
        src = open(os.path.join(root, "tools/mcp/apex-extras.mjs"), encoding="utf8").read()
    except OSError:
        return set()
    body = src[src.find("function jobPlan("):]
    out = set()
    parts = re.split(r'\bcase\s+"(\w+)"\s*:', body)
    for i in range(1, len(parts) - 1, 2):
        m = re.search(r"browser:\s*(true|false)", parts[i + 1])
        if m and m.group(1) == "false":
            out.add(parts[i])
    return out


def is_browser_call(name, ti, root):
    """True when the MCP call `name` with input `ti` (a dict, or None when unreadable) starts or drives a browser."""
    if BROWSER_SERVERS.match(name) or BROWSERSTACK.match(name):
        return True
    if name.startswith("mcp__js-debugger__"):
        return name.rsplit("__", 1)[-1] not in JS_DEBUGGER_TREE
    if not name.startswith("mcp__apex-tools__"):
        return False
    tool = name.rsplit("__", 1)[-1]
    if tool not in APEX_BROWSER:
        return False
    if not isinstance(ti, dict):
        return True
    if tool == "apex_eval":
        return ti.get("vm") is not True
    if tool == "apex_debug_chrome":
        return str(ti.get("action") or "start").strip().lower() not in ("status", "stop", "list", "help")
    if tool == "apex_job_start":
        return str(ti.get("kind") or "") not in tree_job_kinds(root)
    return True
