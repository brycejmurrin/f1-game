#!/usr/bin/env python3
"""live-run.py <root> — is a browser test run live in THIS checkout?

Prints `<pid>:<starttime> <log|->` for the first live `playwright test` /
run-playwright.mjs process whose cwd is under <root>, or nothing. Shared by
stop-guard.sh (the nudge) and session-start.sh (the orientation line) so both
answer the question the way protect-files.sh does: scoped by /proc/<pid>/cwd,
never a bare `ps | grep` that fires on another worktree's run or on a shell
whose -c text merely mentions the runner (the self-match trap).
"""
import json, os, re, sys
root = os.path.realpath(sys.argv[1])
pat = re.compile(r"playwright(\.js)?\s+test\b|run-playwright\.mjs")
pid = ""
for d in os.listdir("/proc"):
    if not d.isdigit():
        continue
    try:
        argv = open(f"/proc/{d}/cmdline", "rb").read().split(b"\0")
        args = b" ".join(argv).decode("utf8", "replace")
        # A shell whose -c text merely MENTIONS the runner (the agent's own
        # Bash wrapper, a waiter loop) is not a run: the self-match trap.
        if os.path.basename(argv[0].decode("utf8", "replace")) in ("bash", "sh", "dash", "zsh"):
            continue
        if not pat.search(args) or "--list" in args:
            continue
        cwd = os.path.realpath(os.readlink(f"/proc/{d}/cwd"))
    except OSError:
        continue
    if cwd == root or cwd.startswith(root + os.sep):
        pid = d
        break
if not pid:
    sys.exit(0)
log = ""
try:
    reg = json.load(open(os.path.join(root, "artifacts/logs/test-bg.json")))
    runs = reg.get("runs", reg) if isinstance(reg, dict) else reg
    for r in (runs if isinstance(runs, list) else []):
        if r.get("ended"):
            continue
        try:
            os.kill(int(r["pid"]), 0)
        except Exception:
            continue
        log = r.get("log", "")
except Exception:
    pass
start = open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()[19]
print(f"{pid}:{start}", log or "-")
