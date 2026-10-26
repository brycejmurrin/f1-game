#!/usr/bin/env python3
# PreToolUse guard on mcp__claude-code-remote__create_session: the quota gate.
#
# orchestrator.md §Pre-launch quota check says "at `allowed_warning` or worse,
# launch nothing", and OrchA 33 launched 7 sessions into a 75 % weekly quota
# anyway (docs/notes/FLEET-A-TRANSCRIPT-AUDIT-2026-10-26.md #5, D7). Bryce,
# 2026-10-25 ~21:00 PT, "Do all": the gate is a hook with a typed-override path.
#
#   artifacts/launch-gate/receipt.json ok and < 120 s old  -> silent pass
#   no receipt, ok:false, stale, or unreadable receipt      -> "deny", naming
#       `node tools/ci/launch-gate.mjs <saved get_session> [--override "<Bryce's words>"]`
#
# The receipt is written by tools/ci/launch-gate.mjs (Q1): ok when
# rate_limit_info.status is "allowed", or when the launch is Bryce's typed ask
# (the receipt keeps his quote). FAILS OPEN on its OWN errors: an unreadable
# payload or an internal exception prints one stderr line and exits 0 with no
# decision (settings.json gives this hook no onFailure "block"), so a broken
# hook never stalls a fleet. Output is the documented PreToolUse JSON
# (hookSpecificOutput.permissionDecision, https://code.claude.com/docs/en/hooks,
# read 2026-10-26). Tests: tests/unit/launch-gate.test.mjs.
import calendar, json, os, sys, time

MAX_AGE_S = 120  # tools/ci/launch-gate.mjs MAX_AGE_S
FIX = ('run `node tools/ci/launch-gate.mjs <saved get_session result>` (exit 0) first; a launch Bryce typed while '
       'the quota warns: add `--override "<his words, quoted>"` (audit 2026-10-26 #5, orchestrator.md §Pre-launch quota check)')


def deny(why):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                             "permissionDecisionReason": "LAUNCH GATE: " + why + " — " + FIX}}))


def main():
    try:
        d = json.load(sys.stdin)
    except Exception:
        sys.stderr.write("launch-gate: unreadable hook payload; allowing (fail open).\n")
        return
    if not isinstance(d, dict) or not str(d.get("tool_name") or "").endswith("create_session"):
        return
    root = os.environ.get("CLAUDE_PROJECT_DIR") or d.get("cwd") or os.getcwd()
    f = os.path.join(root, "artifacts", "launch-gate", "receipt.json")
    try:
        with open(f, encoding="utf8") as fh:
            r = json.load(fh)
    except FileNotFoundError:
        return deny("no launch-gate receipt")
    except Exception:
        return deny("the launch-gate receipt is unreadable")
    if not isinstance(r, dict) or not r.get("ok"):
        return deny("the last launch-gate run refused (%s)" % (r.get("why") if isinstance(r, dict) else "bad receipt"))
    try:
        at = calendar.timegm(time.strptime(str(r.get("at"))[:19], "%Y-%m-%dT%H:%M:%S"))
    except Exception:
        return deny("the launch-gate receipt has no timestamp")
    age = time.time() - at
    if age > MAX_AGE_S or age < -60:
        return deny("the launch-gate receipt is %d s old (max %d)" % (age, MAX_AGE_S))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # fail open on the hook's own bug
        sys.stderr.write("launch-gate: internal error %s; allowing (fail open).\n" % type(e).__name__)
    sys.exit(0)
