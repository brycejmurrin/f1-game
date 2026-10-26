#!/usr/bin/env python3
# Context cap for fleet sessions (PreToolUse + PostToolUse, every tool).
#
# Why (docs/notes/FLEET-A-TRANSCRIPT-AUDIT-2026-10-26.md #2, D6): the size stop
# (launch-policy.md §Size stop) was prose, four different caps circulated, and
# orchestrators and lanes ran to 490-771k context; most of $693 in two days
# was cache reads at that size. Bryce, 2026-10-25 ~21:00 PT, "Do all": one cap
# table, enforced here, with the note's block/warn behaviour.
#
# Live context = the last main-chain assistant row's usage in transcript_path:
# input_tokens + cache_read_input_tokens + cache_creation_input_tokens (the
# whole prompt that call sent). A fresh session reads ~102-108k (D3).
#
# Soft cap, by role (launch-policy.md §Size stop; keep CAPS in step):
#   APEX_STOP_AT_K=<n> in the environment wins; else
#   artifacts/context-cap/override.json {"soft_k": n, "quote": "<Bryce's words>"} (quote required); else
#   the role in the session's first prompt (`TITLE: [<Role>] …` or a `role:<x>` tag) through CAPS.
#   No fleet role (a session Bryce opened by hand) -> no cap, silent.
# Hard cap = soft + 50k.
#
#   PostToolUse, context >= soft  -> additionalContext "finish this unit, push, HANDOFF", once per 25k step
#   PreToolUse,  context >= hard  -> "deny" every tool except the hand-off kit (HANDOFF_* below)
#   a subagent's call (agent_id)  -> silent: the parent's transcript is not its context
#
# FAILS OPEN on its own errors: an unreadable payload, a missing or unparsable
# transcript, or an internal exception prints one stderr line and exits 0 with
# no decision (settings.json gives it no onFailure "block"). Output is the
# documented hook JSON (https://code.claude.com/docs/en/hooks, read 2026-10-26:
# PreToolUse hookSpecificOutput.permissionDecision; PostToolUse
# hookSpecificOutput.additionalContext). Tests: tests/unit/context-cap-hook.test.mjs.
import json, os, re, sys

CAPS = {"orchestrator": 200, "worker": 150, "owner": 150, "pr-owner": 150, "hunter": 150, "sync": 150,
        "review": 150, "reviewer": 150, "synth": 150, "watch": 150, "fleet-watch": 150, "merge-desk": 150,
        "seed": 150, "coordinator": 150}
HARD_EXTRA_K = 50
WARN_STEP_K = 25
TAIL_BYTES = 2 << 20
HEAD_LINES = 400
HANDOFF_TOOLS = re.compile(r"^(mcp__claude-code-remote__.*|mcp__github__(update_pull_request|pull_request_read|add_issue_comment"
                           r"|create_pull_request)|ToolSearch|TaskStop|Read|Edit|Write|ReadNotifications|SendMessage)$")
# The kit must be enough to COMMIT what is on disk: bash-guard refuses a commit
# while the guards are red, so registering a file (Edit, `npm run gen`) and
# re-checking it (`node --test`, `npm run test:guards`) stay allowed past the cap.
HANDOFF_BASH = re.compile(r"^\s*(git\s|node\s+--test\b|npm\s+run\s+(gen|test:guards)\b"
                          r"|node\s+tools/ci/(fleet-bus|agent-msg|who-is-on-it|session-status|handback)\.mjs\b)")


def first_prompt(path):
    """Text of the first user row (the launch prompt), or ''."""
    with open(path, encoding="utf8", errors="replace") as fh:
        for i, line in enumerate(fh):
            if i >= HEAD_LINES:
                break
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("type") != "user" or r.get("isSidechain"):
                continue
            c = (r.get("message") or {}).get("content")
            if isinstance(c, list):
                c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
            if isinstance(c, str) and c.strip():
                return c
    return ""


def live_context(path):
    """Prompt size of the last main-chain assistant call, in tokens, or None."""
    with open(path, "rb") as fh:
        fh.seek(0, 2)
        size = fh.tell()
        fh.seek(max(0, size - TAIL_BYTES))
        lines = fh.read().decode("utf8", "replace").splitlines()
    for line in reversed(lines):
        if '"usage"' not in line:
            continue
        try:
            r = json.loads(line)
        except Exception:
            continue
        if r.get("type") != "assistant" or r.get("isSidechain"):
            continue
        u = (r.get("message") or {}).get("usage") or {}
        n = sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
        if n > 0:
            return n
    return None


def role_of(prompt):
    m = re.search(r"TITLE:\s*\[([A-Za-z][A-Za-z -]*)\]", prompt[:4000]) or re.search(r"\brole:([a-z-]+)", prompt[:4000])
    if not m:
        return None
    r = m.group(1).strip().lower().replace(" ", "-")
    return "orchestrator" if r.startswith("orch") else r


def soft_cap_k(root, transcript):
    env = os.environ.get("APEX_STOP_AT_K", "").strip()
    if env.isdigit() and int(env) > 0:
        return int(env), "APEX_STOP_AT_K"
    try:
        with open(os.path.join(root, "artifacts", "context-cap", "override.json"), encoding="utf8") as fh:
            o = json.load(fh)
        if str(o.get("quote") or "").strip() and int(o.get("soft_k") or 0) > 0:
            return int(o["soft_k"]), "override (Bryce: \"%s\")" % str(o["quote"]).strip()[:80]
    except Exception:
        pass
    role = role_of(first_prompt(transcript))
    if role in CAPS:
        return CAPS[role], "role " + role
    return None, None


def state_file(root, sid):
    return os.path.join(root, "artifacts", "context-cap", re.sub(r"[^A-Za-z0-9_-]", "_", sid or "session") + ".json")


def main():
    try:
        d = json.load(sys.stdin)
    except Exception:
        sys.stderr.write("context-cap: unreadable hook payload; allowing (fail open).\n")
        return
    if not isinstance(d, dict) or d.get("agent_id"):
        return
    event = d.get("hook_event_name") or ""
    transcript = d.get("transcript_path") or ""
    if event not in ("PreToolUse", "PostToolUse") or not transcript or not os.path.isfile(transcript):
        if event in ("PreToolUse", "PostToolUse") and transcript:
            sys.stderr.write("context-cap: transcript not readable; allowing (fail open).\n")
        return
    root = os.environ.get("CLAUDE_PROJECT_DIR") or d.get("cwd") or os.getcwd()
    soft, src = soft_cap_k(root, transcript)
    if not soft:
        return
    ctx = live_context(transcript)
    if ctx is None:
        return
    k = ctx // 1000
    hard = soft + HARD_EXTRA_K
    if event == "PreToolUse":
        if k < hard:
            return
        tool = d.get("tool_name") or ""
        cmd = str((d.get("tool_input") or {}).get("command") or "") if tool == "Bash" else ""
        if HANDOFF_TOOLS.match(tool) or (tool == "Bash" and HANDOFF_BASH.match(cmd)):
            return
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
            "permissionDecisionReason": ("CONTEXT HARD CAP: %dk >= %dk (soft %dk, %s; launch-policy.md §Size stop). "
                "Hand off now: commit and push (git), refresh the PR body, send HANDOFF/READY (fleet-bus, agent-msg, "
                "send_message), launch a successor if you are an orchestrator. Other tools are refused." % (k, hard, soft, src))}}))
        return
    if k < soft:
        return
    step = (k - soft) // WARN_STEP_K
    sf = state_file(root, d.get("session_id"))
    try:
        with open(sf, encoding="utf8") as fh:
            if json.load(fh).get("warned_step", -1) >= step:
                return
    except Exception:
        pass
    try:
        os.makedirs(os.path.dirname(sf), exist_ok=True)
        with open(sf, "w", encoding="utf8") as fh:
            json.dump({"warned_step": step, "k": k, "soft": soft}, fh)
    except Exception:
        pass
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": (
        "context %dk >= soft cap %dk (%s): finish this unit, push, HANDOFF (launch-policy.md §Size stop). "
        "At %dk every tool but the hand-off kit is refused." % (k, soft, src, hard))}}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # fail open on the hook's own bug
        sys.stderr.write("context-cap: internal error %s; allowing (fail open).\n" % type(e).__name__)
    sys.exit(0)
