#!/usr/bin/env python3
"""live-run.py <root> — is a browser test run live in THIS checkout?

Prints `<pid>:<starttime> <log|->` for the first live `playwright test` /
run-playwright.mjs process whose cwd is under <root>, or nothing. Shared by
stop-guard.sh (the nudge) and session-start.sh (the orientation line) so both
answer the question the way protect-files.sh does: scoped by /proc/<pid>/cwd,
never a bare `ps | grep` that fires on another worktree's run or on a shell
whose -c text merely mentions the runner (the self-match trap).
"""
import json, os, sys
from live_process import playwright_pids

if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
    print("usage: live-run.py <root>", file=sys.stderr)
    sys.exit(0 if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help") else 2)

root = os.path.realpath(sys.argv[1])
pid = next(playwright_pids(root, advisory=True), "")
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
try:
    start = open(f"/proc/{pid}/stat").read().rsplit(")", 1)[1].split()[19]
except OSError:
    # The selected process can exit between the shared scan and its identity read.
    sys.exit(0)
print(f"{pid}:{start}", log or "-")
