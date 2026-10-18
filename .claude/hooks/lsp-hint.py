#!/usr/bin/env python3
"""PostToolUse (Grep, Bash) hook: when a search pattern was a bare JS symbol, name the apex-lsp call.

Agents reach for grep even with a code-intelligence server attached; the
adoption write-ups (docs/notes/LSP-MCP-2026-10-18.md §Agent use) found that a
tool gets used when it is named at the moment of the search. This hook reads
the Grep tool's `pattern` (or a Bash `grep`/`rg`/`git grep` command's pattern),
and when that pattern is a symbol (`Tracks\\.curvature`, `\\bGameHud\\b`,
`function forTeam`) aimed at js/ or the whole tree, adds ONE factual line naming
the semantic equivalent. Text, regexes, comments and CSS searches get nothing.

PostToolUse, not PreToolUse: every PreToolUse hook here is a guard that must block
when it fails (tests/unit/bash-guard-hardening.test.mjs), and an advisory hint must
never stop a search. After the search the line lands next to its results, where the
follow-up lookup is chosen. Output: hookSpecificOutput.additionalContext
(https://code.claude.com/docs/en/hooks; written as a statement, not an order).
Any error → no output (advisory, fail open). APEX_LSP_HINT=off silences it.
"""
import json
import os
import re
import shlex
import sys

# `Head.member`, `Name`, optionally wrapped in \b … \b, optionally `function `/`const ` in front,
# optionally a trailing `(`: the shapes an agent types to find a definition or its uses.
SYMBOL = re.compile(
    r"^(?:\\b)?(?P<decl>(?:function|const|let|var|class)(?:\\s\+|\\s\*|\s+))?"
    r"(?P<sym>[A-Za-z_$][\w$]*(?:\\?\.[A-Za-z_$][\w$]*)?)"
    r"(?:\\b)?(?:\\?\()?$"
)
SKIP_PATH = re.compile(r"\.(css|html|md|json|ya?ml|txt|log)$|(^|/)(css|docs|artifacts|scratch|node_modules)(/|$)")


def symbol_of(pattern):
    m = SYMBOL.match(pattern or "")
    if not m:
        return None, False
    sym = m.group("sym").replace("\\.", ".")
    # A lone lowercase word is as likely text as a symbol; a Head.member or a capitalised global is a symbol.
    if "." not in sym and not sym[0].isupper() and not m.group("decl"):
        return None, False
    if len(sym) < 3:
        return None, False
    return sym, bool(m.group("decl"))


def from_bash(command):
    try:
        words = shlex.split(command)
    except ValueError:
        return None, None
    for i, w in enumerate(words):
        if w in ("grep", "rg", "egrep") or (w == "grep" and i and words[i - 1] == "git"):
            rest = [x for x in words[i + 1:] if not x.startswith("-")]
            if rest and rest[0] not in ("|", "&&", ";"):
                return rest[0], " ".join(rest[1:2])
    return None, None


def main():
    if os.environ.get("APEX_LSP_HINT") == "off":
        return
    data = json.load(sys.stdin)
    tool, inp = data.get("tool_name"), data.get("tool_input") or {}
    if tool == "Grep":
        pattern, where = inp.get("pattern"), " ".join(str(inp.get(k) or "") for k in ("path", "glob", "type"))
        if inp.get("type") not in (None, "", "js", "ts"):
            return
    elif tool == "Bash":
        pattern, where = from_bash(inp.get("command") or "")
    else:
        return
    if not pattern or SKIP_PATH.search((where or "").strip()):
        return
    sym, is_decl = symbol_of(pattern)
    if not sym:
        return
    call = "lsp_definition" if is_decl else "lsp_references"
    cli = "def" if is_decl else "refs"
    msg = (f"lsp-hint: `{sym}` is a JS symbol; for the next lookup apex-lsp answers this semantically "
           f"(MCP {call} {{symbol: \"{sym}\"}}, lsp_callers for who calls it; shell: tools/mcp/lsp-mcp.sh {cli} {sym}) — "
           "rows tagged [def|export|alias|use] with the enclosing function, comments and strings excluded. "
           "grep stays right for text, comments, CSS and regexes.")
    event = data.get("hook_event_name") or "PostToolUse"
    print(json.dumps({"hookSpecificOutput": {"hookEventName": event, "additionalContext": msg}}))


if __name__ == "__main__":
    try:
        main()
    except Exception:  # advisory: never block a search
        pass
