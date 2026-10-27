#!/usr/bin/env python3
# PostToolUse on mcp__claude-code-remote__get_session: the honest quota page.
#
# Pass 4 (2026-10-26, verify #1 / tx T2): the launch gate read a page the agent SAVED by hand, so orchestrators wrote
# `{"status":"allowed"}` with echo and `touch`ed it fresh. This hook writes the page itself from the tool's own
# response, so `node tools/ci/launch-gate.mjs artifacts/launch/self.json` has a page no agent typed:
#   artifacts/launch/self.json = { written_by: "launch-page.py", at: <iso>, content_sha256: <hex of response text>,
#                                   session: <id>, response: <the get_session JSON> }
# Only a get_session of the CALLING session (no session_id, or the same id) is recorded: another session's page says
# nothing about this account's quota from this session's point of view. Fails open on its own errors (a PostToolUse
# hook cannot block anything; it only writes a file) and never prints to stdout.
import hashlib, json, os, sys, time


def main():
    d = json.load(sys.stdin)
    if not str(d.get("tool_name") or "").endswith("get_session"):
        return
    ti = d.get("tool_input") if isinstance(d.get("tool_input"), dict) else {}
    resp = d.get("tool_response")
    text = resp if isinstance(resp, str) else json.dumps(resp, sort_keys=True)
    try:
        body = json.loads(text) if isinstance(text, str) else resp
    except Exception:
        body = None
    if not isinstance(body, (dict, list)) or not text:
        return
    root = os.environ.get("CLAUDE_PROJECT_DIR") or d.get("cwd") or os.getcwd()
    out = os.path.join(root, "artifacts", "launch")
    os.makedirs(out, exist_ok=True)
    rec = {"written_by": "launch-page.py", "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "content_sha256": hashlib.sha256(text.encode("utf8")).hexdigest(),
           "requested_session": ti.get("session_id") or None, "session": d.get("session_id") or None, "response": body}
    tmp = os.path.join(out, "self.json.tmp")
    with open(tmp, "w", encoding="utf8") as f:
        json.dump(rec, f, indent=1)
    os.replace(tmp, os.path.join(out, "self.json"))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stderr.write("launch-page: %s (page not written)\n" % type(e).__name__)
    sys.exit(0)
