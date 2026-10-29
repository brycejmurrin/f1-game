#!/usr/bin/env python3
# PreToolUse guard on mcp__claude-code-remote__create_session: the quota gate.
#
# the retired orchestrator.md §Pre-launch quota check said "at `allowed_warning` or worse,
# launch nothing", and OrchA 33 launched 7 sessions into a 75 % weekly quota
# anyway (docs/notes/FLEET-A-TRANSCRIPT-AUDIT-2026-10-26.md #5, D7). Bryce,
# 2026-10-25 ~21:00 PT, "Do all": the gate is a hook with a typed-override path.
#
#   artifacts/launch-gate/receipt.json ok, < 120 s old, its page.sha256 the sha256 of
#   artifacts/launch/self.json (written_by launch-page.py)  -> silent pass, and the
#                                                              receipt is renamed receipt.json.used (single-use)
#   no receipt, ok:false, stale, unbound or unreadable      -> "deny", naming
#       `node tools/ci/launch-gate.mjs <saved get_session> [--override "<Bryce's words>"]`
#
# The receipt is written by tools/ci/launch-gate.mjs (Q1): ok when
# rate_limit_info.status is "allowed", or when the launch is Bryce's typed ask
# (the receipt keeps his quote). FAILS CLOSED on its OWN errors (2026-10-28,
# the commit-hook split's hook pass; Bryce: "Yes, split it"): it used to fail
# open, so a crash or an unreadable payload let a create_session through with no
# quota receipt — the one thing the hook exists to stop. Now an unreadable or
# malformed payload, or any internal exception, is a block (the reason on
# stderr, exit 2), and settings.json sets onFailure "block" for a
# timeout or a missing interpreter. Output is the documented PreToolUse JSON
# (hookSpecificOutput.permissionDecision, https://code.claude.com/docs/en/hooks,
# read 2026-10-28). Tests: tests/unit/launch-gate.test.mjs.
import calendar, hashlib, json, os, re, sys, time

MAX_AGE_S = 120  # tools/ci/launch-gate.mjs MAX_AGE_S
FIX = ('call get_session (launch-page.py saves artifacts/launch/self.json), then run `node tools/ci/launch-gate.mjs artifacts/launch/self.json` (exit 0) right before each create_session; a launch Bryce typed while '
       'the quota warns: add `--override "<his words, quoted>"` (audit 2026-10-26 #5; docs/WORKERS.md §The dispatcher: launch only when quota allows)')


def deny(why):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                             "permissionDecisionReason": "LAUNCH GATE: " + why + " — " + FIX}}))


def refuse(why):
    """The fail-closed exit: stderr for every host, exit 2 (a block in Claude Code, Cursor and Codex)."""
    sys.stderr.write("BLOCKED: LAUNCH GATE " + why + ", so this create_session is refused (fail closed). "
                     "Report the hook error; do not work around it.\n")
    sys.stderr.flush()
    os._exit(2)


def main():
    try:
        d = json.load(sys.stdin)
    except Exception:
        return refuse("could not read the hook payload")
    if not isinstance(d, dict) or not isinstance(d.get("tool_input", {}), (dict, type(None))):
        return refuse("got a malformed hook payload (not an object, or a tool_input that is not one)")
    if not str(d.get("tool_name") or "").endswith("create_session"):
        return
    root = os.environ.get("CLAUDE_PROJECT_DIR") or d.get("cwd") or os.getcwd()
    ti = d.get("tool_input") if isinstance(d.get("tool_input"), dict) else {}
    # pass-4 red-team R10: a session whose outcome_branch is the deploy branch pushes it directly.
    if str(ti.get("outcome_branch") or "").strip() in ("claude/f1-game-project-26h3ng", "refs/heads/claude/f1-game-project-26h3ng"):
        return deny("outcome_branch is the deploy branch; work lands only through a PR (AGENTS.md §Git branch & deploy)")
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
    # pass 4 (verify #1 / tx T2): a two-field `{"ok":true,"at":…}` file passed. The receipt must say what it gated:
    # kind "launch" and the sha256 of the saved get_session page it read (written by tools/ci/launch-gate.mjs).
    page = r.get("page") if isinstance(r.get("page"), dict) else {}
    if r.get("kind") != "launch" or not re.fullmatch(r"[0-9a-f]{64}", str(page.get("sha256") or "")):
        return deny("the launch-gate receipt names no gated page (kind/page.sha256): re-run `node tools/ci/launch-gate.mjs <saved get_session>`")
    try:
        at = calendar.timegm(time.strptime(str(r.get("at"))[:19], "%Y-%m-%dT%H:%M:%S"))
    except Exception:
        return deny("the launch-gate receipt has no timestamp")
    age = time.time() - at
    if age > MAX_AGE_S or age < -60:
        return deny("the launch-gate receipt is %d s old (max %d)" % (age, MAX_AGE_S))
    # WP-L4 (2026-10-27; Bryce: "You consider the options and make the best decisions"): the receipt's page.sha256
    # only had to LOOK like a sha. It must now be the sha256 of the page launch-page.py recorded,
    # artifacts/launch/self.json (protect-files keeps hands off both directories), and the receipt is single-use.
    sp = os.path.join(root, "artifacts", "launch", "self.json")
    try:
        with open(sp, "rb") as fh:
            raw = fh.read()
        selfp = json.loads(raw.decode("utf8"))
    except Exception:
        return deny("no quota page artifacts/launch/self.json (launch-page.py writes it after get_session)")
    if not isinstance(selfp, dict) or selfp.get("written_by") != "launch-page.py":
        return deny("artifacts/launch/self.json was not written by launch-page.py")
    if hashlib.sha256(raw).hexdigest() != page.get("sha256"):
        return deny("the receipt gated a page other than artifacts/launch/self.json (or the page changed since)")
    used = f + ".used"
    nonce = str(r.get("nonce") or "")
    try:
        with open(used, encoding="utf8") as fh:
            if nonce and json.load(fh).get("nonce") == nonce:
                return deny("this launch-gate receipt was already spent on a create_session")
    except Exception:
        pass
    try:
        os.replace(f, used)   # consumed: the next create_session needs a fresh gate run
    except Exception:
        return deny("the launch-gate receipt could not be consumed (single-use)")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # fail CLOSED on the hook's own bug (2026-10-28)
        refuse("failed with an internal error (%s: %s)" % (type(e).__name__, str(e)[:160]))
    sys.exit(0)
