#!/bin/bash
# PreToolUse guard for the MCP tools that launch or drive a browser
# (AGENTS.md §Verification 10: a subagent never starts a browser run).
#
# bash-guard.sh enforced the rule on Bash only, while every subagent was also
# offered playwright-official browser_*, chrome-devtools and the apex-tools
# browser tools — each of which boots a Chromium that collides with the
# parent's Playwright run on a box where one group is the whole capacity
# (2026-10-04 review). Claude Code runs PreToolUse hooks for MCP tools by
# their `mcp__<server>__<tool>` name, and a call made inside a subagent
# carries `agent_id` (https://code.claude.com/docs/en/hooks — "Present only
# when the hook fires inside a subagent call"); the main session keeps every
# tool. The settings.json matcher selects the tools; this script re-checks the
# name so an over-broad matcher can never block a tree tool.
#
# Exit 2 blocks with the reason on stderr; exit 0 lets the call through.
exec python3 -c '
import json, re, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
name = d.get("tool_name") or ""
BROWSER = re.compile(r"^mcp__(playwright-official__.+|chrome-devtools__.+|apex-tools__apex_(eval|shot|shot_survey|agent|garage|hud_shot|hud_survey|track|ui_fit|ui_shot|job_start))$")
if not BROWSER.match(name):
    sys.exit(0)
sub = d.get("agent_id") or "/subagents/" in str(d.get("transcript_path") or "")
if not sub:
    sys.exit(0)
sys.stderr.write("BLOCKED: " + name + " drives a browser, and a subagent never starts one (AGENTS.md "
  "§Verification 10): one browser saturates this box and the parent owns it. Use the node-only checks "
  "(verify-change.mjs --fast, node --test, verify-track.cjs, the tree apex_* tools) and report what "
  "needs a browser as NOT RUN.\n")
sys.exit(2)
'
