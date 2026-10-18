#!/usr/bin/env python3
# SubagentStop (and PreToolUse SubagentHandback) hook: checks a read-only reporter subagent's final report
# against the return contract its .claude/agents/<name>.md states, and sends a
# malformed report BACK to the subagent to fix instead of letting it reach the
# parent (2026-10-14).
#
# ADVISORY QUALITY CONTROL, NOT A SAFETY GUARD: it FAILS OPEN. Unknown agent
# types (general-purpose, Explore, Plan, ...), an empty final message, garbage
# stdin and any internal error all allow the stop (exit 0, no output). It
# never loops: when `stop_hook_active` is true it allows unconditionally.
#
# Fields used, as the hooks reference states them
# (https://code.claude.com/docs/en/hooks, §SubagentStop, read 2026-10-14):
#   "SubagentStop hooks receive `stop_hook_active`, `agent_id`, `agent_type`,
#    `agent_transcript_path`, and `last_assistant_message`. The `agent_type`
#    field is the value used for matcher filtering. [...] The
#    `last_assistant_message` field contains the text content of the
#    subagent's final response, so hooks can access it without parsing the
#    transcript file."
#   Stop: "The `stop_hook_active` field is `true` when Claude Code is already
#    continuing as a result of a stop hook."
#   Decision control: "Returning `decision: \"block\"` with a `reason` keeps
#    the subagent running and delivers `reason` to the subagent as its next
#    instruction."
# So a violation prints {"decision":"block","reason":...} on stdout, exit 0.
#
# The table below mirrors each agent's "Return format" section; change both
# together (tests/unit/subagent-contract-hook.test.mjs pins one good report per
# agent). Only lines that START with a row prefix are counted, so preamble and
# evidence bullets are free. A report that says UNREAD (the denial contract in
# every agent file) skips the required-line checks but not row shape or caps.
import json, re, sys

C = {
    "code-hunter": {
        "file": "code-hunter.md", "prefix": "FINDING", "cap": 12,
        "row": r"^FINDING (none\b|\d+ \| (bug|perf|dead-code) \| sev (high|med|low) \|.*\| (CONFIRMED|CODE-TRACED|PLAUSIBLE)\b)",
        "shape": "FINDING <n> | bug|perf|dead-code | sev high|med|low | file:line | ... | CONFIRMED|CODE-TRACED|PLAUSIBLE (or FINDING none)",
        "need": [r"^covered:", r"^not covered:", r"^measured:"],
    },
    "finding-verifier": {
        "file": "finding-verifier.md", "prefix": "CLAIM", "cap": 15,
        "row": r"^CLAIM \d+ \| (CONFIRMED|STALE|REFUTED|NEEDS-BROWSER|UNREAD)\b",
        "shape": "CLAIM <n> | CONFIRMED|STALE|REFUTED|NEEDS-BROWSER | evidence: ...",
        "need": [r"^refuted: \d+/\d+ stale: \d+/\d+"],
    },
    "prior-art-scout": {
        "file": "prior-art-scout.md", "prefix": "KNOWN", "cap": 30,
        "row": r"^KNOWN (none\b|\S.* — .* — (FIXED|OPEN|REJECTED|\?)(\s|$))",
        "shape": "KNOWN file:line — claim — where recorded — FIXED|OPEN|REJECTED|? (plain lines, not a table)",
        "need": [r"^sources read:", r"^not read:"],
    },
    "agent-surface-reviewer": {
        "file": "agent-surface-reviewer.md", "prefix": "VERDICT", "cap": 1,
        "row": r"^VERDICT (KEEP|TRIM|FIX|MERGE-INTO \S+|SPLIT|UNREAD)\b.*\| report: \S+",
        "shape": "VERDICT KEEP|TRIM|FIX|MERGE-INTO <x>|SPLIT — <why> | report: <path>",
        "need": [r"^VERDICT ", r"^GAP1 ", r"^GAP2 "],
    },
    "bloat-auditor": {
        "file": "bloat-auditor.md", "prefix": "BLOAT", "cap": 8,
        "row": r"^BLOAT\s+(none\b|kind:(extract|split|dead|dup|comment|skill|doc)\s+\S+\s+cost:[1-9]\d*\b)",
        "shape": "BLOAT  kind:extract|split|dead|dup|comment|skill|doc  file:line  cost:<n>=1+  why: ...  carve: ...  do-not: ...",
        "need": [r"^COVERED:"],
        "forbid": (r"&(lt|gt|amp);", "no HTML entities: write <, >, & literally"),
    },
    "physics-contract-auditor": {
        "file": "physics-contract-auditor.md", "prefix": "SITE", "cap": 30,
        "row": r"^SITE\s+\S+\s+\S+\s+column:(AI-only|assist-gated|broadcast-only|surface|BLOCKER|unverified)\s+in-table:(yes|no)\b",
        "shape": "SITE  file:line  symbol  column:AI-only|assist-gated|broadcast-only|surface|BLOCKER|unverified  in-table:yes|no  why: ...",
        "need": [r"^vstd-invariant: (pass|fail)", r"^curvature-channels: (pass|fail)", r"^covered:"],
    },
    "ci-red-triage": {
        "file": "ci-red-triage.md",
        "need": [r"^SHA \S+ · run \S+", r"^base: (already-red-on-base|new-on-this-push|unknown)\b", r"^next: \S"],
    },
    "ci-watcher": {
        "file": "ci-watcher.md", "prefix": "#", "cap": 999,
        "row": r"^#\d+ .*→ (ARM|READY|SYNC|FIX|FOREIGN-ARM|WAIT|NONE|STAND-DOWN)\b",
        "shape": "#<pr> <draft|ready> <sha7> <mergeable_state> ci=<state> gate=<state> armed=<method|-> → <SUGGEST>",
        "need": [r"^BOARD \d+ open"],
        "escape": r"\bexit 3\b|no token|API error",
    },
}


def lines(msg):
    out = []
    for raw in msg.splitlines():
        s = raw.strip().lstrip("`").strip()
        if s.startswith("- ") or s.startswith("* "):
            s = s[2:].strip()
        out.append(s)
    return out


def check(name, msg):
    c = C[name]
    ls = lines(msg)
    where = ".claude/agents/" + c["file"]
    p = c.get("prefix")
    if p:
        hit = re.compile(r"^" + re.escape(p) + (r"\d" if p == "#" else r"\b"))
        rows = [s for s in ls if hit.search(s)]
        if len(rows) > c["cap"]:
            return "%d %s rows, over the cap of %d in %s. Keep the %d strongest and drop the rest (name what you dropped on one line)." % (
                len(rows), p, c["cap"], where, c["cap"])
        bad = [s for s in rows if not re.search(c["row"], s)]
        if bad:
            return "this %s row does not match the shape in %s: %r. Each row must read: %s." % (
                p, where, bad[0][:160], c["shape"])
    f = c.get("forbid")
    if f and re.search(f[0], msg):
        return "the report breaks a rule of %s: %s." % (where, f[1])
    if re.search(r"\bUNREAD\b", msg) or (c.get("escape") and re.search(c["escape"], msg)):
        return None
    for need in c["need"]:
        if not any(re.search(need, s) for s in ls):
            return "the report is missing the required line matching /%s/ (%s, Return format)." % (need, where)
    return None


def handback_once(d):
    """True the first time this agent_id's hand-back is denied. A PreToolUse
    call has no stop_hook_active, so a stamp under artifacts/ keeps it to one
    deny per subagent (never a loop)."""
    import os
    aid = re.sub(r"[^A-Za-z0-9_.-]", "_", str(d.get("agent_id") or ""))
    if not aid:
        return False
    stamp = os.path.join(str(d.get("cwd") or os.getcwd()), "artifacts", "subagent-contract", aid)
    if os.path.exists(stamp):
        return False
    os.makedirs(os.path.dirname(stamp), exist_ok=True)
    open(stamp, "w").close()
    return True


def main():
    try:
        d = json.loads(sys.stdin.read() or "null")
        if not isinstance(d, dict) or d.get("stop_hook_active") is True:
            return
        name = str(d.get("agent_type") or "").rsplit(":", 1)[-1]
        # SubagentHandback (auto mode, v2.1.271+): the report is the tool's
        # message input; last_assistant_message is only closing text then
        # (https://code.claude.com/docs/en/hooks §SubagentStop, #2228 research).
        handback = d.get("hook_event_name") == "PreToolUse"
        if handback:
            if d.get("tool_name") != "SubagentHandback":
                return
            msg = (d.get("tool_input") or {}).get("message")
        else:
            msg = d.get("last_assistant_message")
        if name not in C or not isinstance(msg, str) or not msg.strip():
            return
        why = check(name, msg)
        if why:
            reason = ("Report contract (" + name + "): " + why + " Re-emit your whole final report in the "
                      "contract shape now; do not start new work. (Advisory hook .claude/hooks/subagent-contract.py; "
                      "it will not block a second time.)")
            if not handback:
                sys.stdout.write(json.dumps({"decision": "block", "reason": reason}))
            elif handback_once(d):
                sys.stdout.write(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                 "permissionDecision": "deny", "permissionDecisionReason": reason}}))
    except Exception:
        return  # fail open


main()
sys.exit(0)
