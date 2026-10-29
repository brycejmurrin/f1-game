#!/usr/bin/env python3
"""Context-cap hook: name the session's live context against its size stop, and refuse spawns over the hard cap.

Fleet sessions overshoot their STOP AT (audit 2026-10-26 row 12: a worker at 288k against 150k soft / 200k hard)
because the cap is prose in the brief, `get_session used_tokens` updates only at turn end, and a short wake turn
never reaches a checkpoint. Hook input carries no context figure (https://code.claude.com/docs/en/hooks §Common
input fields), but it carries `transcript_path`, and every assistant entry there has the API `usage` block, so live
context = input + cache read + cache write of the newest main-thread entry (the method of
tools/ci/session-transcript.mjs --ctx and the audit's rows 1/2).

Caps: APEX_CTX_SOFT / APEX_CTX_HARD (k) win; else the brief's last `STOP AT: <N>k`; hard = soft + HARD_DELTA_K.
A session with no brief (one Bryce opened) has no cap and gets nothing. (The per-role table in the agent-fleet
launch policy was retired 2026-10-27; a dispatcher brief states its own STOP AT, docs/WORKERS.md.)

  UserPromptSubmit, PostToolUse — advisory: one line, `context N k / cap C k`, once per level (soft, hard) per
                                   session (state in artifacts/ctx-cap/). Any error → no output.
  PreToolUse (Agent, create_session) — over the HARD cap, deny a new spawn (permissionDecision "deny",
                                   https://code.claude.com/docs/en/hooks §PreToolUse decision control). A
                                   create_session whose prompt is a hand-off to a successor stays allowed: that
                                   is the size stop's own way out. settings.json runs this mode as
                                   `context-cap.py --guard`, which FAILS CLOSED (2026-10-28, the commit-hook
                                   split's hook pass): an unreadable payload or an internal error on a spawn is a
                                   block (exit 2, the reason and both overrides on stderr). Without --guard (the
                                   advisory events, where exit 2 would erase a user's prompt) any error → no output.
APEX_CTX_CAP=off silences every mode; so does the `.claude/allow-context-cap` hatch.
"""
import json
import os
import re
import sys

HARD_DELTA_K = 50
TAIL = 4 << 20
HANDOFF = re.compile(r"\bhand-?off\b|\bsuccessor\b", re.I)
SPAWNS = ("Agent", "mcp__claude-code-remote__create_session")


def _entries(lines):
    for line in lines:
        try:
            yield json.loads(line)
        except ValueError:
            continue


def context_tokens(path):
    """Live context of the newest main-thread assistant turn, or None."""
    with open(path, "rb") as fh:
        fh.seek(0, os.SEEK_END)
        fh.seek(max(0, fh.tell() - TAIL))
        lines = fh.read().decode("utf-8", "replace").splitlines()
    for d in _entries(reversed(lines)):
        u = (d.get("message") or {}).get("usage") if d.get("type") == "assistant" and not d.get("isSidechain") else None
        if u:
            return int(u.get("input_tokens") or 0) + int(u.get("cache_read_input_tokens") or 0) + int(u.get("cache_creation_input_tokens") or 0)
    return None


def brief_text(path):
    """Text of the first typed user entry: the launch prompt that names the role and STOP AT."""
    with open(path, encoding="utf-8", errors="replace") as fh:
        for i, line in enumerate(fh):
            if i > 200:
                return ""
            for d in _entries([line]):
                if d.get("type") != "user" or d.get("isMeta") or d.get("isSidechain"):
                    continue
                c = (d.get("message") or {}).get("content")
                if isinstance(c, list):
                    c = " ".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
                if isinstance(c, str) and c.strip():
                    return c
    return ""


def caps(root, brief, env):
    """(soft k, hard k, source) or None when the session has no cap."""
    soft, src = None, None
    if (env.get("APEX_CTX_SOFT") or "").isdigit():
        soft, src = int(env["APEX_CTX_SOFT"]), "APEX_CTX_SOFT"
    if soft is None:
        stops = re.findall(r"STOP AT:?\s*(\d+)\s*k", brief, re.I)
        if stops:
            soft, src = int(stops[-1]), "brief STOP AT"
    if soft is None:
        return None
    hard = int(env["APEX_CTX_HARD"]) if (env.get("APEX_CTX_HARD") or "").isdigit() else soft + HARD_DELTA_K
    return soft, hard, src


def once(root, session, level):
    """True the first time this session crosses `level`; records it under artifacts/ctx-cap/."""
    d = os.path.join(root, "artifacts", "ctx-cap")
    p = os.path.join(d, re.sub(r"[^\w.-]", "_", session or "unknown"))
    seen = open(p, encoding="utf-8").read().split() if os.path.exists(p) else []
    if level in seen:
        return False
    os.makedirs(d, exist_ok=True)
    with open(p, "a", encoding="utf-8") as fh:
        fh.write(level + "\n")
    return True


def decide(data, root, env):
    """The hook's stdout for one event payload ('' for nothing)."""
    if env.get("APEX_CTX_CAP") == "off":
        return ""
    # Escape hatch for a session the user has told to continue past its cap (Bryce 2026-10-26,
    # "Any session and yourself can use any tokens" / "Fix hook or guard or perm"): the same
    # marker shape as protect-files' `.claude/allow-protected`. Untracked; delete it to re-arm.
    if os.path.isfile(os.path.join(root, ".claude", "allow-context-cap")):
        return ""
    event, path = data.get("hook_event_name"), data.get("transcript_path")
    if not path or not os.path.isfile(path):
        return ""
    if event == "PreToolUse" and data.get("tool_name") not in SPAWNS:
        return ""
    cap = caps(root, brief_text(path), env)
    n = context_tokens(path)
    if not cap or n is None:
        return ""
    soft, hard, src = cap
    k = round(n / 1000)
    line = "context %dk / cap %dk" % (k, soft)
    if event == "PreToolUse":
        inp = data.get("tool_input") or {}
        if k < hard or (data.get("tool_name") != "Agent" and HANDOFF.search(str(inp.get("prompt") or ""))):
            return ""
        return json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
            "permissionDecisionReason": ("context-cap: %s, over the hard cap %dk (%s). No new spawns: push, then "
                "hand off to a successor (a create_session whose prompt says hand-off/successor is allowed; "
                "docs/WORKERS.md §The contract)." % (line, hard, src))}})
    if k < soft:
        return ""
    level = "hard" if k >= hard else "soft"
    if not once(root, data.get("session_id"), level):
        return ""
    msg = ("context-cap: %s (%s; hard %dk). %s (docs/WORKERS.md §The contract)." % (line, src, hard,
           "Over the hard cap: push and hand off now; new Agent/create_session spawns are refused" if level == "hard"
           else "Over the soft cap: finish the current unit, push, hand off"))
    if event == "UserPromptSubmit":
        return msg
    return json.dumps({"hookSpecificOutput": {"hookEventName": event or "PostToolUse", "additionalContext": msg}})


def main():
    data = json.load(sys.stdin)
    if not isinstance(data, dict) or not isinstance(data.get("tool_input", {}), (dict, type(None))):
        raise ValueError("payload is not an object, or tool_input is malformed")
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = decide(data, root, os.environ)
    if out:
        print(out)


if __name__ == "__main__":
    guard = "--guard" in sys.argv[1:]
    try:
        main()
    except Exception as e:
        # Advisory modes print nothing. The spawn guard (--guard) refuses: a crash must not let a spawn past the cap.
        root = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        hatch = os.path.isfile(os.path.join(root, ".claude", "allow-context-cap"))
        if guard and os.environ.get("APEX_CTX_CAP") != "off" and not hatch:
            sys.stderr.write("BLOCKED: context-cap could not judge this spawn (%s: %s), so it is refused (fail closed). "
                             "Report the hook error; a session the user told to continue past its cap can `touch "
                             ".claude/allow-context-cap` (or set APEX_CTX_CAP=off).\n" % (type(e).__name__, str(e)[:160]))
            sys.stderr.flush()
            os._exit(2)
    sys.exit(0)
